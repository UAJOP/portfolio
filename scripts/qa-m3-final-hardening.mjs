#!/usr/bin/env node
/* Master 3 #33 gate (G-73): React architecture hardening.
 *
 * Earlier gates prove each migrated family against its accepted documents.
 * This one holds the finished architecture to the contracts that are true of
 * every canonical React document at once, and to the three runtime ownership
 * classes #33 closed:
 *
 *   1. document contract   every canonical document: routing, SEO head,
 *                          sitemap, legacy stubs, the overlay owner model
 *   2. no-JS structure     every canonical document at 320px without
 *                          JavaScript: meaningful SSR, overflow, names, ARIA
 *   3. hydrated matrix     representative families x 5 locales x 4 viewports
 *                          x 2 themes: hydration, console, requests, layout
 *   4. conversation        an Ajoop message sent before the page has finished
 *                          loading survives DOMContentLoaded and hydration
 *   5. overlay ownership   inert, scroll lock, Escape and focus across
 *                          takeovers, hydration and page dialogs
 *   6. game input          an open overlay isolates every retained engine
 *   7. routing             direct load, refresh, anchors, legacy URLs, 404
 *
 * Each class has negative controls: the same check is run against a mutant of
 * the shipped file (for the runtime classes, the pre-#33 bytes themselves) and
 * must reject it. The AI edge is answered with a deterministic 503 and every
 * other third-party request with an empty 204, so the gate needs no network. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";
import { isLegacyStub, loadSiteRoutes } from "./site-routes.mjs";
import { finalHardeningAcceptedBase } from "./m3-33-public-edits.mjs";

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(ROOT, process.argv[rootAt + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "m3-33-hardening-"));
const artifact = requestedRoot || path.join(temporary, "site");
if (!requestedRoot) await buildProductionSite({ outputDirectory: artifact });

const site = loadSiteRoutes();
const registry = loadRegistry();
const origin = site.origin;
const routes = productionReactRoutes();
const LOCALES = [registry.defaultLocale, ...registry.localizedRoutes.generate.filter((id) => id !== registry.defaultLocale)];
const localeOf = (id) => registry.locales.find((locale) => locale.id === id);
const routeFor = (locale, id) => routes.find((route) => route.locale === locale && route.id === id);
const prefix = (locale) => (locale === registry.defaultLocale ? "" : `/${localeOf(locale).routePrefix}`);
const readArtifact = (file) => fs.readFileSync(path.join(artifact, file), "utf8");
const inArtifact = (file) => fs.existsSync(path.join(artifact, file)) && fs.statSync(path.join(artifact, file)).isFile();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Local iteration only: M3_33_SECTIONS=4,5 runs those sections and then fails,
 * so a partial run can never be mistaken for a pass. */
const selected = process.env.M3_33_SECTIONS ? new Set(process.env.M3_33_SECTIONS.split(",").map(Number)) : null;
const section = (number) => !selected || selected.has(number);
const tally = { assertions: 0, controls: 0 };
const ok = (value, message) => { assert.ok(value, message); tally.assertions += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); tally.assertions += 1; };
/** A negative control: the violations a check reports for a mutant must match. */
const rejects = (name, violations, pattern) => {
  assert.ok(violations.some((violation) => pattern.test(violation)), `negative control "${name}" was not rejected (${violations.length ? violations.join(" | ") : "no violation"})`);
  tally.controls += 1;
};

/* ------------------------------------------------------- 1. document contract */

const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? null;
const decodeHtml = (value) => value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const metaOf = (head, key, value) => {
  const tag = (head.match(/<meta\b[^>]*>/g) || []).find((item) => attribute(item, key) === value);
  return tag ? decodeHtml(attribute(tag, "content") ?? "") : null;
};
const resolvable = (url) => url.startsWith(`${origin}/`) && inArtifact(decodeURIComponent(url.slice(origin.length + 1)));

/** Everything a canonical React document owes its route, as violations. */
function documentViolations(html, route) {
  const violations = [];
  const fail = (message) => violations.push(`${route.output}: ${message}`);
  const headEnd = html.indexOf("</head>");
  if (headEnd < 0) return [`${route.output}: no <head>`];
  const head = html.slice(0, headEnd);
  const locale = localeOf(route.locale);
  const htmlTag = html.match(/<html\b[^>]*>/)?.[0] || "";
  if (attribute(htmlTag, "lang") !== locale.htmlLang) fail(`<html lang> is ${attribute(htmlTag, "lang")}, not ${locale.htmlLang}`);
  if (attribute(htmlTag, "dir") !== locale.dir) fail(`<html dir> is ${attribute(htmlTag, "dir")}`);
  if (attribute(htmlTag, "data-route-locale") !== route.locale) fail(`data-route-locale is ${attribute(htmlTag, "data-route-locale")}`);
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1\.0"\/>/.test(head)) fail("viewport meta is missing");
  if (!decodeHtml(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim()) fail("empty <title>");
  if (!metaOf(head, "name", "description")?.trim()) fail("empty meta description");
  if (metaOf(head, "name", "robots") !== "index, follow") fail(`robots is ${metaOf(head, "name", "robots")}`);

  const canonicalUrl = `${origin}${route.pathname}`;
  const links = head.match(/<link\b[^>]*>/g) || [];
  const canonical = links.filter((link) => attribute(link, "rel") === "canonical").map((link) => attribute(link, "href"));
  if (canonical.length !== 1 || canonical[0] !== canonicalUrl) fail(`canonical ${JSON.stringify(canonical)} is not ${canonicalUrl}`);
  const alternates = links.filter((link) => attribute(link, "rel") === "alternate").map((link) => [attribute(link, "hreflang"), attribute(link, "href")]);
  const expectedAlternates = LOCALES.map((id) => [localeOf(id).htmlLang, `${origin}${routeFor(id, route.id).pathname}`]);
  expectedAlternates.push(["x-default", `${origin}${routeFor(registry.defaultLocale, route.id).pathname}`]);
  const sorted = (list) => JSON.stringify([...list].sort(([a], [b]) => a.localeCompare(b)));
  if (sorted(alternates) !== sorted(expectedAlternates)) fail(`hreflang set ${sorted(alternates)} is not ${sorted(expectedAlternates)}`);

  /* OpenGraph: title, description and image on every document. The rest is
   * carried by some families only (as their accepted documents did); where a
   * property is present it must agree with the route. */
  for (const property of ["og:title", "og:description", "og:image"]) if (!metaOf(head, "property", property)?.trim()) fail(`${property} is missing`);
  const present = (key, value) => metaOf(head, key, value);
  if (present("property", "og:image") && !resolvable(present("property", "og:image"))) fail(`og:image does not resolve: ${present("property", "og:image")}`);
  if (present("property", "og:url") !== null && present("property", "og:url") !== canonicalUrl) fail(`og:url ${present("property", "og:url")} is not the canonical URL`);
  if (present("property", "og:locale") !== null && present("property", "og:locale") !== locale.ogLocale) fail(`og:locale ${present("property", "og:locale")} is not ${locale.ogLocale}`);
  for (const [key, value] of [["property", "og:type"], ["property", "og:site_name"], ["name", "twitter:card"], ["name", "twitter:title"], ["name", "twitter:description"]]) {
    if (present(key, value) !== null && !present(key, value).trim()) fail(`${value} is empty`);
  }
  if (present("name", "twitter:image") !== null && !resolvable(present("name", "twitter:image"))) fail(`twitter:image does not resolve: ${present("name", "twitter:image")}`);
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      if (!JSON.parse(block[1])["@context"]) fail("JSON-LD has no @context");
    } catch (error) {
      fail(`JSON-LD does not parse (${error.message})`);
    }
  }

  /* One client entry, every script once, and no page-relative reference: a
   * document lives several directories deep and is refreshed where it is. */
  const scripts = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((match) => match[1]);
  if (entries.length !== 1 || !/^\/assets-react\/production-main-[\w-]+\.js$/.test(entries[0] || "") || !inArtifact((entries[0] || "/").slice(1))) fail(`React client entry ${JSON.stringify(entries)} is not one emitted bundle`);
  if (new Set(scripts).size !== scripts.length) fail(`a script is declared twice (${scripts.filter((src, index) => scripts.indexOf(src) !== index).join(", ")})`);
  const references = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => decodeHtml(match[1]));
  const relative = references.filter((value) => value && !/^(?:\/|#|https?:|mailto:|tel:|data:)/.test(value));
  if (relative.length) fail(`page-relative reference(s): ${relative.slice(0, 3).join(", ")}`);
  for (const owner of ['data-react-main=""', 'data-react-recruiter-owner="react"', 'data-react-ajoop-shell="react"', 'data-react-command-owner="react"']) {
    if (html.split(owner).length !== 2) fail(`React owner ${owner} must occur exactly once`);
  }
  return violations;
}

/** The whole canonical surface: emission, uniqueness, sitemap, legacy URLs. */
function surfaceViolations({ list = routes, read = readArtifact, exists = inArtifact, sitemap = readArtifact("sitemap.xml") } = {}) {
  const violations = [];
  const titles = new Map();
  for (const route of list) {
    if (!exists(route.output)) { violations.push(`${route.output}: canonical document is not emitted`); continue; }
    const html = read(route.output);
    violations.push(...documentViolations(html, route));
    const title = `${route.locale}|${html.match(/<title>([\s\S]*?)<\/title>/)?.[1]}`;
    titles.set(title, [...(titles.get(title) || []), route.output]);
  }
  for (const [title, documents] of titles) if (documents.length > 1) violations.push(`title "${title}" is shared by ${documents.join(", ")}`);
  const canonicalUrls = new Set(list.map((route) => `${origin}${route.pathname}`));
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  for (const url of canonicalUrls) if (!locations.includes(url)) violations.push(`sitemap: ${url} is missing`);
  for (const url of locations) if (!canonicalUrls.has(url)) violations.push(`sitemap: ${url} is not a canonical document`);
  if (new Set(locations).size !== locations.length) violations.push("sitemap: a URL is listed twice");
  return violations;
}

/** Every legacy `.html` URL forwards to its clean route with query and hash. */
function legacyStubViolations() {
  const violations = [];
  let stubs = 0;
  for (const route of routes.filter((item) => item.kind === "page")) {
    const legacy = site.pages.find((page) => page.id === route.id).legacy;
    if (!legacy || legacy === "index.html") continue;
    const file = `${prefix(route.locale).slice(1)}${prefix(route.locale) ? "/" : ""}${legacy}`;
    if (!inArtifact(file)) { violations.push(`${file}: legacy URL has no document`); continue; }
    const html = readArtifact(file);
    stubs += 1;
    if (!isLegacyStub(html)) violations.push(`${file}: is not a forwarding stub`);
    if (!html.includes(`<link rel="canonical" href="${origin}${route.pathname}"/>`)) violations.push(`${file}: does not name ${route.pathname} as canonical`);
    if (!html.includes(`location.replace("${route.pathname}"+location.search+location.hash)`)) violations.push(`${file}: does not forward query and hash to ${route.pathname}`);
    if (/data-react-main|assets-react/.test(html)) violations.push(`${file}: a forwarding stub must not boot React`);
  }
  return { violations, stubs };
}

/** One owner model: only the shell touches inert and the scroll lock. */
function ownershipSourceViolations(read = readArtifact) {
  const violations = [];
  const shell = read("js/core/shell.js");
  for (const name of ["claimOverlay", "releaseOverlay", "isOverlayOpen", "setBackgroundInert", "setOverlayBodyState", "rememberOverlayTrigger", "restoreOverlayFocus", "trapFocus"]) {
    if (!new RegExp(`function ${name}\\(`).test(shell)) violations.push(`js/core/shell.js: ${name}() is missing`);
  }
  const bundle = fs.readdirSync(path.join(artifact, "assets-react")).map((name) => `assets-react/${name}`);
  for (const file of ["js/ajoop/assistant.js", "js/features/command-palette.js", "js/features/recruiter.js", "js/features/certificates.js", "case-study.js", "portfolio-v2.js", ...bundle]) {
    const source = read(file);
    for (const primitive of ["setBackgroundInert", "setOverlayBodyState", "overlay-modal-open"]) {
      if (file !== "portfolio-v2.js" && source.includes(primitive)) violations.push(`${file}: reaches past the owner model to ${primitive}`);
    }
    if (/\.inert\s*=\s*true/.test(source) && !["js/features/certificates.js", "case-study.js"].includes(file)) violations.push(`${file}: sets inert itself`);
  }
  for (const file of ["js/ajoop/assistant.js", "js/features/command-palette.js", "js/features/recruiter.js", "js/features/certificates.js", ...bundle]) {
    const source = read(file);
    if (!source.includes("claimOverlay") || !source.includes("releaseOverlay")) violations.push(`${file}: does not claim and release through the owner model`);
  }
  return violations;
}

/* --------------------------------------------------------------- the server */

const TYPES = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".ico": "image/x-icon", ".pdf": "application/pdf" };
/** GitHub Pages' static rules; `mutants` rewrites a served file for a control. */
const serving = { bundleDelayMs: 0, mutants: new Map() };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://local");
  const pathname = decodeURIComponent(url.pathname);
  const absolute = path.join(artifact, pathname);
  if (absolute !== artifact && !absolute.startsWith(`${artifact}${path.sep}`)) { response.writeHead(403).end(); return; }
  let file = absolute;
  let status = 200;
  const extensionless = !pathname.endsWith("/") && !path.extname(pathname) ? `${absolute}.html` : null;
  if (extensionless && fs.existsSync(extensionless)) file = extensionless;
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!pathname.endsWith("/")) { response.writeHead(301, { location: `${url.pathname}/${url.search}` }).end(); return; }
    file = path.join(file, "index.html");
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { file = path.join(artifact, "404.html"); status = 404; }
  const key = `/${path.relative(artifact, file).replaceAll("\\", "/")}`;
  const send = () => {
    response.writeHead(status, { "content-type": `${TYPES[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (serving.mutants.has(key)) response.end(serving.mutants.get(key)(fs.readFileSync(file, "utf8")));
    else fs.createReadStream(file).pipe(response);
  };
  if (serving.bundleDelayMs && pathname.startsWith("/assets-react/")) setTimeout(send, serving.bundleDelayMs);
  else send();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true });

const AI_EDGE = "https://ajoop.kaanbalci.com/";
const THIRD_PARTY_ALLOWED = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "ajoop.kaanbalci.com"]);

/** Opens a document with every diagnostic recorded from its first byte. */
async function open(route, { viewport = { width: 1280, height: 860 }, wait = "hydrated", javascript = true, reducedMotion = false } = {}) {
  const page = await browser.newPage();
  page.diagnostics = [];
  page.thirdParty = new Set();
  page.failed = [];
  page.statuses = [];
  page.on("pageerror", (error) => page.diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (!["error", "warn"].includes(message.type())) return;
    /* The AI edge is unavailable by design; only its own network message is expected. */
    if (message.text().includes(AI_EDGE) || String(message.location()?.url || "").startsWith(AI_EDGE)) return;
    page.diagnostics.push(`${message.type()}: ${message.text()}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.request().isNavigationRequest() && response.request().frame() === page.mainFrame()) page.statuses.push([new URL(url).pathname, response.status()]);
    if (url.startsWith(base) && response.status() >= 400) page.failed.push(`${response.status()} ${new URL(url).pathname}`);
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(base) || url.startsWith("data:") || url.startsWith("blob:")) { request.continue(); return; }
    page.thirdParty.add(new URL(url).hostname);
    if (url.startsWith(AI_EDGE)) request.respond({ status: 503, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" }, contentType: "application/json", body: "{}" }).catch(() => {});
    else request.respond({ status: 204, body: "" }).catch(() => {});
  });
  if (!javascript) await page.setJavaScriptEnabled(false);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument(() => {
    Math.random = () => 0;
    window.__m333 = { starts: 0, hydrated: 0, errors: [], removedUserMessages: 0, longTasks: [] };
    addEventListener("portfolio:react-main-hydration-start", () => { window.__m333.starts += 1; });
    addEventListener("portfolio:react-main-hydrated", () => { window.__m333.hydrated += 1; });
    addEventListener("portfolio:react-main-hydration-error", (event) => window.__m333.errors.push(event.detail?.message || "hydration error"));
    try {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__m333.longTasks.push(Math.round(entry.duration)); }).observe({ type: "longtask", buffered: true });
    } catch (error) {
      /* long-task timing is reported, not required */
    }
    /* Any user message leaving the transcript is recorded, whoever removes it. */
    const watch = () => {
      const list = document.querySelector("[data-chatbot-messages]");
      if (!list) { requestAnimationFrame(watch); return; }
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.removedNodes) if (node.nodeType === 1 && node.classList.contains("user")) window.__m333.removedUserMessages += 1;
      }).observe(list, { childList: true });
    };
    requestAnimationFrame(watch);
  });
  await page.setViewport(viewport);
  page.navigation = page.goto(`${base}${route}`, { waitUntil: "load", timeout: 60000 });
  if (wait === "none") return page;
  await page.navigation;
  if (wait === "hydrated") await hydrated(page);
  return page;
}
/** Every React owner has taken over and every hosted engine is mounted. A
 * legacy URL replaces its document on the way, so a context lost to that
 * navigation is waited out rather than reported. */
async function hydrated(page) {
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      await page.waitForFunction(() => window.__m333?.hydrated >= 1
        && document.querySelector('[data-react-ajoop-shell="react"]')?.__portfolioReactAjoopReady
        && document.querySelector('[data-react-command-owner="react"]')?.__portfolioReactCommandReady
        && document.querySelector("[data-react-recruiter-owner='react']")?.__portfolioReactRecruiterReady
        && (!window.KaanEngineHost || window.KaanEngineHost.ids().every((id) => window.KaanEngineHost.get(id).mounted)), { timeout: Math.max(1000, deadline - Date.now()) });
      return;
    } catch (error) {
      if (Date.now() >= deadline || !/context|navigat|detached/i.test(error.message)) throw error;
    }
  }
}
/** The classic entries own the overlays; React has not hydrated yet. */
const classicEntriesReady = (page) => page.waitForFunction(() => typeof setCommandPaletteOpen === "function" && typeof setRecruiterMode === "function" && typeof claimOverlay === "function"
  && document.querySelector('[data-react-ajoop-shell="react"]')?.__portfolioReactAjoopEntryCleanup
  && document.querySelector('[data-react-command-owner="react"]')?.__portfolioReactCommandEntryCleanup
  && document.querySelector("[data-react-recruiter-owner='react']")?.__portfolioReactRecruiterEntryCleanup, { timeout: 20000, polling: 25 });
const withBundleDelay = async (run) => { serving.bundleDelayMs = 2500; try { return await run(); } finally { serving.bundleDelayMs = 0; } };
const withMutants = async (mutants, run) => { for (const [file, mutate] of Object.entries(mutants)) serving.mutants.set(file, mutate); try { return await run(); } finally { serving.mutants.clear(); } };
const frames = (page, count = 3) => page.evaluate((total) => new Promise((resolve) => { let seen = 0; const tick = () => { seen += 1; if (seen >= total) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }), count);
const ctrlK = async (page) => { await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control"); };

/** Who owns the page right now, as the visitor and assistive technology see it. */
const overlayState = () => ({
  ajoop: document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"),
  palette: document.querySelector("[data-command-palette]").classList.contains("is-open"),
  recruiter: document.body.classList.contains("recruiter-mode-active"),
  locked: document.body.classList.contains("overlay-modal-open"),
  inert: [...document.body.children].filter((element) => element.inert).map((element) => element.id || element.tagName.toLowerCase()).sort().join(" "),
  focus: (() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "body";
    for (const hook of ["data-chatbot-input", "data-chatbot-panel", "data-chatbot-toggle", "data-chatbot-close", "data-command-input", "data-command-toggle", "data-recruiter-close", "data-recruiter-toggle", "data-modal-close", "data-cert", "data-case-modal-close", "data-case-gallery", "data-joyday-finish"]) {
      if (active.hasAttribute(hook)) return hook;
    }
    return active.tagName.toLowerCase();
  })(),
  expanded: [document.querySelector("[data-chatbot-toggle]").getAttribute("aria-expanded"), document.querySelector("header [data-command-toggle]").getAttribute("aria-expanded"), document.querySelector("header [data-recruiter-toggle]").getAttribute("aria-expanded")].join(" "),
  hidden: [document.querySelector("[data-chatbot-panel]").getAttribute("aria-hidden"), document.querySelector("[data-command-palette]").getAttribute("aria-hidden"), document.querySelector("[data-recruiter-drawer]").getAttribute("aria-hidden")].join(" "),
});
const BACKGROUND = "a button footer header main-content";
const CLOSED = { ajoop: false, palette: false, recruiter: false, locked: false, inert: "", expanded: "false false false", hidden: "true true true" };
const AJOOP_OPEN = { ajoop: true, palette: false, recruiter: false, locked: true, inert: `${BACKGROUND} react-command-root react-recruiter-root`, expanded: "true false false", hidden: "false true true" };
const PALETTE_OPEN = { ajoop: false, palette: true, recruiter: false, locked: true, inert: `${BACKGROUND} react-ajoop-root react-recruiter-root`, expanded: "false true false", hidden: "true false true" };
const RECRUITER_OPEN = { ajoop: false, palette: false, recruiter: true, locked: true, inert: `${BACKGROUND} react-ajoop-root react-command-root`, expanded: "false false true", hidden: "true true false" };
const stateOf = (page) => page.evaluate(overlayState);
/** The violations of the scenario in progress. A control reads them when a
 * state the check had already reported made a later step impossible. */
let reporting = [];
const report = () => { reporting = []; return reporting; };
/** Compares an observed overlay state to the expected one, as violations. */
const differs = (label, actual, expected) => Object.entries(expected).filter(([key, value]) => actual[key] !== value).map(([key, value]) => `${label}: ${key} is "${actual[key]}", expected "${value}"`);
const settled = async (page, ms = 140) => { await sleep(ms); await frames(page, 2); };

/* ------------------------------------------------- 2. structure without JS */

/** Runs in the page: structure and accessible names of the rendered document. */
function inspectStructure() {
  const violations = [];
  const root = document.documentElement;
  const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const describe = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 2).join(".")}` : ""}`;
  const exposed = (element) => !element.closest("[hidden]") && getComputedStyle(element).display !== "none";
  const nameOf = (element) => {
    if (element.getAttribute("aria-label")?.trim()) return element.getAttribute("aria-label");
    const labelledby = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => text(document.getElementById(id))).join(" ").trim();
    if (labelledby) return labelledby;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName)) {
      if (element.labels?.length) return text(element.labels[0]);
      if (["submit", "button", "reset"].includes(element.type)) return element.value;
      return element.getAttribute("title") || "";
    }
    return text(element) || element.querySelector("img[alt]")?.alt || element.getAttribute("title") || "";
  };
  for (const element of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])')) {
    if (exposed(element) && !nameOf(element).trim()) violations.push(`control without an accessible name: ${describe(element)}`);
  }
  for (const name of ["aria-expanded", "aria-hidden", "aria-pressed", "aria-modal", "aria-busy"]) {
    for (const element of document.querySelectorAll(`[${name}]`)) if (!["true", "false"].includes(element.getAttribute(name))) violations.push(`${name}="${element.getAttribute(name)}" on ${describe(element)}`);
  }
  for (const name of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
    for (const element of document.querySelectorAll(`[${name}]`)) {
      for (const id of element.getAttribute(name).split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) violations.push(`${name} of ${describe(element)} names no element (#${id})`);
    }
  }
  for (const element of document.querySelectorAll('[aria-hidden="true"]')) {
    if (!exposed(element) || getComputedStyle(element).visibility === "hidden") continue;
    const tabbable = [element, ...element.querySelectorAll("*")].find((node) => node.matches('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]') && node.tabIndex >= 0 && exposed(node) && !node.closest("[inert]") && getComputedStyle(node).visibility !== "hidden");
    if (tabbable) violations.push(`tabbable ${describe(tabbable)} inside aria-hidden ${describe(element)}`);
  }
  for (const dialog of document.querySelectorAll('[role="dialog"]')) if (!dialog.getAttribute("aria-label") && !dialog.getAttribute("aria-labelledby")) violations.push(`dialog without a name: ${describe(dialog)}`);
  const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(exposed).map((heading) => Number(heading.tagName[1]));
  if (levels.filter((level) => level === 1).length !== 1) violations.push(`${levels.filter((level) => level === 1).length} <h1> elements`);
  if (levels[0] !== 1) violations.push(`the first heading is <h${levels[0]}>`);
  levels.forEach((level, index) => { if (index && level - levels[index - 1] > 1) violations.push(`heading level jumps from h${levels[index - 1]} to h${level}`); });
  const main = document.querySelector("main#main-content");
  if (!main) violations.push("no <main id=\"main-content\">");
  else {
    if (text(main).length < 200) violations.push(`<main> carries only ${text(main).length} characters of server-rendered text`);
    const transparent = (element) => { for (let node = element; node && node !== main; node = node.parentElement) if (Number(getComputedStyle(node).opacity) === 0) return true; return false; };
    const unseen = [...main.querySelectorAll("h1, h2, p, li, a, button")].filter((element) => exposed(element) && text(element) && transparent(element)).length;
    if (unseen) violations.push(`${unseen} text element(s) of <main> stay invisible`);
  }
  if (document.querySelector("a.skip-link")?.getAttribute("href") !== "#main-content") violations.push("the skip link does not target #main-content");
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) violations.push(`duplicate id(s): ${duplicates.join(", ")}`);
  if (document.querySelectorAll("img:not([alt])").length) violations.push(`${document.querySelectorAll("img:not([alt])").length} <img> without alt`);
  if (!document.querySelectorAll('header nav a[href]').length) violations.push('the header navigation has no link');
  return violations;
}

async function structureWithoutJavaScript(pathname) {
  const page = await open(pathname, { viewport: { width: 320, height: 720 }, wait: "load", javascript: false, reducedMotion: true });
  const violations = [...await page.evaluate(inspectStructure), ...await page.evaluate(inspectLayout)].map((violation) => `${pathname}: ${violation}`);
  if (page.failed.length) violations.push(`${pathname}: failed request(s) ${page.failed.join(", ")}`);
  await page.close();
  return violations;
}

/* ------------------------------------------------------ 3. hydrated matrix */

const FAMILIES = ["home", "about", "works", "games", "labs", "adventure", "joydayPaint", "aiFlowPuzzle", "sinamaCaseStudy", "joydayCaseStudy", `project:${routes.find((route) => route.kind === "project").slug}`, "blog", "now", "request", "privacy", "certificates"];
const VIEWPORTS = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 860 }];
/* A document is loaded at phone width, grown to desktop and shrunk back: a
 * rotated or resized viewport is a layout state of its own. */
const RESIZE_PATH = [...VIEWPORTS, VIEWPORTS[2], VIEWPORTS[0]];
const THEMES = ["dark", "light"];

/** Runs in the page: nothing reaches past the viewport and no control is cut off.
 * <body> clips horizontal overflow on this site, so scrollWidth alone reports
 * nothing: the boxes themselves are measured. */
function inspectLayout() {
  const violations = [];
  const root = document.documentElement;
  const width = root.clientWidth;
  const describe = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 2).join(".")}` : ""}`;
  const overflow = Math.max(root.scrollWidth, document.body.scrollWidth) - width;
  if (overflow > 1) violations.push(`horizontal overflow of ${overflow}px`);
  const scrolls = (element) => /(auto|scroll)/.test(getComputedStyle(element).overflowX);
  const clips = (element) => /(hidden|clip)/.test(getComputedStyle(element).overflowX);
  const rendered = (element, box) => box.width >= 1 && box.height >= 1 && getComputedStyle(element).visibility !== "hidden" && !element.closest("[hidden], [inert], [aria-hidden='true']");
  /** How an element that leaves its frame is held: by a scroller, or cut by a clipping ancestor. */
  const held = (element, box) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (scrolls(node)) return { scrollable: true };
      const frame = node.getBoundingClientRect();
      if (clips(node) && (box.right > frame.right + 1 || box.left < frame.left - 1)) return { cut: node };
    }
    return {};
  };
  const outside = (box) => box.right > width + 1 || box.left < -1;
  const span = (box) => `${Math.round(box.left)}..${Math.round(box.right)} of ${width}`;
  for (const control of document.querySelectorAll("header a, header button, main a, main button, main input, main select, main textarea, footer a")) {
    const box = control.getBoundingClientRect();
    if (!rendered(control, box)) continue;
    /* Items an engine places and the visitor drags inside its clipped workspace. */
    if (control.closest("[data-ai-board]")) continue;
    const hold = held(control, box);
    if (hold.scrollable) continue;
    if (hold.cut) violations.push(`${describe(control)} is cut off by ${describe(hold.cut)}`);
    else if (outside(box)) violations.push(`${describe(control)} reaches outside the viewport (${span(box)})`);
  }
  for (const block of document.querySelectorAll("header.site-header, footer.site-footer, main, main > *, main section, main article, main table, main pre, main img, main canvas, main h1, main h2, main p")) {
    const box = block.getBoundingClientRect();
    if (!rendered(block, box) || !outside(box)) continue;
    const hold = held(block, box);
    if (!hold.scrollable && !hold.cut) violations.push(`${describe(block)} reaches outside the viewport (${span(box)})`);
  }
  return [...new Set(violations)];
}

/** Runs in the page: an open overlay fits the viewport and can be closed. */
function inspectOverlay(selector, closeSelector) {
  const violations = [];
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  const box = document.querySelector(selector).getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return [`${selector} is not rendered`];
  if (box.left < -1 || box.right > width + 1) violations.push(`${selector} spans ${Math.round(box.left)}..${Math.round(box.right)} of ${width}`);
  if (box.top < -1 || box.bottom > height + 1) violations.push(`${selector} spans ${Math.round(box.top)}..${Math.round(box.bottom)} of ${height} vertically`);
  if (closeSelector) {
    const close = document.querySelector(closeSelector);
    const target = close.getBoundingClientRect();
    const hit = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2);
    if (!hit || !close.contains(hit)) violations.push(`${closeSelector} cannot be reached`);
  }
  return violations;
}

async function hydratedFamily(route, measurements) {
  const violations = report();
  const fail = (message) => violations.push(`${route.pathname}: ${message}`);
  const page = await open(route.pathname, { viewport: VIEWPORTS[0] });
  await frames(page, 4);
  const health = await page.evaluate(() => {
    const sources = [...document.scripts].map((script) => script.src).filter(Boolean);
    return {
      lang: document.documentElement.lang,
      starts: window.__m333.starts,
      hydrated: window.__m333.hydrated,
      errors: window.__m333.errors,
      owners: [document.querySelectorAll("main").length, document.querySelectorAll("header.site-header").length, document.querySelectorAll("footer.site-footer").length, document.querySelectorAll("[data-portfolio-chatbot]").length, document.querySelectorAll("[data-command-palette]").length, document.querySelectorAll("[data-recruiter-drawer]").length].join(" "),
      duplicateScripts: sources.filter((source, index) => sources.indexOf(source) !== index),
      engines: window.KaanEngineHost ? window.KaanEngineHost.ids().map((id) => `${id}:${window.KaanEngineHost.get(id).mounted}`).join(" ") : "",
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.getAttribute("src")).map((image) => image.getAttribute("src")),
      greetings: document.querySelectorAll("[data-chatbot-messages] .chatbot-message").length,
      longTasks: window.__m333.longTasks,
      localeReady: document.documentElement.dataset.localeReady,
      hydrationMs: Math.round(performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd || 0),
    };
  });
  if (health.lang !== localeOf(route.locale).htmlLang) fail(`runtime language is ${health.lang}`);
  if (health.starts !== 1 || health.hydrated !== 1) fail(`hydration started ${health.starts} and completed ${health.hydrated} time(s)`);
  if (health.errors.length) fail(`hydration error: ${health.errors[0]}`);
  if (health.owners !== "1 1 1 1 1 1") fail(`shell owners are "${health.owners}", expected one of each`);
  if (health.duplicateScripts.length) fail(`script loaded twice: ${health.duplicateScripts[0]}`);
  if (health.engines.includes("false")) fail(`engine not mounted: ${health.engines}`);
  if (health.brokenImages.length) fail(`image failed to load: ${health.brokenImages[0]}`);
  if (health.greetings !== 1) fail(`the Ajoop engine wrote ${health.greetings} opening messages`);
  if (health.localeReady !== "true") fail("the locale runtime did not finish");
  if (page.diagnostics.length) fail(`console: ${page.diagnostics[0]}`);
  if (page.failed.length) fail(`failed request: ${page.failed[0]}`);
  const unexpectedHosts = [...page.thirdParty].filter((host) => !THIRD_PARTY_ALLOWED.has(host));
  if (unexpectedHosts.length) fail(`unexpected third-party request: ${unexpectedHosts.join(", ")}`);
  measurements.longTask = Math.max(measurements.longTask, ...health.longTasks, 0);
  measurements.loads += 1;

  for (const [step, viewport] of RESIZE_PATH.entries()) {
    await page.setViewport(viewport);
    const resized = step >= VIEWPORTS.length ? " after shrinking" : "";
    for (const theme of resized ? [THEMES[step % 2]] : THEMES) {
      await page.evaluate((next) => applySiteTheme(next), theme);
      await frames(page, 3);
      for (const violation of await page.evaluate(inspectLayout)) fail(`${viewport.width}px ${theme}${resized}: ${violation}`);
      measurements.layouts += 1;
    }
  }
  await page.close();
  return violations;
}

/** The three shared overlays at every viewport: they fit and they close. */
async function overlaysFit(route, measurements) {
  const violations = [];
  const page = await open(route.pathname);
  for (const [index, viewport] of VIEWPORTS.entries()) {
    await page.setViewport(viewport);
    await page.evaluate((next) => applySiteTheme(next), THEMES[index % 2]);
    for (const [name, opener, selector, close] of [
      ["Ajoop", () => page.evaluate(() => setChatbotOpen(true)), "[data-chatbot-panel]", "[data-chatbot-close]"],
      ["Recruiter", () => page.evaluate(() => setRecruiterMode(true)), "[data-recruiter-drawer]", null],
      ["Command Palette", () => page.evaluate(() => setCommandPaletteOpen(true)), ".command-box", null],
    ]) {
      await opener();
      await settled(page, 260);
      for (const violation of await page.evaluate(inspectOverlay, selector, close)) violations.push(`${route.pathname} ${viewport.width}px: ${name}: ${violation}`);
      if (name === "Recruiter") {
        /* The dialog scrolls inside itself; its close control is its first stop. */
        const reachable = await page.evaluate(() => { const close = document.querySelector("[data-recruiter-close]"); close.scrollIntoView({ block: "nearest" }); const box = close.getBoundingClientRect(); return close.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); });
        if (!reachable) violations.push(`${route.pathname} ${viewport.width}px: Recruiter: the close control cannot be reached`);
      }
      await page.keyboard.press("Escape");
      await settled(page, 80);
      violations.push(...differs(`${route.pathname} ${viewport.width}px after ${name}`, await stateOf(page), CLOSED));
      measurements.overlays += 1;
    }
  }
  if (page.diagnostics.length) violations.push(`${route.pathname}: console: ${page.diagnostics[0]}`);
  await page.close();
  return violations;
}

/** Keyboard only: skip link, visible focus, theme and language controls, reduced motion. */
async function keyboardJourney(route) {
  const violations = report();
  const fail = (message) => violations.push(`${route.pathname}: keyboard: ${message}`);
  const page = await open(route.pathname, { reducedMotion: true });
  await page.bringToFront();
  const focused = () => page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      what: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 2).join(".")}` : ""}`,
      skip: element.classList.contains("skip-link"),
      inHeader: Boolean(element.closest("header.site-header")),
      visible: box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth,
      indicated: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none",
    };
  });
  await page.keyboard.press("Tab");
  const first = await focused();
  if (!first?.skip || !first.visible) fail(`the first Tab stop is ${first?.what || "nothing"}, not a visible skip link`);
  const stops = [first];
  for (let step = 0; step < 14; step += 1) {
    await page.keyboard.press("Tab");
    stops.push(await focused());
  }
  for (const stop of stops.filter(Boolean)) {
    if (!stop.visible) fail(`${stop.what} takes focus off screen`);
    if (!stop.indicated) fail(`${stop.what} shows no focus indicator`);
  }
  if (stops.filter((stop) => stop?.inHeader).length < 8) fail("Tab does not walk the header navigation and controls");
  /* The skip link moves focus to the main landmark. */
  await page.evaluate(() => document.querySelector("a.skip-link").focus());
  await page.keyboard.press("Enter");
  await frames(page, 2);
  if (!(await page.evaluate(() => document.activeElement?.id === "main-content" && location.hash === "#main-content"))) fail("the skip link does not move focus to <main>");
  /* Theme: a named button that flips the theme and renames itself. */
  const theme = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, label: document.querySelector("[data-theme-toggle]").getAttribute("aria-label") }));
  const before = await theme();
  await page.focus("[data-theme-toggle]");
  await page.keyboard.press("Enter");
  await frames(page, 2);
  const flipped = await theme();
  if (flipped.theme === before.theme || !["light", "dark"].includes(flipped.theme)) fail(`the theme control left the theme at "${flipped.theme}"`);
  if (!flipped.label?.trim() || flipped.label === before.label) fail("the theme control does not rename itself for the next action");
  await page.keyboard.press("Enter");
  await frames(page, 2);
  if ((await theme()).theme !== before.theme) fail("the theme control does not switch back");
  /* Motion: the entrance animation is suppressed and leaves nothing hidden. */
  const motion = await page.evaluate(() => [...document.querySelectorAll("main .reveal")].filter((element) => Number(getComputedStyle(element).opacity) !== 1 || parseFloat(getComputedStyle(element).animationDuration) > 0.001).length);
  if (motion) fail(`${motion} entrance animation(s) run despite prefers-reduced-motion`);
  /* Language: a named select that moves to the same page in the chosen locale. */
  const selector = await page.evaluate(() => { const select = document.querySelector("header [data-lang-select]"); return select ? { name: select.getAttribute("aria-label"), value: select.value, options: [...select.options].map((option) => option.value) } : null; });
  if (!selector?.name?.trim()) fail("the language control has no accessible name");
  else {
    if (selector.value !== route.locale) fail(`the language control shows ${selector.value} on a ${route.locale} document`);
    if (LOCALES.some((locale) => !selector.options.includes(locale))) fail(`the language control offers ${selector.options.join(",")}`);
    const next = LOCALES[(LOCALES.indexOf(route.locale) + 1) % LOCALES.length];
    const expected = routeFor(next, route.id).pathname;
    await page.focus("header [data-lang-select]");
    await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => null), page.select("header [data-lang-select]", next)]);
    await hydrated(page);
    const landed = await page.evaluate(() => ({ pathname: location.pathname, lang: document.documentElement.lang }));
    if (landed.pathname !== expected || landed.lang !== localeOf(next).htmlLang) fail(`choosing ${next} landed on ${landed.pathname} (${landed.lang}), expected ${expected}`);
  }
  if (page.diagnostics.length) fail(`console: ${page.diagnostics[0]}`);
  await page.close();
  return violations;
}

/* ---------------------------------------------- 4. conversation ownership */

const transcriptOf = (page) => page.evaluate(() => ({
  users: [...document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user")].map((node) => node.textContent.trim()),
  bots: document.querySelectorAll("[data-chatbot-messages] .chatbot-message.bot").length,
  pending: document.querySelectorAll("[data-chatbot-messages] [data-ajoop-turn='pending']").length,
  followups: document.querySelector("[data-chatbot-quicks]").classList.contains("is-followups"),
  draft: document.querySelector("[data-chatbot-input]").value,
  open: document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"),
  removed: window.__m333.removedUserMessages,
}));
const turnSettled = (page) => page.waitForFunction(() => {
  const list = document.querySelector("[data-chatbot-messages]");
  const row = document.querySelector("[data-chatbot-quicks]");
  return !list.querySelector("[data-ajoop-turn='pending']") && row.getAttribute("aria-busy") !== "true" && (typeof getAjoopAiState !== "function" || getAjoopAiState().state !== "checking");
}, { timeout: 30000, polling: "raf" });

/** Open, ask, keep a draft — all before the React bundle has arrived. */
async function earlyConversation(pathname) {
  const violations = report();
  const fail = (message) => violations.push(`${pathname}: ${message}`);
  await withBundleDelay(async () => {
    const page = await open(pathname, { wait: "none" });
    await classicEntriesReady(page);
    if (await page.evaluate(() => window.__m333.hydrated)) fail("the early interaction did not start before hydration");
    await page.click("[data-chatbot-toggle]");
    await settled(page, 160);
    if (!(await page.evaluate(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open")))) {
      fail("one launcher click did not leave the panel open");
      await page.close();
      return;
    }
    await page.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
    await page.type("[data-chatbot-input]", "SINAMA");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"));
    await page.type("[data-chatbot-input]", "a draft");
    const early = await transcriptOf(page);
    if (early.users.length !== 1) fail(`one early submit produced ${early.users.length} user messages`);
    if (await page.evaluate(() => window.__m333.hydrated)) fail("the early turn did not run before hydration");
    await page.navigation;
    await hydrated(page);
    await turnSettled(page);
    await frames(page, 3);
    const adopted = await transcriptOf(page);
    if (adopted.removed) fail(`the transcript was reset: ${adopted.removed} user message(s) were removed`);
    if (adopted.users.join("|") !== "SINAMA") fail(`the early question did not survive (transcript users: ${JSON.stringify(adopted.users)})`);
    if (adopted.bots !== 2 || adopted.pending) fail(`the early turn did not commit one answer after the greeting (bot messages ${adopted.bots}, pending ${adopted.pending})`);
    if (!adopted.followups) fail("the early turn's follow-ups were replaced by the opening suggestions");
    if (adopted.draft !== "a draft") fail(`the unsent draft became "${adopted.draft}"`);
    if (!adopted.open) fail("the open panel closed across hydration");
    violations.push(...differs(`${pathname} adopted`, await stateOf(page), AJOOP_OPEN));
    const takeover = await page.evaluate(() => ({ entry: Boolean(document.querySelector('[data-react-ajoop-shell="react"]').__portfolioReactAjoopEntryCleanup), errors: window.__m333.errors, started: portfolioChatbotState.conversationStarted, engineOpen: portfolioChatbotState.open }));
    if (takeover.entry) fail("the classic entry listeners were not released at takeover");
    if (takeover.errors.length) fail(`hydration error: ${takeover.errors[0]}`);
    if (!takeover.started || !takeover.engineOpen) fail("the engine lost its conversation or panel state");
    /* One owner now: the draft is sent once, and a re-sync changes nothing. */
    await page.focus("[data-chatbot-input]");
    await page.keyboard.press("Enter");
    await page.waitForFunction((sent) => document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length > sent, {}, adopted.users.length);
    await turnSettled(page);
    await page.evaluate(() => updatePortfolioChatbotLanguage(getCurrentLocale()));
    await frames(page, 3);
    const after = await transcriptOf(page);
    if (after.users.join("|") !== "SINAMA|a draft") fail(`after hydration one submit must be one turn (transcript users: ${JSON.stringify(after.users)})`);
    if (after.removed) fail("a same-language re-sync reset the conversation after hydration");
    if (page.diagnostics.length) fail(`console: ${page.diagnostics[0]}`);
    await page.close();
  });
  return violations;
}

/* ------------------------------------------------- 5. overlay ownership */

/** Hydration adopts an overlay opened before it, without touching the page. */
async function adoption(pathname, name, opener, expected, restored) {
  const violations = report();
  await withBundleDelay(async () => {
    const page = await open(pathname, { wait: "none" });
    await classicEntriesReady(page);
    await opener(page);
    await settled(page, 200);
    violations.push(...differs(`${name} before hydration`, await stateOf(page), expected));
    await page.navigation;
    await hydrated(page);
    await settled(page, 200);
    violations.push(...differs(`${name} adopted by React`, await stateOf(page), expected));
    await page.keyboard.press("Escape");
    await settled(page);
    violations.push(...differs(`${name} closed after adoption`, await stateOf(page), { ...CLOSED, ...(restored ? { focus: restored } : {}) }));
    if (page.diagnostics.length) violations.push(`${name}: console: ${page.diagnostics[0]}`);
    await page.close();
  });
  return violations;
}

/** Ordered takeovers after hydration: one owner at a time, focus finds its way back. */
async function takeovers(pathname) {
  const violations = report();
  const page = await open(pathname);
  const expect = async (label, expected) => { await settled(page); violations.push(...differs(label, await stateOf(page), expected)); };
  const trapped = async (label, rootSelector) => {
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let step = 0; step < 14; step += 1) {
        if (key === "Tab") await page.keyboard.press("Tab");
        else { await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift"); }
        if (!(await page.evaluate((selector) => Boolean(document.activeElement?.closest(selector)), rootSelector))) { violations.push(`${label}: ${key} left the overlay`); return; }
      }
    }
  };
  await page.click("header [data-recruiter-toggle]");
  await page.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  await expect("Recruiter open", { ...RECRUITER_OPEN, focus: "data-recruiter-close" });
  await trapped("Recruiter", "[data-recruiter-drawer]");
  await ctrlK(page);
  await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  await expect("Recruiter -> Command Palette", { ...PALETTE_OPEN, focus: "data-command-input" });
  await trapped("Command Palette", "[data-command-palette]");
  await page.keyboard.press("Escape");
  await expect("Recruiter -> Command Palette -> Escape", { ...CLOSED, focus: "data-recruiter-toggle" });

  await page.click("[data-chatbot-toggle]");
  await page.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  await expect("Ajoop open", { ...AJOOP_OPEN, focus: "data-chatbot-input" });
  await trapped("Ajoop", "[data-portfolio-chatbot]");
  await ctrlK(page);
  await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  await expect("Ajoop -> Command Palette", { ...PALETTE_OPEN, focus: "data-command-input" });
  await ctrlK(page);
  await expect("Command Palette asked to open again", { ...PALETTE_OPEN, focus: "data-command-input" });
  await page.keyboard.press("Escape");
  await expect("Ajoop -> Command Palette -> Escape", { ...CLOSED, focus: "data-chatbot-toggle" });

  await page.click("[data-chatbot-toggle]");
  await page.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  await page.evaluate(() => setRecruiterMode(true));
  await page.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  await expect("Ajoop -> Recruiter", { ...RECRUITER_OPEN, focus: "data-recruiter-close" });
  await page.evaluate(() => setChatbotOpen(true));
  await page.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  await expect("Recruiter -> Ajoop", { ...AJOOP_OPEN, focus: "data-chatbot-input" });
  await page.click("[data-chatbot-close]");
  await expect("Ajoop closed by its close control", { ...CLOSED, focus: "data-chatbot-toggle" });

  /* Closing something that is not open releases nothing. */
  await page.click("header [data-command-toggle]");
  await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  await page.evaluate(() => { setRecruiterMode(false); setChatbotOpen(false); });
  await expect("closing the closed overlays under an open palette", { ...PALETTE_OPEN, focus: "data-command-input" });
  await page.keyboard.press("Escape");
  await expect("palette opened from the header -> Escape", { ...CLOSED, focus: "data-command-toggle" });
  if (page.diagnostics.length) violations.push(`${pathname}: console: ${page.diagnostics[0]}`);
  await page.close();
  return violations;
}

/** A page dialog under a global overlay: one Escape closes one layer. */
async function pageDialog({ pathname, name, openSelector, dialog, isOpen, shellOwned, focusInside, trigger }) {
  const violations = report();
  const page = await open(pathname);
  const dialogOpen = () => page.evaluate(isOpen);
  /* A closed page dialog keeps itself inert; that is the page at rest. */
  const rest = (await stateOf(page)).inert;
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center", behavior: "instant" }), openSelector);
  await page.click(openSelector);
  await settled(page, 200);
  if (!(await dialogOpen())) violations.push(`${name}: did not open`);
  const alone = await stateOf(page);
  if (shellOwned && (!alone.locked || alone.inert.includes("main-content") || !alone.inert.includes("header"))) violations.push(`${name}: does not own the page while open (locked ${alone.locked}, inert "${alone.inert}")`);
  await ctrlK(page);
  await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  await settled(page);
  const covered = await stateOf(page);
  violations.push(...differs(`${name} under the palette`, covered, { palette: true, locked: true, focus: "data-command-input" }));
  if (!covered.inert.includes("main-content")) violations.push(`${name}: the page behind the palette is not inert`);
  if (!(await page.evaluate((selector) => Boolean(document.querySelector(selector).closest("[inert]")), dialog))) violations.push(`${name}: stays interactive under the palette`);
  await page.keyboard.press("Tab");
  if (!(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-command-palette]"))))) violations.push(`${name}: took Tab away from the palette above it`);
  await page.keyboard.press("Escape");
  await settled(page);
  const uncovered = await stateOf(page);
  if (uncovered.palette) violations.push(`${name}: Escape did not close the palette`);
  if (!(await dialogOpen())) violations.push(`${name}: one Escape closed both the palette and the dialog`);
  if (uncovered.focus !== focusInside) violations.push(`${name}: focus returned to "${uncovered.focus}", expected "${focusInside}"`);
  if (shellOwned && (!uncovered.locked || uncovered.inert !== alone.inert)) violations.push(`${name}: did not become the foreground again (locked ${uncovered.locked}, inert "${uncovered.inert}")`);
  if (!shellOwned && (uncovered.locked || uncovered.inert !== alone.inert)) violations.push(`${name}: the palette left the page locked (inert "${uncovered.inert}")`);
  await page.keyboard.press("Escape");
  await settled(page);
  if (await dialogOpen()) violations.push(`${name}: its own Escape no longer closes it`);
  violations.push(...differs(`${name} closed`, await stateOf(page), { ...CLOSED, inert: rest, focus: trigger }));
  if (page.diagnostics.length) violations.push(`${name}: console: ${page.diagnostics[0]}`);
  await page.close();
  return violations;
}
const CERTIFICATE = { pathname: "/certificates/", name: "certificate dialog", openSelector: "[data-cert]", dialog: "[data-modal]", isOpen: () => document.querySelector("[data-modal]").classList.contains("is-open"), shellOwned: true, focusInside: "data-modal-close", trigger: "data-cert" };
const GALLERY = { pathname: "/atolye-joyday-case-study/", name: "case-study gallery", openSelector: "[data-case-gallery]", dialog: "[data-case-modal]", isOpen: () => document.querySelector("[data-case-modal]").classList.contains("is-open"), shellOwned: false, focusInside: "data-case-modal-close", trigger: "data-case-gallery" };
const JOYDAY_PREVIEW = { pathname: "/joyday-paint/", name: "Joyday preview", openSelector: "[data-joyday-finish]", dialog: "[data-joyday-modal]", isOpen: () => !document.querySelector("[data-joyday-modal]").hidden, shellOwned: false, focusInside: "data-joyday-finish", trigger: "data-joyday-finish" };

/** Touch reaches the same states as mouse and keyboard. */
async function touchOverlays(pathname) {
  const violations = report();
  const page = await open(pathname, { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  const expect = async (label, expected) => { await settled(page, 220); violations.push(...differs(`touch: ${label}`, await stateOf(page), expected)); };
  await page.tap(".nav-toggle");
  await settled(page);
  if (!(await page.evaluate(() => document.querySelector("[data-nav]").classList.contains("is-open") && document.querySelector(".nav-toggle").getAttribute("aria-expanded") === "true"))) violations.push("touch: the navigation toggle did not open the menu");
  await page.tap("[data-chatbot-toggle]");
  await expect("launcher tapped over the open menu", AJOOP_OPEN);
  if (await page.evaluate(() => document.querySelector("[data-nav]").classList.contains("is-open") || document.querySelector(".nav-toggle").getAttribute("aria-expanded") !== "false")) violations.push("touch: the menu stayed open under Ajoop");
  await page.tap("[data-chatbot-close]");
  await expect("Ajoop close tapped", { ...CLOSED, focus: "data-chatbot-toggle" });
  await page.tap("header [data-recruiter-toggle]");
  await expect("Recruiter toggle tapped", RECRUITER_OPEN);
  await page.tap("[data-recruiter-close]");
  await expect("Recruiter close tapped", { ...CLOSED, focus: "data-recruiter-toggle" });
  await page.tap("header [data-command-toggle]");
  await expect("Command toggle tapped", PALETTE_OPEN);
  await page.touchscreen.tap(6, 6);
  await expect("palette backdrop tapped", { ...CLOSED, focus: "data-command-toggle" });
  if (page.diagnostics.length) violations.push(`touch: console: ${page.diagnostics[0]}`);
  await page.close();
  return violations;
}

/* -------------------------------------------------------- 6. game input */

const ADVENTURE_CANVAS = "#career-merge-canvas";
/** Runs in the page: pixels of the Adventure board that are not background. */
function boardInk(selector) {
  const canvas = document.querySelector(selector);
  const x = Math.floor(canvas.width * 0.1);
  const y = Math.floor(canvas.height * 0.3);
  const data = canvas.getContext("2d").getImageData(x, y, Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.56)).data;
  let pixels = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index + 3] > 8 && (Math.abs(data[index] - 12) > 70 || Math.abs(data[index + 1] - 25) > 70 || Math.abs(data[index + 2] - 43) > 70)) pixels += 1;
  return pixels;
}
async function listenerCount(page) {
  const client = await page.createCDPSession();
  let total = 0;
  for (const [expression, depth] of [["window", 0], ["document", 0], ["document.querySelector('main')", -1]]) {
    const { result } = await client.send("Runtime.evaluate", { expression });
    total += (await client.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth, pierce: false })).listeners.length;
  }
  await client.detach();
  return total;
}

/** Adventure under an overlay opened before hydration, then across overlay cycles. */
async function adventureIsolation() {
  const violations = report();
  await withBundleDelay(async () => {
    const page = await open("/adventure/", { wait: "none" });
    await classicEntriesReady(page);
    await page.click("[data-chatbot-toggle]");
    await page.navigation;
    await hydrated(page);
    await settled(page, 300);
    const center = await page.evaluate((selector) => { const canvas = document.querySelector(selector); canvas.scrollIntoView({ block: "center", behavior: "instant" }); const box = canvas.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2, hit: canvas.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), inert: Boolean(canvas.closest("[inert]")) }; }, ADVENTURE_CANVAS);
    if (!center.inert) violations.push("Adventure: the game is interactive under the adopted Ajoop panel");
    if (center.hit) violations.push("Adventure: the canvas can be hit under the adopted Ajoop panel");
    await page.evaluate(() => document.querySelector("[data-chatbot-panel]").focus());
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await page.mouse.click(center.x, center.y);
    await sleep(1500);
    if (await page.evaluate(boardInk, ADVENTURE_CANVAS)) violations.push("Adventure: an open overlay leaks input into the game");
    await page.evaluate(() => setChatbotOpen(false));
    await settled(page);
    const cycle = async () => {
      for (const opener of [() => page.evaluate(() => setChatbotOpen(true)), () => page.evaluate(() => setRecruiterMode(true)), () => ctrlK(page)]) {
        await opener();
        await settled(page, 200);
        await page.keyboard.press("Escape");
        await settled(page, 120);
      }
    };
    /* The first cycle may start one-time work; the count is taken after it. */
    await cycle();
    const mounted = await listenerCount(page);
    await cycle();
    await cycle();
    const afterCycles = await listenerCount(page);
    if (afterCycles !== mounted) violations.push(`Adventure: overlay cycles changed the listener count (${mounted} -> ${afterCycles})`);
    const engine = await page.evaluate(() => ({ ids: window.KaanEngineHost.ids().join(" "), mounted: window.KaanEngineHost.get("adventure").mounted, state: document.body.classList.contains("overlay-modal-open") || [...document.body.children].some((element) => element.inert) }));
    if (engine.ids !== "adventure" || !engine.mounted) violations.push(`Adventure: engine registry is "${engine.ids}" (mounted ${engine.mounted})`);
    if (engine.state) violations.push("Adventure: the page is still locked after the overlays closed");
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector("#career-merge-game").scrollIntoView({ block: "start", behavior: "instant" }); });
    await page.keyboard.press("Space");
    await sleep(1500);
    if (!(await page.evaluate(boardInk, ADVENTURE_CANVAS))) violations.push("Adventure: input does not come back after the overlay closes");
    /* Reading the board back is this gate's doing, and so is Chrome's hint about it. */
    const diagnostics = page.diagnostics.filter((entry) => !entry.includes("willReadFrequently"));
    if (diagnostics.length) violations.push(`Adventure: console: ${diagnostics[0]}`);
    await page.close();
  });
  return violations;
}

/** Every hosted canvas is out of reach of pointer and touch under each overlay. */
async function canvasUnreachable(pathname, canvas) {
  const violations = [];
  const page = await open(pathname);
  for (const [name, opener] of [["Ajoop", () => page.evaluate(() => setChatbotOpen(true))], ["Recruiter", () => page.evaluate(() => setRecruiterMode(true))], ["Command Palette", () => page.evaluate(() => setCommandPaletteOpen(true))]]) {
    await opener();
    await settled(page, 200);
    const reach = await page.evaluate((selector) => { const target = document.querySelector(selector); target.scrollIntoView({ block: "center", behavior: "instant" }); const box = target.getBoundingClientRect(); return { hit: target.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), inert: Boolean(target.closest("[inert]")) }; }, canvas);
    if (reach.hit || !reach.inert) violations.push(`${pathname}: ${canvas} is reachable under ${name}`);
    await page.keyboard.press("Escape");
    await settled(page);
    if (await page.evaluate((selector) => Boolean(document.querySelector(selector).closest("[inert]")), canvas)) violations.push(`${pathname}: ${canvas} stays inert after ${name} closes`);
  }
  await page.close();
  return violations;
}

/* ------------------------------------------------------------ 7. routing */

async function routing() {
  const violations = [];
  const visit = async (label, pathname, { expectPath, expectSearch = "", expectHash = "", anchor = null, reload = true, documents = 1 } = {}) => {
    const page = await open(pathname);
    const check = async (phase) => {
      const location = await page.evaluate(() => ({ pathname: location.pathname, search: location.search, hash: location.hash, errors: window.__m333.errors.length, hydrated: window.__m333.hydrated }));
      if (location.pathname !== expectPath || location.search !== expectSearch || location.hash !== expectHash) violations.push(`${label} ${phase}: landed on ${location.pathname}${location.search}${location.hash}, expected ${expectPath}${expectSearch}${expectHash}`);
      if (location.hydrated !== 1 || location.errors) violations.push(`${label} ${phase}: hydrated ${location.hydrated} time(s) with ${location.errors} error(s)`);
      if (anchor) {
        await settled(page, 350);
        const top = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top ?? null, anchor);
        if (top === null || top < -4 || top > 400) violations.push(`${label} ${phase}: #${anchor} is not scrolled into view (top ${top})`);
      }
    };
    await check("direct");
    if (page.statuses.filter(([, status]) => status === 200).length !== documents) violations.push(`${label}: expected ${documents} document(s) for one visit, saw ${JSON.stringify(page.statuses)}`);
    if (reload) {
      await page.reload({ waitUntil: "load" });
      await hydrated(page);
      await check("after refresh");
    }
    if (page.diagnostics.length) violations.push(`${label}: console: ${page.diagnostics[0]}`);
    if (page.failed.length) violations.push(`${label}: failed request ${page.failed[0]}`);
    await page.close();
  };
  const slug = routes.find((route) => route.kind === "project").slug;
  await visit("canonical route", "/works/", { expectPath: "/works/" });
  await visit("locale route", "/de/about/", { expectPath: "/de/about/" });
  await visit("project slug", `/projects/${slug}/`, { expectPath: `/projects/${slug}/` });
  await visit("localized project slug", `/fr/projects/${slug}/`, { expectPath: `/fr/projects/${slug}/` });
  await visit("query and hash", "/blog/?utm_source=gate#main-content", { expectPath: "/blog/", expectSearch: "?utm_source=gate", expectHash: "#main-content" });
  /* Case studies and the catalog expose two in-page targets: the skip target and the catalog search. */
  await visit("case-study skip target", "/sinama-case-study/#main-content", { expectPath: "/sinama-case-study/", expectHash: "#main-content", anchor: "main-content" });
  await visit("localized case-study skip target", "/de/atolye-joyday-case-study/#main-content", { expectPath: "/de/atolye-joyday-case-study/", expectHash: "#main-content", anchor: "main-content" });
  await visit("catalog search anchor", "/works/#catalog-search", { expectPath: "/works/", expectHash: "#catalog-search", anchor: "catalog-search" });
  await visit("game deep link", "/adventure/#career-merge-game", { expectPath: "/adventure/", expectHash: "#career-merge-game", anchor: "career-merge-game" });
  await visit("localized game deep link", "/tr/joyday-paint/#joyday-paint-game", { expectPath: "/tr/joyday-paint/", expectHash: "#joyday-paint-game", anchor: "joyday-paint-game" });
  await visit("Labs anchor", "/labs/#algorithmic-3d-lab", { expectPath: "/labs/", expectHash: "#algorithmic-3d-lab", anchor: "algorithmic-3d-lab" });
  /* Without its slash a page route is answered by its legacy stub (Pages
   * resolves `/es/games` to `/es/games.html`); a project route has no stub
   * and is redirected by the host. Both arrive at the clean route. */
  await visit("page route without its trailing slash", "/es/games", { expectPath: "/es/games/", reload: false, documents: 2 });
  await visit("project route without its trailing slash", `/de/projects/${slug}`, { expectPath: `/de/projects/${slug}/`, reload: false });
  await visit("legacy .html URL", "/works.html?ref=old#main-content", { expectPath: "/works/", expectSearch: "?ref=old", expectHash: "#main-content", reload: false, documents: 2 });
  await visit("localized legacy .html URL", "/tr/about.html", { expectPath: "/tr/about/", reload: false, documents: 2 });
  await visit("legacy project query URL", `/project-detail.html?project=${slug}`, { expectPath: `/projects/${slug}/`, reload: false, documents: 2 });

  /* Role deep link: the dialog opens once, on the React owner, and the role stays in the URL. */
  const role = await open("/?role=applied-ai");
  await role.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"), { timeout: 10000 });
  violations.push(...differs("role deep link", await stateOf(role), { ...RECRUITER_OPEN, focus: "data-recruiter-close" }));
  if ((await role.evaluate(() => location.search)) !== "?role=applied-ai") violations.push("role deep link: the role left the URL");
  await role.keyboard.press("Escape");
  await settled(role);
  violations.push(...differs("role deep link closed", await stateOf(role), { ...CLOSED, focus: "data-recruiter-toggle" }));
  await role.close();

  /* An unknown URL is the recovery page, served as 404 and never indexed. */
  for (const pathname of ["/no-such-page/", "/de/no-such-page/", "/projects/no-such-project/"]) {
    const page = await browser.newPage();
    const response = await page.goto(`${base}${pathname}`, { waitUntil: "load" });
    const body = await page.evaluate(() => ({ page: document.body.dataset.page, robots: document.querySelector('meta[name="robots"]')?.content, react: document.querySelectorAll("[data-react-main]").length, home: Boolean(document.querySelector('main a[href="/"], main a[href$="/"]')), heading: document.querySelectorAll("h1").length }));
    if (response.status() !== 404) violations.push(`${pathname}: answered ${response.status()}, expected 404`);
    if (body.page !== "error" || body.react !== 0) violations.push(`${pathname}: is not the recovery page (page "${body.page}", React mains ${body.react})`);
    if (!/noindex/.test(body.robots || "")) violations.push(`${pathname}: the recovery page is indexable`);
    if (!body.home || body.heading !== 1) violations.push(`${pathname}: the recovery page offers no way back`);
    await page.close();
  }
  return violations;
}

/* -------------------------------------------------------------- the run */

/** The accepted pre-#33 bytes of a served runtime file: the defect itself. */
const preHardening = (file) => (source) => finalHardeningAcceptedBase(file.slice(1), source);

/** Runs a check against a mutant: an aborted check is reported, not thrown. */
const against = async (mutants, run) => {
  try {
    return await withMutants(mutants, run);
  } catch (error) {
    serving.bundleDelayMs = 0;
    return [...reporting, `the check could not finish: ${error.message.split("\n")[0]}`];
  }
};

const pool = async (items, size, run) => {
  const queue = [...items];
  const results = [];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) results.push(...await run(item));
  }));
  return results;
};

try {
  /* ---------- 1. document contract: every canonical document ---------- */
  if (section(1)) {
    const expectedDocuments = (site.pages.filter((page) => page.renderer === "react").length
      + (site.projects.renderer === "react" ? Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/project-details.json"), "utf8"))).length : 0))
      * registry.locales.filter((locale) => locale.active).length;
    equal(routes.length, expectedDocuments, "the canonical set is exactly what the route, project and locale registries define");
    equal(new Set(routes.map((route) => route.pathname)).size, routes.length, "canonical pathnames are unique");
    equal(LOCALES.length, 5, "five locales are generated");
    equal(surfaceViolations(), [], "every canonical document meets the document contract");
    const stubs = legacyStubViolations();
    equal(stubs.violations, [], "every legacy URL forwards to its clean route");
    ok(/^User-agent: \*\r?\nAllow: \/\r?\nSitemap: https:\/\/kaanbalci\.com\/sitemap\.xml\s*$/.test(readArtifact("robots.txt")), "robots.txt allows the site and names the sitemap");
    ok(/<meta name="robots" content="noindex, follow"/.test(readArtifact("404.html")) && !readArtifact("404.html").includes("data-react-main"), "the recovery page is not indexed and is not a React document");
    equal(ownershipSourceViolations(), [], "overlay owners go through the one owner model");

    const sample = routeFor("de", "works");
    const sampleHtml = readArtifact(sample.output);
    const mutated = (from, to) => { assert.ok(sampleHtml.includes(from), `control anchor is missing: ${from}`); return documentViolations(sampleHtml.replace(from, to), sample); };
    rejects("missing emitted canonical route", surfaceViolations({ list: [...routes, { ...sample, output: "de/not-emitted/index.html", pathname: "/de/not-emitted/" }] }), /not-emitted\/index\.html: canonical document is not emitted/);
    rejects("route dropped from the artifact", surfaceViolations({ exists: (file) => file !== sample.output && inArtifact(file) }), /de\/works\/index\.html: canonical document is not emitted/);
    rejects("canonical points at another route", mutated(`<link rel="canonical" href="${origin}/de/works/"/>`, `<link rel="canonical" href="${origin}/works/"/>`), /canonical .* is not/);
    rejects("hreflang maps a locale to the wrong document", mutated(`hreflang="fr" href="${origin}/fr/works/"`, `hreflang="fr" href="${origin}/es/works/"`), /hreflang set/);
    rejects("x-default is missing", mutated(`<link rel="alternate" hreflang="x-default" href="${origin}/works/"/>`, ""), /hreflang set/);
    rejects("document language differs from its route", mutated('<html lang="de"', '<html lang="en"'), /<html lang> is en/);
    rejects("og:url disagrees with the canonical URL", mutated(`<meta property="og:url" content="${origin}/de/works/"/>`, `<meta property="og:url" content="${origin}/works/"/>`), /og:url .* is not the canonical URL/);
    rejects("page-relative asset", mutated('href="/style.css"', 'href="style.css"'), /page-relative reference/);
    rejects("client entry declared twice", mutated("</body>", `<script type="module" src="/assets-react/second.js"></script></body>`), /React client entry/);
    const homeHtml = readArtifact("index.html");
    rejects("JSON-LD that does not parse", documentViolations(homeHtml.replace('<script type="application/ld+json">{', '<script type="application/ld+json">{,'), routeFor("en", "home")), /JSON-LD does not parse/);
    rejects("sitemap lost a canonical URL", surfaceViolations({ sitemap: readArtifact("sitemap.xml").replace(`<loc>${origin}/de/works/</loc>`, "") }), /sitemap: .*\/de\/works\/ is missing/);
    rejects("overlay owner reaches past the model", ownershipSourceViolations((file) => (file === "js/features/recruiter.js" ? finalHardeningAcceptedBase(file, readArtifact(file)) : readArtifact(file))), /js\/features\/recruiter\.js: reaches past the owner model/);
    console.log(`[G-73 documents] ${routes.length} canonical documents x document contract · ${stubs.stubs} legacy stubs · sitemap ${routes.length} URLs · owner-model source rules`);
    /* Reported, not required: these properties came with each family's accepted
     * document, and #33 adds no metadata. Present ones are verified above. */
    const carried = (test) => routes.filter((route) => test(readArtifact(route.output))).length;
    const coverage = [...["og:url", "og:locale", "og:type", "og:site_name"].map((property) => [property, (html) => html.includes(`<meta property="${property}"`)]), ...["twitter:card", "twitter:title", "twitter:image"].map((name) => [name, (html) => html.includes(`<meta name="${name}"`)]), ["JSON-LD", (html) => html.includes("application/ld+json")]];
    console.log(`  optional head metadata carried (of ${routes.length}): ${coverage.map(([name, test]) => `${name} ${carried(test)}`).join(" · ")}`);
  }

  /* ---------- 2. structure without JavaScript: every canonical document ---------- */
  if (section(2)) {
    equal(await pool(routes, 6, (route) => structureWithoutJavaScript(route.pathname)), [], "every canonical document is structurally sound at 320px without JavaScript");
    const structureMutant = async (name, pathname, mutate, pattern) => rejects(name, await against({ [`${pathname}index.html`]: mutate }, () => structureWithoutJavaScript(pathname)), pattern);
    const intoMain = (markup) => (html) => html.replace(/(<main\b[^>]*>)/, `$1${markup}`);
    await structureMutant("unnamed interactive control", "/about/", intoMain('<button type="button"><i class="bx bx-x" aria-hidden="true"></i></button>'), /control without an accessible name: button/);
    await structureMutant("link with no name", "/tr/works/", intoMain('<a href="/tr/"><img src="/assets/kaan-balci-logo-128.webp" alt="" width="16" height="16"/></a>'), /control without an accessible name: a/);
    await structureMutant("broken aria-expanded state", "/about/", (html) => html.replace('aria-controls="site-navigation" aria-expanded="false"', 'aria-controls="site-navigation" aria-expanded="closed"'), /aria-expanded="closed"/);
    await structureMutant("aria-controls names nothing", "/about/", (html) => html.replace('aria-controls="site-navigation"', 'aria-controls="site-menu"'), /aria-controls of .* names no element/);
    await structureMutant("unnamed dialog", "/about/", (html) => html.replace(' aria-labelledby="recruiter-dialog-title"', ""), /dialog without a name/);
    await structureMutant("content wider than the viewport", "/de/blog/", intoMain('<div style="width:640px;height:4px"></div>'), /reaches outside the viewport/);
    await structureMutant("skipped heading level", "/about/", intoMain("<h1>Extra</h1><h4>Deep</h4>"), /<h1> elements|heading level jumps/);
    await structureMutant("server-rendered content removed", "/now/", (html) => html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, "$1<h1>Now</h1>$2"), /carries only \d+ characters/);
    /* A full-row action button wraps a label that is longer than its row. The
     * label is lengthened here until no font holds it on one line, so the check
     * does not depend on the fonts of the machine it runs on. */
    const FULL_ROW = ":is(.case-actions, .cta-actions, .contact-actions, .request-form-actions) .btn";
    const longLabels = (css) => `${css}\n${FULL_ROW}::after{content:" and a label that no row of a narrow viewport can hold on one line"}`;
    for (const route of [routeFor("es", "sinamaCaseStudy"), routeFor("de", "request")]) {
      equal(await against({ "/portfolio-v2.css": longLabels }, () => structureWithoutJavaScript(route.pathname)), [], `${route.pathname}: a full-row button wraps a label longer than its row`);
    }
    rejects("pre-hotfix stylesheet: a full-row button label overflows the viewport", await against({ "/portfolio-v2.css": (css) => longLabels(finalHardeningAcceptedBase("portfolio-v2.css", css)) }, () => structureWithoutJavaScript(routeFor("es", "sinamaCaseStudy").pathname)), /horizontal overflow/);
    console.log(`[G-73 no-JS] ${routes.length} canonical documents at 320px without JavaScript: SSR content, overflow, accessible names, ARIA references, headings, landmarks`);
  }

  /* ---------- 3. hydrated matrix: families x locales x viewports x themes ---------- */
  if (section(3)) {
    const measurements = { loads: 0, layouts: 0, overlays: 0, longTask: 0 };
    const matrix = LOCALES.flatMap((locale) => FAMILIES.map((id) => routeFor(locale, id)));
    equal(matrix.filter(Boolean).length, FAMILIES.length * LOCALES.length, "every representative family exists in every locale");
    equal(await pool(matrix, 4, (route) => hydratedFamily(route, measurements)), [], "representative families hydrate cleanly and fit every viewport in both themes");
    equal(await pool(LOCALES.map((locale, index) => routeFor(locale, ["home", "adventure", "sinamaCaseStudy", "request", "works"][index])), 3, (route) => overlaysFit(route, measurements)), [], "Ajoop, Recruiter Mode and the Command Palette fit every viewport and close cleanly");
    const layoutMutant = await against({ "/portfolio-v2.css": (css) => `${css}\n.site-header .header-actions{min-width:520px}` }, () => hydratedFamily(routeFor("en", "about"), { loads: 0, layouts: 0, overlays: 0, longTask: 0 }));
    rejects("header controls wider than a phone", layoutMutant, /320px .*(overflow|outside the viewport|cut off|header is)/);
    const resizeMutant = await against({ "/adventure-game.js": (source) => finalHardeningAcceptedBase("adventure-game.js", source) }, () => hydratedFamily(routeFor("en", "adventure"), { loads: 0, layouts: 0, overlays: 0, longTask: 0 }));
    rejects("pre-#33 Adventure: the board keeps its desktop width on a narrower viewport", resizeMutant, /320px \w+ after shrinking: .*(overflow|outside the viewport)/);
    const consoleMutant = await against({ "/js/features/creative.js": (source) => `${source}\nconsole.error("unexpected runtime error");` }, () => hydratedFamily(routeFor("en", "about"), { loads: 0, layouts: 0, overlays: 0, longTask: 0 }));
    rejects("unexpected console error", consoleMutant, /console: error: unexpected runtime error/);
    /* Every family once, and one family in each other locale: a page-level key
     * handler that takes Enter from a focused control breaks the whole page. */
    const journeys = [...FAMILIES.map((id) => routeFor(registry.defaultLocale, id)), ...LOCALES.slice(1).map((locale, index) => routeFor(locale, ["works", "request", "adventure", "certificates"][index]))];
    /* One at a time: only the fronted page reliably paints focus. */
    equal(await pool(journeys, 1, (route) => keyboardJourney(route)), [], "every family is usable from the keyboard alone");
    rejects("pre-#33 Adventure: the game takes Enter from the focused control", await against({ "/adventure-game.js": (source) => finalHardeningAcceptedBase("adventure-game.js", source) }, () => keyboardJourney(routeFor("en", "adventure"))), /skip link does not move focus|theme control left the theme/);
    rejects("focus indicator removed", await against({ "/css/a11y.css": (css) => `${css}\n*:focus-visible{outline:none !important;box-shadow:none !important}` }, () => keyboardJourney(journeys[0])), /shows no focus indicator/);
    rejects("theme control that does not rename itself", await against({ "/js/core/theme.js": (source) => source.replace(/setAttribute\("aria-label"/g, 'setAttribute("data-unused"') }, () => keyboardJourney(journeys[0])), /does not rename itself/);
    const bundles = fs.readdirSync(path.join(artifact, "assets-react"));
    equal(bundles.length, 1, "the React client is one bundle with no per-route chunk");
    const bundle = fs.readFileSync(path.join(artifact, "assets-react", bundles[0]));
    console.log(`[G-73 hydrated] ${measurements.loads} documents (${FAMILIES.length} families x ${LOCALES.length} locales) · ${measurements.layouts} layout states (fresh ${VIEWPORTS.map((viewport) => viewport.width).join("/")}px x ${THEMES.join("/")}, then shrunk back to 768 and 320) · ${measurements.overlays} overlay fits · ${journeys.length} keyboard-only journeys (skip link, focus indicator, theme, language, reduced motion) · longest task ${measurements.longTask} ms · client ${bundle.byteLength} B raw / ${gzipSync(bundle).byteLength} B gzip (reported, not budgeted here)`);
  }

  /* ---------- 4. conversation ownership ---------- */
  if (section(4)) {
    for (const pathname of ["/", "/tr/games/", "/de/request/", "/es/adventure/", "/fr/sinama-case-study/"]) {
      equal(await earlyConversation(pathname), [], `${pathname}: a conversation begun before hydration survives it`);
  }
  /* The conversation is still the site language's: a real change starts over. */
  const switched = await open("/");
  await switched.click("[data-chatbot-toggle]");
  await switched.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  await switched.type("[data-chatbot-input]", "SINAMA");
  await switched.keyboard.press("Enter");
  await switched.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"));
  await turnSettled(switched);
  await switched.evaluate(() => setCurrentLocale(getNextActiveLocale(), { persist: false, source: "gate" }));
  await switched.waitForFunction(() => document.documentElement.lang !== "en");
  await frames(switched, 3);
  equal(await switched.evaluate(() => [document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length, document.querySelectorAll("[data-chatbot-messages] .chatbot-message.bot").length, portfolioChatbotState.conversationStarted, document.querySelector("[data-chatbot-quicks]").classList.contains("is-followups")]), [0, 1, false, false], "a site-language change still starts the conversation over");
  await switched.close();
  rejects("pre-#33 engine: a re-sync at DOMContentLoaded resets the transcript", await against({ "/js/ajoop/assistant.js": preHardening("/js/ajoop/assistant.js") }, () => earlyConversation("/")), /the transcript was reset|did not survive/);
  rejects("content re-sync that always restarts the conversation", await against({ "/js/ajoop/assistant.js": (source) => source.replace("    portfolioChatbotState.conversationStarted &&\n", "    false &&\n").replace("    portfolioChatbotState.conversationStarted &&\r\n", "    false &&\r\n") }, () => earlyConversation("/tr/games/")), /the transcript was reset|did not survive/);
  rejects("engine initialized twice", await against({ "/js/ajoop/assistant.js": (source) => source.replace(/\nsetupPortfolioChatbot\(\);/, "\nsetupPortfolioChatbot();\nportfolioChatbotState.initialized = false;\nsetupPortfolioChatbot();") }, () => earlyConversation("/")), /one launcher click did not leave the panel open|one early submit produced 2 user messages|must be one turn/);
  console.log("[G-73 conversation] 5 routes, one per locale: early open -> ask -> draft -> DOMContentLoaded -> hydration keeps the question, its answer, its follow-ups and the draft; one owner afterwards; a site-language change still starts over");

  }

  /* ---------- 5. overlay ownership ---------- */
  if (section(5)) {
    equal(await adoption("/about/", "Ajoop", (page) => page.click("[data-chatbot-toggle]"), AJOOP_OPEN, "data-chatbot-toggle"), [], "Ajoop opened before hydration is adopted with the page still its own");
    equal(await adoption("/tr/works/", "Command Palette", (page) => page.click("header [data-command-toggle]"), PALETTE_OPEN, "data-command-toggle"), [], "the Command Palette opened before hydration is adopted with the page still its own");
    equal(await adoption("/de/", "Recruiter Mode", (page) => page.click("header [data-recruiter-toggle]"), RECRUITER_OPEN, "data-recruiter-toggle"), [], "Recruiter Mode opened before hydration is adopted with the page still its own");
    equal(await takeovers("/about/"), [], "ordered takeovers keep one owner and return focus to the control that started them");
    equal(await takeovers("/fr/games/"), [], "ordered takeovers hold on a localized route");
    for (const dialog of [CERTIFICATE, GALLERY, JOYDAY_PREVIEW]) equal(await pageDialog(dialog), [], `${dialog.name}: one Escape closes one layer`);
    equal(await touchOverlays("/"), [], "touch reaches the same overlay states as mouse and keyboard");
    rejects("release that leaves the page inert", await against({ "/js/core/shell.js": (source) => source.replace(/(openOverlayRoots\.splice\(at, 1\);\r?\n)  syncOverlayOwnership\(\);(\r?\n  return true;)/, "$1$2") }, () => takeovers("/about/")), /inert is "(?!")|locked is "true"/);
    rejects("focus is not restored to the trigger", await against({ "/js/core/shell.js": (source) => source.replace("  if (trigger?.isConnected) trigger.focus();", "") }, () => takeovers("/about/")), /focus is "body"/);
    rejects("takeover forgets where the replaced overlay was opened from", await against({ "/js/core/shell.js": (source) => source.replace("    if (!from) break;", "    break;") }, () => takeovers("/about/")), /Escape: focus is "body", expected "data-(recruiter|chatbot)-toggle"/);
    rejects("pre-#33 dialog: one Escape closes two layers", await against({ "/js/features/certificates.js": preHardening("/js/features/certificates.js") }, () => pageDialog(CERTIFICATE)), /one Escape closed both|did not become the foreground again/);
    rejects("pre-#33 gallery: one Escape closes two layers", await against({ "/case-study.js": preHardening("/case-study.js") }, () => pageDialog(GALLERY)), /one Escape closed both|took Tab away/);
    rejects("claim that does not make the page inert", await against({ "/js/core/shell.js": (source) => source.replace("  setBackgroundInert(foreground);\n", "").replace("  setBackgroundInert(foreground);\r\n", "") }, () => adoption("/about/", "Ajoop", (page) => page.click("[data-chatbot-toggle]"), AJOOP_OPEN, "data-chatbot-toggle")), /inert is ""/);
    console.log("[G-73 overlays] pre-hydration adoption x 3 overlays · ordered takeovers (Recruiter/Ajoop/Command Palette, re-open, close-while-closed) with focus trap, Escape and trigger restore · 3 page dialogs under a global overlay · touch parity");
  }

  /* ---------- 6. game input isolation ---------- */
  if (section(6)) {
    equal(await adventureIsolation(), [], "Adventure takes no input under an overlay and all of it afterwards, with one engine and no extra listener");
    for (const [pathname, canvas] of [["/adventure/", ADVENTURE_CANVAS], ["/tr/joyday-paint/", "#joyday-art-canvas"], ["/de/ai-flow-puzzle/", "[data-ai-board]"], ["/labs/", "#math-3d-canvas"]]) {
      equal(await canvasUnreachable(pathname, canvas), [], `${pathname}: the interactive surface is out of reach under every overlay`);
  }
  rejects("pre-#33 Joyday: Escape for the overlay also reaches the game", await against({ "/joyday-paint.js": preHardening("/joyday-paint.js") }, () => pageDialog(JOYDAY_PREVIEW)), /one Escape closed both/);
  rejects("game accepts keys while an overlay is open", await against({ "/adventure-game.js": (source) => source.replace('    if (canvas.closest("[inert]")) return;', "") }, () => adventureIsolation()), /an open overlay leaks input into the game/);
  console.log("[G-73 game input] Adventure keyboard + pointer under an adopted overlay, listener count and engine registry stable across 6 overlay cycles, input back afterwards · 4 engine surfaces unreachable under each overlay · Joyday preview keeps its own Escape");

  }

  /* ---------- 7. routing ---------- */
  if (section(7)) {
    equal(await routing(), [], "direct loads, refreshes, anchors, legacy URLs and unknown URLs resolve as designed");
    console.log("[G-73 routing] canonical, locale and project routes direct + refresh · query/hash kept · case-study, catalog, game and Labs anchors · trailing slash · legacy .html and ?project= URLs · role deep link · unknown URLs answer the recovery page with 404");
  }

  assert.equal(selected, null, `partial run (sections ${[...(selected || [])].join(",")}): not a pass`);
  console.log(`Master 3 #33 final hardening passed${requestedRoot ? " against emitted dist-site" : ""}. ${tally.assertions} assertions · ${routes.length} canonical documents · ${LOCALES.length} locales · ${tally.controls} negative controls rejected · AI edge stubbed, no network.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
