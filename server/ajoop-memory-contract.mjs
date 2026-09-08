/**
 * AJOOP long-term memory contract — policy only, no persistence.
 *
 * AJOOP currently serves a public portfolio endpoint, while long-term memory is
 * personal state. Those are different trust domains. This module makes the
 * boundary explicit before a store exists so later persistence cannot quietly
 * turn private owner context into public website context.
 *
 * V1 rules:
 * - memory is owner-only and advisory;
 * - the public portfolio surface may never read or write it;
 * - raw conversation/transcript material is never a memory record;
 * - only an explicit owner statement may become persistent memory;
 * - sensitive or secret material is ineligible;
 * - canonical portfolio data outranks memory on overlapping facts;
 * - every record expires unless refreshed by a future, explicit write path.
 *
 * This module deliberately has no filesystem, database, network, model or
 * environment access. It only decides whether a proposed record satisfies the
 * contract and whether a runtime surface is allowed to consume memory at all.
 */

export const AJOOP_MEMORY_SCHEMA_VERSION = 1;

export const AJOOP_MEMORY_AUDIENCES = Object.freeze({
  OWNER_ONLY: "owner-only",
});

export const AJOOP_MEMORY_AUTHORITIES = Object.freeze({
  ADVISORY: "advisory",
  CANONICAL_PORTFOLIO: "canonical-portfolio",
});

export const AJOOP_MEMORY_PROVENANCE = Object.freeze({
  OWNER_STATED: "owner-stated",
  CONNECTED_SOURCE: "connected-source",
  DERIVED: "derived",
});

export const AJOOP_MEMORY_SENSITIVITY = Object.freeze({
  NORMAL: "normal",
  SENSITIVE: "sensitive",
  SECRET: "secret",
});

export const AJOOP_MEMORY_KINDS = Object.freeze({
  PREFERENCE: "preference",
  DECISION: "decision",
  PROJECT_STATE: "project-state",
  ROUTINE: "routine",
  STABLE_FACT: "stable-fact",
});

export const AJOOP_MEMORY_SURFACES = Object.freeze({
  PUBLIC_PORTFOLIO: "public-portfolio",
  OWNER_PRIVATE: "owner-private",
});

export const AJOOP_MEMORY_MAX_TEXT_CHARS = 600;
export const AJOOP_MEMORY_MAX_TAGS = 8;
export const AJOOP_MEMORY_MAX_TAG_CHARS = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed retention ceilings. The future store may delete earlier, never later. */
export const AJOOP_MEMORY_TTL_DAYS = Object.freeze({
  [AJOOP_MEMORY_KINDS.PREFERENCE]: 365,
  [AJOOP_MEMORY_KINDS.DECISION]: 180,
  [AJOOP_MEMORY_KINDS.PROJECT_STATE]: 30,
  [AJOOP_MEMORY_KINDS.ROUTINE]: 90,
  [AJOOP_MEMORY_KINDS.STABLE_FACT]: 365,
});

const RAW_TRANSCRIPT_FIELDS = Object.freeze([
  "messages",
  "history",
  "transcript",
  "question",
  "answer",
  "raw",
]);

const cleanText = (value, max = AJOOP_MEMORY_MAX_TEXT_CHARS) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const cleanTags = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const entry of value) {
    const tag = cleanText(entry, AJOOP_MEMORY_MAX_TAG_CHARS).toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= AJOOP_MEMORY_MAX_TAGS) break;
  }
  return tags;
};

const isKnownKind = (value) => Object.values(AJOOP_MEMORY_KINDS).includes(value);

/**
 * The public portfolio route is never a memory surface, even if a caller claims
 * to be the owner. Authentication belongs at the owner-private boundary; it is
 * not a flag that can upgrade a public route into a private one.
 */
export function canUseAjoopMemory({ surface, authenticatedOwner = false } = {}) {
  return surface === AJOOP_MEMORY_SURFACES.OWNER_PRIVATE && authenticatedOwner === true;
}

/** Canonical portfolio records always win when the same fact exists in both. */
export function resolveAjoopMemoryAuthority({ canonicalPortfolioFact = false } = {}) {
  return canonicalPortfolioFact
    ? AJOOP_MEMORY_AUTHORITIES.CANONICAL_PORTFOLIO
    : AJOOP_MEMORY_AUTHORITIES.ADVISORY;
}

/**
 * Validate and normalize one proposed persistent memory record.
 *
 * A3.1 intentionally accepts only explicit owner statements. Connected-source
 * and derived memories are reserved enum values so later phases can add them
 * without inventing a second schema, but they are not writable yet.
 */
export function evaluateAjoopMemoryWrite(candidate, { now = Date.now() } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return Object.freeze({ ok: false, code: "invalid-candidate" });
  }

  if (RAW_TRANSCRIPT_FIELDS.some((field) => Object.hasOwn(candidate, field))) {
    return Object.freeze({ ok: false, code: "raw-conversation-forbidden" });
  }

  if (candidate.audience !== AJOOP_MEMORY_AUDIENCES.OWNER_ONLY) {
    return Object.freeze({ ok: false, code: "owner-only-required" });
  }

  if (candidate.consent !== "explicit") {
    return Object.freeze({ ok: false, code: "explicit-consent-required" });
  }

  if (candidate.provenance !== AJOOP_MEMORY_PROVENANCE.OWNER_STATED) {
    return Object.freeze({ ok: false, code: "provenance-not-writable" });
  }

  if (candidate.sensitivity !== AJOOP_MEMORY_SENSITIVITY.NORMAL) {
    return Object.freeze({ ok: false, code: "sensitive-memory-forbidden" });
  }

  if (!isKnownKind(candidate.kind)) {
    return Object.freeze({ ok: false, code: "invalid-kind" });
  }

  const text = cleanText(candidate.text);
  if (!text) return Object.freeze({ ok: false, code: "empty-memory" });
  if (typeof candidate.text !== "string" || candidate.text.replace(/\s+/g, " ").trim().length > AJOOP_MEMORY_MAX_TEXT_CHARS) {
    return Object.freeze({ ok: false, code: "memory-too-long" });
  }

  const createdAtMs = Number(now);
  if (!Number.isFinite(createdAtMs)) {
    return Object.freeze({ ok: false, code: "invalid-clock" });
  }
  const ttlDays = AJOOP_MEMORY_TTL_DAYS[candidate.kind];

  return Object.freeze({
    ok: true,
    code: "accepted",
    record: Object.freeze({
      version: AJOOP_MEMORY_SCHEMA_VERSION,
      kind: candidate.kind,
      text,
      audience: AJOOP_MEMORY_AUDIENCES.OWNER_ONLY,
      authority: AJOOP_MEMORY_AUTHORITIES.ADVISORY,
      provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
      sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
      tags: Object.freeze(cleanTags(candidate.tags)),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + ttlDays * DAY_MS).toISOString(),
    }),
  });
}

export function isAjoopMemoryRecordActive(record, { now = Date.now() } = {}) {
  if (!record || typeof record !== "object") return false;
  if (record.version !== AJOOP_MEMORY_SCHEMA_VERSION) return false;
  if (record.audience !== AJOOP_MEMORY_AUDIENCES.OWNER_ONLY) return false;
  if (record.authority !== AJOOP_MEMORY_AUTHORITIES.ADVISORY) return false;
  if (record.sensitivity !== AJOOP_MEMORY_SENSITIVITY.NORMAL) return false;
  if (!isKnownKind(record.kind)) return false;
  if (!cleanText(record.text)) return false;
  const expiresAt = Date.parse(record.expiresAt);
  const current = Number(now);
  return Number.isFinite(expiresAt) && Number.isFinite(current) && expiresAt > current;
}
