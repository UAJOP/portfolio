/**
 * The Phase 1 read-only skills: three lookups over canonical Ajoop knowledge.
 *
 * THERE IS NO SECOND KNOWLEDGE BASE. Every fact these tools return is read at
 * call time from the records `loadMasterKnowledge()` produces — the same loader,
 * the same sanitizer, the same visibility tiers and the same alias table the
 * retrieval path uses. Nothing is copied into this file. That is not tidiness:
 * a tool that hard-coded a project's technology stack would keep repeating it
 * for exactly as long as it took the canonical data to change and nobody to
 * notice, and it would say it with the authority of a structured answer.
 *
 * PRIVACY IS INHERITED, NOT REIMPLEMENTED. `loadMasterKnowledge()` has already
 * deleted restricted material before these records exist, and this module
 * additionally drops the `public_on_request` tier — the same exclusion
 * server/ajoop-rag.mjs applies when it derives `retrievalIndex` from `index`.
 * So the contact-on-request record, which holds a phone number, is not
 * reachable through a tool for the same reason it is not reachable through
 * cosine similarity: it is not in the set being searched.
 *
 * Every tool is a pure function of the loaded corpus. No network, no
 * filesystem beyond the one startup read, no writes, no side effects.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterKnowledge } from "./ajoop-knowledge.mjs";
import { buildAliasIndex } from "./ajoop-entities.mjs";
import { foldQuestion } from "./ajoop-text.mjs";
import { TOOL_RISK_LEVELS, TOOL_SCOPES } from "./ajoop-tool-registry.mjs";
import { deepFreeze } from "./ajoop-tool-schema.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PORTFOLIO_DATA_DIR = resolve(MODULE_DIR, "..", "data", "portfolio");

/** Ordinary semantic reach. `public_on_request` is deliberately outside it. */
const isPublicSafe = (record) => record.visibility === "public";

/** A record id like `project:sinama` reduced to the slug half. */
const slugOf = (id) => String(id).split(":").slice(1).join(":") || String(id);

/**
 * The first line of a record's rendered text that reads as prose.
 *
 * Master records open with a sentence and then list labelled facts, so this
 * takes the sentence and leaves the labels to `details`, which are structured
 * and do not need to be re-parsed out of prose downstream.
 */
function summaryOf(record) {
  const lines = String(record.text || "").split("\n");
  const summary = lines.find((line) => line.trim() && !/^[A-Z][A-Za-z ]{2,24}:/.test(line.trim()));
  return (summary || lines[0] || "").trim().slice(0, 400);
}

/** A labelled fact from a record's text, when the canonical data carries one. */
function labelledLine(record, label) {
  const line = String(record.text || "")
    .split("\n")
    .find((item) => item.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return line ? line.slice(line.indexOf(":") + 1).trim().slice(0, 400) : null;
}

/**
 * Canonical links, filtered to real URLs.
 *
 * Mirrors the shape server/ajoop-answer.mjs already serialises for evidence, so
 * a tool result and an evidence item describe a link the same way.
 */
function linksOf(record) {
  const links = Array.isArray(record?.metadata?.links) ? record.metadata.links : [];
  return links
    .map((link) => ({ kind: String(link?.type || "link").slice(0, 32), url: String(link?.url || "").trim() }))
    .filter((link) => /^(?:https?:\/\/|mailto:)/i.test(link.url))
    .slice(0, 4);
}

/**
 * The corpus, loaded once and shared by every tool.
 *
 * Cached because a tool call must not become a filesystem read: in Phase 2 a
 * model may make three of these inside one visitor turn, and the corpus does
 * not change between them.
 */
let corpusPromise = null;

export function resetPortfolioToolCorpus() {
  corpusPromise = null;
}

/**
 * A deep, frozen copy of one canonical record, carrying only the fields a tool
 * may read.
 *
 * Copied rather than referenced so that nothing downstream — a tool, a caller,
 * a future Phase 2 consumer — can reach back and mutate the cached corpus.
 * Sharing the loader's own objects would mean one careless `record.metadata.x =`
 * silently rewrote what every later call sees.
 */
function publicView(record) {
  return deepFreeze({
    id: record.id,
    entityType: record.entityType,
    title: record.title,
    text: record.text,
    visibility: record.visibility,
    tags: [...(record.tags || [])],
    metadata: structuredClone(record.metadata ?? null),
  });
}

export async function loadPortfolioToolCorpus(dataDir = PORTFOLIO_DATA_DIR) {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      /**
       * `master` is loaded, read, and DELIBERATELY NOT RETURNED.
       *
       * It carries `public_on_request` records, the raw knowledge tree and the
       * loader's own mutable arrays. Handing that back — even for convenience —
       * would put the on-request tier one property access away from any caller
       * and make the public-safe boundary a matter of who remembered to filter.
       * It stays inside this closure; only the derived public view escapes.
       */
      const master = await loadMasterKnowledge(dataDir);
      const publicRecords = master.records.filter(isPublicSafe).map(publicView);
      const byId = new Map(publicRecords.map((record) => [record.id, record]));
      const aliasIndex = buildAliasIndex(master.knowledge);

      /**
       * Alias → canonical record, built from the SAME alias table retrieval
       * uses. A tool that recognised different spellings from the rest of Ajoop
       * would be a second entity system by another name.
       */
      const byAlias = new Map();
      for (const entity of aliasIndex.entities) {
        const folded = foldQuestion(entity.canonical);
        const match = publicRecords.find(
          (record) => foldQuestion(record.title).startsWith(folded) || foldQuestion(slugOf(record.id)) === folded,
        );
        if (!match) continue;
        for (const alias of [...entity.aliases, folded]) byAlias.set(alias, match.id);
      }

      /* The exported surface: lookups and an immutable record list. No master,
       * no raw knowledge, no mutable Map, no on-request record. */
      return Object.freeze({
        records: Object.freeze(publicRecords),
        byId: Object.freeze({ get: (key) => byId.get(key) || null, has: (key) => byId.has(key) }),
        byAlias: Object.freeze({ get: (key) => byAlias.get(key) || null }),
        publicRecordCount: publicRecords.length,
      });
    })().catch((error) => {
      /* A failed load must not be cached as a permanent failure: the next call
       * retries rather than inheriting one bad filesystem moment forever. */
      corpusPromise = null;
      throw error;
    });
  }
  return corpusPromise;
}

/**
 * The identity surface: "is this string a canonical public id, and of what".
 *
 * The narrowest thing a semantic validator needs, and deliberately nothing
 * more. It answers two closed questions about a string and returns no record,
 * no text, no metadata and no way to enumerate the corpus — so a caller holding
 * it can check an identifier and cannot read the portfolio.
 *
 * EXACT LOOKUP ONLY. There is no alias table here and no separator
 * normalisation, which is the whole point: `resolveRecord` exists to turn a
 * model's spelling into a record, and this exists to reject anything that is
 * not already the record's own id. An alias like `SINAMA` or `merge-rush` is a
 * legitimate tool INPUT and is not an identity — admitting one here would let a
 * model's spelling reach an evaluation harness as though it were canonical.
 *
 * Public-safe only, because it is derived from the same corpus the tools read:
 * `public_on_request` records are not in it, so an on-request id fails for the
 * same reason it is unreachable through a tool.
 */
export async function loadPortfolioEventIdentities(dataDir = PORTFOLIO_DATA_DIR) {
  const corpus = await loadPortfolioToolCorpus(dataDir);
  const typeOf = (id) => (typeof id === "string" ? corpus.byId.get(id)?.entityType || null : null);
  return Object.freeze({
    /** Whether `id` is exactly the id of a public canonical record. */
    has: (id) => (typeof id === "string" ? corpus.byId.has(id) : false),
    /** Whether `id` is exactly the id of a public canonical record of `type`. */
    hasType: (id, type) => typeOf(id) === type,
    /** How many identities back this surface. For QA and startup logging. */
    size: corpus.records.length,
  });
}

/**
 * Resolve a caller-supplied identifier to one canonical record.
 *
 * Four attempts, most specific first: the exact record id, the id built from a
 * slug, the shared alias table, and finally an exact folded title match. There
 * is no fuzzy fallback — a tool that guesses which project was meant is a tool
 * that confidently answers about the wrong one, and Phase 2's caller is a model
 * that will happily supply a plausible-looking wrong id.
 */
export function resolveRecord(corpus, identifier, { entityType = null } = {}) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const folded = foldQuestion(raw);
  /* The model-facing grammar forbids whitespace, but canonical aliases contain
   * it ("merge rush"). Separators are therefore normalised to spaces for the
   * alias lookup only — the alias table remains the single source of truth for
   * what any spelling means. */
  const spaced = foldQuestion(raw.replace(/[-_]+/g, " "));

  const candidates = [
    corpus.byId.get(raw),
    entityType ? corpus.byId.get(`${entityType}:${raw}`) : null,
    corpus.byId.get(corpus.byAlias.get(folded)),
    corpus.byId.get(corpus.byAlias.get(spaced)),
  ];
  for (const candidate of candidates) {
    if (candidate && (!entityType || candidate.entityType === entityType)) return candidate;
  }
  const titled = corpus.records.find(
    (record) =>
      (!entityType || record.entityType === entityType) &&
      (foldQuestion(record.title) === folded || foldQuestion(record.title) === spaced),
  );
  return titled || null;
}

/* ---------- shared schema fragments ---------- */

/**
 * The longest canonical public id is 69 characters, so 96 leaves headroom for a
 * longer certification slug without inviting an essay.
 */
const IDENTIFIER_MAX_LENGTH = 96;

const IDENTIFIER = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: IDENTIFIER_MAX_LENGTH,
  /**
   * Letters, digits and the separators canonical ids use.
   *
   * This is an INPUT bound and nothing more. It decides what the executor is
   * willing to try to resolve; it decides nothing about what may be recorded,
   * because a model-supplied string is never event-visible however narrow the
   * grammar. `sk-live-SECRET-SYSTEM-ignore-prior-instructions` satisfies this
   * pattern perfectly, and that is fine — it resolves to no record, so it
   * returns `found: false` and contributes nothing to an event.
   *
   * Aliases in the canonical table DO contain spaces ("merge rush"), so the
   * resolver below also tries a separator-normalised form: the model writes
   * "merge-rush", and the alias table is still the only source of what that
   * means.
   */
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$",
});

const LINKS = Object.freeze({
  type: "array",
  maxItems: 4,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "url"],
    properties: {
      kind: { type: "string", maxLength: 32 },
      url: { type: "string", maxLength: 300 },
    },
  },
});

const DETAILS = Object.freeze({
  type: "array",
  maxItems: 12,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["label", "value"],
    properties: {
      label: { type: "string", maxLength: 40 },
      value: { type: "string", maxLength: 400 },
    },
  },
});

const detail = (label, value) => (value ? { label, value: String(value).slice(0, 400) } : null);

/* ---------- portfolio.project_lookup ---------- */

const projectLookup = {
  id: "portfolio.project_lookup",
  version: "1.0.0",
  description:
    "Look up one canonical portfolio project by id, slug or known alias and return its public facts: title, summary, status, category, technology stack and canonical links.",
  riskLevel: TOOL_RISK_LEVELS.READ_ONLY,
  sideEffects: false,
  allowedScopes: [TOOL_SCOPES.PORTFOLIO],
  timeoutMs: 1000,
  maxCallsPerTurn: 2,
  /**
   * NOTHING the caller supplies is event-visible, and the event instead carries
   * the id of whatever record the lookup RESOLVED to.
   *
   * `project` is a free model-generated string, so it can never appear: an
   * identifier that is syntactically perfect and semantically hostile is still
   * syntactically perfect. What an evaluator actually wants is the tool's
   * target, and the target is the record — so "SINAMA", "sinama" and
   * "sinama-ai-agent-reliability-lab" all record `project_id: "project:sinama"`
   * and compare equal, while an identifier that resolves to nothing records
   * nothing at all.
   */
  eventArguments: [],
  canonicalEventArguments: { project_id: "id" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["project"],
    properties: { project: IDENTIFIER },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["found"],
    properties: {
      found: { type: "boolean" },
      /* The caller's own identifier is deliberately NOT echoed back. It adds
       * nothing a caller does not already hold, and echoing an arbitrary
       * caller-supplied string is a channel worth simply not having. */
      id: { type: "string", maxLength: 64 },
      slug: { type: "string", maxLength: 64 },
      title: { type: "string", maxLength: 200 },
      summary: { type: "string", maxLength: 400 },
      status: { type: "string", maxLength: 60 },
      category: { type: "string", maxLength: 80 },
      flagship: { type: "boolean" },
      stack: { type: "array", maxItems: 24, items: { type: "string", maxLength: 60 } },
      links: LINKS,
    },
  },
  async execute({ project }) {
    const corpus = await loadPortfolioToolCorpus();
    const record = resolveRecord(corpus, project, { entityType: "project" });
    /* A miss is a successful answer of "no such project", not an error. The
     * distinction matters for Phase 2: an error invites a retry, a negative
     * result invites the model to say it does not have that project. */
    if (!record) return { found: false };

    const metadata = record.metadata || {};
    const result = {
      found: true,
      id: record.id,
      slug: slugOf(record.id),
      title: record.title,
      summary: summaryOf(record),
      flagship: Boolean(metadata.flagship),
      stack: (Array.isArray(metadata.stack) ? metadata.stack : []).slice(0, 24).map((item) => String(item).slice(0, 60)),
      links: linksOf(record),
    };
    if (metadata.status) result.status = String(metadata.status).slice(0, 60);
    if (metadata.category) result.category = String(metadata.category).slice(0, 80);
    return result;
  },
};

/* ---------- portfolio.profile_lookup ---------- */

/** Which record types answer each section. A closed map, not a search. */
const PROFILE_SECTIONS = Object.freeze({
  profile: ["identity", "positioning"],
  skills: ["skills"],
  experience: ["experience"],
  education: ["education", "language"],
});

const profileLookup = {
  id: "portfolio.profile_lookup",
  version: "1.0.0",
  description:
    "Return canonical facts about Kaan Balci from one section of the portfolio knowledge base: profile, skills, experience or education.",
  riskLevel: TOOL_RISK_LEVELS.READ_ONLY,
  sideEffects: false,
  allowedScopes: [TOOL_SCOPES.PORTFOLIO],
  timeoutMs: 1000,
  maxCallsPerTurn: 2,
  /* `section` IS event-visible, and it is the only such field in Phase 1: it is
   * a closed enum this file declares, so the string an event records is one of
   * four strings written here. The model chooses which; it does not supply the
   * text. */
  eventArguments: ["section"],
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["section"],
    properties: { section: { type: "string", enum: Object.keys(PROFILE_SECTIONS) } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["section", "entries"],
    properties: {
      section: { type: "string", maxLength: 24 },
      entries: {
        type: "array",
        maxItems: 24,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "summary", "details"],
          properties: {
            id: { type: "string", maxLength: 80 },
            title: { type: "string", maxLength: 200 },
            summary: { type: "string", maxLength: 400 },
            details: DETAILS,
          },
        },
      },
    },
  },
  async execute({ section }) {
    const corpus = await loadPortfolioToolCorpus();
    const types = PROFILE_SECTIONS[section];
    const entries = corpus.records
      .filter((record) => types.includes(record.entityType))
      .slice(0, 24)
      .map((record) => {
        const metadata = record.metadata || {};
        const details = [
          detail("Organization", metadata.organization),
          detail("Role", metadata.role),
          detail("Period", metadata.period),
          detail("Institution", metadata.institution),
          detail("Program", metadata.program),
          detail("Group", metadata.group),
          detail("Skills", Array.isArray(metadata.skills) ? metadata.skills.join(", ") : null),
          /* Read from the rendered text only where canonical metadata has no
           * equivalent field — never as a substitute for structure. */
          detail("Languages", record.entityType === "language" ? labelledLine(record, "Languages") : null),
        ].filter(Boolean);
        return { id: record.id, title: record.title, summary: summaryOf(record), details: details.slice(0, 12) };
      });
    return { section, entries };
  },
};

/* ---------- portfolio.evidence_lookup ---------- */

const evidenceLookup = {
  id: "portfolio.evidence_lookup",
  version: "1.0.0",
  description:
    "Return the public evidence the portfolio records for one canonical entity: the supporting claims and canonical links for a project, employer or the profile itself.",
  riskLevel: TOOL_RISK_LEVELS.READ_ONLY,
  sideEffects: false,
  allowedScopes: [TOOL_SCOPES.PORTFOLIO],
  timeoutMs: 1000,
  maxCallsPerTurn: 2,
  /* As with project_lookup: the caller's spelling is discarded, and the event
   * carries the resolved record id or nothing. The output field is named
   * `entity_id` rather than `entity` so that the thing being projected cannot
   * be misread as the `entity` the caller supplied — they are different values
   * with different provenance, and the whole point of this door is which. */
  eventArguments: [],
  canonicalEventArguments: { entity_id: "entity_id" },
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["entity"],
    properties: { entity: IDENTIFIER },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "records"],
    properties: {
      found: { type: "boolean" },
      entity_id: { type: "string", maxLength: 80 },
      records: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "title", "claims", "links"],
          properties: {
            id: { type: "string", maxLength: 80 },
            type: { type: "string", maxLength: 40 },
            title: { type: "string", maxLength: 200 },
            claims: { type: "array", maxItems: 10, items: { type: "string", maxLength: 300 } },
            links: LINKS,
          },
        },
      },
    },
  },
  async execute({ entity }) {
    const corpus = await loadPortfolioToolCorpus();
    const record = resolveRecord(corpus, entity);
    if (!record) return { found: false, records: [] };

    /**
     * Evidence is what the canonical record already states as evidence.
     *
     * Master records carry an explicit `Evidence:` line for projects and an
     * `Achievements:`/`Signals:` equivalent elsewhere; where a record has
     * neither, its canonical links are the evidence. Nothing is inferred, and
     * no claim is composed from prose that was not already a claim.
     */
    const claimLine =
      labelledLine(record, "Evidence") || labelledLine(record, "Achievements") || labelledLine(record, "Signals");
    const claims = claimLine
      ? claimLine
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((item) => item.slice(0, 300))
      : [];

    return {
      found: true,
      entity_id: record.id,
      records: [
        {
          id: record.id,
          type: record.entityType || "record",
          title: record.title,
          claims,
          links: linksOf(record),
        },
      ],
    };
  },
};

/** The Phase 1 tool set, in registration order. */
export const PORTFOLIO_TOOL_DEFINITIONS = Object.freeze([projectLookup, profileLookup, evidenceLookup]);
