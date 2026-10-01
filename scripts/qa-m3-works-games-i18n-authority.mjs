#!/usr/bin/env node
/* G-64 source authority: Works/Games copy has exactly one authority, the
 * canonical common message domain. Proves that (1) the structure carries no
 * copy, (2) build props take copy only from the canonical resolver and fail
 * closed, and (3) every emitted document renders exactly the canonical values,
 * so canonical and rendered copy cannot silently diverge. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { productionMainProps } from "./home-about-react.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { LOCALIZED_ATTRIBUTES } from "./m3-works-games-accepted-copy.mjs";
import { buildWorksGamesFixture, WORKS_GAMES_IDS, worksGamesRouteRecords } from "./m3-works-games-fixture.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const LOCALES = ["en", "tr", "de", "es", "fr"];
const structure = readJson("data/site/m3-26-works-games-structure.json");
const manifest = readJson("data/i18n/works-games-semantic-keys.json");
const canonical = Object.fromEntries(LOCALES.map((locale) => [locale, readJson(`data/i18n/messages/${locale}/common.json`)]));
let assertions = 0;

/* (1) The structure binds keys only. */
function assertKeyOnlyStructure(candidate) {
  assert.equal(Object.hasOwn(candidate, "messages"), false, "structure must not carry a message catalog");
  const keys = new Set();
  const walk = (node) => {
    assert.notEqual(node.type, "text", "structure must not carry literal text");
    if (node.type === "message") keys.add(node.key);
    if (node.type !== "element") return;
    for (const attribute of node.attributes) {
      if (LOCALIZED_ATTRIBUTES.has(attribute.name)) {
        assert.equal(attribute.value?.type, "message", `localized ${attribute.name} must be key-bound`);
        keys.add(attribute.value.key);
      }
    }
    node.children.forEach(walk);
  };
  Object.values(candidate.pages).forEach((page) => page.children.forEach(walk));
  for (const fields of Object.values(candidate.catalogSearch || {})) Object.values(fields).forEach((key) => keys.add(key));
  return keys;
}

const boundKeys = assertKeyOnlyStructure(structure);
const manifestKeys = new Set([
  ...Object.values(manifest.sources).flatMap((source) => [...Object.values(source.text), ...Object.values(source.attribute)]),
  ...Object.values(manifest.catalogSearch).flatMap((fields) => Object.values(fields)),
]);
assert.deepEqual([...boundKeys].sort(), [...manifestKeys].sort(), "structure keys must be exactly the manifest bindings");
for (const key of boundKeys) {
  for (const locale of LOCALES) assert.ok(typeof canonical[locale][key] === "string" && canonical[locale][key], `${locale}: canonical ${key} missing`);
}
for (const key of manifest.promotedKeys) assert.ok(boundKeys.has(key), `promoted ${key} is not bound`);
assertions += 3 + boundKeys.size;
for (const [name, mutate] of [
  ["copy catalog in structure", (copy) => { copy.messages = { "works.filter.all": { en: "All" } }; }],
  ["literal text node", (copy) => { copy.pages.works.children[0].children.push({ type: "text", value: "All" }); }],
  ["literal localized attribute", (copy) => { copy.pages.games.children.find((node) => node.type === "element").attributes.push({ name: "aria-label", value: "Games" }); }],
]) {
  const copy = structuredClone(structure);
  mutate(copy);
  assert.throws(() => assertKeyOnlyStructure(copy), undefined, `${name} negative control did not fail`);
  assertions += 1;
}

/* (2) Props take copy only from the canonical resolver and fail closed. */
const routes = worksGamesRouteRecords().filter((route) => WORKS_GAMES_IDS.has(route.routeId));
assert.equal(routes.length, 10, "ten Works/Games documents");
const canaryLoader = (missing) => (locale) => {
  const real = loadProductionLocalization(locale);
  return { ...real, message: (key) => (key === missing ? undefined : `⟦${locale}:${key}⟧`) };
};
for (const route of routes) {
  const props = productionMainProps(route, { loadLocalization: canaryLoader(null) });
  for (const [key, value] of Object.entries(props.copy)) assert.equal(value, `⟦${route.locale}:${key}⟧`, `${route.output}: ${key} bypassed the canonical resolver`);
  const search = structure.catalogSearch[route.routeId];
  assert.deepEqual(props.catalog, {
    searchLabel: `⟦${route.locale}:${search.label}⟧`,
    searchPlaceholder: `⟦${route.locale}:${search.placeholder}⟧`,
  }, `${route.output}: catalog search bypassed the canonical resolver`);
  assert.throws(() => productionMainProps(route, { loadLocalization: canaryLoader(Object.keys(props.copy)[0]) }), /missing/, `${route.output}: missing copy must fail closed`);
  assert.throws(() => productionMainProps(route, { loadLocalization: canaryLoader(search.label) }), /missing catalog search/, `${route.output}: missing search copy must fail closed`);
  assertions += 4;
}

/* (3) Emitted documents render exactly the canonical values, in order. */
const atPath = (source, dataPath) => String(dataPath).split(".").reduce((value, segment) => value?.[segment], source);
function expectedSequence(route, messages) {
  const data = productionMainProps(route).data;
  const sequence = [];
  const walk = (node) => {
    if (node.type === "message") sequence.push(`text:${messages[node.key]}`);
    if (node.type === "data") sequence.push(`text:${atPath(data, node.path)}`);
    if (node.type !== "element") return;
    for (const attribute of node.attributes) {
      if (attribute.value?.type === "message") sequence.push(`${attribute.name}:${messages[attribute.value.key]}`);
    }
    node.children.forEach(walk);
  };
  structure.pages[route.routeId].children.forEach(walk);
  const search = structure.catalogSearch[route.routeId];
  return { sequence, search: { label: messages[search.label], placeholder: messages[search.placeholder] } };
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
      if (LOCALIZED_ATTRIBUTES.has(attribute[1])) sequence.push(`${attribute[1]}:${decodeHtml(attribute[2])}`);
    }
  }
  return { sequence, search };
}

const rootAt = process.argv.indexOf("--root");
const fixture = rootAt >= 0 ? { mixed: path.resolve(process.argv[rootAt + 1]), cleanup() {} } : await buildWorksGamesFixture();
try {
  for (const route of routes) {
    const html = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
    const rendered = renderedSequence(html);
    const expected = expectedSequence(route, canonical[route.locale]);
    assert.ok(expected.sequence.length > 50, `${route.output}: expected copy sequence is implausibly short`);
    assert.deepEqual(rendered, expected, `${route.output}: rendered copy diverges from canonical common messages`);
    assertions += 2;
  }

  /* Source-authority negative controls on real emitted documents. */
  const route = routes.find((item) => item.locale === "de" && item.routeId === "works");
  const html = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
  const promotedKey = "works.card.cars.title";
  const declaredKey = "works.hero.title";
  const controls = [
    ["canonical promoted copy edited, render stale", html, { ...canonical.de, [promotedKey]: `${canonical.de[promotedKey]} (neu)` }],
    ["canonical declared copy edited, render stale", html, { ...canonical.de, [declaredKey]: "Geänderter Titel" }],
    ["canonical search copy edited, render stale", html, { ...canonical.de, "works.search.label": "Suche" }],
    ["rendered copy edited, canonical unchanged", html.replace(`>${canonical.de[promotedKey]}<`, ">Cars<"), canonical.de],
    ["rendered alt edited, canonical unchanged", html.replace(`alt="${canonical.de["works.card.cars.alt"]}"`, 'alt="preview"'), canonical.de],
  ];
  for (const [name, document, messages] of controls) {
    assert.throws(() => assert.deepEqual(renderedSequence(document), expectedSequence(route, messages)), undefined, `${name} negative control did not fail`);
    assertions += 1;
  }
  console.log(`G-64 Works/Games i18n source authority passed. ${assertions} assertions · ${boundKeys.size} canonical keys (${manifest.promotedKeys.length} promoted) · 10 documents rendered exactly from common messages · ${controls.length + 3 + routes.length * 2} negative controls.`);
} finally {
  fixture.cleanup();
}
