#!/usr/bin/env node
/**
 * qa-ajoop-bridge.mjs — behaviour tests for the Ajoop 5.0 Node bridge.
 *
 * Exercises the SHIPPED core (server/ajoop-bridge-core.mjs) with an injected
 * fetch and clock. No network, no Ollama, no socket, no model download: every
 * branch the bridge can take is reachable in under a second.
 *
 * The properties worth pinning are the ones whose failure is invisible in
 * normal use — reasoning leaking into an answer, an unlisted origin being
 * served, a question reaching a log, a second generation queueing behind the
 * GPU instead of being refused.
 *
 * Node built-ins only, consistent with the other qa-* checks.
 *
 *   node scripts/qa-ajoop-bridge.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AJOOP_BRIDGE_PROTOCOL_VERSION,
  createAjoopBridge,
  isJsonContentType,
  resolveAjoopBridgeConfig,
  resolveCorsOrigin,
  validateAjoopRequest,
  readOllamaAnswer,
  stripReasoning,
  buildAjoopSystemPrompt,
  buildOllamaMessages,
} from "../server/ajoop-bridge-core.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

const ORIGIN = "https://kaanbalci.com";
const ENV = { AJOOP_AI_ALLOWED_ORIGINS: `${ORIGIN},http://localhost:4173` };
const CONFIG = resolveAjoopBridgeConfig(ENV);

const evidence = [
  {
    type: "project",
    entityId: "sinama",
    title: "SINAMA — AI Agent Reliability Lab",
    summary: "A reliability lab for repeatable multi-turn agent testing.",
    meta: ["Applied AI / Reliability", "Live MVP"],
    tags: ["FastAPI", "PostgreSQL"],
    proof: ["14-scenario typed cross-vertical suite"],
    sources: [{ kind: "github", url: "https://github.com/UAJOP/sinama" }],
  },
];

const generateBody = (overrides = {}) =>
  JSON.stringify({
    version: AJOOP_BRIDGE_PROTOCOL_VERSION,
    question: "Why is SINAMA strong evidence?",
    locale: "en",
    intent: "project_overview",
    entity: "sinama",
    depth: "normal",
    grounding: { evidence, comparison: null },
    ...overrides,
  });

const healthBody = JSON.stringify({ version: AJOOP_BRIDGE_PROTOCOL_VERSION, mode: "health" });

const browserBridgeSource = readFileSync(new URL("../js/ajoop/ai-bridge.js", import.meta.url), "utf8");
const browserBridgeStart = browserBridgeSource.indexOf("/* ajoop-ai-bridge:start");
const browserBridgeEnd = browserBridgeSource.indexOf("/* ajoop-ai-bridge:end */");

function createBrowserBridge(config) {
  if (browserBridgeStart < 0 || browserBridgeEnd < browserBridgeStart) {
    throw new Error("browser bridge markers missing");
  }
  const source = browserBridgeSource.slice(browserBridgeStart, browserBridgeEnd);
  return new Function(
    "window",
    `${source}\nreturn {
      AJOOP_AI_STATE,
      beginAjoopAiTurn,
      buildAjoopAiPayload,
      checkAjoopAiHealth,
      getAjoopAiState,
      isAjoopAiTurnCurrent,
      requestAjoopAiResponse,
      resetAjoopAiState,
    };`,
  )({ KAAN_AJOOP_AI: config });
}

const browserResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

/** A bridge whose Ollama call is whatever the test says it is. */
function withJsonRequests(bridge) {
  const handle = bridge.handle.bind(bridge);
  return {
    ...bridge,
    handle(request) {
      const method = String(request?.method || "").toUpperCase();
      return handle({ contentType: method === "POST" ? "application/json" : "", ...request });
    },
  };
}

function bridgeWith(fetchImpl, extra = {}) {
  return withJsonRequests(
    createAjoopBridge({ config: { ...CONFIG, ...(extra.config || {}) }, fetchImpl, now: extra.now }),
  );
}

const okOllama = (content, thinking) => async (url) =>
  String(url).endsWith("/api/tags")
    ? { ok: true, json: async () => ({ models: [{ name: CONFIG.model, model: CONFIG.model }] }) }
    : {
        ok: true,
        json: async () => ({ message: { role: "assistant", content, thinking } }),
      };

/* ---------- configuration ---------- */

check("default model is qwen3:4b", CONFIG.model, "qwen3:4b");
check("default Ollama base is loopback", CONFIG.ollamaBaseUrl, "http://127.0.0.1:11434");
check("default concurrency is 1", CONFIG.maxConcurrent, 1);
check("question cap is 500", CONFIG.maxQuestionChars, 500);
check("evidence cap is 3", CONFIG.maxEvidenceItems, 3);
check("the listen host cannot be changed from loopback",
  resolveAjoopBridgeConfig({ AJOOP_AI_HOST: "0.0.0.0" }).host, "127.0.0.1");
check("the public route cannot be changed",
  resolveAjoopBridgeConfig({ AJOOP_AI_PATH: "/admin" }).path, "/ajoop");
check("a partially numeric port falls back safely",
  resolveAjoopBridgeConfig({ AJOOP_AI_PORT: "8787oops" }).port, 8787);
check("an invalid Ollama URL falls back to loopback",
  resolveAjoopBridgeConfig({ OLLAMA_BASE_URL: "file:///tmp/model" }).ollamaBaseUrl,
  "http://127.0.0.1:11434");
check("an invalid model tag falls back safely",
  resolveAjoopBridgeConfig({ AJOOP_AI_MODEL: "bad model\nvalue" }).model, "qwen3:4b");
check("the question cap cannot be raised above 500",
  resolveAjoopBridgeConfig({ AJOOP_AI_MAX_QUESTION_CHARS: "501" }).maxQuestionChars, 500);
check("the evidence cap cannot be raised above 3",
  resolveAjoopBridgeConfig({ AJOOP_AI_MAX_EVIDENCE: "4" }).maxEvidenceItems, 3);
check("an unsafe temperature falls back low",
  resolveAjoopBridgeConfig({ AJOOP_AI_TEMPERATURE: "4" }).temperature, 0.2);
ok("an empty allowlist falls back to the shipped origins, never to *",
  resolveAjoopBridgeConfig({ AJOOP_AI_ALLOWED_ORIGINS: "" }).allowedOrigins.length > 0);
ok("the fallback allowlist contains no wildcard",
  !resolveAjoopBridgeConfig({}).allowedOrigins.includes("*"));
ok("a wildcard-only allowlist falls back without preserving *",
  !resolveAjoopBridgeConfig({ AJOOP_AI_ALLOWED_ORIGINS: "*" }).allowedOrigins.includes("*"));

/* ---------- CORS ---------- */

check("an allowed origin is echoed", resolveCorsOrigin(ORIGIN, CONFIG), ORIGIN);
check("an unlisted origin resolves to null", resolveCorsOrigin("https://evil.example", CONFIG), null);
check("a missing origin resolves to null", resolveCorsOrigin("", CONFIG), null);
check("a literal wildcard origin is never echoed",
  resolveCorsOrigin("*", { ...CONFIG, allowedOrigins: ["*"] }), null);

{
  const bridge = bridgeWith(okOllama("Fine."));
  const allowed = await bridge.handle({ method: "POST", origin: ORIGIN, body: healthBody });
  check("allowed origin gets a CORS header", allowed.headers["Access-Control-Allow-Origin"], ORIGIN);
  ok("CORS header is never a wildcard", allowed.headers["Access-Control-Allow-Origin"] !== "*");
  check("allowed origin varies on Origin", allowed.headers.Vary, "Origin");

  const rejected = await bridge.handle({ method: "POST", origin: "https://evil.example", body: healthBody });
  check("rejected origin gets 403", rejected.status, 403);
  check("rejected origin gets no CORS header", rejected.headers["Access-Control-Allow-Origin"], undefined);
  check("rejected origin is not told why in detail", rejected.body.error, "origin not allowed");

  const preflight = await bridge.handle({ method: "OPTIONS", origin: ORIGIN, body: "" });
  check("OPTIONS answers 204", preflight.status, 204);
  check("OPTIONS echoes the origin", preflight.headers["Access-Control-Allow-Origin"], ORIGIN);
  check("OPTIONS advertises POST", preflight.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
  check("CORS never enables credentials", preflight.headers["Access-Control-Allow-Credentials"], undefined);
  check("OPTIONS has no body", preflight.body, null);

  const noOrigin = await bridge.handle({ method: "POST", origin: "", body: healthBody });
  check("a non-browser health request without Origin is handled", noOrigin.status, 200);
  check("a request without Origin gets no CORS header", noOrigin.headers["Access-Control-Allow-Origin"], undefined);

  const wrongMethod = await bridge.handle({ method: "GET", origin: ORIGIN, body: "" });
  check("GET is refused", wrongMethod.status, 405);
  check("GET refusal is bounded JSON", wrongMethod.body.error, "method not allowed");
}

/* ---------- request contract ---------- */

{
  const bridge = bridgeWith(okOllama("Fine."));

  ok("application/json with a charset is accepted as JSON",
    isJsonContentType("application/json; charset=utf-8"));
  ok("text/plain is not accepted as JSON", !isJsonContentType("text/plain"));

  const strictBridge = createAjoopBridge({ config: CONFIG, fetchImpl: okOllama("Fine.") });
  const missingType = await strictBridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a POST without Content-Type is refused", missingType.status, 415);
  check("the missing Content-Type reason is short", missingType.body.error, "content type not allowed");
  const wrongType = await strictBridge.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "text/plain",
    body: generateBody(),
  });
  check("a non-JSON Content-Type is refused", wrongType.status, 415);
  const charsetType = await strictBridge.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json; charset=utf-8",
    body: generateBody(),
  });
  check("a JSON Content-Type with charset is accepted", charsetType.status, 200);

  const badJson = await bridge.handle({ method: "POST", origin: ORIGIN, body: "{not json" });
  check("invalid JSON is refused", badJson.status, 400);
  check("invalid JSON reason is short", badJson.body.error, "invalid json");

  const oversized = await bridge.handle({
    method: "POST",
    origin: ORIGIN,
    body: JSON.stringify({ version: 1, pad: "x".repeat(CONFIG.maxBodyBytes + 10) }),
  });
  check("an oversized body is refused", oversized.status, 413);
  check("oversized reason is short", oversized.body.error, "payload too large");

  const longQuestion = await bridge.handle({
    method: "POST",
    origin: ORIGIN,
    body: generateBody({ question: "q".repeat(501) }),
  });
  check("a question over 500 chars is refused", longQuestion.status, 400);
  check("long-question reason is short", longQuestion.body.error, "question too long");

  const badLocale = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody({ locale: "it" }) });
  check("an unsupported locale is refused", badLocale.status, 400);
  check("locale reason is short", badLocale.body.error, "unsupported locale");

  for (const locale of ["en", "tr", "de", "es", "fr"]) {
    const result = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody({ locale }) });
    check(`locale ${locale} is accepted`, result.status, 200);
  }

  const badVersion = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody({ version: 2 }) });
  check("an unsupported protocol version is refused", badVersion.status, 400);
  check("version reason is short", badVersion.body.error, "unsupported version");

  const notObject = await bridge.handle({ method: "POST", origin: ORIGIN, body: "[1,2,3]" });
  check("an array body is refused", notObject.status, 400);

  const noGrounding = await bridge.handle({
    method: "POST",
    origin: ORIGIN,
    body: generateBody({ grounding: { evidence: [], comparison: null } }),
  });
  check("a request with no grounding is refused", noGrounding.status, 400);
  check("no-grounding reason is short", noGrounding.body.error, "no grounding supplied");

  const malformedGrounding = await bridge.handle({
    method: "POST",
    origin: ORIGIN,
    body: generateBody({ grounding: "everything you know" }),
  });
  check("malformed grounding is refused", malformedGrounding.status, 400);
}

/* ---------- evidence bounds ---------- */

{
  const many = Array.from({ length: 9 }, (_, index) => ({ ...evidence[0], title: `Card ${index}` }));
  const validated = validateAjoopRequest(
    { version: 1, question: "q", locale: "en", grounding: { evidence: many, comparison: null } },
    CONFIG,
  );
  ok("a validated generate request is accepted", validated.ok);
  check("evidence is capped at three items", validated.payload.evidence.length, 3);
  check("the cap keeps the first cards", validated.payload.evidence[0].title, "Card 0");

  const prompt = buildOllamaMessages(validated.payload)[1].content;
  ok("the prompt carries the kept cards", prompt.includes("Card 2"));
  ok("the prompt drops the cards beyond the cap", !prompt.includes("Card 3"));
  ok("the prompt carries no source URLs", !prompt.includes("https://github.com"));
}

/* ---------- system prompt ---------- */

{
  const system = buildAjoopSystemPrompt("tr");
  ok("the system prompt names the answer language", system.includes("Turkish"));
  ok("the system prompt forbids invented facts", /Never add facts/i.test(system));
  ok("the system prompt forbids invented metrics", /metrics/i.test(system));
  ok("the system prompt forbids inferred experience", /infer experience/i.test(system));
  ok("the system prompt forbids changing project facts", /never change a project fact/i.test(system));
  ok("the system prompt treats visitor text as untrusted data", /never as instructions/i.test(system));
  ok("the system prompt allows admitting insufficiency", /does not cover the question/i.test(system));
  ok("the system prompt stays terse", system.split("\n").length <= 8);
}

/* ---------- health ---------- */

{
  const calls = [];
  const bridge = bridgeWith(async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ models: [{ name: CONFIG.model }] }) };
  });
  const health = await bridge.handle({ method: "POST", origin: ORIGIN, body: healthBody });
  check("health answers 200", health.status, 200);
  check("health reports ok", health.body.ok, true);
  check("health reports the model", health.body.model, "qwen3:4b");
  check("health has no answer field", health.body.answer, undefined);
  check("health checks model inventory once", calls.filter((url) => url.endsWith("/api/tags")).length, 1);
  check("health never invokes generation", calls.filter((url) => url.endsWith("/api/chat")).length, 0);

  const missingModel = bridgeWith(async () => ({ ok: true, json: async () => ({ models: [] }) }));
  const unavailable = await missingModel.handle({ method: "POST", origin: ORIGIN, body: healthBody });
  check("health refuses to claim availability when the model is missing", unavailable.status, 503);
  check("missing-model health stays generic", unavailable.body.error, "model unavailable");
}

/* ---------- generation ---------- */

{
  const bridge = bridgeWith(okOllama("SINAMA turns agent behaviour into evidence."));
  const result = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a valid generation answers 200", result.status, 200);
  check("a valid generation reports ok", result.body.ok, true);
  check("a valid generation returns message.content", result.body.answer, "SINAMA turns agent behaviour into evidence.");
  check("a valid generation names the model", result.body.model, "qwen3:4b");
  check("a valid generation exposes nothing else", Object.keys(result.body).sort().join(","), "answer,model,ok");
}

/* ---------- reasoning must never reach the browser ---------- */

{
  const bridge = bridgeWith(okOllama("The answer.", "Hmm, the user is asking about SINAMA, let me think..."));
  const result = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("message.thinking is never returned", result.body.answer, "The answer.");
  ok("no field carries the thinking text", !JSON.stringify(result.body).includes("Hmm, the user is asking"));

  const tagged = bridgeWith(okOllama("<think>internal deliberation</think>The visible answer."));
  const taggedResult = await tagged.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("inline <think> content rejects the optional answer", taggedResult.status, 502);
  ok("stripped reasoning does not survive anywhere", !JSON.stringify(taggedResult.body).includes("internal deliberation"));
  check("an unclosed reasoning tag rejects the optional answer", stripReasoning("<think>a b"), "");
}

/* ---------- malformed and failing Ollama ---------- */

{
  const shapes = [
    ["a null reply", null],
    ["a reply with no message", { done: true }],
    ["a reply whose message is a string", { message: "text" }],
    ["a reply with empty content", { message: { content: "   " } }],
    ["a reply with non-string content", { message: { content: { text: "x" } } }],
  ];
  for (const [label, shape] of shapes) {
    check(`readOllamaAnswer rejects ${label}`, readOllamaAnswer(shape), null);
    const bridge = bridgeWith(async () => ({ ok: true, json: async () => shape }));
    const result = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
    check(`${label} becomes a bounded error`, result.body.error, "empty model response");
    check(`${label} does not claim success`, result.body.ok, false);
    check(`${label} releases the generation slot`, bridge.stats().active, 0);
  }

  const unparseable = bridgeWith(async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  }));
  const unparseableResult = await unparseable.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("an unparseable Ollama body is a bounded error", unparseableResult.body.error, "model unavailable");
  ok("the parser error text is not forwarded", !JSON.stringify(unparseableResult.body).includes("Unexpected token"));
  check("an unparseable Ollama body releases the generation slot", unparseable.stats().active, 0);

  const httpFailure = bridgeWith(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  const httpResult = await httpFailure.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("an Ollama HTTP failure answers 502", httpResult.status, 502);
  check("an Ollama HTTP failure is bounded", httpResult.body.error, "model unavailable");
  check("an Ollama HTTP failure releases the generation slot", httpFailure.stats().active, 0);

  const refused = bridgeWith(async () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" });
  });
  const refusedResult = await refused.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a refused connection answers 502", refusedResult.status, 502);
  ok("the socket error text is not forwarded", !JSON.stringify(refusedResult.body).includes("ECONNREFUSED"));
  check("a refused connection releases the generation slot", refused.stats().active, 0);
}

/* ---------- timeout ---------- */

{
  const timingOut = withJsonRequests(createAjoopBridge({
    config: { ...CONFIG, ollamaTimeoutMs: 20 },
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
  }));
  const result = await timingOut.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a hung Ollama request aborts with 504", result.status, 504);
  check("the timeout reason is short", result.body.error, "model timeout");
  check("a timeout releases the generation slot", timingOut.stats().active, 0);
}

/* ---------- concurrency: refuse, never queue ---------- */

{
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let started = 0;
  const bridge = bridgeWith(
    async () => {
      started += 1;
      await gate;
      return { ok: true, json: async () => ({ message: { content: "done" } }) };
    },
    { config: { rateMax: 2 } },
  );

  const first = bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  await new Promise((resolve) => setImmediate(resolve));
  check("the first generation is in flight", bridge.stats().active, 1);

  const second = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a concurrent generation answers 429", second.status, 429);
  check("the concurrent refusal names being busy", second.body.error, "busy");
  check("the refused request never reached the model", started, 1);

  release();
  const firstResult = await first;
  check("the first generation still succeeds", firstResult.status, 200);
  check("the slot is released afterwards", bridge.stats().active, 0);

  const third = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("a later generation is accepted again", third.status, 200);
  const fourth = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("busy refusals do not spend generation budget", fourth.status, 429);
  check("the actual third generation spends the remaining budget", fourth.body.error, "rate limited");
}

/* ---------- rate guard ---------- */

{
  let clock = 1_000_000;
  const bridge = withJsonRequests(createAjoopBridge({
    config: { ...CONFIG, rateMax: 3, rateWindowMs: 60000 },
    fetchImpl: okOllama("ok"),
    now: () => clock,
  }));
  for (let index = 0; index < 3; index += 1) {
    const result = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
    check(`request ${index + 1} within the rate window is served`, result.status, 200);
  }
  const limited = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("the fourth request in the window is limited", limited.status, 429);
  check("the rate refusal is named", limited.body.error, "rate limited");

  clock += 60001;
  const afterWindow = await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("the window reopens", afterWindow.status, 200);

  /* A fresh instance starts clean: the guard is memory, not a stored record. */
  const restarted = withJsonRequests(createAjoopBridge({
    config: { ...CONFIG, rateMax: 3, rateWindowMs: 60000 },
    fetchImpl: okOllama("ok"),
    now: () => clock,
  }));
  const afterRestart = await restarted.handle({ method: "POST", origin: ORIGIN, body: generateBody() });
  check("the rate guard does not persist across restarts", afterRestart.status, 200);

  /* Health is not generation and must not be spent on the generation budget. */
  const healthBridge = withJsonRequests(createAjoopBridge({
    config: { ...CONFIG, rateMax: 1, rateWindowMs: 60000 },
    fetchImpl: okOllama("ok"),
    now: () => clock,
  }));
  for (let index = 0; index < 5; index += 1) {
    const result = await healthBridge.handle({ method: "POST", origin: ORIGIN, body: healthBody });
    check(`health probe ${index + 1} is never rate limited`, result.status, 200);
  }
}

/* ---------- failure bodies stay bounded and generic ---------- */

{
  const bridge = bridgeWith(okOllama("ok"));
  const bodies = [
    await bridge.handle({ method: "GET", origin: ORIGIN, body: "" }),
    await bridge.handle({ method: "POST", origin: ORIGIN, body: "{" }),
    await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody({ locale: "zz" }) }),
    await bridge.handle({ method: "POST", origin: "https://evil.example", body: healthBody }),
  ];
  for (const result of bodies) {
    const serialized = JSON.stringify(result.body);
    check("a failure body reports ok:false", result.body.ok, false);
    check("a failure body has exactly ok and error", Object.keys(result.body).sort().join(","), "error,ok");
    ok("a failure body carries no stack trace", !/\bat \w+ \(/.test(serialized));
    ok("a failure body carries no local path", !/[A-Za-z]:\\|\/home\/|\/Users\//.test(serialized));
    ok("a failure body leaks no Ollama URL", !serialized.includes("11434"));
    ok("a failure reason is short", String(result.body.error).length <= 48);
  }
}

/* ---------- browser bridge: deterministic-first and current-turn safety ---------- */

{
  const config = {
    enabled: true,
    endpoint: "https://ai.example/ajoop",
    timeoutMs: 30,
    retryAfterMs: 60000,
  };
  const browser = createBrowserBridge(config);

  browser.resetAjoopAiState();
  const busyTurn = browser.beginAjoopAiTurn();
  const busy = await browser.requestAjoopAiResponse({
    config,
    turn: busyTurn,
    payload: {},
    fetchImpl: async () => browserResponse(429, { ok: false, error: "busy" }),
  });
  check("browser treats 429 as a busy turn", busy.reason, "busy");
  check("browser keeps the bridge available after 429", browser.getAjoopAiState().state, "available");
  check("browser does not count 429 as a genuine failure", browser.getAjoopAiState().turnFailures, 0);

  browser.resetAjoopAiState();
  for (let index = 0; index < 3; index += 1) {
    const turn = browser.beginAjoopAiTurn();
    await browser.requestAjoopAiResponse({
      config,
      turn,
      payload: {},
      fetchImpl: async () => browserResponse(502, { ok: false, error: "model unavailable" }),
    });
  }
  check("three genuine browser failures mark the bridge unavailable",
    browser.getAjoopAiState().state, "unavailable");
  check("genuine browser failures are counted", browser.getAjoopAiState().turnFailures, 3);

  browser.resetAjoopAiState();
  let releaseStale;
  const staleTurn = browser.beginAjoopAiTurn();
  const staleRequest = browser.requestAjoopAiResponse({
    config,
    turn: staleTurn,
    payload: {},
    fetchImpl: async () =>
      new Promise((resolve) => {
        releaseStale = () => resolve(browserResponse(200, { ok: true, answer: "old answer" }));
      }),
  });
  await Promise.resolve();
  const currentTurn = browser.beginAjoopAiTurn();
  releaseStale();
  const stale = await staleRequest;
  check("a superseded browser reply is rejected as stale", stale.reason, "stale");
  ok("the newer browser turn remains current", browser.isAjoopAiTurnCurrent(currentTurn));
  check("a stale reply does not increment failures", browser.getAjoopAiState().turnFailures, 0);

  browser.resetAjoopAiState();
  const timeoutTurn = browser.beginAjoopAiTurn();
  const timeout = await browser.requestAjoopAiResponse({
    config: { ...config, timeoutMs: 10 },
    turn: timeoutTurn,
    payload: {},
    fetchImpl: async (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  });
  check("a browser timeout keeps the deterministic fallback", timeout.reason, "timeout");
  check("one browser timeout does not prematurely mark the bridge unavailable",
    browser.getAjoopAiState().state, "unknown");

  browser.resetAjoopAiState();
  const unavailable = await browser.checkAjoopAiHealth({
    config,
    force: true,
    fetchImpl: async () => browserResponse(503, { ok: false, error: "model unavailable" }),
  });
  check("a failed model health probe marks the browser bridge unavailable", unavailable, "unavailable");
  const available = await browser.checkAjoopAiHealth({
    config,
    force: true,
    fetchImpl: async () => browserResponse(200, { ok: true, model: "qwen3:4b" }),
  });
  check("a later healthy probe restores browser availability", available, "available");
}

{
  const assistant = readFileSync(new URL("../js/ajoop/assistant.js", import.meta.url), "utf8");
  const openAt = assistant.indexOf("const node = openAjoopTurn(language);");
  const commitAt = assistant.indexOf("finishAjoopTurn({ node, route, plan, model, language,");
  ok("a turn opens one container before it asks for an answer", openAt >= 0 && commitAt > openAt);
  ok("the deterministic plan and the model answer are awaited together",
    /Promise\.all\(\[\s*planAjoopTurn\(/.test(assistant));
  ok("the turn commits into the container it opened",
    /if \(node && node\.isConnected\) \{\s*node\.classList\.remove\("is-pending"\)/.test(assistant));
  ok("AI prose is inserted as text rather than markup",
    assistant.includes("text.textContent = spec.text") && !/innerHTML/.test(assistant.slice(
      assistant.indexOf("function fillAjoopMessage("),
      assistant.indexOf("function renderAjoopMessage("),
    )));
  const ragClient = readFileSync(new URL("../js/ajoop/rag-client.js", import.meta.url), "utf8");
  ok("the RAG turn source owns no DOM", !/\bdocument\.|\.innerHTML\b/.test(ragClient));
  ok("the RAG turn source reuses the one bridge transport",
    ragClient.includes("requestAjoopAiResponse({") && ragClient.includes("validate: validateAjoopRagResponse"));

  /* The history must follow the conversation the visitor SAW. Writing it in
   * the transport recorded only the turns the bridge answered, so a
   * deterministic fallback left the next question without its subject. */
  const requestTurn = ragClient.slice(ragClient.indexOf("function requestAjoopRagTurn("));
  ok("the transport writes no conversation history of its own",
    !requestTurn.includes("ajoopRagRemember("));
  ok("history is recorded when a turn commits",
    /function finishAjoopTurn\(/.test(assistant) &&
    assistant.indexOf("rememberAjoopRagExchange({") > assistant.indexOf("function finishAjoopTurn("));
  ok("the committed answer is what gets remembered",
    assistant.includes("rememberAjoopRagExchange({ route, question, language, answer: spec.text })"));

  /* A language change replaces the transcript, so it must end the turn behind
   * it through the SAME invalidation Start over uses — otherwise a reply still
   * in flight commits into the fresh transcript and refills the cleared
   * history. */
  ok("one helper ends the conversation in progress",
    /function endAjoopConversationTurn\(\)\s*\{[\s\S]*?beginAjoopAiTurn\(\)[\s\S]*?clearAjoopRagHistory[\s\S]*?setAjoopTurnBusy\(false\)[\s\S]*?setAjoopMascotState\(/.test(assistant));
  for (const caller of ["resetAjoopConversation", "updatePortfolioChatbotLanguage"]) {
    const start = assistant.indexOf(`function ${caller}(`);
    const body = assistant.slice(start, assistant.indexOf("\n}", start));
    ok(`${caller} ends the turn in progress`, body.includes("endAjoopConversationTurn()"));
    ok(`${caller} does not clear history without invalidating`,
      !body.includes("clearAjoopRagHistory"));
  }
}

/* ---------- the RAG warm-up must warm the runner RAG actually uses ---------- */

{
  const { AJOOP_RAG_GENERATION } = await import("../server/ajoop-rag.mjs");
  check("RAG generation context", AJOOP_RAG_GENERATION.options.num_ctx, 4096);
  check("RAG generation prediction budget", AJOOP_RAG_GENERATION.options.num_predict, 260);
  check("RAG generation temperature", AJOOP_RAG_GENERATION.options.temperature, 0.15);
  check("RAG generation reasoning", AJOOP_RAG_GENERATION.think, false);
  check("RAG generation keep_alive", AJOOP_RAG_GENERATION.keep_alive, -1);

  const ragSource = readFileSync(new URL("../server/ajoop-rag.mjs", import.meta.url), "utf8");
  const bridgeSource = readFileSync(new URL("../server/ajoop-bridge.mjs", import.meta.url), "utf8");
  ok("the RAG generator uses the shared shape", ragSource.includes("...AJOOP_RAG_GENERATION"));
  /* Ollama sets a runner up per context size: warming one shape and serving
   * another warms the wrong runner and hands the first visitor the bill. */
  const prewarm = bridgeSource.slice(
    bridgeSource.indexOf("async function prewarmRagModel()"),
    bridgeSource.indexOf("async function start()"),
  );
  ok("the RAG warm-up uses the shared shape", prewarm.includes("...AJOOP_RAG_GENERATION"));
  ok("the RAG warm-up declares no competing options", !/num_ctx|num_predict/.test(prewarm));
  /* The legacy /ajoop warm-up is a different, deliberately smaller runner. */
  const legacy = bridgeSource.slice(
    bridgeSource.indexOf("async function prewarmModel()"),
    bridgeSource.indexOf("async function prewarmRagModel()"),
  );
  ok("the legacy warm path keeps its own shape", /num_ctx: 1024/.test(legacy));
  ok("browser transport owns no DOM", !/\bdocument\.|\.innerHTML\b/.test(browserBridgeSource.slice(browserBridgeStart, browserBridgeEnd)));
}

/* ---------- the bridge must not log request content ---------- */

{
  const captured = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"]) {
    console[level] = (...args) => captured.push(args.map(String).join(" "));
  }
  try {
    const bridge = bridgeWith(okOllama("A grounded sentence about the lab."));
    const secret = "MARKER-does-kaan-know-kubernetes";
    await bridge.handle({ method: "POST", origin: ORIGIN, body: generateBody({ question: secret }) });
    await bridge.handle({ method: "POST", origin: ORIGIN, body: "{broken" });
    await bridge.handle({ method: "POST", origin: "https://evil.example", body: generateBody({ question: secret }) });
    const transcript = captured.join("\n");
    ok("the question is never logged", !transcript.includes("MARKER"));
    ok("the evidence is never logged", !transcript.includes("SINAMA — AI Agent Reliability Lab"));
    ok("the model answer is never logged", !transcript.includes("A grounded sentence"));
    ok("the prompt is never logged", !transcript.includes("You are Ajoop"));
  } finally {
    Object.assign(console, original);
  }
}

/* ---------- the core keeps no request state ---------- */

{
  const source = readFileSync(new URL("../server/ajoop-bridge-core.mjs", import.meta.url), "utf8");
  ok("the core writes no files", !/writeFile|appendFile|createWriteStream/.test(source));
  ok("the core opens no database", !/sqlite|better-sqlite|mongodb|redis|pg\b/i.test(source));
  ok("the core imports nothing outside node builtins", !/^import .* from "(?!node:)[^.]/m.test(source));

  const serverPath = new URL("../server/ajoop-bridge.mjs", import.meta.url);
  const server = readFileSync(serverPath, "utf8");
  ok("the server writes no files", !/writeFile|appendFile|createWriteStream/.test(server));
  ok("the server imports only node builtins and the core", !/from "(?!node:|\.\/)/.test(server));

  /* qa:js parses the browser bundle, which this file is deliberately not part
   * of, and importing it here would bind a port. `node --check` is the cheap
   * way to keep the entry point from being the one unparsed file in the repo. */
  const { execFileSync } = await import("node:child_process");
  let parses = true;
  try {
    execFileSync(process.execPath, ["--check", fileURLToPath(serverPath)], { stdio: "pipe" });
  } catch (error) {
    parses = false;
  }
  ok("the server entry point parses", parses);
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop bridge: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(`Ajoop bridge contracts passed. ${passed} assertions · no network, no Ollama, no disk.`);
