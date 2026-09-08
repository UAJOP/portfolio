import { foldQuestion, tokenize } from "./ajoop-text.mjs";
import {
  AJOOP_MEMORY_KINDS,
  AJOOP_MEMORY_AUTHORITIES,
} from "./ajoop-memory-contract.mjs";
import {
  AJOOP_MEMORY_LIST_MAX,
} from "./ajoop-memory-store.mjs";

export const AJOOP_MEMORY_RETRIEVAL_TOP_K = 4;
export const AJOOP_MEMORY_RETRIEVAL_MAX_TOP_K = 8;
export const AJOOP_MEMORY_RETRIEVAL_MAX_QUERY_CHARS = 600;

const KNOWN_KINDS = new Set(Object.values(AJOOP_MEMORY_KINDS));

/*
 * Retrieval ignores conversational glue and question words. This is a fixed,
 * language-level set, not a list of product facts or entity keywords. Keeping
 * these terms out prevents a memory from winning merely because both the query
 * and the stored sentence contain generic words such as "what", "my" or "bir".
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "about", "do", "does", "did", "for", "from",
  "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "this",
  "that", "to", "what", "when", "where", "which", "who", "why", "with", "you", "your",
  "ben", "benim", "bana", "beni", "bir", "bu", "icin", "ile", "kim", "mi", "mu",
  "mı", "mü", "nasil", "ne", "neden", "nedir", "neler", "nerede", "o", "sen",
  "senin", "su", "ve", "veya", "hangi",
]);

const cleanQuery = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const significantTerms = (value) => {
  const folded = foldQuestion(value);
  const terms = tokenize(folded).filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
  return [...new Set(terms)];
};

const normalizedTopK = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return AJOOP_MEMORY_RETRIEVAL_TOP_K;
  return Math.min(parsed, AJOOP_MEMORY_RETRIEVAL_MAX_TOP_K);
};

const normalizedTagTokens = (tags) => {
  const tokens = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    for (const token of significantTerms(tag)) tokens.add(token);
  }
  return tokens;
};

const scoreRecord = (record, queryTerms) => {
  const textTerms = new Set(significantTerms(record.text));
  const tagTerms = normalizedTagTokens(record.tags);
  const kindTerms = new Set(significantTerms(String(record.kind || "").replace(/-/g, " ")));

  let textHits = 0;
  let tagHits = 0;
  let kindHits = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) textHits += 1;
    if (tagTerms.has(term)) tagHits += 1;
    if (kindTerms.has(term)) kindHits += 1;
  }

  if (textHits === 0 && tagHits === 0 && kindHits === 0) return null;

  const queryCount = queryTerms.length;
  const covered = new Set();
  for (const term of queryTerms) {
    if (textTerms.has(term) || tagTerms.has(term) || kindTerms.has(term)) covered.add(term);
  }

  /*
   * Tags are curated, compact descriptors, so one tag hit is stronger than a
   * prose token hit. Kind is useful but intentionally weakest: asking about a
   * "decision" should not swamp a better text match. Full query coverage is a
   * small deterministic tie-break bonus, not semantic inference.
   */
  const score = (tagHits * 4) + (textHits * 2) + kindHits + (covered.size === queryCount ? 2 : 0);
  return Object.freeze({ score, textHits, tagHits, kindHits, covered: covered.size });
};

/**
 * Deterministically retrieve relevant owner memories from the local store.
 *
 * A3.3 remains deliberately pre-model and pre-HTTP. The store performs the
 * owner-private authorization and active-record validation; this layer only
 * ranks those already-eligible records. It never queries Qdrant, never embeds,
 * never reads public portfolio state, and never upgrades advisory memory into
 * canonical authority.
 */
export function retrieveAjoopMemory(
  store,
  {
    query,
    context = {},
    kind = null,
    topK = AJOOP_MEMORY_RETRIEVAL_TOP_K,
    at,
  } = {},
) {
  if (!store || typeof store.listActive !== "function") {
    throw new TypeError("AJOOP memory retrieval requires a memory store");
  }

  const cleaned = cleanQuery(query);
  if (!cleaned) return Object.freeze({ ok: false, code: "empty-query" });
  if (cleaned.length > AJOOP_MEMORY_RETRIEVAL_MAX_QUERY_CHARS) {
    return Object.freeze({ ok: false, code: "query-too-long" });
  }
  if (kind !== null && !KNOWN_KINDS.has(kind)) {
    return Object.freeze({ ok: false, code: "invalid-kind" });
  }

  const queryTerms = significantTerms(cleaned);
  if (!queryTerms.length) {
    return Object.freeze({ ok: true, code: "retrieved", records: Object.freeze([]) });
  }

  const listing = store.listActive({
    context,
    kind,
    limit: AJOOP_MEMORY_LIST_MAX,
    ...(at === undefined ? {} : { at }),
  });
  if (!listing.ok) return listing;

  const limit = normalizedTopK(topK);
  const ranked = listing.records
    .map((record) => ({ record, match: scoreRecord(record, queryTerms) }))
    .filter((entry) => entry.match)
    .sort((left, right) => {
      if (right.match.score !== left.match.score) return right.match.score - left.match.score;
      if (right.match.covered !== left.match.covered) return right.match.covered - left.match.covered;
      const timeOrder = Date.parse(right.record.createdAt) - Date.parse(left.record.createdAt);
      if (timeOrder !== 0) return timeOrder;
      return left.record.id.localeCompare(right.record.id);
    })
    .slice(0, limit)
    .map(({ record, match }) => Object.freeze({
      id: record.id,
      kind: record.kind,
      text: record.text,
      tags: Object.freeze([...record.tags]),
      authority: AJOOP_MEMORY_AUTHORITIES.ADVISORY,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      score: match.score,
    }));

  return Object.freeze({
    ok: true,
    code: "retrieved",
    records: Object.freeze(ranked),
  });
}
