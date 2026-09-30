import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { explicitSemanticPageMap } from "./i18n-messages.mjs";
import { findMatchingClose, findTagEnd, parseTag } from "./localized-html.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";

const buildLog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/build-log.json"), "utf8"));
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function buildLogMarkup(locale, localization, limit) {
  const labels = { shipped: "Shipped", building: "Building", integration: "Integration" };
  return buildLog.slice(0, limit).map((entry) => {
    const copy = localizedBuildLogEntry({ entry, overlay: localization.packs.content, locale });
    return `<article class="build-log-item"><time datetime="${esc(entry.date)}">${esc(entry.date)}</time><div><div class="build-log-meta"><span>${esc(entry.area)}</span><span class="build-log-status is-${esc(entry.status)}">${esc(labels[entry.status] || entry.status)}</span></div><h3>${esc(copy.title)}</h3><p>${esc(copy.detail)}</p></div></article>`;
  }).join("");
}

function staticBuildLog(html, locale, localization) {
  return html.replace(
    /(<div\b[^>]*data-build-log\b[^>]*data-build-log-limit="(\d+)"[^>]*>)[\s\S]*?(<\/div>)/i,
    (_, open, limit, close) => `${open}${buildLogMarkup(locale, localization, Number(limit))}${close}`,
  );
}

function attributesFor(rawTag) {
  return Object.fromEntries(parseTag(rawTag).attributes.map(({ name, value }) => [name.toLowerCase(), value ?? true]));
}

export function productionMainProps(route) {
  if (!new Set(["home", "about"]).has(route.routeId)) throw new Error(`no Home/About production component for ${route.routeId}`);
  const sourceFile = route.routeId === "home" ? "index.html" : "about/index.html";
  const localization = loadProductionLocalization(route.locale);
  const html = staticBuildLog(fs.readFileSync(path.join(ROOT, route.output), "utf8"), route.locale, localization);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) throw new Error(`${route.output} has no production main`);

  // Resolve every promoted binding explicitly. This makes missing locale copy a
  // build failure instead of letting the already-localized template mask it.
  for (const kind of ["text", "attribute"]) {
    const values = explicitSemanticPageMap(sourceFile, route.locale, kind);
    for (const value of values.values()) {
      if (!html.includes(esc(value)) && !html.includes(value)) {
        throw new Error(`${route.output}: promoted ${kind} copy is absent from accepted production markup: ${value}`);
      }
    }
  }

  const content = main[1];
  const blocks = [];
  let index = 0;
  while (index < content.length) {
    const start = content.indexOf("<", index);
    if (start < 0) break;
    if (content.slice(index, start).trim()) throw new Error(`${route.output}: unexpected main text outside a production section`);
    const tagEnd = findTagEnd(content, start);
    const rawTag = content.slice(start, tagEnd);
    const parsed = parseTag(rawTag);
    if (parsed.name.toLowerCase() !== "section") throw new Error(`${route.output}: main child ${parsed.name || rawTag} is not a production section`);
    const close = findMatchingClose(content, tagEnd, parsed.name);
    if (close < 0) throw new Error(`${route.output}: unclosed production section`);
    blocks.push({ tag: parsed.name.toLowerCase(), attributes: attributesFor(rawTag), innerHtml: content.slice(tagEnd, close) });
    index = findTagEnd(content, close);
  }
  if (content.slice(index).trim()) throw new Error(`${route.output}: unexpected trailing main markup`);
  return { blocks };
}

export function injectProductionMain({ document, markup, props, clientEntry }) {
  const main = document.match(/<main\b([^>]*)>[\s\S]*?<\/main>/i);
  if (!main) throw new Error("production document has no main to replace");
  const attributes = main[1].replace(/\sdata-react-main(?:="[^"]*")?/i, "").replace(/\sdata-prerendered(?:="[^"]*")?/i, "");
  const payload = JSON.stringify(props).replaceAll("<", "\\u003c");
  return document
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/i, `<main${attributes} data-react-main data-prerendered="true">${markup}</main>`)
    .replace("</body>", `<script id="react-main-props" type="application/json">${payload}</script><script type="module" src="/${clientEntry}"></script></body>`);
}
