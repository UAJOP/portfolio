#!/usr/bin/env node
/**
 * Capture the accepted, route-localized case-study document contract as data
 * for the shared React renderer. The five case studies intentionally keep
 * their own section structure; only the rendering primitive is shared.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { extractAfterMain, extractHead, extractMain } from "./m3-accepted-document-contract.mjs";

const ACCEPTED_REF = "6650aacd844cde957888d296f086c1eb21992991";
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
