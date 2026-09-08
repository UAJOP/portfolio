#!/usr/bin/env node
import {
  AJOOP_MEMORY_AUDIENCES,
  AJOOP_MEMORY_AUTHORITIES,
  AJOOP_MEMORY_KINDS,
  AJOOP_MEMORY_MAX_TAG_CHARS,
  AJOOP_MEMORY_MAX_TAGS,
  AJOOP_MEMORY_MAX_TEXT_CHARS,
  AJOOP_MEMORY_PROVENANCE,
  AJOOP_MEMORY_SCHEMA_VERSION,
  AJOOP_MEMORY_SENSITIVITY,
  AJOOP_MEMORY_SURFACES,
  AJOOP_MEMORY_TTL_DAYS,
  canUseAjoopMemory,
  evaluateAjoopMemoryWrite,
  isAjoopMemoryRecordActive,
  resolveAjoopMemoryAuthority,
} from "../server/ajoop-memory-contract.mjs";

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

const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const base = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PREFERENCE,
  text: "Prefer concise implementation steps during live operations.",
  tags: ["workflow", "Live Ops", "workflow"],
});
const writeContext = Object.freeze({
  now: NOW,
  surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
  consent: "explicit",
  provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
  sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
});
const evaluate = (candidate, patch = {}) => evaluateAjoopMemoryWrite(candidate, { ...writeContext, ...patch });

{
  const result = evaluate(base);
  ok("an explicit normal owner memory is accepted", result.ok);
  check("accepted record uses schema v1", result.record.version, AJOOP_MEMORY_SCHEMA_VERSION);
  check("memory is owner-only", result.record.audience, AJOOP_MEMORY_AUDIENCES.OWNER_ONLY);
  check("memory authority is advisory", result.record.authority, AJOOP_MEMORY_AUTHORITIES.ADVISORY);
  check("owner statement provenance is retained", result.record.provenance, AJOOP_MEMORY_PROVENANCE.OWNER_STATED);
  check("normal sensitivity is retained", result.record.sensitivity, AJOOP_MEMORY_SENSITIVITY.NORMAL);
  check("whitespace-normalized text is retained", result.record.text, base.text);
  check("tags are normalized and deduplicated", JSON.stringify(result.record.tags), JSON.stringify(["workflow", "live ops"]));
  check("preference expiry uses the fixed retention ceiling", result.record.expiresAt, "2027-09-08T00:00:00.000Z");
  ok("record is frozen", Object.isFrozen(result.record));
}

check("non-object candidates are rejected", evaluate(null).code, "invalid-candidate");
check("public surface cannot write even with owner auth", evaluate(base, { surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO }).code, "owner-private-auth-required");
check("private surface still requires owner auth", evaluate(base, { authenticatedOwner: false }).code, "owner-private-auth-required");
check("implicit consent is rejected", evaluate(base, { consent: "implicit" }).code, "explicit-consent-required");
check("missing consent is rejected", evaluate(base, { consent: undefined }).code, "explicit-consent-required");
check("derived provenance is not writable", evaluate(base, { provenance: AJOOP_MEMORY_PROVENANCE.DERIVED }).code, "provenance-not-writable");
check("connected-source provenance is not writable yet", evaluate(base, { provenance: AJOOP_MEMORY_PROVENANCE.CONNECTED_SOURCE }).code, "provenance-not-writable");
check("sensitive memory is rejected", evaluate(base, { sensitivity: AJOOP_MEMORY_SENSITIVITY.SENSITIVE }).code, "sensitive-memory-forbidden");
check("secret memory is rejected", evaluate(base, { sensitivity: AJOOP_MEMORY_SENSITIVITY.SECRET }).code, "sensitive-memory-forbidden");
check("unknown kinds are rejected", evaluate({ ...base, kind: "misc" }).code, "invalid-kind");
check("empty text is rejected", evaluate({ ...base, text: "   " }).code, "empty-memory");
check("overlong memory is rejected", evaluate({ ...base, text: "x".repeat(AJOOP_MEMORY_MAX_TEXT_CHARS + 1) }).code, "memory-too-long");

for (const field of ["messages", "history", "transcript", "question", "answer", "raw"]) {
  const result = evaluate({ ...base, [field]: [] });
  check(`raw conversation field ${field} is forbidden`, result.code, "raw-conversation-forbidden");
}

for (const field of ["version", "audience", "authority", "consent", "provenance", "sensitivity", "createdAt", "expiresAt"]) {
  const result = evaluate({ ...base, [field]: "caller-value" });
  check(`caller policy field ${field} is forbidden`, result.code, "caller-policy-field-forbidden");
}

{
  const tags = Array.from({ length: AJOOP_MEMORY_MAX_TAGS + 4 }, (_, index) => `Tag-${index}`);
  const result = evaluate({ ...base, tags });
  check("tags are hard bounded", result.record.tags.length, AJOOP_MEMORY_MAX_TAGS);
}

for (const kind of Object.values(AJOOP_MEMORY_KINDS)) {
  const result = evaluate({ ...base, kind });
  const expected = new Date(NOW + AJOOP_MEMORY_TTL_DAYS[kind] * 24 * 60 * 60 * 1000).toISOString();
  check(`${kind} uses its fixed ttl`, result.record.expiresAt, expected);
}

check(
  "public portfolio can never consume memory",
  canUseAjoopMemory({ surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO, authenticatedOwner: true }),
  false,
);
check(
  "private owner surface still requires authentication",
  canUseAjoopMemory({ surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE, authenticatedOwner: false }),
  false,
);
check(
  "authenticated private owner surface may consume memory",
  canUseAjoopMemory({ surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE, authenticatedOwner: true }),
  true,
);

check(
  "canonical portfolio fact outranks memory",
  resolveAjoopMemoryAuthority({ canonicalPortfolioFact: true }),
  AJOOP_MEMORY_AUTHORITIES.CANONICAL_PORTFOLIO,
);
check(
  "memory remains advisory when no canonical fact overlaps",
  resolveAjoopMemoryAuthority({ canonicalPortfolioFact: false }),
  AJOOP_MEMORY_AUTHORITIES.ADVISORY,
);

{
  const result = evaluate(base);
  const active = result.record;
  check("memory is active before expiry", isAjoopMemoryRecordActive(active, { now: NOW + 1000 }), true);
  check("memory expires exactly at its boundary", isAjoopMemoryRecordActive(active, { now: Date.parse(active.expiresAt) }), false);
  check("expired memory stays inactive", isAjoopMemoryRecordActive(active, { now: Date.parse(active.expiresAt) + 1 }), false);
  check("wrong schema records are inactive", isAjoopMemoryRecordActive({ ...active, version: 999 }, { now: NOW }), false);
  check("non-owner records are inactive", isAjoopMemoryRecordActive({ ...active, audience: "public" }, { now: NOW }), false);
  check("non-advisory records are inactive", isAjoopMemoryRecordActive({ ...active, authority: "authoritative" }, { now: NOW }), false);
  check("non-owner-stated records are inactive", isAjoopMemoryRecordActive({ ...active, provenance: AJOOP_MEMORY_PROVENANCE.DERIVED }, { now: NOW }), false);
  check("sensitive persisted records are inactive", isAjoopMemoryRecordActive({ ...active, sensitivity: AJOOP_MEMORY_SENSITIVITY.SENSITIVE }, { now: NOW }), false);
  check("overlong persisted text is inactive", isAjoopMemoryRecordActive({ ...active, text: "x".repeat(AJOOP_MEMORY_MAX_TEXT_CHARS + 1) }, { now: NOW }), false);
  check("non-normalized persisted text is inactive", isAjoopMemoryRecordActive({ ...active, text: ` ${active.text}` }, { now: NOW }), false);
  check("oversized persisted tags are inactive", isAjoopMemoryRecordActive({ ...active, tags: Array(AJOOP_MEMORY_MAX_TAGS + 1).fill("x") }, { now: NOW }), false);
  check("non-normalized persisted tags are inactive", isAjoopMemoryRecordActive({ ...active, tags: ["Workflow"] }, { now: NOW }), false);
  check("overlong persisted tag is inactive", isAjoopMemoryRecordActive({ ...active, tags: ["x".repeat(AJOOP_MEMORY_MAX_TAG_CHARS + 1)] }, { now: NOW }), false);
  check("duplicate persisted tags are inactive", isAjoopMemoryRecordActive({ ...active, tags: ["workflow", "workflow"] }, { now: NOW }), false);
  check("non-string persisted tags are inactive", isAjoopMemoryRecordActive({ ...active, tags: [42] }, { now: NOW }), false);
  check("missing createdAt is inactive", isAjoopMemoryRecordActive({ ...active, createdAt: undefined }, { now: NOW }), false);
  check("expiry before creation is inactive", isAjoopMemoryRecordActive({ ...active, expiresAt: new Date(NOW - 1).toISOString() }, { now: NOW }), false);
  check(
    "retention ceiling cannot be extended in persisted data",
    isAjoopMemoryRecordActive({ ...active, expiresAt: new Date(Date.parse(active.expiresAt) + 1).toISOString() }, { now: NOW }),
    false,
  );
}

if (failures.length) {
  console.error(`Ajoop memory contract QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop memory contract passed. ${passed} assertions · owner-private auth · explicit writes · no transcripts · no sensitive memory · bounded retention · no persistence.`,
);
