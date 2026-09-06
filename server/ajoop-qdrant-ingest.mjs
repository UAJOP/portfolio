/**
 * Corpus ingestion: build a whole new collection, verify it, then move an alias.
 *
 * This replaces an in-place "scan the live collection, upsert what changed,
 * delete what is missing" strategy, and the reason is worth writing down
 * because the old one looked more efficient.
 *
 * In-place ingestion mutates the collection visitors are querying. A run that
 * dies between its third and fourth batch leaves the live corpus in a state no
 * one designed: some records new, some old, some deleted. Worse, the sweep
 * deleted "points that are not in my desired set", and a desired set that came
 * out wrong — a data defect, a partial read, the wrong collection name — makes
 * that a command to delete other people's data. There is no version of that
 * design where a bug is merely a bad search result.
 *
 * So a build never touches what is live:
 *
 *   create staging physical collection   ajoop_portfolio_v1_<build id>
 *         ↓
 *   embed and write the COMPLETE desired corpus
 *         ↓
 *   write the manifest (the completion marker) LAST
 *         ↓
 *   verify vector config, ownership, schema/index version, point count
 *         ↓
 *   read/search sanity check against the staging collection
 *         ↓
 *   move the alias atomically, in one request
 *         ↓
 *   STOP — the previous collection is reported, never deleted
 *
 * If anything fails before the promotion, the alias never moves and visitors
 * keep using the previous complete corpus. The only thing an aborted run may
 * remove is its OWN staging collection.
 *
 * Every phase carries a stage name, so a failure says WHERE it happened without
 * saying anything about the request that carried it — see
 * server/ajoop-qdrant-diagnostics.mjs.
 *
 * Corpus embedding never happens inside a visitor request: this module is
 * reached from scripts/ajoop-qdrant-ingest.mjs and from the opt-in live smoke
 * test, and server/ajoop-rag.mjs does not import it.
 */
import {
  AJOOP_CORPUS_OWNER,
  PUBLIC_SAFE_FILTER,
  PUBLIC_SAFE_FILTER_INDEXES,
  QDRANT_INDEX_VERSION,
  QDRANT_PAYLOAD_SCHEMA_VERSION,
  RECORD_KINDS,
  buildCorpusDescriptor,
  buildIdFor,
  buildManifestPoint,
  buildQdrantPoint,
  qdrantPointId,
  selectIngestableChunks,
  stagingCollectionName,
} from "./ajoop-qdrant-points.mjs";
import { verifyQdrantCorpus } from "./ajoop-qdrant-readiness.mjs";
import { INGESTION_STAGES, tagStage } from "./ajoop-qdrant-diagnostics.mjs";

/**
 * The corpus invariant, enforced again at the ingestion boundary.
 *
 * server/ajoop-rag.mjs already refuses to build a corpus with a duplicate chunk
 * id, and this checks the same thing on the point ids that are actually about
 * to be written. Two chunks mapping to one point id is not a collision to
 * resolve — the second silently overwrites the first and a canonical record
 * ceases to exist — so it stops the run.
 */
export function assertUniquePointIds(chunks) {
  const seen = new Map();
  const collisions = [];
  for (const chunk of chunks) {
    const pointId = qdrantPointId(chunk.id);
    const previous = seen.get(pointId);
    if (previous) collisions.push(`${previous.id} / ${chunk.id}`);
    else seen.set(pointId, chunk);
  }
  if (collisions.length) {
    throw new Error(
      `duplicate qdrant point id(s): ${collisions.length} collision(s) — ${collisions.slice(0, 3).join("; ")}`,
    );
  }
  return seen;
}

/**
 * What this build will contain, decided before anything is created.
 *
 * A pure function, so the whole corpus-accounting contract — what is ingested,
 * what is deliberately excluded, what the build is called — is testable without
 * a cluster, a model or a clock.
 */
export function planQdrantBuild({
  chunks = [],
  schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
  indexVersion = QDRANT_INDEX_VERSION,
  embeddingModel = null,
  alias,
  now = Date.now(),
} = {}) {
  const ingestable = selectIngestableChunks(chunks);
  assertUniquePointIds(ingestable);
  const buildId = buildIdFor(ingestable, { schemaVersion, indexVersion, now });
  /* The same descriptor the runtime will build for itself. Writing the corpus
   * from it and later verifying against it is what makes remote-equals-local a
   * property rather than a hope. */
  const descriptor = buildCorpusDescriptor(chunks, { schemaVersion, indexVersion, embeddingModel });
  return {
    ingestable,
    excluded: chunks.length - ingestable.length,
    buildId,
    staging: stagingCollectionName(alias, buildId),
    descriptor,
    corpusFingerprint: descriptor.expectedCorpusFingerprint,
    /* Corpus records plus the one manifest point. The number readiness will
     * later require the collection to contain, exactly. */
    expectedPoints: ingestable.length + 1,
  };
}

/**
 * AJOOP 5.3 DELETES NO OLD COLLECTION. This is deliberate and final for this
 * release.
 *
 * Two earlier designs tried to make automatic cleanup safe: first by scanning
 * for names and manifests that looked owned, then by narrowing to the alias's
 * own previous target with a strict re-verification on top. The second was much
 * safer than the first — and it was still a rebuild that ends by deleting a
 * production collection based on a check it wrote itself.
 *
 * The trade is not close. An orphan collection costs a few megabytes on a cloud
 * plan and is removed by a person in one command. A wrong automatic deletion
 * costs data, silently, at the moment the operator is least watching. So a
 * successful ingestion STOPS at the alias promotion and REPORTS what it left
 * behind; removing it is an explicit operator action.
 *
 * The one deletion that remains is a run removing its OWN staging collection
 * after its OWN failure, before any promotion. That collection was created
 * seconds earlier by this process, its name is held in a local variable, and no
 * alias has ever pointed at it — the provenance is direct rather than inferred.
 */
export const AJOOP_AUTOMATIC_CLEANUP = false;

/**
 * Run one build.
 *
 * `embed` takes an array of strings and returns vectors in the same order — the
 * contract server/ajoop-embedding.mjs exposes, so ingestion and the request path
 * share one embedding implementation and cannot disagree about normalisation.
 */
export async function runQdrantIngestion({
  client,
  config,
  chunks,
  embed,
  schemaVersion = QDRANT_PAYLOAD_SCHEMA_VERSION,
  indexVersion = QDRANT_INDEX_VERSION,
  embeddingModel = null,
  dryRun = false,
  now = Date.now,
  onProgress = () => {},
} = {}) {
  const startedAt = Date.now();
  const alias = config.collection;

  /**
   * Run one phase, tagging whatever it throws with the phase's name.
   *
   * A live build failed with nothing but `fetch failed`, and every component
   * had already been probed green on its own — so the missing information was
   * never "what went wrong" but "where". Tagging is additive and never
   * swallows: the original error propagates with its own code, status and
   * cause intact, plus a stage.
   */
  const runStage = async (stage, work, extra = {}) => {
    try {
      return await work();
    } catch (error) {
      throw tagStage(error, stage, extra);
    }
  };
  const plan = planQdrantBuild({ chunks, schemaVersion, indexVersion, embeddingModel, alias, now: now() });
  onProgress({
    stage: "planned",
    buildId: plan.buildId,
    staging: plan.staging,
    points: plan.ingestable.length,
    excluded: plan.excluded,
  });

  /**
   * The alias name must not already be a physical collection.
   *
   * Qdrant refuses an alias whose name collides with a real collection, and it
   * refuses it at promotion time — after the corpus has been embedded and
   * written. Checking first turns a late, expensive failure into an immediate
   * one with a specific instruction, and it is also the exact state a cluster is
   * left in by any earlier non-alias ingestion.
   */
  /* PREFLIGHT: two read-only lookups before anything is created. A failure
   * here is a cluster/credential problem, and saying so beats letting it look
   * like a corpus problem later. */
  const existingCollections = await runStage(INGESTION_STAGES.PREFLIGHT, () => client.listCollections());
  if (existingCollections.includes(alias)) {
    const error = new Error(`alias name "${alias}" is occupied by a physical collection`);
    error.reason = "alias-name-occupied";
    error.alias = alias;
    throw error;
  }

  const aliases = await runStage(INGESTION_STAGES.PREFLIGHT, () => client.listAliases());
  const previous = aliases.find((entry) => entry.alias === alias)?.collection || null;
  onProgress({ stage: "current", previous });

  if (dryRun) {
    return {
      dryRun: true,
      buildId: plan.buildId,
      staging: plan.staging,
      previous,
      plannedPoints: plan.ingestable.length,
      expectedPoints: plan.expectedPoints,
      excludedOnRequest: plan.excluded,
      corpusFingerprint: plan.corpusFingerprint,
      /* Reported so an operator can see what a real run would leave behind.
       * Nothing acts on it. */
      previousPhysicalCollection: previous,
      cleanupRequired: Boolean(previous),
      promoted: false,
      durationMs: Date.now() - startedAt,
    };
  }

  await runStage(INGESTION_STAGES.CREATE_STAGING, () => client.createCollection(plan.staging));
  onProgress({ stage: "created", staging: plan.staging });

  /**
   * Index the payload fields the retrieval filter uses, before anything filters.
   *
   * Every retrieval Ajoop makes filters on `corpus_owner`, `record_kind` and
   * `public_safe`, and a managed Qdrant running strict mode REFUSES a filtered
   * search over unindexed payload — 400, not a slow scan. That is why a build
   * could create a collection, embed the corpus, upsert 191 points, write the
   * manifest and verify every record, then die on the search probe: the probe
   * is the only filtered request an ingestion makes.
   *
   * Indexing here rather than at the probe means the collection is ready for
   * the runtime's filter too, which is the same filter.
   */
  for (const index of PUBLIC_SAFE_FILTER_INDEXES) {
    await runStage(INGESTION_STAGES.CREATE_PAYLOAD_INDEX, () =>
      client.createPayloadIndex(plan.staging, index.field, index.schema),
    );
  }
  onProgress({ stage: "indexed", fields: PUBLIC_SAFE_FILTER_INDEXES.map((index) => index.field) });

  let written = 0;
  let batches = 0;
  try {
    const batchSize = config?.upsertBatchSize || 64;
    const totalBatches = Math.max(1, Math.ceil(plan.ingestable.length / batchSize));
    let probe = null;
    for (let offset = 0; offset < plan.ingestable.length; offset += batchSize) {
      const batch = plan.ingestable.slice(offset, offset + batchSize);
      /* The batch ORDINAL, never its contents: "which of the twelve" is the
       * whole diagnostic value, and the text is corpus material. */
      const ordinal = Math.floor(offset / batchSize) + 1;
      const where = { batch: ordinal, batches: totalBatches };

      const vectors = await runStage(
        INGESTION_STAGES.EMBED_BATCH,
        async () => {
          const result = await embed(batch.map((chunk) => chunk.text));
          if (!Array.isArray(result) || result.length !== batch.length) {
            throw new Error("embedding batch size mismatch");
          }
          return result;
        },
        where,
      );
      /* A REAL ingested vector plus the record it belongs to. The probe then
       * proves the staged vectors are searchable using one of them, and costs
       * no extra embedding. */
      if (!probe) probe = { vector: vectors[0], chunkId: batch[0].id };

      await runStage(
        INGESTION_STAGES.UPSERT_BATCH,
        () =>
          client.upsert(
            plan.staging,
            batch.map((chunk, position) =>
              buildQdrantPoint(chunk, vectors[position], { schemaVersion, indexVersion, buildId: plan.buildId }),
            ),
          ),
        where,
      );
      written += batch.length;
      batches += 1;
      onProgress({ stage: "written", done: written, total: plan.ingestable.length, batch: ordinal, batches: totalBatches });
    }

    /* The manifest is written LAST and only once every record is in. That
     * ordering is what makes it a completion marker: a build that dies halfway
     * leaves a collection readiness will refuse, and the alias never saw it. */
    await runStage(INGESTION_STAGES.WRITE_MANIFEST, () =>
      client.upsert(plan.staging, [
        buildManifestPoint({
          buildId: plan.buildId,
          corpusPoints: plan.ingestable.length,
          vectorSize: config.vectorSize,
          distance: config.distance,
          schemaVersion,
          indexVersion,
          corpusFingerprint: plan.corpusFingerprint,
          embeddingModel,
          builtAt: new Date(now()).toISOString(),
        }),
      ]),
    );
    onProgress({ stage: "manifest", buildId: plan.buildId });

    const verified = await runStage(INGESTION_STAGES.VERIFY_COLLECTION, () =>
      verifyQdrantCorpus(client, config, {
        collection: plan.staging,
        descriptor: plan.descriptor,
        schemaVersion,
        indexVersion,
      }),
    );
    if (!verified.ok) {
      const error = new Error(`staging collection failed verification: ${verified.reason}`);
      error.verification = verified;
      error.reason = verified.reason;
      /* Readiness reads the whole corpus back; when that read is what failed,
       * say so rather than blaming verification in general. */
      tagStage(
        error,
        verified.step === "scroll" || verified.reason === "incomplete-scan"
          ? INGESTION_STAGES.VERIFY_SCROLL
          : INGESTION_STAGES.VERIFY_COLLECTION,
      );
      throw error;
    }
    onProgress({ stage: "verified", points: verified.corpusPoints });

    /* A real search against the staging collection, through the same filter the
     * runtime uses. Verification proves the collection is shaped right; this
     * proves it actually answers. */
    if (probe) {
      await runStage(INGESTION_STAGES.SEARCH_PROBE, async () => {
        const refuse = (reason, message) => {
          const error = new Error(message);
          error.reason = reason;
          throw error;
        };
        const response = await client.search(plan.staging, {
          vector: probe.vector,
          limit: 1,
          filter: PUBLIC_SAFE_FILTER,
        });
        const hit = response?.result?.[0];
        /* Four things, each a different way a collection can look built and not
         * be usable: it answers at all, the answer is ours, the answer is a
         * corpus record rather than the manifest, and the record belongs to
         * THIS build rather than a leftover. */
        if (!hit) refuse("search-probe-empty", "staging search returned no hit");
        if (hit.payload?.corpus_owner !== AJOOP_CORPUS_OWNER) {
          refuse("search-probe-foreign-owner", "staging search returned a foreign point");
        }
        if (hit.payload?.record_kind !== RECORD_KINDS.CHUNK) {
          refuse("search-probe-wrong-kind", "staging search returned a non-corpus point");
        }
        if (hit.payload?.build_id !== plan.buildId) {
          refuse("search-probe-foreign-build", "staging search returned a point from another build");
        }
        if (!plan.descriptor.byChunkId.has(hit.payload?.chunk_id)) {
          refuse("search-probe-unknown-chunk", "staging search returned a chunk the corpus does not contain");
        }
        onProgress({ stage: "probed", chunkId: hit.payload?.chunk_id, queried: probe.chunkId });
      });
    }
  } catch (error) {
    /* The staging collection was created by THIS run and no alias points at it,
     * so removing it cannot affect anything a visitor can reach. Best effort:
     * a leftover staging collection is untidy, a failed cleanup that masks the
     * real error is worse.
     *
     * A cleanup failure is therefore recorded ALONGSIDE the primary failure and
     * never in place of it. The primary error is the one that explains the run;
     * losing it to a secondary error while tidying up would be the diagnostic
     * equivalent of a catch block that swallows. */
    try {
      await client.deleteCollection(plan.staging);
    } catch (cleanupError) {
      tagStage(cleanupError, INGESTION_STAGES.FAILED_STAGING_CLEANUP);
      error.cleanupFailure = cleanupError;
      error.stagingRetained = plan.staging;
    }
    error.aliasMoved = false;
    error.staging = plan.staging;
    throw error;
  }

  await runStage(INGESTION_STAGES.ALIAS_PROMOTION, () => client.promoteAlias(plan.staging, { previous }));
  onProgress({ stage: "promoted", from: previous, to: plan.staging });

  /**
   * THE RUN ENDS HERE. Nothing is deleted after a promotion.
   *
   * The previous physical collection is reported and left in place. See
   * AJOOP_AUTOMATIC_CLEANUP above for why: the storage is trivial, the
   * destructive risk is not, and removing an old build is a one-command
   * operator action taken by someone who is looking at the cluster.
   */
  if (previous) onProgress({ stage: "cleanup-required", collection: previous });

  return {
    dryRun: false,
    buildId: plan.buildId,
    staging: plan.staging,
    previous,
    promoted: true,
    written,
    batches,
    expectedPoints: plan.expectedPoints,
    excludedOnRequest: plan.excluded,
    corpusFingerprint: plan.corpusFingerprint,
    /* Operator-facing, not machine-actioned. */
    previousPhysicalCollection: previous,
    cleanupRequired: Boolean(previous),
    deleted: [],
    durationMs: Date.now() - startedAt,
  };
}
