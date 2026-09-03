#!/usr/bin/env node
/**
 * Ajoop bridge server (Ajoop 5.0) — the thinnest possible node:http shell
 * around server/ajoop-bridge-core.mjs.
 *
 *   browser → HTTPS edge/tunnel → 127.0.0.1:8787 (here) → 127.0.0.1:11434
 *
 * Every decision lives in the core module so it can be tested without a socket.
 * This file only reads a bounded body, hands it over, and writes the reply.
 *
 * Node built-ins only. No framework, no dependencies, no database, no disk.
 *
 * IT LOGS NO REQUEST CONTENT. Not the question, not the evidence, not the
 * prompt, not the answer. Startup and error lines carry a status code and
 * nothing else, because an operator's terminal scrollback is still a place a
 * visitor's question could come to rest.
 *
 *   node server/ajoop-bridge.mjs
 */
import http from "node:http";
import { createAjoopBridge } from "./ajoop-bridge-core.mjs";

const bridge = createAjoopBridge({ env: process.env });
const { config } = bridge;

/**
 * Reads the request body, refusing anything over the cap mid-stream.
 *
 * Destroying the socket on overflow matters: buffering first and checking after
 * would let a hostile caller spend the bridge's memory before being told no.
 */
function readBody(request, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let tooLarge = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const declared = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(declared) && declared > limit) {
      request.resume();
      finish({ ok: false });
      return;
    }

    request.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        finish({ ok: false });
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!tooLarge) finish({ ok: true, body: Buffer.concat(chunks).toString("utf8") });
    });
    request.on("error", () => finish({ ok: false }));
  });
}

function send(response, status, headers, body) {
  const payload = body === null ? "" : JSON.stringify(body);
  response.writeHead(status, {
    ...headers,
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

const server = http.createServer(async (request, response) => {
  /* One endpoint. Nothing else on this port answers anything, so a probe for
   * /admin or /.env gets the same flat 404 as a typo. */
  const url = new URL(request.url || "/", `http://${config.host}:${config.port}`);
  if (url.pathname !== config.path) {
    send(response, 404, { "Content-Type": "application/json; charset=utf-8" }, { ok: false, error: "not found" });
    return;
  }

  const read = await readBody(request, config.maxBodyBytes);
  if (!read.ok) {
    send(response, 413, { "Content-Type": "application/json; charset=utf-8" }, { ok: false, error: "payload too large" });
    return;
  }

  try {
    const result = await bridge.handle({
      method: request.method,
      origin: request.headers.origin || "",
      contentType: request.headers["content-type"] || "",
      body: read.body,
    });
    send(response, result.status, result.headers, result.body);
  } catch (error) {
    /* Unreachable by contract: handle() does not throw. Belt and braces, and
     * the error object itself is never printed — it could carry a local path. */
    console.error("[ajoop-bridge] unhandled request failure");
    send(response, 500, { "Content-Type": "application/json; charset=utf-8" }, { ok: false, error: "bridge error" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Ajoop bridge listening on ${config.host}:${config.port}${config.path}`);
  console.log(`Ajoop bridge model ${config.model} · ${config.allowedOrigins.length} allowed origin(s)`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
