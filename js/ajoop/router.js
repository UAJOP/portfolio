/**
 * Weighted deterministic query router for Ajoop (Ajoop 4.0 Brain).
 *
 * Replaces "first keyword in map order wins" with a scored decision over every
 * candidate intent, the entities named in the message, and the context the
 * visitor is already in. Still fully deterministic and offline: the same input
 * and the same stored context always produce the same route, and nothing here
 * calls a model, an API or a fuzzy-matching dependency.
 *
 * Loads after matcher.js, entities.js, context.js and knowledge.js, and before
 * assistant.js, which owns the keyword map and the answers.
 */
/* ajoop-router:start
 * Keep this block DOM-free. Everything it needs — the keyword map, the stored
 * conversation context, the page context — is passed in or read through the
 * guarded accessors below, so QA can drive it with fixtures.
 *
 * WHY SCORING, NOT ORDER. The old map order encoded priority implicitly: a
 * generic intent early in the list stole specific questions, and the fix was
 * always to shuffle the array. Scoring makes the same priorities explicit —
 * a two-word phrase outweighs a bare token, a recognized entity outweighs a
 * generic keyword — and leaves map order as nothing more than a tie-breaker.
 */

/**
 * Intents broad enough to match almost any portfolio question. They still win
 * when nothing more specific matches; they just stop outbidding specifics.
 */
const AJOOP_GENERIC_INTENTS = new Set([
  "projects",
  "about",
  "stack",
  "ai",
  "availability",
  "default",
]);

const AJOOP_GENERIC_INTENT_FACTOR = 0.6;

/** A recognized entity is worth more than one generic token, less than a phrase. */
const AJOOP_ENTITY_INTENT_BOOST = 7;

/**
 * Keywords that describe the act of asking rather than the subject asked about.
 *
 * "tell me about AI" is a question about AI, not about Kaan, but "about" is the
 * longer token and length is otherwise a good proxy for signal. These carry
 * minimum weight so they can still win an otherwise empty match ("hakkında"
 * alone is a valid question) without ever outbidding a real subject.
 */
const AJOOP_FILLER_KEYWORDS = new Set(["about", "hakkında", "hakkımda"]);
const AJOOP_FILLER_WEIGHT = 1;

/**
 * Facet keywords: which *aspect* of a subject the visitor asked about.
 *
 * The facet is independent of the intent on purpose. "SINAMA hangi
 * teknolojiler?" scores highest on the `sinama` intent, while "hangi
 * teknolojiler?" alone scores highest on `stack` — both should answer with the
 * same SINAMA stack, so the answer layer keys off the facet plus the resolved
 * entity rather than the intent id.
 */
const AJOOP_FACET_KEYWORDS = {
  stack: [
    "stack",
    "tech",
    "technology",
    "technologies",
    "teknoloji",
    "teknolojiler",
    "framework",
    "language",
    "built with",
    "kullan",
    "yazıl",
  ],
  links: [
    "github",
    "repo",
    "repository",
    "link",
    "links",
    "demo",
    "live",
    "canlı",
    "website",
    "site",
    "kaynak",
    "source",
    "adres",
  ],
  /* "prove" joins the proof facet in 4.2 so "prove it" resolves like "kanıtla",
   * which the "kanıt" prefix already covered. */
  proof: ["proof", "prove", "kanıt", "evidence", "metric", "metrics", "sonuç", "results"],
};

/** Facet resolution order when a message hits more than one. */
const AJOOP_FACET_PRIORITY = ["links", "stack", "proof"];

/**
 * Intents whose subject is Kaan or the site, never a project.
 *
 * Ajoop 4.4 context precedence. "Hangi teknolojileri biliyor?" asked after a
 * SINAMA answer is a question about Kaan's stack, not about SINAMA's — but the
 * facet ("stack") used to make it inheritable, so the old subject silently
 * hijacked it. When one of these wins on its OWN keywords, the turn resolves
 * at profile level and inherits nothing.
 */
const AJOOP_SELF_CONTAINED_INTENTS = new Set([
  "about",
  "availability",
  "certificates",
  "cv",
  "education",
  "experience",
  "greeting",
  "request",
  "roles",
  "weather",
]);

/**
 * Cues that make a stack question about Kaan rather than the active project.
 *
 * A bare "stack?" is a useful contextual follow-up and should inherit SINAMA.
 * "What technologies does Kaan know?" and its supported-language equivalents
 * explicitly point back at the person, so a stale project must not hijack it.
 */
const AJOOP_PROFILE_SCOPE_KEYWORDS = [
  "kaan", "he", "his", "know", "knows", "you", "your",
  "biliyor", "bildiği", "bildigi", "sen", "senin", "onun",
  "er", "kennt", "kann", "sein", "seine",
  "conoce", "sabe", "sus",
  "connait", "sait", "ses", "il",
];

/**
 * Which link the visitor asked for, when they asked for a link at all.
 * "github?" should surface the repository first, not the case study.
 */
const AJOOP_LINK_HINTS = {
  github: ["github", "repo", "repository", "kaynak", "source"],
  live: ["live", "canlı", "demo", "site", "website", "adres"],
};

function detectAjoopLinkHint(tokens) {
  if (!tokens || !tokens.length) return null;
  return (
    Object.keys(AJOOP_LINK_HINTS).find((kind) =>
      AJOOP_LINK_HINTS[kind].some((keyword) => matchesKeyword(tokens, keyword)),
    ) || null
  );
}

/** The live keyword map, or an empty list if assistant.js has not loaded. */
function ajoopIntentMap(intents) {
  if (Array.isArray(intents)) return intents;
  return typeof chatbotKeywordMap === "undefined" ? [] : chatbotKeywordMap;
}

/**
 * Keyword weight.
 *
 * A consecutive multi-word phrase is the strongest signal a rule-based matcher
 * has, so it scales with length. Single tokens scale with length too, because
 * the short ones ("ai", "cv", "rol") are the collision-prone ones the matcher
 * already has to guard.
 */
function ajoopKeywordWeight(keyword) {
  const tokens = getKeywordTokens(keyword);
  if (!tokens.length) return 0;
  if (tokens.length > 1) return 8 * tokens.length;
  if (AJOOP_FILLER_KEYWORDS.has(normalizeIntentText(keyword))) return AJOOP_FILLER_WEIGHT;
  const length = tokens[0].folded.length;
  if (length >= 6) return 6;
  if (length >= 4) return 5;
  return 4;
}

/** Which facet the message asks for, or "overview". */
function detectAjoopFacet(tokens) {
  if (!tokens || !tokens.length) return "overview";
  const hit = AJOOP_FACET_PRIORITY.find((facet) =>
    AJOOP_FACET_KEYWORDS[facet].some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return hit || "overview";
}

/** Scores every intent in the map against the message tokens. */
function scoreAjoopIntents(tokens, intents, entityIntents) {
  const map = ajoopIntentMap(intents);
  const candidates = [];

  map.forEach((entry, order) => {
    if (!entry || !entry.id || !Array.isArray(entry.keywords)) return;
    const matched = [];
    let score = 0;
    entry.keywords.forEach((keyword) => {
      if (!matchesKeyword(tokens, keyword)) return;
      matched.push(keyword);
      score += ajoopKeywordWeight(keyword);
    });
    if (AJOOP_GENERIC_INTENTS.has(entry.id)) score *= AJOOP_GENERIC_INTENT_FACTOR;

    const votes = entityIntents.get(entry.id) || 0;
    const entityBoost = votes * AJOOP_ENTITY_INTENT_BOOST;
    if (!matched.length && !entityBoost) return;

    candidates.push({
      id: entry.id,
      score: score + entityBoost,
      keywordScore: score,
      entityBoost,
      matched,
      order,
      /* Longest matched keyword, used to break score ties toward specificity. */
      specificity: matched.reduce(
        (best, keyword) => Math.max(best, getKeywordTokens(keyword).length),
        0,
      ),
    });
  });

  /* Deterministic ranking: score, then specificity, then map order. */
  return candidates.sort(
    (a, b) => b.score - a.score || b.specificity - a.specificity || a.order - b.order,
  );
}

function ajoopConfidence(score, hasEntity) {
  if (score >= 14 || (score >= 8 && hasEntity)) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/**
 * Resolves one visitor message into a structured route.
 *
 * `context` accepts:
 *   conversation — stored context object, or null to route without memory
 *   page         — page context object, or null
 *   registry     — canonical registry override (tests)
 *   intents      — keyword map override (tests)
 *
 * Omit `context` entirely and the live session context and page are read.
 * Pass `{ conversation: null, page: null }` for a pure message-only route.
 */
function routeAjoopQuery(message, context) {
  const options = context || {};
  const tokens = tokenizeIntentText(message);
  const registry = options.registry;

  const conversation =
    options.conversation === undefined ? readAjoopContext() : options.conversation;
  const page = options.page === undefined ? readAjoopPageContext(null, registry) : options.page;

  /* PRECEDENCE STEP 1 — global meta intent.
   *
   * "Sen kimsin?" is a question about Ajoop, and it must answer the same way
   * whatever the visitor was reading a moment ago. Returning here, before
   * entity extraction and before intent scoring, is what makes that true:
   * there is no path from this branch to the conversation subject or the page
   * subject, so neither can leak into the answer. */
  const meta =
    typeof detectAjoopMetaIntent === "function" ? detectAjoopMetaIntent(message) : null;
  if (meta) {
    return {
      meta,
      intent: `meta:${meta}`,
      secondaryIntents: [],
      entities: [],
      entity: null,
      entitySource: null,
      previousEntity: (conversation && conversation.lastEntity) || null,
      facet: "overview",
      linkHint: null,
      confidence: "high",
      score: 0,
      candidates: [],
      answerDepth: 0,
      depth: (conversation && conversation.depth) || "normal",
      pageContext: page || null,
    };
  }

  const entities = extractAjoopEntities(tokens, registry);
  const facet = detectAjoopFacet(tokens);

  const map = ajoopIntentMap(options.intents);
  const knownIntentIds = new Set(map.map((entry) => entry && entry.id).filter(Boolean));

  /* Each recognized entity votes once for the intent it implies. */
  const entityIntents = new Map();
  entities.forEach((match) => {
    const intentId = ajoopEntityIntent(getAjoopEntity(match.id, registry), knownIntentIds);
    if (!intentId) return;
    entityIntents.set(intentId, (entityIntents.get(intentId) || 0) + 1);
  });

  const candidates = tokens.length
    ? scoreAjoopIntents(tokens, map, entityIntents)
    : [];
  const winner = candidates[0] || null;

  /* Subject resolution. The message wins; then what the visitor was already
   * talking about; then the page they are standing on. A message that named a
   * subject never inherits, which is how switching subject works. */
  /* A technology is something a subject HAS, not a subject itself. A named
   * project is also more concrete than a role label in the same sentence.
   *
   * Entity extraction ranks by alias specificity, so a two-word technology
   * ("AI Evaluation") outranks a one-word project ("SINAMA") — which made
   * "SINAMA'da AI evaluation yaptın mı?" set the active subject to the
   * technology and lose SINAMA for the next turn. The same specificity ordering
   * made "SINAMA ... Applied AI" select the role instead of the project. Tech
   * and role entities still vote for intents; they just do not displace an
   * explicitly named project as the subject.
   */
  const subjectEntities = entities.filter((match) => match.type !== "tech");
  const projectEntities = subjectEntities.filter(
    (match) => match.type === "project" || match.type === "projectDetail",
  );
  const namedEntity = (projectEntities[0] || subjectEntities[0] || entities[0] || {}).id || null;

  /* PRECEDENCE STEPS 2-5, in order: explicit entity, explicit intent,
   * conversation context, page context.
   *
   * A message that names a subject never inherits — that is how switching
   * subject works. A message that wins a self-contained intent on its own
   * keywords does not inherit either, because it already stated its subject:
   * Kaan. Everything else may inherit, but only when the question is about an
   * ASPECT of something ("github?", "kanıt?") rather than a fresh overview. */
  const profileScopedStack =
    Boolean(winner) &&
    winner.id === "stack" &&
    AJOOP_PROFILE_SCOPE_KEYWORDS.some((keyword) => matchesKeyword(tokens, keyword));
  const selfContained =
    Boolean(winner) &&
    (AJOOP_SELF_CONTAINED_INTENTS.has(winner.id) || profileScopedStack) &&
    winner.keywordScore > 0;
  const inheritable = !selfContained && (facet !== "overview" || !winner);
  let entity = namedEntity;
  let entitySource = namedEntity ? "message" : null;
  if (!entity && inheritable && conversation && conversation.lastEntity) {
    entity = conversation.lastEntity;
    entitySource = "conversation";
  }
  if (!entity && inheritable && page && page.pageEntity) {
    entity = page.pageEntity;
    entitySource = "page";
  }

  const previousEntity =
    conversation && conversation.lastEntity && conversation.lastEntity !== entity
      ? conversation.lastEntity
      : (conversation && conversation.previousEntity) || null;

  const intent = winner ? winner.id : "default";
  const score = winner ? Number(winner.score.toFixed(3)) : 0;

  /* The depth THIS turn will have, computed the same way rememberAjoopTurn
   * will record it, so the answer layer can pick the next prepared line rather
   * than repeating the one the previous identical question already returned. */
  const answerDepth =
    conversation && conversation.lastIntent === intent
      ? (conversation.answerDepth || 0) + 1
      : 0;

  return {
    /* Ajoop 4.4: null on every ordinary route, so callers can branch on one
     * field instead of re-detecting the meta intent themselves. */
    meta: null,
    intent,
    secondaryIntents: candidates.slice(1, 4).map((candidate) => candidate.id),
    entities,
    entity,
    entitySource,
    previousEntity,
    facet,
    linkHint: facet === "links" ? detectAjoopLinkHint(tokens) : null,
    confidence: winner ? ajoopConfidence(score, Boolean(entity)) : "low",
    score,
    candidates,
    answerDepth,
    /* Ajoop 4.1: the detail level the visitor last chose. Carried on the route
     * so the answer templates never have to read storage themselves. */
    depth: (conversation && conversation.depth) || "normal",
    pageContext: page || null,
  };
}
/* ajoop-router:end */
