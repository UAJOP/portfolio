#!/usr/bin/env node
/**
 * qa-runtime-modules.mjs — guards the modular frontend runtime (BRIEF 03).
 *
 * Until BRIEF 03 every page loaded one 5,244-line legacy-script.js. The runtime
 * is now a set of modules under js/, loaded per page by the manifest inside
 * script.js. This check enforces that the manifest, the modules and the pages
 * agree, and that page-scoped code cannot quietly become global again.
 *
 * Node built-ins only. Validates; never writes.
 *
 *   node scripts/qa-runtime-modules.mjs
 *   node scripts/qa-runtime-modules.mjs --report   # payload table only
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
  if (actual === expected) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

/* ---------- parse the manifest out of script.js ---------- */

const loader = read("script.js");

const parseList = (name) => {
  const m = loader.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

const COMMON = parseList("COMMON");
ok("script.js declares a COMMON module list", COMMON && COMMON.length > 0);

const pageBlock = loader.match(/const PAGE_MODULES = \{([\s\S]*?)\n  \};/);
ok("script.js declares PAGE_MODULES", Boolean(pageBlock));

const PAGE_MODULES = {};
if (pageBlock) {
  for (const line of pageBlock[1].split("\n")) {
    const m = line.match(/^\s*([A-Za-z]+):\s*\[([^\]]*)\]/);
    if (!m) continue;
    PAGE_MODULES[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
}
ok("PAGE_MODULES parsed at least one page type", Object.keys(PAGE_MODULES).length > 0);

const ALL_MODULES = [...new Set([...(COMMON || []), ...Object.values(PAGE_MODULES).flat()])];

/* ---------- 1. every referenced module exists, and every module is referenced ---------- */

for (const module of ALL_MODULES) {
  ok(`manifest module exists on disk: ${module}`, exists(module));
}

const walk = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const next = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(next);
    return e.name.endsWith(".js") ? [next] : [];
  });

const onDisk = exists("js") ? walk("js").sort() : [];
ok("js/ contains runtime modules", onDisk.length > 0);
for (const module of onDisk) {
  ok(`module is referenced by the manifest (no orphan): ${module}`, ALL_MODULES.includes(module));
}

/* ---------- 2. no duplicate loading ---------- */

check("COMMON lists no module twice", COMMON.length, new Set(COMMON).size);
for (const [page, modules] of Object.entries(PAGE_MODULES)) {
  check(`page "${page}" lists no module twice`, modules.length, new Set(modules).size);
  for (const module of modules) {
    ok(`page "${page}" does not repeat a COMMON module: ${module}`, !COMMON.includes(module));
  }
}

/* ---------- 3. dependency order inside COMMON ---------- */

/* These orderings reproduce the single-file execution order and are load-bearing. */
const ORDER = [
  ["js/core/shell.js", "js/core/theme.js"],
  ["js/core/theme.js", "js/core/i18n.js"],
  ["js/core/i18n.js", "js/portfolio/routing.js"],
  ["js/portfolio/routing.js", "js/ajoop/assistant.js"],
  ["js/ajoop/matcher.js", "js/ajoop/assistant.js"],
  ["js/features/ultimate.js", "js/features/recruiter.js"],
  ["js/features/recruiter.js", "js/features/command-palette.js"],
  ["js/features/command-palette.js", "js/features/ajoop-nav.js"],
];
for (const [before, after] of ORDER) {
  const a = COMMON.indexOf(before);
  const b = COMMON.indexOf(after);
  ok(`${before} loads before ${after}`, a !== -1 && b !== -1 && a < b);
}

/* applyLanguage() runs inside assistant.js and calls renderProjectDetail, so the
 * project-detail module must be spliced in ahead of it. */
const insertBlock = loader.match(/const INSERT_BEFORE = \{([\s\S]*?)\};/);
ok("script.js declares INSERT_BEFORE splice points", Boolean(insertBlock));
if (insertBlock) {
  ok(
    "project-detail is spliced ahead of the Ajoop assistant",
    /"js\/portfolio\/project-detail\.js":\s*"js\/ajoop\/(matcher|assistant)\.js"/.test(insertBlock[1]),
  );
}

/* ---------- 4. pages declare a page type the manifest knows ---------- */

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const pageOf = {};

for (const file of htmlFiles) {
  const html = read(file);
  const body = (html.match(/<body\b[^>]*>/i) || [""])[0];
  const marker = (body.match(/data-page="([^"]*)"/) || [])[1];
  pageOf[file] = marker;

  ok(`${file}: declares a data-page marker`, Boolean(marker));
  if (marker) {
    ok(`${file}: data-page "${marker}" is known to the manifest`, marker in PAGE_MODULES);
  }

  /* The loader reads document.body at boot, so it must sit inside <body>. */
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  ok(
    `${file}: script.js is loaded from <body>, not <head>`,
    !(headMatch && /src="[^"]*script\.js"/.test(headMatch[1])),
  );

  /* No page may load a runtime module directly; the manifest owns order. */
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of srcs) {
    ok(`${file}: does not bypass the manifest with ${src}`, !src.includes("js/"));
  }
  ok(`${file}: does not load legacy-script.js directly`, !srcs.includes("legacy-script.js"));
}

/* ---------- 5. page types get the modules their DOM needs ---------- */

const REQUIRED = [
  ["request.html", "js/request/form.js", "[data-request-form]"],
  ["request.html", "js/request/submission.js", "[data-request-form]"],
  ["works.html", "js/portfolio/works.js", "[data-filter-btn]"],
  ["games.html", "js/portfolio/works.js", "[data-game-link]"],
  ["games.html", "js/pages/games.js", "[data-game-link]"],
  ["project-detail.html", "js/portfolio/project-detail.js", "[data-project-detail]"],
  ["single-work.html", "js/features/certificates.js", "[data-cert]"],
  ["adventure.html", "js/pages/games.js", "adventure"],
  ["joyday-paint.html", "js/pages/games.js", "joyday"],
];

const modulesFor = (page) => [...COMMON, ...(PAGE_MODULES[page] || [])];

for (const [file, module, why] of REQUIRED) {
  const page = pageOf[file];
  ok(
    `${file} (page "${page}") loads ${module} — needed for ${why}`,
    page && modulesFor(page).includes(module),
  );
}

/* ---------- 6. page-scoped code is not loaded globally ---------- */

const PAGE_SCOPED = [
  "js/request/form.js",
  "js/request/submission.js",
  "js/portfolio/works.js",
  "js/portfolio/project-detail.js",
  "js/features/certificates.js",
  "js/pages/games.js",
];
for (const module of PAGE_SCOPED) {
  ok(`page-scoped module is not in COMMON: ${module}`, !COMMON.includes(module));
}

/* The pages the audit called out as paying for code they never used. */
const MUST_NOT_LOAD = [
  ["games.html", "js/request/form.js"],
  ["games.html", "js/portfolio/project-detail.js"],
  ["about.html", "js/request/form.js"],
  ["about.html", "js/portfolio/works.js"],
  ["about.html", "js/portfolio/project-detail.js"],
  ["blog.html", "js/request/form.js"],
  ["blog.html", "js/portfolio/works.js"],
  ["adventure.html", "js/request/form.js"],
  ["adventure.html", "js/portfolio/project-detail.js"],
  ["joyday-paint.html", "js/request/form.js"],
  ["ai-flow-puzzle.html", "js/request/form.js"],
  ["works.html", "js/request/form.js"],
  ["request.html", "js/portfolio/project-detail.js"],
];
for (const [file, module] of MUST_NOT_LOAD) {
  const page = pageOf[file];
  ok(`${file} does NOT load ${module}`, page && !modulesFor(page).includes(module));
}

/* ---------- 7. generated project pages ---------- */

const projectsDir = path.join(ROOT, "projects");
const generated = fs.existsSync(projectsDir)
  ? fs.readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
ok("generated project pages exist", generated.length > 0);

for (const slug of generated) {
  const html = read(`projects/${slug}/index.html`);
  const body = (html.match(/<body\b[^>]*>/i) || [""])[0];
  check(`projects/${slug}/: data-page marker`, (body.match(/data-page="([^"]*)"/) || [])[1], "projectDetail");
  ok(`projects/${slug}/: loads the bootloader`, /src="\.\.\/\.\.\/script\.js"/.test(html));
  ok(`projects/${slug}/: does not inline runtime modules`, !/src="[^"]*\/js\//.test(html));
}

/* ---------- 8. legacy-script.js is an inert stub ---------- */

const stub = read("legacy-script.js");
const stubCode = stub.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
ok("legacy-script.js still exists as a compatibility entry point", stub.length > 0);
ok("legacy-script.js carries no runtime logic (< 40 lines)", stub.split(/\r?\n/).length < 40);
for (const symbol of [
  "applyLanguage",
  "renderProjectDetail",
  "detectChatbotIntent",
  "setupProjectRequestForm",
  "i18nTranslations",
  "chatbotKeywordMap",
]) {
  ok(`legacy-script.js no longer defines ${symbol}`, !new RegExp(`(function|const|let)\\s+${symbol}\\b`).test(stubCode));
}

/* ---------- 9. inline handlers keep a reachable global ---------- */

/* Three pages still use inline onclick="openDrivePreviews()". A function
 * declared at the top level of a classic script becomes a window property, so
 * this keeps working — but only while its module is COMMON. If that module ever
 * becomes page-scoped, the markup breaks silently, so the pairing is asserted. */
const inlineHandlers = new Map();
for (const file of htmlFiles) {
  for (const m of read(file).matchAll(/\son[a-z]+="([A-Za-z_$][\w$]*)\(/g)) {
    if (!inlineHandlers.has(m[1])) inlineHandlers.set(m[1], []);
    inlineHandlers.get(m[1]).push(file);
  }
}
for (const [fn, pages] of inlineHandlers) {
  const definedIn = onDisk.filter((m) => new RegExp(`function\\s+${fn}\\b`).test(read(m)));
  ok(`inline handler ${fn}() is defined by exactly one module`, definedIn.length === 1);
  for (const module of definedIn) {
    ok(
      `inline handler ${fn}() lives in a COMMON module (used by ${pages.join(", ")})`,
      COMMON.includes(module),
    );
  }
}

/* ---------- 10. project-owned globals stay intentional ---------- */

/* Native/browser globals are out of scope; this only tracks window.KAAN_*. */
const allSource = [...onDisk, "portfolio-v2.js", "portfolio-data.js", "script.js"].map(read).join("\n");
const declared = new Set(
  [...allSource.matchAll(/window\.(KAAN[A-Za-z_]*)\s*=/g)].map((m) => m[1]),
);
const EXPECTED_GLOBALS = ["KAAN_PORTFOLIO", "KAAN_REQUEST_FORM_ENDPOINT", "KAAN_REQUEST_FORM_EMAIL", "KAAN_GOOGLE_FORM_URL"];
for (const global of declared) {
  ok(`window.${global} is an expected project global`, EXPECTED_GLOBALS.includes(global));
}
ok("window.KAAN_PORTFOLIO is still the data contract", /window\.KAAN_PORTFOLIO\s*=/.test(read("portfolio-data.js")));

/* ---------- payload report ---------- */

const localScripts = (file, page) => {
  const html = read(file);
  const direct = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1].replace(/^\.\.\/\.\.\//, ""))
    .filter((s) => !/^https?:/.test(s) && s !== "script.js");
  return [...new Set([...direct, "script.js", ...modulesFor(page)])].filter(exists);
};

const report = htmlFiles
  .map((file) => {
    const list = localScripts(file, pageOf[file]);
    return {
      page: file,
      scripts: list.length,
      kb: Math.round(list.reduce((n, s) => n + bytes(s), 0) / 1024),
    };
  })
  .sort((a, b) => b.kb - a.kb);

if (process.argv.includes("--report") || process.env.RUNTIME_REPORT === "1") {
  console.log("\nJS payload by page (local files, uncompressed)\n");
  console.log("  page".padEnd(36) + "scripts".padEnd(10) + "KB");
  for (const r of report) {
    console.log(`  ${r.page}`.padEnd(36) + String(r.scripts).padEnd(10) + r.kb);
  }
  console.log("");
}

if (failures.length) {
  console.error(`Runtime modules: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Runtime modules passed. ${passed} assertions · ${onDisk.length} modules · ${Object.keys(PAGE_MODULES).length} page types · heaviest page ${report[0].kb} KB, lightest ${report[report.length - 1].kb} KB.`,
);
