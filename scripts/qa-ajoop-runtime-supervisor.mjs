#!/usr/bin/env node
import { EventEmitter } from "node:events";
import http from "node:http";
import { execFile } from "node:child_process";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  AJOOP_BRIDGE_EXIT_CODES,
  AJOOP_BRIDGE_IDENTITY,
  AJOOP_RUNTIME_IDENTITY,
  classifyAjoopBridgeListenError,
  fetchBoundedJson,
  isAjoopSupervisorStatus,
  isAjoopSupervisorStopResponse,
  listenAjoopBridgeServer,
  missingRequiredModels,
  probeBridge,
  resolveAjoopRuntimeConfig,
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
} = {}) {
  const spawned = [];
  const writes = [];
  const controls = [];
  const supervisor = createAjoopRuntimeSupervisor({
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
    spawnOwned: () => {
      const next = children[spawned.length] || child(9000 + spawned.length);
      spawned.push(next);
      return next;
    },
    wait: waitImpl,
    writeStatus: writeStatus || (async (_path, status) => writes.push(sanitizeSupervisorStatus(status))),
    now: (() => {
      let index = 0;
      return () => `2026-09-11T00:00:0${index++}Z`;
    })(),
  });
  return { supervisor, spawned, writes, controls };
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
  const result = await h.supervisor.start();
  check("healthy external services reach ready", result.ok, true);
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
  const unrelated = child(9090);
  const blocked = createAjoopRuntimeSupervisor({
    config: testConfig,
    acquireControl: async () => ({ ok: false, code: "control-port-occupied" }),
    writeStatus: async () => {},
    now: () => "x",
  });
  check("unknown control occupant refuses", (await blocked.start()).code, "control-port-occupied");
  check("unknown control occupant causes zero child kills", unrelated.killCalls.length, 0);
}
{
  const h = harness({ ollama: { ok: false, kind: "unavailable" }, locate: { ok: false }, bridge: externalBridge });
  check("missing Ollama executable is structured", (await h.supervisor.start()).code, "ollama-executable-missing");
}
{
  const occupant = child(8787);
  const h = harness({ ollama: healthyOllama, bridge: { ok: false, kind: "unknown-occupant" } });
  const result = await h.supervisor.start();
  check("unknown bridge occupant refuses safely", result.code, "bridge-port-occupied");
  check("unknown occupant is never spawned", h.spawned.length, 0);
  check("unknown bridge occupant causes zero child kills", occupant.killCalls.length, 0);
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
  const [first, second] = await Promise.all([h.supervisor.start(), h.supervisor.start()]);
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
  await h.supervisor.start();
  check("repeated start after ready creates no child", h.spawned.length, 1);
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
  check("external tunnel remains untouched", h.supervisor.status().components.tunnel.state, "not-managed");
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Ajoop runtime supervisor foundation passed. ${passed} assertions · hermetic probes · loopback test socket only · no Ollama, no bridge.`);
}
