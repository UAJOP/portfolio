import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAjoopRag } from "./ajoop-rag.mjs";

const execFileAsync = promisify(execFile);

export const AJOOP_RUNTIME_IDENTITY = Object.freeze({
  product: "AJOOP supervisor",
  version: 1,
});

export const AJOOP_RUNTIME_CONTROL_PROTOCOL_VERSION = 1;

export const AJOOP_BRIDGE_IDENTITY = Object.freeze({
  service: "ajoop-rag",
  protocolVersion: 1,
});

export const AJOOP_BRIDGE_EXIT_CODES = Object.freeze({
  bindConflict: 72,
  listenFailed: 73,
});

export const AJOOP_RUNTIME_DEFAULTS = Object.freeze({
  controlHost: "127.0.0.1",
  controlPort: 8790,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  bridgeBaseUrl: "http://127.0.0.1:8787",
  requestTimeoutMs: 2000,
  ollamaStartupMs: 30000,
  bridgeStartupMs: 180000,
  pollIntervalMs: 500,
  shutdownMs: 5000,
  maxResponseBytes: 64 * 1024,
});

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

const safeLoopbackUrl = (value, fallback) => {
  try {
    const parsed = new URL(typeof value === "string" && value.trim() ? value.trim() : fallback);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.username || parsed.password) {
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
};

export function resolveAjoopRuntimeConfig(env = {}) {
  const runtimeEnv = {
    ...env,
    AJOOP_AI_MODEL: env.AJOOP_AI_MODEL || "qwen3:4b-instruct",
  };
  const ragStatus = createAjoopRag({ env: runtimeEnv, fetchImpl: null }).status();
  return Object.freeze({
    controlHost: AJOOP_RUNTIME_DEFAULTS.controlHost,
    controlPort: boundedInteger(
      env.AJOOP_RUNTIME_CONTROL_PORT,
      AJOOP_RUNTIME_DEFAULTS.controlPort,
      1024,
      65535,
    ),
    ollamaBaseUrl: safeLoopbackUrl(env.OLLAMA_BASE_URL, AJOOP_RUNTIME_DEFAULTS.ollamaBaseUrl),
    bridgeBaseUrl: AJOOP_RUNTIME_DEFAULTS.bridgeBaseUrl,
    requestTimeoutMs: boundedInteger(
      env.AJOOP_RUNTIME_REQUEST_TIMEOUT_MS,
      AJOOP_RUNTIME_DEFAULTS.requestTimeoutMs,
      100,
      10000,
    ),
    ollamaStartupMs: boundedInteger(
      env.AJOOP_RUNTIME_OLLAMA_STARTUP_MS,
      AJOOP_RUNTIME_DEFAULTS.ollamaStartupMs,
      1000,
      120000,
    ),
    bridgeStartupMs: boundedInteger(
      env.AJOOP_RUNTIME_BRIDGE_STARTUP_MS,
      AJOOP_RUNTIME_DEFAULTS.bridgeStartupMs,
      1000,
      300000,
    ),
    pollIntervalMs: boundedInteger(
      env.AJOOP_RUNTIME_POLL_MS,
      AJOOP_RUNTIME_DEFAULTS.pollIntervalMs,
      50,
      5000,
    ),
    shutdownMs: boundedInteger(
      env.AJOOP_RUNTIME_SHUTDOWN_MS,
      AJOOP_RUNTIME_DEFAULTS.shutdownMs,
      250,
      30000,
    ),
    maxResponseBytes: AJOOP_RUNTIME_DEFAULTS.maxResponseBytes,
    generationModel: ragStatus.model,
    embeddingModel: ragStatus.embedModel,
    bridgeEnv: runtimeEnv,
  });
}

function connectionRefused(error) {
  const code = error?.cause?.code || error?.code;
  return code === "ECONNREFUSED" || code === "ECONNRESET";
}

export async function fetchBoundedJson(url, options = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs || AJOOP_RUNTIME_DEFAULTS.requestTimeoutMs;
  const maxBytes = dependencies.maxBytes || AJOOP_RUNTIME_DEFAULTS.maxResponseBytes;
  if (typeof fetchImpl !== "function") return Object.freeze({ ok: false, kind: "unavailable" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const declared = Number(response?.headers?.get?.("content-length") || 0);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return Object.freeze({ ok: false, kind: "malformed" });
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) return Object.freeze({ ok: false, kind: "malformed" });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return Object.freeze({ ok: false, kind: "malformed", status: response.status });
    }
    return Object.freeze({ ok: Boolean(response.ok), kind: "response", status: response.status, body });
  } catch (error) {
    return Object.freeze({
      ok: false,
      kind: connectionRefused(error) ? "unused" : error?.name === "AbortError" ? "timeout" : "unavailable",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function probeOllama(config, dependencies = {}) {
  const result = await fetchBoundedJson(`${config.ollamaBaseUrl}/api/tags`, {}, {
    ...dependencies,
    timeoutMs: config.requestTimeoutMs,
    maxBytes: config.maxResponseBytes,
  });
  if (!result.ok || !Array.isArray(result.body?.models)) {
    return Object.freeze({ ok: false, kind: result.kind === "unused" ? "unavailable" : result.kind });
  }
  const models = [...new Set(result.body.models.flatMap((item) => [item?.name, item?.model])
    .filter((item) => typeof item === "string" && item.length <= 128))];
  return Object.freeze({ ok: true, kind: "ollama", models: Object.freeze(models) });
}

export async function probeBridge(config, dependencies = {}) {
  const result = await fetchBoundedJson(`${config.bridgeBaseUrl}/ajoop-rag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, mode: "health" }),
  }, {
    ...dependencies,
    timeoutMs: config.requestTimeoutMs,
    maxBytes: config.maxResponseBytes,
  });
  if (result.kind === "unused") return Object.freeze({ ok: false, kind: "unused" });
  const body = result.body;
  const provesIdentity = result.status === 200
    && body && typeof body === "object"
    && body.service === AJOOP_BRIDGE_IDENTITY.service
    && body.protocolVersion === AJOOP_BRIDGE_IDENTITY.protocolVersion
    && body.mode === "rag"
    && typeof body.ready === "boolean"
    && typeof body.model === "string"
    && typeof body.embedModel === "string";
  if (!provesIdentity) return Object.freeze({ ok: false, kind: "unknown-occupant" });
  if (body.model !== config.generationModel || body.embedModel !== config.embeddingModel) {
    return Object.freeze({ ok: false, kind: "incompatible-bridge" });
  }
  return Object.freeze({
    ok: body.ready === true,
    kind: "ajoop-bridge",
    ready: body.ready === true,
    vectorBackend: typeof body.vectorBackend === "string" ? body.vectorBackend.slice(0, 24) : "unknown",
    vectorBackendRequested: typeof body.vectorBackendRequested === "string"
      ? body.vectorBackendRequested.slice(0, 24)
      : "unknown",
  });
}

export function withAjoopBridgeIdentity(body) {
  if (!body || typeof body !== "object" || body.mode !== "rag") return body;
  return Object.freeze({ ...body, ...AJOOP_BRIDGE_IDENTITY });
}

export function classifyAjoopBridgeListenError(error) {
  return error?.code === "EADDRINUSE"
    ? Object.freeze({ code: "bridge-bind-conflict", exitCode: AJOOP_BRIDGE_EXIT_CODES.bindConflict })
    : Object.freeze({ code: "bridge-listen-failed", exitCode: AJOOP_BRIDGE_EXIT_CODES.listenFailed });
}

export function listenAjoopBridgeServer(server, startListening) {
  return new Promise((resolvePromise) => {
    const onError = (error) => {
      server.removeListener?.("listening", onListening);
      resolvePromise(Object.freeze({ ok: false, ...classifyAjoopBridgeListenError(error) }));
    };
    const onListening = () => {
      server.removeListener?.("error", onError);
      resolvePromise(Object.freeze({ ok: true }));
    };
    server.once("error", onError);
    try {
      startListening(onListening);
    } catch (error) {
      server.removeListener?.("error", onError);
      onError(error);
    }
  });
}

export function isAjoopSupervisorStatus(body) {
  return Boolean(
    body && typeof body === "object"
      && body.schemaVersion === AJOOP_RUNTIME_CONTROL_PROTOCOL_VERSION
      && body.identity?.product === AJOOP_RUNTIME_IDENTITY.product
      && body.identity?.version === AJOOP_RUNTIME_IDENTITY.version,
  );
}

export function isAjoopSupervisorStopResponse(body) {
  return Boolean(
    body && typeof body === "object"
      && body.ok === true
      && body.accepted === true
      && body.protocolVersion === AJOOP_RUNTIME_CONTROL_PROTOCOL_VERSION
      && body.identity?.product === AJOOP_RUNTIME_IDENTITY.product
      && body.identity?.version === AJOOP_RUNTIME_IDENTITY.version,
  );
}

export function missingRequiredModels(models, config) {
  const inventory = new Set(Array.isArray(models) ? models : []);
  return Object.freeze([
    ...(inventory.has(config.generationModel) ? [] : ["generation"]),
    ...(inventory.has(config.embeddingModel) ? [] : ["embedding"]),
  ]);
}

export async function locateOllamaExecutable({ platform = process.platform, execFileImpl = execFileAsync } = {}) {
  const command = platform === "win32" ? "where.exe" : "which";
  try {
    const { stdout } = await execFileImpl(command, ["ollama"], {
      timeout: 3000,
      maxBuffer: 4096,
      windowsHide: true,
    });
    const candidate = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return candidate ? Object.freeze({ ok: true, path: candidate }) : Object.freeze({ ok: false });
  } catch {
    return Object.freeze({ ok: false });
  }
}
