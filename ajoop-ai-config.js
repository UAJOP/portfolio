/**
 * Ajoop local AI bridge configuration (Ajoop 5.0).
 *
 * Ajoop's facts and evidence remain deterministic. The production bridge lets a
 * LOCAL Node bridge (server/ajoop-bridge.mjs) hand that already-computed,
 * grounded evidence to Ollama for the visitor-facing prose.
 *
 *   browser → HTTPS edge/tunnel → 127.0.0.1:8787 → 127.0.0.1:11434
 *
 * n8n is no longer in this path. See docs/ajoop-local-ai.md.
 *
 * Production behavior is AI-first while the bridge is healthy: the deterministic
 * answer is still rendered as the fallback source of truth, but it stays hidden
 * only while the AI request is in flight. If the bridge is disabled, offline,
 * busy, malformed or too slow, the `is-enhancing` class is removed and the
 * deterministic answer appears unchanged.
 *
 * THIS FILE IS PUBLIC. It is served to every visitor, so it holds no secret and
 * never should: a token here would be readable by anyone who opens devtools.
 * Access control belongs at the bridge — origin allowlist, rate limiting,
 * concurrency cap and payload validation in server/ajoop-bridge-core.mjs —
 * never in static frontend JavaScript.
 */
window.KAAN_AJOOP_AI = {
  /* Production switch for the optional local AI presentation layer. */
  enabled: true,

  /* Public HTTPS edge in front of the loopback-only Node bridge. Ollama's own
   * port is never named in anything the visitor loads. */
  endpoint: "https://ajoop.kaanbalci.com/ajoop",

  /* AI-first has a strict patience budget. Warm qwen3:4b responses are expected
   * well inside this window after the fast no-think adapter; if the request does
   * not finish in time, the browser reveals the deterministic answer instead of
   * leaving the visitor staring at an empty turn. */
  timeoutMs: 10000,

  /* How long an "unavailable" verdict sticks before the bridge retries, so a
   * stopped bridge does not mean a failed request on every single turn. A busy
   * bridge answering 429 is not unavailable and does not start this clock. */
  retryAfterMs: 60000,
};

/*
 * AI-first presentation without weakening deterministic fallback.
 *
 * assistant.js adds `is-enhancing` synchronously after rendering the grounded
 * deterministic message and removes it on either AI success or failure. Hiding
 * that one in-flight message means visitors see the AI answer directly when it
 * succeeds; on any failure the same deterministic message becomes visible.
 */
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.setAttribute("data-ajoop-ai-first", "");
  style.textContent = ".chatbot-message.bot.is-enhancing{display:none;}";
  document.head?.appendChild(style);
}
