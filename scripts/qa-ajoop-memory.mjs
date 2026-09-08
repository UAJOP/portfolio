#!/usr/bin/env node
import {
  AJOOP_MEMORY_AUDIENCES,
  AJOOP_MEMORY_AUTHORITIES,
  AJOOP_MEMORY_KINDS,
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
  audience: AJOOP_MEMORY_AUDIENCES.OWNER_ONLY,
  consent: "explicit",
  provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
  sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
  tags: ["workflow", "Live Ops", "workflow"],
});

{
  const result = evaluateAjoopMemoryWrite(base, { now: NOW });
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

for (const [label, patch, code] of [
  ["non-object candidates are rejected", null, "invalid-candidate"],
  ["public audience is rejected", { audience: "public" }, "owner-only-required"],
  ["implicit consent is rejected", { consent: "implicit" }, "explicit-consent-required"],
  ["derived provenance is not writable", { provenance: AJOOP_MEMORY_PROVENANCE.DERIVED }, "provenance-not-writable"],
  ["connected-source provenance is not writable yet", { provenance: AJOOP_MEMORY_PROVENANCE.CONNECTED_SOURCE }, "provenance-not-writable"],
  ["sensitive memory is rejected", { sensitivity: AJOOP_MEMORY_SENSITIVITY.SENSITIVE }, "sensitive-memory-forbidden"],
  ["secret memory is rejected", { sensitivity: AJOOP_MEMORY_SENSITIVITY.SECRET }, "sensitive-memory-forbidden"],
  ["unknown kinds are rejected", { kind: "misc" }, "invalid-kind"],
  ["empty text is rejected", { text: "   " }, "empty-memory"],
  ["overlong memory is rejected", { text: "x".repeat(AJOOP_MEMORY_MAX_TEXT_CHARS + 1) }, "memory-too-long"],
]) {
  const candidate = patch === null ? null : { ...base, ...patch };
  check(label, evaluateAjoopMemoryWrite(candidate, { now: NOW }).code, code);
}

for (const field of ["messages", "history", "transcript", "question", "answer", "raw"]) {
  const result = evaluateAjoopMemoryWrite({ ...base, [field]: [] }, { now: NOW });
  check(`raw conversation field ${field} is forbidden`, result.code, "raw-conversation-forbidden");
}

{
  const tags = Array.from({ length: AJOOP_MEMORY_MAX_TAGS + 4 }, (_, index) => `Tag-${index}`);
  const result = evaluateAjoopMemoryWrite({ ...base, tags }, { now: NOW });
  check("tags are hard bounded", result.record.tags.length, AJOOP_MEMORY_MAX_TAGS);
}

for (const kind of Object.values(AJOOP_MEMORY_KINDS)) {
  const result = evaluateAjoopMemoryWrite({ ...base, kind }, { now: NOW });
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
  const result = evaluateAjoopMemoryWrite(base, { now: NOW });
  check("memory is active before expiry", isAjoopMemoryRecordActive(result.record, { now: NOW + 1000 }), true);
  check("memory expires exactly at its boundary", isAjoopMemoryRecordActive(result.record, { now: Date.parse(result.record.expiresAt) }), false);
  check("expired memory stays inactive", isAjoopMemoryRecordActive(result.record, { now: Date.parse(result.record.expiresAt) + 1 }), false);
  check("wrong schema records are inactive", isAjoopMemoryRecordActive({ ...result.record, version: 999 }, { now: NOW }), false);
  check("non-owner records are inactive", isAjoopMemoryRecordActive({ ...result.record, audience: "public" }, { now: NOW }), false);
  check("non-advisory records are inactive", isAjoopMemoryRecordActive({ ...result.record, authority: "authoritative" }, { now: NOW }), false);
}

if (failures.length) {
  console.error(`Ajoop memory contract QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop memory contract passed. ${passed} assertions · owner-only · explicit writes · no transcripts · no sensitive memory · no persistence.`,
);
