/**
 * Deterministic query router for Ajoop (Ajoop 4.5 core).
 *
 * One message in, one structured route out:
 *
 *   { intent, family, confidence, entity, entitySource, facet, evidencePolicy }
 *
 * Ajoop 4.0 scored a flat keyword map. 4.5 scores the intent ontology in
 * js/ajoop/ontology.js instead, and adds the two things the old router could
 * not express: a CONFIDENCE band, so a coin-flip match can be sent to
 * clarification rather than answered, and an EVIDENCE POLICY, so the answer
 * layer knows what this kind of question is allowed to cite before it composes
 * anything.
 *
 * Still fully deterministic and offline: the same input and the same stored
 * context always produce the same route, and nothing here calls a model, an
 * API or a fuzzy-matching dependency.
 *
 * Loads after ontology.js, entities.js, context.js and knowledge.js, and
 * before conversation.js, response.js and assistant.js.
 */
/* ajoop-router:start
 * Keep this block DOM-free. Everything it needs — the ontology, the stored
 * conversation context, the page context — is passed in or read through the
 * guarded accessors below, so the behaviour matrix can drive it with fixtures.
 */

/**
 * Facet keywords: which *aspect* of a subject the visitor asked about.
 *
 * The facet is independent of the intent on purpose. "SINAMA hangi
 * teknolojiler?" and a bare "hangi teknolojiler?" both resolve to the stack
 * facet; what differs is whether the subject came from the message or from the
 * conversation. Keeping the two apart is what lets a one-word follow-up work.
 */
const AJOOP_FACET_KEYWORDS = {
  stack: [
    "stack", "tech", "technology", "technologies", "teknoloji", "teknolojiler",
    "framework", "language", "built with", "kullan", "yazıl",
    "technologien", "tecnologias",
  ],
  links: [
    "github", "repo", "repository", "link", "links", "demo", "live", "canlı",
    "website", "site", "kaynak", "source", "adres", "url", "enlace", "lien",
  ],
  proof: [
    "proof", "prove", "kanıt", "evidence", "metric", "metrics", "sonuç",
    "results", "beleg", "beweis", "evidencia", "preuve",
  ],
  reasoning: [
    "neden", "niçin", "niye", "why", "warum", "wieso", "pourquoi", "porque",
    "por qué", "rationale", "reasoning",
  ],
  status: ["status", "durum", "aşama", "stage", "estado", "statut", "live", "canlı"],
};

/** Facet resolution order when a message hits more than one. */
const AJOOP_FACET_PRIORITY = ["links", "stack", "proof", "reasoning", "status"];

/**
 * Which link the visitor asked for, when they asked for a link at all.
 * "github?" should surface the repository first, not the case study.
 */
const AJOOP_LINK_HINTS = {
  github: ["github", "repo", "repository", "kaynak", "source", "quellcode"],
  live: ["live", "canlı", "demo", "site", "website", "adres", "en vivo"],
};

function detectAjoopLinkHint(tokens) {
  if (!tokens || !tokens.length) return null;
  return (
    Object.keys(AJOOP_LINK_HINTS).find((kind) =>
      AJOOP_LINK_HINTS[kind].some((keyword) => matchesKeyword(tokens, keyword)),
    ) || null
  );
}

/** Which facet the message asks for, or "overview". */
function detectAjoopFacet(tokens) {
  if (!tokens || !tokens.length) return "overview";
  const hit = AJOOP_FACET_PRIORITY.find((facet) =>
    AJOOP_FACET_KEYWORDS[facet].some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return hit || "overview";
}

/* ---------- context precedence ---------- */

/**
 * Families whose subject is Kaan, Ajoop or the site — never a project.
 *
 * These never inherit a project from the conversation or the page. It is the
 * rule that stops "cv", "deneyim" or "kaan kim" being answered about whatever
 * project happened to be on screen two turns ago.
 */
const AJOOP_NON_PROJECT_FAMILIES = new Set(["social", "meta", "person", "current"]);

/**
 * Facets that are ABOUT something rather than a subject in themselves.
 *
 * "github?", "stack?", "neden?" are the shape of a follow-up: they name an
 * aspect and expect the subject to come from the conversation. An overview
 * question with no named subject is a new topic, not a follow-up.
 */
const AJOOP_INHERITING_FACETS = new Set(["stack", "links", "proof", "reasoning", "status"]);

/**
 * Whether this turn may take its subject from context.
 *
 * The precedence contract, in one place:
 *
 *   1. a global/meta intent      inherits nothing, ever
 *   2. an entity named in the message wins outright
 *   3. a self-contained intent (person/current/social) inherits nothing
 *   4. an aspect question inherits the conversation subject
 *   5. failing that, the page's own subject
 *
 * Context only ever FILLS IN what the message left out. It never overrides.
 */
function ajoopMayInheritEntity(winner, facet) {
  if (!winner) return true;
  if (winner.global) return false;
  if (AJOOP_NON_PROJECT_FAMILIES.has(winner.family)) return false;
  if (winner.needsEntity) return true;
  return AJOOP_INHERITING_FACETS.has(facet);
}

/**
 * Resolves one visitor message into a structured route.
 *
 * `context` accepts:
 *   conversation — stored context object, or null to route without memory
 *   page         — page context object, or null
 *   registry     — canonical registry override (tests)
 *   now          — clock override (tests), for context expiry
 *
 * Omit `context` entirely and the live session context and page are read.
 * Pass `{ conversation: null, page: null }` for a pure message-only route.
 */
function routeAjoopQuery(message, context) {
  const options = context || {};
  const tokens = tokenizeIntentText(message);
  const registry = options.registry;

  const stored =
    options.conversation === undefined ? readAjoopContext() : options.conversation;
  /* Ajoop 4.5: a subject the visitor stopped talking about several turns ago
   * is not context, it is a trap. Expiry happens here, once, so every consumer
   * below sees the same already-pruned view. */
  const conversation =
    typeof pruneAjoopContext === "function" ? pruneAjoopContext(stored, options.now) : stored;
  const page = options.page === undefined ? readAjoopPageContext(null, registry) : options.page;

  const entities = extractAjoopEntities(tokens, registry);
  const facet = detectAjoopFacet(tokens);
  const signals =
    typeof detectAjoopSignals === "function" ? detectAjoopSignals(tokens) : new Set();

  const candidates =
    typeof scoreAjoopOntology === "function" ? scoreAjoopOntology(tokens, { signals }) : [];
  const winner = candidates[0] || null;

  /* PRECEDENCE STEP 1 — a global/meta intent short-circuits everything.
   *
   * "Sen kimsin?" must answer the same way whatever the visitor was reading a
   * moment ago. Returning here, before subject resolution, is what makes that
   * structurally true rather than merely intended. */
  if (winner && winner.global) {
    return ajoopRoute({
      intent: winner.id,
      family: winner.family,
      meta: winner.id,
      evidencePolicy: winner.evidence,
      confidence: AJOOP_CONFIDENCE.HIGH,
      score: winner.score,
      candidates,
      signals,
      previousEntity: (conversation && conversation.lastEntity) || null,
      depth: (conversation && conversation.depth) || "normal",
      pageContext: page || null,
    });
  }

  /* PRECEDENCE STEP 2 — an entity named in this message.
   *
   * A technology is something a subject HAS, not a subject itself, and a named
   * project is more concrete than a role label in the same sentence. Tech and
   * role entities still inform the intent; they just do not displace an
   * explicitly named project as the subject. */
  const subjectEntities = entities.filter((match) => match.type !== "tech");
  const projectEntities = subjectEntities.filter(
    (match) => match.type === "project" || match.type === "projectDetail",
  );
  const namedEntity = (projectEntities[0] || subjectEntities[0] || entities[0] || {}).id || null;

  /* A bare subject IS a question.
   *
   * "SINAMA" on its own scores no intent — it is a name, not a phrase — and
   * the first cut of 4.5 sent it to clarification, which is a ridiculous reply
   * to somebody who just named the thing they want to hear about. Naming a
   * project asks for its overview; naming a recruiter focus asks for the fit.
   * The entity is the evidence, so this is confident rather than a guess. */
  let resolved = winner;
  if (!resolved && namedEntity) {
    const named = getAjoopEntity(namedEntity, registry);
    const implied = named && named.type === "role" ? "fit_for_role" : "project_overview";
    const definition = getAjoopIntent(implied);
    if (definition) {
      resolved = {
        id: definition.id,
        family: definition.family,
        evidence: definition.evidence,
        facet: definition.facet || null,
        score: 10,
        specificity: 1,
        matched: [namedEntity],
      };
    }
  }

  /* PRECEDENCE STEP 6 — an unanswerable winner yields to an answerable peer.
   *
   * Scores are additive over every matched phrase and decisive token, so an
   * intent that spells one stem several ways can out-total an intent that
   * matched a single longer, strictly more specific phrase. "Hangi
   * teknolojileri biliyor" is the case that exposed it: tech_stack collects
   * "hangi teknolojiler" + "teknoloji" + "teknolojiler" over the same words and
   * beats skills, which matched the whole question — then needs a project the
   * visitor never named and can only ask which one.
   *
   * Rebalancing those keyword lists would be guesswork that moves every other
   * route with them. The real rule is narrower and belongs here, with the other
   * precedence steps: a subject-less aspect question loses to a candidate that
   * matched at least as specific a phrase AND can actually be answered. When no
   * such peer exists — "stack?", "links?" on their own — the winner stands and
   * the planner still asks which project, which is the right reply to those. */
  if (resolved && resolved.needsEntity && !namedEntity) {
    const answerable = candidates.find(
      (candidate) => !candidate.needsEntity && candidate.specificity >= resolved.specificity,
    );
    if (answerable) resolved = answerable;
  }

  /* PRECEDENCE STEPS 3-5 — self-contained intent, then conversation, then page.
   * This deliberately runs after step 6: a complete person-level question must
   * not become a project question merely because an older turn or the current
   * page can supply the project that the losing candidate needed. */
  const inheritable = ajoopMayInheritEntity(resolved, facet);
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

  /* A role intent carries its own subject: the recruiter profile it names. */
  if (!entity && resolved && resolved.roleId) {
    entity = resolved.roleId;
    entitySource = "message";
  }

  const previousEntity =
    conversation && conversation.lastEntity && conversation.lastEntity !== entity
      ? conversation.lastEntity
      : (conversation && conversation.previousEntity) || null;

  const confidence = resolved === winner
    ? ajoopRouteConfidence(candidates, { hasEntity: Boolean(entity) })
    : AJOOP_CONFIDENCE.HIGH;

  /* An intent that needs a subject and has none is not answerable as asked,
   * however well it scored. The planner turns this into a focused question
   * rather than an answer about nothing. */
  const unresolved = Boolean(resolved && resolved.needsEntity && !entity);

  const intent = resolved ? resolved.id : null;
  const resolvedFacet = resolved && resolved.facet && facet === "overview" ? resolved.facet : facet;

  /* The depth THIS turn will have, computed the same way rememberAjoopTurn
   * will record it, so the answer layer can pick the next prepared line rather
   * than repeating the one the previous identical question already returned. */
  const answerDepth =
    conversation && conversation.lastIntent === intent
      ? (conversation.answerDepth || 0) + 1
      : 0;

  return ajoopRoute({
    intent,
    family: resolved ? resolved.family : null,
    evidencePolicy: resolved ? resolved.evidence : AJOOP_EVIDENCE.NONE,
    confidence: unresolved ? AJOOP_CONFIDENCE.LOW : confidence,
    unresolved,
    score: resolved ? Number(resolved.score.toFixed(3)) : 0,
    candidates,
    signals,
    entities,
    entity,
    entitySource,
    previousEntity,
    facet: resolvedFacet,
    linkHint: resolvedFacet === "links" ? detectAjoopLinkHint(tokens) : null,
    answerDepth,
    depth: (conversation && conversation.depth) || "normal",
    pageContext: page || null,
  });
}

/**
 * The route shape, with every field present.
 *
 * Consumers read a lot of fields off a route and 4.4's two return statements
 * had already drifted apart on which ones they set. One constructor means one
 * shape, and an absent field is a bug here rather than an undefined three
 * modules downstream.
 */
function ajoopRoute(values) {
  return Object.assign(
    {
      origin: "message",
      intent: null,
      family: null,
      meta: null,
      evidencePolicy: AJOOP_EVIDENCE.NONE,
      confidence: AJOOP_CONFIDENCE.NONE,
      unresolved: false,
      score: 0,
      candidates: [],
      signals: new Set(),
      entities: [],
      entity: null,
      entitySource: null,
      previousEntity: null,
      compareWith: null,
      facet: "overview",
      linkHint: null,
      answerDepth: 0,
      depth: "normal",
      preferPrepared: false,
      pageContext: null,
    },
    values || {},
  );
}

/** Secondary intent ids, for a clarification prompt that offers real choices. */
function ajoopRouteAlternatives(route, limit) {
  const cap = typeof limit === "number" ? limit : 3;
  return (route.candidates || [])
    .slice(0, cap + 1)
    .filter((candidate) => candidate.id !== route.intent)
    .slice(0, cap)
    .map((candidate) => candidate.id);
}
/* ajoop-router:end */
