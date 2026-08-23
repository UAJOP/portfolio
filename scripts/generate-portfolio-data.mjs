/**
 * Generates portfolio-data.js from the canonical JSON under data/portfolio/.
 *
 * Run with `npm run data:generate` after editing any canonical JSON file, and
 * commit the result. The generated artifact is committed on purpose: GitHub
 * Pages deploys repository files directly, so the legacy production pages must
 * not need a CI build in order to boot.
 *
 * Deterministic: same input, byte-identical output. CI verifies that rather than
 * regenerating, so a stale artifact fails the build instead of being papered
 * over.
 */
import fs from "node:fs";
import path from "node:path";
import {
  GENERATED_REGISTRY,
  REPO_ROOT,
  composePortfolio,
  normalizeEol,
  renderRegistrySource,
} from "./portfolio-data-model.mjs";

const relative = path.relative(REPO_ROOT, GENERATED_REGISTRY).replace(/\\/g, "/");

const portfolio = composePortfolio();
const next = renderRegistrySource(portfolio);

const previous = fs.existsSync(GENERATED_REGISTRY)
  ? normalizeEol(fs.readFileSync(GENERATED_REGISTRY, "utf8"))
  : null;

fs.writeFileSync(GENERATED_REGISTRY, next, "utf8");

const projects = Object.keys(portfolio.projects).length;
const recruiters = Object.keys(portfolio.recruiterProfiles).length;

console.log(previous === next ? `[data] ${relative} already up to date` : `[data] ${relative} regenerated`);
console.log(
  `[data] registry ${portfolio.version} · ${projects} projects · ${recruiters} recruiter profiles · ` +
    `${portfolio.buildLog.length} build checkpoints · ${portfolio.labs.length} labs`,
);
console.log(`[data] ${Buffer.byteLength(next)} B written`);
