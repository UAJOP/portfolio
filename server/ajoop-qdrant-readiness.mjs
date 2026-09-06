/**
 * Is the remote corpus the one THIS process would have built?
 *
 * That is a much stronger question than the one an earlier version asked, and
 * the difference matters. Checking a manifest against itself — "it says it is
 * complete, and its own point count matches its own collection count" — proves
 * only that a collection is internally consistent. A stale build, a corpus from
 * a different branch, a half-restored snapshot and a deliberately forged
 * collection all pass that test comfortably.
 *
 * The runtime already holds the canonical corpus in memory. So the local
 * retrieval index is the source of truth, and verification is a comparison:
 *
 *   1. THE MANIFEST is checked field by field against the local descriptor —
 *      owner, build id, timestamp, completion, schema and index versions,
 *      embedding model, vector width, distance, corpus size, and the corpus
 *      fingerprint the local process computes for itself.
 *
 *   2. EVERY STORED POINT is then read back and checked against the local chunk
 *      it claims to be. The corpus is ~191 records; reading all of them at
 *      startup costs one scroll and removes the need to trust the manifest at
 *      all. Missing, extra, duplicated, mis-hashed, foreign-owned and
 *      mixed-build records are each their own refusal.
 *
 *   3. THE REMOTE FINGERPRINT is recomputed from those payloads, independently
 *      of what the manifest claimed, and must equal the local one.
 *
 * Anything short of all three: `ok: false` with a reason code, `qdrantReady`
 * false, and the caller falls back to the in-memory index.
 *
 * STRICTLY READ-ONLY. Nothing here creates, repairs, deletes or promotes — a
 * runtime that could fix its own store would answer a misconfigured deployment
 * with an empty index and zero results, which looks exactly like a working
 * system that has nothing to say.
 */
import {
  AJOOP_CORPUS_OWNER,
  MANIFEST_POINT_ID,
  QDRANT_INDEX_VERSION,
  QDRANT_PAYLOAD_SCHEMA_VERSION,
  RECORD_KINDS,
  fingerprintDescriptorLines,
  verifyBuildIdBinding,
  remoteDescriptorLine,
} from "./ajoop-qdrant-points.mjs";
import { assessCollectionCompatibility, readCollectionVectors, scrollAllPoints } from "./ajoop-qdrant.mjs";

/** A refusal, with the reason as a stable code and any useful numbers. */
const no = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/** Payload fields readiness needs. Deliberately not `text`: it is not compared. */
const VERIFY_FIELDS = Object.freeze([
  "chunk_id",
  "content_hash",
  "schema_version",
  "index_version",
  "corpus_owner",
  "record_kind",
  "build_id",
  "public_safe",
]);

/**
 * Check the manifest against the local descriptor.
 *
 * Separated out because it is pure: given a payload and a descriptor it decides
 * without a network, which is what makes every rejection case testable.
 */
export function verifyManifest(manifest, config, descriptor, { schemaVersion, indexVersion }) {
  if (!manifest) return no("manifest-missing");
  if (manifest.record_kind !== RECORD_KINDS.MANIFEST) return no("manifest-malformed");
  if (manifest.corpus_owner !== AJOOP_CORPUS_OWNER) return no("owner-mismatch");
  /* Not just the right SHAPE — the right CONTENT. The build id encodes the
   * schema version, the index version and the corpus fingerprint prefix, and
   * each must equal what this process expects. `s99i77-000000000000-abc` is
   * syntactically perfect and describes a build nothing here could have made. */
  const binding = verifyBuildIdBinding(manifest.build_id, {
    schemaVersion,
    indexVersion,
    corpusFingerprint: descriptor.expectedCorpusFingerprint,
  });
  if (!binding.ok) return no(binding.reason, { buildId: manifest.build_id ?? null, expected: binding.expected, actual: binding.actual });
  /* A timestamp that does not parse is a manifest nobody wrote deliberately. */
  const builtAt = Date.parse(manifest.built_at);
  if (!Number.isFinite(builtAt)) return no("built-at-invalid", { builtAt: manifest.built_at ?? null });
  if (manifest.complete !== true) return no("incomplete-build", { buildId: manifest.build_id });
  if (manifest.schema_version !== schemaVersion) {
    return no("schema-version-mismatch", { expected: schemaVersion, actual: manifest.schema_version ?? null });
  }
  if (manifest.index_version !== indexVersion) {
    return no("index-version-mismatch", { expected: indexVersion, actual: manifest.index_version ?? null });
  }
  if (descriptor.embeddingModel && manifest.embedding_model !== descriptor.embeddingModel) {
    return no("embedding-model-mismatch", {
      expected: descriptor.embeddingModel,
      actual: manifest.embedding_model ?? null,
    });
  }
  if (manifest.vector_size !== config.vectorSize) {
    return no("dimension-mismatch", { expected: config.vectorSize, actual: manifest.vector_size ?? null });
  }
  if (String(manifest.distance).toLowerCase() !== String(config.distance).toLowerCase()) {
    return no("distance-mismatch", { expected: config.distance, actual: manifest.distance ?? null });
  }

  const corpusPoints = Number(manifest.corpus_points);
  if (!Number.isInteger(corpusPoints) || corpusPoints <= 0) {
    return no("empty-corpus", { corpusPoints: manifest.corpus_points ?? null });
  }
  /* The manifest may not define its own size. A collection claiming 5000 points
   * when this process knows the corpus is 191 is refused here, before a single
   * record is read. */
  if (corpusPoints !== descriptor.expectedCorpusPoints) {
    return no("corpus-size-mismatch", { expected: descriptor.expectedCorpusPoints, actual: corpusPoints });
  }
  if (typeof manifest.corpus_fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(manifest.corpus_fingerprint)) {
    return no("corpus-fingerprint-missing", { actual: manifest.corpus_fingerprint ?? null });
  }
  if (manifest.corpus_fingerprint !== descriptor.expectedCorpusFingerprint) {
    return no("corpus-fingerprint-mismatch");
  }
  return { ok: true, corpusPoints, buildId: manifest.build_id, builtAt: manifest.built_at };
}

/**
 * Check every stored corpus point against the local chunk it claims to be.
 *
 * Pure over an already-fetched point list, for the same reason as above. The
 * manifest point is expected and skipped; anything else that is not a corpus
 * record is a refusal rather than something to ignore.
 */
export function verifyStoredPoints(points, descriptor, { buildId, schemaVersion, indexVersion }) {
  const seen = new Set();
  const lines = [];
  for (const point of points) {
    if (String(point?.id) === MANIFEST_POINT_ID) continue;
    const payload = point?.payload || {};
    if (payload.record_kind !== RECORD_KINDS.CHUNK) {
      return no("record-kind-invalid", { pointId: String(point?.id) });
    }
    if (payload.corpus_owner !== AJOOP_CORPUS_OWNER) {
      return no("point-owner-mismatch", { chunkId: payload.chunk_id ?? null });
    }
    /* Every record must belong to the SAME build the manifest describes.
     * A mixed-build collection is a partially overwritten corpus. */
    if (payload.build_id !== buildId) {
      return no("build-id-mismatch", { chunkId: payload.chunk_id ?? null, actual: payload.build_id ?? null });
    }
    if (payload.schema_version !== schemaVersion) {
      return no("point-schema-mismatch", { chunkId: payload.chunk_id ?? null, actual: payload.schema_version ?? null });
    }
    if (payload.index_version !== indexVersion) {
      return no("point-index-mismatch", { chunkId: payload.chunk_id ?? null, actual: payload.index_version ?? null });
    }
    /* On-request material is never ingested, so a stored point that is not
     * public-safe is either corruption or a privacy regression. */
    if (payload.public_safe !== true) {
      return no("public-safe-invalid", { chunkId: payload.chunk_id ?? null });
    }

    const chunkId = payload.chunk_id;
    if (typeof chunkId !== "string" || !chunkId) return no("chunk-id-missing", { pointId: String(point?.id) });
    if (seen.has(chunkId)) return no("duplicate-chunk-id", { chunkId });
    seen.add(chunkId);

    const local = descriptor.byChunkId.get(chunkId);
    if (!local) return no("unexpected-chunk", { chunkId });
    if (payload.content_hash !== local.contentHash) return no("content-hash-mismatch", { chunkId });

    lines.push(remoteDescriptorLine(payload));
  }

  if (seen.size !== descriptor.expectedCorpusPoints) {
    const missing = [...descriptor.byChunkId.keys()].filter((id) => !seen.has(id));
    return no(missing.length ? "missing-chunk" : "point-count-mismatch", {
      expected: descriptor.expectedCorpusPoints,
      actual: seen.size,
      chunkId: missing[0] || null,
    });
  }

  /* Recomputed from the payloads themselves, not from anything the manifest
   * said. If this and the local fingerprint agree, the remote corpus IS the
   * local corpus, record for record. */
  const remoteFingerprint = fingerprintDescriptorLines(lines);
  if (remoteFingerprint !== descriptor.expectedCorpusFingerprint) return no("payload-fingerprint-mismatch");

  return { ok: true, corpusPoints: seen.size, remoteFingerprint };
}

/**
 * Validate one collection (or alias) read-only, against the local corpus.
 *
 * Returns `{ ok, reason, ... }` rather than throwing, because every caller needs
 * to carry on: the bridge degrades to memory and keeps serving, and the
 * ingestion command prints a specific refusal instead of a stack trace.
 */
export async function verifyQdrantCorpus(
  client,
  config,
  {
    collection = config.collection,
    descriptor,
    schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
    indexVersion = QDRANT_INDEX_VERSION,
  } = {},
) {
  if (!descriptor) return no("descriptor-missing", { collection });

  /**
   * The ceiling is a FAIL-CLOSED bound, not a truncation.
   *
   * A corpus larger than one search may request cannot be retrieved completely,
   * and complete retrieval is what makes the two backends provably identical.
   * Serving a 4096-candidate query against a 5000-record corpus while calling
   * it parity would be the exact failure the ceiling was added to prevent.
   */
  if (descriptor.expectedCorpusPoints > config.candidateCeiling) {
    return no("corpus-exceeds-ceiling", {
      collection,
      expected: descriptor.expectedCorpusPoints,
      ceiling: config.candidateCeiling,
    });
  }

  let described;
  try {
    described = await client.getCollection(collection);
  } catch (error) {
    return no("unreachable", { collection, code: error?.code || "internal", status: error?.status || 0 });
  }
  if (!described) return no("missing", { collection });

  const compatibility = assessCollectionCompatibility(readCollectionVectors(described), config);
  if (!compatibility.compatible) {
    return no(compatibility.reason, { collection, expected: compatibility.expected, actual: compatibility.actual });
  }

  let manifestPoint;
  try {
    manifestPoint = await client.getPoint(collection, MANIFEST_POINT_ID);
  } catch (error) {
    return no("unreachable", { collection, code: error?.code || "internal", status: error?.status || 0 });
  }
  const manifestVerdict = verifyManifest(manifestPoint?.payload, config, descriptor, { schemaVersion, indexVersion });
  if (!manifestVerdict.ok) return { ...manifestVerdict, collection };

  let counted;
  try {
    counted = (await client.count(collection))?.result?.count;
  } catch (error) {
    return no("unreachable", { collection, code: error?.code || "internal", status: error?.status || 0 });
  }
  const expectedTotal = descriptor.expectedCorpusPoints + 1;
  if (counted !== expectedTotal) {
    return no("point-count-mismatch", { collection, expected: expectedTotal, actual: counted ?? null });
  }

  /* The full read-back. At ~191 records this is one scroll, and it is what
   * turns "the manifest vouches for itself" into "every record matches ours". */
  let points;
  try {
    points = await scrollAllPoints(client, collection, { withPayload: VERIFY_FIELDS });
  } catch (error) {
    /* `step` distinguishes a failed corpus read-back from a failed manifest or
     * count lookup. Both surface as `unreachable`, and an operator staring at
     * one line needs to know which request died. */
    return no(error?.code === "incomplete-scan" ? "incomplete-scan" : "unreachable", {
      collection,
      step: "scroll",
      code: error?.code || "internal",
      status: error?.status || 0,
    });
  }

  const payloadVerdict = verifyStoredPoints(points, descriptor, {
    buildId: manifestVerdict.buildId,
    schemaVersion,
    indexVersion,
  });
  if (!payloadVerdict.ok) return { ...payloadVerdict, collection };

  return {
    ok: true,
    reason: "verified",
    collection,
    corpusPoints: payloadVerdict.corpusPoints,
    totalPoints: counted,
    buildId: manifestVerdict.buildId,
    builtAt: manifestVerdict.builtAt,
    corpusFingerprint: payloadVerdict.remoteFingerprint,
    schemaVersion,
    indexVersion,
    vectorSize: config.vectorSize,
    distance: config.distance,
    verifiedPayloads: true,
  };
}
