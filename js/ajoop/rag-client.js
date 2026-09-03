/**
 * Ajoop 5.1 browser RAG adapter.
 *
 * The deterministic Ajoop stack remains the offline/source-of-truth fallback:
 * it still builds the route, answer plan, canonical cards, links and actions.
 * While the local bridge is healthy, however, EVERY conversational turn is
 * handed to /ajoop-rag. The model decides whether the question belongs to the
 * portfolio or to ordinary general conversation; the keyword router no longer
 * decides whether AI is allowed to see the turn.
 *
 * This file intentionally loads after assistant.js. It replaces only the two
 * seams designed for optional AI — response eligibility and enhancement — so
 * the proven deterministic renderer, accessibility behaviour and fallback path
 * stay unchanged.
 */
/* ajoop-rag-client:start */

const AJOOP_RAG_HISTORY_LIMIT = 6;
const AJOOP_RAG_HISTORY_CHARS = 700;
const ajoopRagHistory = [];

function ajoopRagBoundedText(value, limit = AJOOP_RAG_HISTORY_CHARS) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function ajoopRagRememberUser(question) {
  const content = ajoopRagBoundedText(question);
  if (!content) return;
  const previous = ajoopRagHistory[ajoopRagHistory.length - 1];
  if (!previous || previous.content !== content) {
    ajoopRagHistory.push({ role: "user", content });
  }
  if (ajoopRagHistory.length > AJOOP_RAG_HISTORY_LIMIT) {
    ajoopRagHistory.splice(0, ajoopRagHistory.length - AJOOP_RAG_HISTORY_LIMIT);
  }
}

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
  const locale = language || ajoopReplyLanguage() || "en";
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

function validateAjoopRagResponse(raw) {
  if (!raw || typeof raw !== "object" || raw.ok !== true) return null;
  if (typeof raw.answer !== "string") return null;
  const answer = raw.answer.trim();
  if (!answer || answer.length > AJOOP_AI_MAX_ANSWER_CHARS) return null;
  const scope = raw.scope === "general" ? "general" : raw.scope === "portfolio" ? "portfolio" : null;
  if (!scope) return null;
  const model = typeof raw.model === "string" && raw.model ? raw.model.slice(0, 64) : null;
  return { answer, scope, model };
}

async function requestAjoopRagResponse({ payload, config, turn, now } = {}) {
  const resolved = config || getAjoopAiConfig();
  const failed = (reason) => ({ ok: false, reason, turnState: AJOOP_AI_TURN.FAILED });
  if (!isAjoopAiConfigured(resolved)) return failed("not-configured");

  if (ajoopAiState.state === AJOOP_AI_STATE.UNAVAILABLE) {
    const current = ajoopAiNow(now);
    if (current - ajoopAiState.checkedAt < resolved.retryAfterMs) return failed("unavailable");
  }

  const activeTurn = typeof turn === "number" ? turn : ajoopAiState.turn;
  if (ajoopAiState.requestedTurn === activeTurn) return failed("duplicate-turn");
  ajoopAiState.requestedTurn = activeTurn;

  const result = await postAjoopAiRequest(payload, { config: resolved });
  if (!isAjoopAiTurnCurrent(activeTurn)) {
    return { ok: false, reason: "stale", turnState: null };
  }

  if (!result.ok && result.reason === "http-error" && result.status === 429) {
    setAjoopBridgeState(AJOOP_AI_STATE.AVAILABLE, now);
    return failed("busy");
  }

  if (!result.ok) {
    recordAjoopAiTurnFailure(now);
    return failed(result.reason);
  }

  const validated = validateAjoopRagResponse(result.body);
  if (!validated) {
    recordAjoopAiTurnFailure(now);
    return failed("invalid-response");
  }

  setAjoopBridgeState(AJOOP_AI_STATE.AVAILABLE, now);
  ajoopAiState.turnFailures = 0;
  if (validated.model) ajoopAiState.model = validated.model;
  return {
    ok: true,
    answer: validated.answer,
    scope: validated.scope,
    model: validated.model,
    turnState: AJOOP_AI_TURN.AI,
  };
}

/** General chat must never inherit a portfolio card or evidence badge from the
 * deterministic fallback plan that was hidden while inference was running. */
function applyAjoopGeneralAnswer(messageElement, answer) {
  if (!messageElement) return false;
  const paragraph = messageElement.querySelector("[data-chatbot-prose]");
  if (!paragraph) return false;
  paragraph.textContent = answer;
  Array.from(messageElement.children).forEach((child) => {
    if (child !== paragraph) child.remove();
  });
  messageElement.classList.add("is-ai-enhanced", "is-general-ai");

  const actions = document.querySelector("[data-chatbot-quicks]");
  if (actions) actions.textContent = "";
  const list = ajoopMessageList();
  if (list) scrollAjoopToBottom(list);
  return true;
}

/* The response planner used `groundable` to decide whether the old evidence
 * writer was allowed to run. RAG owns that decision now, so every real answer,
 * greeting, clarification and unknown turn is eligible while the bridge is on.
 * The deterministic plan still renders first and remains the failure fallback. */
const ajoopRagBasePlanResponse = planAjoopResponse;
planAjoopResponse = function ajoopRagPlanResponse(route, options) {
  const plan = ajoopRagBasePlanResponse(route, options);
  if (plan) plan.groundable = true;
  return plan;
};

/* assistant.js already has the exact DOM lifecycle we need: deterministic
 * fallback render → is-enhancing thinking state → one final replacement. Swap
 * only the request source from evidence-writer payloads to RAG payloads. */
enhanceAjoopAnswerWithAi = function enhanceAjoopAnswerWithRag(
  messageElement,
  route,
  evidence,
  question,
  turn,
  language,
) {
  void evidence;
  if (!messageElement) return;
  const config = getAjoopAiConfig();
  if (!isAjoopAiConfigured(config)) return;

  const locale = language || ajoopReplyLanguage();
  const request = buildAjoopRagPayload(route, question, locale);
  messageElement.classList.add("is-enhancing");

  Promise.resolve(
    requestAjoopRagResponse({ payload: request.payload, config, turn }),
  )
    .then((result) => {
      messageElement.classList.remove("is-enhancing");
      if (!result || !result.ok || !isAjoopAiTurnCurrent(turn)) {
        if (
          isAjoopAiTurnCurrent(turn) &&
          result &&
          typeof getAjoopAiState === "function" &&
          getAjoopAiState().state === "unavailable"
        ) {
          setAjoopMascotState(AJOOP_MASCOT_STATES.OFFLINE);
        }
        return;
      }

      ajoopRagRememberUser(request.asked);
      if (result.scope === "general") {
        applyAjoopGeneralAnswer(messageElement, result.answer);
      } else {
        applyAjoopAiAnswer(messageElement, result.answer, locale);
      }
      setAjoopMascotState("answering");
      renderAjoopBridgeStatus();
    })
    .catch(() => {
      messageElement.classList.remove("is-enhancing");
    });
};

const ajoopRagBaseResetConversation = resetAjoopConversation;
resetAjoopConversation = function resetAjoopRagConversation() {
  ajoopRagHistory.length = 0;
  return ajoopRagBaseResetConversation();
};

/* A site-language change starts a visibly new transcript, so it must not carry
 * old retrieval history into the new conversation either. */
const ajoopRagBaseLanguageUpdate = updatePortfolioChatbotLanguage;
updatePortfolioChatbotLanguage = function updateAjoopRagLanguage(language) {
  ajoopRagHistory.length = 0;
  return ajoopRagBaseLanguageUpdate(language);
};

/* ajoop-rag-client:end */
