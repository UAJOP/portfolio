#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  AUTOMATION_ROOT,
  applyPortfolioProposal,
  loadProjectSources,
} from "./portfolio-automation-core.mjs";

const args = process.argv.slice(2);
const proposalFile = args[0];
const evidenceIndex = args.indexOf("--evidence");
const approvalIndex = args.indexOf("--approval");
const repoRootIndex = args.indexOf("--repo-root");
const dryRun = args.includes("--dry-run");
if (!proposalFile || evidenceIndex < 0 || !args[evidenceIndex + 1]) {
  console.error(
    "Usage: node scripts/apply-portfolio-proposal.mjs <proposal.json> --evidence <evidence.json> " +
      "[--approval <approval.json>] [--repo-root <checkout>] [--dry-run]",
  );
  process.exit(1);
}
if (repoRootIndex >= 0 && !args[repoRootIndex + 1]) {
  console.error("--repo-root requires a checkout path.");
  process.exit(1);
}
if (!dryRun && (approvalIndex < 0 || !args[approvalIndex + 1])) {
  console.error("A matching approval artifact is required unless --dry-run is used.");
  process.exit(1);
}

const parse = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const repoRoot = repoRootIndex >= 0 ? path.resolve(args[repoRootIndex + 1]) : AUTOMATION_ROOT;
const result = applyPortfolioProposal({
  proposal: parse(proposalFile),
  evidence: parse(args[evidenceIndex + 1]),
  approval: approvalIndex >= 0 ? parse(args[approvalIndex + 1]) : null,
  projectSources: loadProjectSources(),
  repoRoot,
  dryRun,
});
console.log(`${dryRun ? "DRY RUN" : "APPLIED"}: ${result.project_slug} → ${result.source_file}`);
for (const change of result.changes) {
  console.log(`\n${change.field}\n- ${change.old}\n+ ${change.new}`);
}
if (!dryRun) {
  console.log("\nNext required commands:");
  for (const command of [...result.generators, ...result.qa]) console.log(`- ${command}`);
}
