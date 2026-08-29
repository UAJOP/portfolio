#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createApproval } from "./portfolio-automation-core.mjs";

const args = process.argv.slice(2);
const proposalFile = args[0];
const reviewerIndex = args.indexOf("--reviewer");
const outputIndex = args.indexOf("--output");
if (!proposalFile || !args.includes("--approve") || reviewerIndex < 0 || !args[reviewerIndex + 1]) {
  console.error(
    "Usage: node scripts/approve-portfolio-proposal.mjs <proposal.json> --approve --reviewer <name> [--output <approval.json>]",
  );
  process.exit(1);
}

const resolvedProposal = path.resolve(proposalFile);
const proposal = JSON.parse(fs.readFileSync(resolvedProposal, "utf8"));
const approval = createApproval(proposal, { reviewer: args[reviewerIndex + 1] });
const output = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1])
  : resolvedProposal.replace(/\.json$/i, ".approval.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
console.log(`[automation] explicit approval artifact written: ${output}`);
