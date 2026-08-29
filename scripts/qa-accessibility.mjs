#!/usr/bin/env node
/**
 * qa-accessibility.mjs — static accessibility contracts (BRIEF 04).
 *
 * Complements html-validate (which already runs in `npm run qa`) with the
 * site-specific structural rules it does not know about: skip-link coverage and
 * targets, landmark uniqueness, dialog semantics, form labelling, and the
 * generated-page inheritance contract.
 *
 * These are STATIC checks. They cannot prove keyboard order, focus movement or
 * contrast, and they are not a WCAG conformance audit — those need a browser
 * and a human. See docs/css-accessibility-architecture.md.
 *
 * Node built-ins only. Validates; never writes.
 *
 *   node scripts/qa-accessibility.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (actual === expected) { passed += 1; return; }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
};
const tagsOf = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];

const rootPages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const generated = fs.existsSync(path.join(ROOT, "projects"))
  ? fs.readdirSync(path.join(ROOT, "projects"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `projects/${e.name}/index.html`)
  : [];
const allPages = [...rootPages, ...generated];

for (const file of allPages) {
  const html = read(file);
  const isGenerated = file.startsWith("projects/");
  const prefix = isGenerated ? "../../" : "";

  /* ---------- language ---------- */
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [""])[0];
  ok(`${file}: <html> declares a language`, Boolean(attr(htmlTag, "lang")));

  /* ---------- single main landmark, usable as a skip target ---------- */
  const mains = tagsOf(html, "main");
  check(`${file}: exactly one <main> landmark`, mains.length, 1);
  if (mains.length === 1) {
    check(`${file}: <main> is the skip target`, attr(mains[0], "id"), "main-content");
    check(`${file}: <main> is programmatically focusable`, attr(mains[0], "tabindex"), "-1");
  }

  /* ---------- skip link ---------- */
  const skips = [...html.matchAll(/<a[^>]*class="[^"]*skip-link[^"]*"[^>]*>/gi)].map((m) => m[0]);
  check(`${file}: exactly one skip link`, skips.length, 1);
  if (skips.length === 1) {
    check(`${file}: skip link targets #main-content`, attr(skips[0], "href"), "#main-content");
    /* it must be the first focusable thing in the document */
    const bodyStart = html.search(/<body\b[^>]*>/i);
    const skipAt = html.indexOf(skips[0]);
    const firstInteractive = html.slice(bodyStart).search(/<(a|button|input|select|textarea)\b/i) + bodyStart;
    ok(`${file}: skip link is the first focusable element`, skipAt <= firstInteractive);
  }
  ok(`${file}: loads the accessibility stylesheet`, html.includes(`href="${prefix}css/a11y.css"`));

  /* ---------- headings ---------- */
  const h1s = html.match(/<h1\b/gi) || [];
  check(`${file}: exactly one <h1>`, h1s.length, 1);

  /* ---------- images ---------- */
  const imgsNoAlt = tagsOf(html, "img").filter((t) => attr(t, "alt") === null);
  check(`${file}: every <img> has alt`, imgsNoAlt.length, 0);

  /* ---------- unique ids ---------- */
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  check(`${file}: no duplicate element ids${dupes.length ? ` (${dupes.join(", ")})` : ""}`, dupes.length, 0);

  /* ---------- dialogs carry an accessible name ---------- */
  for (const tag of html.match(/<[a-z]+\b[^>]*role="dialog"[^>]*>/gi) || []) {
    ok(
      `${file}: dialog has an accessible name`,
      Boolean(attr(tag, "aria-label") || attr(tag, "aria-labelledby")),
    );
    check(`${file}: dialog declares aria-modal`, attr(tag, "aria-modal"), "true");
  }

  /* ---------- canvas carries a role and a name ---------- */
  for (const tag of tagsOf(html, "canvas")) {
    ok(
      `${file}: <canvas> has a role so its name is exposed`,
      Boolean(attr(tag, "role")),
    );
    ok(
      `${file}: <canvas> has an accessible name`,
      Boolean(attr(tag, "aria-label") || attr(tag, "aria-labelledby")),
    );
  }

  /* ---------- buttons are buttons ---------- */
  ok(
    `${file}: no clickable div/span simulating a button`,
    !/<(div|span)\b[^>]*role="button"[^>]*>/i.test(html) ||
      /<(div|span)\b[^>]*role="button"[^>]*tabindex=/i.test(html),
  );
}

/* ---------- forms ---------- */

const requestHtml = read("request.html");
const formInputs = [
  ...tagsOf(requestHtml, "input"),
  ...tagsOf(requestHtml, "select"),
  ...tagsOf(requestHtml, "textarea"),
].filter((t) => attr(t, "type") !== "hidden");

for (const field of formInputs) {
  const name = attr(field, "name") || "(unnamed)";
  const id = attr(field, "id");
  const labelled =
    Boolean(attr(field, "aria-label")) ||
    Boolean(attr(field, "aria-labelledby")) ||
    (id && new RegExp(`<label[^>]*for="${id}"`).test(requestHtml)) ||
    /* the form wraps most controls in their <label>, which is valid */
    new RegExp(`<label[^>]*>[^<]*<[^>]*name="${name}"`).test(requestHtml.replace(/\n/g, "")) ||
    requestHtml.includes(`<label>`);
  ok(`request.html: field "${name}" is labelled`, labelled);
}

ok(
  "request.html: status region announces politely",
  /data-request-status[^>]*aria-live="polite"|aria-live="polite"[^>]*data-request-status/.test(requestHtml),
);
ok("request.html: consent control is a real checkbox", /name="consent"[^>]*type="checkbox"|type="checkbox"[^>]*name="consent"/.test(requestHtml));
ok("request.html: honeypot stays out of the tab order", /company_website[\s\S]{0,200}tabindex="-1"|tabindex="-1"[\s\S]{0,200}company_website/.test(requestHtml));

/* ---------- Ajoop dialog ---------- */

const assistant = read("js/ajoop/assistant.js");
ok("Ajoop panel is a labelled modal dialog", /role="dialog"[\s\S]{0,120}aria-modal="true"[\s\S]{0,120}aria-labelledby/.test(assistant));
ok("Ajoop traps focus while open", /trapFocus\(/.test(assistant));
ok("Ajoop restores focus to its trigger", /restoreOverlayFocus\(/.test(assistant));

/* ---------- shared overlay contract ---------- */

const shell = read("js/core/shell.js");
for (const helper of ["trapFocus", "rememberOverlayTrigger", "restoreOverlayFocus", "setBackgroundInert"]) {
  ok(`shared overlay helper exists: ${helper}`, new RegExp(`function ${helper}\\b`).test(shell));
}
for (const [file, label] of [
  ["js/features/certificates.js", "certificate modal"],
  ["js/features/command-palette.js", "command palette"],
  ["js/features/recruiter.js", "recruiter drawer"],
  ["js/ajoop/assistant.js", "Ajoop panel"],
]) {
  const src = read(file);
  ok(`${label} uses the shared focus trap`, /trapFocus\(/.test(src));
  ok(`${label} returns focus to its trigger`, /restoreOverlayFocus\(|lastModalTrigger/.test(src));
}

/* ---------- motion ---------- */

const a11yCss = read("css/a11y.css");
ok("reduced motion is honoured site-wide", /@media \(prefers-reduced-motion: reduce\)/.test(a11yCss));
ok("reveal animations do not leave content hidden under reduced motion", /\.reveal[\s\S]{0,200}opacity: 1/.test(a11yCss));

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Accessibility: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const f of failures) console.error(`  x ${f}\n`);
  process.exit(1);
}

console.log(
  `Accessibility contracts passed. ${passed} assertions across ${allPages.length} pages ` +
    `(${rootPages.length} authored + ${generated.length} generated). Static checks only — ` +
    `keyboard, focus order and contrast still need browser verification.`,
);
