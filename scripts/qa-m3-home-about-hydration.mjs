#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildHomeAboutFixture, homeAboutRouteRecords, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";

const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const hydrationProbe = `<script>
(() => {
  const main = document.querySelector("main[data-react-main]");
  if (!main) throw new Error("G-61 probe could not find the React main");
  const probe = window.__m3HydrationProbe = {
    main,
    innerHTML: main.innerHTML,
    children: [...main.childNodes],
    mutations: [],
    complete: false,
  };
  const observer = new MutationObserver((records) => probe.mutations.push(...records.map((record) => ({ type: record.type, target: record.target.nodeName }))));
  observer.observe(main, { attributes: true, characterData: true, childList: true, subtree: true });
  addEventListener("DOMContentLoaded", () => queueMicrotask(() => {
    probe.mutations.push(...observer.takeRecords().map((record) => ({ type: record.type, target: record.target.nodeName })));
    probe.postMain = document.querySelector("main[data-react-main]");
    probe.postInnerHTML = probe.postMain?.innerHTML;
    probe.postChildren = [...(probe.postMain?.childNodes || [])];
    probe.complete = true;
    observer.disconnect();
  }), { once: true });
})();
</script>`;
function serverFor(root) {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found"); return;
    }
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    if (path.extname(file) === ".html") {
      const html = fs.readFileSync(file, "utf8").replace(/(<script type="module" src="\/assets-react\/[^\"]+"><\/script>)/, `${hydrationProbe}$1`);
      response.end(html);
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
}

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`G-61 root does not exist: ${requestedRoot}`);
const fixture = requestedRoot
  ? { mixed: requestedRoot, routes: homeAboutRouteRecords(), cleanup() {} }
  : await buildHomeAboutFixture();
const server = serverFor(fixture.mixed);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch({ headless: true });
let assertions = 0;
try {
  for (const route of fixture.routes.filter((item) => HOME_ABOUT_IDS.has(item.routeId))) {
    const page = await browser.newPage();
    const diagnostics = [];
    page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
    const response = await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      locale: document.documentElement.dataset.routeLocale,
      probeComplete: window.__m3HydrationProbe?.complete,
      sameMain: window.__m3HydrationProbe?.main === window.__m3HydrationProbe?.postMain,
      sameInnerHTML: window.__m3HydrationProbe?.innerHTML === window.__m3HydrationProbe?.postInnerHTML,
      sameChildren: window.__m3HydrationProbe?.children.length === window.__m3HydrationProbe?.postChildren.length && window.__m3HydrationProbe.children.every((node, index) => node === window.__m3HydrationProbe.postChildren[index]),
      mutations: window.__m3HydrationProbe?.mutations || [],
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute("href")),
      clientBundles: document.querySelectorAll('script[type="module"][src^="/assets-react/"]').length,
      chatbot: document.querySelectorAll("[data-portfolio-chatbot]").length,
      recruiter: document.querySelectorAll("[data-recruiter-drawer]").length,
      command: document.querySelectorAll("[data-command-palette]").length,
      languageSelectors: document.querySelectorAll("[data-lang-select]").length,
      languageOptions: document.querySelectorAll("[data-lang-select] option").length,
      buildItems: document.querySelectorAll("[data-build-log] .build-log-item").length,
    }));
    assert.equal(response.status(), 200, `${route.pathname}: response`); assertions += 1;
    assert.deepEqual(diagnostics, [], `${route.pathname}: console diagnostics`); assertions += 1;
    assert.equal(state.locale, route.locale); assertions += 1;
    assert.equal(state.lang, route.locale); assertions += 1;
    assert.equal(state.probeComplete, true, `${route.pathname}: hydration probe did not complete`); assertions += 1;
    assert.equal(state.sameMain, true, `${route.pathname}: hydration replaced main`); assertions += 1;
    assert.equal(state.sameInnerHTML, true, `${route.pathname}: hydration changed main markup`); assertions += 1;
    assert.equal(state.sameChildren, true, `${route.pathname}: hydration replaced a main child`); assertions += 1;
    assert.deepEqual(state.mutations, [], `${route.pathname}: hydration mutated the React subtree`); assertions += 1;
    assert.deepEqual(state.styles.filter((href) => href.startsWith("/")), ["/style.css", "/css/a11y.css", "/portfolio-v2.css"]); assertions += 1;
    assert.equal(state.clientBundles, 1, `${route.pathname}: production client bundle count`); assertions += 1;
    assert.equal(state.chatbot, 1, `${route.pathname}: AJOOP shell count`); assertions += 1;
    assert.equal(state.recruiter, 1, `${route.pathname}: recruiter shell count`); assertions += 1;
    assert.equal(state.command, 1, `${route.pathname}: command shell count`); assertions += 1;
    assert.equal(state.languageSelectors, 1, `${route.pathname}: language selector count`); assertions += 1;
    assert.equal(state.languageOptions, 5, `${route.pathname}: language option count`); assertions += 1;
    assert.equal(state.buildItems, route.routeId === "home" ? 3 : 0); assertions += 1;

    const beforeTheme = await page.$eval("html", (node) => node.dataset.theme);
    await page.click("[data-theme-toggle]");
    const afterTheme = await page.$eval("html", (node) => node.dataset.theme);
    assert.notEqual(afterTheme, beforeTheme, `${route.pathname}: theme interaction`); assertions += 1;
    assert.equal(await page.$eval("[data-theme-toggle]", (node) => node.getAttribute("aria-pressed")), String(afterTheme === "light")); assertions += 1;

    await page.click("[data-recruiter-toggle]");
    const recruiterState = await page.evaluate(() => ({
      active: document.body.classList.contains("recruiter-mode-active"),
      hidden: document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden"),
      expanded: [...document.querySelectorAll("[data-recruiter-toggle]")].every((node) => node.getAttribute("aria-expanded") === "true"),
    }));
    assert.deepEqual(recruiterState, { active: true, hidden: "false", expanded: true }, `${route.pathname}: recruiter interaction`); assertions += 1;
    await page.close();
  }

  const languagePage = await browser.newPage();
  const languageDiagnostics = [];
  languagePage.on("console", (message) => { if (["error", "warn"].includes(message.type())) languageDiagnostics.push(`${message.type()}: ${message.text()}`); });
  languagePage.on("pageerror", (error) => languageDiagnostics.push(`pageerror: ${error.message}`));
  await languagePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  await Promise.all([
    languagePage.waitForNavigation({ waitUntil: "networkidle0" }),
    languagePage.select("[data-lang-select]", "tr"),
  ]);
  assert.equal(new URL(languagePage.url()).pathname, "/tr/"); assertions += 1;
  assert.equal(await languagePage.$eval("html", (node) => node.dataset.routeLocale), "tr"); assertions += 1;
  assert.equal(await languagePage.$eval("main", (node) => node.hasAttribute("data-react-main")), true); assertions += 1;
  assert.deepEqual(languageDiagnostics, []); assertions += 1;
  await languagePage.close();
  console.log(`G-61 Home/About hydration passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · 10 documents · exact pre/post DOM · zero mutations/warnings · shell interactions passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
