#!/usr/bin/env node
/**
 * Blocking drift guard between the two design-token vocabularies.
 *
 * Production (portfolio-v2.css) names semantic tokens `--color-*`; the React
 * migration foundation (src/react/styles/tokens.css) predates that naming and
 * uses `--canvas`, `--action-fill`, … . Master 3 is expected to collapse them
 * into one vocabulary. Until then, the shared semantic values below must be
 * identical in both files, in both themes, so a change to one cannot silently
 * leave the other behind. Update both files together, never this table alone.
 */

import { read } from "./i18n-catalog.mjs";
import { exactTokenBlock } from "./css-tokens.mjs";

const PARITY = [
  ["canvas", "--color-canvas", "--canvas"],
  ["canvas raised", "--color-canvas-raised", "--canvas-raised"],
  ["surface", "--color-surface", "--surface"],
  ["surface inset", "--color-surface-inset", "--surface-inset"],
  ["text", "--color-text", "--text-primary"],
  ["text secondary", "--color-text-secondary", "--text-secondary"],
  ["muted", "--color-text-muted", "--text-muted"],
  ["accent", "--color-accent", "--accent"],
  ["accent strong", "--color-accent-strong", "--accent-strong"],
  ["action fill", "--color-action", "--action-fill"],
  ["action hover", "--color-action-hover", "--action-fill-hover"],
  ["on-action", "--color-on-action", "--action-text"],
  ["success", "--color-success", "--success"],
  ["warning", "--color-warning", "--warning"],
  ["danger", "--color-danger", "--danger"],
];

const THEMES = [
  ["dark", ":root"],
  ["light", 'html[data-theme="light"]'],
];

const production = read("portfolio-v2.css");
const react = read("src/react/styles/tokens.css");

let assertions = 0;
const failures = [];
for (const [theme, selector] of THEMES) {
  const prod = exactTokenBlock(production, selector);
  const preview = exactTokenBlock(react, selector);
  for (const [meaning, prodName, reactName] of PARITY) {
    assertions += 1;
    const a = prod.get(prodName)?.toLowerCase();
    const b = preview.get(reactName)?.toLowerCase();
    if (!a || !b) {
      failures.push(`${theme} ${meaning}: missing ${!a ? `${prodName} in portfolio-v2.css` : `${reactName} in src/react/styles/tokens.css`}`);
    } else if (a !== b) {
      failures.push(`${theme} ${meaning}: portfolio-v2.css ${prodName} ${a} ≠ tokens.css ${reactName} ${b}`);
    }
  }
}

if (failures.length) {
  console.error(`Design token parity failed: ${failures.length} drift(s), ${assertions} assertions`);
  failures.forEach((failure) => console.error(`  x ${failure}`));
  process.exit(1);
}
console.log(`Design token parity passed. ${assertions} assertions · ${PARITY.length} semantic tokens × dark/light · production ↔ React preview.`);
