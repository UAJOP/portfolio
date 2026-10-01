#!/usr/bin/env node
/** One-time/idempotent #25-B promotion of accepted Home/About copy.
 * Values are copied from the reviewed locale packs; this script never
 * translates or rewrites prose. The resulting manifest stores keys only. */
import fs from "node:fs";
import path from "node:path";
import { ROOT, compareKeys, documentAttributeStrings, documentTextStrings } from "./i18n-catalog.mjs";

const locales = ["en", "tr", "de", "es", "fr"];
const sources = ["index.html", "about/index.html"];
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const writeJson = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const promoted = {
  "Skip to content": "shell.skipToContent",
  "Available for roles": "shell.availabilityAria",
  "Home": "shell.nav.home",
  "Works": "shell.nav.works",
  "Games": "shell.nav.games",
  "Certificates": "shell.nav.certificates",
  "Request": "shell.nav.request",
  "Recruiter Mode": "shell.recruiter.label",
  "Search": "shell.command.label",
  "AI Chatbot Flow Design": "home.selectedWork.chatbot.title",
  "What I do": "home.services.eyebrow",
  "Discover, scope, prototype, integrate, evaluate, ship.": "home.services.title",
  "Understand the user, the business process, the rules, the constraints, the integration boundaries and what \"working\" has to mean — before any code is written.": "home.services.discover.body",
  "Turn the scoped requirement into a working AI or software prototype, then connect it to the real APIs, data and workflows it has to live inside.": "home.services.prototype.body",
  "QA, LLM and agent evaluation, regression evidence, failure handling and the reliability work that turns a convincing demo into something safe to deploy.": "home.services.evaluate.body",
  "Deliver a usable system with Python/FastAPI, TypeScript and SQL, watch how it behaves in real use, and improve the behavior from what the feedback shows.": "home.services.ship.body",
  "Customer-facing technical delivery, in three different settings.": "home.timeline.title",
  "Enterprise conversational AI at CBOT, evaluation-driven quality judgment on LLM outputs at Outlier AI, and end-to-end ownership of a live customer product at Atölye Joyday.": "home.timeline.lead",
  "See Experience": "home.timeline.cta",
  "2026 – Present": "home.timeline.currentPeriod",
  "The delivery breadth behind the primary evidence.": "home.supporting.title",
  "My role: Game Developer & Product Designer": "home.supporting.mergeRush.role",
  "Product-engineering breadth in TypeScript: stateful systems, timed workflows, progressive unlocks, automated tests and iterative delivery.": "home.supporting.mergeRush.body",
  "View Case Study": "home.supporting.caseStudy",
  "My role: Software Developer": "home.supporting.hospital.role",
  "The workflow, data and software foundation underneath the rest: multi-role logic and appointment coordination over a SQL-backed system.": "home.supporting.hospital.body",
  "Latest build": "home.latestBuild.eyebrow",
  "A portfolio that shows what is being built now.": "home.latestBuild.title",
  "Hiring a Forward Deployed Engineer?": "home.contact.title",
  "Review the evidence by capability focus — customer discovery and scoping, AI deployment and reliability, or full-stack delivery — or open the full project catalog.": "home.contact.lead",
  "Evidence by Capability": "shared.evidenceByCapability",
  "Request a Project": "home.contact.requestProject",
  "Email": "shared.email",
  "Forward Deployed Engineer turning customer workflows into reliable AI systems and shipped software.": "shell.footer.tagline",
  "Kaan Balcı. All rights reserved.": "shell.footer.rights",
  "Privacy": "shell.footer.privacy",
  "AI Designer & Software Developer": "about.profile.role",
  "Istanbul / Turkey": "about.profile.location",
  "View Resume": "about.profile.resume",
  "Capability map": "about.capability.eyebrow",
  "Where I can contribute today.": "about.capability.title",
  "Milestone journey": "about.journey.eyebrow",
  "Software foundations": "about.journey.software.title",
  "How I work": "about.process.eyebrow",
  "Toolbox": "about.toolbox.eyebrow",
  "Languages": "about.toolbox.languages.label",
  "AI & Automation": "about.toolbox.aiAutomation.label",
  "Choose the evidence focus": "about.contact.eyebrow",
  "Review Forward Deployed Engineer evidence by capability focus.": "about.contact.title",
  "Discovery & Scoping": "about.contact.discovery",
  "AI Deployment": "about.contact.aiDeployment",
  "Full-Stack Delivery": "about.contact.fullStack",
  "Product Systems": "about.contact.productSystems",
};

const common = Object.fromEntries(locales.map((locale) => [locale, readJson(`data/i18n/messages/${locale}/common.json`)]));
const pagePacks = Object.fromEntries(locales.slice(1).map((locale) => [locale, readJson(`data/i18n/packs/${locale}/pages.json`)]));
const reverse = new Map();
for (const [key, value] of Object.entries(common.en)) {
  if (!reverse.has(value)) reverse.set(value, []);
  reverse.get(value).push(key);
}

for (const [source, key] of Object.entries(promoted)) {
  common.en[key] = source;
  for (const locale of locales.slice(1)) {
    const domain = source === "Available for roles" ? "attribute" : "text";
    const value = pagePacks[locale][domain][source];
    if (typeof value !== "string" || !value) throw new Error(`${locale} has no accepted translation for ${source}`);
    common[locale][key] = value;
  }
  reverse.set(source, [key]);
}

const preferredAmbiguous = {
  "Selected work": "home.selectedWork.eyebrow",
  "Engineering evidence for forward-deployed work.": "home.selectedWork.title",
};
const manifest = { schemaVersion: 1, promotedKeys: Object.values(promoted).sort(compareKeys), sources: {} };
for (const source of sources) {
  const buildMap = (values, kind) => Object.fromEntries([...new Set(values)].flatMap((value) => {
    if (kind === "attribute" && value === "Recruiter Mode") return [];
    const keys = reverse.get(value) || [];
    const key = preferredAmbiguous[value] || (keys.length === 1 ? keys[0] : null);
    return key ? [[value, key]] : [];
  }).sort(([a], [b]) => compareKeys(a, b)));
  manifest.sources[source] = {
    text: buildMap(documentTextStrings(source), "text"),
    attribute: buildMap(documentAttributeStrings(source), "attribute"),
  };
}

for (const locale of locales) {
  writeJson(`data/i18n/messages/${locale}/common.json`, Object.fromEntries(Object.entries(common[locale]).sort(([a], [b]) => compareKeys(a, b))));
}
writeJson("data/i18n/home-about-semantic-keys.json", manifest);

const buildLog = readJson("data/portfolio/build-log.json");
for (const locale of locales.slice(1)) {
  const file = `data/i18n/packs/${locale}/content.json`;
  const content = readJson(file);
  for (const [index, entry] of buildLog.entries()) {
    for (const field of ["title", "detail"]) {
      const oldKey = `buildLog.[${index}].${field}`;
      const newKey = `buildLogById.${entry.id}.${field}`;
      if (content[oldKey] !== undefined) content[newKey] = content[oldKey];
      delete content[oldKey];
    }
  }
  writeJson(file, Object.fromEntries(Object.entries(content).sort(([a], [b]) => compareKeys(a, b))));
}

console.log(`Promoted ${Object.keys(promoted).length} accepted strings; manifest covers ${Object.values(manifest.sources).reduce((sum, item) => sum + Object.keys(item.text).length + Object.keys(item.attribute).length, 0)} source bindings; build-log overlays use stable ids.`);
