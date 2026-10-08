#!/usr/bin/env node
/**
 * qa-clean-routes.mjs — blocking public-URL contract (Clean Public URLs V1).
 *
 * Every public page is a clean directory URL — `/works/`, `/tr/works/`,
 * `/certificates/` — served by a real `index.html`, so a direct load, a
 * refresh and a crawler all get a real document from GitHub Pages. This suite
 * enforces that contract across every layer that produces a URL:
 *
 *   1. the route registry matches the migration table and keeps project slugs
 *   2. routeFor() / routeForProject() and the locale router produce clean URLs,
 *      preserve query and fragment, and normalize legacy `.html` input
 *   3. every (locale, route) document exists where the URL expects it
 *   4. every pre-migration `.html` URL is a compatibility stub that forwards to
 *      its clean route, and nothing links to one
 *   5. canonical, hreflang, og:url, JSON-LD and the sitemap never name `.html`
 *   6. no first-party link in any published document names a `.html` page,
 *      and every first-party src/href resolves to a real file
 *   7. AJOOP, Recruiter Mode, the Command Palette and canonical data only
 *      carry clean destinations
 *
 * Filesystem assertions may name `.html` files; public-URL assertions never
 * accept one. Node built-ins only.
 *
 *   node scripts/qa-clean-routes.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  ROOT,
  read,
  readJson,
  loadRegistry,
  loadProjectRegistry,
  indexableRoutes,
  runtimeScriptFiles,
  loadDynamicSurface,
  DYNAMIC_SURFACES,
  STATIC_ROUTES,
  COMPANION_ROUTES,
} from "./i18n-catalog.mjs";
import { loadSiteRoutes, loadRouteRuntime, isLegacyStub, browserRouteTable } from "./site-routes.mjs";
import {
  findRouteOrphans,
  isGeneratorOwnedRouteDocument,
  removeOwnedRouteOrphans,
} from "./generated-route-ownership.mjs";

let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const equal = (actual, expected, message) => assert(actual === expected, `${message}\n      expected: ${expected}\n      actual:   ${actual}`);
const exists = (file) => fs.existsSync(path.join(ROOT, file));

const site = loadSiteRoutes();
const ORIGIN = site.origin;
const registry = loadRegistry();
const ROUTES = loadRouteRuntime(registry, site);
const projects = loadProjectRegistry();
const locales = registry.locales.map((locale) => locale.id);
const localizedLocales = (registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale);
const publishedLocales = [registry.defaultLocale, ...localizedLocales];
const allRoutes = indexableRoutes(projects);

const HTML_PAGE_URL = /(?:^|\/)[a-z0-9-]+\.html(?:$|[?#])/i;
const decode = (value) =>
  String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const isExternal = (url) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
const isOwnAbsolute = (url) => url === ORIGIN || url.startsWith(`${ORIGIN}/`);

function missingLocalizedOutputs(fileExists = exists) {
  const missing = [];
  for (const locale of localizedLocales) {
    const definition = registry.byId.get(locale);
    if (!definition) {
      missing.push(`unknown locale ${locale}`);
      continue;
    }
    if (!fileExists(definition.routePrefix)) missing.push(`${definition.routePrefix}/`);
    for (const route of allRoutes) {
      const file = ROUTES.documentPathFor(route.page, locale);
      if (!fileExists(file)) missing.push(file);
    }
  }
  return missing;
}
for (const file of missingLocalizedOutputs()) assert(false, `required localized output is missing: ${file}`);

/* Regression: expected locales/pages remain in the validation set when absent. */
const simulatedMissingDirectory = missingLocalizedOutputs((file) => file === "tr" ? false : exists(file));
assert(simulatedMissingDirectory.includes("tr/"), "missing locale directory simulation must fail for tr/");
const simulatedMissingPage = missingLocalizedOutputs((file) => file === "tr/works/index.html" ? false : exists(file));
assert(simulatedMissingPage.includes("tr/works/index.html"), "missing localized page simulation must fail for tr/works/index.html");

/* Regression: only the exact leading generator headers establish ownership. */
assert(isGeneratorOwnedRouteDocument(read("tr/works/index.html")), "real generated locale page must be generator-owned");
assert(isGeneratorOwnedRouteDocument(read("tr/works.html")), "real generated legacy stub must be generator-owned");
const markerImitation = "<!doctype html><html><body><p>GENERATED FILE. Do not edit.</p></body></html>\n";
assert(!isGeneratorOwnedRouteDocument(markerImitation), "generator marker text in an authored page body must not establish ownership");

/* An unowned locale orphan must be diagnosed and survive cleanup. */
const orphanFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-route-ownership-"));
try {
  const fixture = "tr/googleexample.html";
  fs.mkdirSync(path.join(orphanFixtureRoot, "tr"), { recursive: true });
  fs.writeFileSync(path.join(orphanFixtureRoot, fixture), markerImitation);
  const classified = findRouteOrphans(orphanFixtureRoot, ["tr"], new Set());
  assert(classified.some(({ file, owned }) => file === fixture && !owned), "route generator must detect tr/googleexample.html as unowned");
  let diagnostic = "";
  try {
    removeOwnedRouteOrphans(orphanFixtureRoot, classified);
  } catch (error) {
    diagnostic = error.message;
  }
  assert(diagnostic.includes("unowned locale document"), "unowned orphan cleanup must emit a clear ownership diagnostic");
  assert(diagnostic.includes(fixture), "unowned orphan diagnostic must name tr/googleexample.html");
  assert(fs.existsSync(path.join(orphanFixtureRoot, fixture)), "tr/googleexample.html must survive refused orphan cleanup");
} finally {
  fs.rmSync(orphanFixtureRoot, { recursive: true, force: true });
}

/* ---------- 1. the route registry is the migration table ---------- */

/* The brief's mapping, restated here as a fixture on purpose: a test that read
 * its expectations from the registry could never catch the registry drifting. */
const MIGRATION = [
  ["index.html", ""],
  ["works.html", "works/"],
  ["sinama-case-study.html", "sinama-case-study/"],
  ["merge-rush-case-study.html", "merge-rush-case-study/"],
  ["now.html", "now/"],
  ["blog.html", "blog/"],
  ["about.html", "about/"],
  ["games.html", "games/"],
  ["labs.html", "labs/"],
  ["ai-flow-puzzle-case-study.html", "ai-flow-puzzle-case-study/"],
  ["atolye-joyday-case-study.html", "atolye-joyday-case-study/"],
  ["hospital-system-case-study.html", "hospital-system-case-study/"],
  ["single-work.html", "certificates/"],
  ["request.html", "request/"],
  ["adventure.html", "adventure/"],
  ["joyday-paint.html", "joyday-paint/"],
  ["ai-flow-puzzle.html", "ai-flow-puzzle/"],
  ["privacy.html", "privacy/"],
];
const PROJECT_SLUGS = [
  "ai-chatbot-flow-design", "atolye-joyday-official-website", "drivenfinity", "dunker-madness",
  "unity-essentials", "extract-shoot-zero", "tank-savage", "hospital-form-app", "cars-dataset-analysis",
  "my-museum", "weather-app", "control-panel", "hospital-appointment-system", "escape-island",
  "calculator-android-studio", "calculator-javascript", "warehouse-war", "legacy-of-the-lost", "porto-25",
  "my-java-projects", "agency-db", "mandelas-web-site-project", "pyhton-projects", "ic-supply",
  "portfolio-website",
];

/* V4-E04: routes born clean have no pre-migration URL and so no legacy stub;
 * they are named here so a page cannot join the registry unnoticed. */
const NATIVE_ROUTES = ["ajoop/", "ajoop-case-study/"];
equal(STATIC_ROUTES.filter((page) => page.legacy).length, MIGRATION.length, "the registry declares exactly the migrated static pages");
equal(STATIC_ROUTES.filter((page) => !page.legacy).map((page) => page.page).sort().join(), [...NATIVE_ROUTES].sort().join(), "pages without a legacy path are exactly the declared native routes");
for (const [legacy, route] of MIGRATION) {
  const page = STATIC_ROUTES.find((item) => item.legacy === legacy);
  assert(Boolean(page), `registry has no page for legacy ${legacy}`);
  if (!page) continue;
  equal(page.page, route, `${legacy} migrates to /${route}`);
  equal(ROUTES.canonicalRouteKey(legacy), route, `legacy input ${legacy} normalizes to its clean route`);
  equal(page.source, `${route}index.html`, `/${route} is authored where it is served`);
}
equal(
  JSON.stringify(Object.keys(projects.projectDetails).sort()),
  JSON.stringify([...PROJECT_SLUGS].sort()),
  "canonical project slugs are unchanged (renames are a separate migration)",
);
equal(readJson("data/site/routes.json").projects.route, "projects/{slug}/", "project routes stay /projects/<slug>/");
for (const companion of COMPANION_ROUTES) {
  assert(!allRoutes.some((route) => route.page === companion.page), `${companion.page} is a companion, never an indexable route`);
}

/* The browser receives the same table, not a second copy. */
const i18nSandbox = { window: {} };
vm.runInNewContext(read("i18n-data.js"), i18nSandbox, { filename: "i18n-data.js" });
equal(
  JSON.stringify(i18nSandbox.window.KAAN_I18N?.routeTable),
  JSON.stringify(browserRouteTable(site)),
  "i18n-data.js carries the registry's route table",
);

/* ---------- 2. route API and locale router ---------- */

equal(ROUTES.routeFor("works"), "/works/", 'routeFor("works")');
equal(ROUTES.routeFor("works", "en"), "/works/", 'routeFor("works", "en")');
equal(ROUTES.routeFor("works", "tr"), "/tr/works/", 'routeFor("works", "tr")');
equal(ROUTES.routeFor("home", "en"), "/", 'routeFor("home", "en")');
equal(ROUTES.routeFor("home", "de"), "/de/", 'routeFor("home", "de")');
equal(ROUTES.routeFor("certificates", "fr"), "/fr/certificates/", 'routeFor("certificates", "fr")');
equal(ROUTES.routeFor("privacy", "es"), "/es/privacy/", 'routeFor("privacy", "es")');
equal(ROUTES.routeForProject("hospital-form-app", "de"), "/de/projects/hospital-form-app/", 'routeForProject("hospital-form-app", "de")');
equal(ROUTES.routeForProject("hospital-form-app"), "/projects/hospital-form-app/", 'routeForProject("hospital-form-app")');
let unknownThrows = false;
try {
  ROUTES.routeFor("no-such-page");
} catch (error) {
  unknownThrows = true;
}
assert(unknownThrows, "routeFor() refuses an unknown id instead of inventing a URL");

for (const locale of locales) {
  for (const route of STATIC_ROUTES) {
    const url = ROUTES.routeFor(route.id, locale);
    assert(!HTML_PAGE_URL.test(url), `routeFor(${route.id}, ${locale}) produced a .html URL: ${url}`);
    assert(url.endsWith("/"), `routeFor(${route.id}, ${locale}) must be a directory URL: ${url}`);
  }
  for (const slug of PROJECT_SLUGS) {
    equal(
      ROUTES.routeForProject(slug, locale),
      `/${ROUTES.localeRoutePrefix(locale)}projects/${slug}/`,
      `project ${slug} keeps its route in ${locale}`,
    );
  }
}

/** The language switch, run against a browser-shaped location. */
function switchLocale(href, locale) {
  const url = new URL(href, `${ORIGIN}/`);
  const sandbox = {
    window: {
      KAAN_I18N: { defaultLocale: registry.defaultLocale, locales: registry.locales, routeTable: browserRouteTable(site) },
      location: { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash },
    },
    document: { body: { dataset: {} }, documentElement: { getAttribute: () => null } },
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("js/core/locale-routes.js"), sandbox, { filename: "js/core/locale-routes.js" });
  return sandbox.window.KAAN_LOCALE_ROUTES.localizedHrefForCurrentPage(locale);
}

for (const [from, locale, expected] of [
  ["/works/", "tr", "/tr/works/"],
  ["/tr/works/", "de", "/de/works/"],
  ["/about/?x=1", "fr", "/fr/about/?x=1"],
  ["/?role=applied-ai", "tr", "/tr/?role=applied-ai"],
  ["/tr/?role=applied-ai", "en", "/?role=applied-ai"],
  ["/about/#skills", "de", "/de/about/#skills"],
  ["/projects/foo/?source=ajoop", "es", "/es/projects/foo/?source=ajoop"],
  ["/projects/hospital-form-app/", "tr", "/tr/projects/hospital-form-app/"],
  ["/tr/projects/hospital-form-app/", "en", "/projects/hospital-form-app/"],
  ["/certificates/", "fr", "/fr/certificates/"],
  ["/privacy/", "es", "/es/privacy/"],
  ["/works/?utm_source=x&role=software#top", "de", "/de/works/?role=software#top"],
  /* legacy input, normalized */
  ["/tr/about.html", "tr", "/tr/about/"],
  ["/works.html?role=applied-ai#cards", "fr", "/fr/works/?role=applied-ai#cards"],
  ["/single-work.html", "de", "/de/certificates/"],
  ["/index.html", "tr", "/tr/"],
  ["/de/index.html", "en", "/"],
  ["/project-detail.html?project=hospital-form-app", "de", "/de/projects/hospital-form-app/"],
  ["/works", "tr", "/tr/works/"],
]) {
  equal(switchLocale(from, locale), expected, `language switch ${from} -> ${locale}`);
}

/** The legacy project shell uses the same query-preservation contract. */
function legacyProjectRedirect(search, hash = "") {
  let replaced = null;
  const sandbox = {
    window: {
      KAAN_LOCALE_ROUTES: { preservedRouteSearch: ROUTES.preservedRouteSearch },
      location: { search, hash, replace: (value) => { replaced = value; } },
    },
    document: {
      body: { dataset: {} },
      querySelector: (selector) => selector === "[data-project-detail]" ? {} : null,
    },
    projectDetailData: { "hospital-form-app": {} },
    projectUrl: (slug) => `/projects/${slug}/`,
    URLSearchParams,
  };
  vm.createContext(sandbox);
  const source = read("js/portfolio/project-detail.js").replace(
    /\nredirectLegacyProjectShell\(\);\s*\nrenderProjectDetail\(\);\s*$/,
    "\n",
  );
  vm.runInContext(source, sandbox, { filename: "js/portfolio/project-detail.js" });
  const redirected = sandbox.redirectLegacyProjectShell();
  return { redirected, replaced };
}

for (const [search, hash, expected] of [
  ["?project=hospital-form-app", "", "/projects/hospital-form-app/"],
  ["?project=hospital-form-app&role=applied-ai", "", "/projects/hospital-form-app/?role=applied-ai"],
  ["?project=hospital-form-app&source=ajoop", "", "/projects/hospital-form-app/?source=ajoop"],
  [
    "?project=hospital-form-app&role=applied-ai&source=ajoop",
    "#x",
    "/projects/hospital-form-app/?role=applied-ai&source=ajoop#x",
  ],
  [
    "?project=hospital-form-app&utm_source=campaign&role=applied-ai&gclid=click",
    "",
    "/projects/hospital-form-app/?role=applied-ai",
  ],
]) {
  const result = legacyProjectRedirect(search, hash);
  assert(result.redirected, `legacy project shell must redirect ${search}${hash}`);
  equal(result.replaced, expected, `legacy project shell target for ${search}${hash}`);
}
for (const search of ["?project=unknown-project", "?project=..%2Fhospital-form-app"]) {
  const result = legacyProjectRedirect(search, "#x");
  assert(!result.redirected, `legacy project shell must not redirect malformed/unknown ${search}`);
  equal(result.replaced, null, `legacy project shell must not replace location for ${search}`);
}

/* Every route in every locale, from every locale: clean, prefix-exact, lossless. */
for (const route of allRoutes) {
  for (const from of locales) {
    const fromUrl = `/${ROUTES.localizedRouteKey(route.page, from)}`;
    for (const to of locales) {
      const switched = switchLocale(fromUrl, to);
      equal(switched, `/${ROUTES.localizedRouteKey(route.page, to)}`, `${fromUrl} -> ${to}`);
      assert(!HTML_PAGE_URL.test(switched), `language switch produced a .html URL: ${switched}`);
    }
  }
}

/* ---------- 3. every clean URL is a real document ---------- */

for (const locale of publishedLocales) {
  for (const route of allRoutes) {
    const file = ROUTES.documentPathFor(route.page, locale);
    const url = `/${ROUTES.localizedRouteKey(route.page, locale)}`;
    assert(exists(file), `${url} has no document at ${file}: a direct load or refresh would 404`);
    assert(file === `${url.slice(1)}index.html`, `${url} must be served by its own directory index, not ${file}`);
  }
}
assert(!exists("project-detail"), "no /project-detail/ route may exist: the legacy shell is not a public route");
assert(!exists("404"), "no /404/ route may exist");
for (const [legacy, route] of MIGRATION) {
  if (!route) continue;
  assert(!exists(`${route}${legacy}`), `/${route} must not also carry a nested ${legacy}`);
}

/* ---------- 4. legacy `.html` URLs forward to their clean route ---------- */

const legacyStubFiles = new Set();
for (const locale of publishedLocales) {
  const prefix = ROUTES.localeRoutePrefix(locale);
  const definition = registry.byId.get(locale);
  for (const [legacy, route] of MIGRATION) {
    if (!route) {
      /* /index.html and /tr/index.html ARE the home documents; their canonical names the clean root. */
      const home = read(`${prefix}index.html`);
      equal(
        home.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0].match(/href="([^"]+)"/)?.[1],
        `${ORIGIN}/${prefix}`,
        `/${prefix}index.html canonicalizes to the clean /${prefix}`,
      );
      continue;
    }
    const file = `${prefix}${legacy}`;
    const target = `/${prefix}${route}`;
    const canonical = `${ORIGIN}${target}`;
    legacyStubFiles.add(file);
    assert(exists(file), `legacy URL /${file} must keep resolving (compatibility stub missing)`);
    if (!exists(file)) continue;
    const html = read(file);
    assert(isLegacyStub(html), `/${file} must be a generated compatibility stub, not a duplicate page`);
    assert(html.length < 2000, `/${file} must stay a minimal stub (${html.length} bytes)`);
    assert(!/script\.js|portfolio-data\.js|style\.css/.test(html), `/${file} must not load the site runtime`);
    equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], canonical, `/${file} canonical`);
    equal(html.match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/)?.[1], target, `/${file} no-JS refresh target`);
    equal(
      html.match(/location\.replace\(("[^"]+")\+location\.search\+location\.hash\)/)?.[1],
      JSON.stringify(target),
      `/${file} forwards with query and fragment preserved`,
    );
    assert(html.indexOf("location.replace") < html.indexOf('http-equiv="refresh"'), `/${file} runs the query-preserving redirect before the refresh`);
    assert(html.includes(`<a href="${target}">`), `/${file} offers a plain link to ${target}`);
    equal(html.match(/<html lang="([^"]+)"/)?.[1], definition.htmlLang, `/${file} declares its locale`);
    assert(/<title>[^<]+<\/title>/.test(html), `/${file} has a title`);
    assert(!/noindex/.test(html), `/${file} consolidates through its canonical instead of noindex`);
  }
}

/* ---------- 5 + 6. published documents: SEO and links ---------- */

const published = [];
for (const locale of publishedLocales) {
  for (const route of [...allRoutes, ...COMPANION_ROUTES]) {
    published.push({ file: ROUTES.documentPathFor(route.page, locale), route, locale });
  }
}

const jsonLdUrls = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((item) => jsonLdUrls(item, out));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && isOwnAbsolute(value)) out.push([key, value]);
      else jsonLdUrls(value, out);
    }
  }
  return out;
};

let linkCount = 0;
for (const { file, route, locale } of published) {
  if (!exists(file)) continue;
  const html = read(file);
  const companion = route.indexable === false;

  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0].match(/href="([^"]+)"/)?.[1];
  if (companion) {
    assert(canonical === undefined, `${file} is a companion and must not claim a canonical URL`);
    assert(/<meta[^>]*name="robots"[^>]*content="noindex/.test(html) || /<meta[^>]*content="noindex[^"]*"[^>]*name="robots"/.test(html), `${file} must stay noindex`);
  } else {
    equal(canonical, `${ORIGIN}/${ROUTES.localizedRouteKey(route.page, locale)}`, `${file} canonical`);
  }
  for (const [, href] of html.matchAll(/<link[^>]*hreflang="[^"]*"[^>]*href="([^"]+)"/g)) {
    assert(!HTML_PAGE_URL.test(href), `${file} hreflang names a .html URL: ${href}`);
  }
  const ogUrl = html.match(/<meta[^>]*property="og:url"[^>]*>/)?.[0].match(/content="([^"]+)"/)?.[1];
  if (ogUrl) assert(!HTML_PAGE_URL.test(ogUrl), `${file} og:url names a .html URL: ${ogUrl}`);
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data = null;
    try {
      data = JSON.parse(body);
    } catch (error) {
      assert(false, `${file} has unparseable JSON-LD`);
    }
    for (const [key, url] of jsonLdUrls(data)) {
      assert(!HTML_PAGE_URL.test(url), `${file} JSON-LD ${key} names a .html URL: ${url}`);
    }
  }

  for (const [, attribute, raw] of html.matchAll(/\s(href|src|data-case-gallery|data-cert|data-game-link|data-project-link)="([^"]*)"/g)) {
    const value = decode(raw);
    if (!value || isExternal(value)) {
      if (isOwnAbsolute(value)) assert(!HTML_PAGE_URL.test(value), `${file} links a .html URL: ${value}`);
      continue;
    }
    if (attribute === "data-project-link" && /^[a-z0-9-]+$/.test(value)) {
      assert(PROJECT_SLUGS.includes(value), `${file} card names an unknown project ${value}`);
      continue;
    }
    linkCount += 1;
    const pathname = value.split("#")[0].split("?")[0];
    assert(value.startsWith("/"), `${file} ${attribute} is depth-relative: ${value}`);
    assert(!HTML_PAGE_URL.test(pathname), `${file} ${attribute} names a .html page instead of its clean route: ${value}`);
    const isPage = ROUTES.isLocalizableRoute(ROUTES.canonicalRouteKey(pathname));
    const target = isPage ? ROUTES.documentPathFor(pathname, ROUTES.localeFromRoutePath(pathname)) : pathname.slice(1);
    assert(exists(target), `${file} ${attribute} does not resolve: ${value}`);
    if (legacyStubFiles.has(target)) assert(false, `${file} links a legacy compatibility stub: ${value}`);
  }
}

/* 404 recovery links are clean root-relative routes. */
const notFound = read("404.html");
for (const route of ["/", "/works/", "/request/"]) {
  assert(notFound.includes(`href="${route}"`), `404.html recovers to ${route}`);
}

/* The sitemap is canonical, indexable and clean. */
const sitemapUrls = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(sitemapUrls.length > 0, "sitemap lists URLs");
for (const url of sitemapUrls) {
  assert(!HTML_PAGE_URL.test(url), `sitemap lists a .html URL: ${url}`);
  assert(url.endsWith("/"), `sitemap lists a non-directory URL: ${url}`);
  assert(!/project-detail|404|react-preview/.test(url), `sitemap lists a non-canonical surface: ${url}`);
}
const sitemapLocales = [registry.defaultLocale, ...(registry.localizedRoutes?.indexable || []).filter((id) => id !== registry.defaultLocale)];
for (const locale of sitemapLocales) {
  for (const slug of PROJECT_SLUGS) {
    assert(sitemapUrls.includes(`${ORIGIN}${ROUTES.routeForProject(slug, locale)}`), `sitemap keeps ${locale} project ${slug}`);
  }
}

/* robots.txt still advertises the sitemap and blocks nothing public. */
const robots = read("robots.txt");
assert(/Sitemap:\s*https:\/\/kaanbalci\.com\/sitemap\.xml/.test(robots), "robots.txt advertises the sitemap");

/* ---------- 7. runtime producers and canonical data ---------- */

/** Every string leaf in a value. */
const leaves = (value, out = []) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => leaves(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => leaves(item, out));
  return out;
};
const looksLikeRoute = (value) => /^\/(?:[a-z0-9-]+\/)*(?:[?#].*)?$/.test(value) || HTML_PAGE_URL.test(value);

/* AJOOP, Recruiter Mode, the Command Palette, Ajoop navigation, the request
 * form and the games: every destination in their copy literals. */
for (const surface of DYNAMIC_SURFACES) {
  const literal = loadDynamicSurface(surface.namespace);
  for (const value of leaves(literal)) {
    if (!looksLikeRoute(value)) continue;
    assert(!HTML_PAGE_URL.test(value), `${surface.file} (${surface.namespace}) carries a .html destination: ${value}`);
    const pathname = value.split("#")[0].split("?")[0];
    const isPage = ROUTES.isLocalizableRoute(ROUTES.canonicalRouteKey(pathname));
    assert(isPage && exists(ROUTES.documentPathFor(pathname)), `${surface.file} (${surface.namespace}) destination does not resolve: ${value}`);
  }
}

/* No runtime module or canonical data file names a migrated `.html` page as a
 * destination. Companion documents (404.html, project-detail.html) are file
 * names the router reasons about, not destinations, so they are allowed. */
const legacyNames = MIGRATION.map(([legacy]) => legacy);
const legacyLiteral = new RegExp(`["'\`](?:${ORIGIN.replace(/[.]/g, "\\.")}/|/)?(?:[a-z]{2}/)?(?:${legacyNames.map((name) => name.replace(/[.]/g, "\\.")).join("|")})(?:[?#][^"'\`]*)?["'\`]`);
const scanned = [
  ...runtimeScriptFiles().filter((file) => file !== "i18n-data.js" && !file.startsWith("i18n/")),
  ...fs.readdirSync(path.join(ROOT, "data/portfolio")).filter((file) => file.endsWith(".json")).map((file) => `data/portfolio/${file}`),
  "data/i18n/source/dynamic.json",
];
for (const file of scanned) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const match = source.match(legacyLiteral);
  assert(!match, `${file} still names a legacy .html destination: ${match?.[0]}`);
}

/* The AJOOP server answers with links from its master knowledge. */
const knowledge = read("data/portfolio/ajoop-master-knowledge.json");
for (const [url] of knowledge.matchAll(/https:\/\/kaanbalci\.com\/[^"\s]*/g)) {
  assert(!HTML_PAGE_URL.test(url), `AJOOP master knowledge links a .html URL: ${url}`);
  const pathname = new URL(url).pathname;
  const isPage = ROUTES.isLocalizableRoute(ROUTES.canonicalRouteKey(pathname));
  if (isPage) assert(exists(ROUTES.documentPathFor(pathname)), `AJOOP master knowledge links a missing page: ${url}`);
}

/* Registry links rendered by Recruiter Mode V2, the homepage and Labs. */
for (const [id, project] of Object.entries(projects.projects || {})) {
  for (const [name, url] of Object.entries(project.links || {})) {
    if (isExternal(url)) continue;
    assert(url.startsWith("/") && !HTML_PAGE_URL.test(url), `projects.${id}.links.${name} must be a clean root-relative route: ${url}`);
  }
}
for (const item of projects.labs || []) {
  if (isExternal(item.url)) continue;
  assert(item.url.startsWith("/") && !HTML_PAGE_URL.test(item.url), `labs ${item.title} must link a clean root-relative route: ${item.url}`);
}
for (const [slug, detail] of Object.entries(projects.projectDetails)) {
  for (const link of detail.links || []) {
    if (isExternal(link.url)) continue;
    assert(link.url.startsWith("/") && !HTML_PAGE_URL.test(link.url), `${slug} link must be a clean root-relative route: ${link.url}`);
  }
}

/* Deployment tooling tests the clean URLs, never the stubs. */
for (const file of [".pa11yci", "lighthouserc.json"]) {
  const config = read(file);
  assert(!/\.html"/.test(config), `${file} still audits a .html URL`);
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Clean public routes: ${failures.length} failure(s), ${assertions} assertions.\n`);
  for (const failure of failures.slice(0, 60)) console.error(`  x ${failure}\n`);
  if (failures.length > 60) console.error(`  … ${failures.length - 60} more`);
  process.exit(1);
}

console.log(
  `Clean public routes passed. ${assertions} assertions · ${allRoutes.length} routes × ${publishedLocales.length} locales · ` +
    `${legacyStubFiles.size} legacy stubs · ${linkCount} first-party references · ${sitemapUrls.length} sitemap URLs.`,
);
