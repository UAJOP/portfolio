#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyPagesArtifact, listFiles } from "./build-pages-artifact.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";
import { loadSiteRoutes } from "./site-routes.mjs";
import { loadArtifactConfig } from "./public-artifact-config.mjs";
import {
  BINARY_NORMALIZATION,
  TEXT_EOL_NORMALIZATION,
  artifactDigest,
  canonicalArtifactBytes,
  compareArtifactManifest,
  validateArtifactManifest,
} from "./artifact-parity.mjs";
import { WORKS_GAMES_REVIEWED_EDITS, acceptedBaseOf } from "./m3-26-public-edits.mjs";
import { RECRUITER_BUILD_LOG_REVIEWED_EDITS, recruiterBuildLogAcceptedBase } from "./m3-27-public-edits.mjs";
import { AJOOP_COMMAND_REVIEWED_EDITS, ajoopCommandAcceptedBase } from "./m3-28-public-edits.mjs";
import { CASE_PROJECT_REVIEWED_EDITS, caseProjectAcceptedBase } from "./m3-29-public-edits.mjs";
import { HOME_ABOUT_DOCUMENTS, acceptedArtifactManifest, acceptedHomeAboutHash, bundleNormalized, digest } from "./m3-26-accepted-snapshot.mjs";
import { assertHomeAboutPayload } from "./m3-25b-home-about-payload.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "data/site/m3-25a-accepted-artifact.json");
const PUBLIC_DELTA_FILE = path.join(ROOT, "data/site/m3-25b-public-delta.json");
const WORKS_GAMES_DELTA_FILE = path.join(ROOT, "data/site/m3-26-public-delta.json");
const RECRUITER_BUILD_LOG_DELTA_FILE = path.join(ROOT, "data/site/m3-27-public-delta.json");
const AJOOP_COMMAND_DELTA_FILE = path.join(ROOT, "data/site/m3-28-public-delta.json");
const ACCEPTED_BASE = "6ca0910ea330d25dcb3873f8b84047666de67fb6";
const ACCEPTED_DELTA = "4d0e37b496f70d851397d9976b2022350d11edd6";
const WORKS_GAMES_ACCEPTED_BASE = "24be2f8159a0925dc00f29375ea8740738214df3";
const RECRUITER_BUILD_LOG_ACCEPTED_BASE = "df39ea32f34eacf1ee68ee6d0c8b6d464eb7d6d8";
const AJOOP_COMMAND_ACCEPTED_BASE = "0543fce4537d5f3d6c90c46cca1eb3d442c7fb8c";
const APPROVED_GENERATED_CHANGES = new Set([
  "i18n/pack-de-core.js",
  "i18n/pack-es-core.js",
  "i18n/pack-fr-core.js",
  "i18n/pack-tr-core.js",
  "js/core/locale.js",
  "js/core/i18n-runtime.js",
  "js/features/creative.js",
  "portfolio-v2.js",
]);
const APPROVED_WORKS_GAMES_CHANGES = new Set(Object.keys(WORKS_GAMES_REVIEWED_EDITS));
const APPROVED_RECRUITER_BUILD_LOG_CHANGES = new Set(Object.keys(RECRUITER_BUILD_LOG_REVIEWED_EDITS));
const APPROVED_AJOOP_COMMAND_CHANGES = new Set(Object.keys(AJOOP_COMMAND_REVIEWED_EDITS));
const APPROVED_CASE_PROJECT_CHANGES = new Set(Object.keys(CASE_PROJECT_REVIEWED_EDITS));
const PHASE_26_PAGE_IDS = new Set(["home", "about", "works", "games"]);
const PHASE_29_CASE_STUDY_IDS = new Set(["sinamaCaseStudy", "mergeRushCaseStudy", "joydayCaseStudy", "hospitalCaseStudy", "aiFlowPuzzleCaseStudy"]);

/* A file a later phase edited again is checked against an earlier phase by
 * first reversing the later phase's reviewed edits. */
const beforeCaseProject = (file, content) => (CASE_PROJECT_REVIEWED_EDITS[file] ? caseProjectAcceptedBase(file, content) : content);
const beforeAjoopCommand = (file, content) => {
  const current = beforeCaseProject(file, content);
  return AJOOP_COMMAND_REVIEWED_EDITS[file] ? ajoopCommandAcceptedBase(file, current) : current;
};

function assertReviewedWorksGamesDelta(directory, edits = WORKS_GAMES_REVIEWED_EDITS) {
  const accepted = acceptedArtifactManifest();
  for (const file of Object.keys(edits)) {
    const current = beforeAjoopCommand(file, fs.readFileSync(path.join(directory, file), "utf8"));
    const beforeRecruiterBuildLog = RECRUITER_BUILD_LOG_REVIEWED_EDITS[file]
      ? recruiterBuildLogAcceptedBase(file, current)
      : current;
    const base = acceptedBaseOf(file, beforeRecruiterBuildLog, edits[file]);
    assert.equal(digest(base), accepted.get(file)?.sha256, `${file}: #26 delta is not exactly the accepted base plus reviewed edits`);
  }
}

function assertReviewedRecruiterBuildLogDelta(directory, edits = RECRUITER_BUILD_LOG_REVIEWED_EDITS) {
  const accepted = acceptedArtifactManifest();
  for (const file of Object.keys(edits)) {
    const base = recruiterBuildLogAcceptedBase(file, beforeAjoopCommand(file, fs.readFileSync(path.join(directory, file), "utf8")), edits[file]);
    const layered = worksGamesDelta?.files.find((entry) => entry.path === file)
      || publicDelta?.files.find((entry) => entry.path === file)
      || accepted.get(file);
    assert.equal(digest(base), layered?.sha256, `${file}: #27 delta is not exactly the accepted base plus reviewed edits`);
  }
}

function assertReviewedAjoopCommandDelta(directory, edits = AJOOP_COMMAND_REVIEWED_EDITS) {
  const accepted = acceptedArtifactManifest();
  for (const file of Object.keys(edits)) {
    const base = ajoopCommandAcceptedBase(file, beforeCaseProject(file, fs.readFileSync(path.join(directory, file), "utf8")), edits[file]);
    const layered = recruiterBuildLogDelta?.files.find((entry) => entry.path === file)
      || worksGamesDelta?.files.find((entry) => entry.path === file)
      || publicDelta?.files.find((entry) => entry.path === file)
      || accepted.get(file);
    assert.equal(digest(base), layered?.sha256, `${file}: #28 delta is not exactly the accepted base plus reviewed edits`);
  }
}

function assertReviewedCaseProjectDelta(directory, edits = CASE_PROJECT_REVIEWED_EDITS) {
  const accepted = acceptedArtifactManifest();
  for (const file of Object.keys(edits)) {
    const base = caseProjectAcceptedBase(file, fs.readFileSync(path.join(directory, file), "utf8"), edits[file]);
    const layered = ajoopCommandDelta?.files.find((entry) => entry.path === file)
      || recruiterBuildLogDelta?.files.find((entry) => entry.path === file)
      || worksGamesDelta?.files.find((entry) => entry.path === file)
      || publicDelta?.files.find((entry) => entry.path === file)
      || accepted.get(file);
    assert.equal(digest(base), layered?.sha256, `${file}: #29 delta is not exactly the accepted prior phase plus reviewed edits`);
  }
}

/* #28 adds the Ajoop shell and Command Palette roots after the footer and
 * their payloads; prior-phase document parity is checked without them. */
function withoutOverlayOwnership(html) {
  const rootStart = html.indexOf('<div id="react-ajoop-root"');
  const scriptsStart = html.indexOf('<script src="/portfolio-data.js"', rootStart);
  assert.ok(rootStart >= 0 && scriptsStart > rootStart, "#28 overlay SSR boundary is missing");
  assert.ok(html.slice(rootStart, scriptsStart).includes('<div id="react-command-root"'), "#28 Command Palette root is missing");
  let stripped = `${html.slice(0, rootStart)}${html.slice(scriptsStart)}`;
  for (const id of ["react-ajoop-props", "react-command-props"]) {
    const payload = new RegExp(`<script id="${id}" type="application/json">[\\s\\S]*?</script>`);
    assert.match(stripped, payload, `#28 ${id} payload is missing`);
    stripped = stripped.replace(payload, "");
  }
  return stripped;
}

function withoutRecruiterOwnership(html) {
  const rootStart = html.indexOf('<div id="react-recruiter-root"');
  const footerStart = html.indexOf('<footer class="site-footer">', rootStart);
  assert.ok(rootStart >= 0 && footerStart > rootStart, "#27 recruiter SSR boundary is missing");
  const withoutRoot = `${html.slice(0, rootStart)}${html.slice(footerStart)}`;
  const payload = /<script id="react-recruiter-props" type="application\/json">[\s\S]*?<\/script>/;
  assert.match(withoutRoot, payload, "#27 recruiter payload is missing");
  return withoutRoot.replace(payload, "");
}

const localeCountOf = (routes) => new Set(routes.map((route) => route.locale)).size;
/* #29 owns exactly the five approved case studies and the project route
 * family. A React route outside the approved phases is not excused here. */
const isPhase29Route = (route) => route.kind === "project" || PHASE_29_CASE_STUDY_IDS.has(route.routeId);

/** The React ownership the artifact may have: the #25-B/#26 pages plus #29. */
function assertApprovedReactOwnership(routes) {
  const migratedDocuments = new Set(routes.filter((route) => PHASE_26_PAGE_IDS.has(route.routeId)).map((route) => route.output));
  const phase29Documents = new Set(routes.filter(isPhase29Route).map((route) => route.output));
  assert.equal(migratedDocuments.size, 20, "parity model requires exactly 20 migrated Home/About/Works/Games documents");
  const projectSlugCount = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/project-details.json"), "utf8"))).length;
  assert.equal(phase29Documents.size, (PHASE_29_CASE_STUDY_IDS.size + projectSlugCount) * localeCountOf(routes), "#29 must cover the five case studies and every canonical project slug in every locale");
  assert.deepEqual(routes.filter((route) => !PHASE_26_PAGE_IDS.has(route.routeId) && !isPhase29Route(route)).map((route) => route.output), [], "every React document must belong to an approved migration phase");
  return { migratedDocuments, phase29Documents };
}

function assertClean(label, result) {
  if (!result.missing.length && !result.extra.length && !result.changed.length) return;
  throw new Error([
    `${label} failed`,
    ...result.missing.map((file) => `missing: ${file}`),
    ...result.extra.map((file) => `extra: ${file}`),
    ...result.changed.map((file) => `changed: ${file}`),
  ].join("\n"));
}

function testCanonicalEolContract(temp) {
  const fixture = path.join(temp, "eol-fixture");
  fs.mkdirSync(fixture, { recursive: true });
  const textPath = path.join(fixture, "fixture.txt");
  const binaryPath = path.join(fixture, "fixture.bin");
  fs.writeFileSync(textPath, Buffer.from("alpha\nbeta\n", "utf8"));
  fs.writeFileSync(binaryPath, Buffer.from([0x00, 0x01, 0x02]));
  const manifest = {
    files: [
      { path: "fixture.txt", normalization: TEXT_EOL_NORMALIZATION, sha256: artifactDigest(textPath, TEXT_EOL_NORMALIZATION) },
      { path: "fixture.bin", normalization: BINARY_NORMALIZATION, sha256: artifactDigest(binaryPath, BINARY_NORMALIZATION) },
    ],
  };

  let assertions = 0;
  const compare = (files = listFiles(fixture)) => compareArtifactManifest(manifest, fixture, files);
  fs.writeFileSync(textPath, Buffer.from("alpha\r\nbeta\r\n", "utf8"));
  assertions += 1;
  assert.doesNotThrow(() => assertClean("EOL fixture", compare()), "LF and CRLF text must be parity-equivalent");

  fs.writeFileSync(textPath, Buffer.from("alpha changed\r\nbeta\r\n", "utf8"));
  assertions += 1;
  assert.throws(() => assertClean("content fixture", compare()), /changed: fixture\.txt/, "changed text content must fail parity");

  fs.writeFileSync(textPath, Buffer.from("alpha \r\nbeta\r\n", "utf8"));
  assertions += 1;
  assert.throws(() => assertClean("whitespace fixture", compare()), /changed: fixture\.txt/, "non-EOL whitespace changes must fail parity");

  fs.writeFileSync(textPath, Buffer.from("alpha\rbeta\n", "utf8"));
  assertions += 1;
  assert.throws(() => assertClean("lone CR fixture", compare()), /changed: fixture\.txt/, "lone CR bytes must remain exact");

  fs.writeFileSync(textPath, Buffer.from([0x61, 0x6c, 0x70, 0x68, 0x61, 0x0a, 0x62, 0x65, 0x74, 0x61, 0x0a, 0xff]));
  assertions += 1;
  assert.throws(() => assertClean("non UTF-8 fixture", compare()), /changed: fixture\.txt/, "non-CRLF bytes in text files must remain exact");

  fs.writeFileSync(textPath, Buffer.from("alpha\nbeta\n", "utf8"));
  fs.writeFileSync(binaryPath, Buffer.from([0x00, 0x01, 0x03]));
  assertions += 1;
  assert.throws(() => assertClean("binary fixture", compare()), /changed: fixture\.bin/, "changed binary bytes must fail parity");

  fs.rmSync(binaryPath);
  assertions += 1;
  assert.throws(() => assertClean("missing fixture", compare()), /missing: fixture\.bin/, "missing files must fail parity");

  fs.writeFileSync(binaryPath, Buffer.from([0x00, 0x01, 0x02]));
  fs.writeFileSync(path.join(fixture, "extra.txt"), "extra\n", "utf8");
  assertions += 1;
  assert.throws(() => assertClean("extra fixture", compare()), /extra: extra\.txt/, "extra files must fail parity");
  return assertions;
}

const baseline = validateArtifactManifest(
  JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")),
  ACCEPTED_BASE,
);
const publicDelta = validateArtifactManifest(
  JSON.parse(fs.readFileSync(PUBLIC_DELTA_FILE, "utf8")),
  ACCEPTED_DELTA,
);
const worksGamesDelta = validateArtifactManifest(
  JSON.parse(fs.readFileSync(WORKS_GAMES_DELTA_FILE, "utf8")),
  WORKS_GAMES_ACCEPTED_BASE,
);
const recruiterBuildLogDelta = validateArtifactManifest(
  JSON.parse(fs.readFileSync(RECRUITER_BUILD_LOG_DELTA_FILE, "utf8")),
  RECRUITER_BUILD_LOG_ACCEPTED_BASE,
);
const ajoopCommandDelta = validateArtifactManifest(
  JSON.parse(fs.readFileSync(AJOOP_COMMAND_DELTA_FILE, "utf8")),
  AJOOP_COMMAND_ACCEPTED_BASE,
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-parity-"));
const legacy = path.join(temp, "legacy");
const mixed = path.join(temp, "mixed");

try {
  const fixtureAssertions = testCanonicalEolContract(temp);
  buildLegacyPagesArtifact(legacy);
  await buildProductionSite({ outputDirectory: mixed });

  const productionRoutes = productionReactRoutes();
  const { migratedDocuments, phase29Documents } = assertApprovedReactOwnership(productionRoutes);
  /* Negative control through the real path: flip one unapproved page to
   * `renderer: "react"` in a copy of the validated registry, let the production
   * route adapter derive its records, and require the same ownership check the
   * real artifact passes above to reject them on the unapproved-phase assertion. */
  const liveSite = loadSiteRoutes();
  const unauthorizedSite = { ...liveSite, pages: liveSite.pages.map((page) => (page.id === "labs" ? { ...page, renderer: "react" } : page)) };
  assert.equal(liveSite.pages.find((page) => page.id === "labs")?.renderer, "legacy", "the ownership control needs a route that is not React-owned today");
  const unauthorizedRoutes = productionReactRoutes({ site: unauthorizedSite });
  assert.equal(unauthorizedRoutes.length, productionRoutes.length + localeCountOf(productionRoutes), "the adapter must derive the unauthorized route in every locale");
  assert.throws(
    () => assertApprovedReactOwnership(unauthorizedRoutes),
    (error) => error instanceof assert.AssertionError && /every React document must belong to an approved migration phase/.test(error.message) && error.actual.includes("labs/index.html") && error.actual.includes("tr/labs/index.html"),
    "#29 ownership control: an unauthorized React route was not rejected by the ownership check",
  );
  const bundlePrefix = `${loadArtifactConfig().reactBundleDirectory}/`;
  const allowed = new Set([...migratedDocuments, ...phase29Documents, ...APPROVED_GENERATED_CHANGES, ...APPROVED_WORKS_GAMES_CHANGES, ...APPROVED_RECRUITER_BUILD_LOG_CHANGES, ...APPROVED_AJOOP_COMMAND_CHANGES, ...APPROVED_CASE_PROJECT_CHANGES]);
  const finalFiles = listFiles(mixed);
  const pinnedManifest = { files: baseline.files.filter((entry) => !allowed.has(entry.path)) };
  const pinnedFiles = finalFiles.filter((file) => !allowed.has(file) && !file.startsWith(bundlePrefix));
  const accepted = compareArtifactManifest(pinnedManifest, mixed, pinnedFiles);
  assertClean("unchanged #25-A artifact protection", accepted);

  const extras = finalFiles.filter((file) => !baseline.files.some((entry) => entry.path === file));
  assert.ok(extras.length > 0 && extras.every((file) => file.startsWith(bundlePrefix)), "only namespaced React bundles may be new files");
  for (const relative of migratedDocuments) {
    const previous = baseline.files.find((entry) => entry.path === relative);
    assert.ok(previous, `migrated document is absent from #25-A baseline: ${relative}`);
    assert.notEqual(artifactDigest(path.join(mixed, relative), previous.normalization), previous.sha256, `migrated document did not change: ${relative}`);
  }
  assert.deepEqual(publicDelta.files.map((entry) => entry.path).sort(), [...APPROVED_GENERATED_CHANGES].sort(), "public delta must cover the exact eight approved paths");
  /* A #25-B path that #26 edits again is layered, not re-pinned: its #25-B
   * hash must still describe the bytes at the #26 acceptance commit, and the
   * reviewed-edit check below derives the current bytes from exactly those. */
  const supersededByWorksGames = [...APPROVED_GENERATED_CHANGES].filter((file) => APPROVED_WORKS_GAMES_CHANGES.has(file));
  assert.deepEqual(supersededByWorksGames, ["js/core/i18n-runtime.js"], "#26 may layer onto exactly one #25-B public path");
  const supersededByRecruiterBuildLog = [...APPROVED_GENERATED_CHANGES].filter((file) => APPROVED_RECRUITER_BUILD_LOG_CHANGES.has(file));
  assert.deepEqual(supersededByRecruiterBuildLog, ["js/core/i18n-runtime.js", "portfolio-v2.js"], "#27 may layer onto exactly two #25-B public paths");
  const supersededByAjoopCommand = [...APPROVED_GENERATED_CHANGES].filter((file) => APPROVED_AJOOP_COMMAND_CHANGES.has(file));
  assert.deepEqual(supersededByAjoopCommand, ["js/core/i18n-runtime.js"], "#28 may layer onto exactly one #25-B public path");
  const delta = compareArtifactManifest(
    { files: publicDelta.files.filter((entry) => !supersededByWorksGames.includes(entry.path) && !supersededByRecruiterBuildLog.includes(entry.path)) },
    mixed,
    [...APPROVED_GENERATED_CHANGES].filter((file) => !supersededByWorksGames.includes(file) && !supersededByRecruiterBuildLog.includes(file)),
  );
  assertClean("accepted #25-B public delta", delta);
  /* The superseded path is covered by assertReviewedWorksGamesDelta below:
   * its reversed bytes must equal the #25-B pin exactly. */
  for (const file of supersededByWorksGames) {
    assert.equal(acceptedArtifactManifest().get(file)?.sha256, publicDelta.files.find((entry) => entry.path === file).sha256, `${file}: #26 base must be the #25-B pin`);
  }
  for (const file of supersededByRecruiterBuildLog) {
    assert.equal(acceptedArtifactManifest().get(file)?.sha256, publicDelta.files.find((entry) => entry.path === file).sha256, `${file}: #27 base must be the #25-B pin`);
  }
  assert.deepEqual(worksGamesDelta.files.map((entry) => entry.path).sort(), [...APPROVED_WORKS_GAMES_CHANGES].sort(), "#26 public delta must cover the exact five scoped runtime/style paths");
  const worksGamesSupersededByRecruiterBuildLog = [...APPROVED_WORKS_GAMES_CHANGES].filter((file) => APPROVED_RECRUITER_BUILD_LOG_CHANGES.has(file));
  assert.deepEqual(worksGamesSupersededByRecruiterBuildLog, ["js/core/i18n-runtime.js"], "#27 may layer onto exactly one #26 public path");
  const worksGamesSupersededByAjoopCommand = [...APPROVED_WORKS_GAMES_CHANGES].filter((file) => APPROVED_AJOOP_COMMAND_CHANGES.has(file));
  assert.deepEqual(worksGamesSupersededByAjoopCommand, ["js/features/ultimate.js", "js/core/i18n-runtime.js"], "#28 may layer onto exactly two #26 public paths");
  const worksGamesSuperseded = new Set([...worksGamesSupersededByRecruiterBuildLog, ...worksGamesSupersededByAjoopCommand]);
  const worksGamesPublicDelta = compareArtifactManifest(
    { files: worksGamesDelta.files.filter((entry) => !worksGamesSuperseded.has(entry.path)) },
    mixed,
    [...APPROVED_WORKS_GAMES_CHANGES].filter((file) => !worksGamesSuperseded.has(file)),
  );
  assertClean("accepted #26 public delta", worksGamesPublicDelta);
  assertReviewedWorksGamesDelta(mixed);
  for (const [name, edits] of [
    ["unreviewed extra edit", { ...WORKS_GAMES_REVIEWED_EDITS, "style.css": WORKS_GAMES_REVIEWED_EDITS["style.css"].slice(1) }],
    ["missing stand-down", { ...WORKS_GAMES_REVIEWED_EDITS, "js/pages/games.js": [] }],
    ["missing search-copy stand-down", { ...WORKS_GAMES_REVIEWED_EDITS, "js/features/ultimate.js": [] }],
  ]) {
    assert.throws(() => assertReviewedWorksGamesDelta(mixed, edits), undefined, `#26 reviewed delta ${name} control did not fail`);
  }
  assert.deepEqual(recruiterBuildLogDelta.files.map((entry) => entry.path).sort(), [...APPROVED_RECRUITER_BUILD_LOG_CHANGES].sort(), "#27 public delta must cover the exact three legacy ownership paths");
  const recruiterSupersededByAjoopCommand = [...APPROVED_RECRUITER_BUILD_LOG_CHANGES].filter((file) => APPROVED_AJOOP_COMMAND_CHANGES.has(file));
  assert.deepEqual(recruiterSupersededByAjoopCommand, ["js/core/i18n-runtime.js"], "#28 may layer onto exactly one #27 public path");
  const recruiterSupersededByCaseProject = [...APPROVED_RECRUITER_BUILD_LOG_CHANGES].filter((file) => APPROVED_CASE_PROJECT_CHANGES.has(file));
  assert.deepEqual(recruiterSupersededByCaseProject, [], "#29 must not layer onto any #27 public path");
  const recruiterSuperseded = new Set(recruiterSupersededByAjoopCommand);
  assertClean("accepted #27 public delta", compareArtifactManifest(
    { files: recruiterBuildLogDelta.files.filter((entry) => !recruiterSuperseded.has(entry.path)) },
    mixed,
    [...APPROVED_RECRUITER_BUILD_LOG_CHANGES].filter((file) => !recruiterSuperseded.has(file)),
  ));
  assertReviewedRecruiterBuildLogDelta(mixed);
  for (const [name, edits] of [
    ["missing recruiter stand-down", { ...RECRUITER_BUILD_LOG_REVIEWED_EDITS, "js/features/recruiter.js": RECRUITER_BUILD_LOG_REVIEWED_EDITS["js/features/recruiter.js"].slice(1) }],
    ["missing i18n stand-down", { ...RECRUITER_BUILD_LOG_REVIEWED_EDITS, "js/core/i18n-runtime.js": RECRUITER_BUILD_LOG_REVIEWED_EDITS["js/core/i18n-runtime.js"].slice(1) }],
    ["missing V2 stand-down", { ...RECRUITER_BUILD_LOG_REVIEWED_EDITS, "portfolio-v2.js": [] }],
  ]) {
    assert.throws(() => assertReviewedRecruiterBuildLogDelta(mixed, edits), undefined, `#27 reviewed delta ${name} control did not fail`);
  }
  assert.deepEqual(ajoopCommandDelta.files.map((entry) => entry.path).sort(), [...APPROVED_AJOOP_COMMAND_CHANGES].sort(), "#28 public delta must cover the exact five Ajoop/Command Palette ownership paths");
  assertClean("accepted #28 public delta", compareArtifactManifest(ajoopCommandDelta, mixed, [...APPROVED_AJOOP_COMMAND_CHANGES]));
  assertReviewedAjoopCommandDelta(mixed);
  for (const [name, edits] of [
    ["missing Ajoop presentation port", { ...AJOOP_COMMAND_REVIEWED_EDITS, "js/ajoop/assistant.js": AJOOP_COMMAND_REVIEWED_EDITS["js/ajoop/assistant.js"].slice(1) }],
    ["missing Command Palette stand-down", { ...AJOOP_COMMAND_REVIEWED_EDITS, "js/features/command-palette.js": AJOOP_COMMAND_REVIEWED_EDITS["js/features/command-palette.js"].slice(1) }],
    ["missing palette copy stand-down", { ...AJOOP_COMMAND_REVIEWED_EDITS, "js/features/ultimate.js": [] }],
    ["missing i18n stand-down", { ...AJOOP_COMMAND_REVIEWED_EDITS, "js/core/i18n-runtime.js": AJOOP_COMMAND_REVIEWED_EDITS["js/core/i18n-runtime.js"].slice(1) }],
    ["missing launcher readiness rule", { ...AJOOP_COMMAND_REVIEWED_EDITS, "portfolio-v2.css": [] }],
  ]) {
    assert.throws(() => assertReviewedAjoopCommandDelta(mixed, edits), undefined, `#28 reviewed delta ${name} control did not fail`);
  }
  assertReviewedCaseProjectDelta(mixed);
  for (const [name, edits] of [
    ["missing case translation stand-down", { ...CASE_PROJECT_REVIEWED_EDITS, "case-study.js": CASE_PROJECT_REVIEWED_EDITS["case-study.js"].slice(1) }],
    ["missing project renderer stand-down", { ...CASE_PROJECT_REVIEWED_EDITS, "js/portfolio/project-detail.js": [] }],
    ["missing gallery state stand-down", { ...CASE_PROJECT_REVIEWED_EDITS, "case-study.js": CASE_PROJECT_REVIEWED_EDITS["case-study.js"].slice(0, 3) }],
  ]) {
    assert.throws(() => assertReviewedCaseProjectDelta(mixed, edits), undefined, `#29 reviewed delta ${name} control did not fail`);
  }

  /* Home/About: byte-identical to the accepted 24be2f8 documents except for
   * the content-addressed React bundle name. The snapshot hashes are
   * self-recorded, so the hydration payload is also held to the independently
   * derived #25-B payload contract. */
  const homeAboutBytes = (directory, file) => Buffer.from(bundleNormalized(withoutRecruiterOwnership(withoutOverlayOwnership(fs.readFileSync(path.join(directory, file), "utf8")))));
  for (const file of HOME_ABOUT_DOCUMENTS) {
    assert.equal(digest(homeAboutBytes(mixed, file)), acceptedHomeAboutHash(file), `${file}: Home/About drifted from the accepted #25-B document`);
    assertHomeAboutPayload(fs.readFileSync(path.join(mixed, file), "utf8"), file);
  }
  const drifted = fs.readFileSync(path.join(mixed, "index.html"), "utf8").replace('"page":"home",', '"page":"home","structure":null,');
  assert.notEqual(digest(Buffer.from(bundleNormalized(drifted))), acceptedHomeAboutHash("index.html"), "Home payload drift control did not fail");

  const legacyFiles = listFiles(legacy);
  const currentLegacy = {
    files: legacyFiles.map((file) => ({
      path: file,
      normalization: BINARY_NORMALIZATION,
      sha256: artifactDigest(path.join(legacy, file), BINARY_NORMALIZATION),
    })),
  };
  const allReactDocuments = new Set(productionRoutes.map((route) => route.output));
  const mergeManifest = { files: currentLegacy.files.filter((entry) => !allReactDocuments.has(entry.path)) };
  const mergeFiles = finalFiles.filter((file) => !allReactDocuments.has(file) && !file.startsWith(bundlePrefix));
  const neutral = compareArtifactManifest(mergeManifest, mixed, mergeFiles);
  assertClean("same-tree unchanged legacy protection", neutral);

  console.log(
    `Master 3 #26 route-aware parity passed. pinned=${pinnedManifest.files.length} final=${finalFiles.length} migrated=${migratedDocuments.size} later-phase=${phase29Documents.size} bundles=${extras.length} unexplained=0.`,
  );
  console.log(
    `Canonical EOL contract passed. ${fixtureAssertions} assertions · LF=CRLF for recognized text only · binary bytes exact.`,
  );
  console.log(
    `Unchanged legacy artifact guard passed. protected=${mergeManifest.files.length} missing=${neutral.missing.length} extra=${neutral.extra.length} changed=${neutral.changed.length}.`,
  );
  console.log(`Accepted public delta guard passed. authority=${ACCEPTED_DELTA} exact=${publicDelta.files.length} accept-current=disabled.`);
  console.log(`Accepted #26 public delta guard passed. authority=${WORKS_GAMES_ACCEPTED_BASE} exact=${worksGamesDelta.files.length} reviewed-edits=${Object.values(WORKS_GAMES_REVIEWED_EDITS).flat().length} base-anchored=3-controls home-about=${HOME_ABOUT_DOCUMENTS.length}-exact git-history=none accept-current=disabled.`);
  console.log(`Accepted #28 public delta guard passed. authority=${AJOOP_COMMAND_ACCEPTED_BASE} exact=${ajoopCommandDelta.files.length} reviewed-edits=${Object.values(AJOOP_COMMAND_REVIEWED_EDITS).flat().length} base-anchored=5-controls overlay roots stripped before prior parity checks accept-current=disabled.`);
  console.log(`Accepted #27 public delta guard passed. authority=${RECRUITER_BUILD_LOG_ACCEPTED_BASE} exact=${recruiterBuildLogDelta.files.length} reviewed-edits=${Object.values(RECRUITER_BUILD_LOG_REVIEWED_EDITS).flat().length} base-anchored=3-controls React-doc additions stripped before prior parity checks accept-current=disabled.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
