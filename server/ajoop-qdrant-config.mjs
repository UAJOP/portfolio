/**
 * Qdrant backend configuration: parse, validate, and fail SAFE.
 *
 * Ajoop 5.2 retrieval is an in-memory index built at startup, and it stays the
 * production source of truth. This module exists so that a persistent vector
 * backend can be introduced WITHOUT the production path acquiring a dependency
 * on it by accident. Every decision here is therefore biased one way:
 *
 *   A configuration that is absent, partial, malformed or unrecognised
 *   resolves to `memory`. Never to a half-configured Qdrant.
 *
 * That is deliberate and it costs something: a typo in QDRANT_URL silently
 * gives you the old behaviour rather than a loud failure at request time. The
 * alternative — a bridge that boots, serves, and then 503s every turn because a
 * cloud cluster is unreachable — is strictly worse for a portfolio site whose
 * whole point is that it answers. `issues` records exactly why a mode was
 * refused, so the ingestion CLI and the smoke test can be loud where being loud
 * is free.
 *
 * SECRETS NEVER LEAVE THIS MODULE IN A READABLE FORM. resolveQdrantConfig()
 * returns the API key because the HTTP adapter needs it; describeQdrantConfig()
 * is the ONLY shape intended for printing, logging or serialising, and it
 * carries a boolean where the key was.
 *
 * Pure functions over a supplied `env` object. No process.env read here, no
 * filesystem, no network — so every branch is testable.
 */

/** The three retrieval backends. `shadow` is memory-authoritative. */
export const AJOOP_VECTOR_BACKENDS = Object.freeze({
  MEMORY: "memory",
  QDRANT: "qdrant",
  SHADOW: "shadow",
});

const BACKEND_VALUES = Object.freeze(Object.values(AJOOP_VECTOR_BACKENDS));

/**
 * Distance metrics Qdrant accepts, keyed by their folded form.
 *
 * Qdrant is case-sensitive on the wire ("Cosine", not "cosine"), so an operator
 * writing the lowercase form must not produce a 400 at collection-create time.
 */
const DISTANCES = Object.freeze({
  cosine: "Cosine",
  dot: "Dot",
  euclid: "Euclid",
  euclidean: "Euclid",
  manhattan: "Manhattan",
});

/**
 * Shipped defaults.
 *
 * `vectorSize` is 1024 because the shipped embedding model is
 * qwen3-embedding:0.6b and that is what it produces. It is configurable so the
 * validator can REFUSE a mismatch, not so the model can be swapped — changing
 * the model is a different brief.
 */
export const QDRANT_DEFAULTS = Object.freeze({
  backend: AJOOP_VECTOR_BACKENDS.MEMORY,
  collection: "ajoop_portfolio_v1",
  vectorSize: 1024,
  distance: "Cosine",
  /* A shadow query runs beside a turn the visitor is already waiting on, so it
   * gets a much tighter budget than the 45s generation timeout. Four seconds is
   * longer than a healthy cloud search and short enough that a wedged cluster
   * cannot pile up in-flight work. */
  timeoutMs: 4000,
  /**
   * An absolute ceiling on how many candidates one search may request. NOT the
   * candidate limit.
   *
   * The limit is the size of the validated active corpus, read from the build
   * manifest at startup: Ajoop applies its deterministic policy AFTER semantic
   * scoring, so a truncated shortlist can omit the very record the policy was
   * about to promote, and the two backends then rank differently for reasons
   * that have nothing to do with the embedding. At roughly two hundred public
   * chunks, asking for all of them is the correct and cheap answer.
   *
   * This exists only so a corrupt manifest cannot turn into a pathological
   * request. If the corpus ever outgrows it, that is a parity benchmark and a
   * design conversation, not a number to quietly raise.
   */
  candidateCeiling: 4096,
  /* Bounded in-process comparison history. Record ids only, never question
   * text and never an answer. */
  shadowHistory: 20,
  /* Points per upsert request during ingestion. */
  upsertBatchSize: 64,
});

/**
 * Collection names are path segments in the Qdrant REST API. Keep them boring.
 *
 * Capped at 32 rather than Qdrant's own limit because the configured name is a
 * logical ALIAS, and every build appends `_<build id>` (about 27 characters) to
 * it to name a physical collection. A 64-character alias would produce a
 * physical name Qdrant rejects — at promotion time, after the corpus has been
 * embedded — so the budget is reserved here instead.
 */
const COLLECTION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/**
 * An API key that can be sent as a header value without changing the request.
 *
 * A key containing CR/LF would let a malformed .env line inject a header, so a
 * key that is not one clean printable token is treated as ABSENT rather than
 * silently sanitised — a half-repaired credential is a request going somewhere
 * nobody predicted.
 */
const API_KEY_PATTERN = /^[\x21-\x7e]{8,512}$/;

const asTrimmed = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The base URL as a bare origin, or null.
 *
 * Credentials in the URL, a path, a query or a fragment are all refused rather
 * than stripped: each of them means the operator believed something about the
 * endpoint that is not true, and guessing which part they meant is how a
 * request ends up somewhere unintended.
 */
function asQdrantUrl(value) {
  const candidate = asTrimmed(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.search || parsed.hash) return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    return null;
  }
}

/** A bounded integer, `fallback` when unset, or null when present and wrong. */
function asBoundedInt(value, fallback, minimum, maximum) {
  const raw = asTrimmed(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

/**
 * The resolved vector-backend configuration.
 *
 * `backend` is what the runtime will ACTUALLY do; `requestedBackend` is what the
 * environment asked for. They differ exactly when something was wrong, and
 * `issues` says what, as stable codes rather than prose.
 */
export function resolveQdrantConfig(env = {}) {
  const issues = [];

  const rawBackend = asTrimmed(env.AJOOP_VECTOR_BACKEND).toLowerCase();
  let requestedBackend = QDRANT_DEFAULTS.backend;
  if (rawBackend) {
    if (BACKEND_VALUES.includes(rawBackend)) requestedBackend = rawBackend;
    else issues.push("backend-unrecognised");
  }

  const rawUrl = asTrimmed(env.QDRANT_URL);
  const url = asQdrantUrl(rawUrl);
  if (!rawUrl) issues.push("url-missing");
  else if (!url) issues.push("url-invalid");

  const rawKey = asTrimmed(env.QDRANT_API_KEY);
  const apiKey = API_KEY_PATTERN.test(rawKey) ? rawKey : "";
  if (!rawKey) issues.push("api-key-missing");
  else if (!apiKey) issues.push("api-key-invalid");

  const rawCollection = asTrimmed(env.QDRANT_COLLECTION);
  const collection = rawCollection
    ? (COLLECTION_PATTERN.test(rawCollection) ? rawCollection : "")
    : QDRANT_DEFAULTS.collection;
  if (rawCollection && !collection) issues.push("collection-invalid");

  const parsedSize = asBoundedInt(env.QDRANT_VECTOR_SIZE, QDRANT_DEFAULTS.vectorSize, 1, 65536);
  const vectorSize = parsedSize === null ? 0 : parsedSize;
  if (parsedSize === null) issues.push("vector-size-invalid");

  const rawDistance = asTrimmed(env.QDRANT_DISTANCE).toLowerCase();
  const distance = rawDistance ? (DISTANCES[rawDistance] || "") : QDRANT_DEFAULTS.distance;
  if (rawDistance && !distance) issues.push("distance-invalid");

  const timeoutMs =
    asBoundedInt(env.AJOOP_QDRANT_TIMEOUT_MS, QDRANT_DEFAULTS.timeoutMs, 250, 30000) ??
    QDRANT_DEFAULTS.timeoutMs;
  const candidateCeiling =
    asBoundedInt(env.AJOOP_QDRANT_CANDIDATE_CEILING, QDRANT_DEFAULTS.candidateCeiling, 1, 65536) ??
    QDRANT_DEFAULTS.candidateCeiling;

  const configured = Boolean(url && apiKey && collection && vectorSize && distance);

  /* The safety rule, in one expression: a backend that wants Qdrant only gets
   * Qdrant when Qdrant is completely configured. */
  const backend =
    requestedBackend === AJOOP_VECTOR_BACKENDS.MEMORY || configured
      ? requestedBackend
      : AJOOP_VECTOR_BACKENDS.MEMORY;
  const degraded = backend !== requestedBackend;
  if (degraded) issues.push("degraded-to-memory");

  return Object.freeze({
    requestedBackend,
    backend,
    configured,
    degraded,
    issues: Object.freeze(issues),
    url,
    apiKey,
    collection,
    vectorSize,
    distance,
    timeoutMs,
    candidateCeiling,
    shadowHistory: QDRANT_DEFAULTS.shadowHistory,
    upsertBatchSize: QDRANT_DEFAULTS.upsertBatchSize,
  });
}

/**
 * The ONLY safe-to-print view of the configuration.
 *
 * No API key, no full URL. `endpointHost` is the cluster hostname, included
 * because an operator running the ingestion CLI needs to know which cluster
 * they are about to write to. It is server-side output only and never reaches
 * an HTTP response body — see publicVectorBackendStatus for that.
 */
export function describeQdrantConfig(config) {
  return {
    requestedBackend: config.requestedBackend,
    backend: config.backend,
    configured: config.configured,
    degraded: config.degraded,
    issues: [...config.issues],
    collection: config.collection || null,
    vectorSize: config.vectorSize || null,
    distance: config.distance || null,
    timeoutMs: config.timeoutMs,
    candidateCeiling: config.candidateCeiling,
    endpointHost: config.url ? new URL(config.url).host : null,
    apiKeyPresent: Boolean(config.apiKey),
  };
}

/**
 * What an HTTP response body may say about the backend.
 *
 * Deliberately three non-sensitive fields. The browser panel and the launcher
 * probe read health; neither needs a hostname, a collection name or a reason
 * code, and shipping any of those to a public endpoint is how internal
 * infrastructure ends up in a stranger's devtools tab.
 */
export function publicVectorBackendStatus(config, { qdrantReady = false, activeBackend } = {}) {
  return {
    /* What the runtime is ACTUALLY doing right now. This is not always
     * `config.backend`: a `shadow` or `qdrant` bridge whose cluster failed
     * readiness validation is running on memory, and the health endpoint must
     * say so rather than repeating what the environment asked for. */
    vectorBackend: activeBackend || config.backend,
    vectorBackendRequested: config.requestedBackend,
    /* Verified against the live cluster, not "a client object exists". */
    qdrantReady: Boolean(qdrantReady),
  };
}
