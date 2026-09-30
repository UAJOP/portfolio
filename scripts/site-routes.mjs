/**
 * site-routes.mjs — the canonical public route contract (Clean Public URLs V1).
 *
 * One registry, data/site/routes.json, answers "what are this site's pages and
 * where do they live?" for every generator, the sitemap, QA and — through the
 * generated i18n-data.js — the browser. Three things that used to be one
 * string are kept apart here:
 *
 *     route    the public URL key          "works/"            -> /works/, /tr/works/
 *     source   the authored English file   "works/index.html"
 *     output   the file serving a locale   "tr/works/index.html"
 *     legacy   the pre-migration URL       "works.html"        -> compatibility stub
 *
 * Route strings are mapped by js/core/locale-routes.js, evaluated here in a
 * sandbox against the same table the browser receives, so build time and
 * runtime cannot disagree about a URL. This module adds only what a browser
 * never needs: file layout, the sitemap and the legacy stub documents.
 *
 * Node built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const readJson = (file) => JSON.parse(readText(file));

export const ROUTES_FILE = "data/site/routes.json";

/** A clean page route: "" (home) or lowercase kebab segments ending in "/". */
const PAGE_ROUTE_SHAPE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/;
const LEGACY_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;
export const RENDERER_OWNERS = Object.freeze(["legacy", "react"]);

function assertRenderer(value, label) {
  if (!RENDERER_OWNERS.includes(value)) {
    throw new Error(`${ROUTES_FILE}: ${label} renderer must be one of ${RENDERER_OWNERS.join(", ")}; received ${JSON.stringify(value)}`);
  }
  return value;
}

/* ---------- registry ---------- */

/**
 * The validated route registry.
 *
 * Validation is strict because every generated file path and every public URL
 * derives from these strings: a malformed route would otherwise surface as a
 * broken deploy rather than a failed build.
 */
export function validateSiteRoutes(data) {
  if (data.schemaVersion !== 1) throw new Error(`${ROUTES_FILE}: unsupported schemaVersion ${data.schemaVersion}`);
  if (!/^https:\/\/[a-z0-9.-]+$/.test(data.origin || "")) throw new Error(`${ROUTES_FILE}: origin must be an https origin without a path`);

  const ids = new Set();
  const routes = new Set();
  const legacies = new Set();
  const pages = (data.pages || []).map((page) => {
    if (!page.id || ids.has(page.id)) throw new Error(`${ROUTES_FILE}: duplicate or missing page id ${page.id}`);
    if (typeof page.route !== "string" || !PAGE_ROUTE_SHAPE.test(page.route)) {
      throw new Error(`${ROUTES_FILE}: ${page.id} route ${JSON.stringify(page.route)} is not a clean directory route`);
    }
    if (routes.has(page.route)) throw new Error(`${ROUTES_FILE}: route ${page.route} is declared twice`);
    if (page.route.startsWith("projects/")) throw new Error(`${ROUTES_FILE}: projects/ is reserved for canonical project routes`);
    assertRenderer(page.renderer, `page ${page.id}`);
    if (page.legacy !== undefined) {
      if (!LEGACY_SHAPE.test(page.legacy) || legacies.has(page.legacy)) {
        throw new Error(`${ROUTES_FILE}: ${page.id} legacy path ${page.legacy} is invalid or duplicated`);
      }
      legacies.add(page.legacy);
    }
    ids.add(page.id);
    routes.add(page.route);
    return { ...page, source: sourceDocumentFor(page.route) };
  });
  if (!pages.some((page) => page.route === "")) throw new Error(`${ROUTES_FILE}: the site root must be a declared page`);

  const companions = (data.companions || []).map((companion) => {
    if (!companion.id || ids.has(companion.id)) throw new Error(`${ROUTES_FILE}: duplicate or missing companion id ${companion.id}`);
    if (!/^[a-z0-9-]+\.html$/.test(companion.document || "")) throw new Error(`${ROUTES_FILE}: companion ${companion.id} needs a root .html document`);
    assertRenderer(companion.renderer, `companion ${companion.id}`);
    ids.add(companion.id);
    return companion;
  });

  const projects = data.projects || {};
  if (projects.route !== "projects/{slug}/") throw new Error(`${ROUTES_FILE}: project routes must stay projects/{slug}/`);
  assertRenderer(projects.renderer, "project route family");

  return { ...data, pages, companions, projects };
}

export function loadSiteRoutes() {
  return validateSiteRoutes(readJson(ROUTES_FILE));
}

/**
 * The authored English document for a clean route.
 *
 * English pages are written where they are served: `works/` is authored as
 * `works/index.html`. The pre-migration `works.html` path is a generated
 * compatibility stub, never a second copy of the page.
 */
export function sourceDocumentFor(route) {
  return `${route}index.html`;
}

/**
 * What the browser receives in i18n-data.js: ids, routes and legacy keys only.
 * Sitemap weights and file layout are build-time facts and stay out of the
 * runtime payload.
 */
export function browserRouteTable(site = loadSiteRoutes()) {
  return {
    pages: site.pages.map(({ id, route, legacy }) => (legacy ? { id, route, legacy } : { id, route })),
    companions: site.companions.map((companion) => companion.document),
    projectRoute: site.projects.route,
  };
}

/* ---------- shared runtime mapper ---------- */

/**
 * The production route mapper, evaluated against the canonical data.
 *
 * The config is built from the registries directly rather than read back from
 * the generated i18n-data.js, so generation never depends on a stale artifact;
 * `i18n:generate --check` separately proves the artifact matches.
 */
export function loadRouteRuntime(localeRegistry, site = loadSiteRoutes()) {
  const sandbox = {
    window: {
      KAAN_I18N: {
        defaultLocale: localeRegistry.defaultLocale,
        locales: localeRegistry.locales,
        routeTable: browserRouteTable(site),
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readText("js/core/locale-routes.js"), sandbox, { filename: "js/core/locale-routes.js" });
  const runtime = sandbox.window.KAAN_LOCALE_ROUTES;
  if (!runtime) throw new Error("js/core/locale-routes.js did not publish window.KAAN_LOCALE_ROUTES");
  return runtime;
}

/** Absolute canonical URL for a route key in a locale: always a clean directory. */
export function absoluteRouteUrl(routes, routeKey, locale, origin) {
  return `${origin}/${routes.localizedRouteKey(routeKey, locale)}`;
}

/* ---------- sitemap ---------- */

/**
 * sitemap.xml over canonical indexable routes only.
 *
 * Both the localized-route generator and the project generator write the
 * sitemap; they share this one renderer so the file cannot flip between two
 * slightly different outputs depending on which ran last.
 */
export function renderSitemap({ routes, indexableRoutes, locales, origin }) {
  const entries = [];
  for (const route of indexableRoutes) {
    for (const locale of locales) {
      entries.push([absoluteRouteUrl(routes, route.page, locale, origin), route.changefreq, route.priority]);
    }
  }
  const body = entries
    .map(([loc, changefreq, priority]) => `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/* ---------- legacy compatibility stubs ---------- */

export const LEGACY_STUB_MARKER = "GENERATED legacy compatibility stub";

const escapeHtml = (value) =>
  String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/**
 * The document left at a pre-migration `.html` URL.
 *
 * GitHub Pages cannot answer with a real 301, so the stub does the next best
 * things, in order of strength:
 *   1. `rel=canonical` to the clean URL, so search engines consolidate onto it
 *      instead of indexing a duplicate;
 *   2. an inline `location.replace()` that carries the query and fragment over
 *      (`/works.html?role=x#y` -> `/works/?role=x#y`) without adding a history
 *      entry, so Back does not bounce the reader into the stub again;
 *   3. an instant meta refresh for readers without JavaScript — search engines
 *      treat a zero-second refresh as a permanent redirect;
 *   4. a plain link, for anything that follows none of the above.
 *
 * The stub is deliberately not `noindex`: combining noindex with a canonical
 * sends conflicting signals, and the canonical plus instant refresh is what
 * moves existing ranking onto the clean URL.
 */
export function renderLegacyStub({ locale, htmlLang, dir, legacyPath, targetPath, canonicalUrl, title, notice }) {
  return [
    "<!DOCTYPE html>",
    `<!--`,
    `${LEGACY_STUB_MARKER}. Do not edit.`,
    `Legacy URL: /${legacyPath}`,
    `Canonical route: ${targetPath}`,
    `Locale: ${locale}`,
    `Generator: scripts/generate-localized-routes.mjs`,
    `Registry: ${ROUTES_FILE}`,
    `-->`,
    `<html lang="${escapeHtml(htmlLang)}" dir="${escapeHtml(dir)}">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0"/>`,
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}"/>`,
    `<script>location.replace(${JSON.stringify(targetPath)}+location.search+location.hash);</script>`,
    `<meta http-equiv="refresh" content="0; url=${escapeHtml(targetPath)}"/>`,
    `</head>`,
    `<body>`,
    `<main>`,
    `<p>${escapeHtml(notice)} <a href="${escapeHtml(targetPath)}">${escapeHtml(canonicalUrl)}</a></p>`,
    `</main>`,
    `</body>`,
    `</html>`,
    "",
  ].join("\n");
}

/** True when a file on disk is a generated legacy stub (safe to overwrite). */
export function isLegacyStub(html) {
  return typeof html === "string" && html.includes(LEGACY_STUB_MARKER);
}
