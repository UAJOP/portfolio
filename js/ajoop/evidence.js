/**
 * Deterministic evidence modelling for Ajoop (Ajoop 4.2 Evidence layer).
 *
 * Ajoop 4.0 decides what a question is about and 4.1 decides what to offer
 * next. This module answers the third question: "what is the evidence?"
 *
 * It produces a STRUCTURED RESPONSE — text plus cards plus sources — instead of
 * a string. assistant.js renders it; nothing here touches the DOM. That split
 * matters beyond tidiness: the same model is what a later release will serialize
 * as grounding for a local model, so it must stand on its own without a panel
 * to live in (see serializeAjoopEvidence).
 *
 * Every value comes from window.KAAN_PORTFOLIO through js/ajoop/knowledge.js.
 * Nothing here composes a metric, a technology, an outcome, a date or a URL.
 * When canonical data is missing, the card omits the field or the response says
 * so plainly.
 *
 * Loads after knowledge.js and router.js, before assistant.js.
 */
/* ajoop-evidence:start
 * Keep this block DOM-free.
 *
 * Label pairs go through the local one-line getI18nText alias so
 * scripts/i18n-catalog.mjs extracts them into the five-locale packs. The alias
 * is named ajoopEvidenceText because assistant.js and conversation.js already
 * declare their own in the shared classic-script scope.
 */
const ajoopEvidenceText = (english, turkish, language) => typeof getI18nText === "function" ? getI18nText(english, turkish, language) : language === "tr" ? turkish : english;

/** Never show more than this many cards in one response. */
const AJOOP_MAX_EVIDENCE_CARDS = 3;

/**
 * Source provenance shown on a card.
 *
 * Deliberately "Portfolio evidence" and not "Verified": everything here is
 * sourced from this site's own canonical portfolio data, which is a claim about
 * where the fact came from, not an independent audit. Overstating that would be
 * the one dishonest thing an evidence feature could do.
 */
function ajoopEvidenceSourceLabel(language) {
  return ajoopEvidenceText("Portfolio evidence", "Portfolyo kanıtı", language);
}

function ajoopEvidenceLocale(language) {
  return (
    language || (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en")
  );
}

/* ---------- cards ---------- */

/**
 * One project as an evidence card, or null when the registry cannot back one.
 *
 * `meta`, `tags`, `proof` and `links` are each dropped when empty rather than
 * rendered as a blank row, so a thin record produces a small honest card
 * instead of a large mostly-empty one.
 */
function buildAjoopProjectCard(id, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const project = getAjoopProject(id, locale, registry);
  if (!project || !project.name) return null;
  return {
    type: "project",
    entityId: project.id,
    title: project.name,
    summary: project.summary || "",
    meta: [project.category, project.status, project.year].filter(Boolean),
    tags: project.stack.slice(),
    proof: project.proof.slice(),
    links: getAjoopProjectSources(project.id, locale, registry),
    source: ajoopEvidenceSourceLabel(locale),
  };
}

/**
 * A recruiter focus as a card.
 *
 * Capabilities and skills are canonical; the card carries no fit score, because
 * the registry holds no such number and inventing one would be exactly the kind
 * of authoritative-looking fiction this layer exists to avoid.
 */
function buildAjoopRoleCard(roleId, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const profile = getAjoopRoleProfile(roleId, locale, registry);
  if (!profile) return null;
  return {
    type: "role",
    entityId: roleId,
    title: profile.focusTitle || profile.label,
    summary: "",
    meta: [],
    tags: profile.capabilities.slice(),
    proof: profile.skills.slice(),
    links: [],
    source: ajoopEvidenceSourceLabel(locale),
  };
}

/**
 * Evidence for a recruiter focus: the projects the profile itself names.
 *
 * The order is the registry's own `evidence` order — a curated canonical list,
 * not a computed ranking. No scoring is invented to decide what is "strongest".
 */
function buildAjoopRoleEvidence(roleId, language, registry, limit) {
  const locale = ajoopEvidenceLocale(language);
  const profile = getAjoopRoleProfile(roleId, locale, registry);
  if (!profile) return [];
  const cap = typeof limit === "number" ? limit : AJOOP_MAX_EVIDENCE_CARDS;
  return profile.evidence
    .map((id) => buildAjoopProjectCard(id, locale, registry))
    .filter(Boolean)
    .slice(0, cap);
}

/* ---------- comparison ---------- */

function ajoopComparisonRowLabel(key, language) {
  switch (key) {
    case "category":
      return ajoopEvidenceText("Domain", "Alan", language);
    case "summary":
      return ajoopEvidenceText("Purpose", "Amaç", language);
    case "status":
      return ajoopEvidenceText("Status", "Durum", language);
    case "stack":
      return ajoopEvidenceText("Tech stack", "Teknolojiler", language);
    case "proof":
      return ajoopEvidenceText("Evidence", "Kanıtlar", language);
    default:
      return key;
  }
}

/**
 * A neutral side-by-side of two projects.
 *
 * Rows carry values, never a verdict. Nothing here concludes that one project
 * is better, newer or more relevant — the registry has no basis for that, and a
 * comparison that editorialises would be generated opinion wearing the costume
 * of portfolio data.
 */
function buildAjoopComparison(entityA, entityB, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const data = getAjoopComparisonData(entityA, entityB, locale, registry);
  if (!data) return null;
  return {
    type: "comparison",
    left: { entityId: data.left.id, title: data.left.name },
    right: { entityId: data.right.id, title: data.right.name },
    rows: data.fields.map((field) => ({
      key: field.key,
      label: ajoopComparisonRowLabel(field.key, locale),
      a: field.a,
      b: field.b,
    })),
    links: {
      left: getAjoopProjectSources(data.left.id, locale, registry),
      right: getAjoopProjectSources(data.right.id, locale, registry),
    },
    source: ajoopEvidenceSourceLabel(locale),
  };
}

/* ---------- deterministic portfolio filtering ---------- */

/**
 * Words that describe the request rather than the filter.
 *
 * "Python kullandığı projeleri göster" filters on Python; every other token is
 * scaffolding. Stripping them is what keeps the filter from matching a project
 * because the visitor said "show".
 */
const AJOOP_FILTER_STOPWORDS = new Set([
  "show", "me", "list", "all", "the", "with", "using", "used", "uses", "which",
  "what", "your", "his", "her", "their", "projects", "project", "portfolio",
  "göster", "goster", "listele", "hangi", "kullandığı", "kullandigi", "kullanılan",
  "kullanilan", "kullanan", "proje", "projeler", "projelerini", "projeleri",
  "projede", "olan", "var", "bana", "ile", "ve", "and", "in", "on", "of", "a", "an",
]);

/** A message only filters projects when it actually asks for projects. */
const AJOOP_FILTER_TRIGGERS = [
  "projects", "project", "proje", "projeler", "projelerini", "projeleri", "portfolio",
];

/**
 * Field weights.
 *
 * A stack hit is the strongest signal a registry record can give — it is a
 * literal technology entry. Category and status are looser groupings, so they
 * rank below it rather than competing with it.
 */
const AJOOP_FILTER_WEIGHTS = { stack: 3, category: 2, status: 1 };

function ajoopFilterTerms(tokens) {
  return tokens.filter((token) => !AJOOP_FILTER_STOPWORDS.has(token.base));
}

/** True when at least one token asks for a list of projects. */
function isAjoopProjectFilterQuery(tokens) {
  return AJOOP_FILTER_TRIGGERS.some((trigger) => matchesKeyword(tokens, trigger));
}

/**
 * Projects whose canonical stack, category or status matches the query terms.
 *
 * Pure lookup over registry strings — no synonym table, no stemming beyond the
 * matcher's own prefix rule, no semantic similarity. A project appears because
 * a field literally contains the term, which is the only way this can stay
 * honest without a model.
 */
function findAjoopProjectsByQuery(tokens, language, registry, limit) {
  const locale = ajoopEvidenceLocale(language);
  const terms = ajoopFilterTerms(tokens);
  if (!terms.length) return { matches: [], total: 0, terms: [] };

  /* Report the canonical label that matched ("Python", "C#"), not the visitor's
   * normalized token — the answer should echo the portfolio's own vocabulary. */
  const matchedLabels = new Set();
  const matchedRaw = new Set();
  const scored = [];

  getAjoopCanonicalProjectIds(registry).forEach((id, order) => {
    const project = getAjoopProject(id, locale, registry);
    if (!project) return;
    const fields = {
      stack: project.stack,
      category: [project.category],
      status: [project.status],
    };
    let score = 0;
    Object.keys(fields).forEach((field) => {
      fields[field].filter(Boolean).forEach((value) => {
        const valueTokens = tokenizeIntentText(value);
        terms.forEach((term) => {
          if (!matchesKeyword(valueTokens, term.base)) return;
          score += AJOOP_FILTER_WEIGHTS[field];
          matchedRaw.add(term.base);
          matchedLabels.add(value);
        });
      });
    });
    if (score > 0) scored.push({ id, project, score, order });
  });

  const matchedTerms = matchedLabels.size ? matchedLabels : matchedRaw;

  /* Deterministic: score, then registry order (flagship records lead). */
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const cap = typeof limit === "number" ? limit : AJOOP_MAX_EVIDENCE_CARDS;
  return {
    matches: scored.slice(0, cap).map((entry) => entry.id),
    total: scored.length,
    terms: [...matchedTerms],
  };
}

/* ---------- request interpretation ---------- */

/** Asking for the receipts rather than the summary. */
const AJOOP_PROVE_KEYWORDS = [
  "prove", "prove it", "proof", "show proof", "show evidence", "evidence",
  "kanıt", "kanıtla", "kanıtlar", "kanıtları", "kanıtlarsın", "ispat",
];

/** Asking for two things next to each other. */
const AJOOP_COMPARE_KEYWORDS = [
  "compare", "comparison", "versus", "vs", "karşılaştır", "karşılaştırma", "kıyasla",
];

function isAjoopProveRequest(tokens) {
  return AJOOP_PROVE_KEYWORDS.some((keyword) => matchesKeyword(tokens, keyword));
}

function isAjoopCompareRequest(tokens) {
  return AJOOP_COMPARE_KEYWORDS.some((keyword) => matchesKeyword(tokens, keyword));
}

/**
 * Which evidence treatment a message asks for: "compare", "filter", "prove"
 * or null for an ordinary answer.
 *
 * Order matters. "SINAMA ile Merge Rush'ı karşılaştır" also contains project
 * words, so comparison is decided first; filtering only claims a message that
 * asked for a list and named something to filter on.
 */
function detectAjoopEvidenceMode(message, route, registry) {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length) return null;
  if (isAjoopCompareRequest(tokens)) return "compare";
  /* A project-listing request with something to filter on stays a filter even
   * when nothing matches: "Haskell projeleri" deserves an honest "none listed",
   * not a generic projects answer that quietly ignores the word Haskell. A bare
   * "projeler" has no filter term and falls through to the normal intent. */
  if (isAjoopProjectFilterQuery(tokens) && ajoopFilterTerms(tokens).length) return "filter";
  if (isAjoopProveRequest(tokens)) return "prove";
  return null;
}

/**
 * The order two named projects should appear in.
 *
 * "SINAMA ile Merge Rush'ı karşılaştır" should read SINAMA first. Entity
 * extraction sorts by alias specificity, not by where the visitor typed the
 * name, so reading order is recovered from the message itself.
 */
function orderAjoopComparisonEntities(message, entities) {
  const text = normalizeIntentText(message);
  const positioned = entities
    .map((match) => ({ id: match.id, at: text.indexOf(match.alias) }))
    .filter((entry) => entry.at >= 0);
  if (positioned.length < 2) return entities.map((match) => match.id);
  positioned.sort((a, b) => a.at - b.at);
  return positioned.map((entry) => entry.id);
}

/* ---------- structured responses ---------- */

function ajoopResponse(text, extra) {
  return Object.assign({ text: text || "", cards: [], comparison: null, actions: [] }, extra || {});
}

/** The evidence answer for one subject. Null when nothing canonical backs it. */
function buildAjoopProveResponse(entityId, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const entity = typeof getAjoopEntity === "function" ? getAjoopEntity(entityId, registry) : null;

  if (entity && entity.type === "role") {
    const cards = buildAjoopRoleEvidence(entityId, locale, registry);
    if (!cards.length) return null;
    const profile = getAjoopRoleProfile(entityId, locale, registry);
    return ajoopResponse(
      `${ajoopEvidenceText("Portfolio evidence for", "Şu odak için portfolyo kanıtı", locale)} ${profile.focusTitle || profile.label}:`,
      { cards, mode: "prove", entityId },
    );
  }

  const card = buildAjoopProjectCard(entityId, locale, registry);
  if (!card) return null;
  /* A record with neither proof points nor a citable source is a name and a
   * sentence; presenting that as "evidence" would oversell it. */
  if (!card.proof.length && !card.links.length) return null;
  return ajoopResponse(
    `${card.title} — ${ajoopEvidenceText("here is the portfolio evidence.", "portfolyo kanıtı burada.", locale)}`,
    { cards: [card], mode: "prove", entityId },
  );
}

/** The comparison answer, or null when two comparable projects are not known. */
function buildAjoopCompareResponse(entityA, entityB, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const comparison = buildAjoopComparison(entityA, entityB, locale, registry);
  if (!comparison) return null;
  return ajoopResponse(
    `${comparison.left.title} ${ajoopEvidenceText("compared with", "ile karşılaştırma:", locale)} ${comparison.right.title}`,
    { comparison, mode: "compare", entityId: entityA },
  );
}

/** The filtered-project answer. Always returns a response, even when empty. */
function buildAjoopFilterResponse(message, language, registry) {
  const locale = ajoopEvidenceLocale(language);
  const tokens = tokenizeIntentText(message);
  const found = findAjoopProjectsByQuery(tokens, locale, registry);
  const term = found.terms.join(", ");

  if (!found.matches.length) {
    return ajoopResponse(
      ajoopEvidenceText(
        "No matching projects are listed in the portfolio data.",
        "Portfolyo verisinde eşleşen proje listelenmiyor.",
        locale,
      ),
      { mode: "filter", terms: found.terms, total: 0 },
    );
  }

  const cards = found.matches
    .map((id) => buildAjoopProjectCard(id, locale, registry))
    .filter(Boolean);
  const heading = term
    ? ajoopEvidenceText("Projects using {term}", "{term} kullanılan projeler", locale).replace(
        "{term}",
        term,
      )
    : ajoopEvidenceText("Matching projects", "Eşleşen projeler", locale);
  /* Neutral count rather than a pluralized "N more", which would need a plural
   * rule per locale to stay grammatical. */
  const more =
    found.total > cards.length
      ? ` ${ajoopEvidenceText("Showing {shown} of {total}.", "{total} projeden {shown} tanesi gösteriliyor.", locale)
          .replace("{shown}", String(cards.length))
          .replace("{total}", String(found.total))}`
      : "";
  return ajoopResponse(`${heading}:${more}`, {
    cards,
    mode: "filter",
    terms: found.terms,
    total: found.total,
  });
}

/**
 * The honest answer when an entity has no structured evidence record.
 *
 * Employer entities (CBOT, Outlier) are the common case: V1 stores no
 * structured experience data, so an evidence card would have to be written
 * rather than read.
 */
function buildAjoopNoEvidenceResponse(language) {
  const locale = ajoopEvidenceLocale(language);
  return ajoopResponse(
    ajoopEvidenceText(
      "A structured evidence card is not available for this item yet, so I will not improvise one.",
      "Bu öğe için yapılandırılmış kanıt kartı henüz yok, bu yüzden uydurmuyorum.",
      locale,
    ),
    { mode: "prove", cards: [] },
  );
}

/* ---------- 4.3 grounding hand-off ---------- */

/**
 * The evidence model as a plain, transport-ready object.
 *
 * Ajoop 4.3 will run a local n8n + Ollama pipeline. That model must be grounded
 * in these exact facts rather than its own recollection, so the contract is
 * defined here, now, while the only consumer is a DOM renderer: everything a
 * prompt would need is already in the response object, and nothing about it
 * assumes a panel. Nothing is sent anywhere in 4.2 — this is the shape, not the
 * transport.
 */
function serializeAjoopEvidence(route, response, language) {
  const locale = ajoopEvidenceLocale(language);
  const cards = (response && response.cards) || [];
  return {
    intent: (route && route.intent) || null,
    entity: (route && route.entity) || null,
    facet: (route && route.facet) || null,
    mode: (response && response.mode) || null,
    locale,
    depth: (route && route.depth) || "normal",
    evidence: cards.map((card) => ({
      type: card.type,
      entityId: card.entityId,
      title: card.title,
      summary: card.summary,
      meta: card.meta,
      tags: card.tags,
      proof: card.proof,
      sources: card.links.map((link) => ({ kind: link.kind, url: link.url })),
    })),
    comparison: response && response.comparison
      ? {
          left: response.comparison.left.entityId,
          right: response.comparison.right.entityId,
          rows: response.comparison.rows.map((row) => ({ key: row.key, a: row.a, b: row.b })),
        }
      : null,
  };
}
/* ajoop-evidence:end */
