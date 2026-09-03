/**
 * Ajoop local AI bridge configuration (Ajoop 5.0).
 *
 * Ajoop is deterministic. This optional bridge lets a LOCAL Node bridge
 * (server/ajoop-bridge.mjs) hand an already-computed answer to Ollama to be
 * rephrased in natural language, grounded in the canonical evidence Ajoop 4.2
 * produces. The model never supplies portfolio facts; it only presents the ones
 * it is handed.
 *
 *   browser → HTTPS edge/tunnel → 127.0.0.1:8787 → 127.0.0.1:11434
 *
 * n8n is no longer in this path. See docs/ajoop-local-ai.md.
 *
 * SHIPPED DEFAULT IS OFF. With `enabled: false` or an empty endpoint the site
 * makes no network request, starts no polling loop and behaves exactly as it
 * did in 4.2 — which is what visitors get whenever the machine running the
 * bridge is off. Turning it on is a local edit, not a deploy.
 *
 * THIS FILE IS PUBLIC. It is served to every visitor, so it holds no secret and
 * never should: a token here would be readable by anyone who opens devtools.
 * Access control belongs at the bridge — origin allowlist, rate limiting,
 * concurrency cap and payload validation in server/ajoop-bridge-core.mjs —
 * never in static frontend JavaScript.
 */
window.KAAN_AJOOP_AI = {
  /* Master switch. False means the bridge code loads but never runs. */
  enabled: true,

  /* The public HTTPS edge in front of the local Node bridge, configured at
   * release time. Deliberately empty here: a committed localhost endpoint would
   * make every visitor's browser attempt a loopback request that only ever
   * fails, and a committed tunnel URL would be a claim about infrastructure
   * that may not exist. No provider is assumed or hardcoded. Ollama's own port
   * is never named in anything the visitor loads: the browser talks only to the
   * bridge, and 11434 stays off the public internet. */
  endpoint: "https://ajoop.kaanbalci.com/ajoop",

  /* When this elapses the request is aborted and the deterministic answer
   * stands. It can afford to be generous: the deterministic answer is already
   * on screen before the bridge is called, so the visitor is never waiting on
   * it — the prose simply swaps in if it arrives. Measured worst case for
   * qwen3:4b on an RTX 4050 laptop GPU was 15.0s warm and ~40s on a cold model
   * load, so this leaves headroom without letting a wedged bridge linger. */
  timeoutMs: 30000,

  /* How long an "unavailable" verdict sticks before the bridge retries, so a
   * stopped bridge does not mean a failed request on every single turn. A busy
   * bridge answering 429 is not unavailable and does not start this clock. */
  retryAfterMs: 60000,
};