#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AJOOP_TELEMETRY_VERSION,
  createAjoopTelemetry,
  createAjoopTelemetryWriter,
  observeAjoopHandlerResult,
} from "../server/ajoop-telemetry.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, value) => check(label, Boolean(value), true);

let clock = 1_800_000_000_000;
const telemetry = createAjoopTelemetry({ now: () => clock, recentLimit: 16 });

const result = {
  status: 200,
  body: {
    ok: true,
    scope: "portfolio",
    answerMode: "portfolio-fact",
    generationAttempts: 1,
    fallbackUsed: false,
    repaired: false,
    exactFact: null,
    sources: [{ id: 1 }, { id: 2 }],
    evidence: [{ id: 1 }],
    answer: "SECRET ANSWER THAT MUST NEVER ENTER TELEMETRY",
    question: "SECRET QUESTION",
  },
  internal: {
    observedToolEvents: [
      { status: "success", tool: "secret.tool", arguments: { secret: true } },
      { status: "invalid-arguments", tool: "secret.tool", arguments: { secret: true } },
      { status: "timeout", tool: "secret.tool", result: "secret" },
    ],
    toolEvents: [{ status: "success", tool: "secret.tool" }],
    trustedToolContextChars: 1234,
  },
};

telemetry.record(observeAjoopHandlerResult({ route: "ajoop-rag", status: 200, latencyMs: 100, result }));
clock += 100;
telemetry.record({
  route: "ajoop-rag",
  status: 503,
  latencyMs: 300,
  scope: "general",
  answerMode: "general",
  generationAttempts: 2,
  fallbackUsed: true,
  repaired: true,
  exactFact: "contact:github",
  sourceCount: 1,
  evidenceCount: 1,
});
clock += 100;
telemetry.record({ route: "sinama", status: 200, latencyMs: 200, scope: "unknown", answerMode: "unknown" });

const snapshot = telemetry.snapshot({
  agentMetrics: {
    planner_attempts: 5,
    tool_attempts: 3,
    tool_success: 1,
    secret: "must not survive",
  },
  ragStatus: {
    ready: true,
    chunks: 191,
    embedModel: "qwen3-embedding:0.6b",
    vectorBackend: "qdrant",
    vectorBackendRequested: "qdrant",
    secretUrl: "https://secret.invalid",
  },
  bridgeStats: { active: 1, secret: "no" },
});

check("schema version", snapshot.version, AJOOP_TELEMETRY_VERSION);
check("request total", snapshot.requests.total, 3);
check("route count", snapshot.requests.byRoute["ajoop-rag"], 2);
check("status 2xx", snapshot.requests.byStatus["2xx"], 2);
check("status 5xx", snapshot.requests.byStatus["5xx"], 1);
check("portfolio count", snapshot.requests.byScope.portfolio, 1);
check("general count", snapshot.requests.byScope.general, 1);
check("generation attempts sum", snapshot.requests.generationAttempts, 3);
check("fallback count", snapshot.requests.fallbacks, 1);
check("repair count", snapshot.requests.repairs, 1);
check("exact fact count", snapshot.requests.exactFacts, 1);
check("source count", snapshot.requests.sources, 3);
check("evidence count", snapshot.requests.evidence, 2);
check("latency p50", snapshot.latencyMs.p50, 200);
check("latency p95", snapshot.latencyMs.p95, 300);
check("observed tools", snapshot.tools.observed, 3);
check("attributable tools", snapshot.tools.attributable, 1);
check("tool success", snapshot.tools.success, 1);
check("tool rejected", snapshot.tools.rejected, 1);
check("tool errors", snapshot.tools.errors, 1);
check("agent allowlist", snapshot.agent.planner_attempts, 5);
check("rag ready", snapshot.rag.ready, true);
check("rag chunks", snapshot.rag.chunks, 191);
check("bridge active", snapshot.bridge.active, 1);

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  "SECRET QUESTION",
  "SECRET ANSWER",
  "secret.tool",
  "secretUrl",
  "must not survive",
  "trustedToolContextChars",
]) {
  ok(`snapshot excludes ${forbidden}`, !serialized.includes(forbidden));
}

const dir = await mkdtemp(join(tmpdir(), "ajoop-telemetry-"));
try {
  const path = join(dir, "telemetry.json");
  const writer = createAjoopTelemetryWriter({ filePath: path });
  await writer.write(snapshot);
  await writer.flush();
  const parsed = JSON.parse(await readFile(path, "utf8"));
  check("writer preserves schema", parsed.version, AJOOP_TELEMETRY_VERSION);
  check("writer preserves request total", parsed.requests.total, 3);
} finally {
  await rm(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`Ajoop telemetry QA failed (${failures.length} failure(s), ${passed} pass(es))`);
  failures.forEach((failure) => console.error(`\n${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Ajoop telemetry QA passed — ${passed} assertions`);
}
