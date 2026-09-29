/**
 * Project catalog projection, slug resolution and URL helpers.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1535-1624.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
/* project-detail-data:start
 * Detail records rendered by /projects/<slug>/ (and the legacy shell).
 *
 * CANONICAL SOURCE: data/portfolio/project-details.json
 * Do NOT add project facts here. Edit that JSON and run `npm run data:generate`.
 *
 * These 25 records previously lived in this file as two hand-maintained object
 * literals (projectDetailData + githubRepositoryProjectDetails, ~1,730 lines)
 * merged with Object.assign. They are now projected from the generated
 * registry, which portfolio-data.js defines synchronously before this file
 * runs — see script.js for the boot order contract.
 *
 * Treat this as read-only configuration; nothing here mutates the registry.
 * If the registry is unavailable the map is empty and project-detail.html
 * falls back to its unknown-slug behaviour rather than throwing.
 */
const projectDetailData =
  (window.KAAN_PORTFOLIO && window.KAAN_PORTFOLIO.projectDetails) || {};
/* project-detail-data:end */

function translateProjectField(field, language = (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en")) {
  if (typeof getLocalizedValue === "function") return getLocalizedValue(field, language);
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[language] || field.en || Object.values(field)[0] || "";
}

function translateProjectDisplayLabel(label, language = (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en")) {
  if (!label) return "";
  const locale = typeof normalizeLocaleId === "function" ? normalizeLocaleId(language) : String(language || "en");
  const fallbackLocale = typeof siteLocaleRegistry !== "undefined" ? siteLocaleRegistry.defaultLocale : "en";
  if (locale === fallbackLocale) return label;
  return (typeof getPackPhrase === "function" && getPackPhrase(label, locale)) || label;
}

/* project-routing:start
 * Project URL and slug resolution for both route shapes.
 *
 *   canonical : /projects/<slug>/            (generated static page)
 *   legacy    : /project-detail.html?project=<slug>   (compatibility shell)
 *
 * Every first-party URL is root-relative (Clean Public URLs V1), so one URL
 * means the same thing on /, /tr/works/ and /de/projects/<slug>/ alike and no
 * page has a depth to declare. The site root is "/" unless a page declares
 * `<body data-site-root>`, which keeps the site relocatable without rewriting
 * any route string.
 */

/** Pathname of the site root: the prefix every emitted URL starts from. */
function siteRootPrefix() {
  const routes = window.KAAN_LOCALE_ROUTES;
  if (routes) return routes.siteRootPathname();
  return (document.body && document.body.dataset.siteRoot) || "/";
}

/** A URL is external, protocol-relative or a bare fragment: never rewritten. */
function isExternalUrl(url) {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(String(url || ""));
}

/**
 * Turns a route or asset path into the URL to emit on the current page,
 * keeping page links inside the current locale.
 *
 * Accepts root-relative clean routes (`/works/`, `/?role=applied-ai`) and
 * site-relative paths (`projects/<slug>/`, `assets/logo.webp`). Every URL the
 * renderers emit goes through here, so a German page never links a reader back
 * into English by accident, assets never grow a locale prefix they do not have
 * on disk, and a pre-migration `works.html` still lands on `/works/`.
 */
function siteUrl(path) {
  const value = String(path || "");
  if (!value || isExternalUrl(value)) return value;
  const routes = window.KAAN_LOCALE_ROUTES;
  if (!routes) return value.startsWith("/") ? value : `${siteRootPrefix()}${value}`;
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "en";
  return routes.localizedInternalHref(value, locale, { siteRoot: siteRootPrefix() });
}

/** The canonical URL for a project, in the current locale. */
function projectUrl(slug) {
  return siteUrl(`projects/${encodeURIComponent(slug)}/`);
}

/**
 * Resolves which project the current page is showing.
 *
 * A generated page states its slug declaratively; the legacy route carries it
 * in the query string. Generated pages win so a stray query parameter cannot
 * make /projects/sinama/ render a different project.
 */
function resolveCurrentProjectSlug() {
  const declared = document.body && document.body.dataset.projectSlug;
  if (declared) return declared;
  return new URLSearchParams(window.location.search).get("project");
}
/* project-routing:end */

function escapeProjectHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
