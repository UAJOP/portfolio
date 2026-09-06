/**
 * Shadow comparison: what Qdrant WOULD have retrieved, recorded and forgotten.
 *
 * Shadow mode exists to answer one question before anything is switched over —
 * does the persistent store rank the corpus the way the in-memory index does?
 * Answering it requires keeping a little evidence, and keeping evidence beside
 * a visitor conversation is exactly where a comparison feature turns into a
 * transcript log. So the boundary is drawn hard:
 *
 *   WHAT IS RECORDED: an internal diagnostic turn number, record ids, ranks, an
 *   overlap count, a latency, an error code. All of it derived from the corpus
 *   or from a counter, none of it from the visitor.
 *
 *   WHAT IS NEVER RECORDED: the question, the retrieval text, the answer, the
 *   locale, the history, an origin, an IP, a wall-clock timestamp precise
 *   enough to correlate turns.
 *
 * A chunk id like "master-knowledge:project:sinama:1" says which public record
 * ranked where. It says nothing about who asked or what they typed, which is
 * the property that keeps this a diagnostic instead of a log.
 *
 * TURNS ARE IDENTIFIED, NOT ASSUMED. An earlier version kept a single
 * `pendingShadow` promise, which is only correct while exactly one turn is ever
 * in flight — the second concurrent turn overwrote the first, and whichever
 * Qdrant call happened to finish last defined what "the last comparison" meant.
 * Every shadow query now carries a monotonic diagnostic id assigned when the
 * turn starts, so completion ORDER can no longer change identity.
 *
 * The buffer is bounded and in-process. It is never written to disk, never
 * serialised into an HTTP response body, and it disappears when the bridge
 * restarts.
 */

/** Ids kept per side of one comparison. Enough to see the head of the ranking. */
const MAX_RECORDED_IDS = 12;

/** Rank rows kept per comparison. */
const MAX_RANK_ROWS = 12;

/**
 * One comparison, as data.
 *
 * `rankDifferences` only covers ids BOTH sides returned — an id present in one
 * ranking and absent from the other has no rank to difference against, and
 * those are reported separately as onlyInMemory / onlyInQdrant, which is the
 * more interesting signal anyway.
 */
export function compareRetrieval({ memoryIds = [], qdrantIds = [] } = {}) {
  const memory = memoryIds.slice(0, MAX_RECORDED_IDS);
  const qdrant = qdrantIds.slice(0, MAX_RECORDED_IDS);
  const qdrantRank = new Map(qdrant.map((id, position) => [id, position + 1]));

  const rankDifferences = [];
  let overlap = 0;
  memory.forEach((id, position) => {
    const other = qdrantRank.get(id);
    if (other === undefined) return;
    overlap += 1;
    if (rankDifferences.length < MAX_RANK_ROWS) {
      rankDifferences.push({ id, memoryRank: position + 1, qdrantRank: other, delta: other - (position + 1) });
    }
  });

  const memorySet = new Set(memory);
  return {
    memoryTopIds: memory,
    qdrantTopIds: qdrant,
    overlap,
    /* Denominated by the AUTHORITATIVE side. "How much of what we served did
     * the store also find" is the question shadow mode is asking. */
    overlapRatio: memory.length ? Number((overlap / memory.length).toFixed(4)) : 0,
    /* The property the parity work is actually chasing: not just the same set,
     * the same order. */
    identical:
      memory.length === qdrant.length && memory.every((id, position) => qdrant[position] === id),
    rankDifferences,
    onlyInMemory: memory.filter((id) => !qdrantRank.has(id)).slice(0, MAX_RANK_ROWS),
    onlyInQdrant: qdrant.filter((id) => !memorySet.has(id)).slice(0, MAX_RANK_ROWS),
  };
}

/**
 * A bounded ring of completed comparisons, a bounded map of in-flight ones, and
 * running totals.
 *
 * `limit` completed entries are kept; everything older is dropped, not
 * summarised, so the memory cost is fixed regardless of traffic. In-flight
 * promises are bounded the same way: a cluster that never answers cannot grow
 * this map without bound, because the oldest pending entry is evicted once the
 * cap is reached. Eviction drops the HANDLE, not the promise — the promise is
 * already `.catch()`-guarded, so a late rejection still cannot surface as an
 * unhandled rejection.
 */
export function createShadowRecorder({ limit = 20, pendingLimit = 32, turnLimit = 128 } = {}) {
  const entries = [];
  /**
   * Turn id → `{ state, promise }`, where state is pending | evicted |
   * completed.
   *
   * The states exist because eviction and completion are different facts and an
   * earlier version conflated them. Evicting a turn's handle used to remove it
   * from the map entirely, and `settled(turnId)` then fell through to
   * `Promise.resolve()` — reporting success for a query that was still running
   * against a cluster that had not answered. A diagnostic that lies about
   * whether it finished is worse than one that admits it lost track.
   *
   * An evicted turn keeps its (already guarded) promise so it can still flip to
   * `completed` when it eventually resolves, and `settled()` reports `evicted`
   * with `settled: false` until it does.
   */
  const turns = new Map();
  let nextTurnId = 0;
  let comparisons = 0;
  let errors = 0;
  let overlapTotal = 0;
  let overlapSamples = 0;
  let identicalCount = 0;
  let latencyTotal = 0;
  let lastError = null;

  const push = (entry) => {
    entries.push(entry);
    while (entries.length > limit) entries.shift();
  };

  /* A plain function rather than a method, so a destructured `report` still
   * works — these are handed straight to QA helpers. */
  const summary = () => ({
    comparisons,
    errors,
    identical: identicalCount,
    averageOverlapRatio: overlapSamples ? Number((overlapTotal / overlapSamples).toFixed(4)) : 0,
    averageLatencyMs: comparisons ? Number((latencyTotal / comparisons).toFixed(2)) : 0,
    lastError,
    buffered: entries.length,
    pending: [...turns.values()].filter((turn) => turn.state === "pending").length,
    evicted: [...turns.values()].filter((turn) => turn.state === "evicted").length,
    tracked: turns.size,
  });

  return {
    /**
     * Claim an identity for a turn about to run a shadow query.
     *
     * Assigned BEFORE the query starts, so two concurrent turns are distinct
     * from the moment they begin rather than from the moment they finish.
     */
    nextTurn: () => {
      nextTurnId += 1;
      return nextTurnId;
    },

    /**
     * Register the in-flight query for a turn.
     *
     * The promise handed in must already be failure-proof; this attaches a
     * further `.catch()` anyway, because the one thing a diagnostic must never
     * do is take the bridge down with an unhandled rejection.
     */
    track: (turnId, promise) => {
      const guarded = Promise.resolve(promise).catch(() => {});
      const entry = { state: "pending", promise: guarded };
      turns.set(turnId, entry);

      /* Bound the number of turns whose completion we are still waiting on.
       * The oldest still-pending turn is DOWNGRADED, not forgotten. */
      const pendingIds = [...turns.entries()].filter(([, turn]) => turn.state === "pending");
      for (let i = 0; i < pendingIds.length - pendingLimit; i += 1) {
        pendingIds[i][1].state = "evicted";
      }
      /* Bound the record map itself, oldest first. A turn dropped here is
       * genuinely unknown afterwards, which `settled()` reports as such. */
      while (turns.size > turnLimit) turns.delete(turns.keys().next().value);

      guarded.then(() => {
        const current = turns.get(turnId);
        /* Only mark our own entry, and only if it is still the same one. */
        if (current === entry) entry.state = "completed";
      });
      return guarded;
    },

    /**
     * Settle one turn, or every currently in-flight turn.
     *
     * Always resolves to an explicit status. `settled: false` means the shadow
     * query for that turn is NOT known to have finished — never silently
     * resolved as though it had.
     */
    settled: async (turnId) => {
      if (turnId === undefined || turnId === null) {
        /* A SNAPSHOT: awaiting this must not also wait on turns that start
         * while we are waiting, or a busy bridge would never settle. */
        const snapshot = [...turns.entries()].filter(([, turn]) => turn.state === "pending");
        await Promise.all(snapshot.map(([, turn]) => turn.promise));
        return { status: "settled", settled: true, turns: snapshot.map(([id]) => id) };
      }
      const entry = turns.get(turnId);
      if (!entry) return { turnId, status: "unknown", settled: false };
      if (entry.state === "completed") return { turnId, status: "completed", settled: true };
      if (entry.state === "evicted") {
        /* Deliberately not awaited: an evicted turn is one we stopped
         * guaranteeing, and blocking on it would reintroduce the unbounded
         * wait eviction exists to prevent. Reported honestly instead. */
        return { turnId, status: "evicted", settled: false };
      }
      await entry.promise;
      return { turnId, status: "completed", settled: true };
    },

    /** One successful comparison. */
    record({ turnId = null, comparison, latencyMs = null, topK = null, candidates = null, candidateLimit = null }) {
      comparisons += 1;
      overlapTotal += comparison.overlapRatio;
      overlapSamples += 1;
      if (comparison.identical) identicalCount += 1;
      if (typeof latencyMs === "number") latencyTotal += latencyMs;
      push({ turnId, ok: true, topK, candidates, candidateLimit, latencyMs, ...comparison });
    },

    /**
     * One failed Qdrant call.
     *
     * `error` is already normalised to a code and a status by
     * server/ajoop-qdrant.mjs — a raw message could carry a URL.
     */
    recordError({ turnId = null, error, latencyMs = null, memoryIds = [] }) {
      comparisons += 1;
      errors += 1;
      lastError = error || { code: "internal", status: 0 };
      if (typeof latencyMs === "number") latencyTotal += latencyMs;
      push({
        turnId,
        ok: false,
        error: lastError,
        latencyMs,
        memoryTopIds: memoryIds.slice(0, MAX_RECORDED_IDS),
        qdrantTopIds: [],
        overlap: 0,
        overlapRatio: 0,
        identical: false,
        rankDifferences: [],
      });
    },

    /** Aggregate counters only. Safe to include in operator-facing status. */
    summary,

    /** The counters plus the retained comparisons, oldest first. */
    report: () => ({ ...summary(), entries: entries.map((entry) => ({ ...entry })) }),
  };
}
