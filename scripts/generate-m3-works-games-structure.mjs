#!/usr/bin/env node
/* Reproduces the React structure of the accepted Works/Games mains. Copy is
 * bound by key only: every accepted string resolves through the explicit
 * semantic-key manifest (data/i18n/works-games-semantic-keys.json) to the
 * canonical common message domain, so the structure carries no localized copy
 * of its own and cannot diverge from it. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, normalizeText, parseTag } from "./localized-html.mjs";
import {
  DATA_TEXT,
  LOCALIZED_ATTRIBUTES,
  VOID,
  WORKS_GAMES_ACCEPTED_REF,
  WORKS_GAMES_LOCALES,
  WORKS_GAMES_PAGES,
  mainSource,
  resolveAcceptedRef,
} from "./m3-works-games-accepted-copy.mjs";
import { CATALOG_SEARCH_AUTHORITY } from "./m3-works-games-catalog-copy.mjs";

export { WORKS_GAMES_ACCEPTED_REF };
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "data/i18n/works-games-semantic-keys.json"), "utf8"));
/* COMMON runtime stands down inside React-owned main, so the accepted
 * runtime presentation contract is carried by the structure itself.
 * Image loading mirrors js/features/creative.js structurally. Protected-term
 * casing depends on computed style, so the single element the accepted
 * runtime marked (identical in all five locales) is pinned by its stable
 * message key and verified against the live accepted artifact by G-65. */
const PRESERVE_CASE_MESSAGE_KEYS = new Set(["works.category.pythonSoftware"]);
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

function parseArguments() {
  const refAt = process.argv.indexOf("--accepted-ref");
  const outputAt = process.argv.indexOf("--output");
  if (refAt < 0 || outputAt < 0) throw new Error("usage: --accepted-ref <ref> --output <file>");
  return { ref: resolveAcceptedRef(process.argv[refAt + 1]), output: path.resolve(ROOT, process.argv[outputAt + 1]) };
}

function bindings(source) {
  if (MANIFEST.schemaVersion !== 2 || MANIFEST.acceptedRef !== WORKS_GAMES_ACCEPTED_REF) throw new Error("unsupported Works/Games semantic-key manifest");
  const entries = MANIFEST.sources?.[source];
  if (!entries) throw new Error(`${source}: no semantic-key bindings`);
  const lookup = (kind) => (english) => {
    const key = entries[kind]?.[english];
    if (!key) throw new Error(`${source}: accepted ${kind} has no semantic key: ${JSON.stringify(english)}`);
    return key;
  };
  const text = lookup("text");
  return {
    text: (english) => (entries.roles?.[english] ? { type: "role", ref: entries.roles[english] } : { type: "message", key: text(english) }),
    attribute: lookup("attribute"),
  };
}

function descriptorForAttribute(attribute, catalog) {
  const name = attribute.name.toLowerCase();
  const value = attribute.value === null ? true : decodeHtml(attribute.value);
  if (name === "href" && typeof value === "string" && DATA_ATTRIBUTE.has(value)) return { name, value: { type: "data", path: DATA_ATTRIBUTE.get(value) } };
  if (name === "href" && typeof value === "string" && value.startsWith("/")) return { name, value: { type: "internal", path: value } };
  if (LOCALIZED_ATTRIBUTES.has(name) && typeof value === "string") return { name, value: { type: "message", key: catalog.attribute(value) } };
  return { name, value };
}

function applyRuntimePresentation(node, inHero) {
  const has = (name) => node.attributes.some((attribute) => attribute.name === name);
  const value = (name) => node.attributes.find((attribute) => attribute.name === name)?.value;
  if (node.tag === "img") {
    if (!has("decoding")) node.attributes.push({ name: "decoding", value: "async" });
    if (!has("loading") && !inHero && value("fetchpriority") !== "high") node.attributes.push({ name: "loading", value: "lazy" });
    if (!has("fetchpriority") && inHero) node.attributes.push({ name: "fetchpriority", value: "high" });
  }
  if (PRESERVE_CASE_MESSAGE_KEYS.has(value("data-message-key"))) node.attributes.push({ name: "data-preserve-case", value: true });
}

/* data-pv2-en / data-pv2-tr repeat the element's own copy in English and
 * Turkish. They are bound to the element's single text binding with a fixed
 * locale, so they cannot hold an independent copy. */
const FIXED_LOCALE_ATTRIBUTES = { "data-pv2-en": "en", "data-pv2-tr": "tr" };
function bindFixedLocaleCopy(node) {
  const fixed = node.attributes.filter((attribute) => FIXED_LOCALE_ATTRIBUTES[attribute.name]);
  if (!fixed.length) return;
  const bound = node.children.filter((child) => child.type !== "space");
  if (bound.length !== 1 || !["message", "role"].includes(bound[0].type)) throw new Error(`${node.tag}: data-pv2 copy needs exactly one bound text child`);
  for (const attribute of fixed) {
    attribute.value = bound[0].type === "role"
      ? { type: "role", ref: bound[0].ref, locale: FIXED_LOCALE_ATTRIBUTES[attribute.name] }
      : { type: "message", key: bound[0].key, locale: FIXED_LOCALE_ATTRIBUTES[attribute.name] };
  }
}

/* `space` nodes record where the accepted source had whitespace. They render
 * nothing, but keep catalog search text equivalent to legacy textContent. */
function pushSpace(nodes) {
  if (nodes[nodes.length - 1]?.type !== "space") nodes.push({ type: "space" });
}

function parseNodes(html, catalog, inHero = false) {
  const nodes = [];
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const raw = decodeHtml(html.slice(index, stop));
    const text = normalizeText(raw);
    if (/^\s/.test(raw)) pushSpace(nodes);
    if (text) {
      if (DATA_TEXT.has(text)) nodes.push({ type: "data", path: DATA_TEXT.get(text) });
      else nodes.push(catalog.text(text));
      if (/\s$/.test(raw)) pushSpace(nodes);
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
    const classes = String(node.attributes.find((attribute) => attribute.name === "class")?.value || "").split(/\s+/);
    const childInHero = inHero || classes.includes("hero");
    applyRuntimePresentation(node, childInHero);
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`unclosed ${name}`);
      node.children = parseNodes(html.slice(tagEnd, close), catalog, childInHero);
      index = findTagEnd(html, close);
    }
    bindFixedLocaleCopy(node);
    nodes.push(node);
  }
  return nodes;
}

const { ref, output } = parseArguments();
const structure = { schemaVersion: 3, acceptedRef: ref, locales: [...WORKS_GAMES_LOCALES], catalogSearch: CATALOG_SEARCH_AUTHORITY, roleLabel: MANIFEST.roleLabel, pages: {} };
for (const [page, source] of Object.entries(WORKS_GAMES_PAGES)) {
  structure.pages[page] = { source, children: parseNodes(mainSource(ref, source), bindings(source)) };
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(structure, null, 2)}\n`, "utf8");
console.log(`Works/Games React structure reproduced from ${ref}: ${path.relative(ROOT, output)} · copy bound by key to canonical common messages only`);
