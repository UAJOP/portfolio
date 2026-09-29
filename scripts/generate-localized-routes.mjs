#!/usr/bin/env node
/**
 * generate-localized-routes.mjs — crawlable clean static routes (BRIEF 09C,
 * Clean Public URLs V1).
 *
 * Builds one real document per (locale, route) from the English source plus the
 * reviewed locale pack, and one compatibility stub per pre-migration URL:
 *
 *     /tr/  /tr/works/  /tr/projects/<slug>/        tr/works/index.html …
 *     /de/  /de/works/  /de/projects/<slug>/
 *     /es/  …           /fr/…
 *     /works.html  /tr/works.html  …                 legacy stubs -> clean URL
 *
 * English keeps the unprefixed root and is authored in place (`works/index.html`
 * serves `/works/`). There is no `/en/`. Routes, sources and legacy paths all
 * come from data/site/routes.json via scripts/site-routes.mjs.
 *
 * Every page is a directory, so GitHub Pages serves each URL as a real file on
 * a direct load or refresh — no rewrite rules, no SPA fallback, no 404
 * interception.
 *
 * SEO exposure is gated separately from generation. `localizedRoutes.generate`
 * in data/i18n/locales.json decides which route trees exist; `indexable`
 * decides which are advertised through robots, hreflang and the sitemap. A
 * locale under review therefore has complete, reviewable pages that no crawler
 * is invited to index — "complete or not active", with no half state.
 *
 * Deterministic: identical input always produces byte-identical output.
 *
 *   node scripts/generate-localized-routes.mjs           # write
 *   node scripts/generate-localized-routes.mjs --check   # verify only
 */

import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  read,
  readJson,
  loadRegistry,
  loadProjectRegistry,
  indexableRoutes,
  buildCatalog,
  routePrefixFor,
  truncateDescription,
  STATIC_ROUTES,
  COMPANION_ROUTES,
  CASE_STUDY_DATA_FILES,
} from "./i18n-catalog.mjs";
import { loadAuthoredPack, coverageFor } from "./build-locale-packs.mjs";
import { localizeDocument, escapeHtml, decodeHtml, normalizeText } from "./localized-html.mjs";
import {
  loadSiteRoutes,
  loadRouteRuntime,
  absoluteRouteUrl,
  renderSitemap,
  renderLegacyStub,
  isLegacyStub,
} from "./site-routes.mjs";

const checkOnly = process.argv.includes("--check");

const site = loadSiteRoutes();
const SITE_ORIGIN = site.origin;
const registry = loadRegistry();
const projects = loadProjectRegistry();
const gate = registry.localizedRoutes || { generate: [], indexable: [] };
const generateLocales = gate.generate.filter((id) => id !== registry.defaultLocale);
const indexableLocales = gate.indexable.filter((id) => id !== registry.defaultLocale);

for (const id of [...generateLocales, ...indexableLocales]) {
  if (!registry.byId.has(id)) throw new Error(`localizedRoutes references unknown locale ${id}`);
}
for (const id of indexableLocales) {
  if (!generateLocales.includes(id)) throw new Error(`${id} cannot be indexable without generated routes`);
  if (!registry.byId.get(id).active) throw new Error(`${id} cannot be indexable while inactive`);
}

/* ---------- shared route model ---------- */

/**
 * The route mapper is the production module, evaluated here against the same
 * route table the browser gets. Generation and runtime cannot disagree about
 * what a localized route is, because there is only one implementation.
 */
const ROUTES = loadRouteRuntime(registry, site);

const ALL_ROUTES = indexableRoutes(projects);

/* ---------- case-study data ---------- */

/** Case-study copy keyed by the English source document that renders it. */
const caseStudyBySource = new Map();
for (const file of CASE_STUDY_DATA_FILES) {
  const id = file.replace(/\.data\.js$/, "");
  caseStudyBySource.set(ROUTES.documentPathFor(`${id}/`), id);
}

/* ---------- head metadata ---------- */

const HEAD_REPLACEMENTS = [
  [/<title>[\s\S]*?<\/title>/i, null],
  [/<meta[^>]*\bname="description"[^>]*>/i, null],
  [/<meta[^>]*\bname="robots"[^>]*>/i, null],
  [/<link[^>]*\brel="canonical"[^>]*>/i, null],
  [/<meta[^>]*\bproperty="og:title"[^>]*>/i, null],
  [/<meta[^>]*\bproperty="og:description"[^>]*>/i, null],
  [/<meta[^>]*\bproperty="og:url"[^>]*>/i, null],
  [/<meta[^>]*\bproperty="og:locale"[^>]*>/i, null],
  [/<meta[^>]*\bname="twitter:title"[^>]*>/i, null],
  [/<meta[^>]*\bname="twitter:description"[^>]*>/i, null],
];
const ALTERNATE_LINKS = /<link[^>]*\brel=["']alternate["'][^>]*>/gi;
const CANONICAL_LINK = /<link[^>]*\brel=["']canonical["'][^>]*>/i;
const OG_URL_META = /<meta[^>]*\bproperty=["']og:url["'][^>]*>/i;

/** Removes the tags the generator re-emits with localized values. */
function stripHeadMetadata(head) {
  let out = head;
  for (const [pattern] of HEAD_REPLACEMENTS) out = out.replace(pattern, "");
  return out.replace(ALTERNATE_LINKS, "");
}

/**
 * Drops whitespace-only lines and trailing spaces left behind by tag removal.
 *
 * Most authored heads are minified onto one line, but 404.html is indented, so
 * lifting tags out of it would otherwise leave lines of trailing whitespace
 * that fail HTML validation.
 */
const tidyWhitespace = (text) => text.replace(/^[ \t]+$\n?/gm, "").replace(/[ \t]+$/gm, "");

function absoluteFor(routeKey, locale) {
  return absoluteRouteUrl(ROUTES, routeKey, locale, SITE_ORIGIN);
}

/**
 * Alternate-language links for one route.
 *
 * Emitted only when the locale set is genuinely complete, and only over
 * locales whose routes exist and are indexable. Every alternate therefore
 * addresses a real generated document — never a 404, a fallback or the wrong
 * slug — which is the whole point of gating this behind activation.
 */
function alternateLinks(routeKey, indexable) {
  if (!indexable || !indexableLocales.length) return "";
  const locales = [registry.defaultLocale, ...indexableLocales];
  const links = locales.map(
    (id) =>
      `<link rel="alternate" hreflang="${escapeHtml(registry.byId.get(id).htmlLang || id)}" href="${escapeHtml(absoluteFor(routeKey, id))}"/>`,
  );
  links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(absoluteFor(routeKey, registry.defaultLocale))}"/>`);
  return links.join("");
}

/**
 * Localized `<head>` metadata.
 *
 * A companion (the 404 page, the legacy project shell) is never a canonical
 * destination, so it gets `noindex` and no canonical or `og:url` claim at all —
 * a canonical pointing at `/tr/404.html` would advertise a `.html` URL the
 * site no longer publishes.
 */
function buildHead(head, { routeKey, locale, meta, indexable, companion }) {
  const definition = registry.byId.get(locale);
  const canonical = absoluteFor(routeKey, locale);
  const robots = indexable ? "index, follow" : "noindex, follow";
  const injected = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}"/>`,
    companion ? "" : `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    `<meta name="robots" content="${robots}"/>`,
    `<meta property="og:locale" content="${escapeHtml(definition.ogLocale || definition.htmlLang || locale)}"/>`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}"/>`,
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}"/>`,
    companion ? "" : `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
    `<meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(meta.ogDescription)}"/>`,
    alternateLinks(routeKey, indexable),
  ].join("");

  /* `<meta charset>` must stay inside the first 1024 bytes, and the injected
   * block is larger than that, so it is re-emitted ahead of everything else.
   * The accented characters in every localized title depend on this. */
  const charset = head.match(/<meta[^>]*charset=[^>]*>/i);
  if (!charset) throw new Error("source document has no <meta charset> to preserve");
  const rest = tidyWhitespace(stripHeadMetadata(head).replace(charset[0], ""));
  return `${charset[0]}${injected}${rest}`;
}

/**
 * English keeps its authored metadata and unprefixed URL, but its canonical
 * identity is owned here: `rel=canonical` and `og:url` are rewritten to the
 * registry's clean URL, so an authored page can never advertise a `.html`
 * address. Activation also makes it a reciprocal member of the alternate-
 * language graph, and the generator owns those links on the English sources
 * too, so activation and deactivation stay deterministic.
 *
 * Companions carry neither a canonical nor an `og:url`: they are not
 * destinations.
 */
function buildEnglishDocument(route, file, indexable) {
  const source = read(file);
  const headMatch = source.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error(`${file} has no <head>`);

  let head = headMatch[1].replace(ALTERNATE_LINKS, "");
  const canonicalUrl = absoluteFor(route.page, registry.defaultLocale);
  if (indexable) {
    const canonical = head.match(CANONICAL_LINK);
    if (!canonical) throw new Error(`${file} has no canonical link to own`);
    /* Only the URL value is owned; the authored tag keeps its attribute order,
     * so a page that already agrees is byte-stable. */
    const setAttribute = (tag, name, value) => tag.replace(new RegExp(`\\b${name}=(["'])[^"']*\\1`, "i"), `${name}="${escapeHtml(value)}"`);
    head = head.replace(canonical[0], `${setAttribute(canonical[0], "href", canonicalUrl)}${alternateLinks(route.page, true)}`);
    head = head.replace(OG_URL_META, (tag) => setAttribute(tag, "content", canonicalUrl));
  } else {
    head = head.replace(CANONICAL_LINK, "").replace(OG_URL_META, "");
  }
  head = tidyWhitespace(head);
  return source.replace(/<head>[\s\S]*?<\/head>/i, `<head>${head}</head>`);
}

/**
 * Rewrites JSON-LD so structured data agrees with the page it sits on.
 * Only language-scoped fields move: the page's own `url` and
 * `mainEntityOfPage`. Identity, other URLs and `sameAs` are facts.
 */
function localizeJsonLd(head, { locale, canonical, meta }) {
  const englishCanonical = canonical.replace(`/${locale}/`, "/");
  return head.replace(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
    (match, body) => {
      let data;
      try {
        data = JSON.parse(body);
      } catch (error) {
        return match;
      }
      const apply = (node) => {
        if (Array.isArray(node)) return node.map(apply);
        if (!node || typeof node !== "object") return node;
        const out = { ...node };
        if (typeof out.description === "string") out.description = meta.ogDescription;
        if (out.inLanguage !== undefined) out.inLanguage = locale;
        for (const key of ["url", "mainEntityOfPage"]) {
          if (out[key] === englishCanonical) out[key] = canonical;
        }
        for (const key of Object.keys(out)) {
          if (key !== "description" && key !== "inLanguage") out[key] = apply(out[key]);
        }
        return out;
      };
      return `<script type="application/ld+json">${JSON.stringify(apply(data))}</script>`;
    },
  );
}

/* ---------- document build ---------- */

const GENERATED_NOTICE = (locale, route) => `<!--
GENERATED FILE. Do not edit.
Locale: ${locale}
Canonical route: /${ROUTES.localizedRouteKey(route.page, locale)}
Source: ${route.source}
Generator: scripts/generate-localized-routes.mjs
Copy: data/i18n/packs/${locale}/
-->`;

function packTranslators(locale) {
  const pack = loadAuthoredPack(locale);
  const text = pack.pages?.text || {};
  const attribute = pack.pages?.attribute || {};
  const caseStudies = pack["case-studies"] || {};
  return {
    pack,
    translateText: (key) => text[key] || null,
    translateAttribute: (key) => attribute[key] || null,
    caseStudyFor: (id) => caseStudies[id] || null,
    meta: pack.meta || {},
  };
}

function localizedProject(slug, translators) {
  const canonical = projects.projectDetails[slug];
  const overlay = translators.pack.projects?.[slug] || {};
  const field = (name) => overlay[name] || canonical[name]?.en || "";
  return { canonical, overlay, field };
}

/**
 * Metadata for a project route, composed the same way the English generator
 * composes it — localized copy in, canonical identity untouched.
 */
function projectMeta(slug, translators) {
  const { field } = localizedProject(slug, translators);
  const title = `${field("title")} | Kaan Balcı`;
  const description = truncateDescription(field("subtitle") || field("overview"));
  return { title, description, ogTitle: title, ogDescription: description };
}

/**
 * Removes pre-migration depth declarations. Every first-party URL is now
 * root-relative, so a page has no depth to declare; the runtime treats an
 * undeclared site root as "/".
 */
const stripDepthDeclarations = (attributes) =>
  attributes.replace(/\sdata-site-root="[^"]*"/i, "").replace(/\sdata-locale-root="[^"]*"/i, "");

function buildDocument({ route, locale, translators, indexable }) {
  const routeKey = route.page;
  const companion = route.indexable === false;
  const source = read(route.source);

  const meta = route.slug ? projectMeta(route.slug, translators) : translators.meta[route.id];
  if (!meta?.title) throw new Error(`${locale} pack has no metadata for route ${route.id}`);

  const caseStudyId = caseStudyBySource.get(route.source);
  const caseCopy = caseStudyId ? translators.caseStudyFor(caseStudyId) : null;

  const rewriteUrl = (value) => ROUTES.localizedInternalHref(value, locale);

  let html = source;

  /* head: metadata, canonical, alternates, structured data */
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error(`${route.source} has no <head>`);
  let head = buildHead(headMatch[1], { routeKey, locale, meta, indexable, companion });
  head = localizeJsonLd(head, { locale, canonical: absoluteFor(routeKey, locale), meta });
  html = html.replace(/<head>[\s\S]*?<\/head>/i, `<head>${head}</head>`);

  /* html element: this page IS this locale */
  const definition = registry.byId.get(locale);
  html = html.replace(
    /<html[^>]*>/i,
    `<html lang="${escapeHtml(definition.htmlLang || locale)}" dir="${escapeHtml(definition.dir || "ltr")}" data-route-locale="${escapeHtml(locale)}">`,
  );

  html = html.replace(/<body([^>]*)>/i, (match, attributes) => `<body${stripDepthDeclarations(attributes)}>`);

  html = localizeDocument(html, {
    translateText: translators.translateText,
    translateAttribute: translators.translateAttribute,
    caseStudyValue: (key) => (key && caseCopy ? caseCopy[key] ?? null : null),
    compatValue: (attributeByName) => {
      for (const prefix of ["data-pv2", "data-flagship", "data-sinama", "data-mr"]) {
        const english = attributeByName.get(`${prefix}-en`);
        if (!english) continue;
        const translated = translators.translateText(normalizeText(decodeHtml(english.value)));
        if (translated) return translated;
      }
      return null;
    },
    rewriteUrl,
  });

  /* Project routes carry the project's own heading, so the page is meaningful
   * without JavaScript in the reader's language too. */
  if (route.slug) {
    const { field } = localizedProject(route.slug, translators);
    html = html.replace(
      /<main\b[^>]*data-project-detail[^>]*>[\s\S]*?<\/main>/i,
      `<main id="main-content" tabindex="-1" data-project-detail><section class="page-hero section-shell reveal">` +
        `<p class="eyebrow">${escapeHtml(field("category"))}</p>` +
        `<h1>${escapeHtml(field("title"))}</h1>` +
        `<p>${escapeHtml(field("subtitle"))}</p>` +
        `</section></main>`,
    );
    html = html.replace(
      /<body([^>]*)>/i,
      (match, attributes) =>
        `<body${attributes.replace(/\sdata-project-slug="[^"]*"/i, "")} data-project-slug="${escapeHtml(route.slug)}">`,
    );
  }

  return html.replace(/^<!DOCTYPE html>\n?(?:<!--[\s\S]*?-->\n?)?/i, `<!DOCTYPE html>\n${GENERATED_NOTICE(locale, route)}\n`);
}

/* ---------- legacy compatibility stubs ---------- */

const englishMeta = readJson("data/i18n/source/meta.json");

/**
 * One stub per (locale, pre-migration `.html` URL). The home page needs none:
 * `/index.html` and `/tr/index.html` are the home documents themselves, and
 * their canonical already names the clean `/` and `/tr/`.
 */
function legacyStubs(locale, translators) {
  const definition = registry.byId.get(locale);
  const prefix = routePrefixFor(locale, registry);
  const stubs = new Map();
  for (const route of STATIC_ROUTES) {
    if (!route.legacy || route.legacy === ROUTES.documentPathFor(route.page)) continue;
    const meta = locale === registry.defaultLocale ? englishMeta[route.id] : translators.meta[route.id];
    if (!meta?.title) throw new Error(`${locale} has no metadata title for legacy route ${route.id}`);
    const targetPath = `/${ROUTES.localizedRouteKey(route.page, locale)}`;
    stubs.set(
      `${prefix}${route.legacy}`,
      renderLegacyStub({
        locale,
        htmlLang: definition.htmlLang || locale,
        dir: definition.dir || "ltr",
        legacyPath: `${prefix}${route.legacy}`,
        targetPath,
        canonicalUrl: absoluteFor(route.page, locale),
        title: meta.title,
        notice: site.legacyNotice?.[locale] || site.legacyNotice?.[registry.defaultLocale] || "",
      }),
    );
  }
  return stubs;
}

/* ---------- plan ---------- */

/**
 * A locale route tree is only built once its pack is complete.
 *
 * Half-translated output is exactly what "complete or not active" forbids, so
 * an incomplete pack produces no routes at all rather than pages that fall back
 * to English. `qa:i18n` turns the same condition into a blocking failure, so a
 * locale can never sit in `generate` while quietly producing nothing.
 */
const catalog = buildCatalog();
const readyLocales = [];
const incompleteLocales = [];
for (const locale of generateLocales) {
  const coverage = coverageFor(locale, catalog);
  (coverage.missing.length ? incompleteLocales : readyLocales).push({ locale, coverage });
}

const englishPlanned = new Map(
  [
    ...ALL_ROUTES.map((route) => ({ route, indexable: true })),
    ...COMPANION_ROUTES.map((route) => ({ route, indexable: false })),
  ].map(({ route, indexable }) => {
    const file = ROUTES.documentPathFor(route.page);
    return [file, buildEnglishDocument(route, file, indexable)];
  }),
);
for (const [file, html] of legacyStubs(registry.defaultLocale, null)) englishPlanned.set(file, html);

const planned = new Map();
for (const { locale } of readyLocales) {
  const translators = packTranslators(locale);
  const indexable = indexableLocales.includes(locale);
  for (const route of [...ALL_ROUTES, ...COMPANION_ROUTES]) {
    const file = ROUTES.documentPathFor(route.page, locale);
    planned.set(file, buildDocument({ route, locale, translators, indexable: indexable && route.indexable !== false }));
  }
  for (const [file, html] of legacyStubs(locale, translators)) planned.set(file, html);
}

const sitemap = renderSitemap({
  routes: ROUTES,
  indexableRoutes: ALL_ROUTES,
  locales: [registry.defaultLocale, ...indexableLocales],
  origin: SITE_ORIGIN,
});

/* ---------- write / check ---------- */

const normalize = (text) => (text == null ? null : text.replace(/\r\n/g, "\n"));
const readIfExists = (file) => {
  const absolute = path.join(ROOT, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
};

const differences = [];
for (const [file, html] of englishPlanned) {
  if (normalize(readIfExists(file)) !== normalize(html)) differences.push(file);
}
for (const [file, html] of planned) {
  if (normalize(readIfExists(file)) !== normalize(html)) differences.push(file);
}
if (normalize(readIfExists("sitemap.xml")) !== normalize(sitemap)) differences.push("sitemap.xml");

/** Locale route trees this generator owns, so stale ones can be removed safely. */
function ownedLocaleDirs() {
  return registry.locales
    .filter((locale) => locale.id !== registry.defaultLocale)
    .map((locale) => locale.routePrefix)
    .filter((prefix) => prefix && fs.existsSync(path.join(ROOT, prefix)));
}

const stale = ownedLocaleDirs().filter((prefix) => !readyLocales.some((entry) => entry.locale === prefix));
for (const prefix of stale) differences.push(`${prefix}/ (stale locale route tree)`);

/**
 * Documents inside a live locale tree that no route plans any more — the
 * pre-migration `/tr/works.html` pages become stubs, but a route removed from
 * the registry would otherwise leave an orphan behind. A locale tree holds
 * generated output only, so anything unplanned in it is stale by definition.
 */
function staleLocaleDocuments() {
  const orphans = [];
  for (const { locale } of readyLocales) {
    const prefix = routePrefixFor(locale, registry);
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}${entry.name}`;
        if (entry.isDirectory()) walk(`${rel}/`);
        else if (!planned.has(rel)) orphans.push(rel);
      }
    };
    if (fs.existsSync(path.join(ROOT, prefix))) walk(prefix);
  }
  return orphans.sort();
}
const orphans = staleLocaleDocuments();
for (const file of orphans) differences.push(`${file} (orphaned generated document)`);

if (checkOnly) {
  if (differences.length) {
    console.error(
      `Localized routes are out of date (${differences.length}):\n${differences.slice(0, 20).map((file) => `  - ${file}`).join("\n")}` +
        (differences.length > 20 ? `\n  … ${differences.length - 20} more` : "") +
        "\n\nRun: npm run i18n:routes",
    );
    process.exit(1);
  }
  console.log(`Localized routes are up to date. ${planned.size} documents · ${readyLocales.length} complete locale(s).`);
  process.exit(0);
}

/* A root legacy path is only ever overwritten when it is still the authored
 * pre-migration page or already a generated stub — never some unrelated file
 * that happens to share the name. */
for (const [file, html] of englishPlanned) {
  const existing = readIfExists(file);
  if (!isLegacyStub(html) || existing === null || isLegacyStub(existing) || /<html[\s>]/i.test(existing)) continue;
  throw new Error(`${file} exists and is not a page or a legacy stub; refusing to overwrite it`);
}

for (const prefix of stale) fs.rmSync(path.join(ROOT, prefix), { recursive: true, force: true });
for (const file of orphans) fs.rmSync(path.join(ROOT, file), { force: true });
for (const [file, html] of [...englishPlanned, ...planned]) {
  const absolute = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, html);
}
/* Removing orphans can leave empty directories behind in a locale tree. */
for (const { locale } of readyLocales) {
  const prune = (dir) => {
    const absolute = path.join(ROOT, dir);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) if (entry.isDirectory()) prune(`${dir}${entry.name}/`);
    if (!fs.readdirSync(absolute).length) fs.rmdirSync(absolute);
  };
  prune(routePrefixFor(locale, registry));
}
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);

const indexableCount = ALL_ROUTES.length * (1 + indexableLocales.length);
const stubCount = [...englishPlanned.values(), ...planned.values()].filter(isLegacyStub).length;
console.log(
  `[i18n:routes] ${ALL_ROUTES.length} English indexable documents · ${COMPANION_ROUTES.length} English companions · ${planned.size} localized documents across ${readyLocales.map((entry) => entry.locale).join(", ") || "no complete locales"}\n` +
    `[i18n:routes] ${stubCount} legacy .html compatibility stubs\n` +
    (incompleteLocales.length
      ? `[i18n:routes] skipped, pack incomplete: ${incompleteLocales.map((entry) => `${entry.locale} ${entry.coverage.percent.toFixed(1)}%`).join(" · ")}\n`
      : "") +
    `[i18n:routes] sitemap: ${indexableCount} URLs (${indexableLocales.length ? `en + ${indexableLocales.join(", ")}` : "en only — candidate locales are not advertised"})`,
);
