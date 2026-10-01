#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLegacyPagesArtifact, listFiles } from "./build-pages-artifact.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";
import { loadArtifactConfig } from "./public-artifact-config.mjs";
import {
  BINARY_NORMALIZATION,
  TEXT_EOL_NORMALIZATION,
  artifactDigest,
  canonicalArtifactBytes,
  compareArtifactManifest,
  validateArtifactManifest,
} from "./artifact-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "data/site/m3-25a-accepted-artifact.json");
const PUBLIC_DELTA_FILE = path.join(ROOT, "data/site/m3-25b-public-delta.json");
const WORKS_GAMES_DELTA_FILE = path.join(ROOT, "data/site/m3-26-public-delta.json");
const ACCEPTED_BASE = "6ca0910ea330d25dcb3873f8b84047666de67fb6";
const ACCEPTED_DELTA = "4d0e37b496f70d851397d9976b2022350d11edd6";
const WORKS_GAMES_ACCEPTED_BASE = "24be2f8159a0925dc00f29375ea8740738214df3";
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
/* Each #26 public file is the accepted base plus exactly these reviewed edits
 * (LF form; every `from` must occur exactly once). The hash manifest pins the
 * bytes; this ties the same bytes back to the immutable acceptance commit. */
const WORKS_GAMES_REVIEWED_EDITS = Object.freeze({
  "js/core/i18n-runtime.js": [[
    '  document.querySelectorAll("[data-preserve-case]").forEach((element) => element.removeAttribute("data-preserve-case"));\n',
    '  document.querySelectorAll("[data-preserve-case]").forEach((element) => {\n    if (!element.closest("[data-react-main]")) element.removeAttribute("data-preserve-case");\n  });\n',
  ]],
  "js/pages/games.js": [[
    "function setupGameCards() {\n",
    'function setupGameCards() {\n  if (document.querySelector("main[data-react-main]")) return;\n',
  ]],
  "js/portfolio/works.js": [
    [
      'const projectCards = document.querySelectorAll(".project-card[data-category]");\n',
      'const projectCards = document.querySelectorAll(".project-card[data-category]");\nconst reactOwnsCatalog = Boolean(document.querySelector("main[data-react-main]"));\n',
    ],
    ["if (filterButtons.length && projectCards.length) {\n", "if (!reactOwnsCatalog && filterButtons.length && projectCards.length) {\n"],
    ["function setupProjectCardNavigation() {\n", "function setupProjectCardNavigation() {\n  if (reactOwnsCatalog) return;\n"],
    ["function setupProjectSearch() {\n", "function setupProjectSearch() {\n  if (reactOwnsCatalog) return;\n"],
  ],
  "style.css": [
    [".project-search-wrap {\n  margin: -10px 0 28px;\n}\n", ".project-search-wrap {\n  margin: -10px 0 28px;\n  display: grid;\n  gap: 10px;\n}\n"],
    [".project-search-wrap label {\n  display: grid;\n", ".project-search-wrap label,\n.project-search-wrap > div {\n  display: grid;\n"],
    [".project-search-wrap label > div {\n  display: flex;\n",".project-search-wrap label > div,\n.project-search-wrap > div {\n  display: flex;\n"],
    ['html[data-theme="light"] .project-search-wrap label > div,\n', 'html[data-theme="light"] .project-search-wrap label > div,\nhtml[data-theme="light"] .project-search-wrap > div,\n'],
    ["  .project-search-wrap label > div { border-radius: 20px; }\n", "  .project-search-wrap label > div,\n  .project-search-wrap > div { border-radius: 20px; }\n"],
  ],
});
const APPROVED_WORKS_GAMES_CHANGES = new Set(Object.keys(WORKS_GAMES_REVIEWED_EDITS));
const lf = (value) => value.replace(/\r\n/g, "\n");

function reviewedWorksGamesFile(file, edits = WORKS_GAMES_REVIEWED_EDITS[file]) {
  let content = lf(execFileSync("git", ["show", `${WORKS_GAMES_ACCEPTED_BASE}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }));
  for (const [from, to] of edits) {
    assert.equal(content.split(from).length, 2, `${file}: reviewed edit anchor must occur exactly once`);
    content = content.replace(from, () => to);
  }
  return content;
}

function assertReviewedWorksGamesDelta(directory, edits = WORKS_GAMES_REVIEWED_EDITS) {
  for (const file of Object.keys(edits)) {
    const actual = lf(fs.readFileSync(path.join(directory, file), "utf8"));
    assert.equal(actual, reviewedWorksGamesFile(file, edits[file]), `${file}: #26 delta is not exactly the accepted base plus reviewed edits`);
  }
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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-parity-"));
const legacy = path.join(temp, "legacy");
const mixed = path.join(temp, "mixed");

try {
  const fixtureAssertions = testCanonicalEolContract(temp);
  buildLegacyPagesArtifact(legacy);
  await buildProductionSite({ outputDirectory: mixed });

  const migratedDocuments = new Set(productionReactRoutes().map((route) => route.output));
  assert.equal(migratedDocuments.size, 20, "parity model requires exactly 20 migrated Home/About/Works/Games documents");
  const bundlePrefix = `${loadArtifactConfig().reactBundleDirectory}/`;
  const allowed = new Set([...migratedDocuments, ...APPROVED_GENERATED_CHANGES, ...APPROVED_WORKS_GAMES_CHANGES]);
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
  const delta = compareArtifactManifest(
    { files: publicDelta.files.filter((entry) => !supersededByWorksGames.includes(entry.path)) },
    mixed,
    [...APPROVED_GENERATED_CHANGES].filter((file) => !supersededByWorksGames.includes(file)),
  );
  assertClean("accepted #25-B public delta", delta);
  for (const file of supersededByWorksGames) {
    const pinned = publicDelta.files.find((entry) => entry.path === file);
    const baseBytes = execFileSync("git", ["show", `${WORKS_GAMES_ACCEPTED_BASE}:${file}`], { cwd: ROOT, maxBuffer: 30 * 1024 * 1024 });
    const baseDigest = crypto.createHash("sha256").update(canonicalArtifactBytes(baseBytes, pinned.normalization)).digest("hex");
    assert.equal(baseDigest, pinned.sha256, `${file}: #25-B pin must describe the #26 acceptance base`);
  }
  assert.deepEqual(worksGamesDelta.files.map((entry) => entry.path).sort(), [...APPROVED_WORKS_GAMES_CHANGES].sort(), "#26 public delta must cover the exact four scoped runtime/style paths");
  const worksGamesPublicDelta = compareArtifactManifest(worksGamesDelta, mixed, [...APPROVED_WORKS_GAMES_CHANGES]);
  assertClean("accepted #26 public delta", worksGamesPublicDelta);
  assertReviewedWorksGamesDelta(mixed);
  for (const [name, edits] of [
    ["unreviewed extra edit", { ...WORKS_GAMES_REVIEWED_EDITS, "style.css": WORKS_GAMES_REVIEWED_EDITS["style.css"].slice(1) }],
    ["missing stand-down", { ...WORKS_GAMES_REVIEWED_EDITS, "js/pages/games.js": [] }],
  ]) {
    assert.throws(() => assertReviewedWorksGamesDelta(mixed, edits), undefined, `#26 reviewed delta ${name} control did not fail`);
  }

  const legacyFiles = listFiles(legacy);
  const currentLegacy = {
    files: legacyFiles.map((file) => ({
      path: file,
      normalization: BINARY_NORMALIZATION,
      sha256: artifactDigest(path.join(legacy, file), BINARY_NORMALIZATION),
    })),
  };
  const mergeManifest = { files: currentLegacy.files.filter((entry) => !migratedDocuments.has(entry.path)) };
  const mergeFiles = finalFiles.filter((file) => !migratedDocuments.has(file) && !file.startsWith(bundlePrefix));
  const neutral = compareArtifactManifest(mergeManifest, mixed, mergeFiles);
  assertClean("same-tree unchanged legacy protection", neutral);

  console.log(
    `Master 3 #26 route-aware parity passed. pinned=${pinnedManifest.files.length} final=${finalFiles.length} migrated=20 bundles=${extras.length} unexplained=0.`,
  );
  console.log(
    `Canonical EOL contract passed. ${fixtureAssertions} assertions · LF=CRLF for recognized text only · binary bytes exact.`,
  );
  console.log(
    `Unchanged legacy artifact guard passed. protected=${mergeManifest.files.length} missing=${neutral.missing.length} extra=${neutral.extra.length} changed=${neutral.changed.length}.`,
  );
  console.log(`Accepted public delta guard passed. authority=${ACCEPTED_DELTA} exact=${publicDelta.files.length} accept-current=disabled.`);
  console.log(`Accepted #26 public delta guard passed. authority=${WORKS_GAMES_ACCEPTED_BASE} exact=${worksGamesDelta.files.length} reviewed-edits=${Object.values(WORKS_GAMES_REVIEWED_EDITS).flat().length} base-anchored=2-controls accept-current=disabled.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
