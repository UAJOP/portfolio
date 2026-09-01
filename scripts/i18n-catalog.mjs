/**
 * i18n-catalog.mjs — deterministic translatable-source catalog (BRIEF 09C).
 *
 * One module answers "what must a locale pack translate?" for every generator
 * and QA suite in the repo. Nothing here writes files; it only reads canonical
 * sources and returns a stable, sorted description of the translatable surface.
 *
 * Domains
 *   ui          stable-key shell copy          data/i18n/ui.json
 *   pages       authored HTML copy             legacy phrase dictionaries + data-*-en pairs
 *   caseStudies case-study key maps            *-case-study.data.js
 *   projects    canonical project overlays     data/portfolio/project-details.json
 *   content     remaining canonical copy       data/portfolio/*.json
 *   dynamic     runtime feature surfaces       data/i18n/source/dynamic.json
 *   meta        per-route page metadata        route inventory
 *
 * Language-neutral facts (slugs, URLs, years, stacks, image paths, ids) are
 * never part of the catalog: locale packs carry copy, never project truth.
 *
 * Node built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
export const readJson = (file) => JSON.parse(read(file));
export const fileExists = (file) => fs.existsSync(path.join(ROOT, file));

/* ---------- locale registry ---------- */

export function loadRegistry() {
  const registry = readJson("data/i18n/locales.json");
  const byId = new Map(registry.locales.map((item) => [item.id, item]));
  return {
    ...registry,
    byId,
    activeLocales: registry.locales.filter((item) => item.active),
    candidateLocales: registry.locales.filter((item) => item.activationCandidate),
    /** Locales that need a complete pack: every non-default locale we ship or intend to ship. */
    packLocales: registry.locales.filter((item) => item.id !== registry.defaultLocale),
  };
}

/** Route prefix for a locale: "" for the default locale, "<id>/" otherwise. */
export function routePrefixFor(locale, registry = loadRegistry()) {
  const definition = registry.byId.get(locale);
  if (!definition) throw new Error(`unknown locale ${locale}`);
  const prefix = definition.routePrefix ?? (definition.default ? "" : definition.id);
  return prefix ? `${prefix}/` : "";
}

/* ---------- route inventory ---------- */

/**
 * The canonical indexable route inventory, in sitemap order.
 *
 * `page` is the repo-relative English path; "" is the site root. Priorities and
 * change frequencies mirror the pre-09C sitemap so English output is unchanged.
 */
export const STATIC_ROUTES = [
  { page: "", changefreq: "weekly", priority: "1.0", source: "index.html", id: "home" },
  { page: "works.html", changefreq: "monthly", priority: "0.9", source: "works.html", id: "works" },
  { page: "sinama-case-study.html", changefreq: "monthly", priority: "0.9", source: "sinama-case-study.html", id: "sinamaCaseStudy" },
  { page: "merge-rush-case-study.html", changefreq: "monthly", priority: "0.9", source: "merge-rush-case-study.html", id: "mergeRushCaseStudy" },
  { page: "now.html", changefreq: "weekly", priority: "0.8", source: "now.html", id: "now" },
  { page: "blog.html", changefreq: "monthly", priority: "0.8", source: "blog.html", id: "blog" },
  { page: "about.html", changefreq: "monthly", priority: "0.8", source: "about.html", id: "about" },
  { page: "games.html", changefreq: "monthly", priority: "0.7", source: "games.html", id: "games" },
  { page: "labs.html", changefreq: "monthly", priority: "0.7", source: "labs.html", id: "labs" },
  { page: "ai-flow-puzzle-case-study.html", changefreq: "monthly", priority: "0.7", source: "ai-flow-puzzle-case-study.html", id: "aiFlowPuzzleCaseStudy" },
  { page: "atolye-joyday-case-study.html", changefreq: "monthly", priority: "0.7", source: "atolye-joyday-case-study.html", id: "joydayCaseStudy" },
  { page: "hospital-system-case-study.html", changefreq: "monthly", priority: "0.7", source: "hospital-system-case-study.html", id: "hospitalCaseStudy" },
  { page: "single-work.html", changefreq: "monthly", priority: "0.6", source: "single-work.html", id: "certificates" },
  { page: "request.html", changefreq: "monthly", priority: "0.6", source: "request.html", id: "request" },
  { page: "adventure.html", changefreq: "monthly", priority: "0.5", source: "adventure.html", id: "adventure" },
  { page: "joyday-paint.html", changefreq: "monthly", priority: "0.5", source: "joyday-paint.html", id: "joydayPaint" },
  { page: "ai-flow-puzzle.html", changefreq: "monthly", priority: "0.5", source: "ai-flow-puzzle.html", id: "aiFlowPuzzle" },
];

/**
 * Non-indexable surfaces.
 *
 * Readers still reach these in their own language, so they are localized like
 * any other page — they simply never receive SEO treatment: no canonical
 * claim to rank, no hreflang alternates, no sitemap entry. The legacy project
 * shell stays a compatibility endpoint rather than becoming a query-string
 * duplicate of the canonical project route in five languages.
 */
export const COMPANION_ROUTES = [
  { page: "404.html", source: "404.html", id: "notFound", indexable: false },
  { page: "project-detail.html", source: "project-detail.html", id: "projectShell", indexable: false },
];

export const NON_INDEXABLE_SOURCES = COMPANION_ROUTES.map((route) => route.source);

/** Every authored page that owns its own `<head>` metadata. */
export function metadataRoutes() {
  return [...STATIC_ROUTES, ...COMPANION_ROUTES];
}

/**
 * The two depths a generated localized page needs.
 *
 * `siteRoot` reaches the repository root, where assets live; `localeRoot`
 * reaches the locale's own root, where sibling pages live. On `/de/works.html`
 * they are `../` and ``; on `/de/projects/slug/`, `../../../` and `../../`.
 */
export function routeDepths(routeKey, localePrefix) {
  const segments = routeKey.endsWith("/")
    ? routeKey.split("/").filter(Boolean).length
    : routeKey.split("/").length - 1;
  return {
    localeRoot: "../".repeat(segments),
    siteRoot: "../".repeat(segments + (localePrefix ? 1 : 0)),
  };
}

export function loadProjectRegistry() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("portfolio-data.js"), sandbox);
  const registry = sandbox.window.KAAN_PORTFOLIO;
  if (!registry?.projectDetails) {
    throw new Error("portfolio-data.js did not expose window.KAAN_PORTFOLIO.projectDetails");
  }
  return registry;
}

export function projectSlugs(registry = loadProjectRegistry()) {
  return Object.keys(registry.projectDetails);
}

/** Every indexable English route: 17 static + one per canonical project. */
export function indexableRoutes(registry = loadProjectRegistry()) {
  return [
    ...STATIC_ROUTES,
    ...projectSlugs(registry).map((slug) => ({
      page: `projects/${slug}/`,
      changefreq: "monthly",
      priority: "0.6",
      source: "project-detail.html",
      id: `project:${slug}`,
      slug,
    })),
  ];
}

/* ---------- legacy phrase dictionaries ---------- */

/**
 * Reads the EN->TR compatibility dictionaries out of js/core/i18n.js without a
 * DOM. The file's runtime tail needs `document`, so evaluation stops at the
 * first function that touches it.
 */
export function loadLegacyDictionaries() {
  const source = read("js/core/i18n.js");
  const cut = source.indexOf("function hasLegacyTextTranslation");
  if (cut < 0) throw new Error("js/core/i18n.js no longer ends its data section with hasLegacyTextTranslation");
  const sandbox = { window: {}, document: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source.slice(0, cut)}\nglobalThis.__dictionaries = { text: i18nTranslations, attribute: i18nAttributeTranslations, title: i18nTitleTranslations };`,
    sandbox,
  );
  return sandbox.__dictionaries;
}

/* ---------- feature-module copy literals ---------- */

/**
 * Every runtime surface whose copy is owned by a feature module.
 * `namespace` is the stable pack key; `declaration` locates the source literal.
 */
export const DYNAMIC_SURFACES = [
  { namespace: "ajoop", file: "js/ajoop/assistant.js", declaration: "const portfolioChatbotContent =" },
  { namespace: "recruiter", file: "js/features/recruiter.js", declaration: "const recruiterItems =" },
  { namespace: "recruiterV2", file: "portfolio-v2.js", declaration: "const copy =" },
  { namespace: "ultimate", file: "js/features/ultimate.js", declaration: "const ultimateContent =" },
  { namespace: "request", file: "js/request/form.js", declaration: "const requestFormText =" },
  { namespace: "adventure", file: "adventure-game.js", declaration: "const copy =" },
  { namespace: "aiFlowPuzzle", file: "ai-flow-puzzle.js", declaration: "const copy =" },
  { namespace: "joydayPaint", file: "joyday-paint.js", declaration: "const copy =" },
];

/**
 * Language-neutral bindings the copy literals reference. Reading the real value
 * from its canonical declaration keeps snapshots faithful; these are facts, not
 * copy, so locale packs must never redefine them.
 */
export function neutralBindings() {
  const resumeLink = read("js/core/shell.js").match(/const resumeLink\s*=\s*\n?\s*"([^"]+)"/)?.[1];
  if (!resumeLink) throw new Error("js/core/shell.js no longer declares resumeLink as a string literal");
  return { resumeLink };
}

/**
 * Slices the balanced `{...}` literal that follows a declaration and evaluates
 * it in isolation. The games keep their copy inside an IIFE, so the module
 * cannot simply be executed; taking the literal alone is both cheaper and
 * immune to the surrounding runtime needing a DOM.
 */
export function readObjectLiteral(file, declaration, bindings = neutralBindings()) {
  const source = read(file);
  const at = source.indexOf(declaration);
  if (at < 0) throw new Error(`${file} no longer declares ${declaration}`);
  const start = source.indexOf("{", at + declaration.length - 1);
  if (start < 0) throw new Error(`${file}: ${declaration} is not an object literal`);

  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") { inBlockComment = false; index += 1; }
      continue;
    }
    if (inString) {
      if (char === "\\") { index += 1; continue; }
      if (char === inString) inString = null;
      continue;
    }
    if (char === "/" && next === "/") { inLineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { inBlockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { inString = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return vm.runInNewContext(`(${source.slice(start, index + 1)})`, { ...bindings }, { filename: `${file}:${declaration}` });
      }
    }
  }
  throw new Error(`${file}: unbalanced literal for ${declaration}`);
}

/** The `{en, tr, ...}` copy literal for one dynamic surface. */
export function loadDynamicSurface(namespace) {
  const surface = DYNAMIC_SURFACES.find((item) => item.namespace === namespace);
  if (!surface) throw new Error(`unknown dynamic surface ${namespace}`);
  return readObjectLiteral(surface.file, surface.declaration);
}

/* ---------- authored HTML compatibility attributes ---------- */

/** Attribute families that carry a paired English/Turkish string in markup. */
export const COMPAT_ATTRIBUTE_PAIRS = [
  { prefix: "data-pv2", target: "text" },
  { prefix: "data-flagship", target: "text" },
  { prefix: "data-sinama", target: "text" },
  { prefix: "data-mr", target: "text" },
  { prefix: "data-pv2-aria", target: "aria-label" },
];

export function authoredHtmlFiles() {
  return fs
    .readdirSync(ROOT)
    .filter((file) => file.endsWith(".html"))
    .sort();
}

/** Every distinct English string carried by a compat attribute pair. */
export function compatAttributeStrings(files = authoredHtmlFiles()) {
  const strings = new Set();
  for (const file of files) {
    const html = read(file);
    for (const { prefix } of COMPAT_ATTRIBUTE_PAIRS) {
      const pattern = new RegExp(`${prefix}-en="([^"]*)"`, "g");
      for (const match of html.matchAll(pattern)) {
        const value = decodeAttribute(match[1]);
        if (value.trim()) strings.add(value);
      }
    }
  }
  return [...strings].sort();
}

export function decodeAttribute(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * Word-boundary description truncation.
 *
 * generate-project-pages.mjs has always produced project descriptions this way;
 * the metadata snapshot reuses it so English output is byte-identical.
 */
export function truncateDescription(text, limit = 160) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function encodeAttribute(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Every runtime JavaScript file, excluding QA harnesses and build scripts. */
export function runtimeScriptFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).sort((a, b) => compareKeys(a.name, b.name))) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".js")) files.push(rel);
    }
  };
  walk("js");
  for (const file of fs.readdirSync(ROOT).sort(compareKeys)) {
    if (file.endsWith(".js") && !file.startsWith("qa-")) files.push(file);
  }
  return files;
}

/**
 * Inline `getI18nText("English", "Türkçe")` pairs, including the local
 * two-argument aliases modules define for it (`lt`, `text`, …).
 *
 * `getI18nText()` returns the inline Turkish for `tr` but looks every other
 * locale up in the phrase dictionary, so these English strings belong to the
 * `text` key space even though most never appear in the TR dictionary.
 */
export function inlinePairs() {
  const pairs = new Map();
  for (const file of runtimeScriptFiles()) {
    const source = read(file);
    if (!source.includes("getI18nText")) continue;

    /* Aliases are declared as `const name = (en, tr) => ... getI18nText(...)`. */
    const names = new Set(["getI18nText"]);
    for (const match of source.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>([^\n]*)/g)) {
      if (match[2].includes("getI18nText")) names.add(match[1]);
    }

    const pattern = new RegExp(
      `\\b(?:${[...names].join("|")})\\(\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"`,
      "g",
    );
    for (const match of source.matchAll(pattern)) {
      const english = JSON.parse(`"${match[1]}"`);
      if (english.trim()) pairs.set(english, JSON.parse(`"${match[2]}"`));
    }
  }
  return pairs;
}

/** Distinct technology labels routed through `translateProjectDisplayLabel()`. */
export function projectDisplayLabels(registry = loadProjectRegistry()) {
  const labels = new Set();
  for (const project of Object.values(registry.projectDetails)) {
    for (const item of project.stack || []) if (typeof item === "string") labels.add(item);
  }
  return [...labels].sort(compareKeys);
}

/**
 * Every English string appearing as element text in one document, whether or
 * not it has a translation. Used to decide what the root 404 needs shipped.
 */
export function documentTextStrings(file) {
  const html = read(file);
  const strings = new Set();
  const skip = /^(script|style|noscript|textarea|title)$/i;
  let index = 0;
  let suppressed = null;
  while (index < html.length) {
    const lt = html.indexOf("<", index);
    const text = html.slice(index, lt < 0 ? html.length : lt);
    if (!suppressed && text.trim()) strings.add(decodeAttribute(text).replace(/\s+/g, " ").trim());
    if (lt < 0) break;
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const tag = html.slice(lt, gt + 1);
    const name = tag.match(/^<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
    if (name) {
      if (name[1]) { if (suppressed === name[2].toLowerCase()) suppressed = null; }
      else if (skip.test(name[2]) && !tag.endsWith("/>")) suppressed = name[2].toLowerCase();
    }
    for (const match of tag.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/g)) {
      strings.add(decodeAttribute(match[1]).replace(/\s+/g, " ").trim());
    }
    index = gt + 1;
  }
  strings.delete("");
  return [...strings];
}

/** Accessibility and control-copy attributes the root 404 translates at runtime. */
export function documentAttributeStrings(file) {
  const html = read(file);
  const strings = new Set();
  for (const match of html.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/g)) {
    const value = decodeAttribute(match[1]).replace(/\s+/g, " ").trim();
    if (value) strings.add(value);
  }
  return [...strings];
}

/**
 * English strings the runtime looks up in the phrase dictionary *after* a page
 * has rendered — inline pairs, compat attribute pairs, project stack labels and
 * the root 404's own copy.
 *
 * A generated localized page is already translated in HTML, so the text-node
 * walker never fires there. Only this subset has to travel in the shipped pack,
 * which is what keeps a localized page from carrying the whole phrase book.
 *
 * The root 404 is the exception that earns its place: GitHub Pages serves that
 * one English document at any failed URL, including `/de/typo`, so it is the
 * single page that still translates at runtime.
 */
export function runtimeTextSources() {
  const dictionaries = loadLegacyDictionaries();
  const translated = (value) => dictionaries.text.tr[value] !== undefined;
  return [
    ...new Set([
      ...inlinePairs().keys(),
      ...compatAttributeStrings(),
      ...projectDisplayLabels().filter(translated),
      ...documentTextStrings("404.html").filter(translated),
    ]),
  ].sort(compareKeys);
}

/** Attribute phrases the English root 404 must translate after a failed URL. */
export function runtimeAttributeSources() {
  const dictionaries = loadLegacyDictionaries();
  const translated = (value) => dictionaries.attribute.tr[value] !== undefined;
  return documentAttributeStrings("404.html").filter(translated).sort(compareKeys);
}

/** Every English string the runtime can resolve through the `text` dictionary. */
export function pageTextSources(dictionaries = loadLegacyDictionaries()) {
  return [
    ...new Set([
      ...Object.keys(dictionaries.text.tr),
      ...compatAttributeStrings(),
      ...inlinePairs().keys(),
    ]),
  ];
}

/* ---------- case studies ---------- */

export const CASE_STUDY_DATA_FILES = [
  "sinama-case-study.data.js",
  "merge-rush-case-study.data.js",
  "ai-flow-puzzle-case-study.data.js",
  "atolye-joyday-case-study.data.js",
  "hospital-system-case-study.data.js",
].filter((file) => fileExists(file));

export function loadCaseStudyData(file) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox);
  return sandbox.window.caseStudyPageData;
}

/* ---------- canonical portfolio data ---------- */

/** Canonical JSON files whose locale-keyed values are user-facing copy. */
export const LOCALIZED_DATA_FILES = [
  "data/portfolio/projects.json",
  "data/portfolio/project-details.json",
  "data/portfolio/profile.json",
  "data/portfolio/recruiter-profiles.json",
  "data/portfolio/build-log.json",
  "data/portfolio/labs.json",
  "data/portfolio/sinama-evidence.json",
];

/**
 * Where each canonical file lands in `window.KAAN_PORTFOLIO`.
 *
 * `content` pack keys are written against these runtime names rather than the
 * filenames, so composing a pack onto the registry is a direct path walk with
 * no translation table in the browser.
 */
export const CONTENT_REGISTRY_KEYS = {
  "data/portfolio/projects.json": "projects",
  "data/portfolio/profile.json": "profile",
  "data/portfolio/recruiter-profiles.json": "recruiterProfiles",
  "data/portfolio/build-log.json": "buildLog",
  "data/portfolio/labs.json": "labs",
  "data/portfolio/sinama-evidence.json": "sinamaEvidence",
};

/** Facts that must never be duplicated or translated inside a locale pack. */
export const LANGUAGE_NEUTRAL_KEYS = new Set([
  "id",
  "slug",
  "year",
  "image",
  "gallery",
  "stack",
  "links",
  "url",
  "repo",
  "repository",
  "live",
  "github",
  "caseStudy",
  "icon",
  "websiteId",
  "analyticsId",
  "statusId",
  "name",
  "order",
  "count",
  "date",
]);

/**
 * Walks a canonical JSON tree and yields every locale-keyed copy node.
 * A node is locale-keyed when it has an `en` key and every key is a known
 * locale id, which is exactly the shape the runtime resolver understands.
 */
export function* localizedNodes(value, registry, label = "") {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* localizedNodes(item, registry, `${label}[${index}]`);
    return;
  }
  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value);
  if (keys.includes("en") && keys.every((key) => registry.byId.has(key))) {
    yield { path: label, node: value };
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    yield* localizedNodes(child, registry, label ? `${label}.${key}` : key);
  }
}

/* ---------- project overlay schema ---------- */

/**
 * Fields of a canonical project record that are user-facing copy. Everything
 * else (year, image, gallery, stack, link URLs) stays language-neutral and is
 * composed in at render time.
 */
export const PROJECT_COPY_FIELDS = [
  "category",
  "title",
  "subtitle",
  "role",
  "type",
  "status",
  "overview",
  "challenge",
  "solution",
  "impact",
];

/** Project fields that are arrays of copy. */
export const PROJECT_LIST_FIELDS = ["features"];

/** Project fields that are arrays of `{title, text}` copy steps. */
export const PROJECT_STEP_FIELDS = ["process"];

/** Project link labels are copy; their URLs are not. */
export const PROJECT_LINK_LABEL_FIELD = "links";

/* ---------- pack layout ---------- */

export const PACK_DOMAINS = ["ui", "pages", "case-studies", "projects", "dynamic", "meta"];

export function packDir(locale) {
  return `data/i18n/packs/${locale}`;
}

export function packFile(locale, domain) {
  return `${packDir(locale)}/${domain}.json`;
}

export function loadPack(locale) {
  const pack = {};
  for (const domain of PACK_DOMAINS) {
    const file = packFile(locale, domain);
    pack[domain] = fileExists(file) ? readJson(file) : null;
  }
  return pack;
}

/* ---------- catalog ---------- */

/**
 * Builds the full translatable catalog.
 *
 * Every entry is `{ domain, key, source }` where `source` is the English copy a
 * locale pack must replace. Keys are stable and sorted so pack files and QA
 * output stay diffable.
 */
export function buildCatalog() {
  const registry = loadRegistry();
  const projects = loadProjectRegistry();
  const dictionaries = loadLegacyDictionaries();
  const entries = [];

  /* An empty English source has nothing to translate — Ajoop's blank subtitle
   * is one — so it never becomes a coverage obligation. */
  const push = (domain, key, source) => {
    if (typeof source !== "string" || !source.trim()) return;
    entries.push({ domain, key, source });
  };

  /* ui */
  const ui = readJson("data/i18n/ui.json");
  for (const key of Object.keys(ui).sort()) push("ui", key, ui[key].en);

  /* pages: the three runtime phrase dictionaries, keyed by English source.
   *
   * `text` is the widest surface: the DOM text-node walker, every compat
   * `data-*-en` attribute pair and every inline `lt("English", "Türkçe")` call
   * all resolve through it, so they share one key space rather than three. */
  for (const key of pageTextSources(dictionaries).sort(compareKeys)) push("pages", `text:${key}`, key);
  for (const key of Object.keys(dictionaries.attribute.tr).sort(compareKeys)) push("pages", `attribute:${key}`, key);
  for (const key of Object.keys(dictionaries.title.tr).sort(compareKeys)) push("pages", `title:${key}`, key);

  /* case studies */
  for (const file of CASE_STUDY_DATA_FILES) {
    const data = loadCaseStudyData(file);
    const id = file.replace(/\.data\.js$/, "");
    for (const key of Object.keys(data.translations.en).sort()) {
      push("case-studies", `${id}:${key}`, data.translations.en[key]);
    }
    push("case-studies", `${id}:__title`, data.titles.en);
  }

  /* projects: locale overlays keyed by canonical slug and field */
  for (const slug of projectSlugs(projects).sort()) {
    const project = projects.projectDetails[slug];
    for (const field of PROJECT_COPY_FIELDS) {
      if (project[field]?.en === undefined) continue;
      push("projects", `${slug}.${field}`, project[field].en);
    }
    for (const field of PROJECT_LIST_FIELDS) {
      const list = project[field]?.en;
      if (!Array.isArray(list)) continue;
      list.forEach((item, index) => push("projects", `${slug}.${field}[${index}]`, item));
    }
    for (const field of PROJECT_STEP_FIELDS) {
      const list = project[field]?.en;
      if (!Array.isArray(list)) continue;
      list.forEach((step, index) => {
        push("projects", `${slug}.${field}[${index}].title`, step.title);
        push("projects", `${slug}.${field}[${index}].text`, step.text);
      });
    }
    (project.links || []).forEach((link, index) => {
      if (link.label?.en === undefined) return;
      push("projects", `${slug}.links[${index}].label`, link.label.en);
    });
  }

  /* content: every remaining locale-keyed node in canonical data */
  for (const file of LOCALIZED_DATA_FILES) {
    if (file === "data/portfolio/project-details.json") continue;
    const data = readJson(file);
    const short = CONTENT_REGISTRY_KEYS[file];
    for (const { path: nodePath, node } of localizedNodes(data, registry)) {
      const en = node.en;
      if (typeof en === "string") {
        push("content", `${short}.${nodePath}`, en);
      } else if (Array.isArray(en)) {
        en.forEach((item, index) => {
          if (typeof item === "string") push("content", `${short}.${nodePath}[${index}]`, item);
          else if (item && typeof item === "object") {
            for (const field of Object.keys(item).sort()) {
              if (typeof item[field] === "string") push("content", `${short}.${nodePath}[${index}].${field}`, item[field]);
            }
          }
        });
      }
    }
  }

  /* dynamic: runtime feature surfaces declared in the source manifest */
  const dynamicSource = readJson("data/i18n/source/dynamic.json");
  for (const key of flattenKeys(dynamicSource).sort(compareKeys)) {
    if (isNeutralDynamicKey(key, readPath(dynamicSource, key))) continue;
    push("dynamic", key, readPath(dynamicSource, key));
  }

  /* meta: authored-page metadata.
   *
   * Project routes are absent on purpose: their title and description are
   * composed from the project overlay at generation time, exactly as the
   * English generator does, so project identity is never duplicated into a
   * second place that can drift. */
  const metaSource = readJson("data/i18n/source/meta.json");
  for (const route of metadataRoutes()) {
    const entry = metaSource[route.id];
    if (!entry) continue;
    for (const field of META_FIELDS) {
      if (entry[field] === undefined) continue;
      push("meta", `${route.id}.${field}`, entry[field]);
    }
  }

  entries.sort((a, b) => (a.domain === b.domain ? compareKeys(a.key, b.key) : a.domain.localeCompare(b.domain)));
  return { registry, projects, entries };
}

export const META_FIELDS = ["title", "description", "ogTitle", "ogDescription"];

export function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Keys inside a dynamic surface that name a fact rather than copy: command and
 * intent identity, link targets, download filenames.
 *
 * Stripping them keeps intent matching language-neutral — an Ajoop quick action
 * is still `about` in every language — and keeps URLs out of locale packs. The
 * runtime merges pack copy over the English structure, so an omitted key simply
 * keeps its canonical value.
 */
export const DYNAMIC_NEUTRAL_KEYS = new Set([
  "id",
  "type",
  "value",
  "url",
  "external",
  "filename",
  "jsonFilename",
  "pngFilename",
  "reportFilename",
]);

/**
 * True when a dynamic leaf holds a link, route or filename rather than prose.
 *
 * Some surfaces store copy and facts positionally — recruiter project rows are
 * `[name, summary, route, linkLabel]` — so shape has to be judged from the
 * value as well as the key.
 */
export function isNeutralDynamicValue(value) {
  if (typeof value !== "string") return true;
  if (/^(?:https?:|mailto:|tel:|#|\/)/i.test(value)) return true;
  if (/^[a-z0-9][a-z0-9-]*\.(?:html|json|png|txt|webp|svg|pdf|ico)$/i.test(value)) return true;
  if (/^projects\/[a-z0-9-]+\/$/i.test(value)) return true;
  return false;
}

/** The last path segment of a flattened key, ignoring array indices. */
export function lastKeySegment(key) {
  const parts = key.replace(/\[\d+\]/g, "").split(".").filter(Boolean);
  return parts[parts.length - 1] || "";
}

/** True when a flattened dynamic entry is a fact rather than translatable copy. */
export function isNeutralDynamicKey(key, value) {
  return DYNAMIC_NEUTRAL_KEYS.has(lastKeySegment(key)) || isNeutralDynamicValue(value);
}

/** Flattens a nested object into dotted paths whose leaves are strings. */
export function flattenKeys(value, prefix = "") {
  if (typeof value === "string") return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenKeys(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
  }
  return [];
}

/** Reads a dotted/indexed path produced by flattenKeys(). */
export function readPath(source, key) {
  const parts = key.split(/\.|\[(\d+)\]/).filter((part) => part !== undefined && part !== "");
  let cursor = source;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[/^\d+$/.test(part) ? Number(part) : part];
  }
  return cursor;
}

/** Writes a dotted/indexed path, creating intermediate containers. */
export function writePath(target, key, value) {
  const parts = key.split(/\.|\[(\d+)\]/).filter((part) => part !== undefined && part !== "");
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = /^\d+$/.test(parts[index]) ? Number(parts[index]) : parts[index];
    const nextIsIndex = /^\d+$/.test(parts[index + 1]);
    if (cursor[part] == null) cursor[part] = nextIsIndex ? [] : {};
    cursor = cursor[part];
  }
  const last = parts[parts.length - 1];
  cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
}

/** Stable JSON with a trailing newline, so generated files diff cleanly. */
export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Sorts an object's keys so pack files stay in a deterministic order. */
export function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort(compareKeys)) out[key] = sortObject(value[key]);
  return out;
}
