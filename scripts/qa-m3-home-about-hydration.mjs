#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildHomeAboutFixture, homeAboutRouteRecords, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";

const COMPLETE_EVENT = "portfolio:react-main-hydrated";
const ERROR_EVENT = "portfolio:react-main-hydration-error";
const START_EVENT = "portfolio:react-main-hydration-start";
const browserLaunchOptions = process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const hydrationProbe = `<script>
(() => {
  const main = document.querySelector("main[data-react-main]");
  if (!main) throw new Error("G-61 probe could not find the React main");
  const collectNodes = (root) => {
    const nodes = [root];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  };
  const attributes = (root) => collectNodes(root).filter((node) => node.nodeType === Node.ELEMENT_NODE).map((node) => ({
    node,
    values: Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value]).sort()),
  }));
  const probe = window.__m3HydrationProbe = {
    main, innerHTML: main.innerHTML, nodes: collectNodes(main), attributes: attributes(main),
    mutations: [], recoverableErrors: [], signals: 0, started: false, settled: false, failure: null,
  };
  const describe = (record) => ({
    type: record.type, target: record.target.nodeName,
    attributeName: record.attributeName || null, oldValue: record.oldValue ?? null,
  });
  const observer = new MutationObserver((records) => probe.mutations.push(...records.map(describe)));
  observer.observe(main, { attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, childList: true, subtree: true });
  const finish = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
    probe.mutations.push(...observer.takeRecords().map(describe));
    probe.postMain = document.querySelector("main[data-react-main]");
    probe.postInnerHTML = probe.postMain?.innerHTML;
    probe.postNodes = probe.postMain ? collectNodes(probe.postMain) : [];
    probe.postAttributes = probe.postMain ? attributes(probe.postMain) : [];
    probe.settled = true;
    observer.disconnect();
  }, 0)));
  addEventListener("portfolio:react-main-hydration-start", () => { probe.started = true; });
  addEventListener("portfolio:react-main-hydration-error", (event) => probe.recoverableErrors.push(event.detail || {}));
  addEventListener("portfolio:react-main-hydrated", () => { probe.signals += 1; finish(); }, { once: true });
  setTimeout(() => {
    if (probe.settled || probe.signals) return;
    probe.failure = "hydration completion signal timeout";
    probe.mutations.push(...observer.takeRecords().map(describe));
    probe.settled = true;
    observer.disconnect();
  }, 2500);
})();
</script>`;

const mutantScript = (mode) => {
  if (mode === "descendant-replaced") return `<script>addEventListener("portfolio:react-main-hydrated",()=>{const node=document.querySelector("main[data-react-main] *");node.replaceWith(node.cloneNode(true));},{once:true});</script>`;
  if (mode === "attribute-changed") return `<script>addEventListener("portfolio:react-main-hydrated",()=>document.querySelector("main[data-react-main]").setAttribute("data-g61-mutant","true"),{once:true});</script>`;
  if (mode === "recoverable-error") return `<script>{const main=document.querySelector("main[data-react-main]");const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);const text=walker.nextNode();if(text)text.data+=" mutant";}</script>`;
  return "";
};

function serverFor(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const pathname = decodeURIComponent(url.pathname);
    const mode = url.searchParams.get("g61");
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found"); return;
    }
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (path.extname(file) === ".html") {
      const modulePattern = /(<script type="module" src="\/assets-react\/[^"]+"><\/script>)/;
      let moduleScript = "$1";
      if (mode === "never-starts") moduleScript = "";
      if (mode === "no-signal") moduleScript = "<script>window.__m3SyntheticHydrationStarted=true;</script>";
      response.end(fs.readFileSync(file, "utf8").replace(modulePattern, `${hydrationProbe}${mutantScript(mode)}${moduleScript}`));
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
}

const probeState = () => {
  const probe = window.__m3HydrationProbe;
  return {
    started: probe?.started || Boolean(window.__m3SyntheticHydrationStarted),
    settled: probe?.settled, failure: probe?.failure, signals: probe?.signals,
    recoverableErrors: probe?.recoverableErrors || [],
    sameMain: probe?.main === probe?.postMain,
    sameInnerHTML: probe?.innerHTML === probe?.postInnerHTML,
    sameNodes: probe?.nodes?.length === probe?.postNodes?.length && probe.nodes.every((node, index) => node === probe.postNodes[index]),
    sameAttributes: probe?.attributes?.length === probe?.postAttributes?.length && probe.attributes.every((entry, index) => entry.node === probe.postAttributes[index].node && JSON.stringify(entry.values) === JSON.stringify(probe.postAttributes[index].values)),
    mutations: probe?.mutations || [],
  };
};

function assertCompletedHydration(state, label) {
  assert.equal(state.started, true, `${label}: hydration never started`);
  assert.equal(state.settled, true, `${label}: probe did not settle`);
  assert.equal(state.failure, null, `${label}: ${state.failure || "probe failure"}`);
  assert.equal(state.signals, 1, `${label}: completion signal count`);
  assert.deepEqual(state.recoverableErrors, [], `${label}: React reported a recoverable hydration error`);
  assert.equal(state.sameMain, true, `${label}: hydration replaced main`);
  assert.equal(state.sameInnerHTML, true, `${label}: hydration changed main markup/content/attributes`);
  assert.equal(state.sameNodes, true, `${label}: hydration replaced a descendant node`);
  assert.equal(state.sameAttributes, true, `${label}: hydration changed an element attribute map`);
  assert.deepEqual(state.mutations, [], `${label}: hydration mutated the React subtree`);
}

async function waitForProbe(page) {
  await page.waitForFunction(() => window.__m3HydrationProbe?.settled === true, { timeout: 5000 });
  return page.evaluate(probeState);
}

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`G-61 root does not exist: ${requestedRoot}`);
const fixture = requestedRoot ? { mixed: requestedRoot, routes: homeAboutRouteRecords(), cleanup() {} } : await buildHomeAboutFixture();
const server = serverFor(fixture.mixed);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch(browserLaunchOptions);
let assertions = 0;
try {
  for (const route of fixture.routes.filter((item) => HOME_ABOUT_IDS.has(item.routeId))) {
    const page = await browser.newPage();
    await page.setViewport({ width: 700, height: 900 });
    const diagnostics = [];
    page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
    const response = await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "domcontentloaded" });
    assertCompletedHydration(await waitForProbe(page), route.pathname); assertions += 10;
    const shell = await page.evaluate(() => ({
      lang: document.documentElement.lang, locale: document.documentElement.dataset.routeLocale,
      current: document.querySelectorAll('[data-nav] a[aria-current="page"]').length,
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute("href")),
      clientBundles: document.querySelectorAll('script[type="module"][src^="/assets-react/"]').length,
      chatbot: document.querySelectorAll("[data-portfolio-chatbot]").length,
      recruiter: document.querySelectorAll("[data-recruiter-drawer]").length,
      command: document.querySelectorAll("[data-command-palette]").length,
      languageSelectors: document.querySelectorAll("[data-lang-select]").length,
      languageOptions: document.querySelectorAll("[data-lang-select] option").length,
      buildItems: document.querySelectorAll("[data-build-log] .build-log-item").length,
    }));
    assert.equal(response.status(), 200); assertions += 1;
    assert.deepEqual(diagnostics, [], `${route.pathname}: console diagnostics`); assertions += 1;
    assert.equal(shell.locale, route.locale); assert.equal(shell.lang, route.locale); assertions += 2;
    assert.equal(shell.current, 1, `${route.pathname}: one current navigation route`); assertions += 1;
    /* #32A: the icon subset is a local stylesheet, ahead of the site layers. */
    assert.deepEqual(shell.styles.filter((href) => href.startsWith("/")), [
      "/css/boxicons-subset.css", "/style.css", "/css/a11y.css", "/portfolio-v2.css", "/css/v4-system.css",
      route.routeId === "home" ? "/css/v4-home.css" : "/css/v4-about.css",
    ]); assertions += 1;
    assert.deepEqual([shell.clientBundles, shell.chatbot, shell.recruiter, shell.command, shell.languageSelectors, shell.languageOptions], [1, 1, 1, 1, 1, 5]); assertions += 6;
    assert.equal(shell.buildItems, route.routeId === "home" ? 3 : 0); assertions += 1;

    const beforeTheme = await page.$eval("html", (node) => node.dataset.theme);
    await page.click("[data-theme-toggle]");
    const afterTheme = await page.$eval("html", (node) => node.dataset.theme);
    assert.notEqual(afterTheme, beforeTheme); assertions += 1;
    assert.equal(await page.$eval("[data-theme-toggle]", (node) => node.getAttribute("aria-pressed")), String(afterTheme === "light")); assertions += 1;
    await page.click(".nav-toggle");
    assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector("[data-nav]").classList.contains("is-open"), expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded") })), { open: true, expanded: "true" }); assertions += 1;
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector("[data-nav]").classList.contains("is-open"), expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"), focused: document.activeElement === document.querySelector(".nav-toggle") })), { open: false, expanded: "false", focused: true }); assertions += 1;
    await page.click("[data-command-toggle]");
    assert.deepEqual(await page.$eval("[data-command-palette]", (node) => ({ open: node.classList.contains("is-open"), hidden: node.hidden, ariaHidden: node.getAttribute("aria-hidden") })), { open: true, hidden: false, ariaHidden: "false" }); assertions += 1;
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("[data-command-toggle]")), true); assertions += 1;
    await page.click("[data-chatbot-toggle]");
    assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"), expanded: document.querySelector("[data-chatbot-toggle]").getAttribute("aria-expanded"), hidden: document.querySelector("[data-chatbot-panel]").getAttribute("aria-hidden") })), { open: true, expanded: "true", hidden: "false" }); assertions += 1;
    await page.click("[data-chatbot-close]");
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector("[data-chatbot-toggle]")), true); assertions += 1;
    await page.click("[data-recruiter-toggle]");
    assert.deepEqual(await page.evaluate(() => ({ active: document.body.classList.contains("recruiter-mode-active"), hidden: document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden"), expanded: [...document.querySelectorAll("[data-recruiter-toggle]")].every((node) => node.getAttribute("aria-expanded") === "true") })), { active: true, hidden: "false", expanded: true }); assertions += 1;
    await page.close();
  }

  for (const [mode, expected] of [
    ["never-starts", /hydration never started/],
    ["no-signal", /completion signal timeout/],
    ["descendant-replaced", /replaced a descendant|changed main markup|mutated the React subtree/],
    ["attribute-changed", /changed main markup|changed an element attribute|mutated the React subtree/],
    ["recoverable-error", /recoverable hydration error/],
  ]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?g61=${mode}`, { waitUntil: "domcontentloaded" });
    const state = await waitForProbe(page);
    assert.throws(() => assertCompletedHydration(state, mode), expected, `G-61 negative control must reject ${mode}`); assertions += 1;
    await page.close();
  }

  const languagePage = await browser.newPage();
  await languagePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await waitForProbe(languagePage);
  await Promise.all([languagePage.waitForNavigation({ waitUntil: "domcontentloaded" }), languagePage.select("[data-lang-select]", "tr")]);
  assertCompletedHydration(await waitForProbe(languagePage), "/tr/ language navigation"); assertions += 10;
  assert.equal(new URL(languagePage.url()).pathname, "/tr/"); assertions += 1;
  await languagePage.close();
  console.log(`G-61 Home/About completed hydration passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · 10 documents · five failing negative controls · exact subtree identity/markup/attributes · shell interactions passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
