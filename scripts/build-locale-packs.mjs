#!/usr/bin/env node
/**
 * build-locale-packs.mjs — locale pack tooling (BRIEF 09C).
 *
 * Locale packs live under data/i18n/packs/<locale>/ and carry COPY ONLY.
 * Language-neutral facts (slugs, URLs, years, stacks, image paths, ids) stay in
 * data/portfolio/ and are composed in at render time.
 *
 * Turkish is special: complete TR copy already exists across the runtime
 * (phrase dictionaries, case-study data files, canonical JSON, feature module
 * `tr` branches). Rather than copying it into a pack and creating a second
 * source of Turkish truth, those domains are DERIVED from the existing sources
 * and byte-checked by `qa:i18n`. Only `meta` is authored for TR, because
 * localized page metadata is a new surface with no prior source.
 *
 * German, Spanish and French packs are authored in full.
 *
 *   node scripts/build-locale-packs.mjs --derive          # rewrite derived TR domains
 *   node scripts/build-locale-packs.mjs --check           # verify derived domains
 *   node scripts/build-locale-packs.mjs --scaffold de     # add missing keys as null
 *   node scripts/build-locale-packs.mjs --coverage        # coverage table
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  read,
  readJson,
  fileExists,
  stableJson,
  buildCatalog,
  loadRegistry,
  loadLegacyDictionaries,
  loadCaseStudyData,
  loadProjectRegistry,
  localizedNodes,
  projectSlugs,
  compatAttributeStrings,
  inlinePairs,
  pageTextSources,
  indexableRoutes,
  packDir,
  packFile,
  flattenKeys,
  readPath,
  writePath,
  compareKeys,
  CASE_STUDY_DATA_FILES,
  LOCALIZED_DATA_FILES,
  PROJECT_COPY_FIELDS,
  PROJECT_LIST_FIELDS,
  PROJECT_STEP_FIELDS,
  META_FIELDS,
  COMPAT_ATTRIBUTE_PAIRS,
  decodeAttribute,
  CONTENT_REGISTRY_KEYS,
  isNeutralDynamicKey,
  loadDynamicSurface,
  DYNAMIC_SURFACES,
} from "./i18n-catalog.mjs";

export const PACK_DOMAIN_FILES = ["ui", "pages", "case-studies", "projects", "content", "dynamic", "meta"];

/** Domains whose Turkish content is projected from an existing canonical source. */
export const DERIVED_TR_DOMAINS = ["ui", "pages", "case-studies", "projects", "content", "dynamic"];

/* ---------- Turkish derivation ---------- */

/** Turkish side of every compat `data-*-en` / `data-*-tr` attribute pair. */
function compatTurkish() {
  const map = new Map();
  for (const file of fs.readdirSync(ROOT).filter((name) => name.endsWith(".html")).sort()) {
    const html = read(file);
    for (const { prefix } of COMPAT_ATTRIBUTE_PAIRS) {
      const pattern = new RegExp(`${prefix}-en="([^"]*)"[^>]*?${prefix}-tr="([^"]*)"|${prefix}-tr="([^"]*)"[^>]*?${prefix}-en="([^"]*)"`, "g");
      for (const match of html.matchAll(pattern)) {
        const english = decodeAttribute(match[1] ?? match[4] ?? "");
        const turkish = decodeAttribute(match[2] ?? match[3] ?? "");
        if (english.trim() && turkish.trim()) map.set(english, turkish);
      }
    }
  }
  return map;
}

function deriveTurkishPages() {
  const dictionaries = loadLegacyDictionaries();
  const text = {};
  const compat = compatTurkish();
  const inline = inlinePairs();
  for (const source of pageTextSources(dictionaries).sort(compareKeys)) {
    const value = dictionaries.text.tr[source] ?? compat.get(source) ?? inline.get(source);
    if (value !== undefined) text[source] = value;
  }
  const attribute = {};
  for (const key of Object.keys(dictionaries.attribute.tr).sort(compareKeys)) attribute[key] = dictionaries.attribute.tr[key];
  const title = {};
  for (const key of Object.keys(dictionaries.title.tr).sort(compareKeys)) title[key] = dictionaries.title.tr[key];
  return { text, attribute, title };
}

function deriveTurkishCaseStudies() {
  const out = {};
  for (const file of CASE_STUDY_DATA_FILES) {
    const data = loadCaseStudyData(file);
    const id = file.replace(/\.data\.js$/, "");
    const entry = {};
    for (const key of Object.keys(data.translations.en).sort(compareKeys)) {
      if (data.translations.tr?.[key] !== undefined) entry[key] = data.translations.tr[key];
    }
    if (data.titles.tr !== undefined) entry.__title = data.titles.tr;
    out[id] = entry;
  }
  return out;
}

function deriveTurkishProjects() {
  const registry = loadProjectRegistry();
  const out = {};
  for (const slug of projectSlugs(registry).sort(compareKeys)) {
    const project = registry.projectDetails[slug];
    const entry = {};
    for (const field of PROJECT_COPY_FIELDS) {
      if (project[field]?.tr !== undefined) entry[field] = project[field].tr;
    }
    for (const field of PROJECT_LIST_FIELDS) {
      if (Array.isArray(project[field]?.tr)) entry[field] = project[field].tr.slice();
    }
    for (const field of PROJECT_STEP_FIELDS) {
      if (Array.isArray(project[field]?.tr)) {
        entry[field] = project[field].tr.map((step) => ({ title: step.title, text: step.text }));
      }
    }
    const labels = (project.links || []).map((link) => link.label?.tr);
    if (labels.some((label) => label !== undefined)) {
      entry.links = labels.map((label) => ({ label: label ?? "" }));
    }
    out[slug] = entry;
  }
  return out;
}

/**
 * Content is a flat `registryPath -> copy` map rather than a nested tree, so
 * composing it onto `window.KAAN_PORTFOLIO` at runtime is one path walk per
 * entry and the file stays easy to diff between locales.
 */
function deriveTurkishContent() {
  const registry = loadRegistry();
  const out = {};
  for (const file of LOCALIZED_DATA_FILES) {
    if (file === "data/portfolio/project-details.json") continue;
    const short = CONTENT_REGISTRY_KEYS[file];
    for (const { path: nodePath, node } of localizedNodes(readJson(file), registry)) {
      if (node.tr === undefined) continue;
      out[`${short}.${nodePath}`] = node.tr;
    }
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => compareKeys(a[0], b[0])));
}

/**
 * Dynamic packs carry copy only.
 *
 * Command ids, intent ids, link targets and download filenames are stripped:
 * the runtime merges pack copy over the English structure, so an omitted key
 * keeps its canonical value. This is what keeps Ajoop's intent identity
 * language-neutral and keeps URLs out of every locale pack.
 */
function stripNeutralDynamic(value, source, key = "") {
  if (Array.isArray(value)) {
    /* A stripped array slot becomes null, which the runtime merge reads as
     * "keep the canonical value" — positions stay aligned either way. */
    const mapped = value.map((item, index) => stripNeutralDynamic(item, source?.[index], `${key}[${index}]`));
    return mapped.every((item) => item === undefined) ? undefined : mapped.map((item) => (item === undefined ? null : item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, child] of Object.entries(value)) {
      const kept = stripNeutralDynamic(child, source?.[childKey], key ? `${key}.${childKey}` : childKey);
      if (kept !== undefined) out[childKey] = kept;
    }
    return Object.keys(out).length ? out : undefined;
  }
  /* Neutrality is judged from the English source, so the catalog and the pack
   * can never disagree about which entries are translation obligations. */
  return isNeutralDynamicKey(key, source) ? undefined : value;
}

function deriveTurkishDynamic() {
  const out = {};
  for (const surface of DYNAMIC_SURFACES) {
    const literal = loadDynamicSurface(surface.namespace);
    out[surface.namespace] = stripNeutralDynamic(literal.tr, literal.en, surface.namespace) ?? {};
  }
  return out;
}

function deriveTurkishUi() {
  const ui = readJson("data/i18n/ui.json");
  const out = {};
  for (const key of Object.keys(ui).sort(compareKeys)) if (ui[key].tr !== undefined) out[key] = ui[key].tr;
  return out;
}

export function deriveTurkishPack() {
  return {
    ui: deriveTurkishUi(),
    pages: deriveTurkishPages(),
    "case-studies": deriveTurkishCaseStudies(),
    projects: deriveTurkishProjects(),
    content: deriveTurkishContent(),
    dynamic: deriveTurkishDynamic(),
  };
}

/* ---------- coverage ---------- */

/**
 * Maps a catalog entry to the pack path that must satisfy it.
 * `pages` keys embed their English source, so the domain prefix is stripped and
 * the remainder used verbatim rather than parsed as a dotted path.
 */
export function packLookup(pack, entry) {
  const { domain, key } = entry;
  if (domain === "ui") return pack.ui?.[key];
  if (domain === "pages") {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const source = key.slice(separator + 1);
    return pack.pages?.[kind]?.[source];
  }
  if (domain === "case-studies") {
    const separator = key.indexOf(":");
    return pack["case-studies"]?.[key.slice(0, separator)]?.[key.slice(separator + 1)];
  }
  if (domain === "projects") return readPath(pack.projects || {}, key);
  if (domain === "content") return pack.content?.[key];
  if (domain === "dynamic") return readPath(pack.dynamic || {}, key);
  if (domain === "meta") return readPath(pack.meta || {}, key);
  return undefined;
}

export function writePackValue(pack, entry, value) {
  const { domain, key } = entry;
  if (domain === "ui") { (pack.ui ??= {})[key] = value; return; }
  if (domain === "pages") {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    ((pack.pages ??= {})[kind] ??= {})[key.slice(separator + 1)] = value;
    return;
  }
  if (domain === "case-studies") {
    const separator = key.indexOf(":");
    ((pack["case-studies"] ??= {})[key.slice(0, separator)] ??= {})[key.slice(separator + 1)] = value;
    return;
  }
  if (domain === "content") { (pack.content ??= {})[key] = value; return; }
  writePath((pack[domain] ??= {}), key, value);
}

export function loadAuthoredPack(locale) {
  const pack = {};
  for (const domain of PACK_DOMAIN_FILES) {
    const file = packFile(locale, domain);
    if (fileExists(file)) pack[domain] = readJson(file);
  }
  return pack;
}

/** Per-domain coverage for one locale, plus the list of missing catalog keys. */
export function coverageFor(locale, catalog = buildCatalog()) {
  const pack = loadAuthoredPack(locale);
  const domains = new Map();
  const missing = [];
  for (const entry of catalog.entries) {
    const stats = domains.get(entry.domain) || { total: 0, filled: 0 };
    stats.total += 1;
    const value = packLookup(pack, entry);
    const filled = typeof value === "string" ? value.trim() !== "" : value !== undefined && value !== null;
    if (filled) stats.filled += 1;
    else missing.push(entry);
    domains.set(entry.domain, stats);
  }
  const total = [...domains.values()].reduce((sum, stats) => sum + stats.total, 0);
  const filled = [...domains.values()].reduce((sum, stats) => sum + stats.filled, 0);
  return { locale, domains, total, filled, missing, percent: total ? (filled / total) * 100 : 0 };
}

/* ---------- commands ---------- */

function writePackFiles(locale, pack) {
  fs.mkdirSync(path.join(ROOT, packDir(locale)), { recursive: true });
  for (const [domain, value] of Object.entries(pack)) {
    fs.writeFileSync(path.join(ROOT, packFile(locale, domain)), stableJson(value));
  }
}

function derivedTurkishFiles() {
  const derived = deriveTurkishPack();
  return DERIVED_TR_DOMAINS.map((domain) => [packFile("tr", domain), stableJson(derived[domain])]);
}

/* The coverage helpers above are imported by the generators and by qa:i18n, so
 * the CLI only runs when this file is the entry point. */
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const argv = isEntryPoint ? process.argv.slice(2) : ["--noop"];
const command = argv[0];

if (command === "--noop") {
  /* imported as a library */
} else if (command === "--derive") {
  fs.mkdirSync(path.join(ROOT, packDir("tr")), { recursive: true });
  for (const [file, content] of derivedTurkishFiles()) fs.writeFileSync(path.join(ROOT, file), content);
  console.log(`[i18n:packs] derived ${DERIVED_TR_DOMAINS.length} Turkish pack domains from canonical sources.`);
} else if (command === "--check") {
  const stale = derivedTurkishFiles().filter(([file, content]) => {
    const absolute = path.join(ROOT, file);
    const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n") : null;
    return existing !== content;
  });
  if (stale.length) {
    console.error(`Derived Turkish pack is stale:\n${stale.map(([file]) => `  - ${file}`).join("\n")}\n\nRun: npm run i18n:packs`);
    process.exit(1);
  }
  console.log("Derived Turkish pack is in step with canonical sources.");
} else if (command === "--scaffold") {
  const locale = argv[1];
  if (!locale) throw new Error("--scaffold needs a locale id");
  const catalog = buildCatalog();
  const pack = loadAuthoredPack(locale);
  let added = 0;
  for (const entry of catalog.entries) {
    if (packLookup(pack, entry) !== undefined) continue;
    writePackValue(pack, entry, null);
    added += 1;
  }
  for (const domain of PACK_DOMAIN_FILES) pack[domain] ??= {};
  writePackFiles(locale, pack);
  console.log(`[i18n:packs] scaffolded ${locale}: ${added} key(s) added as null.`);
} else if (command === "--coverage" || !command) {
  const catalog = buildCatalog();
  const registry = loadRegistry();
  const domains = [...new Set(catalog.entries.map((entry) => entry.domain))].sort();
  const header = ["locale", ...domains, "total"].map((name) => name.padStart(14)).join("");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const locale of registry.locales) {
    if (locale.id === registry.defaultLocale) {
      console.log(["en", ...domains.map(() => "100.0%"), "100.0%"].map((cell) => cell.padStart(14)).join(""));
      continue;
    }
    const coverage = coverageFor(locale.id, catalog);
    const cells = domains.map((domain) => {
      const stats = coverage.domains.get(domain);
      return stats ? `${((stats.filled / stats.total) * 100).toFixed(1)}%` : "—";
    });
    console.log([locale.id, ...cells, `${coverage.percent.toFixed(1)}%`].map((cell) => cell.padStart(14)).join(""));
  }
  console.log(`\ncatalog: ${catalog.entries.length} entries · routes: ${indexableRoutes().length}`);
} else {
  console.error(`unknown command ${command}`);
  process.exit(1);
}
