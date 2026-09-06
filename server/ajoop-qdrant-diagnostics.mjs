/**
 * Turning a failure into something an operator can act on, without turning it
 * into a credential leak.
 *
 * The problem this exists for is narrow and real: a live ingestion failed with
 * exactly `failed: fetch failed`. Every component had already been probed
 * independently and answered 200 — embeddings, collection create/delete, a
 * 903 KB 64-point upsert, search, aliases — so the one thing nobody knew was
 * WHICH step of the pipeline was the one that died. A message that names no
 * operation is a message that costs another full run to learn anything from.
 *
 * The obvious fix is to print the error. That is also the fastest way to put an
 * API key in a terminal, a screenshot or a pasted issue: undici errors carry
 * the failed request, the request carries the `api-key` header, and Qdrant
 * echoes request fragments back in its own error text.
 *
 * So nothing here formats an error object. It assembles a fixed set of fields
 * that are safe BY CONSTRUCTION:
 *
 *   stage      one of a closed list of pipeline phase names
 *   method     an HTTP verb
 *   path       a request path, with the physical collection name redacted
 *   status     an integer
 *   code       a QdrantError code from a closed vocabulary
 *   detail     a closed-vocabulary symbol distilled from the response body
 *   cause      a socket-level symbol (ECONNRESET, UND_ERR_*) — never a message
 *   batch      an ordinal, "3/12"
 *
 * None of those can carry a key, a hostname, a payload, a response body, corpus
 * text or an embedding, because none of them is ever derived from those things.
 */
import { safeCauseCode as safeCause } from "./ajoop-qdrant.mjs";

/**
 * Every phase a build can fail in. A closed list, so a stage name can never be
 * interpolated from something a caller supplied.
 */
export const INGESTION_STAGES = Object.freeze({
  PREFLIGHT: "preflight",
  CREATE_STAGING: "create-staging",
  CREATE_PAYLOAD_INDEX: "create-payload-index",
  EMBED_BATCH: "embed-batch",
  UPSERT_BATCH: "upsert-batch",
  WRITE_MANIFEST: "write-manifest",
  VERIFY_COLLECTION: "verify-collection",
  VERIFY_SCROLL: "verify-scroll",
  SEARCH_PROBE: "search-probe",
  ALIAS_PROMOTION: "alias-promotion",
  FAILED_STAGING_CLEANUP: "failed-staging-cleanup",
});

const STAGE_VALUES = Object.freeze(new Set(Object.values(INGESTION_STAGES)));

/**
 * A physical collection name, reduced.
 *
 * The name is not a secret — it is `<alias>_<build id>` and the build id is
 * derived from public corpus content — but it is long, it is noise in a
 * one-line failure, and a redacted form keeps the output shape identical
 * whatever the deployment. The alias prefix survives so the path still reads as
 * an Ajoop request.
 */
export function redactCollectionPath(path) {
  return String(path || "").replace(/\/collections\/([^/?]+)/, (match, name) => {
    /* `/collections/aliases` is a fixed API route, not a collection. Redacting
     * it would hide which operation failed, which is the one thing this output
     * exists to say. */
    if (name === "aliases") return match;
    return `/collections/<${/_s\d+i\d+-[0-9a-f]{12}-/.test(name) ? "staging" : "collection"}>`;
  });
}

/** Attach a stage to an error without disturbing anything already on it. */
export function tagStage(error, stage, extra = {}) {
  if (!error || typeof error !== "object") return error;
  if (!error.stage && STAGE_VALUES.has(stage)) error.stage = stage;
  for (const [key, value] of Object.entries(extra)) {
    if (error[key] === undefined) error[key] = value;
  }
  return error;
}

/**
 * The category of a non-Qdrant failure, as a symbol.
 *
 * Used for embedding failures, where the interesting distinction is "the model
 * is not there" versus "the socket died" versus "the response was not the shape
 * we expect". The Ollama error messages that carry those distinctions are
 * short, fixed strings this code wrote itself — but they are matched rather
 * than printed, so a future message change degrades to `internal` instead of
 * leaking whatever it was replaced with.
 */
export function embeddingFailureCategory(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/^upstream \d+$/.test(message)) return `upstream-${message.split(" ")[1]}`;
  if (message === "malformed embedding response") return "malformed-response";
  if (message === "malformed embedding vector") return "malformed-vector";
  if (message === "embedding batch size mismatch") return "batch-size-mismatch";
  if (message === "fetch unavailable") return "fetch-unavailable";
  if (error?.name === "AbortError") return "timeout";
  return "internal";
}

/**
 * The safe, bounded description of one failure.
 *
 * Returns a plain object of scalars. Every field is optional and omitted when
 * it does not apply, so a caller can print it as a small block without special
 * cases — and a caller that stringifies the whole thing still cannot leak,
 * because there is nothing unsafe in it to stringify.
 */
export function describeFailure(error, { stage = null, batch = null, batches = null } = {}) {
  const resolvedStage = error?.stage || stage;
  const description = {
    stage: STAGE_VALUES.has(resolvedStage) ? resolvedStage : "unknown",
  };

  if (error?.qdrant) {
    if (error.method) description.method = error.method;
    if (error.path) description.path = redactCollectionPath(error.path);
    if (error.status) description.status = error.status;
    description.code = `qdrant-${error.code === "network" ? "network-error" : error.code}`;
    if (error.causeCode) description.cause = error.causeCode;
    /* A closed-vocabulary symbol distilled from the response body — never the
     * body itself. This is what turns a bare 400 into an actionable line. */
    if (error.detail) description.detail = error.detail;
  } else if (resolvedStage === INGESTION_STAGES.EMBED_BATCH) {
    description.code = `embedding-${embeddingFailureCategory(error)}`;
    const cause = safeCause(error);
    if (cause) description.cause = cause;
  } else {
    /* A refusal this pipeline raised itself. `reason` is a code we chose;
     * `verification` is the readiness verdict, whose `reason` is likewise from
     * a closed list. Nothing here is a message. */
    const reason = error?.reason || error?.verification?.reason;
    description.code = typeof reason === "string" && /^[a-z0-9-]{1,48}$/.test(reason) ? reason : "internal";
    const cause = safeCause(error);
    if (cause) description.cause = cause;
  }

  const ordinal = Number.isInteger(batch) ? batch : error?.batch;
  const total = Number.isInteger(batches) ? batches : error?.batches;
  if (Number.isInteger(ordinal)) description.batch = Number.isInteger(total) ? `${ordinal}/${total}` : `${ordinal}`;
  return description;
}

/** One line, `key=value` pairs, in a fixed order. */
export function formatFailure(description) {
  return ["method", "path", "status", "code", "detail", "cause", "batch"]
    .filter((key) => description[key] !== undefined && description[key] !== null)
    .map((key) => `${key}=${description[key]}`)
    .join(" ");
}
