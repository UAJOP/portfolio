/**
 * Canonical knowledge access for Ajoop (Ajoop 4.0 Brain).
 *
 * This is an ACCESS layer, not a knowledge base. Every fact it returns is read
 * from window.KAAN_PORTFOLIO, which is generated from data/portfolio/*. Nothing
 * here restates a project fact, and a lookup that finds no canonical record
 * returns null or an empty list so callers fall back to a prepared answer
 * instead of inventing one.
 */
/* ajoop-knowledge:start
 * Keep this block DOM-free: it reads the registry and the locale helpers only.
 *
 * The registry describes projects at two levels — five flagship records under
 * `projects` and twenty-five detail records under `projectDetails`, keyed by
 * the slug the generated /projects/<slug>/ routes use. They overlap: the
 * flagship record owns the recruiter-facing summary and proof, the detail
 * record owns the stack and gallery. Ajoop wants one merged view, so the two
 * are joined here on the canonical case-study link rather than by a
 * hand-maintained id table.
 */

function getAjoopRegistry(registry) {
  return registry || (typeof window !== "undefined" ? window.KAAN_PORTFOLIO : null) || null;
}

function ajoopLocalized(value, language) {
  if (value === null || value === undefined) return "";
  if (typeof getLocalizedValue === "function") return getLocalizedValue(value, language);
  if (typeof value !== "object" || Array.isArray(value)) return value;
  return value[language] || value.en || Object.values(value)[0] || "";
}

/* Keep this as a one-line getI18nText alias: scripts/i18n-catalog.mjs detects
 * that shape and includes every literal label pair in the locale packs. */
const ajoopText = (english, turkish, language) => typeof getI18nText === "function" ? getI18nText(english, turkish, language) : language === "tr" ? turkish : english;

/** Trailing path segment of a repo-relative link, without slashes. */
function ajoopLinkTail(url) {
  return String(url || "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    .toLowerCase();
}

/** The detail slug that documents a flagship project, or null. */
function ajoopDetailSlugForProject(projectId, registry) {
  const source = getAjoopRegistry(registry);
  const project = source && source.projects && source.projects[projectId];
  const details = (source && source.projectDetails) || {};
  if (!project) return null;
  const caseStudy = (project.links && project.links.caseStudy) || "";
  if (!caseStudy) return null;

  /* Generated route shape: "projects/<slug>/" names the slug directly. */
  const tail = ajoopLinkTail(caseStudy);
  if (tail && details[tail]) return tail;

  /* Root case-study page: the detail record links back to the same page. */
  const target = String(caseStudy).toLowerCase();
  let match = null;
  Object.keys(details).forEach((slug) => {
    if (match) return;
    const links = details[slug].links || [];
    if (links.some((link) => String(link.url || "").toLowerCase() === target)) match = slug;
  });
  return match;
}

/** The flagship project a detail slug belongs to, or null. */
function ajoopProjectIdForDetail(slug, registry) {
  const source = getAjoopRegistry(registry);
  const projects = (source && source.projects) || {};
  let match = null;
  Object.keys(projects).forEach((id) => {
    if (match) return;
    if (ajoopDetailSlugForProject(id, registry) === slug) match = id;
  });
  return match;
}

/** Link kind, inferred from the URL rather than declared twice. */
function ajoopLinkKind(url) {
  const value = String(url || "");
  if (/github\.com/i.test(value)) return "github";
  if (/^mailto:/i.test(value)) return "email";
  if (/^https?:/i.test(value)) return "live";
  if (/case-study|projects\//i.test(value)) return "caseStudy";
  return "internal";
}

function ajoopLinkKindLabel(kind, language) {
  switch (kind) {
    case "github":
      return "GitHub";
    case "live":
      return ajoopText("Live Product", "Canlı Ürün", language);
    case "caseStudy":
      return ajoopText("Case Study", "Vaka Çalışması", language);
    case "games":
      return ajoopText("Games", "Oyunlar", language);
    case "email":
      return ajoopText("Email", "E-posta", language);
    default:
      return ajoopText("Open", "Aç", language);
  }
}

/**
 * Normalized project view merged from the flagship and detail records.
 *
 * Accepts a flagship id ("sinama"), a detail slug ("hospital-form-app") or an
 * entity id, since those are the three shapes callers hold. Returns null when
 * the registry knows neither.
 */
function getAjoopProject(id, language, registry) {
  const source = getAjoopRegistry(registry);
  if (!source || !id) return null;
  const projects = source.projects || {};
  const details = source.projectDetails || {};

  const projectId = projects[id] ? id : ajoopProjectIdForDetail(id, registry);
  const slug = details[id] ? id : ajoopDetailSlugForProject(projectId, registry);
  const project = projectId ? projects[projectId] : null;
  const detail = slug ? details[slug] : null;
  if (!project && !detail) return null;

  const locale =
    language ||
    (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");

  const links = [];
  if (project && project.links) {
    Object.keys(project.links).forEach((key) => {
      const url = project.links[key];
      if (!url) return;
      const kind = key === "caseStudy" || key === "live" || key === "github" || key === "games"
        ? key
        : ajoopLinkKind(url);
      links.push({ kind, url, label: ajoopLinkKindLabel(kind, locale) });
    });
  }
  if (detail && Array.isArray(detail.links)) {
    detail.links.forEach((link) => {
      if (!link || !link.url) return;
      if (links.some((existing) => existing.url === link.url)) return;
      const kind = ajoopLinkKind(link.url);
      links.push({
        kind,
        url: link.url,
        label: ajoopLocalized(link.label, locale) || ajoopLinkKindLabel(kind, locale),
      });
    });
  }

  const stack = (project && project.stack) || (detail && detail.stack) || [];
  const proof = (project && project.proof) || [];

  return {
    id: projectId || slug,
    projectId: projectId || null,
    slug: slug || null,
    name:
      (project && project.name) ||
      ajoopLocalized(detail && detail.title, locale) ||
      "",
    summary:
      ajoopLocalized(project && project.summary, locale) ||
      ajoopLocalized(detail && detail.subtitle, locale) ||
      ajoopLocalized(detail && detail.overview, locale) ||
      "",
    category:
      ajoopLocalized(project && project.category, locale) ||
      ajoopLocalized(detail && detail.category, locale) ||
      "",
    status:
      ajoopLocalized(project && project.status, locale) ||
      ajoopLocalized(detail && detail.status, locale) ||
      "",
    role:
      ajoopLocalized(project && project.role, locale) ||
      ajoopLocalized(detail && detail.role, locale) ||
      "",
    year: (detail && detail.year) || "",
    stack: stack.slice(),
    proof: proof.map((item) => ajoopLocalized(item, locale)).filter(Boolean),
    links,
  };
}

function getAjoopProjectLinks(id, language, registry) {
  const project = getAjoopProject(id, language, registry);
  return project ? project.links : [];
}

function getAjoopProjectStack(id, language, registry) {
  const project = getAjoopProject(id, language, registry);
  return project ? project.stack : [];
}

function getAjoopProjectProof(id, language, registry) {
  const project = getAjoopProject(id, language, registry);
  return project ? project.proof : [];
}

/** Recruiter profile for a capability focus, localized. Null when unknown. */
function getAjoopRoleProfile(id, language, registry) {
  const source = getAjoopRegistry(registry);
  const profile = source && source.recruiterProfiles && source.recruiterProfiles[id];
  if (!profile) return null;
  const locale =
    language ||
    (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");
  return {
    id,
    label: ajoopLocalized(profile.label, locale),
    focusTitle: ajoopLocalized(profile.focusTitle, locale),
    capabilities: (profile.capabilities || []).slice(),
    skills: (profile.skills || []).map((item) => ajoopLocalized(item, locale)).filter(Boolean),
    evidence: (profile.evidence || []).slice(),
  };
}

/** Build log entries, newest first, localized. */
function getAjoopBuildLog(limit, language, registry) {
  const source = getAjoopRegistry(registry);
  const log = (source && source.buildLog) || [];
  const locale =
    language ||
    (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");
  const entries = log.map((entry) => ({
    date: entry.date,
    area: entry.area,
    status: entry.status,
    title: ajoopLocalized(entry.title, locale),
    detail: ajoopLocalized(entry.detail, locale),
  }));
  return typeof limit === "number" ? entries.slice(0, limit) : entries;
}

/**
 * Everything canonical the site holds about one recognized entity.
 *
 * Returns null when the entity has no registry record — employer entities are
 * the common case, and the prepared `experience` answer owns those facts.
 */
function getAjoopEntityEvidence(entity, language, registry) {
  if (!entity) return null;
  const id = typeof entity === "string" ? entity : entity.id;
  const type = typeof entity === "string" ? null : entity.type;

  if (type === "role" || (!type && getAjoopRoleProfile(id, language, registry))) {
    const profile = getAjoopRoleProfile(id, language, registry);
    return profile ? { kind: "role", id, profile } : null;
  }
  if (type === "tech") return null;

  const project = getAjoopProject(id, language, registry);
  return project ? { kind: "project", id: project.id, project } : null;
}

/* ---------- Ajoop 4.2 evidence accessors ---------- */

/** Link kinds that count as a citable source rather than a navigation aid. */
const AJOOP_SOURCE_KINDS = ["caseStudy", "live", "github"];

/**
 * The citable sources for a project, in a stable order.
 *
 * A source the registry does not list simply does not appear — this is the
 * single place an evidence card could imply a repository or a live URL that
 * does not exist, so it stays a filter over canonical links and never a
 * constructor of new ones.
 */
function getAjoopProjectSources(id, language, registry) {
  const links = getAjoopProjectLinks(id, language, registry);
  return AJOOP_SOURCE_KINDS.map((kind) => links.find((link) => link.kind === kind)).filter(
    Boolean,
  );
}

/**
 * Every project id the registry can describe, flagship records first.
 *
 * Flagship records carry the recruiter-facing summary and proof, so they lead;
 * detail slugs already covered by a flagship record are dropped rather than
 * listed twice.
 */
function getAjoopCanonicalProjectIds(registry) {
  const source = getAjoopRegistry(registry);
  const flagship = Object.keys((source && source.projects) || {});
  const covered = new Set(
    flagship.map((id) => ajoopDetailSlugForProject(id, registry)).filter(Boolean),
  );
  const details = Object.keys((source && source.projectDetails) || {}).filter(
    (slug) => !covered.has(slug),
  );
  return [...flagship, ...details];
}

/**
 * Two projects side by side, reduced to the fields both records can express.
 *
 * A row is emitted only when at least one side has canonical content for it, so
 * the comparison never shows an empty column pretending to be a finding. No
 * ranking, no verdict: the rows are facts and the reader draws the conclusion.
 */
function getAjoopComparisonData(entityA, entityB, language, registry) {
  const left = getAjoopProject(entityA, language, registry);
  const right = getAjoopProject(entityB, language, registry);
  if (!left || !right || left.id === right.id) return null;
  return {
    left,
    right,
    fields: [
      { key: "category", a: left.category, b: right.category },
      { key: "summary", a: left.summary, b: right.summary },
      { key: "status", a: left.status, b: right.status },
      { key: "stack", a: left.stack, b: right.stack },
      { key: "proof", a: left.proof, b: right.proof },
    ].filter((field) => {
      const has = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));
      return has(field.a) || has(field.b);
    }),
  };
}
/* ajoop-knowledge:end */
