#!/usr/bin/env node
/** Blocking contracts for the Master 2 public design system. */

import fs from "node:fs";
import path from "node:path";
import { ROOT, authoredHtmlFiles, read } from "./i18n-catalog.mjs";

let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};

const css = read("portfolio-v2.css");
const tokens = [
  "--color-canvas",
  "--color-surface",
  "--color-text",
  "--color-text-secondary",
  "--color-accent",
  "--color-success",
  "--color-border",
  "--font-sans",
  "--font-mono",
  "--type-display",
  "--section-gap",
  "--content-width",
];

for (const token of tokens) {
  assert(new RegExp(`${token}\\s*:`).test(css), `portfolio-v2.css is missing ${token}`);
}

const lightBlock = css.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1] || "";
for (const token of [
  "--color-canvas",
  "--color-surface",
  "--color-text",
  "--color-text-secondary",
  "--color-accent",
  "--color-success",
  "--color-border",
  "--shadow-md",
]) {
  assert(lightBlock.includes(`${token}:`), `light theme must independently define ${token}`);
}

assert(!/font-family\s*:[^;]*(?:Georgia|Times New Roman|serif)/i.test(css), "Master 2 headings must not introduce a serif family");
assert(!/#(?:00ffff|00e5ff|00ffff)|\bcyan\b/i.test(css), "Master 2 must not regress to a cyan/neon palette");
assert(css.includes("prefers-reduced-motion: reduce"), "Master 2 must preserve reduced-motion behavior");
assert(!/body\s*\{[^}]*overflow-x\s*:\s*hidden/is.test(css), "Master 2 must not hide horizontal overflow to mask defects");

for (const file of authoredHtmlFiles()) {
  const html = read(file);
  assert(html.includes('href="/portfolio-v2.css"'), `${file} must load the shared Master 2 design layer`);
}

const home = read("index.html");
assert(home.includes("identity-proof"), "Home identity panel must carry explicit evidence hierarchy");
assert((home.match(/class="evidence-card/g) || []).length >= 3, "Home must show at least three selected-work evidence cards");
assert((home.match(/class="evidence-card-media/g) || []).length >= 3, "Selected Work must use real visual media for each primary item");
for (const asset of [
  "/assets/sinama-home-featured-project.webp",
  "/assets/ai_flow_chatbot_design_cover.webp",
  "/assets/joyday-homepage-preview.webp",
]) {
  assert(home.includes(asset), `Selected Work is missing its real project asset ${asset}`);
  assert(fs.existsSync(path.join(ROOT, asset.slice(1))), `Selected Work asset does not exist: ${asset}`);
}

const stableKeys = [...home.matchAll(/data-message-key="([^"]+)"/g)].map((match) => match[1]);
assert(stableKeys.length >= 30, "Home material copy must use stable semantic message keys");
const repeatedKeys = stableKeys.filter((key, index) => stableKeys.indexOf(key) !== index);
const reusableHomeKeys = new Set([
  "home.selectedWork.caseStudy",
  "home.selectedWork.joyday.summary",
]);
assert(
  repeatedKeys.every((key) => reusableHomeKeys.has(key)),
  `Home must only reuse intentionally shared labels; found ${[...new Set(repeatedKeys)].join(", ")}`,
);

if (failures.length) {
  console.error(`Master 2 design QA failed: ${failures.length} failure(s), ${assertions} assertions`);
  failures.forEach((failure) => console.error(`  x ${failure}`));
  process.exit(1);
}

console.log(`Master 2 design QA passed. ${assertions} assertions · shared system · true light theme · visual evidence.`);
