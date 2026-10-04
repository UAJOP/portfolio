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
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { authoredHtmlFiles } from "./i18n-catalog.mjs";

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
const EARLY_BOOTSTRAP = "js/core/locale-bootstrap.js";
/* Historical EN/TR dictionaries are still read by build tooling while the
 * browser now consumes generated locale packs plus i18n-runtime.js. */
const BUILD_ONLY_MODULES = new Set(["js/core/i18n.js"]);
/* Loaded by a React-owned document's own script tag, never by the manifest:
 * the #30 lifecycle host for the retained Labs/mini-game engines. */
const REACT_DOCUMENT_MODULES = new Set(["js/pages/engine-host.js"]);

/* ---------- 1. every referenced module exists, and every runtime module is referenced ---------- */

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
  ok(
    `module is referenced by the manifest or explicitly non-runtime: ${module}`,
    ALL_MODULES.includes(module) || module === EARLY_BOOTSTRAP || BUILD_ONLY_MODULES.has(module) || REACT_DOCUMENT_MODULES.has(module),
  );
}
for (const module of REACT_DOCUMENT_MODULES) {
  ok(`React-document module exists: ${module}`, exists(module));
  ok(`React-document module is not shipped by the manifest: ${module}`, !ALL_MODULES.includes(module));
}
for (const module of BUILD_ONLY_MODULES) {
  ok(`build-only module exists: ${module}`, exists(module));
  ok(`build-only module is not shipped by COMMON: ${module}`, !COMMON.includes(module));
  ok(
    `build-only module is not shipped by any page scope: ${module}`,
    !Object.values(PAGE_MODULES).flat().includes(module),
  );
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
  ["i18n-data.js", "js/core/locale.js"],
  ["js/core/locale.js", "js/core/analytics-config.js"],
  ["js/core/analytics-config.js", "js/core/analytics.js"],
  ["js/core/analytics.js", "js/core/shell.js"],
  ["js/core/shell.js", "js/core/theme.js"],
  ["js/core/theme.js", "js/core/i18n-runtime.js"],
  ["js/core/i18n-runtime.js", "js/portfolio/routing.js"],
  ["js/portfolio/routing.js", "js/ajoop/assistant.js"],
  ["js/ajoop/matcher.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.0 brain. Entities and context reuse the matcher's tokenizer, the
   * router needs entities, context and knowledge, and assistant.js owns the
   * keyword map and answers the router routes into. */
  ["js/ajoop/matcher.js", "js/ajoop/entities.js"],
  ["js/ajoop/matcher.js", "js/ajoop/context.js"],
  ["js/ajoop/entities.js", "js/ajoop/router.js"],
  ["js/ajoop/context.js", "js/ajoop/router.js"],
  ["js/ajoop/knowledge.js", "js/ajoop/router.js"],
  ["js/ajoop/router.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.1: the planner reads the router's route shape and the knowledge
   * layer, and assistant.js renders the plan it returns. */
  ["js/ajoop/knowledge.js", "js/ajoop/conversation.js"],
  ["js/ajoop/router.js", "js/ajoop/conversation.js"],
  ["js/ajoop/conversation.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.2: the evidence model reads the knowledge layer and the router's
   * route shape; assistant.js renders what it returns. */
  ["js/ajoop/knowledge.js", "js/ajoop/evidence.js"],
  ["js/ajoop/router.js", "js/ajoop/evidence.js"],
  ["js/ajoop/evidence.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.3: the bridge serializes the evidence model and reads the public
   * config, and assistant.js renders whatever it returns. */
  ["ajoop-ai-config.js", "js/ajoop/ai-bridge.js"],
  ["js/ajoop/evidence.js", "js/ajoop/ai-bridge.js"],
  ["js/ajoop/ai-bridge.js", "js/ajoop/assistant.js"],
  /* Ajoop 5.1: the RAG turn source builds the payload and reuses the bridge's
   * transport, and assistant.js calls it from the turn lifecycle. It is
   * DOM-free, so it belongs with the other brain modules ahead of the
   * assistant rather than as an overlay patched in behind it. */
  ["js/ajoop/ai-bridge.js", "js/ajoop/rag-client.js"],
  ["js/ajoop/rag-client.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.4: language detection and the global meta intents reuse the
   * matcher's tokenizer and are consulted by the router before it scores. */
  ["js/ajoop/matcher.js", "js/ajoop/language.js"],
  ["js/ajoop/language.js", "js/ajoop/router.js"],
  ["js/ajoop/language.js", "js/ajoop/assistant.js"],
  /* Ajoop 4.5: the ontology is what the router scores against, and the
   * response planner turns a route plus its evidence into what gets rendered. */
  ["js/ajoop/matcher.js", "js/ajoop/ontology.js"],
  ["js/ajoop/ontology.js", "js/ajoop/router.js"],
  ["js/ajoop/ontology.js", "js/ajoop/conversation.js"],
  ["js/ajoop/evidence.js", "js/ajoop/response.js"],
  ["js/ajoop/router.js", "js/ajoop/response.js"],
  ["js/ajoop/response.js", "js/ajoop/assistant.js"],
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
  ok(
    "certificates are spliced ahead of the compact i18n presentation runtime",
    /"js\/features\/certificates\.js":\s*"js\/core\/i18n-runtime\.js"/.test(insertBlock[1]),
  );
}

/* ---------- 4. pages declare a page type the manifest knows ---------- */

/* Authored documents only: legacy `.html` stubs load no runtime at all. */
const htmlFiles = authoredHtmlFiles();
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

  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  ok(
    `${file}: script.js is loaded from <body>, not <head>`,
    !(headMatch && /src="[^"]*script\.js"/.test(headMatch[1])),
  );

  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of srcs) {
    const normalized = src.replace(/^\//, "");
    const allowedEarlyBootstrap = normalized === EARLY_BOOTSTRAP;
    ok(`${file}: does not bypass the manifest with ${src}`, !src.includes("js/") || allowedEarlyBootstrap);
  }
  ok(`${file}: does not load legacy-script.js directly`, !srcs.some((src) => src.replace(/^\//, "") === "legacy-script.js"));
}

/* ---------- 5. page types get the modules their DOM needs ---------- */

const REQUIRED = [
  ["request/index.html", "js/request/form.js", "[data-request-form]"],
  ["request/index.html", "js/request/submission.js", "[data-request-form]"],
  ["works/index.html", "js/portfolio/works.js", "[data-filter-btn]"],
  ["games/index.html", "js/portfolio/works.js", "[data-game-link]"],
  ["games/index.html", "js/pages/games.js", "[data-game-link]"],
  ["project-detail.html", "js/portfolio/project-detail.js", "[data-project-detail]"],
  ["certificates/index.html", "js/features/certificates.js", "[data-cert]"],
  ["adventure/index.html", "js/pages/games.js", "adventure"],
  ["joyday-paint/index.html", "js/pages/games.js", "joyday"],
  ["labs/index.html", "js/pages/labs.js", "#math-3d-canvas"],
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
  "js/pages/labs.js",
];
for (const module of PAGE_SCOPED) {
  ok(`page-scoped module is not in COMMON: ${module}`, !COMMON.includes(module));
}

/* Labs owns its page lifecycle. A COMMON module may never try to initialize a
 * function that is defined only later by the labs page module. */
const labsSource = read("js/pages/labs.js");
const creativeSource = read("js/features/creative.js");
ok(
  "labs page module initializes the Algorithmic 3D canvas after defining it",
  /function\s+setupAlgorithmic3DLab\b[\s\S]*?\nif \(document\.querySelector\("main\[data-react-main\]"\)\) [^\n]*\.push\(\["labs", setupAlgorithmic3DLab\]\);\nelse setupAlgorithmic3DLab\(new AbortController\(\)\.signal\);\s*$/.test(labsSource),
);
ok(
  "labs page module starts exactly once: hosted on a React document, directly on a legacy one",
  (labsSource.match(/setupAlgorithmic3DLab\(new AbortController\(\)\.signal\)/g) || []).length === 1
    && !/\nsetupAlgorithmic3DLab\(\);/.test(labsSource),
);
ok(
  "COMMON creative module no longer owns the Labs 3D startup",
  !/setupAlgorithmic3DLab/.test(creativeSource),
);

/* The pages the audit called out as paying for code they never used. */
const MUST_NOT_LOAD = [
  ["games/index.html", "js/request/form.js"],
  ["games/index.html", "js/portfolio/project-detail.js"],
  ["about/index.html", "js/request/form.js"],
  ["about/index.html", "js/portfolio/works.js"],
  ["about/index.html", "js/portfolio/project-detail.js"],
  ["blog/index.html", "js/request/form.js"],
  ["blog/index.html", "js/portfolio/works.js"],
  ["adventure/index.html", "js/request/form.js"],
  ["adventure/index.html", "js/portfolio/project-detail.js"],
  ["joyday-paint/index.html", "js/request/form.js"],
  ["ai-flow-puzzle/index.html", "js/request/form.js"],
  ["works/index.html", "js/request/form.js"],
  ["request/index.html", "js/portfolio/project-detail.js"],
  ["about/index.html", "js/pages/labs.js"],
  ["works/index.html", "js/pages/labs.js"],
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
  check(`projects/${slug}/: canonical slug marker`, (body.match(/data-project-slug="([^"]*)"/) || [])[1], slug);
  ok(`projects/${slug}/: declares no relative depth`, !/data-site-root=/.test(body));
  ok(`projects/${slug}/: loads the bootloader from the site root`, /src="\/script\.js"/.test(html));
  const directRuntimeSources = [...html.matchAll(/<script[^>]+src="([^"]*\/js\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((src) => !src.endsWith("/js/core/locale-bootstrap.js"));
  ok(`projects/${slug}/: does not inline runtime modules`, directRuntimeSources.length === 0);
}

/* ---------- 8. project media URLs preserve route depth contracts ---------- */

const sampleProject = {
  title: { en: "Sample", fr: "Exemple localisé" },
  subtitle: { en: "Sample subtitle", fr: "Sous-titre localisé" },
  category: { en: "Test" },
  role: { en: "Developer" },
  type: { en: "Website" },
  status: { en: "Complete" },
  overview: { en: "Overview", fr: "Aperçu localisé" },
  challenge: { en: "Challenge" },
  solution: { en: "Solution" },
  image: "assets/hero.webp",
  gallery: ["assets/gallery-a.webp", "assets/gallery-b.webp"],
  features: { en: ["Feature"], fr: ["Fonctionnalité localisée"] },
  stack: ["JavaScript"],
  links: [],
  year: "2026",
};

/* The production route module, loaded against the generated route table, so
 * these checks exercise the same URL policy the browser runs. */
const loadRealRoutes = (document, location) => {
  const routeSandbox = { window: { location }, document, URL };
  vm.createContext(routeSandbox);
  vm.runInContext(read("i18n-data.js"), routeSandbox, { filename: "i18n-data.js" });
  vm.runInContext(read("js/core/locale-routes.js"), routeSandbox, { filename: "js/core/locale-routes.js" });
  return routeSandbox.window.KAAN_LOCALE_ROUTES;
};

const mediaSandbox = ({
  locale = "en",
  projectSlug = "sample",
  search = "",
  href = "https://kaanbalci.com/projects/sample/",
  routed = true,
} = {}) => {
  const listeners = {};
  const root = { innerHTML: "" };
  const dataset = {};
  if (projectSlug) dataset.projectSlug = projectSlug;
  const replaced = [];
  const document = {
    body: { dataset },
    title: "",
    documentElement: { getAttribute: () => null },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) { return selector === "[data-project-detail]" ? root : null; },
  };
  const location = {
    search,
    href,
    hash: "",
    pathname: new URL(href).pathname,
    replace(target) { replaced.push(target); },
  };
  const sandbox = {
    document,
    window: {
      KAAN_PORTFOLIO: { projectDetails: { sample: sampleProject } },
      location,
      ...(routed ? { KAAN_LOCALE_ROUTES: loadRealRoutes(document, location) } : {}),
    },
    URL,
    URLSearchParams,
    currentSiteLanguage: locale,
    getCurrentLocale: () => locale,
    getLocalizedValue(value, requested = locale) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      return value[requested] ?? value.en ?? Object.values(value)[0];
    },
    getPackPhrase: () => null,
    getI18nText(english, turkish, requested = locale) {
      if (requested === "tr") return turkish;
      const french = {
        "Previous Project": "Projet précédent",
        "Next Project": "Projet suivant",
        "All Works": "Tous les projets",
      };
      return requested === "fr" ? (french[english] || english) : english;
    },
  };
  vm.createContext(sandbox);
  for (const file of ["js/core/media.js", "js/portfolio/routing.js", "js/portfolio/project-detail.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  return { sandbox, listeners, root, replaced };
};

const canonicalMedia = mediaSandbox();
check("canonical project slug resolves from its generated-page marker", canonicalMedia.sandbox.resolveCurrentProjectSlug(), "sample");
ok(
  "canonical project renderer executes automatically when its module loads",
  canonicalMedia.root.innerHTML.includes('class="project-detail-hero section-shell reveal"'),
);
for (const marker of ["project-detail-grid", "process-steps", "detail-gallery", "detail-navigation"]) {
  ok(`canonical project automatic boot renders ${marker}`, canonicalMedia.root.innerHTML.includes(marker));
}
ok(
  "canonical project hero uses the root-relative URL policy",
  canonicalMedia.root.innerHTML.includes('src="/assets/hero.webp"'),
);
for (const image of sampleProject.gallery) {
  ok(
    `canonical gallery serves ${image} from the site root`,
    canonicalMedia.root.innerHTML.includes(`src="/${image}"`),
  );
}
ok(
  "canonical media URLs resolve to /assets instead of /projects/<slug>/assets",
  new URL("/assets/gallery-a.webp", canonicalMedia.sandbox.window.location.href).pathname ===
    "/assets/gallery-a.webp",
);
ok(
  "canonical project links back to the clean Works route",
  canonicalMedia.root.innerHTML.includes('href="/works/"') && !/href="[^"]*\.html/.test(canonicalMedia.root.innerHTML),
);
ok("a generated project page never redirects itself", canonicalMedia.replaced.length === 0);

const brokenImage = (source) => ({
  tagName: "IMG",
  dataset: {},
  assignedSource: "",
  getAttribute(name) { return name === "src" ? source : null; },
  set src(value) { this.assignedSource = value; },
});
const canonicalFallback = brokenImage("/assets/missing.webp");
canonicalMedia.listeners.error({ target: canonicalFallback });
check(
  "canonical missing media fallback is served from the site root",
  canonicalFallback.assignedSource,
  "/assets/KAAN BALCI-BÜYÜK LOGO PNG.png",
);
const canonicalJoydayFallback = brokenImage("/assets/missing-joyday.webp");
canonicalMedia.listeners.error({ target: canonicalJoydayFallback });
check(
  "canonical Joyday fallback is served from the site root",
  canonicalJoydayFallback.assignedSource,
  "/assets/joyday-homepage-preview.webp",
);

/* Without the route module (an isolated harness) the renderer still emits
 * root-relative URLs rather than depth-relative ones. */
const unroutedMedia = mediaSandbox({ routed: false });
ok(
  "project media stays root-relative without the route module",
  unroutedMedia.root.innerHTML.includes('src="/assets/hero.webp"'),
);

const legacyMedia = mediaSandbox({
  projectSlug: null,
  search: "?project=sample",
  href: "https://kaanbalci.com/project-detail.html?project=sample",
});
check("legacy project slug resolves from the query string", legacyMedia.sandbox.resolveCurrentProjectSlug(), "sample");
check(
  "legacy project-detail.html?project=<slug> forwards to the canonical clean route",
  legacyMedia.replaced.join(" | "),
  "/projects/sample/",
);
ok(
  "legacy project-detail route still renders the full body while it forwards",
  legacyMedia.root.innerHTML.includes("project-detail-grid"),
);
ok(
  "legacy project hero uses the same root-relative URL policy",
  legacyMedia.root.innerHTML.includes('src="/assets/hero.webp"'),
);
const legacyFallback = brokenImage("/assets/missing.webp");
legacyMedia.listeners.error({ target: legacyFallback });
check(
  "legacy missing media fallback is served from the site root",
  legacyFallback.assignedSource,
  "/assets/KAAN BALCI-BÜYÜK LOGO PNG.png",
);

const unknownLegacy = mediaSandbox({
  projectSlug: null,
  search: "?project=not-a-real-project",
  href: "https://kaanbalci.com/project-detail.html?project=not-a-real-project",
});
ok("an unknown legacy slug stays on the shell instead of redirecting", unknownLegacy.replaced.length === 0);

const localizedLegacy = mediaSandbox({
  locale: "de",
  projectSlug: null,
  search: "?project=sample",
  href: "https://kaanbalci.com/de/project-detail.html?project=sample",
});
check(
  "localized legacy shell forwards to the same-locale canonical route",
  localizedLegacy.replaced.join(" | "),
  "/de/projects/sample/",
);

const localizedMedia = mediaSandbox({
  locale: "fr",
  href: "https://kaanbalci.com/fr/projects/sample/",
});
ok(
  "localized canonical project auto-boots with the URL locale overlay",
  localizedMedia.root.innerHTML.includes("Exemple localisé") &&
    localizedMedia.root.innerHTML.includes("Aperçu localisé") &&
    localizedMedia.root.innerHTML.includes("Fonctionnalité localisée"),
);
ok(
  "localized canonical project keeps gallery assets at the site root",
  localizedMedia.root.innerHTML.includes('src="/assets/gallery-a.webp"'),
);
const localizedProjectLinks = [...localizedMedia.root.innerHTML.matchAll(/href="([^"]*projects\/sample\/)"/g)]
  .map((match) => match[1]);
ok(
  "localized Previous / Next project links stay in the locale",
  localizedProjectLinks.length === 2 && localizedProjectLinks.every((hrefValue) => hrefValue === "/fr/projects/sample/"),
);
ok(
  "localized project links back to the localized clean Works route",
  localizedMedia.root.innerHTML.includes('href="/fr/works/"'),
);

const shellSource = read("js/core/shell.js");
/* The collapse breakpoint has exactly one owner: portfolio-v2.css. The shell
 * closes the mobile menu when the toggle is no longer rendered, so JS can never
 * drift from CSS (the old hard-coded 980/820 thresholds did). */
ok("mobile navigation hard-codes no viewport width threshold", !/innerWidth\s*[<>]=?\s*\d+/.test(shellSource));
ok(
  "mobile navigation closes when the CSS-owned toggle is no longer displayed",
  /getComputedStyle\(navToggle\)\.display\s*===\s*"none"[^\n]*closeMobileNavigation\(\)/.test(shellSource),
);
{
  const v2 = read("portfolio-v2.css");
  const collapse = v2.match(/@media \(max-width: (\d+)px\) \{[\s\S]*?\.nav-toggle \{\s*display: inline-flex;/);
  ok("portfolio-v2.css owns the primary-navigation collapse breakpoint", Boolean(collapse));
  ok("the navigation collapses at or above 1100px so every production locale fits", Number(collapse?.[1]) >= 1100);
}

/* ---------- 9. legacy-script.js stays retired ---------- */

/* Master 3 #31-A removed the inert stub. It was never part of the published
 * artifact, so no public URL changed; these checks keep it from returning as
 * a file, a loader entry or a published path. Section 4 already fails any
 * document that loads it. */
ok("legacy-script.js stays retired", !exists("legacy-script.js"));
{
  const loaderCode = read("script.js").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok("the runtime loader does not reference legacy-script.js", !loaderCode.includes("legacy-script"));
  ok("no runtime module is named legacy-script.js", !ALL_MODULES.some((module) => module.includes("legacy-script")));
  const artifact = JSON.parse(read("data/site/public-artifact.json"));
  ok("the published artifact does not list legacy-script.js", !artifact.rootRuntimeFiles.includes("legacy-script.js"));
}

/* ---------- 10. inline handlers keep a reachable global ---------- */

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

/* ---------- 11. project-owned globals stay intentional ---------- */

const allSource = [...onDisk, "portfolio-v2.js", "portfolio-data.js", "script.js"].map(read).join("\n");
const declared = new Set(
  [...allSource.matchAll(/window\.(KAAN[A-Za-z_]*)\s*=/g)].map((m) => m[1]),
);
const EXPECTED_GLOBALS = [
  "KAAN_PORTFOLIO",
  "KAAN_REQUEST_FORM_ENDPOINT",
  "KAAN_REQUEST_FORM_EMAIL",
  "KAAN_GOOGLE_FORM_URL",
  "KAAN_LOCALE_ROUTES",
];
for (const global of declared) {
  ok(`window.${global} is an expected project global`, EXPECTED_GLOBALS.includes(global));
}
ok("window.KAAN_PORTFOLIO is still the data contract", /window\.KAAN_PORTFOLIO\s*=/.test(read("portfolio-data.js")));

/* ---------- payload report ---------- */

const localScripts = (file, page) => {
  const html = read(file);
  const direct = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1].replace(/^\//, ""))
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
