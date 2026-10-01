import crypto from "node:crypto";
import { decodeHtml } from "./localized-html.mjs";

export const region = (html, name) => html.match(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}>`, "i"))?.[0] || "";
export const head = (html) => region(html, "head");
export const visibleText = (html) => decodeHtml(String(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style>/gi, "")
  .replace(/<!--.*?-->/gs, "")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();
export const tagSequence = (html) => [...String(html).matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)]
  .map((match) => `${match[0][1] === "/" ? "/" : ""}${match[1].toLowerCase()}`);
export const attributes = (html) => [...String(html).matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => {
  const keep = [...match[2].matchAll(/\b(id|class|href|src|alt|role|datetime|type|name|content|property|rel|hreflang|aria-[\w-]+|data-(?:message|pv2)[\w-]*)=(?:"([^"]*)"|'([^']*)')/gi)]
    .map((attribute) => `${attribute[1].toLowerCase()}=${decodeHtml(attribute[2] ?? attribute[3])}`)
    .sort();
  return `${match[1].toLowerCase()}[${keep.join("|")}]`;
});
export const contract = (html) => ({ text: visibleText(html), tags: tagSequence(html), attributes: attributes(html) });
export const hashValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const tagAttributes = (source) => Object.fromEntries([...String(source).matchAll(/([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
  .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")])
  .sort(([left], [right]) => left.localeCompare(right)));

const stableObjects = (values) => values.slice().sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

/** Complete semantic head contract. Executable scripts are intentionally not
 * visible text, but they remain strict ordered resources with content hashes.
 * JSON-LD is parsed and retained as a complete object so missing, duplicate,
 * malformed or semantically changed structured data cannot disappear in a
 * generic script-content scrub. */
export function headContract(html) {
  const source = head(html);
  const title = decodeHtml(source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const meta = stableObjects([...source.matchAll(/<meta\b([^>]*)>/gi)].map((match) => tagAttributes(match[1])));
  const links = [...source.matchAll(/<link\b([^>]*)>/gi)].map((match) => tagAttributes(match[1]));
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match) => ({
    attributes: tagAttributes(match[1]),
    content: match[2],
  }));
  const jsonLd = scripts.filter((script) => script.attributes.type?.toLowerCase() === "application/ld+json").map((script, index) => {
    try {
      return JSON.parse(script.content);
    } catch (error) {
      throw new Error(`head JSON-LD script ${index + 1} is not valid JSON: ${error.message}`);
    }
  });
  const inlineExecutable = scripts
    .filter((script) => !script.attributes.src && script.attributes.type?.toLowerCase() !== "application/ld+json")
    .map((script) => ({ attributes: script.attributes, sha256: hashValue(script.content) }));
  const metadataLinks = links.filter((link) => ["canonical", "alternate"].includes(link.rel?.toLowerCase()));
  const resourceLinks = (rel) => links.filter((link) => link.rel?.toLowerCase() === rel);
  const firstStylesheet = source.search(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i);
  const firstExecutable = source.search(/<script\b(?![^>]*\bsrc=)(?![^>]*\btype=["']application\/ld\+json["'])[^>]*>/i);
  const localeBootstrap = source.search(/<script\b[^>]*\bsrc=["']\/js\/core\/locale-bootstrap\.js["'][^>]*>/i);
  const resources = {
    stylesheets: resourceLinks("stylesheet"),
    preconnects: stableObjects(resourceLinks("preconnect")),
    icons: stableObjects(resourceLinks("icon")),
    scriptOrder: scripts.map((script) => ({
      attributes: script.attributes,
      content: script.attributes.type?.toLowerCase() === "application/ld+json"
        ? hashValue(JSON.parse(script.content))
        : script.attributes.src ? null : hashValue(script.content),
    })),
    blockingInitialization: {
      themeBeforeStyles: firstExecutable >= 0 && firstStylesheet >= 0 && firstExecutable < firstStylesheet,
      localeBeforeStyles: localeBootstrap >= 0 && firstStylesheet >= 0 && localeBootstrap < firstStylesheet,
    },
  };
  return {
    metadata: hashValue({ title, meta, links: metadataLinks }),
    resources: hashValue(resources),
    jsonLd,
    inlineExecutable,
  };
}

export function documentContract(html) {
  return {
    head: headContract(html),
    header: hashValue(contract(region(html, "header"))),
    main: hashValue(contract(region(html, "main"))),
    footer: hashValue(contract(region(html, "footer"))),
  };
}
