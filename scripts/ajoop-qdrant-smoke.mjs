#!/usr/bin/env node
/**
 * ajoop-qdrant-smoke.mjs — the opt-in live check against the real cluster.
 *
 *   npm run ajoop:qdrant:smoke          # print what it WOULD do, touch nothing
 *   npm run ajoop:qdrant:smoke -- --run # actually talk to Qdrant and Ollama
 *
 * WITHOUT --run THIS DOES NOTHING. That is the whole reason the flag exists:
 * `npm run qa` must never reach a paid cloud cluster, and a suite that becomes
 * a live test the day someone adds credentials to CI is a suite nobody can
 * trust to be hermetic. The deterministic Qdrant contracts live in
 * scripts/qa-ajoop-qdrant.mjs and run against mocked HTTP.
 *
 * Six checks, in the order a failure is most useful:
 *
 *   1. connectivity   — the cluster answers and the credential is accepted
 *   2. alias state    — what the logical name currently resolves to
 *   3. ingestion      — a full staged build, verified, then promoted
 *   4. readiness      — the same validation the bridge runs at startup
 *   5. point count    — greater than zero, and exactly what the manifest says
 *   6. semantic search — one query, embedded by the shipped model
 *
 * The only write is the build in step 3, and it writes to a NEW physical
 * collection. Nothing that is live is mutated; the alias moves only after the
 * new collection has been verified.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortfolioChunks } from "../server/ajoop-rag.mjs";
import { createEmbedder } from "../server/ajoop-embedding.mjs";
import { loadEnvFile } from "../server/ajoop-env-file.mjs";
import { describeQdrantConfig, resolveQdrantConfig } from "../server/ajoop-qdrant-config.mjs";
import { createQdrantClient } from "../server/ajoop-qdrant.mjs";
import { verifyQdrantCorpus } from "../server/ajoop-qdrant-readiness.mjs";
import { runQdrantIngestion } from "../server/ajoop-qdrant-ingest.mjs";
import { describeFailure, formatFailure } from "../server/ajoop-qdrant-diagnostics.mjs";
import { PUBLIC_SAFE_FILTER, RECORD_KINDS, buildCorpusDescriptor } from "../server/ajoop-qdrant-points.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const option = (name) => argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const QUESTION = option("question") || "SINAMA projesinin teknoloji yığını nedir?";

const { env, loaded, present } = loadEnvFile(resolve(ROOT, ".env.local"), process.env);
const config = resolveQdrantConfig(env);
const described = describeQdrantConfig(config);

console.log("Ajoop ↔ Qdrant live smoke test");
console.log(`  .env.local ${present ? `present · ${loaded.length} key(s) supplied` : "not found"}`);
console.log(
  `  configured ${described.configured}` +
    (described.issues.length ? ` · issues [${described.issues.join(", ")}]` : ""),
);

if (!argv.includes("--run")) {
  console.log(
    `  DRY. Would build and promote ${described.collection} on ` +
      `${described.endpointHost || "(no endpoint)"} at ${described.vectorSize}d ${described.distance}.`,
  );
  console.log("  Re-run with --run to execute. This command is never part of npm run qa.");
  process.exit(0);
}

if (!config.configured) {
  console.error(`  refused: incomplete Qdrant configuration [${described.issues.join(", ") || "unknown"}]`);
  process.exit(1);
}

const results = [];
const step = async (name, run) => {
  const startedAt = Date.now();
  try {
    const detail = await run();
    results.push({ name, ok: true, detail, ms: Date.now() - startedAt });
    console.log(`  ok   ${name} — ${detail} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    /* Assembled from safe scalars, exactly as the ingestion CLI does — a raw
     * message here would be the same leak in a different terminal. */
    const failure = describeFailure(error);
    const line = formatFailure(failure);
    results.push({ name, ok: false, detail: `${failure.stage} ${line}`.trim(), ms: Date.now() - startedAt });
    console.error(`  FAIL ${name} — at ${failure.stage}${line ? ` · ${line}` : ""}`);
  }
};

const client = createQdrantClient({ config, timeoutMs: 15000 });
const embedModel = String(env.AJOOP_RAG_EMBED_MODEL || "qwen3-embedding:0.6b").trim();
const ollamaBaseUrl = String(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
const embed = createEmbedder({ baseUrl: ollamaBaseUrl, model: embedModel });

await step("connectivity", async () => {
  const collections = await client.listCollections();
  return `cluster reachable · ${collections.length} collection(s)`;
});

await step("alias state", async () => {
  const aliases = await client.listAliases();
  const active = aliases.find((entry) => entry.alias === config.collection);
  const collections = await client.listCollections();
  if (collections.includes(config.collection)) {
    throw new Error(`"${config.collection}" exists as a physical collection and cannot also be an alias`);
  }
  return active ? `${config.collection} → ${active.collection}` : `${config.collection} → (unset, first build)`;
});

await step("ingestion", async () => {
  const { chunks } = await buildPortfolioChunks();
  const result = await runQdrantIngestion({ client, config, chunks, embed, embeddingModel: embedModel });
  return `${result.written} written · promoted ${result.staging}`;
});

await step("readiness", async () => {
  const descriptor = buildCorpusDescriptor((await buildPortfolioChunks()).chunks, {
    embeddingModel: embedModel,
  });
  const verified = await verifyQdrantCorpus(client, config, { descriptor });
  if (!verified.ok) throw new Error(verified.reason);
  return `${verified.corpusPoints} corpus point(s) · build ${verified.buildId}`;
});

await step("point count", async () => {
  const response = await client.count(config.collection);
  const count = response?.result?.count ?? 0;
  if (!(count > 0)) throw new Error("collection is empty after ingestion");
  return `${count} point(s) including the manifest`;
});

await step("semantic search", async () => {
  const [vector] = await embed([QUESTION]);
  if (!Array.isArray(vector) || vector.length !== config.vectorSize) {
    throw new Error(`query vector is ${vector?.length ?? 0}d, expected ${config.vectorSize}d`);
  }
  const response = await client.search(config.collection, {
    vector,
    limit: 3,
    exact: true,
    filter: PUBLIC_SAFE_FILTER,
  });
  const hits = response?.result || [];
  if (!hits.length) throw new Error("no hits");
  const top = hits[0];
  if (top?.payload?.public_safe !== true) throw new Error("a non-public-safe point was returned");
  if (top?.payload?.record_kind !== RECORD_KINDS.CHUNK) throw new Error("a non-corpus point was returned");
  return `top ${hits.length}: ${hits.map((hit) => hit.payload?.chunk_id).join(", ")}`;
});

const failed = results.filter((result) => !result.ok);
console.log(
  failed.length
    ? `Live smoke test FAILED: ${failed.length}/${results.length} step(s).`
    : `Live smoke test passed. ${results.length}/${results.length} steps · ` +
        `${described.endpointHost} · ${described.collection}.`,
);
process.exit(failed.length ? 1 : 0);
