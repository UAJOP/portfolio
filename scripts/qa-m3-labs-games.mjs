#!/usr/bin/env node
/**
 * G-71 — Master 3 #30 Labs + mini-game shell gate.
 *
 * Static: registry coverage, the 20 emitted documents, SSR content, metadata,
 * engine/host script contract, compatibility redirects, bundle budget.
 * Browser: hydration purity, the engine lifecycle (mount after hydration,
 * dispose, remount, idempotency), final-DOM and layout parity against the
 * accepted runtime, and per-game behaviour run identically against the
 * accepted and the React document.
 *
 * Every negative control mutates the real emitted document or the real
 * shipped script and must be rejected by the check it targets.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";
import { buildProductionSite } from "./build-production-site.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { generateLabsGamesStructure } from "./generate-m3-labs-games-structure.mjs";
import { LABS_GAMES_REVIEWED_EDITS, labsGamesAcceptedBase } from "./m3-30-public-edits.mjs";
import { ENGINE_HOST_REVIEWED_EDITS, engineHostAcceptedBase } from "./m3-30-1-public-edits.mjs";
import { servesUpstreamIcons, withIconSubset } from "./m3-32a-public-edits.mjs";
import { beforeFinalHardening } from "./m3-33-public-edits.mjs";
import { JOYDAY_STUDIO_ROUTE, JOYDAY_STUDIO_SCRIPT, withoutJoydayStudio } from "./v4-e06-1-joyday-studio-edits.mjs";
import { FLOW_PUZZLE_ROUTE, FLOW_PUZZLE_SCRIPT, withoutFlowPuzzleGame } from "./v4-e06-2-flow-puzzle-edits.mjs";

/* The approved #30 scope, stated here independently of the route registry. */
const PAGES = Object.freeze({
  labs: { engine: "labs", pageType: "labs", scripts: [], style: null, surface: "#math-3d-canvas", ready: "[data-labs-grid] article" },
  adventure: { engine: "adventure", pageType: "game", scripts: ["/adventure-game.js"], style: "/css/games/adventure.css", surface: "#career-merge-canvas", ready: "[data-merge-ladder] article" },
  joydayPaint: { engine: "joydayPaint", pageType: "game", scripts: ["/joyday-paint.js"], style: "/css/games/joyday-paint.css", surface: "#joyday-art-canvas", ready: "[data-joyday-colors] button" },
  aiFlowPuzzle: { engine: "aiFlowPuzzle", pageType: "game", scripts: ["/ai-flow-puzzle.js"], style: "/css/games/ai-flow-puzzle.css", surface: "[data-ai-board]", ready: "[data-ai-scenarios] button" },
});
const ENGINE_HOST = "/js/pages/engine-host.js";
/* The payload the React entry directly follows in every production document. */
const LAST_HYDRATION_PAYLOAD = "react-command-props";
const ENGINE_MARKERS = ["career-merge-canvas", "joyday-art-canvas", "data-ai-board", "math-3d-canvas", "KaanEngineQueue"];
const RAW_BUDGET = 260000;
const GZIP_BUDGET = 72000;

const registry = loadRegistry();
const LOCALES = [registry.defaultLocale, ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale)];
const labsData = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/labs.json"), "utf8"));
const routes = canonicalReactRoutes();
const targetRoutes = routes.filter((route) => Object.hasOwn(PAGES, route.routeId));
const requestedRoot = process.argv.includes("--root") ? path.resolve(process.argv[process.argv.indexOf("--root") + 1]) : null;
const staticOnly = process.argv.includes("--static");
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-30-"));
const root = requestedRoot || path.join(temporary, "site");
const prefixOf = (route) => (route.locale === registry.defaultLocale ? "" : `${route.locale}/`);

/* ------------------------------------------------------------------ static */

const normalize = (value) => decodeHtml(String(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const inlineCopy = (value) => decodeHtml(String(value).replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "")).replace(/[ \t\n\r\f]+/g, " ").trim();
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
const attrOf = (tag, name) => tag?.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? null;
const meta = (html, pattern, attribute = "content") => { const tag = html.match(pattern)?.[0]; return tag ? decodeHtml(attrOf(tag, attribute) || "") : null; };
const count = (html, pattern) => (html.match(pattern) || []).length;
const labsGrid = (html) => mainOf(html).match(/<div class="labs-grid" data-labs-grid(?:="")?>([\s\S]*?)<\/div><\/section>/)?.[1];
const withoutLabCards = (html) => mainOf(html).replace(/(<div class="labs-grid" data-labs-grid(?:="")?>)[\s\S]*?(<\/div><\/section>)/, "$1$2");

function validateCoverage(records) {
  assert.deepEqual(new Set(records.map((route) => route.routeId)), new Set(Object.keys(PAGES)), "the four approved Labs/mini-game pages");
  assert.equal(records.length, Object.keys(PAGES).length * LOCALES.length, "four pages across every active locale");
  assert.equal(new Set(records.map((route) => route.output)).size, records.length, "unique documents");
  for (const route of records) assert.equal(route.renderer, "react", `${route.pathname}: React-owned`);
}

function validateDocument(route, html, accepted) {
  const page = PAGES[route.routeId];
  assert.ok(html.startsWith("<!DOCTYPE html>"), `${route.pathname}: document doctype`);
  assert.match(html, /<main\b[^>]*data-react-main=""[^>]*data-prerendered="true"/, `${route.pathname}: SSR React main`);
  assert.ok(mainOf(html).length > 1000, `${route.pathname}: meaningful static main`);
  assert.equal(count(mainOf(html), /<h1\b/gi), 1, `${route.pathname}: one h1`);
  assert.match(html, new RegExp(`<html lang="${attrOf(accepted.match(/<html\b[^>]*>/i)[0], "lang")}"[^>]*data-route-locale="${route.locale}"`), `${route.pathname}: document locale`);
  assert.equal(meta(html, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"), `https://kaanbalci.com${route.pathname}`, `${route.pathname}: canonical`);
  assert.equal(count(html, /<link\b[^>]*rel="alternate"[^>]*>/gi), LOCALES.length + 1, `${route.pathname}: hreflang set`);
  const body = html.match(/<body\b[^>]*>/i)?.[0] || "";
  assert.equal(attrOf(body, "data-page"), page.pageType, `${route.pathname}: page type keeps the runtime module scope`);
  assert.equal(attrOf(body, "data-page"), attrOf(accepted.match(/<body\b[^>]*>/i)[0], "data-page"), `${route.pathname}: accepted page type`);
  for (const tag of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) assert.match(tag[0], /rel="[^"]*noopener/, `${route.pathname}: external target safety`);
  assert.equal(count(html, /<script\b[^>]*type="module"[^>]*src="\/assets-react\//gi), 1, `${route.pathname}: one React client entry`);
}

function validateMetadata(route, html, accepted) {
  const title = (source) => decodeHtml(source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  assert.equal(title(html), title(accepted), `${route.pathname}: accepted title`);
  for (const [name, pattern] of [
    ["description", /<meta\b[^>]*name="description"[^>]*>/i],
    ["og:title", /<meta\b[^>]*property="og:title"[^>]*>/i],
    ["og:description", /<meta\b[^>]*property="og:description"[^>]*>/i],
    ["og:url", /<meta\b[^>]*property="og:url"[^>]*>/i],
    ["og:image", /<meta\b[^>]*property="og:image"[^>]*>/i],
    ["twitter:title", /<meta\b[^>]*name="twitter:title"[^>]*>/i],
  ]) {
    const expected = meta(accepted, pattern);
    if (expected !== null) assert.equal(meta(html, pattern), expected, `${route.pathname}: accepted ${name}`);
    else if (name.startsWith("og:") && name !== "og:url") assert.ok(meta(html, pattern), `${route.pathname}: ${name} is never emitted empty`);
  }
}

function validateCopy(route, html, accepted) {
  /* V4-E06.1: Joyday carries its studio shell on top of the accepted page; the
   * declared additions are set aside and everything else is held as before. */
  const reactMain = route.routeId === "labs" ? withoutLabCards(html) : route.routeId === JOYDAY_STUDIO_ROUTE ? withoutJoydayStudio(mainOf(html)) : route.routeId === FLOW_PUZZLE_ROUTE ? withoutFlowPuzzleGame(mainOf(html)) : mainOf(html);
  assert.equal(normalize(reactMain), normalize(mainOf(accepted)), `${route.pathname}: accepted main copy`);
  assert.equal(inlineCopy(reactMain), inlineCopy(mainOf(accepted)), `${route.pathname}: accepted inline whitespace`);
  for (const tag of ["section", "article", "aside", "h2", "h3", "canvas", "button", "input", "select", "a", "img"]) {
    assert.equal(count(reactMain, new RegExp(`<${tag}\\b`, "gi")), count(mainOf(accepted), new RegExp(`<${tag}\\b`, "gi")), `${route.pathname}: ${tag} structure count`);
  }
}

/* Structured data: one valid WebPage record that agrees with the route, the
 * document language and the rest of the head, and claims nothing else. */
const JSON_LD_KEYS = ["@context", "@type", "author", "description", "image", "inLanguage", "isPartOf", "name", "url"];
function validateStructuredData(route, html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(blocks.length, 1, `${route.pathname}: one JSON-LD block`);
  let data;
  assert.doesNotThrow(() => { data = JSON.parse(blocks[0]); }, `${route.pathname}: JSON-LD parses`);
  assert.deepEqual(Object.keys(data).sort(), JSON_LD_KEYS, `${route.pathname}: JSON-LD states only the reviewed fields`);
  assert.deepEqual([data["@context"], data["@type"]], ["https://schema.org", "WebPage"], `${route.pathname}: JSON-LD type`);
  assert.equal(data.url, `https://kaanbalci.com${route.pathname}`, `${route.pathname}: JSON-LD url is the route`);
  assert.equal(data.url, meta(html, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"), `${route.pathname}: JSON-LD url is the canonical`);
  assert.equal(data.inLanguage, attrOf(html.match(/<html\b[^>]*>/i)[0], "lang"), `${route.pathname}: JSON-LD language is the document language`);
  assert.equal(data.name, decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)[1]), `${route.pathname}: JSON-LD name is the title`);
  assert.equal(data.description, meta(html, /<meta\b[^>]*name="description"[^>]*>/i), `${route.pathname}: JSON-LD description is the meta description`);
  assert.equal(data.image, meta(html, /<meta\b[^>]*property="og:image"[^>]*>/i), `${route.pathname}: JSON-LD image is og:image`);
  assert.deepEqual(data.isPartOf, { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: "https://kaanbalci.com/" }, `${route.pathname}: JSON-LD site`);
  assert.deepEqual(data.author, { "@type": "Person", name: "Kaan Balcı", url: "https://kaanbalci.com/" }, `${route.pathname}: JSON-LD author`);
}

/* The runtime contract: the page's own stylesheet, the retained engine script
 * and, after it, the lifecycle host — the last classic script before the
 * hydration payloads. */
function validateRuntime(route, html) {
  const page = PAGES[route.routeId];
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map((match) => match[1]).filter((src) => !src.startsWith("/assets-react/") && src !== "/js/core/locale-bootstrap.js");
  assert.deepEqual(scripts, ["/portfolio-data.js", "/script.js", "/portfolio-v2.js", ...page.scripts, ...(route.routeId === JOYDAY_STUDIO_ROUTE ? [JOYDAY_STUDIO_SCRIPT] : route.routeId === FLOW_PUZZLE_ROUTE ? [FLOW_PUZZLE_SCRIPT] : []), ENGINE_HOST], `${route.pathname}: engine script and lifecycle host`);
  if (page.style) assert.match(html, new RegExp(`<link rel="stylesheet" href="${page.style}"/>`), `${route.pathname}: page stylesheet`);
  assert.ok(html.indexOf(ENGINE_HOST) < html.indexOf('<script id="react-main-props"'), `${route.pathname}: host precedes the hydration payload`);
  /* The host identifies the React entry as the element after this payload. */
  assert.match(html, new RegExp(`<script id="${LAST_HYDRATION_PAYLOAD}" type="application/json">[^<]*</script><script type="module" src="/assets-react/[^"]+"></script></body>`), `${route.pathname}: the React entry directly follows the last hydration payload`);
  assert.equal(count(mainOf(html), new RegExp(`<[^>]*${page.surface.startsWith("#") ? `id="${page.surface.slice(1)}"` : page.surface.slice(1, -1)}`, "g")), 1, `${route.pathname}: engine surface is server-rendered`);
  assert.doesNotMatch(mainOf(html), /\son[a-z]+="/, `${route.pathname}: no inline handlers in React-owned markup`);
}

function validateLabs(route, html) {
  assert.match(mainOf(html), /<section class="[^"]*math-lab-section[^"]*" id="algorithmic-3d-lab">/, `${route.pathname}: Algorithmic 3D Lab anchor`);
  const grid = labsGrid(html);
  assert.ok(grid, `${route.pathname}: experiment index`);
  const cards = [...grid.matchAll(/<article class="lab-card">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  assert.equal(cards.length, labsData.length, `${route.pathname}: one card per canonical lab`);
  labsData.forEach((item, index) => {
    assert.ok(normalize(cards[index]).includes(item.title), `${route.pathname}: ${item.id} title`);
    assert.equal(attrOf(cards[index].match(/<a\b[^>]*>/)[0], "href"), `/${prefixOf(route)}${item.url.replace(/^\//, "")}`, `${route.pathname}: ${item.id} localized link`);
    for (const tag of item.tags) assert.ok(cards[index].includes(`<span>${tag}</span>`), `${route.pathname}: ${item.id} tag ${tag}`);
    if (route.locale === "en" || route.locale === "tr") {
      assert.ok(normalize(cards[index]).includes(item.description[route.locale]), `${route.pathname}: ${item.id} canonical description`);
      assert.ok(normalize(cards[index]).includes(item.type[route.locale]), `${route.pathname}: ${item.id} canonical type`);
    }
  });
}

async function runStatic() {
  if (!requestedRoot) await buildProductionSite({ outputDirectory: root });
  validateCoverage(targetRoutes);
  const committed = fs.readFileSync(path.join(ROOT, "data/site/m3-30-labs-games-structure.json"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(`${JSON.stringify(generateLabsGamesStructure(), null, 2)}\n`, committed, "Labs/mini-game React contract is regenerated from the accepted documents");
  assert.deepEqual(Object.keys(JSON.parse(committed).pages).sort(), Object.keys(PAGES).sort(), "contract covers exactly the approved pages");

  const sizes = {};
  for (const route of targetRoutes) {
    const file = path.join(root, route.output);
    assert.ok(fs.existsSync(file), `${route.pathname}: emitted document`);
    const html = fs.readFileSync(file, "utf8");
    const accepted = fs.readFileSync(path.join(ROOT, route.output), "utf8");
    validateDocument(route, html, accepted);
    validateMetadata(route, html, accepted);
    validateCopy(route, html, accepted);
    validateRuntime(route, html);
    validateStructuredData(route, html);
    if (route.routeId === "labs") validateLabs(route, html);
    if (route.locale === registry.defaultLocale) sizes[route.routeId] = { accepted: Buffer.byteLength(accepted), react: Buffer.byteLength(html), payload: Buffer.byteLength(html.match(/<script id="react-main-props" type="application\/json">([\s\S]*?)<\/script>/)[1]) };
  }
  for (const route of targetRoutes.filter((item) => item.locale === registry.defaultLocale)) {
    const stub = fs.readFileSync(path.join(root, `${route.route.replace(/\/$/, "")}.html`), "utf8");
    assert.match(stub, new RegExp(`url=/${route.route}`), `${route.routeId}: compatibility redirect preserved`);
  }
  assert.ok(fs.existsSync(path.join(root, "404.html")), "unknown routes keep the static 404 document");
  for (const unknown of ["labs/missing/index.html", "adventure2/index.html", "xx/labs/index.html"]) assert.equal(fs.existsSync(path.join(root, unknown)), false, `no document for unknown route ${unknown}`);

  const bundleDir = path.join(root, "assets-react");
  const bundles = fs.readdirSync(bundleDir).filter((file) => file.endsWith(".js"));
  assert.equal(bundles.length, 1, "one shared React client bundle and no per-route chunk");
  const bundle = fs.readFileSync(path.join(bundleDir, bundles[0]));
  const bundleText = bundle.toString("utf8");
  assert.ok(bundle.byteLength <= RAW_BUDGET, `client raw budget: ${bundle.byteLength} > ${RAW_BUDGET}`);
  assert.ok(gzipSync(bundle).byteLength <= GZIP_BUDGET, `client gzip budget: ${gzipSync(bundle).byteLength} > ${GZIP_BUDGET}`);
  for (const marker of ENGINE_MARKERS) assert.equal(bundleText.includes(marker), false, `engine code is not in the shared client bundle: ${marker}`);
  const engineFiles = {};
  for (const file of ["js/pages/labs.js", "adventure-game.js", "joyday-paint.js", "ai-flow-puzzle.js", ENGINE_HOST.slice(1)]) {
    const bytes = fs.readFileSync(path.join(root, file));
    engineFiles[file] = `${bytes.byteLength} B raw/${gzipSync(bytes).byteLength} B gzip`;
  }

  /* The host's bundle-failure fallback answers only to the React entry, which
   * it recognises as one element — the module script that directly follows the
   * document's last hydration payload — with no address, content hash,
   * third-party host or tracker file name involved. */
  const hostSource = fs.readFileSync(path.join(root, ENGINE_HOST.slice(1)), "utf8");
  const withoutComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, " ");
  const hostCode = withoutComments(hostSource);
  const validateHostEntry = (code) => {
    assert.equal(code.match(/const LAST_HYDRATION_PAYLOAD = "([^"]+)";/)?.[1], LAST_HYDRATION_PAYLOAD, "engine host: the React entry is located after the last hydration payload");
    assert.match(code, /const entry = document\.getElementById\(LAST_HYDRATION_PAYLOAD\)\?\.nextElementSibling;\s+return target instanceof HTMLScriptElement && target\.type === "module" && target === entry;/, "engine host: the React entry is one element, compared by identity");
    assert.match(code, /if \(isReactEntry\(event\.target\)\) release\(\);/, "engine host: only the React entry failing to load releases the engines");
    assert.equal(/target\.type === "module"\) release\(\)/.test(code), false, "engine host: an arbitrary module failure must not release the engines");
    for (const forbidden of [bundles[0], "assets-react", "[src", "https://", "cloudflare", "insights", "beacon"]) assert.equal(code.includes(forbidden), false, `engine host: must not identify the entry by address (${forbidden})`);
  };
  validateHostEntry(hostCode);
  assert.equal(engineHostAcceptedBase(ENGINE_HOST.slice(1), hostSource).includes("isReactEntry"), false, "engine host: reversing the reviewed hotfix edits removes the entry check");
  assert.equal(Object.keys(ENGINE_HOST_REVIEWED_EDITS).join(), ENGINE_HOST.slice(1), "the hotfix edits only the engine host");

  let negativeControls = 0;
  const mustFail = (label, expected, action) => {
    assert.throws(action, (error) => error instanceof assert.AssertionError && expected.test(error.message), `${label}: negative control did not fail on its own assertion`);
    negativeControls += 1;
  };
  const mutated = (label, source, pattern, replacement) => {
    const result = source.replace(pattern, replacement);
    assert.notEqual(result, source, `${label}: negative-control mutation matched nothing`);
    return result;
  };
  const sample = (routeId, locale = "en") => {
    const route = targetRoutes.find((item) => item.routeId === routeId && item.locale === locale);
    return { route, html: fs.readFileSync(path.join(root, route.output), "utf8"), accepted: fs.readFileSync(path.join(ROOT, route.output), "utf8") };
  };
  const adventure = sample("adventure"), labs = sample("labs"), labsDe = sample("labs", "de"), joydayTr = sample("joydayPaint", "tr");
  mustFail("missing route", /four pages across every active locale/, () => validateCoverage(targetRoutes.filter((route) => !(route.routeId === "aiFlowPuzzle" && route.locale === "fr"))));
  mustFail("route left legacy", /: React-owned$/m, () => validateCoverage(targetRoutes.map((route) => (route.routeId === "labs" && route.locale === "es" ? { ...route, renderer: "legacy" } : route))));
  mustFail("wrong canonical", /: canonical$/m, () => validateDocument(adventure.route, mutated("wrong canonical", adventure.html, /(<link\b[^>]*rel="canonical"[^>]*href=")[^"]*"/i, '$1https://kaanbalci.com/games/"'), adventure.accepted));
  mustFail("empty prerendered main", /: meaningful static main$/m, () => validateDocument(adventure.route, mutated("empty main", adventure.html, /(<main\b[^>]*>)[\s\S]*?<\/main>/i, "$1</main>"), adventure.accepted));
  mustFail("wrong document locale", /: document locale$/m, () => validateDocument(joydayTr.route, mutated("wrong locale", joydayTr.html, /<html lang="tr"/, '<html lang="en"'), joydayTr.accepted));
  mustFail("wrong locale copy", /: accepted main copy$/m, () => validateCopy(joydayTr.route, sample("joydayPaint").html, joydayTr.accepted));
  mustFail("wrong page type", /: page type keeps the runtime module scope$/m, () => validateDocument(labs.route, mutated("wrong page type", labs.html, /<body data-page="labs"/, '<body data-page="home"'), labs.accepted));
  mustFail("wrong metadata", /: accepted description$/m, () => validateMetadata(adventure.route, mutated("wrong description", adventure.html, /(<meta name="description" content=")[^"]*"/, '$1Wrong"'), adventure.accepted));
  mustFail("accepted #30 host releases on any module failure", /engine host: the React entry is located after the last hydration payload/, () => validateHostEntry(withoutComments(engineHostAcceptedBase(ENGINE_HOST.slice(1), hostSource))));
  mustFail("host releases on any module failure", /engine host: (only the React entry failing to load releases the engines|an arbitrary module failure must not release the engines)/, () => validateHostEntry(mutated("any module", hostCode, "if (isReactEntry(event.target)) release();", 'if (event.target.type === "module") release();')));
  mustFail("host identifies the entry by its namespace", /engine host: (the React entry is one element, compared by identity|must not identify the entry by address)/, () => validateHostEntry(mutated("namespace", hostCode, "target === entry;", 'target.matches(\'[src^="/assets-react/"]\');')));
  mustFail("host hardcodes the content-hashed entry", /engine host: must not identify the entry by address/, () => validateHostEntry(`${hostCode}\nconst ENTRY = "/assets-react/${bundles[0]}";`));
  mustFail("host names a third-party tracker", /engine host: must not identify the entry by address/, () => validateHostEntry(`${hostCode}\nconst IGNORED = "cloudflareinsights.com/beacon.min.js";`));
  mustFail("document whose React entry does not follow the last payload", /: the React entry directly follows the last hydration payload$/m, () => validateRuntime(adventure.route, mutated("entry adjacency", adventure.html, /(<script id="react-command-props" type="application\/json">[\s\S]*?<\/script>)(<script type="module")/, '$1<span hidden=""></span>$2')));
  mustFail("missing lifecycle host", /: engine script and lifecycle host$/m, () => validateRuntime(adventure.route, mutated("missing host", adventure.html, `<script src="${ENGINE_HOST}"></script>`, "")));
  mustFail("missing engine script", /: engine script and lifecycle host$/m, () => validateRuntime(adventure.route, mutated("missing engine", adventure.html, '<script src="/adventure-game.js"></script>', "")));
  mustFail("engine loaded twice", /: engine script and lifecycle host$/m, () => validateRuntime(adventure.route, mutated("double engine", adventure.html, '<script src="/adventure-game.js"></script>', '<script src="/adventure-game.js"></script><script src="/adventure-game.js"></script>')));
  mustFail("missing canvas", /: engine surface is server-rendered$/m, () => validateRuntime(adventure.route, mutated("missing canvas", adventure.html, /<canvas id="career-merge-canvas"[\s\S]*?<\/canvas>/, "")));
  mustFail("inline handler", /: no inline handlers in React-owned markup$/m, () => validateRuntime(adventure.route, mutated("inline handler", adventure.html, / data-adventure-drop=""/, ' data-adventure-drop="" onclick="dropItem()"')));
  const ld = (label, html, from, to) => mutated(label, html, from, to);
  mustFail("missing structured data", /: one JSON-LD block$/m, () => validateStructuredData(adventure.route, ld("missing JSON-LD", adventure.html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, "")));
  mustFail("invalid structured data", /: JSON-LD parses$/m, () => validateStructuredData(adventure.route, ld("invalid JSON-LD", adventure.html, '<script type="application/ld+json">{', '<script type="application/ld+json">{,')));
  mustFail("structured data for another route", /: JSON-LD url is the route$/m, () => validateStructuredData(adventure.route, ld("wrong JSON-LD url", adventure.html, '"url":"https://kaanbalci.com/adventure/"', '"url":"https://kaanbalci.com/games/"')));
  mustFail("structured data in another language", /: JSON-LD language is the document language$/m, () => validateStructuredData(joydayTr.route, ld("wrong JSON-LD language", joydayTr.html, '"inLanguage":"tr"', '"inLanguage":"en"')));
  mustFail("structured data disagrees with the head", /: JSON-LD name is the title$/m, () => validateStructuredData(labsDe.route, ld("wrong JSON-LD name", labsDe.html, /"name":"Kaan Labs[^"]*"/, '"name":"Kaan Labs"')));
  mustFail("fabricated structured data", /: JSON-LD states only the reviewed fields$/m, () => validateStructuredData(adventure.route, ld("fabricated rating", adventure.html, '"@type":"WebPage",', '"@type":"WebPage","aggregateRating":{"ratingValue":5},')));
  mustFail("lost Labs anchor", /: Algorithmic 3D Lab anchor$/m, () => validateLabs(labs.route, mutated("lost anchor", labs.html, ' id="algorithmic-3d-lab"', "")));
  mustFail("missing lab card", /: one card per canonical lab$/m, () => validateLabs(labs.route, mutated("missing card", labs.html, /<article class="lab-card">[\s\S]*?<\/article>/, "")));
  mustFail("unlocalized lab link", /: ai-flow-puzzle localized link$/m, () => validateLabs(labsDe.route, mutated("unlocalized link", labsDe.html, 'href="/de/ai-flow-puzzle/"', 'href="/ai-flow-puzzle/"')));
  mustFail("empty Labs index", /: accepted main copy$|: experiment index$/m, () => { const html = mutated("vitrine only", labs.html, /<canvas id="math-3d-canvas"[\s\S]*?<\/canvas>/, '<img alt="" src="/assets/portfolio_website_cover.webp"/>'); validateCopy(labs.route, html, labs.accepted); });

  console.log(`G-71 Labs/mini-game static gate passed. ${targetRoutes.length} documents · ${Object.keys(PAGES).length} pages × ${LOCALES.length} locales · client ${bundle.byteLength} B raw/${gzipSync(bundle).byteLength} B gzip (budget ${RAW_BUDGET}/${GZIP_BUDGET}) · per-route chunks 0 · ${negativeControls} observed negative-control failures.`);
  console.log(`  retained engines (classic scripts, loaded only by their own page): ${Object.entries(engineFiles).map(([file, size]) => `${file} ${size}`).join(" · ")}`);
  console.log(`  EN document bytes accepted→React (hydration payload): ${Object.entries(sizes).map(([id, size]) => `${id} ${size.accepted}→${size.react} (${size.payload})`).join(" · ")}`);
}

/* ----------------------------------------------------------------- browser */

const launch = process.env.GITHUB_ACTIONS === "true" ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"], protocolTimeout: 180000 } : { headless: true, protocolTimeout: 180000 };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

/* Injected right after </main>, i.e. before any engine script runs: it holds
 * the server markup, watches it until hydration starts, and compares it again
 * the moment hydration completes — before the host starts the engine. */
const probe = `<script>(()=>{const m=document.querySelector('main[data-react-main]'),nodes=r=>{const a=[r],w=document.createTreeWalker(r,NodeFilter.SHOW_ALL);while(w.nextNode())a.push(w.currentNode);return a},attrs=r=>nodes(r).filter(n=>n.nodeType===1).map(n=>({n,v:JSON.stringify([...n.attributes].map(a=>[a.name,a.value]).sort())}));const p=window.__m330p={html:m.innerHTML,nodes:nodes(m),attrs:attrs(m),before:[],errors:[],signals:0,settled:false,started:false,time:{}};const rec=r=>r.type+':'+r.target.nodeName+(r.attributeName?'@'+r.attributeName:'');const o=new MutationObserver(rs=>{if(!p.started)p.before.push(...rs.map(rec))});o.observe(m,{subtree:true,childList:true,characterData:true,attributes:true});addEventListener('portfolio:react-main-hydration-start',()=>{p.before.push(...o.takeRecords().map(rec));p.started=true;p.time.start=performance.now()});addEventListener('portfolio:react-main-hydration-error',e=>p.errors.push(e.detail||{}));addEventListener('portfolio:react-main-hydrated',()=>{p.time.hydrated=performance.now();p.signals++;const post=document.querySelector('main[data-react-main]'),pa=attrs(post),pn=nodes(post);p.sameMain=post===m;p.sameHtml=post.innerHTML===p.html;p.sameNodes=p.nodes.length===pn.length&&p.nodes.every((n,i)=>n===pn[i]);p.sameAttrs=p.attrs.length===pa.length&&p.attrs.every((x,i)=>x.n===pa[i].n&&x.v===pa[i].v);const h=window.KaanEngineHost;p.hostReady=!!h;p.mountedAtHydration=h?h.ids().filter(id=>h.get(id).mounted):null;p.releasedAtHydration=h?h.released:null});document.addEventListener('DOMContentLoaded',()=>addEventListener('portfolio:react-main-hydrated',()=>{p.time.mounted=performance.now();const h=window.KaanEngineHost;p.mountedAfter=h?h.ids().filter(id=>h.get(id).mounted):null;requestAnimationFrame(()=>requestAnimationFrame(()=>{p.settled=true}))}))})();</script>`;
/* An unrelated module script that cannot be loaded, as a document carries one
 * in production (an injected analytics beacon a tracker blocker refuses):
 * `before` the React entry, so it fails before hydration starts, and `after`
 * it, so it fails while hydration is under way; and `namespace`, a module under
 * the React bundle namespace itself (a chunk that no longer exists, say). None
 * of them is the React entry. */
const UNRELATED_MODULE = Object.freeze({
  before: { at: /<\/main>/i, tag: '<script type="module" src="/unrelated/missing-module.js"></script>', place: (match, tag) => `${match}${tag}` },
  after: { at: /<\/body>/i, tag: '<script type="module" src="https://unrelated-module.invalid/beacon.min.js"></script>', place: (match, tag) => `${tag}${match}` },
  namespace: { at: /<\/main>/i, tag: '<script type="module" src="/assets-react/unrelated-chunk.js"></script>', place: (match, tag) => `${match}${tag}` },
});
const SABOTAGE = Object.freeze({
  text: "document.querySelector('main h1').textContent='hydration drift'",
  attribute: "document.querySelector('main h1').setAttribute('data-hydration-drift','1')",
  copy: "document.querySelector('main').append(' hydration drift')",
});

function serverFor(directory, { instrument = false, acceptedEngines = false, acceptedIcons = false } = {}) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = relative.endsWith("/") ? `${relative}index.html` : relative;
    const target = path.resolve(directory, file);
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      const notFound = path.join(directory, "404.html");
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return response.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "not found");
    }
    response.writeHead(200, { "content-type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (instrument && path.extname(target) === ".html" && /data-react-main/.test(fs.readFileSync(target, "utf8"))) {
      const mode = url.searchParams.get("sabotage");
      const sabotage = mode !== null && Object.hasOwn(SABOTAGE, mode) ? `<script>${SABOTAGE[mode]}</script>` : "";
      let html = fs.readFileSync(target, "utf8").replace(/<\/main>/i, `</main>${probe}${sabotage}`);
      for (const position of (url.searchParams.get("module") || "").split(",").filter((name) => Object.hasOwn(UNRELATED_MODULE, name))) {
        const { at, tag, place } = UNRELATED_MODULE[position];
        html = html.replace(at, (match) => place(match, tag));
      }
      return response.end(html);
    }
    /* #32A: the upstream icon host is unreachable here, so the accepted
     * documents load the same local icons the React documents do. */
    if (acceptedIcons && path.extname(target) === ".html") {
      const html = fs.readFileSync(target, "utf8");
      if (servesUpstreamIcons(html)) return response.end(withIconSubset(html, file));
    }
    /* The accepted side runs the accepted engines: the #30 reviewed edits are
     * reversed, so the comparison is against the pre-#30 runtime bytes. #33
     * edited one engine again; those later edits are reversed first. */
    /* V4-E06.2 reworked ai-flow-puzzle.js, so the #30 reviewed edits can no
     * longer be reversed out of it; the accepted document is served the
     * current engine. Its play is no longer compared (section 2). */
    if (acceptedEngines && file.replaceAll("\\", "/") !== "ai-flow-puzzle.js" && LABS_GAMES_REVIEWED_EDITS[file.replaceAll("\\", "/")]) return response.end(labsGamesAcceptedBase(file, beforeFinalHardening(file.replaceAll("\\", "/"), fs.readFileSync(target, "utf8"))));
    fs.createReadStream(target).pipe(response);
  });
}

const CONDITIONS = Object.freeze({
  "desktop-dark": { theme: "dark", viewport: { width: 1440, height: 900 } },
  "desktop-light": { theme: "light", viewport: { width: 1440, height: 900 } },
  "mobile-dark": { theme: "dark", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } },
  "mobile-light": { theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } },
});

/* Test instrumentation only: a fixed random source so the accepted and the
 * React page take the same branches, frame accounting that does not count the
 * gate's own frames, and capture of programmatic downloads. */
function instrumentation() {
  Math.random = () => 0.42;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeClick = HTMLAnchorElement.prototype.click;
  const state = { frames: 0, downloads: [], nativeRaf, audio: { contexts: [], gains: 0, closed: 0 } };
  /* Audio accounting: which contexts the page created, closed, and how many
   * sounds it scheduled. Nothing is muted or faked. */
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Native = window[name];
    if (!Native) continue;
    window[name] = class extends Native {
      constructor(...args) { super(...args); state.audio.contexts.push(this); }
      createGain() { state.audio.gains += 1; return super.createGain(); }
      close() { state.audio.closed += 1; return super.close(); }
    };
  }
  /* Engines revoke an object URL right after the download click, so the Blob is kept. */
  const blobs = new Map();
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = createObjectURL(blob); blobs.set(url, blob); return url; };
  window.__m330 = state;
  window.requestAnimationFrame = (callback) => nativeRaf((time) => { state.frames += 1; callback(time); });
  /* Asynchronous completions the gate can hold back: a file read that does not
   * start until released, and how often a reader was aborted. Off by default. */
  state.io = { holdReads: false, held: [], readerAborts: 0 };
  const NativeReader = window.FileReader;
  window.FileReader = class extends NativeReader {
    readAsText(...args) {
      if (!state.io.holdReads) return super.readAsText(...args);
      state.io.held.push(() => super.readAsText(...args));
      return undefined;
    }
    abort() { state.io.readerAborts += 1; return super.abort(); }
  };
  /* Zero-delay timers the gate can hold back and deliver later, in order. */
  /* Module scripts that failed to load, by their declared source. */
  state.moduleErrors = [];
  document.addEventListener("error", (event) => { if (event.target instanceof HTMLScriptElement && event.target.type === "module") state.moduleErrors.push(event.target.getAttribute("src")); }, true);
  state.io.holdTimers = false;
  state.io.heldTimers = [];
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...rest) => {
    if (!state.io.holdTimers || Number(delay) > 0 || typeof callback !== "function") return nativeSetTimeout(callback, delay, ...rest);
    state.io.heldTimers.push(() => callback(...rest));
    return 0;
  };
  HTMLAnchorElement.prototype.click = function click() {
    if (this.hasAttribute("download")) { state.downloads.push({ name: this.download, href: this.href, blob: blobs.get(this.href) || null }); return undefined; }
    return nativeClick.call(this);
  };
}

async function open(browser, url, conditionName, { sabotage = null } = {}) {
  const condition = CONDITIONS[conditionName];
  const page = await browser.newPage();
  const diagnostics = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const target = new URL(request.url());
    if (target.protocol === "blob:" || target.protocol === "data:") return request.continue(); /* the page's own exports */
    if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost") return request.abort();
    const mutation = sabotage?.[target.pathname];
    if (!mutation) return request.continue();
    if (mutation === "fail") return request.abort("failed");
    const source = fs.readFileSync(path.join(root, target.pathname.slice(1)), "utf8").replace(/\r\n/g, "\n");
    const body = mutation(source);
    assert.notEqual(body, source, `${target.pathname}: negative-control mutation matched nothing`);
    return request.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body });
  });
  /* The readback hint is raised by this gate reading canvas pixels, not by the page. */
  page.on("console", (message) => { if (["error", "warn"].includes(message.type()) && !message.text().startsWith("Failed to load resource:") && !message.text().startsWith("Canvas2D: Multiple readback operations")) diagnostics.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  await page.setViewport(condition.viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((theme) => localStorage.setItem("kaanbalci-site-theme", theme), condition.theme);
  await page.evaluateOnNewDocument(instrumentation);
  const response = await page.goto(url, { waitUntil: "load" });
  return { page, diagnostics, response };
}

/** Loaded, locale applied, engine started (hydrated first on a React document) and two idle frames. */
async function settle(page, routeId, { expectEngine = true } = {}) {
  await page.waitForFunction((ready, expect) => document.readyState === "complete" && document.documentElement.dataset.localeReady === "true"
    && (!document.querySelector("main[data-react-main]") || window.__m330p?.settled === true)
    && (!expect || document.querySelector(ready)), { timeout: 20000 }, PAGES[routeId].ready, expectEngine);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => {
    requestIdleCallback(() => window.__m330.nativeRaf(() => window.__m330.nativeRaf(resolve)), { timeout: 3000 });
  })));
}

const hydrationState = () => { const p = window.__m330p; return { settled: p.settled, signals: p.signals, errors: p.errors, before: p.before, sameMain: p.sameMain, sameHtml: p.sameHtml, sameNodes: p.sameNodes, sameAttrs: p.sameAttrs, hostReady: p.hostReady, mountedAtHydration: p.mountedAtHydration, releasedAtHydration: p.releasedAtHydration, mountedAfter: p.mountedAfter, hydrationMs: p.time.hydrated - p.time.start, mountMs: p.time.mounted - p.time.hydrated }; };
function hydrationViolations(value, engine) {
  return [
    [value.settled === true, "hydration did not settle"],
    [value.signals === 1, "hydration completion signal"],
    [Array.isArray(value.errors) && value.errors.length === 0, "recoverable hydration error"],
    [Array.isArray(value.before) && value.before.length === 0, "markup changed before hydration"],
    [value.sameMain === true, "main replaced"],
    [value.sameHtml === true, "innerHTML changed"],
    [value.sameNodes === true, "descendant identity changed"],
    [value.sameAttrs === true, "attributes changed"],
    [value.hostReady === true && value.releasedAtHydration === false && JSON.stringify(value.mountedAtHydration) === "[]", "engine started before hydration completed"],
    [JSON.stringify(value.mountedAfter) === JSON.stringify([engine]), "engine not mounted exactly once after hydration"],
  ].filter(([held]) => !held).map(([, contract]) => contract);
}

/* The rendered main as the visitor has it: attributes sorted, whitespace runs
 * collapsed, live form state included. The accepted inline handler and the
 * landmark names #30 adds to an otherwise unnamed <aside> are excluded. */
function domSnapshot() {
  const out = [];
  /* AI Flow node ids are random UUIDs; they are compared by order of appearance. */
  const ids = new Map();
  const stable = (value) => value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => { if (!ids.has(id)) ids.set(id, `node-${ids.size + 1}`); return ids.get(id); });
  const visit = (node) => {
    if (node.nodeType === 3) { const text = node.nodeValue.replace(/[ \t\n\r\f]+/g, " "); if (text !== " " && text !== "") out.push(`#${text}`); return; }
    if (node.nodeType !== 1) return;
    const attributes = [...node.attributes].filter((attribute) => attribute.name !== "onclick" && !(node.tagName === "ASIDE" && attribute.name === "aria-label" && node.matches(".adventure-side, .joyday-toolbox")))
      .map((attribute) => `${attribute.name}=${JSON.stringify(stable(attribute.value))}`).sort();
    const live = node.matches("input, select") ? ` value=${JSON.stringify(node.value)}${node.type === "checkbox" ? ` checked=${node.checked}` : ""}` : "";
    out.push(`<${node.tagName.toLowerCase()} ${attributes.join(" ")}${live}>`);
    node.childNodes.forEach(visit);
    out.push(`</${node.tagName.toLowerCase()}>`);
  };
  document.querySelector("main").childNodes.forEach(visit);
  return out.join("\n");
}

function layoutSnapshot() {
  return [...document.querySelectorAll("main *")].map((node) => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return { tag: node.tagName, box: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10), style: [style.display, style.visibility, style.opacity, style.color, style.backgroundColor, style.fontSize, style.fontWeight, style.textTransform].join("|") };
  });
}

/* Geometry cannot be sampled from content-visibility placeholders: the
 * original containment is compared first, then lifted for the measurement
 * (the strategy of the #26 differential gate). */
const CONTAINED = ".section-block,.cta-panel,.site-footer,.project-detail-grid,.math-lab-section";
async function measuredLayout(page) {
  await page.bringToFront(); /* a background tab gets no animation frames */
  const containment = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((node) => { const style = getComputedStyle(node); return [node.className, style.contentVisibility, style.containIntrinsicSize].join("|"); }), CONTAINED);
  await page.addStyleTag({ content: `${CONTAINED}{content-visibility:visible!important}` });
  await page.evaluate(() => new Promise((resolve) => window.__m330.nativeRaf(() => window.__m330.nativeRaf(resolve))));
  return { containment, layout: await page.evaluate(layoutSnapshot) };
}

function firstDifference(a, b) {
  const left = a.split("\n"), right = b.split("\n");
  const at = left.findIndex((line, index) => line !== right[index]);
  return `line ${at}: accepted ${JSON.stringify(left.slice(Math.max(0, at - 1), at + 2))} react ${JSON.stringify(right.slice(Math.max(0, at - 1), at + 2))}`;
}

function assertLayoutParity(accepted, react, label) {
  assert.equal(react.length, accepted.length, `${label}: element count`);
  for (let index = 0; index < accepted.length; index += 1) {
    assert.equal(react[index].tag, accepted[index].tag, `${label}: element ${index} tag`);
    assert.equal(react[index].style, accepted[index].style, `${label}: element ${index} <${accepted[index].tag.toLowerCase()}> computed style`);
    for (let side = 0; side < 4; side += 1) {
      assert.ok(Math.abs(react[index].box[side] - accepted[index].box[side]) <= 1, `${label}: element ${index} <${accepted[index].tag.toLowerCase()}> box ${JSON.stringify(react[index].box)} vs accepted ${JSON.stringify(accepted[index].box)}`);
    }
  }
}

/* ---- PNG ---- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** A structurally valid PNG: signature, IHDR first, every chunk CRC, IEND last. */
function validatePng(dataUrl, label) {
  assert.match(dataUrl, /^data:image\/png;base64,/, `${label}: PNG data URL`);
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${label}: PNG signature`);
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, `${label}: PNG chunk is truncated`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    assert.ok(offset + 12 + length <= bytes.length, `${label}: PNG chunk is truncated`);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length), `${label}: PNG ${type} checksum`);
    chunks.push({ type, at: offset + 8, length });
    offset += 12 + length;
  }
  assert.equal(chunks[0]?.type, "IHDR", `${label}: PNG header chunk`);
  assert.equal(chunks[chunks.length - 1]?.type, "IEND", `${label}: PNG end chunk`);
  assert.ok(chunks.some((chunk) => chunk.type === "IDAT"), `${label}: PNG image data`);
  return { width: bytes.readUInt32BE(chunks[0].at), height: bytes.readUInt32BE(chunks[0].at + 4), bytes: bytes.length };
}

/* ---- in-page measurement helpers ---- */
const helpers = () => {
  const frames = (count) => new Promise((resolve) => { let n = 0; const tick = () => { n += 1; if (n >= count) resolve(); else window.__m330.nativeRaf(tick); }; window.__m330.nativeRaf(tick); });
  window.__t = {
    frames,
    /** Engine animation frames per display frame: 1 for one live loop, 0 when idle. */
    async loops(count = 40) { await frames(2); const start = window.__m330.frames; await frames(count); return Math.round(((window.__m330.frames - start) / count) * 100) / 100; },
    /** Pixels of a canvas region that differ from the given background colour. */
    ink(selector, background, region = [0, 0, 1, 1], tolerance = 24) {
      const canvas = document.querySelector(selector), context = canvas.getContext("2d");
      const x = Math.floor(region[0] * canvas.width), y = Math.floor(region[1] * canvas.height);
      const w = Math.max(1, Math.floor((region[2] - region[0]) * canvas.width)), h = Math.max(1, Math.floor((region[3] - region[1]) * canvas.height));
      const data = context.getImageData(x, y, w, h).data;
      let pixels = 0, minX = w, maxX = -1, minY = h, maxY = -1, r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        const differs = background === null ? data[i + 3] > 8 : data[i + 3] > 8 && (Math.abs(data[i] - background[0]) > tolerance || Math.abs(data[i + 1] - background[1]) > tolerance || Math.abs(data[i + 2] - background[2]) > tolerance);
        if (!differs) continue;
        pixels += 1; r += data[i]; g += data[i + 1]; b += data[i + 2];
        const px = (i / 4) % w, py = Math.floor(i / 4 / w);
        if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
      return { pixels, box: pixels ? [(x + minX) / canvas.width, (y + minY) / canvas.height, (x + maxX) / canvas.width, (y + maxY) / canvas.height].map((value) => Math.round(value * 1000) / 1000) : null, color: pixels ? [r, g, b].map((value) => Math.round(value / pixels)) : null };
    },
    hash(selector) { const data = document.querySelector(selector).toDataURL(); let h = 0; for (let i = 0; i < data.length; i += 1) h = (Math.imul(h, 31) + data.charCodeAt(i)) | 0; return `${data.length}:${h}`; },
    rect(selector) { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; },
    text: (selector) => document.querySelector(selector)?.textContent.trim() ?? null,
    async decode(dataUrl, background) {
      const image = new Image(); image.src = dataUrl; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.id = "m330-decoded";
      canvas.getContext("2d").drawImage(image, 0, 0); document.body.append(canvas);
      const result = { width: image.naturalWidth, height: image.naturalHeight, ink: window.__t.ink("#m330-decoded", background).pixels };
      canvas.remove();
      return result;
    },
  };
};
/** Viewport coordinates of a point inside an element, which is first brought fully into view. */
const at = async (page, selector, fx, fy) => { const r = await page.evaluate((s) => { document.querySelector(s).scrollIntoView({ block: "center", behavior: "instant" }); return window.__t.rect(s); }, selector); return [r.x + r.width * fx, r.y + r.height * fy]; };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function drag(page, selector, from, to, steps = 12) {
  const [x0, y0] = await at(page, selector, ...from), [x1, y1] = await at(page, selector, ...to);
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await page.mouse.up();
}
async function touchDrag(page, selector, from, to, steps = 8) {
  const [x0, y0] = await at(page, selector, ...from), [x1, y1] = await at(page, selector, ...to);
  await page.touchscreen.touchStart(x0, y0);
  for (let step = 1; step <= steps; step += 1) await page.touchscreen.touchMove(x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps);
  await page.touchscreen.touchEnd();
}

/* ---- behaviour: each returns a summary that must be identical on the
 * accepted and the React document ---- */
const ADVENTURE = "#career-merge-canvas";
const boardInk = (page, region) => page.evaluate((s, r) => window.__t.ink(s, [12, 25, 43], r, 70).pixels, ADVENTURE, region);
const LEFT_HALF = [0.1, 0.3, 0.5, 0.86], RIGHT_HALF = [0.5, 0.3, 0.9, 0.86], BOARD = [0.1, 0.3, 0.9, 0.86];

async function adventureBehaviour(page, label) {
  const summary = {};
  await page.evaluate(() => document.querySelector("#career-merge-game").scrollIntoView({ block: "start" }));
  summary.loops = await page.evaluate(() => window.__t.loops());
  assert.equal(summary.loops, 1, `${label}: exactly one animation loop`);
  assert.equal(await boardInk(page, BOARD), 0, `${label}: empty board`);
  assert.equal(await page.evaluate(() => window.__t.text("[data-adventure-score]")), "0", `${label}: initial score`);
  summary.ladder = await page.$$eval("[data-merge-ladder] article", (nodes) => nodes.length);
  /* keyboard: A moves the dropper left, Space drops */
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("a");
  await page.keyboard.press("Space");
  await wait(1700);
  const afterKeyboard = [await boardInk(page, LEFT_HALF), await boardInk(page, RIGHT_HALF)];
  assert.ok(afterKeyboard[0] > 300 && afterKeyboard[1] === 0, `${label}: A + Space drops on the left (${afterKeyboard})`);
  /* pointer: move aims, the Drop button drops */
  await page.mouse.move(...await at(page, ADVENTURE, 0.75, 0.5));
  await page.click("[data-adventure-drop]");
  await wait(1700);
  const afterButton = await boardInk(page, RIGHT_HALF);
  assert.ok(afterButton > 300, `${label}: pointer aim + Drop button drops on the right (${afterButton})`);
  /* merge on contact: the same object dropped onto the settled one, by Enter */
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => window.__t.text("[data-adventure-score]")), "0", `${label}: no merge at spawn`);
  await page.waitForFunction(() => document.querySelector("[data-adventure-score]").textContent !== "0", { timeout: 6000 });
  await wait(600);
  summary.score = await page.evaluate(() => window.__t.text("[data-adventure-score]"));
  summary.best = await page.evaluate(() => window.__t.text("[data-adventure-best]"));
  summary.stored = await page.evaluate(() => localStorage.getItem("kaan-career-merge-best"));
  summary.unlocked = await page.$$eval("[data-merge-ladder] article.is-unlocked", (nodes) => nodes.length);
  assert.ok(Number(summary.score) > 0 && summary.best === summary.score && summary.stored === summary.score, `${label}: merge on contact scores and persists the best (${JSON.stringify(summary)})`);
  assert.ok(summary.unlocked > 1, `${label}: merge unlocks the next ladder step`);
  /* canvas click drops too */
  await wait(400);
  const beforeClick = await boardInk(page, LEFT_HALF);
  await page.mouse.click(...await at(page, ADVENTURE, 0.3, 0.5));
  await wait(1700);
  assert.ok(await boardInk(page, LEFT_HALF) > beforeClick, `${label}: canvas click drops`);
  /* restart */
  await page.click(".adventure-controls [data-adventure-restart]");
  await page.evaluate(() => window.__t.frames(3));
  assert.equal(await boardInk(page, BOARD), 0, `${label}: restart clears the board`);
  assert.equal(await page.evaluate(() => window.__t.text("[data-adventure-score]")), "0", `${label}: restart resets the score`);
  assert.equal(await page.evaluate(() => window.__t.text("[data-adventure-best]")), summary.best, `${label}: restart keeps the best`);
  summary.win = await page.$eval("[data-adventure-win]", (node) => ({ hidden: node.hidden, restart: Boolean(node.querySelector("[data-adventure-restart]")) }));
  assert.deepEqual(summary.win, { hidden: true, restart: true }, `${label}: end-of-game panel stays hidden with its replay control`);
  return summary;
}

async function adventureTouch(page, label) {
  await page.evaluate(() => document.querySelector("#career-merge-game").scrollIntoView({ block: "start" }));
  await page.evaluate(() => document.querySelector("#career-merge-canvas").scrollIntoView({ block: "center" }));
  const rect = await page.evaluate(() => window.__t.rect("#career-merge-canvas"));
  assert.ok(rect.width > 300 && rect.width <= 390 && rect.height >= 430, `${label}: mobile canvas size ${JSON.stringify(rect)}`);
  await page.touchscreen.tap(...await at(page, ADVENTURE, 0.7, 0.5));
  await wait(1700);
  const ink = await boardInk(page, RIGHT_HALF);
  assert.ok(ink > 100, `${label}: touch tap drops (${ink})`);
  return { width: rect.width, height: rect.height };
}

const JOYDAY = "#joyday-art-canvas";
const PAPER = [255, 250, 241];
const paint = (page, region) => page.evaluate((s, bg, r) => window.__t.ink(s, bg, r), JOYDAY, PAPER, region);

async function joydayBehaviour(page, label) {
  const summary = {};
  await page.evaluate(() => document.querySelector("#joyday-art-canvas").scrollIntoView({ block: "center" }));
  assert.equal(await page.evaluate(() => window.__t.loops(20)), 0, `${label}: no animation loop while idle`);
  assert.equal((await paint(page)).pixels, 0, `${label}: blank canvas`);
  summary.colors = await page.$$eval("[data-joyday-colors] button", (nodes) => nodes.length);
  /* brush: a horizontal drag paints where the pointer was */
  await page.click('[data-joyday-tool="brush"]');
  summary.tool = await page.evaluate(() => window.__t.text("[data-joyday-current-tool]"));
  await drag(page, JOYDAY, [0.25, 0.5], [0.75, 0.5]);
  const brush = await paint(page);
  assert.ok(brush.pixels > 500, `${label}: brush paints (${JSON.stringify(brush)})`);
  assert.ok(brush.box[0] > 0.17 && brush.box[0] < 0.3 && brush.box[2] > 0.7 && brush.box[2] < 0.83 && brush.box[1] > 0.4 && brush.box[3] < 0.6, `${label}: stroke follows the pointer (${brush.box})`);
  summary.brush = brush.pixels;
  /* colour: another palette colour paints in that colour */
  const color = await page.$eval("[data-joyday-colors] button:nth-child(4)", (node) => node.dataset.joydayColor);
  await page.click("[data-joyday-colors] button:nth-child(4)");
  await drag(page, JOYDAY, [0.25, 0.25], [0.75, 0.25]);
  const second = await paint(page, [0, 0.15, 1, 0.35]);
  const target = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(second.pixels > 500 && distance(second.color, target) < distance(brush.color, target), `${label}: selected colour ${color} is used (${second.color} vs first ${brush.color})`);
  /* thickness: the control changes the stroke */
  await page.$eval("[data-joyday-thickness]", (node) => { node.value = "100"; node.dispatchEvent(new Event("input", { bubbles: true })); });
  summary.thickness = await page.evaluate(() => window.__t.text("[data-joyday-thickness-value]"));
  assert.match(summary.thickness, /100$/, `${label}: thickness readout`);
  await drag(page, JOYDAY, [0.25, 0.75], [0.75, 0.75]);
  const thick = await paint(page, [0, 0.62, 1, 0.88]);
  assert.ok(thick.box[3] - thick.box[1] > (brush.box[3] - brush.box[1]) * 1.3, `${label}: thicker stroke (${thick.box} vs ${brush.box})`);
  await page.$eval("[data-joyday-intensity]", (node) => { node.value = "100"; node.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.match(await page.evaluate(() => window.__t.text("[data-joyday-intensity-value]")), /100$/, `${label}: intensity readout`);
  /* undo / redo are exact */
  const full = (await paint(page)).pixels;
  await page.click("[data-joyday-undo]");
  const undone = (await paint(page)).pixels;
  assert.ok(undone < full && (await paint(page, [0, 0.62, 1, 0.88])).pixels === 0, `${label}: undo removes the last stroke`);
  await page.click("[data-joyday-redo]");
  assert.equal((await paint(page)).pixels, full, `${label}: redo restores it exactly`);
  summary.strokes = [undone, full];
  /* the other tools */
  for (const [tool, gesture] of [
    ["spray", () => drag(page, JOYDAY, [0.15, 0.9], [0.4, 0.9])],
    ["bottle", () => drag(page, JOYDAY, [0.6, 0.08], [0.9, 0.12])],
    ["balloon", async () => page.mouse.click(...await at(page, JOYDAY, 0.88, 0.5))],
  ]) {
    const before = (await paint(page)).pixels;
    await page.click(`[data-joyday-tool="${tool}"]`);
    await gesture();
    const after = (await paint(page)).pixels;
    assert.ok(after > before, `${label}: ${tool} paints (${before} → ${after})`);
    summary[tool] = after - before;
  }
  summary.mission = await page.evaluate(() => window.__t.text("[data-joyday-mission-status]"));
  /* finish → preview → PNG */
  await page.click("[data-joyday-finish]");
  summary.modal = await page.$eval("[data-joyday-modal]", (node) => ({ hidden: node.hidden, aria: node.getAttribute("aria-hidden"), inert: node.inert }));
  assert.deepEqual(summary.modal, { hidden: false, aria: "false", inert: false }, `${label}: finish opens the preview`);
  const preview = await page.$eval("[data-joyday-preview-img]", (node) => node.src);
  validatePng(preview, `${label}: preview`);
  await page.click("[data-joyday-download]");
  const download = await page.evaluate(() => window.__m330.downloads.pop());
  assert.match(download.name, /^joyday-action-painting-joyday-energy-square-\d{4}-\d{2}-\d{2}\.png$/, `${label}: export file name`);
  const png = validatePng(download.href, `${label}: export`);
  const live = await page.$eval(JOYDAY, (node) => [node.width, node.height]);
  assert.deepEqual([png.width, png.height], live, `${label}: clean export has the canvas size`);
  const decoded = await page.evaluate((href, bg) => window.__t.decode(href, bg), download.href, PAPER);
  assert.ok(decoded.ink >= (await paint(page)).pixels, `${label}: exported PNG carries the artwork (${decoded.ink})`);
  summary.png = { width: png.width, height: png.height, ink: decoded.ink };
  await page.click('[data-joyday-export-mode="branded"]');
  await page.click("[data-joyday-download]");
  const branded = await page.evaluate(() => window.__m330.downloads.pop());
  const card = validatePng(branded.href, `${label}: branded export`);
  assert.ok(card.width > png.width || card.height > png.height, `${label}: branded export is the larger card`);
  summary.card = [card.width, card.height];
  await page.keyboard.press("Escape");
  assert.equal(await page.$eval("[data-joyday-modal]", (node) => node.hidden), true, `${label}: Escape closes the preview`);
  /* clear, then the other canvas shapes */
  await page.click("[data-joyday-clear]");
  assert.equal((await paint(page)).pixels, 0, `${label}: clear empties the canvas`);
  summary.shapes = {};
  for (const [shape, size] of [["circle", [900, 900]], ["rect", [720, 1080]], ["square", [900, 900]]]) {
    await page.click(`[data-joyday-canvas="${shape}"]`);
    const state = await page.evaluate((selector, name) => { const canvas = document.querySelector(selector); return { size: [canvas.width, canvas.height], frame: document.querySelector("[data-joyday-frame]").classList.contains(`is-${name}`), label: window.__t.text("[data-joyday-current-canvas]"), corner: canvas.getContext("2d").getImageData(2, 2, 1, 1).data[3] }; }, JOYDAY, shape);
    assert.deepEqual([state.size, state.frame], [size, true], `${label}: ${shape} canvas`);
    assert.equal(state.corner === 0, shape === "circle", `${label}: only the circle clips its corners`);
    await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), JOYDAY);
    await page.click('[data-joyday-tool="brush"]');
    await drag(page, JOYDAY, [0.4, 0.5], [0.6, 0.5]);
    const ink = await paint(page);
    assert.ok(ink.pixels > 200 && ink.box[1] > 0.38 && ink.box[3] < 0.62, `${label}: painting on the ${shape} canvas follows the pointer (${ink.box})`);
    summary.shapes[shape] = state.label;
  }
  return summary;
}

async function joydayTouch(page, label) {
  await page.evaluate(() => document.querySelector("#joyday-art-canvas").scrollIntoView({ block: "center" }));
  await page.touchscreen.tap(...await at(page, '[data-joyday-tool="brush"]', 0.5, 0.5));
  assert.equal(await page.$eval('[data-joyday-tool="brush"]', (node) => node.classList.contains("is-active")), true, `${label}: touch selects a tool`);
  await page.evaluate(() => document.querySelector("#joyday-art-canvas").scrollIntoView({ block: "center" }));
  await touchDrag(page, JOYDAY, [0.3, 0.5], [0.7, 0.5]);
  const ink = await paint(page);
  assert.ok(ink.pixels > 300 && ink.box[0] > 0.2 && ink.box[2] < 0.8 && ink.box[1] > 0.38 && ink.box[3] < 0.62, `${label}: touch stroke follows the finger (${JSON.stringify(ink)})`);
  const targets = await page.$$eval("[data-joyday-tool], [data-joyday-canvas], .joyday-game-actions button", (nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }));
  assert.ok(Math.min(...targets) >= 40, `${label}: touch targets are at least 40px (${Math.min(...targets)})`);
  return { minTarget: Math.min(...targets), controls: targets.length };
}

const aiCounts = (page) => page.evaluate(() => ({ nodes: Number(window.__t.text("[data-ai-node-count]")), links: Number(window.__t.text("[data-ai-link-count]")), rendered: document.querySelectorAll("[data-ai-board] .ai-flow-node").length, paths: document.querySelectorAll("[data-ai-lines] .ai-flow-link").length }));
const aiTone = (page) => page.$eval("[data-ai-result]", (node) => node.dataset.tone);

/* V4-E06.2: the puzzle is an entered game. The board is reached through the
 * hub (a mission card, then Start mission), and a verdict opens a result
 * layer that is dismissed before the board is used again. */
async function aiEnter(page) {
  await page.click('[data-afp-open="0"]');
  await page.click("[data-afp-start]");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-afp-state") === "building", { timeout: 8000 });
  await page.evaluate(() => window.__t.frames(3));
}
async function aiDismiss(page) {
  await page.waitForFunction(() => ["success", "failure"].includes(document.documentElement.getAttribute("data-afp-state")), { timeout: 20000 });
  await page.click("[data-afp-result] [data-afp-resume]");
}
const AI_PROGRESS_KEY = "kaan-ai-flow-puzzle-progress-v3";

async function aiFlowBehaviour(page, label) {
  const summary = {};
  await aiEnter(page);
  assert.equal(await page.evaluate(() => window.__t.loops(20)), 0, `${label}: no animation loop while idle`);
  summary.catalog = await page.evaluate(() => ({ scenarios: document.querySelectorAll("[data-ai-scenario]").length, templates: document.querySelectorAll("[data-ai-template]").length, palette: document.querySelectorAll("[data-ai-add-node]").length, messages: document.querySelectorAll("[data-ai-test-message] option").length, objectives: document.querySelector("[data-ai-objectives]").children.length }));
  assert.ok(Object.values(summary.catalog).every((value) => value > 0), `${label}: scenario, template, palette, message and objective lists render (${JSON.stringify(summary.catalog)})`);
  const start = await aiCounts(page);
  assert.equal(start.nodes, start.rendered, `${label}: board renders every node`);
  /* add nodes */
  await page.click('[data-ai-add-node="intent"]');
  await page.click('[data-ai-add-node="fallback"]');
  const added = await aiCounts(page);
  assert.deepEqual([added.nodes, added.rendered], [start.nodes + 2, start.nodes + 2], `${label}: palette adds nodes`);
  /* connect: the source's output port, then the target (E06.2: a node's body
   * only selects it; it no longer arms a connection) */
  const node = (type) => `[data-ai-board] .ai-flow-node[data-type="${type}"]`;
  const out = (type) => `${node(type)} [data-ai-port="out"]`;
  await page.click(node("intent"));
  assert.equal(await page.$eval(node("intent"), (element) => element.classList.contains("is-source")), false, `${label}: selecting a node does not arm a connection`);
  await page.click(out("intent"));
  assert.equal(await page.$eval(node("intent"), (element) => element.classList.contains("is-source")), true, `${label}: the output port arms the source`);
  await page.click(node("fallback"));
  await page.evaluate(() => window.__t.frames(3));
  const linked = await aiCounts(page);
  assert.deepEqual([linked.links, linked.paths > 0], [start.links + 1, true], `${label}: the target completes the connection`);
  /* the same connection again is refused */
  await page.click(out("intent"));
  await page.click(node("fallback"));
  assert.equal((await aiCounts(page)).links, start.links + 1, `${label}: duplicate connection is refused`);
  assert.equal(await page.$eval("[data-ai-flow-status]", (element) => element.dataset.tone), "warning", `${label}: duplicate connection warns`);
  /* drag moves a node */
  const before = await page.$eval(node("fallback"), (element) => element.style.left);
  await page.keyboard.press("Escape");
  await drag(page, node("fallback"), [0.5, 0.5], [2.2, 0.5], 6);
  assert.notEqual(await page.$eval(node("fallback"), (element) => element.style.left), before, `${label}: dragging moves the node`);
  /* remove the link, then the node, from the inspector */
  await page.click(node("intent"));
  await page.click("[data-ai-inspector] [data-ai-remove-link-from]");
  assert.equal((await aiCounts(page)).links, start.links, `${label}: inspector removes the connection`);
  await page.click(node("fallback"));
  await page.click("[data-ai-inspector] [data-ai-remove-node]");
  assert.equal((await aiCounts(page)).nodes, start.nodes + 1, `${label}: inspector removes the node`);
  /* Delete removes the selected node when the page itself has focus */
  await page.keyboard.press("Escape");
  await page.click(node("intent"));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Delete");
  assert.equal((await aiCounts(page)).nodes, start.nodes, `${label}: Delete removes the selected node`);
  /* validation rules */
  await page.click("[data-ai-validate]");
  summary.blank = await aiTone(page);
  assert.notEqual(summary.blank, "success", `${label}: an incomplete flow does not validate`);
  await aiDismiss(page);
  await page.click('[data-ai-template="happy"]');
  await page.click("[data-ai-validate]");
  summary.happy = await aiTone(page);
  assert.notEqual(summary.happy, "success", `${label}: the happy path without the safety branch fails`);
  await aiDismiss(page);
  await page.click('[data-ai-template="solution"]');
  const solution = await aiCounts(page);
  summary.board = { start: { nodes: start.nodes, links: start.links }, solution: { nodes: solution.nodes, links: solution.links } };
  await page.click(node("fallback"));
  await page.click("[data-ai-inspector] [data-ai-remove-node]");
  await page.click("[data-ai-validate]");
  assert.notEqual(await aiTone(page), "success", `${label}: a flow without its fallback fails`);
  await aiDismiss(page);
  await page.click('[data-ai-template="solution"]');
  const scoreBefore = Number(await page.evaluate(() => window.__t.text("[data-ai-score]")));
  await page.click("[data-ai-validate]");
  summary.solution = await aiTone(page);
  summary.score = Number(await page.evaluate(() => window.__t.text("[data-ai-score]")));
  assert.equal(summary.solution, "success", `${label}: the full solution validates`);
  /* E06.2: progress is kept per level (its best quality and the award it
   * earned) and the score is their sum. The old running total (-score-v2),
   * which grew on every validation of a finished level, is no longer written. */
  const stored = await page.evaluate((key) => ({ progress: JSON.parse(localStorage.getItem(key) || "null"), legacy: localStorage.getItem("kaan-ai-flow-puzzle-score-v2") }), AI_PROGRESS_KEY);
  assert.ok(summary.score > scoreBefore && stored.progress?.levels?.joyday?.award === summary.score - scoreBefore && stored.legacy === null, `${label}: a valid flow scores once and persists as level progress (${JSON.stringify(stored)})`);
  await aiDismiss(page);
  /* validating the finished level again cannot add to the score */
  await page.click("[data-ai-validate]");
  assert.equal(Number(await page.evaluate(() => window.__t.text("[data-ai-score]"))), summary.score, `${label}: validating a finished level again leaves the score unchanged`);
  await aiDismiss(page);
  summary.quality = await page.evaluate(() => window.__t.text("[data-ai-score-breakdown] strong"));
  /* run */
  await page.click("[data-ai-run]");
  await page.waitForFunction((expected) => document.querySelectorAll("[data-ai-run-log] article").length > expected, { timeout: 20000 }, solution.nodes);
  summary.run = await page.$$eval("[data-ai-run-log] article", (nodes) => nodes.length);
  await aiDismiss(page);
  assert.equal(Number(await page.evaluate(() => window.__t.text("[data-ai-score]"))), summary.score, `${label}: running a finished level again leaves the score unchanged`);
  /* exports live on the panel's Tools tab */
  await page.click('[data-afp-tab="tools"]');
  await page.click("[data-ai-png]");
  const png = await page.evaluate(() => window.__m330.downloads.pop());
  const image = validatePng(png.href, `${label}: flow PNG`);
  summary.png = [png.name, image.width, image.height];
  await page.click("[data-ai-export]");
  const exported = await page.evaluate(async () => { const item = window.__m330.downloads.pop(); return { name: item.name, body: await item.blob.text() }; });
  const flow = JSON.parse(exported.body);
  summary.export = [exported.name, (flow.nodes || []).length, (flow.connections || []).length, flow.connections?.at(-1)?.label ?? null];
  assert.deepEqual(summary.export.slice(1, 3), [solution.nodes, solution.links], `${label}: exported JSON holds the flow`);
  assert.ok(typeof summary.export[3] === "string" && summary.export[3].length > 0, `${label}: connections carry their edge label`);
  /* reset and next scenario */
  await page.click("[data-ai-reset]");
  assert.deepEqual([(await aiCounts(page)).nodes, (await aiCounts(page)).links], [start.nodes, start.links], `${label}: reset restores the starter board`);
  const title = await page.evaluate(() => window.__t.text("[data-ai-scenario-title]"));
  await page.click("[data-ai-next]");
  summary.next = await page.evaluate(() => window.__t.text("[data-ai-scenario-title]"));
  assert.notEqual(summary.next, title, `${label}: next scenario`);
  return summary;
}

async function aiFlowTouch(page, label) {
  /* On a phone the library is a sheet opened from the dock. */
  await page.touchscreen.tap(...await at(page, '[data-afp-open="0"]', 0.5, 0.5));
  await page.touchscreen.tap(...await at(page, "[data-afp-start]", 0.5, 0.5));
  await page.waitForFunction(() => document.documentElement.getAttribute("data-afp-state") === "building", { timeout: 8000 });
  await page.touchscreen.tap(...await at(page, '[data-afp-sheet="library"]', 0.5, 0.5));
  await page.evaluate(() => window.__t.frames(3));
  const before = (await aiCounts(page)).nodes;
  await page.touchscreen.tap(...await at(page, '[data-ai-add-node="llm"]', 0.5, 0.5));
  assert.equal((await aiCounts(page)).nodes, before + 1, `${label}: touch adds a node`);
  const board = await page.evaluate(() => window.__t.rect("[data-ai-board]"));
  assert.ok(board.width > 250 && board.height > 250, `${label}: mobile board size ${JSON.stringify(board)}`);
  return { nodes: before + 1 };
}

const LAB = "#math-3d-canvas";
async function labsBehaviour(page, label) {
  const summary = {};
  summary.cards = await page.$$eval("[data-labs-grid] .lab-card", (nodes) => nodes.map((node) => [node.querySelector("h3").textContent, node.querySelector("a").getAttribute("href")]));
  assert.deepEqual(summary.cards, labsData.map((item) => [item.title, item.url]), `${label}: four lab cards and links`);
  await page.click('[data-labs-grid] a[href="/labs/#algorithmic-3d-lab"]');
  await page.waitForFunction(() => location.hash === "#algorithmic-3d-lab" && (() => { const r = document.querySelector("#algorithmic-3d-lab").getBoundingClientRect(); return window.scrollY > 0 && r.top > -60 && r.top < window.innerHeight / 2; })(), { timeout: 5000 });
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), LAB);
  await page.waitForFunction((selector) => window.__t.ink(selector, null).pixels > 5000, { timeout: 8000 }, LAB);
  summary.loops = await page.evaluate(() => window.__t.loops());
  assert.equal(summary.loops, 1, `${label}: exactly one animation loop while the mesh is visible`);
  const hash = () => page.evaluate((selector) => window.__t.hash(selector), LAB);
  const idle = await hash();
  await page.evaluate(() => window.__t.frames(8));
  assert.equal(await hash(), idle, `${label}: reduced motion holds the mesh still`);
  await drag(page, LAB, [0.4, 0.5], [0.6, 0.35]);
  const rotated = await hash();
  assert.notEqual(rotated, idle, `${label}: pointer drag rotates the mesh`);
  await page.mouse.move(...await at(page, LAB, 0.5, 0.5));
  await page.mouse.wheel({ deltaY: -240 });
  await page.evaluate(() => window.__t.frames(3));
  const zoomed = await hash();
  assert.notEqual(zoomed, rotated, `${label}: wheel zooms the mesh`);
  summary.size = await page.$eval(LAB, (node) => [node.width, node.height, Math.round(node.getBoundingClientRect().width)]);
  await page.setViewport({ width: 1000, height: 800 });
  await page.evaluate((selector) => { document.querySelector(selector).scrollIntoView({ block: "center" }); return window.__t.frames(6); }, LAB);
  const resized = await page.$eval(LAB, (node) => [node.width, node.height, Math.round(node.getBoundingClientRect().width)]);
  assert.ok(resized[0] > 0 && Math.abs(resized[0] - resized[2]) / resized[2] < 0.05 && resized[0] !== summary.size[0], `${label}: the canvas follows a resize (${summary.size} → ${resized})`);
  assert.ok(await page.evaluate((selector) => window.__t.ink(selector, null).pixels, LAB) > 3000, `${label}: the mesh is drawn after a resize`);
  summary.resized = resized;
  await page.click("[data-theme-toggle]");
  summary.theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.evaluate(() => window.__t.frames(4));
  assert.ok(await page.evaluate((selector) => window.__t.ink(selector, null).pixels, LAB) > 3000, `${label}: the mesh is drawn in the other theme`);
  return summary;
}

async function labsTouch(page, label) {
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), LAB);
  await page.waitForFunction((selector) => window.__t.ink(selector, null).pixels > 2000, { timeout: 8000 }, LAB);
  const before = await page.evaluate((selector) => window.__t.hash(selector), LAB);
  await touchDrag(page, LAB, [0.35, 0.5], [0.65, 0.4]);
  assert.notEqual(await page.evaluate((selector) => window.__t.hash(selector), LAB), before, `${label}: touch drag rotates the mesh`);
  const rect = await page.evaluate((selector) => window.__t.rect(selector), LAB);
  assert.ok(rect.width > 250 && rect.width <= 390 && rect.height > 150, `${label}: mobile canvas size ${JSON.stringify(rect)}`);
  return { width: rect.width, height: rect.height };
}

/* Outcome comparison is typed by what a value is, never by its being a number.
 *
 *   exact      the default: scores, best scores, node/edge/run counts, states,
 *              labels, export names and dimensions, validation results.
 *   pixels     painted-pixel counts of a stroke. Anti-aliased edges depend on
 *              the pointer's sub-pixel position, which shifts with the scroll
 *              offset of a run; they must agree within 1.5%.
 *   geometry   a measured CSS box; within 1px.
 *   positive   a value physics decides (how many drops a win took, the score
 *              it reached). It is not comparable between two runs, so each
 *              side is only required to be a positive number.
 *
 * A path gets a non-exact rule only by being listed here. */
const OUTCOME_RULES = Object.freeze([
  [/^joydayPaint\.summary\.(brush|spray|bottle|balloon)$/, "pixels"],
  [/^joydayPaint\.summary\.strokes\.\d+$/, "pixels"],
  [/^joydayPaint\.summary\.png\.ink$/, "pixels"],
  [/^(labs|adventure)\.touched\.(width|height)$/, "geometry"],
  [/^labs\.summary\.(size|resized)\.\d+$/, "geometry"],
  [/^adventure\.extra\.(drops|score)$/, "positive"],
]);
const outcomeRule = (where) => OUTCOME_RULES.find(([pattern]) => pattern.test(where))?.[1] || "exact";
function outcomeDifferences(react, accepted, where) {
  if (accepted && typeof accepted === "object" && react && typeof react === "object") {
    const keys = [...new Set([...Object.keys(accepted), ...Object.keys(react)])];
    return keys.flatMap((key) => outcomeDifferences(react[key], accepted[key], `${where}.${key}`));
  }
  const rule = outcomeRule(where);
  const numeric = typeof react === "number" && typeof accepted === "number";
  const held = rule === "pixels" ? numeric && Math.abs(react - accepted) <= Math.abs(accepted) * 0.015
    : rule === "geometry" ? numeric && Math.abs(react - accepted) <= 1
      : rule === "positive" ? numeric && react > 0 && accepted > 0
        : Object.is(react, accepted);
  return held ? [] : [`${where} (${rule}): ${JSON.stringify(react)} vs accepted ${JSON.stringify(accepted)}`];
}
const mutatedOutcome = (value, pathKeys, change) => {
  const copy = structuredClone(value);
  let target = copy;
  for (const key of pathKeys.slice(0, -1)) target = target[key];
  const last = pathKeys[pathKeys.length - 1];
  assert.ok(Object.hasOwn(target, last), `outcome control path ${pathKeys.join(".")} does not exist`);
  const next = change(target[last]);
  assert.notDeepEqual(next, target[last], `outcome control ${pathKeys.join(".")} changed nothing`);
  target[last] = next;
  return copy;
};

/* Adventure, to its end: every drop goes down one column with the random
 * source pinned high, so each new object matches the largest one and the chain
 * climbs the ladder to Job Offer. How many drops that takes, and the score it
 * ends on, are decided by the physics of the run. */
const SPAWN_BAND = [0.08, 0.1, 0.92, 0.2];
async function adventureWin(page, label) {
  await page.evaluate(() => { Math.random = () => 0.99; document.querySelector("#career-merge-game").scrollIntoView({ block: "start" }); document.activeElement?.blur(); });
  const won = () => page.$eval("[data-adventure-win]", (node) => !node.hidden);
  const score = () => page.evaluate(() => Number(window.__t.text("[data-adventure-score]")));
  await page.mouse.move(...await at(page, ADVENTURE, 0.6, 0.5));
  await page.evaluate(() => document.activeElement?.blur());
  let drops = 0;
  while (!(await won()) && drops < 90) {
    await page.keyboard.press("Enter");
    drops += 1;
    await wait(850);
  }
  assert.equal(await won(), true, `${label}: the merge chain reaches Job Offer (${drops} drops, score ${await score()})`);
  const finalScore = await score();
  const ladder = await page.$$eval("[data-merge-ladder] article", (nodes) => [nodes.length, nodes.filter((node) => node.classList.contains("is-unlocked")).length]);
  assert.equal(ladder[1], ladder[0], `${label}: winning unlocks the whole ladder`);
  assert.equal(await page.evaluate(() => window.__t.text("[data-adventure-best]")), String(finalScore), `${label}: the winning score is the best`);
  /* the finished game takes no more drops */
  await wait(600);
  const bandBeforeKey = await boardInk(page, SPAWN_BAND);
  await page.keyboard.press("Enter");
  await page.evaluate(() => window.__t.frames(4));
  const spawned = Math.abs(await boardInk(page, SPAWN_BAND) - bandBeforeKey) > 400;
  await wait(500);
  assert.deepEqual([spawned, await score()], [false, finalScore], `${label}: no drop and no score change after the win`);
  /* the panel's own actions */
  await page.evaluate(() => { window.__resume = 0; window.openDrivePreviews = () => { window.__resume += 1; }; });
  await page.click('[data-adventure-win] [data-adventure-text="viewResume"]');
  const resume = await page.evaluate(() => window.__resume);
  assert.equal(resume, 1, `${label}: View resume opens the resume once`);
  await page.click("[data-adventure-win] [data-adventure-restart]");
  await page.evaluate(() => window.__t.frames(3));
  const reset = { hidden: await page.$eval("[data-adventure-win]", (node) => node.hidden), score: await page.evaluate(() => window.__t.text("[data-adventure-score]")), board: await boardInk(page, BOARD), unlocked: await page.$$eval("[data-merge-ladder] article.is-unlocked", (nodes) => nodes.length) };
  assert.deepEqual(reset, { hidden: true, score: "0", board: 0, unlocked: 1 }, `${label}: Play again starts a fresh game`);
  assert.deepEqual([await page.evaluate(() => window.__t.text("[data-adventure-best]")), await page.evaluate(() => localStorage.getItem("kaan-career-merge-best"))], [String(finalScore), String(finalScore)], `${label}: the best score survives the new game`);
  /* and input works again */
  await page.evaluate(() => document.activeElement?.blur());
  const bandBeforeDrop = await boardInk(page, SPAWN_BAND);
  await page.keyboard.press("Enter");
  await page.evaluate(() => window.__t.frames(4));
  assert.ok(await boardInk(page, SPAWN_BAND) - bandBeforeDrop > 400, `${label}: drops work again after Play again`);
  return { won: true, ladder: ladder[0], unlocked: ladder[1], drops, score: finalScore, resume, reset };
}

/* Joyday sound: off by default and silent, created only by the visitor's own
 * click, one sound per paint action while on, silent again when off. */
const audioState = (page) => page.evaluate(() => ({ contexts: window.__m330.audio.contexts.length, gains: window.__m330.audio.gains, closed: window.__m330.audio.closed, states: window.__m330.audio.contexts.map((context) => context.state) }));
const soundToggle = (page) => page.$eval("[data-joyday-sound-toggle]", (node) => ({ pressed: node.getAttribute("aria-pressed"), label: node.querySelector("[data-joyday-sound-label]").textContent, icon: node.querySelector("i").className }));
async function joydaySound(page, label) {
  const summary = {};
  await page.click('[data-joyday-tool="brush"]');
  summary.off = await soundToggle(page);
  assert.deepEqual([summary.off.pressed, summary.off.icon], ["false", "bx bx-volume-mute"], `${label}: sound is off by default`);
  await drag(page, JOYDAY, [0.3, 0.3], [0.6, 0.3]);
  assert.deepEqual(await audioState(page), { contexts: 0, gains: 0, closed: 0, states: [] }, `${label}: painting with sound off creates no audio`);
  await page.click("[data-joyday-sound-toggle]");
  summary.on = await soundToggle(page);
  assert.deepEqual([summary.on.pressed, summary.on.icon], ["true", "bx bx-volume-full"], `${label}: the toggle turns sound on`);
  assert.notEqual(summary.on.label, summary.off.label, `${label}: the toggle label follows the state`);
  const created = await audioState(page);
  assert.deepEqual([created.contexts, created.closed, created.gains], [1, 0, 0], `${label}: the click creates one audio context and no sound yet`);
  /* Whether the context is already running is the browser's autoplay policy;
   * it was created inside a user gesture, so it must not be closed. */
  assert.notEqual(created.states[0], "closed", `${label}: the audio context is usable`);
  summary.contextState = created.states[0];
  await drag(page, JOYDAY, [0.3, 0.5], [0.6, 0.5]);
  await page.mouse.click(...await at(page, '[data-joyday-tool="balloon"]', 0.5, 0.5));
  await page.mouse.click(...await at(page, JOYDAY, 0.5, 0.7));
  summary.gainsWhileOn = (await audioState(page)).gains;
  assert.equal(summary.gainsWhileOn, 2, `${label}: one sound per paint action while on`);
  await page.click("[data-joyday-sound-toggle]");
  assert.equal((await soundToggle(page)).pressed, "false", `${label}: the toggle turns sound off`);
  await page.mouse.click(...await at(page, JOYDAY, 0.4, 0.8));
  assert.equal((await audioState(page)).gains, summary.gainsWhileOn, `${label}: no sound while off`);
  await page.click("[data-joyday-sound-toggle]");
  await page.mouse.click(...await at(page, JOYDAY, 0.6, 0.8));
  const again = await audioState(page);
  assert.deepEqual([again.contexts, again.gains], [1, summary.gainsWhileOn + 1], `${label}: turning sound back on reuses the context`);
  return summary;
}

/* AI Flow import: a real export round-trips; malformed files are refused and
 * leave the board as it was; unknown node types and dangling links are dropped. */
const importDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-30-import-"));
let importSerial = 0;
async function importFile(page, body) {
  importSerial += 1;
  const file = path.join(importDirectory, `flow-${importSerial}.json`);
  fs.writeFileSync(file, body);
  await page.$eval("[data-ai-flow-status]", (node) => { node.dataset.tone = "pending-import"; });
  await (await page.$("[data-ai-import-input]")).uploadFile(file);
  await page.waitForFunction(() => document.querySelector("[data-ai-flow-status]").dataset.tone !== "pending-import", { timeout: 8000 });
  await page.evaluate(() => window.__t.frames(3));
  return page.$eval("[data-ai-flow-status]", (node) => node.dataset.tone);
}
const boardTypes = (page) => page.$$eval("[data-ai-board] .ai-flow-node", (nodes) => nodes.map((node) => node.dataset.type));
async function aiFlowImport(page, label) {
  const summary = {};
  await aiEnter(page);
  const start = await aiCounts(page);
  await page.click('[data-ai-template="solution"]');
  const solution = await aiCounts(page);
  const types = await boardTypes(page);
  await page.click('[data-afp-tab="tools"]');
  await page.click("[data-ai-export]");
  const fixture = await page.evaluate(async () => window.__m330.downloads.pop().blob.text());
  await page.click("[data-ai-reset]");
  assert.deepEqual([(await aiCounts(page)).nodes, (await aiCounts(page)).links], [start.nodes, start.links], `${label}: board reset before import`);
  /* a valid export */
  assert.equal(await importFile(page, fixture), "success", `${label}: a real export imports`);
  const imported = await aiCounts(page);
  assert.deepEqual([imported.nodes, imported.links, imported.rendered, await boardTypes(page)], [solution.nodes, solution.links, solution.nodes, types], `${label}: the imported board is the exported flow`);
  assert.ok(imported.paths > 0, `${label}: imported connections are drawn`);
  await page.click("[data-ai-validate]");
  assert.equal(await aiTone(page), "success", `${label}: the imported flow validates`);
  await aiDismiss(page);
  summary.imported = { nodes: imported.nodes, links: imported.links };
  /* not JSON, and JSON of the wrong shape: refused, board untouched */
  for (const [name, body] of [["not JSON", "this is not a flow"], ["wrong shape", JSON.stringify({ nodes: "none", connections: [] })], ["missing connections", JSON.stringify({ nodes: [] })], ["an unknown node type without a config", JSON.stringify({ nodes: [{ id: "a", type: "trigger" }, { id: "b", type: "not-a-node" }], connections: [] })]]) {
    assert.equal(await importFile(page, body), "warning", `${label}: ${name} is refused`);
    const after = await aiCounts(page);
    assert.deepEqual([after.nodes, after.links, after.rendered, await boardTypes(page)], [solution.nodes, solution.links, solution.nodes, types], `${label}: ${name} leaves the board unchanged`);
  }
  summary.refused = 4;
  /* unknown node types and links to them are dropped; the board stays consistent */
  const partial = JSON.stringify({ nodes: [{ id: "a", type: "trigger" }, { id: "b", type: "not-a-node", config: {} }, { id: "c", type: "end" }], connections: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "a", to: "missing" }] });
  assert.equal(await importFile(page, partial), "success", `${label}: a partly valid file imports what is valid`);
  const filtered = await aiCounts(page);
  assert.deepEqual([filtered.nodes, filtered.links, filtered.rendered, await boardTypes(page)], [2, 1, 2, ["trigger", "end"]], `${label}: unknown nodes and dangling links are dropped`);
  summary.filtered = { nodes: filtered.nodes, links: filtered.links };
  /* the board is still usable */
  await page.click('[data-ai-add-node="intent"]');
  assert.equal((await aiCounts(page)).nodes, 3, `${label}: the board works after imports`);
  return summary;
}

const EXTRA = { adventure: adventureWin, joydayPaint: joydaySound, aiFlowPuzzle: aiFlowImport };

const BEHAVIOUR = { labs: [labsBehaviour, labsTouch], adventure: [adventureBehaviour, adventureTouch], joydayPaint: [joydayBehaviour, joydayTouch], aiFlowPuzzle: [aiFlowBehaviour, aiFlowTouch] };

/* ---- lifecycle ---- */
async function listenerCount(page) {
  const client = await page.createCDPSession();
  let total = 0;
  for (const [expression, depth] of [["window", 0], ["document", 0], ["document.querySelector('main')", -1]]) {
    const { result } = await client.send("Runtime.evaluate", { expression });
    const { listeners } = await client.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth, pierce: false });
    total += listeners.length;
  }
  await client.detach();
  return total;
}
const LANGUAGE_HOOK = { adventure: "updateCareerAdventureLanguage", joydayPaint: "updateJoydayPaintLanguage", aiFlowPuzzle: "updateAiFlowPuzzleLanguage" };
const EXPECTED_LOOPS = { labs: 1, adventure: 1, joydayPaint: 0, aiFlowPuzzle: 0 };

async function lifecycleState(page, routeId) {
  if (routeId === "labs") await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), LAB);
  await page.evaluate(() => window.__t.frames(4));
  return {
    listeners: await listenerCount(page),
    loops: await page.evaluate(() => window.__t.loops(30)),
    hook: LANGUAGE_HOOK[routeId] ? await page.evaluate((name) => typeof window[name], LANGUAGE_HOOK[routeId]) : "n/a",
    mounted: await page.evaluate((id) => window.KaanEngineHost.get(id).mounted, PAGES[routeId].engine),
    ids: await page.evaluate(() => window.KaanEngineHost.ids()),
  };
}

/** The lifecycle contract of one hosted engine; returns the violations it observes. */
async function lifecycleViolations(page, routeId) {
  const engine = PAGES[routeId].engine;
  const violations = [];
  const expect = (held, contract) => { if (!held) violations.push(contract); };
  const mounted = await lifecycleState(page, routeId);
  expect(mounted.mounted && JSON.stringify(mounted.ids) === JSON.stringify([engine]), "one mounted engine");
  expect(mounted.loops === EXPECTED_LOOPS[routeId], `mounted engine runs ${EXPECTED_LOOPS[routeId]} loop(s), observed ${mounted.loops}`);
  /* mount again: idempotent */
  await page.evaluate((id) => window.KaanEngineHost.get(id).mount(), engine);
  const again = await lifecycleState(page, routeId);
  expect(again.listeners === mounted.listeners && again.loops === mounted.loops, `second mount() initialized again (listeners ${mounted.listeners} → ${again.listeners}, loops ${mounted.loops} → ${again.loops})`);
  /* the same engine script evaluated a second time */
  if (PAGES[routeId].scripts.length || routeId === "labs") {
    const src = PAGES[routeId].scripts[0] || "/js/pages/labs.js";
    await page.evaluate((url) => new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = `${url}?again=1`; script.onload = resolve; script.onerror = reject; document.body.append(script); }), src);
    const twice = await lifecycleState(page, routeId);
    expect(twice.listeners === mounted.listeners && twice.loops === mounted.loops && twice.ids.length === 1, `engine script evaluated twice initialized again (listeners ${mounted.listeners} → ${twice.listeners}, loops ${mounted.loops} → ${twice.loops})`);
  }
  /* dispose */
  await page.evaluate((id) => window.KaanEngineHost.get(id).dispose(), engine);
  const disposed = await lifecycleState(page, routeId);
  expect(disposed.mounted === false, "dispose leaves the engine mounted");
  expect(disposed.loops === 0, `dispose leaves ${disposed.loops} animation loop(s) running`);
  expect(disposed.listeners < mounted.listeners, `dispose removed no listeners (${mounted.listeners} → ${disposed.listeners})`);
  expect(disposed.hook === "n/a" || disposed.hook === "undefined", "dispose leaves the language hook installed");
  /* remount, three cycles */
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.evaluate((id) => window.KaanEngineHost.get(id).dispose().mount(), engine);
  }
  const remounted = await lifecycleState(page, routeId);
  expect(remounted.mounted === true, "remount did not start the engine");
  expect(remounted.listeners === mounted.listeners, `listeners leak across remounts (${mounted.listeners} → ${remounted.listeners})`);
  expect(remounted.loops === EXPECTED_LOOPS[routeId], `animation loops after remount: ${remounted.loops}`);
  expect(remounted.hook === "n/a" || remounted.hook === "function", "remount did not reinstall the language hook");
  expect(await page.$eval(PAGES[routeId].surface, (node) => node.isConnected && node.getBoundingClientRect().width > 0), "stale or collapsed engine surface after remount");
  return { violations, listeners: mounted.listeners, disposedListeners: disposed.listeners };
}

const surfaceVisible = (page, routeId) => page.$eval(PAGES[routeId].surface, (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (node.tagName !== "CANVAS" || (node.width > 0 && node.height > 0)); });

async function runBrowser() {
  const reactServer = serverFor(root, { instrument: true });
  const acceptedServer = serverFor(ROOT, { acceptedEngines: true, acceptedIcons: true });
  /* The accepted documents with the engines as they ship now (legacy boot). */
  const legacyServer = serverFor(ROOT, { acceptedIcons: true });
  await Promise.all([reactServer, acceptedServer, legacyServer].map((server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))));
  const reactOrigin = `http://127.0.0.1:${reactServer.address().port}`;
  const acceptedOrigin = `http://127.0.0.1:${acceptedServer.address().port}`;
  const legacyOrigin = `http://127.0.0.1:${legacyServer.address().port}`;
  const browser = await puppeteer.launch(launch);
  const tally = { hydrated: 0, dom: 0, layout: 0, behaviour: 0, touch: 0, lifecycle: 0, isolation: 0, negative: 0 };
  const outcomes = {};
  const metrics = {};
  try {
    /* 1. every document: hydration purity, engine started once after hydration,
     *    visible surface, and the rendered main identical to the accepted runtime */
    const conditionNames = Object.keys(CONDITIONS);
    for (const [index, route] of targetRoutes.entries()) {
      const conditions = route.locale === registry.defaultLocale ? conditionNames : [conditionNames[index % conditionNames.length]];
      for (const conditionName of conditions) {
        const label = `${route.pathname}/${conditionName}`;
        const react = await open(browser, `${reactOrigin}${route.pathname}`, conditionName);
        assert.equal(react.response.status(), 200, `${label}: direct URL`);
        await settle(react.page, route.routeId);
        const state = await react.page.evaluate(hydrationState);
        assert.deepEqual(hydrationViolations(state, PAGES[route.routeId].engine), [], `${label}: ${JSON.stringify(state)}`);
        assert.deepEqual(react.diagnostics, [], `${label}: console diagnostics`);
        assert.equal(await react.page.evaluate(() => document.documentElement.dataset.theme), CONDITIONS[conditionName].theme, `${label}: theme`);
        assert.equal(await react.page.evaluate(() => document.documentElement.dataset.routeLocale), route.locale, `${label}: locale`);
        assert.equal(await surfaceVisible(react.page, route.routeId), true, `${label}: engine surface is visible`);
        tally.hydrated += 1;
        if (conditionName === "desktop-dark" && route.locale === registry.defaultLocale) metrics[route.routeId] = { hydrationMs: Math.round(state.hydrationMs * 10) / 10, mountMs: Math.round(state.mountMs * 10) / 10 };

        const accepted = await open(browser, `${acceptedOrigin}${route.pathname}`, conditionName);
        await settle(accepted.page, route.routeId);
        assert.deepEqual(accepted.diagnostics, [], `${label}: accepted console diagnostics`);
        const [acceptedDom, reactDom] = [await accepted.page.evaluate(domSnapshot), await react.page.evaluate(domSnapshot)];
        assert.ok(acceptedDom === reactDom, `${label}: rendered main differs from the accepted runtime — ${acceptedDom === reactDom ? "" : firstDifference(acceptedDom, reactDom)}`);
        tally.dom += 1;
        const [acceptedLayout, reactLayout] = [await measuredLayout(accepted.page), await measuredLayout(react.page)];
        assert.deepEqual(reactLayout.containment, acceptedLayout.containment, `${label}: content-visibility containment`);
        assertLayoutParity(acceptedLayout.layout, reactLayout.layout, label);
        tally.layout += 1;
        await Promise.all([accepted.page.close(), react.page.close()]);
        console.log(`[G-71 document ${tally.hydrated}] ${label}`);
      }
    }

    /* 2. behaviour, run identically on the accepted and the React document.
     *    AI Flow Puzzle is the exception since V4-E06.2: its engine was
     *    reworked on purpose (ports instead of click-to-arm, a run that walks
     *    the real graph, per-level progress instead of an inflating total), so
     *    there is no accepted play left to be equal to. It is played here on
     *    the React document against its own contract; its full behaviour is
     *    held by the E06.2 focused QA in scripts/capture-v4-review.mjs. The
     *    other three engines are compared exactly as before. */
    const playedAlone = new Set([FLOW_PUZZLE_ROUTE]);
    for (const [routeId, [desktop, touch]] of Object.entries(BEHAVIOUR)) {
      const route = targetRoutes.find((item) => item.routeId === routeId && item.locale === registry.defaultLocale);
      const results = {};
      for (const [side, origin] of playedAlone.has(routeId) ? [["react", reactOrigin]] : [["accepted", acceptedOrigin], ["react", reactOrigin]]) {
        const wide = await open(browser, `${origin}${route.pathname}`, "desktop-dark");
        await settle(wide.page, routeId);
        await wide.page.evaluate(helpers);
        const summary = await desktop(wide.page, `${route.pathname} ${side}`);
        assert.deepEqual(wide.diagnostics, [], `${route.pathname} ${side}: console diagnostics during play`);
        await wide.page.close();
        const narrow = await open(browser, `${origin}${route.pathname}`, "mobile-light");
        await settle(narrow.page, routeId);
        await narrow.page.evaluate(helpers);
        const touched = await touch(narrow.page, `${route.pathname} ${side} touch`);
        assert.deepEqual(narrow.diagnostics, [], `${route.pathname} ${side}: console diagnostics during touch play`);
        await narrow.page.close();
        results[side] = { summary, touched };
      }
      if (EXTRA[routeId]) {
        for (const [side, origin] of playedAlone.has(routeId) ? [["react", reactOrigin]] : [["accepted", acceptedOrigin], ["react", reactOrigin]]) {
          const opened = await open(browser, `${origin}${route.pathname}`, "desktop-dark");
          await settle(opened.page, routeId);
          await opened.page.evaluate(helpers);
          results[side].extra = await EXTRA[routeId](opened.page, `${route.pathname} ${side}`);
          assert.deepEqual(opened.diagnostics, [], `${route.pathname} ${side}: console diagnostics during extended play`);
          await opened.page.close();
        }
      }
      if (!playedAlone.has(routeId)) assert.deepEqual(outcomeDifferences(results.react, results.accepted, routeId), [], `${route.pathname}: gameplay differs from the accepted engine`);
      outcomes[routeId] = results;
      tally.behaviour += 1;
      tally.touch += 1;
      console.log(`[G-71 behaviour] ${route.pathname} ${JSON.stringify(results.react).slice(0, 620)}`);
    }

    /* 2b. The comparator itself: a real outcome with one value changed must be
     *     rejected under the rule that value has, and tolerated only where a
     *     tolerance is declared. */
    {
      const rejects = (routeId, pathKeys, change, rule) => {
        const where = [routeId, ...pathKeys].join(".");
        assert.equal(outcomeRule(where), rule, `${where}: comparison rule`);
        const differences = outcomeDifferences(mutatedOutcome(outcomes[routeId].react, pathKeys, change), outcomes[routeId].accepted, routeId);
        assert.ok(differences.length === 1 && differences[0].startsWith(`${where} (${rule})`), `${where}: changed outcome was not rejected (${JSON.stringify(differences)})`);
        tally.negative += 1;
        console.log(`[G-71 negative ${tally.negative}] changed ${where} -> ${differences[0]}`);
      };
      const tolerates = (routeId, pathKeys, change) => {
        assert.deepEqual(outcomeDifferences(mutatedOutcome(outcomes[routeId].react, pathKeys, change), outcomes[routeId].accepted, routeId), [], `${[routeId, ...pathKeys].join(".")}: a variation inside the declared tolerance was rejected`);
      };
      rejects("adventure", ["summary", "score"], (value) => String(Number(value) + 1), "exact");
      rejects("adventure", ["summary", "best"], (value) => String(Number(value) + 1), "exact");
      rejects("adventure", ["summary", "unlocked"], (value) => value + 1, "exact");
      /* AI Flow Puzzle has no accepted outcome to be compared with (E06.2, above). */
      rejects("joydayPaint", ["summary", "png", "width"], (value) => value + 1, "exact");
      rejects("joydayPaint", ["summary", "mission"], (value) => `${value}!`, "exact");
      rejects("joydayPaint", ["extra", "gainsWhileOn"], (value) => value + 1, "exact");
      rejects("joydayPaint", ["summary", "brush"], (value) => Math.round(value * 1.05), "pixels");
      tolerates("joydayPaint", ["summary", "brush"], (value) => Math.round(value * 1.01));
      rejects("labs", ["touched", "width"], (value) => value + 3, "geometry");
      tolerates("labs", ["touched", "width"], (value) => value + 1);
      rejects("adventure", ["extra", "score"], () => 0, "positive");
    }

    /* 3. localized gameplay copy comes from the same engine in every locale */
    for (const route of targetRoutes.filter((item) => item.routeId === "adventure" && item.locale !== registry.defaultLocale)) {
      const pages = [];
      for (const origin of [acceptedOrigin, reactOrigin]) {
        const opened = await open(browser, `${origin}${route.pathname}`, "desktop-dark");
        await settle(opened.page, route.routeId);
        pages.push(await opened.page.$$eval("[data-merge-ladder] strong, [data-adventure-text]", (nodes) => nodes.map((node) => node.textContent)));
        await opened.page.close();
      }
      assert.deepEqual(pages[1], pages[0], `${route.pathname}: localized game copy`);
      tally.dom += 1;
    }

    /* 4. direct URL, refresh, deep link and unknown routes */
    {
      const anchored = await open(browser, `${reactOrigin}/tr/labs/#algorithmic-3d-lab`, "desktop-dark");
      await settle(anchored.page, "labs");
      await anchored.page.waitForFunction(() => (() => { const r = document.querySelector("#algorithmic-3d-lab").getBoundingClientRect(); return window.scrollY > 0 && r.top > -60 && r.top < window.innerHeight / 2; })(), { timeout: 5000 });
      assert.equal(await anchored.page.$eval('[data-labs-grid] .lab-card:nth-child(2) a', (node) => node.getAttribute("href")), "/tr/labs/#algorithmic-3d-lab", "localized Labs anchor link");
      await anchored.page.reload({ waitUntil: "load" });
      await settle(anchored.page, "labs");
      assert.deepEqual(hydrationViolations(await anchored.page.evaluate(hydrationState), "labs"), [], "refresh hydrates and mounts again");
      await anchored.page.close();
      for (const [url, status] of [["/labs/nope/", 404], ["/adventure.html", 200], ["/xx/joyday-paint/", 404]]) {
        const page = await browser.newPage();
        const response = await page.goto(`${reactOrigin}${url}`, { waitUntil: "domcontentloaded" });
        assert.equal(response.status(), status, `${url}: HTTP status`);
        await page.close();
      }
      const noScript = await browser.newPage();
      await noScript.setJavaScriptEnabled(false);
      await noScript.goto(`${reactOrigin}/de/ai-flow-puzzle/`, { waitUntil: "load" });
      const staticText = await noScript.$eval("main", (node) => [node.querySelector("h1").textContent, node.querySelectorAll("h2").length, node.querySelectorAll("button").length]);
      assert.ok(staticText[0] === "AI Flow Puzzle" && staticText[1] >= 3 && staticText[2] > 10, `scripts disabled: the shell is meaningful HTML (${staticText})`);
      await noScript.close();
      tally.isolation += 1;
    }

    /* 5. keyboard and overlay isolation */
    const isolation = async (routeId, sabotage = null) => {
      const route = targetRoutes.find((item) => item.routeId === routeId && item.locale === registry.defaultLocale);
      const opened = await open(browser, `${reactOrigin}${route.pathname}`, "desktop-dark", { sabotage });
      await settle(opened.page, routeId);
      await opened.page.evaluate(helpers);
      const page = opened.page;
      const violations = [];
      if (routeId === "adventure") {
        await page.evaluate(() => document.querySelector("#career-merge-game").scrollIntoView({ block: "start" }));
        /* typing in an input */
        await page.click("[data-command-toggle]");
        await page.waitForSelector("#react-command-root input", { visible: true });
        await page.keyboard.type("a d");
        await page.keyboard.press("Enter");
        await wait(1500);
        if (await boardInk(page, BOARD) !== 0) violations.push("a focused input leaks keys into the game");
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("main").inert, { timeout: 5000 });
        /* an open overlay with focus outside any input */
        await page.click("[data-recruiter-toggle]");
        await page.waitForFunction(() => document.querySelector("main").inert === true, { timeout: 5000 });
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("Space");
        await wait(1500);
        if (await boardInk(page, BOARD) !== 0) violations.push("an open overlay leaks keys into the game");
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("main").inert, { timeout: 5000 });
        /* and the game still takes keys afterwards */
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("Space");
        await wait(1500);
        if (!(await boardInk(page, BOARD) > 0)) violations.push("keys stop working after the overlay closes");
      } else {
        await page.evaluate(() => document.querySelector("#ai-flow-puzzle-game").scrollIntoView({ block: "start" }));
        await page.click('[data-ai-add-node="intent"]');
        await page.click('[data-ai-board] .ai-flow-node[data-type="intent"]');
        const selected = () => page.$eval('[data-ai-board] .ai-flow-node[data-type="intent"]', (node) => node.classList.contains("is-selected"));
        const nodes = (await aiCounts(page)).nodes;
        await page.click("[data-recruiter-toggle]");
        await page.waitForFunction(() => document.querySelector("main").inert === true, { timeout: 5000 });
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press("Delete");
        if ((await aiCounts(page)).nodes !== nodes) violations.push("an open overlay leaks Delete into the board");
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector("main").inert, { timeout: 5000 });
        if ((await aiCounts(page)).nodes === nodes && !(await selected())) violations.push("closing an overlay with Escape clears the board selection");
        await page.click("[data-command-toggle]");
        await page.waitForSelector("#react-command-root input", { visible: true });
        await page.keyboard.press("Backspace");
        if ((await aiCounts(page)).nodes !== nodes) violations.push("a focused input leaks Backspace into the board");
        await page.keyboard.press("Escape");
      }
      await page.close();
      return violations;
    };
    assert.deepEqual(await isolation("adventure"), [], "/adventure/: keyboard isolation");
    assert.deepEqual(await isolation("aiFlowPuzzle"), [], "/ai-flow-puzzle/: keyboard isolation");
    tally.isolation += 2;

    /* 6. lifecycle of every hosted engine */
    const lifecycle = async (routeId, sabotage = null) => {
      const route = targetRoutes.find((item) => item.routeId === routeId && item.locale === registry.defaultLocale);
      const opened = await open(browser, `${reactOrigin}${route.pathname}`, "desktop-dark", { sabotage });
      await settle(opened.page, routeId);
      await opened.page.evaluate(helpers);
      const result = await lifecycleViolations(opened.page, routeId);
      /* after remount the game is playable */
      if (!sabotage && routeId === "adventure") {
        await opened.page.evaluate(() => { document.querySelector("#career-merge-game").scrollIntoView({ block: "start" }); document.activeElement?.blur(); });
        await opened.page.keyboard.press("Space");
        await wait(1500);
        assert.ok(await boardInk(opened.page, BOARD) > 300, "/adventure/: playable after remount");
      }
      if (!sabotage) assert.deepEqual(opened.diagnostics, [], `${route.pathname}: console diagnostics across the lifecycle`);
      await opened.page.close();
      return result;
    };
    for (const routeId of Object.keys(PAGES)) {
      const result = await lifecycle(routeId);
      assert.deepEqual(result.violations, [], `${routeId}: engine lifecycle`);
      metrics[routeId] = { ...metrics[routeId], listeners: `${result.listeners} mounted/${result.disposedListeners} disposed` };
      tally.lifecycle += 1;
      console.log(`[G-71 lifecycle] ${routeId} listeners ${result.listeners} → ${result.disposedListeners} disposed → ${result.listeners} remounted`);
    }

    /* 6b. Joyday audio across the lifecycle: dispose closes the context the
     *     visitor's click created; a remounted studio starts silent again. */
    const soundLifecycle = async (sabotage = null) => {
      const opened = await open(browser, `${reactOrigin}/joyday-paint/`, "desktop-dark", { sabotage });
      await settle(opened.page, "joydayPaint");
      await opened.page.evaluate(helpers);
      const page = opened.page;
      const violations = [];
      await page.click("[data-joyday-sound-toggle]");
      const on = await audioState(page);
      if (on.contexts !== 1 || on.closed !== 0) violations.push("sound on did not create one open audio context");
      await page.evaluate(() => window.KaanEngineHost.get("joydayPaint").dispose());
      await page.evaluate(() => window.__t.frames(3));
      const disposed = await audioState(page);
      if (disposed.closed !== 1 || disposed.states[0] !== "closed") violations.push(`dispose leaves the audio context open (${disposed.states[0]})`);
      await page.evaluate(() => window.KaanEngineHost.get("joydayPaint").mount());
      if ((await soundToggle(page)).pressed !== "false") violations.push("a remounted studio does not start with sound off");
      await page.click('[data-joyday-tool="balloon"]');
      await page.mouse.click(...await at(page, JOYDAY, 0.5, 0.5));
      const silent = await audioState(page);
      if (silent.contexts !== 1 || silent.gains !== 0) violations.push("a remounted studio makes sound without being asked");
      await page.click("[data-joyday-sound-toggle]");
      await page.mouse.click(...await at(page, JOYDAY, 0.6, 0.6));
      const fresh = await audioState(page);
      if (fresh.contexts !== 2 || fresh.gains !== 1 || fresh.states[1] === "closed") violations.push(`sound does not work after remount (${JSON.stringify(fresh)})`);
      if (!sabotage && opened.diagnostics.length) violations.push(`console diagnostics: ${opened.diagnostics.join("; ")}`);
      await page.close();
      return violations;
    };
    assert.deepEqual(await soundLifecycle(), [], "/joyday-paint/: audio lifecycle");
    tally.lifecycle += 1;

    /* 6c. AI Flow asynchronous ownership: a file read or a clipboard write that
     *     completes after its engine was disposed must not touch the board of
     *     the engine mounted afterwards. */
    const asyncOwnership = async (sabotage = null) => {
      const opened = await open(browser, `${reactOrigin}/ai-flow-puzzle/`, "desktop-dark", { sabotage });
      await settle(opened.page, "aiFlowPuzzle");
      await opened.page.evaluate(helpers);
      const page = opened.page;
      const violations = [];
      const host = (method) => page.evaluate((name) => { window.KaanEngineHost.get("aiFlowPuzzle")[name](); }, method);
      const board = async () => ({ counts: await aiCounts(page), types: await boardTypes(page), status: await page.$eval("[data-ai-flow-status]", (node) => [node.dataset.tone, node.querySelector("span").textContent]) });
      const drain = async () => { await wait(250); await page.evaluate(() => window.__t.frames(3)); };
      await page.evaluate(() => document.querySelector("#ai-flow-puzzle-game").scrollIntoView({ block: "start" }));
      await page.click('[data-ai-template="solution"]');
      const solution = await aiCounts(page);
      await page.click("[data-ai-export]");
      const fixture = await page.evaluate(async () => window.__m330.downloads.pop().blob.text());
      await page.click("[data-ai-reset]");

      /* a delayed import, disposed before it completes */
      const pending = path.join(importDirectory, "pending.json");
      fs.writeFileSync(pending, fixture);
      await page.evaluate(() => { window.__m330.io.holdReads = true; });
      await (await page.$("[data-ai-import-input]")).uploadFile(pending);
      await page.waitForFunction(() => window.__m330.io.held.length === 1, { timeout: 5000 });
      await host("dispose");
      if (await page.evaluate(() => window.__m330.io.readerAborts) !== 1) violations.push("dispose does not abort the pending file read");
      await host("mount");
      const fresh = await board();
      if (fresh.counts.nodes === solution.nodes) violations.push("the remounted board is not a fresh one");
      await page.evaluate(() => { window.__m330.io.holdReads = false; window.__m330.io.held.shift()(); });
      await drain();
      if (JSON.stringify(await board()) !== JSON.stringify(fresh)) violations.push(`a stale file read changed the remounted board (${JSON.stringify(await board())})`);
      /* a normal import still works on the remounted engine */
      if (await importFile(page, fixture) !== "success" || (await aiCounts(page)).nodes !== solution.nodes || (await aiCounts(page)).links !== solution.links) violations.push("import does not work after remount");

      /* a clipboard write that settles after disposal: resolved, then rejected */
      await page.evaluate(() => {
        const io = window.__m330.io;
        io.copies = 0;
        io.pendingCopy = null;
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { io.pendingCopy = { resolve, reject }; }) } });
        const execCommand = document.execCommand.bind(document);
        document.execCommand = (command, ...rest) => { if (command === "copy") io.copies += 1; return execCommand(command, ...rest); };
      });
      for (const outcome of ["resolve", "reject"]) {
        await page.click("[data-ai-reset]");
        await page.click("[data-ai-copy]");
        await page.waitForFunction(() => window.__m330.io.pendingCopy, { timeout: 5000 });
        await host("dispose");
        await host("mount");
        const before = await board();
        await page.evaluate((name) => { const copy = window.__m330.io.pendingCopy; window.__m330.io.pendingCopy = null; copy[name](new Error("denied")); }, outcome);
        await drain();
        if (JSON.stringify(await board()) !== JSON.stringify(before)) violations.push(`a stale clipboard ${outcome} changed the remounted board`);
        if (await page.evaluate(() => window.__m330.io.copies) !== 0) violations.push(`a stale clipboard ${outcome} ran the copy fallback`);
      }
      /* live engine: a granted and a denied clipboard both end in the copied status */
      for (const outcome of ["resolve", "reject"]) {
        await page.click("[data-ai-reset]");
        await page.click("[data-ai-copy]");
        await page.waitForFunction(() => window.__m330.io.pendingCopy, { timeout: 5000 });
        await page.evaluate((name) => { const copy = window.__m330.io.pendingCopy; window.__m330.io.pendingCopy = null; copy[name](new Error("denied")); }, outcome);
        await drain();
        const state = await page.evaluate(() => [document.querySelector("[data-ai-flow-status]").dataset.tone, window.__m330.io.copies]);
        if (state[0] !== "success" || state[1] !== (outcome === "reject" ? 1 : 0)) violations.push(`copy summary does not work on the live engine (${outcome}: ${JSON.stringify(state)})`);
        await page.evaluate(() => { window.__m330.io.copies = 0; });
      }
      if (!sabotage && opened.diagnostics.length) violations.push(`console diagnostics: ${opened.diagnostics.join("; ")}`);
      await page.close();
      return violations;
    };
    assert.deepEqual(await asyncOwnership(), [], "/ai-flow-puzzle/: asynchronous completions across dispose and remount");
    tally.lifecycle += 1;
    console.log("[G-71 lifecycle] aiFlowPuzzle stale file read and clipboard completions are ignored after dispose; import and copy work after remount");

    /* 6d. AI Flow drag ownership: the engine clears its drag state in a
     *     zero-delay timer after the release. A press that arrives before that
     *     timer runs starts the next drag, which the late clear must not end. */
    const dragOwnership = async (sabotage = null) => {
      const opened = await open(browser, `${reactOrigin}/ai-flow-puzzle/`, "desktop-dark", { sabotage });
      await settle(opened.page, "aiFlowPuzzle");
      await opened.page.evaluate(helpers);
      const page = opened.page;
      const violations = [];
      const target = '[data-ai-board] .ai-flow-node[data-type="fallback"]';
      const left = () => page.$eval(target, (element) => element.style.left);
      await page.evaluate(() => document.querySelector("#ai-flow-puzzle-game").scrollIntoView({ block: "start" }));
      await page.click('[data-ai-add-node="fallback"]');
      const before = await left();
      const [x0, y0] = await at(page, target, 0.5, 0.5), [x1, y1] = await at(page, target, 2.2, 0.5);
      /* press and release, with the release's deferred clear held back */
      await page.evaluate(() => { window.__m330.io.holdTimers = true; });
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__m330.io.heldTimers.length >= 1, { timeout: 5000 });
      /* the next press starts a drag; only then does the earlier clear run */
      await page.mouse.down();
      await page.evaluate(() => { const io = window.__m330.io; io.holdTimers = false; io.heldTimers.splice(0).forEach((run) => run()); });
      await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
      if (await left() === before) violations.push(`a drag that starts before the previous release's clear runs does not move the node (${before})`);
      if (!sabotage && opened.diagnostics.length) violations.push(`console diagnostics: ${opened.diagnostics.join("; ")}`);
      await page.close();
      return violations;
    };
    assert.deepEqual(await dragOwnership(), [], "/ai-flow-puzzle/: a late drag clear does not end the next drag");
    tally.lifecycle += 1;
    console.log("[G-71 lifecycle] aiFlowPuzzle a drag started before the previous release's deferred clear still moves the node");

    /* 7. negative controls: the real shipped script or document is broken, and
     *    the check it targets must report exactly that */
    const control = async (name, observed, pattern) => {
      const list = await observed;
      assert.ok(list.some((violation) => pattern.test(violation)), `${name}: negative control was not rejected (observed ${JSON.stringify(list)})`);
      tally.negative += 1;
      console.log(`[G-71 negative ${tally.negative}] ${name} -> ${list.find((violation) => pattern.test(violation))}`);
    };
    const replace = (from, to) => (source) => source.replace(from, to);
    await control("second mount() initializes again", lifecycle("adventure", { [ENGINE_HOST]: replace("        if (controller) return engine;\n", "") }).then((r) => r.violations), /second mount\(\) initialized again/);
    await control("engine script evaluated twice starts twice", lifecycle("adventure", { [ENGINE_HOST]: replace('typeof start !== "function" || engines.has(id)', 'typeof start !== "function"') }).then((r) => r.violations), /engine script evaluated twice initialized again|one mounted engine/);
    await control("animation frame survives dispose", lifecycle("adventure", { "/adventure-game.js": (source) => source.replace("    if (lifecycle.aborted) return;\n    stepPhysics();", "    stepPhysics();").replace("    cancelAnimationFrame(frame);\n", "") }).then((r) => r.violations), /dispose leaves 1 animation loop/);
    await control("Labs animation frame survives dispose", lifecycle("labs", { "/js/pages/labs.js": replace('  lifecycle.addEventListener("abort", stop, { once: true });\n', "") }).then((r) => r.violations), /dispose leaves 1 animation loop/);
    await control("listeners survive dispose", lifecycle("joydayPaint", { "/joyday-paint.js": (source) => source.replaceAll(", { signal: lifecycle });", ");") }).then((r) => r.violations), /dispose removed no listeners|listeners leak across remounts/);
    await control("listeners leak across remounts", lifecycle("aiFlowPuzzle", { "/ai-flow-puzzle.js": (source) => source.replaceAll('?.addEventListener("click", runFlow, { signal: lifecycle });', '?.addEventListener("click", runFlow);').replace("window.addEventListener(\"resize\", renderLines, { signal: lifecycle });", "window.addEventListener(\"resize\", renderLines);") }).then((r) => r.violations), /listeners leak across remounts/);
    /* Every input outside the game sits in an overlay that also makes the page
     * inert, so the two guards overlap there; this control removes both. */
    await control("typing in a focused input reaches the game", isolation("adventure", { "/adventure-game.js": (source) => source.replace('    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;\n', "").replace('    if (canvas.closest("[inert]")) return;\n', "") }), /a focused input leaks keys into the game/);
    await control("open overlay leaks keys into the game", isolation("adventure", { "/adventure-game.js": replace('    if (canvas.closest("[inert]")) return;\n', "") }), /an open overlay leaks keys into the game/);
    await control("open overlay leaks keys into the board", isolation("aiFlowPuzzle", { "/ai-flow-puzzle.js": replace('      if (board.closest("[inert]")) return;\n', "") }), /an open overlay leaks Delete into the board|closing an overlay with Escape clears the board selection/);

    await control("audio context survives dispose", soundLifecycle({ "/joyday-paint.js": replace("    state.audio?.close?.();\n", "") }), /dispose leaves the audio context open/);

    await control("stale file read writes into the remounted board", asyncOwnership({ "/ai-flow-puzzle.js": replace("    reader.onload = () => {\n      if (lifecycle.aborted) return;\n", "    reader.onload = () => {\n") }), /a stale file read changed the remounted board/);
    await control("pending file read is not aborted on dispose", asyncOwnership({ "/ai-flow-puzzle.js": replace("    pendingReaders.forEach((reader) => reader.abort());\n", "") }), /dispose does not abort the pending file read/);
    await control("stale clipboard success writes into the remounted board", asyncOwnership({ "/ai-flow-puzzle.js": replace('    if (lifecycle.aborted) return;\n    setStatus(t("summaryCopied"), "success");', '    setStatus(t("summaryCopied"), "success");') }), /a stale clipboard resolve changed the remounted board/);
    await control("stale clipboard failure runs the copy fallback", asyncOwnership({ "/ai-flow-puzzle.js": replace("    } catch (error) {\n      if (lifecycle.aborted) return;\n      const area", "    } catch (error) {\n      const area") }), /a stale clipboard reject ran the copy fallback/);

    await control("late drag clear ends the next drag", dragOwnership({ "/ai-flow-puzzle.js": replace("if (state.drag === drag) state.drag = null;", "state.drag = null;") }), /a drag that starts before the previous release\'s clear runs does not move the node/);

    const hydrationControl = async (name, url, sabotage, pattern, routeId = "adventure") => {
      const opened = await open(browser, `${reactOrigin}${url}`, "desktop-dark", { sabotage });
      await opened.page.waitForFunction(() => window.__m330p?.settled === true, { timeout: 20000 });
      const observed = hydrationViolations(await opened.page.evaluate(hydrationState), PAGES[routeId].engine);
      await opened.page.close();
      await control(name, observed, pattern);
    };
    await hydrationControl("engine boots before hydration", "/adventure/", { "/adventure-game.js": replace('if (document.querySelector("main[data-react-main]")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push(["adventure", startCareerAdventure]);\nelse startCareerAdventure(new AbortController().signal);', "startCareerAdventure(new AbortController().signal);") }, /markup changed before hydration/);
    await hydrationControl("host starts engines without waiting for hydration", "/joyday-paint/", { [ENGINE_HOST]: replace("  let released = false;", "  let released = true;") }, /markup changed before hydration|engine started before hydration completed/, "joydayPaint");
    await hydrationControl("legacy lab-card renderer rewrites the React index", "/labs/", { "/portfolio-v2.js": replace('      if (container.closest("[data-react-main]")) return;\n      container.innerHTML = registry.labs', "      container.innerHTML = registry.labs") }, /markup changed before hydration|descendant identity changed/, "labs");
    await hydrationControl("hydration text drift", "/ai-flow-puzzle/?sabotage=text", null, /recoverable hydration error/, "aiFlowPuzzle");
    await hydrationControl("hydration attribute drift", "/labs/?sabotage=attribute", null, /markup changed before hydration|attributes changed/, "labs");
    await hydrationControl("hydration copy drift", "/joyday-paint/?sabotage=copy", null, /markup changed before hydration|innerHTML changed/, "joydayPaint");
    await hydrationControl("engine never mounts", "/adventure/", { [ENGINE_HOST]: replace("  window.addEventListener(HYDRATED_EVENT, release, { once: true });\n", "") }, /engine not mounted exactly once after hydration/);

    /* an invisible / zero-size canvas */
    {
      const opened = await open(browser, `${reactOrigin}/adventure/`, "desktop-dark");
      await settle(opened.page, "adventure");
      await opened.page.addStyleTag({ content: "#career-merge-canvas{display:none}" });
      await control("collapsed canvas", [await surfaceVisible(opened.page, "adventure") ? "visible" : "engine surface is not visible"], /engine surface is not visible/);
      await opened.page.close();
    }
    /* a broken PNG export */
    {
      const opened = await open(browser, `${reactOrigin}/joyday-paint/`, "desktop-dark");
      await settle(opened.page, "joydayPaint");
      await opened.page.click("[data-joyday-finish]");
      const href = await opened.page.$eval("[data-joyday-preview-img]", (node) => node.src);
      await opened.page.close();
      const rejected = (label, value) => { try { validatePng(value, label); return ["accepted"]; } catch (error) { return [`rejected: ${error.message.split("\n")[0]}`]; } };
      assert.deepEqual(rejected("intact", href), ["accepted"], "PNG control baseline");
      await control("truncated PNG export", rejected("truncated", href.slice(0, Math.floor(href.length * 0.6))), /rejected: .*(truncated|end chunk|checksum)/);
      const corrupt = Buffer.from(href.slice(href.indexOf(",") + 1), "base64"); corrupt[corrupt.length - 40] ^= 0xff;
      await control("corrupted PNG export", rejected("corrupted", `data:image/png;base64,${corrupt.toString("base64")}`), /rejected: .*checksum/);
    }
    /* 8. the bundle-failure fallback answers to the React entry and to nothing else */
    const bundle = `/assets-react/${fs.readdirSync(path.join(root, "assets-react")).find((file) => file.endsWith(".js"))}`;
    const routeOf = (routeId, locale = registry.defaultLocale) => targetRoutes.find((route) => route.routeId === routeId && route.locale === locale);
    const interfaceAlive = async (page, routeId) => {
      const violations = [];
      const engine = PAGES[routeId].engine;
      if (await page.evaluate((id) => window.KaanEngineHost?.get(id)?.mounted === true, engine) !== true) violations.push("engine is not mounted");
      if (!(await page.$(PAGES[routeId].ready))) violations.push("engine interface is missing");
      else if (!(await surfaceVisible(page, routeId))) violations.push("engine surface is not visible");
      if (routeId === "aiFlowPuzzle" && !violations.length) {
        const count = () => page.$$eval("[data-ai-board] .ai-flow-node", (nodes) => nodes.length);
        const before = await count();
        await page.$eval("[data-ai-add-node]", (button) => button.click());
        if (await count() !== before + 1) violations.push("engine does not respond to input");
      }
      /* Adventure draws on a permanent frame loop; the Labs canvas animates
       * only while it is on screen and motion is allowed, so it is not sampled. */
      if (routeId === "adventure" && !violations.length) {
        await page.bringToFront();
        const frames = () => page.evaluate(() => window.__m330.frames);
        const before = await frames();
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (await frames() <= before) violations.push("engine animation loop is not running");
      }
      return violations;
    };
    /* (a) An unrelated module that cannot be loaded, before and after the
     * React entry: hydration is untouched, the engine mounts once after it,
     * and the game is there afterwards. */
    const unrelatedModuleFailure = async (route, conditionName, positions, sabotage = null) => {
      const opened = await open(browser, `${reactOrigin}${route.pathname}?module=${positions.join(",")}`, conditionName, { sabotage });
      const violations = [];
      await settle(opened.page, route.routeId).catch((error) => violations.push(`page did not settle: ${error.message.split("\n")[0]}`));
      const state = await opened.page.evaluate(hydrationState).catch(() => null);
      violations.push(...(state ? hydrationViolations(state, PAGES[route.routeId].engine) : ["hydration state unavailable"]));
      violations.push(...await interfaceAlive(opened.page, route.routeId));
      const failed = await opened.page.evaluate(() => window.__m330.moduleErrors);
      const expected = positions.map((position) => UNRELATED_MODULE[position].tag.match(/src="([^"]+)"/)[1]);
      if (JSON.stringify([...failed].sort()) !== JSON.stringify([...expected].sort())) violations.push(`unrelated modules that failed to load: ${JSON.stringify(failed)}, expected ${JSON.stringify(expected)}`);
      if (!sabotage && opened.diagnostics.length) violations.push(`console diagnostics: ${opened.diagnostics.join("; ")}`);
      await opened.page.close();
      return violations;
    };
    for (const [routeId, locale, conditionName] of [
      ["labs", "en", "desktop-dark"], ["adventure", "en", "desktop-dark"], ["joydayPaint", "en", "desktop-dark"], ["aiFlowPuzzle", "en", "desktop-dark"],
      ["labs", "fr", "mobile-dark"], ["adventure", "tr", "mobile-light"], ["joydayPaint", "de", "mobile-dark"], ["aiFlowPuzzle", "es", "mobile-light"],
    ]) {
      const route = routeOf(routeId, locale);
      assert.deepEqual(await unrelatedModuleFailure(route, conditionName, ["before", "after", "namespace"]), [], `${route.pathname}/${conditionName}: an unrelated module failure must not disturb hydration or the game`);
      tally.lifecycle += 1;
      console.log(`[G-71 lifecycle] ${route.pathname} ${conditionName} unrelated failing modules (before the entry, after it, and in the React bundle namespace): hydration clean, engine mounted once, game usable`);
    }
    /* (b) The React entry itself cannot be loaded: no hydration, and the
     * engine still starts on the server markup, exactly once. */
    const entryFailure = async (route, conditionName, sabotage = {}) => {
      const opened = await open(browser, `${reactOrigin}${route.pathname}`, conditionName, { sabotage: { [bundle]: "fail", ...sabotage } });
      const violations = [];
      await opened.page.waitForFunction((id, ready) => window.KaanEngineHost?.get(id)?.mounted === true && document.querySelector(ready), { timeout: 6000 }, PAGES[route.routeId].engine, PAGES[route.routeId].ready)
        .catch(() => violations.push("the fallback did not start the engine"));
      const state = await opened.page.evaluate(() => ({ signals: window.__m330p.signals, failed: window.__m330.moduleErrors, released: window.KaanEngineHost.released, ids: window.KaanEngineHost.ids() }));
      if (state.signals !== 0) violations.push("hydration ran although the entry could not be loaded");
      if (JSON.stringify(state.failed) !== JSON.stringify([bundle])) violations.push(`module failures: ${JSON.stringify(state.failed)}, expected only the React entry`);
      if (JSON.stringify(state.ids) !== JSON.stringify([PAGES[route.routeId].engine])) violations.push(`engines: ${JSON.stringify(state.ids)}`);
      if (!violations.length) violations.push(...await interfaceAlive(opened.page, route.routeId));
      await opened.page.close();
      return violations;
    };
    for (const [routeId, locale, conditionName] of [["adventure", "en", "desktop-dark"], ["joydayPaint", "tr", "mobile-light"], ["aiFlowPuzzle", "en", "mobile-dark"], ["labs", "de", "desktop-light"]]) {
      const route = routeOf(routeId, locale);
      assert.deepEqual(await entryFailure(route, conditionName), [], `${route.pathname}/${conditionName}: the game must start when the React entry cannot be loaded`);
      tally.lifecycle += 1;
      console.log(`[G-71 lifecycle] ${route.pathname} ${conditionName} React entry cannot be loaded: no hydration, engine started once by the fallback, game usable`);
    }
    /* (c) Controls. The accepted #30 host (the reviewed hotfix reversed) is the
     * original defect: each failure position alone must be caught. A host
     * without the fallback, and one that answers to a different namespace,
     * must be caught by the entry-failure check. */
    const acceptedHost = { [ENGINE_HOST]: (source) => engineHostAcceptedBase(ENGINE_HOST.slice(1), source) };
    const DISTURBED = /engine started before hydration completed|markup changed before hydration|recoverable hydration error|engine interface is missing|main replaced/;
    await control("#30 host: an unrelated module failing before hydration releases the engine", unrelatedModuleFailure(routeOf("joydayPaint"), "desktop-dark", ["before"], acceptedHost), DISTURBED);
    await control("#30 host: an unrelated module failing during hydration releases the engine", unrelatedModuleFailure(routeOf("aiFlowPuzzle"), "desktop-dark", ["after"], acceptedHost), DISTURBED);
    await control("#30 host: a blocked third-party module on a localized mobile page", unrelatedModuleFailure(routeOf("adventure", "tr"), "mobile-light", ["before", "after"], acceptedHost), DISTURBED);
    await control("namespace-matching host: a failing module in the React bundle namespace releases the engine", unrelatedModuleFailure(routeOf("joydayPaint"), "desktop-dark", ["namespace"], { [ENGINE_HOST]: replace("target === entry;", 'target.matches(\'[src^="/assets-react/"]\');') }), DISTURBED);
    await control("#30 host: a failing module in the React bundle namespace releases the engine", unrelatedModuleFailure(routeOf("aiFlowPuzzle", "es"), "mobile-light", ["namespace"], acceptedHost), DISTURBED);
    await control("host without the entry fallback", entryFailure(routeOf("adventure"), "desktop-dark", { [ENGINE_HOST]: replace("if (isReactEntry(event.target)) release();", "") }), /the fallback did not start the engine/);
    await control("host that looks for the entry after another payload", entryFailure(routeOf("joydayPaint"), "desktop-dark", { [ENGINE_HOST]: replace('"react-command-props"', '"react-main-props"') }), /the fallback did not start the engine/);

    console.log(`G-71 Labs/mini-game browser gate passed. ${tally.hydrated} hydrated documents (${targetRoutes.length} routes; EN in 4 conditions) · ${tally.dom} rendered-main comparisons and ${tally.layout} element-level layout/style comparisons against the accepted runtime · ${tally.behaviour} desktop + ${tally.touch} touch + ${Object.keys(EXTRA).length} extended (win, sound, import) gameplay scripts with the same outcome on accepted and React · ${tally.lifecycle} lifecycle checks · ${tally.isolation} isolation/direct-URL checks · ${tally.negative} observed negative-control failures.`);
    console.log(`  EN desktop metrics: ${Object.entries(metrics).map(([id, value]) => `${id} hydration ${value.hydrationMs} ms · engine mount ${value.mountMs} ms · listeners ${value.listeners}`).join(" | ")}`);
  } finally {
    await browser.close();
    await Promise.all([reactServer, acceptedServer, legacyServer].map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

try {
  await runStatic();
  if (!staticOnly) await runBrowser();
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  fs.rmSync(importDirectory, { recursive: true, force: true });
}
