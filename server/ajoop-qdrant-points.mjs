/**
 * Chunks to Qdrant points: deterministic ids, a payload the retrieval policy
 * can still reason about, ownership markers, and the build manifest that makes
 * a collection provably complete.
 *
 * There is no second knowledge system here. The input is exactly the chunk
 * objects server/ajoop-rag.mjs already builds from the canonical knowledge and
 * the portfolio datasets, and every field this module writes is one of theirs.
 * A point is a projection of a chunk, never a new record.
 *
 * Four decisions are worth stating outright:
 *
 * 1. IDS ARE DERIVED, NOT ASSIGNED. Qdrant accepts an unsigned integer or a
 *    UUID, and the chunk id ("master-knowledge:project:sinama:1") is neither.
 *    A UUIDv5 over the chunk id gives the same record the same point id on every
 *    run and on every machine, so a rebuild addresses the same points.
 *
 * 2. ON-REQUEST MATERIAL IS NEVER INGESTED. In memory, `public_on_request`
 *    records are embedded but excluded from the retrieval index, reachable only
 *    through the deterministic exact-fact route. Mirroring that with a query
 *    FILTER would make a phone number one filter bug away from a cosine match,
 *    so the store simply does not contain it. `public_safe` still rides in the
 *    payload and every search still filters on it: the absence is the
 *    guarantee, the filter is the second lock.
 *
 * 3. THE PAYLOAD ROUND-TRIPS THE RETRIEVAL POLICY. entity_type, tags, priority
 *    and affinity_hints are what server/ajoop-retrieval.mjs uses to decide
 *    project ownership and record family. Dropping them would make a Qdrant
 *    result unable to answer a SINAMA question with SINAMA records.
 *
 * 4. EVERY POINT DECLARES ITS OWNER. `corpus_owner` is what lets cleanup prove
 *    a physical collection belongs to this corpus before deleting it. Without
 *    it, a misconfigured `QDRANT_COLLECTION` pointing at somebody else's data
 *    turns a routine rebuild into destroying it.
 */
import { createHash } from "node:crypto";

/**
 * The owner marker. One string, on every point, checked before any deletion.
 *
 * This is the difference between "delete the collections whose names look like
 * ours" and "delete the collections we can prove we wrote". Names are a
 * convention an operator can collide with by accident; a payload field on the
 * data itself is evidence.
 */
export const AJOOP_CORPUS_OWNER = "ajoop-portfolio";

/** Points are corpus records or the single build manifest. Nothing else. */
export const RECORD_KINDS = Object.freeze({ CHUNK: "chunk", MANIFEST: "manifest" });

/**
 * Payload shape version. Bump when a FIELD changes meaning or disappears.
 *
 * Stored on every point and on the manifest, and validated at runtime, so a
 * shape change forces a rebuild instead of leaving a mixed-schema collection
 * that reads correctly for the newest half of the corpus.
 */
export const QDRANT_PAYLOAD_SCHEMA_VERSION = 2;

/**
 * Index/corpus contract version. Bump when CHUNKING or embedding changes.
 *
 * A different chunker produces different text for the same record id, and a
 * different embedding model produces incomparable vectors. Either one makes
 * every stored vector stale even though its content hash may be unchanged.
 */
export const QDRANT_INDEX_VERSION = 2;

/**
 * Namespace for the UUIDv5 point ids.
 *
 * A fixed constant, chosen once and never rotated: changing it renames every
 * point in the corpus.
 */
export const AJOOP_QDRANT_NAMESPACE = "3f2a6c1e-9b47-4c8d-8f21-5a0d7e6b4c93";

const uuidToBytes = (uuid) => {
  const hex = String(uuid).replace(/-/g, "");
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

const NAMESPACE_BYTES = uuidToBytes(AJOOP_QDRANT_NAMESPACE);

/**
 * RFC 4122 name-based UUID (version 5, SHA-1).
 *
 * Written out rather than pulled in: it is fifteen lines, it has no upgrade
 * path to worry about, and the id scheme of a persistent store is not somewhere
 * to inherit a surprise.
 */
export function uuidV5(name, namespaceBytes = NAMESPACE_BYTES) {
  const hash = createHash("sha1").update(namespaceBytes).update(Buffer.from(String(name), "utf8")).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; /* version 5 */
  bytes[8] = (bytes[8] & 0x3f) | 0x80; /* RFC 4122 variant */
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** The stable Qdrant point id for a chunk id. Same input, same id, forever. */
export const qdrantPointId = (chunkId) => uuidV5(`chunk:${chunkId}`);

/** The manifest lives at one fixed id, so readiness can fetch it directly. */
export const MANIFEST_POINT_ID = uuidV5(`manifest:${AJOOP_CORPUS_OWNER}`);

/** A chunk visibility tier, with the dataset default made explicit. */
export const chunkVisibility = (chunk) => chunk?.visibility || "public";

/**
 * Whether ordinary semantic retrieval may see this chunk.
 *
 * The same predicate server/ajoop-rag.mjs applies when it derives
 * `retrievalIndex` from `index`. Written once here so the two cannot drift.
 */
export const isPublicSafeChunk = (chunk) => chunkVisibility(chunk) !== "public_on_request";

/** Chunks that may be persisted, in input order. */
export const selectIngestableChunks = (chunks) => chunks.filter(isPublicSafeChunk);

/** Deterministic JSON: object keys sorted at every depth, so a hash is stable. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export const sha256Hex = (text) => createHash("sha256").update(String(text), "utf8").digest("hex");

/**
 * The hash of one chunk's meaning.
 *
 * Covers its text and the metadata the retrieval policy reads. It deliberately
 * excludes anything time-varying — a timestamp in here would make every build
 * look like a full corpus change.
 */
export function chunkContentHash(chunk) {
  return sha256Hex(
    stableStringify({
      id: chunk.id,
      source: chunk.source,
      entityId: chunk.entityId,
      title: chunk.title,
      text: chunk.text,
      entityType: chunk.entityType ?? null,
      visibility: chunkVisibility(chunk),
      priority: chunk.priority ?? null,
      tags: [...(chunk.tags || [])].sort(),
      affinityHints: [...(chunk.affinityHints || [])].sort(),
      metadata: chunk.metadata ?? null,
    }),
  );
}

/**
 * One record's line in the corpus fingerprint.
 *
 * Every field is percent-encoded before being joined, so no chunk id, hash or
 * version can contain the separator and two different corpora cannot serialise
 * to the same string. Ambiguous concatenation is the classic way a "matching"
 * fingerprint stops meaning anything.
 */
export function corpusDescriptorLine(chunk, { schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion = QDRANT_INDEX_VERSION } = {}) {
  return [chunk.id, chunkContentHash(chunk), schemaVersion, indexVersion]
    .map((field) => encodeURIComponent(String(field)))
    .join("|");
}

/**
 * The same line, built from a STORED payload rather than a local chunk.
 *
 * Readiness recomputes the remote fingerprint from what Qdrant actually holds
 * and compares it with the local one. Both sides must be assembled by code that
 * cannot drift, so they share this format and differ only in where the four
 * values came from.
 */
export function remoteDescriptorLine(payload) {
  return [payload?.chunk_id, payload?.content_hash, payload?.schema_version, payload?.index_version]
    .map((field) => encodeURIComponent(String(field)))
    .join("|");
}

/** A fingerprint over already-built descriptor lines. Order-independent. */
export const fingerprintDescriptorLines = (lines) => sha256Hex([...lines].sort().join("\n"));

/**
 * A fingerprint of the WHOLE corpus, order-independent and process-independent.
 *
 * Sorted lines rather than a running hash, so nothing about object iteration
 * order, Map insertion order or dataset ordering can change the result. Two
 * builds of the same knowledge produce the same fingerprint, which is what lets
 * readiness ask "is the remote corpus the one this process would have built?"
 * rather than "does the remote corpus vouch for itself?".
 */
export function corpusFingerprint(chunks, options = {}) {
  return fingerprintDescriptorLines(chunks.map((chunk) => corpusDescriptorLine(chunk, options)));
}

/**
 * Everything runtime needs to check a remote corpus against the local one.
 *
 * Built from the LOCAL retrieval index at startup and from the local chunk list
 * at ingestion. It is the source of truth in both directions: the manifest is
 * checked against it, and every stored payload is checked against it.
 */
export function buildCorpusDescriptor(
  chunks,
  {
    schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
    indexVersion = QDRANT_INDEX_VERSION,
    embeddingModel = null,
    vectorSize = null,
    distance = null,
  } = {},
) {
  const ingestable = selectIngestableChunks(chunks);
  const byChunkId = new Map();
  const lines = [];
  for (const chunk of ingestable) {
    const contentHash = chunkContentHash(chunk);
    byChunkId.set(chunk.id, { contentHash, chunk });
    lines.push(corpusDescriptorLine(chunk, { schemaVersion, indexVersion }));
  }
  return {
    expectedCorpusPoints: ingestable.length,
    expectedCorpusFingerprint: fingerprintDescriptorLines(lines),
    byChunkId,
    schemaVersion,
    indexVersion,
    embeddingModel,
    vectorSize,
    distance,
  };
}

/**
 * The identifier for one physical build.
 *
 * `s<schema>i<index>-<corpus fingerprint>-<base36 clock>`. The versions are in
 * the name so an operator listing collections can see at a glance which
 * contract a leftover belongs to; the fingerprint says which corpus; the clock
 * disambiguates two builds of an identical corpus, which happens whenever a
 * rebuild is run to recover from a failure.
 *
 * Kept short on purpose: it becomes a Qdrant collection-name suffix and the
 * whole name is capped at 64 characters.
 */
export function buildIdFor(chunks, { schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION, indexVersion = QDRANT_INDEX_VERSION, now = Date.now() } = {}) {
  const fingerprint = corpusFingerprint(chunks, { schemaVersion, indexVersion }).slice(0, 12);
  return `s${schemaVersion}i${indexVersion}-${fingerprint}-${Number(now).toString(36)}`;
}

/** The build id split into its parts, or null when it is not our shape. */
export function parseBuildId(value) {
  const match = typeof value === "string" ? value.match(/^s(\d+)i(\d+)-([0-9a-f]{12})-([0-9a-z]+)$/) : null;
  if (!match) return null;
  return {
    schemaVersion: Number(match[1]),
    indexVersion: Number(match[2]),
    fingerprintPrefix: match[3],
    clock: match[4],
  };
}

/** Whether a build id is one this pipeline could have produced, by shape only. */
export const isValidBuildId = (value) => parseBuildId(value) !== null;

/**
 * Whether a build id actually DESCRIBES the corpus it is attached to.
 *
 * Shape alone is not identity. `s99i77-000000000000-abc` matches the regex
 * perfectly and names a schema this code does not implement, an index version
 * it cannot read, and a corpus it has never seen — so a collection carrying it
 * would have passed a syntactic check while being, by its own account, a
 * different build entirely.
 *
 * The three encoded components are therefore compared with the values they are
 * supposed to encode. Deterministic, and no cheaper check is meaningful.
 */
export function verifyBuildIdBinding(value, { schemaVersion, indexVersion, corpusFingerprint: fingerprint } = {}) {
  const parsed = parseBuildId(value);
  if (!parsed) return { ok: false, reason: "build-id-invalid" };
  if (parsed.schemaVersion !== schemaVersion) {
    return { ok: false, reason: "build-id-schema-mismatch", expected: schemaVersion, actual: parsed.schemaVersion };
  }
  if (parsed.indexVersion !== indexVersion) {
    return { ok: false, reason: "build-id-index-mismatch", expected: indexVersion, actual: parsed.indexVersion };
  }
  if (typeof fingerprint === "string" && fingerprint) {
    const expected = fingerprint.slice(0, 12);
    if (parsed.fingerprintPrefix !== expected) {
      return { ok: false, reason: "build-id-fingerprint-mismatch", expected, actual: parsed.fingerprintPrefix };
    }
  }
  return { ok: true, reason: "bound", ...parsed };
}

/** The physical collection a build writes to, behind the logical alias. */
export const stagingCollectionName = (alias, buildId) => `${alias}_${buildId}`;

/**
 * Whether a collection NAME looks like one of ours.
 *
 * A necessary condition for cleanup, never a sufficient one — deletion also
 * requires reading a point and finding `corpus_owner`. The alias itself is
 * excluded: it is a logical name, not a physical collection we may drop.
 */
export const looksOwnedCollectionName = (alias, name) =>
  typeof name === "string" && name !== alias && name.startsWith(`${alias}_`);

/**
 * The stored payload for one corpus record.
 *
 * `record_type` is the brief field: the family a record belongs to. Dataset
 * chunks have no entityType, so they report "dataset" while `entity_type` keeps
 * the exact original (null) — the pair round-trips without inventing a type the
 * scoring code would then match against.
 */
export function buildQdrantPayload(
  chunk,
  {
    schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
    indexVersion = QDRANT_INDEX_VERSION,
    buildId = null,
  } = {},
) {
  const visibility = chunkVisibility(chunk);
  return {
    corpus_owner: AJOOP_CORPUS_OWNER,
    record_kind: RECORD_KINDS.CHUNK,
    build_id: buildId,
    chunk_id: chunk.id,
    entity_id: chunk.entityId,
    record_type: chunk.entityType || "dataset",
    entity_type: chunk.entityType ?? null,
    title: chunk.title,
    source: chunk.source,
    tags: [...(chunk.tags || [])],
    text: chunk.text,
    content_hash: chunkContentHash(chunk),
    schema_version: schemaVersion,
    index_version: indexVersion,
    visibility,
    public_safe: visibility !== "public_on_request",
    /* Retrieval-policy metadata. Without these a Qdrant hit cannot be scored
     * the way the in-memory candidate it mirrors is scored. */
    priority: chunk.priority ?? null,
    affinity_hints: [...(chunk.affinityHints || [])],
    metadata: chunk.metadata ?? null,
  };
}

/** One chunk and its vector, as a Qdrant point. */
export function buildQdrantPoint(chunk, vector, options = {}) {
  return {
    id: qdrantPointId(chunk.id),
    vector,
    payload: buildQdrantPayload(chunk, options),
  };
}

/**
 * The build manifest, as a point.
 *
 * A Qdrant collection has no metadata of its own, so "this build finished" has
 * to be written as data. It is the LAST thing a build writes, which is what
 * makes it a completion marker rather than an intention: a build that dies
 * halfway leaves a collection with no manifest, readiness refuses it, and the
 * alias was never moved to it anyway.
 *
 * It is excluded from retrieval twice over — `record_kind` is not "chunk" and
 * `public_safe` is false — so it can never be returned as evidence.
 */
export function buildManifestPoint({
  buildId,
  corpusPoints,
  vectorSize,
  distance,
  schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
  indexVersion = QDRANT_INDEX_VERSION,
  corpusFingerprint: fingerprint,
  embeddingModel,
  builtAt = new Date().toISOString(),
}) {
  return {
    id: MANIFEST_POINT_ID,
    /* A valid vector of the right width, because every point needs one. Its
     * direction is irrelevant: both search filters exclude this point. */
    vector: Array.from({ length: vectorSize }, (unused, position) => (position === 0 ? 1 : 0)),
    payload: {
      corpus_owner: AJOOP_CORPUS_OWNER,
      record_kind: RECORD_KINDS.MANIFEST,
      build_id: buildId,
      schema_version: schemaVersion,
      index_version: indexVersion,
      /* The model that produced every vector in this collection. A model swap
       * makes the stored vectors incomparable to the query vector without
       * changing a single record, so it is checked like a version. */
      embedding_model: embeddingModel,
      vector_size: vectorSize,
      distance,
      corpus_points: corpusPoints,
      /* The whole point of the manifest: a claim about WHICH corpus this is,
       * which the runtime can independently recompute and disagree with. */
      corpus_fingerprint: fingerprint,
      complete: true,
      built_at: builtAt,
      public_safe: false,
    },
  };
}

/**
 * The filter every retrieval search sends.
 *
 * Three predicates, each closing a different hole: `corpus_owner` refuses
 * anything this pipeline did not write, `record_kind` refuses the manifest, and
 * `public_safe` refuses on-request material that should not be in the store in
 * the first place.
 */
export const PUBLIC_SAFE_FILTER = Object.freeze({
  must: Object.freeze([
    { key: "corpus_owner", match: { value: AJOOP_CORPUS_OWNER } },
    { key: "record_kind", match: { value: RECORD_KINDS.CHUNK } },
    { key: "public_safe", match: { value: true } },
  ]),
});

/**
 * The payload indexes that filter needs, DERIVED from the filter itself.
 *
 * A filtered search over unindexed payload is a full scan, and on a managed
 * Qdrant running strict mode it is not a slow query but a rejected one — the
 * cluster answers 400 rather than reading every point. The search probe is the
 * only filtered request an ingestion makes, which is exactly why a build could
 * write 191 points, verify them all, and then die on the one request that
 * filters.
 *
 * Derived rather than listed so the two cannot drift: add a clause to the
 * filter and its index appears here automatically. A boolean clause needs a
 * `bool` index, everything else a `keyword` one.
 */
export const PUBLIC_SAFE_FILTER_INDEXES = Object.freeze(
  PUBLIC_SAFE_FILTER.must.map((clause) =>
    Object.freeze({
      field: clause.key,
      schema: typeof clause.match.value === "boolean" ? "bool" : "keyword",
    }),
  ),
);
