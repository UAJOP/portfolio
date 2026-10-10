/* V4-E04.1: production assets from the approved AJOOP brand pack.
 *
 *   node scripts/v4-ajoop-brand-assets.mjs <folder holding the approved PNGs>
 *
 * The pack is the source of truth and is not in Git; this writes the optimized
 * files the site ships to assets/. Nothing is redrawn: each output is the
 * approved raster resized (and, for the wordmark, trimmed of its transparent
 * margin) and encoded as WebP, the format the site's other production images
 * use. There is no image dependency: the headless Chromium the QA scripts
 * already use does the resampling and the encoding.
 *
 * The wordmark is named for the surface it sits on. In the pack the names
 * follow the lettering instead ("…-light.png" is the white lettering, the one
 * a dark surface needs), so the name is crossed here on purpose. The site
 * sets the wordmark only on the Living Hub artwork, which is dark in both
 * themes, so the black-lettered file is not shipped. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = join(ROOT, "assets");
const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/v4-ajoop-brand-assets.mjs <folder holding the approved PNGs>");
  process.exit(1);
}

/* The lockup's own bounds inside its 1600 × 500 canvas, with a small margin. */
const WORDMARK = { x: 206, y: 80, width: 1120, height: 328 };
const jobs = [
  { from: "Primary Mark — Dark.png", to: "ajoop-mark-dark.webp", width: 192, height: 192, quality: 0.88 },
  { from: "Primary Mark — Light.png", to: "ajoop-mark-light.webp", width: 192, height: 192, quality: 0.88 },
  { from: "LauncherApp Icon-1024.png", to: "ajoop-launcher-192.webp", width: 192, height: 192, quality: 0.92 },
  { from: "ajoop-wordmark-light.png", to: "ajoop-wordmark-dark.webp", crop: WORDMARK, width: 672, height: 197, quality: 0.86 },
  { from: "ajoop-hero-living-hub-dark.png", to: "ajoop-living-hub-1600.webp", width: 1600, height: 900, quality: 0.8 },
  { from: "ajoop-hero-living-hub-dark-1920.png", to: "ajoop-living-hub-960.webp", width: 960, height: 540, quality: 0.8 },
  { from: "ajoop-hero-living-hub-dark-1920.png", to: "ajoop-living-hub-640.webp", width: 640, height: 360, quality: 0.8 },
];

const browser = await puppeteer.launch({ headless: true });
try {
  await mkdir(OUTPUT, { recursive: true });
  const page = await browser.newPage();
  for (const job of jobs) {
    const png = await readFile(join(source, job.from));
    const encoded = await page.evaluate(async ({ data, crop, width, height, quality }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const area = crop || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      const bitmap = await createImageBitmap(image, area.x, area.y, area.width, area.height, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/webp", quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return btoa(binary);
    }, { data: png.toString("base64"), crop: job.crop || null, width: job.width, height: job.height, quality: job.quality });
    const bytes = Buffer.from(encoded, "base64");
    await writeFile(join(OUTPUT, job.to), bytes);
    console.log(`${job.to}  ${job.width} × ${job.height}  ${(bytes.length / 1024).toFixed(1)} KB  (from ${job.from}, ${(png.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  await browser.close();
}
