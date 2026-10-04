#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, buildCatalog, contentRegistryPath, loadRegistry, loadProjectRegistry } from "./i18n-catalog.mjs";
import { loadSiteRoutes, validateSiteRoutes, loadRouteRuntime, absoluteRouteUrl } from "./site-routes.mjs";
import { canonicalReactRoutes, productionReactRoutes } from "./react-route-adapter.mjs";
import { requireSemanticMessage, resolveLocalizedData, resolveCanonicalLocalizedData } from "./shared-localization.mjs";
import { mergeProductionReactArtifact } from "./build-pages-artifact.mjs";
import { attestReactBuild } from "./react-build-provenance.mjs";
import { loadArtifactConfig, validateReactBundleNamespace } from "./public-artifact-config.mjs";
import { verifyProductionGeneratedState } from "./verify-production-generated.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import { executePreviewSsrBundle } from "./prerender-react.mjs";
import { createSiteHeadRenderer } from "./site-head.mjs";
import os from "node:os";

const site = loadSiteRoutes();
const locales = loadRegistry();
const projects = loadProjectRegistry();
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };

const catalog = buildCatalog();
check(catalog.entries.some((entry) => entry.domain === "content" && entry.key === "profile.availability"), "ordinary localized scalar fields use the canonical registry path");
check(catalog.entries.some((entry) => entry.domain === "content" && entry.key === "projects.mergeRush.proof[0]"), "array-valued English fields use the canonical registry path");
const buildLog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/build-log.json"), "utf8"));
const stableBuildLogPath = contentRegistryPath("data/portfolio/build-log.json", "[0].title", buildLog);
check(stableBuildLogPath === `buildLogById.${buildLog[0].id}.title`, "build-log paths use stable ids");
const reorderedBuildLog = [...buildLog].reverse();
const reorderedIndex = reorderedBuildLog.findIndex((entry) => entry.id === buildLog[0].id);
check(contentRegistryPath("data/portfolio/build-log.json", `[${reorderedIndex}].title`, reorderedBuildLog) === stableBuildLogPath, "build-log reordering preserves translation authority");

for (const page of site.pages) {
  const expected = new Set(["home", "about", "works", "games", "sinamaCaseStudy", "mergeRushCaseStudy", "joydayCaseStudy", "hospitalCaseStudy", "aiFlowPuzzleCaseStudy", "labs", "adventure", "joydayPaint", "aiFlowPuzzle", "now", "blog", "certificates", "request", "privacy"]).has(page.id) ? "react" : "legacy";
  check(page.renderer === expected, `${page.id} must have the approved #30.5 renderer`);
}
check(site.projects.renderer === "react", "project route family must be React-owned in #29");
for (const companion of site.companions) check(companion.renderer === "legacy", `${companion.id} must remain legacy-owned in #25-A`);

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/routes.json"), "utf8"));
fixture.pages[0].renderer = "unknown";
assertions += 1;
assert.throws(() => validateSiteRoutes(fixture), /renderer must be one of legacy, react/);

const routes = canonicalReactRoutes({ site, locales, projects });
const activeLocaleCount = locales.activeLocales.length;
const expectedReactRouteCount = (site.pages.filter((page) => page.renderer === "react").length
  + (site.projects.renderer === "react" ? Object.keys(projects.projectDetails).length : 0)) * activeLocaleCount;
const runtime = loadRouteRuntime(locales, site);
const expectedLocales = ["en", "tr", "de", "es", "fr"];
for (const locale of expectedLocales) {
  const home = routes.find((route) => route.id === "home" && route.locale === locale);
  const prefix = locale === "en" ? "" : `${locale}/`;
  check(home?.pathname === `/${prefix}`, `${locale} home path must be canonical`);
  const typoProject = routes.find((route) => route.slug === "pyhton-projects" && route.locale === locale);
  check(typoProject?.pathname === `/${prefix}projects/pyhton-projects/`, `${locale} must preserve pyhton-projects`);
}
check(productionReactRoutes({ site, locales, projects }).length === expectedReactRouteCount, "React document count must derive from the route, locale and project registries");
for (const route of routes) {
  const expected = route.kind === "companion"
    ? `${route.locale === locales.defaultLocale ? "" : runtime.localeRoutePrefix(route.locale)}${route.route}`
    : runtime.documentPathFor(route.kind === "project" ? `projects/${route.slug}/` : route.route, route.locale);
  check(route.output === expected, `${route.locale}:${route.id} adapter output must agree with documentPathFor`);
}

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

const mixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "m3-mixed-fixtures-"));
const artifactConfig = loadArtifactConfig();
const syntheticRoutes = [
  { id: "synthetic-react", output: "synthetic/index.html", renderer: "react" },
  { id: "synthetic-legacy", output: "legacy/index.html", renderer: "legacy" },
];
let fixtureId = 0;
const runMergeFixture = ({ files, routes = syntheticRoutes, seedOutput = {} }) => {
  fixtureId += 1;
  const reactOutput = path.join(mixedRoot, `react-${fixtureId}`);
  const output = path.join(mixedRoot, `artifact-${fixtureId}`);
  fs.mkdirSync(reactOutput, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(reactOutput, relative)), { recursive: true });
    fs.writeFileSync(path.join(reactOutput, relative), content, "utf8");
  }
  for (const [relative, content] of Object.entries(seedOutput)) {
    fs.mkdirSync(path.dirname(path.join(output, relative)), { recursive: true });
    fs.writeFileSync(path.join(output, relative), content, "utf8");
  }
  const proof = attestReactBuild({ output: reactOutput, routes: routes.filter((route) => route.renderer === "react") });
  return { output, proof, merge: () => mergeProductionReactArtifact(output, proof, { routeRecords: routes, config: artifactConfig }) };
};

try {
  const overwrite = runMergeFixture({
    files: { "synthetic/index.html": "react canonical" },
    seedOutput: { "synthetic/index.html": "legacy canonical" },
  });
  overwrite.merge();
  check(fs.readFileSync(path.join(overwrite.output, "synthetic/index.html"), "utf8") === "react canonical", "React may overwrite its canonical document");

  for (const [relative, expected] of [
    ["legacy/index.html", /not owned by a React route/],
    ["legacy.html", /not owned by a React route/],
    ["unexpected.txt", /not owned by a React route/],
    ["assets/legacy.js", /not owned by a React route/],
  ]) {
    const rejected = runMergeFixture({ files: { "synthetic/index.html": "ok", [relative]: "not allowed" } });
    assertions += 1;
    assert.throws(rejected.merge, expected, `${relative} must be rejected`);
  }

  const missing = runMergeFixture({ files: {} });
  assertions += 1;
  assert.throws(missing.merge, /React-owned production route was not emitted/);

  assertions += 1;
  assert.throws(
    () => mergeProductionReactArtifact(missing.output, null, { routeRecords: syntheticRoutes, config: artifactConfig }),
    /require output proven by the current build invocation/,
    "a React-owned route without a current proof must fail",
  );

  const mismatchedProof = runMergeFixture({
    files: { "synthetic/index.html": "react canonical" },
    routes: [{ id: "different-react", output: "different/index.html", renderer: "react" }, syntheticRoutes[1]],
  });
  assertions += 1;
  assert.throws(
    () => mergeProductionReactArtifact(mismatchedProof.output, mismatchedProof.proof, { routeRecords: syntheticRoutes, config: artifactConfig }),
    /does not match the current React-owned route set/,
    "a proof route set different from current ownership must fail",
  );

  const zeroOwnedBundle = runMergeFixture({
    files: { [`${artifactConfig.reactBundleDirectory}/app.js`]: "bundle" },
    routes: syntheticRoutes.map((route) => ({ ...route, renderer: "legacy" })),
  });
  assertions += 1;
  assert.throws(zeroOwnedBundle.merge, /bundle with no React-owned routes/);

  const compatibilityStub = runMergeFixture({
    files: { "synthetic/index.html": "ok", "tr/works.html": "stub" },
  });
  assertions += 1;
  assert.throws(compatibilityStub.merge, /not owned by a React route/);

  const bundle = runMergeFixture({ files: {
    "synthetic/index.html": "react canonical",
    [`${artifactConfig.reactBundleDirectory}/app.js`]: "bundle",
  } });
  bundle.merge();
  check(fs.existsSync(path.join(bundle.output, artifactConfig.reactBundleDirectory, "app.js")), "namespaced React bundle is accepted");

  const collision = runMergeFixture({
    files: { "synthetic/index.html": "ok", [`${artifactConfig.reactBundleDirectory}/app.js`]: "react" },
    seedOutput: { [`${artifactConfig.reactBundleDirectory}/app.js`]: "legacy" },
  });
  assertions += 1;
  assert.throws(collision.merge, /overwrite an existing legacy artifact/);

  assertions += 1;
  assert.throws(
    () => mergeProductionReactArtifact(collision.output, { output: path.join(mixedRoot, "stale"), files: [], routes: [], hashes: {} }, { routeRecords: syntheticRoutes, config: artifactConfig }),
    /stale or unproven/,
  );

  const modified = runMergeFixture({ files: { "synthetic/index.html": "attested" } });
  fs.writeFileSync(path.join(modified.proof.output, "synthetic/index.html"), "changed after build", "utf8");
  assertions += 1;
  assert.throws(modified.merge, /changed after it was built/);

  assertions += 1;
  assert.throws(
    () => verifyProductionGeneratedState({ runner: () => ({ status: 1, stdout: "", stderr: "" }) }),
    /failed closed/,
  );

  let laterBuildStageReached = false;
  assertions += 1;
  await assert.rejects(
    () => buildProductionSite({
      verifyGenerated: () => { throw new Error("synthetic stale generated state"); },
      buildReact: async () => { laterBuildStageReached = true; },
      buildArtifact: () => { laterBuildStageReached = true; },
    }),
    /stale generated state/,
  );
  check(!laterBuildStageReached, "build:site must stop before React or artifact build when generated state is stale");

  assertions += 1;
  assert.throws(() => validateReactBundleNamespace({ ...artifactConfig, reactBundleDirectory: "../escape" }), /safe relative directory/);
  assertions += 1;
  assert.throws(() => validateReactBundleNamespace({ ...artifactConfig, reactBundleDirectory: "assets" }), /legacy browser directory/);
  assertions += 1;
  assert.throws(
    () => validateReactBundleNamespace({ ...artifactConfig, reactBundleDirectory: "synthetic" }, { reservedFiles: ["synthetic/index.html"] }),
    /legacy artifact path/,
  );
} finally {
  fs.rmSync(mixedRoot, { recursive: true, force: true });
}

const ssrExecutionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "m3-ssr-boundary-"));
try {
  await executePreviewSsrBundle({ outputDirectory: ssrExecutionRoot });
  check(true, "the complete SSR import graph must bundle, load, and render without browser globals");
} finally {
  fs.rmSync(ssrExecutionRoot, { recursive: true, force: true });
}

console.log(`Master 3 #30.5 foundation QA passed. ${assertions} assertions · ${routes.length} canonical locale records · ${expectedReactRouteCount} registry-derived React-owned production routes.`);
