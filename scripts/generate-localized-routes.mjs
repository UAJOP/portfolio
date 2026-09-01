#!/usr/bin/env node
/**
 * generate-localized-routes.mjs — crawlable localized static routes (BRIEF 09C).
 *
 * Builds one real document per (locale, route) from the English source plus the
 * reviewed locale pack:
 *
 *     /tr/  /tr/works.html  /tr/projects/<slug>/
 *     /de/  /de/works.html  /de/projects/<slug>/
 *     /es/  …               /fr/…
 *
 * English keeps the unprefixed root. There is no `/en/`.
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
import vm from "node:vm";
import {
  ROOT,
  read,
  readJson,
  loadRegistry,
  loadProjectRegistry,
  indexableRoutes,
  buildCatalog,
  routePrefixFor,
  routeDepths,
  truncateDescription,
  COMPANION_ROUTES,
  CASE_STUDY_DATA_FILES,
  compareKeys,
} from "./i18n-catalog.mjs";
import { loadAuthoredPack, coverageFor } from "./build-locale-packs.mjs";
import { localizeDocument, escapeHtml, decodeHtml, normalizeText } from "./localized-html.mjs";

const SITE_ORIGIN = "https://kaanbalci.com";
const checkOnly = process.argv.includes("--check");

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
 * generated registry the browser gets. Generation and runtime cannot disagree
 * about what a localized route is, because there is only one implementation.
 */
const routeSandbox = { window: {} };
vm.createContext(routeSandbox);
vm.runInContext(read("i18n-data.js"), routeSandbox);
vm.runInContext(read("js/core/locale-routes.js"), routeSandbox);
const ROUTES = routeSandbox.window.KAAN_LOCALE_ROUTES;

const ALL_ROUTES = indexableRoutes(projects);



/* ---------- case-study data ---------- */

const caseStudyByPage = new Map();
for (const file of CASE_STUDY_DATA_FILES) {
  caseStudyByPage.set(`${file.replace(/\.data\.js$/, "")}.html`, file.replace(/\.data\.js$/, ""));
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
  const localized = ROUTES.localizedRouteKey(routeKey, locale);
  return `${SITE_ORIGIN}/${localized}`;
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

function buildHead(head, { routeKey, locale, meta, indexable }) {
  const definition = registry.byId.get(locale);
  const canonical = absoluteFor(routeKey, locale);
  const robots = indexable ? "index, follow" : "noindex, follow";
  const injected = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    `<meta name="robots" content="${robots}"/>`,
    `<meta property="og:locale" content="${escapeHtml(definition.ogLocale || definition.htmlLang || locale)}"/>`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}"/>`,
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}"/>`,
    `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
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
 * English keeps its authored metadata and unprefixed URL, but activation still
 * makes it a reciprocal member of the alternate-language graph. The route
 * generator owns these links on the English sources too, so activation and
 * deactivation remain deterministic and no generated page is hand-edited.
 */
function buildEnglishDocument(route, file, indexable) {
  const source = read(file);
  const headMatch = source.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error(`${file} has no <head>`);

  const withoutAlternates = headMatch[1].replace(ALTERNATE_LINKS, "");
  let head = withoutAlternates;
  if (indexable) {
    const canonical = withoutAlternates.match(/<link[^>]*\brel=["']canonical["'][^>]*>/i);
    if (!canonical) throw new Error(`${file} has no canonical for hreflang activation`);
    head = withoutAlternates.replace(canonical[0], `${canonical[0]}${alternateLinks(route.page, true)}`);
  }
  head = tidyWhitespace(head);
  return source.replace(/<head>[\s\S]*?<\/head>/i, `<head>${head}</head>`);
}

/**
 * Rewrites JSON-LD so structured data agrees with the page it sits on.
 * Only language-scoped fields move; identity, URLs and `sameAs` are facts.
 */
function localizeJsonLd(head, { locale, canonical, meta }) {
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
        if (typeof out.url === "string" && out.url.startsWith(`${SITE_ORIGIN}/`) && out.url === canonical.replace(`/${locale}/`, "/")) {
          out.url = canonical;
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

const GENERATED_NOTICE = (locale, routeKey) => `<!--
GENERATED FILE. Do not edit.
Locale: ${locale}
Canonical route: /${ROUTES.localizedRouteKey(routeKey, locale)}
Source: ${routeKey === "" ? "index.html" : routeKey}
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

function buildDocument({ route, locale, translators, indexable }) {
  const routeKey = route.page;
  const localePrefix = routePrefixFor(locale, registry);
  const { localeRoot, siteRoot } = routeDepths(routeKey, localePrefix);
  const source = read(route.source);

  const meta = route.slug ? projectMeta(route.slug, translators) : translators.meta[route.id];
  if (!meta?.title) throw new Error(`${locale} pack has no metadata for route ${route.id}`);

  const caseStudyId = caseStudyByPage.get(route.source);
  const caseCopy = caseStudyId ? translators.caseStudyFor(caseStudyId) : null;

  const rewriteUrl = (value) =>
    ROUTES.localizedInternalHref(value, locale, { siteRoot, localeRoot });

  let html = source;

  /* head: metadata, canonical, alternates, structured data */
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error(`${route.source} has no <head>`);
  let head = buildHead(headMatch[1], { routeKey, locale, meta, indexable });
  head = localizeJsonLd(head, { locale, canonical: absoluteFor(routeKey, locale), meta });
  html = html.replace(/<head>[\s\S]*?<\/head>/i, `<head>${head}</head>`);

  /* html element: this page IS this locale */
  const definition = registry.byId.get(locale);
  html = html.replace(
    /<html[^>]*>/i,
    `<html lang="${escapeHtml(definition.htmlLang || locale)}" dir="${escapeHtml(definition.dir || "ltr")}" data-route-locale="${escapeHtml(locale)}">`,
  );

  /* body: declare both depths so assets and page links resolve independently */
  html = html.replace(/<body([^>]*)>/i, (match, attributes) => {
    const cleaned = attributes
      .replace(/\sdata-site-root="[^"]*"/i, "")
      .replace(/\sdata-locale-root="[^"]*"/i, "");
    return `<body${cleaned} data-site-root="${siteRoot}" data-locale-root="${localeRoot}">`;
  });

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

  return html.replace(/^<!DOCTYPE html>\n?(?:<!--[\s\S]*?-->\n?)?/i, `<!DOCTYPE html>\n${GENERATED_NOTICE(locale, routeKey)}\n`);
}

/* ---------- sitemap ---------- */

function renderSitemap() {
  const entries = [];
  const locales = [registry.defaultLocale, ...indexableLocales];
  for (const route of ALL_ROUTES) {
    for (const locale of locales) {
      entries.push([
        `${SITE_ORIGIN}/${ROUTES.localizedRouteKey(route.page, locale)}`,
        route.changefreq,
        route.priority,
      ]);
    }
  }
  const body = entries
    .map(([loc, changefreq, priority]) => `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
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
    const file = (route.page || "index.html").replace(/\/$/, "/index.html");
    return [file, buildEnglishDocument(route, file, indexable)];
  }),
);
const planned = new Map();
for (const { locale } of readyLocales) {
  const translators = packTranslators(locale);
  const indexable = indexableLocales.includes(locale);
  const prefix = routePrefixFor(locale, registry);
  for (const route of [...ALL_ROUTES, ...COMPANION_ROUTES]) {
    const file = `${prefix}${route.page || "index.html"}`.replace(/\/$/, "/index.html");
    planned.set(file, buildDocument({ route, locale, translators, indexable: indexable && route.indexable !== false }));
  }
}

const sitemap = renderSitemap();

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

for (const prefix of stale) fs.rmSync(path.join(ROOT, prefix), { recursive: true, force: true });
for (const [file, html] of englishPlanned) {
  fs.writeFileSync(path.join(ROOT, file), html);
}
for (const [file, html] of planned) {
  const absolute = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, html);
}
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);

const indexableCount = ALL_ROUTES.length * (1 + indexableLocales.length);
console.log(
  `[i18n:routes] ${ALL_ROUTES.length} English indexable documents · ${COMPANION_ROUTES.length} English companions · ${planned.size} localized documents across ${readyLocales.map((entry) => entry.locale).join(", ") || "no complete locales"}\n` +
    (incompleteLocales.length
      ? `[i18n:routes] skipped, pack incomplete: ${incompleteLocales.map((entry) => `${entry.locale} ${entry.coverage.percent.toFixed(1)}%`).join(" · ")}\n`
      : "") +
    `[i18n:routes] sitemap: ${indexableCount} URLs (${indexableLocales.length ? `en + ${indexableLocales.join(", ")}` : "en only — candidate locales are not advertised"})`,
);
