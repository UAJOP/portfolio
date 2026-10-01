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
export const hashValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const tagAttributes = (source) => Object.fromEntries([...String(source).matchAll(/([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
  .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")])
  .sort(([left], [right]) => left.localeCompare(right)));

const routeFiles = ["index.html", "about/index.html", ...["tr", "de", "es", "fr"].flatMap((locale) => [`${locale}/index.html`, `${locale}/about/index.html`])];
const exactExceptions = routeFiles.flatMap((route) => [
  ...(!route.includes("/") || route.startsWith("about/") ? [{
    route, region: "document-html", element: { tag: "html" }, attribute: "dir",
    accepted: null, current: "ltr", reason: "React document makes the default English writing direction explicit",
  }] : []),
  {
    route, region: "main", element: { tag: "main", id: "main-content" }, attribute: "data-react-main",
    accepted: null, current: "", reason: "React ownership marker added by the #25-B cutover",
  },
  {
    route, region: "main", element: { tag: "main", id: "main-content" }, attribute: "data-prerendered",
    accepted: null, current: "true", reason: "SSR hydration marker added by the #25-B cutover",
  },
  {
    route, region: "header", element: { tag: "a", className: "selected" }, attribute: "aria-current",
    accepted: null, current: "page", reason: "Phase 0 accessibility improvement for the exact selected route",
  },
  ...(route.includes("about/") ? [{
    route, region: "main", element: { tag: "button", className: "btn primary" }, attribute: "onclick",
    accepted: "openDrivePreviews()", current: null, reason: "accepted inline resume action is owned by the equivalent React handler after hydration",
  }] : []),
]);

/** Every migration delta is route, region, element and attribute specific.
 * accepted records the value at 34fdfad; null means the attribute was absent.
 * Normalization fails unless both historical and current values match exactly. */
export const HOME_ABOUT_ATTRIBUTE_EXCEPTIONS = Object.freeze(exactExceptions);

const matchesElement = (record, element) => {
  if (record.tag !== element.tag) return false;
  if (element.id && record.attributes.id !== element.id) return false;
  if (element.className) {
    const classes = new Set((record.attributes.class || "").split(/\s+/).filter(Boolean));
    if (!element.className.split(/\s+/).every((name) => classes.has(name))) return false;
  }
  return true;
};

function normalizeExceptions(records, { route, region, source }) {
  if (!route || !region || !source) throw new Error("complete attribute comparison requires route, region and source");
  const exceptions = HOME_ABOUT_ATTRIBUTE_EXCEPTIONS.filter((item) => item.route === route && item.region === region);
  for (const exception of exceptions) {
    const matches = records.filter((record) => matchesElement(record, exception.element));
    if (matches.length !== 1) throw new Error(`${route}: ${region} exception must match exactly one ${exception.element.tag}`);
    const record = matches[0];
    const actual = Object.hasOwn(record.attributes, exception.attribute) ? record.attributes[exception.attribute] : null;
    const expected = exception[source];
    if (actual !== expected) {
      throw new Error(`${route}: ${region} ${exception.attribute} exception expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
    delete record.attributes[exception.attribute];
  }
  return records;
}

export function attributes(html, context) {
  const records = [...String(html).matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => ({
    tag: match[1].toLowerCase(),
    attributes: tagAttributes(match[2]),
  }));
  return normalizeExceptions(records, context);
}

export const contract = (html, context) => ({
  text: visibleText(html),
  tags: tagSequence(html),
  attributes: attributes(html, context),
});

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

export function documentContract(html, { route, source }) {
  const opening = (tag) => String(html).match(new RegExp(`<${tag}\\b[^>]*>`, "i"))?.[0] || "";
  return {
    head: headContract(html),
    document: hashValue({
      html: attributes(opening("html"), { route, region: "document-html", source }),
      body: attributes(opening("body"), { route, region: "document-body", source }),
    }),
    header: hashValue(contract(region(html, "header"), { route, region: "header", source })),
    main: hashValue(contract(region(html, "main"), { route, region: "main", source })),
    footer: hashValue(contract(region(html, "footer"), { route, region: "footer", source })),
  };
}
