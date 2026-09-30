#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyPagesArtifact, buildPagesArtifact, listFiles } from "./build-pages-artifact.mjs";
import { buildProductionReact } from "./prerender-react.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = path.join(ROOT, "data/site/m3-25a-accepted-artifact.json");
const ACCEPTED_BASE = "6ca0910ea330d25dcb3873f8b84047666de67fb6";
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function compare(expected, actualDirectory) {
  const expectedHashes = new Map(expected.files.map((entry) => [entry.path, entry.sha256]));
  const actualFiles = listFiles(actualDirectory);
  const actualSet = new Set(actualFiles);
  const missing = [...expectedHashes.keys()].filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedHashes.has(file));
  const changed = actualFiles.filter((file) => expectedHashes.has(file) && digest(path.join(actualDirectory, file)) !== expectedHashes.get(file));
  return { actualFiles, missing, extra, changed };
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

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
if (baseline.schemaVersion !== 1 || baseline.algorithm !== "sha256" || baseline.acceptedBaseCommit !== ACCEPTED_BASE) {
  throw new Error("#25-A accepted artifact manifest metadata is invalid");
}
if (baseline.fileCount !== baseline.files.length || new Set(baseline.files.map((entry) => entry.path)).size !== baseline.fileCount) {
  throw new Error("#25-A accepted artifact manifest file count or path uniqueness is invalid");
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-parity-"));
const legacy = path.join(temp, "legacy");
const mixed = path.join(temp, "mixed");
const reactOutput = path.join(temp, "react");

try {
  buildLegacyPagesArtifact(legacy);
  const reactBuild = await buildProductionReact({ outputDirectory: reactOutput });
  buildPagesArtifact(mixed, { reactBuild });

  const accepted = compare(baseline, mixed);
  assertClean("frozen accepted artifact parity", accepted);

  const currentLegacy = {
    files: listFiles(legacy).map((file) => ({ path: file, sha256: digest(path.join(legacy, file)) })),
  };
  const neutral = compare(currentLegacy, mixed);
  assertClean("same-tree React merge neutrality", neutral);

  console.log(
    `Master 3 #25-A frozen parity passed. accepted=${baseline.fileCount} final=${accepted.actualFiles.length} missing=${accepted.missing.length} extra=${accepted.extra.length} changed=${accepted.changed.length}.`,
  );
  console.log(
    `Same-tree merge neutrality passed. legacy=${currentLegacy.files.length} mixed=${neutral.actualFiles.length} missing=${neutral.missing.length} extra=${neutral.extra.length} changed=${neutral.changed.length}.`,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
