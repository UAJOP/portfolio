#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLegacyPagesArtifact, buildPagesArtifact, listFiles } from "./build-pages-artifact.mjs";
import { buildProductionReact } from "./prerender-react.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-parity-"));
const legacy = path.join(temp, "legacy");
const mixed = path.join(temp, "mixed");
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

try {
  buildLegacyPagesArtifact(legacy);
  await buildProductionReact();
  buildPagesArtifact(mixed);
  const legacyFiles = listFiles(legacy);
  const mixedFiles = listFiles(mixed);
  const legacySet = new Set(legacyFiles);
  const mixedSet = new Set(mixedFiles);
  const missing = legacyFiles.filter((file) => !mixedSet.has(file));
  const extra = mixedFiles.filter((file) => !legacySet.has(file));
  const changed = legacyFiles.filter((file) => mixedSet.has(file) && digest(path.join(legacy, file)) !== digest(path.join(mixed, file)));
  if (missing.length || extra.length || changed.length) {
    throw new Error([
      ...missing.map((file) => `missing: ${file}`),
      ...extra.map((file) => `extra: ${file}`),
      ...changed.map((file) => `changed: ${file}`),
    ].join("\n"));
  }
  console.log(`Master 3 #25-A artifact parity passed. ${legacyFiles.length} files · byte-for-byte identical · no normalization or exclusions.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
