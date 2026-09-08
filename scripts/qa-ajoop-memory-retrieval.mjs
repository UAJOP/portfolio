#!/usr/bin/env node
import {
  AJOOP_MEMORY_AUTHORITIES,
  AJOOP_MEMORY_KINDS,
  AJOOP_MEMORY_PROVENANCE,
  AJOOP_MEMORY_SENSITIVITY,
  AJOOP_MEMORY_SURFACES,
} from "../server/ajoop-memory-contract.mjs";
import { createAjoopMemoryStore } from "../server/ajoop-memory-store.mjs";
import {
  AJOOP_MEMORY_RETRIEVAL_MAX_QUERY_CHARS,
  AJOOP_MEMORY_RETRIEVAL_MAX_TOP_K,
  retrieveAjoopMemory,
} from "../server/ajoop-memory-retrieval.mjs";

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

const NOW = Date.parse("2026-09-08T01:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ownerContext = Object.freeze({
  surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
});
const writerContext = Object.freeze({
  ...ownerContext,
  now: NOW,
  consent: "explicit",
  provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
  sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
});

const store = createAjoopMemoryStore({ dbPath: ":memory:", now: () => NOW });
const write = (kind, text, tags) => store.write({ kind, text, tags }, writerContext);

const preference = write(
  AJOOP_MEMORY_KINDS.PREFERENCE,
  "Prefer concise implementation steps during live operations.",
  ["workflow", "live ops"],
);
const decision = write(
  AJOOP_MEMORY_KINDS.DECISION,
  "Use SQLite for AJOOP owner memory persistence.",
  ["ajoop", "memory", "sqlite"],
);
const project = write(
  AJOOP_MEMORY_KINDS.PROJECT_STATE,
  "SINAMA calibration is ready for the next evaluation pass.",
  ["sinama", "evaluation"],
);
const routine = write(
  AJOOP_MEMORY_KINDS.ROUTINE,
  "Review job applications every weekday morning.",
  ["career", "jobs"],
);
const technology = write(
  AJOOP_MEMORY_KINDS.PREFERENCE,
  "Prefer C# when an AJOOP desktop helper needs .NET integration.",
  ["c#", ".net", "ajoop"],
);

for (const [label, result] of [
  ["preference fixture stored", preference],
  ["decision fixture stored", decision],
  ["project-state fixture stored", project],
  ["routine fixture stored", routine],
  ["technology fixture stored", technology],
]) ok(label, result.ok);

{
  const result = retrieveAjoopMemory(store, {
    query: "live operations implementation steps",
    context: ownerContext,
  });
  ok("owner retrieval succeeds", result.ok);
  check("workflow preference ranks first", result.records[0]?.id, preference.id);
  check("retrieved authority remains advisory", result.records[0]?.authority, AJOOP_MEMORY_AUTHORITIES.ADVISORY);
  ok("positive lexical match exposes a score", result.records[0]?.score > 0);
  ok("retrieval result is frozen", Object.isFrozen(result.records));
}

{
  const result = retrieveAjoopMemory(store, {
    query: "AJOOP memory SQLite",
    context: ownerContext,
  });
  check("tag and text agreement ranks the persistence decision first", result.records[0]?.id, decision.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "workflow",
    context: ownerContext,
  });
  check("a tag-only query can retrieve the tagged preference", result.records[0]?.id, preference.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "SINAMA evaluation",
    context: ownerContext,
  });
  check("project-state text and tags retrieve SINAMA state", result.records[0]?.id, project.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "job applications morning",
    context: ownerContext,
  });
  check("routine wording retrieves the matching routine", result.records[0]?.id, routine.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "C# .NET",
    context: ownerContext,
  });
  check("technology punctuation survives shared AJOOP folding", result.records[0]?.id, technology.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "memory",
    context: ownerContext,
    kind: AJOOP_MEMORY_KINDS.DECISION,
  });
  check("kind filter keeps only decisions", result.records.length, 1);
  check("kind-filtered decision is correct", result.records[0]?.id, decision.id);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "favorite pasta recipe",
    context: ownerContext,
  });
  check("unrelated query retrieves nothing", result.records.length, 0);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "what is my",
    context: ownerContext,
  });
  check("question glue alone retrieves nothing", result.records.length, 0);
}

{
  const denied = retrieveAjoopMemory(store, {
    query: "AJOOP memory",
    context: { surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO, authenticatedOwner: true },
  });
  check("public portfolio cannot retrieve memory", denied.code, "owner-private-auth-required");

  const unauthenticated = retrieveAjoopMemory(store, {
    query: "AJOOP memory",
    context: { surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE, authenticatedOwner: false },
  });
  check("private surface still requires owner authentication", unauthenticated.code, "owner-private-auth-required");
}

{
  const result = retrieveAjoopMemory(store, {
    query: "SINAMA evaluation",
    context: ownerContext,
    at: NOW + (31 * DAY_MS),
  });
  check("expired project state is excluded before ranking", result.records.length, 0);
}

{
  const result = retrieveAjoopMemory(store, {
    query: "AJOOP",
    context: ownerContext,
    topK: 1,
  });
  check("explicit topK bounds results", result.records.length, 1);

  const capped = retrieveAjoopMemory(store, {
    query: "AJOOP",
    context: ownerContext,
    topK: 999,
  });
  ok("oversized topK is capped", capped.records.length <= AJOOP_MEMORY_RETRIEVAL_MAX_TOP_K);
}

check("empty query fails closed", retrieveAjoopMemory(store, { query: "   ", context: ownerContext }).code, "empty-query");
check(
  "overlong query fails closed",
  retrieveAjoopMemory(store, { query: "x".repeat(AJOOP_MEMORY_RETRIEVAL_MAX_QUERY_CHARS + 1), context: ownerContext }).code,
  "query-too-long",
);
check(
  "invalid kind fails closed",
  retrieveAjoopMemory(store, { query: "memory", context: ownerContext, kind: "misc" }).code,
  "invalid-kind",
);

let badStoreError = "";
try {
  retrieveAjoopMemory(null, { query: "memory", context: ownerContext });
} catch (error) {
  badStoreError = error instanceof TypeError ? error.message : "wrong-error";
}
ok("retrieval rejects a missing store", badStoreError.includes("requires a memory store"));

store.close();

if (failures.length) {
  console.error(`Ajoop memory retrieval QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop memory retrieval passed. ${passed} assertions · owner-private · deterministic lexical ranking · bounded top-K · active-only · advisory authority · no model, no HTTP, no Qdrant.`,
);
