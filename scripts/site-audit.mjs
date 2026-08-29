#!/usr/bin/env node
/**
 * site-audit.mjs — read-only baseline auditor for kaanbalci.com
 *
 * Companion tooling for docs/portfolio-baseline-audit.md. It re-derives the
 * structural facts recorded in that audit so drift is caught early.
 *
 * Node built-ins only, no dependencies, and it never writes to the repo.
 * Exit code is 1 when a hard failure is found, 0 when only warnings remain.
 *
 *   node scripts/site-audit.mjs            # human-readable report
 *   node scripts/site-audit.mjs --json     # machine-readable report
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://kaanbalci.com";

/* Pages intentionally excluded from sitemap.xml, with the reason. */
const SITEMAP_EXEMPT = new Map([
  ["404.html", "error page, must not be indexed"],
  ["project-detail.html", "query-string shell, marked noindex"],
]);

const failures = [];
const warnings = [];
const notes = [];

const fail = (page, rule, detail) => failures.push({ page, rule, detail });
const warn = (page, rule, detail) => warnings.push({ page, rule, detail });

const htmlFiles = readdirSync(ROOT)
  .filter((f) => f.endsWith(".html"))
  .sort();

const read = (f) => readFileSync(join(ROOT, f), "utf8");

/* ---------- tiny HTML helpers (regex-based; sufficient for this static site) ---------- */

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i"));
  return m ? m[1] : null;
};
const tags = (html, tagName) =>
  html.match(new RegExp("<" + tagName + "\\b[^>]*>", "gi")) || [];
const metaContent = (html, key, kind = "name") => {
  for (const t of tags(html, "meta")) {
    if ((attr(t, kind) || "").toLowerCase() === key.toLowerCase()) {
      return attr(t, "content");
    }
  }
  return null;
};

/* ---------- per-page structural checks ---------- */

const pageReport = [];

for (const file of htmlFiles) {
  const html = read(file);
  const isErrorPage = file === "404.html";

  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || null;
  const description = metaContent(html, "description");
  const robots = metaContent(html, "robots");
  const canonical = (() => {
    for (const t of tags(html, "link")) {
      if ((attr(t, "rel") || "").toLowerCase() === "canonical") return attr(t, "href");
    }
    return null;
  })();

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const ogCount = (html.match(/property="og:/gi) || []).length;
  const twCount = (html.match(/name="twitter:/gi) || []).length;
  const ldCount = (html.match(/application\/ld\+json/gi) || []).length;
  const hasSkip = /skip-link|skip-to-content|skip to content|İçeriğe geç/i.test(html);

  if (!title) fail(file, "title", "missing <title>");
  if (!description) fail(file, "description", "missing meta description");
  if (h1Count === 0) fail(file, "h1", "no <h1> on page");
  if (h1Count > 1) fail(file, "h1", h1Count + " <h1> elements (expected exactly 1)");
  if (!canonical && !isErrorPage) fail(file, "canonical", "missing rel=canonical");

  /* A self-referential canonical is the expectation for every indexable page. */
  if (canonical) {
    const expected =
      file === "index.html" ? SITE_ORIGIN + "/" : SITE_ORIGIN + "/" + file;
    if (canonical !== expected) {
      warn(file, "canonical", "points to " + canonical + ", expected " + expected);
    }
  }

  /* Social metadata is a warning, not a failure: coverage is knowingly uneven. */
  if (ogCount === 0 && !isErrorPage) warn(file, "opengraph", "no og: tags");
  if (twCount === 0 && !isErrorPage) warn(file, "twitter", "no twitter: tags");

  /* Duplicate element ids break both anchors and querySelector assumptions. */
  const ids = (html.match(/\sid="([^"]+)"/g) || []).map((s) =>
    s.replace(/\sid="/, "").replace(/"$/, ""),
  );
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) fail(file, "duplicate-id", dupes.join(", "));

  /* Every <img> needs an alt attribute (empty alt is valid for decorative art). */
  const imgsNoAlt = tags(html, "img").filter((t) => attr(t, "alt") === null);
  if (imgsNoAlt.length) fail(file, "img-alt", imgsNoAlt.length + " <img> without alt");

  pageReport.push({
    file,
    title,
    description: Boolean(description),
    canonical,
    robots,
    h1Count,
    ogCount,
    twCount,
    ldCount,
    hasSkip,
  });
}

/* ---------- local link + asset resolution ---------- */

const isExternal = (href) => /^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(href);

const checkedRefs = new Set();
let refCount = 0;

for (const file of htmlFiles) {
  const html = read(file);
  const refs = [
    ...tags(html, "a").map((t) => attr(t, "href")),
    ...tags(html, "img").map((t) => attr(t, "src")),
    ...tags(html, "script").map((t) => attr(t, "src")),
    ...tags(html, "link").map((t) => attr(t, "href")),
  ].filter(Boolean);

  for (const raw of refs) {
    if (isExternal(raw)) continue;
    refCount += 1;
    /* Strip query string and fragment before resolving to a file on disk. */
    const clean = raw.split("#")[0].split("?")[0];
    if (!clean) continue;
    const target = normalize(join(ROOT, decodeURIComponent(clean)));
    const key = file + "::" + clean;
    if (checkedRefs.has(key)) continue;
    checkedRefs.add(key);
    if (!target.startsWith(ROOT)) {
      fail(file, "path-escape", clean + " resolves outside the repo root");
      continue;
    }
    if (!existsSync(target)) fail(file, "missing-local-target", clean);
  }
}

/* ---------- sitemap coverage, both directions ---------- */

const sitemapPath = join(ROOT, "sitemap.xml");
let sitemapPages = [];
if (!existsSync(sitemapPath)) {
  fail("sitemap.xml", "sitemap", "sitemap.xml not found");
} else {
  const xml = readFileSync(sitemapPath, "utf8");
  sitemapPages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(SITE_ORIGIN + "/", ""))
    .map((p) => (p === "" ? "index.html" : p));

  for (const p of sitemapPages) {
    if (!existsSync(join(ROOT, p))) {
      fail("sitemap.xml", "sitemap-dangling", p + " listed but no such file");
    }
  }
  for (const f of htmlFiles) {
    if (sitemapPages.includes(f)) continue;
    if (SITEMAP_EXEMPT.has(f)) {
      notes.push("sitemap omits " + f + " — " + SITEMAP_EXEMPT.get(f));
      continue;
    }
    fail("sitemap.xml", "sitemap-missing", f + " exists but is not listed");
  }
}

/* ---------- robots.txt ---------- */

const robotsPath = join(ROOT, "robots.txt");
if (!existsSync(robotsPath)) {
  fail("robots.txt", "robots", "robots.txt not found");
} else {
  const robots = readFileSync(robotsPath, "utf8");
  if (!robots.includes("Sitemap:")) fail("robots.txt", "robots", "no Sitemap: directive");
}

/* ---------- Ajoop intent normalization (the documented P1 regression) ---------- */

/* Fixed in BRIEF 00.1. Comments legitimately mention the old API when
 * explaining the fix, so strip them before checking executable code. */
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* BRIEF 03 moved the matcher into js/ajoop/matcher.js. */
const chatbotSrc = stripComments(readFileSync(join(ROOT, "js", "ajoop", "matcher.js"), "utf8"));
const usesTurkishFold = /toLocaleLowerCase\(\s*["']tr-TR["']\s*\)/.test(chatbotSrc);
/* ASCII "I" becomes dotless "ı" under Turkish folding, so these inputs cannot match. */
const brokenSamples = ["SINAMA", "AI", "GITHUB", "EMAIL"].filter(
  (s) => s.toLocaleLowerCase("tr-TR") !== s.toLowerCase(),
);

if (usesTurkishFold) {
  fail(
    "legacy-script.js",
    "ajoop-normalization",
    "detectChatbotIntent folds with tr-TR; uppercase ASCII input is corrupted (" +
      brokenSamples.join(", ") +
      ") — regression of the BRIEF 00.1 fix, see docs/portfolio-baseline-audit.md",
  );
}

/* The matching layer must stay extractable so scripts/qa-ajoop-intents.mjs can
 * exercise the shipped implementation rather than a copy. */
if (!chatbotSrc.includes("function matchesKeyword")) {
  fail(
    "legacy-script.js",
    "ajoop-matching",
    "the Ajoop token matching layer is missing — run npm run qa:ajoop",
  );
}

/* ---------- output ---------- */

const summary = {
  pages: htmlFiles.length,
  localRefsChecked: refCount,
  sitemapUrls: sitemapPages.length,
  failures: failures.length,
  warnings: warnings.length,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, pages: pageReport, failures, warnings, notes }, null, 2));
} else {
  console.log("kaanbalci.com — baseline site audit\n");
  console.log(
    "Pages: " +
      summary.pages +
      " · local refs checked: " +
      summary.localRefsChecked +
      " · sitemap URLs: " +
      summary.sitemapUrls +
      "\n",
  );

  console.log("Page metadata matrix");
  console.log("  page".padEnd(36) + "h1  og  tw  ld  canon  skip");
  for (const p of pageReport) {
    console.log(
      ("  " + p.file).padEnd(36) +
        p.h1Count +
        "   " +
        String(p.ogCount).padEnd(3) +
        " " +
        String(p.twCount).padEnd(3) +
        " " +
        String(p.ldCount).padEnd(3) +
        " " +
        (p.canonical ? "yes" : "no ") +
        "    " +
        (p.hasSkip ? "yes" : "no"),
    );
  }

  if (notes.length) {
    console.log("\nNotes");
    for (const n of notes) console.log("  - " + n);
  }
  if (warnings.length) {
    console.log("\nWarnings (" + warnings.length + ")");
    for (const w of warnings) console.log("  ~ " + w.page + " [" + w.rule + "] " + w.detail);
  }
  if (failures.length) {
    console.log("\nFailures (" + failures.length + ")");
    for (const f of failures) console.log("  x " + f.page + " [" + f.rule + "] " + f.detail);
  } else {
    console.log("\nNo structural failures.");
  }
}

process.exit(failures.length ? 1 : 0);
