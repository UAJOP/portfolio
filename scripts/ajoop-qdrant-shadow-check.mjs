#!/usr/bin/env node
/**
 * ajoop-qdrant-shadow-check.mjs — is the persistent store ranking the corpus
 * the way the in-memory index does?
 *
 *   npm run ajoop:qdrant:shadow-check
 *
 * Shadow mode has been collecting the answer since 5.3 shipped: every turn runs
 * the Qdrant query beside the authoritative in-memory retrieval and records a
 * bounded comparison. What was missing was a way to LOOK at it. The data lives
 * in a per-process ring buffer reachable only by importing the module — so an
 * operator either read it from a REPL or did not read it at all.
 *
 * This is that missing step, and it is deliberately the smallest thing that
 * works: an in-process harness that drives the real `createAjoopRag` over a
 * curated question set and reads `shadowReport()` directly.
 *
 * WHAT IT IS NOT, on purpose:
 *
 *   - not an HTTP endpoint. The comparison contains chunk ids and ranks, which
 *     are harmless, but a diagnostic route on a public edge is a permanent
 *     surface added for a periodic question.
 *   - not a transcript. The questions below are fixtures committed in this
 *     file, not visitor data, and the output prints CASE LABELS rather than
 *     question text so the format stays identical whatever is asked. No answer,
 *     locale, history, origin or IP is read or printed.
 *   - not a behaviour change. It calls the shipped handle() and the shipped
 *     settling mechanism. Retrieval, ranking, Qdrant, generation and shadow
 *     recording are untouched.
 *
 * THE GATE IS EXACT PARITY. 5.3 retrieves the complete validated candidate set
 * and re-scores Qdrant candidates locally with the same deterministic policy
 * and the same query vector, so the two rankings are supposed to be identical
 * record for record — not merely similar. A non-identical case is a defect to
 * investigate, not variance to average away, which is why the thresholds below
 * are 1.0 and not 0.95.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createAjoopRag } from "../server/ajoop-rag.mjs";
import { loadEnvFile } from "../server/ajoop-env-file.mjs";
import { AJOOP_VECTOR_BACKENDS } from "../server/ajoop-qdrant-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://localhost:4173";

/**
 * The curated set: 26 portfolio questions across the families retrieval treats
 * differently.
 *
 * Chosen so that each exercises a different part of the deterministic policy —
 * entity isolation, the experience-overview reservation, the internship focus,
 * recruiter evidence selection, follow-up inheritance — because those are the
 * places where a candidate set that differs by one record changes the answer.
 * A set of twenty-six paraphrases of "who is Kaan" would prove almost nothing.
 *
 * `label` is what gets printed. The question is a fixture, and keeping it out
 * of stdout means the output shape cannot drift into a transcript.
 */
const CASES = Object.freeze([
  /* profile / identity */
  { label: "profile-who-tr", locale: "tr", question: "Kaan kim?" },
  { label: "profile-who-en", locale: "en", question: "Who is Kaan Balcı?" },
  { label: "profile-positioning-tr", locale: "tr", question: "Kaan kendini nasıl konumluyor?" },
  { label: "profile-education-tr", locale: "tr", question: "Kaan nerede okudu?" },
  { label: "profile-languages-en", locale: "en", question: "What languages does Kaan speak?" },

  /* skills and experience */
  { label: "experience-employers-tr", locale: "tr", question: "Kaan hangi şirketlerde çalıştı?" },
  { label: "experience-employers-en", locale: "en", question: "Which companies has Kaan worked for?" },
  { label: "experience-internship-tr", locale: "tr", question: "Kaan'ın staj deneyimi ne?" },
  { label: "experience-cbot-tr", locale: "tr", question: "CBOT'ta ne yaptı?" },
  { label: "skills-stack-tr", locale: "tr", question: "Kaan hangi teknolojileri kullanıyor?" },
  { label: "skills-ai-en", locale: "en", question: "What AI and automation skills does Kaan have?" },
  { label: "skills-qa-tr", locale: "tr", question: "Kaan'ın QA ve test deneyimi ne?" },
  { label: "certifications-tr", locale: "tr", question: "Kaan'ın sertifikaları neler?" },

  /* SINAMA */
  { label: "sinama-what-tr", locale: "tr", question: "SINAMA nedir?" },
  { label: "sinama-stack-tr", locale: "tr", question: "SINAMA stacki ne?" },
  { label: "sinama-evidence-en", locale: "en", question: "What evidence is there that SINAMA works?" },

  /* Merge Rush */
  { label: "mergerush-what-tr", locale: "tr", question: "Merge Rush nedir?" },
  { label: "mergerush-stack-tr", locale: "tr", question: "Merge Rush stacki ne?" },
  { label: "mergerush-design-en", locale: "en", question: "What did Kaan do on Merge Rush?" },

  /* Hospital Appointment System — the project most easily confused with its
   * namesake, and therefore the sharpest isolation test in the set. */
  { label: "hospital-appointment-tr", locale: "tr", question: "Hospital Appointment System stacki ne?" },
  { label: "hospital-appointment-en", locale: "en", question: "What is the Hospital Appointment System?" },
  { label: "hospital-form-app-tr", locale: "tr", question: "Hospital Form App neyle yazıldı?" },

  /* recruiter / role fit */
  { label: "recruiter-hire-tr", locale: "tr", question: "Neden Kaan'ı işe almalıyız?" },
  { label: "recruiter-fde-en", locale: "en", question: "Is Kaan a good fit for a Forward Deployed Engineer role?" },
  { label: "recruiter-gaps-tr", locale: "tr", question: "Kaan'ın AI Engineer rolü için eksikleri neler?" },

  /* deliberately ambiguous portfolio asks: no entity named, so the framed-type
   * reservation decides the context rather than similarity alone */
  { label: "ambiguous-projects-tr", locale: "tr", question: "Hangi projeleri yaptı?" },
  { label: "ambiguous-best-work-en", locale: "en", question: "What is his most impressive work?" },
  { label: "ambiguous-experience-tr", locale: "tr", question: "Deneyimi hakkında ne söyleyebilirsin?" },
]);

/* ---------- configuration ---------- */

const { env: fileEnv, present } = loadEnvFile(resolve(ROOT, ".env.local"), process.env);
const env = {
  ...fileEnv,
  AJOOP_AI_ALLOWED_ORIGINS: ORIGIN,
  /* Pacing only, and only for THIS in-process instance. The bridge's real quota
   * is covered by its own suite; throttling a 28-case operator check would test
   * the rate limiter rather than parity. */
  AJOOP_AI_RATE_MAX: "200",
};

console.log("Ajoop shadow parity check");
console.log(`  .env.local ${present ? "present" : "not found"} · backend ${env.AJOOP_VECTOR_BACKEND || "(unset)"}`);

/**
 * The backend is READ, never set.
 *
 * Forcing shadow here would make the check pass against a configuration the
 * bridge is not running, which is the one result nobody wants from a parity
 * tool.
 */
if (env.AJOOP_VECTOR_BACKEND !== AJOOP_VECTOR_BACKENDS.SHADOW) {
  console.error(`  refused: AJOOP_VECTOR_BACKEND is "${env.AJOOP_VECTOR_BACKEND || "unset"}", expected "shadow".`);
  console.error("  This check reads the configuration; it does not change it.");
  process.exit(1);
}

const rag = createAjoopRag({ env });

const startedAt = performance.now();
const initialization = await rag.initialize();
const status = rag.status();

console.log(
  `  corpus ${initialization.chunks} chunk(s) · retrievable ${status.retrievableChunks} · ` +
    `${status.embedModel} · ${status.model}`,
);
console.log(
  `  backend ${status.vectorBackend} (requested ${status.vectorBackendRequested}) · ` +
    `qdrantReady ${status.qdrantReady} · readiness ${status.vectorReadiness?.reason}`,
);

if (!initialization.ready) {
  console.error("  refused: the RAG index did not build; nothing to compare.");
  process.exit(1);
}
if (!status.qdrantReady || status.vectorBackend !== AJOOP_VECTOR_BACKENDS.SHADOW) {
  console.error(`  refused: shadow comparison is not running (readiness: ${status.vectorReadiness?.reason}).`);
  console.error("  The bridge is serving from memory, so there is no parity to measure.");
  process.exit(1);
}
console.log(`  candidate limit ${status.candidateLimit} · build ${status.vectorReadiness?.buildId}`);
console.log("");

/* ---------- run ---------- */

const ask = (test) =>
  rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question: test.question, locale: test.locale, history: [] }),
  });

const differences = [];
let compared = 0;
let retrievalFreeCases = 0;
let seenTurnId = 0;

for (const [position, test] of CASES.entries()) {
  const response = await ask(test);
  /* The shipped settling mechanism: waits for this turn's background shadow
   * query without the visitor path ever having waited for it. */
  await rag.shadowSettled();

  /* Entries newer than the last one seen belong to this case. The ring buffer
   * is bounded, so the per-case detail is taken now rather than read back at
   * the end — the aggregate counters are cumulative and survive the rolling. */
  const report = rag.shadowReport();
  const fresh = report.entries.filter((entry) => Number.isInteger(entry.turnId) && entry.turnId > seenTurnId);
  if (fresh.length) seenTurnId = Math.max(...fresh.map((entry) => entry.turnId));

  if (!fresh.length) {
    /* Exact facts, the live-data guard and context-ineligible questions answer
     * without retrieval, so they never embed and never shadow. Not a failure:
     * there is genuinely nothing to compare. */
    retrievalFreeCases += 1;
    console.log(`  ${String(position + 1).padStart(2)} ${test.label.padEnd(28)} no retrieval (answered deterministically)`);
    continue;
  }

  for (const entry of fresh) {
    compared += 1;
    const verdict = entry.ok ? (entry.identical ? "identical" : "DIFFERS") : `ERROR ${entry.error?.code}`;
    console.log(
      `  ${String(position + 1).padStart(2)} ${test.label.padEnd(28)} ${verdict.padEnd(10)} ` +
        `overlap ${entry.ok ? entry.overlapRatio.toFixed(2) : "-"} · ${entry.latencyMs ?? "-"}ms` +
        (response.status === 200 ? "" : ` · turn ${response.status}`),
    );
    if (!entry.ok || !entry.identical) {
      differences.push({ label: test.label, entry });
    }
  }
}

const elapsedMs = Math.round(performance.now() - startedAt);
const summary = rag.shadowReport();

/* ---------- report ---------- */

const identicalRatio = summary.comparisons ? summary.identical / summary.comparisons : 0;
const onlyInMemory = differences.reduce((total, item) => total + (item.entry.onlyInMemory?.length || 0), 0);
const onlyInQdrant = differences.reduce((total, item) => total + (item.entry.onlyInQdrant?.length || 0), 0);

console.log("");
console.log("Shadow parity summary");
console.log(`  cases                    ${CASES.length}`);
console.log(`  comparisons              ${summary.comparisons}`);
console.log(`  cases without retrieval  ${retrievalFreeCases}`);
console.log(`  errors                   ${summary.errors}${summary.lastError ? ` (last: ${summary.lastError.code})` : ""}`);
console.log(`  identical                ${summary.identical}`);
console.log(`  identical ratio          ${identicalRatio.toFixed(4)}`);
console.log(`  average overlap ratio    ${summary.averageOverlapRatio.toFixed(4)}`);
console.log(`  average qdrant latency   ${summary.averageLatencyMs}ms`);
console.log(`  only-in-memory records   ${onlyInMemory}`);
console.log(`  only-in-qdrant records   ${onlyInQdrant}`);
console.log(`  elapsed                  ${elapsedMs}ms`);

if (differences.length) {
  console.log("");
  console.log("Differing cases (worst first)");
  const worst = [...differences].sort(
    (a, b) => (a.entry.overlapRatio ?? 0) - (b.entry.overlapRatio ?? 0),
  );
  for (const { label, entry } of worst.slice(0, 10)) {
    console.log(`  ${label} · turn ${entry.turnId} · overlap ${entry.ok ? entry.overlapRatio : "n/a"}`);
    if (!entry.ok) {
      console.log(`    qdrant error: ${entry.error?.code} (status ${entry.error?.status})`);
      continue;
    }
    if (entry.onlyInMemory?.length) console.log(`    only in memory: ${entry.onlyInMemory.join(", ")}`);
    if (entry.onlyInQdrant?.length) console.log(`    only in qdrant: ${entry.onlyInQdrant.join(", ")}`);
    /* Records both sides returned but ranked differently — the subtlest form of
     * disagreement and the one an overlap ratio alone hides. */
    const moved = (entry.rankDifferences || []).filter((row) => row.delta !== 0);
    for (const row of moved.slice(0, 5)) {
      console.log(`    rank ${row.id}: memory ${row.memoryRank} → qdrant ${row.qdrantRank} (${row.delta > 0 ? "+" : ""}${row.delta})`);
    }
  }
}

/* ---------- gate ---------- */

const failures = [];
if (summary.comparisons === 0) failures.push("no comparisons were recorded");
if (summary.errors !== 0) failures.push(`${summary.errors} qdrant error(s)`);
if (summary.averageOverlapRatio !== 1) failures.push(`average overlap ratio ${summary.averageOverlapRatio} (expected 1)`);
if (identicalRatio !== 1) failures.push(`identical ratio ${identicalRatio.toFixed(4)} (expected 1)`);

console.log("");
if (failures.length) {
  console.error(`Shadow parity FAILED: ${failures.join("; ")}.`);
  console.error("5.3 retrieves the complete validated candidate set and re-scores it locally with the");
  console.error("same policy and the same query vector, so a difference is a defect, not variance.");
  process.exit(1);
}
console.log(
  `Shadow parity passed. ${summary.comparisons} comparison(s) · identical ${summary.identical}/${summary.comparisons} · ` +
    `overlap ${summary.averageOverlapRatio} · ${summary.averageLatencyMs}ms average qdrant latency.`,
);
