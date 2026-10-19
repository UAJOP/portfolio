#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATELIS_ROUTE, ATELIS_ROUTE_ID, assertAtelisLocaleParity, atelisCardCopy, atelisModel, withAtelisWorksCard } from "./atelis-case-study.mjs";
import { productionDocumentProps } from "./home-about-react.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const locales = ["en", "tr", "de", "es", "fr"];
const model = atelisModel();
const routes = canonicalReactRoutes().filter((route) => route.routeId === ATELIS_ROUTE_ID);
const attr = (node, name) => node?.attributes?.find((entry) => entry.name === name)?.value;
const count = (nodes, test) => nodes.reduce((total, node) => total + (node?.type === "element" ? (test(node) ? 1 : 0) + count(node.children || [], test) : 0), 0);
const strings = (node) => node?.type === "text" ? node.value : node?.type === "element" ? (node.children || []).map(strings).join(" ") : "";

assert.deepEqual(routes.map((route) => route.locale), locales, "Atelis must have exactly the five active portfolio locales");
assert.deepEqual(routes.map((route) => route.pathname), [
  "/atelis-design-case-study/",
  "/tr/atelis-design-case-study/",
  "/de/atelis-design-case-study/",
  "/es/atelis-design-case-study/",
  "/fr/atelis-design-case-study/",
]);

for (const route of routes) {
  const props = productionDocumentProps(route, "assets-react/qa.js");
  assert.equal(props.document.page, "caseStudy", `${route.locale}: page type`);
  assert.equal(props.document.navPage, "works", `${route.locale}: Works navigation owner`);
  assert.deepEqual(props.document.v4Styles, ["atelis"], `${route.locale}: scoped Atelis style`);
  assert.equal(props.head.canonical, `https://kaanbalci.com${route.pathname}`, `${route.locale}: self canonical`);
  assert.equal(props.head.alternates.length, 6, `${route.locale}: five locales plus x-default`);
  assert.equal(props.head.robots, "index, follow", `${route.locale}: indexable`);
  assert.equal(count(props.main.structure, (node) => node.tag === "h1"), 1, `${route.locale}: one H1`);
  assert.equal(count(props.main.structure, (node) => node.tag === "img"), 9, `${route.locale}: nine production images`);
  assert.equal(count(props.main.structure, (node) => node.tag === "img" && !attr(node, "alt")), 0, `${route.locale}: every image has alt text`);
  assert(!strings({ type: "element", children: props.main.structure }).includes("Atelis-Design/portfolio"), `${route.locale}: private client repository is absent`);
  assert(!strings({ type: "element", children: props.main.structure }).match(/CMS (is )?(live|active)|conversion uplift|lead uplift/i), `${route.locale}: no unsupported outcome claim`);
  const copy = atelisCardCopy(route.locale);
  for (const field of [copy.title, copy.summary, copy.caseStudy, copy.live]) assert(field && typeof field === "string", `${route.locale}: localized Works card copy`);
}

const baseWorks = readJson("data/site/m3-26-works-games-structure.json").pages.works.children;
for (const locale of locales) {
  const injected = withAtelisWorksCard(baseWorks, locale);
  assert.equal(count(injected, (node) => attr(node, "data-project-link") === `/${ATELIS_ROUTE}`), 1, `${locale}: Atelis appears once in Primary Evidence`);
  assert.throws(() => withAtelisWorksCard(injected, locale), /already exists/, `${locale}: duplicate injection is rejected`);
}

// Native orthography: ASCII-stripped renderings of the reviewed copy must not return.
const asciiStripped = {
  en: /\bBalci\b/,
  tr: /\b(Balci|cok|Cok|ic|Ic|Musteri|musteri|Yil|Canli|canli|Gelistirici|iletisim|Iletisim|Calismasi)\b/,
  de: /\b(Balci|fur|Geraten|verlasslich|uber|Uber|offnen|Zuruck|veroffentlicht\w*|Turkische|funf)\b/,
  es: /\b(Balci|Ano|multilingue|fotografia|galerias?|pagina|Pagina|produccion|Indice|diseno)\b/,
  fr: /\b(Balci|Etude|etude|interieure?s?|decouverte|Annee|reels|Developpeur|publie|Ecrans)\b/,
};
const nativeMarkers = {
  en: ["Kaan Balcı"],
  tr: ["çok dilli bir iç mimarlık", "Müşteri", "Yıl", "Canlı", "Geliştirici", "iletişim", "Kaan Balcı"],
  de: ["für Innenarchitektur", "Geräten", "verlässlich", "öffnen", "Kaan Balcı"],
  es: ["Año", "multilingüe", "fotografía", "Kaan Balcı"],
  fr: ["Étude de cas", "intérieure", "découverte", "Kaan Balcı"],
};
for (const locale of locales) {
  const all = JSON.stringify(model.locales[locale]);
  const stripped = all.match(asciiStripped[locale]);
  assert(!stripped, `${locale}: ASCII-stripped Atelis copy "${stripped?.[0]}"`);
  for (const marker of nativeMarkers[locale]) assert(all.includes(marker), `${locale}: native Atelis copy "${marker}"`);
  assert(!all.includes("�") && !/Ã.|Ä.|Å./.test(all), `${locale}: no double-encoded Atelis copy`);
}

// Negative controls: unknown locales and missing translated keys fail closed.
assert.throws(() => atelisCardCopy("xx"), /missing localized Atelis content/, "unknown locale fails closed");
const withoutCaption = structuredClone(model.locales.tr);
delete withoutCaption.images.walden.caption;
assert.throws(() => assertAtelisLocaleParity(model.locales.en, withoutCaption, "tr"), /images\.walden\.caption/, "missing translated key fails closed");
const blankTitle = structuredClone(model.locales.de);
blankTitle.hero.title = " ";
assert.throws(() => assertAtelisLocaleParity(model.locales.en, blankTitle, "de"), /hero\.title/, "blank translated key fails closed");

const catalog = readJson("data/portfolio/catalog.json");
assert.equal(catalog.identities.filter((item) => item.id === model.id).length, 1, "one canonical Atelis identity");
assert.equal(catalog.identities.find((item) => item.id === model.id).repo, null, "no client repository is published");

for (const image of model.images) {
  const file = path.join(ROOT, image.src.replace(/^\//, ""));
  assert(fs.existsSync(file), `${image.id}: asset exists`);
  assert(fs.statSync(file).size > 0, `${image.id}: asset is non-empty`);
}

const sitemap = read("sitemap.xml");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(urls.length, 235, "sitemap has 235 generated URLs");
assert.equal(new Set(urls).size, urls.length, "sitemap has no duplicates");
for (const route of routes) assert(urls.includes(`https://kaanbalci.com${route.pathname}`), `${route.locale}: sitemap includes Atelis route`);

console.log(`Atelis focused gate passed: ${routes.length} locales · 1 canonical identity · 1 Primary Evidence card per locale · ${model.images.length} production images · ${urls.length} sitemap URLs.`);
