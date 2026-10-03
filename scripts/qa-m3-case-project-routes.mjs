#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildProductionSite } from "./build-production-site.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";
import { ROOT, loadProjectRegistry } from "./i18n-catalog.mjs";
import { decodeHtml } from "./localized-html.mjs";

const CASE_IDS = new Set(["sinamaCaseStudy", "mergeRushCaseStudy", "joydayCaseStudy", "hospitalCaseStudy", "aiFlowPuzzleCaseStudy"]);
const LOCALES = ["en", "tr", "de", "es", "fr"];
const projects = loadProjectRegistry().projectDetails;
const slugs = Object.keys(projects);
const routes = canonicalReactRoutes();
const targetRoutes = routes.filter((route) => CASE_IDS.has(route.routeId) || route.kind === "project");
const requestedRoot = process.argv.includes("--root") ? path.resolve(process.argv[process.argv.indexOf("--root") + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-29-"));
const root = requestedRoot || path.join(temporary, "site");
const normalize = (value) => decodeHtml(String(value).replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/* Whitespace-sensitive copy: tags vanish without leaving a separator, so text
 * that the accepted document separates only by inter-node whitespace
 * ("</strong> text", "</a> <a>") must keep that whitespace in the React
 * markup. `normalize` cannot see such a loss; this can. */
const inlineCopy = (value) => decodeHtml(String(value).replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "")).replace(/[ \t\n\r\f]+/g, " ").trim();
const main = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
const meta = (html, pattern, attribute = "content") => html.match(pattern)?.[0].match(new RegExp(`${attribute}="([^"]*)"`, "i"))?.[1] || null;
const count = (html, pattern) => (html.match(pattern) || []).length;

function validateCoverage(records) {
  const cases = records.filter((route) => CASE_IDS.has(route.routeId));
  const details = records.filter((route) => route.kind === "project");
  assert.equal(cases.length, CASE_IDS.size * LOCALES.length, "five case studies across five locales");
  assert.equal(details.length, slugs.length * LOCALES.length, "every canonical slug across five locales");
  assert.deepEqual(new Set(cases.map((route) => route.routeId)), CASE_IDS, "case-study IDs");
  assert.deepEqual(new Set(records.map((route) => route.locale)), new Set(LOCALES), "active locale coverage");
  assert.equal(new Set(details.map((route) => `${route.locale}:${route.slug}`)).size, slugs.length * LOCALES.length, "unique locale/slug routes");
}

function validateCaseCopy(route, html, accepted) {
  assert.equal(normalize(main(html)), normalize(main(accepted)), `${route.pathname}: accepted case-study main copy`);
  assert.equal(inlineCopy(main(html)), inlineCopy(main(accepted)), `${route.pathname}: accepted inline whitespace`);
}

/* Accepted project pages declare their slug on <body>; project routing and
 * the AJOOP page context read it from there. */
function validateProjectIdentity(route, html) {
  assert.match(html, /data-project-detail=""[^>]*data-react-project-detail-owner="react"/, `${route.pathname}: project ownership marker`);
  const body = html.match(/<body\b[^>]*>/i)?.[0] || "";
  assert.match(body, /\bdata-page="projectDetail"/, `${route.pathname}: project page type`);
  assert.equal(body.match(/\bdata-project-slug="([^"]*)"/)?.[1] ?? null, route.slug, `${route.pathname}: body declares its project slug`);
}

function validateDocument(route, html) {
  assert.ok(html.startsWith("<!DOCTYPE html>"), `${route.pathname}: document doctype`);
  assert.match(html, /<main\b[^>]*data-react-main=""[^>]*data-prerendered="true"/, `${route.pathname}: SSR React main`);
  assert.ok(main(html).length > 1000, `${route.pathname}: meaningful static main`);
  assert.ok(!/Loading project|Please wait while the selected/.test(main(html)), `${route.pathname}: no loading shell`);
  assert.equal(meta(html, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"), `https://kaanbalci.com${route.pathname}`, `${route.pathname}: canonical`);
  assert.equal(count(html, /<link\b[^>]*rel="alternate"[^>]*>/gi), 6, `${route.pathname}: hreflang set`);
  assert.match(html, new RegExp(`<html lang="${route.locale === "en" ? "en" : route.locale}"[^>]*data-route-locale="${route.locale}"`), `${route.pathname}: document locale`);
  assert.equal(count(html, /<script\b[^>]*type="application\/ld\+json"/gi), 1, `${route.pathname}: JSON-LD`);
  assert.equal(count(html, /<script\b[^>]*type="module"[^>]*src="\/assets-react\//gi), 1, `${route.pathname}: one React client entry`);
  assert.ok(count(main(html), /<h1\b/gi) === 1, `${route.pathname}: one h1`);
  for (const tag of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    assert.match(tag[0], /rel="[^"]*noopener/, `${route.pathname}: external target safety`);
  }
}

async function run() {
  if (!requestedRoot) await buildProductionSite({ outputDirectory: root });
  validateCoverage(targetRoutes);
  let caseDocuments = 0;
  let projectDocuments = 0;
  for (const route of targetRoutes) {
    const file = path.join(root, route.output);
    assert.ok(fs.existsSync(file), `${route.pathname}: emitted document`);
    const html = fs.readFileSync(file, "utf8");
    validateDocument(route, html);
    if (CASE_IDS.has(route.routeId)) {
      const accepted = fs.readFileSync(path.join(ROOT, route.output), "utf8");
      validateCaseCopy(route, html, accepted);
      assert.doesNotMatch(html.match(/<body\b[^>]*>/i)?.[0] || "", /data-project-slug/, `${route.pathname}: a case study declares no project slug`);
      for (const tag of ["section", "article", "h2", "h3", "img", "a", "button"]) {
        assert.equal(count(main(html), new RegExp(`<${tag}\\b`, "gi")), count(main(accepted), new RegExp(`<${tag}\\b`, "gi")), `${route.pathname}: ${tag} structure count`);
      }
      caseDocuments += 1;
    } else {
      const record = projects[route.slug];
      validateProjectIdentity(route, html);
      const localizedTitle = route.locale === "en" ? record.title.en : JSON.parse(fs.readFileSync(path.join(ROOT, `data/i18n/packs/${route.locale}/projects.json`), "utf8"))[route.slug]?.title;
      assert.ok(normalize(main(html)).includes(decodeHtml(localizedTitle || record.title[route.locale])), `${route.pathname}: canonical localized title`);
      assert.ok(record.stack.every((item) => normalize(main(html)).includes(item) || route.locale !== "en"), `${route.pathname}: canonical stack`);
      const accepted = fs.readFileSync(path.join(ROOT, route.output), "utf8");
      const title = (source) => decodeHtml(source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
      assert.equal(title(html), title(accepted), `${route.pathname}: accepted title`);
      for (const pattern of [/<meta\b[^>]*name="description"[^>]*>/i, /<meta\b[^>]*property="og:description"[^>]*>/i]) {
        assert.equal(decodeHtml(meta(html, pattern) || ""), decodeHtml(meta(accepted, pattern) || ""), `${route.pathname}: accepted ${pattern.source}`);
      }
      assert.ok(/href="mailto:[^":]+@[^":]+"/.test(main(html)) && !/href="mailto:[^"]*mailto:/.test(html), `${route.pathname}: well-formed contact link`);
      projectDocuments += 1;
    }
  }

  for (const invalid of ["not-a-real-project", "../escape", "UPPERCASE", ""] ) {
    assert.equal(routes.some((route) => route.kind === "project" && route.slug === invalid), false, `invalid/unknown slug rejected: ${JSON.stringify(invalid)}`);
  }
  for (const page of routes.filter((route) => CASE_IDS.has(route.routeId) && route.locale === "en")) {
    const stub = fs.readFileSync(path.join(root, `${page.route.replace(/\/$/, "")}.html`), "utf8");
    assert.match(stub, new RegExp(`url=/${page.route}`), `${page.routeId}: compatibility redirect preserved`);
  }

  const bundleDir = path.join(root, "assets-react");
  const bundles = fs.readdirSync(bundleDir).filter((file) => file.endsWith(".js"));
  assert.equal(bundles.length, 1, "one shared React client bundle");
  const bundle = fs.readFileSync(path.join(bundleDir, bundles[0]));
  assert.ok(bundle.byteLength <= 260000, `client raw budget: ${bundle.byteLength} > 260000`);
  assert.ok(gzipSync(bundle).byteLength <= 72000, `client gzip budget: ${gzipSync(bundle).byteLength} > 72000`);
  assert.equal(bundle.includes(Buffer.from(slugs.join("|"))), false, "project registry is not embedded in the shared client bundle");

  let negativeControls = 0;
  /* Each control mutates a real emitted document (or the real route set), must
   * actually change it, and must be rejected by the one assertion it targets.
   * A mutation that matched nothing, or a failure for an unrelated reason,
   * is not an observed negative control. */
  const mustFail = (label, expected, action) => {
    assert.throws(action, (error) => error instanceof assert.AssertionError && expected.test(error.message), `${label}: negative control did not fail on its own assertion`);
    negativeControls += 1;
  };
  const mutated = (label, source, pattern, replacement) => {
    const result = source.replace(pattern, replacement);
    assert.notEqual(result, source, `${label}: negative-control mutation matched nothing`);
    return result;
  };
  mustFail("missing case route", /five case studies across five locales/, () => validateCoverage(targetRoutes.filter((route) => !(route.routeId === "sinamaCaseStudy" && route.locale === "de"))));
  mustFail("missing project route", /every canonical slug across five locales/, () => validateCoverage(targetRoutes.filter((route) => !(route.kind === "project" && route.locale === "fr" && route.slug === slugs[0]))));
  const representative = targetRoutes.find((route) => route.kind === "project" && route.locale === "en");
  const representativeHtml = fs.readFileSync(path.join(root, representative.output), "utf8");
  mustFail("wrong canonical", /: canonical$/m, () => validateDocument(representative, mutated("wrong canonical", representativeHtml, /(<link\b[^>]*rel="canonical"[^>]*href=")[^"]*"/i, '$1https://kaanbalci.com/projects/wrong/"')));
  mustFail("missing SSR content", /: meaningful static main$/m, () => validateDocument(representative, mutated("missing SSR content", representativeHtml, /(<main\b[^>]*>)[\s\S]*?<\/main>/i, "$1</main>")));
  mustFail("missing metadata", /: canonical$/m, () => validateDocument(representative, mutated("missing metadata", representativeHtml, /<link\b[^>]*rel="canonical"[^>]*>/i, "")));
  mustFail("missing project slug", /: body declares its project slug$/m, () => validateProjectIdentity(representative, mutated("missing project slug", representativeHtml, / data-project-slug="[^"]*"/, "")));
  mustFail("foreign project slug", /: body declares its project slug$/m, () => validateProjectIdentity(representative, mutated("foreign project slug", representativeHtml, / data-project-slug="[^"]*"/, ` data-project-slug="${slugs.find((slug) => slug !== representative.slug)}"`)));
  const whitespaceRoute = targetRoutes.find((route) => route.routeId === "mergeRushCaseStudy" && route.locale === "en");
  const whitespaceHtml = fs.readFileSync(path.join(root, whitespaceRoute.output), "utf8");
  const whitespaceAccepted = fs.readFileSync(path.join(ROOT, whitespaceRoute.output), "utf8");
  assert.match(main(whitespaceAccepted), /<\/strong>[ \t\n\r\f]+[^\s<]/, "accepted Merge Rush separates an inline element from text by whitespace only");
  mustFail("lost inline whitespace", /: accepted inline whitespace$/m, () => validateCaseCopy(whitespaceRoute, mutated("lost inline whitespace", whitespaceHtml, /(<main\b[\s\S]*?<\/strong>)[ \t\n\r\f]+(?=[^\s<])/i, "$1"), whitespaceAccepted));

  assert.match(fs.readFileSync(path.join(root, "sinama-case-study/index.html"), "utf8"), /<div class="evidence-explorer" data-sinama-evidence=""><\/div>/, "SINAMA evidence root is emitted empty for its runtime owner");

  const artifactFiles = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : artifactFiles.push(path.relative(root, path.join(dir, entry.name))));
  walk(root);
  console.log(`G-69 case/project route gate passed. ${caseDocuments} case-study + ${projectDocuments} project documents = ${targetRoutes.length} target routes · ${slugs.length} slugs × ${LOCALES.length} locales · artifact ${artifactFiles.length} files · client ${bundle.byteLength} B raw/${gzipSync(bundle).byteLength} B gzip · ${negativeControls} observed negative-control failures.`);
}

try { await run(); } finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
