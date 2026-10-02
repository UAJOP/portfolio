#!/usr/bin/env node
/* G-64 source authority: every piece of Works/Games copy has exactly one
 * authority and the emitted documents render exactly that authority.
 * - common messages (data/i18n/messages/{locale}/common.json) via the manifest;
 * - project roles from canonical project data plus the localized role label;
 * - data-pv2-en / data-pv2-tr from the element's own binding at a fixed locale;
 * - catalog search copy from the accepted runtime's authorities
 *   (scripts/m3-works-games-catalog-copy.mjs).
 * The structure holds keys and references only, props fail closed, and
 * negative controls prove canonical/rendered divergence cannot pass. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { productionMainProps } from "./home-about-react.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { LOCALIZED_ATTRIBUTES } from "./m3-works-games-accepted-copy.mjs";
import { catalogSearchCopy, defaultCatalogSources, defaultRoleSources, projectRole } from "./m3-works-games-catalog-copy.mjs";
import { buildWorksGamesFixture, WORKS_GAMES_IDS, worksGamesRouteRecords } from "./m3-works-games-fixture.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const LOCALES = ["en", "tr", "de", "es", "fr"];
const FIXED_LOCALE_ATTRIBUTES = new Set(["data-pv2-en", "data-pv2-tr"]);
const structure = readJson("data/site/m3-26-works-games-structure.json");
const manifest = readJson("data/i18n/works-games-semantic-keys.json");
const canonical = Object.fromEntries(LOCALES.map((locale) => [locale, readJson(`data/i18n/messages/${locale}/common.json`)]));
let assertions = 0;
let controls = 0;

/* (1) The structure binds keys and references only. */
function assertReferenceOnlyStructure(candidate) {
  assert.equal(Object.hasOwn(candidate, "messages"), false, "structure must not carry a message catalog");
  const keys = new Set([candidate.roleLabel]);
  const roles = new Set();
  const walk = (node) => {
    assert.ok(["element", "message", "role", "data", "space"].includes(node.type), `structure node type ${node.type} carries literal copy`);
    if (node.type === "message") keys.add(node.key);
    if (node.type === "role") roles.add(node.ref);
    if (node.type !== "element") return;
    for (const attribute of node.attributes) {
      if (LOCALIZED_ATTRIBUTES.has(attribute.name)) {
        assert.equal(attribute.value?.type, "message", `localized ${attribute.name} must be key-bound`);
        keys.add(attribute.value.key);
      }
      if (FIXED_LOCALE_ATTRIBUTES.has(attribute.name)) {
        assert.ok(["message", "role"].includes(attribute.value?.type) && attribute.value.locale === attribute.name.slice(-2), `${attribute.name} must be bound at its fixed locale`);
      }
    }
    node.children.forEach(walk);
  };
  Object.values(candidate.pages).forEach((page) => page.children.forEach(walk));
  return { keys, roles };
}

const bound = assertReferenceOnlyStructure(structure);
const manifestKeys = new Set([
  manifest.roleLabel,
  ...Object.values(manifest.sources).flatMap((source) => [...Object.values(source.text), ...Object.values(source.attribute)]),
]);
const manifestRoles = new Set(Object.values(manifest.sources).flatMap((source) => Object.values(source.roles)));
assert.deepEqual([...bound.keys].sort(), [...manifestKeys].sort(), "structure keys must be exactly the manifest bindings");
assert.deepEqual([...bound.roles].sort(), [...manifestRoles].sort(), "structure roles must be exactly the manifest role bindings");
for (const key of bound.keys) {
  for (const locale of LOCALES) assert.ok(typeof canonical[locale][key] === "string" && canonical[locale][key], `${locale}: canonical ${key} missing`);
}
for (const key of manifest.promotedKeys) assert.ok(bound.keys.has(key), `promoted ${key} is not bound`);
/* No second editable copy of a canonical project role or of search copy. */
for (const locale of LOCALES) {
  const duplicated = Object.keys(canonical[locale]).filter((key) => /^works\.card\.(?!aiFlow\.)[^.]+\.role$/.test(key) || /^(works|games)\.search\./.test(key));
  assert.deepEqual(duplicated, [], `${locale}: common messages duplicate a canonical role or search authority`);
}
assertions += 4 + bound.keys.size;
for (const [name, mutate] of [
  ["copy catalog in structure", (copy) => { copy.messages = { "works.filter.all": { en: "All" } }; }],
  ["literal text node", (copy) => { copy.pages.works.children[0].children.push({ type: "text", value: "All" }); }],
  ["literal localized attribute", (copy) => { copy.pages.games.children.find((node) => node.type === "element").attributes.push({ name: "aria-label", value: "Games" }); }],
  ["literal data-pv2 copy", (copy) => { copy.pages.works.children.find((node) => node.type === "element").attributes.push({ name: "data-pv2-tr", value: "Rolüm: AI Designer" }); }],
  ["data-pv2 bound at the wrong locale", (copy) => { copy.pages.works.children.find((node) => node.type === "element").attributes.push({ name: "data-pv2-en", value: { type: "role", ref: "my-museum", locale: "tr" } }); }],
]) {
  const copy = structuredClone(structure);
  mutate(copy);
  assert.throws(() => assertReferenceOnlyStructure(copy), undefined, `${name} negative control did not fail`);
  controls += 1;
}

/* (2) Props take copy only from the canonical authorities and fail closed. */
const routes = worksGamesRouteRecords().filter((route) => WORKS_GAMES_IDS.has(route.routeId));
assert.equal(routes.length, 10, "ten Works/Games documents");
const canaryLoader = (missing) => (locale) => {
  const real = loadProductionLocalization(locale);
  return { ...real, message: (key) => (key === missing ? undefined : `⟦${locale}:${key}⟧`) };
};
const canaryCatalog = (missing) => ({
  surface: (namespace) => Object.fromEntries(["en", "tr"].map((locale) => [locale, new Proxy({}, { get: (_, field) => (field === missing ? undefined : `⟦surface:${locale}:${namespace}.${String(field)}⟧`) })])),
  dynamicPack: (locale) => ({ ultimate: new Proxy({}, { get: (_, field) => (field === missing ? undefined : `⟦dynamic:${locale}:${String(field)}⟧`) }) }),
  pagesPack: (locale) => ({ text: new Proxy({}, { get: (_, phrase) => (phrase === missing ? undefined : `⟦pages:${locale}:${String(phrase)}⟧`) }) }),
});
const real = defaultRoleSources();
const canaryRoles = (missingLocale) => ({
  projects: real.projects,
  details: real.details,
  pack: (locale, domain) => {
    if (locale === missingLocale) return {};
    if (locale === "en") return {};
    return new Proxy({}, {
      get: (_, key) => (domain === "content" ? `⟦role:${locale}:${String(key)}⟧` : { role: `⟦role:${locale}:${String(key)}⟧` }),
    });
  },
});
for (const route of routes) {
  const props = productionMainProps(route, { loadLocalization: canaryLoader(null), catalogSources: canaryCatalog(null), roleSources: canaryRoles(null) });
  for (const [key, value] of Object.entries(props.copy)) assert.equal(value, `⟦${route.locale}:${key}⟧`, `${route.output}: ${key} bypassed the canonical resolver`);
  const expectedSearch = route.routeId === "works"
    ? (["en", "tr"].includes(route.locale)
      ? [`⟦surface:${route.locale}:ultimate.projectSearchLabel⟧`, `⟦surface:${route.locale}:ultimate.projectSearchPlaceholder⟧`]
      : [`⟦dynamic:${route.locale}:projectSearchLabel⟧`, `⟦dynamic:${route.locale}:projectSearchPlaceholder⟧`])
    : (route.locale === "en"
      ? ["Search games", "Search by game, category or feature..."]
      : [`⟦pages:${route.locale}:Search games⟧`, `⟦pages:${route.locale}:Search by game, category or feature...⟧`]);
  assert.deepEqual([props.catalog.searchLabel, props.catalog.searchPlaceholder], expectedSearch, `${route.output}: catalog search bypassed its authority`);
  for (const [ref, line] of Object.entries(props.roles)) {
    assert.ok(line.startsWith(`⟦${route.locale}:${structure.roleLabel}⟧ `), `${route.output}: ${ref} role label bypassed the canonical resolver`);
    if (route.locale !== "en" && route.locale !== "tr") assert.match(line, /⟦role:/, `${route.output}: ${ref} role bypassed canonical project data`);
  }
  assert.throws(() => productionMainProps(route, { loadLocalization: canaryLoader(Object.keys(props.copy)[0]) }), /missing/, `${route.output}: missing copy must fail closed`);
  /* English Games search copy is the phrase itself; every other source is read and must exist. */
  const searchField = route.routeId === "works" ? "projectSearchPlaceholder" : "Search games";
  const searchReadsSource = route.routeId === "works" || route.locale !== "en";
  if (searchReadsSource) assert.throws(() => productionMainProps(route, { catalogSources: canaryCatalog(searchField) }), /missing/, `${route.output}: missing search copy must fail closed`);
  if (route.routeId === "works") {
    assert.throws(() => productionMainProps(route, { loadLocalization: canaryLoader(structure.roleLabel) }), /missing/, `${route.output}: missing role label must fail closed`);
    if (!["en", "tr"].includes(route.locale)) {
      assert.throws(() => productionMainProps(route, { roleSources: canaryRoles(route.locale) }), /missing|role/, `${route.output}: missing canonical role must fail closed`);
    }
  }
  assertions += 4;
  controls += 1 + (searchReadsSource ? 1 : 0) + (route.routeId === "works" ? 1 + (["en", "tr"].includes(route.locale) ? 0 : 1) : 0);
}

/* (3) Emitted documents render exactly the canonical values, in order. */
const atPath = (source, dataPath) => String(dataPath).split(".").reduce((value, segment) => value?.[segment], source);
function expectedSequence(route, { messages = canonical, roleSources = real, catalogSources = defaultCatalogSources() } = {}) {
  const data = productionMainProps(route).data;
  const roleLine = (ref, locale) => `${messages[locale][structure.roleLabel]} ${projectRole(ref, locale, roleSources)}`;
  const sequence = [];
  const walk = (node) => {
    if (node.type === "message") sequence.push(`text:${messages[route.locale][node.key]}`);
    if (node.type === "role") sequence.push(`text:${roleLine(node.ref, route.locale)}`);
    if (node.type === "data") sequence.push(`text:${atPath(data, node.path)}`);
    if (node.type !== "element") return;
    for (const attribute of node.attributes) {
      const value = attribute.value;
      if (value?.type === "message") sequence.push(`${attribute.name}:${messages[value.locale || route.locale][value.key]}`);
      if (value?.type === "role") sequence.push(`${attribute.name}:${roleLine(value.ref, value.locale)}`);
    }
    node.children.forEach(walk);
  };
  structure.pages[route.routeId].children.forEach(walk);
  return { sequence, search: catalogSearchCopy(route.routeId, route.locale, catalogSources) };
}

function renderedSequence(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)[1];
  const searchRegion = main.match(/<div class="project-search-wrap reveal">[\s\S]*?<\/div><\/div>/)?.[0] || "";
  const search = {
    label: decodeHtml(searchRegion.match(/<label[^>]*>([^<]*)<\/label>/)?.[1] || ""),
    placeholder: decodeHtml(searchRegion.match(/placeholder="([^"]*)"/)?.[1] || ""),
  };
  const sequence = [];
  for (const token of main.replace(searchRegion, "").replace(/<!--[\s\S]*?-->/g, "").matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>|<\/[^>]+>|([^<]+)/gi)) {
    if (token[3] !== undefined) {
      const text = decodeHtml(token[3]);
      if (text.trim()) sequence.push(`text:${text}`);
      continue;
    }
    if (!token[1]) continue;
    for (const attribute of token[2].matchAll(/([^\s=]+)="([^"]*)"/g)) {
      if (LOCALIZED_ATTRIBUTES.has(attribute[1]) || FIXED_LOCALE_ATTRIBUTES.has(attribute[1])) sequence.push(`${attribute[1]}:${decodeHtml(attribute[2])}`);
    }
  }
  return { sequence, search };
}

const rootAt = process.argv.indexOf("--root");
const fixture = rootAt >= 0 ? { mixed: path.resolve(process.argv[rootAt + 1]), cleanup() {} } : await buildWorksGamesFixture();
try {
  for (const route of routes) {
    const rendered = renderedSequence(fs.readFileSync(path.join(fixture.mixed, route.output), "utf8"));
    const expected = expectedSequence(route);
    assert.ok(expected.sequence.length > 50, `${route.output}: expected copy sequence is implausibly short`);
    assert.deepEqual(rendered, expected, `${route.output}: rendered copy diverges from its canonical authority`);
    assertions += 2;
  }

  /* Source-authority negative controls on real emitted documents. */
  const route = routes.find((item) => item.locale === "de" && item.routeId === "works");
  const gamesRoute = routes.find((item) => item.locale === "fr" && item.routeId === "games");
  const html = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
  const gamesHtml = fs.readFileSync(path.join(fixture.mixed, gamesRoute.output), "utf8");
  const withMessage = (locale, key, value) => ({ ...canonical, [locale]: { ...canonical[locale], [key]: value } });
  const updatedRole = {
    ...real,
    pack: (locale, domain) => {
      const pack = real.pack(locale, domain);
      return locale === "de" && domain === "projects" ? { ...pack, "cars-dataset-analysis": { ...pack["cars-dataset-analysis"], role: "Python-Entwicklerin" } } : pack;
    },
  };
  const updatedSearch = { ...defaultCatalogSources(), dynamicPack: (locale) => ({ ultimate: { ...defaultCatalogSources().dynamicPack(locale).ultimate, projectSearchPlaceholder: "Suchen …" } }) };
  const updatedPhrase = { ...defaultCatalogSources(), pagesPack: (locale) => ({ text: { ...defaultCatalogSources().pagesPack(locale).text, "Search games": "Chercher" } }) };
  const negative = [
    ["canonical promoted copy edited, render stale", route, html, { messages: withMessage("de", "works.card.cars.title", "Autodaten-Analyse") }],
    ["canonical declared copy edited, render stale", route, html, { messages: withMessage("de", "works.hero.title", "Geänderter Titel") }],
    ["role label edited, render stale", route, html, { messages: withMessage("de", structure.roleLabel, "Rolle:") }],
    ["English role label edited, data-pv2 stale", route, html, { messages: withMessage("en", structure.roleLabel, "Role:") }],
    ["canonical project role updated, Works card stale", route, html, { roleSources: updatedRole }],
    ["structured-runtime search copy updated, render stale", route, html, { catalogSources: updatedSearch }],
    ["phrase-pack search copy updated, render stale", gamesRoute, gamesHtml, { catalogSources: updatedPhrase }],
    ["rendered copy edited, canonical unchanged", route, html.replace(`>${canonical.de["works.card.cars.title"]}<`, ">Cars<"), {}],
    ["rendered role edited, project data unchanged", route, html.replace(">Meine Rolle: Python-Entwickler<", ">Meine Rolle: Python Developer<"), {}],
    ["rendered data-pv2 edited", route, html.replace('data-pv2-tr="Rolüm: Python Developer"', 'data-pv2-tr="Rolüm: Python Geliştirici"'), {}],
    ["rendered alt edited, canonical unchanged", route, html.replace(`alt="${canonical.de["works.card.cars.alt"]}"`, 'alt="preview"'), {}],
    ["rendered search placeholder edited", route, html.replace("Stichwort suchen …", "Stichwort suchen..."), {}],
  ];
  for (const [name, target, document, sources] of negative) {
    const original = target === route ? html : gamesHtml;
    if (Object.keys(sources).length) assert.notDeepEqual(expectedSequence(target, sources), expectedSequence(target), `${name}: source mutation did not apply`);
    else assert.notEqual(document, original, `${name}: document mutation did not apply`);
    assert.throws(() => assert.deepEqual(renderedSequence(document), expectedSequence(target, sources)), undefined, `${name} negative control did not fail`);
    controls += 1;
  }
  console.log(`G-64 Works/Games source authority passed. ${assertions} assertions · ${bound.keys.size} common keys (${manifest.promotedKeys.length} promoted) · ${bound.roles.size} canonical project roles · data-pv2 fixed-locale bound · search from runtime authorities · 10 documents exact · ${controls} negative controls.`);
} finally {
  fixture.cleanup();
}
