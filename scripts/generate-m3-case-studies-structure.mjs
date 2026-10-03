#!/usr/bin/env node
/**
 * Capture the accepted, route-localized case-study document contract as data
 * for the shared React renderer. The five case studies intentionally keep
 * their own section structure; only the rendering primitive is shared.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, parseTag } from "./localized-html.mjs";

/** HTML whitespace only (never U+00A0), collapsed the way `white-space: normal` renders it. */
const collapseWhitespace = (value) => String(value).replace(/[ \t\n\r\f]+/g, " ");

const ACCEPTED_REF = "6650aacd844cde957888d296f086c1eb21992991";
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const OUTPUT = path.join(ROOT, "data/site/m3-29-case-studies-structure.json");
const CASES = {
  sinamaCaseStudy: { route: "sinama-case-study/", source: "sinama-case-study/index.html" },
  mergeRushCaseStudy: { route: "merge-rush-case-study/", source: "merge-rush-case-study/index.html" },
  joydayCaseStudy: { route: "atolye-joyday-case-study/", source: "atolye-joyday-case-study/index.html", scripts: ["/atolye-joyday-case-study.data.js", "/case-study.js"] },
  hospitalCaseStudy: { route: "hospital-system-case-study/", source: "hospital-system-case-study/index.html", scripts: ["/hospital-system-case-study.data.js", "/case-study.js"] },
  aiFlowPuzzleCaseStudy: { route: "ai-flow-puzzle-case-study/", source: "ai-flow-puzzle-case-study/index.html", scripts: ["/ai-flow-puzzle-case-study.data.js", "/case-study.js"] },
};
const registry = loadRegistry();
const locales = [registry.defaultLocale, ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale)];

const tagAttribute = (tag, name) => parseTag(tag).attributes.find((attribute) => attribute.name.toLowerCase() === name)?.value ?? null;
const attr = (html, selector, attribute = "content") => {
  const tag = html.match(selector)?.[0];
  return tag ? decodeHtml(tagAttribute(tag, attribute) || "") : null;
};
const styleObject = (value) => Object.fromEntries(decodeHtml(value).split(";").filter(Boolean).map((entry) => {
  const [property, ...rest] = entry.split(":");
  return [property.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), rest.join(":").trim()];
}));

function parseNodes(html, preserveWhitespace = false) {
  const nodes = [];
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const raw = decodeHtml(html.slice(index, stop));
    /* Inter-node whitespace is content: it separates inline siblings
     * ("</strong> text", "</a> <a>"). A run collapses to one space, exactly as
     * the browser renders it, but is never trimmed away. Text split only by a
     * comment is merged so React does not emit adjacent text nodes. */
    const text = preserveWhitespace ? raw : collapseWhitespace(raw);
    const previous = nodes[nodes.length - 1];
    if (text && previous?.type === "text") previous.value = preserveWhitespace ? previous.value + text : collapseWhitespace(previous.value + text);
    else if (text) nodes.push({ type: "text", value: text });
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
    const attributes = tag.attributes.map((attribute) => ({
      name: attribute.name.toLowerCase(),
      value: attribute.value === null ? true : attribute.name.toLowerCase() === "style" ? styleObject(attribute.value) : decodeHtml(attribute.value),
    }));
    if (attributes.some(({ name }) => name === "data-resume-link")) {
      const href = attributes.find((attribute) => attribute.name === "href");
      if (href) href.value = { type: "data", path: "profile.resume" };
    }
    if (attributes.some(({ name }) => name === "data-case-gallery") && !attributes.some(({ name }) => name === "aria-expanded")) attributes.push({ name: "aria-expanded", value: "false" });
    /* The SINAMA evidence explorer is an empty, runtime-populated root that
     * portfolio-v2.js still owns. React renders the container and cedes its
     * subtree, so hydration neither rejects nor replaces the explorer. */
    if (attributes.some(({ name }) => name === "data-sinama-evidence")) attributes.push({ name: "suppressHydrationWarning", value: true }, { name: "dangerouslySetInnerHTML", value: { __html: "" } });
    const node = {
      type: "element",
      tag: name,
      attributes,
      children: [],
    };
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`unclosed ${name}`);
      node.children = parseNodes(html.slice(tagEnd, close), preserveWhitespace || name === "pre");
      index = findTagEnd(html, close);
    }
    if (name === "aside" && !node.attributes.some(({ name: attributeName }) => ["aria-label", "aria-labelledby"].includes(attributeName))) {
      const heading = (nodes) => {
        for (const child of nodes) {
          if (child.type === "element" && ["h2", "h3"].includes(child.tag)) return child.children.filter((item) => item.type === "text").map((item) => item.value.trim()).filter(Boolean).join(" ");
          if (child.type === "element") { const nested = heading(child.children); if (nested) return nested; }
        }
        return "";
      };
      const label = heading(node.children);
      if (!label) throw new Error(`${name}: unnamed landmark has no heading`);
      node.attributes.push({ name: "aria-label", value: label });
    }
    nodes.push(node);
  }
  return nodes;
}

function extractMain(document, file) {
  const start = document.search(/<main\b/i);
  if (start < 0) throw new Error(`${file}: no main`);
  const openEnd = findTagEnd(document, start);
  const close = findMatchingClose(document, openEnd, "main");
  if (close < 0) throw new Error(`${file}: unclosed main`);
  return parseNodes(document.slice(openEnd, close));
}

function extractAfterMain(document, file) {
  const start = document.search(/<main\b/i);
  const openEnd = findTagEnd(document, start);
  const close = findMatchingClose(document, openEnd, "main");
  const end = findTagEnd(document, close);
  const footer = document.search(/<footer\b/i);
  if (footer < end) throw new Error(`${file}: footer does not follow main`);
  return parseNodes(document.slice(end, footer));
}

function extractHead(document, file) {
  const head = document.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
  if (!head) throw new Error(`${file}: no head`);
  const title = decodeHtml(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const alternates = [...head.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/gi)].map(([tag]) => ({
    hrefLang: decodeHtml(tagAttribute(tag, "hreflang") || ""),
    href: decodeHtml(tagAttribute(tag, "href") || ""),
  }));
  const jsonLdBody = head.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const executable = [...head.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim()).filter(Boolean);
  return {
    title,
    description: attr(head, /<meta\b[^>]*name="description"[^>]*>/i),
    keywords: attr(head, /<meta\b[^>]*name="keywords"[^>]*>/i),
    canonical: attr(head, /<link\b[^>]*rel="canonical"[^>]*>/i, "href"),
    alternates,
    robots: attr(head, /<meta\b[^>]*name="robots"[^>]*>/i) || "index, follow",
    og: {
      siteName: attr(head, /<meta\b[^>]*property="og:site_name"[^>]*>/i),
      locale: attr(head, /<meta\b[^>]*property="og:locale"[^>]*>/i),
      title: attr(head, /<meta\b[^>]*property="og:title"[^>]*>/i),
      description: attr(head, /<meta\b[^>]*property="og:description"[^>]*>/i),
      type: attr(head, /<meta\b[^>]*property="og:type"[^>]*>/i),
      url: attr(head, /<meta\b[^>]*property="og:url"[^>]*>/i),
      image: attr(head, /<meta\b[^>]*property="og:image"[^>]*>/i),
      imageWidth: attr(head, /<meta\b[^>]*property="og:image:width"[^>]*>/i),
      imageHeight: attr(head, /<meta\b[^>]*property="og:image:height"[^>]*>/i),
      imageAlt: attr(head, /<meta\b[^>]*property="og:image:alt"[^>]*>/i),
    },
    twitter: {
      card: attr(head, /<meta\b[^>]*name="twitter:card"[^>]*>/i),
      title: attr(head, /<meta\b[^>]*name="twitter:title"[^>]*>/i),
      description: attr(head, /<meta\b[^>]*name="twitter:description"[^>]*>/i),
      image: attr(head, /<meta\b[^>]*name="twitter:image"[^>]*>/i),
      imageAlt: attr(head, /<meta\b[^>]*name="twitter:image:alt"[^>]*>/i),
    },
    themeBootstrap: executable[0] || '(function(){try{var t=localStorage.getItem("kaanbalci-site-theme")||"dark";document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();',
    jsonLd: jsonLdBody ? JSON.parse(jsonLdBody) : null,
    extraStyles: ["/case-study.css"],
  };
}

const contract = { schemaVersion: 1, acceptedRef: ACCEPTED_REF, locales, pages: {} };
for (const [id, definition] of Object.entries(CASES)) {
  const page = { route: definition.route, source: definition.source, scripts: definition.scripts || [], locales: {} };
  for (const locale of locales) {
    const file = locale === registry.defaultLocale ? definition.source : `${locale}/${definition.source}`;
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const body = source.match(/<body([^>]*)>/i)?.[1] || "";
    page.locales[locale] = {
      bodyClass: decodeHtml(body.match(/\bclass="([^"]*)"/i)?.[1] || "case-study-page"),
      head: extractHead(source, file),
      children: extractMain(source, file),
      afterMain: extractAfterMain(source, file),
    };
  }
  contract.pages[id] = page;
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
console.log(`Case-study React contract: ${Object.keys(CASES).length} pages × ${locales.length} locales = ${Object.keys(CASES).length * locales.length} documents`);
