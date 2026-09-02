/**
 * Ajoop local AI bridge configuration (Ajoop 4.3).
 *
 * Ajoop is deterministic. This optional bridge lets a LOCAL n8n + Ollama
 * instance rephrase an already-computed answer in natural language, grounded in
 * the canonical evidence Ajoop 4.2 produces. The model never supplies portfolio
 * facts; it only presents the ones it is handed.
 *
 * SHIPPED DEFAULT IS OFF. With `enabled: false` or an empty endpoint the site
 * makes no network request, starts no polling loop and behaves exactly as it
 * did in 4.2 — which is what visitors get whenever the machine running n8n is
 * off. Turning it on is a local edit, not a deploy.
 *
 * THIS FILE IS PUBLIC. It is served to every visitor, so it holds no secret and
 * never should: a token here would be readable by anyone who opens devtools.
 * Access control belongs at the bridge — origin allowlist, rate limiting and
 * payload validation in n8n — never in static frontend JavaScript.
 */
window.KAAN_AJOOP_AI = {
  /* Master switch. False means the bridge code loads but never runs. */
  enabled: false,

  /* The n8n webhook, e.g. "http://127.0.0.1:5678/webhook/ajoop-ai" locally, or
   * a user-operated HTTPS tunnel to the same webhook later. No provider is
   * assumed or hardcoded. Ollama's own port is never named here: the browser
   * talks only to n8n, and 11434 stays off the public internet. */
  endpoint: "",

  /* When this elapses the request is aborted and the deterministic answer
   * stands. It can afford to be generous: the deterministic answer is already
   * on screen before the bridge is called, so the visitor is never waiting on
   * it — the prose simply swaps in if it arrives. Measured worst case for
   * qwen3:4b on an RTX 4050 laptop GPU was 15.0s, so this leaves headroom
   * without letting a wedged bridge linger. */
  timeoutMs: 30000,

  /* How long an "unavailable" verdict sticks before the bridge retries, so a
   * stopped n8n does not mean a failed request on every single turn. */
  retryAfterMs: 60000,
};
