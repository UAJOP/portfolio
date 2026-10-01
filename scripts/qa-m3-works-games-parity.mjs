#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { documentContract } from "./home-about-contract.mjs";
import { buildWorksGamesFixture, WORKS_GAMES_IDS } from "./m3-works-games-fixture.mjs";

const ACCEPTED_REF = "24be2f8159a0925dc00f29375ea8740738214df3";
const requestedRoot = process.argv.includes("--root") ? path.resolve(ROOT, process.argv[process.argv.indexOf("--root") + 1]) : null;
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const resolved = git("rev-parse", `${ACCEPTED_REF}^{commit}`).trim();
assert.equal(resolved, ACCEPTED_REF, "#26 accepted ref must resolve exactly");
const reproduced = path.join(os.tmpdir(), `m3-26-structure-${process.pid}.json`);
execFileSync(process.execPath, [path.join(ROOT, "scripts/generate-m3-works-games-structure.mjs"), "--accepted-ref", ACCEPTED_REF, "--output", reproduced], { cwd: ROOT, stdio: "pipe" });
assert.equal(fs.readFileSync(reproduced, "utf8"), fs.readFileSync(path.join(ROOT, "data/site/m3-26-works-games-structure.json"), "utf8"), "#26 accepted structure is not reproducible");
fs.rmSync(reproduced, { force: true });

const searchLabels = {
  en: ["Search projects", "Search by project, technology or keyword...", "Search games", "Search by game, category or feature..."],
  tr: ["Projelerde ara", "Proje, teknoloji veya anahtar kelime ara...", "Oyunlarda ara", "Oyun, kategori veya özellik ara..."],
  de: ["Projekte durchsuchen", "Nach Projekt, Technologie oder Stichwort suchen...", "Spiele durchsuchen", "Nach Spiel, Kategorie oder Funktion suchen..."],
  es: ["Buscar proyectos", "Buscar por proyecto, tecnología o palabra clave...", "Buscar juegos", "Buscar por juego, categoría o función..."],
  fr: ["Rechercher des projets", "Rechercher par projet, technologie ou mot-clé...", "Rechercher des jeux", "Rechercher par jeu, catégorie ou fonctionnalité..."],
};

function acceptedDocument(output) {
  return git("show", `${ACCEPTED_REF}:${output}`);
}

function searchRegion(html) {
  return html.match(/<div class="project-search-wrap reveal">[\s\S]*?<\/div><\/div>/)?.[0] || "";
}

function normalizeCurrent(html, route) {
  let out = html.replace(/<div class="project-search-wrap reveal">[\s\S]*?<\/div><\/div>/, "")
    .replace(/\sdata-react-main=""/g, "")
    .replace(/\sdata-prerendered="true"/g, "")
    .replace(/\saria-current="page"/g, "");
  if (!route.startsWith("tr/") && !route.startsWith("de/") && !route.startsWith("es/") && !route.startsWith("fr/")) {
    out = out.replace(/(<html\b[^>]*?)\sdir="ltr"/, "$1");
  }
  return out;
}

function compare(accepted, current, route) {
  assert.deepEqual(
    documentContract(normalizeCurrent(current, route), { route, source: "accepted" }),
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
    const search = searchRegion(current);
    assert.ok(search, `${route.output}: SSR search enhancement missing`);
    const expected = searchLabels[route.locale];
    const offset = route.routeId === "works" ? 0 : 2;
    assert.ok(search.includes(`>${expected[offset]}<`), `${route.output}: search label drift`);
    assert.ok(search.includes(`placeholder="${expected[offset + 1]}"`), `${route.output}: search placeholder drift`);
    assert.equal((current.match(/data-project-search(?=[ >])/g) || []).length, 1, `${route.output}: one search input`);
    assertions += 4;
  }

  const enWorks = fs.readFileSync(path.join(root, "works/index.html"), "utf8");
  const enGames = fs.readFileSync(path.join(root, "games/index.html"), "utf8");
  const negativeControls = [
    ["head metadata", enWorks.replace("Engineering Evidence | Kaan Balcı", "Changed title"), "works/index.html"],
    ["multi-category", enWorks.replace('data-category="ai software"', 'data-category="ai"'), "works/index.html"],
    ["flagship destination", enWorks.replace('href="/sinama-case-study/"', 'href="/games/"'), "works/index.html"],
    ["game destination", enGames.replace('data-game-link="/ai-flow-puzzle/"', 'data-game-link="/adventure/"'), "games/index.html"],
    ["localized content", fs.readFileSync(path.join(root, "tr/games/index.html"), "utf8").replace("Oyunlar", "Games"), "tr/games/index.html"],
  ];
  for (const [name, mutated, route] of negativeControls) {
    assert.throws(() => compare(acceptedDocument(route), mutated, route), undefined, `${name} negative control did not fail`);
    assertions += 1;
  }
  console.log(`G-64 Works/Games accepted parity passed. ${assertions} assertions · 10 documents · authority=${ACCEPTED_REF} · five failing negative controls.`);
} finally {
  fixture?.cleanup();
}
