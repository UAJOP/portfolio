#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildGeminiPrompt,
  loadCanonicalState,
  loadProjectSources,
  validateProjectSources,
} from "./portfolio-automation-core.mjs";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-gemini-portfolio-prompt.mjs <normalized-evidence.json>");
  process.exit(1);
}

const projectSources = loadProjectSources();
const state = loadCanonicalState();
validateProjectSources(projectSources, state);
const evidence = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
process.stdout.write(`${buildGeminiPrompt({ evidence, projectSources, state })}\n`);
