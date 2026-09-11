import http from "node:http";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import {
  AJOOP_BRIDGE_EXIT_CODES,
  AJOOP_RUNTIME_IDENTITY,
  AJOOP_RUNTIME_CONTROL_PROTOCOL_VERSION,
  isAjoopSupervisorStatus,
  locateOllamaExecutable,
  missingRequiredModels,
  probeBridge,
  probeOllama,
  resolveAjoopRuntimeConfig,
  fetchBoundedJson,
} from "./ajoop-runtime-probes.mjs";

const COMPONENT_EMPTY = Object.freeze({ ownership: "none", state: "unavailable", pid: null });
const STOP_HEADER = "x-ajoop-supervisor";
const STOP_HEADER_VALUE = "ajoop-runtime-v1";
export const MAX_CHILD_LOG_LINE_CHARS = 1024;
export const AJOOP_CHILD_LOG_REDACTED = "[AJOOP child output redacted]";
export const AJOOP_CHILD_LOG_TRUNCATED = "[AJOOP child output truncated]";
const CHILD_LOG_CREDENTIAL = /(?:\bauthorization\s*:\s*\S|\bbearer\s+\S+|(?:^|[\s,{])["']?(?:access_token|refresh_token|token|api[_-]?key|apikey|secret|credential)["']?\s*[:=]\s*["']?\S|["']?oauth["']?\s*[:=]\s*[{[])/i;
let statusSequence = 0;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const isoNow = () => new Date().toISOString();

function publicComponent(component) {
  return Object.freeze({
    ownership: component.ownership,
    state: component.state,
    pid: Number.isSafeInteger(component.pid) && component.pid > 0 ? component.pid : null,
  });
}

function publicModel(value) {
  return typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
    ? value
    : "unknown";
}

export function sanitizeSupervisorStatus(status) {
  const errorCode = typeof status.lastError === "string" && /^[a-z0-9:_,-]{1,80}$/.test(status.lastError)
    ? status.lastError
    : null;
  return Object.freeze({
    schemaVersion: 1,
    identity: AJOOP_RUNTIME_IDENTITY,
    state: status.state,
    localReady: status.localReady === true,
    publicReachable: status.publicReachable === true ? true : status.publicReachable === false ? false : null,
    startedAt: status.startedAt,
    lastTransitionAt: status.lastTransitionAt,
    lastError: errorCode,
    models: Object.freeze({
      generation: publicModel(status.models.generation),
      embedding: publicModel(status.models.embedding),
      generationPresent: status.models.generationPresent === true,
      embeddingPresent: status.models.embeddingPresent === true,
    }),
    components: Object.freeze({
      ollama: publicComponent(status.components.ollama),
      bridge: publicComponent(status.components.bridge),
      tunnel: Object.freeze({ ownership: "external", state: "not-managed", pid: null }),
    }),
    vector: Object.freeze({
      backend: typeof status.vector.backend === "string" ? status.vector.backend.slice(0, 24) : "unknown",
      degraded: status.vector.degraded === true,
    }),
  });
}

export function sanitizeChildOutput(value) {
  const clean = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "");
  return CHILD_LOG_CREDENTIAL.test(clean) ? AJOOP_CHILD_LOG_REDACTED : clean;
}

export function createChildLogLineFramer(destination, options = {}) {
  const maximum = Number.isSafeInteger(options.maximum) && options.maximum > 0
    ? options.maximum
    : MAX_CHILD_LOG_LINE_CHARS;
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let discarding = false;

  const emit = (line) => destination.write(`${sanitizeChildOutput(line)}\n`);
  const consume = (text) => {
    let cursor = 0;
    while (cursor < text.length) {
      const newline = text.indexOf("\n", cursor);
      const end = newline < 0 ? text.length : newline;
      const fragment = text.slice(cursor, end);

      if (discarding) {
        if (newline < 0) return;
        discarding = false;
        cursor = newline + 1;
        continue;
      }

      if (pending.length + fragment.length > maximum) {
        pending = "";
        emit(AJOOP_CHILD_LOG_TRUNCATED);
        if (newline < 0) {
          discarding = true;
          return;
        }
        cursor = newline + 1;
        continue;
      }

      pending += fragment;
      if (newline < 0) return;
      emit(pending);
      pending = "";
      cursor = newline + 1;
    }
  };

  return Object.freeze({
    write(chunk) {
      consume(Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk ?? ""));
    },
    end(chunk) {
      if (chunk !== undefined) this.write(chunk);
      consume(decoder.end());
      if (!discarding && pending) emit(pending);
      pending = "";
      discarding = false;
    },
    state() {
      return Object.freeze({ pendingChars: pending.length, discarding, maximum });
    },
  });
}

export function attachBoundedChildLogs(child, dependencies = {}) {
  const stdout = dependencies.stdout || process.stdout;
  const stderr = dependencies.stderr || process.stderr;
  const maximum = dependencies.maximum || MAX_CHILD_LOG_LINE_CHARS;
  const attach = (stream, destination) => {
    if (!stream?.on || typeof destination?.write !== "function") return;
    const framer = createChildLogLineFramer(destination, { maximum });
    stream.on("data", (chunk) => framer.write(chunk));
    stream.on("end", () => framer.end());
  };
  attach(child?.stdout, stdout);
  attach(child?.stderr, stderr);
  return child;
}

export async function writeSupervisorStatus(filePath, status, dependencies = {}) {
  const mkdirImpl = dependencies.mkdirImpl || mkdir;
  const writeFileImpl = dependencies.writeFileImpl || writeFile;
  const renameImpl = dependencies.renameImpl || rename;
  const payload = `${JSON.stringify(sanitizeSupervisorStatus(status), null, 2)}\n`;
  const temporary = `${filePath}.${process.pid}.${++statusSequence}.tmp`;
  await mkdirImpl(dirname(filePath), { recursive: true });
  await writeFileImpl(temporary, payload, { encoding: "utf8", mode: 0o600 });
  await renameImpl(temporary, filePath);
}

async function queryControlIdentity(config, fetchImpl = globalThis.fetch) {
  const result = await fetchBoundedJson(
    `http://${config.controlHost}:${config.controlPort}/status`,
    { method: "GET" },
    { fetchImpl, timeoutMs: config.requestTimeoutMs, maxBytes: config.maxResponseBytes },
  );
  return result.ok && isAjoopSupervisorStatus(result.body);
}

export async function acquireControlServer({ config, getStatus, requestStop, httpImpl = http, fetchImpl } = {}) {
  let server;
  try {
    server = httpImpl.createServer((request, response) => {
      const url = new URL(request.url || "/", `http://${config.controlHost}:${config.controlPort}`);
      const send = (code, body) => {
        const payload = `${JSON.stringify(body)}\n`;
        response.writeHead(code, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(payload);
      };
      if (request.method === "GET" && url.pathname === "/status") {
        send(200, getStatus());
        return;
      }
      if (request.method === "POST" && url.pathname === "/stop") {
        if (request.headers[STOP_HEADER] !== STOP_HEADER_VALUE) {
          request.resume();
          send(403, { ok: false, code: "stop-auth-required" });
          return;
        }
        request.resume();
        send(202, {
          ok: true,
          accepted: true,
          protocolVersion: AJOOP_RUNTIME_CONTROL_PROTOCOL_VERSION,
          identity: AJOOP_RUNTIME_IDENTITY,
        });
        setImmediate(requestStop);
        return;
      }
      request.resume();
      send(404, { ok: false, code: "not-found" });
    });
    const listening = new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(config.controlPort, config.controlHost, resolvePromise);
    });
    await listening;
    server.removeAllListeners("error");
    server.on("error", () => {});
    const close = () => new Promise((resolvePromise) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      };
      const timer = setTimeout(() => {
        /* Close only control connections owned by this listener. This does not
         * touch any child or any unrelated process. */
        server.closeAllConnections?.();
        finish();
      }, config.shutdownMs);
      server.close(finish);
    });
    return Object.freeze({
      ok: true,
      port: server.address()?.port || config.controlPort,
      close,
    });
  } catch (error) {
    if (server?.listening) server.close();
    if (error?.code !== "EADDRINUSE") return Object.freeze({ ok: false, code: "control-bind-failed" });
    const expected = await queryControlIdentity(config, fetchImpl);
    return Object.freeze({ ok: false, code: expected ? "supervisor-already-running" : "control-port-occupied" });
  }
}

function spawnOwned(executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  return attachBoundedChildLogs(child, options.logDependencies);
}

function childAlive(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

async function stopOwnedChild(child, timeoutMs, dependencies = {}) {
  if (!childAlive(child)) return;
  const waitImpl = dependencies.waitImpl || sleep;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (childAlive(child) && Date.now() < deadline) await waitImpl(Math.min(50, timeoutMs));
  if (childAlive(child)) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* The handle is the only authority; a refused signal is not a reason to widen scope. */
    }
  }
}

export function createAjoopRuntimeSupervisor(options = {}) {
  const env = options.env || {};
  const config = options.config || resolveAjoopRuntimeConfig(env);
  const rootDir = options.rootDir || resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const statusPath = options.statusPath || resolve(rootDir, ".ajoop-runtime", "supervisor", "status.json");
  const deps = {
    acquireControl: options.acquireControl || acquireControlServer,
    probeOllama: options.probeOllama || probeOllama,
    probeBridge: options.probeBridge || probeBridge,
    locateOllama: options.locateOllama || locateOllamaExecutable,
    spawnOwned: options.spawnOwned || spawnOwned,
    wait: options.wait || sleep,
    now: options.now || isoNow,
    writeStatus: options.writeStatus || writeSupervisorStatus,
  };
  const startedAt = deps.now();
  const mutable = {
    state: "stopped",
    localReady: false,
    publicReachable: null,
    startedAt,
    lastTransitionAt: startedAt,
    lastError: null,
    models: {
      generation: config.generationModel,
      embedding: config.embeddingModel,
      generationPresent: false,
      embeddingPresent: false,
    },
    components: { ollama: { ...COMPONENT_EMPTY }, bridge: { ...COMPONENT_EMPTY } },
    vector: { backend: "unknown", degraded: false },
  };
  const children = { ollama: null, bridge: null };
  let control = null;
  let stopping = false;
  let stopped = false;
  let stopPromise = null;
  let startPromise = null;
  let startupGeneration = 0;
  let activeAttempt = null;

  const status = () => sanitizeSupervisorStatus(mutable);
  const persist = async () => {
    try {
      await deps.writeStatus(statusPath, mutable);
    } catch {
      // Status persistence is diagnostic. It never changes ownership or readiness.
    }
  };
  const transition = async (state, error = null) => {
    mutable.state = state;
    mutable.lastError = error;
    mutable.lastTransitionAt = deps.now();
    await persist();
  };
  const setComponent = async (name, ownership, state, child = null) => {
    mutable.components[name] = {
      ownership,
      state,
      pid: ownership === "owned" && Number.isSafeInteger(child?.pid) ? child.pid : null,
    };
    await persist();
  };
  const createAttempt = () => {
    let resolveInvalidated;
    const attempt = {
      generation: ++startupGeneration,
      valid: true,
      code: null,
      invalidated: new Promise((resolvePromise) => { resolveInvalidated = resolvePromise; }),
      resolveInvalidated,
    };
    activeAttempt = attempt;
    return attempt;
  };
  const attemptIsCurrent = (attempt) => activeAttempt === attempt && attempt.valid && !stopping && !stopped;
  const invalidateAttempt = (attempt, code, componentName = null, markFailed = true) => {
    if (!attempt || !attempt.valid || activeAttempt !== attempt) return;
    attempt.valid = false;
    attempt.code = code;
    attempt.resolveInvalidated(Object.freeze({ ok: false, kind: "startup-invalid", code }));
    if (!markFailed) return;
    if (componentName && mutable.components[componentName].ownership === "owned") {
      mutable.components[componentName] = { ownership: "owned", state: "failed", pid: null };
    }
    mutable.localReady = false;
    mutable.state = "failed";
    mutable.lastError = code;
    mutable.lastTransitionAt = deps.now();
    void persist();
  };
  const attachOwnedLifecycle = (name, child, attempt) => {
    child.once("error", (error) => {
      if (stopping || children[name] !== child) return;
      const code = name === "bridge" && error?.code === "EADDRINUSE"
        ? "bridge-bind-conflict"
        : `${name}-spawn-failed`;
      invalidateAttempt(attempt, code, name);
    });
    child.once("exit", (exitCode) => {
      if (stopping || children[name] !== child || !attempt.valid) return;
      const code = name === "bridge" && exitCode === AJOOP_BRIDGE_EXIT_CODES.bindConflict
        ? "bridge-bind-conflict"
        : name === "bridge" && exitCode === AJOOP_BRIDGE_EXIT_CODES.listenFailed
          ? "bridge-listen-failed"
        : `${name}-unexpected-exit`;
      invalidateAttempt(attempt, code, name);
    });
  };
  const guardedProbe = (probe, attempt) => {
    if (!attemptIsCurrent(attempt)) {
      return Promise.resolve(Object.freeze({ ok: false, kind: "startup-invalid", code: attempt.code || "startup-stopped" }));
    }
    return Promise.race([probe(), attempt.invalidated]);
  };
  const waitFor = async (probe, deadlineMs, attempt) => {
    const deadline = Date.now() + deadlineMs;
    let result = await guardedProbe(probe, attempt);
    while (!result.ok && result.kind !== "startup-invalid" && Date.now() < deadline) {
      await Promise.race([
        deps.wait(Math.min(config.pollIntervalMs, Math.max(1, deadline - Date.now()))),
        attempt.invalidated,
      ]);
      result = await guardedProbe(probe, attempt);
    }
    return result;
  };

  const cleanupOwned = async () => {
    await stopOwnedChild(children.bridge, config.shutdownMs, { waitImpl: deps.wait });
    children.bridge = null;
    if (mutable.components.bridge.ownership === "owned") {
      mutable.components.bridge = { ownership: "owned", state: "unavailable", pid: null };
    }
    await stopOwnedChild(children.ollama, config.shutdownMs, { waitImpl: deps.wait });
    children.ollama = null;
    if (mutable.components.ollama.ownership === "owned") {
      mutable.components.ollama = { ownership: "owned", state: "unavailable", pid: null };
    }
  };

  const stop = async () => {
    if (stopped) return status();
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
    stopping = true;
    invalidateAttempt(activeAttempt, "startup-stopped", null, false);
    mutable.localReady = false;
    await transition("stopping");
    await cleanupOwned();
    await control?.close?.();
    control = null;
    stopped = true;
    await transition("stopped");
    return status();
    })();
    return stopPromise;
  };

  const failStartup = async (code, attempt) => {
    invalidateAttempt(attempt, code);
    mutable.localReady = false;
    await transition("failed", code);
    stopping = true;
    await cleanupOwned();
    await control?.close?.();
    control = null;
    return Object.freeze({ ok: false, code, status: status() });
  };
  const finishInvalidStartup = (attempt, fallback) => {
    const code = attempt?.code || fallback;
    if (code === "startup-stopped" || stopped || (stopping && mutable.state !== "failed")) {
      return Promise.resolve(Object.freeze({ ok: false, code, status: status() }));
    }
    return failStartup(code, attempt);
  };

  const runStart = async () => {
    const attempt = createAttempt();
    const acquired = await deps.acquireControl({ config, getStatus: status, requestStop: () => void stop() });
    if (!attemptIsCurrent(attempt)) {
      await acquired?.close?.();
      return Object.freeze({ ok: false, code: attempt.code || "startup-stopped", status: status() });
    }
    control = acquired;
    if (!control.ok) {
      invalidateAttempt(attempt, control.code);
      await transition("failed", control.code);
      return Object.freeze({ ok: false, code: control.code, status: status() });
    }
    await transition("starting");
    if (!attemptIsCurrent(attempt)) return Object.freeze({ ok: false, code: attempt.code, status: status() });

    let ollama = await guardedProbe(() => deps.probeOllama(config), attempt);
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
    if (ollama.ok) {
      await setComponent("ollama", "external", "ready");
    } else {
      const located = await deps.locateOllama();
      if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
      if (!located.ok) return failStartup("ollama-executable-missing", attempt);
      const child = deps.spawnOwned(located.path, ["serve"], { cwd: rootDir, env });
      children.ollama = child;
      attachOwnedLifecycle("ollama", child, attempt);
      await setComponent("ollama", "owned", "starting", child);
      ollama = await waitFor(() => deps.probeOllama(config), config.ollamaStartupMs, attempt);
      if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "ollama-spawn-failed");
      if (!ollama.ok) return failStartup("ollama-readiness-timeout", attempt);
      await setComponent("ollama", "owned", "ready", child);
    }
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "ollama-unexpected-exit");

    const missing = missingRequiredModels(ollama.models, config);
    mutable.models.generationPresent = !missing.includes("generation");
    mutable.models.embeddingPresent = !missing.includes("embedding");
    await persist();
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
    if (missing.length) return failStartup(`models-missing:${missing.join(",")}`, attempt);

    let bridge = await guardedProbe(() => deps.probeBridge(config), attempt);
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
    if (bridge.kind === "ajoop-bridge" && bridge.ok) {
      await setComponent("bridge", "external", "ready");
    } else if (bridge.kind === "ajoop-bridge") {
      return failStartup("external-bridge-not-ready", attempt);
    } else if (bridge.kind === "incompatible-bridge") {
      return failStartup("external-bridge-incompatible", attempt);
    } else if (bridge.kind !== "unused") {
      return failStartup("bridge-port-occupied", attempt);
    } else {
      const child = deps.spawnOwned(process.execPath, [resolve(rootDir, "server", "ajoop-bridge.mjs")], {
        cwd: rootDir,
        env: config.bridgeEnv,
      });
      children.bridge = child;
      attachOwnedLifecycle("bridge", child, attempt);
      await setComponent("bridge", "owned", "starting", child);
      bridge = await waitFor(() => deps.probeBridge(config), config.bridgeStartupMs, attempt);
      if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "bridge-spawn-failed");
      if (!bridge.ok) return failStartup("bridge-readiness-timeout", attempt);
      await setComponent("bridge", "owned", "ready", child);
    }
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "bridge-unexpected-exit");

    mutable.vector.backend = bridge.vectorBackend || "unknown";
    mutable.vector.degraded = bridge.vectorBackendRequested !== "unknown"
      && bridge.vectorBackend !== bridge.vectorBackendRequested;
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
    mutable.localReady = true;
    await transition("ready");
    if (!attemptIsCurrent(attempt)) return finishInvalidStartup(attempt, "startup-stopped");
    return Object.freeze({ ok: true, status: status() });
  };

  const start = () => {
    if (startPromise) return startPromise;
    startPromise = runStart();
    return startPromise;
  };

  return Object.freeze({ start, stop, status, signalStop: stop });
}

export const AJOOP_RUNTIME_STOP_HEADER = Object.freeze({
  name: STOP_HEADER,
  value: STOP_HEADER_VALUE,
});
