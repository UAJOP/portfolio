#!/usr/bin/env node
/* G-65 differential: the React-owned Works/Games documents against the live
 * accepted artifact built from the fixed acceptance SHA. Both sides run their
 * real runtimes in Chromium; nothing here re-implements the matching rules. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";
import { ROOT } from "./i18n-catalog.mjs";
import { buildWorksGamesFixture } from "./m3-works-games-fixture.mjs";

const ACCEPTED_REF = "24be2f8159a0925dc00f29375ea8740738214df3";
const ROUTES = ["en", "tr", "de", "es", "fr"].flatMap((locale) => ["works", "games"].map((page) => `/${locale === "en" ? "" : `${locale}/`}${page}/`));
const browserLaunchOptions = process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const argument = (name) => (process.argv.includes(name) ? path.resolve(process.argv[process.argv.indexOf(name) + 1]) : null);

function buildAcceptedArtifact() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-26-accepted-"));
  const source = path.join(temp, "src");
  fs.mkdirSync(source);
  /* A private index keeps the repository's own index and worktree untouched. */
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temp, "accepted.index") };
  execFileSync("git", ["read-tree", `${ACCEPTED_REF}^{tree}`], { cwd: ROOT, env });
  execFileSync("git", ["checkout-index", "--all", `--prefix=${source}${path.sep}`], { cwd: ROOT, env });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(source, "node_modules"), "junction");
  execFileSync(process.execPath, ["scripts/build-production-site.mjs"], { cwd: source, stdio: "pipe" });
  return { root: path.join(source, "dist-site"), cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

function serverFor(root) {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const file = path.resolve(root, pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1));
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
}

/* Runs in the page. Search controls differ structurally by design (G-64), so
 * they are compared semantically and excluded from the element walk. */
function liveMain() {
  const main = document.querySelector("main");
  const elements = [...main.querySelectorAll("*")].filter((node) => !node.closest(".project-search-wrap"));
  const input = main.querySelector("[data-project-search]");
  return {
    elements: elements.map((node) => ({
      tag: node.tagName,
      attributes: Object.fromEntries([...node.attributes].map((item) => [item.name, item.value]).filter(([name]) => name !== "data-game-card-ready").sort()),
      text: [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.nodeValue).join("").replace(/\s+/g, " ").trim(),
    })),
    legacyCardMarkers: main.querySelectorAll("[data-game-card-ready]").length,
    search: {
      count: main.querySelectorAll("[data-project-search]").length,
      type: input?.type,
      placeholder: input?.placeholder,
      name: input?.labels?.[0]?.textContent.trim(),
      afterFilterBar: input?.closest(".project-search-wrap")?.previousElementSibling?.classList.contains("filter-bar"),
    },
  };
}

function layout() {
  const main = document.querySelector("main");
  const box = (node) => {
    let x = 0; let y = 0;
    for (let item = node; item; item = item.offsetParent) { x += item.offsetLeft; y += item.offsetTop; }
    return [x, y, node.offsetWidth, node.offsetHeight];
  };
  const style = (node, structural = false) => {
    const computed = getComputedStyle(node);
    return [structural ? null : "display", "visibility", "color", "background-color", "font-size", "font-weight", "text-transform", "border-radius"].map((name) => (name ? computed.getPropertyValue(name) : "structural")).join("|");
  };
  const wrap = main.querySelector(".project-search-wrap");
  const field = wrap?.querySelector("[data-project-search]")?.parentElement;
  return {
    elements: [...main.querySelectorAll("*")].filter((node) => !node.closest(".project-search-wrap") && node.offsetParent !== null).map((node) => [node.tagName, ...box(node), style(node)].join(",")),
    /* The wrapper and label element are the documented for/id restructure, so
     * only their display type may differ; geometry and all other styles do not. */
    search: [wrap, wrap?.querySelector("[data-project-search-label]"), field, field?.querySelector("input")].map((node, index) => (node ? [...box(node), style(node, index < 2)].join(",") : null)),
    height: main.offsetHeight,
  };
}

function catalogState() {
  return {
    cards: [...document.querySelectorAll(".project-card[data-category]")].filter((node) => !node.classList.contains("is-hidden")).map((node) => node.dataset.projectLink || node.dataset.gameLink),
    sections: [...document.querySelectorAll("[data-project-section]")].map((node) => node.classList.contains("is-hidden")),
    active: [...document.querySelectorAll("[data-filter-btn].active")].map((node) => node.dataset.filterBtn),
  };
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return main && (!main.hasAttribute("data-react-main") || window.__m3Hydrated === true) && document.querySelector("[data-project-search]");
  }, { timeout: 8000 });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function open(browser, port, route, { viewport, theme }) {
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push(`console: ${message.text()}`); });
  await page.evaluateOnNewDocument((value) => {
    try { localStorage.setItem("kaanbalci-site-theme", value); } catch {}
    addEventListener("portfolio:react-main-hydrated", () => { window.__m3Hydrated = true; }, { once: true });
  }, theme);
  await page.setViewport(viewport);
  const response = await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle0" });
  assert.equal(response.status(), 200, `${route}: HTTP`);
  await settle(page);
  page.diagnostics = diagnostics;
  return page;
}

async function apply(page, category, query) {
  await page.evaluate(async (filter, value) => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    document.querySelector(`[data-filter-btn="${filter}"]`).click();
    await tick();
    const input = document.querySelector("[data-project-search]");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(); await tick();
  }, category, query);
  return page.evaluate(catalogState);
}

/* Every whitespace-delimited token of every card's live accepted text, each
 * adjacent token pair, destination segments, and boundary cases. */
function searchCorpus(texts, links) {
  const queries = new Set(["", " ", "  ", "zz-no-such-catalog-result", "/", "-", "ı", "İ", "é", "ö", "AI", "ai"]);
  for (const text of texts) {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    words.forEach((word, index) => {
      queries.add(word);
      queries.add(word.toUpperCase());
      if (words[index + 1]) queries.add(`${word} ${words[index + 1]}`);
      if (words[index + 1]) queries.add(`${word}  ${words[index + 1]}`);
    });
  }
  for (const link of links) {
    queries.add(link);
    for (const segment of link.split(/[/-]/)) if (segment) queries.add(segment);
  }
  return [...queries];
}

const acceptedArgument = argument("--accepted-root");
const currentArgument = argument("--root");
const accepted = acceptedArgument ? { root: acceptedArgument, cleanup() {} } : buildAcceptedArtifact();
const fixture = currentArgument ? { mixed: currentArgument, cleanup() {} } : await buildWorksGamesFixture();
const acceptedServer = serverFor(accepted.root);
const currentServer = serverFor(fixture.mixed);
await new Promise((resolve) => acceptedServer.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => currentServer.listen(0, "127.0.0.1", resolve));
const ports = { accepted: acceptedServer.address().port, current: currentServer.address().port };
const browser = await puppeteer.launch(browserLaunchOptions);
let assertions = 0;
let searchChecks = 0;
let layoutChecks = 0;
try {
  assert.equal(fs.existsSync(path.join(accepted.root, "works/index.html")), true, "accepted artifact missing");
  assert.equal(/data-react-main/.test(fs.readFileSync(path.join(accepted.root, "works/index.html"), "utf8")), false, "accepted Works must be the legacy-owned document");
  assert.equal(/data-react-main/.test(fs.readFileSync(path.join(fixture.mixed, "works/index.html"), "utf8")), true, "current Works must be React-owned");
  assertions += 3;

  for (const route of ROUTES) {
    const options = { viewport: { width: 1440, height: 900 }, theme: "dark" };
    const acceptedPage = await open(browser, ports.accepted, route, options);
    const currentPage = await open(browser, ports.current, route, options);

    const acceptedMain = await acceptedPage.evaluate(liveMain);
    const currentMain = await currentPage.evaluate(liveMain);
    assert.deepEqual(currentMain.elements, acceptedMain.elements, `${route}: live main DOM drift against the accepted runtime`);
    assert.deepEqual(currentMain.search, acceptedMain.search, `${route}: live search control semantics drift`);
    assert.equal(currentMain.search.type, "search", `${route}: native search input`);
    assert.equal(currentMain.legacyCardMarkers, 0, `${route}: legacy card initializer ran on React-owned main`);
    const accessibleSearch = async (page) => {
      const node = await page.accessibility.snapshot({ root: await page.$("[data-project-search]") });
      /* The accepted label also wrapped the boxicons search icon, so its
       * private-use icon-font glyph leaked into the name. Only that glyph and
       * whitespace flattening are normalized; the words compare exactly. */
      return { role: node.role, name: node.name.replace(/[-]/g, "").replace(/\s+/g, " ").trim() };
    };
    assert.deepEqual(await accessibleSearch(currentPage), await accessibleSearch(acceptedPage), `${route}: accessible search role/name drift`);
    const rawName = (await currentPage.accessibility.snapshot({ root: await currentPage.$("[data-project-search]") })).name;
    assert.equal(/[-]/.test(rawName), false, `${route}: icon glyph leaked into the accessible name`);
    assertions += 6;

    const categories = await acceptedPage.evaluate(() => [...document.querySelectorAll("[data-filter-btn]")].map((node) => node.dataset.filterBtn));
    assert.deepEqual(await currentPage.evaluate(() => [...document.querySelectorAll("[data-filter-btn]")].map((node) => node.dataset.filterBtn)), categories);
    assert.equal(categories.length, route.endsWith("works/") ? 7 : 5, `${route}: filter count`);
    assertions += 2;
    const cards = await acceptedPage.evaluate(() => [...document.querySelectorAll(".project-card[data-category]")].map((node) => ({ text: node.textContent, link: node.dataset.projectLink || node.dataset.gameLink })));
    const corpus = searchCorpus(cards.map((card) => card.text), cards.map((card) => card.link));
    for (const category of categories) {
      const queries = category === "all" ? corpus : corpus.filter((_, index) => index % 6 === 0);
      for (const query of queries) {
        const expected = await apply(acceptedPage, category, query);
        const actual = await apply(currentPage, category, query);
        assert.deepEqual(actual, expected, `${route}: category=${category} query=${JSON.stringify(query)} drift`);
        searchChecks += 1;
      }
    }
    assert.deepEqual(currentPage.diagnostics, [], `${route}: current browser diagnostics`);
    assertions += 1;
    await acceptedPage.close();
    await currentPage.close();

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const theme of ["dark", "light"]) {
        const label = `${route} ${viewport.width}px ${theme}`;
        /* Background tabs do not render, so each side is measured alone in front. */
        const pages = [];
        for (const port of [ports.accepted, ports.current]) {
          const page = await open(browser, port, route, { viewport, theme });
          await page.bringToFront();
          page.layout = await page.evaluate(layout);
          pages.push(page);
        }
        const [expected, actual] = pages.map((page) => page.layout);
        assert.equal(actual.height, expected.height, `${label}: main height`);
        assert.deepEqual(actual.search, expected.search, `${label}: search control geometry/style`);
        assert.deepEqual(actual.elements, expected.elements, `${label}: element geometry/style`);
        layoutChecks += actual.elements.length + actual.search.length;
        assertions += 3;
        await Promise.all(pages.map((page) => page.close()));
      }
    }
  }

  /* Negative controls: each sabotages the live current page and must be
   * detected by the same comparison against the live accepted page. */
  const controlOptions = { viewport: { width: 1440, height: 900 }, theme: "dark" };
  const controls = [
    ["protected-term casing drift", liveMain, () => document.querySelector('[data-message-key="works.category.pythonSoftware"]').removeAttribute("data-preserve-case")],
    ["wrong locale copy", liveMain, () => { document.querySelector(".project-card h3 a").textContent = "Wrong locale copy"; }],
    ["unexpected attribute drift", liveMain, () => document.querySelector(".project-card").setAttribute("data-category", "ai")],
    ["layout drift", layout, () => { document.querySelector(".project-card h3").style.fontSize = "40px"; }],
  ];
  for (const [name, probe, sabotage] of controls) {
    const acceptedPage = await open(browser, ports.accepted, "/works/", controlOptions);
    await acceptedPage.bringToFront();
    const expected = await acceptedPage.evaluate(probe);
    const currentPage = await open(browser, ports.current, "/works/", controlOptions);
    await currentPage.bringToFront();
    assert.deepEqual(await currentPage.evaluate(probe), expected, `${name}: control baseline must match before sabotage`);
    await currentPage.evaluate(sabotage);
    const actual = await currentPage.evaluate(probe);
    assert.throws(() => assert.deepEqual(actual, expected), undefined, `${name} negative control did not fail`);
    assertions += 2;
    await acceptedPage.close();
    await currentPage.close();
  }
  {
    const pages = await Promise.all([open(browser, ports.accepted, "/works/", controlOptions), open(browser, ports.current, "/works/", controlOptions)]);
    const expected = await apply(pages[0], "game", "");
    await apply(pages[1], "game", "");
    await pages[1].evaluate(() => document.querySelector(".project-card.is-hidden").classList.remove("is-hidden"));
    const actual = await pages[1].evaluate(catalogState);
    assert.throws(() => assert.deepEqual(actual, expected), undefined, "incorrect category visibility negative control did not fail");
    assertions += 1;
    await Promise.all(pages.map((page) => page.close()));
  }

  console.log(`G-65 Works/Games accepted differential passed. ${assertions} assertions · 10 documents · ${searchChecks} search/filter states · ${layoutChecks} element geometry/style checks (desktop/mobile × dark/light) · authority=${ACCEPTED_REF}.`);
} finally {
  await browser.close();
  await new Promise((resolve) => acceptedServer.close(resolve));
  await new Promise((resolve) => currentServer.close(resolve));
  fixture.cleanup();
  accepted.cleanup();
}
