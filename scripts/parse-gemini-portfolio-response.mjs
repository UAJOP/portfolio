#!/usr/bin/env node
/**
 * Raw model output -> candidate proposal object.
 *
 * This is a boundary, not an authorization step. Parsing only establishes syntax and
 * shape; the proposal is still untrusted model output afterwards. By default this CLI
 * therefore also runs the deterministic validator, so no workflow can accidentally
 * feed unvalidated model output into patch generation. `--no-validate` exists only for
 * inspecting a rejected response and never writes a proposal file.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AutomationValidationError,
  MAX_GEMINI_RESPONSE_BYTES,
  loadCanonicalState,
  loadProjectSources,
  parseGeminiResponse,
  validatePortfolioProposal,
  validateProjectSources,
} from "./portfolio-automation-core.mjs";

/**
 * A rejected response is an expected outcome, not a crash. n8n surfaces stderr, so a
 * one-line reason with its machine-readable code is far more useful there than a stack.
 */
process.on("uncaughtException", (error) => {
  if (error instanceof AutomationValidationError) {
    console.error(`[automation] REJECTED (${error.code}): ${error.message}`);
    process.exit(1);
  }
  throw error;
});

const args = process.argv.slice(2);
const input = args[0];
const evidenceIndex = args.indexOf("--evidence");
const outputIndex = args.indexOf("--output");
const skipValidation = args.includes("--no-validate");

if (!input || (!skipValidation && (evidenceIndex < 0 || !args[evidenceIndex + 1]))) {
  console.error(
    "Usage: node scripts/parse-gemini-portfolio-response.mjs <gemini-response.json> " +
      "--evidence <evidence.json> [--output <proposal.json>] [--no-validate]",
  );
  process.exit(1);
}
if (outputIndex >= 0 && !args[outputIndex + 1]) {
  console.error("--output requires a file path.");
  process.exit(1);
}
if (skipValidation && outputIndex >= 0) {
  console.error("--no-validate cannot write a proposal file: an unvalidated proposal must never be persisted.");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(input), "utf8");
const proposal = parseGeminiResponse(raw, { maxBytes: MAX_GEMINI_RESPONSE_BYTES });

if (skipValidation) {
  console.error("[automation] WARNING: validation skipped. This output is untrusted and must not be applied.");
  process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`);
  process.exit(0);
}

const projectSources = loadProjectSources();
const state = loadCanonicalState();
validateProjectSources(projectSources, state);
const evidence = JSON.parse(fs.readFileSync(path.resolve(args[evidenceIndex + 1]), "utf8"));
const result = validatePortfolioProposal(proposal, { evidence, projectSources, state });

const rendered = `${JSON.stringify(proposal, null, 2)}\n`;
if (outputIndex >= 0) {
  const output = path.resolve(args[outputIndex + 1]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, rendered, "utf8");
} else {
  process.stdout.write(rendered);
}
console.error(
  `[automation] parsed and validated · ${proposal.project_slug} · ${result.planned.length} field changes · ` +
    "human approval still required",
);
