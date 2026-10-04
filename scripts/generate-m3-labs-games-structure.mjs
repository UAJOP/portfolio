#!/usr/bin/env node
/**
 * Capture the accepted Labs and mini-game documents as the React shell
 * contract for Master 3 #30. React renders this markup; the retained vanilla
 * engines (js/pages/labs.js, adventure-game.js, joyday-paint.js,
 * ai-flow-puzzle.js) keep every game mechanic and mount onto it after
 * hydration through js/pages/engine-host.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadSiteRoutes, sourceDocumentFor } from "./site-routes.mjs";
import { extractAfterMain, extractHead, extractMain, tagAttribute } from "./m3-accepted-document-contract.mjs";

const ACCEPTED_REF = "760feca095a80393a79562435c685afee13d096d";
const OUTPUT = path.join(ROOT, "data/site/m3-30-labs-games-structure.json");
/* Route identity comes from data/site/routes.json; this only names which
 * retained engine each page hosts. */
export const LABS_GAMES_ENGINES = Object.freeze({ labs: "labs", adventure: "adventure", joydayPaint: "joydayPaint", aiFlowPuzzle: "aiFlowPuzzle" });
const SHELL_SCRIPTS = new Set(["/portfolio-data.js", "/script.js", "/portfolio-v2.js"]);
const SHELL_STYLES = new Set(["/style.css", "/css/a11y.css", "/portfolio-v2.css"]);
const FORM_CONTROLS = new Set(["input", "select", "textarea"]);
/* React spells these attributes differently. Form values are captured as
 * defaults: the engines, not React, own the live control state. */
const REACT_NAMES = { maxlength: "maxLength", for: "htmlFor", readonly: "readOnly", autocomplete: "autoComplete" };
const INLINE_ACTIONS = { "openDrivePreviews()": "openResume" };
/* The legacy i18n runtime marks an uppercase-styled element that holds a
 * protected term so locale-aware casing cannot corrupt it; it stands down
 * below [data-react-main], so the marker is captured here. Casing depends on
 * computed style: on these pages it is the section eyebrow, and
 * qa:m3:labs-games holds the result to what the accepted runtime marks. */
const PROTECTED_TERMS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/i18n/glossary.json"), "utf8")).protectedTerms;

const textOf = (node) => (node.type === "text" ? node.value : node.type === "element" ? node.children.map(textOf).join("") : "");
const classesOf = (node) => String(node.attributes.find(({ name }) => name === "class")?.value || "").split(/\s+/);
const isEyebrow = (node) => node.tag === "p" && classesOf(node).includes("eyebrow");
function firstEyebrow(nodes) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (isEyebrow(node)) return textOf(node).trim();
    const nested = firstEyebrow(node.children);
    if (nested) return nested;
  }
  return "";
}

function adaptElement(node) {
  for (const attribute of node.attributes) {
    if (FORM_CONTROLS.has(node.tag) && attribute.name === "value") attribute.name = "defaultValue";
    else if (FORM_CONTROLS.has(node.tag) && attribute.name === "checked") attribute.name = "defaultChecked";
    else if (REACT_NAMES[attribute.name]) attribute.name = REACT_NAMES[attribute.name];
    else if (attribute.name === "onclick") {
      const action = INLINE_ACTIONS[attribute.value];
      if (!action) throw new Error(`unsupported inline handler ${attribute.value}`);
      attribute.name = "data-react-action";
      attribute.value = action;
    } else if (/^on[a-z]+$/.test(attribute.name)) throw new Error(`unsupported inline handler ${attribute.name}`);
  }
  if (isEyebrow(node) && node.children.every((child) => child.type === "text") && PROTECTED_TERMS.some((term) => textOf(node).includes(term))) {
    node.attributes.push({ name: "data-preserve-case", value: true });
  }
  /* The React document also carries the Recruiter and Ajoop complementary
   * landmarks, so each page aside needs its own name. It is the accepted,
   * already-localized section eyebrow; a heading an engine rewrites at
   * runtime (the Joyday creative prompt) would become a stale label. */
  if (node.tag === "aside" && !node.attributes.some(({ name }) => ["aria-label", "aria-labelledby"].includes(name))) {
    const label = firstEyebrow(node.children);
    if (!label) throw new Error("aside: unnamed landmark has no eyebrow");
    node.attributes.push({ name: "aria-label", value: label });
  }
}

/* The accepted image-loading contract. js/features/creative.js applied it at
 * runtime and stands down below [data-react-main], so the prerender carries
 * it, as the earlier React phases do. */
function withImageLoading(nodes, inHero = false) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    const has = (name) => node.attributes.some((attribute) => attribute.name === name);
    if (node.tag === "img") {
      if (!has("decoding")) node.attributes.push({ name: "decoding", value: "async" });
      if (!has("loading") && !inHero && node.attributes.find(({ name }) => name === "fetchpriority")?.value !== "high") node.attributes.push({ name: "loading", value: "lazy" });
      if (!has("fetchpriority") && inHero) node.attributes.push({ name: "fetchpriority", value: "high" });
    }
    withImageLoading(node.children, inHero || classesOf(node).includes("hero"));
  }
  return nodes;
}

function documentAssets(source, file) {
  const head = source.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || "";
  const styles = [...head.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag)
    .filter((tag) => tagAttribute(tag, "rel") === "stylesheet").map((tag) => tagAttribute(tag, "href"))
    .filter((href) => href.startsWith("/"));
  for (const required of SHELL_STYLES) if (!styles.includes(required)) throw new Error(`${file}: missing shell stylesheet ${required}`);
  if (styles[0] !== "/style.css" || styles[1] !== "/css/a11y.css" || styles[styles.length - 1] !== "/portfolio-v2.css") {
    throw new Error(`${file}: page stylesheets are not between a11y.css and portfolio-v2.css`);
  }
  const afterFooter = source.slice(source.search(/<\/footer>/i));
  const scripts = [...afterFooter.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map((match) => match[1]);
  if (!scripts.includes("/script.js")) throw new Error(`${file}: missing runtime loader`);
  return { extraStyles: styles.filter((href) => !SHELL_STYLES.has(href)), scripts: scripts.filter((src) => !SHELL_SCRIPTS.has(src)) };
}

export function generateLabsGamesStructure() {
  const registry = loadRegistry();
  const site = loadSiteRoutes();
  const locales = [registry.defaultLocale, ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale)];
  const contract = { schemaVersion: 1, acceptedRef: ACCEPTED_REF, locales, pages: {} };
  for (const [id, engine] of Object.entries(LABS_GAMES_ENGINES)) {
    const route = site.pages.find((page) => page.id === id);
    if (!route) throw new Error(`${id}: not a canonical page route`);
    const document = sourceDocumentFor(route.route);
    const page = { route: route.route, source: document, engine, locales: {} };
    for (const locale of locales) {
      const file = locale === registry.defaultLocale ? document : `${locale}/${document}`;
      const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
      const assets = documentAssets(source, file);
      if (extractAfterMain(source, file).some((node) => node.type === "element")) throw new Error(`${file}: unexpected markup between main and footer`);
      const pageType = tagAttribute(source.match(/<body\b[^>]*>/i)?.[0] || "<body>", "data-page");
      if (!pageType) throw new Error(`${file}: body declares no page type`);
      if (locale === registry.defaultLocale) Object.assign(page, { pageType, scripts: assets.scripts, extraStyles: assets.extraStyles });
      else if (page.pageType !== pageType || JSON.stringify([page.scripts, page.extraStyles]) !== JSON.stringify([assets.scripts, assets.extraStyles])) {
        throw new Error(`${file}: runtime assets differ from the default-locale document`);
      }
      page.locales[locale] = {
        head: extractHead(source, file, assets.extraStyles),
        children: withImageLoading(extractMain(source, file, adaptElement)),
      };
    }
    contract.pages[id] = page;
  }
  return contract;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const contract = generateLabsGamesStructure();
  const serialized = `${JSON.stringify(contract, null, 2)}\n`;
  const check = process.argv.includes("--check");
  if (check) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== serialized) {
      console.error("Labs/mini-game React contract is stale. Run npm run m3:labs-games:structure.");
      process.exit(1);
    }
  } else fs.writeFileSync(OUTPUT, serialized, "utf8");
  const pages = Object.keys(contract.pages).length;
  console.log(`Labs/mini-game React contract: ${pages} pages × ${contract.locales.length} locales = ${pages * contract.locales.length} documents${check ? " · up to date" : ""}`);
}
