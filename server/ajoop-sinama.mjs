/**
 * Thin SINAMA compatibility boundary for Ajoop 5.2.
 *
 * SINAMA speaks { conversation_id, message } while Ajoop's existing RAG core
 * speaks protocol-v1 { question, locale, history }. This adapter translates
 * only that wire contract. It never bypasses Ajoop retrieval, privacy,
 * generation guards or fallbacks, and it never fabricates tool events.
 *
 * Conversation state is intentionally ephemeral: bounded in-memory history,
 * bounded session count, TTL expiry, no disk/database persistence and no
 * transcript logging.
 */

export const AJOOP_SINAMA_PATH = "/sinama";
export const AJOOP_SINAMA_DEFAULTS = Object.freeze({
  locale: "tr",
  maxConversationIdChars: 128,
  maxSessions: 64,
  maxHistoryItems: 6,
  maxHistoryChars: 700,
  ttlMs: 10 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
});

const JSON_HEADERS = Object.freeze({ "Content-Type": "application/json; charset=utf-8" });
const CONVERSATION_ID_RE = /^[A-Za-z0-9._:-]+$/;

function nowMs(now) {
  const value = typeof now === "function" ? now() : Date.now();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

function boundedText(value, maxChars) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > maxChars) return "";
  return text;
}

function sanitizeAnswer(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^SCOPE\s*:\s*(?:PORTFOLIO|GENERAL)\b[\s:—-]*/i, "")
    .replace(/^ANSWER\s*:\s*/i, "")
    .trim();
}

function clampPositiveInteger(value, fallback, min, max) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return fallback;
  return numeric;
}

function buildConfig(rag, overrides = {}) {
  const ragQuestionCap = clampPositiveInteger(rag?.config?.maxQuestionChars, 500, 1, 500);
  return Object.freeze({
    ...AJOOP_SINAMA_DEFAULTS,
    maxMessageChars: ragQuestionCap,
    maxConversationIdChars: clampPositiveInteger(
      overrides.maxConversationIdChars,
      AJOOP_SINAMA_DEFAULTS.maxConversationIdChars,
      16,
      256,
    ),
    maxSessions: clampPositiveInteger(overrides.maxSessions, AJOOP_SINAMA_DEFAULTS.maxSessions, 1, 256),
    maxHistoryItems: clampPositiveInteger(
      overrides.maxHistoryItems,
      AJOOP_SINAMA_DEFAULTS.maxHistoryItems,
      2,
      12,
    ),
    maxHistoryChars: clampPositiveInteger(
      overrides.maxHistoryChars,
      AJOOP_SINAMA_DEFAULTS.maxHistoryChars,
      64,
      1000,
    ),
    ttlMs: clampPositiveInteger(overrides.ttlMs, AJOOP_SINAMA_DEFAULTS.ttlMs, 1000, 60 * 60 * 1000),
    cleanupIntervalMs: clampPositiveInteger(
      overrides.cleanupIntervalMs,
      AJOOP_SINAMA_DEFAULTS.cleanupIntervalMs,
      1000,
      10 * 60 * 1000,
    ),
  });
}

export function createAjoopSinamaAdapter({
  rag,
  now = () => Date.now(),
  config: configOverrides = {},
  setIntervalImpl = globalThis.setInterval,
  clearIntervalImpl = globalThis.clearInterval,
  scheduleCleanup = true,
} = {}) {
  if (!rag || typeof rag.handle !== "function") {
    throw new TypeError("rag handler required");
  }

  const config = buildConfig(rag, configOverrides);
  const sessions = new Map();
  const busyConversations = new Set();

  const cleanupExpired = () => {
    const current = nowMs(now);
    for (const [conversationId, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(conversationId);
    }
  };

  const evictOldestIfNeeded = () => {
    if (sessions.size < config.maxSessions) return;
    let oldestId = null;
    let oldestTouched = Number.POSITIVE_INFINITY;
    for (const [conversationId, session] of sessions) {
      if (busyConversations.has(conversationId)) continue;
      if (session.touchedAt < oldestTouched) {
        oldestTouched = session.touchedAt;
        oldestId = conversationId;
      }
    }
    if (oldestId !== null) sessions.delete(oldestId);
  };

  const readSessionHistory = (conversationId) => {
    cleanupExpired();
    const session = sessions.get(conversationId);
    if (!session) return [];
    session.touchedAt = nowMs(now);
    session.expiresAt = session.touchedAt + config.ttlMs;
    return session.history.map((item) => ({ ...item }));
  };

  const persistSuccessfulTurn = (conversationId, previousHistory, userMessage, assistantMessage) => {
    const current = nowMs(now);
    if (!sessions.has(conversationId)) evictOldestIfNeeded();
    const history = [
      ...previousHistory,
      { role: "user", content: userMessage.slice(0, config.maxHistoryChars) },
      { role: "assistant", content: assistantMessage.slice(0, config.maxHistoryChars) },
    ].slice(-config.maxHistoryItems);
    sessions.set(conversationId, {
      history,
      touchedAt: current,
      expiresAt: current + config.ttlMs,
    });
  };

  const handle = async ({ method, contentType = "", body = "" } = {}) => {
    if (String(method || "").toUpperCase() !== "POST") {
      return { status: 405, headers: JSON_HEADERS, body: { error: "method not allowed" } };
    }
    if (!/^application\/json\b/i.test(String(contentType || ""))) {
      return { status: 415, headers: JSON_HEADERS, body: { error: "content type" } };
    }

    let raw;
    try {
      raw = JSON.parse(body || "{}");
    } catch (error) {
      return { status: 400, headers: JSON_HEADERS, body: { error: "invalid json" } };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { status: 400, headers: JSON_HEADERS, body: { error: "invalid payload" } };
    }

    const conversationId = boundedText(raw.conversation_id, config.maxConversationIdChars);
    if (!conversationId || !CONVERSATION_ID_RE.test(conversationId)) {
      return { status: 400, headers: JSON_HEADERS, body: { error: "invalid conversation_id" } };
    }
    const message = boundedText(raw.message, config.maxMessageChars);
    if (!message) {
      const tooLong = typeof raw.message === "string" && raw.message.trim().length > config.maxMessageChars;
      return {
        status: 400,
        headers: JSON_HEADERS,
        body: { error: tooLong ? "message too long" : "missing message" },
      };
    }
    if (busyConversations.has(conversationId)) {
      return { status: 409, headers: JSON_HEADERS, body: { error: "conversation busy" } };
    }

    const history = readSessionHistory(conversationId);
    busyConversations.add(conversationId);
    try {
      const upstream = await rag.handle({
        method: "POST",
        origin: "",
        contentType: "application/json",
        body: JSON.stringify({
          version: 1,
          mode: "rag",
          question: message,
          locale: config.locale,
          history,
        }),
      });
      const answer = upstream?.status === 200 && upstream?.body?.ok === true
        ? sanitizeAnswer(upstream.body.answer)
        : "";
      if (!answer) {
        return { status: 503, headers: JSON_HEADERS, body: { error: "agent unavailable" } };
      }

      persistSuccessfulTurn(conversationId, history, message, answer);
      return {
        status: 200,
        headers: JSON_HEADERS,
        body: { message: answer, tool_events: [] },
      };
    } catch (error) {
      return { status: 503, headers: JSON_HEADERS, body: { error: "agent unavailable" } };
    } finally {
      busyConversations.delete(conversationId);
    }
  };

  let cleanupTimer = null;
  if (scheduleCleanup && typeof setIntervalImpl === "function") {
    cleanupTimer = setIntervalImpl(cleanupExpired, config.cleanupIntervalMs);
    if (cleanupTimer && typeof cleanupTimer.unref === "function") cleanupTimer.unref();
  }

  const close = () => {
    if (cleanupTimer && typeof clearIntervalImpl === "function") clearIntervalImpl(cleanupTimer);
    cleanupTimer = null;
    sessions.clear();
    busyConversations.clear();
  };

  return {
    path: AJOOP_SINAMA_PATH,
    config,
    handle,
    close,
    status: () => ({ sessions: sessions.size, busy: busyConversations.size }),
  };
}
