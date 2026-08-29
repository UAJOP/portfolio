#!/usr/bin/env node
/**
 * qa-css-architecture.mjs — guards the CSS ownership boundaries (BRIEF 04).
 *
 * Before BRIEF 04 one 6,609-line style.css shipped to every page, 39% of it
 * game styling. Game CSS is now page-scoped and the accessibility utilities are
 * a common file. This check enforces that split and the stylesheet contracts,
 * without trying to parse CSS semantics with regex.
 *
 * Node built-ins only. Validates; never writes.
 *
 *   node scripts/qa-css-architecture.mjs
 *   node scripts/qa-css-architecture.mjs --report   # payload table
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const bytes = (p) => fs.statSync(path.join(ROOT, p)).size;

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (actual === expected) { passed += 1; return; }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

/* ---------- expected architecture ---------- */

/* Loaded by every page. */
const COMMON_CSS = ["style.css", "css/a11y.css", "portfolio-v2.css"];

/* Page-scoped: stylesheet -> the only pages allowed to load it. */
const SCOPED_CSS = {
  "css/games/adventure.css": ["adventure.html"],
  "css/games/joyday-paint.css": ["joyday-paint.html"],
  "css/games/ai-flow-puzzle.css": ["ai-flow-puzzle.html"],
  "case-study.css": [
    "sinama-case-study.html", "merge-rush-case-study.html",
    "hospital-system-case-study.html", "atolye-joyday-case-study.html",
    "ai-flow-puzzle-case-study.html",
  ],
};

const ALL_CSS = [...COMMON_CSS, ...Object.keys(SCOPED_CSS)];

/* ---------- 1. every stylesheet exists and carries rules ---------- */

for (const file of ALL_CSS) {
  ok(`stylesheet exists: ${file}`, exists(file));
  if (!exists(file)) continue;
  const css = read(file);
  ok(`stylesheet is non-empty: ${file}`, css.trim().length > 0);
  /* portfolio-v2.css is minified onto one line, so count braces not lines. */
  ok(`stylesheet declares rules: ${file}`, (css.match(/\{/g) || []).length > 0);
}

/* No orphan stylesheets: everything under css/ must be in the architecture. */
const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const next = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(next);
    return e.name.endsWith(".css") ? [next] : [];
  });
const onDisk = exists("css") ? walk("css").sort() : [];
for (const file of onDisk) {
  ok(`css/ file is part of the architecture: ${file}`, ALL_CSS.includes(file));
}

/* ---------- 2. page stylesheet references ---------- */

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const sheetsOf = (html) =>
  [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((m) => (m[0].match(/href="([^"]+)"/) || [])[1])
    .filter((h) => h && !/^https?:/.test(h));

for (const file of htmlFiles) {
  const html = read(file);
  const sheets = sheetsOf(html);

  /* every local stylesheet a page references must exist */
  for (const href of sheets) {
    ok(`${file}: stylesheet resolves — ${href}`, exists(decodeURIComponent(href)));
  }

  /* no duplicate references */
  check(`${file}: no duplicate stylesheet references`, sheets.length, new Set(sheets).size);

  /* common stylesheets present. portfolio-v2.css is injected at runtime by
   * script.js on pages that do not link it, so only style.css and the
   * accessibility layer are required in markup. */
  ok(`${file}: loads style.css`, sheets.includes("style.css"));
  ok(`${file}: loads css/a11y.css`, sheets.includes("css/a11y.css"));

  /* accessibility layer must come after style.css so its focus and skip-link
   * rules win over the base ones */
  if (sheets.includes("style.css") && sheets.includes("css/a11y.css")) {
    ok(
      `${file}: css/a11y.css is loaded after style.css`,
      sheets.indexOf("css/a11y.css") > sheets.indexOf("style.css"),
    );
  }

  /* page-scoped stylesheets only on their own pages */
  for (const [sheet, allowed] of Object.entries(SCOPED_CSS)) {
    const loaded = sheets.includes(sheet);
    if (allowed.includes(file)) ok(`${file}: loads its scoped stylesheet ${sheet}`, loaded);
    else ok(`${file}: does not load page-scoped ${sheet}`, !loaded);
  }

  /* no retired stylesheet */
  for (const retired of ["legacy.css", "main.css", "styles.css"]) {
    ok(`${file}: does not reference retired ${retired}`, !sheets.includes(retired));
  }
}

/* ---------- 3. game styling left the shared sheet ---------- */

const shared = read("style.css");
const GAME_MARKERS = [
  [".joyday-", "css/games/joyday-paint.css"],
  [".ai-puzzle", "css/games/ai-flow-puzzle.css"],
  [".ai-node", "css/games/ai-flow-puzzle.css"],
  [".merge-ladder", "css/games/adventure.css"],
  [".adventure-hero", "css/games/adventure.css"],
];
for (const [marker, home] of GAME_MARKERS) {
  ok(`style.css no longer owns ${marker} (moved to ${home})`, !shared.includes(marker));
  ok(`${home} owns ${marker}`, read(home).includes(marker));
}

/* ---------- 4. theme + token contract ---------- */

/* Colour tokens must exist in both themes. Geometry tokens (radii, max-width)
 * are theme-independent by design and are only required in :root. */
const THEMED_TOKENS = ["--bg", "--text", "--muted", "--brand", "--surface", "--line", "--accent"];
const GEOMETRY_TOKENS = ["--radius-md", "--radius-lg", "--max-width"];

for (const token of [...THEMED_TOKENS, ...GEOMETRY_TOKENS]) {
  ok(`token defined in :root — ${token}`, new RegExp(`:root\\s*\\{[\\s\\S]*?${token}\\s*:`).test(shared));
}
for (const token of THEMED_TOKENS) {
  ok(
    `colour token overridden for light theme — ${token}`,
    new RegExp(`\\[data-theme="light"\\]\\s*\\{[\\s\\S]*?${token}\\s*:`).test(shared),
  );
}

/* ---------- 5. accessibility layer contract ---------- */

const a11y = read("css/a11y.css");
for (const rule of [".skip-link", ":focus-visible", "prefers-reduced-motion", "min-height: 44px"]) {
  ok(`css/a11y.css provides ${rule}`, a11y.includes(rule));
}
ok(
  "css/a11y.css does not blanket-hide overflow to mask layout bugs",
  !/overflow-x:\s*hidden/.test(a11y),
);

/* ---------- payload report ---------- */

const cssFor = (file) => {
  const sheets = sheetsOf(read(file)).filter(exists);
  /* portfolio-v2.css is injected when not linked */
  const all = new Set([...sheets, "portfolio-v2.css"]);
  return [...all].filter(exists);
};

const report = htmlFiles
  .map((f) => {
    const list = cssFor(f);
    return { page: f, sheets: list.length, kb: Math.round(list.reduce((n, s) => n + bytes(s), 0) / 1024) };
  })
  .sort((a, b) => b.kb - a.kb);

if (process.argv.includes("--report")) {
  console.log("\nCSS payload by page (local files, uncompressed)\n");
  console.log("  page".padEnd(36) + "sheets".padEnd(9) + "KB");
  for (const r of report) console.log(`  ${r.page}`.padEnd(36) + String(r.sheets).padEnd(9) + r.kb);
  console.log("");
}

if (failures.length) {
  console.error(`CSS architecture: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const f of failures) console.error(`  x ${f}\n`);
  process.exit(1);
}

console.log(
  `CSS architecture passed. ${passed} assertions · ${ALL_CSS.length} stylesheets · heaviest page ${report[0].kb} KB, lightest ${report[report.length - 1].kb} KB.`,
);
