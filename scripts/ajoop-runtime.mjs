#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../server/ajoop-env-file.mjs";
import {
  AJOOP_RUNTIME_STOP_HEADER,
  createAjoopRuntimeSupervisor,
} from "../server/ajoop-runtime-supervisor.mjs";
import {
  fetchBoundedJson,
  isAjoopSupervisorStatus,
  isAjoopSupervisorStopResponse,
  resolveAjoopRuntimeConfig,
} from "../server/ajoop-runtime-probes.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const command = process.argv[2] || "status";
const envPath = resolve(rootDir, ".env.local");

function runtimeEnv() {
  return loadEnvFile(envPath, process.env).env;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function clientRequest(path, options = {}) {
  const config = resolveAjoopRuntimeConfig(process.env);
  return fetchBoundedJson(`http://${config.controlHost}:${config.controlPort}${path}`, options, {
    timeoutMs: config.requestTimeoutMs,
    maxBytes: config.maxResponseBytes,
  });
}

async function run() {
  if (command === "status") {
    const result = await clientRequest("/status");
    if (!result.ok) {
      print({ ok: false, code: "supervisor-unavailable" });
      process.exitCode = 1;
      return;
    }
    if (!isAjoopSupervisorStatus(result.body)) {
      print({ ok: false, code: "supervisor-identity-mismatch" });
      process.exitCode = 1;
      return;
    }
    print(result.body);
    return;
  }
  if (command === "stop") {
    const identity = await clientRequest("/status");
    if (!identity.ok || !isAjoopSupervisorStatus(identity.body)) {
      print({
        ok: false,
        code: identity.ok ? "supervisor-identity-mismatch" : "supervisor-unavailable",
      });
      process.exitCode = 1;
      return;
    }
    const result = await clientRequest("/stop", {
      method: "POST",
      headers: { [AJOOP_RUNTIME_STOP_HEADER.name]: AJOOP_RUNTIME_STOP_HEADER.value },
    });
    const accepted = result.ok && isAjoopSupervisorStopResponse(result.body);
    print(accepted ? result.body : {
      ok: false,
      code: result.ok ? "supervisor-identity-mismatch" : "supervisor-unavailable",
    });
    if (!accepted) process.exitCode = 1;
    return;
  }
  if (command !== "start") {
    print({ ok: false, code: "usage", commands: ["start", "status", "stop"] });
    process.exitCode = 2;
    return;
  }

  const supervisor = createAjoopRuntimeSupervisor({ env: runtimeEnv(), rootDir });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await supervisor.signalStop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const result = await supervisor.start();
  print(result.ok ? result.status : result);
  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  await new Promise(() => {});
}

run().catch(() => {
  print({ ok: false, code: "runtime-supervisor-failed" });
  process.exitCode = 1;
});
