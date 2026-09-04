/**
 * Optional local AI bridge for Ajoop (Ajoop 5.0).
 *
 * Ajoop answers deterministically. This module can additionally hand the
 * already-computed answer and its canonical evidence to a LOCAL Node bridge
 * (server/ajoop-bridge.mjs), which prompts a local Ollama model to restate it
 * in natural language:
 *
 *   this module → HTTPS edge/tunnel → 127.0.0.1:8787 → 127.0.0.1:11434
 *
 * 5.0 removed n8n from this path. Its execution history retained visitor
 * questions even with every documented save flag off, and an assistant on a
 * public site must not accumulate a transcript of what strangers asked. The
 * Node bridge stores nothing. See docs/ajoop-local-ai.md.
 *
 * THE MODEL IS NOT A SOURCE OF TRUTH. It receives the evidence Ajoop 4.2
 * already built and is instructed to present only that. Cards, proof points,
 * comparisons and links continue to come from the registry and stay on screen
 * whatever the model returns.
 *
 * THE BRIDGE IS NEVER A DEPENDENCY. Every failure path — not configured,
 * offline, busy, timed out, blocked by CORS, malformed JSON, empty answer —
 * resolves to the same outcome: the deterministic answer that was already
 * rendered stands, and nothing is shown to the visitor about the failure. The
 * portfolio is fully usable with the machine that runs the bridge switched
 * off, which is its normal state.
 *
 * Loads after evidence.js (it serializes that module's model) and before
 * assistant.js, which owns the DOM.
 */
/* ajoop-ai-bridge:start
 * Keep this block DOM-free. `fetchImpl`, `now` and the config are injectable so
 * QA can drive every branch — offline, timeout, malformed, hostile — without a
 * network, exactly as js/request/submission.js is tested.
 */
/**
 * BRIDGE state — a property of the service, not of any one answer.
 *
 * `unknown` is the honest starting point for a configured bridge nobody has
 * spoken to yet, and it is deliberately distinct from `unavailable`: the first
 * means "no verdict", the second means "we asked and it did not answer".
 */
const AJOOP_AI_STATE = Object.freeze({
  DISABLED: "disabled",
  UNKNOWN: "unknown",
  CHECKING: "checking",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});

/**
 * TURN state — a property of one answer.
 *
 * Ajoop 4.4 splits these apart. In 4.3 any failed generation set the bridge to
 * `unavailable`, which flipped the whole panel's presentation because one slow
 * cold model missed one deadline. A turn that fails is a turn that keeps its
 * deterministic answer; only a repeated run of failures says anything about
 * the service. The health probe owns immediate reachability verdicts.
 */
const AJOOP_AI_TURN = Object.freeze({
  EVIDENCE: "evidence",
  ENHANCING: "enhancing",
  AI: "ai",
  FAILED: "failed",
});

/** Consecutive turn failures before the bridge itself is called unavailable. */
const AJOOP_AI_TURN_FAILURE_LIMIT = 3;

/** Contract version sent to the bridge, so it can reject shapes it predates. */
const AJOOP_AI_PROTOCOL_VERSION = 1;

/** A model answer longer than this is treated as malformed rather than shown. */
const AJOOP_AI_MAX_ANSWER_CHARS = 4000;

/* Mirrors the shipped ajoop-ai-config.js. These are the values used when the
 * hand-edited public config supplies a malformed one, so the fallback must not
 * be shorter than real local inference takes: measured 9-24s warm and ~40s on
 * a cold model load for qwen3:4b on an RTX 4050. */
const AJOOP_AI_DEFAULTS = Object.freeze({
  enabled: false,
  endpoint: "",
  timeoutMs: 30000,
  retryAfterMs: 60000,
});

/**
 * Resolved configuration.
 *
 * Reads the public config object, falls back to safe defaults, and coerces
 * types rather than trusting them — this file is edited by hand on a local
 * machine, so a string timeout or a missing field should degrade to "off",
 * never to a hung request.
 */
function getAjoopAiConfig(overrides) {
  const source =
    overrides || (typeof window !== "undefined" ? window.KAAN_AJOOP_AI : null) || {};
  const timeoutMs = Number(source.timeoutMs);
  const retryAfterMs = Number(source.retryAfterMs);
  return {
    enabled: source.enabled === true,
    endpoint: typeof source.endpoint === "string" ? source.endpoint.trim() : "",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : AJOOP_AI_DEFAULTS.timeoutMs,
    retryAfterMs:
      Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : AJOOP_AI_DEFAULTS.retryAfterMs,
  };
}

/**
 * True only for an explicitly enabled http(s) endpoint.
 *
 * The scheme check is deliberate: the endpoint is a hand-edited public string,
 * and anything but http/https — a javascript: URL above all — must never reach
 * fetch().
 */
function isAjoopAiConfigured(config) {
  const resolved = config || getAjoopAiConfig();
  if (!resolved.enabled || !resolved.endpoint) return false;
  try {
    const endpoint = new URL(resolved.endpoint);
    return (
      (endpoint.protocol === "http:" || endpoint.protocol === "https:") &&
      Boolean(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password
    );
  } catch (error) {
    return false;
  }
}

/* ---------- state ---------- */

const ajoopAiState = {
  state: AJOOP_AI_STATE.UNKNOWN,
  checkedAt: 0,
  model: null,
  /* Monotonic id of the newest turn. A reply carrying an older id is stale and
   * is dropped rather than rendered over a newer answer. */
  turn: 0,
  requestedTurn: null,
  inFlight: null,
  /* How many generations in a row came back unusable. Reset by any success. */
  turnFailures: 0,
};

/**
 * The bridge's state as callers should read it.
 *
 * An unconfigured bridge reads `disabled` whatever the internal field says,
 * because "off" is the shipped default and nothing else would be true.
 */
function getAjoopAiState() {
  return {
    state: isAjoopAiConfigured() ? ajoopAiState.state : AJOOP_AI_STATE.DISABLED,
    model: ajoopAiState.model,
    checkedAt: ajoopAiState.checkedAt,
    turnFailures: ajoopAiState.turnFailures,
  };
}

/** Records a service-level verdict. Turn outcomes do not come through here. */
function setAjoopBridgeState(state, now) {
  ajoopAiState.state = state;
  ajoopAiState.checkedAt = ajoopAiNow(now);
  if (state !== AJOOP_AI_STATE.AVAILABLE) ajoopAiState.model = null;
}

/** Opens a new turn and invalidates any reply still in flight for the old one. */
function beginAjoopAiTurn() {
  ajoopAiState.turn += 1;
  if (ajoopAiState.inFlight) {
    ajoopAiState.inFlight.abort();
    ajoopAiState.inFlight = null;
  }
  return ajoopAiState.turn;
}

function isAjoopAiTurnCurrent(turn) {
  return turn === ajoopAiState.turn;
}

function resetAjoopAiState() {
  beginAjoopAiTurn();
  ajoopAiState.state = AJOOP_AI_STATE.UNKNOWN;
  ajoopAiState.checkedAt = 0;
  ajoopAiState.model = null;
  ajoopAiState.turnFailures = 0;
}

/* ---------- transport ---------- */

function ajoopAiFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  return typeof fetch === "function" ? (...args) => fetch(...args) : null;
}

function ajoopAiNow(now) {
  return typeof now === "function" ? now() : Date.now();
}

/**
 * One POST to the bridge. Never throws; always resolves to a result object.
 *
 * The AbortController both enforces the timeout and lets a newer turn cancel an
 * older request, so a slow local model can never paint its answer over a
 * question the visitor has already moved on from.
 */
async function postAjoopAiRequest(body, options) {
  const settings = options || {};
  const config = settings.config || getAjoopAiConfig();
  const doFetch = ajoopAiFetch(settings.fetchImpl);
  if (!doFetch) return { ok: false, reason: "no-transport" };
  if (!isAjoopAiConfigured(config)) return { ok: false, reason: "not-configured" };

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) ajoopAiState.inFlight = controller;
  let timer = null;
  if (controller && config.timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), config.timeoutMs);
  }

  try {
    const response = await doFetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
      /* The bridge is a plain webhook: no cookies, no credentials, so a
       * misconfigured tunnel cannot become a session-riding surface. */
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
    });
    if (!response || !response.ok) {
      return { ok: false, reason: "http-error", status: response ? response.status : 0 };
    }
    const text = await response.text();
    if (text.length > AJOOP_AI_MAX_ANSWER_CHARS * 4) return { ok: false, reason: "oversized" };
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch (error) {
      /* An HTML error page from a proxy is the classic case here. */
      return { ok: false, reason: "invalid-json" };
    }
  } catch (error) {
    const aborted = error && (error.name === "AbortError" || error.code === 20);
    return { ok: false, reason: aborted ? "timeout" : "network-error" };
  } finally {
    if (timer) clearTimeout(timer);
    if (controller && ajoopAiState.inFlight === controller) ajoopAiState.inFlight = null;
  }
}

/* ---------- validation ---------- */

/**
 * The bridge's reply, or null when it is not usable.
 *
 * Everything crossing this boundary is untrusted, including a reply from the
 * visitor's own machine: the shape is checked field by field, the answer must
 * be a non-empty bounded string, and the caller renders it as TEXT. Markup in a
 * model answer is content, never structure.
 */
function validateAjoopAiResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.ok !== true) return null;
  if (typeof raw.answer !== "string") return null;
  const answer = raw.answer.trim();
  if (!answer || answer.length > AJOOP_AI_MAX_ANSWER_CHARS) return null;
  const model = typeof raw.model === "string" && raw.model ? raw.model.slice(0, 64) : null;
  return { answer, model, mode: "ai" };
}

/* ---------- grounding payload ---------- */

/**
 * The request body.
 *
 * `grounding` is the Ajoop 4.2 evidence model, serialized by that module's own
 * serializeAjoopEvidence — there is deliberately no second evidence collector,
 * so what the model is told is exactly what the panel shows.
 *
 * The raw question travels because the model needs it to answer. Since 5.0
 * there is no longer anywhere for it to come to rest: the Node bridge holds it
 * in memory for one request and writes nothing. See docs/ajoop-local-ai.md.
 */
function buildAjoopAiPayload(route, response, question, language) {
  const grounded =
    typeof serializeAjoopEvidence === "function"
      ? serializeAjoopEvidence(route, response, language)
      : { evidence: [], comparison: null };
  return {
    version: AJOOP_AI_PROTOCOL_VERSION,
    question: String(question || "").slice(0, 500),
    locale: grounded.locale || language || "en",
    intent: grounded.intent || null,
    entity: grounded.entity || null,
    facet: grounded.facet || null,
    depth: grounded.depth || "normal",
    mode: grounded.mode || null,
    grounding: {
      evidence: grounded.evidence || [],
      comparison: grounded.comparison || null,
    },
  };
}

/* ---------- health ---------- */

/**
 * Whether the bridge is reachable, cached with a backoff.
 *
 * The browser never probes Ollama: it asks the bridge, and the bridge decides
 * what "healthy" means for the model behind it. Port 11434 is never named by
 * anything the visitor loads. A negative verdict is cached for `retryAfterMs`
 * so a stopped service costs one failed request per minute rather than one per
 * message.
 */
async function checkAjoopAiHealth(options) {
  const settings = options || {};
  const config = settings.config || getAjoopAiConfig();

  if (!isAjoopAiConfigured(config)) {
    ajoopAiState.state = AJOOP_AI_STATE.DISABLED;
    return ajoopAiState.state;
  }

  const now = ajoopAiNow(settings.now);
  const fresh = now - ajoopAiState.checkedAt < config.retryAfterMs;
  if (fresh && ajoopAiState.state !== AJOOP_AI_STATE.CHECKING && !settings.force) {
    return ajoopAiState.state;
  }

  ajoopAiState.state = AJOOP_AI_STATE.CHECKING;
  const result = await postAjoopAiRequest(
    { version: AJOOP_AI_PROTOCOL_VERSION, mode: "health" },
    { config, fetchImpl: settings.fetchImpl },
  );

  if (result.ok && result.body && result.body.ok === true) {
    setAjoopBridgeState(AJOOP_AI_STATE.AVAILABLE, settings.now);
    ajoopAiState.model =
      typeof result.body.model === "string" ? result.body.model.slice(0, 64) : null;
    ajoopAiState.turnFailures = 0;
  } else {
    setAjoopBridgeState(AJOOP_AI_STATE.UNAVAILABLE, settings.now);
  }
  return ajoopAiState.state;
}

/* ---------- the request ---------- */

/**
 * Records one failed generation.
 *
 * Every generation failure is first a verdict about that turn. This includes a
 * refused connection or HTTP error: the health probe may have succeeded a
 * moment earlier, and one request must not repaint that service verdict. Only
 * a run of failures is finally read as the service being unavailable.
 */
function recordAjoopAiTurnFailure(now) {
  ajoopAiState.turnFailures += 1;
  if (ajoopAiState.turnFailures >= AJOOP_AI_TURN_FAILURE_LIMIT) {
    setAjoopBridgeState(AJOOP_AI_STATE.UNAVAILABLE, now);
  }
}

/**
 * Asks the bridge for one answer.
 *
 * Resolves to `{ ok: true, answer, model, scope, turnState: "ai" }` only when
 * every gate passes; any other outcome resolves to `{ ok: false, reason,
 * turnState }` and the caller keeps the deterministic answer it planned. A
 * late reply for a superseded turn is reported as stale so it is never painted
 * over a newer one, and a stale reply is not a failure of anything.
 *
 * `validate` is injectable so the 5.1 RAG contract — which additionally
 * carries a scope — reuses this transport instead of cloning it. There is one
 * HTTP client to the bridge, one timeout, one turn guard and one 429 rule,
 * whichever endpoint shape is in play.
 */
async function requestAjoopAiResponse(options) {
  const settings = options || {};
  const config = settings.config || getAjoopAiConfig();
  const validate =
    typeof settings.validate === "function" ? settings.validate : validateAjoopAiResponse;
  const failed = (reason) => ({ ok: false, reason, turnState: AJOOP_AI_TURN.FAILED });
  if (!isAjoopAiConfigured(config)) return failed("not-configured");
  if (ajoopAiState.state === AJOOP_AI_STATE.UNAVAILABLE && !settings.force) {
    const now = ajoopAiNow(settings.now);
    if (now - ajoopAiState.checkedAt < config.retryAfterMs) {
      return failed("unavailable");
    }
  }

  const turn = typeof settings.turn === "number" ? settings.turn : ajoopAiState.turn;
  if (ajoopAiState.requestedTurn === turn) {
    return failed("duplicate-turn");
  }
  ajoopAiState.requestedTurn = turn;
  const result = await postAjoopAiRequest(settings.payload, {
    config,
    fetchImpl: settings.fetchImpl,
  });

  if (!isAjoopAiTurnCurrent(turn)) {
    return { ok: false, reason: "stale", turnState: null };
  }

  /* Ajoop 5.0: the bridge refuses a second generation while the model is
   * busy, and rate-limits a burst, with 429. That is a healthy bridge saying
   * "not now" — it answered, on time, correctly. Counting it toward the
   * unavailability streak would let a visitor typing quickly talk the bridge
   * into looking offline. The turn still keeps its deterministic answer. */
  if (!result.ok && result.reason === "http-error" && result.status === 429) {
    setAjoopBridgeState(AJOOP_AI_STATE.AVAILABLE, settings.now);
    return failed("busy");
  }

  if (!result.ok) {
    recordAjoopAiTurnFailure(settings.now);
    return failed(result.reason);
  }

  const validated = validate(result.body);
  if (!validated) {
    /* An explicit ok:false is still a failed generation, not permission for one
     * turn to override the bridge's health verdict. */
    recordAjoopAiTurnFailure(settings.now);
    return failed("invalid-response");
  }

  setAjoopBridgeState(AJOOP_AI_STATE.AVAILABLE, settings.now);
  ajoopAiState.turnFailures = 0;
  if (validated.model) ajoopAiState.model = validated.model;
  return {
    ok: true,
    answer: validated.answer,
    model: validated.model || null,
    /* Present only for contracts that carry one. The renderer reads it to
     * decide whether portfolio evidence belongs on this answer at all. */
    scope: validated.scope || null,
    turnState: AJOOP_AI_TURN.AI,
  };
}
/* ajoop-ai-bridge:end */
