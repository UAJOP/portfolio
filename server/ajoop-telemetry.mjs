import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const AJOOP_TELEMETRY_VERSION = 1;
export const AJOOP_TELEMETRY_RECENT_LIMIT = 128;

const ROUTES = new Set(["ajoop-rag", "sinama", "legacy", "unknown"]);
const SCOPES = new Set(["general", "portfolio", "unknown"]);
const TOOL_STATUSES = new Set(["success", "rejected", "error"]);

const safeInt = (value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

const safeNumber = (value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

const safeKey = (value, fallback = "unknown", max = 64) => {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text || text.length > max || !/^[a-z0-9._:-]+$/.test(text)) return fallback;
  return text;
};

const increment = (table, key, amount = 1) => {
  table[key] = safeInt(table[key]) + amount;
};

const rounded = (value) => Math.round(safeNumber(value) * 10) / 10;

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percent / 100) * sorted.length));
  return rounded(sorted[Math.min(sorted.length - 1, rank - 1)]);
}

function latencySummary(values) {
  if (!values.length) {
    return Object.freeze({ count: 0, last: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 });
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    count: values.length,
    last: rounded(values.at(-1)),
    min: rounded(Math.min(...values)),
    max: rounded(Math.max(...values)),
    mean: rounded(total / values.length),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  });
}

function sanitizeAgentMetrics(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const allowed = [
    "planner_attempts",
    "planner_no_tool",
    "planner_failures",
    "planner_malformed",
    "tool_attempts",
    "tool_success",
    "tool_rejected",
    "tool_errors",
    "agent_fallbacks",
    "turns_planned",
    "turns_skipped",
  ];
  return Object.freeze(Object.fromEntries(allowed.map((key) => [key, safeInt(source[key])])));
}

function sanitizeRagStatus(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.freeze({
    ready: source.ready === true,
    chunks: safeInt(source.chunks),
    embedModel: safeKey(source.embedModel, "unknown"),
    vectorBackend: safeKey(source.vectorBackend, "unknown"),
    vectorBackendRequested: safeKey(source.vectorBackendRequested, "unknown"),
    active: safeInt(source.active),
  });
}

function sanitizeBridgeStats(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.freeze({ active: safeInt(source.active) });
}

function statusClass(status) {
  const code = safeInt(status, { min: 100, max: 599, fallback: 0 });
  if (!code) return "unknown";
  return `${Math.floor(code / 100)}xx`;
}

function eventStatus(event) {
  const raw = safeKey(event?.status, "unknown", 32);
  if (raw === "success") return "success";
  if (["unknown-tool", "invalid-arguments", "scope-denied", "budget-exhausted", "rejected"].includes(raw)) {
    return "rejected";
  }
  if (raw !== "unknown") return "error";
  return "unknown";
}

/**
 * Sanitized, aggregate runtime telemetry for the personal Ajoop process.
 *
 * Deliberately has no parameter for a question, answer, origin, tool arguments,
 * tool results or conversation. Callers can pass extra fields; they are ignored.
 */
export function createAjoopTelemetry({
  now = () => Date.now(),
  startedAt = null,
  recentLimit = AJOOP_TELEMETRY_RECENT_LIMIT,
} = {}) {
  const startedAtMs = Number.isFinite(startedAt) ? Number(startedAt) : Number(now());
  const limit = Math.max(
    16,
    Math.min(
      safeInt(recentLimit, { min: 1, max: 2048, fallback: AJOOP_TELEMETRY_RECENT_LIMIT }),
      2048,
    ),
  );
  const latencyValues = [];
  const counters = {
    total: 0,
    byRoute: {},
    byStatus: {},
    byScope: {},
    byAnswerMode: {},
    generationAttempts: 0,
    fallbacks: 0,
    repairs: 0,
    exactFacts: 0,
    sources: 0,
    evidence: 0,
  };
  const tools = { observed: 0, attributable: 0, success: 0, rejected: 0, errors: 0 };

  const record = ({
    route,
    status,
    latencyMs,
    scope,
    answerMode,
    generationAttempts,
    fallbackUsed,
    repaired,
    exactFact,
    sourceCount,
    evidenceCount,
    observedToolEvents,
    toolEvents,
  } = {}) => {
    const routeKey = ROUTES.has(route) ? route : "unknown";
    const scopeKey = SCOPES.has(scope) ? scope : "unknown";
    const modeKey = safeKey(answerMode, "unknown");
    const latency = safeNumber(latencyMs, { max: 600_000 });

    counters.total += 1;
    increment(counters.byRoute, routeKey);
    increment(counters.byStatus, statusClass(status));
    increment(counters.byScope, scopeKey);
    increment(counters.byAnswerMode, modeKey);
    counters.generationAttempts += safeInt(generationAttempts, { max: 8 });
    counters.fallbacks += fallbackUsed === true ? 1 : 0;
    counters.repairs += repaired === true ? 1 : 0;
    counters.exactFacts += typeof exactFact === "string" && exactFact.length > 0 ? 1 : 0;
    counters.sources += safeInt(sourceCount, { max: 100 });
    counters.evidence += safeInt(evidenceCount, { max: 100 });

    latencyValues.push(latency);
    if (latencyValues.length > limit) latencyValues.splice(0, latencyValues.length - limit);

    const observed = Array.isArray(observedToolEvents) ? observedToolEvents : [];
    const attributable = Array.isArray(toolEvents) ? toolEvents : [];
    tools.observed += observed.length;
    tools.attributable += attributable.length;
    for (const event of observed) {
      const classification = eventStatus(event);
      if (!TOOL_STATUSES.has(classification)) continue;
      if (classification === "success") tools.success += 1;
      else if (classification === "rejected") tools.rejected += 1;
      else tools.errors += 1;
    }
  };

  const snapshot = ({ agentMetrics = {}, ragStatus = {}, bridgeStats = {} } = {}) => {
    const nowMs = Number(now());
    return Object.freeze({
      version: AJOOP_TELEMETRY_VERSION,
      startedAt: new Date(startedAtMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      uptimeMs: Math.max(0, Math.round(nowMs - startedAtMs)),
      requests: Object.freeze({
        total: counters.total,
        byRoute: Object.freeze({ ...counters.byRoute }),
        byStatus: Object.freeze({ ...counters.byStatus }),
        byScope: Object.freeze({ ...counters.byScope }),
        byAnswerMode: Object.freeze({ ...counters.byAnswerMode }),
        generationAttempts: counters.generationAttempts,
        fallbacks: counters.fallbacks,
        repairs: counters.repairs,
        exactFacts: counters.exactFacts,
        sources: counters.sources,
        evidence: counters.evidence,
      }),
      latencyMs: latencySummary(latencyValues),
      tools: Object.freeze({ ...tools }),
      agent: sanitizeAgentMetrics(agentMetrics),
      rag: sanitizeRagStatus(ragStatus),
      bridge: sanitizeBridgeStats(bridgeStats),
    });
  };

  return Object.freeze({ record, snapshot });
}

/**
 * Atomic, serialized snapshot writer. Writes happen off the response path;
 * failures are returned to the caller and never change request behavior.
 */
export function createAjoopTelemetryWriter({ filePath } = {}) {
  const target = typeof filePath === "string" ? filePath.trim() : "";
  if (!target) throw new TypeError("ajoop telemetry: filePath is required");
  let queue = Promise.resolve();

  const write = (snapshot) => {
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    queue = queue
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.tmp`;
        await writeFile(temporary, payload, "utf8");
        await rename(temporary, target);
      });
    return queue;
  };

  return Object.freeze({ filePath: target, write, flush: () => queue });
}

export function observeAjoopHandlerResult({ route = "unknown", status = 0, latencyMs = 0, result = {} } = {}) {
  const body = result?.body && typeof result.body === "object" && !Array.isArray(result.body) ? result.body : {};
  const internal = result?.internal && typeof result.internal === "object" && !Array.isArray(result.internal)
    ? result.internal
    : {};
  const scope = body.scope === "general" || body.scope === "portfolio" ? body.scope : "unknown";
  return Object.freeze({
    route: ROUTES.has(route) ? route : "unknown",
    status,
    latencyMs,
    scope,
    answerMode: body.answerMode,
    generationAttempts: body.generationAttempts,
    fallbackUsed: body.fallbackUsed,
    repaired: body.repaired,
    exactFact: body.exactFact,
    sourceCount: Array.isArray(body.sources) ? body.sources.length : 0,
    evidenceCount: Array.isArray(body.evidence) ? body.evidence.length : 0,
    observedToolEvents: Array.isArray(internal.observedToolEvents) ? internal.observedToolEvents : [],
    toolEvents: Array.isArray(internal.toolEvents) ? internal.toolEvents : [],
  });
}
