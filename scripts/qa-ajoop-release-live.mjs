/**
 * Brief 5's bounded live acceptance run. Run only after deterministic QA:
 *   node scripts/qa-ajoop-release-live.mjs --run
 * With no --run this only checks the installed/resident Ollama models.
 * --cases=9,10 reruns failed cases only; --output=path preserves the first run.
 * Calls the real RAG pipeline and real local Ollama; no model installation,
 * production server/config changes, external services, or visitor data.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createAjoopRag } from "../server/ajoop-rag.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://localhost:4173";
const argv = process.argv.slice(2);
const option = (name) => argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const selected = option("cases")?.split(",").map(Number);
const output = resolve(ROOT, option("output") || "docs/ajoop-release-live-results.json");
const env = {
  ...process.env,
  // Match the production launcher, rather than the legacy bridge-core default.
  AJOOP_AI_MODEL: process.env.AJOOP_AI_MODEL || "qwen3:4b-instruct",
  AJOOP_AI_ALLOWED_ORIGINS: ORIGIN,
  AJOOP_AI_RATE_MAX: "100",
};
const CASES = [
  /* Not an exact fact: "Kaan kim?" is a retrieved identity answer, so it costs
   * the ordinary one embedding and one chat. The deterministic fast path is
   * exercised by case 21, which is a real exact-fact route. */
  { id: 1, question: "Kaan kim?", scope: "portfolio", manual: true },
  { id: 2, question: "Kaan hangi şirketlerde çalıştı?", scope: "portfolio", manual: true },
  { id: 3, question: "Kaan'ın staj deneyimi ne?", scope: "portfolio" },
  { id: 4, question: "SINAMA stacki ne?", scope: "portfolio", project: "project:sinama", manual: true },
  { id: 5, question: "Merge Rush stacki ne?", scope: "portfolio", project: "project:merge-rush-tiny-factory" },
  { id: 6, question: "Hospital Form App stacki ne?", scope: "portfolio", project: "project:hospital-form-app" },
  { id: 7, question: "Hospital Appointment System stacki ne?", scope: "portfolio", project: "project:hospital-appointment-system" },
  { id: 8, question: "CBOT'ta ne yaptı?", scope: "portfolio" },
  { id: 9, question: "Kaan Forward Deployed Engineer rolüne uygun mu?", scope: "portfolio", manual: true },
  { id: 10, question: "Neden Kaan'ı işe almalıyız?", scope: "portfolio", manual: true },
  { id: 11, question: "Kaan'ın AI Engineer rolü için eksikleri neler?", scope: "portfolio", manual: true },
  { id: 12, question: "Kaan'ı diğer junior adaylardan ayıran ne?", scope: "portfolio" },
  { id: 13, question: "RAG nedir?", scope: "general" },
  { id: 14, question: "sınama ve değerlendirme arasındaki fark nedir", scope: "general" },
  { id: 15, question: "GitHub nedir?", scope: "general" },
  { id: 16, question: "stacki ne?", scope: "portfolio", project: "project:sinama", afterSinama: true },
  { id: 17, question: "RAG nedir?", scope: "general", afterSinama: true },
  { id: 18, question: "sen kimsin?", scope: "general", self: true },
  { id: 19, question: "Is Kaan a good fit for a Forward Deployed Engineer role?", locale: "en", scope: "portfolio" },
  { id: 20, question: "satrançta rok nasıl yapılır?", scope: "general", modelLimitation: true },
  /* The deterministic contact route, live: it must answer with no embedding and
   * no model call at all, which is also what keeps a contact detail out of a
   * generative rephrasing. */
  { id: 21, question: "Kaan'ın LinkedIn'i", scope: "portfolio", exact: true },
];
if (selected?.some((id) => !CASES.some((test) => test.id === id))) throw new Error("Unknown live case ID");

const calls = [];
const nsToMs = (value) => typeof value === "number" ? Number((value / 1e6).toFixed(2)) : null;
const measuredFetch = async (url, init) => {
  const endpoint = new URL(url).pathname;
  const payload = init?.body ? JSON.parse(init.body) : {};
  const call = { endpoint, model: payload.model, inputCount: Array.isArray(payload.input) ? payload.input.length : 0 };
  calls.push(call);
  const start = performance.now();
  try {
    const response = await fetch(url, init);
    call.httpStatus = response.status;
    const data = await response.json();
    call.elapsedMs = Number((performance.now() - start).toFixed(2));
    call.ollama = {
      totalMs: nsToMs(data.total_duration),
      loadMs: nsToMs(data.load_duration),
      promptEvalMs: nsToMs(data.prompt_eval_duration),
      evalMs: nsToMs(data.eval_duration),
      promptEvalCount: data.prompt_eval_count ?? null,
      evalCount: data.eval_count ?? null,
      doneReason: data.done_reason ?? null,
    };
    return { ok: response.ok, status: response.status, json: async () => data };
  } catch (error) {
    call.elapsedMs = Number((performance.now() - start).toFixed(2));
    call.error = error.name;
    throw error;
  }
};
const rag = createAjoopRag({ env, fetchImpl: measuredFetch });
const baseUrl = rag.config.ollamaBaseUrl;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Live release acceptance requires loopback Ollama");
}
const readOllama = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const [tags, resident] = await Promise.all([readOllama("/api/tags"), readOllama("/api/ps")]);
const configured = rag.status();
const preflight = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  model: configured.model,
  embedModel: configured.embedModel,
  installed: tags.models.map(({ name, digest, details }) => ({ name, digest, details })),
  resident: resident.models.map(({ name, digest, context_length }) => ({ name, digest, contextLength: context_length })),
};
for (const model of [configured.model, configured.embedModel]) {
  if (!tags.models.some((item) => item.name === model || item.model === model)) throw new Error(`Required installed model missing: ${model}`);
}
console.log(JSON.stringify({ preflight }, null, 2));
if (!argv.includes("--run")) process.exit(0);

const report = {
  title: "AJOOP 5.2 Brief 5 live acceptance",
  startedAt: new Date().toISOString(),
  baseHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
  testedWorkingTree: true,
  preflight,
  method: "Actual createAjoopRag with measured real fetch calls to existing loopback Ollama; sequential 20-case maximum; no synthetic generation warmup.",
  rateLimitOverride: "100 per minute in this in-process QA instance so test pacing does not test the bridge's separately covered quota.",
  modelResidence: resident.models.some((item) => item.name === configured.model) ? "Generation model already resident before this run; no cold-generation claim." : "Generation model not resident at preflight; first chat includes observed model startup.",
  cases: [],
  manualReview: { status: "pending", requiredCaseIds: CASES.filter((test) => test.manual).map((test) => test.id) },
};
const persist = async () => {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};
const startupStart = performance.now();
const initialization = await rag.initialize();
report.initialization = { ...initialization, elapsedMs: Number((performance.now() - startupStart).toFixed(2)), embeddingCalls: calls.length, calls: [...calls] };
if (!initialization.ready) {
  report.error = "RAG initialization failed";
  await persist();
  throw new Error(report.error);
}

const fixtures = [{ role: "user", content: "SINAMA stacki ne?" }, { role: "assistant", content: "SINAMA, Kaan'ın AI/LLM evaluation platformudur." }];
for (const test of CASES.filter((item) => !selected || selected.includes(item.id))) {
  const sinama = report.cases.find((item) => item.id === 4);
  const history = test.afterSinama
    ? sinama ? [{ role: "user", content: sinama.question }, { role: "assistant", content: sinama.answer }] : fixtures
    : [];
  const before = calls.length;
  const start = performance.now();
  const response = await rag.handle({
    method: "POST", origin: ORIGIN, contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question: test.question, locale: test.locale || "tr", history }),
  });
  const elapsedMs = Number((performance.now() - start).toFixed(2));
  const body = response.body || {};
  const currentCalls = calls.slice(before);
  const embeddingCalls = currentCalls.filter((call) => call.endpoint === "/api/embed").length;
  const chatCalls = currentCalls.filter((call) => call.endpoint === "/api/chat").length;
  const blockers = [];
  if (response.status !== 200 || body.ok !== true) blockers.push(`HTTP/response failure: ${response.status} ${body.error || ""}`);
  if (body.scope !== test.scope) blockers.push(`Expected ${test.scope} scope, got ${body.scope}`);
  if (!body.answer?.trim()) blockers.push("Empty answer");
  if (!Array.isArray(body.evidence) || !Array.isArray(body.sources)) blockers.push("Missing evidence/source response arrays");
  if (chatCalls > 2 || body.generationAttempts > 2) blockers.push("Retry cap exceeded");
  if (chatCalls !== body.generationAttempts) blockers.push("Generation-attempt diagnostic does not match real chat calls");
  if (embeddingCalls > 1) blockers.push("More than one per-turn embedding call");
  if (test.scope === "general") {
    if (embeddingCalls || body.evidence?.length || body.sources?.length || body.retrievedSources?.length) blockers.push("GENERAL quarantine breached");
    if (!test.self && /\bKaan\b|\bSINAMA\b|\bCBOT\b|\bMerge Rush\b/i.test(body.answer || "")) blockers.push("GENERAL answer mentions portfolio subject");
  }
  if (test.exact && (embeddingCalls || chatCalls)) blockers.push("Exact fact used embedding or chat");
  if (test.project && !body.evidence?.some((item) => item.entityId === test.project)) blockers.push(`Missing project evidence ${test.project}`);
  const result = {
    id: test.id, question: test.question, locale: test.locale || "tr", history,
    scope: body.scope, answerMode: body.answerMode,
    evidenceIds: (body.evidence || []).map((item) => item.id),
    evidenceEntityIds: (body.evidence || []).map((item) => item.entityId),
    sourceEntityIds: (body.sources || []).map((item) => item.entityId),
    generationAttempts: body.generationAttempts, validatorFlags: body.validatorFlags || [],
    embedding: embeddingCalls > 0, embeddingCalls, chatCalls, latencyMs: elapsedMs,
    repaired: body.repaired, fallbackUsed: body.fallbackUsed, exactFact: body.exactFact || null,
    answer: body.answer || "", calls: currentCalls,
    verdict: blockers.length ? "BLOCKER" : body.fallbackUsed || test.modelLimitation ? "NOTE" : "PASS",
    blockers,
    notes: test.modelLimitation ? ["General model knowledge must be manually reviewed; factual weakness alone is an accepted model limitation."] : [],
    qualityReviewed: false,
  };
  report.cases.push(result);
  await persist();
  console.log(`${test.id}/${CASES.length} ${result.verdict} ${result.scope}/${result.answerMode} embed=${embeddingCalls} chat=${chatCalls} ${elapsedMs}ms flags=${result.validatorFlags.join(",") || "none"} ${test.question}`);
}
const summarize = (items) => {
  const latencies = items.map((item) => item.latencyMs).sort((a, b) => a - b);
  return {
    cases: items.length,
    medianMs: latencies.length ? Number((latencies.length % 2 ? latencies[Math.floor(latencies.length / 2)] : (latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2).toFixed(2)) : null,
    minMs: latencies[0] ?? null, maxMs: latencies.at(-1) ?? null,
    embeddingCalls: items.reduce((sum, item) => sum + item.embeddingCalls, 0),
    chatCalls: items.reduce((sum, item) => sum + item.chatCalls, 0),
    repairs: items.filter((item) => item.generationAttempts === 2).length,
    fallbacks: items.filter((item) => item.fallbackUsed).length,
  };
};
report.completedAt = new Date().toISOString();
report.summary = Object.fromEntries(["PASS", "NOTE", "BLOCKER"].map((verdict) => [verdict, report.cases.filter((item) => item.verdict === verdict).length]));
report.performance = {
  exact: summarize(report.cases.filter((item) => item.answerMode === "portfolio-fact")),
  general: summarize(report.cases.filter((item) => item.scope === "general")),
  portfolio: summarize(report.cases.filter((item) => item.scope === "portfolio" && item.answerMode !== "portfolio-fact" && !item.answerMode?.startsWith("recruiter-"))),
  recruiter: summarize(report.cases.filter((item) => item.answerMode?.startsWith("recruiter-"))),
};
await persist();
console.log(JSON.stringify({ output, summary: report.summary, performance: report.performance, manualReview: "PENDING: review actual answers before a release decision" }, null, 2));
if (report.summary.BLOCKER) process.exitCode = 1;
