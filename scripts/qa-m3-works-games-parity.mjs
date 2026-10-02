#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { documentContract } from "./home-about-contract.mjs";
import { buildWorksGamesFixture, WORKS_GAMES_IDS } from "./m3-works-games-fixture.mjs";
import { M3_26_ACCEPTED_REF as ACCEPTED_REF, acceptedDocument } from "./m3-26-accepted-snapshot.mjs";

/* Hermetic: accepted documents come from the committed snapshot, which is
 * verified against the independently accepted #25-A manifest. */
const requestedRoot = process.argv.includes("--root") ? path.resolve(ROOT, process.argv[process.argv.indexOf("--root") + 1]) : null;
const reproduced = path.join(os.tmpdir(), `m3-26-structure-${process.pid}.json`);
execFileSync(process.execPath, [path.join(ROOT, "scripts/generate-m3-works-games-structure.mjs"), "--accepted-ref", ACCEPTED_REF, "--output", reproduced], { cwd: ROOT, stdio: "pipe" });
/* Line endings only: with `* text=auto`, a core.autocrlf=true (Windows)
 * checkout materializes the committed LF structure as CRLF. The generator
 * always writes LF, and only CRLF pairs in the checked-out copy are folded;
 * any other byte difference, including a lone CR, still fails. */
const checkoutLf = (text) => text.replace(/\r\n/g, "\n");
const assertStructureReproduced = (generated, checkedOut) => {
  assert.equal(generated.includes("\r"), false, "#26 structure generator must emit LF");
  assert.equal(generated, checkoutLf(checkedOut), "#26 accepted structure is not reproducible");
};
const generatedStructure = fs.readFileSync(reproduced, "utf8");
fs.rmSync(reproduced, { force: true });
const committedStructure = fs.readFileSync(path.join(ROOT, "data/site/m3-26-works-games-structure.json"), "utf8");
assertStructureReproduced(generatedStructure, committedStructure);
const asLf = checkoutLf(committedStructure);
const asCrlf = asLf.replace(/\n/g, "\r\n");
for (const checkout of [asLf, asCrlf]) assertStructureReproduced(generatedStructure, checkout);
const changedKey = (text) => text.replace('"key": "works.domain.data"', '"key": "works.domain.changed"');
const structureControls = [
  ["LF structure change", changedKey(asLf)],
  ["CRLF structure change", changedKey(asCrlf)],
  ["lone CR", asLf.replace("\n", "\r")],
  ["extra trailing line", `${asCrlf}\r\n`],
];
for (const [name, checkout] of structureControls) {
  assert.notEqual(checkout, asLf, `${name}: control must mutate the structure`);
  assert.throws(() => assertStructureReproduced(generatedStructure, checkout), undefined, `${name} structure control did not fail`);
}
const reviewedDeltas = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-26-reviewed-copy-deltas.json"), "utf8")).deltas;

/* The search copy the accepted 24be2f8 runtime displayed (re-measured live
 * on the accepted artifact by the differential gate). */
const searchLabels = {
  en: ["Search projects", "Search by project, technology or keyword...", "Search games", "Search by game, category or feature..."],
  tr: ["Projelerde ara", "Proje, teknoloji veya anahtar kelime ara...", "Oyunlarda ara", "Oyun, kategori veya özellik ara..."],
  de: ["Projekte durchsuchen", "Nach Projekt, Technologie oder Stichwort suchen …", "Spiele durchsuchen", "Nach Spiel, Kategorie oder Funktion suchen …"],
  es: ["Buscar proyectos", "Buscar por proyecto, tecnología o palabra clave…", "Buscar juegos", "Buscar por juego, categoría o función…"],
  fr: ["Rechercher des projets", "Rechercher par projet, technologie ou mot-clé…", "Rechercher des jeux", "Rechercher par jeu, catégorie ou fonctionnalité…"],
};

function searchRegion(html) {
  return html.match(/<div class="project-search-wrap reveal">[\s\S]*?<\/div><\/div>/)?.[0] || "";
}

const escapeAttribute = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

/* The only accepted DOM delta in the search control: the runtime's invalid
 * block-in-label nesting becomes an explicit for/id association. The native
 * search input type and every other attribute stay exactly as accepted. */
function assertSearchRegion(html, route) {
  const [label, placeholder] = searchLabels[route.locale].slice(route.routeId === "works" ? 0 : 2);
  const expected = `<div class="project-search-wrap reveal"><label for="catalog-search" data-project-search-label="">${escapeAttribute(label)}</label><div><i class="bx bx-search"></i><input id="catalog-search" type="search" data-project-search="" placeholder="${escapeAttribute(placeholder)}"/></div></div>`;
  assert.equal(searchRegion(html), expected, `${route.output}: search control drift`);
  assert.equal((html.match(/data-project-search(?:=""|(?=[ >]))/g) || []).length, 1, `${route.output}: one search input`);
}

/* Migration markers are accepted only where they belong: the React ownership
 * markers on the single <main> opening tag, and aria-current on exactly the
 * selected header link. The same attributes anywhere else remain drift. */
function normalizeCurrent(html, route) {
  let out = html.replace(/<div class="project-search-wrap reveal">[\s\S]*?<\/div><\/div>/, "");
  const mainTag = out.match(/<main\b[^>]*>/i)?.[0] || "";
  assert.ok(mainTag.includes(' data-react-main=""') && mainTag.includes(' data-prerendered="true"'), `${route}: React main markers missing`);
  out = out.replace(mainTag, () => mainTag.replace(' data-react-main=""', "").replace(' data-prerendered="true"', ""));
  const current = [...out.matchAll(/<a\b[^>]*\saria-current="page"[^>]*>/g)];
  assert.equal(occurrences(out, "aria-current="), 1, `${route}: aria-current must occur exactly once`);
  assert.equal(current.length, 1, `${route}: aria-current must be on a link`);
  const headerStart = out.indexOf("<header");
  const headerEnd = out.indexOf("</header>");
  assert.ok(current[0].index > headerStart && current[0].index < headerEnd && /class="[^"]*\bselected\b/.test(current[0][0]), `${route}: aria-current must mark the selected header link`);
  out = `${out.slice(0, current[0].index)}${current[0][0].replace(' aria-current="page"', "")}${out.slice(current[0].index + current[0][0].length)}`;
  if (!route.startsWith("tr/") && !route.startsWith("de/") && !route.startsWith("es/") && !route.startsWith("fr/")) {
    out = out.replace(/(<html\b[^>]*?)\sdir="ltr"/, "$1");
  }
  return out;
}

/* Owner-approved copy deltas (data/site/m3-26-reviewed-copy-deltas.json):
 * each reviewed string must appear exactly once where the accepted string
 * appeared exactly once; nothing else in the document may differ. */
function applyReviewedCopyDeltas(accepted, current, route) {
  let out = current;
  for (const delta of reviewedDeltas.filter((item) => item.document === route)) {
    const acceptedText = `>${escapeText(delta.accepted)}<`;
    const currentText = `>${escapeText(delta.current)}<`;
    assert.equal(occurrences(accepted, acceptedText), 1, `${route}: reviewed delta must replace one accepted string`);
    assert.equal(occurrences(out, currentText), 1, `${route}: reviewed delta ${JSON.stringify(delta.current)} must render exactly once`);
    out = out.replace(currentText, () => acceptedText);
  }
  return out;
}

/* The accepted COMMON runtime added these attributes inside main after load;
 * React main is excluded from that runtime, so its SSR carries them. Each one
 * is removed only where the accepted static document lacks it, pairwise by
 * image order, and the pinned protected-term casing must occur exactly once. */
function normalizeRuntimePresentation(accepted, current, route) {
  const acceptedMain = accepted.match(/<main\b[\s\S]*?<\/main>/i)[0];
  const currentMain = current.match(/<main\b[\s\S]*?<\/main>/i)[0];
  const acceptedImages = acceptedMain.match(/<img\b[^>]*>/gi) || [];
  let index = 0;
  let main = currentMain.replace(/<img\b[^>]*>/gi, (tag) => {
    const original = acceptedImages[index++];
    if (original === undefined || /\sdecoding=/i.test(original)) return tag;
    assert.ok(tag.includes(' decoding="async"'), `${route}: image ${index} must carry the accepted async decoding`);
    return tag.replace(' decoding="async"', "");
  });
  assert.equal(index, acceptedImages.length, `${route}: image count drift`);
  const preserveCase = /(<span data-message-key="works\.category\.pythonSoftware") data-preserve-case=""/;
  assert.equal(/data-preserve-case/.test(acceptedMain), false, `${route}: accepted static main has no casing marker`);
  if (route.endsWith("works/index.html")) {
    assert.equal((main.match(/data-preserve-case/g) || []).length, 1, `${route}: exactly one protected-term casing marker`);
    assert.match(main, preserveCase, `${route}: protected-term casing marker moved`);
    main = main.replace(preserveCase, "$1");
  }
  return current.replace(currentMain, () => main);
}

function compare(accepted, current, route) {
  assert.deepEqual(
    documentContract(normalizeCurrent(applyReviewedCopyDeltas(accepted, normalizeRuntimePresentation(accepted, current, route), route), route), { route, source: "accepted" }),
    documentContract(accepted, { route, source: "accepted" }),
    `${route}: complete accepted document contract drift`,
  );
}

const fixture = requestedRoot ? null : await buildWorksGamesFixture();
const root = requestedRoot || fixture.mixed;
let assertions = 0;
try {
  const routes = (fixture?.routes || []).filter((route) => WORKS_GAMES_IDS.has(route.routeId));
  const records = routes.length ? routes : ["en", "tr", "de", "es", "fr"].flatMap((locale) => ["works", "games"].map((routeId) => ({
    routeId,
    locale,
    output: `${locale === "en" ? "" : `${locale}/`}${routeId}/index.html`,
  })));
  assert.equal(records.length, 10, "#26 must own exactly ten documents");
  assertions += 1;
  for (const route of records) {
    const accepted = acceptedDocument(route.output);
    const current = fs.readFileSync(path.join(root, route.output), "utf8");
    compare(accepted, current, route.output);
    assertions += 1;
    assert.equal((current.match(/<main\b[^>]*data-react-main=""[^>]*>/g) || []).length, 1, `${route.output}: one React main`);
    assert.match(current, /<script type="module" src="\/assets-react\/production-main-[^"]+\.js"><\/script>/, `${route.output}: production bundle`);
    assertions += 2;
    assertSearchRegion(current, route);
    assertions += 2;
  }

  const enWorks = fs.readFileSync(path.join(root, "works/index.html"), "utf8");
  const enGames = fs.readFileSync(path.join(root, "games/index.html"), "utf8");
  const esWorks = fs.readFileSync(path.join(root, "es/works/index.html"), "utf8");
  const deWorks = fs.readFileSync(path.join(root, "de/works/index.html"), "utf8");
  const negativeControls = [
    ["head metadata", enWorks.replace("Engineering Evidence | Kaan Balcı", "Changed title"), "works/index.html"],
    ["multi-category", enWorks.replace('data-category="ai software"', 'data-category="ai"'), "works/index.html"],
    ["flagship destination", enWorks.replace('href="/sinama-case-study/"', 'href="/games/"'), "works/index.html"],
    ["game destination", enGames.replace('data-game-link="/ai-flow-puzzle/"', 'data-game-link="/adventure/"'), "games/index.html"],
    ["localized content", fs.readFileSync(path.join(root, "tr/games/index.html"), "utf8").replace("Oyunlar", "Games"), "tr/games/index.html"],
    ["protected-term casing missing", enWorks.replace(' data-preserve-case=""', ""), "works/index.html"],
    ["image decoding drift", enGames.replace(' decoding="async"', ' decoding="sync"'), "games/index.html"],
    ["aria-current on a card", enWorks.replace('<article class="project-card', '<article aria-current="page" class="project-card'), "works/index.html"],
    ["data-prerendered on a card", enWorks.replace('<article class="project-card', '<article data-prerendered="true" class="project-card'), "works/index.html"],
    ["data-react-main on a card", enGames.replace('<article class="project-card', '<article data-react-main="" class="project-card'), "games/index.html"],
    ["aria-current moved off the selected link", enWorks.replace(' aria-current="page"', "").replace('<article class="project-card', '<article aria-current="page" class="project-card'), "works/index.html"],
    ["unreviewed role copy", esWorks.replace("Mi rol: AI Designer", "Mi rol: Diseñador de IA"), "es/works/index.html"],
    ["reviewed role delta reverted", esWorks.replace("Mi rol: Desarrollador Python / bases de datos", "Mi rol: desarrollador Python y de bases de datos"), "es/works/index.html"],
    ["role delta leaked into another locale", deWorks.replace("Meine Rolle: Python-Entwickler", "Meine Rolle: Python Developer"), "de/works/index.html"],
  ];
  for (const [name, mutated, route] of negativeControls) {
    assert.throws(() => compare(acceptedDocument(route), mutated, route), undefined, `${name} negative control did not fail`);
    assertions += 1;
  }
  const enWorksRoute = { routeId: "works", locale: "en", output: "works/index.html" };
  const deGames = fs.readFileSync(path.join(root, "de/games/index.html"), "utf8");
  const searchControls = [
    ["search input type drift", enWorks.replace('type="search" data-project-search=""', 'type="text" data-project-search=""'), enWorksRoute],
    ["search ARIA role substitution", enWorks.replace('type="search"', 'role="searchbox"'), enWorksRoute],
    ["search English fallback", deGames.replace("Spiele durchsuchen", "Search games"), { routeId: "games", locale: "de", output: "de/games/index.html" }],
    ["search placeholder not the accepted wording", deWorks.replace("Stichwort suchen …", "Stichwort suchen..."), { routeId: "works", locale: "de", output: "de/works/index.html" }],
    ["duplicate search input", enWorks.replace("</main>", '<input data-project-search=""/></main>'), enWorksRoute],
  ];
  for (const [name, mutated, route] of searchControls) {
    assert.throws(() => assertSearchRegion(mutated, route), undefined, `${name} negative control did not fail`);
    assertions += 1;
  }
  negativeControls.push(...searchControls);
  console.log(`G-64 Works/Games accepted parity passed. ${assertions} assertions · 10 documents · authority=${ACCEPTED_REF} · ${reviewedDeltas.length} reviewed copy deltas · ${negativeControls.length} failing negative controls · structure LF+CRLF reproducible, ${structureControls.length} structure controls · git-history=none.`);
} finally {
  fixture?.cleanup();
}
