/**
 * qa-site-routes.cjs — the canonical route contract for the CommonJS QA
 * scripts at the repository root.
 *
 * Loads the browser's own js/core/locale-routes.js against the generated route
 * table in i18n-data.js (projected from data/site/routes.json), exactly as the
 * build scripts do. QA therefore asks the production module which file serves
 * a URL instead of keeping a private list of pages that could drift.
 *
 * Node built-ins only.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("i18n-data.js"), sandbox, { filename: "i18n-data.js" });
vm.runInContext(read("js/core/locale-routes.js"), sandbox, { filename: "js/core/locale-routes.js" });
const routes = sandbox.window.KAAN_LOCALE_ROUTES;
if (!routes) throw new Error("js/core/locale-routes.js did not publish window.KAAN_LOCALE_ROUTES");

/** Clean-route pages with the authored English document that serves each. */
const pages = routes.pages.map((page) => ({ ...page, file: routes.documentPathFor(page.route) }));

/** Every authored English document: clean-route pages plus companions. */
const authoredHtmlFiles = [...pages.map((page) => page.file), ...routes.companions].sort();

/** The authored English document for a page id, e.g. "works" -> "works/index.html". */
function fileFor(id) {
  const page = pages.find((item) => item.id === id);
  if (!page) throw new Error(`unknown route id ${id}`);
  return page.file;
}

/**
 * The repository file a first-party URL resolves to, or null for an external
 * URL. Pages resolve through the route contract (so `/tr/works/` names
 * `tr/works/index.html`); anything else is a file at the site root.
 */
function fileForUrl(url) {
  const value = String(url || "");
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return null;
  const pathname = value.split("#")[0].split("?")[0];
  const key = routes.canonicalRouteKey(pathname);
  if (routes.isLocalizableRoute(key)) return routes.documentPathFor(pathname, routes.localeFromRoutePath(pathname));
  return decodeURIComponent(pathname.replace(/^\/+/, ""));
}

module.exports = { ROOT, routes, pages, authoredHtmlFiles, fileFor, fileForUrl };
