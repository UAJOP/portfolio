#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyPagesArtifact, listFiles } from "./build-pages-artifact.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import {
  BINARY_NORMALIZATION,
  TEXT_EOL_NORMALIZATION,
  artifactDigest,
  compareArtifactManifest,
  validateArtifactManifest,
} from "./artifact-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "data/site/m3-25a-accepted-artifact.json");
const ACCEPTED_BASE = "6ca0910ea330d25dcb3873f8b84047666de67fb6";

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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-parity-"));
const legacy = path.join(temp, "legacy");
const mixed = path.join(temp, "mixed");

try {
  const fixtureAssertions = testCanonicalEolContract(temp);
  buildLegacyPagesArtifact(legacy);
  await buildProductionSite({ outputDirectory: mixed });

  const accepted = compareArtifactManifest(baseline, mixed, listFiles(mixed));
  assertClean("frozen accepted artifact parity", accepted);

  const legacyFiles = listFiles(legacy);
  const currentLegacy = {
    files: legacyFiles.map((file) => ({
      path: file,
      normalization: BINARY_NORMALIZATION,
      sha256: artifactDigest(path.join(legacy, file), BINARY_NORMALIZATION),
    })),
  };
  const neutral = compareArtifactManifest(currentLegacy, mixed, listFiles(mixed));
  assertClean("same-tree React merge neutrality", neutral);

  console.log(
    `Master 3 #25-A frozen parity passed. accepted=${baseline.fileCount} final=${accepted.actualFiles.length} missing=${accepted.missing.length} extra=${accepted.extra.length} changed=${accepted.changed.length}.`,
  );
  console.log(
    `Canonical EOL contract passed. ${fixtureAssertions} assertions · LF=CRLF for recognized text only · binary bytes exact.`,
  );
  console.log(
    `Same-tree merge neutrality passed. legacy=${currentLegacy.files.length} mixed=${neutral.actualFiles.length} missing=${neutral.missing.length} extra=${neutral.extra.length} changed=${neutral.changed.length}.`,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
