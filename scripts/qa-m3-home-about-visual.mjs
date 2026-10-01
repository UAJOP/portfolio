#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildHomeAboutFixture, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";

const browserLaunchOptions = process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true };
const outputDirectory = process.env.M3_VISUAL_OUTPUT
  ? path.resolve(process.env.M3_VISUAL_OUTPUT)
  : path.resolve("artifacts/m3-home-about-visual");
const mediaTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const viewports = {
  desktop: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1 },
};

function serve(root) {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": `${mediaTypes[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  });
}

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

async function pixelDifference(page, left, right) {
  return page.evaluate(async (sources) => {
    const load = (source) => new Promise((resolve) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.src = source;
    });
    const [a, b] = await Promise.all(sources.map(load));
    if (a.width !== b.width || a.height !== b.height) return { dimensionsMatch: false };
    const canvas = document.createElement("canvas");
    canvas.width = a.width;
    canvas.height = a.height;
    const context = canvas.getContext("2d");
    context.drawImage(a, 0, 0);
    const first = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(b, 0, 0);
    const second = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0;
    let totalDelta = 0;
    for (let index = 0; index < first.length; index += 4) {
      const delta = Math.max(
        Math.abs(first[index] - second[index]),
        Math.abs(first[index + 1] - second[index + 1]),
        Math.abs(first[index + 2] - second[index + 2]),
        Math.abs(first[index + 3] - second[index + 3]),
      );
      if (delta > 0) {
        changed += 1;
        totalDelta += delta;
      }
    }
    return {
      dimensionsMatch: true,
      changedRatio: changed / (canvas.width * canvas.height),
      meanPixelDelta: totalDelta / (canvas.width * canvas.height),
    };
  }, [left, right].map((buffer) => `data:image/png;base64,${buffer.toString("base64")}`));
}

async function capture(browser, origin, route, theme, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((chosenTheme) => {
    localStorage.setItem("kaanbalci-site-theme", chosenTheme);
  }, theme);
  try {
    const response = await page.goto(`${origin}${route.pathname}`, { waitUntil: "networkidle0" });
    assert.equal(response.status(), 200, `${route.pathname}: visual response`);
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}.reveal{opacity:1!important;transform:none!important}" });
    await page.evaluate(async (chosenTheme) => {
      await document.fonts.ready;
      document.documentElement.dataset.theme = chosenTheme;
      document.querySelectorAll("img").forEach((image) => { image.loading = "eager"; });
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      await Promise.all([...document.images].map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        })));
      window.scrollTo(0, 0);
    }, theme);
    return await page.screenshot({ fullPage: true, type: "png" });
  } finally {
    await page.close();
  }
}

const fixture = await buildHomeAboutFixture();
const legacyServer = serve(fixture.legacy);
const reactServer = serve(fixture.mixed);
await Promise.all([listen(legacyServer), listen(reactServer)]);
const legacyOrigin = `http://127.0.0.1:${legacyServer.address().port}`;
const reactOrigin = `http://127.0.0.1:${reactServer.address().port}`;
const browser = await puppeteer.launch(browserLaunchOptions);
const comparisonPage = await browser.newPage();
fs.mkdirSync(outputDirectory, { recursive: true });
let comparisons = 0;
let exactMatches = 0;
let maximumChangedRatio = 0;
let maximumMeanDelta = 0;
try {
  const routes = fixture.routes.filter((route) => HOME_ABOUT_IDS.has(route.routeId));
  assert.equal(routes.length, 10, "visual matrix requires exactly 10 Home/About documents");
  for (const route of routes) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      for (const theme of ["dark", "light"]) {
        const legacy = await capture(browser, legacyOrigin, route, theme, viewport);
        const react = await capture(browser, reactOrigin, route, theme, viewport);
        const label = `${route.locale}-${route.routeId}-${viewportName}-${theme}`;
        fs.writeFileSync(path.join(outputDirectory, `${label}.png`), react);
        if (digest(react) === digest(legacy)) {
          exactMatches += 1;
        } else {
          const difference = await pixelDifference(comparisonPage, legacy, react);
          maximumChangedRatio = Math.max(maximumChangedRatio, difference.changedRatio || 0);
          maximumMeanDelta = Math.max(maximumMeanDelta, difference.meanPixelDelta || 0);
          const acceptedRasterVariance = difference.dimensionsMatch
            && difference.changedRatio <= 0.02
            && difference.meanPixelDelta <= 0.1;
          if (!acceptedRasterVariance) fs.writeFileSync(path.join(outputDirectory, `${label}-legacy.png`), legacy);
          assert.ok(acceptedRasterVariance, `${label}: visual difference exceeds raster tolerance (${JSON.stringify(difference)})`);
        }
        comparisons += 1;
      }
    }
  }
  console.log(`Home/About visual parity passed. ${comparisons} pixel comparisons (${exactMatches} byte-exact) · max changed ratio ${(maximumChangedRatio * 100).toFixed(3)}% · max whole-image mean delta ${maximumMeanDelta.toFixed(3)}/255.`);
  console.log(`Visual evidence: ${outputDirectory}`);
} finally {
  await browser.close();
  await Promise.all([close(legacyServer), close(reactServer)]);
  fixture.cleanup();
}
