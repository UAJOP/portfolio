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
  /* A5.2.4 observe-only public path. The route is owned outside AJOOP; these
   * values only bound how the supervisor looks at it. */
  publicHealthUrl: "https://ajoop.kaanbalci.com/ajoop-rag",
  publicRequestTimeoutMs: 5000,
  publicProbeIntervalMs: 300000,
});

export const AJOOP_TUNNEL_OBSERVATION_STATES = Object.freeze([
  "not-checked",
  "reachable",
  "unreachable",
  "timeout",
  "edge-error",
  "identity-mismatch",
  "malformed",
]);

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
    publicHealthUrl: AJOOP_RUNTIME_DEFAULTS.publicHealthUrl,
    publicRequestTimeoutMs: AJOOP_RUNTIME_DEFAULTS.publicRequestTimeoutMs,
    publicProbeIntervalMs: AJOOP_RUNTIME_DEFAULTS.publicProbeIntervalMs,
    generationModel: ragStatus.model,
    embeddingModel: ragStatus.embedModel,
    bridgeEnv: runtimeEnv,
  });
}

function connectionFailureKind(error) {
  const code = error?.cause?.code || error?.code;
  if (code === "ECONNREFUSED") return "unused";
  if (code === "ECONNRESET") return "connection-reset";
  return null;
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
    const connectionKind = connectionFailureKind(error);
    return Object.freeze({
      ok: false,
      kind: connectionKind || (error?.name === "AbortError" ? "timeout" : "unavailable"),
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
  const provesIdentity = result.status === 200 && isAjoopBridgeHealthIdentity(body);
  if (!provesIdentity) return Object.freeze({ ok: false, kind: "unknown-occupant" });
  if (!ajoopBridgeModelsMatch(body, config)) {
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

/** The one bridge identity contract, shared by the loopback and public probes. */
export function isAjoopBridgeHealthIdentity(body) {
  return Boolean(
    body && typeof body === "object" && !Array.isArray(body)
      && body.service === AJOOP_BRIDGE_IDENTITY.service
      && body.protocolVersion === AJOOP_BRIDGE_IDENTITY.protocolVersion
      && body.mode === "rag"
      && typeof body.ready === "boolean"
      && typeof body.model === "string"
      && typeof body.embedModel === "string",
  );
}

function ajoopBridgeModelsMatch(body, config) {
  return body.model === config.generationModel && body.embedModel === config.embeddingModel;
}

export function sanitizeTunnelObservationState(value) {
  return AJOOP_TUNNEL_OBSERVATION_STATES.includes(value) ? value : "not-checked";
}

const TIMED_OUT = Symbol("timed-out");
const PUBLIC_HEALTH_BODY = JSON.stringify({ version: 1, mode: "health" });

/** Returns the target only when it is a credential-free HTTPS URL. */
export function safePublicHealthUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/* The complete public request. No Origin, Authorization, Cookie, question or
 * owner field exists here, so the bridge answers it in RAG admission's health
 * branch, before planner, model, tools and connectors. */
export function ajoopPublicHealthRequestInit() {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: PUBLIC_HEALTH_BODY,
  };
}

const isEdgeErrorStatus = (status) => status === 502 || status === 503 || status === 504
  || (status >= 520 && status <= 530);

/**
 * Bounded JSON fetch for an UNTRUSTED remote peer. Unlike the loopback helper,
 * the byte cap is enforced while the body streams, redirects are never
 * followed, and the deadline covers both the response headers and the body.
 *
 * Kinds: response · redirect · http-error · malformed · timeout · unavailable.
 */
export async function fetchBoundedRemoteJson(url, init = {}, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs || AJOOP_RUNTIME_DEFAULTS.publicRequestTimeoutMs;
  const maxBytes = dependencies.maxBytes || AJOOP_RUNTIME_DEFAULTS.maxResponseBytes;
  if (typeof fetchImpl !== "function") return Object.freeze({ kind: "unavailable" });

  const controller = new AbortController();
  let timer;
  const expired = new Promise((resolvePromise) => {
    timer = setTimeout(() => {
      controller.abort();
      resolvePromise(TIMED_OUT);
    }, timeoutMs);
  });
  let response = null;
  let reader = null;
  const discard = () => {
    try {
      const cancelled = reader ? reader.cancel() : response?.body?.cancel?.();
      cancelled?.catch?.(() => {});
    } catch {
      /* Releasing an abandoned body is best effort; the result is already decided. */
    }
  };
  const timeout = Object.freeze({ kind: "timeout" });
  const malformed = (status) => Object.freeze({ kind: "malformed", status });

  try {
    const pending = Promise.resolve().then(() => fetchImpl(url, {
      ...init,
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
    }));
    const fetched = await Promise.race([pending, expired]);
    if (fetched === TIMED_OUT) {
      pending.then((late) => {
        try {
          late?.body?.cancel?.()?.catch?.(() => {});
        } catch {
          /* A late response is never read. */
        }
      }, () => {});
      return timeout;
    }
    response = fetched;
    const status = Number(response?.status);
    if (response?.type === "opaqueredirect" || response?.redirected === true || (status >= 300 && status < 400)) {
      discard();
      return Object.freeze({ kind: "redirect", status: Number.isInteger(status) ? status : 0 });
    }
    if (!Number.isInteger(status)) {
      discard();
      return malformed(0);
    }
    if (status < 200 || status >= 300) {
      discard();
      return Object.freeze({ kind: "http-error", status });
    }
    const declaredLength = response.headers?.get?.("content-length");
    if (declaredLength !== null && declaredLength !== undefined && declaredLength !== "") {
      const declared = Number(declaredLength);
      if (!Number.isFinite(declared) || declared > maxBytes) {
        discard();
        return malformed(status);
      }
    }
    if (!response.body || typeof response.body.getReader !== "function") return malformed(status);

    reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const next = await Promise.race([reader.read(), expired]);
      if (next === TIMED_OUT) {
        discard();
        return timeout;
      }
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) {
        discard();
        return malformed(status);
      }
      total += next.value.byteLength;
      if (total > maxBytes) {
        discard();
        return malformed(status);
      }
      chunks.push(next.value);
    }
    reader = null;

    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return malformed(status);
    }
    return Object.freeze({ kind: "response", status, body: parsed });
  } catch {
    discard();
    return controller.signal.aborted ? timeout : Object.freeze({ kind: "unavailable" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A5.2.4 observe-only public reachability. `reachable` means the expected AJOOP
 * bridge identity answered through the public route; it says nothing about
 * local readiness, and the health body's `ready` is deliberately not required.
 * An invalid target is never requested and reports `not-checked`.
 */
export async function probePublicBridge(config, dependencies = {}) {
  const observe = (state) => Object.freeze({
    state,
    reachable: state === "reachable" ? true : state === "not-checked" ? null : false,
  });
  const target = safePublicHealthUrl(config?.publicHealthUrl);
  if (!target) return observe("not-checked");
  const result = await fetchBoundedRemoteJson(target, ajoopPublicHealthRequestInit(), {
    fetchImpl: dependencies.fetchImpl,
    timeoutMs: config.publicRequestTimeoutMs,
    maxBytes: config.maxResponseBytes,
  });
  if (result.kind === "timeout") return observe("timeout");
  if (result.kind === "unavailable") return observe("unreachable");
  if (result.kind === "http-error") return observe(isEdgeErrorStatus(result.status) ? "edge-error" : "malformed");
  if (result.kind !== "response") return observe("malformed");
  const body = result.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return observe("malformed");
  if (!isAjoopBridgeHealthIdentity(body) || !ajoopBridgeModelsMatch(body, config)) {
    return observe("identity-mismatch");
  }
  return observe("reachable");
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
