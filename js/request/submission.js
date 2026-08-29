/**
 * DOM-free request transport, timeout and result interpretation.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 4730-4873.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
/* request-submission:start
 * Submission transport for the project request form. Extracted verbatim by
 * scripts/qa-request-submission.mjs, so keep the start/end markers intact and
 * keep this block free of DOM access.
 *
 * The previous implementation posted with `mode: "no-cors"`, which yields an
 * opaque response: no status, no body. A server-side 500 resolved exactly like
 * a success, so the UI confirmed leads that were never stored.
 *
 * Verified 2026-08-29 against the deployed Apps Script web app: a cross-origin
 * POST with a form-urlencoded body needs no preflight, follows the 302 to
 * script.googleusercontent.com, and both hops send `Access-Control-Allow-Origin: *`.
 * The final response is readable JSON, so `no-cors` is unnecessary and success
 * can be confirmed properly.
 *
 * SUCCESS therefore requires ALL of: a non-opaque response, a 2xx status,
 * a parseable JSON body, and an explicit `{ "ok": true }` from the script.
 * Anything else is an error — never a silent success.
 */

/* Measured round trip is ~2.9s; this leaves generous headroom for an Apps
 * Script cold start without leaving the user pending indefinitely. */
const REQUEST_SUBMISSION_TIMEOUT_MS = 20000;

const REQUEST_SUBMISSION_STATE = Object.freeze({
  IDLE: "idle",
  VALIDATING: "validating",
  SUBMITTING: "submitting",
  SUCCESS: "success",
  ERROR: "error",
});

/** Correlates a client-side failure with a user report. */
function createRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (error) {
    /* fall through to the manual id below */
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Turns a fetch Response into a submission result. Only an explicit
 * `{ ok: true }` over a readable 2xx response counts as success.
 */
function interpretRequestResponse(response, bodyText, requestId) {
  if (!response) {
    return { state: REQUEST_SUBMISSION_STATE.ERROR, reason: "no-response", requestId };
  }

  /* An opaque response carries neither status nor body, so it can never be
   * evidence of acceptance. This is the exact regression being guarded. */
  if (response.type === "opaque" || response.type === "opaqueredirect") {
    return { state: REQUEST_SUBMISSION_STATE.ERROR, reason: "opaque", requestId };
  }

  if (!response.ok) {
    return {
      state: REQUEST_SUBMISSION_STATE.ERROR,
      reason: "http-status",
      status: response.status,
      requestId,
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    return { state: REQUEST_SUBMISSION_STATE.ERROR, reason: "malformed", requestId };
  }

  if (!parsed || typeof parsed !== "object") {
    return { state: REQUEST_SUBMISSION_STATE.ERROR, reason: "malformed", requestId };
  }

  if (parsed.ok !== true) {
    return {
      state: REQUEST_SUBMISSION_STATE.ERROR,
      reason: "rejected",
      serverError: parsed.error ? String(parsed.error) : undefined,
      requestId,
    };
  }

  return { state: REQUEST_SUBMISSION_STATE.SUCCESS, requestId };
}

/**
 * POSTs the payload and resolves to a structured result. Never throws.
 * `fetchImpl` and `timeoutMs` are injectable so the QA script can drive every
 * branch without a network.
 */
async function submitRequestPayload(options) {
  const {
    endpoint,
    payload,
    fetchImpl,
    timeoutMs = REQUEST_SUBMISSION_TIMEOUT_MS,
    requestId = createRequestId(),
  } = options || {};

  const doFetch =
    fetchImpl || (typeof fetch === "function" ? (...args) => fetch(...args) : null);
  if (!doFetch) {
    return { state: REQUEST_SUBMISSION_STATE.ERROR, reason: "no-transport", requestId };
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams(payload || {}).toString(),
      signal: controller ? controller.signal : undefined,
    });
    const bodyText = await response.text();
    return interpretRequestResponse(response, bodyText, requestId);
  } catch (error) {
    const timedOut =
      (error && error.name === "AbortError") ||
      Boolean(controller && controller.signal.aborted);
    return {
      state: REQUEST_SUBMISSION_STATE.ERROR,
      reason: timedOut ? "timeout" : "network",
      requestId,
      error: String((error && error.message) || error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/* request-submission:end */
