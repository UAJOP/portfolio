import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = process.env.ATELIS_CAPTURE_DIR || "C:\\PC-Audit\\v4-review\\atelis-case-study-2026-10-19";
const PORT = process.env.ATELIS_CAPTURE_PORT || "4390";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const locales = ["", "tr/", "de/", "es/", "fr/"];
const viewports = [["desktop", 1440, 900], ["tablet", 768, 1024], ["phone", 390, 844]];
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

await mkdir(OUTPUT, { recursive: true });
const server = spawn(process.execPath, [join(ROOT, "scripts", "v4-preview-server.mjs")], {
  cwd: ROOT,
  env: { ...process.env, PORT },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${ORIGIN}/__v4/health`)).ok) break; } catch {}
    await wait(100);
  }
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000 });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  for (const locale of locales) {
    const path = `/${locale}atelis-design-case-study/`;
    const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll("main img")];
      images.forEach((image) => { image.loading = "eager"; });
      await Promise.all(images.map((image) => image.complete && image.naturalWidth ? image.decode().catch(() => {}) : new Promise((done) => {
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      })));
    });
    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelectorAll("main h1").length,
      images: [...document.querySelectorAll("main img")].map((image) => ({ alt: image.alt, width: image.naturalWidth })),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
    }));
    check(`${locale || "en/"} direct route returns 200`, response?.status() === 200, response?.status());
    check(`${locale || "en/"} has localized document language`, state.lang === (locale ? locale.slice(0, 2) : "en"), state.lang);
    check(`${locale || "en/"} has one H1 and nine loaded evidence images`, state.h1 === 1 && state.images.length === 9 && state.images.every((image) => image.alt && image.width > 0), `${state.h1} H1 · ${state.images.length} images`);
    check(`${locale || "en/"} canonical is locale-correct`, state.canonical === `https://kaanbalci.com${path}`, state.canonical);
    check(`${locale || "en/"} has no horizontal overflow`, !state.overflow);
  }

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${ORIGIN}/works/`, { waitUntil: "networkidle0" });
  check("Works renders Atelis exactly once", await page.$$eval('[data-project-id="atelis-design"]', (nodes) => nodes.length) === 1);
  await page.click('[data-filter-btn="web"]');
  check("Web & Product filter keeps Atelis visible", await page.$eval('[data-project-id="atelis-design"]', (node) => getComputedStyle(node).display !== "none" && !node.hidden));
  await page.click('[data-filter-btn="all"]');
  await page.type('[data-project-search]', "Atelis");
  await wait(250);
  check("project search isolates Atelis", await page.$$eval('[data-v4-card=""]', (nodes) => nodes.filter((node) => !node.classList.contains("is-hidden")).length) === 1);

  for (const [label, width, height] of viewports) {
    await page.setViewport({ width, height, deviceScaleFactor: label === "phone" ? 2 : 1, isMobile: label !== "desktop", hasTouch: label !== "desktop" });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: label === "tablet" ? "reduce" : "no-preference" }]);
    await page.goto(`${ORIGIN}/atelis-design-case-study/`, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll("main img")];
      images.forEach((image) => { image.loading = "eager"; });
      await Promise.all(images.map((image) => image.complete && image.naturalWidth ? image.decode().catch(() => {}) : new Promise((done) => {
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      })));
    });
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, broken: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length }));
    check(`${label} case-study layout has no overflow or broken image`, !layout.overflow && layout.broken === 0, JSON.stringify(layout));
    await page.screenshot({ path: join(OUTPUT, `atelis-case-study-${label}-hero.png`) });
    const gallery = await page.$(".atelis-gallery");
    if (gallery) {
      await gallery.screenshot({ path: join(OUTPUT, `atelis-case-study-${label}-gallery.png`) });
    }
  }

  const errorsBefore404 = [...consoleErrors];
  const missing = await page.goto(`${ORIGIN}/atelis-design-case-studies/`, { waitUntil: "domcontentloaded" });
  check("wrong slug returns the real 404", missing?.status() === 404, missing?.status());
  check("browser console remains clean on valid routes", errorsBefore404.length === 0, errorsBefore404.join(" | "));
} finally {
  if (browser) await browser.close();
  server.kill();
}

await writeFile(join(OUTPUT, "qa-summary.json"), JSON.stringify({ origin: ORIGIN, output: OUTPUT, results }, null, 2));
const failures = results.filter((result) => !result.pass);
console.log(`Atelis browser FEATURE: ${results.length - failures.length} passed, ${failures.length} failed · ${OUTPUT}`);
if (failures.length) process.exit(1);
