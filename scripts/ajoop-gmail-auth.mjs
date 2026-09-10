#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { authenticate } from "@google-cloud/local-auth";
import {
  AJOOP_GMAIL_READONLY_SCOPE,
  loadStoredGmailReadAuth,
} from "../server/gmail-provider-client.mjs";

const runtimeDirectory = path.resolve(".ajoop-runtime", "gmail");
const credentialsPath = path.resolve(process.env.AJOOP_GMAIL_OAUTH_CLIENT_PATH || path.join(runtimeDirectory, "oauth-client.json"));
const tokenPath = path.resolve(process.env.AJOOP_GMAIL_TOKEN_PATH || path.join(runtimeDirectory, "oauth-token.json"));

const readClientCredentials = async () => {
  const parsed = JSON.parse(await readFile(credentialsPath, "utf8"));
  const client = parsed.installed || parsed.web;
  if (!client || typeof client.client_id !== "string" || typeof client.client_secret !== "string") {
    throw new Error("invalid-oauth-client-file");
  }
  return client;
};

try {
  try {
    await loadStoredGmailReadAuth({ tokenPath });
    console.log(`Gmail read-only authorization already exists at ${tokenPath}`);
    process.exit(0);
  } catch {
    // Continue to the explicit local browser authorization flow.
  }

  const client = await readClientCredentials();
  const auth = await authenticate({
    scopes: [AJOOP_GMAIL_READONLY_SCOPE],
    keyfilePath: credentialsPath,
  });
  if (typeof auth.credentials?.refresh_token !== "string" || !auth.credentials.refresh_token) {
    throw new Error("refresh-token-not-issued");
  }

  await mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  const stored = {
    type: "authorized_user",
    scope: AJOOP_GMAIL_READONLY_SCOPE,
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: auth.credentials.refresh_token,
  };
  await writeFile(tokenPath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log(`Gmail read-only authorization stored locally at ${tokenPath}`);
} catch (error) {
  const code = ["ENOENT", "EEXIST"].includes(error?.code) ? error.code : error?.message;
  const safe = ["ENOENT", "EEXIST", "invalid-oauth-client-file", "refresh-token-not-issued"].includes(code)
    ? code
    : "gmail-auth-bootstrap-failed";
  console.error(`Gmail authorization failed: ${safe}`);
  process.exit(1);
}
