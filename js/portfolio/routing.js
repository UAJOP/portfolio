/**
 * Project catalog projection, slug resolution and URL helpers.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1535-1624.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
/* project-detail-data:start
 * Detail records rendered by project-detail.html?project=<slug>.
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

function translateProjectField(field, language) {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[language] || field.en || "";
}

function translateProjectDisplayLabel(label, language) {
  if (language !== "tr") return label;
  return i18nTranslations.tr[label] || label;
}

/* project-routing:start
 * Project URL and slug resolution for both route shapes.
 *
 *   canonical : /projects/<slug>/            (generated static page)
 *   legacy    : /project-detail.html?project=<slug>
 *
 * Generated pages sit two directories deep, so every repo-relative URL the
 * renderer emits needs a prefix. That prefix is declared by the page itself
 * (`<body data-site-root="../../">`) rather than inferred from the pathname,
 * and it stays relative rather than root-absolute so the site keeps working
 * from a subdirectory and over file://. Root pages declare nothing and get
 * "", which is exactly the behaviour that existed before.
 */

/** Prefix that turns a repo-relative path into one valid on the current page. */
function siteRootPrefix() {
  return (document.body && document.body.dataset.siteRoot) || "";
}

/** A URL is already resolved if it is absolute, root-relative or a fragment. */
function isResolvedUrl(url) {
  return /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(String(url || ""));
}

/** Rebases a repo-relative path onto the current page's depth. */
function siteUrl(path) {
  const value = String(path || "");
  if (!value || isResolvedUrl(value)) return value;
  return `${siteRootPrefix()}${value}`;
}

/** The canonical URL for a project. */
function projectUrl(slug) {
  return `${siteRootPrefix()}projects/${encodeURIComponent(slug)}/`;
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

