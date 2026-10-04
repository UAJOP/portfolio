#!/usr/bin/env node
/**
 * Capture the accepted Now, Experience (blog), Certificates, Request and
 * Privacy documents as the React page contract for Master 3 #30.5. React
 * renders this markup; the two retained page controllers
 * (js/features/certificates.js and js/request/submission.js + form.js) are
 * still loaded by script.js for their page type and bind to it unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadSiteRoutes, sourceDocumentFor } from "./site-routes.mjs";
import { extractAfterMain, extractHead, extractMain, tagAttribute } from "./m3-accepted-document-contract.mjs";
import { withImageLoading } from "./generate-m3-labs-games-structure.mjs";

const ACCEPTED_REF = "726fcde72939828ad441a7b625ef79feb1dbe662";
const OUTPUT = path.join(ROOT, "data/site/m3-30-5-remaining-routes-structure.json");
/* Route identity comes from data/site/routes.json; this only names the pages
 * this phase captures. */
export const REMAINING_ROUTE_IDS = Object.freeze(["now", "blog", "certificates", "request", "privacy"]);
const SHELL_SCRIPTS = new Set(["/portfolio-data.js", "/script.js", "/portfolio-v2.js"]);
const SHELL_STYLES = ["/style.css", "/css/a11y.css", "/portfolio-v2.css"];
const FORM_CONTROLS = new Set(["input", "select", "textarea"]);
/* React spells these attributes differently. A form value is captured as a
 * default: the visitor and the request controller, not React, own the live
 * control state. */
const REACT_NAMES = { for: "htmlFor", autocomplete: "autoComplete" };

function adaptElement(node) {
  for (const attribute of node.attributes) {
    if (FORM_CONTROLS.has(node.tag) && attribute.name === "value") attribute.name = "defaultValue";
    else if (FORM_CONTROLS.has(node.tag) && attribute.name === "checked") attribute.name = "defaultChecked";
    else if (REACT_NAMES[attribute.name]) attribute.name = REACT_NAMES[attribute.name];
    else if (/^on[a-z]+$/.test(attribute.name)) throw new Error(`unsupported inline handler ${attribute.name}`);
  }
}

function documentAssets(source, file) {
  const head = source.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || "";
  const styles = [...head.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag)
    .filter((tag) => tagAttribute(tag, "rel") === "stylesheet").map((tag) => tagAttribute(tag, "href"))
    .filter((href) => href.startsWith("/"));
  if (JSON.stringify(styles) !== JSON.stringify(SHELL_STYLES)) throw new Error(`${file}: page stylesheets are not exactly the shared shell stylesheets`);
  const afterFooter = source.slice(source.search(/<\/footer>/i));
  const scripts = [...afterFooter.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map((match) => match[1]);
  const loader = scripts.indexOf("/script.js");
  if (loader < 0) throw new Error(`${file}: missing runtime loader`);
  /* A script the accepted document runs before the runtime loader (the request
   * endpoint configuration) keeps that position; nothing follows the shell. */
  const leadScripts = scripts.slice(0, loader).filter((src) => !SHELL_SCRIPTS.has(src));
  const trailing = scripts.slice(loader + 1).filter((src) => !SHELL_SCRIPTS.has(src));
  if (trailing.length) throw new Error(`${file}: unexpected page script after the runtime loader: ${trailing.join(", ")}`);
  return { leadScripts };
}

export function generateRemainingRoutesStructure() {
  const registry = loadRegistry();
  const site = loadSiteRoutes();
  const locales = [registry.defaultLocale, ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale)];
  const contract = { schemaVersion: 1, acceptedRef: ACCEPTED_REF, locales, pages: {} };
  for (const id of REMAINING_ROUTE_IDS) {
    const route = site.pages.find((page) => page.id === id);
    if (!route) throw new Error(`${id}: not a canonical page route`);
    const document = sourceDocumentFor(route.route);
    const page = { route: route.route, source: document, locales: {} };
    for (const locale of locales) {
      const file = locale === registry.defaultLocale ? document : `${locale}/${document}`;
      const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
      const assets = documentAssets(source, file);
      if (extractAfterMain(source, file).some((node) => node.type === "element")) throw new Error(`${file}: unexpected markup between main and footer`);
      const body = source.match(/<body\b[^>]*>/i)?.[0] || "<body>";
      const pageType = tagAttribute(body, "data-page");
      if (!pageType) throw new Error(`${file}: body declares no page type`);
      if (tagAttribute(body, "class")) throw new Error(`${file}: unexpected body class`);
      if (locale === registry.defaultLocale) Object.assign(page, { pageType, leadScripts: assets.leadScripts });
      else if (page.pageType !== pageType || JSON.stringify(page.leadScripts) !== JSON.stringify(assets.leadScripts)) {
        throw new Error(`${file}: runtime assets differ from the default-locale document`);
      }
      page.locales[locale] = {
        head: extractHead(source, file, []),
        children: withImageLoading(extractMain(source, file, adaptElement)),
      };
    }
    contract.pages[id] = page;
  }
  return contract;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const contract = generateRemainingRoutesStructure();
  const serialized = `${JSON.stringify(contract, null, 2)}\n`;
  const check = process.argv.includes("--check");
  if (check) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== serialized) {
      console.error("Remaining-routes React contract is stale. Run npm run m3:remaining-routes:structure.");
      process.exit(1);
    }
  } else fs.writeFileSync(OUTPUT, serialized, "utf8");
  const pages = Object.keys(contract.pages).length;
  console.log(`Remaining-routes React contract: ${pages} pages × ${contract.locales.length} locales = ${pages * contract.locales.length} documents${check ? " · up to date" : ""}`);
}
