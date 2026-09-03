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

const nativeFetch = typeof fetch === "function" ? fetch : null;

/**
 * Qwen3 on the current Ollama build still emits hidden reasoning into
 * `message.content` when `think:false`, terminated by an orphan `</think>`.
 * The core intentionally rejects ordinary think tags, so this adapter only
 * accepts that exact fast-path shape: no opening tag, one or more closing tags,
 * and non-empty final prose after the last close. Anything else is left intact
 * for the core to reject and the browser to fall back deterministically.
 */
function extractFastFinalAnswer(value) {
  const text = typeof value === "string" ? value : "";
  if (!text || /<\s*think\b/i.test(text)) return text;

  const closingTag = /<\s*\/\s*think\s*>/gi;
  let lastEnd = -1;
  let match;
  while ((match = closingTag.exec(text))) lastEnd = match.index + match[0].length;
  if (lastEnd < 0) return text;

  const finalAnswer = text.slice(lastEnd).trim();
  if (!finalAnswer || /<\s*\/?\s*think\b/i.test(finalAnswer)) return text;
  return finalAnswer;
}

/**
 * Runtime-only Ollama adapter.
 *
 * Ajoop's deterministic grounding contract stays in the core. This wrapper
 * only asks qwen3 to skip extended reasoning and, for the current Ollama/Qwen3
 * compatibility quirk above, removes the discarded reasoning before the core
 * validates the answer. No request or response content is logged or persisted.
 */
async function fastOllamaFetch(url, options = {}) {
  if (!nativeFetch) throw new TypeError("fetch unavailable");

  const isChat = String(url).endsWith("/api/chat");
  let requestOptions = options;

  if (isChat && typeof options.body === "string") {
    try {
      const body = JSON.parse(options.body);
      body.think = false;
      if (Array.isArray(body.messages)) {
        for (let index = body.messages.length - 1; index >= 0; index -= 1) {
          const message = body.messages[index];
          if (message && message.role === "user" && typeof message.content === "string") {
            if (!/\/no_think\s*$/i.test(message.content)) {
              message.content = `${message.content}\n/no_think`;
            }
            break;
          }
        }
      }
      requestOptions = { ...options, body: JSON.stringify(body) };
    } catch (error) {
      /* Leave malformed adapter input untouched; the core/network path will
       * reject it normally rather than inventing a second validation policy. */
    }
  }

  const response = await nativeFetch(url, requestOptions);
  if (!isChat || !response || !response.ok) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    if (parsed?.message && typeof parsed.message.content === "string") {
      parsed.message.content = extractFastFinalAnswer(parsed.message.content);
    }
    return new Response(JSON.stringify(parsed), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

const bridge = createAjoopBridge({ env: process.env, fetchImpl: fastOllamaFetch });
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
