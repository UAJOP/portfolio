#!/usr/bin/env node
/**
 * qa-ajoop-qdrant.mjs — the Ajoop 5.3 persistent vector-backend contracts.
 *
 * Every Qdrant response here is MOCKED. The suite runs with no network, no
 * cloud cluster and no Ollama, exactly like the rest of the Ajoop QA, because a
 * gate that needs a paid cluster to go green is a gate that gets skipped. The
 * real cluster is exercised separately and only on purpose, by
 * scripts/ajoop-qdrant-smoke.mjs --run.
 *
 * The suite is organised around the properties that would make shipping this
 * DANGEROUS rather than merely imperfect:
 *
 *   - the corpus has exactly one unique id per chunk, and a collision is a hard
 *     failure rather than a record quietly vanishing
 *   - a build never mutates what visitors are querying, and a failed build
 *     leaves the active alias exactly where it was
 *   - nothing this pipeline did not write can ever be deleted
 *   - the Qdrant ranking and the in-memory ranking are IDENTICAL for the same
 *     query vector, including when more records outrank the right one than a
 *     shortlist would have held
 *   - one visitor question costs exactly ONE query embedding, whatever backend
 *     is live, and both paths read that same vector
 *   - concurrent turns cannot overwrite each other's diagnostics
 *   - readiness means the cluster was validated, not that an object exists
 *   - a missing, malformed or unverifiable configuration resolves to `memory`
 *   - the API key never reaches anything the browser can read
 *
 * Where a ranking is asserted, the mock is ADVERSARIAL in the same way the
 * retrieval and release suites are: the record that must NOT win is the one the
 * store returns first.
 *
 *   node scripts/qa-ajoop-qdrant.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  AJOOP_VECTOR_BACKENDS,
  QDRANT_DEFAULTS,
  describeQdrantConfig,
  publicVectorBackendStatus,
  resolveQdrantConfig,
} from "../server/ajoop-qdrant-config.mjs";
import {
  QdrantError,
  assessCollectionCompatibility,
  createQdrantClient,
  normalizeQdrantError,
  safeCauseCode,
  readCollectionVectors,
  classifyErrorBody,
  scrollAllPoints,
} from "../server/ajoop-qdrant.mjs";
import {
  AJOOP_CORPUS_OWNER,
  AJOOP_QDRANT_NAMESPACE,
  MANIFEST_POINT_ID,
  PUBLIC_SAFE_FILTER,
  PUBLIC_SAFE_FILTER_INDEXES,
  QDRANT_INDEX_VERSION,
  QDRANT_PAYLOAD_SCHEMA_VERSION,
  RECORD_KINDS,
  buildCorpusDescriptor,
  buildIdFor,
  buildManifestPoint,
  buildQdrantPayload,
  buildQdrantPoint,
  chunkContentHash,
  corpusDescriptorLine,
  corpusFingerprint,
  fingerprintDescriptorLines,
  isPublicSafeChunk,
  isValidBuildId,
  parseBuildId,
  verifyBuildIdBinding,
  looksOwnedCollectionName,
  qdrantPointId,
  remoteDescriptorLine,
  selectIngestableChunks,
  stagingCollectionName,
  uuidV5,
} from "../server/ajoop-qdrant-points.mjs";
import {
  AJOOP_AUTOMATIC_CLEANUP,
  assertUniquePointIds,
  planQdrantBuild,
  runQdrantIngestion,
} from "../server/ajoop-qdrant-ingest.mjs";
import {
  INGESTION_STAGES,
  describeFailure,
  embeddingFailureCategory,
  formatFailure,
  tagStage,
} from "../server/ajoop-qdrant-diagnostics.mjs";
import {
  verifyManifest,
  verifyQdrantCorpus,
  verifyStoredPoints,
} from "../server/ajoop-qdrant-readiness.mjs";
import { compareRetrieval, createShadowRecorder } from "../server/ajoop-vector-shadow.mjs";
import { parseEnvFile, loadEnvFile } from "../server/ajoop-env-file.mjs";
import { normalizeVector } from "../server/ajoop-embedding.mjs";
import {
  assertUniqueChunkIds,
  buildPortfolioChunks,
  compareRankedCandidates,
  createAjoopRag,
} from "../server/ajoop-rag.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);
const same = (label, actual, expected) =>
  check(label, JSON.stringify(actual), JSON.stringify(expected));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://kaanbalci.com";

/** A complete, valid configuration. Individual cases break one field at a time. */
const FULL_ENV = Object.freeze({
  AJOOP_AI_ALLOWED_ORIGINS: ORIGIN,
  QDRANT_URL: "https://example-cluster.qdrant.example:6333",
  QDRANT_API_KEY: "qa-test-key-not-a-real-credential",
  QDRANT_COLLECTION: "ajoop_portfolio_v1",
  QDRANT_VECTOR_SIZE: "1024",
  QDRANT_DISTANCE: "Cosine",
  AJOOP_VECTOR_BACKEND: "shadow",
});
const ALIAS = FULL_ENV.QDRANT_COLLECTION;
const EMBED_MODEL = "qwen3-embedding:0.6b";

/* ---------- A. configuration parsing ---------- */

{
  const config = resolveQdrantConfig(FULL_ENV);
  check("a complete environment is configured", config.configured, true);
  check("the requested backend is honoured", config.backend, AJOOP_VECTOR_BACKENDS.SHADOW);
  check("the URL is reduced to an origin", config.url, "https://example-cluster.qdrant.example:6333");
  check("the collection is read from the environment", config.collection, ALIAS);
  check("the vector size is parsed as a number", config.vectorSize, 1024);
  check("the distance is passed through", config.distance, "Cosine");
  check("nothing was flagged", config.issues.length, 0);
  check("the defaults still name the shipped collection", QDRANT_DEFAULTS.collection, ALIAS);
  check("the default vector size is the shipped embedding width", QDRANT_DEFAULTS.vectorSize, 1024);
  check("the default distance is Cosine", QDRANT_DEFAULTS.distance, "Cosine");
  check("the default backend is memory", QDRANT_DEFAULTS.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  /* The candidate count is no longer a tunable shortlist. */
  ok("no fixed candidate shortlist is configured", config.candidateLimit === undefined);
  ok("only an absolute ceiling remains", Number.isInteger(config.candidateCeiling));
}

check(
  "a lowercase distance is normalised to the wire spelling",
  resolveQdrantConfig({ ...FULL_ENV, QDRANT_DISTANCE: "cosine" }).distance,
  "Cosine",
);
check(
  "euclidean is accepted as Euclid",
  resolveQdrantConfig({ ...FULL_ENV, QDRANT_DISTANCE: "euclidean" }).distance,
  "Euclid",
);

for (const [label, override, issue] of [
  ["a URL with a path", { QDRANT_URL: "https://cluster.example:6333/collections" }, "url-invalid"],
  ["a URL with credentials", { QDRANT_URL: "https://user:pw@cluster.example:6333" }, "url-invalid"],
  ["a non-http scheme", { QDRANT_URL: "ftp://cluster.example" }, "url-invalid"],
  ["a URL with a query", { QDRANT_URL: "https://cluster.example?x=1" }, "url-invalid"],
  ["a key containing a newline", { QDRANT_API_KEY: "abc\ndef-injected-header" }, "api-key-invalid"],
  ["a key that is too short", { QDRANT_API_KEY: "short" }, "api-key-invalid"],
  ["a collection with a slash", { QDRANT_COLLECTION: "ajoop/portfolio" }, "collection-invalid"],
  ["a collection name too long to stage", { QDRANT_COLLECTION: "a".repeat(40) }, "collection-invalid"],
  ["a non-numeric vector size", { QDRANT_VECTOR_SIZE: "wide" }, "vector-size-invalid"],
  ["a fractional vector size", { QDRANT_VECTOR_SIZE: "1024.5" }, "vector-size-invalid"],
  ["an unknown distance", { QDRANT_DISTANCE: "Hamming" }, "distance-invalid"],
]) {
  const config = resolveQdrantConfig({ ...FULL_ENV, ...override });
  ok(`${label} is refused`, !config.configured);
  ok(`${label} records ${issue}`, config.issues.includes(issue));
  check(`${label} falls back to memory`, config.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  ok(`${label} reports the degradation`, config.degraded);
}

/* A staged physical name must fit inside Qdrant's own limit. */
{
  const longestAlias = "a".repeat(32);
  const staged = stagingCollectionName(longestAlias, buildIdFor([{ id: "x", text: "y" }], { now: 8.64e15 }));
  ok("the longest permitted alias still stages within 64 characters", staged.length <= 64);
}

/* ---------- B. missing configuration ---------- */

{
  const config = resolveQdrantConfig({});
  check("an empty environment resolves to memory", config.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  check("and requests memory in the first place", config.requestedBackend, AJOOP_VECTOR_BACKENDS.MEMORY);
  check("an empty environment is not configured", config.configured, false);
  check("an empty environment is not a degradation", config.degraded, false);
  ok("the missing URL is named", config.issues.includes("url-missing"));
  ok("the missing key is named", config.issues.includes("api-key-missing"));
  check("the collection still defaults", config.collection, ALIAS);
}

for (const backend of ["qdrant", "shadow"]) {
  const config = resolveQdrantConfig({ AJOOP_VECTOR_BACKEND: backend });
  check(`${backend} without credentials degrades to memory`, config.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  check(`${backend} without credentials records what was asked`, config.requestedBackend, backend);
  ok(`${backend} without credentials is flagged`, config.issues.includes("degraded-to-memory"));
}
{
  const config = resolveQdrantConfig({ ...FULL_ENV, AJOOP_VECTOR_BACKEND: "postgres" });
  check("an unrecognised backend resolves to memory", config.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  ok("an unrecognised backend is flagged", config.issues.includes("backend-unrecognised"));
}
check(
  "an explicit memory backend stays memory even when fully configured",
  resolveQdrantConfig({ ...FULL_ENV, AJOOP_VECTOR_BACKEND: "memory" }).backend,
  AJOOP_VECTOR_BACKENDS.MEMORY,
);

/* ---------- C. environment precedence ---------- */

{
  const parsed = parseEnvFile(
    [
      "# comment",
      "export QDRANT_COLLECTION=ajoop_portfolio_v1",
      'QDRANT_DISTANCE="Cosine"',
      "BAD LINE",
      "AJOOP_VECTOR_BACKEND=shadow # trailing",
    ].join("\n"),
  );
  check("an exported key is read", parsed.QDRANT_COLLECTION, ALIAS);
  check("a quoted value is unquoted", parsed.QDRANT_DISTANCE, "Cosine");
  check("a trailing comment is stripped", parsed.AJOOP_VECTOR_BACKEND, "shadow");
  check("a malformed line is ignored", Object.hasOwn(parsed, "BAD LINE"), false);

  const { env, loaded } = loadEnvFile(join(ROOT, "does-not-exist.env"), { QDRANT_COLLECTION: "from-shell" });
  check("a missing file changes nothing", env.QDRANT_COLLECTION, "from-shell");
  check("and reports nothing loaded", loaded.length, 0);
}

/**
 * An EXPLICITLY EMPTY variable is a decision, and it wins.
 *
 * `QDRANT_URL= npm run ...` is an operator saying "ignore the file, run
 * without it". Treating empty as unset let .env.local override them, which
 * removed the only way to turn a configured backend off without editing a file.
 */
{
  const envFile = join(ROOT, ".env.local");
  const { env: overridden, loaded } = loadEnvFile(envFile, {
    QDRANT_URL: "",
    QDRANT_API_KEY: "",
  });
  check("an empty QDRANT_URL is not refilled from the file", overridden.QDRANT_URL, "");
  check("an empty QDRANT_API_KEY is not refilled from the file", overridden.QDRANT_API_KEY, "");
  ok("the file did not supply the overridden keys", !loaded.includes("QDRANT_URL"));
  const config = resolveQdrantConfig({ ...FULL_ENV, QDRANT_URL: "", AJOOP_VECTOR_BACKEND: "shadow" });
  check("an emptied URL degrades the backend to memory", config.backend, AJOOP_VECTOR_BACKENDS.MEMORY);
  ok("and says the URL is missing", config.issues.includes("url-missing"));
}

/* ---------- D. real-corpus identity accounting ---------- */

const CORPUS_BUILD = await buildPortfolioChunks();
const REAL_CHUNKS = CORPUS_BUILD.chunks;

{
  const ids = REAL_CHUNKS.map((chunk) => chunk.id);
  check("the real corpus has unique chunk ids", new Set(ids).size, ids.length);
  check("the invariant helper agrees", assertUniqueChunkIds(REAL_CHUNKS), REAL_CHUNKS.length);

  const ingestable = selectIngestableChunks(REAL_CHUNKS);
  const excluded = REAL_CHUNKS.filter((chunk) => !isPublicSafeChunk(chunk));
  /* The accounting identity the review asked for, stated as an assertion:
   * every public chunk becomes exactly one point, and the only chunks that do
   * not are the ones deliberately withheld. */
  check(
    "public chunks = unique ingestable ids + intentionally excluded records",
    ingestable.length + excluded.length,
    REAL_CHUNKS.length,
  );
  check(
    "every ingestable chunk maps to its own point id",
    new Set(ingestable.map((chunk) => qdrantPointId(chunk.id))).size,
    ingestable.length,
  );
  ok("something is actually excluded, so the identity is not vacuous", excluded.length > 0);
  ok(
    "every excluded record is on-request material",
    excluded.every((chunk) => chunk.visibility === "public_on_request"),
  );
}

/**
 * The four build-log records that used to disappear.
 *
 * Three entries share 2026-08-23 and three share 2026-08-22. The chunk id was
 * derived from the date, so six records collided into two ids and four
 * canonical records were silently dropped at ingestion. Each must now be
 * present, individually addressable, and distinct.
 */
{
  const buildLog = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "build-log.json"), "utf8"));
  const ids = buildLog.map((entry) => entry.id);
  check("every build-log entry declares an id", ids.filter(Boolean).length, buildLog.length);
  check("build-log ids are unique", new Set(ids).size, ids.length);
  ok(
    "build-log ids are stable slugs, not dates or positions",
    ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !/^\d{4}-\d{2}-\d{2}$/.test(id)),
  );

  const dates = buildLog.map((entry) => entry.date);
  ok("the collision the old scheme hit is still present in the data", new Set(dates).size < dates.length);

  const chunks = REAL_CHUNKS.filter((chunk) => chunk.source === "build-log");
  check("every build-log entry produced a chunk", chunks.length, buildLog.length);
  check("and each has a distinct chunk id", new Set(chunks.map((chunk) => chunk.id)).size, buildLog.length);
  for (const entry of buildLog) {
    ok(
      `build-log record survives ingestion: ${entry.id}`,
      chunks.some((chunk) => chunk.entityId === entry.id),
    );
  }
  /* The four that were being lost, named explicitly. */
  for (const id of [
    "react-migration-foundation-v1",
    "asset-lcp-optimization-v1",
    "semantic-card-accessibility-cleanup",
    "architecture-v2-production-audit",
  ]) {
    ok(`previously lost record is present: ${id}`, chunks.some((chunk) => chunk.entityId === id));
    ok(
      `previously lost record has its own point: ${id}`,
      selectIngestableChunks(chunks).some((chunk) => chunk.entityId === id),
    );
  }
}

/** A duplicate id is a hard failure, in the corpus and at the ingestion boundary. */
{
  const collide = [
    { id: "build-log:same:1", source: "build-log", entityId: "same", title: "First", text: "a" },
    { id: "build-log:same:1", source: "build-log", entityId: "same", title: "Second", text: "b" },
  ];
  let corpusError = null;
  try {
    assertUniqueChunkIds(collide);
  } catch (error) {
    corpusError = error;
  }
  ok("a duplicate chunk id throws in the corpus builder", Boolean(corpusError));
  ok("and names the collision", /duplicate chunk id/.test(corpusError?.message || ""));
  ok("and identifies both records", /First/.test(corpusError?.message || ""));

  let pointError = null;
  try {
    assertUniquePointIds(collide);
  } catch (error) {
    pointError = error;
  }
  ok("a duplicate point id throws at the ingestion boundary", Boolean(pointError));
  ok("and is never silently skipped", /duplicate qdrant point id/.test(pointError?.message || ""));

  let planError = null;
  try {
    planQdrantBuild({ chunks: collide, alias: ALIAS });
  } catch (error) {
    planError = error;
  }
  ok("planning a build with a duplicate id fails loudly", Boolean(planError));
}

/** An item record with no id is a data defect, refused rather than patched. */
{
  ok(
    "the chunker refuses an item record with no stable id",
    (await readFile(join(ROOT, "server", "ajoop-rag.mjs"), "utf8")).includes(
      'item records must carry an explicit identifier',
    ),
  );
}

/* ---------- E. payload, ownership and manifest ---------- */

const chunk = (overrides) => ({
  id: "master-knowledge:project:sinama:1",
  source: "master-knowledge",
  entityId: "project:sinama",
  title: "SINAMA",
  text: "source: master-knowledge\nentity: project:sinama\nStack: FastAPI, Postgres.",
  entityType: "project",
  visibility: "public",
  priority: 1,
  tags: ["project", "sinama"],
  metadata: { slug: "sinama" },
  ...overrides,
});

const CORPUS = [
  chunk(),
  chunk({ id: "master-knowledge:project:merge-rush:1", entityId: "project:merge-rush", title: "Merge Rush", text: "Stack: Phaser." }),
  chunk({
    id: "master-knowledge:contacts:on-request:1",
    entityId: "contacts:on-request",
    title: "Contact on request",
    visibility: "public_on_request",
    text: "Phone number: redacted.",
  }),
];

const CONFIG = resolveQdrantConfig(FULL_ENV);
const clientFor = (mock, config = CONFIG) => createQdrantClient({ config, fetchImpl: mock.fetchImpl });

/**
 * The LOCAL corpus descriptor readiness compares a remote store against.
 *
 * Every verification in this suite supplies one, because verification without a
 * local expectation is exactly the weakness this pass exists to remove: a
 * manifest vouching for itself.
 */
/**
 * A fixture vector widened to the collection's declared dimension.
 *
 * The mock now enforces the same dimension contract Qdrant does, so a 3-element
 * adversarial vector against a 1024-d collection is a 400 — exactly as it would
 * be live. Padding with zeros keeps every dot product and every tie identical
 * while making the fixtures honest about width.
 */
const pad = (values) => {
  const wide = new Array(CONFIG.vectorSize).fill(0);
  values.forEach((value, position) => {
    wide[position] = value;
  });
  return wide;
};

const descriptorFor = (chunks) => buildCorpusDescriptor(chunks, { embeddingModel: EMBED_MODEL });
const DESCRIPTOR = descriptorFor(CORPUS);


{
  const payload = buildQdrantPayload(chunk(), { buildId: "s2i2-abc-1" });
  for (const field of [
    "corpus_owner",
    "record_kind",
    "build_id",
    "chunk_id",
    "entity_id",
    "record_type",
    "title",
    "source",
    "tags",
    "text",
    "content_hash",
    "schema_version",
    "index_version",
    "visibility",
    "public_safe",
    "priority",
    "affinity_hints",
    "metadata",
  ]) {
    ok(`the payload carries ${field}`, Object.hasOwn(payload, field));
  }
  check("every point declares its owner", payload.corpus_owner, AJOOP_CORPUS_OWNER);
  check("a corpus record is a chunk", payload.record_kind, RECORD_KINDS.CHUNK);
  check("the build id is stamped", payload.build_id, "s2i2-abc-1");
  check("chunk_id is the chunk id", payload.chunk_id, "master-knowledge:project:sinama:1");
  check("record_type follows the entity type", payload.record_type, "project");
  check("the schema version is stamped", payload.schema_version, QDRANT_PAYLOAD_SCHEMA_VERSION);
  check("the index version is stamped", payload.index_version, QDRANT_INDEX_VERSION);
  check("a public record is public-safe", payload.public_safe, true);
  check("the content hash is a sha256 hex digest", /^[0-9a-f]{64}$/.test(payload.content_hash), true);
  check("retrieval priority survives", payload.priority, 1);

  const dataset = buildQdrantPayload({
    id: "projects:sinama:1",
    source: "projects",
    entityId: "sinama",
    title: "SINAMA",
    text: "title: SINAMA",
    affinityHints: ["sinama"],
  });
  check("a dataset chunk reports a record type", dataset.record_type, "dataset");
  check("a dataset chunk has no invented entity type", dataset.entity_type, null);
  check("a dataset chunk defaults to public", dataset.visibility, "public");
  same("affinity hints survive", dataset.affinity_hints, ["sinama"]);

  check("an on-request record is marked not public-safe", buildQdrantPayload(chunk({ visibility: "public_on_request" })).public_safe, false);
  same("the payload is deterministic across calls", buildQdrantPayload(chunk()), buildQdrantPayload(chunk()));

  const point = buildQdrantPoint(chunk(), [0.1, 0.2]);
  same("a point is id + vector + payload", Object.keys(point).sort(), ["id", "payload", "vector"]);
}

/* The retrieval filter closes three separate holes. */
{
  const keys = PUBLIC_SAFE_FILTER.must.map((clause) => clause.key);
  same("every search filters owner, kind and visibility", keys.sort(), [
    "corpus_owner",
    "public_safe",
    "record_kind",
  ]);
}

/* The manifest is a completion marker, excluded from retrieval twice over. */
{
  const manifest = buildManifestPoint({
    buildId: "s2i2-0123456789ab-1",
    corpusPoints: 191,
    vectorSize: 1024,
    distance: "Cosine",
    corpusFingerprint: "a".repeat(64),
    embeddingModel: EMBED_MODEL,
    builtAt: "2026-09-06T00:00:00.000Z",
  });
  check("the manifest has a fixed id", manifest.id, MANIFEST_POINT_ID);
  check("the manifest vector matches the collection width", manifest.vector.length, 1024);
  check("the manifest declares the owner", manifest.payload.corpus_owner, AJOOP_CORPUS_OWNER);
  check("the manifest is not a chunk", manifest.payload.record_kind, RECORD_KINDS.MANIFEST);
  check("the manifest marks the build complete", manifest.payload.complete, true);
  check("the manifest is not public-safe", manifest.payload.public_safe, false);
  check("the manifest records the corpus size", manifest.payload.corpus_points, 191);
  check("the manifest records the corpus fingerprint", manifest.payload.corpus_fingerprint, "a".repeat(64));
  check("the manifest records the embedding model", manifest.payload.embedding_model, EMBED_MODEL);
  check("the manifest records when it was built", manifest.payload.built_at, "2026-09-06T00:00:00.000Z");
  /* Every field the review requires, present by name. */
  for (const field of [
    "record_kind",
    "corpus_owner",
    "build_id",
    "built_at",
    "complete",
    "schema_version",
    "index_version",
    "embedding_model",
    "vector_size",
    "distance",
    "corpus_points",
    "corpus_fingerprint",
  ]) {
    ok(`the manifest carries ${field}`, Object.hasOwn(manifest.payload, field));
  }
}

/* ---------- E2. the local corpus descriptor ---------- */

/**
 * The fingerprint is the whole basis of remote-equals-local, so it has to be
 * insensitive to everything except the corpus itself.
 */
{
  const descriptor = descriptorFor(CORPUS);
  check("the descriptor counts only ingestable records", descriptor.expectedCorpusPoints, 2);
  check("the fingerprint is a sha256 digest", /^[0-9a-f]{64}$/.test(descriptor.expectedCorpusFingerprint), true);
  check(
    "the fingerprint ignores input order",
    descriptorFor([...CORPUS].reverse()).expectedCorpusFingerprint,
    descriptor.expectedCorpusFingerprint,
  );
  ok(
    "a changed record changes the fingerprint",
    descriptorFor([chunk({ text: "different" }), CORPUS[1], CORPUS[2]]).expectedCorpusFingerprint !==
      descriptor.expectedCorpusFingerprint,
  );
  ok(
    "a removed record changes the fingerprint",
    descriptorFor([CORPUS[0], CORPUS[2]]).expectedCorpusFingerprint !== descriptor.expectedCorpusFingerprint,
  );
  ok(
    "a schema bump changes the fingerprint",
    buildCorpusDescriptor(CORPUS, { schemaVersion: 99 }).expectedCorpusFingerprint !==
      descriptor.expectedCorpusFingerprint,
  );
  ok(
    "an index bump changes the fingerprint",
    buildCorpusDescriptor(CORPUS, { indexVersion: 99 }).expectedCorpusFingerprint !==
      descriptor.expectedCorpusFingerprint,
  );

  /* Concatenation must not be ambiguous: two different corpora cannot
   * serialise to the same string. */
  const ambiguous = fingerprintDescriptorLines([corpusDescriptorLine({ id: "a|b", text: "x" })]);
  const other = fingerprintDescriptorLines([corpusDescriptorLine({ id: "a", text: "x" })]);
  ok("a separator inside a chunk id cannot forge a line", ambiguous !== other);

  /* The local and remote line builders must agree, or the two fingerprints
   * would never match even for an identical corpus. */
  const payload = buildQdrantPayload(CORPUS[0]);
  check(
    "a stored payload rebuilds its own descriptor line",
    remoteDescriptorLine(payload),
    corpusDescriptorLine(CORPUS[0]),
  );

  /* Cross-process stability. */
  const child = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { corpusDescriptorLine, fingerprintDescriptorLines } from ${JSON.stringify(pathToFileURL(join(ROOT, "server", "ajoop-qdrant-points.mjs")).href)};` +
        `const chunks = ${JSON.stringify(selectIngestableChunks(CORPUS))};` +
        `process.stdout.write(fingerprintDescriptorLines(chunks.map((c) => corpusDescriptorLine(c))));`,
    ],
    { encoding: "utf8" },
  );
  check("the fingerprint is identical in a separate process", child.trim(), descriptor.expectedCorpusFingerprint);

  check("a well-formed build id is accepted", isValidBuildId("s2i2-0123456789ab-abc"), true);
  check("a foreign build id is refused", isValidBuildId("someone-elses-build"), false);
  check("an empty build id is refused", isValidBuildId(""), false);
}

/* Build ids name a corpus state, not a moment. */
{
  const a = [chunk(), chunk({ id: "b", text: "second" })];
  check("the same corpus fingerprints identically", corpusFingerprint(a), corpusFingerprint([...a].reverse()));
  ok("a changed corpus fingerprints differently", corpusFingerprint(a) !== corpusFingerprint([chunk()]));
  const id = buildIdFor(a, { now: 1_700_000_000_000 });
  check("a build id is deterministic given a clock", buildIdFor(a, { now: 1_700_000_000_000 }), id);
  ok("a build id names the schema and index contract", id.startsWith(`s${QDRANT_PAYLOAD_SCHEMA_VERSION}i${QDRANT_INDEX_VERSION}-`));
  ok("two runs of the same corpus differ by clock", buildIdFor(a, { now: 1_700_000_000_001 }) !== id);
}

/* ---------- F. deterministic point ids ---------- */

{
  const id = qdrantPointId("master-knowledge:project:sinama:1");
  check("a point id is a UUID", /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), true);
  check("the same chunk id always yields the same point id", qdrantPointId("master-knowledge:project:sinama:1"), id);
  ok("a different chunk id yields a different point id", qdrantPointId("master-knowledge:project:sinama:2") !== id);
  check("the namespace is fixed", AJOOP_QDRANT_NAMESPACE, "3f2a6c1e-9b47-4c8d-8f21-5a0d7e6b4c93");
  check("uuidV5 is stable for a known name", uuidV5("chunk:master-knowledge:project:sinama:1"), id);
  const child = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { qdrantPointId } from ${JSON.stringify(pathToFileURL(join(ROOT, "server", "ajoop-qdrant-points.mjs")).href)};` +
        `process.stdout.write(qdrantPointId("master-knowledge:project:sinama:1"));`,
    ],
    { encoding: "utf8" },
  );
  check("the id is identical in a separate process", child.trim(), id);
}

{
  const base = chunk();
  check("the same chunk hashes identically", chunkContentHash(base), chunkContentHash(chunk()));
  ok("changed text changes the hash", chunkContentHash(chunk({ text: "different" })) !== chunkContentHash(base));
  ok(
    "a changed visibility changes the hash",
    chunkContentHash(chunk({ visibility: "public_on_request" })) !== chunkContentHash(base),
  );
  check("tag order does not change the hash", chunkContentHash(chunk({ tags: ["sinama", "project"] })), chunkContentHash(base));
}

/* ---------- the mock cluster ---------- */

/**
 * A mock Qdrant cluster with real state: collections, points and aliases.
 *
 * Atomicity, ownership and promotion cannot be asserted against a call log —
 * they are claims about what the cluster CONTAINS after a sequence of
 * operations, including a failed one. `failWith` can be a code, a status, or a
 * function that decides per request, which is how a mid-build failure is
 * driven.
 */
function createMockQdrant({
  collections = new Map(),
  aliases = new Map(),
  failWith = null,
  searchOrder = null,
  latency = 0,
  /* Return hits in the OPPOSITE order to the local index, to prove backend hit
   * order cannot reach the ranking. */
  reverseHits = false,
  /* Return one identical score for every hit, so nothing but the local
   * tie-break can separate candidates. */
  flatScore = false,
  /* Mutilate the hit list on its way out: exactly the shapes a real cluster
   * produces when a limit is clamped, a replica lags, or a collection drifts
   * under a running bridge. */
  truncate = null,
  /* Reproduces Qdrant Cloud strict mode: refuse a filtered search over
   * unindexed payload, and optionally refuse exact search. */
  strictMode = { unindexedFiltering: false, searchAllowExact: true },
} = {}) {
  const state = {
    collections, // name → { vectors, points: Map }
    aliases, // alias → collection name
    calls: [],
    searches: [],
    authHeaders: [],
    urls: [],
    failWith,
    deletedCollections: [],
    reversedHits: 0,
    indexed: [],
  };

  /*  matters: the client classifies an error body into a safe symbol,
   * and a mock without it would silently exercise the no-detail path. */
  const respond = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const resolveName = (name) => state.aliases.get(name) || name;

  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname + (parsed.search || "");
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const call = { method: init.method, path, body };
    state.calls.push(call);
    state.urls.push(String(url));
    state.authHeaders.push(init?.headers?.["api-key"]);

    const failure = typeof state.failWith === "function" ? state.failWith(call, state) : state.failWith;
    if (failure === "network") throw new Error("connection refused");
    if (failure === "abort") {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    if (failure === "malformed") {
      return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } };
    }
    if (typeof failure === "number") return respond({ status: { error: "denied" } }, failure);
    if (latency) await new Promise((done) => setTimeout(done, latency));

    /* /collections/aliases must be matched before the {name} routes. */
    if (path === "/collections/aliases" && init.method === "POST") {
      for (const action of body.actions || []) {
        if (action.delete_alias) state.aliases.delete(action.delete_alias.alias_name);
        if (action.create_alias) {
          const { alias_name: alias, collection_name: target } = action.create_alias;
          if (state.collections.has(alias)) return respond({ status: { error: "name in use" } }, 400);
          if (!state.collections.has(target)) return respond({ status: { error: "no such collection" } }, 404);
          state.aliases.set(alias, target);
        }
      }
      return respond({ result: true });
    }
    if (path === "/collections" && init.method === "GET") {
      return respond({ result: { collections: [...state.collections.keys()].map((name) => ({ name })) } });
    }
    if (path === "/aliases" && init.method === "GET") {
      return respond({
        result: {
          aliases: [...state.aliases.entries()].map(([alias, target]) => ({
            alias_name: alias,
            collection_name: target,
          })),
        },
      });
    }

    const nameMatch = path.match(/^\/collections\/([^/?]+)(.*)$/);
    if (!nameMatch) return respond({ status: { error: "unexpected" } }, 500);
    const rawName = decodeURIComponent(nameMatch[1]);
    const rest = nameMatch[2] || "";
    const name = resolveName(rawName);
    const collection = state.collections.get(name);

    if (rest === "" && init.method === "GET") {
      if (!collection) return respond({ status: { error: "Not found" } }, 404);
      return respond({ result: { config: { params: { vectors: collection.vectors } } } });
    }
    if (rest === "" && init.method === "PUT") {
      state.collections.set(rawName, {
        vectors: { size: body.vectors.size, distance: body.vectors.distance },
        points: new Map(),
        indexes: new Set(),
      });
      return respond({ result: true });
    }
    if (rest === "" && init.method === "DELETE") {
      if (!state.collections.has(name)) return respond({ status: { error: "Not found" } }, 404);
      state.collections.delete(name);
      state.deletedCollections.push(name);
      return respond({ result: true });
    }
    if (rest === "/aliases" && init.method === "GET") {
      const found = [...state.aliases.entries()].filter(([, target]) => target === name);
      return respond({ result: { aliases: found.map(([alias]) => ({ alias_name: alias })) } });
    }
    if (!collection) return respond({ status: { error: "Not found" } }, 404);

    if (rest.startsWith("/index") && init.method === "PUT") {
      /* Same contract Qdrant enforces: a field name and a known schema. */
      if (typeof body?.field_name !== "string" || !body.field_name) {
        return respond({ status: { error: "Wrong input: field_name" } }, 400);
      }
      if (!["keyword", "integer", "float", "bool", "geo", "text", "datetime", "uuid"].includes(body?.field_schema)) {
        return respond({ status: { error: "Wrong input: field_schema" } }, 400);
      }
      collection.indexes.add(body.field_name);
      state.indexed.push({ collection: name, field: body.field_name, schema: body.field_schema });
      return respond({ result: { status: "completed" } });
    }
    if (rest.startsWith("/points?") && init.method === "PUT") {
      for (const point of body.points) collection.points.set(String(point.id), point);
      return respond({ result: { status: "completed" } });
    }
    if (rest === "/points" && init.method === "POST") {
      const found = (body.ids || [])
        .map((id) => collection.points.get(String(id)))
        .filter(Boolean)
        .map((point) => ({ id: point.id, payload: point.payload }));
      return respond({ result: found });
    }
    if (rest.startsWith("/points/scroll")) {
      const all = [...collection.points.values()].map((point) => ({ id: point.id, payload: point.payload }));
      return respond({ result: { points: all, next_page_offset: null } });
    }
    if (rest.startsWith("/points/count")) {
      return respond({ result: { count: collection.points.size } });
    }
    if (rest.startsWith("/points/delete")) {
      for (const id of body.points) collection.points.delete(String(id));
      return respond({ result: { status: "completed" } });
    }
    if (rest.startsWith("/points/search")) {
      state.searches.push({ collection: name, ...body });

      /**
       * The real Qdrant Search Points contract, enforced.
       *
       * Accepting arbitrary JSON here is what let a structurally wrong request
       * pass every deterministic test and fail live with a bare 400. Each check
       * mirrors a refusal the cluster actually makes, and `strictMode`
       * reproduces the managed-cluster behaviour that rejects a filtered search
       * over unindexed payload — the one request an ingestion makes that
       * filters at all.
       */
      const vector = body?.vector;
      if (!Array.isArray(vector) || !vector.length) {
        return respond({ status: { error: "Wrong input: vector must be a non-empty array" } }, 400);
      }
      if (!vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
        return respond({ status: { error: "Wrong input: vector must contain finite numbers" } }, 400);
      }
      if (vector.length !== collection.vectors.size) {
        return respond(
          { status: { error: `Wrong input: Vector dimension error: expected dim: ${collection.vectors.size}, got ${vector.length}` } },
          400,
        );
      }
      if (!Number.isInteger(body?.limit) || body.limit < 1) {
        return respond({ status: { error: "Wrong input: limit must be a positive integer" } }, 400);
      }
      if (body.with_payload !== undefined && typeof body.with_payload !== "boolean" && !Array.isArray(body.with_payload)) {
        return respond({ status: { error: "Wrong input: with_payload" } }, 400);
      }
      if (body.with_vector !== undefined && typeof body.with_vector !== "boolean") {
        return respond({ status: { error: "Wrong input: with_vector" } }, 400);
      }
      if (body.params !== undefined) {
        const allowed = ["hnsw_ef", "exact", "quantization", "indexed_only"];
        if (typeof body.params !== "object" || body.params === null) {
          return respond({ status: { error: "Wrong input: params" } }, 400);
        }
        for (const key of Object.keys(body.params)) {
          if (!allowed.includes(key)) return respond({ status: { error: `Wrong input: params.${key}` } }, 400);
        }
        if (body.params.exact !== undefined && typeof body.params.exact !== "boolean") {
          return respond({ status: { error: "Wrong input: params.exact" } }, 400);
        }
        if (strictMode?.searchAllowExact === false && body.params.exact === true) {
          return respond({ status: { error: "Strict mode: exact search is not allowed" } }, 400);
        }
      }
      if (body.filter !== undefined) {
        if (typeof body.filter !== "object" || body.filter === null || !Array.isArray(body.filter.must)) {
          return respond({ status: { error: "Wrong input: filter" } }, 400);
        }
        for (const clause of body.filter.must) {
          if (typeof clause?.key !== "string" || !clause.key) {
            return respond({ status: { error: "Wrong input: filter clause key" } }, 400);
          }
          const value = clause?.match?.value;
          if (!["string", "number", "boolean"].includes(typeof value)) {
            return respond({ status: { error: "Wrong input: filter clause match" } }, 400);
          }
          /* The managed-cluster refusal this whole fix exists for. */
          if (strictMode?.unindexedFiltering === false && !collection.indexes.has(clause.key)) {
            return respond(
              { status: { error: `Index required but not found for "${clause.key}" of one of the following types: [keyword]` } },
              400,
            );
          }
        }
      }
      const matches = [...collection.points.values()].filter((point) => {
        if (!body.filter) return true;
        return (body.filter.must || []).every((clause) => point.payload?.[clause.key] === clause.match.value);
      });
      /**
       * A REAL similarity search, against the stored vectors.
       *
       * Scoring by insertion order would make a parity assertion meaningless:
       * the two backends would agree or disagree for reasons invented by the
       * mock. Computing the same dot product the in-memory index computes is
       * what makes "memory and Qdrant rank identically" a claim about the code
       * rather than about the fixture.
       */
      const scored = matches.map((point) => ({
        point,
        score: (point.vector || []).reduce(
          (total, value, position) => total + value * (body.vector[position] || 0),
          0,
        ),
      }));
      const ordered = searchOrder
        ? scored.sort((a, b) => searchOrder(b.point.payload) - searchOrder(a.point.payload))
        : scored.sort((a, b) => b.score - a.score);
      const page = ordered.slice(0, body.limit);
      if (reverseHits) {
        page.reverse();
        state.reversedHits += 1;
      }
      const rows = page.map(({ point, score }, position) => ({
        id: point.id,
        /* `flatScore` hands every hit the same number; `searchOrder` fakes a
         * descending one. Neither may influence the final ranking. */
        score: flatScore ? 0.5 : searchOrder ? 1 - position * 0.001 : score,
        payload: point.payload,
      }));
      /* Only retrieval queries are mutilated. The ingestion search probe asks
       * for one hit, and breaking that would fail the build instead of
       * exercising the runtime completeness check this hook exists for. */
      const mutilate = truncate && body.limit > 1;
      return respond({ result: mutilate ? truncate(rows) : rows });
    }
    return respond({ status: { error: "unexpected" } }, 500);
  };

  return { state, fetchImpl };
}

const countingEmbed = (width = CONFIG.vectorSize) => {
  const state = { calls: 0, inputs: 0 };
  const embed = async (inputs) => {
    state.calls += 1;
    state.inputs += inputs.length;
    return inputs.map(() => Array.from({ length: width }, (unused, position) => (position === 0 ? 1 : 0)));
  };
  return { embed, state };
};

/* ---------- G. ingestion is a staged build, never an in-place mutation ---------- */

{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const embed = countingEmbed();
  const result = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: embed.embed });

  check("the build embedded only public records", embed.state.inputs, 2);
  check("the build wrote both records", result.written, 2);
  check("the build was promoted", result.promoted, true);
  ok("the staging collection is a distinct physical name", result.staging !== ALIAS);
  ok("named after the alias", result.staging.startsWith(`${ALIAS}_`));
  check("the alias now resolves to the new build", mock.state.aliases.get(ALIAS), result.staging);
  check("the alias is not itself a collection", mock.state.collections.has(ALIAS), false);
  check("the on-request record was never ingested", result.excludedOnRequest, 1);

  const stored = mock.state.collections.get(result.staging).points;
  check("the collection holds the corpus plus one manifest", stored.size, 3);
  ok("the manifest is present", stored.has(MANIFEST_POINT_ID));
  ok(
    "no stored corpus point is on-request material",
    [...stored.values()]
      .filter((point) => point.payload.record_kind === RECORD_KINDS.CHUNK)
      .every((point) => point.payload.public_safe === true),
  );
  ok(
    "every stored point declares our ownership",
    [...stored.values()].every((point) => point.payload.corpus_owner === AJOOP_CORPUS_OWNER),
  );

  /* The manifest is written LAST — that ordering is what makes it a completion
   * marker rather than an intention. */
  const upserts = mock.state.calls.filter((call) => call.method === "PUT" && call.path.includes("/points"));
  const lastUpsert = upserts.at(-1);
  check("the manifest is the final write", lastUpsert.body.points[0].id, MANIFEST_POINT_ID);

  /* Verification and a real search happen before the alias moves. */
  const promoteIndex = mock.state.calls.findIndex((call) => call.path === "/collections/aliases");
  const searchIndex = mock.state.calls.findIndex((call) => call.path.includes("/points/search"));
  const countIndex = mock.state.calls.findIndex((call) => call.path.includes("/points/count"));
  ok("the search probe runs before promotion", searchIndex >= 0 && searchIndex < promoteIndex);
  ok("the point count is verified before promotion", countIndex >= 0 && countIndex < promoteIndex);

  const verified = await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
  check("the promoted alias verifies", verified.ok, true);
  check("and reports the corpus size", verified.corpusPoints, 2);
  check("and the build id", verified.buildId, result.buildId);
}

/**
 * A second build replaces the first atomically — and DELETES NOTHING.
 *
 * Ajoop 5.3 ends a successful ingestion at the alias promotion. The previous
 * physical collection stays on the cluster and is reported for an operator to
 * remove. An orphan collection costs a few megabytes; a wrong automatic
 * deletion costs data at the moment nobody is watching.
 */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const first = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_000_000 });
  const second = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_100_000 });

  ok("the second build wrote a different collection", second.staging !== first.staging);
  check("the alias points at the newest build", mock.state.aliases.get(ALIAS), second.staging);
  check("the previous build is named", second.previous, first.staging);

  check("nothing was deleted", second.deleted.length, 0);
  ok("the previous build is still on the cluster", mock.state.collections.has(first.staging));
  check("both builds remain", mock.state.collections.size, 2);
  check("the previous collection is reported", second.previousPhysicalCollection, first.staging);
  check("and flagged for manual cleanup", second.cleanupRequired, true);

  /* The hard guarantee: after the LAST promotion, zero DELETE calls of any
   * kind — and no listing, because nothing goes looking for candidates. */
  const promoteIndex = mock.state.calls.map((call) => call.path).lastIndexOf("/collections/aliases");
  ok("a promotion happened", promoteIndex >= 0);
  const afterPromotion = mock.state.calls.slice(promoteIndex);
  check(
    "zero collection deletes after promotion",
    afterPromotion.filter((call) => call.method === "DELETE").length,
    0,
  );
  check("no collection was deleted in the whole run", mock.state.deletedCollections.length, 0);
  ok(
    "no point deletion was ever issued",
    !mock.state.calls.some((call) => call.path.includes("/points/delete")),
  );
  /* And it never even looked: no scanning for candidates. */
  const listAfter = afterPromotion.filter((call) => call.path === "/collections" && call.method === "GET");
  check("no collection listing after promotion", listAfter.length, 0);

  /* A first build has no previous target and says so. */
  check("a first build reports no previous collection", first.previousPhysicalCollection, null);
  check("and requires no cleanup", first.cleanupRequired, false);

  /* The module states the policy as a constant, so a future change is a
   * visible edit rather than a quiet behavioural drift. */
  check("automatic cleanup is off by construction", AJOOP_AUTOMATIC_CLEANUP, false);
}

/**
 * Third parties on the cluster are never touched, by anything, ever.
 *
 * These decoys used to be the interesting case for a cleanup routine that went
 * looking. There is no such routine now, so the assertion is simply that
 * everything is still there.
 */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  mock.state.collections.set("someone_elses_data", {
    vectors: { size: 1024, distance: "Cosine" },
    points: new Map([["x", { id: "x", payload: { text: "not ours" } }]]),
  });
  mock.state.collections.set(`${ALIAS}_lookalike`, {
    vectors: { size: 1024, distance: "Cosine" },
    points: new Map([["y", { id: "y", payload: { text: "no manifest" } }]]),
  });
  mock.state.collections.set(`${ALIAS}_foreign`, {
    vectors: { size: 1024, distance: "Cosine" },
    points: new Map([
      [MANIFEST_POINT_ID, { id: MANIFEST_POINT_ID, payload: { corpus_owner: "someone-else", record_kind: RECORD_KINDS.MANIFEST } }],
    ]),
  });

  const first = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_000_000 });
  const second = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_100_000 });

  same("nothing at all was deleted", mock.state.deletedCollections, []);
  ok("the foreign collection survives", mock.state.collections.has("someone_elses_data"));
  ok("the manifest-less lookalike survives", mock.state.collections.has(`${ALIAS}_lookalike`));
  ok("the foreign-owned lookalike survives", mock.state.collections.has(`${ALIAS}_foreign`));
  ok("the first build survives", mock.state.collections.has(first.staging));
  ok("the second build is live", mock.state.collections.has(second.staging));
  check("all five collections remain", mock.state.collections.size, 5);
  check("the alias points at the newest", mock.state.aliases.get(ALIAS), second.staging);
}

/**
 * A malformed or fake previous target is also simply left alone.
 *
 * Under the previous design each of these exercised a different branch of a
 * verification routine that decided whether to delete. Now there is no branch:
 * the answer is always "leave it".
 */
for (const [label, damage] of [
  ["an incomplete manifest", { complete: false }],
  ["a foreign owner", { corpus_owner: "someone-else" }],
  ["an invalid build id", { build_id: "not-ours" }],
  ["an unparseable timestamp", { built_at: "whenever" }],
  ["a manifest that is not a manifest", { record_kind: RECORD_KINDS.CHUNK }],
  ["a manifest removed entirely", null],
]) {
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const first = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_000_000 });
  const points = mock.state.collections.get(first.staging).points;
  if (damage === null) points.delete(MANIFEST_POINT_ID);
  else {
    const manifest = points.get(MANIFEST_POINT_ID);
    manifest.payload = { ...manifest.payload, ...damage };
  }

  const second = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_100_000 });
  check(`${label} deletes nothing`, second.deleted.length, 0);
  check(`${label} is reported for manual cleanup`, second.previousPhysicalCollection, first.staging);
  check(`${label} flags cleanup required`, second.cleanupRequired, true);
  ok(`${label} leaves the collection in place`, mock.state.collections.has(first.staging));
  check(`${label} still promoted the new build`, mock.state.aliases.get(ALIAS), second.staging);
  same(`${label} issued no deletion`, mock.state.deletedCollections, []);
}

/* ---------- H. a failed build never moves the alias ---------- */

for (const [label, failAt] of [
  ["a mid-build upsert failure", (call, state) => (call.path.includes("/points?") && state.calls.filter((c) => c.path.includes("/points?")).length >= 2 ? 500 : null)],
  ["a network drop", (call, state) => (call.path.includes("/points?") ? "network" : null)],
  ["a timeout", (call) => (call.path.includes("/points?") ? "abort" : null)],
]) {
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const good = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_000_000 });
  const aliasBefore = mock.state.aliases.get(ALIAS);
  const pointsBefore = mock.state.collections.get(good.staging).points.size;

  mock.state.failWith = failAt;
  let thrown = null;
  try {
    await runQdrantIngestion({
      client,
      config: { ...CONFIG, upsertBatchSize: 1 },
      embeddingModel: EMBED_MODEL,
      chunks: CORPUS,
      embed: countingEmbed().embed,
      now: () => 1_700_000_200_000,
    });
  } catch (error) {
    thrown = error;
  }
  mock.state.failWith = null;

  ok(`${label} fails the build`, Boolean(thrown));
  check(`${label} reports the alias was not moved`, thrown?.aliasMoved, false);
  check(`${label} leaves the alias untouched`, mock.state.aliases.get(ALIAS), aliasBefore);
  check(`${label} leaves the live corpus intact`, mock.state.collections.get(good.staging).points.size, pointsBefore);
  const verified = await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
  check(`${label} leaves the previous corpus still verifiable`, verified.ok, true);
}

/** A build that writes everything but fails verification is not promoted. */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const good = await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_000_000 });
  const aliasBefore = mock.state.aliases.get(ALIAS);

  /* The count comes back wrong, which is exactly the "points appeared or
   * vanished behind the build" case verification exists to catch. */
  mock.state.failWith = (call) => (call.path.includes("/points/count") ? 500 : null);
  let thrown = null;
  try {
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed, now: () => 1_700_000_300_000 });
  } catch (error) {
    thrown = error;
  }
  mock.state.failWith = null;
  ok("a build failing verification throws", Boolean(thrown));
  check("and names the verification reason", thrown?.verification?.reason, "unreachable");
  check("and the alias never moved", mock.state.aliases.get(ALIAS), aliasBefore);
  check("and its staging collection was cleaned up", mock.state.collections.size, 1);
}

/** The alias name must not already be a physical collection. */
{
  const mock = createMockQdrant({
    collections: new Map([[ALIAS, { vectors: { size: 1024, distance: "Cosine" }, points: new Map() }]]),
  });
  const client = clientFor(mock);
  let thrown = null;
  try {
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  } catch (error) {
    thrown = error;
  }
  ok("an occupied alias name is refused", Boolean(thrown));
  check("with a specific reason", thrown?.reason, "alias-name-occupied");
  check("before anything was created", mock.state.collections.size, 1);
  check("and before anything was embedded", mock.state.calls.some((call) => call.method === "PUT"), false);
}

/* ---------- J. dry run writes nothing ---------- */

{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const planned = await runQdrantIngestion({
    client,
    config: CONFIG,
    embeddingModel: EMBED_MODEL,
    chunks: CORPUS,
    embed: countingEmbed().embed,
    dryRun: true,
  });
  check("a dry run creates no collection", mock.state.collections.size, 0);
  check("a dry run issues no write", mock.state.calls.some((call) => call.method === "PUT"), false);
  check("a dry run moves no alias", mock.state.aliases.size, 0);
  check("a dry run deletes nothing", mock.state.deletedCollections.length, 0);
  check("a dry run reports the planned point count", planned.plannedPoints, 2);
  check("a dry run names the staging collection it would create", planned.staging.startsWith(`${ALIAS}_`), true);
  check("a dry run did not promote", planned.promoted, false);

  const embed = countingEmbed();
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: embed.embed, dryRun: true });
  check("a dry run embeds nothing", embed.state.calls, 0);
}

/* ---------- K. readiness is a statement about the cluster ---------- */

{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  check("an absent collection is not ready", (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).reason, "missing");

  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  const verified = await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
  check("a promoted build is ready", verified.ok, true);
  check("readiness reports the corpus size", verified.corpusPoints, 2);
  check("readiness counts the manifest in the total", verified.totalPoints, 3);

  const active = mock.state.aliases.get(ALIAS);
  const points = mock.state.collections.get(active).points;

  /* Each of these is a different way a collection can look fine and be wrong. */
  const manifest = points.get(MANIFEST_POINT_ID);
  const restore = JSON.parse(JSON.stringify(manifest.payload));
  const mutate = async (label, change, reason) => {
    points.set(MANIFEST_POINT_ID, { ...manifest, payload: { ...restore, ...change } });
    check(label, (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).reason, reason);
    points.set(MANIFEST_POINT_ID, { ...manifest, payload: restore });
  };
  await mutate("a foreign owner is refused", { corpus_owner: "someone-else" }, "owner-mismatch");
  await mutate("an incomplete build is refused", { complete: false }, "incomplete-build");
  await mutate("a schema mismatch is refused", { schema_version: 99 }, "schema-version-mismatch");
  await mutate("an index mismatch is refused", { index_version: 99 }, "index-version-mismatch");
  await mutate("a dimension mismatch is refused", { vector_size: 768 }, "dimension-mismatch");
  await mutate("a distance mismatch is refused", { distance: "Dot" }, "distance-mismatch");
  await mutate("an empty corpus is refused", { corpus_points: 0 }, "empty-corpus");
  /* A manifest may not define its own size: 5000 claimed against 2 local. */
  await mutate("a manifest claiming a different corpus size is refused", { corpus_points: 5000 }, "corpus-size-mismatch");
  await mutate("a missing build id is refused", { build_id: undefined }, "build-id-invalid");
  await mutate("a foreign build id is refused", { build_id: "someone-elses-build" }, "build-id-invalid");
  await mutate("an unparseable built_at is refused", { built_at: "whenever" }, "built-at-invalid");
  await mutate("a missing built_at is refused", { built_at: undefined }, "built-at-invalid");
  await mutate("a missing fingerprint is refused", { corpus_fingerprint: undefined }, "corpus-fingerprint-missing");
  await mutate("a malformed fingerprint is refused", { corpus_fingerprint: "short" }, "corpus-fingerprint-missing");
  await mutate("a wrong fingerprint is refused", { corpus_fingerprint: "b".repeat(64) }, "corpus-fingerprint-mismatch");
  await mutate("a foreign embedding model is refused", { embedding_model: "other-model" }, "embedding-model-mismatch");
  await mutate("a missing embedding model is refused", { embedding_model: undefined }, "embedding-model-mismatch");

  points.delete(MANIFEST_POINT_ID);
  check("a collection with no manifest is refused", (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).reason, "manifest-missing");
  points.set(MANIFEST_POINT_ID, manifest);
  check("and is ready again once restored", (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).ok, true);

  mock.state.failWith = "network";
  check("an unreachable cluster is not ready", (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).reason, "unreachable");
  mock.state.failWith = null;

  /* Readiness never writes. */
  const before = mock.state.calls.length;
  await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
  const readOnly = mock.state.calls.slice(before);
  ok("readiness issues no PUT", !readOnly.some((call) => call.method === "PUT"));
  ok("readiness issues no DELETE", !readOnly.some((call) => call.method === "DELETE"));
  ok("readiness never touches aliases", !readOnly.some((call) => call.path === "/collections/aliases"));
  /* And it really does read the corpus back, not just the manifest. */
  ok("readiness scrolls the stored points", readOnly.some((call) => call.path.includes("/points/scroll")));
}

/* ---------- K2. every stored point is checked against the local corpus ---------- */

/**
 * A manifest that vouches for itself proves nothing.
 *
 * These cases all leave a perfectly consistent manifest in place and corrupt
 * the RECORDS. Each one passed the previous manifest-only readiness check; each
 * one must now be refused.
 */
{
  const corruptions = [
    [
      "a missing chunk",
      (points, ids) => points.delete(ids.find((id) => id !== MANIFEST_POINT_ID)),
      "point-count-mismatch",
    ],
    [
      "an extra corpus chunk",
      (points) =>
        points.set("extra", {
          id: "extra",
          payload: {
            corpus_owner: AJOOP_CORPUS_OWNER,
            record_kind: RECORD_KINDS.CHUNK,
            public_safe: true,
            chunk_id: "master-knowledge:not-in-the-corpus:1",
            content_hash: "f".repeat(64),
            schema_version: QDRANT_PAYLOAD_SCHEMA_VERSION,
            index_version: QDRANT_INDEX_VERSION,
            build_id: null,
          },
        }),
      "point-count-mismatch",
    ],
    [
      "a duplicated chunk id",
      (points, ids) => {
        const source = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        points.set("clone", { id: "clone", payload: { ...source.payload } });
      },
      "point-count-mismatch",
    ],
    [
      "a wrong content hash",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, content_hash: "0".repeat(64) };
      },
      "content-hash-mismatch",
    ],
    [
      "a foreign-owned record",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, corpus_owner: "someone-else" };
      },
      "point-owner-mismatch",
    ],
    [
      "a record from another build",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, build_id: "s2i2-ffffffffffff-zzz" };
      },
      "build-id-mismatch",
    ],
    [
      "a record on the wrong schema",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, schema_version: 99 };
      },
      "point-schema-mismatch",
    ],
    [
      "a record on the wrong index version",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, index_version: 99 };
      },
      "point-index-mismatch",
    ],
    [
      "a record marked not public-safe",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, public_safe: false };
      },
      "public-safe-invalid",
    ],
    [
      "a second manifest-kind record",
      (points, ids) => {
        const point = points.get(ids.find((id) => id !== MANIFEST_POINT_ID));
        point.payload = { ...point.payload, record_kind: RECORD_KINDS.MANIFEST };
      },
      "record-kind-invalid",
    ],
  ];

  for (const [label, corrupt, reason] of corruptions) {
    const mock = createMockQdrant();
    const client = clientFor(mock);
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
    const active = mock.state.aliases.get(ALIAS);
    const points = mock.state.collections.get(active).points;
    check(`[baseline] ${label} starts from a ready corpus`, (await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR })).ok, true);
    corrupt(points, [...points.keys()]);
    const verdict = await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
    check(`${label} is refused`, verdict.ok, false);
    check(`${label} reports its reason`, verdict.reason, reason);
  }
}

/**
 * The payload checks, driven directly.
 *
 * The count check fires before the per-record loop in a live collection, so the
 * pure function is exercised on its own to prove the record-level reasons are
 * real rather than unreachable.
 */
{
  const descriptor = descriptorFor(CORPUS);
  /* A REAL build id: it encodes this corpus's fingerprint prefix, so the
   * binding check accepts it. A hand-written one no longer would. */
  const buildId = buildIdFor(selectIngestableChunks(CORPUS), { now: 1_700_000_000_000 });
  const stored = selectIngestableChunks(CORPUS).map((item) => ({
    id: qdrantPointId(item.id),
    payload: buildQdrantPayload(item, { buildId }),
  }));
  check("a matching corpus verifies", verifyStoredPoints(stored, descriptor, { buildId, schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION }).ok, true);

  const withDuplicate = [...stored, { id: "dup", payload: { ...stored[0].payload } }];
  check(
    "a duplicate chunk id is named",
    verifyStoredPoints(withDuplicate, descriptor, { buildId, schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION }).reason,
    "duplicate-chunk-id",
  );

  const withUnexpected = [...stored, { id: "x", payload: { ...stored[0].payload, chunk_id: "not-ours:1" } }];
  check(
    "an unexpected chunk is named",
    verifyStoredPoints(withUnexpected, descriptor, { buildId, schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION }).reason,
    "unexpected-chunk",
  );

  const missing = stored.slice(0, 1);
  const verdict = verifyStoredPoints(missing, descriptor, { buildId, schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION });
  check("a missing chunk is named", verdict.reason, "missing-chunk");
  ok("and the absent record is identified", typeof verdict.chunkId === "string");

  /* The independent recomputation: identical records, one silently re-hashed. */
  const reHashed = stored.map((point, position) =>
    position === 0 ? { ...point, payload: { ...point.payload, content_hash: "0".repeat(64) } } : point,
  );
  check(
    "a payload fingerprint cannot be forged by editing one hash",
    verifyStoredPoints(reHashed, descriptor, { buildId, schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION }).reason,
    "content-hash-mismatch",
  );

  /* verifyManifest in isolation, including the descriptor-size guard. */
  const manifestPayload = buildManifestPoint({
    buildId,
    corpusPoints: descriptor.expectedCorpusPoints,
    vectorSize: CONFIG.vectorSize,
    distance: CONFIG.distance,
    corpusFingerprint: descriptor.expectedCorpusFingerprint,
    embeddingModel: EMBED_MODEL,
  }).payload;
  const args = { schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion: QDRANT_INDEX_VERSION };
  check("a correct manifest verifies", verifyManifest(manifestPayload, CONFIG, descriptor, args).ok, true);
  check("a missing manifest is named", verifyManifest(null, CONFIG, descriptor, args).reason, "manifest-missing");
  check(
    "a manifest claiming 5000 points against a local 2 is refused",
    verifyManifest({ ...manifestPayload, corpus_points: 5000 }, CONFIG, descriptor, args).reason,
    "corpus-size-mismatch",
  );
}

/* ---------- K3. the candidate ceiling fails closed ---------- */

/**
 * A corpus larger than one search may request cannot be retrieved completely,
 * and complete retrieval is what makes the two backends provably identical. So
 * the ceiling refuses readiness rather than quietly truncating the query.
 */
{
  const oversized = (points) => ({
    expectedCorpusPoints: points,
    expectedCorpusFingerprint: "c".repeat(64),
    byChunkId: new Map(),
  });
  const mock = createMockQdrant();
  const client = clientFor(mock);
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });

  check("the shipped ceiling is 4096", CONFIG.candidateCeiling, 4096);
  check(
    "a corpus at the ceiling is allowed past the ceiling check",
    (await verifyQdrantCorpus(client, CONFIG, { descriptor: oversized(4096) })).reason !== "corpus-exceeds-ceiling",
    true,
  );
  check(
    "one record over the ceiling is refused",
    (await verifyQdrantCorpus(client, CONFIG, { descriptor: oversized(4097) })).reason,
    "corpus-exceeds-ceiling",
  );
  check(
    "a 5000-record corpus is refused",
    (await verifyQdrantCorpus(client, CONFIG, { descriptor: oversized(5000) })).reason,
    "corpus-exceeds-ceiling",
  );
  const refused = await verifyQdrantCorpus(client, CONFIG, { descriptor: oversized(5000) });
  check("and the refusal names the ceiling", refused.ceiling, 4096);
  check("and the corpus size it could not cover", refused.expected, 5000);
  /* The ceiling check runs BEFORE any request, so an oversized corpus never
   * issues a truncated query at all. */
  const before = mock.state.calls.length;
  await verifyQdrantCorpus(client, CONFIG, { descriptor: oversized(5000) });
  check("an over-ceiling corpus contacts the cluster not at all", mock.state.calls.length, before);
}

/* ---------- the RAG harness ---------- */

/**
 * A full RAG instance whose Ollama embeddings put `bias` at the TOP and whose
 * Qdrant mock can be steered independently.
 *
 * The two stores are deliberately allowed to DISAGREE where a test wants them
 * to: that is what proves the visitor answer came from the memory index rather
 * than from whatever Qdrant said.
 */
const makeRag = async ({ env = {}, bias = () => false, vectorFor = null, mock, seed = true } = {}) => {
  const state = { embed: 0, chat: 0, built: false, embedInputs: [] };
  if (seed) {
    const client = createQdrantClient({ config: CONFIG, fetchImpl: mock.fetchImpl });
    await runQdrantIngestion({
      client,
      config: CONFIG,
      embeddingModel: EMBED_MODEL,
      chunks: REAL_CHUNKS,
      /* The SAME vectors the in-memory index will hold, normalised the same
       * way. Seeding the store with a different embedding of the same corpus
       * would make every parity assertion a comparison of two fixtures. */
      embed: async (inputs) =>
        inputs.map((text) => pad(vectorFor ? vectorFor(text) : normalizeVector([bias(text) ? 1 : 0, 0.01, 0]))),
    });
  }
  const fetchImpl = async (url, init) => {
    if (String(url).includes("/collections") || String(url).includes("/aliases")) return mock.fetchImpl(url, init);
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      state.chat += 1;
      return { ok: true, status: 200, json: async () => ({ message: { content: " PORTFOLIO\nANSWER: Stubbed." } }) };
    }
    state.embed += 1;
    state.embedInputs.push(body.input);
    const isQuery = state.built && body.input.length === 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        embeddings: body.input.map((text) =>
          pad(isQuery ? [1, 0, 0] : vectorFor ? vectorFor(text) : [bias(text) ? 1 : 0, 0.01, 0]),
        ),
      }),
    };
  };
  const rag = createAjoopRag({ env: { AJOOP_AI_ALLOWED_ORIGINS: ORIGIN, ...env }, fetchImpl });
  await rag.initialize();
  state.initEmbed = state.embed;
  state.built = true;
  return { rag, state, mock };
};

const ask = (rag, question, history = []) =>
  rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question, locale: "tr", history }),
  });

const QDRANT_ENV = {
  QDRANT_URL: FULL_ENV.QDRANT_URL,
  QDRANT_API_KEY: FULL_ENV.QDRANT_API_KEY,
  QDRANT_COLLECTION: FULL_ENV.QDRANT_COLLECTION,
  QDRANT_VECTOR_SIZE: FULL_ENV.QDRANT_VECTOR_SIZE,
  QDRANT_DISTANCE: FULL_ENV.QDRANT_DISTANCE,
};

const sourceIds = (response) => (response.body.sources || []).map((source) => source.id);

/* ---------- L. one query embedding, reused, over the whole corpus ---------- */

{
  const mock = createMockQdrant();
  const { rag, state } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  check("readiness passed against the seeded cluster", rag.status().qdrantReady, true);
  check("the backend is live", rag.status().vectorBackend, "shadow");

  const searchesBefore = mock.state.searches.length;
  const before = state.embed;
  const response = await ask(rag, "SINAMA stacki ne?");
  await rag.shadowSettled();

  check("the turn succeeded", response.status, 200);
  check("shadow mode costs exactly one query embedding", state.embed - before, 1);
  check("that embedding carried one input", state.embedInputs.at(-1).length, 1);
  const search = mock.state.searches.at(-1);
  check("exactly one qdrant search per turn", mock.state.searches.length - searchesBefore, 1);
  same("qdrant received the SAME query vector", search.vector, pad([1, 0, 0]));
  check("at the collection's declared dimension", search.vector.length, CONFIG.vectorSize);
  check("the search was exact, not approximate", search.params.exact, true);
  same("the public-safe filter was sent", search.filter, PUBLIC_SAFE_FILTER);
  /* The candidate limit is the validated corpus, not a fixed shortlist. */
  check("the search covers the whole active corpus", search.limit, rag.status().candidateLimit);
  check("which is the verified corpus size", search.limit, rag.status().vectorReadiness.corpusPoints);
  ok("and is far larger than the old fixed 40", search.limit > 40);
}

/* Memory mode must not touch Qdrant at all. */
{
  const mock = createMockQdrant();
  const { rag, state } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  const searchesBefore = mock.state.searches.length;
  const before = state.embed;
  await ask(rag, "SINAMA stacki ne?");
  check("memory mode costs one query embedding", state.embed - before, 1);
  check("memory mode issues no qdrant search", mock.state.searches.length, searchesBefore);
  check("memory mode reports the memory backend", rag.status().vectorBackend, "memory");
}

/* ---------- M. memory vs Qdrant parity ---------- */

/**
 * The adversarial counterexample from the review, made concrete.
 *
 * More than forty records are given a STRONGER semantic score than the one the
 * deterministic policy must promote. Under the old fixed shortlist of 40 the
 * right record was never in the candidate set at all, so Qdrant and memory
 * ranked differently for a reason that had nothing to do with the embedding.
 * Covering the whole corpus exactly is what closes it.
 */
{
  const mock = createMockQdrant();
  /* The experience family is what a work-history question reserves slots for;
   * everything else is scored above it. */
  const target = REAL_CHUNKS.filter((c) => c.entityType === "experience");
  ok("the corpus has experience records to bury", target.length > 0);
  const buried = new Set(target.map((c) => c.id));
  const stronger = REAL_CHUNKS.filter((c) => !buried.has(c.id) && c.visibility !== "public_on_request");
  ok("more than forty records can outrank them", stronger.length > 40);

  const biasFor = (text) => !target.some((c) => c.text === text);
  const memoryRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: biasFor,
    mock: createMockQdrant(),
    seed: false,
  });
  const qdrantRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: biasFor,
    mock,
  });
  check("the qdrant backend is live", qdrantRun.rag.status().vectorBackend, "qdrant");

  for (const question of [
    "Kaan hangi şirketlerde çalıştı?",
    "Kaan'ın staj deneyimi ne?",
    "SINAMA stacki ne?",
    "Kaan kim?",
    "Neden Kaan'ı işe almalıyız?",
  ]) {
    const memoryResponse = await ask(memoryRun.rag, question);
    const qdrantResponse = await ask(qdrantRun.rag, question);
    same(`[parity] identical ranking: ${question}`, sourceIds(qdrantResponse), sourceIds(memoryResponse));
    same(
      `[parity] identical retrieved set: ${question}`,
      (qdrantResponse.body.retrievedSources || []).map((s) => s.id),
      (memoryResponse.body.retrievedSources || []).map((s) => s.id),
    );
  }
  const report = qdrantRun.rag.shadowReport();
  check("every parity turn was recorded", report.comparisons, 5);
  check("and every one ranked identically", report.identical, 5);
  check("with full overlap", report.averageOverlapRatio, 1);
}

/* ---------- M2. ranking cannot depend on the backend at all ---------- */

/**
 * The worst case for a stable-sort-only ranking: EVERY vector identical.
 *
 * With one vector for the whole corpus, every semantic score ties, so the only
 * thing separating candidates is the comparator's tie-break. A stable sort
 * preserves INPUT order among equals — and the two backends do not share an
 * input order. The in-memory path iterates the canonical index; the Qdrant path
 * iterates whatever order the store returned. Here the store deliberately
 * returns its hits REVERSED, with every score identical too, so anything
 * downstream that leaked backend order into the ranking produces a different
 * answer immediately.
 */
{
  const flat = () => normalizeVector([1, 1, 1]);
  const reversedStore = createMockQdrant({
    /* Identical scores AND reversed order: two independent ways to induce a
     * different ranking, applied together. */
    searchOrder: () => 0,
    reverseHits: true,
    flatScore: true,
  });

  const memoryRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: () => true,
    vectorFor: flat,
    mock: createMockQdrant(),
    seed: false,
  });
  const qdrantRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: () => true,
    vectorFor: flat,
    mock: reversedStore,
  });
  check("the flat-corpus qdrant backend is live", qdrantRun.rag.status().vectorBackend, "qdrant");

  for (const [label, question, history] of [
    ["company history", "Kaan hangi şirketlerde çalıştı?", []],
    ["project", "SINAMA stacki ne?", []],
    ["technology", "Kaan hangi teknolojileri kullanıyor?", []],
    ["internship", "Kaan'ın staj deneyimi ne?", []],
    ["role fit", "Kaan Forward Deployed Engineer rolüne uygun mu?", []],
    [
      "follow-up",
      "stacki ne?",
      [
        { role: "user", content: "SINAMA nedir?" },
        { role: "assistant", content: "SINAMA bir değerlendirme sistemi." },
      ],
    ],
  ]) {
    const memoryResponse = await ask(memoryRun.rag, question, history);
    const qdrantResponse = await ask(qdrantRun.rag, question, history);
    same(`[flat] identical sources: ${label}`, sourceIds(qdrantResponse), sourceIds(memoryResponse));
    same(
      `[flat] identical retrieved set: ${label}`,
      (qdrantResponse.body.retrievedSources || []).map((s) => s.id),
      (memoryResponse.body.retrievedSources || []).map((s) => s.id),
    );
    same(`[flat] identical answer: ${label}`, qdrantResponse.body.answer, memoryResponse.body.answer);
    check(`[flat] identical scope: ${label}`, qdrantResponse.body.scope, memoryResponse.body.scope);
  }
  const flatReport = qdrantRun.rag.shadowReport();
  check("every flat-corpus turn ranked identically", flatReport.identical, flatReport.comparisons);
  ok("and there were turns to rank", flatReport.comparisons >= 6);

  /* The store's hit order really was reversed, or the case proves nothing. */
  ok("the adversarial store reversed its hits", reversedStore.state.reversedHits > 0);
}

/** The comparator itself is a total order with no order dependence. */
{
  const item = (overrides) => ({ id: "a", finalScore: 1, semanticScore: 1, ordinal: 0, ...overrides });
  ok("a higher final score wins", compareRankedCandidates(item({ finalScore: 2 }), item()) < 0);
  ok(
    "a tied final score falls to the semantic score",
    compareRankedCandidates(item({ semanticScore: 2 }), item({ semanticScore: 1 })) < 0,
  );
  ok(
    "a full tie falls to the canonical ordinal",
    compareRankedCandidates(item({ id: "z", ordinal: 1 }), item({ id: "b", ordinal: 5 })) < 0,
  );
  ok(
    "and finally to the chunk id",
    compareRankedCandidates(item({ id: "a" }), item({ id: "b" })) < 0,
  );
  check("identical records compare equal", compareRankedCandidates(item(), item()), 0);
  ok(
    "a record with no ordinal never outranks one that has one",
    compareRankedCandidates(item({ id: "a", ordinal: undefined }), item({ id: "b", ordinal: 3 })) > 0,
  );

  /* Sorting the same set from two different input orders must agree. */
  const set = [
    item({ id: "c", ordinal: 2 }),
    item({ id: "a", ordinal: 0 }),
    item({ id: "b", ordinal: 1 }),
  ];
  const forward = [...set].sort(compareRankedCandidates).map((entry) => entry.id);
  const backward = [...set].reverse().sort(compareRankedCandidates).map((entry) => entry.id);
  same("sorting is independent of input order", backward, forward);
  same("and follows the canonical ordinal", forward, ["a", "b", "c"]);
}

/* ---------- N. shadow never alters the answer ---------- */

{
  const adversarial = createMockQdrant({
    /* The store ranks Merge Rush first for a SINAMA question. */
    searchOrder: (payload) => (/merge/i.test(payload.chunk_id || "") ? 1 : 0),
  });
  const memoryRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: (text) => /sinama/i.test(text),
    mock: createMockQdrant(),
    seed: false,
  });
  const shadowRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock: adversarial,
  });

  const memoryResponse = await ask(memoryRun.rag, "SINAMA stacki ne?");
  const shadowResponse = await ask(shadowRun.rag, "SINAMA stacki ne?");
  await shadowRun.rag.shadowSettled();

  same("the shadow answer is byte-identical", shadowResponse.body.answer, memoryResponse.body.answer);
  same("the cited sources are identical", sourceIds(shadowResponse), sourceIds(memoryResponse));
  check("the scope is unchanged", shadowResponse.body.scope, memoryResponse.body.scope);
  check("the answer mode is unchanged", shadowResponse.body.answerMode, memoryResponse.body.answerMode);
  same(
    "the production response shape is unchanged",
    Object.keys(shadowResponse.body).sort(),
    Object.keys(memoryResponse.body).sort(),
  );

  const report = shadowRun.rag.shadowReport();
  check("the comparison was still recorded", report.comparisons, 1);
  ok("a diagnostic turn id was assigned", Number.isInteger(report.entries.at(-1).turnId));

  const serialized = JSON.stringify(report);
  ok("the report contains no question text", !serialized.includes("stacki"));
  ok("the report contains no answer text", !serialized.includes("Stubbed"));
  ok("the report contains no api key", !serialized.includes(FULL_ENV.QDRANT_API_KEY));
  ok("the report contains no endpoint", !serialized.includes("qdrant.example"));

  const body = JSON.stringify(shadowResponse.body);
  ok("the response body carries no api key", !body.includes(FULL_ENV.QDRANT_API_KEY));
  ok("the response body carries no cluster host", !body.includes("qdrant.example"));
  ok("the response body carries no collection name", !body.includes(ALIAS));
}

/** The on-request record stays unreachable through the Qdrant backend too. */
{
  const mock = createMockQdrant();
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /telefon|phone|numara/i.test(text),
    mock,
  });
  const response = await ask(rag, "telefon nasıl çalışır?");
  ok(
    "no on-request record reaches the answer",
    sourceIds(response).every((id) => !id.includes("contacts:on-request")),
  );
  const active = mock.state.aliases.get(ALIAS);
  ok(
    "and none is even present in the store",
    ![...mock.state.collections.get(active).points.values()].some((point) =>
      String(point.payload.chunk_id || "").includes("contacts:on-request"),
    ),
  );
}

/* ---------- O. shadow concurrency ---------- */

/**
 * Two turns in flight at once must stay distinct.
 *
 * The single global `pendingShadow` this replaces was overwritten by the second
 * turn, so the first turn's comparison had no handle and completion ORDER
 * decided which turn "the last comparison" described.
 */
{
  const mock = createMockQdrant({ latency: 25 });
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow", AJOOP_AI_MAX_CONCURRENT: "4" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  const responses = await Promise.all([
    ask(rag, "SINAMA stacki ne?"),
    ask(rag, "Kaan hangi şirketlerde çalıştı?"),
    ask(rag, "Kaan'ın staj deneyimi ne?"),
  ]);
  check("every concurrent turn answered", responses.filter((r) => r.status === 200).length, 3);
  check("no comparison landed before the turns returned", rag.shadowReport().comparisons, 0);

  await rag.shadowSettled();
  const report = rag.shadowReport();
  check("every concurrent turn was recorded", report.comparisons, 3);
  const turnIds = report.entries.map((entry) => entry.turnId);
  check("each has its own diagnostic id", new Set(turnIds).size, 3);
  ok("the ids are monotonic", turnIds.every((id) => Number.isInteger(id) && id > 0));
  check("nothing is left pending", report.pending, 0);

  /* One turn can be settled on its own. */
  const single = await ask(rag, "SINAMA stacki ne?");
  check("a fresh turn answered", single.status, 200);
  const nextId = Math.max(...turnIds) + 1;
  const settledOne = await rag.shadowSettled(nextId);
  check("settling one turn lands exactly that comparison", rag.shadowReport().comparisons, 4);
  check("and reports it completed", settledOne.status, "completed");
  check("and says so explicitly", settledOne.settled, true);

  /* An id nobody issued must not be reported as a completed turn. */
  const unknown = await rag.shadowSettled(9999);
  check("an unknown turn is reported as unknown", unknown.status, "unknown");
  check("and is never claimed to have settled", unknown.settled, false);

  /* The no-argument form is a snapshot, and says what it settled. */
  const snapshot = await rag.shadowSettled();
  check("the snapshot form reports its status", snapshot.status, "settled");
  ok("and lists the turns it waited on", Array.isArray(snapshot.turns));
}

/**
 * An EVICTED turn is never reported as completed.
 *
 * The previous model dropped an evicted turn's handle entirely, and
 * `settled(turnId)` then fell through to a resolved promise — reporting success
 * for a query still running against a cluster that had not answered. A
 * diagnostic that lies about finishing is worse than one that admits it lost
 * track, so eviction is now its own status.
 */
{
  const recorder = createShadowRecorder({ limit: 8, pendingLimit: 2 });
  const never = () => new Promise(() => {});
  const ids = [recorder.nextTurn(), recorder.nextTurn(), recorder.nextTurn()];
  for (const id of ids) recorder.track(id, never());

  const first = await recorder.settled(ids[0]);
  check("the oldest of three turns is evicted at pendingLimit 2", first.status, "evicted");
  check("and is explicitly NOT settled", first.settled, false);
  check("in-flight tracking stays bounded", recorder.summary().pending, 2);
  check("and the eviction is counted", recorder.summary().evicted, 1);

  /* A turn that really did finish reports completed. */
  const finished = recorder.nextTurn();
  await recorder.track(finished, Promise.resolve());
  check("a resolved turn reports completed", (await recorder.settled(finished)).status, "completed");

  /* The snapshot form must not block on turns that will never resolve. */
  const evictedOnly = createShadowRecorder({ limit: 4, pendingLimit: 1 });
  const stuck = evictedOnly.nextTurn();
  evictedOnly.track(stuck, never());
  const replacement = evictedOnly.nextTurn();
  await evictedOnly.track(replacement, Promise.resolve());
  check("an evicted turn is not awaited by the snapshot", (await evictedOnly.settled(stuck)).status, "evicted");
}

/** A rejected shadow query can never become an unhandled rejection. */
{
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  const mock = createMockQdrant();
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  mock.state.failWith = "network";
  await ask(rag, "SINAMA stacki ne?");
  await rag.shadowSettled();
  await new Promise((done) => setImmediate(done));
  process.off("unhandledRejection", onRejection);
  check("a failed shadow query produces no unhandled rejection", rejections.length, 0);
  check("and is recorded as an error instead", rag.shadowReport().errors, 1);
}

/* ---------- O2. an incomplete search response is a failed one ---------- */

/**
 * Readiness proved the collection holds N records. It proves nothing about
 * what THIS search came back with.
 *
 * Parity rests on Qdrant supplying the complete candidate set, because the
 * deterministic policy that runs next reserves slots, isolates entities and
 * caps per record — a shortlist missing one candidate does not produce a
 * slightly different ranking, it can produce a different answer. So every
 * response is checked against the validated corpus size, and anything short of
 * complete is discarded in favour of the authoritative memory ranking.
 *
 * `truncate` mutilates the response on its way out of the mock: exactly the
 * shapes a real cluster produces when a limit is clamped, a replica lags, or a
 * collection drifts under a running bridge.
 */
{
  const baseline = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: (text) => /sinama/i.test(text),
    mock: createMockQdrant(),
    seed: false,
  });
  const QUESTIONS = ["SINAMA stacki ne?", "Kaan hangi şirketlerde çalıştı?", "Kaan kim?"];
  const expected = [];
  for (const question of QUESTIONS) expected.push(await ask(baseline.rag, question));

  const cases = [
    ["a complete response", null, null],
    ["one record short", (hits) => hits.slice(0, hits.length - 1), "incomplete-candidate-set"],
    ["a single hit of N", (hits) => hits.slice(0, 1), "incomplete-candidate-set"],
    ["an empty result", () => [], "incomplete-candidate-set"],
    ["N hits containing a duplicate", (hits) => [...hits.slice(0, hits.length - 1), hits[0]], "duplicate-candidate-id"],
    [
      "N hits containing an unknown id",
      (hits) => [
        ...hits.slice(0, hits.length - 1),
        { ...hits[0], id: "ghost", payload: { ...hits[0].payload, chunk_id: "master-knowledge:not-a-record:1" } },
      ],
      "unknown-candidate-id",
    ],
    [
      "more hits than the corpus",
      (hits) => [
        ...hits,
        { ...hits[0], id: "extra", payload: { ...hits[0].payload, chunk_id: hits[0].payload.chunk_id } },
      ],
      "duplicate-candidate-id",
    ],
  ];

  for (const [label, truncate, expectedCode] of cases) {
    const mock = createMockQdrant({ truncate });
    const { rag, state } = await makeRag({
      env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
      bias: (text) => /sinama/i.test(text),
      mock,
    });
    check(`[complete] ${label} starts ready`, rag.status().qdrantReady, true);
    const embedsBefore = state.embed;

    for (let i = 0; i < QUESTIONS.length; i += 1) {
      const response = await ask(rag, QUESTIONS[i]);
      check(`[complete] ${label} still answers: ${QUESTIONS[i]}`, response.status, 200);
      /* Visitor parity in EVERY case: a rejected candidate set means the
       * memory ranking served the turn, so the answer is the baseline one. */
      same(
        `[complete] ${label} matches the memory answer: ${QUESTIONS[i]}`,
        sourceIds(response),
        sourceIds(expected[i]),
      );
      same(
        `[complete] ${label} matches the retrieved set: ${QUESTIONS[i]}`,
        (response.body.retrievedSources || []).map((s) => s.id),
        (expected[i].body.retrievedSources || []).map((s) => s.id),
      );
    }

    const report = rag.shadowReport();
    if (expectedCode) {
      check(`[complete] ${label} is recorded as an error`, report.errors, QUESTIONS.length);
      check(`[complete] ${label} uses its own reason code`, report.lastError?.code ?? null, expectedCode);
    } else {
      check(`[complete] ${label} records no error`, report.errors, 0);
      check(`[complete] ${label} ranked identically`, report.identical, QUESTIONS.length);
    }
    /* Rejecting a candidate set falls back to a ranking that was ALREADY
     * computed from the same vector — it must never buy a second embedding. */
    check(`[complete] ${label} costs exactly one embedding per turn`, state.embed - embedsBefore, QUESTIONS.length);
    check(`[complete] ${label} left the backend live`, rag.status().vectorBackend, "qdrant");
  }
}

/** Shadow mode records the incompleteness and leaves the visitor untouched. */
{
  const mock = createMockQdrant({ truncate: (hits) => hits.slice(0, hits.length - 1) });
  const memoryRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: (text) => /sinama/i.test(text),
    mock: createMockQdrant(),
    seed: false,
  });
  const shadowRun = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  const expectedResponse = await ask(memoryRun.rag, "SINAMA stacki ne?");
  const response = await ask(shadowRun.rag, "SINAMA stacki ne?");
  await shadowRun.rag.shadowSettled();

  same("shadow answers from memory as always", sourceIds(response), sourceIds(expectedResponse));
  check("and the incompleteness is recorded", shadowRun.rag.shadowReport().errors, 1);
  check("with its reason", shadowRun.rag.shadowReport().lastError?.code ?? null, "incomplete-candidate-set");
  check("and no comparison was invented", shadowRun.rag.shadowReport().entries.at(-1).qdrantTopIds.length, 0);
}

/* ---------- O3. a build id must describe its own corpus ---------- */

/**
 * A regex is a shape check, not an identity check.
 *
 * `s99i77-000000000000-abc` is syntactically perfect and describes a schema
 * this code does not implement, an index version it cannot read and a corpus it
 * has never seen. The three encoded components are therefore compared with the
 * values they are supposed to encode.
 */
{
  const descriptor = descriptorFor(CORPUS);
  const real = buildIdFor(selectIngestableChunks(CORPUS), { now: 1_700_000_000_000 });
  const parsed = parseBuildId(real);
  ok("a real build id parses", Boolean(parsed));
  check("into the running schema version", parsed.schemaVersion, QDRANT_PAYLOAD_SCHEMA_VERSION);
  check("the running index version", parsed.indexVersion, QDRANT_INDEX_VERSION);
  check("and the corpus fingerprint prefix", parsed.fingerprintPrefix, descriptor.expectedCorpusFingerprint.slice(0, 12));
  check("a malformed id does not parse", parseBuildId("not-a-build-id"), null);

  const bind = (value) =>
    verifyBuildIdBinding(value, {
      schemaVersion: QDRANT_PAYLOAD_SCHEMA_VERSION,
      indexVersion: QDRANT_INDEX_VERSION,
      corpusFingerprint: descriptor.expectedCorpusFingerprint,
    });
  check("a real build id is bound to its corpus", bind(real).ok, true);
  check("the syntactically-perfect forgery is refused", bind("s99i77-000000000000-abc").ok, false);
  check("and names the first thing that disagreed", bind("s99i77-000000000000-abc").reason, "build-id-schema-mismatch");
  check(
    "a wrong index version is refused",
    bind(`s${QDRANT_PAYLOAD_SCHEMA_VERSION}i77-${descriptor.expectedCorpusFingerprint.slice(0, 12)}-abc`).reason,
    "build-id-index-mismatch",
  );
  check(
    "a foreign fingerprint is refused",
    bind(`s${QDRANT_PAYLOAD_SCHEMA_VERSION}i${QDRANT_INDEX_VERSION}-000000000000-abc`).reason,
    "build-id-fingerprint-mismatch",
  );
  check("a malformed id is refused as invalid", bind("nonsense").reason, "build-id-invalid");
  check("an absent id is refused", bind(undefined).reason, "build-id-invalid");
  ok("shape validity alone still accepts the forgery", isValidBuildId("s99i77-000000000000-abc"));

  /* End to end: readiness refuses a collection whose manifest carries a
   * shape-valid but content-wrong build id. */
  const mock = createMockQdrant();
  const client = clientFor(mock);
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  const active = mock.state.aliases.get(ALIAS);
  const points = mock.state.collections.get(active).points;
  const manifest = points.get(MANIFEST_POINT_ID);
  const original = manifest.payload;

  for (const [label, forged, reason] of [
    ["a foreign schema component", "s99i77-000000000000-abc", "build-id-schema-mismatch"],
    [
      "a foreign fingerprint component",
      `s${QDRANT_PAYLOAD_SCHEMA_VERSION}i${QDRANT_INDEX_VERSION}-000000000000-abc`,
      "build-id-fingerprint-mismatch",
    ],
  ]) {
    /* Every record must agree with the manifest build id, so both move. */
    manifest.payload = { ...original, build_id: forged };
    for (const [id, point] of points) {
      if (id === MANIFEST_POINT_ID) continue;
      point.payload = { ...point.payload, build_id: forged };
    }
    const verdict = await verifyQdrantCorpus(client, CONFIG, { descriptor: DESCRIPTOR });
    check(`${label} is refused at readiness`, verdict.ok, false);
    check(`${label} reports why`, verdict.reason, reason);
  }
  manifest.payload = original;
}

/* ---------- P. the failure matrix ---------- */

for (const [label, failWith, expectedCode] of [
  ["a DNS/network failure", "network", "network"],
  ["a timeout", "abort", "timeout"],
  ["a 401", 401, "http"],
  ["a 403", 403, "http"],
  ["a 429", 429, "http"],
  ["a 500", 500, "http"],
  ["malformed JSON", "malformed", "malformed-response"],
]) {
  const mock = createMockQdrant();
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  mock.state.failWith = failWith;
  const response = await ask(rag, "SINAMA stacki ne?");
  await rag.shadowSettled();
  check(`shadow survives ${label}`, response.status, 200);
  ok(`shadow still answers through ${label}`, Boolean(response.body.answer));
  ok(`${label} still cites records`, sourceIds(response).length > 0);
  check(`${label} is recorded as an error`, rag.shadowReport().errors, 1);
  check(`${label} is normalised to a code`, rag.shadowReport().lastError.code, expectedCode);
  ok(`${label} leaves no url in the report`, !JSON.stringify(rag.shadowReport()).includes("qdrant.example"));
}

/** qdrant mode falls back to the in-memory ranking rather than failing. */
{
  const mock = createMockQdrant();
  const expected = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "memory" },
    bias: (text) => /sinama/i.test(text),
    mock: createMockQdrant(),
    seed: false,
  });
  const baseline = await ask(expected.rag, "SINAMA stacki ne?");

  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  mock.state.failWith = "network";
  const response = await ask(rag, "SINAMA stacki ne?");
  check("qdrant mode survives an outage", response.status, 200);
  same("qdrant mode falls back to the memory ranking", sourceIds(response), sourceIds(baseline));
  check("the outage was recorded", rag.shadowReport().errors, 1);
}

/** An unverifiable cluster fails CLOSED: qdrant mode runs on memory. */
{
  const mock = createMockQdrant();
  const { rag, state } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /sinama/i.test(text),
    mock,
    seed: false,
  });
  check("an empty cluster is not ready", rag.status().qdrantReady, false);
  check("and qdrant mode fails closed to memory", rag.status().vectorBackend, "memory");
  check("while still recording what was requested", rag.status().vectorBackendRequested, "qdrant");
  check("with a reason", rag.status().vectorReadiness.reason, "missing");
  const searchesBefore = mock.state.searches.length;
  const response = await ask(rag, "SINAMA stacki ne?");
  check("the turn still answers", response.status, 200);
  check("and never queried the unverified cluster", mock.state.searches.length, searchesBefore);
  check("and still cost one embedding", state.embed - state.initEmbed, 1);
}

/** A half-written corpus — points but no manifest — is refused the same way. */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: REAL_CHUNKS, embed: countingEmbed().embed });
  const active = mock.state.aliases.get(ALIAS);
  mock.state.collections.get(active).points.delete(MANIFEST_POINT_ID);
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    bias: (text) => /sinama/i.test(text),
    mock,
    seed: false,
  });
  check("a manifest-less corpus is not ready", rag.status().qdrantReady, false);
  check("and the reason is recorded", rag.status().vectorReadiness.reason, "manifest-missing");
  const response = await ask(rag, "SINAMA stacki ne?");
  check("the turn answers from memory", response.status, 200);
  check("and no comparison was attempted", rag.shadowReport().comparisons, 0);
}

/** A broken configuration never contacts the cluster at all. */
{
  const mock = createMockQdrant();
  const { rag, state } = await makeRag({
    env: { QDRANT_URL: "not-a-url", QDRANT_API_KEY: "x", AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /sinama/i.test(text),
    mock,
    seed: false,
  });
  const response = await ask(rag, "SINAMA stacki ne?");
  check("a broken configuration still answers", response.status, 200);
  check("a broken configuration runs on memory", rag.status().vectorBackend, "memory");
  check("a broken configuration remembers what was asked", rag.status().vectorBackendRequested, "qdrant");
  check("a broken configuration never contacts qdrant", mock.state.calls.length, 0);
  check("a broken configuration still costs one embedding", state.embed - state.initEmbed, 1);
}

/** An unknown chunk id in the store is dropped, never used as evidence. */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: REAL_CHUNKS, embed: countingEmbed().embed });
  const active = mock.state.aliases.get(ALIAS);
  mock.state.collections.get(active).points.set("ghost", {
    id: "ghost",
    payload: {
      corpus_owner: AJOOP_CORPUS_OWNER,
      record_kind: RECORD_KINDS.CHUNK,
      public_safe: true,
      chunk_id: "master-knowledge:deleted-record:1",
      text: "A record the canonical knowledge no longer contains.",
    },
  });
  /* Readiness now catches this outright: the record is not in the local corpus,
   * so the remote store is not the local store. That is the stronger
   * protection, and it is what a bridge starting up would do. */
  const { rag: rejected } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /sinama/i.test(text),
    mock,
    seed: false,
  });
  check("a corpus holding an unknown record is not ready", rejected.status().qdrantReady, false);
  check("and qdrant mode falls back to memory", rejected.status().vectorBackend, "memory");
  const fallback = await ask(rejected, "SINAMA stacki ne?");
  check("the turn still answers", fallback.status, 200);
}

/**
 * The defensive drop, for a point that appears AFTER readiness passed.
 *
 * Readiness is a startup check; a collection can still drift underneath a
 * running bridge. A hit whose chunk id the canonical knowledge no longer
 * contains must be skipped rather than used, because its stored payload would
 * otherwise answer a question the local corpus cannot support.
 */
{
  const mock = createMockQdrant();
  const { rag } = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "qdrant" },
    bias: (text) => /sinama/i.test(text),
    mock,
  });
  check("the backend started ready", rag.status().qdrantReady, true);

  const active = mock.state.aliases.get(ALIAS);
  mock.state.collections.get(active).points.set("ghost", {
    id: "ghost",
    vector: [1, 0, 0],
    payload: {
      corpus_owner: AJOOP_CORPUS_OWNER,
      record_kind: RECORD_KINDS.CHUNK,
      public_safe: true,
      chunk_id: "master-knowledge:deleted-record:1",
      content_hash: "f".repeat(64),
      text: "A record the canonical knowledge no longer contains.",
    },
  });

  const response = await ask(rag, "SINAMA stacki ne?");
  check("the turn answers", response.status, 200);
  ok(
    "the drifted point is never cited",
    sourceIds(response).every((id) => id !== "master-knowledge:deleted-record:1"),
  );
  ok("and no answer text came from it", !String(response.body.answer).includes("no longer contains"));
}

/* ---------- Q. pagination fails closed ---------- */

{
  const config = resolveQdrantConfig(FULL_ENV);
  /* A cluster that always offers another page: a bounded scan must call that
   * an incomplete read, not a complete one. */
  const endless = {
    scroll: async () => ({ result: { points: [{ id: "a", payload: {} }], next_page_offset: "more" } }),
  };
  let thrown = null;
  try {
    await scrollAllPoints(endless, "x", { pageSize: 1, maxPages: 3 });
  } catch (error) {
    thrown = error;
  }
  ok("an unfinished scan throws", Boolean(thrown));
  check("with a specific code", thrown?.code, "incomplete-scan");

  /* A cursor with no rows would spin forever. */
  const stuck = { scroll: async () => ({ result: { points: [], next_page_offset: "more" } }) };
  let stuckError = null;
  try {
    await scrollAllPoints(stuck, "x", { pageSize: 1, maxPages: 10 });
  } catch (error) {
    stuckError = error;
  }
  check("a cursor with no rows is also incomplete", stuckError?.code, "incomplete-scan");

  const finite = {
    scroll: async (name, { offset }) =>
      offset
        ? { result: { points: [{ id: "b", payload: {} }], next_page_offset: null } }
        : { result: { points: [{ id: "a", payload: {} }], next_page_offset: "second" } },
  };
  check("a finished scan returns every point", (await scrollAllPoints(finite, "x", { pageSize: 1 })).length, 2);
  check("the config is unchanged by any of this", config.collection, ALIAS);
}

/* ---------- R. collection compatibility ---------- */

{
  const described = { result: { config: { params: { vectors: { size: 1024, distance: "Cosine" } } } } };
  same("an unnamed vector config is read", readCollectionVectors(described), {
    size: 1024,
    distance: "Cosine",
    named: false,
  });
  check("a matching collection is compatible", assessCollectionCompatibility(readCollectionVectors(described), CONFIG).compatible, true);
  const verdict = assessCollectionCompatibility({ size: 768, distance: "Cosine", named: false }, CONFIG);
  check("a 768-d collection is incompatible", verdict.compatible, false);
  check("and says why", verdict.reason, "dimension-mismatch");
  check("and reports the expected width", verdict.expected, 1024);
  check("a distance mismatch is refused", assessCollectionCompatibility({ size: 1024, distance: "Dot", named: false }, CONFIG).reason, "distance-mismatch");
  check("a named-vector collection is refused", assessCollectionCompatibility({ named: true, names: ["dense"] }, CONFIG).reason, "named-vectors");
  check("a missing collection is refused", assessCollectionCompatibility(null, CONFIG).reason, "missing");
  check(
    "a named-vector payload is detected",
    readCollectionVectors({ result: { config: { params: { vectors: { dense: { size: 1024, distance: "Cosine" } } } } } }).named,
    true,
  );
}

/* ---------- S. secrets ---------- */

{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  await client.count(ALIAS);
  check("the key is sent as the api-key header", mock.state.authHeaders.at(-1), FULL_ENV.QDRANT_API_KEY);
  ok("every request carried the key", mock.state.authHeaders.every((value) => value === FULL_ENV.QDRANT_API_KEY));
  ok("the key is never placed in the URL", mock.state.urls.every((url) => !url.includes(FULL_ENV.QDRANT_API_KEY)));

  const described = describeQdrantConfig(CONFIG);
  ok("the safe summary omits the key", !JSON.stringify(described).includes(FULL_ENV.QDRANT_API_KEY));
  ok("the safe summary omits the full URL", !Object.values(described).includes(CONFIG.url));
  check("the safe summary reports only key presence", described.apiKeyPresent, true);

  const publicStatus = publicVectorBackendStatus(CONFIG, { qdrantReady: true, activeBackend: "shadow" });
  same("the public status is three fields", Object.keys(publicStatus).sort(), [
    "qdrantReady",
    "vectorBackend",
    "vectorBackendRequested",
  ]);
  ok("the public status names no host", !JSON.stringify(publicStatus).includes("qdrant.example"));
  ok("the public status names no collection", !JSON.stringify(publicStatus).includes(ALIAS));

  const error = new QdrantError("http", { status: 403, path: `/collections/${ALIAS}/points/search` });
  ok("a qdrant error carries no key", !error.message.includes(FULL_ENV.QDRANT_API_KEY));
  ok("a qdrant error carries no host", !error.message.includes("qdrant.example"));
  same("a normalised error is a code and a status", Object.keys(normalizeQdrantError(error)).sort(), ["code", "status"]);
  check("an unexpected exception collapses to internal", normalizeQdrantError(new Error("boom")).code, "internal");
}

{
  const mock = createMockQdrant();
  const { rag } = await makeRag({ env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" }, mock });
  const health = await rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "health" }),
  });
  check("health reports the live backend", health.body.vectorBackend, "shadow");
  check("health reports verified readiness", health.body.qdrantReady, true);
  const serialized = JSON.stringify(health.body);
  ok("health leaks no api key", !serialized.includes(FULL_ENV.QDRANT_API_KEY));
  ok("health leaks no cluster host", !serialized.includes("qdrant.example"));
  ok("health leaks no collection name", !serialized.includes(ALIAS));
  ok("health leaks no build id", !/\bs\d+i\d+-[0-9a-f]{12}-/.test(serialized));
  for (const field of ["ok", "ready", "mode", "model", "embedModel", "chunks"]) {
    ok(`health still carries ${field}`, Object.hasOwn(health.body, field));
  }
  /* A degraded bridge must say memory, not repeat what was configured. */
  const broken = await makeRag({
    env: { ...QDRANT_ENV, AJOOP_VECTOR_BACKEND: "shadow" },
    mock: createMockQdrant(),
    seed: false,
  });
  const degraded = await broken.rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "health" }),
  });
  check("a degraded bridge reports memory", degraded.body.vectorBackend, "memory");
  check("and still records the request", degraded.body.vectorBackendRequested, "shadow");
  check("and is not ready", degraded.body.qdrantReady, false);
}

/**
 * Nothing the browser downloads may mention a Qdrant credential.
 *
 * This walks the actual shipped files rather than trusting that no one pasted a
 * key into a config: ajoop-ai-config.js is public by construction and is
 * exactly the file where a "temporary" credential would end up.
 */
{
  const BROWSER_DIRS = ["js", "assets", "i18n", "data"];
  const BROWSER_FILE = /\.(?:js|html|json|css)$/i;
  const FORBIDDEN = [/QDRANT_API_KEY/i, /qdrant[-_ ]?api[-_ ]?key/i, /QDRANT_URL/i];

  const walk = async (dir, files = []) => {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      return files;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, files);
      else if (BROWSER_FILE.test(entry.name)) files.push(full);
    }
    return files;
  };

  const rootFiles = (await readdir(ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && BROWSER_FILE.test(entry.name))
    .map((entry) => join(ROOT, entry.name));
  const nested = [];
  for (const dir of BROWSER_DIRS) await walk(join(ROOT, dir), nested);
  const browserFiles = [...rootFiles, ...nested];

  ok("browser-shipped files were found to scan", browserFiles.length > 20);
  const offenders = [];
  for (const file of browserFiles) {
    const source = await readFile(file, "utf8");
    if (FORBIDDEN.some((pattern) => pattern.test(source))) offenders.push(file.slice(ROOT.length + 1));
  }
  same("no browser-shipped file mentions a Qdrant credential", offenders, []);

  const publicConfig = await readFile(join(ROOT, "ajoop-ai-config.js"), "utf8");
  ok("the public Ajoop config has no qdrant reference at all", !/qdrant/i.test(publicConfig));

  const gitignore = await readFile(join(ROOT, ".gitignore"), "utf8");
  ok(".env.local is gitignored", gitignore.split(/\r?\n/).includes(".env.local"));
}

{
  let trackedOutput = "";
  try {
    trackedOutput = execFileSync("git", ["ls-files", ".env.local", "server/.env", ".env"], {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (error) {
    trackedOutput = "";
  }
  check("no environment file is tracked by git", trackedOutput.trim(), "");
}

/* ---------- T. shadow comparison shape ---------- */

{
  const comparison = compareRetrieval({ memoryIds: ["a", "b", "c", "d"], qdrantIds: ["b", "a", "e", "f"] });
  check("overlap is counted", comparison.overlap, 2);
  check("overlap is expressed against the authoritative side", comparison.overlapRatio, 0.5);
  check("a reordered ranking is not identical", comparison.identical, false);
  same("rank differences are reported", comparison.rankDifferences, [
    { id: "a", memoryRank: 1, qdrantRank: 2, delta: 1 },
    { id: "b", memoryRank: 2, qdrantRank: 1, delta: -1 },
  ]);
  same("records only memory found are listed", comparison.onlyInMemory, ["c", "d"]);
  same("records only qdrant found are listed", comparison.onlyInQdrant, ["e", "f"]);
  check("an equal ranking is identical", compareRetrieval({ memoryIds: ["a"], qdrantIds: ["a"] }).identical, true);
  check("an empty memory ranking does not divide by zero", compareRetrieval({ memoryIds: [], qdrantIds: ["a"] }).overlapRatio, 0);

  const recorder = createShadowRecorder({ limit: 2 });
  recorder.record({ turnId: 1, comparison, latencyMs: 10 });
  recorder.record({ turnId: 2, comparison, latencyMs: 20 });
  recorder.record({ turnId: 3, comparison, latencyMs: 30 });
  check("the buffer is bounded", recorder.report().entries.length, 2);
  check("all comparisons are still counted", recorder.summary().comparisons, 3);
  check("the average overlap is tracked", recorder.summary().averageOverlapRatio, 0.5);
  recorder.recordError({ turnId: 4, error: { code: "timeout", status: 0 }, memoryIds: ["a"] });
  check("errors are counted", recorder.summary().errors, 1);
  check("the last error is retained", recorder.summary().lastError.code, "timeout");
  ok("an error entry carries no qdrant ranking", recorder.report().entries.at(-1).qdrantTopIds.length === 0);

  /* Turn ids are monotonic and never reused. */
  const ids = [recorder.nextTurn(), recorder.nextTurn(), recorder.nextTurn()];
  same("turn ids increase", ids, [1, 2, 3]);

  /* The pending map is bounded even if a cluster never answers. */
  const bounded = createShadowRecorder({ limit: 4, pendingLimit: 2 });
  for (let i = 0; i < 6; i += 1) bounded.track(bounded.nextTurn(), new Promise(() => {}));
  ok("in-flight tracking is bounded", bounded.summary().pending <= 2);
}

/* ---------- S2. the search probe, field by field ---------- */

/**
 * The live 400 this section exists for.
 *
 * A build created the staging collection, embedded the corpus, upserted all 191
 * points, wrote the manifest and verified every record — then failed on the
 * search probe with a bare `status=400`. The probe is the ONLY request an
 * ingestion makes that carries a filter, and a managed Qdrant in strict mode
 * refuses a filtered search over unindexed payload rather than scanning.
 *
 * The mock enforces that refusal, so this is a regression test rather than a
 * description of one.
 */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  const result = await runQdrantIngestion({
    client,
    config: CONFIG,
    embeddingModel: EMBED_MODEL,
    chunks: CORPUS,
    embed: countingEmbed().embed,
  });
  check("the build promotes under strict mode", result.promoted, true);

  /* Indexes exist for exactly the fields the filter uses, and nothing else. */
  const staged = mock.state.indexed.filter((entry) => entry.collection === result.staging);
  same(
    "an index is created for every filter field",
    staged.map((entry) => entry.field).sort(),
    PUBLIC_SAFE_FILTER.must.map((clause) => clause.key).sort(),
  );
  check("and for no other field", staged.length, PUBLIC_SAFE_FILTER.must.length);
  check("a string clause is indexed as keyword", staged.find((e) => e.field === "corpus_owner").schema, "keyword");
  check("a boolean clause is indexed as bool", staged.find((e) => e.field === "public_safe").schema, "bool");
  /* Derived from the filter, so a new clause cannot be forgotten. */
  same(
    "the index list is derived from the filter itself",
    PUBLIC_SAFE_FILTER_INDEXES.map((entry) => entry.field),
    PUBLIC_SAFE_FILTER.must.map((clause) => clause.key),
  );

  /* Indexes precede the probe, or the probe is the 400 all over again. */
  const indexCall = mock.state.calls.findIndex((call) => call.path.includes("/index"));
  const probeCall = mock.state.calls.findIndex((call) => call.path.includes("/points/search"));
  ok("indexes are created before the probe searches", indexCall >= 0 && indexCall < probeCall);

  /* The probe request, field by field against the Qdrant contract. */
  const probe = mock.state.searches.at(-1);
  same("the probe body has exactly the contracted keys", Object.keys(probe).sort(), [
    "collection",
    "filter",
    "limit",
    "params",
    "vector",
    "with_payload",
    "with_vector",
  ]);
  check("the probe vector is an array", Array.isArray(probe.vector), true);
  check("at the collection's declared dimension", probe.vector.length, CONFIG.vectorSize);
  ok("of finite numbers", probe.vector.every((value) => typeof value === "number" && Number.isFinite(value)));
  ok("and not a zero vector", probe.vector.some((value) => value !== 0));
  check("the probe asks for one hit", probe.limit, 1);
  check("with payload", probe.with_payload, true);
  check("and without vectors", probe.with_vector, false);
  check("exact search is requested inside params", probe.params.exact, true);
  same("params carries nothing else", Object.keys(probe.params), ["exact"]);
  same("the probe filter is the runtime filter", probe.filter, PUBLIC_SAFE_FILTER);
  /* Unnamed/default vector on both sides — a named-vector request against an
   * unnamed collection is its own 400. */
  ok("the probe uses the default unnamed vector", !Object.hasOwn(probe, "name") && !probe.vector.name);

  /* The probe vector is a REAL ingested corpus vector, not a synthetic one, and
   * it costs no extra embedding. */
  const embedRun = countingEmbed();
  const mock2 = createMockQdrant();
  await runQdrantIngestion({
    client: clientFor(mock2),
    config: CONFIG,
    embeddingModel: EMBED_MODEL,
    chunks: CORPUS,
    embed: embedRun.embed,
  });
  check("the probe adds no embedding call", embedRun.state.inputs, selectIngestableChunks(CORPUS).length);
  const stored = [...mock2.state.collections.get(mock2.state.aliases.get(ALIAS)).points.values()];
  const corpusVectors = stored.filter((point) => point.payload.record_kind === RECORD_KINDS.CHUNK).map((point) => JSON.stringify(point.vector));
  ok("and queries with a vector that is actually in the build", corpusVectors.includes(JSON.stringify(mock2.state.searches.at(-1).vector)));
}

/** Without the indexes, the build fails exactly as it did live. */
{
  const mock = createMockQdrant();
  /* Swallow the index writes, leaving the collection unindexed. */
  const client = createQdrantClient({
    config: CONFIG,
    fetchImpl: async (url, init) => {
      if (new URL(url).pathname.includes("/index")) {
        return { ok: true, status: 200, json: async () => ({ result: {} }), text: async () => "{}" };
      }
      return mock.fetchImpl(url, init);
    },
  });
  let thrown = null;
  try {
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  } catch (error) {
    thrown = error;
  }
  ok("an unindexed collection fails the build", Boolean(thrown));
  const described = describeFailure(thrown);
  check("at the search probe", described.stage, "search-probe");
  check("with the live status", described.status, 400);
  check("and the live code", described.code, "qdrant-http");
  /* The detail that would have answered this in one run instead of two. */
  check("and a detail naming the cause", described.detail, "index-required");
  check("the alias never moved", mock.state.aliases.size, 0);
}

/** An exact-search refusal is distinguishable from an index refusal. */
{
  const mock = createMockQdrant({ strictMode: { unindexedFiltering: false, searchAllowExact: false } });
  const client = clientFor(mock);
  let thrown = null;
  try {
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  } catch (error) {
    thrown = error;
  }
  ok("a cluster refusing exact search fails the build", Boolean(thrown));
  const described = describeFailure(thrown);
  check("at the search probe", described.stage, "search-probe");
  check("with its own detail", described.detail, "exact-search-not-allowed");
  ok("which is not the index cause", described.detail !== "index-required");
}

/** A dimension mismatch is caught by the mock the way Qdrant catches it. */
{
  const mock = createMockQdrant();
  const client = clientFor(mock);
  let thrown = null;
  try {
    await runQdrantIngestion({
      client,
      config: CONFIG,
      embeddingModel: EMBED_MODEL,
      chunks: CORPUS,
      /* 768-d against a 1024-d collection. */
      embed: countingEmbed(768).embed,
    });
  } catch (error) {
    thrown = error;
  }
  ok("a wrong-width vector fails the build", Boolean(thrown));
  check("with a dimension detail", describeFailure(thrown).detail, "dimension-mismatch");
}

/** The probe refuses a hit that is not a record of this build. */
{
  for (const [label, corrupt, reason] of [
    ["a foreign owner", (payload) => ({ ...payload, corpus_owner: "someone-else" }), "search-probe-foreign-owner"],
    ["the manifest", (payload) => ({ ...payload, record_kind: RECORD_KINDS.MANIFEST }), "search-probe-wrong-kind"],
    ["another build", (payload) => ({ ...payload, build_id: "s2i2-ffffffffffff-zzz" }), "search-probe-foreign-build"],
    ["an unknown chunk", (payload) => ({ ...payload, chunk_id: "master-knowledge:not-ours:1" }), "search-probe-unknown-chunk"],
  ]) {
    const mock = createMockQdrant();
    const client = createQdrantClient({
      config: CONFIG,
      fetchImpl: async (url, init) => {
        const response = await mock.fetchImpl(url, init);
        if (!new URL(url).pathname.includes("/points/search")) return response;
        const body = await response.json();
        const hit = body?.result?.[0];
        if (!hit) return response;
        const mutated = { ...body, result: [{ ...hit, payload: corrupt(hit.payload) }] };
        return { ok: true, status: 200, json: async () => mutated, text: async () => JSON.stringify(mutated) };
      },
    });
    let thrown = null;
    try {
      await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
    } catch (error) {
      thrown = error;
    }
    ok(`the probe refuses ${label}`, Boolean(thrown));
    check(`and says why: ${label}`, describeFailure(thrown).code, reason);
    check(`and the alias never moved: ${label}`, mock.state.aliases.size, 0);
  }
}

/** The error-body classifier is a closed vocabulary, never an echo. */
{
  const KEY = FULL_ENV.QDRANT_API_KEY;
  const body = (message) => ({
    status: 400,
    text: async () => JSON.stringify({ status: { error: message } }),
  });
  const cases = [
    [`Index required but not found for "corpus_owner" of one of the following types: [keyword]`, "index-required"],
    ["Strict mode: exact search is not allowed", "exact-search-not-allowed"],
    ["Wrong input: Vector dimension error: expected dim: 1024, got 768", "dimension-mismatch"],
    ["Wrong input: Vector name error: named vector default does not exist", "wrong-vector-name"],
    ["Collection `x` doesn't exist!", "not-found"],
    ["Invalid api key", "unauthorized"],
    ["Payload too large", "payload-too-large"],
    ["Wrong input: Json parse error", "bad-request"],
    ["something nobody predicted", null],
  ];
  for (const [message, expected] of cases) {
    check(`an error body classifies as ${expected}`, await classifyErrorBody(body(message)), expected);
  }
  /* The body is matched and discarded — never carried onto the error. */
  const leaky = body(`connect https://cluster.example api-key=${KEY} payload={"text":"Kaan Balcı"} index required but not found`);
  const symbol = await classifyErrorBody(leaky);
  check("a hostile body still classifies", symbol, "index-required");
  const error = new QdrantError("http", { status: 400, path: "/collections/x/points/search", method: "POST", detail: symbol });
  const serialized = JSON.stringify(describeFailure(error, { stage: INGESTION_STAGES.SEARCH_PROBE })) + JSON.stringify({ ...error });
  ok("no api key survives classification", !serialized.includes(KEY));
  ok("no url survives classification", !serialized.includes("cluster.example"));
  ok("no corpus text survives classification", !serialized.includes("Kaan"));
  /* An unrecognised symbol is refused rather than carried. */
  check(
    "an off-vocabulary detail is dropped",
    new QdrantError("http", { detail: `leaked ${KEY}` }).detail,
    null,
  );
  check("a body with no text method is tolerated", await classifyErrorBody({ status: 400 }), null);
}

/* ---------- T2. failure diagnostics are useful AND safe ---------- */

/**
 * The problem being solved: a live build failed with exactly `fetch failed`.
 *
 * Every component had been probed green independently, so the missing
 * information was never "what broke" but "where". These assertions require the
 * output to name the stage, the operation and the socket cause — and to contain
 * none of the things that would make printing it a credential incident.
 */
{
  /* Undici nests the useful code one or more levels down; the top-level
   * message is the useless `fetch failed`. */
  const nested = new Error("fetch failed");
  nested.cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  check("a socket cause is recovered from a nested error", safeCauseCode(nested), "ECONNRESET");
  check("an undici pool code is recovered", safeCauseCode(Object.assign(new Error("x"), { code: "UND_ERR_SOCKET" })), "UND_ERR_SOCKET");
  check("a timeout code is recovered", safeCauseCode(Object.assign(new Error("x"), { code: "ETIMEDOUT" })), "ETIMEDOUT");
  check("an abort is recovered by name", safeCauseCode(Object.assign(new Error("x"), { name: "AbortError" })), "AbortError");
  /* A code that is not a symbol is DROPPED, not truncated: a message can quote
   * the request, and the request carries the key. */
  check(
    "a prose 'code' is refused",
    safeCauseCode(Object.assign(new Error("x"), { code: `connect to https://cluster.example with ${FULL_ENV.QDRANT_API_KEY}` })),
    null,
  );
  check("a plain Error yields no cause", safeCauseCode(new Error("boom")), null);
  check("nothing yields no cause", safeCauseCode(null), null);
}

/** Every stage is a member of the closed list, never interpolated. */
{
  const stages = Object.values(INGESTION_STAGES);
  for (const stage of [
    "preflight",
    "create-staging",
    "embed-batch",
    "upsert-batch",
    "write-manifest",
    "verify-collection",
    "verify-scroll",
    "search-probe",
    "alias-promotion",
    "failed-staging-cleanup",
  ]) {
    ok(`the stage list carries ${stage}`, stages.includes(stage));
  }
  check("an unknown stage never leaks into output", describeFailure(new Error("x"), { stage: "../../etc/passwd" }).stage, "unknown");
  check("a caller-supplied stage must be a real stage", describeFailure(new Error("x"), { stage: "made-up" }).stage, "unknown");
  /* Tagging is additive and never overwrites a more specific stage. */
  const tagged = tagStage(new Error("x"), INGESTION_STAGES.UPSERT_BATCH, { batch: 3, batches: 12 });
  check("a tagged error keeps its stage", tagStage(tagged, INGESTION_STAGES.PREFLIGHT).stage, "upsert-batch");
  check("and its batch ordinal", describeFailure(tagged).batch, "3/12");
}

/** A transport failure names the operation, the path and the cause. */
{
  const error = new QdrantError("network", {
    path: "/collections/ajoop_portfolio_v1_s2i2-abcdef012345-xyz/points/scroll",
    method: "POST",
    cause: "ECONNRESET",
  });
  const described = describeFailure(error, { stage: INGESTION_STAGES.VERIFY_SCROLL });
  check("the stage is reported", described.stage, "verify-scroll");
  check("the HTTP method is reported", described.method, "POST");
  check("the code is a qdrant code", described.code, "qdrant-network-error");
  check("the socket cause is reported", described.cause, "ECONNRESET");
  check("the physical collection name is redacted", described.path, "/collections/<staging>/points/scroll");
  ok("the build id is not in the path", !described.path.includes("abcdef012345"));

  const withStatus = describeFailure(
    new QdrantError("http", { status: 403, path: "/collections/x/points", method: "PUT" }),
    { stage: INGESTION_STAGES.UPSERT_BATCH },
  );
  check("an HTTP status is reported", withStatus.status, 403);
  check("and the collection is redacted", withStatus.path, "/collections/<collection>/points");
  check("the formatted line is key=value pairs", formatFailure(withStatus), "method=PUT path=/collections/<collection>/points status=403 code=qdrant-http");

  /* The alias route is a fixed API path, not a collection: redacting it would
   * hide which operation failed, which is what the output is for. */
  const promotion = describeFailure(
    new QdrantError("timeout", { path: "/collections/aliases", method: "POST", cause: "UND_ERR_HEADERS_TIMEOUT" }),
    { stage: INGESTION_STAGES.ALIAS_PROMOTION },
  );
  check("the alias route survives redaction", promotion.path, "/collections/aliases");
  check("and the stage names the promotion", promotion.stage, "alias-promotion");
  check("and the undici cause is reported", promotion.cause, "UND_ERR_HEADERS_TIMEOUT");
}

/** Embedding failures report a category and an ordinal — never corpus text. */
{
  const SECRET_TEXT = "Kaan Balcı worked at CBOT as an AI Designer, and this is corpus prose.";
  const cases = [
    [Object.assign(new Error("upstream 500"), {}), "embedding-upstream-500"],
    [new Error("malformed embedding response"), "embedding-malformed-response"],
    [new Error("malformed embedding vector"), "embedding-malformed-vector"],
    [new Error("embedding batch size mismatch"), "embedding-batch-size-mismatch"],
    [Object.assign(new Error("x"), { name: "AbortError" }), "embedding-timeout"],
    [new Error(SECRET_TEXT), "embedding-internal"],
  ];
  for (const [error, expected] of cases) {
    const described = describeFailure(error, { stage: INGESTION_STAGES.EMBED_BATCH, batch: 3, batches: 12 });
    check(`an embedding failure is categorised: ${expected}`, described.code, expected);
    check(`and carries its ordinal: ${expected}`, described.batch, "3/12");
    ok(`and no corpus text: ${expected}`, !JSON.stringify(described).includes("CBOT"));
    ok(`and no prose at all: ${expected}`, !JSON.stringify(described).includes("corpus prose"));
  }
  check("the embedding category helper is exact", embeddingFailureCategory(new Error("upstream 429")), "upstream-429");
}

/**
 * Nothing sensitive can reach the output, from any error shape.
 *
 * The error objects here carry a key, a full URL, a request payload, a response
 * body and corpus text in every field an implementation might be tempted to
 * print. The description must contain none of them.
 */
{
  const KEY = FULL_ENV.QDRANT_API_KEY;
  const URL_STRING = `${FULL_ENV.QDRANT_URL}/collections/ajoop_portfolio_v1/points`;
  const BODY = '{"points":[{"id":"1","vector":[0.1,0.2],"payload":{"text":"Kaan Balcı"}}]}';
  const hostile = [
    Object.assign(new QdrantError("network", { path: "/collections/x/points", method: "PUT", cause: "ECONNRESET" }), {
      request: { url: URL_STRING, headers: { "api-key": KEY }, body: BODY },
      response: BODY,
      config: { apiKey: KEY, url: FULL_ENV.QDRANT_URL },
    }),
    Object.assign(new Error(`connect ECONNREFUSED ${URL_STRING} api-key=${KEY}`), {
      cause: Object.assign(new Error(BODY), { code: "ECONNREFUSED" }),
      reason: "alias-name-occupied",
    }),
    Object.assign(new Error(BODY), { stage: INGESTION_STAGES.EMBED_BATCH, batch: 2, batches: 4 }),
    Object.assign(new Error("x"), { verification: { reason: "corpus-fingerprint-mismatch", secret: KEY } }),
  ];
  for (const [index, error] of hostile.entries()) {
    const serialized = JSON.stringify(describeFailure(error)) + " " + formatFailure(describeFailure(error));
    ok(`[diag ${index}] no api key`, !serialized.includes(KEY));
    ok(`[diag ${index}] no cluster host`, !serialized.includes("qdrant.example"));
    ok(`[diag ${index}] no scheme`, !serialized.includes("https://"));
    ok(`[diag ${index}] no request body`, !serialized.includes("vector") && !serialized.includes("payload"));
    ok(`[diag ${index}] no corpus text`, !serialized.includes("Kaan"));
    ok(`[diag ${index}] no header name`, !/api-key/i.test(serialized));
    /* Only the fields the contract allows, and nothing else. */
    for (const key of Object.keys(describeFailure(error))) {
      ok(
        `[diag ${index}] only contracted fields (${key})`,
        ["stage", "method", "path", "status", "code", "cause", "batch"].includes(key),
      );
    }
  }
  /* And the useful signal survives all of that. */
  const useful = describeFailure(hostile[0], { stage: INGESTION_STAGES.UPSERT_BATCH });
  check("the operation is still identified", useful.method, "PUT");
  check("the cause is still identified", useful.cause, "ECONNRESET");
}

/** The real pipeline tags the real stage, end to end. */
{
  const failures = [
    ["preflight", (call) => (call.path === "/collections" && call.method === "GET" ? "network" : null)],
    ["create-staging", (call) => (call.method === "PUT" && /^\/collections\/[^/]+$/.test(call.path) ? "network" : null)],
    ["upsert-batch", (call) => (call.method === "PUT" && call.path.includes("/points?") ? "network" : null)],
    ["verify-collection", (call) => (call.path.includes("/points/count") ? "network" : null)],
    ["verify-scroll", (call) => (call.path.includes("/points/scroll") ? "network" : null)],
    ["search-probe", (call) => (call.path.includes("/points/search") ? "network" : null)],
    ["alias-promotion", (call) => (call.path === "/collections/aliases" ? "network" : null)],
  ];
  for (const [expectedStage, failWith] of failures) {
    const mock = createMockQdrant({ failWith });
    const client = clientFor(mock);
    let thrown = null;
    try {
      await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
    } catch (error) {
      thrown = error;
    }
    ok(`[stage] ${expectedStage} fails the build`, Boolean(thrown));
    check(`[stage] ${expectedStage} is named`, describeFailure(thrown).stage, expectedStage);
    ok(
      `[stage] ${expectedStage} leaks nothing`,
      !JSON.stringify(describeFailure(thrown)).includes(FULL_ENV.QDRANT_API_KEY),
    );
  }

  /* An embedding failure names its stage and its batch, not its input. */
  {
    const mock = createMockQdrant();
    const client = clientFor(mock);
    /* Two ingestable records at batch size 1: the SECOND batch fails, so the
     * ordinal is the thing under test rather than an off-by-one. */
    let embedCalls = 0;
    let thrown = null;
    try {
      await runQdrantIngestion({
        client,
        config: { ...CONFIG, upsertBatchSize: 1 },
        embeddingModel: EMBED_MODEL,
        chunks: CORPUS,
        embed: async (inputs) => {
          embedCalls += 1;
          if (embedCalls >= 2) throw new Error("upstream 500");
          return inputs.map(() => [1, 0, 0, 0]);
        },
      });
    } catch (error) {
      thrown = error;
    }
    ok("[stage] an embedding failure fails the build", Boolean(thrown));
    const described = describeFailure(thrown);
    check("[stage] embed-batch is named", described.stage, "embed-batch");
    check("[stage] the batch ordinal is reported", described.batch, "2/2");
    check("[stage] the category is reported", described.code, "embedding-upstream-500");
    ok("[stage] and no corpus text", !JSON.stringify(described).includes("FastAPI"));
  }
}

/**
 * A cleanup failure is reported BESIDE the primary failure, never instead.
 *
 * Losing the line that explains the run to a secondary error raised while
 * tidying up would cost another full ingestion to learn what the first already
 * knew.
 */
{
  const mock = createMockQdrant({
    /* The upsert fails, and so does the staging teardown that follows it. */
    failWith: (call) =>
      (call.method === "PUT" && call.path.includes("/points?")) || call.method === "DELETE" ? "network" : null,
  });
  const client = clientFor(mock);
  let thrown = null;
  try {
    await runQdrantIngestion({ client, config: CONFIG, embeddingModel: EMBED_MODEL, chunks: CORPUS, embed: countingEmbed().embed });
  } catch (error) {
    thrown = error;
  }
  ok("the build failed", Boolean(thrown));
  const primary = describeFailure(thrown);
  check("the PRIMARY failure survives", primary.stage, "upsert-batch");
  check("with its own code", primary.code, "qdrant-network-error");
  ok("a cleanup failure was recorded separately", Boolean(thrown.cleanupFailure));
  const secondary = describeFailure(thrown.cleanupFailure);
  check("the cleanup failure has its own stage", secondary.stage, "failed-staging-cleanup");
  check("and its own method", secondary.method, "DELETE");
  check("the retained staging collection is named for the operator", thrown.stagingRetained, thrown.staging);
  check("the alias still never moved", thrown.aliasMoved, false);
  check("and no alias exists", mock.state.aliases.size, 0);
  ok("neither description leaks", !(JSON.stringify(primary) + JSON.stringify(secondary)).includes(FULL_ENV.QDRANT_API_KEY));
}

/** The CLIs print the assembled description, never a raw error. */
{
  const ingestSource = await readFile(join(ROOT, "scripts", "ajoop-qdrant-ingest.mjs"), "utf8");
  const smokeSource = await readFile(join(ROOT, "scripts", "ajoop-qdrant-smoke.mjs"), "utf8");
  for (const [name, source] of [["ingest", ingestSource], ["smoke", smokeSource]]) {
    ok(`the ${name} CLI uses describeFailure`, source.includes("describeFailure("));
    ok(`the ${name} CLI never prints error.message`, !/console\.(error|log)\([^)]*error\?\.message/.test(source));
    ok(`the ${name} CLI never prints a raw error object`, !/console\.(error|log)\(\s*error\s*\)/.test(source));
  }
  ok("the ingest CLI reports a cleanup failure separately", ingestSource.includes("cleanup also failed at"));
  /* The one place a hostname is printed is the operator's own config summary,
   * which is server-side and deliberate — it must not appear in a failure. */
  ok(
    "no failure path prints the endpoint host",
    !/failed[^\n]*endpointHost/.test(ingestSource),
  );
}

/* ---------- U. the npm surface ---------- */

{
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  ok("an ingestion command exists", Boolean(pkg.scripts["ajoop:qdrant:ingest"]));
  ok("a live smoke command exists", Boolean(pkg.scripts["ajoop:qdrant:smoke"]));
  ok("a deterministic qdrant gate exists", Boolean(pkg.scripts["qa:ajoop:qdrant"]));
  ok(
    "the live smoke test is not part of npm run qa",
    !pkg.scripts.qa.includes("qdrant:smoke") && !pkg.scripts.qa.includes("ajoop:qdrant:ingest"),
  );
  ok(
    "the live smoke test requires an explicit flag",
    (await readFile(join(ROOT, "scripts", "ajoop-qdrant-smoke.mjs"), "utf8")).includes('argv.includes("--run")'),
  );

  const ragSource = await readFile(join(ROOT, "server", "ajoop-rag.mjs"), "utf8");
  ok("the request path does not import the ingestion pipeline", !ragSource.includes("ajoop-qdrant-ingest.mjs"));
  ok(
    "the request path still filters on-request records out of retrieval",
    ragSource.includes('retrievalIndex = index.filter((chunk) => chunk.visibility !== "public_on_request");'),
  );
  /* The runtime must never be able to create or repair a collection. */
  ok("the request path never creates a collection", !ragSource.includes("createCollection"));
  ok("the request path never deletes anything", !ragSource.includes("deletePoints") && !ragSource.includes("deleteCollection"));
  ok("the request path never moves an alias", !ragSource.includes("promoteAlias"));

  ok("the ingestion command is a real file", (await stat(join(ROOT, "scripts", "ajoop-qdrant-ingest.mjs"))).isFile());
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop Qdrant contracts: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Ajoop Qdrant contracts passed. ${passed} assertions · ${REAL_CHUNKS.length} real corpus chunks · ` +
    `staged builds · mocked Qdrant HTTP · adversarial embeddings · no network, no cluster, no Ollama.`,
);
