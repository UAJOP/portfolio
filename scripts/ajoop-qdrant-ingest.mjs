#!/usr/bin/env node
/**
 * ajoop-qdrant-ingest.mjs — build the Ajoop corpus into Qdrant, atomically.
 *
 *   npm run ajoop:qdrant:ingest              # build, verify, promote the alias
 *   npm run ajoop:qdrant:ingest -- --dry-run # plan only; reads, never writes
 *
 * A successful run STOPS at the alias promotion. The previous physical
 * collection is reported and left on the cluster; removing it is an explicit
 * operator action, not something a rebuild does on its own.
 *
 * This is the ONLY place corpus embedding happens outside the bridge startup.
 * It is explicit, it is atomic, and it is never reachable from a visitor
 * request: embedding ~190 chunks holds the same GPU the generation model needs,
 * and a visitor waiting on an answer must never be paying for an index rebuild.
 *
 * Every run writes a COMPLETE new physical collection and only then moves the
 * `ajoop_portfolio_v1` alias onto it. Nothing mutates what visitors are
 * querying, so a run that fails halfway leaves the previous corpus serving,
 * untouched. See server/ajoop-qdrant-ingest.mjs for why in-place upsert-and-
 * sweep was abandoned.
 *
 * Credentials come from the environment, with .env.local filling in only what
 * the shell left undefined. Nothing here prints a key, and the summary carries
 * a hostname rather than a URL.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortfolioChunks } from "../server/ajoop-rag.mjs";
import { createEmbedder } from "../server/ajoop-embedding.mjs";
import { loadEnvFile } from "../server/ajoop-env-file.mjs";
import { describeQdrantConfig, resolveQdrantConfig } from "../server/ajoop-qdrant-config.mjs";
import { createQdrantClient } from "../server/ajoop-qdrant.mjs";
import { runQdrantIngestion } from "../server/ajoop-qdrant-ingest.mjs";
import { describeFailure, formatFailure } from "../server/ajoop-qdrant-diagnostics.mjs";
import {
  QDRANT_INDEX_VERSION,
  QDRANT_PAYLOAD_SCHEMA_VERSION,
} from "../server/ajoop-qdrant-points.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);

const { env, loaded, present } = loadEnvFile(resolve(ROOT, ".env.local"), process.env);
const config = resolveQdrantConfig(env);
const described = describeQdrantConfig(config);

console.log("Ajoop → Qdrant ingestion");
console.log(
  `  .env.local ${present ? `present · ${loaded.length} key(s) supplied` : "not found"} ` +
    `· backend ${described.requestedBackend}`,
);

/**
 * Ingestion needs a COMPLETE configuration, whatever the retrieval backend is.
 *
 * `AJOOP_VECTOR_BACKEND=memory` is the normal state while shadow mode is being
 * prepared, and refusing to populate the collection until production already
 * depends on it would be exactly backwards.
 */
if (!config.configured) {
  console.error(`  refused: incomplete Qdrant configuration [${described.issues.join(", ") || "unknown"}]`);
  console.error("  required: QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, QDRANT_VECTOR_SIZE, QDRANT_DISTANCE");
  process.exit(1);
}

console.log(
  `  cluster ${described.endpointHost} · alias ${described.collection} ` +
    `· ${described.vectorSize}d ${described.distance} · schema ${QDRANT_PAYLOAD_SCHEMA_VERSION}/index ${QDRANT_INDEX_VERSION}`,
);

const embedModel = String(env.AJOOP_RAG_EMBED_MODEL || "qwen3-embedding:0.6b").trim();
const ollamaBaseUrl = String(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");

const { chunks, stats } = await buildPortfolioChunks();
console.log(
  `  corpus ${chunks.length} chunk(s) · ${stats.masterKnowledgeRecords} master record(s) ` +
    `· ${stats.privacyExcluded} restricted field(s) excluded`,
);

const client = createQdrantClient({ config });
const embed = createEmbedder({ baseUrl: ollamaBaseUrl, model: embedModel });

try {
  const result = await runQdrantIngestion({
    client,
    config,
    chunks,
    embed,
    schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION,
    indexVersion: QDRANT_INDEX_VERSION,
    embeddingModel: embedModel,
    dryRun: flag("dry-run"),
    onProgress: (event) => {
      if (event.stage === "planned") {
        console.log(`  build ${event.buildId} · ${event.points} point(s) · ${event.excluded} not indexable`);
      }
      if (event.stage === "current") console.log(`  active ${event.previous || "(none)"}`);
      if (event.stage === "created") console.log(`  staging ${event.staging}`);
      if (event.stage === "written" && event.done === event.total) {
        console.log(`  written ${event.done}/${event.total}`);
      }
      if (event.stage === "manifest") console.log("  manifest written");
      if (event.stage === "verified") console.log(`  verified ${event.points} corpus point(s)`);
      if (event.stage === "probed") console.log(`  search probe ok (${event.chunkId})`);
      if (event.stage === "promoted") console.log(`  alias → ${event.to}`);
      /* Reported, never acted on: an operator should know a previous
       * collection is still sitting there. */
      if (event.stage === "cleanup-required") {
        console.log(`  previous build ${event.collection} left in place`);
      }
    },
  });

  console.log(
    result.dryRun
      ? `Dry run. Would build ${result.plannedPoints} point(s) into ${result.staging} ` +
          `and promote over ${result.previous || "(no current build)"}. ` +
          `Nothing was written. ${result.durationMs}ms.`
      : `Ingestion complete. ${result.written} point(s) · alias now ${result.staging} · ` +
          `previous ${result.previous || "(none)"} · ${result.durationMs}ms.`,
  );

  if (result.cleanupRequired) {
    console.log("");
    console.log(`  MANUAL CLEANUP: ${result.previousPhysicalCollection} is no longer aliased.`);
    console.log("  Ajoop 5.3 never deletes an old build automatically. Verify it is the one you");
    console.log("  expect, then remove it yourself when you are satisfied the new build is good.");
  }
} catch (error) {
  /**
   * A SAFE, ASSEMBLED description — never a formatted error object.
   *
   * The previous version printed `error.message`, which for a transport failure
   * is the useless string `fetch failed` and for other failures is a message
   * that may quote the request. describeFailure() builds a fixed set of scalar
   * fields instead: stage, method, redacted path, status, code, socket cause,
   * batch ordinal. Nothing in it is derived from a header, a payload, a
   * response body or corpus text, so there is nothing in it to leak.
   */
  const failure = describeFailure(error);
  console.error("");
  console.error(`  failed at ${failure.stage}`);
  const line = formatFailure(failure);
  if (line) console.error(`  ${line}`);

  if (error?.reason === "alias-name-occupied") {
    console.error(
      `  "${error.alias}" currently exists as a PHYSICAL collection, so it cannot also be an alias.`,
    );
    console.error(
      "  Remove that collection (or point QDRANT_COLLECTION at an unused name) and run this again.",
    );
    console.error("  Nothing was written and no alias was changed.");
  }
  if (error?.verification) {
    console.error(`  staging verification: ${error.verification.reason}`);
    if (error.verification.expected !== undefined) {
      console.error(`  expected ${error.verification.expected}, found ${error.verification.actual}`);
    }
  }
  if (error?.aliasMoved === false) {
    console.error(`  the active alias was NOT changed; the previous corpus is still serving.`);
  }

  /**
   * A secondary failure is reported BESIDE the primary one, never instead.
   *
   * Tidying up after a failed build can itself fail, and the tidy-up is the
   * less interesting of the two events by a wide margin. Letting it overwrite
   * the line that explains the run would cost another full ingestion to learn
   * what the first one already knew.
   */
  if (error?.cleanupFailure) {
    const cleanup = describeFailure(error.cleanupFailure);
    console.error("");
    console.error(`  cleanup also failed at ${cleanup.stage}`);
    const cleanupLine = formatFailure(cleanup);
    if (cleanupLine) console.error(`  ${cleanupLine}`);
    if (error.stagingRetained) {
      console.error("  the staging collection from this run is still on the cluster and can be");
      console.error("  removed manually; it was never aliased, so nothing is serving from it.");
    }
  }
  process.exit(1);
}
