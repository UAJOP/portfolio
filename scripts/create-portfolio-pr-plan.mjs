#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createDraftPrPlan } from "./portfolio-automation-core.mjs";

const args = process.argv.slice(2);
const proposalFile = args[0];
const evidenceIndex = args.indexOf("--evidence");
const approvalIndex = args.indexOf("--approval");
if (!proposalFile || evidenceIndex < 0 || approvalIndex < 0) {
  console.error(
    "Usage: node scripts/create-portfolio-pr-plan.mjs <proposal.json> --evidence <evidence.json> --approval <approval.json>",
  );
  process.exit(1);
}
const parse = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const plan = createDraftPrPlan({
  proposal: parse(proposalFile),
  evidence: parse(args[evidenceIndex + 1]),
  approval: parse(args[approvalIndex + 1]),
});
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
