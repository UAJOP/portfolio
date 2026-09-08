#!/usr/bin/env node
/**
 * AJOOP local stage latency profiler.
 *
 * Runs the real local RAG + bounded agent stack in-process and measures coarse
 * transport stages plus Ollama's own numeric timing counters. It does not
 * change production routing, persist prompts, or print questions/answers/URLs,
 * secrets, tool arguments or tool results.
 *
 * Usage:
 *   node scripts/ajoop-latency-profile.mjs
 *   node scripts/ajoop-latency-profile.mjs --runs=5
 *   AJOOP_ENV_FILE=/path/to/.env.local node scripts/ajoop-latency-profile.mjs
 */
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAjoopRag } from "../server/ajoop-rag.mjs";
import { AJOOP_AGENT_MODES, createAjoopAgent } from "../server/ajoop-agent.mjs";
import { createToolRegistry } from "../server/ajoop-tool-registry.mjs";
import { PORTFOLIO_TOOL_DEFINITIONS } from "../server/ajoop-portfolio-tools.mjs";
import { loadEnvFile } from "../server/ajoop-env-file.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://kaanbalci.com";
const RUNS = Math.max(
  1,
  Math.min(
    20,
    Number.parseInt(
      process.argv.find((arg) => arg.startsWith("--runs="))?.slice("--runs=".length) || "3",
      10,
    ) || 3,
  ),
);

const envFile = process.env.AJOOP_ENV_FILE ? resolve(process.env.AJOOP_ENV_FILE) : resolve(ROOT, ".env.local");
const { env: fileEnv } = loadEnvFile(envFile, process.env);
const env = {
  ...fileEnv,
  AJOOP_AI_ALLOWED_ORIGINS: fileEnv.AJOOP_AI_ALLOWED_ORIGINS || ORIGIN,
  AJOOP_AI_MODEL: fileEnv.AJOOP_AI_MODEL || "qwen3:4b-instruct",
  AJOOP_AI_TEMPERATURE: fileEnv.AJOOP_AI_TEMPERATURE || "0",
  AJOOP_AI_TIMEOUT_MS: fileEnv.AJOOP_AI_TIMEOUT_MS || "15000",
  AJOOP_AGENT_MODE: AJOOP_AGENT_MODES.ON,
};

const TESTS = Object.freeze([
  Object.freeze({ id: "EXACT_FACT", question: "What is Kaan's GitHub?", locale: "en" }),
  Object.freeze({ id: "GENERAL", question: "What is artificial intelligence?", locale: "en" }),
  Object.freeze({ id: "PORTFOLIO", question: "What did Kaan do at CBOT?", locale: "en" }),
]);

const STAGES = Object.freeze(["planner", "embedding", "qdrant", "generation"]);
const OLLAMA_STAGES = new Set(["planner", "embedding", "generation"]);
let activeSample = null;

const blankStages = () => Object.fromEntries(STAGES.map((stage) => [stage, []]));
const blankNative = () => Object.fromEntries(
  [...OLLAMA_STAGES].map((stage) => [stage, []]),
);

function classifyFetch(url, options = {}) {
  const target = String(url || "");
  if (target.endsWith("/api/embed") || target.endsWith("/api/embeddings")) return "embedding";
  if (target.endsWith("/api/chat")) {
    try {
      const body = typeof options.body === "string" ? JSON.parse(options.body) : null;
      return Array.isArray(body?.tools) && body.tools.length ? "planner" : "generation";
    } catch {
      return "generation";
    }
  }
  if (/\/points\/search(?:\?|$)/.test(target)) return "qdrant";
  return null;
}

const nsToMs = (value) => Number.isFinite(Number(value)) ? Number(value) / 1_000_000 : 0;

function nativeMetric(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return Object.freeze({
    totalMs: nsToMs(payload.total_duration),
    loadMs: nsToMs(payload.load_duration),
    promptMs: nsToMs(payload.prompt_eval_duration),
    evalMs: nsToMs(payload.eval_duration),
    promptTokens: Number(payload.prompt_eval_count) || 0,
    evalTokens: Number(payload.eval_count) || 0,
  });
}

async function timedFetch(url, options = {}) {
  if (typeof fetch !== "function") throw new TypeError("fetch unavailable");
  const stage = classifyFetch(url, options);
  const sample = activeSample;
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, options);
    if (sample && stage && OLLAMA_STAGES.has(stage) && response?.ok && typeof response.clone === "function") {
      try {
        const payload = await response.clone().json();
        const metric = nativeMetric(payload);
        if (metric) sample.native[stage].push(metric);
      } catch {
        /* Native counters are diagnostics only; transport timing still stands. */
      }
    }
    return response;
  } finally {
    if (sample && stage) sample.stages[stage].push(performance.now() - started);
  }
}

const registry = createToolRegistry(PORTFOLIO_TOOL_DEFINITIONS);
const rag = createAjoopRag({ env, fetchImpl: timedFetch });
const agent = createAjoopAgent({ rag, registry, env, fetchImpl: timedFetch });

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

const round = (value) => Math.round(Number(value) || 0);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const sumMetric = (entries, key) => entries.reduce((total, entry) => total + (Number(entry?.[key]) || 0), 0);

function summarizeNative(samples, stage) {
  const keys = ["totalMs", "loadMs", "promptMs", "evalMs", "promptTokens", "evalTokens"];
  const perRun = Object.fromEntries(
    keys.map((key) => [key, samples.map((sample) => sumMetric(sample.native[stage], key))]),
  );
  return Object.fromEntries(
    keys.map((key) => [key, {
      p50: round(quantile(perRun[key], 0.5)),
      p95: round(quantile(perRun[key], 0.95)),
    }]),
  );
}

function summarize(samples) {
  const total = samples.map((sample) => sample.totalMs);
  const stageTotals = Object.fromEntries(
    STAGES.map((stage) => [stage, samples.map((sample) => sum(sample.stages[stage]))]),
  );
  const measured = samples.map((sample) => STAGES.reduce((value, stage) => value + sum(sample.stages[stage]), 0));
  const other = total.map((value, index) => Math.max(0, value - measured[index]));
  return {
    runs: samples.length,
    total: { p50: round(quantile(total, 0.5)), p95: round(quantile(total, 0.95)) },
    stages: Object.fromEntries(
      STAGES.map((stage) => [stage, {
        p50: round(quantile(stageTotals[stage], 0.5)),
        p95: round(quantile(stageTotals[stage], 0.95)),
        calls: samples.reduce((count, sample) => count + sample.stages[stage].length, 0),
      }]),
    ),
    native: Object.fromEntries([...OLLAMA_STAGES].map((stage) => [stage, summarizeNative(samples, stage)])),
    other: { p50: round(quantile(other, 0.5)), p95: round(quantile(other, 0.95)) },
  };
}

function printNative(label, value) {
  if (!value) return;
  console.log(
    `${label.padEnd(11)}prompt ${value.promptMs.p50}ms · decode ${value.evalMs.p50}ms · ` +
      `promptTok ${value.promptTokens.p50} · evalTok ${value.evalTokens.p50}`,
  );
}

function printSummary(id, summary) {
  console.log(`\n${id}`);
  console.log(`runs        ${summary.runs}`);
  console.log(`total       p50 ${summary.total.p50}ms · p95 ${summary.total.p95}ms`);
  for (const stage of STAGES) {
    const value = summary.stages[stage];
    console.log(`${stage.padEnd(11)}p50 ${value.p50}ms · p95 ${value.p95}ms · calls ${value.calls}`);
  }
  console.log(`other       p50 ${summary.other.p50}ms · p95 ${summary.other.p95}ms`);
  printNative("planner llm", summary.native.planner);
  printNative("embed llm", summary.native.embedding);
  printNative("generate llm", summary.native.generation);
}

console.log("AJOOP stage latency profiler");
console.log(`runs/case   ${RUNS}`);
console.log("privacy     only aggregate numeric timings/token counts are printed; no content or secrets");

const init = await rag.initialize();
if (!init?.ready) {
  console.error("AJOOP profiler: RAG initialization unavailable");
  process.exit(1);
}
const plannerWarm = await agent.prewarm();
if (plannerWarm !== "ready" && plannerWarm !== "skipped") {
  console.error("AJOOP profiler: planner prewarm unavailable");
  process.exit(1);
}

const buckets = new Map(TESTS.map((test) => [test.id, []]));

for (let run = 0; run < RUNS; run += 1) {
  for (const test of TESTS) {
    const sample = { totalMs: 0, stages: blankStages(), native: blankNative() };
    activeSample = sample;
    const started = performance.now();
    let result;
    try {
      result = await agent.handle({
        method: "POST",
        origin: ORIGIN,
        contentType: "application/json",
        body: JSON.stringify({
          version: 1,
          mode: "rag",
          question: test.question,
          locale: test.locale,
          history: [],
        }),
      });
    } finally {
      sample.totalMs = performance.now() - started;
      activeSample = null;
    }
    if (result?.status !== 200 || !result?.body?.ok) {
      console.error(`AJOOP profiler: ${test.id} sample failed`);
      process.exit(1);
    }
    buckets.get(test.id).push(sample);
  }
}

for (const test of TESTS) printSummary(test.id, summarize(buckets.get(test.id)));

console.log("\nPROFILE_COMPLETE");
