/**
 * A small Qdrant REST adapter. No SDK, no dependency.
 *
 * Ajoop needs a bounded slice of Qdrant: describe a collection, create one,
 * upsert points, search exactly, count, scroll, retrieve one point by id, list
 * collections, and move an alias. A client library would add a dependency, a
 * release cadence and a surface area to audit in exchange for a dozen fetch
 * calls, so it is written out.
 *
 * Three properties are load-bearing:
 *
 * 1. THE API KEY NEVER ENTERS AN ERROR. Every failure is raised as a
 *    `QdrantError` carrying a stable `code`, an HTTP `status` and the request
 *    PATH — never the base URL, never a header, never a response body that
 *    might echo the key back. An error is the most likely thing to be logged,
 *    stringified into a report or pasted into an issue, so it is the place a
 *    credential must not be.
 *
 * 2. EVERY CALL IS BOUNDED. An AbortController closes each request at the
 *    configured timeout. The shadow path runs beside a turn a visitor is
 *    waiting on; a cloud cluster that stops answering must cost that turn
 *    nothing.
 *
 * 3. A PARTIAL READ IS AN ERROR, NOT A RESULT. scrollAllPoints() throws when it
 *    still holds a continuation cursor at its page limit rather than returning
 *    what it managed to fetch. A "complete" corpus scan that silently stopped
 *    early is how a validation passes on half a collection.
 *
 * `fetchImpl` is injectable so scripts/qa-ajoop-qdrant.mjs drives every branch
 * against mocked HTTP, the way the bridge and RAG suites already do.
 */

/**
 * The safe cause of a transport failure: a SYMBOL, never a message.
 *
 * `fetch failed` on its own is useless for diagnosis and it is all undici gives
 * you at the top level — the real signal is nested in `error.cause.code`
 * (ECONNRESET, ETIMEDOUT, ENOTFOUND, EPROTO, UND_ERR_CONNECT_TIMEOUT,
 * UND_ERR_HEADERS_TIMEOUT, …). Those codes are a closed vocabulary of
 * infrastructure states: they name what the socket did and cannot carry a URL,
 * a header or a payload fragment.
 *
 * Anything that is NOT one of those shapes is dropped rather than truncated. A
 * cause message can contain the request it failed on, and the request carries
 * the API key.
 */
const SAFE_CAUSE = /^(?:E[A-Z0-9_]{2,30}|UND_ERR_[A-Z0-9_]{1,30}|ABORT_ERR|CERT_[A-Z0-9_]{1,30}|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/;

export function safeCauseCode(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    const code = typeof current.code === "string" ? current.code : "";
    if (SAFE_CAUSE.test(code)) return code;
  }
  /* A name is also a closed vocabulary and is useful when no code is set. */
  const name = typeof error?.name === "string" ? error.name : "";
  return /^[A-Za-z]{1,40}Error$/.test(name) && name !== "Error" ? name : null;
}

/**
 * A Qdrant failure, reduced to something safe to record.
 *
 * `code` is what callers branch on. `status` is 0 for a transport failure and
 * for a timeout, which the `code` then distinguishes. `method` and `path`
 * identify the operation without identifying the cluster — there is no base URL
 * here and never will be.
 */
export class QdrantError extends Error {
  constructor(code, { status = 0, path = "", method = "", cause = null, detail = null } = {}) {
    super(`qdrant ${code}${status ? ` (${status})` : ""}${path ? ` ${path}` : ""}`);
    this.name = "QdrantError";
    this.qdrant = true;
    this.code = code;
    this.status = status;
    this.path = path;
    this.method = method;
    /* Already a symbol by the time it reaches here — see safeCauseCode(). */
    this.causeCode = cause;
    /* A SYMBOL from the closed list below, never the response text. Qdrant
     * echoes request fragments in its error prose and the request carries the
     * key, so the body is classified and discarded, never carried. */
    this.detail = ERROR_DETAILS.has(detail) ? detail : null;
  }
}

/**
 * What a Qdrant error body can be reduced to. A closed vocabulary.
 *
 * This exists because refusing to look at the body cost a whole ingestion run.
 * A build wrote every point, verified all 191 of them, and then failed with
 * `status=400` and nothing else — and a bare 400 on a structurally valid search
 * has at least two very different causes on a managed cluster: filtering an
 * unindexed payload field, and exact search being disallowed. One is fixed by
 * creating an index, the other by a cluster setting. Guessing between them is
 * another run each way.
 *
 * So the body is MATCHED against fixed patterns and reduced to one of these
 * symbols. The text itself is never stored, never attached to the error and
 * never printed — the same discipline safeCauseCode() applies to sockets.
 */
const ERROR_DETAILS = new Set([
  "index-required",
  "exact-search-not-allowed",
  "strict-mode",
  "dimension-mismatch",
  "wrong-vector-name",
  "not-found",
  "unauthorized",
  "payload-too-large",
  "bad-request",
]);

const DETAIL_PATTERNS = Object.freeze([
  [/index required but not found|requires an index|index required/i, "index-required"],
  [/exact search .*not allow|not allow.*exact search|exact.*disabled/i, "exact-search-not-allowed"],
  [/strict mode/i, "strict-mode"],
  [/vector dimension error|expected dim|dimension.*mismatch/i, "dimension-mismatch"],
  [/vector name error|wrong vector name|named vector/i, "wrong-vector-name"],
  [/doesn't exist|does not exist|not found/i, "not-found"],
  [/unauthorized|forbidden|invalid api key/i, "unauthorized"],
  [/payload too large|body limit|too large/i, "payload-too-large"],
  [/wrong input|bad request|json parse|format error/i, "bad-request"],
]);

/** Bytes of an error body worth reading. A refusal explains itself early. */
const MAX_ERROR_BODY = 4096;

/**
 * One symbol for an error response, or null.
 *
 * Reads at most 4 KB, matches, and lets the text go. Never throws: a body that
 * cannot be read is simply a failure with no extra detail, which is exactly
 * where this started.
 */
export async function classifyErrorBody(response) {
  let text = "";
  try {
    if (typeof response?.text !== "function") return null;
    text = String(await response.text()).slice(0, MAX_ERROR_BODY);
  } catch (error) {
    return null;
  }
  for (const [pattern, symbol] of DETAIL_PATTERNS) {
    if (pattern.test(text)) return symbol;
  }
  return null;
}

/**
 * A failure as a bounded, id-free record for the shadow report.
 *
 * Anything that is not a QdrantError collapses to "internal": an unexpected
 * exception has an unbounded message and no business being stored.
 */
export function normalizeQdrantError(error) {
  if (!error) return null;
  if (error?.qdrant) return { code: error.code, status: error.status || 0 };
  if (error?.name === "AbortError") return { code: "timeout", status: 0 };
  return { code: "internal", status: 0 };
}

/**
 * The vector parameters of an existing collection, or null when it has a shape
 * this adapter does not use.
 *
 * Qdrant returns `config.params.vectors` either as `{ size, distance }` for the
 * default unnamed vector or as a map of NAMED vectors. Ajoop stores one unnamed
 * vector per point, so a named-vector collection is reported as incompatible
 * rather than guessed at — writing unnamed points into it would be rejected per
 * request, at ingestion time, with no clear reason.
 */
export function readCollectionVectors(payload) {
  const vectors = payload?.result?.config?.params?.vectors;
  if (!vectors || typeof vectors !== "object") return null;
  if (Number.isInteger(vectors.size) && typeof vectors.distance === "string") {
    return { size: vectors.size, distance: vectors.distance, named: false };
  }
  const names = Object.keys(vectors);
  if (names.length === 1 && names[0] === "") {
    const single = vectors[""];
    if (Number.isInteger(single?.size) && typeof single?.distance === "string") {
      return { size: single.size, distance: single.distance, named: false };
    }
  }
  return { size: null, distance: null, named: true, names };
}

/**
 * Whether a collection can hold this corpus.
 *
 * Returned as data rather than thrown so callers can print a precise refusal.
 * A mismatch is never repaired: recreating a collection to make a dimension fit
 * deletes whatever production data was in it, and that decision belongs to a
 * person, not to a script running unattended.
 */
export function assessCollectionCompatibility(existing, config) {
  if (!existing) return { compatible: false, reason: "missing" };
  if (existing.named) return { compatible: false, reason: "named-vectors" };
  if (existing.size !== config.vectorSize) {
    return { compatible: false, reason: "dimension-mismatch", expected: config.vectorSize, actual: existing.size };
  }
  if (String(existing.distance).toLowerCase() !== String(config.distance).toLowerCase()) {
    return { compatible: false, reason: "distance-mismatch", expected: config.distance, actual: existing.distance };
  }
  return { compatible: true, reason: "compatible" };
}

export function createQdrantClient({ config, fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  if (!config?.url || !config?.apiKey || !config?.collection) {
    throw new QdrantError("not-configured");
  }
  const budget = Number.isInteger(timeoutMs) ? timeoutMs : config.timeoutMs;
  const base = config.url.replace(/\/+$/, "");
  /* Long operations get their own budget: the shadow timeout is sized for a
   * search running beside a visitor turn, not for writing a corpus. */
  const longBudget = Math.max(budget, 30000);
  const pathFor = (name) => `/collections/${encodeURIComponent(name)}`;

  const request = async (method, path, body, { allow404 = false, budgetMs = budget } = {}) => {
    if (typeof fetchImpl !== "function") throw new QdrantError("fetch-unavailable", { path, method });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          /* Qdrant Cloud accepts either header; sending the documented one
           * only, so the key appears in exactly one place per request. */
          "api-key": config.apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      /* The whole reason for safeCauseCode(): a bare "fetch failed" names no
       * failure at all, and the socket-level code that does is one level down. */
      throw new QdrantError(error?.name === "AbortError" ? "timeout" : "network", {
        path,
        method,
        cause: safeCauseCode(error),
      });
    } finally {
      clearTimeout(timer);
    }

    if (response?.status === 404 && allow404) return null;
    if (!response?.ok) {
      throw new QdrantError("http", {
        status: response?.status || 0,
        path,
        method,
        detail: await classifyErrorBody(response),
      });
    }
    try {
      return await response.json();
    } catch (error) {
      throw new QdrantError("malformed-response", { status: response.status, path, method });
    }
  };

  /**
   * Every method takes an explicit collection name.
   *
   * Retrieval reads through the ALIAS; ingestion writes to a physical STAGING
   * collection. Defaulting to one of them would make the other a silent
   * mistake, so the name is always named. `client.collection` remains the
   * configured alias for callers that want the logical target.
   */
  const api = {
    collection: config.collection,
    alias: config.collection,

    getCollection: (name = config.collection) =>
      request("GET", pathFor(name), undefined, { allow404: true }),

    createCollection: (name) =>
      request("PUT", pathFor(name), { vectors: { size: config.vectorSize, distance: config.distance } }, {
        budgetMs: longBudget,
      }),

    deleteCollection: (name) =>
      request("DELETE", pathFor(name), undefined, { allow404: true, budgetMs: longBudget }),

    /**
     * Index one payload field so it can be filtered on.
     *
     * Required, not an optimisation: a managed cluster in strict mode refuses a
     * filtered search over unindexed payload with a 400 rather than falling
     * back to a scan. Ajoop filters every retrieval on three fields, so those
     * three must be indexed on every collection it builds.
     */
    createPayloadIndex: (name, field, schema) =>
      request("PUT", `${pathFor(name)}/index?wait=true`, { field_name: field, field_schema: schema }, {
        budgetMs: longBudget,
      }),

    /** Every collection on the cluster, as plain names. */
    listCollections: async () => {
      const response = await request("GET", "/collections", undefined, { budgetMs: longBudget });
      return (response?.result?.collections || []).map((entry) => entry?.name).filter(Boolean);
    },

    upsert: (name, points) =>
      request("PUT", `${pathFor(name)}/points?wait=true`, { points }, { budgetMs: longBudget }),

    /**
     * Nearest neighbours for one vector.
     *
     * `exact` defaults to TRUE. Ajoop applies its deterministic retrieval policy
     * AFTER semantic scoring — isolation filters, family reservations, per-entity
     * caps — so an approximate shortlist is not merely slightly different from
     * the in-memory ranking, it can omit the very record the policy was going to
     * promote. At roughly two hundred public chunks an exact search costs
     * nothing worth measuring, and correctness is the whole point of shadow
     * mode. This is a deliberate small-corpus choice, not a permanent one.
     */
    search: (name, { vector, limit, filter, withPayload = true, exact = true }) =>
      request("POST", `${pathFor(name)}/points/search`, {
        vector,
        limit,
        with_payload: withPayload,
        with_vector: false,
        params: { exact },
        ...(filter ? { filter } : {}),
      }),

    count: (name = config.collection, filter) =>
      request("POST", `${pathFor(name)}/points/count`, { exact: true, ...(filter ? { filter } : {}) }),

    /** One point by id, or null. Used to read the build manifest. */
    getPoint: async (name, id) => {
      const response = await request("POST", `${pathFor(name)}/points`, {
        ids: [id],
        with_payload: true,
        with_vector: false,
      }, { allow404: true });
      return response?.result?.[0] || null;
    },

    scroll: (name, { limit = 256, offset, withPayload = true }) =>
      request("POST", `${pathFor(name)}/points/scroll`, {
        limit,
        with_payload: withPayload,
        with_vector: false,
        ...(offset === undefined || offset === null ? {} : { offset }),
      }, { budgetMs: longBudget }),

    deletePoints: (name, ids) =>
      request("POST", `${pathFor(name)}/points/delete?wait=true`, { points: ids }, { budgetMs: longBudget }),

    /** Which aliases point at a collection. */
    collectionAliases: async (name) => {
      const response = await request("GET", `${pathFor(name)}/aliases`, undefined, { allow404: true });
      return (response?.result?.aliases || []).map((entry) => entry?.alias_name).filter(Boolean);
    },

    /** Every alias on the cluster, as `{ alias, collection }`. */
    listAliases: async () => {
      const response = await request("GET", "/aliases", undefined, { budgetMs: longBudget });
      return (response?.result?.aliases || [])
        .map((entry) => ({ alias: entry?.alias_name, collection: entry?.collection_name }))
        .filter((entry) => entry.alias && entry.collection);
    },

    /**
     * Point the alias at `name`, in ONE request.
     *
     * Qdrant applies an alias action list atomically, so `delete_alias` followed
     * by `create_alias` never leaves a window in which the alias resolves to
     * nothing. Doing it as two requests would put that window on the visitor
     * path — which is the entire failure this design exists to avoid.
     */
    promoteAlias: (name, { previous = null } = {}) =>
      request("POST", "/collections/aliases", {
        actions: [
          ...(previous ? [{ delete_alias: { alias_name: config.collection } }] : []),
          { create_alias: { collection_name: name, alias_name: config.collection } },
        ],
      }, { budgetMs: longBudget }),
  };

  return api;
}

/**
 * Every point in a collection, or an explicit failure.
 *
 * `maxPages` exists to stop a runaway loop, not to cap the corpus, so reaching
 * it while Qdrant is still offering a continuation cursor is an ERROR. The
 * previous version returned the partial map, which would have let a completeness
 * check pass on a fraction of a collection and reported it as verified.
 */
export async function scrollAllPoints(client, name, { pageSize = 256, maxPages = 4096, withPayload = true } = {}) {
  const points = [];
  let offset;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.scroll(name, { limit: pageSize, offset, withPayload });
    const batch = response?.result?.points || [];
    points.push(...batch);
    offset = response?.result?.next_page_offset;
    if (offset === undefined || offset === null) return points;
    if (!batch.length) {
      /* A cursor with no rows would spin forever. */
      throw new QdrantError("incomplete-scan", { path: `/collections/${name}/points/scroll` });
    }
  }
  throw new QdrantError("incomplete-scan", { path: `/collections/${name}/points/scroll` });
}
