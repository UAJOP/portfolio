#!/usr/bin/env node
/** Blocking contracts for the Master 2 public design system. */

import fs from "node:fs";
import path from "node:path";
import { ROOT, authoredHtmlFiles, read } from "./i18n-catalog.mjs";
import {
  contrast,
  declarationsFor,
  exactTokenBlock,
  parseHex,
  stripComments,
  topLevelRules,
} from "./css-tokens.mjs";

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
  "--color-action",
  "--color-action-hover",
  "--color-on-action",
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

const LIGHT = 'html[data-theme="light"]';
const darkTokens = exactTokenBlock(css, ":root");
const lightTokens = exactTokenBlock(css, LIGHT);
for (const token of [
  "--color-canvas",
  "--color-canvas-raised",
  "--color-surface",
  "--color-surface-raised",
  "--color-surface-inset",
  "--color-text",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-accent",
  "--color-accent-strong",
  "--color-action",
  "--color-action-hover",
  "--color-on-action",
  "--color-success",
  "--color-warning",
  "--color-danger",
  "--color-border",
  "--color-border-subtle",
  "--color-border-strong",
  "--shadow-md",
]) {
  assert(lightTokens.has(token), `light theme must independently define ${token}`);
}

assert(!/font-family\s*:[^;]*(?:Georgia|Times New Roman|serif)/i.test(css), "Master 2 headings must not introduce a serif family");
assert(!/#(?:00ffff|00e5ff|00ffff)|\bcyan\b/i.test(css), "Master 2 must not regress to a cyan/neon palette");
assert(css.includes("prefers-reduced-motion: reduce"), "Master 2 must preserve reduced-motion behavior");
assert(!/body\s*\{[^}]*overflow-x\s*:\s*hidden/is.test(css), "Master 2 must not hide horizontal overflow to mask defects");
assert(/\.btn\.primary\s*\{[^}]*background:\s*var\(--color-action\)[^}]*color:\s*var\(--color-on-action\)/s.test(css), "Primary actions must use the measured action-fill contrast tokens");
assert(/\.btn\.primary:hover\s*\{[^}]*background:\s*var\(--color-action-hover\)[^}]*color:\s*var\(--color-on-action\)/s.test(css), "Primary hover actions must preserve the measured contrast token pair");

/* ---- Compatibility aliases win in BOTH themes ---------------------------
 * Legacy components read --brand, --surface, --muted … . style.css declares
 * its V3 palette for those names on html[data-theme="light"] (0,1,1), which
 * outranks a plain :root. The Master 2 alias block must therefore list every
 * selector a legacy stylesheet uses for them, and load after that stylesheet,
 * or light mode silently falls back to V3. */
const ALIASES = {
  "--bg": "var(--color-canvas)",
  "--bg-2": "var(--color-canvas-raised)",
  "--surface": "var(--color-surface)",
  "--surface-solid": "var(--color-surface)",
  "--surface-2": "var(--color-surface-raised)",
  "--line": "var(--color-border)",
  "--line-strong": "var(--color-border-strong)",
  "--text": "var(--color-text)",
  "--muted": "var(--color-text-secondary)",
  "--muted-2": "var(--color-text-muted)",
  "--brand": "var(--color-accent)",
  "--brand-2": "var(--color-accent-strong)",
  "--accent": "var(--color-accent)",
  "--success": "var(--color-success)",
  "--warning": "var(--color-warning)",
  "--danger": "var(--color-danger)",
  "--shadow": "var(--shadow-md)",
  "--max-width": "var(--content-width)",
  "--light-card-surface": "var(--color-surface)",
  "--light-card-surface-soft": "var(--color-surface-raised)",
  "--light-card-border": "var(--color-border)",
  "--light-card-shadow": "var(--shadow-md)",
};
const THEME_ALIASES = Object.keys(ALIASES).filter((name) => !name.startsWith("--light-card"));
const v2Rules = topLevelRules(css);
const aliasRule = v2Rules.find((rule) => rule.selectors.includes(":root") && rule.selectors.includes(LIGHT));
assert(Boolean(aliasRule), `portfolio-v2.css must declare its compatibility aliases on ":root, ${LIGHT}"`);
for (const name of THEME_ALIASES) {
  assert(aliasRule?.declarations.get(name) === ALIASES[name], `compatibility alias ${name} must resolve to ${ALIASES[name]} in both themes`);
}
for (const name of Object.keys(ALIASES).filter((key) => key.startsWith("--light-card"))) {
  assert(lightTokens.get(name) === ALIASES[name], `light card alias ${name} must resolve to ${ALIASES[name]}`);
}
for (const rule of v2Rules) {
  if (rule === aliasRule) continue;
  for (const name of THEME_ALIASES) {
    assert(!rule.declarations.has(name), `${name} may only be declared in the shared alias block (found on ${rule.selectors.join(", ")})`);
  }
}
for (const value of aliasRule?.declarations.values() || []) {
  assert(/^var\(--(?:color-|shadow-md|content-width)/.test(value), `compatibility aliases must resolve from Master 2 tokens, not literals (${value})`);
}

const localSheets = new Set();
for (const file of authoredHtmlFiles()) {
  const sheets = [...read(file).matchAll(/<link[^>]+href="\/([^"]+\.css)"[^>]*rel="stylesheet"|<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+\.css)"/g)]
    .map((match) => match[1] || match[2]);
  const v2Index = sheets.indexOf("portfolio-v2.css");
  assert(v2Index === sheets.length - 1, `${file}: portfolio-v2.css must be the last local stylesheet so equal-specificity aliases win`);
  sheets.forEach((sheet) => sheet !== "portfolio-v2.css" && localSheets.add(sheet));
}
const aliasPattern = new RegExp(`(?:^|[;{\\s])(${Object.keys(ALIASES).map((name) => name.replace(/-/g, "\\-")).join("|")})\\s*:`);
for (const sheet of localSheets) {
  const legacy = read(sheet);
  for (const rule of topLevelRules(legacy)) {
    const overlapping = [...rule.declarations.keys()].filter((name) => name in ALIASES);
    if (!overlapping.length) continue;
    for (const selector of rule.selectors) {
      assert(
        aliasRule?.selectors.includes(selector) || (selector === LIGHT && overlapping.every((name) => lightTokens.has(name) || aliasRule?.declarations.has(name))),
        `${sheet} sets ${overlapping.join(", ")} on "${selector}", which the Master 2 alias block does not override`,
      );
    }
  }
  /* A legacy alias inside @media would escape the top-level comparison. */
  const nested = stripComments(legacy).match(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) || [];
  for (const block of nested) {
    assert(!aliasPattern.test(block.replace(/^@media[^{]*\{/, "")), `${sheet} redeclares a compatibility alias inside @media, which bypasses the Master 2 alias block`);
  }
}

/* Legacy "dark ink on a --brand fill" markers were tuned for the bright V3
 * brand. Once the aliases resolve to the Master 2 accent they fall below AA in
 * light mode, so each such selector must be re-declared in portfolio-v2.css
 * with token colours. The AJOOP chat widget is excluded: its own light rules in
 * style.css already put near-white text on the fill (measured ≥ 5:1), and its
 * styling is outside the Master 2 surface. */
const AJOOP_WIDGET = /^\.chatbot-/;
for (const sheet of localSheets) {
  for (const rule of topLevelRules(read(sheet))) {
    const ink = rule.declarations.get("color");
    const fill = rule.declarations.get("background") || rule.declarations.get("background-color") || "";
    if (!ink || !/^#0[0-9a-f]{5}$/i.test(ink) || !/var\(--(?:brand|brand-2|accent|success|warning)\)/.test(fill)) continue;
    for (const selector of rule.selectors) {
      if (AJOOP_WIDGET.test(selector)) continue;
      const override = declarationsFor(css, selector);
      assert(
        /^var\(--color-/.test(override.get("color") || "") && /^var\(--color-/.test(override.get("background") || ""),
        `${sheet}: "${selector}" paints ${ink} on a brand fill; portfolio-v2.css must re-declare it with the action token pair`,
      );
    }
  }
}

/* Bright V3 palette literals used as TEXT colour in legacy sheets bypass the
 * aliases entirely (e.g. #fbbf24 on a white light-theme card is 1.6:1). Each
 * must be re-declared in portfolio-v2.css with a token. */
const V3_TEXT_LITERAL = /#(?:38bdf8|7dd3fc|22d3ee|0ea5e9|818cf8|a5b4fc|34d399|6ee7b7|fbbf24|fcd34d|fb7185|fda4af|0284c7|0891b2|059669|d97706|e11d48)\b/i;
for (const sheet of localSheets) {
  for (const rule of topLevelRules(read(sheet))) {
    const ink = rule.declarations.get("color");
    if (!ink || !V3_TEXT_LITERAL.test(ink)) continue;
    for (const selector of rule.selectors) {
      if (AJOOP_WIDGET.test(selector)) continue;
      assert(
        /^var\(--color-/.test(declarationsFor(css, selector).get("color") || ""),
        `${sheet}: "${selector}" uses the V3 literal ${ink} as text; portfolio-v2.css must re-declare it with a Master 2 token`,
      );
    }
  }
}

/* A literal dark ink with no fill of its own depends on the surface it
 * inherits. Once that surface is a dark token (e.g. a select's options in dark
 * mode) the text disappears, so such rules must be restated with tokens. */
for (const sheet of localSheets) {
  for (const rule of topLevelRules(read(sheet))) {
    const ink = rule.declarations.get("color");
    const ownFill = rule.declarations.get("background") || rule.declarations.get("background-color");
    if (!ink || !/^#0[0-9a-f]{5}$/i.test(ink) || ownFill) continue;
    for (const selector of rule.selectors) {
      if (AJOOP_WIDGET.test(selector) || /\.chatbot-/.test(selector)) continue;
      /* Game sheets own their art (posters, win cards drawn on light fills);
       * only their form controls inherit site surfaces. */
      if (sheet.startsWith("css/games/") && !/\b(?:option|select|input|textarea)\b/.test(selector)) continue;
      assert(
        /^var\(--color-/.test(declarationsFor(css, selector).get("color") || ""),
        `${sheet}: "${selector}" sets a literal dark ink (${ink}) with no fill of its own; portfolio-v2.css must restate it with tokens`,
      );
    }
  }
}

/* Focus and form-state colours: a legacy :focus rule that paints a bright V3
 * literal into border, box-shadow or outline must be restated with tokens.
 * Bare element selectors are covered when css/a11y.css (loaded later)
 * re-declares the same selector with a token outline. */
const V3_STATE_LITERAL = /rgba\(\s*(?:56, 189, 248|34, 211, 238|2, 132, 199|8, 145, 178)\s*,|#(?:38bdf8|22d3ee|0284c7|0891b2|7dd3fc)\b/i;
const a11yCss = read("css/a11y.css");
for (const sheet of localSheets) {
  for (const rule of topLevelRules(read(sheet))) {
    const leaking = [...rule.declarations].filter(([property, value]) => /border|box-shadow|outline/.test(property) && V3_STATE_LITERAL.test(value));
    if (!leaking.length) continue;
    for (const selector of rule.selectors) {
      if (!/:focus/.test(selector)) continue;
      const override = declarationsFor(css, selector);
      const restated = leaking.every(([property]) => {
        const value = override.get(property) || override.get(property.replace(/-color$/, "")) || "";
        return /var\(--color-|^none$/.test(value);
      });
      const coveredByA11y = sheet !== "css/a11y.css" && /^[a-z]+:focus(-visible)?$/.test(selector) && /var\(--/.test(declarationsFor(a11yCss, selector).get("outline") || "");
      assert(restated || coveredByA11y, `${sheet}: "${selector}" paints a V3 literal into its focus state; portfolio-v2.css must restate it with tokens`);
    }
  }
}

/* The V3 light body gradient must not survive under the Master 2 canvas. */
assert(
  declarationsFor(css, `${LIGHT} body`).get("background") === "var(--color-canvas)",
  "light theme body must reset style.css's V3 gradient to the Master 2 canvas",
);

/* ---- Measured token contrast (WCAG AA, normal text) --------------------- */
const ALL_SURFACES = ["--color-canvas", "--color-canvas-raised", "--color-surface", "--color-surface-raised", "--color-surface-inset"];
const pairs = [
  [["--color-text", "--color-text-secondary", "--color-text-muted", "--color-accent-strong",
    "--color-success", "--color-warning", "--color-danger"], ALL_SURFACES],
  /* Accent is the link/brand text colour; it is not used as text on the raised
   * tier, where dark accent measures 4.22:1 (tracked as Master 3 debt). */
  [["--color-accent"], ["--color-canvas", "--color-surface", "--color-surface-inset"]],
];
for (const [themeName, themeTokens] of [["dark", darkTokens], ["light", lightTokens]]) {
  for (const [foregrounds, backgrounds] of pairs) {
    for (const fg of foregrounds) for (const bg of backgrounds) {
      const a = parseHex(themeTokens.get(fg));
      const b = parseHex(themeTokens.get(bg));
      assert(Boolean(a && b), `${themeName}: ${fg} and ${bg} must be opaque #rrggbb tokens`);
      if (a && b) {
        const ratio = contrast(a, b);
        assert(ratio >= 4.5, `${themeName}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
      }
    }
  }
  /* Status chips put text on its own translucent -soft tint, which costs up to
   * ~0.5 of contrast; the -strong text tokens must clear AA on the tint over
   * every surface tier. */
  for (const [text, tint] of [
    ["--color-success-strong", "--color-success-soft"],
    ["--color-warning-strong", "--color-warning-soft"],
    ["--color-accent-strong", "--color-accent-soft"],
  ]) {
    const fgRgb = parseHex(themeTokens.get(text));
    const soft = String(themeTokens.get(tint) || "").match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
    assert(Boolean(fgRgb && soft), `${themeName}: ${text} must be #rrggbb and ${tint} rgba()`);
    if (!fgRgb || !soft) continue;
    const [r, g, b, alpha] = soft.slice(1).map(Number);
    for (const bg of ALL_SURFACES) {
      const base = parseHex(themeTokens.get(bg));
      const chip = [r, g, b].map((channel, index) => Math.round(channel * alpha + base[index] * (1 - alpha)));
      const ratio = contrast(fgRgb, chip);
      assert(ratio >= 4.5, `${themeName}: ${text} on ${tint} over ${bg} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
    }
  }
  /* Form-control boundaries identify the component: WCAG 1.4.11 needs 3:1
   * against every surface a control can sit on. */
  const control = parseHex(themeTokens.get("--color-border-control"));
  assert(Boolean(control), `${themeName}: --color-border-control must be an opaque #rrggbb token`);
  if (control) {
    for (const bg of ALL_SURFACES) {
      const ratio = contrast(control, parseHex(themeTokens.get(bg)));
      assert(ratio >= 3, `${themeName}: --color-border-control on ${bg} is ${ratio.toFixed(2)}:1, below the 3:1 non-text minimum`);
    }
  }
  for (const fill of ["--color-action", "--color-action-hover"]) {
    const ratio = contrast(parseHex(themeTokens.get("--color-on-action")), parseHex(themeTokens.get(fill)));
    assert(ratio >= 4.5, `${themeName}: --color-on-action on ${fill} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
  }
}

for (const [selector, token] of [
  [".build-log-status.is-shipped", "var(--color-success-strong)"],
  [".project-status.is-live", "var(--color-success-strong)"],
  [".build-log-status.is-building", "var(--color-warning-strong)"],
  [".build-log-status.is-integration", "var(--color-accent-strong)"],
  [".journey-grid span", "var(--color-accent-strong)"],
]) {
  assert(declarationsFor(css, selector).get("color") === token, `${selector} text must use ${token} (measured on its tint/surface)`);
}

/* ---- Master 2B composition invariants -----------------------------------
 * Ceilings, not exact values: the scale may evolve, but no heading may grow
 * back into a viewport-filling billboard. */
const clampMax = (value) => {
  const match = String(value || "").match(/clamp\([^,]+,[^,]+,\s*([\d.]+)rem\s*\)/);
  return match ? Number(match[1]) : NaN;
};
for (const [token, ceiling] of [["--type-display", 3.75], ["--type-h1", 3], ["--type-h2", 2.25], ["--type-h3", 1.4]]) {
  const max = clampMax(darkTokens.get(token));
  assert(Number.isFinite(max), `${token} must be a clamp() ending in rem`);
  assert(max <= ceiling, `${token} caps at ${max}rem; the type scale ceiling is ${ceiling}rem`);
}

/* Home's first fold must lead to real work: the identity facts sit in the
 * hero copy and "Strongest evidence" links to the flagship case study. */
const heroSection = read("index.html").match(/<section class="hero section-shell">([\s\S]*?)<\/section>/)?.[1] || "";
const heroCopy = heroSection.match(/<div class="hero-copy[\s\S]*?(?=<div class="hero-visual)/)?.[0] || "";
assert(heroCopy.includes('class="identity-proof"'), "Home identity facts must sit in the hero copy, inside the first fold");
assert(/<a href="\/sinama-case-study\/"><strong data-message-key="home\.identity\.evidenceValue">/.test(heroCopy), "Home 'Strongest evidence' must link to the SINAMA case study");

/* Works: the flagship leads the primary tier and archive entries are marked
 * so they render as index rows, never as peers of flagship work. */
const works = read("works/index.html");
const primaryTier = works.match(/<section class="project-tier project-tier-selected"[\s\S]*?<\/section>/)?.[0] || "";
assert(/<article class="project-card[^"]*"[^>]*data-project-link="\/sinama-case-study\/"/.test(primaryTier.match(/<article[^>]*>/)?.[0] || ""), "Works primary tier must open with SINAMA");
for (const slug of ["hospital-appointment-system", "cars-dataset-analysis", "legacy-of-the-lost", "my-museum"]) {
  assert(new RegExp(`<article class="project-card is-archive[^"]*"[^>]*data-project-link="${slug}"`).test(works), `Works archive entry ${slug} must carry is-archive`);
}

/* Request: the form precedes the explanatory copy in reading order. */
const request = read("request/index.html");
assert(request.indexOf("<form class=\"request-form") > -1 && request.indexOf("<form class=\"request-form") < request.indexOf("class=\"request-copy"), "Request form must come before the request copy in source order");

/* ---- Project detail (25 routes × 5 locales share these rules) ----------- */
const tokenOnly = (value) => typeof value === "string" && /^var\(--color-[a-z-]+\)$/.test(value);
for (const [selector, property] of [
  [".project-detail-meta article", "background"],
  [".process-steps article", "background"],
  [".project-detail-meta span", "color"],
  [".project-detail-meta strong", "color"],
  [".process-steps h3", "color"],
  [".process-steps p", "color"],
  [".process-steps span", "background"],
  [".process-steps span", "color"],
]) {
  assert(
    tokenOnly(declarationsFor(css, selector).get(property)),
    `${selector} must take its ${property} from a Master 2 --color-* token in both themes`,
  );
}

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

/* ---- A fixed lead slot holds one paragraph, or the stylesheet stacks extras --
 * Mastheads and case-section headings give their lead paragraph an explicit
 * grid row beside the title. Every lead paragraph in the container matches
 * that rule, so a second one lands in the same cell and is painted over the
 * first, which no overflow, clipping or contrast check notices. Extra lead
 * paragraphs are allowed only where the stylesheet stacks them, or where a
 * page or container context releases the slot back to grid-row: auto (legal,
 * utility and error mastheads). */
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
function leadParagraphCounts(html, classToken) {
  const counts = [];
  const opening = new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\bclass="((?:[^"]*\\s)?${classToken}(?:\\s[^"]*)?)"[^>]*>`, "g");
  const tag = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g;
  for (const start of html.matchAll(opening)) {
    let depth = 0;
    let leads = 0;
    tag.lastIndex = start.index;
    for (let match = tag.exec(html); match; match = tag.exec(html)) {
      const [, closing, name, attributes] = match;
      if (VOID_ELEMENTS.has(name.toLowerCase()) || attributes.trimEnd().endsWith("/")) continue;
      if (closing) {
        depth -= 1;
        if (depth === 0) break;
        continue;
      }
      if (depth === 1 && name.toLowerCase() === "p" && !/\bclass="[^"]*\beyebrow\b/.test(attributes)) leads += 1;
      depth += 1;
    }
    counts.push({ count: leads, classes: start[1].split(/\s+/) });
  }
  return counts;
}
/* Unconditional rules that hand a lead paragraph back to grid-row: auto, as
 * { className, pages }: `body[data-page="legal"] .page-hero > p:not(.eyebrow)`
 * releases .page-hero on legal pages; `.error-hero > p:not(.eyebrow)` releases
 * any container that also carries .error-hero. */
const slotReleases = [];
for (const rule of v2Rules) {
  if (rule.declarations.get("grid-row") !== "auto") continue;
  for (const selector of rule.selectors) {
    const match = selector.match(/^(?:(body(?:\[[^\]]*\]|:is\([^)]*\)))\s+)?\.([\w-]+) > p:not\(\.eyebrow\)$/);
    if (match) slotReleases.push({ className: match[2], pages: match[1] ? new Set([...match[1].matchAll(/data-page="([^"]+)"/g)].map((page) => page[1])) : null });
  }
}
for (const container of [".page-hero", ".case-section-heading"]) {
  const lead = `${container} > p:not(.eyebrow)`;
  const fixedSlot = /^\d/.test(declarationsFor(css, lead).get("grid-row") || "");
  const stacks = declarationsFor(css, `${lead} ~ p:not(.eyebrow)`).get("grid-row") === "auto";
  if (!fixedSlot || stacks) continue;
  for (const file of authoredHtmlFiles()) {
    const html = read(file);
    const page = html.match(/<body\b[^>]*\bdata-page="([^"]+)"/)?.[1];
    for (const { count, classes } of leadParagraphCounts(html, container.slice(1))) {
      const released = slotReleases.some((release) => classes.includes(release.className) && (!release.pages || release.pages.has(page)));
      assert(released || count <= 1, `${file}: a ${container} holds ${count} lead paragraphs, but ${lead} has one fixed grid cell; stack the extras (${lead} ~ p:not(.eyebrow) { grid-row: auto }) or merge the copy`);
    }
  }
}

if (failures.length) {
  console.error(`Master 2 design QA failed: ${failures.length} failure(s), ${assertions} assertions`);
  failures.forEach((failure) => console.error(`  x ${failure}`));
  process.exit(1);
}

console.log(`Master 2 design QA passed. ${assertions} assertions · shared system · true light theme · visual evidence.`);
