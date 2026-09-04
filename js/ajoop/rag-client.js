/**
 * Ajoop 5.1 RAG turn source.
 *
 * RAG-FIRST. Every conversational turn is offered to /ajoop-rag, whatever the
 * deterministic router decided about it: the model chooses PORTFOLIO or
 * GENERAL scope for itself, and the keyword router no longer decides whether
 * the model is allowed to see a question.
 *
 * This module is DOM-FREE on purpose. Ajoop 5.0 shipped it as an overlay that
 * loaded after assistant.js and monkey-patched three of its functions, which
 * left the panel with two owners of one lifecycle — a deterministic renderer
 * and an AI rewriter racing over the same bubble. 5.1 turns it back into what
 * it always was: the request source. It builds the payload, bounds the
 * conversation history, validates the reply, and hands assistant.js one
 * result. assistant.js owns every pixel.
 *
 * Transport, timeout, turn invalidation, health backoff and the 429 contract
 * all come from js/ajoop/ai-bridge.js — this module supplies only the payload
 * and the response validator, so there is exactly one HTTP client.
 *
 * Loads after ai-bridge.js (whose transport it uses) and before assistant.js
 * (which calls it).
 */
/* ajoop-rag-client:start
 * Keep this block DOM-free.
 */

/**
 * Conversation memory, in this tab only.
 *
 * Bounded to six turns and 700 characters each: enough that "peki stack?"
 * still knows which project is in play, small enough that it can never grow
 * into a transcript. It is never persisted, never sent anywhere but the
 * bridge, and it is cleared by Start over and by a site-language change —
 * both of which start a visibly new conversation.
 */
const AJOOP_RAG_HISTORY_LIMIT = 6;
const AJOOP_RAG_HISTORY_CHARS = 700;
const ajoopRagHistory = [];

function ajoopRagBoundedText(value, limit = AJOOP_RAG_HISTORY_CHARS) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function ajoopRagRemember(role, value) {
  const content = ajoopRagBoundedText(value);
  if (!content) return;
  const previous = ajoopRagHistory[ajoopRagHistory.length - 1];
  if (previous && previous.role === role && previous.content === content) return;
  ajoopRagHistory.push({ role, content });
  if (ajoopRagHistory.length > AJOOP_RAG_HISTORY_LIMIT) {
    ajoopRagHistory.splice(0, ajoopRagHistory.length - AJOOP_RAG_HISTORY_LIMIT);
  }
}

/** Start over and a site-language change both begin a new conversation. */
function clearAjoopRagHistory() {
  ajoopRagHistory.length = 0;
}

/**
 * What to ask about a turn that was not typed.
 *
 * A tapped button carries its own label, which is what the visitor asked for.
 * A synthetic route with neither falls back to the entity or intent name, so
 * the model still receives a real question rather than an empty string.
 */
function ajoopRagQuestion(route, question, language) {
  const direct = ajoopRagBoundedText(question, 500);
  if (direct) return direct;

  if (route?.entity && typeof getAjoopEntity === "function") {
    const entity = getAjoopEntity(route.entity);
    const name = entity && (entity.name || entity.label || entity.title);
    const localized = typeof ajoopLocalized === "function" ? ajoopLocalized(name, language) : name;
    if (typeof localized === "string" && localized.trim()) {
      return ajoopRagBoundedText(localized, 500);
    }
  }

  if (route?.intent && typeof ajoopIntentLabel === "function") {
    const label = ajoopIntentLabel(route.intent, language);
    if (label) return ajoopRagBoundedText(label, 500);
  }

  return language === "tr" ? "Kaan'ın portfolyosunu anlat." : "Tell me about Kaan's portfolio.";
}

function buildAjoopRagPayload(route, question, language) {
  const locale = language || "en";
  const asked = ajoopRagQuestion(route, question, locale);
  return {
    asked,
    payload: {
      version: AJOOP_AI_PROTOCOL_VERSION,
      mode: "rag",
      question: asked,
      locale,
      history: ajoopRagHistory.slice(-AJOOP_RAG_HISTORY_LIMIT),
    },
  };
}

/**
 * The bridge's reply, or null when it is not usable.
 *
 * `scope` is required and must be one of the two the contract defines: a reply
 * without it cannot be rendered safely, because scope is what decides whether
 * portfolio evidence stays on the answer. Everything crossing this boundary is
 * untrusted, including a reply from the visitor's own machine.
 */
function validateAjoopRagResponse(raw) {
  if (!raw || typeof raw !== "object" || raw.ok !== true) return null;
  if (typeof raw.answer !== "string") return null;
  const answer = raw.answer.trim();
  if (!answer || answer.length > AJOOP_AI_MAX_ANSWER_CHARS) return null;
  const scope = raw.scope === "general" ? "general" : raw.scope === "portfolio" ? "portfolio" : null;
  if (!scope) return null;
  const model = typeof raw.model === "string" && raw.model ? raw.model.slice(0, 64) : null;
  return { answer, model, scope, mode: "rag" };
}

/**
 * One RAG turn.
 *
 * Never throws and never leaves the caller waiting past the bridge's own
 * timeout: every outcome — not configured, offline, busy, timed out, stale,
 * malformed — resolves to a result object whose `ok` is false, and the caller
 * falls back to the deterministic plan it already built. Only a successful
 * exchange is remembered, so the history holds what was actually said.
 */
function requestAjoopRagTurn(options) {
  const settings = options || {};
  const locale = settings.language || "en";
  const request = buildAjoopRagPayload(settings.route, settings.question, locale);
  return Promise.resolve(
    requestAjoopAiResponse({
      payload: request.payload,
      config: settings.config,
      turn: settings.turn,
      fetchImpl: settings.fetchImpl,
      now: settings.now,
      validate: validateAjoopRagResponse,
    }),
  )
    .then((result) => {
      if (result && result.ok) {
        ajoopRagRemember("user", request.asked);
        ajoopRagRemember("assistant", result.answer);
      }
      return result;
    })
    .catch(() => ({ ok: false, reason: "network-error", turnState: AJOOP_AI_TURN.FAILED }));
}
/* ajoop-rag-client:end */
