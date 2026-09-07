#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.env.AJOOP_TELEMETRY_PATH
  ? resolve(process.env.AJOOP_TELEMETRY_PATH)
  : resolve(ROOT, ".ajoop-runtime", "telemetry.json");

const pct = (part, total) => total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
const ms = (value) => `${Math.round(Number(value) || 0)}ms`;

let snapshot;
try {
  snapshot = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(`Ajoop telemetry unavailable: ${file}`);
  console.error("Start the bridge and handle at least one request first.");
  process.exitCode = 1;
  process.exit();
}

const requests = snapshot.requests || {};
const latency = snapshot.latencyMs || {};
const tools = snapshot.tools || {};
const agent = snapshot.agent || {};
const rag = snapshot.rag || {};
const total = Number(requests.total) || 0;
const fallbacks = Number(requests.fallbacks) || 0;
const repairs = Number(requests.repairs) || 0;
const serverErrors = Number(requests.byStatus?.["5xx"]) || 0;

console.log("AJOOP runtime telemetry");
console.log(`updated      ${snapshot.updatedAt || "unknown"}`);
console.log(`uptime       ${Math.round((Number(snapshot.uptimeMs) || 0) / 1000)}s`);
console.log(`requests     ${total}`);
console.log(`latency      p50 ${ms(latency.p50)} · p95 ${ms(latency.p95)} · last ${ms(latency.last)}`);
console.log(`fallbacks    ${fallbacks} (${pct(fallbacks, total)})`);
console.log(`repairs      ${repairs} (${pct(repairs, total)})`);
console.log(`5xx          ${serverErrors} (${pct(serverErrors, total)})`);
console.log(`tools        ${tools.observed || 0} observed · ${tools.attributable || 0} attributable · ${tools.errors || 0} error(s)`);
console.log(`planner      ${agent.planner_attempts || 0} attempt(s) · ${agent.planner_failures || 0} failure(s)`);
console.log(`rag          ${rag.ready ? "ready" : "unavailable"} · ${rag.vectorBackend || "unknown"} · ${rag.chunks || 0} chunks`);
