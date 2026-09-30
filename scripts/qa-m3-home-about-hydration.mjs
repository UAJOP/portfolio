#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildHomeAboutFixture, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";

const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
function serverFor(root) {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found"); return;
    }
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  });
}

const fixture = await buildHomeAboutFixture();
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
    await page.evaluateOnNewDocument(() => {
      window.__m3CaptureMain = new MutationObserver(() => {
        const main = document.querySelector("main[data-react-main]");
        if (main && !window.__m3InitialMain) window.__m3InitialMain = main;
      });
      window.__m3CaptureMain.observe(document, { childList: true, subtree: true });
    });
    const response = await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      locale: document.documentElement.dataset.routeLocale,
      sameMain: window.__m3InitialMain === document.querySelector("main[data-react-main]"),
      styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute("href")),
      clientBundles: document.querySelectorAll('script[type="module"][src^="/assets-react/"]').length,
      overlays: document.querySelectorAll("[data-portfolio-chatbot], .recruiter-drawer, .command-palette").length,
      buildItems: document.querySelectorAll("[data-build-log] .build-log-item").length,
    }));
    assert.equal(response.status(), 200, `${route.pathname}: response`); assertions += 1;
    assert.deepEqual(diagnostics, [], `${route.pathname}: console diagnostics`); assertions += 1;
    assert.equal(state.locale, route.locale); assertions += 1;
    assert.equal(state.lang, route.locale); assertions += 1;
    assert.equal(state.sameMain, true, `${route.pathname}: hydration replaced main`); assertions += 1;
    assert.deepEqual(state.styles.filter((href) => href.startsWith("/")), ["/style.css", "/css/a11y.css", "/portfolio-v2.css"]); assertions += 1;
    assert.equal(state.clientBundles, 1, `${route.pathname}: production client bundle count`); assertions += 1;
    assert.ok(state.overlays <= 3, `${route.pathname}: duplicate overlay initialization`); assertions += 1;
    assert.equal(state.buildItems, route.routeId === "home" ? 3 : 0); assertions += 1;
    await page.close();
  }
  console.log(`G-61 Home/About hydration passed. ${assertions} assertions · 10 documents · zero console/React warnings · main identity preserved.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
