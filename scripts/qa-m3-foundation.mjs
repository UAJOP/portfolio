#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry, loadProjectRegistry } from "./i18n-catalog.mjs";
import { loadSiteRoutes, validateSiteRoutes, loadRouteRuntime, absoluteRouteUrl } from "./site-routes.mjs";
import { canonicalReactRoutes, productionReactRoutes } from "./react-route-adapter.mjs";
import { requireSemanticMessage, resolveLocalizedData, resolveCanonicalLocalizedData } from "./shared-localization.mjs";
import { mergeProductionReactArtifact } from "./build-pages-artifact.mjs";
import { createSiteHeadRenderer } from "./site-head.mjs";
import os from "node:os";

const site = loadSiteRoutes();
const locales = loadRegistry();
const projects = loadProjectRegistry();
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };

for (const page of site.pages) check(page.renderer === "legacy", `${page.id} must remain legacy-owned in #25-A`);
check(site.projects.renderer === "legacy", "project route family must remain legacy-owned in #25-A");
for (const companion of site.companions) check(companion.renderer === "legacy", `${companion.id} must remain legacy-owned in #25-A`);

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/routes.json"), "utf8"));
fixture.pages[0].renderer = "unknown";
assertions += 1;
assert.throws(() => validateSiteRoutes(fixture), /renderer must be one of legacy, react/);

const routes = canonicalReactRoutes({ site, locales, projects });
const expectedLocales = ["en", "tr", "de", "es", "fr"];
for (const locale of expectedLocales) {
  const home = routes.find((route) => route.id === "home" && route.locale === locale);
  const prefix = locale === "en" ? "" : `${locale}/`;
  check(home?.pathname === `/${prefix}`, `${locale} home path must be canonical`);
  const typoProject = routes.find((route) => route.slug === "pyhton-projects" && route.locale === locale);
  check(typoProject?.pathname === `/${prefix}projects/pyhton-projects/`, `${locale} must preserve pyhton-projects`);
}
check(productionReactRoutes({ site, locales, projects }).length === 0, "#25-A must emit zero React-owned production routes");

const runtime = loadRouteRuntime(locales, site);
const headRenderer = createSiteHeadRenderer({
  registry: locales,
  indexableLocales: (locales.localizedRoutes?.indexable || []).filter((id) => id !== locales.defaultLocale),
  absoluteFor: (route, locale) => absoluteRouteUrl(runtime, route, locale, site.origin),
});
const homeSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const homeRoute = site.pages.find((page) => page.id === "home");
check(
  headRenderer.buildEnglishDocument({ route: { page: homeRoute.route }, file: homeRoute.source, indexable: true, source: homeSource }) === homeSource,
  "shared head renderer must leave accepted English Home bytes unchanged",
);

assertions += 1;
assert.throws(() => requireSemanticMessage({}, "nav.home", { locale: "de" }), /missing required semantic key/);
check(requireSemanticMessage({ "nav.home": "Startseite" }, "nav.home", { locale: "de" }) === "Startseite", "semantic message resolves");
check(resolveLocalizedData({ locale: "de", path: "profile.title", localizedValue: "Titel" }) === "Titel", "localized data resolves");
check(resolveLocalizedData({ locale: "de", path: "project.year", neutralValue: 2026, languageNeutral: true }) === 2026, "neutral data resolves explicitly");
assertions += 1;
assert.throws(
  () => resolveLocalizedData({ locale: "de", path: "profile.title", neutralValue: "English" }),
  /missing required localized value/,
);
check(
  resolveCanonicalLocalizedData({
    canonical: { title: { en: "Title", tr: "Başlık" } },
    overlay: { title: "Titel" },
    path: "title",
    locale: "de",
  }) === "Titel",
  "canonical data helper uses the reviewed locale overlay",
);
assertions += 1;
assert.throws(
  () => resolveCanonicalLocalizedData({ canonical: { title: { en: "Title" } }, path: "title", locale: "de" }),
  /missing required localized value/,
);

const clobberFixture = fs.mkdtempSync(path.join(os.tmpdir(), "m3-clobber-"));
const clobberOutput = fs.mkdtempSync(path.join(os.tmpdir(), "m3-output-"));
try {
  fs.writeFileSync(path.join(clobberFixture, "index.html"), "not allowed", "utf8");
  assertions += 1;
  assert.throws(() => mergeProductionReactArtifact(clobberOutput, clobberFixture), /not owned by a React route/);
} finally {
  fs.rmSync(clobberFixture, { recursive: true, force: true });
  fs.rmSync(clobberOutput, { recursive: true, force: true });
}

const serverEntry = fs.readFileSync(path.join(ROOT, "src/react/entry-server.jsx"), "utf8");
for (const browserOnly of ["window", "document", "localStorage", "matchMedia"]) {
  check(!new RegExp(`\\b${browserOnly}\\b`).test(serverEntry), `SSR entry must not read ${browserOnly}`);
}

console.log(`Master 3 #25-A foundation QA passed. ${assertions} assertions · ${routes.length} canonical locale records · 0 React-owned production routes.`);
