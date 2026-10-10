/* V4-E06.6 — the catalog cards' images.
 *
 *   node scripts/v4-e06-6-card-images.mjs            derive the card variants
 *   node scripts/v4-e06-6-card-images.mjs --capture  also re-capture the Joyday studio frame
 *                                                    (needs the preview server; V4_CAPTURE_PORT)
 *
 * A card never loads a project's full-size cover. For every catalog entry with
 * `card.image.source`, this writes WebP variants no wider than 640 and 960 px
 * (never upscaled) to assets/catalog/ and records them, with their real
 * dimensions, as `card.image.variants` in data/portfolio/catalog.json.
 *
 * Nothing is drawn or invented here: a variant is the source image, resized.
 * The captured frames are the running games themselves. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CATALOG = join(ROOT, "data", "portfolio", "catalog.json");
const OUTPUT = "assets/catalog";
const WIDTHS = [640, 960];
const QUALITY = 0.8;
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
const entries = [...catalog.identities, ...catalog.collections.flatMap((collection) => collection.members)].filter((entry) => entry.card?.image);
const browser = await puppeteer.launch({ headless: true });
await mkdir(join(ROOT, OUTPUT, "source"), { recursive: true });

if (process.argv.includes("--capture")) {
  const origin = `http://127.0.0.1:${process.env.V4_CAPTURE_PORT || "4187"}`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${origin}/joyday-paint/`, { waitUntil: "networkidle0" });
  const press = (label) => page.evaluate((text) => {
    const target = [...document.querySelectorAll("button, a")].find((node) => node.textContent.trim().toLowerCase() === text && node.getClientRects().length);
    if (!target) throw new Error(`no "${text}" control`);
    target.click();
  }, label);
  await press("start painting");
  await wait(700);
  await press("start painting");
  await wait(900);
  const box = await page.evaluate(() => { const rect = document.querySelector("#joyday-art-canvas").getBoundingClientRect(); return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }; });
  const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
  /* A few real throws, each in another colour of the studio's own palette. */
  const swatches = await page.evaluate(() => [...document.querySelectorAll("button")].filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 24 && rect.width < 60 && Math.abs(rect.width - rect.height) < 2 && rect.x > innerWidth * 0.7 && rect.y < innerHeight * 0.3; }).map((node) => { const rect = node.getBoundingClientRect(); return [rect.x + rect.width / 2, rect.y + rect.height / 2]; }));
  const strokes = [[[0.2, 0.25], [0.7, 0.4]], [[0.75, 0.2], [0.35, 0.75]], [[0.25, 0.7], [0.8, 0.78]], [[0.5, 0.15], [0.55, 0.6]], [[0.15, 0.5], [0.45, 0.9]]];
  for (const [index, [from, to]] of strokes.entries()) {
    const swatch = swatches[[2, 6, 4, 7, 3][index]];
    if (swatch) { await page.mouse.click(...swatch); await wait(200); }
    await page.mouse.move(...at(...from));
    await page.mouse.down();
    await page.mouse.move(...at(...to), { steps: 14 });
    await page.mouse.up();
    await wait(450);
  }
  await wait(900);
  await writeFile(join(ROOT, OUTPUT, "source", "joyday-action-painting.webp"), await page.screenshot({ type: "webp", quality: 84 }));
  await page.close();

  /* The other two in-house games, a moment after Play, and this site's own Home. */
  for (const [id, route, start] of [["career-adventure", "/adventure/", ["play career adventure", "play"]], ["ai-flow-puzzle", "/ai-flow-puzzle/", ["play", "start mission"]], ["portfolio-v4", "/", []]]) {
    const game = await browser.newPage();
    await game.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await game.goto(`${origin}${route}`, { waitUntil: "networkidle0" });
    for (const label of start) {
      await game.evaluate((text) => {
        const target = [...document.querySelectorAll("button, a")].find((node) => node.textContent.replace(/[^\p{L} ]/gu, "").trim().toLowerCase() === text && node.getClientRects().length);
        if (!target) throw new Error(`no "${text}" control`);
        target.click();
      }, label);
      await wait(900);
    }
    await wait(1800);
    await writeFile(join(ROOT, OUTPUT, "source", `${id}.webp`), await game.screenshot({ type: "webp", quality: 84 }));
    await game.close();
  }
  console.log("captured the three game frames and the Home page");
}

const page = await browser.newPage();
let written = 0;
for (const entry of entries) {
  const source = entry.card.image.source;
  const data = `data:${MIME[extname(source).toLowerCase()]};base64,${(await readFile(join(ROOT, source))).toString("base64")}`;
  const variants = await page.evaluate(async (url, widths, quality) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const sizes = [...new Set(widths.map((width) => Math.min(width, image.naturalWidth)))];
    return sizes.map((width) => {
      const height = Math.round((image.naturalHeight * width) / image.naturalWidth);
      const canvas = Object.assign(document.createElement("canvas"), { width, height });
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      return { width, height, data: canvas.toDataURL("image/webp", quality).split(",")[1] };
    });
  }, data, WIDTHS, QUALITY);
  entry.card.image.variants = [];
  for (const variant of variants) {
    const file = `${OUTPUT}/${entry.id}-${variant.width}.webp`;
    await writeFile(join(ROOT, file), Buffer.from(variant.data, "base64"));
    entry.card.image.variants.push({ src: file, width: variant.width, height: variant.height });
    written += 1;
  }
}
await browser.close();
await writeFile(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`card images: ${written} variants for ${entries.length} cards`);
