#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  loadCanonicalState,
  loadProjectSources,
  validatePortfolioProposal,
  validateProjectSources,
} from "./portfolio-automation-core.mjs";

const args = process.argv.slice(2);
const proposalFile = args[0];
const evidenceIndex = args.indexOf("--evidence");
if (!proposalFile || evidenceIndex < 0 || !args[evidenceIndex + 1]) {
  console.error("Usage: node scripts/validate-portfolio-proposal.mjs <proposal.json> --evidence <evidence.json>");
  process.exit(1);
}

const projectSources = loadProjectSources();
const state = loadCanonicalState();
validateProjectSources(projectSources, state);
const proposal = JSON.parse(fs.readFileSync(path.resolve(proposalFile), "utf8"));
const evidence = JSON.parse(fs.readFileSync(path.resolve(args[evidenceIndex + 1]), "utf8"));
const result = validatePortfolioProposal(proposal, { evidence, projectSources, state });
console.log(
  `[automation] valid proposal · ${proposal.project_slug} · ${result.planned.length} field changes · human approval still required`,
);
