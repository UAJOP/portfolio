#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GENERATED_SOURCE_CHECKS = Object.freeze([
  "scripts/generate-project-pages.mjs",
  "scripts/build-locale-packs.mjs",
  "scripts/generate-i18n.mjs",
  "scripts/generate-localized-routes.mjs",
]);

const defaultRunner = (script) => spawnSync(process.execPath, [script, "--check"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: "pipe",
});

export function verifyProductionGeneratedState({ runner = defaultRunner } = {}) {
  for (const script of GENERATED_SOURCE_CHECKS) {
    const result = runner(script);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) {
      throw new Error(`production source verification failed closed: ${script} --check`);
    }
  }
  return GENERATED_SOURCE_CHECKS.length;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const count = verifyProductionGeneratedState();
    console.log(`[build:site] ${count} generated-source checks passed`);
  } catch (error) {
    console.error(`[build:site] ${error.message}`);
    process.exit(1);
  }
}
