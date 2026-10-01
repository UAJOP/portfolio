#!/usr/bin/env node
/** Idempotent #26 promotion of accepted Works/Games copy into the canonical
 * common message domain (data/i18n/messages/{locale}/common.json).
 *
 * Every accepted string resolves through exactly one stable semantic key:
 * - declared: the accepted element already names a canonical key
 *   (data-message-key / data-message-alt-key) whose five values match;
 * - reused: an existing canonical key for the same page fact or shared copy;
 * - promoted: a new works.* / games.* key whose values are copied verbatim
 *   from the five accepted 24be2f8 documents (never translated here).
 * Coincidental matches with Home, About or Labs copy are deliberately not
 * reused so those pages cannot change Works/Games copy implicitly.
 * The resulting manifest stores keys only. */
import fs from "node:fs";
import path from "node:path";
import { ROOT, compareKeys } from "./i18n-catalog.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, normalizeText, parseTag } from "./localized-html.mjs";
import {
  LOCALIZED_ATTRIBUTES,
  VOID,
  WORKS_GAMES_ACCEPTED_REF,
  WORKS_GAMES_LOCALES,
  WORKS_GAMES_PAGES,
  acceptedPageCopy,
  mainSource,
} from "./m3-works-games-accepted-copy.mjs";

const MANIFEST = "data/i18n/works-games-semantic-keys.json";
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const writeJson = (file, value) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");

const REUSED = {
  "works/index.html": {
    text: {
      "n8n-inspired browser experience for intent, response, fallback and validation thinking.": "works.archive.aiFlow",
      "Patient, doctor and staff appointment workflows with MySQL-backed operations.": "works.archive.hospital",
      "Exploratory data analysis, visualization and a small price-estimation experiment.": "works.archive.cars",
      "First-person environmental puzzle prototype with object manipulation and physics interactions.": "works.archive.legacy.body",
      "Android content-sharing project using Kotlin and Firebase.": "works.archive.museum.body",
      "Kaan Labs": "shared.kaanLabs",
    },
    attribute: {
      "Merge Rush Tiny Factory portfolio cover": "mergeRush.cover.alt",
      "Legacy of the Lost preview": "works.archive.legacy.alt",
    },
  },
  "games/index.html": {
    text: {
      "Kaan Labs": "shared.kaanLabs",
      "Build n8n-inspired chatbot workflows by placing trigger, intent, response, fallback and automation nodes.": "games.aiFlow.body",
      "Create downloadable action-painting artwork with multiple canvas shapes and virtual tools.": "games.joydayPaint.body",
      "Combine learning, tools, AI workflow experience and portfolio proof until the Job Offer object appears.": "games.adventure.body",
    },
    attribute: {},
  },
};

const PROMOTED = {
  "works/index.html": {
    text: {
      "All": "works.filter.all",
      "AI & Automation": "works.filter.ai",
      "Software": "works.filter.software",
      "Web & Product": "works.filter.web",
      "Data": "works.filter.data",
      "Mobile": "works.filter.mobile",
      "Games & Interactive": "works.filter.game",
      "Applied AI / Reliability": "works.card.sinama.category",
      "Live MVP": "works.card.sinama.status",
      "My role: Product Designer & Full-Stack Developer": "works.card.sinama.role",
      "Enterprise AI Delivery": "works.card.chatbot.category",
      "AI Chatbot Flow Design": "works.card.chatbot.title",
      "My role: AI Designer": "works.card.chatbot.role",
      "Customer-Facing Delivery": "works.card.joyday.category",
      "Atölye Joyday Official Website": "works.card.joyday.title",
      "My role: Co-Founder & Digital Product Developer": "works.card.joyday.role",
      "Projects that explain the breadth behind the primary evidence.": "works.supporting.title",
      "My role: Game Developer & Product Designer": "works.card.mergeRush.role",
      "Hospital Form App": "works.card.hospital.title",
      "My role: Software Developer": "works.card.hospital.role",
      "AI Flow Puzzle": "works.card.aiFlow.title",
      "My role: AI Flow Designer & Frontend Developer": "works.card.aiFlow.role",
      "Hospital Appointment System": "works.card.hospitalAppointment.title",
      "My role: Python / Database Developer": "works.card.hospitalAppointment.role",
      "Cars Dataset Analysis": "works.card.cars.title",
      "My role: Python Developer": "works.card.cars.role",
      "Legacy of the Lost": "works.card.legacy.title",
      "My role: Game Developer": "works.card.legacy.role",
      "MyMuseum Mobile Content App": "works.card.museum.title",
      "My role: Android Developer": "works.card.museum.role",
      "Live": "works.status.live",
      "Source Archive": "works.status.sourceArchive",
      "View Case Study": "works.action.viewCaseStudy",
      "View Details": "works.action.viewDetails",
      "Case Study": "works.action.caseStudy",
      "Live Product": "works.action.liveProduct",
      "GitHub": "works.action.github",
      "Tutorial-scale and older learning repositories stay available without competing with flagship evidence.": "works.archiveCta.title",
      "The GitHub profile remains the full archive. Labs contains smaller interactive experiments; this page stays focused on portfolio-grade evidence.": "works.archiveCta.body",
      "FastAPI": "works.tag.fastapi",
      "PostgreSQL": "works.tag.postgresql",
      "Next.js": "works.tag.nextjs",
      "Chatbot QA": "works.tag.chatbotQa",
      "JavaScript": "works.tag.javascript",
      "Apps Script": "works.tag.appsScript",
      "Reservation Flow": "works.tag.reservationFlow",
      "Phaser 3": "works.tag.phaser3",
      "TypeScript": "works.tag.typescript",
      "Vitest": "works.tag.vitest",
      "Platform Adapter": "works.tag.platformAdapter",
      "C#/.NET": "works.tag.csharpDotnet",
      "Windows Forms": "works.tag.windowsForms",
      "SQL Server": "works.tag.sqlServer",
      "Node Logic": "works.tag.nodeLogic",
      "Python": "works.tag.python",
      "Tkinter": "works.tag.tkinter",
      "MySQL": "works.tag.mysql",
      "Pandas": "works.tag.pandas",
      "Linear Regression": "works.tag.linearRegression",
      "Unreal Engine 5": "works.tag.unrealEngine5",
      "Puzzle Design": "works.tag.puzzleDesign",
      "Interaction": "works.tag.interaction",
      "Kotlin": "works.tag.kotlin",
      "Firebase": "works.tag.firebase",
      "Android": "works.tag.android",
    },
    attribute: {
      "Project filters": "works.filter.aria",
      "SINAMA wordmark on a dark cover card": "works.card.sinama.alt",
      "Atölye Joyday website preview": "works.card.joyday.alt",
      "Python Hospital Appointment System preview": "works.card.hospitalAppointment.alt",
      "Cars dataset analysis preview": "works.card.cars.alt",
      "My Museum app preview": "works.card.museum.alt",
    },
  },
  "games/index.html": {
    text: {
      "Games & Interactive": "games.hero.eyebrow",
      "One active game product, three playable portfolio experiments.": "games.hero.title",
      "Merge Rush is the current game-development priority. Smaller browser experiments remain playable, while technical experiments that are not really games now live under Kaan Labs.": "games.hero.lead",
      "Game catalog": "games.catalog.eyebrow",
      "Depth first, experiments second.": "games.catalog.title",
      "All": "games.filter.all",
      "AI": "games.filter.ai",
      "Creative": "games.filter.creative",
      "Career": "games.filter.career",
      "Live": "games.status.live",
      "View Case Study": "games.action.viewCaseStudy",
      "Case Study": "games.action.caseStudy",
      "Phaser 3 • TypeScript": "games.mergeRush.stack",
      "Timed orders, factory restoration, multi-cell board logic, responsive layouts and platform-aware architecture.": "games.mergeRush.body",
      "JavaScript • Node Logic": "games.aiFlow.stack",
      "AI Flow Puzzle": "games.aiFlow.title",
      "Canvas • JavaScript": "games.stack.canvasJavascript",
      "Joyday Action Painting": "games.joydayPaint.title",
      "Kaan's Career Adventure": "games.adventure.title",
      "Factory Run": "games.tag.factoryRun",
      "YouTube Playables": "games.tag.youtubePlayables",
      "AI Flow": "games.tag.aiFlow",
      "Chatbot": "games.tag.chatbot",
      "Action Painting": "games.tag.actionPainting",
      "PNG Export": "games.tag.pngExport",
      "Mini Game": "games.tag.miniGame",
      "Merge": "games.tag.merge",
      "Current direction": "games.direction.eyebrow",
      "Merge Rush gets the production attention; experiments get a dedicated lab.": "games.direction.title",
      "The old Interview Run concept is no longer presented as active portfolio work. Future small experiments belong in Labs until they earn a place in the game catalog.": "games.direction.body",
      "Merge Rush": "games.direction.mergeRush",
      "Build Log": "games.direction.buildLog",
    },
    attribute: {
      "Game filters": "games.filter.aria",
    },
  },
};

/* Copy the accepted runtime injected after the filter bar. English and
 * Turkish match the accepted runtime; German, Spanish and French close its
 * English fallback with reviewed translations. */
const CATALOG_SEARCH = {
  "works.search.label": { en: "Search projects", tr: "Projelerde ara", de: "Projekte durchsuchen", es: "Buscar proyectos", fr: "Rechercher des projets" },
  "works.search.placeholder": { en: "Search by project, technology or keyword...", tr: "Proje, teknoloji veya anahtar kelime ara...", de: "Nach Projekt, Technologie oder Stichwort suchen...", es: "Buscar por proyecto, tecnología o palabra clave...", fr: "Rechercher par projet, technologie ou mot-clé..." },
  "games.search.label": { en: "Search games", tr: "Oyunlarda ara", de: "Spiele durchsuchen", es: "Buscar juegos", fr: "Rechercher des jeux" },
  "games.search.placeholder": { en: "Search by game, category or feature...", tr: "Oyun, kategori veya özellik ara...", de: "Nach Spiel, Kategorie oder Funktion suchen...", es: "Buscar por juego, categoría o función...", fr: "Rechercher par jeu, catégorie ou fonctionnalité..." },
};

/** Keys the accepted markup itself declares for its own text and alt copy. */
function declaredBindings(html, bindings = { text: new Map(), attribute: new Map() }, owner = {}) {
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const text = normalizeText(decodeHtml(html.slice(index, stop)));
    if (text && owner["data-message-key"]) bindings.text.set(text, [...(bindings.text.get(text) || []), owner["data-message-key"]]);
    if (nextTag < 0) break;
    if (html.startsWith("<!--", nextTag)) { index = html.indexOf("-->", nextTag) + 3; continue; }
    const tagEnd = findTagEnd(html, nextTag);
    const tag = parseTag(html.slice(nextTag, tagEnd));
    const attributes = Object.fromEntries(tag.attributes.map((item) => [item.name.toLowerCase(), item.value === null ? "" : decodeHtml(item.value)]));
    for (const name of LOCALIZED_ATTRIBUTES) {
      const key = attributes[`data-message-${name === "aria-label" ? "aria" : name}-key`];
      if (attributes[name] !== undefined && key) bindings.attribute.set(attributes[name], [...(bindings.attribute.get(attributes[name]) || []), key]);
    }
    const name = tag.name.toLowerCase();
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      declaredBindings(html.slice(tagEnd, close), bindings, attributes);
      index = findTagEnd(html, close);
    }
  }
  return bindings;
}

const common = Object.fromEntries(WORKS_GAMES_LOCALES.map((locale) => [locale, readJson(`data/i18n/messages/${locale}/common.json`)]));
const previous = fs.existsSync(path.join(ROOT, MANIFEST)) ? readJson(MANIFEST) : { promotedKeys: [] };
const alreadyPromoted = new Set(previous.promotedKeys);
const manifest = { schemaVersion: 1, acceptedRef: WORKS_GAMES_ACCEPTED_REF, promotedKeys: [], catalogSearch: {}, sources: {} };
const promotedValues = {};

const assign = (key, values, origin) => {
  for (const locale of WORKS_GAMES_LOCALES) {
    const value = values[locale];
    if (typeof value !== "string" || !value) throw new Error(`${key}: missing accepted ${locale} value`);
    if (origin === "promoted") {
      const existing = common[locale][key];
      if (existing !== undefined && !alreadyPromoted.has(key)) throw new Error(`${key}: promotion collides with an existing canonical key`);
      if (existing !== undefined && existing !== value) throw new Error(`${key}/${locale}: canonical value differs from the accepted copy`);
      (promotedValues[locale] ??= {})[key] = value;
    } else if (common[locale][key] !== value) {
      throw new Error(`${key}/${locale}: ${origin} canonical value ${JSON.stringify(common[locale][key])} differs from accepted ${JSON.stringify(value)}`);
    }
  }
};

for (const source of Object.values(WORKS_GAMES_PAGES)) {
  const accepted = acceptedPageCopy(WORKS_GAMES_ACCEPTED_REF, source);
  const declared = declaredBindings(mainSource(WORKS_GAMES_ACCEPTED_REF, source));
  manifest.sources[source] = { text: {}, attribute: {} };
  for (const kind of ["text", "attribute"]) {
    const used = new Set();
    for (const [english, values] of accepted[kind]) {
      const declaredKeys = [...new Set(declared[kind].get(english) || [])].filter((key) => WORKS_GAMES_LOCALES.every((locale) => common[locale][key] === values[locale]));
      if (declaredKeys.length > 1) throw new Error(`${source}: ${JSON.stringify(english)} declares several canonical keys`);
      const reused = REUSED[source][kind][english];
      const promoted = PROMOTED[source][kind][english];
      const candidates = [declaredKeys[0] && "declared", reused && "reused", promoted && "promoted"].filter(Boolean);
      if (candidates.length !== 1) throw new Error(`${source}: ${JSON.stringify(english)} needs exactly one binding, found ${candidates.join(", ") || "none"}`);
      const key = declaredKeys[0] || reused || promoted;
      assign(key, values, candidates[0]);
      if (candidates[0] === "promoted") manifest.promotedKeys.push(key);
      manifest.sources[source][kind][english] = key;
      used.add(english);
    }
    for (const table of [REUSED[source][kind], PROMOTED[source][kind]]) {
      for (const english of Object.keys(table)) if (!used.has(english)) throw new Error(`${source}: unused ${kind} binding ${JSON.stringify(english)}`);
    }
  }
}
for (const [key, values] of Object.entries(CATALOG_SEARCH)) {
  assign(key, values, "promoted");
  manifest.promotedKeys.push(key);
  const [page, , field] = key.split(".");
  (manifest.catalogSearch[page] ??= {})[field] = key;
}
if (new Set(manifest.promotedKeys).size !== manifest.promotedKeys.length) throw new Error("a promoted key is bound to two different accepted strings");
manifest.promotedKeys.sort(compareKeys);
for (const source of Object.keys(manifest.sources)) {
  for (const kind of ["text", "attribute"]) {
    manifest.sources[source][kind] = Object.fromEntries(Object.entries(manifest.sources[source][kind]).sort(([a], [b]) => compareKeys(a, b)));
  }
}

for (const locale of WORKS_GAMES_LOCALES) {
  /* Insert new keys in sorted position without reordering existing entries. */
  const entries = Object.entries(common[locale]);
  for (const [key, value] of Object.entries(promotedValues[locale] || {}).sort(([a], [b]) => compareKeys(a, b))) {
    const existing = entries.findIndex(([name]) => name === key);
    if (existing >= 0) { entries[existing] = [key, value]; continue; }
    const before = entries.findIndex(([name]) => compareKeys(name, key) > 0);
    entries.splice(before < 0 ? entries.length : before, 0, [key, value]);
  }
  writeJson(`data/i18n/messages/${locale}/common.json`, Object.fromEntries(entries));
}
writeJson(MANIFEST, manifest);

const bindings = Object.values(manifest.sources).reduce((sum, item) => sum + Object.keys(item.text).length + Object.keys(item.attribute).length, 0);
console.log(`Works/Games semantic keys: ${bindings} accepted bindings · ${manifest.promotedKeys.length} promoted canonical keys · authority=${WORKS_GAMES_ACCEPTED_REF}.`);
