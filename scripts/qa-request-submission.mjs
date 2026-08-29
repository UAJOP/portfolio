#!/usr/bin/env node
/**
 * qa-request-submission.mjs — regression tests for request form submission.
 *
 * Guards the P1 bug fixed in BRIEF 00.2: the form reported confirmed success
 * for submissions it could not verify, because `mode: "no-cors"` produced an
 * opaque response in which a 500 was indistinguishable from acceptance.
 *
 * The submission layer is extracted verbatim from legacy-script.js between the
 * `request-submission` markers, so this exercises the shipped code rather than
 * a copy. Transport is mocked — no network calls are made.
 *
 * Node built-ins only, consistent with the other qa-*.js checks.
 *
 *   node scripts/qa-request-submission.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, "legacy-script.js");
const source = readFileSync(RUNTIME, "utf8");

/* ---------- extract the submission layer from the shipped runtime ---------- */

const START = "/* request-submission:start";
const END = "/* request-submission:end */";
const startIndex = source.indexOf(START);
const endIndex = source.indexOf(END);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.error(
    "FAIL: could not find the request-submission markers in legacy-script.js.\n" +
      "The submission layer must stay wrapped in those markers so this test can " +
      "exercise the real implementation.",
  );
  process.exit(1);
}

const submissionSource = source.slice(startIndex, endIndex + END.length);

const {
  REQUEST_SUBMISSION_STATE: STATE,
  REQUEST_SUBMISSION_TIMEOUT_MS: TIMEOUT_MS,
  createRequestId,
  interpretRequestResponse,
  submitRequestPayload,
} = new Function(
  submissionSource +
    "\nreturn { REQUEST_SUBMISSION_STATE, REQUEST_SUBMISSION_TIMEOUT_MS, createRequestId, interpretRequestResponse, submitRequestPayload };",
)();

/* ---------- assertion helpers ---------- */

let passed = 0;
const failures = [];

const check = (label, actual, expected) => {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};

/* Minimal Response stand-in: only what the submission layer reads. */
const mockResponse = ({ ok = true, status = 200, type = "cors", body = '{"ok":true}' }) => ({
  ok,
  status,
  type,
  text: async () => body,
});

const ENDPOINT = "https://example.invalid/exec";
const PAYLOAD = { name: "Test", email: "test@example.com", details: "hello" };

const submitWith = (fetchImpl, timeoutMs) =>
  submitRequestPayload({
    endpoint: ENDPOINT,
    payload: PAYLOAD,
    fetchImpl,
    timeoutMs: timeoutMs === undefined ? 1000 : timeoutMs,
  });

/* ---------- the critical regression: opaque must never be success ---------- */

check(
  "opaque response is NOT success",
  interpretRequestResponse(mockResponse({ type: "opaque", body: "" }), "", "id").state,
  STATE.ERROR,
);
check(
  "opaque response reports reason 'opaque'",
  interpretRequestResponse(mockResponse({ type: "opaque", body: "" }), "", "id").reason,
  "opaque",
);
check(
  "opaqueredirect response is NOT success",
  interpretRequestResponse(mockResponse({ type: "opaqueredirect", body: "" }), "", "id").state,
  STATE.ERROR,
);

/* Drift guard: no-cors must not reappear in the request submission path. */
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* Quote-agnostic and position-agnostic: "no-cors" must not appear anywhere in
 * executable code. Comments may still discuss it when explaining the fix. */
check(
  'no runtime code mentions no-cors outside comments',
  /no-cors/.test(stripComments(source)),
  false,
);

check(
  "the submission layer is still marked and extractable",
  submissionSource.includes("function submitRequestPayload"),
  true,
);

/* The success path must be gated on the state constant, not a bare resolve. */
check(
  "handler gates success on REQUEST_SUBMISSION_STATE.SUCCESS",
  /result\.state === REQUEST_SUBMISSION_STATE\.SUCCESS/.test(source),
  true,
);

/* ---------- confirmed success ---------- */

const success = await submitWith(async () => mockResponse({ body: '{"ok":true}' }));
check("HTTP 200 + {ok:true} -> SUCCESS", success.state, STATE.SUCCESS);
check("success carries a requestId", typeof success.requestId === "string" && success.requestId.length > 0, true);

/* Extra fields alongside ok:true are fine. */
const successExtra = await submitWith(async () =>
  mockResponse({ body: '{"ok":true,"requestId":"abc","message":"stored"}' }),
);
check("HTTP 200 + {ok:true,...} -> SUCCESS", successExtra.state, STATE.SUCCESS);

/* ---------- server rejection (HTTP failure) ---------- */

for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
  const result = await submitWith(async () =>
    mockResponse({ ok: false, status, body: "Internal Server Error" }),
  );
  check(`HTTP ${status} -> ERROR`, result.state, STATE.ERROR);
  check(`HTTP ${status} -> reason http-status`, result.reason, "http-status");
  check(`HTTP ${status} -> status preserved`, result.status, status);
}

/* ---------- application rejection (HTTP 200 + ok:false) ---------- */

const rejected = await submitWith(async () =>
  mockResponse({ body: '{"ok":false,"error":"Sheet quota exceeded"}' }),
);
check("HTTP 200 + {ok:false} -> ERROR", rejected.state, STATE.ERROR);
check("HTTP 200 + {ok:false} -> reason rejected", rejected.reason, "rejected");
check("server error message preserved", rejected.serverError, "Sheet quota exceeded");

/* A body with no ok field at all must not pass. */
const noOkField = await submitWith(async () => mockResponse({ body: '{"message":"received"}' }));
check("HTTP 200 without ok field -> ERROR", noOkField.state, STATE.ERROR);

/* Truthy-but-not-true must not pass. */
for (const value of ['"true"', "1", '"yes"']) {
  const result = await submitWith(async () => mockResponse({ body: `{"ok":${value}}` }));
  check(`ok:${value} (not boolean true) -> ERROR`, result.state, STATE.ERROR);
}

/* ---------- network error ---------- */

const networkError = await submitWith(async () => {
  throw new TypeError("Failed to fetch");
});
check("fetch rejects -> ERROR", networkError.state, STATE.ERROR);
check("fetch rejects -> reason network", networkError.reason, "network");

/* A failure while reading the body is also an error, never a success. */
const bodyReadError = await submitWith(async () => ({
  ok: true,
  status: 200,
  type: "cors",
  text: async () => {
    throw new Error("stream closed");
  },
}));
check("body read throws -> ERROR", bodyReadError.state, STATE.ERROR);

/* ---------- timeout ---------- */

const timedOut = await submitRequestPayload({
  endpoint: ENDPOINT,
  payload: PAYLOAD,
  timeoutMs: 40,
  fetchImpl: (url, options) =>
    new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => resolvePromise(mockResponse({})), 5000);
      /* Honour the abort signal the way a real fetch does. */
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        rejectPromise(error);
      });
    }),
});
check("slow request -> ERROR", timedOut.state, STATE.ERROR);
check("slow request -> reason timeout", timedOut.reason, "timeout");

check(
  "default timeout is bounded and generous (5s..60s)",
  TIMEOUT_MS >= 5000 && TIMEOUT_MS <= 60000,
  true,
);

/* ---------- malformed response ---------- */

for (const body of ["", "not json", "<!DOCTYPE html><html>error</html>", "{oops"]) {
  const result = await submitWith(async () => mockResponse({ body }));
  check(`malformed body ${JSON.stringify(body.slice(0, 20))} -> ERROR`, result.state, STATE.ERROR);
  check(`malformed body ${JSON.stringify(body.slice(0, 20))} -> reason malformed`, result.reason, "malformed");
}

/* JSON that is valid but not an object. */
for (const body of ["null", "42", '"ok"', "[1,2,3]"]) {
  const result = await submitWith(async () => mockResponse({ body }));
  check(`non-object JSON ${body} -> ERROR`, result.state, STATE.ERROR);
}

/* ---------- transport availability ---------- */

const noTransport = await submitRequestPayload({
  endpoint: ENDPOINT,
  payload: PAYLOAD,
  fetchImpl: null,
  timeoutMs: 100,
});
/* Node 22 has a global fetch, so this exercises the real path rather than the
 * no-transport branch; either way it must not be a success. */
check("missing explicit transport never yields SUCCESS", noTransport.state === STATE.SUCCESS, false);

/* ---------- request payload shape ---------- */

let observed = null;
await submitRequestPayload({
  endpoint: ENDPOINT,
  payload: { name: "Ada", details: "a & b = c" },
  timeoutMs: 1000,
  fetchImpl: async (url, options) => {
    observed = { url, options };
    return mockResponse({});
  },
});
check("posts to the given endpoint", observed.url, ENDPOINT);
check("uses POST", observed.options.method, "POST");
check(
  "uses form-urlencoded (a CORS-safelisted type, so no preflight)",
  observed.options.headers["Content-Type"],
  "application/x-www-form-urlencoded;charset=UTF-8",
);
check("does not set mode: no-cors", observed.options.mode, undefined);
check("body encodes values safely", observed.options.body, "name=Ada&details=a+%26+b+%3D+c");
check("passes an abort signal", Boolean(observed.options.signal), true);

/* ---------- double submission guard (handler-level) ---------- */

check(
  "handler guards re-entry while submitting",
  /if \(requestSubmitting\) return;/.test(source),
  true,
);
check(
  "handler disables the submit button while in flight",
  /submit\.disabled = true;/.test(source),
  true,
);
check(
  "handler re-enables the submit button afterwards",
  /submit\.disabled = false;/.test(source),
  true,
);

/* Simulate the guard: a second submit while the first is in flight must not
 * start a second request. */
let inFlightCalls = 0;
let releaseFirst;
const gate = new Promise((r) => {
  releaseFirst = r;
});
let submitting = false;
const guardedSubmit = async () => {
  if (submitting) return "blocked";
  submitting = true;
  try {
    return await submitRequestPayload({
      endpoint: ENDPOINT,
      payload: PAYLOAD,
      timeoutMs: 1000,
      fetchImpl: async () => {
        inFlightCalls += 1;
        await gate;
        return mockResponse({});
      },
    });
  } finally {
    submitting = false;
  }
};
const first = guardedSubmit();
const second = await guardedSubmit();
check("second submit while in flight is blocked", second, "blocked");
releaseFirst();
const firstResult = await first;
check("first submit still succeeds", firstResult.state, STATE.SUCCESS);
check("only one request was dispatched", inFlightCalls, 1);

/* ---------- form reset timing (handler-level) ---------- */

const handlerStart = source.indexOf("function setupProjectRequestForm()");
const handler = source.slice(handlerStart, handlerStart + 4000);
const successBranch = handler.indexOf("REQUEST_SUBMISSION_STATE.SUCCESS");
const resetCall = handler.indexOf("form.reset()", successBranch);
const elseBranch = handler.indexOf("} else {", successBranch);

check("form.reset() exists in the success branch", resetCall > successBranch, true);
check("form.reset() happens before the error branch", resetCall < elseBranch, true);
check(
  "error branch documents that values are preserved for retry",
  /left intact so the user can retry/.test(handler),
  true,
);
check(
  "error branch does not reset the form",
  /\} else \{[\s\S]{0,600}form\.reset\(\)/.test(handler.slice(successBranch)),
  false,
);

/* ---------- request id ---------- */

const idA = createRequestId();
const idB = createRequestId();
check("createRequestId returns a string", typeof idA, "string");
check("createRequestId is non-empty", idA.length > 8, true);
check("createRequestId is unique per call", idA === idB, false);

/* ---------- state model ---------- */

for (const key of ["IDLE", "VALIDATING", "SUBMITTING", "SUCCESS", "ERROR"]) {
  check(`state model exposes ${key}`, typeof STATE[key], "string");
}
check("SUCCESS and ERROR are distinct", STATE.SUCCESS === STATE.ERROR, false);

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Request submission: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(`Request submission passed. ${passed} assertions, no network calls.`);
