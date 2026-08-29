#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  AUTOMATION_ROOT,
  loadCanonicalState,
  loadProjectSources,
  normalizeGitHubEvent,
  validateProjectSources,
} from "./portfolio-automation-core.mjs";

const args = process.argv.slice(2);
const input = args[0];
const outputIndex = args.indexOf("--output");
if (!input || (outputIndex >= 0 && !args[outputIndex + 1])) {
  console.error("Usage: node scripts/normalize-github-evidence.mjs <github-event.json> [--output <evidence.json>]");
  process.exit(1);
}

const projectSources = loadProjectSources();
validateProjectSources(projectSources, loadCanonicalState());
const normalized = normalizeGitHubEvent(JSON.parse(fs.readFileSync(path.resolve(input), "utf8")), projectSources);
const rendered = `${JSON.stringify(normalized, null, 2)}\n`;
if (outputIndex >= 0) {
  const output = path.resolve(args[outputIndex + 1]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, rendered, "utf8");
  console.log(`[automation] normalized evidence written to ${path.relative(AUTOMATION_ROOT, output)}`);
} else {
  process.stdout.write(rendered);
}
