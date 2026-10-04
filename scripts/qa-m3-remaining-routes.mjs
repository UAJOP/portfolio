#!/usr/bin/env node
/**
 * G-72 — Master 3 #30.5 remaining public routes gate: Now, Experience (blog),
 * Certificates, Request and Privacy in every active locale.
 *
 * Static: registry ownership, the 25 emitted documents, SSR content and head
 * metadata against the accepted documents, the request-form contract, script
 * order, compatibility redirects, sitemap and the shared bundle budget.
 * Browser: hydration purity, final-DOM and layout parity against the accepted
 * runtime, JS-disabled content, the certificate preview dialog, and the
 * request form driven through a mock transport on the accepted and the React
 * document alike. No request ever leaves the machine.
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
import { buildProductionSite } from "./build-production-site.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { generateRemainingRoutesStructure } from "./generate-m3-remaining-routes-structure.mjs";

/* The approved #30.5 scope, stated here independently of the route registry. */
const PAGES = Object.freeze({
  now: { pageType: "now", lead: [], nav: null },
  blog: { pageType: "blog", lead: [], nav: "blog" },
  certificates: { pageType: "certificates", lead: [], nav: "certificates" },
  request: { pageType: "request", lead: ["/request-config.js"], nav: "request" },
  privacy: { pageType: "legal", lead: [], nav: null },
});
/* React-owned before this phase (#25-B to #30). */
const PRIOR_REACT_PAGE_IDS = ["home", "about", "works", "games", "sinamaCaseStudy", "mergeRushCaseStudy", "joydayCaseStudy", "hospitalCaseStudy", "aiFlowPuzzleCaseStudy", "labs", "adventure", "joydayPaint", "aiFlowPuzzle"];
const CONTROLLER_MARKERS = ["data-request-form", "KAAN_REQUEST_FORM_ENDPOINT", "submitRequestPayload", "data-cert-title", "privacy-policy"];
const RAW_BUDGET = 260000;
const GZIP_BUDGET = 72000;
const STRUCTURE_FILE = path.join(ROOT, "data/site/m3-30-5-remaining-routes-structure.json");

const registry = loadRegistry();
const site = loadSiteRoutes();
const LOCALES = [registry.defaultLocale, ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale)];
const buildLog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/build-log.json"), "utf8"));
const projectSlugs = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/project-details.json"), "utf8")));
const requestConfig = fs.readFileSync(path.join(ROOT, "request-config.js"), "utf8");
const REQUEST_ENDPOINT = requestConfig.match(/KAAN_REQUEST_FORM_ENDPOINT = "([^"]+)"/)[1];
const GOOGLE_FORM_URL = requestConfig.match(/KAAN_GOOGLE_FORM_URL = "([^"]+)"/)[1];
const routes = canonicalReactRoutes();
const targetRoutes = routes.filter((route) => route.kind === "page" && Object.hasOwn(PAGES, route.routeId));
const requestedRoot = process.argv.includes("--root") ? path.resolve(process.argv[process.argv.indexOf("--root") + 1]) : null;
const staticOnly = process.argv.includes("--static");
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-30-5-"));
const root = requestedRoot || path.join(temporary, "site");
const prefixOf = (route) => (route.locale === registry.defaultLocale ? "" : `${route.locale}/`);
const acceptedOf = (route) => fs.readFileSync(path.join(ROOT, `${prefixOf(route)}${route.route}index.html`), "utf8");
const emittedOf = (route) => fs.readFileSync(path.join(root, route.output), "utf8");

/* ------------------------------------------------------------------ static */

const normalize = (value) => decodeHtml(String(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const inlineCopy = (value) => decodeHtml(String(value).replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).replace(/[ \t\n\r\f]+/g, " ").trim();
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
const attrOf = (tag, name) => tag?.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? null;
const meta = (html, pattern, attribute = "content") => { const tag = html.match(pattern)?.[0]; return tag ? decodeHtml(attrOf(tag, attribute) || "") : null; };
const count = (html, pattern) => (html.match(pattern) || []).length;
const titleOf = (html) => decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
const BUILD_LOG = /(<div class="build-log-list reveal" data-build-log(?:="")?>)([\s\S]*?)(<\/div><\/section>)/;
const TRAINING = /(<span\b[^>]*data-training-type[^>]*>)([^<]*)(<\/span>)/;
/* The two places React server-renders what the accepted runtime wrote
 * client-side; each has its own check below. */
const withoutRuntimeCopy = (html) => mainOf(html).replace(BUILD_LOG, "$1$3").replace(TRAINING, "$1$3");

function validateCoverage(records, allRoutes = routes, registryPages = site.pages) {
  assert.deepEqual([...new Set(records.map((route) => route.routeId))].sort(), Object.keys(PAGES).sort(), "the five approved remaining pages");
  assert.equal(records.length, Object.keys(PAGES).length * LOCALES.length, "five pages across every active locale");
  assert.equal(new Set(records.map((route) => route.output)).size, records.length, "unique documents");
  for (const route of records) {
    assert.equal(route.renderer, "react", `${route.pathname}: React-owned`);
    assert.equal(route.output, `${prefixOf(route)}${route.route}index.html`, `${route.pathname}: locale document path`);
    assert.equal(route.pathname, `/${prefixOf(route)}${route.route}`, `${route.pathname}: locale route`);
  }
  assert.deepEqual(registryPages.filter((page) => page.renderer === "react").map((page) => page.id).sort(), [...PRIOR_REACT_PAGE_IDS, ...Object.keys(PAGES)].sort(), "exactly the five approved page ids switch to React");
  const canonical = allRoutes.filter((route) => route.kind !== "companion");
  assert.equal(canonical.length, (registryPages.length + projectSlugs.length) * LOCALES.length, "canonical route count derives from the page, project and locale registries");
  assert.deepEqual(canonical.filter((route) => route.renderer !== "react").map((route) => route.output), [], "every canonical public and project route is React-owned");
  for (const route of allRoutes.filter((item) => item.kind === "companion")) assert.equal(route.renderer, "legacy", `${route.output}: companion documents stay legacy (#31)`);
  return canonical.length;
}

function validateDocument(route, html, accepted) {
  const page = PAGES[route.routeId];
  assert.ok(html.startsWith("<!DOCTYPE html>"), `${route.pathname}: document doctype`);
  assert.equal(count(html, /<main\b[^>]*data-react-main=""[^>]*data-prerendered="true"/g), 1, `${route.pathname}: one SSR React main`);
  assert.ok(mainOf(html).length > 1000, `${route.pathname}: meaningful static main`);
  assert.equal(count(mainOf(html), /<h1\b/gi), 1, `${route.pathname}: one h1`);
  for (const [name, pattern] of [["header", /<header class="site-header"/g], ["navigation", /<nav class="nav-links"/g], ["footer", /<footer class="site-footer"/g], ["main payload", /<script id="react-main-props"/g]]) {
    assert.equal(count(html, pattern), 1, `${route.pathname}: exactly one ${name}`);
  }
  assert.match(html, new RegExp(`<html lang="${attrOf(accepted.match(/<html\b[^>]*>/i)[0], "lang")}"[^>]*data-route-locale="${route.locale}"`), `${route.pathname}: document locale`);
  assert.equal(meta(html, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"), `${site.origin}${route.pathname}`, `${route.pathname}: canonical`);
  const alternates = (source) => [...source.matchAll(/<link\b[^>]*rel="alternate"[^>]*>/gi)].map(([tag]) => `${attrOf(tag, "hreflang")} ${attrOf(tag, "href")}`).sort();
  assert.deepEqual(alternates(html), alternates(accepted), `${route.pathname}: accepted hreflang set`);
  assert.equal(alternates(html).length, LOCALES.length + 1, `${route.pathname}: every locale plus x-default`);
  const body = html.match(/<body\b[^>]*>/i)?.[0] || "";
  assert.equal(attrOf(body, "data-page"), page.pageType, `${route.pathname}: page type keeps the runtime module scope`);
  assert.equal(attrOf(body, "data-page"), attrOf(accepted.match(/<body\b[^>]*>/i)[0], "data-page"), `${route.pathname}: accepted page type`);
  for (const tag of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) assert.match(tag[0], /rel="[^"]*noopener/, `${route.pathname}: external target safety`);
  assert.equal(count(mainOf(html), /\son[a-z]+="/g), 0, `${route.pathname}: no inline handlers`);
  const current = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0].match(/<a\b[^>]*aria-current="page"[^>]*>/g) || [];
  assert.equal(current.length, page.nav ? 1 : 0, `${route.pathname}: current navigation item`);
  if (page.nav) assert.equal(attrOf(current[0], "href"), `/${prefixOf(route)}${page.nav}/`, `${route.pathname}: navigation marks this page`);
}

function validateScripts(route, html) {
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const entry = sources.filter((src) => src.startsWith("/assets-react/"));
  assert.equal(entry.length, 1, `${route.pathname}: one React client entry`);
  assert.deepEqual(sources, ["/js/core/locale-bootstrap.js", ...PAGES[route.routeId].lead, "/portfolio-data.js", "/script.js", "/portfolio-v2.js", entry[0]], `${route.pathname}: accepted script order with no page controller in the document`);
}

function validateMetadata(route, html, accepted) {
  assert.equal(titleOf(html), titleOf(accepted), `${route.pathname}: accepted title`);
  for (const [name, pattern] of [
    ["description", /<meta\b[^>]*name="description"[^>]*>/i],
    ["robots", /<meta\b[^>]*name="robots"[^>]*>/i],
    ["og:site_name", /<meta\b[^>]*property="og:site_name"[^>]*>/i],
    ["og:locale", /<meta\b[^>]*property="og:locale"[^>]*>/i],
    ["og:title", /<meta\b[^>]*property="og:title"[^>]*>/i],
    ["og:description", /<meta\b[^>]*property="og:description"[^>]*>/i],
    ["og:type", /<meta\b[^>]*property="og:type"[^>]*>/i],
    ["og:url", /<meta\b[^>]*property="og:url"[^>]*>/i],
    ["og:image", /<meta\b[^>]*property="og:image"[^>]*>/i],
    ["og:image:alt", /<meta\b[^>]*property="og:image:alt"[^>]*>/i],
    ["twitter:card", /<meta\b[^>]*name="twitter:card"[^>]*>/i],
    ["twitter:title", /<meta\b[^>]*name="twitter:title"[^>]*>/i],
    ["twitter:description", /<meta\b[^>]*name="twitter:description"[^>]*>/i],
    ["twitter:image", /<meta\b[^>]*name="twitter:image"[^>]*>/i],
  ]) {
    const expected = meta(accepted, pattern);
    if (expected !== null) assert.equal(meta(html, pattern), expected, `${route.pathname}: accepted ${name}`);
    else if (["og:title", "og:description", "og:image"].includes(name)) assert.ok(meta(html, pattern), `${route.pathname}: ${name} is never emitted empty`);
  }
}

function validateCopy(route, html, accepted) {
  const reactMain = withoutRuntimeCopy(html);
  const acceptedMain = withoutRuntimeCopy(accepted);
  assert.equal(normalize(reactMain), normalize(acceptedMain), `${route.pathname}: accepted main copy`);
  assert.equal(inlineCopy(reactMain), inlineCopy(acceptedMain), `${route.pathname}: accepted inline whitespace`);
  for (const tag of ["section", "article", "aside", "h2", "h3", "p", "li", "dt", "dd", "form", "label", "button", "input", "select", "option", "textarea", "a", "img"]) {
    assert.equal(count(reactMain, new RegExp(`<${tag}\\b`, "gi")), count(acceptedMain, new RegExp(`<${tag}\\b`, "gi")), `${route.pathname}: ${tag} structure count`);
  }
  const links = (source) => [...source.matchAll(/<a\b[^>]*>/g)].map(([tag]) => decodeHtml(attrOf(tag, "href") || ""));
  assert.deepEqual(links(reactMain), links(acceptedMain), `${route.pathname}: accepted link destinations`);
  for (const href of links(reactMain).filter((value) => value.startsWith("/"))) {
    const target = href.split(/[?#]/)[0].replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(root, target.endsWith("/") || target === "" ? `${target}index.html` : target)), `${route.pathname}: internal link ${href} resolves`);
  }
  const images = (source) => [...source.matchAll(/<img\b[^>]*>/g)].map(([tag]) => `${attrOf(tag, "src")} | ${decodeHtml(attrOf(tag, "alt") || "")}`);
  assert.deepEqual(images(reactMain), images(acceptedMain), `${route.pathname}: accepted images and alternative text`);
}

/* /now/: the whole Build Log is server-rendered from the canonical registry,
 * in registry order; the accepted document left the container empty. */
function validateBuildLog(route, html) {
  if (route.routeId !== "now") return;
  assert.equal(acceptedOf(route).match(BUILD_LOG)?.[2].trim(), "", `${route.pathname}: the accepted Build Log container is runtime-filled`);
  const list = mainOf(html).match(BUILD_LOG)?.[2];
  assert.ok(list, `${route.pathname}: Build Log container`);
  const dates = [...list.matchAll(/<article class="build-log-item"><time datetime="([^"]+)">([^<]+)<\/time>/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(dates, buildLog.map((entry) => [entry.date, entry.date]), `${route.pathname}: every canonical Build Log entry, in registry order, without JavaScript`);
  const copy = normalize(list);
  for (const entry of buildLog) {
    assert.ok(copy.includes(entry.area), `${route.pathname}: ${entry.id} area`);
    if (route.locale === registry.defaultLocale) assert.ok(copy.includes(entry.title.en) && copy.includes(entry.detail.en), `${route.pathname}: ${entry.id} canonical copy`);
    else if (route.locale === "tr") assert.ok(copy.includes(entry.title.tr) && copy.includes(entry.detail.tr), `${route.pathname}: ${entry.id} canonical Turkish copy`);
  }
  if (route.locale !== registry.defaultLocale) {
    assert.notEqual(copy, normalize(mainOf(emittedOf(targetRoutes.find((item) => item.routeId === "now" && item.locale === registry.defaultLocale))).match(BUILD_LOG)[2]), `${route.pathname}: Build Log copy is localized`);
  }
}

/* /certificates/: the label the accepted runtime rewrites from the UI pack. */
function validateTraining(route, html) {
  if (route.routeId !== "certificates") return;
  const expected = route.locale === registry.defaultLocale
    ? inlineCopy(acceptedOf(route).match(TRAINING)[2])
    : decodeHtml(JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/packs/${route.locale}/ui.json`), "utf8")).training);
  assert.equal(inlineCopy(mainOf(html).match(TRAINING)?.[2] ?? ""), expected, `${route.pathname}: training label matches the accepted runtime (UI pack "training")`);
  assert.equal(count(mainOf(html), /<article class="certificate-card/g), count(mainOf(acceptedOf(route)), /<article class="certificate-card/g), `${route.pathname}: certificate collection`);
  const dialog = mainOf(html).match(/<div\b[^>]*data-modal=""[^>]*>/)?.[0] || "";
  assert.ok(/role="dialog"/.test(dialog) && /aria-modal="true"/.test(dialog) && /aria-hidden="true"/.test(dialog) && /\sinert[\s>]/.test(dialog) && attrOf(dialog, "aria-label"), `${route.pathname}: closed, inert, named preview dialog`);
}

/* /request/: the form the retained controller binds to. */
function validateRequestForm(route, html) {
  if (route.routeId !== "request") return;
  const form = mainOf(html).match(/<form\b[^>]*data-request-form=""[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(form, `${route.pathname}: request form`);
  const control = (name) => form.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bname="${name}"[^>]*>`))?.[0] || "";
  for (const name of ["name", "email", "serviceType", "details", "consent"]) assert.match(control(name), /\srequired(=""|[\s/>])/, `${route.pathname}: ${name} is required`);
  for (const name of ["phone", "company", "budget", "timeline", "preferredContact"]) {
    assert.ok(control(name), `${route.pathname}: ${name} control`);
    assert.doesNotMatch(control(name), /\srequired/, `${route.pathname}: ${name} stays optional`);
  }
  assert.equal(attrOf(control("consent"), "type"), "checkbox", `${route.pathname}: explicit consent checkbox`);
  assert.doesNotMatch(control("consent"), /\schecked/, `${route.pathname}: consent is never pre-checked`);
  assert.equal(attrOf(control("email"), "type"), "email", `${route.pathname}: email validation`);
  assert.ok(attrOf(control("source"), "type") === "hidden" && attrOf(control("source"), "value"), `${route.pathname}: request source`);
  const honeypot = form.match(/<div class="request-honeypot" aria-hidden="true">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(honeypot, /<input\b[^>]*name="company_website"/, `${route.pathname}: honeypot field`);
  assert.equal(attrOf(honeypot.match(/<input\b[^>]*>/)?.[0], "tabindex"), "-1", `${route.pathname}: honeypot is out of the tab order`);
  assert.match(form, /<button\b[^>]*type="submit"[^>]*data-request-submit=""/, `${route.pathname}: submit control`);
  assert.match(form, /<div class="request-status" data-request-status="" aria-live="polite"><\/div>/, `${route.pathname}: empty polite status region`);
  assert.match(form, /<a\b[^>]*href="mailto:[^"]+"/, `${route.pathname}: email fallback`);
  assert.equal(decodeHtml(attrOf(form.match(/<a\b[^>]*data-google-form-link=""[^>]*>/)?.[0], "href") || ""), GOOGLE_FORM_URL, `${route.pathname}: Google Form fallback`);
  /* Every visible control is named by the label that wraps it. */
  const labelled = [...form.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(([label]) => label);
  for (const name of ["name", "email", "phone", "company", "serviceType", "budget", "timeline", "preferredContact", "details", "consent"]) {
    const label = labelled.find((item) => item.includes(`name="${name}"`));
    assert.ok(label && inlineCopy(label.replace(/<option\b[\s\S]*?<\/option>/g, "")).length > 1, `${route.pathname}: ${name} has a visible label`);
  }
}

/* /privacy/: the policy, as accepted, with its legal links. */
function validatePrivacy(route, html) {
  if (route.routeId !== "privacy") return;
  const main = mainOf(html);
  const headings = (source) => [...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => inlineCopy(match[1]));
  assert.deepEqual(headings(main), headings(mainOf(acceptedOf(route))), `${route.pathname}: accepted policy headings`);
  assert.ok(headings(main).length >= 8, `${route.pathname}: complete policy`);
  for (const href of ["https://developers.google.com/terms/api-services-user-data-policy", "https://myaccount.google.com/permissions", "mailto:kaanb8776@gmail.com"]) {
    assert.ok(main.includes(`href="${href}"`), `${route.pathname}: legal link ${href}`);
  }
  for (const scope of ["gmail.readonly", "calendar.events.readonly", "drive.readonly"]) assert.ok(main.includes(scope), `${route.pathname}: connector scope ${scope}`);
  assert.match(main, /<p class="privacy-updated">[^<]+<\/p>/, `${route.pathname}: last-updated statement`);
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
  assert.equal(data.url, meta(html, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"), `${route.pathname}: JSON-LD url is the canonical`);
  assert.equal(data.name, titleOf(html), `${route.pathname}: JSON-LD name is the title`);
  assert.equal(data.description, meta(html, /<meta\b[^>]*name="description"[^>]*>/i), `${route.pathname}: JSON-LD description is the meta description`);
  assert.equal(data.inLanguage, attrOf(html.match(/<html\b[^>]*>/i)[0], "lang"), `${route.pathname}: JSON-LD language is the document language`);
  assert.equal(data.image, meta(html, /<meta\b[^>]*property="og:image"[^>]*>/i), `${route.pathname}: JSON-LD image is og:image`);
  assert.deepEqual(data.isPartOf, { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: `${site.origin}/` }, `${route.pathname}: JSON-LD site`);
  assert.deepEqual(data.author, { "@type": "Person", name: "Kaan Balcı", url: `${site.origin}/` }, `${route.pathname}: JSON-LD author`);
}

function validateRoute(route, html, accepted = acceptedOf(route)) {
  validateDocument(route, html, accepted);
  validateScripts(route, html);
  validateMetadata(route, html, accepted);
  validateCopy(route, html, accepted);
  validateBuildLog(route, html);
  validateTraining(route, html);
  validateRequestForm(route, html);
  validatePrivacy(route, html);
  validateStructuredData(route, html);
}

function validateRedirects() {
  let checked = 0;
  for (const [id] of Object.entries(PAGES)) {
    const page = site.pages.find((item) => item.id === id);
    for (const locale of LOCALES) {
      const prefix = locale === registry.defaultLocale ? "" : `${locale}/`;
      const stub = fs.readFileSync(path.join(root, `${prefix}${page.legacy}`), "utf8");
      const destination = `/${prefix}${page.route}`;
      assert.ok(stub.includes(`<link rel="canonical" href="${site.origin}${destination}"/>`), `${prefix}${page.legacy}: canonical target`);
      assert.ok(stub.includes(`location.replace("${destination}"+location.search+location.hash);`), `${prefix}${page.legacy}: script redirect`);
      assert.ok(stub.includes(`<meta http-equiv="refresh" content="0; url=${destination}"/>`), `${prefix}${page.legacy}: no-script redirect`);
      assert.ok(!stub.includes("data-react-main"), `${prefix}${page.legacy}: compatibility stub stays a stub`);
      checked += 1;
    }
  }
  assert.equal(site.pages.find((item) => item.id === "certificates").legacy, "single-work.html", "single-work.html redirects to /certificates/");
  return checked;
}

function validateSitemap(canonicalCount) {
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  for (const route of targetRoutes) assert.ok(sitemap.includes(`<loc>${site.origin}${route.pathname}</loc>`), `sitemap lists ${route.pathname}`);
  assert.equal(count(sitemap, /<loc>/g), canonicalCount, "sitemap lists exactly the canonical routes");
}

function validateBundle() {
  const directory = path.join(root, "assets-react");
  const bundles = fs.readdirSync(directory);
  assert.equal(bundles.length, 1, "one shared client bundle and no per-route chunk");
  const bundle = fs.readFileSync(path.join(directory, bundles[0]));
  assert.ok(bundle.byteLength <= RAW_BUDGET, `client raw budget: ${bundle.byteLength} > ${RAW_BUDGET}`);
  assert.ok(gzipSync(bundle).byteLength <= GZIP_BUDGET, `client gzip budget: ${gzipSync(bundle).byteLength} > ${GZIP_BUDGET}`);
  const text = bundle.toString("utf8");
  for (const marker of CONTROLLER_MARKERS) assert.ok(!text.includes(marker), `page-scoped code or copy "${marker}" must stay out of the shared bundle`);
  const loader = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(loader, /request: \["js\/request\/submission\.js", "js\/request\/form\.js"\]/, "the runtime loader scopes the request controller to the request page");
  assert.match(loader, /certificates: \["js\/features\/certificates\.js"\]/, "the runtime loader scopes the certificate dialog to the certificates page");
  return { file: bundles[0], raw: bundle.byteLength, gzip: gzipSync(bundle).byteLength };
}

function validateContractFreshness(current = fs.readFileSync(STRUCTURE_FILE, "utf8")) {
  assert.equal(current.replace(/\r\n/g, "\n"), `${JSON.stringify(generateRemainingRoutesStructure(), null, 2)}\n`, "the remaining-routes React contract matches the accepted documents");
}

function runStatic() {
  const canonicalCount = validateCoverage(targetRoutes);
  for (const route of targetRoutes) validateRoute(route, emittedOf(route));
  const redirects = validateRedirects();
  validateSitemap(canonicalCount);
  const bundle = validateBundle();
  validateContractFreshness();

  /* Negative controls: each mutates the real registry or a real emitted
   * document and must be rejected by the named check. */
  const flipped = (id, renderer) => ({ ...site, pages: site.pages.map((page) => (page.id === id ? { ...page, renderer } : page)) });
  const at = (id, locale) => targetRoutes.find((route) => route.routeId === id && route.locale === locale);
  const emitted = (id, locale) => emittedOf(at(id, locale));
  const swapMain = (html, replacement) => html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/i, (_, open, close) => `${open}${replacement}${close}`);
  const controls = [
    ["a missing #30.5 React route", /the five approved remaining pages|five pages across/, () => { const legacySite = flipped("privacy", "legacy"); const all = canonicalReactRoutes({ site: legacySite }); validateCoverage(all.filter((route) => route.kind === "page" && Object.hasOwn(PAGES, route.routeId) && route.renderer === "react"), all, legacySite.pages); }],
    ["a legacy-rendered canonical route", /React-owned/, () => { const legacySite = flipped("request", "legacy"); const all = canonicalReactRoutes({ site: legacySite }); validateCoverage(all.filter((route) => route.kind === "page" && Object.hasOwn(PAGES, route.routeId)), all, legacySite.pages); }],
    ["an unapproved extra React page", /exactly the five approved page ids/, () => validateCoverage(targetRoutes, routes, [...site.pages, { id: "extra", route: "extra/", renderer: "react" }])],
    ["missing localized content (English policy on the German route)", /accepted main copy/, () => validateRoute(at("privacy", "de"), swapMain(emitted("privacy", "de"), mainOf(emitted("privacy", "en"))))],
    ["missing localized content (English request form on the French route)", /accepted main copy/, () => validateRoute(at("request", "fr"), swapMain(emitted("request", "fr"), mainOf(emitted("request", "en"))))],
    ["a dropped policy paragraph", /accepted main copy/, () => validateRoute(at("privacy", "en"), emitted("privacy", "en").replace(/<li>Tokens and connector data are never sold[\s\S]*?<\/li>/, ""))],
    ["a removed legal link", /a structure count/, () => validateRoute(at("privacy", "tr"), emitted("privacy", "tr").replace(/<a href="https:\/\/myaccount\.google\.com\/permissions"[^>]*>[\s\S]*?<\/a>/, "myaccount.google.com/permissions"))],
    ["a redirected legal link", /accepted link destinations/, () => validateRoute(at("privacy", "fr"), emitted("privacy", "fr").replace('href="https://developers.google.com/terms/api-services-user-data-policy"', 'href="https://example.com/policy"'))],
    ["a dropped Build Log entry", /every canonical Build Log entry/, () => validateRoute(at("now", "tr"), emitted("now", "tr").replace(/<article class="build-log-item">[\s\S]*?<\/article>/, ""))],
    ["an untranslated Build Log", /Build Log copy is localized|canonical Turkish copy/, () => validateRoute(at("now", "tr"), emitted("now", "tr").replace(BUILD_LOG, (_, open, __, close) => `${open}${mainOf(emitted("now", "en")).match(BUILD_LOG)[2]}${close}`))],
    ["a training label that is not the runtime phrase", /training label matches the accepted runtime/, () => validateRoute(at("certificates", "de"), emitted("certificates", "de").replace(TRAINING, "$1Weiterbildung$3"))],
    ["a dropped certificate", /accepted main copy/, () => validateRoute(at("certificates", "en"), emitted("certificates", "en").replace(/<article class="certificate-card[\s\S]*?<\/article>/, ""))],
    ["optional consent", /consent is required/, () => validateRequestForm(at("request", "en"), emitted("request", "en").replace(/(<input\b[^>]*type="checkbox"[^>]*?)\srequired(?=[\s/>])/, "$1"))],
    ["pre-checked consent", /consent is never pre-checked/, () => validateRequestForm(at("request", "en"), emitted("request", "en").replace(/(<input\b[^>]*type="checkbox")/, '$1 checked'))],
    ["a missing honeypot", /honeypot field/, () => validateRequestForm(at("request", "es"), emitted("request", "es").replace(/<div class="request-honeypot"[\s\S]*?<\/div>/, ""))],
    ["a missing status region", /empty polite status region/, () => validateRequestForm(at("request", "en"), emitted("request", "en").replace(' aria-live="polite"', ""))],
    ["a missing request configuration script", /accepted script order/, () => validateScripts(at("request", "en"), emitted("request", "en").replace('<script src="/request-config.js"></script>', ""))],
    ["a page controller duplicated into the document", /accepted script order/, () => validateScripts(at("request", "en"), emitted("request", "en").replace('<script src="/portfolio-v2.js"></script>', '<script src="/portfolio-v2.js"></script><script src="/js/request/form.js"></script>'))],
    ["a wrong canonical", /canonical/, () => validateRoute(at("blog", "es"), emitted("blog", "es").replace(`rel="canonical" href="${site.origin}/es/blog/"`, `rel="canonical" href="${site.origin}/blog/"`))],
    ["a missing hreflang alternate", /accepted hreflang set/, () => validateRoute(at("blog", "en"), emitted("blog", "en").replace(/<link rel="alternate" hreflang="fr"[^>]*>/, ""))],
    ["a changed title", /accepted title/, () => validateRoute(at("now", "en"), emitted("now", "en").replace(/<title>[\s\S]*?<\/title>/, "<title>Now</title>"))],
    ["duplicate navigation", /exactly one navigation/, () => validateDocument(at("blog", "en"), emitted("blog", "en").replace("</header>", '<nav class="nav-links"></nav></header>'), acceptedOf(at("blog", "en")))],
    ["an inline handler", /no inline handlers/, () => validateDocument(at("now", "en"), emitted("now", "en").replace('<section class="page-hero', '<section onclick="x()" class="page-hero'), acceptedOf(at("now", "en")))],
    ["JSON-LD pointing at another page", /JSON-LD url is the canonical/, () => validateStructuredData(at("privacy", "en"), emitted("privacy", "en").replace(`"url":"${site.origin}/privacy/"`, `"url":"${site.origin}/"`))],
    ["an invented JSON-LD claim", /JSON-LD states only the reviewed fields/, () => validateStructuredData(at("certificates", "en"), emitted("certificates", "en").replace('"@type":"WebPage",', '"@type":"WebPage","award":"x",'))],
    ["a stale contract", /React contract matches the accepted documents/, () => validateContractFreshness(fs.readFileSync(STRUCTURE_FILE, "utf8").replace("Privacy Policy", "Privacy"))],
  ];
  for (const [name, expected, run] of controls) {
    assert.throws(run, (error) => error instanceof assert.AssertionError && expected.test(error.message), `static control "${name}" was not rejected by its check`);
  }
  console.log(`G-72 remaining-routes static gate passed. ${targetRoutes.length} documents · ${Object.keys(PAGES).length} pages × ${LOCALES.length} locales · canonical React ownership ${canonicalCount}/${canonicalCount} · ${redirects} compatibility redirects · client ${bundle.file} ${bundle.raw} B raw/${bundle.gzip} B gzip (budget ${RAW_BUDGET}/${GZIP_BUDGET}) · per-route chunks 0 · ${controls.length} observed negative-control failures.`);
}

/* ----------------------------------------------------------------- browser */

const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml" };

/* Records the server markup of <main> before any script can touch it, every
 * mutation until hydration completes, and the state after it. A page
 * controller may re-assert a value the server markup already carries (the
 * certificate dialog's `inert`, the Google Form link the request controller
 * syncs from request-config.js); only a write that changes something counts. */
const PROBE = `<script>(()=>{const m=document.querySelector('main[data-react-main]');const nodes=r=>{const a=[r],w=document.createTreeWalker(r,NodeFilter.SHOW_ALL);while(w.nextNode())a.push(w.currentNode);return a};const attrs=r=>nodes(r).filter(n=>n.nodeType===1).map(n=>({n,v:JSON.stringify([...n.attributes].map(a=>[a.name,a.value]).sort())}));const p=window.__m3305={m,html:m.innerHTML,nodes:nodes(m),attrs:attrs(m),records:[],errors:[],signals:0,settled:false,phase:'pre'};const rec=r=>({phase:p.phase,type:r.type,name:r.attributeName||null,target:r.target.nodeName,effective:r.type!=='attributes'||r.oldValue!==r.target.getAttribute(r.attributeName)});const o=new MutationObserver(rs=>p.records.push(...rs.map(rec)));o.observe(m,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});addEventListener('portfolio:react-main-hydration-start',()=>{p.records.push(...o.takeRecords().map(rec));p.phase='hydration'});addEventListener('portfolio:react-main-hydration-error',e=>p.errors.push(e.detail||{}));addEventListener('portfolio:react-main-hydrated',()=>{p.records.push(...o.takeRecords().map(rec));p.phase='post';p.signals++;requestAnimationFrame(()=>requestAnimationFrame(()=>{p.post=document.querySelector('main[data-react-main]');p.postHtml=p.post.innerHTML;p.postNodes=nodes(p.post);p.postAttrs=attrs(p.post);p.settled=true}))})})();</script>`;
const SABOTAGE = Object.freeze({
  copy: "document.querySelector('main').append(' hydration drift')",
  attribute: "document.querySelector('main h1').setAttribute('data-hydration-drift','1')",
  identity: "(()=>{const n=document.querySelector('main section');n.replaceWith(n.cloneNode(true))})()",
  text: "document.querySelector('main h1').textContent='hydration drift'",
});

function serverFor(directory, { instrument = false, mutations = new Map() } = {}) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const target = path.resolve(directory, relative.endsWith("/") ? `${relative}index.html` : relative);
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    const mutate = mutations.get(url.pathname);
    if (mutate) return response.end(mutate(fs.readFileSync(target, "utf8")));
    if (instrument && path.extname(target) === ".html") {
      const mode = url.searchParams.get("sabotage");
      const sabotage = mode !== null && Object.hasOwn(SABOTAGE, mode) ? `<script>${SABOTAGE[mode]}</script>` : "";
      return response.end(fs.readFileSync(target, "utf8").replace(/<\/main>/i, `</main>${PROBE}${sabotage}`));
    }
    fs.createReadStream(target).pipe(response);
  });
}

const hydrationState = () => { const p = window.__m3305; return { settled: p?.settled, signals: p?.signals, errors: p?.errors, preHydrationMutations: p?.records?.filter((record) => record.phase === "pre" && record.effective).length, sameMain: p?.m === p?.post, sameHtml: p?.html === p?.postHtml, sameNodes: p?.nodes?.length === p?.postNodes?.length && p.nodes.every((node, index) => node === p.postNodes[index]), sameAttrs: p?.attrs?.length === p?.postAttrs?.length && p.attrs.every((entry, index) => entry.n === p.postAttrs[index].n && entry.v === p.postAttrs[index].v) }; };
function hydrationViolations(value) {
  return [
    [value.settled === true, "hydration did not settle"],
    [value.signals === 1, "hydration completion signal"],
    [Array.isArray(value.errors) && value.errors.length === 0, "recoverable hydration error"],
    [value.preHydrationMutations === 0, "markup changed before hydration"],
    [value.sameMain === true, "main replaced"],
    [value.sameHtml === true, "innerHTML changed"],
    [value.sameNodes === true, "descendant identity changed"],
    [value.sameAttrs === true, "attributes changed"],
  ].filter(([held]) => !held).map(([, contract]) => contract);
}
function assertHydration(value, label) {
  const violations = hydrationViolations(value);
  assert.deepEqual(violations, [], `${label}: ${violations.join("; ")} ${violations.length ? JSON.stringify(value.errors) : ""}`);
}

/* The rendered <main>: every element with its attributes, box and the styles
 * that carry the visual presentation, and every text node. */
const snapshot = () => {
  const out = [];
  const style = (element) => { const s = getComputedStyle(element); return [s.display, s.position, s.fontSize, s.fontWeight, s.lineHeight, s.color, s.backgroundColor, s.textTransform, s.textAlign, s.opacity, s.visibility].join("|"); };
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { const text = child.nodeValue.replace(/\s+/g, " ").trim(); if (text) out.push({ text }); }
      else if (child.nodeType === 1) {
        const box = child.getBoundingClientRect();
        out.push({ tag: child.tagName.toLowerCase(), attrs: [...child.attributes].map((attribute) => [attribute.name, attribute.value]).sort(), box: [box.x + scrollX, box.y + scrollY, box.width, box.height], style: style(child) });
        walk(child);
      }
    }
  };
  walk(document.querySelector("main"));
  return { main: out, title: document.title, lang: document.documentElement.lang, selectedNav: document.querySelector(".nav-links .selected")?.getAttribute("href") ?? null, privacyHref: document.querySelector(".site-footer .copyright a")?.getAttribute("href") ?? null };
};

/* The one reviewed markup difference: a React document carries several
 * complementary landmarks, so the Experience aside is named by its heading. */
const comparable = (entry, acceptedEntry) => (entry.tag === "aside" && !acceptedEntry.attrs?.some(([name]) => name === "aria-label")
  ? { ...entry, attrs: entry.attrs.filter(([name]) => name !== "aria-label") }
  : entry);
function assertParity(accepted, react, label) {
  for (const key of ["title", "lang", "selectedNav", "privacyHref"]) assert.equal(react[key], accepted[key], `${label}: ${key}`);
  assert.equal(react.main.length, accepted.main.length, `${label}: rendered main node count`);
  for (let index = 0; index < accepted.main.length; index += 1) {
    const before = accepted.main[index];
    const after = comparable(react.main[index], before);
    const where = `${label}: node ${index} <${before.tag || "text"}>`;
    assert.equal(after.text, before.text, `${where} rendered text`);
    if (!before.tag) continue;
    assert.equal(after.tag, before.tag, `${where} element`);
    assert.deepEqual(after.attrs, before.attrs, `${where} attributes`);
    assert.equal(after.style, before.style, `${where} computed style`);
    for (let side = 0; side < 4; side += 1) assert.ok(Math.abs(after.box[side] - before.box[side]) <= 1, `${where} box ${["x", "y", "width", "height"][side]} delta ${after.box[side] - before.box[side]}`);
  }
}

const CONDITIONS = [
  { name: "desktop-dark", theme: "dark", viewport: { width: 1440, height: 900 } },
  { name: "mobile-light", theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } },
];

/* Local files are served; the request endpoint is answered by the mock
 * transport; everything else is refused, so nothing leaves the machine. */
async function prepare(page, condition, transport = null) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const host = new URL(url).hostname;
    if (host === "127.0.0.1" || host === "localhost") return request.continue();
    if (transport && url.startsWith(REQUEST_ENDPOINT)) return transport.handle(request);
    return request.abort();
  });
  await page.setViewport(condition.viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((value) => localStorage.setItem("kaanbalci-site-theme", value), condition.theme);
}

async function settle(page, routeId) {
  await page.waitForFunction((id) => document.readyState === "complete"
    && (!document.querySelector("main[data-react-main]") || window.__m3305?.settled === true)
    && (id !== "now" || document.querySelector("[data-build-log] article"))
    && typeof window.KAAN_PORTFOLIO === "object", { timeout: 20000 }, routeId);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => {
    requestIdleCallback(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), { timeout: 3000 });
  })));
}

function watch(page) {
  const diagnostics = [];
  page.on("console", (message) => { if (["error", "warn"].includes(message.type()) && !message.text().startsWith("Failed to load resource:")) diagnostics.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  return diagnostics;
}

/* ---- certificate preview dialog: the same script on both documents ---- */
async function certificateDialog(page) {
  const state = () => page.evaluate(() => {
    const modal = document.querySelector("[data-modal]");
    const image = document.querySelector("[data-modal-img]");
    return { open: modal.classList.contains("is-open"), hidden: modal.getAttribute("aria-hidden"), inert: modal.inert, openDialogs: document.querySelectorAll(".image-modal.is-open").length, src: image.getAttribute("src"), alt: image.alt, bodyLocked: document.body.classList.contains("modal-open"), focusInDialog: modal.contains(document.activeElement), focusOnTrigger: document.activeElement?.matches?.("[data-cert]") ? document.activeElement.dataset.cert : null };
  });
  const outcome = { closed: await state() };
  const triggers = await page.$$eval("[data-cert]", (buttons) => buttons.map((button) => [button.dataset.cert, button.dataset.certTitle]));
  outcome.triggers = triggers;
  await page.$eval("[data-cert]", (button) => { button.scrollIntoView({ block: "center" }); button.focus(); });
  await page.keyboard.press("Enter");
  outcome.opened = await state();
  for (let index = 0; index < 3; index += 1) await page.keyboard.press("Tab");
  outcome.afterTab = await state();
  await page.keyboard.press("Escape");
  outcome.afterEscape = await state();
  await page.$$eval("[data-cert]", (buttons) => buttons[buttons.length - 1].click());
  outcome.reopened = await state();
  await page.$eval("[data-modal]", (modal) => modal.click());
  outcome.afterBackdrop = await state();
  await page.$$eval("[data-cert]", (buttons) => buttons[1].click());
  await page.$eval("[data-modal-close]", (button) => button.click());
  outcome.afterCloseButton = await state();
  return outcome;
}
function assertCertificateDialog(outcome, label) {
  const [firstSrc, firstTitle] = outcome.triggers[0];
  assert.ok(outcome.triggers.length >= 9, `${label}: every certificate offers a preview`);
  assert.deepEqual([outcome.closed.open, outcome.closed.hidden, outcome.closed.inert], [false, "true", true], `${label}: dialog starts closed and inert`);
  assert.deepEqual([outcome.opened.open, outcome.opened.hidden, outcome.opened.inert, outcome.opened.openDialogs, outcome.opened.bodyLocked, outcome.opened.focusInDialog], [true, "false", false, 1, true, true], `${label}: one dialog opens and takes focus`);
  assert.deepEqual([outcome.opened.src, outcome.opened.alt], [firstSrc, firstTitle], `${label}: dialog shows the selected certificate`);
  assert.equal(outcome.afterTab.focusInDialog, true, `${label}: focus stays inside the open dialog`);
  assert.deepEqual([outcome.afterEscape.open, outcome.afterEscape.hidden, outcome.afterEscape.inert, outcome.afterEscape.bodyLocked, outcome.afterEscape.focusOnTrigger], [false, "true", true, false, firstSrc], `${label}: Escape closes and returns focus to the trigger`);
  assert.equal(outcome.reopened.src, outcome.triggers[outcome.triggers.length - 1][0], `${label}: another certificate opens`);
  assert.equal(outcome.afterBackdrop.open, false, `${label}: backdrop closes`);
  assert.equal(outcome.afterCloseButton.open, false, `${label}: close button closes`);
}

/* ---- request form: one script, mock transport, accepted and React ---- */
const MODES = Object.freeze({
  http500: (request) => request.respond({ status: 500, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: '{"ok":true}' }),
  rejected: (request) => request.respond({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: '{"ok":false,"error":"mock rejection"}' }),
  malformed: (request) => request.respond({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "text/html", body: "<html>Sign in</html>" }),
  unconfirmed: (request) => request.respond({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: '{"status":"received"}' }),
  network: (request) => request.abort("failed"),
  timeout: () => {},
  success: (request) => setTimeout(() => request.respond({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: '{"ok":true}' }).catch(() => {}), 600),
});
function mockTransport() {
  const transport = { mode: null, requests: [], handle(request) { transport.requests.push({ method: request.method(), body: Object.fromEntries(new URLSearchParams(request.postData() || "")) }); return (MODES[transport.mode] || MODES.network)(request); } };
  return transport;
}
/* The transport timeout is 20 s in production; only that timer is shortened,
 * and only while the timeout scenario runs. */
const TIMEOUT_SOURCE = "const REQUEST_SUBMISSION_TIMEOUT_MS = 20000;";
const shortenTimeout = () => { const native = window.setTimeout; window.setTimeout = (callback, delay, ...rest) => native(callback, delay === 20000 && window.__m3305ShortTimeout ? 400 : delay, ...rest); };

async function requestSuite(page, transport, { stopAfter = null } = {}) {
  const fill = (extra = {}) => page.evaluate((values) => {
    const form = document.querySelector("[data-request-form]");
    const set = (name, value) => { const control = form.elements[name]; if (control.type === "checkbox") control.checked = value; else if (control.tagName === "SELECT") control.selectedIndex = value; else control.value = value; control.dispatchEvent(new Event("input", { bubbles: true })); control.dispatchEvent(new Event("change", { bubbles: true })); };
    set("name", "QA Mock Visitor"); set("email", "qa@example.test"); set("details", "Mock transport only — never delivered.");
    set("serviceType", 1);
    for (const [name, value] of Object.entries(values)) set(name, value);
  }, extra);
  /* Skips the three-second minimum-completion guard for the scenarios that are
   * about the transport; the guard itself is exercised in real time below. */
  const elapsed = () => page.evaluate(() => { document.querySelector("[data-request-form]").__requestFormStartedAt = Date.now() - 4000; });
  const clearStatus = () => page.evaluate(() => { const status = document.querySelector("[data-request-status]"); status.className = "request-status"; status.replaceChildren(); });
  const read = () => page.evaluate(() => {
    const form = document.querySelector("[data-request-form]"), status = document.querySelector("[data-request-status]"), button = form.querySelector("[data-request-submit]");
    /* portfolio-v2.js appends a browser-side reference stamped with the
     * current minute to a success-styled status; the minute is not compared. */
    return { status: status.className, text: status.textContent.replace(/KB-\d{8}-\d{4}/g, "KB-<minute>"), receipts: status.querySelectorAll("[data-request-receipt]").length, mail: status.querySelector("a")?.getAttribute("href") ?? null, name: form.elements.name.value, details: form.elements.details.value, service: form.elements.serviceType.selectedIndex, consent: form.elements.consent.checked, honeypot: form.elements.company_website.value, busy: form.getAttribute("aria-busy"), disabled: button.disabled, button: button.textContent, valid: form.checkValidity(), ready: form.__requestFormReady === true };
  });
  const submit = () => page.$eval("[data-request-submit]", (button) => button.click());
  const finished = () => page.waitForFunction(() => document.querySelector("[data-request-status]").classList.contains("is-visible") && !document.querySelector("[data-request-form]").hasAttribute("aria-busy"), { timeout: 15000 });
  const sent = async (run) => { const before = transport.requests.length; await run(); return transport.requests.length - before; };
  const outcome = { idle: await read() };

  outcome.empty = { requests: await sent(submit), ...(await read()) };
  await fill({ consent: false });
  outcome.noConsent = { requests: await sent(submit), ...(await read()) };
  await fill({ consent: true, email: "not-an-email" });
  outcome.badEmail = { requests: await sent(submit), ...(await read()) };
  await fill({ consent: true, company_website: "https://spam.example" });
  await elapsed();
  /* A bot path must stay silent: give an escaped request time to show up. */
  const quiet = async () => { await submit(); await new Promise((resolve) => setTimeout(resolve, 500)); };
  outcome.honeypot = { requests: await sent(quiet), ...(await read()) };
  await clearStatus();
  await fill({ consent: true });
  outcome.tooQuick = { requests: await sent(quiet), ...(await read()) };

  for (const mode of ["http500", "rejected", "malformed", "unconfirmed", "network", "timeout"]) {
    await clearStatus();
    await fill({ consent: true });
    await elapsed();
    transport.mode = mode;
    await page.evaluate((shorten) => { window.__m3305ShortTimeout = shorten; }, mode === "timeout");
    const requests = await sent(async () => { await submit(); await finished(); });
    outcome[mode] = { requests, ...(await read()) };
    if (stopAfter === mode) return outcome;
  }

  /* Success, in real time: a submission inside the minimum completion time is
   * dropped, the same form sent after it is delivered exactly once even when
   * it is submitted again while pending. */
  await clearStatus();
  await page.evaluate(() => { window.__m3305ShortTimeout = false; const form = document.querySelector("[data-request-form]"); form.reset(); form.__requestFormStartedAt = Date.now(); });
  await new Promise((resolve) => setTimeout(resolve, 3200));
  await fill({ consent: true, phone: "+90 000", company: "QA", budget: 1 });
  transport.mode = "success";
  const before = transport.requests.length;
  await submit();
  await page.waitForFunction(() => document.querySelector("[data-request-form]").getAttribute("aria-busy") === "true", { timeout: 5000 });
  outcome.pending = await read();
  await page.$eval("[data-request-form]", (form) => form.requestSubmit());
  await finished();
  const payload = transport.requests[transport.requests.length - 1].body;
  outcome.success = { requests: transport.requests.length - before, ...(await read()), method: transport.requests[transport.requests.length - 1].method, fields: Object.keys(payload).sort(), requestId: /^[0-9a-f-]{36}$|^req-/.test(payload.requestId || ""), pagePath: new URL(payload.pageUrl).pathname, submittedAt: !Number.isNaN(Date.parse(payload.submittedAt)), source: payload.source, sentName: payload.name, sentConsent: payload.consent };
  return outcome;
}

/* A request that was not confirmed by a readable 2xx `{ "ok": true }` must
 * never look delivered: no success state, no cleared form. */
function assertUnconfirmed(result, mode, label) {
  assert.equal(result.requests, 1, `${label}/${mode}: exactly one request`);
  assert.ok(!/\bsuccess\b/.test(result.status), `${label}/${mode}: an unconfirmed result must never display success`);
  assert.match(result.status, /\bis-visible\b.*\berror\b/, `${label}/${mode}: visible error state`);
  assert.match(result.mail || "", /^mailto:/, `${label}/${mode}: email fallback is offered`);
  assert.deepEqual([result.name, result.details, result.service, result.consent], ["QA Mock Visitor", "Mock transport only — never delivered.", 1, true], `${label}/${mode}: the visitor's entries are kept for a retry`);
  assert.deepEqual([result.busy, result.disabled], [null, false], `${label}/${mode}: the form is usable again`);
}
function assertRequestSuite(outcome, label) {
  assert.equal(outcome.idle.ready, true, `${label}: request controller initialized`);
  assert.deepEqual([outcome.idle.status, outcome.idle.text], ["request-status", ""], `${label}: no status before a submission`);
  for (const step of ["empty", "noConsent", "badEmail"]) {
    assert.deepEqual([outcome[step].requests, outcome[step].valid, outcome[step].status], [0, false, "request-status"], `${label}/${step}: invalid form is not sent and shows no result`);
  }
  for (const step of ["honeypot", "tooQuick"]) {
    assert.equal(outcome[step].requests, 0, `${label}/${step}: nothing is sent`);
    assert.deepEqual([outcome[step].name, outcome[step].honeypot, outcome[step].consent, outcome[step].mail], ["", "", false, null], `${label}/${step}: neutral reset without a delivery claim`);
  }
  assert.equal(outcome.honeypot.text, outcome.tooQuick.text, `${label}: bot paths answer identically`);
  for (const mode of ["http500", "rejected", "malformed", "unconfirmed", "network", "timeout"]) assertUnconfirmed(outcome[mode], mode, label);
  assert.notEqual(outcome.timeout.text, outcome.network.text, `${label}: a timeout is reported as a timeout`);
  assert.equal(outcome.http500.text, outcome.network.text, `${label}: delivery failures share the error message`);
  assert.deepEqual([outcome.pending.busy, outcome.pending.disabled], ["true", true], `${label}: pending submission is busy and locked`);
  assert.notEqual(outcome.pending.button, outcome.success.button, `${label}: pending label`);
  assert.equal(outcome.success.button, outcome.idle.button, `${label}: submit label restored`);
  assert.equal(outcome.success.requests, 1, `${label}: a duplicate submission while pending is not sent`);
  assert.match(outcome.success.status, /\bis-visible\b.*\bsuccess\b/, `${label}: confirmed delivery shows success`);
  assert.notEqual(outcome.success.text, outcome.honeypot.text, `${label}: confirmed delivery is not the neutral message`);
  assert.equal(outcome.success.receipts, 1, `${label}: one browser submission reference`);
  for (const mode of ["http500", "rejected", "malformed", "unconfirmed", "network", "timeout"]) assert.equal(outcome[mode].receipts, 0, `${label}/${mode}: no submission reference for an unconfirmed result`);
  assert.match(outcome.success.mail || "", /^mailto:/, `${label}: success keeps the direct email`);
  assert.deepEqual([outcome.success.name, outcome.success.consent, outcome.success.busy, outcome.success.disabled], ["", false, null, false], `${label}: confirmed delivery clears the form`);
  assert.deepEqual([outcome.success.method, outcome.success.requestId, outcome.success.submittedAt, outcome.success.sentName, outcome.success.sentConsent], ["POST", true, true, "QA Mock Visitor", "on"], `${label}: delivered payload`);
  assert.ok(outcome.success.source, `${label}: request source`);
  assert.ok(!outcome.success.fields.includes("company_website"), `${label}: the honeypot never reaches the endpoint`);
  for (const field of ["budget", "company", "consent", "details", "email", "name", "pageUrl", "phone", "preferredContact", "requestId", "serviceType", "source", "submittedAt", "timeline"]) assert.ok(outcome.success.fields.includes(field), `${label}: payload carries ${field}`);
}

async function runBrowser() {
  const { default: puppeteer } = await import("puppeteer");
  const launch = process.env.GITHUB_ACTIONS === "true" ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"], protocolTimeout: 180000 } : { headless: true, protocolTimeout: 180000 };
  const mutations = new Map();
  const reactServer = serverFor(root, { instrument: true }), legacyServer = serverFor(ROOT), mutatedServer = serverFor(root, { instrument: true, mutations });
  await Promise.all([reactServer, legacyServer, mutatedServer].map((server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))));
  const [reactOrigin, legacyOrigin, mutatedOrigin] = [reactServer, legacyServer, mutatedServer].map((server) => `http://127.0.0.1:${server.address().port}`);
  const browser = await puppeteer.launch(launch);
  const counts = { hydrated: 0, parity: 0, noScript: 0, dialogs: 0, requestSuites: 0, shell: 0, controls: 0 };
  try {
    /* 1. Hydration purity and final-DOM/layout parity, every document. English
     * in both conditions, the other locales alternating. */
    for (const [routeIndex, route] of targetRoutes.entries()) {
      const conditions = route.locale === registry.defaultLocale ? CONDITIONS : [CONDITIONS[routeIndex % 2]];
      for (const condition of conditions) {
        const label = `${route.pathname}/${condition.name}`;
        const [accepted, react] = await Promise.all([browser.newPage(), browser.newPage()]);
        const diagnostics = watch(react);
        await Promise.all([prepare(accepted, condition), prepare(react, condition)]);
        const snapshots = [];
        for (const [page, origin] of [[accepted, legacyOrigin], [react, reactOrigin]]) {
          await page.bringToFront();
          const response = await page.goto(`${origin}${route.pathname}`, { waitUntil: "load" });
          assert.equal(response.status(), 200, `${label}: HTTP`);
          await settle(page, route.routeId);
          snapshots.push(await page.evaluate(snapshot));
        }
        assertHydration(await react.evaluate(hydrationState), label);
        counts.hydrated += 1;
        assertParity(snapshots[0], snapshots[1], label);
        counts.parity += 1;
        const shell = await react.evaluate(() => {
          const sources = [...document.scripts].map((script) => script.getAttribute("src")).filter(Boolean);
          return { theme: document.documentElement.dataset.theme, duplicates: sources.filter((src, index) => sources.indexOf(src) !== index), mains: document.querySelectorAll("main").length, headers: document.querySelectorAll("header.site-header").length, navs: document.querySelectorAll("nav.nav-links").length, footers: document.querySelectorAll("footer.site-footer").length };
        });
        assert.deepEqual(shell, { theme: condition.theme, duplicates: [], mains: 1, headers: 1, navs: 1, footers: 1 }, `${label}: one document shell and no script loaded twice`);
        if (condition === conditions[0]) {
          await react.$eval("[data-theme-toggle]", (button) => button.click());
          assert.notEqual(await react.evaluate(() => document.documentElement.dataset.theme), condition.theme, `${label}: theme control`);
          counts.shell += 1;
        }
        assert.deepEqual(diagnostics, [], `${label}: console diagnostics`);
        await Promise.all([accepted.close(), react.close()]);
        console.log(`[G-72 hydrate+parity ${counts.parity}] ${label}`);
      }
    }

    /* 2. Without JavaScript every document is still meaningful and navigable. */
    for (const route of targetRoutes) {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await prepare(page, CONDITIONS[0]);
      await page.goto(`${reactOrigin}${route.pathname}`, { waitUntil: "load" });
      const state = await page.evaluate(() => ({ h1: document.querySelector("main h1")?.textContent.trim().length || 0, text: document.querySelector("main").innerText.trim().length, nav: [...document.querySelectorAll("nav.nav-links a")].map((link) => link.getAttribute("href")), buildLog: document.querySelectorAll("[data-build-log] article").length, controls: document.querySelectorAll("[data-request-form] [name]").length, certificates: document.querySelectorAll(".certificate-card").length, policy: document.querySelectorAll(".privacy-policy h2").length, visible: getComputedStyle(document.querySelector("main h1")).visibility === "visible" && document.querySelector("main h1").getBoundingClientRect().height > 0 }));
      assert.ok(state.h1 > 0 && state.text > 300 && state.visible, `${route.pathname}: meaningful content without JavaScript`);
      assert.equal(state.nav.length, 7, `${route.pathname}: navigable without JavaScript`);
      for (const href of state.nav) assert.ok(fs.existsSync(path.join(root, href.replace(/^\//, ""), "index.html")), `${route.pathname}: navigation target ${href}`);
      if (route.routeId === "now") assert.equal(state.buildLog, buildLog.length, `${route.pathname}: Build Log without JavaScript`);
      if (route.routeId === "request") assert.equal(state.controls, 12, `${route.pathname}: request form without JavaScript`);
      if (route.routeId === "certificates") assert.ok(state.certificates >= 9, `${route.pathname}: certificates without JavaScript`);
      if (route.routeId === "privacy") assert.ok(state.policy >= 8, `${route.pathname}: policy without JavaScript`);
      counts.noScript += 1;
      await page.close();
    }

    /* 3. Certificate preview dialog: same script, accepted vs React. */
    for (const [locale, condition] of [[registry.defaultLocale, CONDITIONS[0]], ["tr", CONDITIONS[1]], ["de", CONDITIONS[0]]]) {
      const route = targetRoutes.find((item) => item.routeId === "certificates" && item.locale === locale);
      const outcomes = [];
      for (const origin of [legacyOrigin, reactOrigin]) {
        const page = await browser.newPage();
        const diagnostics = watch(page);
        await prepare(page, condition);
        await page.goto(`${origin}${route.pathname}`, { waitUntil: "load" });
        await settle(page, route.routeId);
        outcomes.push(await certificateDialog(page));
        assert.deepEqual(diagnostics, [], `${route.pathname}: dialog console diagnostics`);
        await page.close();
      }
      assertCertificateDialog(outcomes[1], `${route.pathname}/${condition.name}`);
      assert.deepEqual(outcomes[1], outcomes[0], `${route.pathname}/${condition.name}: dialog behaves as on the accepted document`);
      counts.dialogs += 1;
      console.log(`[G-72 dialog ${counts.dialogs}/3] ${route.pathname} ${condition.name}`);
    }

    /* 4. Request form through the mock transport: accepted vs React. */
    assert.ok(fs.readFileSync(path.join(root, "js/request/submission.js"), "utf8").includes(TIMEOUT_SOURCE), "the shortened timer is the transport timeout");
    const runRequest = async (origin, route, condition, options) => {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const transport = mockTransport();
      await prepare(page, condition, transport);
      await page.evaluateOnNewDocument(shortenTimeout);
      await page.bringToFront();
      await page.goto(`${origin}${route.pathname}`, { waitUntil: "load" });
      await settle(page, route.routeId);
      if (origin !== legacyOrigin) assertHydration(await page.evaluate(hydrationState), `${route.pathname}: request hydration`);
      const outcome = await requestSuite(page, transport, options);
      assert.deepEqual(errors, [], `${route.pathname}: request page errors`);
      await page.close();
      return outcome;
    };
    for (const [locale, condition] of [[registry.defaultLocale, CONDITIONS[0]], ["tr", CONDITIONS[1]], ["de", CONDITIONS[0]]]) {
      const route = targetRoutes.find((item) => item.routeId === "request" && item.locale === locale);
      const label = `${route.pathname}/${condition.name}`;
      const accepted = await runRequest(legacyOrigin, route, condition);
      const react = await runRequest(reactOrigin, route, condition);
      assertRequestSuite(react, label);
      assert.equal(react.success.pagePath, route.pathname, `${label}: payload page`);
      assert.deepEqual(react, accepted, `${label}: every state transition matches the accepted document`);
      counts.requestSuites += 1;
      console.log(`[G-72 request ${counts.requestSuites}/3] ${label} · ${Object.keys(react).length} states · 7 mock deliveries`);
    }
    const requestRoute = targetRoutes.find((item) => item.routeId === "request" && item.locale === registry.defaultLocale);
    const localized = [];
    for (const locale of ["es", "fr"]) localized.push(await runRequest(reactOrigin, targetRoutes.find((item) => item.routeId === "request" && item.locale === locale), CONDITIONS[0], { stopAfter: "http500" }));
    const english = await runRequest(reactOrigin, requestRoute, CONDITIONS[0], { stopAfter: "http500" });
    for (const outcome of localized) assert.notEqual(outcome.http500.text, english.http500.text, "request status copy is localized");

    /* 5. Negative controls against the real shipped output. */
    const control = async (name, expected, run) => {
      await assert.rejects(run, (error) => error instanceof assert.AssertionError && expected.test(error.message), `browser control "${name}" was not rejected by its check`);
      counts.controls += 1;
      console.log(`[G-72 negative ${counts.controls}] ${name}`);
    };
    for (const [mode, contract] of [["copy", /innerHTML changed/], ["attribute", /attributes changed/], ["identity", /descendant identity changed/], ["text", /recoverable hydration error/]]) {
      await control(`hydration drift: ${mode}`, contract, async () => {
        const page = await browser.newPage();
        await prepare(page, CONDITIONS[0]);
        await page.goto(`${reactOrigin}${requestRoute.pathname}?sabotage=${mode}`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__m3305?.settled, { timeout: 15000 });
        const value = await page.evaluate(hydrationState);
        await page.close();
        assertHydration(value, `live ${mode} drift`);
      });
    }
    await control("a page controller that rewrites markup before hydration", /markup changed before hydration|innerHTML changed/, async () => {
      mutations.set("/js/request/form.js", (source) => `${source}\ndocument.querySelector("[data-request-status]").textContent = "ready";\n`);
      const page = await browser.newPage();
      await prepare(page, CONDITIONS[0]);
      await page.goto(`${mutatedOrigin}${requestRoute.pathname}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__m3305?.settled, { timeout: 15000 });
      const value = await page.evaluate(hydrationState);
      await page.close();
      assertHydration(value, "pre-hydration controller write");
    });
    const mutatedSuite = async (file, from, to, options) => {
      mutations.clear();
      mutations.set(file, (source) => { assert.equal(source.split(from).length, 2, `${file}: control target occurs exactly once`); return source.replace(from, () => to); });
      const outcome = await runRequest(mutatedOrigin, requestRoute, CONDITIONS[0], options);
      mutations.clear();
      return outcome;
    };
    await control("false success: the form treats every transport result as delivered", /an unconfirmed result must never display success/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "if (result.state === REQUEST_SUBMISSION_STATE.SUCCESS) {", "if (true) {"), "mutated form.js");
    });
    await control("false success: an HTTP 500 is read as accepted", /http500: an unconfirmed result must never display success/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/submission.js", "if (!response.ok) {", "if (false) {"), "mutated submission.js");
    });
    await control("false success: a body without ok:true is read as accepted", /(rejected|unconfirmed): an unconfirmed result must never display success/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/submission.js", "if (parsed.ok !== true) {", "if (false) {"), "mutated submission.js");
    });
    await control("false success: a timeout or network failure resolves as delivered", /(network|timeout): an unconfirmed result must never display success/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/submission.js", "    const timedOut =", "    return { state: REQUEST_SUBMISSION_STATE.SUCCESS, requestId };\n    const timedOut ="), "mutated submission.js");
    });
    await control("a form cleared after a failed delivery", /the visitor's entries are kept for a retry/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "          /* Form values are deliberately left intact so the user can retry. */", "          form.reset();"), "mutated form.js");
    });
    await control("duplicate controller initialization", /a duplicate submission while pending is not sent|exactly one request/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "  if (!form || form.__requestFormReady) return;", "  if (!form) return;\n  if (!form.__requestFormReady) setTimeout(setupProjectRequestForm, 0);"), "mutated form.js");
    });
    await control("a disabled duplicate-submission guard", /a duplicate submission while pending is not sent/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "    if (requestSubmitting) return;", ""), "mutated form.js");
    });
    await control("a disabled honeypot", /honeypot: nothing is sent/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "    if (honeypot || completedTooQuickly) {", "    if (completedTooQuickly) {"), "mutated form.js");
    });
    await control("a disabled minimum completion time", /tooQuick: nothing is sent/, async () => {
      assertRequestSuite(await mutatedSuite("/js/request/form.js", "    if (honeypot || completedTooQuickly) {", "    if (honeypot) {"), "mutated form.js");
    });
    await control("a layout change in the React document", /box (x|y|width|height) delta|computed style/, async () => {
      const route = targetRoutes.find((item) => item.routeId === "blog" && item.locale === registry.defaultLocale);
      mutations.set(route.pathname, (source) => source.replace("</head>", "<style>.experience-card{padding-top:40px}</style></head>").replace(/<\/main>/i, `</main>${PROBE}`));
      const snapshots = [];
      for (const origin of [legacyOrigin, mutatedOrigin]) {
        const page = await browser.newPage();
        await prepare(page, CONDITIONS[0]);
        await page.goto(`${origin}${route.pathname}`, { waitUntil: "load" });
        await settle(page, route.routeId);
        snapshots.push(await page.evaluate(snapshot));
        await page.close();
      }
      mutations.clear();
      assertParity(snapshots[0], snapshots[1], "mutated blog layout");
    });
    await control("localized copy missing after hydration", /rendered text/, async () => {
      const route = targetRoutes.find((item) => item.routeId === "certificates" && item.locale === "tr");
      const english = emittedOf(targetRoutes.find((item) => item.routeId === "certificates" && item.locale === registry.defaultLocale));
      mutations.set(route.pathname, () => english.replace(/<\/main>/i, `</main>${PROBE}`));
      const snapshots = [];
      for (const origin of [legacyOrigin, mutatedOrigin]) {
        const page = await browser.newPage();
        await prepare(page, CONDITIONS[0]);
        await page.goto(`${origin}${route.pathname}`, { waitUntil: "load" });
        await settle(page, route.routeId);
        snapshots.push(await page.evaluate(snapshot));
        await page.close();
      }
      mutations.clear();
      assertParity({ ...snapshots[0], title: snapshots[1].title, lang: snapshots[1].lang, selectedNav: snapshots[1].selectedNav, privacyHref: snapshots[1].privacyHref }, snapshots[1], "English certificates on the Turkish route");
    });
    console.log(`G-72 remaining-routes browser gate passed. ${counts.hydrated} hydrated documents (${targetRoutes.length} routes, English in desktop-dark and mobile-light) · ${counts.parity} accepted-vs-React final-DOM, computed-style and ±1px layout comparisons · ${counts.noScript} JS-disabled documents · ${counts.dialogs} certificate-dialog parity runs · ${counts.requestSuites} request-form parity runs through a mock transport (0 real submissions) · ${counts.shell} shell interactions · ${counts.controls} observed negative-control failures.`);
  } finally {
    await browser.close();
    await Promise.all([reactServer, legacyServer, mutatedServer].map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

try {
  if (!requestedRoot) await buildProductionSite({ outputDirectory: root });
  runStatic();
  if (!staticOnly) await runBrowser();
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
