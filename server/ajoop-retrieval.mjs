/**
 * Retrieval policy: what the model is allowed to see, and in what order.
 *
 * Cosine similarity is a good way to rank records that are already relevant and
 * a bad way to decide whether ANY record is relevant. Left on its own it does
 * three things wrong, all of which this module exists to stop:
 *
 * 1. It answers "sınama ve değerlendirme arasındaki fark nedir" with SINAMA,
 *    because the words are close. A general question then comes back scoped as
 *    a portfolio one.
 * 2. It lets one project's chunks outrank another project's canonical truth, so
 *    Merge Rush is described with SINAMA's stack.
 * 3. It let old conversation into the embedding query, so a new self-contained
 *    question inherited the previous topic.
 *
 * The fixes are deliberately deterministic and deliberately not an intent
 * router. The MODEL still decides PORTFOLIO vs GENERAL; this module only
 * decides whether portfolio records are put in front of it, which records are
 * eligible, and how they are ordered. Everything here is a pure function over
 * the current question, the supplied history and the built index, so all of it
 * is testable without Ollama.
 */
import { foldQuestion, hasPhrase, tokenize } from "./ajoop-text.mjs";
import { resolveEntities } from "./ajoop-entities.mjs";

/**
 * Hybrid ranking weights.
 *
 * Semantic score is a cosine in [-1, 1] and in practice lands around 0.3–0.8,
 * so these are sized to reorder near-ties rather than to overwhelm relevance.
 * Wrong-project contamination is NOT handled by a penalty here — filtering
 * removes those candidates outright, which is stronger than any weight.
 */
export const RETRIEVAL_WEIGHTS = Object.freeze({
  /* The record belongs to an entity the visitor named. Decisive but not
   * unbounded: it reorders, it does not resurrect an irrelevant record. */
  entityAffinity: 0.35,
  /* A distinctive word from the question appears in the record's title or tags.
   * Cheap lexical agreement, useful where the embedding is ambivalent. */
  lexical: 0.12,
  /* Canonical master knowledge beats a stale legacy duplicate on a tie, and
   * only on a tie. */
  sourcePriority: 0.05,
  /* The question is professionally framed and this record is the family it
   * asked about. Sits below entity affinity: naming SINAMA is a stronger
   * signal than asking about projects in general. */
  topicAffinity: 0.25,
});

/** How far back the follow-up walk will look for an anchor. */
const MAX_INHERITANCE_DEPTH = 4;

/**
 * How many of the top-K slots a professionally framed question reserves for the
 * record family it asked about.
 *
 * A bonus was not enough here. "Kaan hangi şirketlerde çalıştı?" shares almost
 * no vocabulary with "CBOT — AI Designer", so the embedding can rank every
 * experience record below unrelated ones and no plausible weight closes a gap
 * that large without also drowning out real relevance elsewhere. Reserving a
 * bounded number of slots is the same move project isolation makes: a
 * structural guarantee rather than a thumb on the scale. Two of four leaves
 * half the context free for whatever ranking genuinely prefers.
 */
const RESERVED_FRAMED_SLOTS = 2;

/** How much conversation a genuine follow-up gets to see. */
const FOLLOW_UP_HISTORY_MESSAGES = 4;

/** Entity kinds, and what each one does to retrieval. */
export const ENTITY_TYPES = Object.freeze({
  PERSON: "person",
  PROJECT: "project",
  ORGANIZATION: "organization",
  TECHNOLOGY: "technology",
  CHANNEL: "channel",
});

/**
 * Types for the entities the master curates aliases for.
 *
 * Small and explicit because it is a classification, not data: the canonical
 * file says what these things are called, not what kind of thing they are.
 * Everything else is derived from the knowledge itself below.
 */
const CURATED_TYPES = Object.freeze({
  "Kaan Balcı": ENTITY_TYPES.PERSON,
  SINAMA: ENTITY_TYPES.PROJECT,
  "Merge Rush: Tiny Factory": ENTITY_TYPES.PROJECT,
  "Hospital Form App": ENTITY_TYPES.PROJECT,
  "Hospital Appointment System": ENTITY_TYPES.PROJECT,
  CBOT: ENTITY_TYPES.ORGANIZATION,
  "Outlier AI": ENTITY_TYPES.ORGANIZATION,
  "Atölye Joyday": ENTITY_TYPES.ORGANIZATION,
  "C#": ENTITY_TYPES.TECHNOLOGY,
  ".NET": ENTITY_TYPES.TECHNOLOGY,
  GitHub: ENTITY_TYPES.CHANNEL,
  LinkedIn: ENTITY_TYPES.CHANNEL,
});

/**
 * Phrases that make a question professional even with no entity named.
 *
 * "hangi şirketlerde çalıştı" names nobody, and it is unmistakably about Kaan's
 * career. Note what is NOT here: bare "üniversite" and bare "sertifika" would
 * make "üniversite seçerken nelere dikkat edilmeli?" a portfolio question, and
 * the exact-fact route already owns the questions that really are about his
 * education.
 */
const PORTFOLIO_FRAMING = Object.freeze([
  "proje", "projesi", "projeleri", "projelerinde", "projelerini", "project", "projects",
  "teknoloji", "teknolojileri", "teknolojiler", "technologies", "tech stack",
  "sirket", "sirketlerde", "sirketleri", "companies", "employers",
  "deneyim", "deneyimi", "tecrube", "experience", "work history", "is gecmisi",
  "gecmisi", "kariyer", "kariyeri", "career",
  "staj", "stajyer", "internship", "intern",
  "ise almali", "ise alsam", "why hire", "role uygun", "role fit", "isim icin uygun",
  "portfolyo", "portfolyosunda", "portfolio",
  "yetenek", "yetenekleri", "beceri", "becerileri", "skills",
  "ozgecmis", "cv si",
]);

/**
 * What kind of record a professionally framed question is actually asking for.
 *
 * "Kaan hangi şirketlerde çalıştı?" names no entity, so entity affinity cannot
 * help it, and its words share no vocabulary with an experience record's title
 * ("CBOT — AI Designer") — which is how a question with a perfectly good answer
 * in the corpus came back as "the portfolio does not record it". Mapping the
 * framing to a record TYPE is enough to put the right family in front of the
 * model without this module knowing a single fact about Kaan's career.
 */
const FRAMING_TO_RECORD_TYPE = Object.freeze([
  ["sirket", "experience"], ["sirketlerde", "experience"], ["companies", "experience"],
  ["employers", "experience"], ["calisti", "experience"], ["worked", "experience"],
  ["is gecmisi", "experience"], ["gecmisi", "experience"], ["kariyer", "experience"],
  ["career", "experience"], ["deneyim", "experience"], ["tecrube", "experience"],
  ["experience", "experience"], ["staj", "experience"], ["internship", "experience"],
  ["proje", "project"], ["projeleri", "project"], ["projects", "project"],
  ["teknoloji", "skills"], ["technologies", "skills"], ["yetenek", "skills"],
  ["beceri", "skills"], ["skills", "skills"],
  ["egitim", "education"], ["okul", "education"], ["education", "education"],
  ["sertifika", "certification"], ["certificate", "certification"],
]);

/** "X nedir" style questions: a subject plus a request for a definition. */
const DEFINITION_FRAME = Object.freeze(["nedir", "nelerdir", "ne demek", "what is", "what are", "ne anlama"]);

/** Discourse markers that only make sense as a continuation. */
const FOLLOW_UP_MARKERS = Object.freeze(["peki", "ya peki", "what about", "how about", "and what", "peki ya"]);

/** Pronouns and demonstratives standing in for a subject named earlier. */
const FOLLOW_UP_PRONOUNS = Object.freeze([
  "onun", "onda", "ondaki", "ona", "onu", "bunun", "bunda", "bunu", "buna",
  "bu projede", "o projede", "bu proje", "orada", "its", "it", "that one", "this one",
  /* Bare demonstratives. Safe only because every caller below also requires a
   * short question with no entity of its own and no definition frame, so "bu ne
   * demek" is excluded while "neden bu kadar etkiliydi?" is caught. */
  "bu", "o", "su",
]);

/** Attribute nouns that describe something without naming it. */
const FOLLOW_UP_PROPERTIES = Object.freeze([
  "stack", "stacki", "stackini", "teknolojileri", "veritabani", "veritabanini",
  "database", "db", "mimarisi", "mimari", "performansi", "performans",
  "ozellikleri", "amaci", "hedefi", "suresi",
]);

/** Short bare interrogatives that cannot stand on their own. */
const BARE_INTERROGATIVES = Object.freeze(["neden", "nasil", "kim", "ne zaman", "why", "how", "who", "when"]);

/** Work-history questions that ask for one internship rather than an overview. */
const INTERNSHIP_FRAMING = Object.freeze(["staj", "stajyer", "internship", "intern"]);

const anyPhrase = (text, list) => list.some((phrase) => hasPhrase(text, phrase));

/** The record types a professionally framed question is asking for. */
export function framedRecordTypes(question) {
  const folded = foldQuestion(question);
  return [...new Set(FRAMING_TO_RECORD_TYPE.filter(([phrase]) => hasPhrase(folded, phrase)).map(([, type]) => type))];
}

/** The structural experience slice a work-history question needs. */
export function experienceRecordFocus(question, framedTypes = framedRecordTypes(question)) {
  if (!framedTypes.includes("experience")) return "";
  return anyPhrase(foldQuestion(question), INTERNSHIP_FRAMING) ? "internship" : "overview";
}

/* ---------- entity index ---------- */

/** The first word of a name, when it is long enough to be a safe short form. */
function shortFormOf(name) {
  const first = tokenize(foldQuestion(name))[0] || "";
  return first.length >= 5 ? first : "";
}

/**
 * The alias index, extended with entity types and with the entities the master
 * records but does not curate aliases for.
 *
 * Punto Organization and Ocean's Team are real employers with no alias entry,
 * and every catalog project is a real project. Deriving them from the knowledge
 * keeps the isolation rules working for entities nobody thought to alias, and
 * keeps this module free of a hardcoded list of Kaan's projects.
 *
 * A derived short form ("punto", "oceans") is only added when it is unique
 * across every entity, which is exactly why neither hospital project gets to
 * claim the word "hospital".
 */
export function buildEntityIndex(knowledge, aliasIndex) {
  const entities = (aliasIndex?.entities || []).map((entity) => ({
    ...entity,
    type: CURATED_TYPES[entity.canonical] || ENTITY_TYPES.TECHNOLOGY,
    derived: false,
  }));
  const claimed = new Set(entities.flatMap((entity) => entity.aliases));
  const known = new Set(entities.map((entity) => entity.canonical));

  const addDerived = (canonical, type, extraAliases = []) => {
    const name = String(canonical || "").trim();
    if (!name || known.has(name)) return;
    const aliases = [foldQuestion(name), ...extraAliases.map(foldQuestion)].filter(Boolean);
    if (!aliases.length) return;
    known.add(name);
    entities.push({
      canonical: name,
      descriptor: name,
      aliases: [...new Set(aliases)].sort((left, right) => right.length - left.length),
      ambiguousSpellings: [],
      contextSensitive: false,
      type,
      derived: true,
    });
    aliases.forEach((alias) => claimed.add(alias));
  };

  /* Short forms are resolved first so a collision suppresses all claimants. */
  const organizations = [...new Set((knowledge?.professional_experience || []).map((entry) => entry.organization))];
  const shortForms = new Map();
  for (const name of organizations) {
    const short = shortFormOf(name);
    if (!short || claimed.has(short)) continue;
    shortForms.set(short, (shortForms.get(short) || 0) + 1);
  }
  for (const name of organizations) {
    const short = shortFormOf(name);
    addDerived(name, ENTITY_TYPES.ORGANIZATION, shortForms.get(short) === 1 ? [short] : []);
  }

  for (const name of Object.keys(knowledge?.projects?.flagship || {})) addDerived(name, ENTITY_TYPES.PROJECT);
  for (const entry of knowledge?.projects?.portfolio_catalog || []) addDerived(entry?.name, ENTITY_TYPES.PROJECT);

  return {
    entities,
    aliasCount: entities.reduce((total, entity) => total + entity.aliases.length, 0),
    byType: (type) => entities.filter((entity) => entity.type === type),
  };
}

/* ---------- record affinity ---------- */

/**
 * Which project and organization each chunk belongs to.
 *
 * Computed once at startup from the chunk's SOURCE, ENTITY ID, TITLE and TAGS —
 * never from its body text. That distinction is what keeps cross-cutting
 * records usable: `recruiter-intelligence` names four projects in its prose and
 * belongs to none of them, so it stays eligible whatever project is active,
 * while `project:sinama` is unambiguously SINAMA's.
 */
export function buildChunkAffinity(chunks, entityIndex) {
  const projects = entityIndex.byType(ENTITY_TYPES.PROJECT);
  const organizations = entityIndex.byType(ENTITY_TYPES.ORGANIZATION);
  const affinity = new Map();

  for (const chunk of chunks) {
    const haystack = foldQuestion(
      [chunk.source, chunk.entityId, chunk.title, ...(chunk.tags || []), ...(chunk.affinityHints || [])]
        .filter(Boolean)
        .join(" "),
    );
    const match = (list) =>
      list.filter((entity) => entity.aliases.some((alias) => hasPhrase(haystack, alias)))
        .map((entity) => entity.canonical);
    affinity.set(chunk.id, {
      projects: match(projects),
      organizations: match(organizations),
    });
  }
  return affinity;
}

/* ---------- current turn analysis ---------- */

/** The canonical entities the CURRENT question names, with their types. */
export function resolveCurrentEntities(question, entityIndex) {
  return resolveEntities(question, entityIndex).map((entity) => ({
    ...entity,
    type: entityIndex.entities.find((item) => item.canonical === entity.canonical)?.type || ENTITY_TYPES.TECHNOLOGY,
  }));
}

const namesOfType = (entities, type) =>
  entities.filter((entity) => entity.type === type).map((entity) => entity.canonical);

/**
 * Whether this question only makes sense as a continuation.
 *
 * Conservative on purpose, and never based on length alone or on similarity: a
 * false follow-up inherits an entity the visitor never mentioned, which is the
 * history-poisoning bug in a new costume. A definition frame is excluded
 * outright — "RAG nedir?" has a subject and stands on its own, however short.
 */
export function isFollowUpQuestion(question, entityIndex) {
  const folded = foldQuestion(question);
  if (!folded) return false;
  if (entityIndex && resolveEntities(question, entityIndex).length) return false;
  if (anyPhrase(folded, DEFINITION_FRAME)) return false;

  const words = tokenize(folded);
  if (anyPhrase(folded, FOLLOW_UP_MARKERS)) return true;
  if (words.length <= 6 && anyPhrase(folded, FOLLOW_UP_PRONOUNS)) return true;
  if (words.length <= 6 && anyPhrase(folded, FOLLOW_UP_PROPERTIES)) return true;
  /* "neden yaptı?" — an interrogative with no subject at all. */
  if (words.length <= 3 && anyPhrase(folded, BARE_INTERROGATIVES)) return true;
  return false;
}

/**
 * The portfolio entity a follow-up continues, or null.
 *
 * ONLY USER TURNS ARE READ. An assistant message is text this system generated;
 * letting it establish conversational state means the model's own guess about
 * what the conversation is about becomes the reason the next turn retrieves
 * those records, which is a loop with no ground truth in it.
 *
 * The walk stops at the first self-contained user question that named no
 * portfolio entity, so "SINAMA nedir? → RAG nedir? → peki neden önemli?" does
 * not reach back past the RAG question.
 */
export function inheritPortfolioEntity(history, entityIndex) {
  const userTurns = (history || []).filter((item) => item.role === "user").slice(-MAX_INHERITANCE_DEPTH).reverse();
  for (const turn of userTurns) {
    const entities = resolveCurrentEntities(turn.content, entityIndex);
    const anchor = entities.find(
      (entity) => entity.type === ENTITY_TYPES.PROJECT || entity.type === ENTITY_TYPES.ORGANIZATION,
    );
    if (anchor) return anchor;
    if (isFollowUpQuestion(turn.content, entityIndex)) continue;
    return null;
  }
  return null;
}

/**
 * Whether portfolio records may be put in front of the model this turn.
 *
 * This is NOT the scope decision — the model still chooses PORTFOLIO or
 * GENERAL. It is the narrower question of whether there is a reason to retrieve
 * at all, and semantic similarity is deliberately not one of those reasons.
 */
export function assessContextEligibility({ question, currentEntities, inheritedEntity }) {
  const folded = foldQuestion(question);
  if (currentEntities.length) {
    return { eligible: true, reason: "explicit-entity" };
  }
  if (inheritedEntity) {
    return { eligible: true, reason: "inherited-entity" };
  }
  /* A definition frame with no entity is a general question, whatever
   * professional nouns it happens to contain: "proje yönetimi nedir?" is about
   * project management, not about Kaan's projects. */
  if (anyPhrase(folded, DEFINITION_FRAME)) {
    return { eligible: false, reason: "definition-frame" };
  }
  if (anyPhrase(folded, PORTFOLIO_FRAMING)) {
    return { eligible: true, reason: "professional-framing" };
  }
  return { eligible: false, reason: "no-portfolio-signal" };
}

/**
 * The conversation the model gets to see.
 *
 * A self-contained question gets none of it. That is the whole fix for history
 * poisoning: "RAG nedir?" after a dollar-rate refusal reads exactly as if it
 * were the first thing anyone had asked. A genuine follow-up gets a short
 * window, because that is the only case where the previous turns are what the
 * question means.
 */
export function selectGenerationHistory(history, { followUp }) {
  if (!followUp) return [];
  return (history || []).slice(-FOLLOW_UP_HISTORY_MESSAGES);
}

/**
 * The embedding query.
 *
 * The current question plus canonical entity names, and NOTHING ELSE. Raw prose
 * from earlier turns is never concatenated in: that is what made a new question
 * embed as a continuation of the old one.
 */
export function buildRetrievalText(question, currentEntities, inheritedEntity) {
  const trimmed = String(question || "").trim();
  const names = [...new Set([...currentEntities, ...(inheritedEntity ? [inheritedEntity] : [])].map((e) => e.descriptor))];
  return names.length ? `${trimmed}\ncanonical entities: ${names.join("; ")}` : trimmed;
}

/**
 * Everything the turn needs, decided before a single byte is embedded.
 *
 * Returned as plain data so tests can assert the decision itself rather than
 * inferring it from an answer.
 */
export function planRetrievalTurn({ question, history = [], entityIndex }) {
  const currentEntities = resolveCurrentEntities(question, entityIndex);
  const followUp = isFollowUpQuestion(question, entityIndex);
  const inheritedEntity = followUp ? inheritPortfolioEntity(history, entityIndex) : null;
  const { eligible, reason } = assessContextEligibility({ question, currentEntities, inheritedEntity });

  const active = [...currentEntities, ...(inheritedEntity ? [inheritedEntity] : [])];
  const activeProjects = namesOfType(active, ENTITY_TYPES.PROJECT);
  const activeOrganizations = namesOfType(active, ENTITY_TYPES.ORGANIZATION);
  const framedTypes = framedRecordTypes(question);
  const experienceFocus = experienceRecordFocus(question, framedTypes);
  return {
    currentEntities,
    inheritedEntity,
    followUp,
    contextEligible: eligible,
    contextReason: reason,
    activeProjects,
    activeOrganizations,
    activeEntities: active.map((entity) => entity.canonical),
    framedTypes,
    experienceFocus,
    /* Slot reservation is for questions with no explicit focus. Naming a
     * project or an employer is a stronger signal than asking about projects
     * in general, so an explicit entity keeps the whole context. */
    reservedTypes: activeProjects.length || activeOrganizations.length ? [] : framedTypes,
    retrievalText: buildRetrievalText(question, currentEntities, inheritedEntity),
    generationHistory: selectGenerationHistory(history, { followUp }),
    historyMode: followUp ? "follow-up" : "self-contained",
  };
}

/* ---------- candidate filtering and ranking ---------- */

/**
 * Whether a chunk may serve as evidence for this turn.
 *
 * Project isolation is a FILTER, not a penalty. When the visitor names SINAMA,
 * Merge Rush's records are not merely less likely to win — they are not in the
 * running, so no similarity score can put a Phaser stack into a SINAMA answer.
 * A record belonging to no project is cross-cutting (skills, positioning,
 * recruiter evidence) and stays eligible throughout.
 *
 * Naming two projects lifts the lock for both, so a comparison can see both.
 */
export function isCandidateEligible(chunk, affinity, { activeProjects, activeOrganizations }) {
  const marks = affinity.get(chunk.id) || { projects: [], organizations: [] };
  if (activeProjects.length && marks.projects.length) {
    if (!marks.projects.some((name) => activeProjects.includes(name))) return false;
  }
  if (activeOrganizations.length && marks.organizations.length) {
    if (!marks.organizations.some((name) => activeOrganizations.includes(name))) return false;
  }
  return true;
}

/** Distinctive words from the question, for cheap lexical agreement. */
export function lexicalTerms(question) {
  return tokenize(foldQuestion(question)).filter((word) => word.length >= 4);
}

/**
 * The hybrid score for one candidate.
 *
 * Semantic similarity remains the base; the bonuses reorder near-ties toward
 * the record the visitor actually named. Returned with its parts so a test can
 * assert why a record won rather than only that it did.
 */
export function scoreCandidate(chunk, semanticScore, { affinity, activeEntities, terms, framedTypes = [] }) {
  const marks = affinity.get(chunk.id) || { projects: [], organizations: [] };
  const named = [...marks.projects, ...marks.organizations];
  const affinityScore = named.some((name) => activeEntities.includes(name))
    ? RETRIEVAL_WEIGHTS.entityAffinity
    : 0;

  const haystack = foldQuestion([chunk.title, ...(chunk.tags || [])].filter(Boolean).join(" "));
  const lexicalScore = terms.some((term) => hasPhrase(haystack, term)) ? RETRIEVAL_WEIGHTS.lexical : 0;

  /* Priority 1 is canonical master knowledge. Modest by design: a tie-break,
   * never a reason to prefer an irrelevant canonical record. */
  const sourceBonus = chunk.priority === 1 ? RETRIEVAL_WEIGHTS.sourcePriority : 0;
  const topicScore = framedTypes.includes(chunk.entityType) ? RETRIEVAL_WEIGHTS.topicAffinity : 0;

  return {
    semanticScore,
    affinityScore,
    lexicalScore,
    sourceBonus,
    topicScore,
    finalScore: semanticScore + affinityScore + lexicalScore + sourceBonus + topicScore,
  };
}

/**
 * The top-K chunks, with the records that matter guaranteed a foothold.
 *
 * Two passes over the already-ranked list. The first fills the reserved slots
 * with whatever `reserveWhen` accepts — the named entity's own records, or the
 * record family a professionally framed question asked about; the second fills
 * the rest in score order. Both respect the per-entity cap, so one talkative
 * record cannot take the whole context.
 *
 * The reservation is what stops a cross-cutting record that happens to mention
 * FastAPI from crowding Merge Rush out of its own answer: filtering removes the
 * WRONG project, and this makes room for the right one.
 */
export function selectTopChunks(ranked, { topK, perEntityCap = 2, reserveWhen, reservedSlots = RESERVED_FRAMED_SLOTS }) {
  const selected = [];
  const chosen = new Set();
  const perEntity = new Map();

  const take = (item, cap) => {
    if (chosen.has(item.id)) return;
    const key = `${item.source}:${item.entityId}`;
    const count = perEntity.get(key) || 0;
    if (count >= cap) return;
    selected.push(item);
    chosen.add(item.id);
    perEntity.set(key, count + 1);
  };

  /* The reserved pass takes at most ONE chunk per record, so two slots buy two
   * different records rather than two halves of the same one — a project's
   * detail page and its canonical master record say different things, and the
   * point of reserving is coverage. The general pass below may still add a
   * second chunk of a record it really wants. */
  if (typeof reserveWhen === "function") {
    for (const item of ranked) {
      if (selected.length >= Math.min(reservedSlots, topK)) break;
      if (reserveWhen(item)) take(item, 1);
    }
  }
  for (const item of ranked) {
    if (selected.length >= topK) break;
    take(item, perEntityCap);
  }
  return selected;
}
