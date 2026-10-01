#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, normalizeText, parseTag } from "./localized-html.mjs";

export const WORKS_GAMES_ACCEPTED_REF = "24be2f8159a0925dc00f29375ea8740738214df3";
const LOCALES = ["en", "tr", "de", "es", "fr"];
const PAGES = { works: "works/index.html", games: "games/index.html" };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const LOCALIZED_ATTRIBUTES = new Set(["alt", "aria-label", "placeholder", "title"]);
const CATALOG_SEARCH_MESSAGES = {
  "works.search.label": { en: "Search projects", tr: "Projelerde ara", de: "Projekte durchsuchen", es: "Buscar proyectos", fr: "Rechercher des projets" },
  "works.search.placeholder": { en: "Search by project, technology or keyword...", tr: "Proje, teknoloji veya anahtar kelime ara...", de: "Nach Projekt, Technologie oder Stichwort suchen...", es: "Buscar por proyecto, tecnología o palabra clave...", fr: "Rechercher par projet, technologie ou mot-clé..." },
  "games.search.label": { en: "Search games", tr: "Oyunlarda ara", de: "Spiele durchsuchen", es: "Buscar juegos", fr: "Rechercher des jeux" },
  "games.search.placeholder": { en: "Search by game, category or feature...", tr: "Oyun, kategori veya özellik ara...", de: "Nach Spiel, Kategorie oder Funktion suchen...", es: "Buscar por juego, categoría o función...", fr: "Rechercher par jeu, catégorie ou fonctionnalité..." },
};
const DATA_TEXT = new Map([
  ["SINAMA — AI Agent Reliability Lab", "projects.sinama.name"],
  ["Merge Rush: Tiny Factory", "projects.mergeRush.name"],
]);
const DATA_ATTRIBUTE = new Map([
  ["/sinama-case-study/", "projects.sinama.links.caseStudy"],
  ["https://sinama.kaanbalci.com", "projects.sinama.links.live"],
  ["https://github.com/UAJOP/sinama", "projects.sinama.links.github"],
  ["/projects/ai-chatbot-flow-design/", "projects.chatbotFlow.links.caseStudy"],
  ["/atolye-joyday-case-study/", "projects.joyday.links.caseStudy"],
  ["https://atolyejoyday.com/", "projects.joyday.links.live"],
  ["/merge-rush-case-study/", "projects.mergeRush.links.caseStudy"],
  ["/hospital-system-case-study/", "projects.hospital.links.caseStudy"],
  ["https://github.com/UAJOP/Hospital-System", "projects.hospital.links.github"],
]);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
}

function parseArguments() {
  const refAt = process.argv.indexOf("--accepted-ref");
  const outputAt = process.argv.indexOf("--output");
  if (refAt < 0 || outputAt < 0) throw new Error("usage: --accepted-ref <ref> --output <file>");
  const resolved = git("rev-parse", `${process.argv[refAt + 1]}^{commit}`).trim();
  if (resolved !== WORKS_GAMES_ACCEPTED_REF) {
    throw new Error(`Works/Games structure must use accepted ref ${WORKS_GAMES_ACCEPTED_REF}; received ${resolved}`);
  }
  return { ref: resolved, output: path.resolve(ROOT, process.argv[outputAt + 1]) };
}

function mainSource(ref, source) {
  const document = git("show", `${ref}:${source}`);
  const main = document.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) throw new Error(`${ref}:${source} has no main`);
  return main[1];
}

function walkValues(html, values = { text: [], attributes: [] }) {
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const text = normalizeText(decodeHtml(html.slice(index, stop)));
    if (text) values.text.push(text);
    if (nextTag < 0) break;
    if (html.startsWith("<!--", nextTag)) {
      const end = html.indexOf("-->", nextTag);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const tagEnd = findTagEnd(html, nextTag);
    const rawTag = html.slice(nextTag, tagEnd);
    if (rawTag.startsWith("</")) throw new Error(`unexpected close tag ${rawTag}`);
    const tag = parseTag(rawTag);
    for (const attribute of tag.attributes) {
      if (LOCALIZED_ATTRIBUTES.has(attribute.name.toLowerCase()) && attribute.value !== null) {
        values.attributes.push({ name: attribute.name.toLowerCase(), value: decodeHtml(attribute.value) });
      }
    }
    const name = tag.name.toLowerCase();
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`unclosed ${name}`);
      walkValues(html.slice(tagEnd, close), values);
      index = findTagEnd(html, close);
    }
  }
  return values;
}

function slug(value) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 72);
  return normalized || `value.${crypto.createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

function uniqueKey(page, kind, value, owners) {
  const base = `${page}.${kind}.${slug(value)}`;
  const owner = owners.get(base);
  if (!owner || owner === value) {
    owners.set(base, value);
    return base;
  }
  const key = `${base}.${crypto.createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
  owners.set(key, value);
  return key;
}

function buildCatalog(ref, page, source) {
  const sources = Object.fromEntries(LOCALES.map((locale) => {
    const localizedSource = locale === "en" ? source : `${locale}/${source}`;
    return [locale, walkValues(mainSource(ref, localizedSource))];
  }));
  const english = sources.en;
  for (const locale of LOCALES) {
    if (sources[locale].text.length !== english.text.length) throw new Error(`${page}/${locale}: text shape drift`);
    if (sources[locale].attributes.length !== english.attributes.length) throw new Error(`${page}/${locale}: attribute shape drift`);
  }
  const owners = new Map();
  const textKeys = new Map();
  const attributeKeys = new Map();
  const messages = {};
  english.text.forEach((value, index) => {
    if (DATA_TEXT.has(value)) return;
    const key = textKeys.get(value) || uniqueKey(page, "copy", value, owners);
    textKeys.set(value, key);
    messages[key] ||= {};
    for (const locale of LOCALES) {
      const localized = sources[locale].text[index];
      if (messages[key][locale] && messages[key][locale] !== localized) {
        throw new Error(`${page}/${key}/${locale}: repeated accepted copy is inconsistent`);
      }
      messages[key][locale] = localized;
    }
  });
  english.attributes.forEach((record, index) => {
    const identity = `${record.name}\u0000${record.value}`;
    const key = attributeKeys.get(identity) || uniqueKey(page, record.name.replace("aria-label", "aria"), record.value, owners);
    attributeKeys.set(identity, key);
    messages[key] ||= {};
    for (const locale of LOCALES) {
      const localized = sources[locale].attributes[index];
      if (localized.name !== record.name) throw new Error(`${page}/${locale}: localized attribute order drift`);
      if (messages[key][locale] && messages[key][locale] !== localized.value) {
        throw new Error(`${page}/${key}/${locale}: repeated accepted attribute is inconsistent`);
      }
      messages[key][locale] = localized.value;
    }
  });
  return { textKeys, attributeKeys, messages };
}

function descriptorForAttribute(attribute, catalog) {
  const name = attribute.name.toLowerCase();
  const value = attribute.value === null ? true : decodeHtml(attribute.value);
  if (name === "href" && typeof value === "string" && DATA_ATTRIBUTE.has(value)) return { name, value: { type: "data", path: DATA_ATTRIBUTE.get(value) } };
  if (name === "href" && typeof value === "string" && value.startsWith("/")) return { name, value: { type: "internal", path: value } };
  if (LOCALIZED_ATTRIBUTES.has(name) && typeof value === "string") {
    const key = catalog.attributeKeys.get(`${name}\u0000${value}`);
    if (!key) throw new Error(`missing accepted attribute key for ${name}=${value}`);
    return { name, value: { type: "message", key } };
  }
  return { name, value };
}

function parseNodes(html, catalog) {
  const nodes = [];
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const text = normalizeText(decodeHtml(html.slice(index, stop)));
    if (text) {
      if (DATA_TEXT.has(text)) nodes.push({ type: "data", path: DATA_TEXT.get(text) });
      else nodes.push({ type: "message", key: catalog.textKeys.get(text) });
    }
    if (nextTag < 0) break;
    if (html.startsWith("<!--", nextTag)) {
      const end = html.indexOf("-->", nextTag);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const tagEnd = findTagEnd(html, nextTag);
    const rawTag = html.slice(nextTag, tagEnd);
    if (rawTag.startsWith("</")) throw new Error(`unexpected close tag ${rawTag}`);
    const tag = parseTag(rawTag);
    const name = tag.name.toLowerCase();
    const node = {
      type: "element",
      tag: name,
      attributes: tag.attributes.map((attribute) => descriptorForAttribute(attribute, catalog)),
      children: [],
    };
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`unclosed ${name}`);
      node.children = parseNodes(html.slice(tagEnd, close), catalog);
      index = findTagEnd(html, close);
    }
    nodes.push(node);
  }
  return nodes;
}

const { ref, output } = parseArguments();
const structure = { schemaVersion: 1, acceptedRef: ref, locales: LOCALES, messages: { ...CATALOG_SEARCH_MESSAGES }, pages: {} };
for (const [page, source] of Object.entries(PAGES)) {
  const catalog = buildCatalog(ref, page, source);
  Object.assign(structure.messages, catalog.messages);
  structure.pages[page] = { source, children: parseNodes(mainSource(ref, source), catalog) };
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(structure, null, 2)}\n`, "utf8");
console.log(`Works/Games React structure reproduced from ${ref}: ${path.relative(ROOT, output)} · ${Object.keys(structure.messages).length} stable locale keys`);
