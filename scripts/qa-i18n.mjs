/**
 * qa-i18n.mjs — blocking multilingual contracts.
 *
 * BRIEF 09B established the locale registry, the single locale authority and
 * the first-paint bootstrap. BRIEF 09C adds localized static routes, locale
 * packs, route mapping, localized metadata and the activation gate.
 *
 * The governing rule this suite enforces is that a locale is COMPLETE or NOT
 * ACTIVE. Runtime fallback exists as a defensive floor and is never accepted as
 * translation coverage: a locale that would fall back is a failure here, not a
 * page that quietly renders half in English.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  ROOT,
  read,
  readJson,
  fileExists,
  buildCatalog,
  loadRegistry,
  loadProjectRegistry,
  loadLegacyDictionaries,
  indexableRoutes,
  metadataRoutes,
  projectSlugs,
  routePrefixFor,
  runtimeTextSources,
  runtimeAttributeSources,
  routeDepths,
  truncateDescription,
  compareKeys,
  COMPANION_ROUTES,
  STATIC_ROUTES,
  LOCALIZED_DATA_FILES,
  PROJECT_COPY_FIELDS,
  CASE_STUDY_DATA_FILES,
} from "./i18n-catalog.mjs";
import { coverageFor, loadAuthoredPack, DERIVED_TR_DOMAINS, deriveTurkishPack } from "./build-locale-packs.mjs";

let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const exists = (file) => fileExists(file);

const registry = loadRegistry();
const ui = readJson("data/i18n/ui.json");
const glossary = readJson("data/i18n/glossary.json");
const localeIds = registry.locales.map((item) => item.id);
const active = registry.locales.filter((item) => item.active);
const inactive = registry.locales.filter((item) => !item.active);
const productionLocaleIds = ["en", "tr", "de", "es", "fr"];
const defaults = registry.locales.filter((item) => item.default);
const gate = registry.localizedRoutes || { generate: [], indexable: [] };
const generateLocales = gate.generate.filter((id) => id !== registry.defaultLocale);
const indexableLocales = gate.indexable.filter((id) => id !== registry.defaultLocale);

/* ---------- 1. locale registry ---------- */

assert(registry.schemaVersion === 2, "locale registry schemaVersion must be 2 once routes are part of the contract");
assert(registry.storageKey === "kaanbalci-site-language", "legacy language storage key must be preserved");
assert(new Set(localeIds).size === localeIds.length, "locale ids must be unique");
assert(defaults.length === 1, "exactly one locale must be default");
assert(defaults[0]?.id === registry.defaultLocale, "default flag and defaultLocale must agree");
assert(active.some((item) => item.id === registry.defaultLocale), "default locale must be active");
for (const id of productionLocaleIds) assert(active.some((item) => item.id === id), `${id} must be active`);
for (const item of registry.locales) {
  assert(/^[a-z]{2,3}$/.test(item.id), `invalid locale id ${item.id}`);
  assert(Boolean(item.nativeLabel), `${item.id} needs nativeLabel`);
  assert(Boolean(item.label), `${item.id} needs label`);
  assert(["ltr", "rtl"].includes(item.dir), `${item.id} has invalid dir`);
  assert(Boolean(item.htmlLang), `${item.id} needs an htmlLang for lang attributes and hreflang`);
  assert(Boolean(item.ogLocale), `${item.id} needs an ogLocale for Open Graph`);
  assert(typeof item.activationCandidate === "boolean", `${item.id} must declare activationCandidate`);
  if (productionLocaleIds.includes(item.id)) {
    assert(!item.activationCandidate, `${item.id} must not remain an activation candidate after release`);
  }
}

/* ---------- 2. English owns the unprefixed root: no /en/ ---------- */

assert(registry.byId.get("en").routePrefix === "", "English must stay the unprefixed default locale");
assert(!exists("en"), "/en/ must not exist: the English root is canonical");
assert(!exists("en/index.html"), "/en/index.html must not exist");
for (const item of registry.locales) {
  if (item.id === registry.defaultLocale) continue;
  assert(item.routePrefix === item.id, `${item.id} route prefix must match its locale id`);
}

/* ---------- 3. activation gate ---------- */

for (const id of generateLocales) assert(registry.byId.has(id), `localizedRoutes.generate references unknown locale ${id}`);
for (const id of indexableLocales) {
  assert(generateLocales.includes(id), `${id} cannot be indexable without generated routes`);
  assert(registry.byId.get(id)?.active, `${id} cannot be indexable while inactive`);
}
for (const id of ["tr", "de", "es", "fr"]) {
  assert(indexableLocales.includes(id), `${id} must be advertised after five-locale activation`);
}

/* ---------- 4. UI catalog and packs ---------- */

for (const [key, pack] of Object.entries(ui)) {
  assert(Boolean(pack.en), `${key} missing English UI copy`);
  for (const locale of active) assert(Boolean(pack[locale.id]), `${key} missing active locale ${locale.id}`);
}

const catalog = buildCatalog();
assert(catalog.entries.length > 2000, `translatable catalog looks truncated: ${catalog.entries.length} entries`);

const packLocales = registry.locales.filter((item) => item.id !== registry.defaultLocale).map((item) => item.id);
for (const locale of packLocales) {
  assert(exists(`data/i18n/packs/${locale}`), `${locale} needs a locale pack directory`);
}

/**
 * Coverage. Active locales must be complete because they are live; candidate
 * locales must be complete because that is the whole point of reviewing a
 * finished candidate rather than half-translated work.
 */
const coverage = new Map();
for (const locale of packLocales) coverage.set(locale, coverageFor(locale, catalog));

for (const locale of packLocales) {
  const result = coverage.get(locale);
  const definition = registry.byId.get(locale);
  const mustBeComplete = definition.active || generateLocales.includes(locale);
  if (mustBeComplete) {
    assert(
      result.missing.length === 0,
      `${locale} coverage is ${result.percent.toFixed(1)}% (${result.missing.length} missing) — a generated or active locale must be 100%`,
    );
    for (const [domain, stats] of result.domains) {
      assert(stats.filled === stats.total, `${locale} ${domain} coverage ${stats.filled}/${stats.total}`);
    }
  }
  /* The reverse direction: a pack that has reached 100% must be wired up, so a
   * finished translation cannot sit unnoticed without a route tree. */
  if (!mustBeComplete) {
    assert(
      result.missing.length > 0,
      `${locale} is fully translated — add it to localizedRoutes.generate so its routes are built`,
    );
  }
}

/* An inactive locale is allowed to carry a pack — that is how a candidate is
 * prepared — but never to be exposed. */
for (const locale of inactive) {
  assert(!active.some((item) => item.id === locale.id), `${locale.id} cannot be both active and inactive`);
}

/* ---------- 5. fallback is never coverage ---------- */

/**
 * A locale pack entry that is byte-identical to its English source is only
 * legitimate for a genuinely language-neutral string: a product name, a
 * technology list, a flow diagram, a canonical job title. Those are recorded
 * explicitly in the glossary rather than guessed at, so an actual translation
 * gap cannot hide behind a heuristic.
 */
const protectedTerms = new Set(glossary.protectedTerms || []);
const projectNames = new Set(glossary.projectNames || []);
const neutralStrings = new Set(glossary.languageNeutralStrings || []);
const NEUTRAL_PATTERN = /^[^a-zA-Z]*$/;
function looksLanguageNeutral(value) {
  if (NEUTRAL_PATTERN.test(value)) return true;
  if (protectedTerms.has(value) || projectNames.has(value) || neutralStrings.has(value)) return true;
  /* One- to three-word labels can legitimately coincide across languages. */
  return value.trim().split(/\s+/).length <= 3;
}

for (const locale of packLocales) {
  const definition = registry.byId.get(locale);
  if (!definition.active && !generateLocales.includes(locale)) continue;
  const result = coverage.get(locale);
  if (result.missing.length) continue;
  const pack = loadAuthoredPack(locale);
  let identical = 0;
  let prose = 0;
  for (const entry of catalog.entries) {
    const value = lookup(pack, entry);
    if (typeof value !== "string") continue;
    if (value !== entry.source) continue;
    identical += 1;
    if (!looksLanguageNeutral(entry.source)) prose += 1;
  }
  assert(prose === 0, `${locale} has ${prose} untranslated prose string(s) copied verbatim from English`);
  assert(identical < catalog.entries.length * 0.5, `${locale} looks like an English copy, not a translation`);
}

function lookup(pack, entry) {
  const { domain, key } = entry;
  if (domain === "ui") return pack.ui?.[key];
  if (domain === "pages") {
    const at = key.indexOf(":");
    return pack.pages?.[key.slice(0, at)]?.[key.slice(at + 1)];
  }
  if (domain === "case-studies") {
    const at = key.indexOf(":");
    return pack["case-studies"]?.[key.slice(0, at)]?.[key.slice(at + 1)];
  }
  if (domain === "content") return pack.content?.[key];
  return readDeep(pack[domain], key);
}

function readDeep(source, key) {
  const parts = key.split(/\.|\[(\d+)\]/).filter((part) => part !== undefined && part !== "");
  let cursor = source;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[/^\d+$/.test(part) ? Number(part) : part];
  }
  return cursor;
}

/* ---------- 6. packs carry copy, never language-neutral facts ---------- */

const projects = loadProjectRegistry();
const slugs = new Set(projectSlugs(projects));
const FORBIDDEN_OVERLAY_FIELDS = ["year", "image", "gallery", "stack", "url", "id", "slug"];

for (const locale of packLocales) {
  const pack = loadAuthoredPack(locale);
  for (const [slug, overlay] of Object.entries(pack.projects || {})) {
    assert(slugs.has(slug), `${locale} projects overlay references unknown slug ${slug}`);
    for (const field of FORBIDDEN_OVERLAY_FIELDS) {
      assert(!(field in overlay), `${locale} projects overlay for ${slug} must not redefine language-neutral ${field}`);
    }
    for (const field of Object.keys(overlay)) {
      const allowed = [...PROJECT_COPY_FIELDS, "features", "process", "links"];
      assert(allowed.includes(field), `${locale} projects overlay for ${slug} has unexpected field ${field}`);
    }
    for (const link of overlay.links || []) {
      assert(!("url" in link), `${locale} projects overlay for ${slug} must not carry link URLs`);
    }
  }
  for (const key of Object.keys(pack.content || {})) {
    assert(!/\.(?:url|image|slug|year|stack|id)(?:$|\.)/.test(key), `${locale} content pack must not localize ${key}`);
  }
  /* A pack must never smuggle a URL in as copy. */
  const flat = JSON.stringify(pack);
  const urls = flat.match(/https?:\/\/[^"\\]+/g) || [];
  const allowedUrls = new Set(["https://kaanbalci.com", "https://sinama.kaanbalci.com"]);
  for (const url of new Set(urls)) {
    assert(
      allowedUrls.has(url) || url.startsWith("https://drive.google.com"),
      `${locale} pack contains an unexpected URL, which is a language-neutral fact: ${url}`,
    );
  }
}

/* ---------- 7. derived Turkish pack stays in step ---------- */

const derived = deriveTurkishPack();
for (const domain of DERIVED_TR_DOMAINS) {
  const file = `data/i18n/packs/tr/${domain}.json`;
  assert(exists(file), `derived Turkish pack domain ${domain} is missing`);
  assert(
    JSON.stringify(readJson(file)) === JSON.stringify(derived[domain]),
    `${file} has drifted from its canonical Turkish source — run npm run i18n:packs`,
  );
}
assert(exists("data/i18n/packs/tr/meta.json"), "Turkish page metadata is authored, not derived, and must exist");

/* ---------- 8. generated runtime artefacts ---------- */

const generatedData = read("i18n-data.js");
const dataSandbox = { window: {} };
vm.runInNewContext(generatedData, dataSandbox, { filename: "i18n-data.js" });
const runtimeConfig = dataSandbox.window.KAAN_I18N;
assert(Boolean(runtimeConfig), "generated i18n-data.js must assign window.KAAN_I18N");
assert(JSON.stringify(runtimeConfig.locales) === JSON.stringify(registry.locales), "generated locale registry is stale");
assert(JSON.stringify(runtimeConfig.ui) === JSON.stringify(ui), "generated UI catalog is stale");
assert(JSON.stringify(runtimeConfig.glossary) === JSON.stringify(glossary), "generated glossary is stale");

const allRoutes = indexableRoutes(projects);
const expectedInventory = [...allRoutes.map((route) => route.page), ...COMPANION_ROUTES.map((route) => route.source)].sort(compareKeys);
assert(
  JSON.stringify(runtimeConfig.routes) === JSON.stringify(expectedInventory),
  "generated route inventory is stale",
);
assert(!runtimeConfig.routes.some((route) => /^(?:tr|de|es|fr)\//.test(route)), "the route inventory must hold canonical keys, not localized ones");

/* ---------- 9. bootstrap contract ---------- */

const bootstrap = read("js/core/locale-bootstrap.js");
assert(bootstrap.includes(JSON.stringify(registry.storageKey)), "bootstrap storage key drift");
assert(bootstrap.includes(JSON.stringify(registry.defaultLocale)), "bootstrap default locale drift");
const bootstrapActive = bootstrap.match(/var active=(\[.*?\]);/)?.[1];
assert(Boolean(bootstrapActive), "bootstrap must declare its active locale list");
const bootstrapActiveIds = JSON.parse(bootstrapActive || "[]").map((item) => item.id);
for (const locale of active) assert(bootstrapActiveIds.includes(locale.id), `bootstrap missing active ${locale.id}`);
for (const locale of inactive) {
  assert(!bootstrapActiveIds.includes(locale.id), `bootstrap must not treat ${locale.id} as active`);
}
assert(bootstrap.includes("navigator.languages"), "bootstrap must support browser locale preferences");
assert(bootstrap.includes("dataset.localePending") || bootstrap.includes("data.localePending"), "bootstrap must mark non-default pending locale");
assert(bootstrap.includes("dataset.localeReady"), "bootstrap must have runtime-failure safety release");
assert(bootstrap.includes("data-route-locale"), "bootstrap must honour a page's declared route locale");
assert(bootstrap.includes("data-route-locale-from-path"), "bootstrap must support 404 locale recovery from the failed path");
assert(bootstrap.includes("__KAAN_PACK_LOCALE__"), "bootstrap must publish the pack locale for the runtime loader");
assert(
  /if\(!resolved&&!byPath\)/.test(bootstrap),
  "a page that declares or derives its locale must not consult saved preference or browser language",
);

/* ---------- 10. central locale authority ---------- */

const localeSource = read("js/core/locale.js");
for (const contract of [
  "getCurrentLocale",
  "setCurrentLocale",
  "getActiveLocales",
  "getNextActiveLocale",
  "getLocalizedValue",
  "getLocalizedCollection",
  "getUiText",
  "subscribeSiteLocale",
  "switchSiteLocale",
  "getRouteLocale",
  "getLocalePack",
  "getPackAttribute",
  "composeLocalePackIntoRegistry",
]) {
  assert(localeSource.includes(`function ${contract}`), `central locale authority missing ${contract}`);
}
assert(localeSource.includes('source: "selector"'), "language selector must write through central locale authority");
assert(localeSource.includes("nativeLabel"), "selector must render native language names");
assert(!localeSource.includes("🇹🇷") && !localeSource.includes("🇬🇧") && !localeSource.includes("🇺🇸"), "language selector must not use flags");
assert(localeSource.includes("localizedHrefForCurrentPage"), "the selector must navigate to the equivalent localized route");
assert(localeSource.includes('autocomplete", "off'), "the selector must opt out of back/forward form restoration");
assert(localeSource.includes("visually-hidden"), "the selector label must use the site's real screen-reader utility");
assert(!localeSource.includes('"sr-only"'), "sr-only is not defined anywhere in this site's CSS");
assert(/pageshow/.test(localeSource), "locale state must be re-synced on back/forward restore");

/* ---------- 11. route mapping helper ---------- */

const routeSource = read("js/core/locale-routes.js");
for (const contract of [
  "localeRoutePrefix",
  "stripLocaleRoutePrefix",
  "localeFromRoutePath",
  "canonicalRouteKey",
  "localizedRouteKey",
  "localizedInternalHref",
  "localizedHrefForCurrentPage",
  "isLocalizableRoute",
]) {
  assert(routeSource.includes(`function ${contract}`), `route mapper missing ${contract}`);
}

const routeSandbox = { window: {} };
vm.createContext(routeSandbox);
vm.runInContext(generatedData, routeSandbox);
vm.runInContext(routeSource, routeSandbox);
const ROUTES = routeSandbox.window.KAAN_LOCALE_ROUTES;
assert(Boolean(ROUTES), "locale-routes.js must publish window.KAAN_LOCALE_ROUTES");

/* Every route maps to every locale, and back, with no stacking and no loss. */
for (const route of [...allRoutes, ...COMPANION_ROUTES.map((item) => ({ page: item.source }))]) {
  for (const locale of localeIds) {
    const localized = ROUTES.localizedRouteKey(route.page, locale);
    const prefix = routePrefixFor(locale, registry);
    assert(localized.startsWith(prefix), `${route.page} in ${locale} must start with ${prefix || "(no prefix)"}`);
    assert(
      !/^(?:tr|de|es|fr)\/(?:tr|de|es|fr)\//.test(localized),
      `stacked locale prefix produced for ${route.page} in ${locale}: ${localized}`,
    );
    assert(ROUTES.localeFromRoutePath(localized) === locale, `${localized} must resolve back to ${locale}`);
    assert(ROUTES.canonicalRouteKey(localized) === route.page, `${localized} must strip back to ${route.page}`);
    /* Round-tripping through another locale must be lossless. */
    for (const other of localeIds) {
      const hop = ROUTES.localizedRouteKey(ROUTES.canonicalRouteKey(localized), other);
      assert(ROUTES.canonicalRouteKey(hop) === route.page, `${localized} -> ${other} lost its route identity`);
    }
  }
}

/* The legacy query shell resolves to the canonical localized project route. */
for (const slug of slugs) {
  for (const locale of localeIds) {
    const mapped = ROUTES.localizedRouteKey("project-detail.html", locale, `?project=${slug}`);
    assert(
      mapped === `${routePrefixFor(locale, registry)}projects/${slug}/`,
      `legacy shell for ${slug} must map to the canonical ${locale} project route, got ${mapped}`,
    );
  }
}

/* External destinations are never rewritten. */
for (const external of [
  "https://github.com/UAJOP",
  "https://www.linkedin.com/in/balcikaan/",
  "https://sinama.kaanbalci.com",
  "https://drive.google.com/file/d/x/view",
  "mailto:kaanb8776@gmail.com",
  "tel:+900000000",
  "//cdn.example.com/x.js",
  "#main-content",
]) {
  for (const locale of localeIds) {
    assert(
      ROUTES.localizedInternalHref(external, locale, { siteRoot: "../", localeRoot: "" }) === external,
      `${external} must survive a switch to ${locale} untouched`,
    );
  }
}

/* Assets keep one root-relative identity: there is no /de/assets/. */
for (const asset of ["assets/logo.webp", "style.css", "css/a11y.css", "script.js", "CV-KAAN-BALCI.pdf"]) {
  for (const locale of localeIds) {
    const mapped = ROUTES.localizedInternalHref(asset, locale, { siteRoot: "../", localeRoot: "" });
    assert(!/^(?:tr|de|es|fr)\//.test(mapped), `${asset} must not take a locale prefix in ${locale}`);
    assert(mapped === `../${asset}`, `${asset} must resolve to the site root in ${locale}, got ${mapped}`);
  }
}

/* Tracking parameters do not survive a language switch; meaningful ones do. */
assert(ROUTES.preservedRouteSearch("?utm_source=x&role=applied-ai&fbclid=1") === "?role=applied-ai", "role must survive a locale switch");
assert(ROUTES.preservedRouteSearch("?utm_source=x&gclid=1") === "", "tracking parameters must not survive a locale switch");
assert(ROUTES.preservedRouteSearch("?project=weather-app") === "", "the legacy slug parameter is re-expressed as a path, not carried");

/* ---------- 12. generated localized documents ---------- */

const localizedDocuments = [];
for (const locale of generateLocales) {
  const prefix = registry.byId.get(locale).routePrefix;
  if (!exists(prefix)) continue;
  for (const route of [...allRoutes, ...COMPANION_ROUTES]) {
    const file = `${prefix}/${route.page || "index.html"}`.replace(/\/$/, "/index.html");
    localizedDocuments.push({ locale, route, file });
  }
}

const readyLocales = generateLocales.filter((locale) => coverage.get(locale)?.missing.length === 0);
for (const locale of readyLocales) {
  const prefix = registry.byId.get(locale).routePrefix;
  assert(exists(prefix), `${locale} is complete and in localizedRoutes.generate, so /${prefix}/ must exist`);
}
for (const locale of generateLocales) {
  if (readyLocales.includes(locale)) continue;
  assert(!exists(registry.byId.get(locale).routePrefix), `${locale} is incomplete, so it must ship no routes at all`);
}

const routeCountPerLocale = allRoutes.length + COMPANION_ROUTES.length;
assert(
  localizedDocuments.length === readyLocales.length * routeCountPerLocale,
  `expected ${readyLocales.length * routeCountPerLocale} localized documents, planned ${localizedDocuments.length}`,
);

const SITE_ORIGIN = "https://kaanbalci.com";
for (const { locale, route, file } of localizedDocuments) {
  assert(exists(file), `${file} must exist`);
  if (!exists(file)) continue;
  const html = read(file);
  const definition = registry.byId.get(locale);
  const indexable = indexableLocales.includes(locale) && route.indexable !== false;

  /* generated-page marker */
  assert(html.includes("GENERATED FILE. Do not edit."), `${file} must identify itself as generated`);
  assert(html.includes(`Locale: ${locale}`), `${file} must record its source locale`);
  assert(html.includes(`data/i18n/packs/${locale}/`), `${file} must record where its copy came from`);

  /* the page IS its locale */
  assert(new RegExp(`<html[^>]*lang="${definition.htmlLang}"`).test(html), `${file} must declare lang="${definition.htmlLang}"`);
  assert(new RegExp(`data-route-locale="${locale}"`).test(html), `${file} must declare its route locale`);

  /* canonical points at the same-locale page, never back to English */
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expectedCanonical = `${SITE_ORIGIN}/${ROUTES.localizedRouteKey(route.page, locale)}`;
  assert(canonical === expectedCanonical, `${file} canonical must be ${expectedCanonical}, got ${canonical}`);

  /* robots follows the activation gate */
  const robots = html.match(/<meta name="robots" content="([^"]+)"/)?.[1];
  assert(
    robots === (indexable ? "index, follow" : "noindex, follow"),
    `${file} robots must be ${indexable ? "index, follow" : "noindex, follow"}, got ${robots}`,
  );

  /* metadata is localized, not copied from English */
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || "";
  assert(title.trim().length > 0, `${file} needs a title`);
  assert(description.trim().length > 0, `${file} needs a description`);
  assert(html.includes(`<meta property="og:locale" content="${definition.ogLocale}"`), `${file} needs og:locale`);
  assert(html.includes(`<meta property="og:url" content="${expectedCanonical}"`), `${file} og:url must match canonical`);
  assert(/<meta property="og:title"/.test(html), `${file} needs og:title`);
  assert(/<meta property="og:description"/.test(html), `${file} needs og:description`);
  assert(/<meta name="twitter:title"/.test(html), `${file} needs twitter:title`);
  assert(/<meta name="twitter:description"/.test(html), `${file} needs twitter:description`);

  /* hreflang only once the locale set is genuinely activated */
  const hasHreflang = /hreflang=/.test(html);
  assert(hasHreflang === indexable, `${file} must ${indexable ? "publish" : "not publish"} hreflang alternates`);

  /* Nested asset paths: two independent depths. `siteRoot` reaches the repo
   * root where assets live, `localeRoot` reaches this locale's own root where
   * sibling pages live. Conflating them is how the BRIEF 09A gallery-path bug
   * happened, so both are asserted explicitly at every depth. */
  const depths = routeDepths(route.page, definition.routePrefix);
  assert(html.includes(`data-site-root="${depths.siteRoot}"`), `${file} must declare data-site-root="${depths.siteRoot}"`);
  assert(html.includes(`data-locale-root="${depths.localeRoot}"`), `${file} must declare data-locale-root="${depths.localeRoot}"`);
  for (const src of html.match(/\bsrc="([^"]+)"/g) || []) {
    const value = src.slice(5, -1);
    if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value)) continue;
    assert(
      exists(path.posix.normalize(path.posix.join(path.posix.dirname(file), value))),
      `${file} references a missing asset: ${value}`,
    );
  }
  for (const href of html.match(/\bhref="([^"]+)"/g) || []) {
    const value = href.slice(6, -1);
    if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value)) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), value.split("#")[0].split("?")[0]));
    const resolved = target.endsWith("/") ? `${target}index.html` : target;
    assert(exists(resolved), `${file} links to a missing route or asset: ${value}`);
    /* internal page links stay inside this locale */
    if (/\.html$/.test(resolved) || resolved.endsWith("/index.html")) {
      assert(
        resolved.startsWith(`${definition.routePrefix}/`),
        `${file} links out of its locale: ${value} resolves to ${resolved}`,
      );
    }
  }

  /* external links are untouched */
  for (const external of ["https://github.com/UAJOP", "https://www.linkedin.com/in/balcikaan/"]) {
    if (!read(route.source).includes(external)) continue;
    assert(html.includes(external), `${file} must preserve the external link ${external}`);
  }

  /* no query-string SEO duplicates */
  assert(!/rel="canonical"[^>]*project-detail\.html\?/.test(html), `${file} must not canonicalize a query-string URL`);

  /* JSON-LD agrees with the page it sits on */
  for (const block of html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []) {
    const body = block.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, "");
    let data = null;
    try {
      data = JSON.parse(body);
    } catch (error) {
      data = null;
    }
    assert(Boolean(data), `${file} has unparseable JSON-LD`);
    if (!data) continue;
    const languages = collectInLanguage(data);
    for (const value of languages) assert(value === locale, `${file} JSON-LD inLanguage must be ${locale}, got ${value}`);
  }
}

function collectInLanguage(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectInLanguage(item, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (node.inLanguage !== undefined) out.push(node.inLanguage);
  for (const value of Object.values(node)) collectInLanguage(value, out);
  return out;
}

/* ---------- 13. localized copy really is localized ---------- */

const dictionaries = loadLegacyDictionaries();
for (const locale of readyLocales) {
  const pack = loadAuthoredPack(locale);
  const prefix = registry.byId.get(locale).routePrefix;
  for (const route of STATIC_ROUTES) {
    const file = `${prefix}/${route.page || "index.html"}`.replace(/\/$/, "/index.html");
    if (!exists(file)) continue;
    const html = read(file);
    const meta = pack.meta?.[route.id];
    assert(Boolean(meta), `${locale} pack has no metadata for ${route.id}`);
    if (!meta) continue;
    const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    assert(title === meta.title, `${file} title must come from the ${locale} pack`);
  }
  /* Project routes compose their metadata from the project overlay. */
  for (const slug of slugs) {
    const file = `${prefix}/projects/${slug}/index.html`;
    if (!exists(file)) continue;
    const overlay = pack.projects?.[slug] || {};
    const canonicalProject = projects.projectDetails[slug];
    const expectedTitle = `${overlay.title || canonicalProject.title.en} | Kaan Balcı`;
    const title = decode(read(file).match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    assert(title === expectedTitle, `${file} title must compose the ${locale} project overlay`);
    const expectedDescription = truncateDescription(overlay.subtitle || canonicalProject.subtitle?.en || overlay.overview || "");
    const description = decode(read(file).match(/<meta name="description" content="([^"]*)"/)?.[1] || "");
    assert(description === expectedDescription, `${file} description must compose the ${locale} project overlay`);
  }
}

function decode(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/* ---------- 14. hreflang matrix, when it exists ---------- */

if (indexableLocales.length) {
  const matrixLocales = [registry.defaultLocale, ...indexableLocales];
  for (const route of allRoutes) {
    for (const locale of matrixLocales) {
      const file = `${routePrefixFor(locale, registry)}${route.page || "index.html"}`.replace(/\/$/, "/index.html");
      if (!exists(file)) continue;
      const html = read(file);
      for (const other of matrixLocales) {
        const href = `${SITE_ORIGIN}/${ROUTES.localizedRouteKey(route.page, other)}`;
        const lang = registry.byId.get(other).htmlLang;
        assert(html.includes(`hreflang="${lang}" href="${href}"`), `${file} missing ${lang} alternate`);
        const targetFile = `${routePrefixFor(other, registry)}${route.page || "index.html"}`.replace(/\/$/, "/index.html");
        assert(exists(targetFile), `${file} advertises ${lang} alternate ${href}, which has no document`);
      }
      const xDefault = `${SITE_ORIGIN}/${ROUTES.localizedRouteKey(route.page, registry.defaultLocale)}`;
      assert(html.includes(`hreflang="x-default" href="${xDefault}"`), `${file} x-default must point at the English equivalent`);
      for (const id of localeIds) {
        if (matrixLocales.includes(id)) continue;
        assert(!html.includes(`hreflang="${registry.byId.get(id).htmlLang}"`), `${file} must not advertise inactive ${id}`);
      }
    }
  }
}

/* ---------- 15. sitemap ---------- */

const sitemap = read("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedSitemap = [];
for (const route of allRoutes) {
  for (const locale of [registry.defaultLocale, ...indexableLocales]) {
    expectedSitemap.push(`${SITE_ORIGIN}/${ROUTES.localizedRouteKey(route.page, locale)}`);
  }
}
assert(
  sitemapUrls.length === expectedSitemap.length,
  `sitemap holds ${sitemapUrls.length} URLs, expected ${expectedSitemap.length} (${allRoutes.length} routes x ${1 + indexableLocales.length} indexable locale(s))`,
);
assert(new Set(sitemapUrls).size === sitemapUrls.length, "the sitemap must not repeat a URL");
for (const url of expectedSitemap) assert(sitemapUrls.includes(url), `sitemap missing ${url}`);
for (const id of localeIds) {
  if (id === registry.defaultLocale || indexableLocales.includes(id)) continue;
  assert(
    !sitemapUrls.some((url) => url.startsWith(`${SITE_ORIGIN}/${id}/`)),
    `${id} is not activated and must not appear in the production sitemap`,
  );
}
assert(!sitemapUrls.some((url) => url.includes("404")), "the 404 page must never be in the sitemap");
assert(!sitemapUrls.some((url) => url.includes("project-detail.html")), "the legacy project shell must never be in the sitemap");
assert(!sitemapUrls.some((url) => url.includes("?")), "the sitemap must hold no query-string URLs");

/* ---------- 16. English routes are unchanged and explicitly English ---------- */

const rootHtml = fs.readdirSync(ROOT).filter((file) => file.endsWith(".html")).sort();
const projectHtml = fs.existsSync(path.join(ROOT, "projects"))
  ? fs.readdirSync(path.join(ROOT, "projects")).sort().map((slug) => `projects/${slug}/index.html`).filter(exists)
  : [];
const englishHtml = [...rootHtml, ...projectHtml];

let runtimePageCount = 0;
for (const file of englishHtml) {
  const source = read(file);
  if (!source.includes("script.js")) continue;
  runtimePageCount += 1;

  if (file === "404.html") {
    assert(source.includes("data-route-locale-from-path"), "the root 404 must derive its locale from the failed path");
    assert(/src="\/(?:js|script)/.test(source), "the root 404 must load scripts root-absolutely: it is served at any depth");
    assert(/href="\/(?:style|css|assets)/.test(source), "the root 404 must load styles and assets root-absolutely");
  } else {
    assert(/<html[^>]*data-route-locale="en"/.test(source), `${file} must declare itself English so a saved preference cannot claim it`);
  }

  const bootstrapPath = file.startsWith("projects/") ? "../../js/core/locale-bootstrap.js" : "js/core/locale-bootstrap.js";
  const rootBootstrap = file === "404.html" ? "/js/core/locale-bootstrap.js" : bootstrapPath;
  assert(source.includes(`src="${rootBootstrap}"`), `${file} missing locale bootstrap`);
  assert(source.indexOf("locale-bootstrap.js") < source.indexOf("<body"), `${file} locale bootstrap must run before body parse`);

  const hasHreflang = /hreflang=/.test(source);
  const isIndexableEnglishRoute = file !== "404.html" && file !== "project-detail.html";
  assert(
    hasHreflang === (indexableLocales.length > 0 && isIndexableEnglishRoute),
    `${file} hreflang must follow the activation gate and indexability`,
  );

  for (const id of ["de", "es", "fr"]) {
    assert(!source.includes(`data-lang-switch="${id}"`), `${file} exposes inactive ${id} in fallback markup`);
  }
  const enCount = (source.match(/data-pv2-en=/g) || []).length;
  const trCount = (source.match(/data-pv2-tr=/g) || []).length;
  assert(enCount === trCount, `${file} data-pv2 EN/TR compatibility attributes must stay paired`);
  assert(!/data-(?:pv2|flagship|sinama|mr)-(?:de|es|fr)=/.test(source), `${file} must not grow one-attribute-per-locale patterns`);

  /* English pages carry no locale prefix anywhere. */
  for (const href of source.match(/\bhref="([^"]+)"/g) || []) {
    const value = href.slice(6, -1);
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    assert(!/^\/?(?:tr|de|es|fr)\//.test(value), `${file} links into a localized route: ${value}`);
  }
}
assert(runtimePageCount >= 19, `expected the authored English runtime pages, got ${runtimePageCount}`);
assert(projectHtml.length === 25, `expected 25 generated project routes, got ${projectHtml.length}`);

/* ---------- 17. runtime load order and pack shipping ---------- */

const scriptSource = read("script.js");
const order = ["i18n-data.js", "js/core/locale-routes.js", "js/core/locale.js", "js/core/shell.js", "js/core/theme.js", "js/core/i18n.js"];
let previous = -1;
for (const token of order) {
  const at = scriptSource.indexOf(`"${token}"`);
  assert(at > previous, `runtime order broken around ${token}`);
  previous = at;
}
assert(scriptSource.includes("__KAAN_PACK_LOCALE__"), "the runtime loader must read the pack locale from the bootstrap");
assert(scriptSource.includes("PAGE_PACK_SCOPES"), "packs must be scope-split per page type");
const packSplice = (scriptSource.match(/list\.splice\([^;]*\);/g) || []).find((line) => line.includes("packList")) || "";
assert(
  packSplice.includes('indexOf("i18n-data.js") + 1'),
  "packs must be spliced in immediately after the registry they key against",
);

for (const locale of packLocales) {
  for (const scope of ["core", "projects", "case-studies", "games", "request"]) {
    assert(exists(`i18n/pack-${locale}-${scope}.js`), `missing runtime pack i18n/pack-${locale}-${scope}.js`);
  }
  const core = read(`i18n/pack-${locale}-core.js`);
  assert(core.includes("KAAN_I18N_PACKS"), `${locale} core pack must publish into the shared pack registry`);
  assert(!core.includes('"meta"'), `${locale} core pack must not ship generation-only metadata to the browser`);
}

/* The core pack ships only the phrases the runtime looks up after render. */
const runtimeSubset = new Set(runtimeTextSources());
const runtimeAttributeSubset = new Set(runtimeAttributeSources());
for (const locale of readyLocales) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(`i18n/pack-${locale}-core.js`), sandbox);
  const shipped = Object.keys(sandbox.window.KAAN_I18N_PACKS[locale].pages?.text || {});
  for (const key of shipped) assert(runtimeSubset.has(key), `${locale} core pack ships ${JSON.stringify(key)}, which the runtime never looks up`);
  assert(
    shipped.length === runtimeSubset.size,
    `${locale} core pack ships ${shipped.length} phrases, expected the ${runtimeSubset.size} the runtime needs`,
  );
  const shippedAttributes = Object.keys(sandbox.window.KAAN_I18N_PACKS[locale].pages?.attribute || {});
  for (const key of shippedAttributes) {
    assert(runtimeAttributeSubset.has(key), `${locale} core pack ships attribute ${JSON.stringify(key)}, which the runtime never looks up`);
  }
  assert(
    shippedAttributes.length === runtimeAttributeSubset.size,
    `${locale} core pack ships ${shippedAttributes.length} attributes, expected the ${runtimeAttributeSubset.size} the root 404 needs`,
  );
}
const legacyRuntimeSource = read("js/core/i18n.js");
assert(
  /function translateLegacyText[\s\S]*?getPackPhrase/.test(legacyRuntimeSource),
  "the root 404 text walker must resolve candidate copy from the loaded core pack",
);
assert(
  /function translateLegacyAttribute[\s\S]*?getPackAttribute/.test(legacyRuntimeSource),
  "the root 404 attribute walker must resolve candidate copy from the loaded core pack",
);

/* ---------- 18. dynamic surfaces read the pack, not a per-locale branch ---------- */

const DYNAMIC_CALLSITES = [
  ["js/ajoop/assistant.js", '"ajoop"'],
  ["js/features/recruiter.js", '"recruiter"'],
  ["portfolio-v2.js", '"recruiterV2"'],
  ["js/features/ultimate.js", '"ultimate"'],
  ["js/request/form.js", '"request"'],
  ["adventure-game.js", '"adventure"'],
  ["ai-flow-puzzle.js", '"aiFlowPuzzle"'],
  ["joyday-paint.js", '"joydayPaint"'],
];
for (const [file, namespace] of DYNAMIC_CALLSITES) {
  const source = read(file);
  assert(source.includes(namespace), `${file} must name its locale pack namespace`);
  assert(source.includes("getLocalizedCollection"), `${file} must resolve copy through the central resolver`);
}
assert(read("case-study.js").includes("case-studies:"), "case studies must resolve their copy through the locale pack");
for (const file of CASE_STUDY_DATA_FILES) {
  assert(/\bid:\s*"/.test(read(file)), `${file} must declare a stable id for pack lookup`);
}

/* No feature module may grow a per-locale branch. */
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).sort((a, b) => compareKeys(a.name, b.name))) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(?:js|mjs|html|css)$/.test(entry.name)) sourceFiles.push(rel);
  }
}
walk("js");
for (const file of fs.readdirSync(ROOT).sort()) if (/\.js$/.test(file)) sourceFiles.push(file);

const allowedStorageOwners = new Set(["js/core/locale.js", "js/core/locale-bootstrap.js", "i18n-data.js"]);
const allowedLangWriters = new Set(["js/core/locale.js", "js/core/locale-bootstrap.js"]);
for (const file of sourceFiles) {
  const source = read(file);
  if (source.includes("kaanbalci-site-language")) assert(allowedStorageOwners.has(file), `${file} independently owns language storage`);
  if (/document\.documentElement\.lang\s*=/.test(source) || /\bhtml\.lang\s*=/.test(source)) {
    assert(allowedLangWriters.has(file), `${file} independently writes document language`);
  }
  assert(!source.includes("ENGİNEER"), `${file} contains Turkish-casing regression ENGİNEER`);
  assert(!source.includes("GİTHUB"), `${file} contains Turkish-casing regression GİTHUB`);
  assert(!source.includes("JAVASCRİPT"), `${file} contains Turkish-casing regression JAVASCRİPT`);
  if (file.startsWith("i18n/pack-")) continue;
  assert(!/\bde:\s*\{[\s\S]{0,40}\btr:/.test(source), `${file} must not branch per locale in feature code`);
  /* Rendering must clamp to *renderable*, not *active*. A candidate locale is
   * served from its own generated route and has to render in its own language;
   * clamping to `active` resets a /de/ page to English after the static HTML
   * has already painted it in German. */
  if (file !== "js/core/locale.js") {
    assert(
      !/isActiveLocale\([^)]*\)\s*\?/.test(source),
      `${file} clamps rendering to active locales — use renderableLocaleId() so a candidate route renders in its own language`,
    );
  }
}

for (const file of ["adventure-game.js", "ai-flow-puzzle.js", "joyday-paint.js", "case-study.js"]) {
  const source = read(file);
  assert(source.includes("getCurrentLocale"), `${file} must consume the central locale authority`);
  assert(!source.includes("kaanbalci-site-language"), `${file} must not read language storage directly`);
}
assert(!read("ai-flow-puzzle.js").includes("document.documentElement.lang ="), "AI Flow Puzzle must not own document language");

/* ---------- 19. canonical data still owns language-neutral facts ---------- */

function inspectLocalized(value, label) {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectLocalized(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value);
  const localeLike = keys.includes("en") && keys.every((key) => localeIds.includes(key));
  if (localeLike) {
    for (const id of ["en", "tr"]) {
      assert(Object.hasOwn(value, id) && value[id] !== "", `${label} missing legacy inline locale ${id}`);
    }
    for (const id of localeIds.filter((locale) => !["en", "tr"].includes(locale))) {
      assert(!Object.hasOwn(value, id), `${label} must not inline ${id}: localized copy belongs in data/i18n/packs/${id}/`);
    }
  }
  for (const [key, child] of Object.entries(value)) inspectLocalized(child, `${label}.${key}`);
}
for (const file of LOCALIZED_DATA_FILES) inspectLocalized(readJson(file), file);

/* ---------- 20. terminology and casing ---------- */

for (const term of ["GitHub", "JavaScript", "Forward Deployed Engineer", "AI Engineer", "Solution Engineer", "SINAMA", "n8n"]) {
  assert(protectedTerms.has(term), `glossary must protect ${term}`);
}
const PROJECT_NAMES = ["SINAMA", "Merge Rush", "Joyday", "AI Flow Puzzle"];
/**
 * Every string a reader can actually see.
 *
 * The pack's own key paths are excluded — `projects.sinama.role` is an
 * identifier — and so are command-palette `keywords`, which are lowercase
 * match tokens compared against a lowercased query and never displayed.
 */
const NON_DISPLAY_FIELDS = new Set(["keywords"]);
function packCopyValues(node, out = [], key = "") {
  if (NON_DISPLAY_FIELDS.has(key)) return out;
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((item) => packCopyValues(item, out, key));
  else if (node && typeof node === "object") {
    for (const [childKey, child] of Object.entries(node)) packCopyValues(child, out, childKey);
  }
  return out;
}

for (const locale of readyLocales) {
  const values = packCopyValues(loadAuthoredPack(locale));
  const copy = values.join("\n");
  for (const term of protectedTerms) {
    /* A protected term may be absent from a pack, but never present with the
     * wrong casing: "Github", "Javascript", "N8N" and friends are regressions.
     * Keys are excluded — a registry path like `projects.sinama.role` is an
     * identifier, not copy. */
    const wrong = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    for (const found of copy.match(wrong) || []) {
      assert(found === term, `${locale} pack mutates protected term casing: ${found} should be ${term}`);
    }
  }
  const turkishCopy = packCopyValues(loadAuthoredPack("tr")).join("\n");
  for (const name of PROJECT_NAMES) {
    if (!turkishCopy.includes(name)) continue;
    assert(copy.includes(name), `${locale} pack must keep the canonical project name ${name}`);
  }
}

/* ---------- 21. CSS and first-paint contracts ---------- */

const css = read("style.css");
assert(css.includes('html[data-locale-pending="true"] body'), "first-paint pending CSS missing");
assert(css.includes(".lang-selector-select"), "N-locale selector styles missing");
assert(css.includes("[data-preserve-case]"), "protected terminology casing guard missing");
assert(read("css/a11y.css").includes(".visually-hidden"), "the screen-reader utility the selector uses must exist");

const i18nSource = read("js/core/i18n.js");
assert(i18nSource.includes("subscribeSiteLocale"), "translation presentation must subscribe to central locale changes");
assert(i18nSource.includes("applyProtectedTermCasing"), "terminology casing guard must be applied by i18n presentation");
assert(!i18nSource.includes('language === "tr" ? "tr" : "en"'), "core i18n must not clamp the locale model to EN/TR");

/* ---------- 22. generator determinism and hand-edit protection ---------- */

const GENERATORS = [
  ["scripts/generate-i18n.mjs", "i18n:generate"],
  ["scripts/extract-i18n-source.mjs", "i18n:extract"],
  ["scripts/generate-localized-routes.mjs", "i18n:routes"],
  ["scripts/build-locale-packs.mjs", "i18n:packs"],
];
for (const [file, script] of GENERATORS) {
  assert(exists(file), `${file} must exist`);
  assert(read(file).includes("--check"), `${file} must support a --check mode so CI can prove it is in step`);
}

const packageJson = readJson("package.json");
assert(packageJson.scripts?.["qa:i18n"] === "node scripts/qa-i18n.mjs", "package.json must expose qa:i18n");
assert(String(packageJson.scripts?.qa || "").includes("qa:i18n"), "qa:i18n must block npm run qa");
for (const [, script] of GENERATORS) assert(Boolean(packageJson.scripts?.[script]), `package.json must expose ${script}`);

const workflowPath = ".github/workflows/site-preflight.yml";
if (exists(workflowPath)) {
  const workflow = read(workflowPath);
  assert(workflow.includes("npm run qa:i18n"), "Site Preflight must run blocking qa:i18n");
}

/* ---------- 23. no hand-edited localized route ---------- */

for (const locale of generateLocales) {
  const prefix = registry.byId.get(locale).routePrefix;
  if (!exists(prefix)) continue;
  const seen = new Set();
  const walkLocale = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).sort((a, b) => compareKeys(a.name, b.name))) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walkLocale(rel);
      else seen.add(rel);
    }
  };
  walkLocale(prefix);
  for (const file of seen) {
    assert(file.endsWith(".html"), `${file} does not belong in a generated locale route tree`);
    assert(read(file).includes("GENERATED FILE. Do not edit."), `${file} looks hand-edited: it carries no generator marker`);
  }
  const planned = new Set(localizedDocuments.filter((item) => item.locale === locale).map((item) => item.file));
  for (const file of seen) assert(planned.has(file), `${file} is not part of the planned route matrix`);
}

/* ---------- 24. docs ---------- */

assert(exists("docs/multilingual-architecture.md"), "the multilingual architecture doc must exist");
const architecture = read("docs/multilingual-architecture.md");
for (const topic of ["localized static route", "hreflang", "activation", "locale pack"]) {
  assert(architecture.toLowerCase().includes(topic), `docs/multilingual-architecture.md must cover ${topic}`);
}
assert(exists("docs/language-pack-review-v1.md"), "the owner language review artifact must exist");

/* ---------- report ---------- */

const coverageLine = packLocales
  .map((locale) => `${locale} ${coverage.get(locale).percent.toFixed(1)}%`)
  .join(" · ");

if (failures.length) {
  console.error(`i18n QA failed: ${failures.length} failure(s), ${assertions} assertions`);
  failures.slice(0, 60).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 60) console.error(`… ${failures.length - 60} more`);
  process.exit(1);
}
console.log(
  `i18n QA passed: ${assertions} assertions\n` +
    `  locales: ${active.map((item) => item.id).join(", ")} active · ${inactive.length} inactive\n` +
    `  coverage: en 100.0% · ${coverageLine}\n` +
    `  routes: ${allRoutes.length} canonical · ${localizedDocuments.length} localized documents · ${sitemapUrls.length} sitemap URLs`,
);
