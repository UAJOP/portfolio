#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPagesArtifact } from "./build-pages-artifact.mjs";
import { buildProductionReact } from "./prerender-react.mjs";
import { verifyProductionGeneratedState } from "./verify-production-generated.mjs";

export async function buildProductionSite({
  outputDirectory,
  verifyGenerated = verifyProductionGeneratedState,
  buildReact = buildProductionReact,
  buildArtifact = buildPagesArtifact,
} = {}) {
  verifyGenerated();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-react-production-"));
  try {
    const reactBuild = await buildReact({ outputDirectory: path.join(temporaryRoot, "react") });
    return buildArtifact(outputDirectory, { reactBuild });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const result = await buildProductionSite();
    console.log(`Pages artifact built: ${result.files.length} files · ${result.reactFiles.length} React files`);
  } catch (error) {
    console.error(`Production site build failed: ${error.message}`);
    process.exit(1);
  }
}
