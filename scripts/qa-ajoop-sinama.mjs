#!/usr/bin/env node
import { createAjoopSinamaAdapter } from "../server/ajoop-sinama.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, value) => check(label, Boolean(value), true);

const requests = [];
const makeRag = (response = null) => ({
  config: { maxQuestionChars: 500 },
  async handle(request) {
    const payload = JSON.parse(request.body);
    requests.push({ request, payload });
    if (typeof response === "function") return response(payload);
    return response || {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { ok: true, answer: `reply:${payload.question}` },
    };
  },
});

const jsonRequest = (conversationId, message, extra = {}) => ({
  method: "POST",
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify({ conversation_id: conversationId, message }),
  ...extra,
});

{
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({ rag: makeRag(), scheduleCleanup: false });
  check("public path is /sinama", adapter.path, "/sinama");
  const result = await adapter.handle(jsonRequest("abc-123", "SINAMA nedir?"));
  check("valid request returns 200", result.status, 200);
  check("response message maps the RAG answer", result.body.message, "reply:SINAMA nedir?");
  ok("tool_events is an array", Array.isArray(result.body.tool_events));
  check("tool_events is honestly empty", result.body.tool_events.length, 0);
  check("one RAG call is made", requests.length, 1);
  check("RAG protocol version is preserved", requests[0].payload.version, 1);
  check("RAG mode is preserved", requests[0].payload.mode, "rag");
  check("message maps to question", requests[0].payload.question, "SINAMA nedir?");
  check("MVP locale is Turkish", requests[0].payload.locale, "tr");
  check("first turn has no prior history", requests[0].payload.history.length, 0);
  check("adapter calls RAG without a browser Origin", requests[0].request.origin, "");
  adapter.close();
}

{
  const adapter = createAjoopSinamaAdapter({ rag: makeRag(), scheduleCleanup: false });
  check("GET is rejected", (await adapter.handle({ method: "GET" })).status, 405);
  check("non-JSON is rejected", (await adapter.handle({ method: "POST", contentType: "text/plain", body: "{}" })).status, 415);
  check("malformed JSON is rejected", (await adapter.handle({ method: "POST", contentType: "application/json", body: "{" })).status, 400);
  check("missing conversation id is rejected", (await adapter.handle(jsonRequest("", "hello"))).body.error, "invalid conversation_id");
  check("unsafe conversation id is rejected", (await adapter.handle(jsonRequest("a/b", "hello"))).body.error, "invalid conversation_id");
  check("missing message is rejected", (await adapter.handle(jsonRequest("abc", ""))).body.error, "missing message");
  check("message over RAG cap is rejected", (await adapter.handle(jsonRequest("abc", "x".repeat(501)))).body.error, "message too long");
  adapter.close();
}

{
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({ rag: makeRag(), scheduleCleanup: false });
  await adapter.handle(jsonRequest("same", "turn one"));
  await adapter.handle(jsonRequest("same", "turn two"));
  check("second turn gets two history items", requests[1].payload.history.length, 2);
  check("history keeps first user turn", requests[1].payload.history[0].content, "turn one");
  check("history keeps first assistant turn", requests[1].payload.history[1].content, "reply:turn one");
  await adapter.handle(jsonRequest("other", "separate"));
  check("different conversation starts clean", requests[2].payload.history.length, 0);
  adapter.close();
}

{
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({
    rag: makeRag(),
    config: { maxHistoryItems: 6 },
    scheduleCleanup: false,
  });
  for (let index = 1; index <= 6; index += 1) {
    await adapter.handle(jsonRequest("bounded", `turn ${index}`));
  }
  check("history sent to RAG is bounded to six items", requests.at(-1).payload.history.length, 6);
  check("oldest retained item is recent", requests.at(-1).payload.history[0].content, "turn 3");
  adapter.close();
}

{
  let clock = 1000;
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({
    rag: makeRag(),
    now: () => clock,
    config: { ttlMs: 1000 },
    scheduleCleanup: false,
  });
  await adapter.handle(jsonRequest("ttl", "before expiry"));
  check("session exists before expiry", adapter.status().sessions, 1);
  clock = 2501;
  await adapter.handle(jsonRequest("fresh", "trigger cleanup"));
  check("expired session is removed lazily as well as by timer", adapter.status().sessions, 1);
  await adapter.handle(jsonRequest("ttl", "after expiry"));
  check("expired conversation restarts without history", requests.at(-1).payload.history.length, 0);
  adapter.close();
}

{
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({
    rag: makeRag(),
    config: { maxSessions: 2 },
    scheduleCleanup: false,
  });
  await adapter.handle(jsonRequest("one", "1"));
  await adapter.handle(jsonRequest("two", "2"));
  await adapter.handle(jsonRequest("three", "3"));
  check("session count never exceeds cap", adapter.status().sessions, 2);
  await adapter.handle(jsonRequest("one", "1 again"));
  check("oldest evicted session restarts clean", requests.at(-1).payload.history.length, 0);
  adapter.close();
}

{
  const failingRag = makeRag(() => ({
    status: 503,
    headers: {},
    body: { ok: false, error: "rag unavailable", stack: "SECRET STACK" },
  }));
  const adapter = createAjoopSinamaAdapter({ rag: failingRag, scheduleCleanup: false });
  const result = await adapter.handle(jsonRequest("failure", "hello"));
  check("upstream failure is sanitized", result.status, 503);
  check("sanitized error is stable", result.body.error, "agent unavailable");
  ok("internal upstream error is not leaked", !JSON.stringify(result.body).includes("rag unavailable"));
  ok("stack trace is not leaked", !JSON.stringify(result.body).includes("SECRET STACK"));
  check("failed turn is not persisted", adapter.status().sessions, 0);
  adapter.close();
}

{
  requests.length = 0;
  const adapter = createAjoopSinamaAdapter({ rag: makeRag(), scheduleCleanup: false });
  const result = await adapter.handle(jsonRequest("connection-test", "SINAMA connection test"));
  check("SINAMA connection-test message is accepted", result.status, 200);
  check("connection-test message reaches RAG unchanged", requests[0].payload.question, "SINAMA connection test");
  adapter.close();
}

{
  requests.length = 0;
  const rag = makeRag(() => ({
    status: 200,
    headers: {},
    body: { ok: true, answer: "SCOPE: PORTFOLIO ANSWER: temiz cevap", sources: [{ private: true }] },
  }));
  const adapter = createAjoopSinamaAdapter({ rag, scheduleCleanup: false });
  const result = await adapter.handle(jsonRequest("shape", "hello"));
  check("defensive scope marker is stripped", result.body.message, "temiz cevap");
  check("response exposes exactly two SINAMA fields", Object.keys(result.body).sort().join(","), "message,tool_events");
  adapter.close();
}

if (failures.length) {
  console.error(`AJOOP ↔ SINAMA QA failed (${failures.length} failure(s), ${passed} passed):`);
  failures.forEach((failure) => console.error(`\n${failure}`));
  process.exit(1);
}
console.log(`AJOOP ↔ SINAMA QA passed: ${passed} assertions`);
