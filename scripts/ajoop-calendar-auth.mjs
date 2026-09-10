#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { google } from "googleapis";
import {
  AJOOP_CALENDAR_EVENTS_READONLY_SCOPE,
  loadStoredCalendarReadAuth,
} from "../server/calendar-provider-client.mjs";

const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const runtimeDirectory = path.resolve(".ajoop-runtime", "calendar");
const credentialsPath = path.resolve(process.env.AJOOP_CALENDAR_OAUTH_CLIENT_PATH || path.join(runtimeDirectory, "oauth-client.json"));
const tokenPath = path.resolve(process.env.AJOOP_CALENDAR_TOKEN_PATH || path.join(runtimeDirectory, "oauth-token.json"));

export const readDesktopCalendarClientCredentials = async (filePath) => {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  const client = parsed?.installed;
  if (
    !client || typeof client.client_id !== "string" || !client.client_id ||
    typeof client.client_secret !== "string" || !client.client_secret
  ) throw new Error("invalid-oauth-client-file");
  return Object.freeze({ clientId: client.client_id, clientSecret: client.client_secret });
};

const openSystemBrowser = async (url) => {
  const command = process.platform === "win32" ? "rundll32" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
};

const listenOnLoopback = async (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    const address = server.address();
    if (!address || typeof address === "string") reject(new Error("loopback-listen-failed"));
    else resolve(address.port);
  });
});

export async function authorizeDesktopCalendarRead({
  clientId,
  clientSecret,
  browserOpener = openSystemBrowser,
  oauthClientFactory = (options) => new google.auth.OAuth2(options),
  timeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
}) {
  const state = randomBytes(32).toString("base64url");
  let settleCallback;
  let callbackSettled = false;
  const callback = new Promise((resolve, reject) => { settleCallback = { resolve, reject }; });
  callback.catch(() => {});
  const settle = (method, value) => {
    if (callbackSettled) return false;
    callbackSettled = true;
    settleCallback[method](value);
    return true;
  };
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/oauth2callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      if (callbackSettled) {
        response.writeHead(409).end("Authorization callback already received.");
        return;
      }
      if (requestUrl.searchParams.get("state") !== state) {
        response.writeHead(400).end("Authorization state mismatch.");
        settle("reject", new Error("oauth-state-mismatch"));
        return;
      }
      const providerError = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      if (providerError || !code) {
        response.writeHead(400).end("Authorization was not completed.");
        settle("reject", new Error("oauth-authorization-rejected"));
        return;
      }
      response.end("Authorization received. You may close this window.");
      settle("resolve", code);
    } catch {
      response.writeHead(400).end("Invalid authorization callback.");
      settle("reject", new Error("invalid-oauth-callback"));
    }
  });

  let timeout;
  try {
    const port = await listenOnLoopback(server);
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauthClient = oauthClientFactory({ clientId, clientSecret, redirectUri });
    const { codeVerifier, codeChallenge } = await oauthClient.generateCodeVerifierAsync();
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [AJOOP_CALENDAR_EVENTS_READONLY_SCOPE],
      state,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });
    let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    deadline.catch(() => {});
    timeout = setTimeout(() => {
      const error = new Error("oauth-authorization-timeout");
      settle("reject", error);
      rejectDeadline(error);
    }, timeoutMs);
    const interactiveFlow = (async () => {
      await browserOpener(authorizationUrl);
      const code = await callback;
      const { tokens } = await oauthClient.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) throw new Error("refresh-token-not-issued");
      return tokens.refresh_token;
    })();
    interactiveFlow.catch(() => {});
    return await Promise.race([interactiveFlow, deadline]);
  } finally {
    clearTimeout(timeout);
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function runCalendarAuthBootstrap({
  clientFilePath = credentialsPath,
  tokenFilePath = tokenPath,
  authorize = authorizeDesktopCalendarRead,
} = {}) {
  let tokenFileExists = false;
  try {
    await readFile(tokenFilePath, "utf8");
    tokenFileExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (tokenFileExists) {
    try {
      await loadStoredCalendarReadAuth({ tokenPath: tokenFilePath });
      return { status: "exists", tokenFilePath };
    } catch {
      throw new Error("invalid-existing-token-file");
    }
  }

  const client = await readDesktopCalendarClientCredentials(clientFilePath);
  const refreshToken = await authorize(client);
  await mkdir(path.dirname(tokenFilePath), { recursive: true, mode: 0o700 });
  const stored = {
    type: "authorized_user",
    scope: AJOOP_CALENDAR_EVENTS_READONLY_SCOPE,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
  };
  await writeFile(tokenFilePath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { status: "created", tokenFilePath };
}

const runCli = async () => {
  try {
    const result = await runCalendarAuthBootstrap();
    const message = result.status === "exists" ? "already exists" : "stored locally";
    console.log(`Calendar read-only authorization ${message} at ${result.tokenFilePath}`);
  } catch (error) {
    const code = ["ENOENT", "EEXIST"].includes(error?.code) ? error.code : error?.message;
    const safe = [
      "ENOENT", "EEXIST", "invalid-oauth-client-file", "invalid-existing-token-file", "refresh-token-not-issued",
      "oauth-state-mismatch", "oauth-authorization-rejected", "oauth-authorization-timeout",
    ].includes(code) ? code : "calendar-auth-bootstrap-failed";
    console.error(`Calendar authorization failed: ${safe}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await runCli();
