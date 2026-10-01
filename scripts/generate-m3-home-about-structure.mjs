#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, normalizeText, parseTag } from "./localized-html.mjs";

const ACCEPTED_REF = "34fdfad01f63004ed10d616a7b061e3996c28150";
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const pages = { home: "index.html", about: "about/index.html" };
const dataText = new Map([
  ["SINAMA — AI Agent Reliability Lab", "projects.sinama.name"],
  ["Merge Rush: Tiny Factory", "projects.mergeRush.name"],
]);
const dataAttribute = new Map([
  ["mailto:kaanb8776@gmail.com", "profile.email"],
  ["/sinama-case-study/", "projects.sinama.links.caseStudy"],
  ["https://sinama.kaanbalci.com", "projects.sinama.links.live"],
  ["/projects/ai-chatbot-flow-design/", "projects.chatbotFlow.links.caseStudy"],
  ["/atolye-joyday-case-study/", "projects.joyday.links.caseStudy"],
  ["https://atolyejoyday.com/", "projects.joyday.links.live"],
  ["/merge-rush-case-study/", "projects.mergeRush.links.caseStudy"],
  ["/hospital-system-case-study/", "projects.hospital.links.caseStudy"],
]);
const neutralText = new Set([
  "01", "02", "03", "2020", "2023", "2024", "2025", "2026",
  "Python, JavaScript, TypeScript, C#, PHP, Java, Kotlin, C++",
  "FastAPI, REST APIs, PostgreSQL, MySQL, MSSQL, SQLite, Firebase",
]);

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function parseArguments() {
  const refAt = process.argv.indexOf("--accepted-ref");
  const outputAt = process.argv.indexOf("--output");
  if (refAt < 0 || outputAt < 0) throw new Error("usage: --accepted-ref <ref> --output <file>");
  const requested = process.argv[refAt + 1];
  const resolved = git("rev-parse", `${requested}^{commit}`).trim();
  if (resolved !== ACCEPTED_REF) throw new Error(`Home/About structure must be reproduced from accepted ref ${ACCEPTED_REF}; received ${resolved}`);
  return { ref: resolved, output: path.resolve(ROOT, process.argv[outputAt + 1]) };
}

function descriptorForAttribute(attribute, all, textMap, attributeMap) {
  const name = attribute.name.toLowerCase();
  const value = attribute.value === null ? true : decodeHtml(attribute.value);
  if (name === "onclick") {
    if (value !== "openDrivePreviews()") throw new Error(`unsupported inline production action ${value}`);
    return { name: "data-react-action", value: "openResume" };
  }
  if (name === "data-pv2-en" || name === "data-pv2-tr") {
    const english = decodeHtml(all.find((item) => item.name.toLowerCase() === "data-pv2-en")?.value || "");
    const key = textMap[english];
    if (!key) throw new Error(`compatibility copy has no semantic key: ${english}`);
    return { name, value: { type: "compat", locale: name.endsWith("-en") ? "en" : "tr", key } };
  }
  if (typeof value === "string" && dataAttribute.has(value)) return { name, value: { type: "data", path: dataAttribute.get(value) } };
  if (name === "href" && typeof value === "string" && value.startsWith("/")) return { name, value: { type: "internal", path: value } };
  if (["aria-label", "alt", "title", "placeholder"].includes(name) && attributeMap[value]) {
    return { name, value: { type: "message", key: attributeMap[value] } };
  }
  return { name, value };
}

function parseNodes(html, source, manifest) {
  const textMap = manifest.sources[source].text;
  const attributeMap = manifest.sources[source].attribute;
  const nodes = [];
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const text = normalizeText(decodeHtml(html.slice(index, stop)));
    if (text) {
      if (dataText.has(text)) nodes.push({ type: "data", path: dataText.get(text) });
      else if (textMap[text]) nodes.push({ type: "message", key: textMap[text] });
      else if (neutralText.has(text)) nodes.push({ type: "text", value: text });
      else throw new Error(`${source}: main text has no semantic or canonical authority: ${JSON.stringify(text)}`);
    }
    if (nextTag < 0) break;
    if (html.startsWith("<!--", nextTag)) {
      const end = html.indexOf("-->", nextTag);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const tagEnd = findTagEnd(html, nextTag);
    const rawTag = html.slice(nextTag, tagEnd);
    if (rawTag.startsWith("</")) throw new Error(`${source}: unexpected close tag ${rawTag}`);
    const tag = parseTag(rawTag);
    const name = tag.name.toLowerCase();
    const node = {
      type: "element",
      tag: name,
      attributes: tag.attributes.map((attribute) => descriptorForAttribute(attribute, tag.attributes, textMap, attributeMap)),
      children: [],
    };
    if (tag.selfClosing || VOID.has(name)) {
      index = tagEnd;
    } else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`${source}: unclosed ${name}`);
      node.children = parseNodes(html.slice(tagEnd, close), source, manifest);
      index = findTagEnd(html, close);
    }
    nodes.push(node);
  }
  return nodes;
}

const { ref, output } = parseArguments();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/i18n/home-about-semantic-keys.json"), "utf8"));
const structure = { schemaVersion: 1, acceptedRef: ref, pages: {} };
for (const [id, source] of Object.entries(pages)) {
  const document = git("show", `${ref}:${source}`);
  const main = document.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) throw new Error(`${ref}:${source} has no main`);
  structure.pages[id] = { source, children: parseNodes(main[1], source, manifest) };
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(structure, null, 2)}\n`, "utf8");
console.log(`Home/About React structure reproduced from ${ref}: ${path.relative(ROOT, output)}`);
