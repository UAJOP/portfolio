#!/usr/bin/env node
/* G-65 differential: the React-owned Works/Games documents against the live
 * accepted 24be2f8 artifact. Both sides run their real runtimes in Chromium;
 * nothing here re-implements the accepted matching or navigation rules.
 *
 * Hermetic: the accepted artifact is composed from the current artifact, the
 * committed acceptance snapshot and the reversed reviewed public edits, then
 * proven byte-equal to the independently accepted #25-A/#25-B manifests. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import puppeteer from "puppeteer";
import { ROOT } from "./i18n-catalog.mjs";
import { artifactDigest } from "./artifact-parity.mjs";
import { listFiles } from "./build-pages-artifact.mjs";
import { buildWorksGamesFixture } from "./m3-works-games-fixture.mjs";
import { WORKS_GAMES_REVIEWED_EDITS, acceptedBaseOf } from "./m3-26-public-edits.mjs";
import { RECRUITER_BUILD_LOG_REVIEWED_EDITS, recruiterBuildLogAcceptedBase } from "./m3-27-public-edits.mjs";
import { AJOOP_COMMAND_REVIEWED_EDITS, ajoopCommandAcceptedBase } from "./m3-28-public-edits.mjs";
import { CASE_PROJECT_REVIEWED_EDITS, caseProjectAcceptedBase } from "./m3-29-public-edits.mjs";
import {
  HOME_ABOUT_DOCUMENTS,
  M3_26_ACCEPTED_REF,
  WORKS_GAMES_DOCUMENTS,
  acceptedArtifactManifest,
  acceptedDocument,
} from "./m3-26-accepted-snapshot.mjs";

const ROUTES = WORKS_GAMES_DOCUMENTS.map((file) => `/${file.replace(/index\.html$/, "")}`);
const reviewedDeltas = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-26-reviewed-copy-deltas.json"), "utf8")).deltas;
const browserLaunchOptions = process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const argument = (name) => (process.argv.includes(name) ? path.resolve(process.argv[process.argv.indexOf(name) + 1]) : null);
const M3_29_CASE_ROUTES = "ai-flow-puzzle-case-study|atolye-joyday-case-study|hospital-system-case-study|merge-rush-case-study|sinama-case-study";
const isM329Document = (file) => new RegExp(`^(?:(?:tr|de|es|fr)/)?(?:projects/[^/]+|(?:${M3_29_CASE_ROUTES}))/index\\.html$`).test(file);

function composeAcceptedArtifact(currentRoot) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-26-accepted-"));
  const root = path.join(temp, "dist-site");
  for (const file of listFiles(currentRoot)) {
    if (HOME_ABOUT_DOCUMENTS.includes(file) || file.startsWith("assets-react/")) continue;
    let bytes = fs.readFileSync(path.join(currentRoot, file));
    if (WORKS_GAMES_DOCUMENTS.includes(file)) bytes = Buffer.from(acceptedDocument(file));
    else if (WORKS_GAMES_REVIEWED_EDITS[file] || RECRUITER_BUILD_LOG_REVIEWED_EDITS[file] || AJOOP_COMMAND_REVIEWED_EDITS[file] || CASE_PROJECT_REVIEWED_EDITS[file]) {
      let content = bytes.toString("utf8");
      if (CASE_PROJECT_REVIEWED_EDITS[file]) content = caseProjectAcceptedBase(file, content);
      if (AJOOP_COMMAND_REVIEWED_EDITS[file]) content = ajoopCommandAcceptedBase(file, content);
      if (RECRUITER_BUILD_LOG_REVIEWED_EDITS[file]) content = recruiterBuildLogAcceptedBase(file, content);
      if (WORKS_GAMES_REVIEWED_EDITS[file]) content = acceptedBaseOf(file, content);
      bytes = Buffer.from(content);
    }
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  }
  const expected = acceptedArtifactManifest();
  const files = listFiles(root);
  assert.deepEqual([...files].sort(), [...expected.keys()].sort(), "composed accepted artifact must hold exactly the accepted files");
  let verifiedFiles = 0;
  for (const file of files) {
    /* #29 intentionally replaces these 150 documents. They remain present in
     * the accepted server because Works/Games may navigate to them, but their
     * bytes belong to the #29 gates rather than the frozen #26 manifest. */
    if (isM329Document(file)) continue;
    const entry = expected.get(file);
    assert.equal(artifactDigest(path.join(root, file), entry.normalization), entry.sha256, `${file}: composed accepted artifact differs from ${M3_26_ACCEPTED_REF}`);
    verifiedFiles += 1;
  }
  return { root, files: files.length, verifiedFiles, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
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
  const identity = (node) => {
    const classes = [...node.classList].map((name) => `.${name}`).join("");
    const key = node.getAttribute("data-message-key");
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes}${key ? `[data-message-key=${JSON.stringify(key)}]` : ""}`;
  };
  const details = (node) => {
    if (!node) return null;
    const computed = getComputedStyle(node);
    return {
      node: identity(node),
      box: box(node),
      styles: Object.fromEntries([
        "display", "visibility", "color", "background-color", "font-size", "font-weight", "text-transform", "border-radius",
        "content-visibility", "contain-intrinsic-size", "transition-property", "transition-duration", "transition-delay",
        "animation-name", "animation-duration", "animation-delay", "animation-iteration-count", "animation-play-state",
      ].map((name) => [name, computed.getPropertyValue(name)])),
    };
  };
  const visible = [...main.querySelectorAll("*")].filter((node) => !node.closest(".project-search-wrap") && node.offsetParent !== null);
  const animation = (item) => ({
    node: item.effect?.target instanceof Element ? identity(item.effect.target) : null,
    playState: item.playState,
    currentTime: item.currentTime,
    timing: item.effect?.getComputedTiming(),
  });
  const contentVisibility = [...main.querySelectorAll(".section-block, .cta-panel, .project-detail-grid, .math-lab-section")].map((node) => ({
    node: identity(node),
    value: getComputedStyle(node).contentVisibility,
    box: box(node),
    visible: node.checkVisibility({ contentVisibilityAuto: true }),
  }));
  return {
    elements: visible.map((node) => [node.tagName, ...box(node), style(node)].join(",")),
    /* The wrapper and label element are the documented for/id restructure, so
     * only their display type may differ; geometry and all other styles do not. */
    search: [wrap, wrap?.querySelector("[data-project-search-label]"), field, field?.querySelector("input")].map((node, index) => (node ? [...box(node), style(node, index < 2)].join(",") : null)),
    height: main.offsetHeight,
    details: {
      elements: visible.map(details),
      search: [wrap, wrap?.querySelector("[data-project-search-label]"), field, field?.querySelector("input")].map(details),
    },
    state: {
      readyState: document.readyState,
      fonts: document.fonts.status,
      hydrated: window.__m3Hydrated === true,
      reactMain: main.hasAttribute("data-react-main"),
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, scrollX, scrollY },
      activeAnimations: main.getAnimations({ subtree: true }).filter((item) => item.playState !== "finished").map(animation),
      contentVisibility,
    },
  };
}

function containment() {
  const main = document.querySelector("main");
  const identity = (node) => {
    const classes = [...node.classList].map((name) => `.${name}`).join("");
    const key = node.getAttribute("data-message-key");
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes}${key ? `[data-message-key=${JSON.stringify(key)}]` : ""}`;
  };
  return [...main.querySelectorAll(".section-block, .cta-panel, .project-detail-grid, .math-lab-section")].map((node) => {
    const computed = getComputedStyle(node);
    return {
      node: identity(node),
      styles: {
        "content-visibility": computed.contentVisibility,
        "contain-intrinsic-size": computed.containIntrinsicSize,
      },
    };
  });
}

const layoutSignature = ({ elements, search, height, containment: originalContainment }) => ({ elements, search, height, containment: originalContainment });

async function measureLayout(page) {
  await page.bringToFront();
  const originalContainment = await page.evaluate(containment);
  /* Geometry cannot be sampled from content-visibility placeholders. This
   * measurement-only rule forces both accepted and current pages to lay out
   * every compared node without changing production CSS or its box styles. */
  const measurementStyle = await page.addStyleTag({ content: ".section-block,.cta-panel,.site-footer,.project-detail-grid,.math-lab-section{content-visibility:visible!important}" });
  try {
    await page.waitForFunction(() => {
      const main = document.querySelector("main");
      return document.readyState === "complete"
        && document.fonts.status === "loaded"
        && main.getAnimations({ subtree: true }).every((item) => item.effect?.getComputedTiming()?.iterations === Infinity || item.playState === "finished");
    }, { timeout: 15000 });
    let previous = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const current = await page.evaluate(layout);
      current.containment = originalContainment;
      current.details.containment = originalContainment;
      current.state.originalContainment = originalContainment;
      if (previous && isDeepStrictEqual(layoutSignature(current), layoutSignature(previous))) return current;
      previous = current;
    }
    throw new Error(`${page.url()}: layout did not stabilize\n${JSON.stringify(previous?.state, null, 2)}`);
  } finally {
    await measurementStyle.evaluate((node) => node.remove());
    await measurementStyle.dispose();
  }
}

function layoutDrift(field, actual, expected) {
  const values = field === "height" ? [actual.height, expected.height] : [actual[field], expected[field]];
  const index = field === "height" ? null : Array.from({ length: Math.max(values[0].length, values[1].length) }, (_, item) => item)
    .find((item) => values[0][item] !== values[1][item]);
  return JSON.stringify({
    firstDifference: field === "height" ? { node: "main", actual: actual.height, expected: expected.height } : {
      index,
      actual: actual.details[field][index] ?? null,
      expected: expected.details[field][index] ?? null,
    },
    actualState: actual.state,
    expectedState: expected.state,
  }, null, 2);
}

function assertLayout(field, actual, expected, label) {
  try {
    if (field === "height") assert.equal(actual.height, expected.height, label);
    else assert.deepEqual(actual[field], expected[field], label);
  } catch (error) {
    error.message += `\nFirst layout difference and readiness diagnostics:\n${layoutDrift(field, actual, expected)}`;
    throw error;
  }
}

function catalogState() {
  return {
    cards: [...document.querySelectorAll(".project-card[data-category]")].filter((node) => !node.classList.contains("is-hidden")).map((node) => node.dataset.projectLink || node.dataset.gameLink || node.querySelector("h3")?.textContent.trim()),
    sections: [...document.querySelectorAll("[data-project-section]")].map((node) => node.classList.contains("is-hidden")),
    active: [...document.querySelectorAll("[data-filter-btn].active")].map((node) => node.dataset.filterBtn),
  };
}

/* Readiness is condition-based: document loaded, React hydrated (React
 * documents only), fonts ready, then an idle period and two frames. */
async function settle(page) {
  /* Frames and idle callbacks only run in the foreground tab. */
  await page.bringToFront();
  await page.waitForFunction(() => document.readyState === "complete"
    && document.querySelector("[data-project-search]")
    && (!document.querySelector("main[data-react-main]") || window.__m3Hydrated === true), { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => {
    requestIdleCallback(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), { timeout: 3000 });
  })));
}

/* Owner-approved copy deltas are applied to the accepted page so they are the
 * only permitted difference; each accepted string must exist exactly once. */
async function applyReviewedDeltas(page, route) {
  const document = `${route.slice(1)}index.html`;
  const deltas = reviewedDeltas.filter((item) => item.document === document);
  await page.evaluate((items) => {
    for (const item of items) {
      const targets = [...document.querySelectorAll("main *")].filter((node) => node.children.length === 0 && node.textContent === item.accepted);
      if (targets.length !== 1) throw new Error(`reviewed delta target ${item.accepted} found ${targets.length} times`);
      targets[0].textContent = item.current;
    }
  }, deltas);
  return deltas.length;
}

async function open(browser, port, route, { viewport, theme, accepted = false, intercept = false }) {
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.push(`console: ${message.text()}`); });
  await page.evaluateOnNewDocument((value) => {
    try { localStorage.setItem("kaanbalci-site-theme", value); } catch {}
    addEventListener("portfolio:react-main-hydrated", () => { window.__m3Hydrated = true; }, { once: true });
  }, theme);
  if (intercept) {
    /* Navigations are observed in the page, synchronously, through the
     * Navigation API: the navigate event fires inside the click that starts
     * the navigation, so recording it cannot race the read. Once armed, each
     * one is recorded and cancelled; both runtimes get the identical recorder. */
    await page.evaluateOnNewDocument(() => {
      window.__m3Navigations = [];
      window.__m3NavigationsArmed = false;
      navigation.addEventListener("navigate", (event) => {
        if (!window.__m3NavigationsArmed) return;
        window.__m3Navigations.push({ url: event.destination.url, cancelable: event.cancelable });
        event.preventDefault();
      });
    });
    /* Guard only: an armed navigation that still reaches the network escaped
     * the recorder and fails the gate. */
    page.escapedNavigations = null;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (page.escapedNavigations && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        page.escapedNavigations.push(request.url());
        request.respond({ status: 204, body: "" });
        return;
      }
      request.continue();
    });
  }
  await page.setViewport(viewport);
  const response = await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle0" });
  assert.equal(response.status(), 200, `${route}: HTTP`);
  await settle(page);
  if (accepted) page.reviewedDeltas = await applyReviewedDeltas(page, route);
  if (intercept) page.escapedNavigations = [];
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

/* "card N mode field" for every activation fact that differs. */
function activationDrift(actual, expected) {
  assert.equal(actual.length, expected.length, "activation records must cover the same cards");
  return expected.flatMap((record, index) => Object.keys(record).flatMap((mode) => ["navigations", "analytics"]
    .filter((field) => !isDeepStrictEqual(actual[index][mode]?.[field], record[mode][field]))
    .map((field) => `card ${index} ${mode} ${field}`)));
}

/* Whole-card activation, observed through real events on both runtimes:
 * inert-surface click, modifier click, nested-link click and click with an
 * active text selection, recording navigations and analytics calls.
 * Navigations come from the in-page recorder installed by open(); a
 * navigation that lands after a click's record was read fails instead of
 * spilling into the next record. */
async function cardActivation(page) {
  await page.bringToFront();
  const count = await page.evaluate(() => {
    window.__m3Analytics = [];
    window.trackAnalyticsNavigation = (...values) => { window.__m3Analytics.push(values.join("|")); };
    window.__m3Navigations.length = 0;
    window.__m3NavigationsArmed = true;
    return document.querySelectorAll(".project-card[data-category]").length;
  });
  const results = [];
  const settleClick = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  /* Reads and clears the in-page records atomically, in one task. */
  const drain = () => page.evaluate(() => ({
    navigations: window.__m3Navigations.splice(0).map(({ url, cancelable }) => {
      const parsed = new URL(url);
      return { destination: parsed.origin.startsWith("http://127.0.0.1") ? `${parsed.pathname}${parsed.search}` : parsed.href, cancelable };
    }),
    analytics: window.__m3Analytics.splice(0),
  }));
  const assertNothingPending = async (where) => {
    assert.deepEqual(await drain(), { navigations: [], analytics: [] }, `${page.url()}: navigation or analytics landed after ${where} was recorded`);
  };
  for (let index = 0; index < count; index += 1) {
    const record = {};
    for (const mode of ["surface", "modifier", "link", "selection"]) {
      await assertNothingPending(`the click before card ${index} ${mode}`);
      await page.evaluate((cardIndex, kind) => {
        getSelection().removeAllRanges();
        const card = document.querySelectorAll(".project-card[data-category]")[cardIndex];
        const surface = [...card.querySelectorAll("p, img, h3, span")].find((node) => !node.closest("a, button"));
        const link = card.querySelector("a[href]");
        if (kind === "link" && link) { link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); return; }
        if (kind === "selection") {
          const text = card.querySelector("p");
          const range = document.createRange();
          range.selectNodeContents(text);
          getSelection().addRange(range);
        }
        surface.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: kind === "modifier" }));
      }, index, mode);
      await settleClick();
      const observed = await drain();
      assert.ok(observed.navigations.every((item) => item.cancelable), `${page.url()}: card ${index} ${mode} started a navigation the recorder cannot hold`);
      record[mode] = { navigations: observed.navigations.map((item) => item.destination), analytics: observed.analytics };
    }
    results.push(record);
  }
  await settleClick();
  await assertNothingPending("the last click");
  await page.evaluate(() => { window.__m3NavigationsArmed = false; });
  assert.deepEqual(page.escapedNavigations, [], `${page.url()}: a navigation escaped the in-page recorder`);
  return results;
}

const acceptedArgument = argument("--accepted-root");
const currentArgument = argument("--root");
const fixture = currentArgument ? { mixed: currentArgument, cleanup() {} } : await buildWorksGamesFixture();
const accepted = acceptedArgument ? { root: acceptedArgument, files: null, cleanup() {} } : composeAcceptedArtifact(fixture.mixed);
const acceptedServer = serverFor(accepted.root);
const currentServer = serverFor(fixture.mixed);
await new Promise((resolve) => acceptedServer.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => currentServer.listen(0, "127.0.0.1", resolve));
const ports = { accepted: acceptedServer.address().port, current: currentServer.address().port };
const browser = await puppeteer.launch(browserLaunchOptions);
let assertions = 0;
let searchChecks = 0;
let layoutChecks = 0;
let activationChecks = 0;
let appliedDeltas = 0;
let controls = 0;
try {
  assert.equal(/data-react-main/.test(fs.readFileSync(path.join(accepted.root, "works/index.html"), "utf8")), false, "accepted Works must be the legacy-owned document");
  assert.equal(/data-react-main/.test(fs.readFileSync(path.join(fixture.mixed, "works/index.html"), "utf8")), true, "current Works must be React-owned");
  assertions += 2;
  const desktop = { viewport: { width: 1440, height: 900 }, theme: "dark" };

  for (const route of ROUTES) {
    const acceptedPage = await open(browser, ports.accepted, route, { ...desktop, accepted: true });
    const currentPage = await open(browser, ports.current, route, desktop);
    appliedDeltas += acceptedPage.reviewedDeltas;

    const acceptedMain = await acceptedPage.evaluate(liveMain);
    const currentMain = await currentPage.evaluate(liveMain);
    assert.deepEqual(currentMain.elements, acceptedMain.elements, `${route}: live main DOM drift against the accepted runtime`);
    assert.deepEqual(currentMain.search, acceptedMain.search, `${route}: live search control semantics drift`);
    assert.equal(currentMain.search.type, "search", `${route}: native search input`);
    assert.equal(currentMain.legacyCardMarkers, 0, `${route}: legacy card initializer ran on React-owned main`);
    /* Search copy: server-rendered = live current = live accepted runtime. */
    const html = fs.readFileSync(path.join(fixture.mixed, `${route.slice(1)}index.html`), "utf8");
    const ssr = {
      name: html.match(/data-project-search-label="">([^<]*)</)?.[1],
      placeholder: html.match(/data-project-search="" placeholder="([^"]*)"/)?.[1],
    };
    const decode = (value) => value.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    assert.deepEqual({ name: decode(ssr.name), placeholder: decode(ssr.placeholder) }, { name: acceptedMain.search.name, placeholder: acceptedMain.search.placeholder }, `${route}: SSR search copy is not the accepted runtime copy`);
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
    assertions += 7;

    const categories = await acceptedPage.evaluate(() => [...document.querySelectorAll("[data-filter-btn]")].map((node) => node.dataset.filterBtn));
    assert.deepEqual(await currentPage.evaluate(() => [...document.querySelectorAll("[data-filter-btn]")].map((node) => node.dataset.filterBtn)), categories);
    assert.equal(categories.length, route.endsWith("works/") ? 7 : 5, `${route}: filter count`);
    assertions += 2;
    const cards = await acceptedPage.evaluate(() => [...document.querySelectorAll(".project-card[data-category]")].map((node) => ({ text: node.textContent, link: node.dataset.projectLink || node.dataset.gameLink || "" })));
    const corpus = searchCorpus(cards.map((card) => card.text), cards.map((card) => card.link).filter(Boolean));
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

    /* Card activation contract, compared card by card with the accepted runtime. */
    const acceptedActivation = await open(browser, ports.accepted, route, { ...desktop, accepted: true, intercept: true });
    const currentActivation = await open(browser, ports.current, route, { ...desktop, intercept: true });
    const expectedActivation = await cardActivation(acceptedActivation);
    const actualActivation = await cardActivation(currentActivation);
    assert.deepEqual(actualActivation, expectedActivation, `${route}: card activation drift against the accepted runtime`);
    assert.ok(expectedActivation.some((card) => card.surface.navigations.length === 1), `${route}: at least one card must be navigable`);
    if (route.endsWith("works/")) assert.ok(expectedActivation.some((card) => card.surface.navigations.length === 0), `${route}: the inert card must stay inert`);
    activationChecks += expectedActivation.length * 4;
    assertions += 3;
    await acceptedActivation.close();
    await currentActivation.close();

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const theme of ["dark", "light"]) {
        const label = `${route} ${viewport.width}px ${theme}`;
        /* Background tabs do not render, so each side is measured alone in front. */
        const pages = [];
        for (const [port, isAccepted] of [[ports.accepted, true], [ports.current, false]]) {
          const page = await open(browser, port, route, { viewport, theme, accepted: isAccepted });
          page.layout = await measureLayout(page);
          pages.push(page);
        }
        const [expected, actual] = pages.map((page) => page.layout);
        assertLayout("containment", actual, expected, `${label}: original content-visibility/contain-intrinsic-size`);
        assertLayout("height", actual, expected, `${label}: main height`);
        assertLayout("search", actual, expected, `${label}: search control geometry/style`);
        assertLayout("elements", actual, expected, `${label}: element geometry/style`);
        layoutChecks += actual.elements.length + actual.search.length + actual.containment.length;
        assertions += 4;
        await Promise.all(pages.map((page) => page.close()));
      }
    }
  }
  assert.equal(appliedDeltas, reviewedDeltas.length, "every reviewed copy delta must be applied exactly once on its document");
  assertions += 1;

  /* Negative controls: each sabotages the live current page and must be
   * detected by the same comparison against the live accepted page. */
  const controlOptions = { viewport: { width: 1440, height: 900 }, theme: "dark" };
  const comparisons = [
    ["protected-term casing drift", "/works/", liveMain, () => document.querySelector('[data-message-key="works.category.pythonSoftware"]').removeAttribute("data-preserve-case")],
    ["wrong locale copy", "/works/", liveMain, () => { document.querySelector(".project-card h3 a").textContent = "Wrong locale copy"; }],
    ["unexpected attribute drift", "/works/", liveMain, () => document.querySelector(".project-card").setAttribute("data-category", "ai")],
    ["search copy rewritten after hydration", "/de/works/", liveMain, () => { document.querySelector("[data-project-search]").placeholder = "Nach Projekt, Technologie oder Stichwort suchen..."; }],
    ["layout drift", "/works/", layout, () => { document.querySelector(".project-card h3").style.fontSize = "40px"; }, "elements"],
    ["main height regression", "/games/", layout, () => { document.querySelector("main").style.paddingBottom = "17px"; }, "height"],
    ["CTA background-color regression", "/fr/works/", layout, () => { document.querySelector(".hero-actions .btn.primary").style.setProperty("background", "transparent", "important"); }, "elements"],
    ["content-visibility regression", "/games/", layout, () => { document.querySelector(".games-roadmap").style.setProperty("content-visibility", "visible", "important"); }, "containment"],
  ];
  for (const [name, route, probe, sabotage, layoutField] of comparisons) {
    const acceptedPage = await open(browser, ports.accepted, route, { ...controlOptions, accepted: true });
    await acceptedPage.bringToFront();
    const sample = (page) => (probe === layout ? measureLayout(page) : page.evaluate(probe));
    const comparable = (value) => (probe === layout ? layoutSignature(value) : value);
    const expected = await sample(acceptedPage);
    const currentPage = await open(browser, ports.current, route, controlOptions);
    await currentPage.bringToFront();
    assert.deepEqual(comparable(await sample(currentPage)), comparable(expected), `${name}: control baseline must match before sabotage`);
    await currentPage.evaluate(sabotage);
    const actual = await sample(currentPage);
    if (layoutField) assert.throws(() => assertLayout(layoutField, actual, expected, name), assert.AssertionError, `${name} negative control did not fail`);
    else assert.throws(() => assert.deepEqual(actual, expected), undefined, `${name} negative control did not fail`);
    controls += 1;
    await acceptedPage.close();
    await currentPage.close();
  }
  {
    const pages = [await open(browser, ports.accepted, "/works/", { ...controlOptions, accepted: true }), await open(browser, ports.current, "/works/", controlOptions)];
    const expected = await apply(pages[0], "game", "");
    await apply(pages[1], "game", "");
    await pages[1].evaluate(() => document.querySelector(".project-card.is-hidden").classList.remove("is-hidden"));
    const actual = await pages[1].evaluate(catalogState);
    assert.throws(() => assert.deepEqual(actual, expected), undefined, "incorrect category visibility negative control did not fail");
    controls += 1;
    await Promise.all(pages.map((page) => page.close()));
  }
  for (const [name, route, sabotage, intended] of [
    ["inert card made navigable", "/works/", () => {
      const inert = [...document.querySelectorAll(".project-card[data-category]")].find((card) => !card.dataset.projectLink);
      inert.addEventListener("click", () => { location.href = "/ai-flow-puzzle-case-study/"; });
    }, "card 5 surface navigations"],
    ["Games card analytics added", "/games/", () => {
      document.querySelector(".project-card[data-game-link]").addEventListener("click", () => window.trackAnalyticsNavigation("/merge-rush-case-study/", "games"));
    }, "card 0 surface analytics"],
    ["whole-card navigation missing", "/de/games/", () => {
      /* Stops the click before React's root listener; nested links still work. */
      document.querySelector(".project-card[data-game-link]").addEventListener("click", (event) => event.stopPropagation());
    }, "card 0 surface navigations"],
    ["whole-card destination changed", "/de/games/", () => {
      document.querySelector(".project-card[data-game-link]").addEventListener("click", (event) => {
        if (event.target.closest("a") || event.ctrlKey || String(getSelection()).trim()) return;
        event.stopPropagation();
        location.href = "/de/adventure/";
      });
    }, "card 0 surface navigations"],
    ["nested link destination changed", "/de/works/", () => {
      document.querySelector(".project-card[data-project-link] a[href]").setAttribute("href", "/de/games/");
    }, "card 0 link navigations"],
    ["Works analytics on a modifier click", "/works/", () => {
      document.querySelector(".project-card[data-project-link]").addEventListener("click", (event) => {
        if (event.ctrlKey) window.trackAnalyticsNavigation("/sinama-case-study/", "works");
      });
    }, "card 0 modifier analytics"],
  ]) {
    const acceptedPage = await open(browser, ports.accepted, route, { ...controlOptions, accepted: true, intercept: true });
    const currentPage = await open(browser, ports.current, route, { ...controlOptions, intercept: true });
    const expected = await cardActivation(acceptedPage);
    assert.deepEqual(await cardActivation(currentPage), expected, `${name}: control baseline must match before sabotage`);
    await currentPage.evaluate(sabotage);
    /* The browser step must complete on its own: a Puppeteer, protocol or page
     * failure fails the gate instead of satisfying the control. Only the
     * comparison may fail, with an assertion, at the sabotaged card. */
    const actual = await cardActivation(currentPage);
    assert.deepEqual(currentPage.diagnostics, [], `${name}: browser diagnostics during the control`);
    assert.throws(() => assert.deepEqual(actual, expected), assert.AssertionError, `${name} negative control did not fail`);
    const drift = activationDrift(actual, expected);
    const card = intended.split(" ").slice(0, 2).join(" ");
    assert.ok(drift.includes(intended), `${name}: expected drift at ${intended}, found ${drift.join("; ") || "none"}`);
    assert.ok(drift.every((item) => item.startsWith(`${card} `)), `${name}: drift outside ${card}: ${drift.join("; ")}`);
    controls += 1;
    await acceptedPage.close();
    await currentPage.close();
  }

  console.log(`G-65 Works/Games accepted differential passed. ${assertions} assertions · 10 documents · composed accepted artifact ${accepted.verifiedFiles ?? accepted.files ?? "(external)"} non-#29 files hash-exact · ${searchChecks} search/filter states · ${activationChecks} card activations · ${layoutChecks} element geometry/style checks (desktop/mobile × dark/light) · ${appliedDeltas} reviewed copy deltas · ${controls} live negative controls · authority=${M3_26_ACCEPTED_REF}.`);
} finally {
  await browser.close();
  await new Promise((resolve) => acceptedServer.close(resolve));
  await new Promise((resolve) => currentServer.close(resolve));
  fixture.cleanup();
  accepted.cleanup();
}
