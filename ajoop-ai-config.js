/**
 * Ajoop local AI configuration (Ajoop 5.1 RAG).
 *
 * The browser talks only to the public HTTPS edge. The Node bridge on Kaan's
 * machine owns retrieval, scope selection and local Ollama generation:
 *
 *   browser → HTTPS edge/tunnel → 127.0.0.1:8787/ajoop-rag → Ollama
 *
 * Canonical portfolio JSON remains the source of truth. RAG retrieves from that
 * data for Kaan/portfolio questions; unrelated questions are answered as
 * ordinary general conversation. The deterministic Ajoop stack still plans a
 * complete offline answer and is what renders when the local bridge is off.
 *
 * CONFIGURATION ONLY. Ajoop 5.0 also injected a <style> element from here to
 * dress the loading state, which put the panel's appearance in two files and
 * let the thinking copy drift from the copy the assistant actually spoke. The
 * turn lifecycle lives in js/ajoop/assistant.js and its styling lives in
 * style.css, next to every other rule the panel uses.
 *
 * THIS FILE IS PUBLIC. Never place a token or secret here.
 */
window.KAAN_AJOOP_AI = {
  enabled: true,

  /* Public edge for the local in-memory RAG endpoint. */
  endpoint: "https://ajoop.kaanbalci.com/ajoop-rag",

  /* Warm measured RAG turns are normally ~1–4s. Eighteen seconds leaves
   * headroom for the rare healthy spike in local inference while still
   * bounding how long one visible turn can wait before the deterministic
   * answer takes over. */
  timeoutMs: 18000,

  /* Avoid hammering a bridge that is intentionally offline. */
  retryAfterMs: 60000,
};
