#!/usr/bin/env node
/**
 * extract-i18n-source.mjs — snapshots the English source of every translatable
 * surface that lives inside code rather than data (BRIEF 09C).
 *
 * English stays canonical where it already is: dynamic copy in the feature
 * modules, page metadata in the authored `<head>`s. This script only mirrors it
 * into data/i18n/source/ so locale packs have a stable key space to translate
 * against and `qa:i18n` can prove 100% coverage without parsing JavaScript.
 *
 * Writes:
 *   data/i18n/source/dynamic.json   English dynamic-surface copy
 *   data/i18n/source/meta.json      English metadata per indexable route
 *
 * Deterministic: identical input always produces byte-identical output.
 *
 *   node scripts/extract-i18n-source.mjs           # write
 *   node scripts/extract-i18n-source.mjs --check   # verify only
 */

import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  read,
  stableJson,
  indexableRoutes,
  loadProjectRegistry,
  loadDynamicSurface,
  inlinePairs,
  decodeAttribute,
  DYNAMIC_SURFACES,
  metadataRoutes,
} from "./i18n-catalog.mjs";

const checkOnly = process.argv.includes("--check");

/* ---------- dynamic surfaces ---------- */

function buildDynamicSource() {
  const out = {};
  for (const surface of DYNAMIC_SURFACES) {
    const literal = loadDynamicSurface(surface.namespace);
    if (!literal.en) throw new Error(`${surface.file} ${surface.declaration} has no English branch`);
    out[surface.namespace] = literal.en;
  }
  return out;
}

/* ---------- route metadata ---------- */

const META_PATTERNS = {
  title: /<title>([\s\S]*?)<\/title>/i,
  description: /<meta[^>]*\bname="description"[^>]*>/i,
  ogTitle: /<meta[^>]*\bproperty="og:title"[^>]*>/i,
  ogDescription: /<meta[^>]*\bproperty="og:description"[^>]*>/i,
};

function attributeContent(tag) {
  const match = tag?.match(/\bcontent="([^"]*)"/i);
  return match ? decodeAttribute(match[1]) : "";
}

/**
 * English metadata for the authored pages.
 *
 * Project routes are deliberately absent: `<title>` and description are
 * composed from canonical project copy at generation time, in every locale, so
 * project identity has exactly one home.
 */
function buildMetaSource() {
  const out = {};

  for (const route of metadataRoutes()) {
    const head = read(route.source).match(/<head>([\s\S]*?)<\/head>/i)?.[1] || "";
    const title = decodeAttribute((head.match(META_PATTERNS.title)?.[1] || "").trim());
    const description = attributeContent(head.match(META_PATTERNS.description)?.[0]);
    if (!title) throw new Error(`${route.source} has no <title> to localize`);
    if (!description) throw new Error(`${route.source} has no meta description to localize`);
    out[route.id] = {
      title,
      description,
      ogTitle: attributeContent(head.match(META_PATTERNS.ogTitle)?.[0]) || title,
      ogDescription: attributeContent(head.match(META_PATTERNS.ogDescription)?.[0]) || description,
    };
  }

  return out;
}

/* ---------- write / check ---------- */

const targets = [
  ["data/i18n/source/dynamic.json", stableJson(buildDynamicSource())],
  ["data/i18n/source/meta.json", stableJson(buildMetaSource())],
];

const differences = targets.filter(([file, content]) => {
  const absolute = path.join(ROOT, file);
  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n") : null;
  return existing !== content;
});

if (checkOnly) {
  if (differences.length) {
    console.error(
      `i18n source snapshots are stale:\n${differences.map(([file]) => `  - ${file}`).join("\n")}\n\nRun: npm run i18n:extract`,
    );
    process.exit(1);
  }
  console.log("i18n source snapshots are up to date.");
  process.exit(0);
}

fs.mkdirSync(path.join(ROOT, "data/i18n/source"), { recursive: true });
for (const [file, content] of targets) fs.writeFileSync(path.join(ROOT, file), content);

console.log(
  `[i18n:extract] ${DYNAMIC_SURFACES.length} dynamic surfaces · ${indexableRoutes().length} metadata routes · ${inlinePairs().size} inline phrase pairs`,
);
