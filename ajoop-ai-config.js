/**
 * Ajoop local AI configuration (Ajoop 5.1 RAG).
 *
 * The browser talks only to the public HTTPS edge. The Node bridge on Kaan's
 * machine owns retrieval, scope selection and local Ollama generation:
 *
 *   browser → HTTPS edge/tunnel → 127.0.0.1:8787/ajoop-rag → Ollama
 *
 * Canonical portfolio JSON remains the source of truth. RAG retrieves from that
 * data for Kaan/portfolio questions; unrelated questions may be answered as
 * ordinary general conversation. The deterministic Ajoop stack still renders a
 * complete offline fallback and remains available when the local bridge is off.
 *
 * THIS FILE IS PUBLIC. Never place a token or secret here.
 */
window.KAAN_AJOOP_AI = {
  enabled: true,

  /* Public edge for the local in-memory RAG endpoint. */
  endpoint: "https://ajoop.kaanbalci.com/ajoop-rag",

  /* Warm measured RAG turns are normally ~1–4s. Ten seconds leaves headroom
   * while still revealing the deterministic fallback quickly on a bad turn. */
  timeoutMs: 10000,

  /* Avoid hammering a bridge that is intentionally offline. */
  retryAfterMs: 60000,
};

/*
 * One visible response lifecycle:
 *   thinking → RAG answer
 * or, if local AI fails:
 *   thinking → deterministic fallback
 *
 * assistant.js renders the deterministic source first for resilience, then the
 * RAG client adds `is-enhancing` in the same task. Final-answer children remain
 * hidden during inference so visitors never see deterministic prose flash and
 * then get rewritten by AI.
 */
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.setAttribute("data-ajoop-ai-first", "");
  style.textContent = `
    html { --ajoop-ai-thinking-copy: "Thinking this through…"; }
    html[lang^="tr"] { --ajoop-ai-thinking-copy: "Bunu düşünüyorum…"; }
    html[lang^="de"] { --ajoop-ai-thinking-copy: "Ich denke darüber nach…"; }
    html[lang^="es"] { --ajoop-ai-thinking-copy: "Estoy pensando…"; }
    html[lang^="fr"] { --ajoop-ai-thinking-copy: "J’y réfléchis…"; }

    .chatbot-message.bot.is-enhancing {
      display: block;
      min-height: 44px;
    }
    .chatbot-message.bot.is-enhancing > * {
      display: none !important;
    }
    .chatbot-message.bot.is-enhancing::before {
      content: var(--ajoop-ai-thinking-copy);
      display: block;
      color: var(--muted);
      line-height: 1.5;
      opacity: 0.82;
    }

    .chatbot-message.bot.is-thinking > p {
      font-size: 0;
    }
    .chatbot-message.bot.is-thinking > p::before {
      content: var(--ajoop-ai-thinking-copy);
      display: block;
      font-size: 14px;
      line-height: 1.5;
      opacity: 0.82;
    }

    @media (prefers-reduced-motion: reduce) {
      .chatbot-message.bot.is-enhancing::before,
      .chatbot-message.bot.is-thinking > p::before {
        transition: none;
      }
    }
  `;
  document.head?.appendChild(style);
}
