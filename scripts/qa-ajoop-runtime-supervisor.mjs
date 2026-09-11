#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveRuntimeCommandConfig } from "./ajoop-runtime.mjs";
import {
  AJOOP_BRIDGE_EXIT_CODES,
  AJOOP_BRIDGE_IDENTITY,
  AJOOP_RUNTIME_DEFAULTS,
  AJOOP_RUNTIME_IDENTITY,
  AJOOP_TUNNEL_OBSERVATION_STATES,
  ajoopPublicHealthRequestInit,
  classifyAjoopBridgeListenError,
  fetchBoundedJson,
  fetchBoundedRemoteJson,
  isAjoopBridgeHealthIdentity,
  isAjoopSupervisorStatus,
  isAjoopSupervisorStopResponse,
  listenAjoopBridgeServer,
  missingRequiredModels,
  probeBridge,
  probePublicBridge,
  resolveAjoopRuntimeConfig,
  safePublicHealthUrl,
  sanitizeTunnelObservationState,
} from "../server/ajoop-runtime-probes.mjs";
import {
  AJOOP_CHILD_LOG_REDACTED,
  AJOOP_CHILD_LOG_TRUNCATED,
  AJOOP_RUNTIME_STOP_HEADER,
  MAX_CHILD_LOG_LINE_CHARS,
  acquireControlServer,
  attachBoundedChildLogs,
  createChildLogLineFramer,
  createAjoopRuntimeSupervisor,
  sanitizeChildOutput,
  sanitizeSupervisorStatus,
  writeSupervisorStatus,
} from "../server/ajoop-runtime-supervisor.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) passed += 1;
  else failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);
const config = resolveAjoopRuntimeConfig({});
const testConfig = Object.freeze({ ...config, ollamaStartupMs: 20, bridgeStartupMs: 20, pollIntervalMs: 1 });
const wait = async () => {};
const execFileAsync = promisify(execFile);

/* Hermetic network guard: any default-fetch path that tries to leave loopback
 * (for example an un-injected public probe) is refused and counted. */
const loopbackFetch = globalThis.fetch;
const blockedFetchHosts = [];
globalThis.fetch = (input, init) => {
  let hostname = "";
  try {
    hostname = new URL(typeof input === "string" || input instanceof URL ? input : input?.url).hostname;
  } catch {
    hostname = "";
  }
  if (hostname !== "127.0.0.1") {
    blockedFetchHosts.push(hostname || "invalid");
    return Promise.reject(new TypeError("QA refuses non-loopback network access"));
  }
  return loopbackFetch(input, init);
};

function fakeScheduler({ eager = false } = {}) {
  const timers = [];
  const cleared = [];
  const delays = [];
  const take = (handle) => {
    const index = timers.indexOf(handle);
    if (index < 0) return false;
    timers.splice(index, 1);
    return true;
  };
  return {
    setTimer(callback, delayMs) {
      const handle = { callback, delayMs };
      delays.push(delayMs);
      timers.push(handle);
      if (eager) queueMicrotask(() => { if (take(handle)) callback(); });
      return handle;
    },
    clearTimer(handle) {
      if (take(handle)) cleared.push(handle);
    },
    pending: () => timers.length,
    peek: () => timers[0],
    delays,
    cleared,
    fire() {
      const handle = timers.shift();
      if (!handle) return false;
      handle.callback();
      return true;
    },
  };
}

function child(pid, options = {}) {
  const emitter = new EventEmitter();
  emitter.pid = pid;
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.killCalls = [];
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  emitter.kill = (signal) => {
    emitter.killCalls.push(signal);
    options.onKill?.(signal, emitter);
    if (options.exitOnKill !== false || signal === "SIGKILL") {
      emitter.exitCode = 0;
      emitter.emit("exit", 0, signal);
    }
    return true;
  };
  return emitter;
}

function harness({
  ollama,
  bridge,
  locate = { ok: false },
  children = [],
  acquireControl,
  writeStatus,
  waitImpl = wait,
  statusPath = "ignored",
  spawnOwned,
  probePublic,
  scheduler = fakeScheduler(),
} = {}) {
  const spawned = [];
  const writes = [];
  const controls = [];
  const publicCalls = [];
  const supervisor = createAjoopRuntimeSupervisor({
    probePublic: async (probeConfig) => {
      publicCalls.push(probeConfig);
      if (typeof probePublic === "function") return probePublic(probeConfig);
      return probePublic || { state: "not-checked" };
    },
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    env: {},
    config: testConfig,
    statusPath,
    acquireControl: acquireControl || (async (options) => {
      controls.push(options);
      return { ok: true, close: async () => {} };
    }),
    probeOllama: async () => {
      if (Array.isArray(ollama)) return ollama.length > 1 ? ollama.shift() : ollama[0];
      return typeof ollama === "function" ? ollama() : ollama;
    },
    probeBridge: async () => {
      if (Array.isArray(bridge)) return bridge.length > 1 ? bridge.shift() : bridge[0];
      return typeof bridge === "function" ? bridge() : bridge;
    },
    locateOllama: async () => locate,
    spawnOwned: spawnOwned || (() => {
      const next = children[spawned.length] || child(9000 + spawned.length);
      spawned.push(next);
      return next;
    }),
    wait: waitImpl,
    writeStatus: writeStatus || (async (_path, status) => writes.push(sanitizeSupervisorStatus(status))),
    now: (() => {
      let index = 0;
      return () => `2026-09-11T00:00:0${index++}Z`;
    })(),
  });
  return { supervisor, spawned, writes, controls, scheduler, publicCalls };
}

const healthyOllama = {
  ok: true,
  kind: "ollama",
  models: [config.generationModel, config.embeddingModel],
};
const externalBridge = {
  ok: true,
  kind: "ajoop-bridge",
  vectorBackend: "memory",
  vectorBackendRequested: "memory",
};

check("control identity is fixed", AJOOP_RUNTIME_IDENTITY.product, "AJOOP supervisor");
check("control port is loopback-bound", config.controlHost, "127.0.0.1");
check("control stop header is fixed", AJOOP_RUNTIME_STOP_HEADER.value, "ajoop-runtime-v1");
check("missing generation is named", missingRequiredModels([config.embeddingModel], config)[0], "generation");
check("missing embedding is named", missingRequiredModels([config.generationModel], config)[0], "embedding");

{
  const h = harness({ ollama: healthyOllama, bridge: externalBridge });
  check("fresh supervisor begins with startable stopped label", h.supervisor.status().state, "stopped");
  const result = await h.supervisor.start();
  check("healthy external services reach ready", result.ok, true);
  check("fresh supervisor initial start reaches ready", result.status.state, "ready");
  check("external Ollama is never spawned", h.spawned.length, 0);
  await h.supervisor.stop();
}
{
  const blocked = createAjoopRuntimeSupervisor({
    config: testConfig,
    acquireControl: async () => ({ ok: false, code: "supervisor-already-running" }),
    writeStatus: async () => {},
    now: () => "x",
  });
  check("second supervisor cannot acquire singleton", (await blocked.start()).code, "supervisor-already-running");
}
{
  const occupant = child(9090);
  let closeCalls = 0;
  const blocked = createAjoopRuntimeSupervisor({
    config: testConfig,
    acquireControl: async () => ({
      ok: false,
      code: "control-port-occupied",
      kill: (signal) => occupant.kill(signal),
      close: async () => { closeCalls += 1; },
    }),
    writeStatus: async () => {},
    now: () => "x",
  });
  check("unknown control occupant refuses", (await blocked.start()).code, "control-port-occupied");
  await blocked.stop();
  check("unknown control occupant receives zero signals", occupant.killCalls.length, 0);
  check("unknown control occupant is never closed as owned", closeCalls, 0);
}
{
  const h = harness({ ollama: { ok: false, kind: "unavailable" }, locate: { ok: false }, bridge: externalBridge });
  check("missing Ollama executable is structured", (await h.supervisor.start()).code, "ollama-executable-missing");
}
{
  const occupant = child(8787);
  const h = harness({
    ollama: healthyOllama,
    bridge: { ok: false, kind: "unknown-occupant", kill: (signal) => occupant.kill(signal) },
  });
  const result = await h.supervisor.start();
  check("unknown bridge occupant refuses safely", result.code, "bridge-port-occupied");
  check("unknown occupant is never spawned", h.spawned.length, 0);
  check("unknown bridge occupant receives zero signals", occupant.killCalls.length, 0);
}
{
  const ownedOllama = child(9101);
  const h = harness({
    ollama: [{ ok: false, kind: "unavailable" }, healthyOllama],
    locate: { ok: true, path: "ollama.exe" },
    children: [ownedOllama, child(9102)],
    bridge: externalBridge,
  });
  const result = await h.supervisor.start();
  check("owned Ollama reaches ready", result.ok, true);
  check("owned Ollama state is owned", result.status.components.ollama.ownership, "owned");
  await h.supervisor.stop();
  check("owned Ollama receives shutdown", ownedOllama.killCalls[0], "SIGTERM");
}
{
  const h = harness({
    ollama: { ok: true, kind: "ollama", models: [config.generationModel] },
    bridge: externalBridge,
  });
  const result = await h.supervisor.start();
  check("missing embedding blocks ready", result.code, "models-missing:embedding");
}
{
  const h = harness({ ollama: healthyOllama, bridge: [{ ok: false, kind: "unused" }, { ok: false, kind: "unused" }], children: [child(9201)] });
  const result = await h.supervisor.start();
  check("free bridge port spawns once", result.ok, false);
  check("bridge timeout is bounded failure", result.code, "bridge-readiness-timeout");
  check("bridge was spawned once", h.spawned.length, 1);
}
{
  const h = harness({ ollama: healthyOllama, bridge: externalBridge });
  const result = await h.supervisor.start();
  await h.supervisor.stop();
  check("external services remain represented as external", result.status.components.ollama.ownership, "external");
  check("external bridge remains external on stop", h.supervisor.status().components.bridge.ownership, "external");
  check("stop ends in stopped", h.supervisor.status().state, "stopped");
}
{
  const h = harness({
    ollama: healthyOllama,
    bridge: { ok: true, kind: "ajoop-bridge", vectorBackend: "memory", vectorBackendRequested: "qdrant" },
  });
  const result = await h.supervisor.start();
  check("Qdrant degradation does not block local ready", result.status.localReady, true);
  check("Qdrant degradation is diagnostic", result.status.vector.degraded, true);
}
{
  const status = sanitizeSupervisorStatus({
    state: "ready", localReady: true, publicReachable: null,
    startedAt: "x", lastTransitionAt: "x", lastError: "Authorization Bearer secret",
    models: { generation: "qwen3:4b-instruct", embedding: "qwen3-embedding:0.6b", generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "external", state: "ready", pid: 123 }, bridge: { ownership: "external", state: "ready", pid: 124 } },
    vector: { backend: "memory", degraded: false },
  });
  ok("status has no raw environment or credentials", !JSON.stringify(status).includes("Authorization"));
  ok("status contains no private endpoint", !JSON.stringify(status).includes("11434"));
  check("tunnel is external only", status.components.tunnel.ownership, "external");
  check("stale PID cannot grant ownership", status.components.ollama.ownership, "external");
}
{
  const response = await probeBridge(config, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "128" },
      text: async () => JSON.stringify({
        ...AJOOP_BRIDGE_IDENTITY,
        mode: "rag",
        ready: true,
        model: config.generationModel,
        embedModel: config.embeddingModel,
      }),
    }),
  });
  check("valid bridge identity is accepted", response.kind, "ajoop-bridge");
}
{
  let respawns = 0;
  const owned = child(9301);
  const h = harness({ ollama: healthyOllama, bridge: [{ ok: false, kind: "unused" }, externalBridge], children: [owned] });
  const result = await h.supervisor.start();
  owned.emit("exit", 1, null);
  await wait();
  respawns += h.spawned.length;
  check("unexpected exit changes status", h.supervisor.status().state, "failed");
  check("unexpected exit does not respawn", respawns, 1);
  check("owned bridge startup succeeds", result.ok, true);
  await h.supervisor.stop();
  check("owned bridge receives shutdown", owned.killCalls[0], "SIGTERM");
}
{
  const malformed = await fetchBoundedJson("http://loopback.invalid", {}, {
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => "999999" }, text: async () => "{}" }),
  });
  check("bounded probe rejects oversized response", malformed.kind, "malformed");
}
{
  const h = harness({ ollama: healthyOllama, bridge: externalBridge });
  check("signal and stop share cleanup path", h.supervisor.signalStop, h.supervisor.stop);
  await h.supervisor.start();
  await h.supervisor.stop();
  const states = h.writes.map((entry) => entry.state);
  ok("startup/shutdown transitions are ordered", states.indexOf("starting") < states.indexOf("ready"));
}

const deferred = () => {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
};
const settle = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};
const until = async (predicate) => {
  for (let index = 0; index < 100 && !predicate(); index += 1) await Promise.resolve();
  return predicate();
};

{
  const pending = deferred();
  let probes = 0;
  const owned = child(9401);
  const h = harness({
    ollama: () => probes++ === 0 ? { ok: false, kind: "unavailable" } : pending.promise,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [owned],
  });
  const starting = h.supervisor.start();
  await until(() => h.spawned.length === 1);
  owned.emit("error", Object.assign(new Error("private spawn detail"), { code: "ENOENT" }));
  const result = await starting;
  check("Ollama spawn error is structured", result.code, "ollama-spawn-failed");
  check("Ollama spawn error clears local ready", result.status.localReady, false);
  check("Ollama spawn error does not respawn", h.spawned.length, 1);
}
{
  const pending = deferred();
  let probes = 0;
  const owned = child(9402);
  const h = harness({
    ollama: healthyOllama,
    bridge: () => probes++ === 0 ? { ok: false, kind: "unused" } : pending.promise,
    children: [owned],
  });
  const starting = h.supervisor.start();
  await until(() => h.spawned.length === 1);
  owned.emit("error", Object.assign(new Error("private bridge detail"), { code: "ENOENT" }));
  const result = await starting;
  check("bridge spawn error is structured", result.code, "bridge-spawn-failed");
  check("bridge spawn error component fails", result.status.components.bridge.state, "unavailable");
  check("bridge spawn error does not respawn", h.spawned.length, 1);
}
{
  const pending = deferred();
  let probes = 0;
  const owned = child(9411);
  const h = harness({
    ollama: () => probes++ === 0 ? { ok: false, kind: "unavailable" } : pending.promise,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [owned],
  });
  const starting = h.supervisor.start();
  await until(() => h.spawned.length === 1);
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  pending.resolve(healthyOllama);
  const result = await starting;
  check("Ollama startup exit never reaches ready", result.ok, false);
  check("Ollama startup exit remains failed", h.supervisor.status().state, "failed");
}
{
  const pending = deferred();
  let probes = 0;
  const owned = child(9412);
  const h = harness({
    ollama: healthyOllama,
    bridge: () => probes++ === 0 ? { ok: false, kind: "unused" } : pending.promise,
    children: [owned],
  });
  const starting = h.supervisor.start();
  await until(() => h.spawned.length === 1);
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  pending.resolve(externalBridge);
  const result = await starting;
  check("bridge startup exit never reaches ready", result.ok, false);
  check("failed generation cannot overwrite terminal state", h.supervisor.status().state, "failed");
}
{
  const readyWrite = deferred();
  let bridgeProbes = 0;
  const owned = child(9413);
  const h = harness({
    ollama: healthyOllama,
    bridge: () => bridgeProbes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
    children: [owned],
    writeStatus: async (_path, status) => {
      if (status.components.bridge.state === "ready" && status.state === "starting") await readyWrite.promise;
    },
  });
  const starting = h.supervisor.start();
  await until(() => h.supervisor.status().components.bridge.state === "ready");
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  readyWrite.resolve();
  const result = await starting;
  check("exit during final ready persist invalidates generation", result.ok, false);
  check("final ready persist cannot overwrite failed state", h.supervisor.status().state, "failed");
  check("final ready persist cannot restore localReady", h.supervisor.status().localReady, false);
}
{
  const pending = deferred();
  const h = harness({ ollama: () => pending.promise, bridge: externalBridge });
  const starting = h.supervisor.start();
  await settle();
  const stopping = h.supervisor.stop();
  const repeatedWhileStopping = await h.supervisor.start();
  check("start during startup shutdown reports current failure", repeatedWhileStopping.ok, false);
  check("start during startup shutdown reports stopping code", repeatedWhileStopping.code, "runtime-stopping");
  check("start during startup shutdown reports stopping state", repeatedWhileStopping.status.state, "stopping");
  check("start during startup shutdown creates no second attempt", h.spawned.length, 0);
  pending.resolve(healthyOllama);
  await Promise.all([starting, stopping]);
  check("stop during startup prevents later ready", h.supervisor.status().state, "stopped");
  check("stop during startup keeps localReady false", h.supervisor.status().localReady, false);
}
{
  let probes = 0;
  const h = harness({
    ollama: () => probes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
  });
  const firstAttempt = h.supervisor.start();
  const secondAttempt = h.supervisor.start();
  check("concurrent start returns the same in-flight promise", firstAttempt, secondAttempt);
  const [first, second] = await Promise.all([firstAttempt, secondAttempt]);
  check("concurrent start shares Ollama result", first.ok && second.ok, true);
  check("concurrent start cannot spawn Ollama twice", h.spawned.length, 1);
}
{
  let probes = 0;
  const h = harness({
    ollama: healthyOllama,
    bridge: () => probes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
  });
  await Promise.all([h.supervisor.start(), h.supervisor.start()]);
  check("concurrent start cannot spawn bridge twice", h.spawned.length, 1);
  const repeatedReady = await h.supervisor.start();
  check("repeated start after ready reports current ready state", repeatedReady.status.state, "ready");
  check("repeated start after ready creates no child", h.spawned.length, 1);
}
{
  const shutdownGate = deferred();
  let ollamaProbes = 0;
  const ownedOllama = child(9491, { exitOnKill: false });
  const h = harness({
    ollama: () => ollamaProbes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [ownedOllama],
    waitImpl: async () => {
      await shutdownGate.promise;
      ownedOllama.exitCode = 0;
    },
  });
  check("stopping contract fixture reaches ready", (await h.supervisor.start()).ok, true);
  const spawnedBeforeStop = h.spawned.length;
  const stopping = h.supervisor.stop();
  await until(() => h.supervisor.status().state === "stopping");
  const duringStopping = await h.supervisor.start();
  check("start while stopping is rejected", duringStopping.ok, false);
  check("start while stopping uses deterministic code", duringStopping.code, "runtime-stopping");
  check("start while stopping returns current state", duringStopping.status.state, "stopping");
  check("start while stopping creates no startup attempt", h.spawned.length, spawnedBeforeStop);
  shutdownGate.resolve();
  await stopping;
  const afterStopped = await h.supervisor.start();
  check("start after actual stop is rejected", afterStopped.ok, false);
  check("start after actual stop uses deterministic code", afterStopped.code, "runtime-stopped");
  check("start after actual stop returns current state", afterStopped.status.state, "stopped");
  check("start after actual stop does not return historical ready", afterStopped.status.localReady, false);
  const afterStoppedAgain = await h.supervisor.start();
  check("multiple starts after stop return same failure code", afterStoppedAgain.code, "runtime-stopped");
  check("multiple starts after stop return current state", afterStoppedAgain.status.state, "stopped");
  check("multiple starts after stop never respawn", h.spawned.length, spawnedBeforeStop);
}
{
  const externalOllama = { ...healthyOllama, killCalls: [], kill() { this.killCalls.push("kill"); } };
  const external = { ...externalBridge, killCalls: [], kill() { this.killCalls.push("kill"); } };
  const h = harness({ ollama: externalOllama, bridge: external, statusPath: "stale-status-with-pid-7777.json" });
  await h.supervisor.start();
  await h.supervisor.stop();
  check("external Ollama receives zero kills", externalOllama.killCalls.length, 0);
  check("external bridge receives zero kills", external.killCalls.length, 0);
  check("stale PID fixture grants no authority", h.spawned.length, 0);
  check("external tunnel remains untouched", h.supervisor.status().components.tunnel.state, "not-checked");
  check("external tunnel keeps external ownership after stop", h.supervisor.status().components.tunnel.ownership, "external");
}
{
  const temporaryRoot = await mkdtemp(join(tmpdir(), "ajoop-runtime-ownership-"));
  const statusPath = join(temporaryRoot, "status.json");
  const externalOllama = { ...healthyOllama, killCalls: [], kill(signal) { this.killCalls.push(signal); } };
  const externalBridgeProcess = { ...externalBridge, killCalls: [], kill(signal) { this.killCalls.push(signal); } };
  let spawnAttempts = 0;
  try {
    await writeFile(statusPath, JSON.stringify({
      state: "ready",
      components: {
        ollama: { ownership: "owned", pid: 7777 },
        bridge: { ownership: "owned", pid: 8888 },
      },
    }), "utf8");
    const supervisor = createAjoopRuntimeSupervisor({
      config: testConfig,
      statusPath,
      acquireControl: async () => ({ ok: true, close: async () => {} }),
      probeOllama: async () => externalOllama,
      probeBridge: async () => externalBridgeProcess,
      probePublic: async () => ({ state: "not-checked" }),
      setTimer: () => ({}),
      clearTimer: () => {},
      spawnOwned: () => { spawnAttempts += 1; return child(9999); },
      now: () => "x",
    });
    await supervisor.start();
    const written = JSON.parse(await readFile(statusPath, "utf8"));
    await supervisor.stop();
    check("real stale status file creates zero spawn authority", spawnAttempts, 0);
    check("real stale Ollama PID is not adopted", written.components.ollama.pid, null);
    check("real stale bridge PID is not adopted", written.components.bridge.pid, null);
    check("externally discovered Ollama receives zero signals", externalOllama.killCalls.length, 0);
    check("externally discovered bridge receives zero signals", externalBridgeProcess.killCalls.length, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
{
  const order = [];
  let ollamaProbes = 0;
  let bridgeProbes = 0;
  const ownedOllama = child(9501, { onKill: () => order.push("ollama") });
  const ownedBridge = child(9502, { onKill: () => order.push("bridge") });
  const h = harness({
    ollama: () => ollamaProbes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: () => bridgeProbes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [ownedOllama, ownedBridge],
  });
  await h.supervisor.start();
  await h.supervisor.stop();
  check("owned bridge shuts down before owned Ollama", order.join(","), "bridge,ollama");
}
{
  let probes = 0;
  const stubborn = child(9511, { exitOnKill: false });
  const unrelated = child(9512);
  const h = harness({
    ollama: () => probes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [stubborn],
  });
  await h.supervisor.start();
  await h.supervisor.stop();
  check("graceful timeout signals same owned handle", stubborn.killCalls.join(","), "SIGTERM,SIGKILL");
  check("graceful timeout never signals unrelated handle", unrelated.killCalls.length, 0);
}
{
  const writes = [];
  const renames = [];
  await writeSupervisorStatus("runtime/status.json", {
    state: "failed", localReady: false, publicReachable: null,
    startedAt: "x", lastTransitionAt: "x", lastError: "Authorization Bearer secret",
    models: { generation: config.generationModel, embedding: config.embeddingModel, generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "none", state: "unavailable", pid: null }, bridge: { ownership: "none", state: "unavailable", pid: null } },
    vector: { backend: "memory", degraded: false }, rawLog: "api_key=private",
  }, {
    mkdirImpl: async () => {},
    writeFileImpl: async (path, payload) => writes.push({ path, payload }),
    renameImpl: async (from, to) => renames.push({ from, to }),
  });
  check("status writes only temporary path", writes[0].path === "runtime/status.json", false);
  check("status atomically renames temp to final", renames[0].to, "runtime/status.json");
  check("status rename source is written temp", renames[0].from, writes[0].path);
  ok("status schema is allowlisted", isAjoopSupervisorStatus(JSON.parse(writes[0].payload)));
  ok("status omits secret fixture and raw logs", !writes[0].payload.includes("private") && !writes[0].payload.includes("Authorization"));
}
{
  const h = harness({
    ollama: healthyOllama,
    bridge: externalBridge,
    writeStatus: async () => { throw new Error("diagnostic write unavailable"); },
  });
  const result = await h.supervisor.start();
  check("status write failure does not crash supervisor", result.ok, true);
  check("in-memory state remains truthful after write failure", h.supervisor.status().state, "ready");
}
{
  const h = harness({
    ollama: { ok: true, kind: "ollama", models: [config.embeddingModel] },
    bridge: externalBridge,
  });
  const result = await h.supervisor.start();
  check("missing generation blocks supervisor ready", result.code, "models-missing:generation");
  check("missing generation keeps localReady false", result.status.localReady, false);
  check("missing generation triggers no auto-pull spawn", h.spawned.length, 0);
}
{
  const frame = (chunks, { maximum = 64, end = true } = {}) => {
    const output = [];
    const framer = createChildLogLineFramer({ write: (value) => output.push(value) }, { maximum });
    for (const chunk of chunks) framer.write(chunk);
    if (end) framer.end();
    return { output, text: output.join(""), state: framer.state(), framer };
  };
  const safeLine = "runtime probe initialized";
  const redactedLine = `${AJOOP_CHILD_LOG_REDACTED}\n`;
  const redacts = (chunks) => frame(chunks).text === redactedLine;
  check("normal line in one chunk survives", frame([`${safeLine}\n`]).text, `${safeLine}\n`);
  check("normal line split across chunks survives", frame(["runtime ", "probe ", "initialized\n"]).text, `${safeLine}\n`);
  check("split Authorization header redacts", frame(["Authori", "zation: ", "demo-1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  check("split Bearer syntax redacts", frame(["Bea", "rer demo-", "1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  ok("all-alphabetic Bearer credential redacts", redacts(["Bearer AlphabeticValue\n"]));
  ok("lowercase bearer credential redacts", redacts(["bearer AlphabeticValue\n"]));
  ok("mixed-case Bearer credential redacts", redacts(["BeArEr AlphabeticValue\n"]));
  ok("alphabetic Bearer value split across chunks redacts", redacts(["Bearer Alpha", "beticValue\n"]));
  ok("Bearer keyword split across chunks redacts", redacts(["Bea", "rer AlphabeticValue\n"]));
  ok("Bearer scheme and value split redacts", redacts(["Bearer ", "AlphabeticValue\n"]));
  ok("Bearer value split across many chunks redacts", redacts(["Bearer Al", "pha", "betic", "Value\n"]));
  ok("EOF partial alphabetic Bearer credential redacts", redacts(["Bearer AlphabeticValue"]));
  ok("digit and punctuation Bearer credential still redacts", redacts(["Bearer demo-1234\n"]));
  check("token assignment split inside keyword redacts", frame(["to", "ken=demo-1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  check("token value split across chunks redacts", frame(["token=demo-", "1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  check("api_key split across chunks redacts", frame(["api_", "key=demo-1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  check("secret assignment split across chunks redacts", frame(["sec", "ret=demo-1234\n"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  check("harmless token prose is preserved", frame(["token budget initialized\n"]).text, "token budget initialized\n");
  check("harmless authorization prose is preserved", frame(["authorization check disabled in fixture\n"]).text, "authorization check disabled in fixture\n");
  check("harmless secret prose is preserved", frame(["secret scanning test passed\n"]).text, "secret scanning test passed\n");
  check("many lines in one chunk are independent", frame(["first safe\ntoken=demo-1234\nthird safe\n"]).text,
    `first safe\n${AJOOP_CHILD_LOG_REDACTED}\nthird safe\n`);

  const manySafeLines = Array.from({ length: 200 }, (_value, index) => `line-${index % 10}\n`).join("");
  const many = frame([manySafeLines], { maximum: 32 });
  check("giant chunk preserves all bounded short lines", many.output.length, 200);
  ok("giant chunk remains bounded per emitted line", many.output.every((line) => line.length <= 32 + 1));

  const lateCredential = `visible-prefix-${"x".repeat(80)}-token=demo-1234`;
  const overlong = frame([`${lateCredential}\n`], { maximum: 32 });
  check("overlong line emits fixed marker only", overlong.text, `${AJOOP_CHILD_LOG_TRUNCATED}\n`);
  ok("overlong line emits no raw prefix", !overlong.text.includes("visible-prefix"));
  ok("overlong late credential leaks nothing", !overlong.text.includes("demo-1234"));

  const discard = frame(["prefix-", "x".repeat(80), "-ignored", "\nafter discard\n"], { maximum: 32 });
  check("discard-until-newline resumes on next line", discard.text,
    `${AJOOP_CHILD_LOG_TRUNCATED}\nafter discard\n`);
  check("discard state is cleared after newline", discard.state.discarding, false);

  check("EOF partial safe line flushes", frame(["partial safe diagnostic"]).text, "partial safe diagnostic\n");
  check("EOF partial secret line redacts", frame(["access_", "token=demo-1234"]).text, `${AJOOP_CHILD_LOG_REDACTED}\n`);
  const eofDiscard = frame(["x".repeat(80)], { maximum: 32, end: false });
  const beforeEof = eofDiscard.text;
  check("overlong stream enters discard mode", eofDiscard.state.discarding, true);
  check("overlong line emits one marker before EOF", beforeEof, `${AJOOP_CHILD_LOG_TRUNCATED}\n`);
  eofDiscard.framer.end();
  check("EOF during overlong discard emits nothing further", eofDiscard.output.join(""), beforeEof);

  const stdout = [];
  const stderr = [];
  const fake = child(9601);
  attachBoundedChildLogs(fake, {
    maximum: 64,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });
  fake.stdout.write("stdout partial ");
  fake.stderr.write("token=demo-1234\n");
  fake.stdout.write("safe\n");
  fake.stdout.end();
  fake.stderr.end();
  check("stdout framing state remains independent", stdout.join(""), "stdout partial safe\n");
  check("stderr framing state remains independent", stderr.join(""), `${AJOOP_CHILD_LOG_REDACTED}\n`);

  const canonicalLines = [
    "ordinary safe diagnostic",
    "token budget initialized",
    "authorization check disabled in fixture",
    "Authorization: demo-1234",
    "Bearer AlphabeticValue",
    "Bearer demo-1234",
    "refresh_token=demo-1234",
    "api-key: demo-1234",
    '{"oauth":{"access_token":"demo-1234"}}',
  ];
  let chunkInvariant = true;
  for (const line of canonicalLines) {
    const complete = `${line}\n`;
    const baseline = frame([complete]).text;
    for (let boundary = 0; boundary <= complete.length; boundary += 1) {
      if (frame([complete.slice(0, boundary), complete.slice(boundary)]).text !== baseline) chunkInvariant = false;
    }
    const encoded = Buffer.from(complete);
    for (let boundary = 0; boundary <= encoded.length; boundary += 1) {
      if (frame([encoded.subarray(0, boundary), encoded.subarray(boundary)]).text !== baseline) chunkInvariant = false;
    }
  }
  const unicodeLine = Buffer.from("güvenli tanı satırı\n");
  const unicodeBaseline = frame([unicodeLine]).text;
  for (let boundary = 0; boundary <= unicodeLine.length; boundary += 1) {
    if (frame([unicodeLine.subarray(0, boundary), unicodeLine.subarray(boundary)]).text !== unicodeBaseline) chunkInvariant = false;
  }
  ok("sanitized output is invariant across character and byte splits", chunkInvariant);
  check("production child line bound is explicit", MAX_CHILD_LOG_LINE_CHARS, 1024);

  const emitted = `${stdout.join("")}${stderr.join("")}`;
  ok("status contains no captured child log", !JSON.stringify(sanitizeSupervisorStatus({
    state: "ready", localReady: true, publicReachable: null, startedAt: "x", lastTransitionAt: "x", lastError: null,
    models: { generation: "g", embedding: "e", generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "external", state: "ready", pid: null }, bridge: { ownership: "external", state: "ready", pid: null } },
    vector: { backend: "memory", degraded: false }, childLog: emitted,
  })).includes("ordinary diagnostic"));
}
{
  const fakeServer = new EventEmitter();
  fakeServer.listen = () => queueMicrotask(() => fakeServer.emit("error", Object.assign(new Error("occupied"), { code: "EADDRINUSE" })));
  const result = await listenAjoopBridgeServer(fakeServer, (onListening) => fakeServer.listen(8787, "127.0.0.1", onListening));
  check("bridge EADDRINUSE is structured", result.code, "bridge-bind-conflict");
  check("bridge EADDRINUSE has deterministic exit", result.exitCode, AJOOP_BRIDGE_EXIT_CODES.bindConflict);
  check("other bridge listen error is generic", classifyAjoopBridgeListenError({ code: "EACCES" }).code, "bridge-listen-failed");
}
{
  const pending = deferred();
  let probes = 0;
  const owned = child(9701);
  const occupant = child(9702);
  const h = harness({
    ollama: healthyOllama,
    bridge: () => probes++ === 0 ? { ok: false, kind: "unused" } : pending.promise,
    children: [owned],
  });
  const starting = h.supervisor.start();
  await until(() => h.spawned.length === 1);
  owned.exitCode = AJOOP_BRIDGE_EXIT_CODES.bindConflict;
  owned.emit("exit", AJOOP_BRIDGE_EXIT_CODES.bindConflict, null);
  const result = await starting;
  check("supervisor classifies early bridge bind conflict", result.code, "bridge-bind-conflict");
  check("bridge occupant is never killed", occupant.killCalls.length, 0);
}
{
  const statusFixture = sanitizeSupervisorStatus({
    state: "ready", localReady: true, publicReachable: null, startedAt: "x", lastTransitionAt: "x", lastError: null,
    models: { generation: config.generationModel, embedding: config.embeddingModel, generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "external", state: "ready", pid: null }, bridge: { ownership: "external", state: "ready", pid: null } },
    vector: { backend: "memory", degraded: false },
  });
  let stopRequested = false;
  const control = await acquireControlServer({
    config: { ...testConfig, controlPort: 0 },
    getStatus: () => statusFixture,
    requestStop: () => { stopRequested = true; },
  });
  const base = `http://127.0.0.1:${control.port}`;
  const statusResponse = await fetchBoundedJson(`${base}/status`);
  ok("real control handler returns validated status identity", isAjoopSupervisorStatus(statusResponse.body));
  const stopResponse = await fetchBoundedJson(`${base}/stop`, {
    method: "POST",
    headers: { [AJOOP_RUNTIME_STOP_HEADER.name]: AJOOP_RUNTIME_STOP_HEADER.value },
  });
  ok("real control handler returns validated stop identity", isAjoopSupervisorStopResponse(stopResponse.body));
  await settle();
  check("real control stop handler invokes bounded stop callback", stopRequested, true);
  await control.close();

  const unknownMethods = [];
  const unknown = http.createServer((request, response) => {
    unknownMethods.push(request.method);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true,"service":"unrelated"}');
  });
  await new Promise((resolvePromise) => unknown.listen(0, "127.0.0.1", resolvePromise));
  const unknownPort = unknown.address().port;
  const unknownResponse = await fetchBoundedJson(`http://127.0.0.1:${unknownPort}/status`);
  check("unknown local HTTP occupant fails identity validation", isAjoopSupervisorStatus(unknownResponse.body), false);
  const runCli = async (command) => {
    try {
      return await execFileAsync(process.execPath, [fileURLToPath(new URL("./ajoop-runtime.mjs", import.meta.url)), command], {
        env: { ...process.env, AJOOP_RUNTIME_CONTROL_PORT: String(unknownPort) },
        timeout: 5000,
        maxBuffer: 4096,
        windowsHide: true,
      });
    } catch (error) {
      return { stdout: error.stdout || "", stderr: error.stderr || "", code: error.code };
    }
  };
  const cliStatus = await runCli("status");
  ok("CLI status rejects unknown control identity", cliStatus.stdout.includes("supervisor-identity-mismatch"));
  const cliStop = await runCli("stop");
  ok("CLI stop rejects unknown control identity", cliStop.stdout.includes("supervisor-identity-mismatch"));
  check("CLI stop sends no POST to unknown occupant", unknownMethods.filter((method) => method === "POST").length, 0);
  await new Promise((resolvePromise) => unknown.close(resolvePromise));
}
{
  const response = await probeBridge(config, {
    fetchImpl: async () => ({
      ok: true, status: 200, headers: { get: () => "128" },
      text: async () => JSON.stringify({
        ...AJOOP_BRIDGE_IDENTITY, mode: "rag", ready: true,
        model: "wrong-generation", embedModel: config.embeddingModel,
      }),
    }),
  });
  check("external bridge model mismatch is incompatible", response.kind, "incompatible-bridge");
  const embedResponse = await probeBridge(config, {
    fetchImpl: async () => ({
      ok: true, status: 200, headers: { get: () => "128" },
      text: async () => JSON.stringify({
        ...AJOOP_BRIDGE_IDENTITY, mode: "rag", ready: true,
        model: config.generationModel, embedModel: "wrong-embedding",
      }),
    }),
  });
  check("external bridge embedding mismatch is incompatible", embedResponse.kind, "incompatible-bridge");
  const occupant = child(9799);
  const h = harness({ ollama: healthyOllama, bridge: response });
  const result = await h.supervisor.start();
  check("incompatible external bridge fails structurally", result.code, "external-bridge-incompatible");
  check("incompatible external bridge is not replaced", h.spawned.length, 0);
  check("incompatible external bridge is never killed", occupant.killCalls.length, 0);
}

{
  const configured = resolveRuntimeCommandConfig({
    envFilePath: "injected-.env.local",
    baseEnv: {},
    loadEnvFileImpl: (path, base) => ({
      env: { ...base, AJOOP_RUNTIME_CONTROL_PORT: "18891" },
      loaded: ["AJOOP_RUNTIME_CONTROL_PORT"],
      present: path === "injected-.env.local",
    }),
  });
  check("shared command config loads control port from injected env file", configured.controlPort, 18891);
  const shellWins = resolveRuntimeCommandConfig({
    envFilePath: "injected-.env.local",
    baseEnv: { AJOOP_RUNTIME_CONTROL_PORT: "18892" },
    loadEnvFileImpl: (_path, base) => ({ env: { ...base }, loaded: [], present: true }),
  });
  check("shared command config preserves process environment precedence", shellWins.controlPort, 18892);
}
{
  let sharedStatus = "active-status";
  let activeWrites = 0;
  const active = harness({
    ollama: healthyOllama,
    bridge: externalBridge,
    statusPath: "shared-status.json",
    writeStatus: async (_path, status) => {
      activeWrites += 1;
      sharedStatus = JSON.stringify(status);
    },
  });
  await active.supervisor.start();
  const activeTruth = sharedStatus;
  let losingWrites = 0;
  const refused = createAjoopRuntimeSupervisor({
    config: testConfig,
    statusPath: "shared-status.json",
    acquireControl: async () => ({ ok: false, code: "supervisor-already-running" }),
    writeStatus: async () => {
      losingWrites += 1;
      sharedStatus = "losing-status";
    },
    now: () => "x",
  });
  check("second supervisor returns singleton refusal", (await refused.start()).code, "supervisor-already-running");
  ok("active supervisor produced diagnostic status", activeWrites > 0);
  check("refused supervisor performs zero shared status writes", losingWrites, 0);
  check("refused supervisor preserves active status truth", sharedStatus, activeTruth);
  await active.supervisor.stop();
}
{
  let closed = 0;
  const h = harness({
    ollama: { ok: false, kind: "unavailable" },
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    acquireControl: async () => ({ ok: true, close: async () => { closed += 1; } }),
    spawnOwned: () => { throw new Error("private OLLAMA_SECRET=do-not-leak"); },
  });
  const result = await h.supervisor.start();
  check("synchronous Ollama spawn throw is structured", result.code, "ollama-spawn-failed");
  check("synchronous Ollama spawn throw reaches failed", result.status.state, "failed");
  check("synchronous Ollama spawn throw keeps localReady false", result.status.localReady, false);
  check("synchronous Ollama spawn throw creates no ownership", result.status.components.ollama.ownership, "none");
  check("synchronous Ollama spawn throw closes control listener", closed, 1);
  ok("synchronous Ollama spawn result leaks no raw exception", !JSON.stringify(result).includes("do-not-leak"));
}
{
  let spawnCalls = 0;
  let closed = 0;
  let ollamaProbes = 0;
  const ownedOllama = child(9811);
  const h = harness({
    ollama: () => ollamaProbes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: { ok: false, kind: "unused" },
    locate: { ok: true, path: "ollama.exe" },
    acquireControl: async () => ({ ok: true, close: async () => { closed += 1; } }),
    spawnOwned: () => {
      spawnCalls += 1;
      if (spawnCalls === 1) return ownedOllama;
      throw new Error("private BRIDGE_TOKEN=do-not-leak");
    },
  });
  const result = await h.supervisor.start();
  check("synchronous bridge spawn throw is structured", result.code, "bridge-spawn-failed");
  check("synchronous bridge spawn throw reaches failed", result.status.state, "failed");
  check("synchronous bridge spawn throw creates no bridge ownership", result.status.components.bridge.ownership, "none");
  check("synchronous bridge spawn throw cleans earlier owned Ollama", ownedOllama.killCalls.join(","), "SIGTERM");
  check("synchronous bridge spawn throw does not respawn", spawnCalls, 2);
  check("synchronous bridge spawn throw closes control listener", closed, 1);
  ok("synchronous bridge spawn result leaks no raw exception", !JSON.stringify(result).includes("do-not-leak"));
}
{
  let bridgeProbes = 0;
  const owned = child(9821);
  const h = harness({
    ollama: healthyOllama,
    bridge: () => bridgeProbes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
    children: [owned],
  });
  check("runtime reaches ready before repeated-start failure test", (await h.supervisor.start()).ok, true);
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  await settle();
  const repeated = await h.supervisor.start();
  check("repeated start after child failure is not stale success", repeated.ok, false);
  check("repeated start after child failure reports current code", repeated.code, "bridge-unexpected-exit");
  check("repeated start after child failure remains failed", repeated.status.state, "failed");
  check("repeated start after child failure does not respawn", h.spawned.length, 1);
}
{
  const reset = await fetchBoundedJson("http://127.0.0.1:1", {}, {
    fetchImpl: async () => { throw Object.assign(new Error("reset"), { code: "ECONNRESET" }); },
  });
  check("ECONNRESET is not classified as unused", reset.kind, "connection-reset");
  const bridgeReset = harness({ ollama: healthyOllama, bridge: { ok: false, kind: "connection-reset" } });
  check("bridge reset is treated as occupied", (await bridgeReset.supervisor.start()).code, "bridge-port-occupied");
  check("bridge reset causes no spawn-over", bridgeReset.spawned.length, 0);
  const ollamaReset = harness({ ollama: { ok: false, kind: "connection-reset" }, bridge: externalBridge, locate: { ok: true, path: "ollama.exe" } });
  check("Ollama reset is treated as occupied", (await ollamaReset.supervisor.start()).code, "ollama-port-occupied");
  check("Ollama reset causes no spawn-over", ollamaReset.spawned.length, 0);
}
{
  const firstWrite = deferred();
  const completed = [];
  let calls = 0;
  const h = harness({
    ollama: healthyOllama,
    bridge: externalBridge,
    writeStatus: async (_path, status) => {
      const state = status.state;
      calls += 1;
      if (calls === 1) await firstWrite.promise;
      completed.push(state);
    },
  });
  const starting = h.supervisor.start();
  await until(() => calls === 1);
  const stopping = h.supervisor.stop();
  firstWrite.resolve();
  await Promise.all([starting, stopping]);
  check("status writes complete in transition order", completed.join(","), "starting,stopping,stopped");
  check("serialized status writes leave stopped as final diagnostic", completed.at(-1), "stopped");
}
{
  const statusFixture = sanitizeSupervisorStatus({
    state: "ready", localReady: true, publicReachable: null, startedAt: "x", lastTransitionAt: "x", lastError: null,
    models: { generation: config.generationModel, embedding: config.embeddingModel, generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "external", state: "ready", pid: null }, bridge: { ownership: "external", state: "ready", pid: null } },
    vector: { backend: "memory", degraded: false },
  });
  const control = await acquireControlServer({
    config: { ...testConfig, controlPort: 0 },
    getStatus: () => statusFixture,
    requestStop: () => {},
  });
  const request = ({ path = "/status", host, setHost = false } = {}) => new Promise((resolvePromise, reject) => {
    const outgoing = http.request({ hostname: "127.0.0.1", port: control.port, path, method: "GET", headers: host === undefined ? {} : { Host: host }, setHost }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolvePromise({ status: response.statusCode, body }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
  const validHost = `127.0.0.1:${control.port}`;
  check("valid IPv4 loopback Host is accepted", (await request({ host: validHost })).status, 200);
  check("foreign Host is rejected", (await request({ host: `evil.example:${control.port}` })).status, 421);
  check("wrong control port Host is rejected", (await request({ host: "127.0.0.1:65534" })).status, 421);
  check("malformed Host is rejected deterministically", (await request({ host: "127.0.0.1:not-a-port" })).status, 400);
  check("missing Host is rejected deterministically", (await request()).status, 400);
  check("foreign absolute request target is rejected", (await request({ path: "http://evil.example/status", host: validHost })).status, 400);

  const rawRequest = (payload) => new Promise((resolvePromise, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: control.port }, () => socket.end(payload));
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolvePromise(response));
    socket.on("error", reject);
  });
  const malformed = await rawRequest(`GET http://[ HTTP/1.1\r\nHost: ${validHost}\r\nConnection: close\r\n\r\n`);
  ok("malformed raw request target receives deterministic HTTP 400", malformed.startsWith("HTTP/1.1 400"));
  ok("malformed raw request leaks no exception", !malformed.includes("ERR_INVALID_URL") && !malformed.includes("TypeError"));
  check("control listener survives malformed raw request", (await request({ host: validHost })).status, 200);
  await control.close();
}

{
  const credentialLines = [
    "client_secret=alpha",
    "QDRANT_API_KEY=alpha",
    "X-Api-Key: alpha",
    "id_token=alpha",
    '{"accessToken":"alpha"}',
    '{"refreshToken":"alpha"}',
    "credentials: alpha",
    "https://loopback.test/callback?access_token=alpha",
    "https://loopback.test/callback?token=alpha",
    "http://proxy-user:proxy-password@127.0.0.1:8080",
  ];
  for (const [index, line] of credentialLines.entries()) {
    check(`expanded credential syntax ${index + 1} redacts whole line`, sanitizeChildOutput(line), AJOOP_CHILD_LOG_REDACTED);
  }
  const harmlessLines = [
    "client secret rotation guide loaded",
    "QDRANT API key documentation checked",
    "X Api Key header is supported",
    "id token count is zero",
    "accessToken refresh completed without a value",
    "credentials provider initialized",
    "proxy URL authentication is disabled",
  ];
  for (const [index, line] of harmlessLines.entries()) {
    check(`harmless credential near-miss ${index + 1} remains visible`, sanitizeChildOutput(line), line);
  }
}

/* ===================== A5.2.4 observe-only public reachability ===================== */

const identityBody = (overrides = {}) => ({
  ok: true,
  ready: true,
  mode: "rag",
  model: config.generationModel,
  embedModel: config.embeddingModel,
  chunks: 12,
  ...AJOOP_BRIDGE_IDENTITY,
  ...overrides,
});
const encoder = new TextEncoder();
const jsonResponse = (body, { status = 200, headers = {} } = {}) => new Response(
  typeof body === "string" ? body : JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json", ...headers } },
);
function streamedResponse({ status = 200, headers = {}, chunks = [], endless = false, chunkBytes = 8192, stall = false } = {}) {
  const tracker = { pulls: 0, cancelled: false, enqueuedBytes: 0 };
  const body = new ReadableStream({
    pull(controller) {
      tracker.pulls += 1;
      if (stall) return new Promise(() => {});
      if (endless) {
        const chunk = new Uint8Array(chunkBytes).fill(0x20);
        tracker.enqueuedBytes += chunk.byteLength;
        controller.enqueue(chunk);
        return undefined;
      }
      const next = chunks.shift();
      if (next === undefined) {
        controller.close();
        return undefined;
      }
      const chunk = typeof next === "string" ? encoder.encode(next) : next;
      tracker.enqueuedBytes += chunk.byteLength;
      controller.enqueue(chunk);
      return undefined;
    },
    cancel() {
      tracker.cancelled = true;
    },
  }, { highWaterMark: 0 });
  return { response: new Response(body, { status, headers }), tracker };
}
const publicConfig = Object.freeze({ ...config, publicRequestTimeoutMs: 50 });
const probeWith = async (response, overrides = {}) => {
  const calls = [];
  const result = await probePublicBridge({ ...publicConfig, ...overrides }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return typeof response === "function" ? response(url, init) : response;
    },
  });
  return { result, calls };
};
const listenLoopback = (server) => new Promise((resolvePromise) => {
  server.listen(0, "127.0.0.1", () => resolvePromise(server.address().port));
});
const closeLoopback = (server) => new Promise((resolvePromise) => {
  server.closeAllConnections?.();
  server.close(() => resolvePromise());
});

{
  check("production public health target is fixed", config.publicHealthUrl, "https://ajoop.kaanbalci.com/ajoop-rag");
  check("production public interval is coarse", config.publicProbeIntervalMs, 300000);
  ok("production public timeout is bounded", config.publicRequestTimeoutMs >= 100 && config.publicRequestTimeoutMs <= 10000);
  check("public defaults match resolved config", AJOOP_RUNTIME_DEFAULTS.publicHealthUrl, config.publicHealthUrl);
  const envAttempt = resolveAjoopRuntimeConfig({
    AJOOP_PUBLIC_HEALTH_URL: "http://evil.example/ajoop-rag",
    AJOOP_RUNTIME_PUBLIC_HEALTH_URL: "http://evil.example/ajoop-rag",
  });
  check("environment cannot redirect public target", envAttempt.publicHealthUrl, config.publicHealthUrl);
  check("tunnel observation states are the closed set", AJOOP_TUNNEL_OBSERVATION_STATES.join(","),
    "not-checked,reachable,unreachable,timeout,edge-error,identity-mismatch,malformed");
}
{
  const { result, calls } = await probeWith(jsonResponse(identityBody()));
  check("1 valid public identity is reachable", result.state, "reachable");
  check("1 valid public identity sets publicReachable true", result.reachable, true);
  check("probe requests the configured public target exactly", calls[0]?.url, publicConfig.publicHealthUrl);
  const init = calls[0]?.init || {};
  check("10 probe method is POST", init.method, "POST");
  check("10 probe body is exact health payload", init.body, '{"version":1,"mode":"health"}');
  check("10 probe body has exactly version and mode", Object.keys(JSON.parse(init.body)).sort().join(","), "mode,version");
  const headerNames = Object.keys(init.headers || {}).map((name) => name.toLowerCase());
  check("11 probe sends only Content-Type", headerNames.join(","), "content-type");
  check("11 probe Content-Type is JSON", init.headers?.["Content-Type"], "application/json");
  ok("11 probe sends no Origin", !headerNames.includes("origin"));
  ok("11 probe sends no Authorization", !headerNames.includes("authorization"));
  ok("11 probe sends no Cookie", !headerNames.includes("cookie"));
  ok("11 probe sends no question", !init.body.includes("question"));
  check("probe never follows redirects", init.redirect, "manual");
  check("probe omits ambient credentials", init.credentials, "omit");
  ok("probe carries an abort signal", init.signal instanceof AbortSignal);

  const notReady = await probeWith(jsonResponse(identityBody({ ok: false, ready: false })));
  check("public identity with ready=false is still reachable", notReady.result.state, "reachable");
  check("health readiness is not folded into publicReachable", notReady.result.reachable, true);
  const helperInit = ajoopPublicHealthRequestInit();
  ok("shared request init is a fresh object each call", helperInit !== ajoopPublicHealthRequestInit());
}
{
  const dns = await probeWith(() => {
    throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }) });
  });
  check("2 DNS failure is unreachable", dns.result.state, "unreachable");
  check("2 DNS failure sets publicReachable false", dns.result.reachable, false);
  const refused = await probeWith(async () => {
    throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) });
  });
  check("2 connection refusal is unreachable", refused.result.state, "unreachable");
}
{
  let signal = null;
  const hung = await probeWith((_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  check("3 hung request is timeout", hung.result.state, "timeout");
  check("3 timeout sets publicReachable false", hung.result.reachable, false);
  check("3 timeout aborts the request signal", signal?.aborted, true);
  const stalled = streamedResponse({ stall: true, headers: { "Content-Type": "application/json" } });
  const stalledBody = await probeWith(stalled.response);
  check("3 stalled body read is timeout", stalledBody.result.state, "timeout");
}
{
  const legacyProduction = await probeWith(jsonResponse({
    ok: false, ready: false, mode: "rag", model: config.generationModel, embedModel: config.embeddingModel, chunks: 0, vectorBackend: "memory",
  }));
  check("4 markerless legacy bridge stays identity-mismatch", legacyProduction.result.state, "identity-mismatch");
  check("4 identity mismatch sets publicReachable false", legacyProduction.result.reachable, false);
  const mismatches = [
    ["wrong service", identityBody({ service: "unrelated" })],
    ["wrong protocol", identityBody({ protocolVersion: 2 })],
    ["wrong mode", identityBody({ mode: "health" })],
    ["wrong generation model", identityBody({ model: "other-model" })],
    ["wrong embedding model", identityBody({ embedModel: "other-embedding" })],
    ["non-boolean ready", identityBody({ ready: "yes" })],
    ["unrelated JSON object", { ok: true }],
  ];
  for (const [label, body] of mismatches) {
    check(`4 ${label} is identity-mismatch`, (await probeWith(jsonResponse(body))).result.state, "identity-mismatch");
  }
  check("shared identity predicate rejects arrays", isAjoopBridgeHealthIdentity([identityBody()]), false);
}
{
  const malformedCases = [
    ["HTML body", new Response("<html>challenge</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["invalid JSON", jsonResponse("{")],
    ["JSON array", jsonResponse([identityBody()])],
    ["JSON null", jsonResponse("null")],
    ["invalid UTF-8", new Response(new Uint8Array([0x7b, 0xff, 0x7d]), { status: 200 })],
    ["403 challenge", new Response("<html>blocked</html>", { status: 403, headers: { "Content-Type": "text/html" } })],
    ["404", jsonResponse({ ok: false, error: "not found" }, { status: 404 })],
    ["500", jsonResponse({ ok: false, error: "bridge error" }, { status: 500 })],
    ["declared oversized length", jsonResponse(identityBody(), { headers: { "Content-Length": "999999" } })],
  ];
  for (const [label, response] of malformedCases) {
    const { result } = await probeWith(response);
    check(`5 ${label} is malformed`, result.state, "malformed");
    check(`5 ${label} sets publicReachable false`, result.reachable, false);
  }
}
{
  const endless = streamedResponse({ endless: true, headers: { "Content-Type": "application/json" } });
  check("6 oversized fixture has no Content-Length", endless.response.headers.get("content-length"), null);
  const { result } = await probeWith(endless.response);
  check("6 chunked oversized body is malformed", result.state, "malformed");
  check("6 chunked oversized body sets publicReachable false", result.reachable, false);
  check("6 chunked oversized read is cancelled", endless.tracker.cancelled, true);
  ok("6 chunked oversized read stops near the byte cap",
    endless.tracker.enqueuedBytes <= publicConfig.maxResponseBytes + 2 * 8192);
}
{
  for (const status of [530, 502, 503, 504, 522]) {
    const { result } = await probeWith(new Response("<html>edge</html>", { status, headers: { "Content-Type": "text/html" } }));
    check(`${status === 530 ? 7 : 8} HTTP ${status} is edge-error`, result.state, "edge-error");
    check(`${status === 530 ? 7 : 8} HTTP ${status} sets publicReachable false`, result.reachable, false);
  }
}
{
  for (const status of [301, 302, 307, 308]) {
    const { result, calls } = await probeWith(new Response(null, { status, headers: { Location: "https://evil.example/ajoop-rag" } }));
    check(`9 redirect ${status} is malformed`, result.state, "malformed");
    check(`9 redirect ${status} sets publicReachable false`, result.reachable, false);
    check(`9 redirect ${status} is not followed`, calls.length, 1);
  }
  const opaque = await probeWith({ type: "opaqueredirect", status: 0, headers: new Headers(), body: null });
  check("9 opaque redirect is malformed", opaque.result.state, "malformed");
  const followed = await probeWith({
    status: 200, redirected: true, headers: new Headers(), body: jsonResponse(identityBody()).body,
  });
  check("9 already-redirected identity response is malformed", followed.result.state, "malformed");
}
{
  for (const target of ["http://ajoop.kaanbalci.com/ajoop-rag", "https://user:pass@ajoop.kaanbalci.com/ajoop-rag", "not a url", ""]) {
    const { result, calls } = await probeWith(jsonResponse(identityBody()), { publicHealthUrl: target });
    check(`unsafe public target ${JSON.stringify(target)} is not checked`, result.state, "not-checked");
    check(`unsafe public target ${JSON.stringify(target)} keeps publicReachable null`, result.reachable, null);
    check(`unsafe public target ${JSON.stringify(target)} sends no request`, calls.length, 0);
  }
  check("safe HTTPS target is accepted", safePublicHealthUrl("https://ajoop.kaanbalci.com/ajoop-rag"), "https://ajoop.kaanbalci.com/ajoop-rag");
}
{
  const seen = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      seen.push({ method: request.method, headers: request.headers, body });
      const payload = JSON.stringify(identityBody());
      response.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
      response.end(payload);
    });
  });
  const port = await listenLoopback(server);
  const result = await fetchBoundedRemoteJson(`http://127.0.0.1:${port}/ajoop-rag`, ajoopPublicHealthRequestInit(), {
    timeoutMs: 2000,
    maxBytes: config.maxResponseBytes,
  });
  await closeLoopback(server);
  check("real fetch bounded helper reads identity", result.kind, "response");
  check("real wire request is POST", seen[0]?.method, "POST");
  check("real wire body is exact health payload", seen[0]?.body, '{"version":1,"mode":"health"}');
  check("real wire Content-Type is JSON", seen[0]?.headers["content-type"], "application/json");
  check("real wire carries no Origin", seen[0]?.headers.origin, undefined);
  check("real wire carries no Authorization", seen[0]?.headers.authorization, undefined);
  check("real wire carries no Cookie", seen[0]?.headers.cookie, undefined);
}
{
  const HARD_STOP = 16 * 1024 * 1024;
  let written = 0;
  let clientClosed = false;
  let chunkedWithoutLength = false;
  let resolveClosed;
  const closed = new Promise((resolvePromise) => { resolveClosed = resolvePromise; });
  const server = http.createServer((request, response) => {
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    chunkedWithoutLength = response.getHeader("content-length") === undefined;
    const chunk = Buffer.alloc(8192, 0x20);
    response.on("close", () => {
      clientClosed = written < HARD_STOP;
      resolveClosed();
    });
    const pump = () => {
      while (!response.destroyed && written < HARD_STOP) {
        written += chunk.length;
        if (!response.write(chunk)) {
          response.once("drain", pump);
          return;
        }
      }
      if (!response.destroyed) response.end();
    };
    pump();
  });
  const port = await listenLoopback(server);
  const result = await fetchBoundedRemoteJson(`http://127.0.0.1:${port}/ajoop-rag`, ajoopPublicHealthRequestInit(), {
    timeoutMs: 5000,
    maxBytes: config.maxResponseBytes,
  });
  let guard;
  await Promise.race([closed, new Promise((resolvePromise) => { guard = setTimeout(resolvePromise, 3000); })]);
  clearTimeout(guard);
  await closeLoopback(server);
  check("6 real chunked server sends no Content-Length", chunkedWithoutLength, true);
  check("6 real chunked oversized body is malformed", result.kind, "malformed");
  check("6 real chunked oversized body closes the connection before the server finishes", clientClosed, true);
}
{
  for (const status of [302, 307]) {
    let targetHits = 0;
    const target = http.createServer((request, response) => {
      targetHits += 1;
      request.resume();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(identityBody()));
    });
    const targetPort = await listenLoopback(target);
    const redirector = http.createServer((request, response) => {
      request.resume();
      response.writeHead(status, { Location: `http://127.0.0.1:${targetPort}/ajoop-rag` });
      response.end();
    });
    const port = await listenLoopback(redirector);
    const result = await fetchBoundedRemoteJson(`http://127.0.0.1:${port}/ajoop-rag`, ajoopPublicHealthRequestInit(), { timeoutMs: 2000 });
    await closeLoopback(redirector);
    await closeLoopback(target);
    check(`9 real ${status} redirect is reported`, result.kind, "redirect");
    check(`9 real ${status} redirect target is never contacted`, targetHits, 0);
  }
}
{
  const fresh = harness({ ollama: healthyOllama, bridge: externalBridge });
  check("initial publicReachable is null", fresh.supervisor.status().publicReachable, null);
  check("initial publicCheckedAt is null", fresh.supervisor.status().publicCheckedAt, null);
  check("initial tunnel state is not-checked", fresh.supervisor.status().components.tunnel.state, "not-checked");

  const pending = deferred();
  const scheduler = fakeScheduler();
  const h = harness({ ollama: () => pending.promise, bridge: externalBridge, scheduler, probePublic: { state: "reachable" } });
  const starting = h.supervisor.start();
  await settle();
  check("12 no public probe timer before READY", scheduler.pending(), 0);
  check("12 no public probe call before READY", h.publicCalls.length, 0);
  check("12 starting status keeps publicReachable null", h.supervisor.status().publicReachable, null);
  pending.resolve(healthyOllama);
  const result = await starting;
  check("13 READY returns before any public probe runs", h.publicCalls.length, 0);
  check("13 READY result keeps public observation unknown", result.status.publicReachable, null);
  check("first public probe is armed after READY", scheduler.pending(), 1);
  check("first public probe is armed without delay", scheduler.delays[0], 0);
  await h.supervisor.stop();
}
{
  const scheduler = fakeScheduler({ eager: true });
  const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: () => new Promise(() => {}) });
  const result = await h.supervisor.start();
  check("13 hung public probe does not delay READY", result.status.state, "ready");
  check("13 hung public probe does not delay localReady", result.status.localReady, true);
  await until(() => h.publicCalls.length === 1);
  check("13 hung public probe actually started", h.publicCalls.length, 1);
  check("13 hung public probe leaves runtime ready", h.supervisor.status().state, "ready");
  check("13 hung public probe arms no second probe", scheduler.pending(), 0);
  await h.supervisor.stop();
}
{
  for (const failure of ["unreachable", "timeout", "edge-error", "identity-mismatch", "malformed"]) {
    const scheduler = fakeScheduler();
    const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: { state: failure } });
    await h.supervisor.start();
    const before = h.supervisor.status();
    scheduler.fire();
    await until(() => h.supervisor.status().components.tunnel.state === failure);
    const after = h.supervisor.status();
    check(`14 ${failure}: runtime state remains ready`, after.state, "ready");
    check(`14 ${failure}: localReady remains true`, after.localReady, true);
    check(`14 ${failure}: lastError unchanged`, after.lastError, before.lastError);
    check(`14 ${failure}: publicReachable false`, after.publicReachable, false);
    check(`14 ${failure}: tunnel state recorded`, after.components.tunnel.state, failure);
    ok(`14 ${failure}: publicCheckedAt recorded`, typeof after.publicCheckedAt === "string");
    check(`25 ${failure}: Ollama component unchanged`, JSON.stringify(after.components.ollama), JSON.stringify(before.components.ollama));
    check(`26 ${failure}: bridge component unchanged`, JSON.stringify(after.components.bridge), JSON.stringify(before.components.bridge));
    check(`27 ${failure}: models unchanged`, JSON.stringify(after.models), JSON.stringify(before.models));
    check(`${failure}: next probe uses coarse interval`, scheduler.delays.at(-1), testConfig.publicProbeIntervalMs);
    check(`14 ${failure}: no failed status is persisted`, h.writes.some((entry) => entry.state === "failed"), false);
    await h.supervisor.stop();
  }
  const scheduler = fakeScheduler();
  const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: () => { throw new Error("private probe detail"); } });
  await h.supervisor.start();
  scheduler.fire();
  await until(() => h.supervisor.status().components.tunnel.state === "unreachable");
  check("throwing public probe is unreachable", h.supervisor.status().components.tunnel.state, "unreachable");
  check("throwing public probe keeps runtime ready", h.supervisor.status().state, "ready");
  ok("throwing public probe leaks no detail", !JSON.stringify(h.writes).includes("private probe detail"));
  await h.supervisor.stop();
  const oddScheduler = fakeScheduler();
  const odd = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler: oddScheduler, probePublic: { state: "owned-restart", ownership: "owned", pid: 999 } });
  await odd.supervisor.start();
  oddScheduler.fire();
  await until(() => oddScheduler.pending() === 1);
  check("unknown probe state sanitizes to not-checked", odd.supervisor.status().components.tunnel.state, "not-checked");
  check("unknown probe state keeps publicReachable null", odd.supervisor.status().publicReachable, null);
  check("unknown probe state records no check time", odd.supervisor.status().publicCheckedAt, null);
  check("probe result cannot inject tunnel pid", odd.supervisor.status().components.tunnel.pid, null);
  await odd.supervisor.stop();
}
{
  const scheduler = fakeScheduler();
  const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: { state: "reachable" } });
  await h.supervisor.start();
  scheduler.fire();
  await until(() => h.supervisor.status().publicReachable === true);
  const status = h.supervisor.status();
  check("15 public success keeps localReady true", status.localReady, true);
  check("15 public success sets publicReachable true", status.publicReachable, true);
  check("15 public success records reachable", status.components.tunnel.state, "reachable");
  check("22 reachable tunnel ownership remains external", status.components.tunnel.ownership, "external");
  check("22 reachable tunnel pid remains null", status.components.tunnel.pid, null);
  check("probe receives only the runtime config", h.publicCalls[0], testConfig);
  const serialized = JSON.stringify(status);
  ok("33 status output has no cloudflared paths or credentials",
    !/cloudflared|cert\.pem|credentials|tunnel[_-]?token/i.test(serialized));
  await h.supervisor.stop();
}
{
  const scheduler = fakeScheduler();
  const gates = [];
  const h = harness({
    ollama: healthyOllama,
    bridge: externalBridge,
    scheduler,
    probePublic: () => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    },
  });
  await h.supervisor.start();
  const duplicate = scheduler.peek();
  scheduler.fire();
  duplicate.callback();
  await settle();
  check("16 duplicate timer callback cannot start a second probe", h.publicCalls.length, 1);
  let armedWhileInFlight = false;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    if (cycle > 0) {
      check(`17 cycle ${cycle} has exactly one armed timer`, scheduler.pending(), 1);
      scheduler.fire();
      await settle();
    }
    if (scheduler.pending() !== 0) armedWhileInFlight = true;
    check(`16 cycle ${cycle} has exactly one probe in flight`, h.publicCalls.length, cycle + 1);
    gates[cycle].resolve({ state: cycle === 1 ? "timeout" : "reachable" });
    await until(() => scheduler.pending() === 1);
  }
  ok("17 no timer is armed while a public probe is in flight", !armedWhileInFlight);
  ok("17 re-armed probes use the coarse interval", scheduler.delays.slice(1).every((delay) => delay === testConfig.publicProbeIntervalMs));
  await h.supervisor.stop();
}
{
  const scheduler = fakeScheduler();
  const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: { state: "reachable" } });
  await h.supervisor.start();
  scheduler.fire();
  await until(() => scheduler.pending() === 1);
  check("18 fixture is reachable before stop", h.supervisor.status().publicReachable, true);
  await h.supervisor.stop();
  check("18 stop clears the next public probe", scheduler.pending(), 0);
  ok("18 stop cleared an armed timer", scheduler.cleared.length >= 1);
  check("18 no public probe runs after stop", h.publicCalls.length, 1);
  const stopped = h.supervisor.status();
  check("34 stopped publicReachable is null", stopped.publicReachable, null);
  check("34 stopped publicCheckedAt is null", stopped.publicCheckedAt, null);
  check("34 stopped tunnel state is not-checked", stopped.components.tunnel.state, "not-checked");
  const lastWrite = h.writes.at(-1);
  check("34 final stopped write carries no public observation", `${lastWrite.state}/${lastWrite.publicReachable}/${lastWrite.components.tunnel.state}`, "stopped/null/not-checked");
}
{
  let bridgeProbes = 0;
  const spawnArgs = [];
  const owned = child(9901);
  const scheduler = fakeScheduler();
  const h = harness({
    ollama: healthyOllama,
    bridge: () => bridgeProbes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
    spawnOwned: (executable, args) => {
      spawnArgs.push([executable, ...args].join(" "));
      return owned;
    },
    scheduler,
    probePublic: { state: "reachable" },
  });
  await h.supervisor.start();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    scheduler.fire();
    await until(() => scheduler.pending() === 1);
  }
  check("28 public observation cycles spawn nothing", spawnArgs.length, 1);
  ok("30 no spawn argument names cloudflared", spawnArgs.every((entry) => !/cloudflared/i.test(entry)));
  check("29 public observation cycles signal no child", owned.killCalls.length, 0);
  check("owned bridge remains owned through public cycles", h.supervisor.status().components.bridge.ownership, "owned");
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  await settle();
  check("19 child failure reaches failed", h.supervisor.status().state, "failed");
  check("19 FAILED clears the next public probe", scheduler.pending(), 0);
  check("19 FAILED schedules no later public probe", h.publicCalls.length, 3);
  check("34 failed publicReachable is null", h.supervisor.status().publicReachable, null);
  check("34 failed publicCheckedAt is null", h.supervisor.status().publicCheckedAt, null);
  check("34 failed tunnel state is not-checked", h.supervisor.status().components.tunnel.state, "not-checked");
  await h.supervisor.stop();
}
{
  const scheduler = fakeScheduler();
  const gate = deferred();
  const h = harness({ ollama: healthyOllama, bridge: externalBridge, scheduler, probePublic: () => gate.promise });
  await h.supervisor.start();
  scheduler.fire();
  await settle();
  check("20 public probe is in flight before stop", h.publicCalls.length, 1);
  await h.supervisor.stop();
  const writesAtStop = h.writes.length;
  gate.resolve({ state: "reachable" });
  await settle();
  await settle();
  const status = h.supervisor.status();
  check("20 late public success cannot change stopped state", status.state, "stopped");
  check("20 late public success cannot restore publicReachable", status.publicReachable, null);
  check("20 late public success cannot restore tunnel state", status.components.tunnel.state, "not-checked");
  check("20 late public success cannot set publicCheckedAt", status.publicCheckedAt, null);
  check("20 late public success arms no timer", scheduler.pending(), 0);
  check("20 late public success enqueues no status write", h.writes.length, writesAtStop);
}
{
  let bridgeProbes = 0;
  const owned = child(9911);
  const scheduler = fakeScheduler();
  const gate = deferred();
  const h = harness({
    ollama: healthyOllama,
    bridge: () => bridgeProbes++ === 0 ? { ok: false, kind: "unused" } : externalBridge,
    children: [owned],
    scheduler,
    probePublic: () => gate.promise,
  });
  await h.supervisor.start();
  scheduler.fire();
  await settle();
  owned.exitCode = 1;
  owned.emit("exit", 1, null);
  await settle();
  const writesAtFailure = h.writes.length;
  gate.resolve({ state: "reachable" });
  await settle();
  await settle();
  const status = h.supervisor.status();
  check("21 late public success cannot change failed state", status.state, "failed");
  check("21 late public success cannot restore localReady", status.localReady, false);
  check("21 late public success cannot restore publicReachable", status.publicReachable, null);
  check("21 late public success cannot restore tunnel state", status.components.tunnel.state, "not-checked");
  check("21 failed runtime keeps its own error", status.lastError, "bridge-unexpected-exit");
  check("21 late public success enqueues no status write", h.writes.length, writesAtFailure);
  const failedIndex = h.writes.findIndex((entry) => entry.state === "failed");
  ok("21 no persisted status after failure claims public reachability",
    h.writes.slice(failedIndex).every((entry) => entry.publicReachable === null && entry.components.tunnel.state === "not-checked"));
  await h.supervisor.stop();
}
{
  const shutdownGate = deferred();
  let ollamaProbes = 0;
  const ownedOllama = child(9921, { exitOnKill: false });
  const scheduler = fakeScheduler();
  const h = harness({
    ollama: () => ollamaProbes++ === 0 ? { ok: false, kind: "unavailable" } : healthyOllama,
    bridge: externalBridge,
    locate: { ok: true, path: "ollama.exe" },
    children: [ownedOllama],
    waitImpl: async () => {
      await shutdownGate.promise;
      ownedOllama.exitCode = 0;
    },
    scheduler,
    probePublic: { state: "reachable" },
  });
  await h.supervisor.start();
  scheduler.fire();
  await until(() => h.supervisor.status().publicReachable === true);
  const stopping = h.supervisor.stop();
  await until(() => h.supervisor.status().state === "stopping");
  const during = h.supervisor.status();
  check("34 stopping publicReachable is null", during.publicReachable, null);
  check("34 stopping publicCheckedAt is null", during.publicCheckedAt, null);
  check("34 stopping tunnel state is not-checked", during.components.tunnel.state, "not-checked");
  check("34 stopping clears the next public probe", scheduler.pending(), 0);
  shutdownGate.resolve();
  await stopping;
  check("34 stopping then stopped keeps publicReachable null", h.supervisor.status().publicReachable, null);
}
{
  const base = {
    state: "ready", localReady: true, startedAt: "x", lastTransitionAt: "x", lastError: null,
    models: { generation: config.generationModel, embedding: config.embeddingModel, generationPresent: true, embeddingPresent: true },
    components: { ollama: { ownership: "external", state: "ready", pid: null }, bridge: { ownership: "external", state: "ready", pid: null } },
    vector: { backend: "memory", degraded: false },
  };
  const hostileTunnel = {
    ownership: "owned",
    state: "reachable",
    pid: 999,
    credentialsFile: "C:\\Users\\operator\\.cloudflared\\tunnel.json",
    cert: "cert.pem",
    token: "tunnel-token-fixture",
  };
  const injected = sanitizeSupervisorStatus({
    ...base, publicReachable: true, publicCheckedAt: "2026-09-11T00:00:00Z",
    components: { ...base.components, tunnel: hostileTunnel },
  });
  check("22 sanitizer forces tunnel ownership external", injected.components.tunnel.ownership, "external");
  check("23 injected tunnel pid cannot survive", injected.components.tunnel.pid, null);
  check("23 sanitized tunnel has only allowlisted fields", Object.keys(injected.components.tunnel).join(","), "ownership,state,pid");
  ok("33 injected tunnel credential paths cannot survive",
    !/\.cloudflared|cert\.pem|tunnel-token-fixture|credentials/i.test(JSON.stringify(injected)));
  const unknown = sanitizeSupervisorStatus({
    ...base, publicReachable: true, publicCheckedAt: "2026-09-11T00:00:00Z",
    components: { ...base.components, tunnel: { ownership: "owned", state: "restarting", pid: 4242 } },
  });
  check("24 unknown tunnel state sanitizes to not-checked", unknown.components.tunnel.state, "not-checked");
  check("24 unknown tunnel state cannot carry publicReachable true", unknown.publicReachable, null);
  check("24 unknown tunnel state cannot carry publicCheckedAt", unknown.publicCheckedAt, null);
  for (const nonReady of [
    { state: "failed", localReady: false },
    { state: "stopping", localReady: false },
    { state: "stopped", localReady: false },
    { state: "ready", localReady: false },
  ]) {
    const stale = sanitizeSupervisorStatus({
      ...base, ...nonReady, publicReachable: true, publicCheckedAt: "2026-09-11T00:00:00Z",
      components: { ...base.components, tunnel: { ownership: "external", state: "reachable", pid: null } },
    });
    const label = `${nonReady.state}/${nonReady.localReady}`;
    check(`34 ${label} sanitizes publicReachable to null`, stale.publicReachable, null);
    check(`34 ${label} sanitizes publicCheckedAt to null`, stale.publicCheckedAt, null);
    check(`34 ${label} sanitizes tunnel to not-checked`, stale.components.tunnel.state, "not-checked");
  }
  const noTunnel = sanitizeSupervisorStatus({ ...base, publicReachable: true });
  check("publicReachable input alone cannot claim reachability", noTunnel.publicReachable, null);
  for (const state of AJOOP_TUNNEL_OBSERVATION_STATES) {
    check(`allowed tunnel state ${state} survives sanitizer`, sanitizeTunnelObservationState(state), state);
  }
  check("tunnel state sanitizer rejects non-strings", sanitizeTunnelObservationState({ toString: () => "reachable" }), "not-checked");
  ok("sanitized status schema remains version 1", isAjoopSupervisorStatus(injected));
}
{
  const probeSource = await readFile(fileURLToPath(new URL("../server/ajoop-runtime-probes.mjs", import.meta.url)), "utf8");
  const supervisorSource = await readFile(fileURLToPath(new URL("../server/ajoop-runtime-supervisor.mjs", import.meta.url)), "utf8");
  const importsOf = (source) => [...source.matchAll(/^import\s[\s\S]*?\sfrom\s+["']([^"']+)["'];/gm)]
    .map((match) => match[1]).sort().join(",");
  check("32 runtime probes import set is unchanged", importsOf(probeSource), "./ajoop-rag.mjs,node:child_process,node:util");
  check("32 runtime supervisor import set is unchanged", importsOf(supervisorSource),
    "./ajoop-runtime-probes.mjs,node:child_process,node:fs/promises,node:http,node:path,node:string_decoder,node:url");
  ok("32 runtime modules import no connector, provider, agent or tool module",
    !/connector|provider|agent|tool|gmail|calendar|drive|github/i.test(`${importsOf(probeSource)},${importsOf(supervisorSource)}`));
  const lifecycleWords = /cloudflared|schtasks|scheduledtask|taskkill|tasklist|wmic|get-process|cert\.pem/i;
  ok("30/31 runtime probes contain no tunnel process or Scheduled Task primitive", !lifecycleWords.test(probeSource));
  ok("30/31 runtime supervisor contains no tunnel process or Scheduled Task primitive", !lifecycleWords.test(supervisorSource));
  const publicCode = [probePublicBridge, fetchBoundedRemoteJson, safePublicHealthUrl, ajoopPublicHealthRequestInit]
    .map((fn) => fn.toString()).join("\n");
  ok("28/29/31 public probe code has no spawn, kill, exec or process access", !/spawn|kill|exec|child_process|process\./.test(publicCode));
  const observationStart = supervisorSource.indexOf("PUBLIC OBSERVATION");
  const observationCode = supervisorSource.slice(observationStart, supervisorSource.indexOf("const transition", observationStart));
  ok("observation block is located", observationStart > 0 && observationCode.length > 200);
  ok("28/29 supervisor observation block has no spawn, kill or exec", !/spawn|kill|exec/i.test(observationCode));
}

check("QA performed zero non-loopback network requests", blockedFetchHosts.length, 0);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Ajoop runtime supervisor hardening passed. ${passed} assertions · hermetic probes · loopback test socket only · no Ollama, no bridge.`);
}
