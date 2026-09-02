/**
 * Deterministic entity recognition for Ajoop (Ajoop 4.0 Brain).
 *
 * Entities are the "what is this question about" half of routing; the keyword
 * map in assistant.js is the "what kind of question is it" half. Keeping them
 * apart is what lets "hangi teknolojileri kullaniyor?" resolve against SINAMA
 * without SINAMA appearing in the sentence at all.
 *
 * Loads after js/ajoop/matcher.js and reuses its tokenizer, so Turkish casing
 * and the short-keyword collision guards apply to entity aliases too.
 */
/* ajoop-entities:start
 * Locale-independent entity extraction. Keep this block DOM-free so QA can
 * evaluate it standalone the way scripts/qa-ajoop-intents.mjs does with the
 * matcher block.
 *
 * ALIASES ARE DERIVED, NOT DUPLICATED. Project names, slugs and technology
 * names come from window.KAAN_PORTFOLIO, so a registry edit changes what Ajoop
 * recognizes with no edit here. The curated maps below carry only the aliases
 * canonical data cannot produce: spoken short forms, Turkish spellings, job
 * titles, and the employer names V1 has no structured record for.
 */

/** Alias tokens too generic to identify anything on their own. */
const AJOOP_GENERIC_ALIAS_TOKENS = new Set([
  "app",
  "apps",
  "web",
  "site",
  "website",
  "project",
  "projects",
  "proje",
  "system",
  "design",
  "data",
  "lab",
  "labs",
  "page",
  "tool",
  "tools",
  "studio",
  "official",
  "the",
  "and",
  "ile",
  "ve",
]);

/** A single-token alias needs this much length to stand alone. */
const AJOOP_MIN_SINGLE_TOKEN_ALIAS = 4;

/**
 * Aliases canonical data cannot produce.
 *
 * Everything here is a naming fact (how a visitor says the thing), never a
 * portfolio fact. Summaries, stacks, links and proof stay in the registry.
 */
const AJOOP_CURATED_PROJECT_ALIASES = {
  sinama: ["sinama"],
  mergeRush: ["merge rush", "mergerush", "tiny factory"],
  joyday: ["joyday", "atolye joyday", "atölye joyday"],
  chatbotFlow: ["chatbot flow", "ai flow", "flow design", "akış tasarımı"],
  hospital: ["hospital", "hastane", "hospital system", "hospital form"],
};

/** Employers and clients. V1 has no structured experience record for these. */
const AJOOP_EXPERIENCE_ENTITIES = [
  { id: "cbot", aliases: ["cbot"] },
  { id: "outlier", aliases: ["outlier", "outlier ai"] },
  { id: "punto", aliases: ["punto"] },
  { id: "oceans-team", aliases: ["oceans team", "ocean team"] },
];

/** Job titles a recruiter types, mapped onto the canonical recruiter profiles. */
const AJOOP_ROLE_ALIASES = {
  "applied-ai": [
    "applied ai",
    "ai engineer",
    "ai mühendisi",
    "machine learning engineer",
  ],
  "solution-engineering": [
    "solution engineer",
    "solution engineering",
    "forward deployed",
    "forward deployed engineer",
    "çözüm mühendisi",
  ],
  software: [
    "software engineer",
    "software developer",
    "backend engineer",
    "yazılım mühendisi",
    "yazılım geliştirici",
  ],
  game: ["game developer", "game engineer", "oyun geliştirici"],
};

/**
 * Which intent an entity votes for when the message alone is ambiguous.
 *
 * Registry ids that are already intent ids resolve to themselves at route time.
 * Only the two that are not are named here.
 */
const AJOOP_ENTITY_INTENT_FALLBACK = {
  chatbotFlow: "ai",
  hospital: "projects",
};

const AJOOP_ENTITY_TYPE_INTENT = {
  project: "projects",
  projectDetail: "projects",
  experience: "experience",
  role: "roles",
  tech: "stack",
};

/** Normalized alias form: the tokenizer's own view of the phrase, rejoined. */
function ajoopAliasPhrase(value) {
  return tokenizeIntentText(value)
    .map((token) => token.base)
    .join(" ");
}

/** True when an alias carries enough signal to identify an entity alone. */
function isUsableAjoopAlias(phrase) {
  if (!phrase) return false;
  const tokens = phrase.split(" ").filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.length > 1) return true;
  const token = tokens[0];
  if (AJOOP_GENERIC_ALIAS_TOKENS.has(token)) return false;
  /* "c#" and "c++" are short but unambiguous. */
  if (/[#+]/.test(token)) return token.length >= 2;
  return token.length >= AJOOP_MIN_SINGLE_TOKEN_ALIAS;
}

/**
 * The identifying head of a display name.
 *
 *   "SINAMA — AI Agent Reliability Lab" -> "sinama"
 *   "Merge Rush: Tiny Factory"          -> "merge rush"
 *
 * Names without a separator come back unchanged.
 */
function ajoopNameHead(name) {
  return ajoopAliasPhrase(String(name || "").split(/[—–:|(]/)[0]);
}

function addAjoopAlias(entity, value) {
  const phrase = ajoopAliasPhrase(value);
  if (!isUsableAjoopAlias(phrase)) return;
  if (!entity.aliases.includes(phrase)) entity.aliases.push(phrase);
}

function createAjoopEntity(id, type, extra) {
  return Object.assign({ id, type, aliases: [] }, extra || {});
}

/**
 * Builds the entity index from canonical registry data plus the curated alias
 * maps. Pure: takes the registry, returns a new index, touches no globals.
 */
function buildAjoopEntityIndex(registry) {
  const byId = new Map();
  const add = (entity) => {
    byId.set(entity.id, entity);
    return entity;
  };

  const projects = (registry && registry.projects) || {};
  Object.keys(projects).forEach((projectId) => {
    const project = projects[projectId];
    const entity = add(createAjoopEntity(projectId, "project", { projectId }));
    addAjoopAlias(entity, project.name);
    addAjoopAlias(entity, ajoopNameHead(project.name));
    (AJOOP_CURATED_PROJECT_ALIASES[projectId] || []).forEach((alias) =>
      addAjoopAlias(entity, alias),
    );
  });

  const details = (registry && registry.projectDetails) || {};
  Object.keys(details).forEach((slug) => {
    if (byId.has(slug)) return;
    const detail = details[slug];
    const entity = add(createAjoopEntity(slug, "projectDetail", { slug }));
    addAjoopAlias(entity, slug.replace(/-/g, " "));
    ["en", "tr"].forEach((language) =>
      addAjoopAlias(entity, detail && detail.title && detail.title[language]),
    );
    addAjoopAlias(entity, ajoopNameHead(detail && detail.title && detail.title.en));
  });

  AJOOP_EXPERIENCE_ENTITIES.forEach((record) => {
    const entity = add(createAjoopEntity(record.id, "experience"));
    record.aliases.forEach((alias) => addAjoopAlias(entity, alias));
  });

  const profiles = (registry && registry.recruiterProfiles) || {};
  Object.keys(profiles).forEach((roleId) => {
    const profile = profiles[roleId];
    const entity = add(createAjoopEntity(roleId, "role", { roleId }));
    ["en", "tr"].forEach((language) => {
      addAjoopAlias(entity, profile && profile.label && profile.label[language]);
      addAjoopAlias(
        entity,
        profile && profile.focusTitle && profile.focusTitle[language],
      );
    });
    (AJOOP_ROLE_ALIASES[roleId] || []).forEach((alias) => addAjoopAlias(entity, alias));
  });

  /* Technology entities are the union of every canonical stack, so the
   * recognized vocabulary tracks the portfolio instead of a parallel list. */
  const stacks = new Set();
  Object.keys(projects).forEach((id) =>
    (projects[id].stack || []).forEach((item) => stacks.add(item)),
  );
  Object.keys(details).forEach((slug) =>
    (details[slug].stack || []).forEach((item) => stacks.add(item)),
  );
  stacks.forEach((label) => {
    const phrase = ajoopAliasPhrase(label);
    if (!isUsableAjoopAlias(phrase)) return;
    const id = `tech:${phrase}`;
    if (byId.has(id)) return;
    const entity = add(createAjoopEntity(id, "tech", { label }));
    addAjoopAlias(entity, label);
  });

  /* Longest alias first: "hospital appointment system" must beat "hospital". */
  const list = Array.from(byId.values())
    .map((entity) =>
      Object.assign({}, entity, {
        aliases: entity.aliases
          .slice()
          .sort(
            (a, b) =>
              b.split(" ").length - a.split(" ").length || a.localeCompare(b),
          ),
      }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  return { byId, list };
}

let ajoopEntityIndexCache = null;

/** Memoized index over the live registry. Rebuilt only if the registry swaps. */
function getAjoopEntityIndex(registry) {
  const source =
    registry || (typeof window !== "undefined" ? window.KAAN_PORTFOLIO : null);
  if (!ajoopEntityIndexCache || ajoopEntityIndexCache.source !== source) {
    ajoopEntityIndexCache = { source, index: buildAjoopEntityIndex(source) };
  }
  return ajoopEntityIndexCache.index;
}

function getAjoopEntity(id, registry) {
  if (!id) return null;
  return getAjoopEntityIndex(registry).byId.get(id) || null;
}

/** The intent an entity votes for, given the intent ids that actually exist. */
function ajoopEntityIntent(entity, knownIntentIds) {
  if (!entity) return null;
  if (knownIntentIds && knownIntentIds.has(entity.id)) return entity.id;
  return (
    AJOOP_ENTITY_INTENT_FALLBACK[entity.id] ||
    AJOOP_ENTITY_TYPE_INTENT[entity.type] ||
    null
  );
}

/**
 * Every entity mentioned in `tokens`, most specific first.
 *
 * `specificity` is the matched alias's token count, which is what makes
 * "hospital appointment system" outrank a bare "hospital" deterministically.
 */
function extractAjoopEntities(tokens, registry) {
  if (!tokens || !tokens.length) return [];
  const index = getAjoopEntityIndex(registry);
  const found = [];
  index.list.forEach((entity) => {
    const alias = entity.aliases.find((candidate) =>
      matchesKeyword(tokens, candidate),
    );
    if (!alias) return;
    found.push({
      id: entity.id,
      type: entity.type,
      alias,
      specificity: alias.split(" ").length,
    });
  });
  /* Deterministic order: specificity, then type priority, then id. */
  const typeRank = { project: 0, projectDetail: 1, role: 2, experience: 3, tech: 4 };
  return found.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      (typeRank[a.type] === undefined ? 9 : typeRank[a.type]) -
        (typeRank[b.type] === undefined ? 9 : typeRank[b.type]) ||
      a.id.localeCompare(b.id),
  );
}
/* ajoop-entities:end */
