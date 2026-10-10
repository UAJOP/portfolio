#!/usr/bin/env node
/**
 * J01 — Joyday wallpaper-ready export: browser QA and the review pack.
 *
 * scripts/qa-joyday-export.mjs holds the export geometry to its rules without
 * a browser. This script drives the built site (dist-site/) and checks what
 * only a browser can show: the PNG that is actually downloaded — its size read
 * from the file's own header, what is in it, a round canvas that stays round —
 * together with the dialog's keyboard and focus behaviour, the five locales and
 * the mechanics the export must not disturb. It then captures the review pack.
 *
 *   npm run build:site && npm run qa:joyday:export:browser
 *
 * The pack is written outside the repository; J01_CAPTURE_DIR moves it.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = process.env.J01_CAPTURE_DIR ? path.resolve(process.env.J01_CAPTURE_DIR) : "C:\\PC-Audit\\v4-review\\j01-joyday-wallpaper-export";
const PORT = process.env.J01_CAPTURE_PORT || "4189";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PRESETS = [
  ["desktop", 1920, 1080], ["desktop", 2560, 1440], ["desktop", 3840, 2160],
  ["mobile", 1080, 1920], ["mobile", 1170, 2532], ["mobile", 1290, 2796], ["mobile", 1440, 3200],
  ["social", 1080, 1080], ["social", 1080, 1350],
];
const CANVAS = { square: [900, 900], circle: [900, 900], rect: [720, 1080] };
const LOCALES = { en: "/joyday-paint/", tr: "/tr/joyday-paint/", de: "/de/joyday-paint/", es: "/es/joyday-paint/", fr: "/fr/joyday-paint/" };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "exports"), { recursive: true });

const checks = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass: Boolean(pass), detail: String(detail) }); if (!pass) console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); };
const issues = [];
const shots = [];
const exportsSaved = [];

/* ---------- server ---------- */

let server = null;
async function ready() {
  try {
    const response = await fetch(`${ORIGIN}/__v4/health`, { signal: AbortSignal.timeout(800) });
    return response.ok && path.resolve((await response.json()).root) === ROOT;
  } catch { return false; }
}
async function ensureServer() {
  if (await ready()) return;
  server = spawn(process.execPath, [path.join(ROOT, "scripts", "v4-preview-server.mjs")], { cwd: ROOT, env: { ...process.env, PORT }, stdio: "ignore", windowsHide: true });
  for (let attempt = 0; attempt < 60; attempt += 1) { if (await ready()) return; await wait(250); }
  throw new Error(`preview server did not become ready on ${PORT}`);
}

/* ---------- the page under test ---------- */

/* Runs in the page before its own scripts. A download is the engine clicking
 * a link it made: the click is recorded with the blob it points at, and
 * nothing is written to disk by the browser. */
function instrument(share) {
  window.__j01 = { downloads: [], shared: [] };
  /* The page's content security policy does not let a script fetch a blob:
   * address, so the blob behind each address is kept as it is made. */
  const blobs = new Map();
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (blob) { const url = createObjectURL.call(URL, blob); blobs.set(url, blob); return url; };
  window.__j01.blob = (href) => blobs.get(href);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith("blob:")) { window.__j01.downloads.push({ name: this.download, href: this.href, attached: this.isConnected }); return; }
    click.call(this);
  };
  if (share) {
    navigator.canShare = () => true;
    navigator.share = async (data) => { window.__j01.shared.push({ name: data.files[0].name, type: data.files[0].type, size: data.files[0].size }); };
  }
  /* One PNG, decoded to its pixels. */
  window.__j01.pixels = async (href) => {
    const bitmap = await createImageBitmap(window.__j01.blob(href));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  };
  window.__j01.hash = () => {
    const canvas = document.getElementById("joyday-art-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 16777619);
    return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
  };
  /* A known artwork: four flat quarters and a black disc in the middle. What
   * an export shows of it says exactly how it was scaled and cropped. */
  window.__j01.fixture = () => {
    const canvas = document.getElementById("joyday-art-canvas");
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    context.save();
    context.globalAlpha = 1;
    context.filter = "none";
    [["#e11d48", 0, 0], ["#16a34a", width / 2, 0], ["#2563eb", 0, height / 2], ["#facc15", width / 2, height / 2]].forEach(([color, x, y]) => { context.fillStyle = color; context.fillRect(x, y, width / 2, height / 2); });
    context.fillStyle = "#000000";
    context.beginPath();
    context.arc(width / 2, height / 2, 180, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };
}

/* What one exported PNG shows, measured in the page. */
async function inspect(page, href) {
  return page.evaluate(async (url) => {
    const image = await window.__j01.pixels(url);
    const { width, height, data } = image;
    const rgb = (x, y) => { const at = (Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4; return [data[at], data[at + 1], data[at + 2], data[at + 3]]; };
    const PALETTE = { red: [225, 29, 72], green: [22, 163, 74], blue: [37, 99, 235], yellow: [250, 204, 21], black: [0, 0, 0], paper: [255, 250, 241], dark: [15, 23, 42] };
    const name = (pixel, limit = 70) => {
      let best = "other";
      let distance = limit;
      for (const [key, value] of Object.entries(PALETTE)) {
        const d = Math.hypot(pixel[0] - value[0], pixel[1] - value[1], pixel[2] - value[2]);
        if (d < distance) { best = key; distance = d; }
      }
      return best;
    };
    const at = (fx, fy) => name(rgb(fx * (width - 1), fy * (height - 1)));
    const bright = (pixel) => Math.max(pixel[0], pixel[1], pixel[2]) > 120;
    const black = (pixel) => Math.max(pixel[0], pixel[1], pixel[2]) < 40;
    /* How far the black disc and the lit artwork reach, across and down the centre. */
    const run = (test, horizontal) => {
      const length = horizontal ? width : height;
      const pixel = (index) => (horizontal ? rgb(index, height / 2) : rgb(width / 2, index));
      let first = -1;
      let last = -1;
      for (let index = 0; index < length; index += 1) if (test(pixel(index))) { if (first < 0) first = index; last = index; }
      return first < 0 ? 0 : last - first + 1;
    };
    /* The black disc, measured outward from the centre of the frame. */
    const span = (horizontal) => {
      const length = horizontal ? width : height;
      const pixel = (index) => (horizontal ? rgb(index, height / 2) : rgb(width / 2, index));
      const middle = Math.floor(length / 2);
      if (!black(pixel(middle))) return 0;
      let first = middle;
      let last = middle;
      while (first > 0 && black(pixel(first - 1))) first -= 1;
      while (last < length - 1 && black(pixel(last + 1))) last += 1;
      return last - first + 1;
    };
    const GRID = [0.1, 0.3, 0.5, 0.7, 0.9];
    let known = 0;
    let sampled = 0;
    let opaque = true;
    for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) { const pixel = rgb(x, y); sampled += 1; if (name(pixel, 60) !== "other") known += 1; if (pixel[3] !== 255) opaque = false; }
    return {
      width, height, opaque,
      corners: [at(0.004, 0.004), at(0.996, 0.004), at(0.004, 0.996), at(0.996, 0.996)],
      center: at(0.5, 0.5),
      mid: { left: at(0.06, 0.5), right: at(0.94, 0.5), top: at(0.5, 0.06), bottom: at(0.5, 0.94) },
      probes: GRID.flatMap((fy) => GRID.map((fx) => at(fx, fy))),
      disc: { across: span(true), down: span(false) },
      lit: { across: run(bright, true), down: run(bright, false) },
      purity: known / sampled,
      /* The corner a signature would be drawn in: one flat colour unless something was drawn over it. */
      corner: (() => {
        const base = at(0.985, 0.985);
        let same = 0;
        let total = 0;
        for (let y = Math.floor(height * 0.88); y < height; y += 2) for (let x = Math.floor(width * 0.7); x < width; x += 2) { total += 1; if (name(rgb(x, y)) === base) same += 1; }
        return same / total;
      })(),
    };
  }, href);
}

/* What the test artwork must show at a point of an exported frame. The
 * placement is worked out here from the brief's definition of Fit and Fill,
 * not taken from the engine, so the two have to agree. A point too close to an
 * edge of colour, or inside the soft shadow, says nothing and is skipped. */
const GRID = [0.1, 0.3, 0.5, 0.7, 0.9];
function placement([sourceWidth, sourceHeight], [width, height], mode, focalX = 0.5, focalY = 0.5) {
  if (mode === "fit") {
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    return { scale, sx: 0, sy: 0, dx: (width - sourceWidth * scale) / 2, dy: (height - sourceHeight * scale) / 2 };
  }
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return { scale, sx: (sourceWidth - width / scale) * focalX, sy: (sourceHeight - height / scale) * focalY, dx: 0, dy: 0 };
}
function expectedAt(shape, target, mode, focal, background, fx, fy) {
  const [sourceWidth, sourceHeight] = CANVAS[shape];
  const placed = placement(CANVAS[shape], target, mode, focal[0], focal[1]);
  const u = (fx * (target[0] - 1) - placed.dx) / placed.scale + placed.sx;
  const v = (fy * (target[1] - 1) - placed.dy) / placed.scale + placed.sy;
  const margin = 14;
  const halo = (0.07 * Math.min(target[0], target[1])) / placed.scale;
  const radius = Math.hypot(u - sourceWidth / 2, v - sourceHeight / 2);
  const outside = shape === "circle" ? radius - 445 : Math.max(-u, u - sourceWidth, -v, v - sourceHeight);
  if (outside > 0) return outside < halo ? null : background;
  if (outside > -margin || Math.abs(radius - 180) < margin) return null;
  if (radius < 180) return "black";
  if (Math.abs(u - sourceWidth / 2) < margin || Math.abs(v - sourceHeight / 2) < margin) return null;
  return u < sourceWidth / 2 ? (v < sourceHeight / 2 ? "red" : "blue") : (v < sourceHeight / 2 ? "green" : "yellow");
}
function composition(pixels, shape, target, mode, focal = [0.5, 0.5], background = "paper") {
  const wrong = [];
  let tested = 0;
  GRID.forEach((fy, row) => GRID.forEach((fx, column) => {
    const want = expectedAt(shape, target, mode, focal, background, fx, fy);
    if (!want) return;
    tested += 1;
    const got = pixels.probes[row * GRID.length + column];
    if (got !== want) wrong.push(`(${fx}, ${fy}) is ${got}, expected ${want}`);
  }));
  return { ok: tested >= 10 && wrong.length === 0, detail: wrong.length ? wrong.join("; ") : `${tested} points` };
}

async function open(browser, { viewport = DESKTOP, route = LOCALES.en, canvas = "square", share = false, reducedMotion = false, engine = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource|net::ERR/.test(message.text())) issues.push(`${route} console: ${message.text()}`); });
  page.on("pageerror", (error) => issues.push(`${route} pageerror: ${error.message}`));
  await page.evaluateOnNewDocument(instrument, share);
  if (engine) {
    /* A negative control: the same page, served a faulty engine. */
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/joyday-paint.js") request.respond({ status: 200, contentType: "text/javascript; charset=utf-8", body: engine }).catch(() => {});
      else request.continue().catch(() => {});
    });
  }
  await page.goto(`${ORIGIN}${route}#joyday-paint-game`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => window.KaanEngineHost?.get("joydayPaint")?.mounted && document.documentElement.hasAttribute("data-joyday-studio"), { timeout: 20000 });
  await page.evaluate((type) => {
    document.querySelector(`[data-joyday-canvas="${type}"]`).click();
    document.querySelector("[data-jds-start]").click();
  }, canvas);
  await page.waitForFunction(() => document.documentElement.getAttribute("data-joyday-studio") === "paint");
  await page.bringToFront();
  return page;
}

const press = (page, selector) => page.evaluate((target) => document.querySelector(target).click(), selector);
const settle = (page, ms = 120) => page.evaluate((delay) => new Promise((resolve) => setTimeout(resolve, delay)), ms);
async function finish(page) {
  await press(page, "[data-joyday-finish]");
  await page.waitForFunction(() => !document.querySelector("[data-joyday-modal]").hidden);
  /* The artwork is hung with a short animation; captures wait for it. */
  await settle(page, 750);
}
async function choose(page, { size, fit, background, focalX, focalY, width, height, mode, signature } = {}) {
  await page.evaluate((options) => {
    const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
    const panel = document.querySelector("[data-joyday-export-panel]");
    if (options.mode) document.querySelector(`[data-joyday-export-mode="${options.mode}"]`).click();
    if (options.signature !== undefined) { const box = document.querySelector("[data-joyday-signature]"); if (box.checked !== options.signature) box.click(); }
    if (options.size) { const select = panel.querySelector("[data-joyday-export-size]"); select.value = options.size; fire(select, "change"); }
    if (options.width !== undefined) { const input = panel.querySelector("[data-joyday-export-width]"); input.value = String(options.width); fire(input, "input"); }
    if (options.height !== undefined) { const input = panel.querySelector("[data-joyday-export-height]"); input.value = String(options.height); fire(input, "input"); }
    if (options.fit) panel.querySelector(`[data-joyday-export-fit="${options.fit}"]`).click();
    if (options.background) panel.querySelector(`[data-joyday-export-background="${options.background}"]`).click();
    for (const axis of ["x", "y"]) {
      const value = axis === "x" ? options.focalX : options.focalY;
      if (value === undefined) continue;
      const input = panel.querySelector(`[data-joyday-export-focal-axis="${axis}"]`);
      input.value = String(Math.round(value * 100));
      fire(input, "input");
    }
  }, { size, fit, background, focalX, focalY, width, height, mode, signature });
  await settle(page);
}
const panelState = (page) => page.evaluate(() => {
  const panel = document.querySelector("[data-joyday-export-panel]");
  const shown = (selector) => { const node = panel.querySelector(selector); return Boolean(node && node.getClientRects().length); };
  return {
    size: panel.querySelector("[data-joyday-export-size]").value,
    sizeDisabled: panel.querySelector("[data-joyday-export-size]").disabled,
    output: panel.querySelector("[data-joyday-export-output]").textContent,
    status: panel.querySelector("[data-joyday-export-status]").textContent,
    custom: shown("[data-joyday-export-custom]"),
    frame: shown("[data-joyday-export-frame]"),
    background: shown('[data-joyday-export-aria="background"]'),
    focal: shown("[data-joyday-export-focal]"),
    error: shown("[data-joyday-export-error]"),
    focalX: Number(panel.querySelector('[data-joyday-export-focal-axis="x"]').value),
    focalY: Number(panel.querySelector('[data-joyday-export-focal-axis="y"]').value),
    focalXDisabled: panel.querySelector('[data-joyday-export-focal-axis="x"]').disabled,
    focalYDisabled: panel.querySelector('[data-joyday-export-focal-axis="y"]').disabled,
    downloadDisabled: document.querySelector("[data-joyday-download]").disabled,
    signature: document.querySelector("[data-joyday-signature]").checked,
    draggable: document.querySelector("[data-joyday-preview-img]").hasAttribute("data-joyday-export-drag"),
    canvases: document.querySelectorAll("canvas").length,
  };
});

/* Presses Download and returns the file: its name, its bytes and the size
 * written in its own PNG header. */
async function download(page, selector = "[data-joyday-download]") {
  const before = await page.evaluate(() => window.__j01.downloads.length);
  await press(page, selector);
  await page.waitForFunction((count) => window.__j01.downloads.length > count, { timeout: 60000 }, before);
  const { name, href, attached, base64 } = await page.evaluate(async () => {
    const entry = window.__j01.downloads[window.__j01.downloads.length - 1];
    const bytes = new Uint8Array(await window.__j01.blob(entry.href).arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 32768));
    return { ...entry, base64: btoa(binary) };
  });
  const buffer = Buffer.from(base64, "base64");
  const png = buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && buffer.subarray(12, 16).toString("latin1") === "IHDR";
  return { name, href, attached, buffer, png, width: png ? buffer.readUInt32BE(16) : 0, height: png ? buffer.readUInt32BE(20) : 0 };
}
function save(file, label, note = "") {
  const target = path.join(OUT, "exports", file.name);
  fs.writeFileSync(target, file.buffer);
  exportsSaved.push({ file: `exports/${file.name}`, label, note, width: file.width, height: file.height, bytes: file.buffer.length, buffer: file.buffer });
}
async function shot(page, name, label, note = "") {
  const buffer = await page.screenshot({ type: "png" });
  fs.writeFileSync(path.join(OUT, name), buffer);
  shots.push({ name, label, note, buffer, phone: page.viewport().width <= 430 });
}

/* A real artwork, made the way a visitor makes one: the engine's own tools,
 * driven by the pointer. Fine marks and broad ones, so that an enlargement has
 * edges to be judged by. */
async function paint(page) {
  const box = await page.$eval("#joyday-art-canvas", (canvas) => { const rect = canvas.getBoundingClientRect(); return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }; });
  const point = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const set = (tool, color, thickness, intensity = 70) => page.evaluate((options) => {
    document.querySelector(`[data-joyday-tool="${options.tool}"]`).click();
    document.querySelectorAll("[data-joyday-color]")[options.color].click();
    for (const [selector, value] of [["[data-joyday-thickness]", options.thickness], ["[data-joyday-intensity]", options.intensity]]) {
      const input = document.querySelector(selector);
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, { tool, color, thickness, intensity });
  const drag = async (points) => {
    await page.mouse.move(...point(...points[0]));
    await page.mouse.down();
    for (const next of points.slice(1)) await page.mouse.move(...point(...next), { steps: 8 });
    await page.mouse.up();
  };
  await set("balloon", 3, 55); await page.mouse.click(...point(0.3, 0.32));
  await set("balloon", 6, 40); await page.mouse.click(...point(0.72, 0.66));
  await set("balloon", 9, 25); await page.mouse.click(...point(0.62, 0.24));
  await set("bottle", 2, 18, 90); await drag([[0.08, 0.86], [0.92, 0.12]]);
  await set("bottle", 7, 6, 90); await drag([[0.1, 0.18], [0.9, 0.82]]);
  await set("bottle", 1, 4, 100); await drag([[0.5, 0.06], [0.44, 0.94]]);
  await set("bottle", 5, 30, 80); await drag([[0.12, 0.52], [0.88, 0.48]]);
  await set("brush", 8, 22, 85); await drag([[0.16, 0.7], [0.3, 0.6], [0.42, 0.74], [0.56, 0.58], [0.7, 0.8], [0.84, 0.62]]);
  await set("brush", 1, 3, 100); await drag([[0.2, 0.2], [0.34, 0.14], [0.48, 0.26], [0.62, 0.12], [0.8, 0.3]]);
  await set("spray", 4, 35, 80); await drag([[0.74, 0.3], [0.8, 0.4], [0.7, 0.46]]);
  await set("spray", 6, 12, 100); await drag([[0.22, 0.78], [0.3, 0.86], [0.38, 0.8]]);
  await settle(page, 200);
}

/* A cut of a PNG at its own pixels, for judging an enlargement at 100 %. */
async function crop(browser, buffer, region, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.setContent(`<img id="source" src="data:image/png;base64,${buffer.toString("base64")}">`, { waitUntil: "load" });
  const base64 = await page.evaluate(({ x, y, width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(document.getElementById("source"), x, y, width, height, 0, 0, width, height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, region);
  await page.close();
  fs.writeFileSync(path.join(OUT, name), Buffer.from(base64, "base64"));
}

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
async function sheet(browser, filename, title, items, columns, ratio) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const cards = items.map((item) => `<article><div><img src="data:image/png;base64,${item.buffer.toString("base64")}"></div><h2>${escape(item.label)}</h2>${item.note ? `<p>${escape(item.note)}</p>` : ""}</article>`).join("");
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#07111f;color:#edf4ff;font:14px Inter,Arial}h1{font-size:26px;margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:18px}article{background:#101c2c;border:1px solid #29405f;border-radius:14px;overflow:hidden}article div{aspect-ratio:${ratio};display:grid;place-items:center;background:#0b1522}img{display:block;max-width:100%;max-height:100%;object-fit:contain}h2{font-size:15px;margin:12px 14px 4px}p{color:#aabbd0;margin:0 14px 14px}</style><h1>${escape(title)}</h1><div class="grid">${cards}</div>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
  await page.close();
}

/* ---------- run ---------- */

await ensureServer();
const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true" ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] } : { headless: true });
const quality = {};
try {
  /* 1. Default state, every preset, exact pixel size --------------------- */
  {
    const page = await open(browser);
    const blank = await page.evaluate(() => window.__j01.hash());
    await page.evaluate(() => window.__j01.fixture());
    const painted = await page.evaluate(() => window.__j01.hash());
    await finish(page);
    const initial = await panelState(page);
    check("default: one export panel, built once", await page.$$eval("[data-joyday-export-panel]", (nodes) => nodes.length) === 1);
    check("default: the original canvas is selected", initial.size === "original" && !initial.frame && !initial.custom);
    check("default: the output line states the canvas size", initial.output.includes("900 × 900"), initial.output);
    check("default: the signature is off", initial.signature === false);
    check("default: nothing is enlarged, and the line says so by saying nothing", !/enlarged/.test(initial.output), initial.output);

    const original = await download(page);
    check("clean canvas (original): the PNG is 900 × 900", original.png && original.width === 900 && original.height === 900, `${original.width}×${original.height}`);
    check("clean canvas (original): named with shape and resolution", /-square-900x900\.png$/.test(original.name), original.name);
    const originalPixels = await inspect(page, original.href);
    check("clean canvas (original): the artwork is copied as painted", originalPixels.purity > 0.995 && Math.abs(originalPixels.disc.across - 360) <= 2 && Math.abs(originalPixels.disc.down - 360) <= 2 && composition(originalPixels, "square", [900, 900], "fit").ok, `${JSON.stringify(originalPixels.disc)} ${composition(originalPixels, "square", [900, 900], "fit").detail}`);

    for (const [group, width, height] of PRESETS) {
      await choose(page, { size: `${group}-${width}x${height}`, fit: "fill", focalX: 0.5, focalY: 0.5 });
      const state = await panelState(page);
      check(`${width}×${height}: the output line states the exact size before download`, state.output.includes(`${width} × ${height}`), state.output);
      const file = await download(page);
      check(`${width}×${height}: the PNG header says exactly ${width} × ${height}`, file.png && file.width === width && file.height === height, `${file.width}×${file.height}`);
      check(`${width}×${height}: the file name carries group and resolution`, file.name.endsWith(`-${group}-${width}x${height}.png`), file.name);
      check(`${width}×${height}: the link is never part of the page`, file.attached === false);
      const pixels = await inspect(page, file.href);
      const expectedDisc = 360 * Math.max(width / 900, height / 900);
      const placed = composition(pixels, "square", [width, height], "fill");
      check(`${width}×${height}: fill covers the frame with artwork only`, pixels.opaque && pixels.purity > 0.985 && pixels.corners.every((corner) => !["paper", "dark", "other"].includes(corner)), `purity ${pixels.purity.toFixed(4)} corners ${pixels.corners}`);
      check(`${width}×${height}: every part of the artwork is where Fill puts it`, placed.ok, placed.detail);
      check(`${width}×${height}: nothing is stretched (the disc stays a disc)`, Math.abs(pixels.disc.across - pixels.disc.down) <= 3 && Math.abs(pixels.disc.across - expectedDisc) <= 6, `${pixels.disc.across}×${pixels.disc.down}, expected ${expectedDisc.toFixed(0)}`);
    }
    check("exports never add a canvas to the page", (await panelState(page)).canvases === 1);
    check("exports never write to the painting canvas", await page.evaluate(() => window.__j01.hash()) === painted && painted !== blank);
    await page.close();
  }

  /* 2. Fit and Fill for every shape, landscape and portrait --------------- */
  for (const shape of ["square", "rect", "circle"]) {
    const page = await open(browser, { canvas: shape });
    await page.evaluate(() => window.__j01.fixture());
    await finish(page);
    const [sourceWidth, sourceHeight] = CANVAS[shape];
    for (const [group, width, height] of [["desktop", 1920, 1080], ["mobile", 1290, 2796]]) {
      const kind = width > height ? "landscape" : "portrait";
      const fitScale = Math.min(width / sourceWidth, height / sourceHeight);
      const fillScale = Math.max(width / sourceWidth, height / sourceHeight);

      await choose(page, { size: `${group}-${width}x${height}`, fit: "fit", background: "dark" });
      const fitted = await download(page);
      const fit = await inspect(page, fitted.href);
      check(`${shape} → ${kind} fit: exactly ${width} × ${height}`, fitted.width === width && fitted.height === height, `${fitted.width}×${fitted.height}`);
      check(`${shape} → ${kind} fit: the disc is round at the fit scale`, Math.abs(fit.disc.across - fit.disc.down) <= 3 && Math.abs(fit.disc.across - 360 * fitScale) <= 6, `${fit.disc.across}×${fit.disc.down}, expected ${(360 * fitScale).toFixed(0)}`);
      const fitPlaced = composition(fit, shape, [width, height], "fit", [0.5, 0.5], "dark");
      check(`${shape} → ${kind} fit: the whole artwork is there, centred, on the chosen background`, fit.center === "black" && fit.corners.every((corner) => corner === "dark") && fitPlaced.ok, `corners ${fit.corners} · ${fitPlaced.detail}`);
      const expectedAcross = (shape === "circle" ? 890 : sourceWidth) * fitScale;
      const expectedDown = (shape === "circle" ? 890 : sourceHeight) * fitScale;
      check(`${shape} → ${kind} fit: the artwork keeps its own proportions`, Math.abs(fit.lit.across - expectedAcross) <= 6 && Math.abs(fit.lit.down - expectedDown) <= 6, `${fit.lit.across}×${fit.lit.down}, expected ${expectedAcross.toFixed(0)}×${expectedDown.toFixed(0)}`);
      if (shape === "circle") check(`circle → ${kind} fit: the round canvas is a circle, not an ellipse`, Math.abs(fit.lit.across - fit.lit.down) <= 3, `${fit.lit.across}×${fit.lit.down}`);
      save(fitted, `${shape} → ${width}×${height} · Fit · dark`, "test artwork");

      await choose(page, { fit: "fill", background: "paper", focalX: 0.5, focalY: 0.5 });
      const filled = await download(page);
      const fill = await inspect(page, filled.href);
      check(`${shape} → ${kind} fill: exactly ${width} × ${height}`, filled.width === width && filled.height === height, `${filled.width}×${filled.height}`);
      check(`${shape} → ${kind} fill: the disc is round at the fill scale`, Math.abs(fill.disc.across - fill.disc.down) <= 3 && Math.abs(fill.disc.across - 360 * fillScale) <= 6, `${fill.disc.across}×${fill.disc.down}, expected ${(360 * fillScale).toFixed(0)}`);
      const fillPlaced = composition(fill, shape, [width, height], "fill");
      check(`${shape} → ${kind} fill: every part of the artwork is where Fill puts it`, fillPlaced.ok, fillPlaced.detail);
      if (shape !== "circle") check(`${shape} → ${kind} fill: the frame is covered edge to edge`, fill.purity > 0.985 && fill.corners.join() === "red,green,blue,yellow", `corners ${fill.corners}`);
      else check(`circle → ${kind} fill: the circle spans the frame and stays a circle`, fill.center === "black" && fill.corners.every((corner) => corner === "paper") && (kind === "landscape" ? fill.mid.left !== "paper" && fill.mid.right !== "paper" : fill.mid.top !== "paper" && fill.mid.bottom !== "paper"), `corners ${fill.corners} mid ${JSON.stringify(fill.mid)}`);
      save(filled, `${shape} → ${width}×${height} · Fill`, "test artwork");

      /* The focal point: the axis that is cropped moves, the other cannot. */
      const state = await panelState(page);
      const horizontal = sourceWidth * fillScale - width > 1;
      check(`${shape} → ${kind} fill: only the cropped axis can be moved`, state.focal && state.focalXDisabled === !horizontal && state.focalYDisabled === horizontal, JSON.stringify({ x: state.focalXDisabled, y: state.focalYDisabled }));
      await choose(page, horizontal ? { focalX: 0 } : { focalY: 0 });
      const near = await inspect(page, (await download(page)).href);
      await choose(page, horizontal ? { focalX: 1 } : { focalY: 1 });
      const far = await inspect(page, (await download(page)).href);
      const nearPlaced = composition(near, shape, [width, height], "fill", horizontal ? [0, 0.5] : [0.5, 0]);
      const farPlaced = composition(far, shape, [width, height], "fill", horizontal ? [1, 0.5] : [0.5, 1]);
      check(`${shape} → ${kind} fill: focal 0 keeps the ${horizontal ? "left" : "top"} of the artwork`, nearPlaced.ok, nearPlaced.detail);
      check(`${shape} → ${kind} fill: focal 1 keeps the ${horizontal ? "right" : "bottom"} of the artwork`, farPlaced.ok, farPlaced.detail);
      check(`${shape} → ${kind} fill: the focal point changes what is in the frame`, near.probes.join() !== far.probes.join() && near.probes.join() !== fill.probes.join());
      check(`${shape} → ${kind} fill: moving the focal point never stretches`, near.width === width && far.height === height);
    }
    await page.close();
  }

  /* 3. Preview = PNG, dragging, custom size, card, signature -------------- */
  {
    const page = await open(browser);
    await page.evaluate(() => window.__j01.fixture());
    await finish(page);
    await choose(page, { size: "mobile-1290x2796", fit: "fill", focalX: 0.2 });
    const file = await download(page);
    const difference = await page.evaluate(async (href) => {
      const preview = document.querySelector("[data-joyday-preview-img]");
      await preview.decode();
      const full = await createImageBitmap(window.__j01.blob(href));
      const draw = (source) => { const canvas = document.createElement("canvas"); canvas.width = preview.naturalWidth; canvas.height = preview.naturalHeight; const context = canvas.getContext("2d"); context.imageSmoothingQuality = "high"; context.drawImage(source, 0, 0, canvas.width, canvas.height); return context.getImageData(0, 0, canvas.width, canvas.height).data; };
      const a = draw(preview);
      const b = draw(full);
      let total = 0;
      for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index]);
      return { mean: total / a.length, width: preview.naturalWidth, height: preview.naturalHeight };
    }, file.href);
    check("preview: drawn smaller than the PNG, never the PNG's own size", difference.height === 720 && difference.width === 332 && file.height === 2796, `${difference.width}×${difference.height}`);
    check("preview: shows the composition the PNG gets", difference.mean < 4, `mean difference ${difference.mean.toFixed(2)} / 255`);

    /* Dragging the preview moves the artwork with the pointer. */
    const before = await panelState(page);
    const box = await page.$eval("[data-joyday-preview-img]", (image) => { const rect = image.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + 40, { steps: 6 });
    await page.mouse.up();
    await settle(page);
    const after = await panelState(page);
    check("focal: the preview can be dragged in Fill", before.draggable && after.focalX > before.focalX, `${before.focalX} → ${after.focalX}`);
    check("focal: dragging cannot move the axis that is not cropped", after.focalY === before.focalY);
    await choose(page, { fit: "fit" });
    check("fit: there is nothing to position, so no focal controls and no drag", !(await panelState(page)).focal && !(await panelState(page)).draggable);

    /* Keyboard: the same choice from a slider. */
    await choose(page, { fit: "fill", focalX: 0.5 });
    await page.focus('[data-joyday-export-focal-axis="x"]');
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await settle(page);
    check("focal: the sliders work from the keyboard", (await panelState(page)).focalX === 52, String((await panelState(page)).focalX));

    /* Custom size. */
    await choose(page, { size: "custom", width: 1600, height: 900 });
    const customState = await panelState(page);
    check("custom: width and height fields appear", customState.custom && customState.output.includes("1600 × 900"), customState.output);
    const custom = await download(page);
    check("custom: the PNG is exactly 1600 × 900", custom.width === 1600 && custom.height === 900 && custom.name.endsWith("-custom-1600x900.png"), `${custom.width}×${custom.height} ${custom.name}`);
    for (const [label, width, height] of [["too small", 100, 900], ["too large", 1600, 5000], ["empty", "", 900], ["a fraction", 1600.5, 900]]) {
      await choose(page, { width, height });
      const state = await panelState(page);
      const count = await page.evaluate(() => window.__j01.downloads.length);
      await press(page, "[data-joyday-download]");
      await settle(page, 300);
      check(`custom ${label}: refused with a message, and nothing is downloaded`, state.error && state.downloadDisabled && state.output === "" && (await page.evaluate(() => window.__j01.downloads.length)) === count, JSON.stringify({ error: state.error, disabled: state.downloadDisabled }));
    }
    await choose(page, { width: 4096, height: 320 });
    const extreme = await download(page);
    check("custom: the limits themselves are allowed", extreme.width === 4096 && extreme.height === 320);

    /* Signature: off unless asked for. */
    await choose(page, { size: "desktop-1920x1080", fit: "fill", focalX: 0.5, focalY: 0.5, signature: false });
    const plain = await download(page);
    await choose(page, { signature: true });
    const signed = await download(page);
    const signature = await page.evaluate(async (a, b) => {
      const [plainImage, signedImage] = [await window.__j01.pixels(a), await window.__j01.pixels(b)];
      let inside = 0;
      let outside = 0;
      for (let y = 0; y < plainImage.height; y += 2) for (let x = 0; x < plainImage.width; x += 2) {
        const at = (y * plainImage.width + x) * 4;
        if (plainImage.data[at] === signedImage.data[at] && plainImage.data[at + 1] === signedImage.data[at + 1] && plainImage.data[at + 2] === signedImage.data[at + 2]) continue;
        if (x > plainImage.width * 0.7 && y > plainImage.height * 0.88) inside += 1; else outside += 1;
      }
      return { inside, outside };
    }, plain.href, signed.href);
    check("signature: opt-in, drawn in the frame's corner and nowhere else", signature.inside > 200 && signature.outside === 0, JSON.stringify(signature));
    await choose(page, { signature: false });
    const again = await download(page);
    check("signature: switching it off gives the unsigned PNG back", Buffer.compare(again.buffer, plain.buffer) === 0);

    /* Joyday card: unchanged, and outside the size system. */
    await choose(page, { mode: "branded" });
    const cardState = await panelState(page);
    check("joyday card: its one size is stated and the size control steps back", cardState.sizeDisabled && !cardState.frame && cardState.output.includes("1400 × 1700"), cardState.output);
    const card = await download(page);
    check("joyday card: still a 1400 × 1700 branded PNG", card.width === 1400 && card.height === 1700 && card.name.endsWith("-joyday-card-1400x1700.png"), `${card.width}×${card.height} ${card.name}`);
    save(card, "Joyday card · 1400×1700", "existing branded export");
    await choose(page, { mode: "clean" });
    check("clean canvas: the chosen size comes back with it", (await panelState(page)).size === "desktop-1920x1080" && (await panelState(page)).frame);
    await page.close();
  }

  /* 4. Dialog: focus, keyboard, Escape; the mechanics around it ----------- */
  {
    const page = await open(browser);
    const blank = await page.evaluate(() => window.__j01.hash());
    const box = await page.$eval("#joyday-art-canvas", (canvas) => { const rect = canvas.getBoundingClientRect(); return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }; });
    await press(page, '[data-joyday-tool="brush"]');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    const drawn = await page.evaluate(() => window.__j01.hash());
    check("drawing: a brush stroke lands on the canvas", drawn !== blank);
    await press(page, "[data-joyday-undo]");
    check("undo: the stroke is taken back", await page.evaluate(() => window.__j01.hash()) === blank);
    await press(page, "[data-joyday-redo]");
    check("redo: the stroke returns", await page.evaluate(() => window.__j01.hash()) === drawn);

    await page.focus("[data-joyday-finish]");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("[data-joyday-modal]").hidden);
    check("dialog: opening it moves focus inside", await page.evaluate(() => Boolean(document.activeElement?.closest("[data-joyday-modal]"))));
    await choose(page, { size: "desktop-1920x1080" });
    let escaped = false;
    const stops = new Set();
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => ({ inside: Boolean(document.activeElement?.closest("[data-joyday-modal]")), key: document.activeElement?.outerHTML.slice(0, 90) }));
      if (!where.inside) escaped = true;
      stops.add(where.key);
    }
    check("dialog: Tab never leaves it", !escaped && stops.size >= 8, `${stops.size} stops`);
    await page.keyboard.down("Shift");
    for (let index = 0; index < 45; index += 1) await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    check("dialog: Shift+Tab stays inside too", await page.evaluate(() => Boolean(document.activeElement?.closest("[data-joyday-modal]"))));
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll("[data-joyday-modal] :is(button, select, input, a[href])")).filter((node) => node.getClientRects().length).filter((node) => !(node.getAttribute("aria-label") || node.textContent.trim() || node.labels?.[0]?.textContent.trim())).map((node) => node.outerHTML.slice(0, 80)));
    check("dialog: every control has a name", unnamed.length === 0, unnamed.join(" | "));
    const labelled = await page.evaluate(() => ({
      groups: Array.from(document.querySelectorAll("[data-joyday-export-panel] [role=group]")).every((node) => node.getAttribute("aria-label")),
      pressed: Array.from(document.querySelectorAll("[data-joyday-export-fit], [data-joyday-export-background]")).every((node) => ["true", "false"].includes(node.getAttribute("aria-pressed"))),
      options: Array.from(document.querySelectorAll("[data-joyday-export-size] optgroup option")).every((node) => /\d+ by \d+ pixels/.test(node.getAttribute("aria-label"))),
      optgroups: Array.from(document.querySelectorAll("[data-joyday-export-size] optgroup")).map((node) => node.label),
      live: document.querySelector("[data-joyday-export-output]").getAttribute("role") === "status",
    }));
    check("dialog: groups are labelled, choices state their pressed state, sizes read as “W by H pixels”", labelled.groups && labelled.pressed && labelled.options && labelled.live && labelled.optgroups.join() === "Desktop wallpaper,Mobile wallpaper,Social and general", JSON.stringify(labelled));
    const focusRing = await page.evaluate(() => { const select = document.querySelector("[data-joyday-export-size]"); select.focus(); return getComputedStyle(select).outlineStyle; });
    await page.keyboard.press("Tab");
    check("dialog: focus is visible on the new controls", await page.evaluate(() => { const node = document.activeElement; const style = getComputedStyle(node); return style.outlineStyle !== "none" || style.boxShadow !== "none"; }), focusRing);
    await page.keyboard.press("Escape");
    await settle(page);
    check("dialog: Escape closes it and focus returns to Finish", await page.evaluate(() => document.querySelector("[data-joyday-modal]").hidden && document.activeElement?.matches("[data-joyday-finish]")));
    check("dialog: closing it leaves the artwork alone", await page.evaluate(() => window.__j01.hash()) === drawn);

    await finish(page);
    await press(page, "[data-joyday-modal-new]");
    await settle(page);
    check("new artwork: the dialog closes on a clean canvas", await page.evaluate(() => document.querySelector("[data-joyday-modal]").hidden) && await page.evaluate(() => window.__j01.hash()) === blank);
    await press(page, "[data-jds-start]");
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await settle(page);
    check("drawing: the canvas still takes paint after an export session", await page.evaluate(() => window.__j01.hash()) !== blank);
    await press(page, "[data-joyday-clear]");
    check("clear: the canvas is blank again and there is nothing to undo", await page.evaluate(() => window.__j01.hash()) === blank && await page.$eval("[data-joyday-undo]", (button) => button.disabled));

    /* The engine can be stopped and started again without leaving a second panel. */
    const remount = await page.evaluate(() => { const engine = window.KaanEngineHost.get("joydayPaint"); engine.dispose(); const gone = document.querySelectorAll("[data-joyday-export-panel]").length; engine.mount(); return { gone, back: document.querySelectorAll("[data-joyday-export-panel]").length }; });
    check("lifecycle: the panel leaves with the engine and is built once on remount", remount.gone === 0 && remount.back === 1, JSON.stringify(remount));
    await page.close();
  }

  /* 5. Reduced motion ------------------------------------------------------ */
  {
    const page = await open(browser, { reducedMotion: true });
    await press(page, "[data-joyday-finish]");
    await page.waitForFunction(() => !document.querySelector("[data-joyday-modal]").hidden);
    const moving = await page.evaluate(() => Array.from(document.querySelectorAll("[data-joyday-modal], [data-joyday-modal] *")).filter((node) => { const style = getComputedStyle(node); return style.animationName !== "none" || parseFloat(style.transitionDuration) > 0; }).length);
    check("reduced motion: nothing in the dialog animates or transitions", moving === 0, `${moving} elements`);
    await page.close();
  }

  /* 6. Five locales --------------------------------------------------------- */
  const english = readJson("data/i18n/source/dynamic.json").joydayPaint.export;
  for (const [locale, route] of Object.entries(LOCALES)) {
    const expected = locale === "en" ? english : readJson(`data/i18n/packs/${locale}/dynamic.json`).joydayPaint.export;
    const page = await open(browser, { route });
    await finish(page);
    await choose(page, { size: "mobile-1290x2796", fit: "fill" });
    const seen = await page.evaluate(() => {
      const panel = document.querySelector("[data-joyday-export-panel]");
      const text = (selector) => panel.querySelector(selector)?.textContent.trim();
      return {
        size: text('[data-joyday-export-copy="size"]'), composition: text('[data-joyday-export-copy="composition"]'), fill: text('[data-joyday-export-copy="fill"]'), fit: text('[data-joyday-export-copy="fit"]'),
        focalX: text('[data-joyday-export-copy="focalX"]'), focalY: text('[data-joyday-export-copy="focalY"]'), focalHint: text('[data-joyday-export-copy="focalHint"]'),
        desktop: panel.querySelector('[data-joyday-export-group="desktop"]').label, mobile: panel.querySelector('[data-joyday-export-group="mobile"]').label, social: panel.querySelector('[data-joyday-export-group="social"]').label,
        custom: text('[data-joyday-export-size] [value="custom"]'), original: text('[data-joyday-export-size] [value="original"]'), output: text("[data-joyday-export-output]"),
        lang: document.documentElement.lang,
      };
    });
    const keys = ["size", "composition", "fill", "fit", "focalX", "focalY", "focalHint", "desktop", "mobile", "social", "custom"];
    const wrong = keys.filter((key) => seen[key] !== expected[key]);
    check(`${locale}: the export controls are in the page's language`, seen.lang === locale && wrong.length === 0 && seen.original.startsWith(expected.original) && seen.output.startsWith(expected.output.split("{")[0]), wrong.map((key) => `${key}: “${seen[key]}”`).join(", "));
    if (locale !== "en") check(`${locale}: no English export copy leaks through`, ["size", "fill", "fit", "focalHint", "desktop", "mobile", "custom"].every((key) => seen[key] !== english[key]) && !/Output|enlarged/.test(seen.output), seen.output);
    await choose(page, { size: "custom", width: 10, height: 10 });
    const error = await page.$eval("[data-joyday-export-error]", (node) => node.textContent);
    check(`${locale}: the validation message is localized and names the limits`, error === expected.range.replace("{min}", "320").replace("{max}", "4096"), error);
    await page.close();
  }

  /* 7. Narrow screens ------------------------------------------------------- */
  for (const viewport of [{ width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, PHONE, { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]) {
    const page = await open(browser, { viewport, route: LOCALES.de });
    await press(page, "[data-joyday-starter]");
    await finish(page);
    await choose(page, { size: "custom", width: 1290, height: 2796, fit: "fill" });
    if (viewport === PHONE) {
      await page.evaluate(() => { document.querySelector(".joyday-finish-card").scrollTop = document.querySelector("[data-joyday-export-panel]").offsetTop - 250; });
      await shot(page, "15-phone-german-custom.png", "Phone · German · custom 1290×2796", "longest labels on a 390 px screen");
    }
    const layout = await page.evaluate(() => {
      const card = document.querySelector(".joyday-finish-card").getBoundingClientRect();
      const modal = document.querySelector("[data-joyday-modal]");
      const out = Array.from(modal.querySelectorAll("[data-joyday-export-panel] *, .joyday-finish-actions .btn")).filter((node) => node.getClientRects().length).filter((node) => { const rect = node.getBoundingClientRect(); return rect.left < card.left - 0.5 || rect.right > card.right + 0.5; }).map((node) => node.outerHTML.slice(0, 70));
      const small = Array.from(modal.querySelectorAll("[data-joyday-export-panel] :is(button, select, input[type=number]), [data-joyday-download], [data-joyday-share]")).filter((node) => node.getClientRects().length).filter((node) => node.getBoundingClientRect().height < 43.5).map((node) => `${Math.round(node.getBoundingClientRect().height)}px ${node.outerHTML.slice(0, 60)}`);
      const scroller = document.querySelector(".joyday-finish-card");
      scroller.scrollTop = scroller.scrollHeight;
      const download = document.querySelector("[data-joyday-download]").getBoundingClientRect();
      return { out, small, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 || scroller.scrollWidth > scroller.clientWidth + 1, reachable: download.top >= 0 && download.bottom <= window.innerHeight, inside: card.left >= 0 && card.right <= window.innerWidth && card.bottom <= window.innerHeight + 0.5 };
    });
    const name = `${viewport.width}×${viewport.height}`;
    check(`${name}: nothing in the export panel overflows the sheet`, layout.out.length === 0 && !layout.sideways, layout.out.join(" | "));
    check(`${name}: the sheet stays inside the screen and scrolls to its Download button`, layout.inside && layout.reachable, JSON.stringify({ inside: layout.inside, reachable: layout.reachable }));
    check(`${name}: buttons, the size list and the number fields are at least 44 px tall`, layout.small.length === 0, layout.small.join(" | "));
    await page.close();
  }

  /* 7b. Negative controls -------------------------------------------------- */
  /* The checks above only mean something if a faulty export fails them. The
   * same short run — one frame filled, moved and fitted — is made against the
   * shipped engine and against the engine with one fault each. */
  async function core(page, shape) {
    const results = [];
    const note = (name, pass) => results.push({ name, pass: Boolean(pass) });
    const target = [1920, 1080];
    const [sourceWidth, sourceHeight] = CANVAS[shape];
    await page.evaluate(() => window.__j01.fixture());
    await finish(page);
    await choose(page, { size: "desktop-1920x1080", fit: "fill", background: "paper", focalX: 0.5, focalY: 0.5, signature: false });
    const filled = await download(page);
    const fill = await inspect(page, filled.href);
    note("exact size", filled.width === 1920 && filled.height === 1080);
    note("fill placement", composition(fill, shape, target, "fill").ok);
    note("no stretching", Math.abs(fill.disc.across - fill.disc.down) <= 3 && Math.abs(fill.disc.across - 360 * Math.max(1920 / sourceWidth, 1080 / sourceHeight)) <= 6);
    if (shape !== "circle") note("artwork only", fill.purity > 0.985 && fill.corner > 0.995);
    await choose(page, { focalY: 0 });
    const moved = await inspect(page, (await download(page)).href);
    note("focal point", composition(moved, shape, target, "fill", [0.5, 0]).ok && moved.probes.join() !== fill.probes.join());
    await choose(page, { fit: "fit", background: "dark" });
    const fitted = await download(page);
    const fit = await inspect(page, fitted.href);
    const scale = Math.min(1920 / sourceWidth, 1080 / sourceHeight);
    note("fit placement", fitted.width === 1920 && composition(fit, shape, target, "fit", [0.5, 0.5], "dark").ok);
    note("proportions", Math.abs(fit.lit.across - (shape === "circle" ? 890 : sourceWidth) * scale) <= 6 && Math.abs(fit.lit.down - (shape === "circle" ? 890 : sourceHeight) * scale) <= 6);
    return results;
  }
  {
    const shipped = fs.readFileSync(path.join(ROOT, "dist-site", "joyday-paint.js"), "utf8");
    const replace = (from, to) => (source) => source.split(from).join(to);
    const DRAW = "targetCtx.drawImage(artwork, placed.sx, placed.sy, placed.sw, placed.sh, placed.dx, placed.dy, placed.dw, placed.dh);";
    const FAULTS = [
      ["the preview's size used for the PNG", "square", /exact size/, replace("const size = preview ? JoydayExport.previewSize(spec.width, spec.height) : spec;", "const size = JoydayExport.previewSize(spec.width, spec.height);")],
      ["width and height swapped", "square", /exact size/, replace("target.width = size.width;\n    target.height = size.height;", "target.width = size.height;\n    target.height = size.width;")],
      ["artwork stretched to the frame", "square", /no stretching|proportions/, replace(DRAW, "targetCtx.drawImage(artwork, 0, 0, artwork.width, artwork.height, 0, 0, target.width, target.height);")],
      ["round canvas drawn as an ellipse", "circle", /no stretching|proportions/, replace(DRAW, "targetCtx.drawImage(artwork, 0, 0, artwork.width, artwork.height, 0, 0, target.width, target.height);")],
      ["focal point ignored", "square", /focal point/, replace("focalX: state.focalX, focalY: state.focalY", "focalX: 0.5, focalY: 0.5")],
      ["studio chrome drawn into the PNG", "square", /artwork only|placement/, replace(DRAW, DRAW + ' targetCtx.fillStyle = "#3b2f25"; targetCtx.fillRect(0, 0, target.width, target.height * 0.12);')],
      ["signature forced onto the PNG", "square", /artwork only/, replace("if (signatureInput?.checked) addSignature(targetCtx", "addSignature(targetCtx")],
      ["fill that letterboxes", "square", /fill placement|artwork only/, replace("mode: state.exportFit, focalX: state.focalX, focalY: state.focalY });\n    /* Where", 'mode: "fit", focalX: state.focalX, focalY: state.focalY });\n    /* Where')],
    ];
    const unix = shipped.replace(/\r\n/g, "\n");
    for (const shape of ["square", "circle"]) {
      const page = await open(browser, { canvas: shape });
      const failed = (await core(page, shape)).filter((item) => !item.pass).map((item) => item.name);
      check(`controls: the shipped engine passes the short run (${shape})`, failed.length === 0, failed.join(", "));
      await page.close();
    }
    for (const [label, shape, expected, fault] of FAULTS) {
      const faulty = fault(unix);
      const page = await open(browser, { canvas: shape, engine: faulty });
      const failed = (await core(page, shape)).filter((item) => !item.pass).map((item) => item.name);
      check(`negative control caught: ${label}`, faulty !== unix && failed.some((name) => expected.test(name)), faulty === unix ? "the fault did not apply" : failed.join(", ") || "nothing failed");
      await page.close();
    }
  }

  /* 8. Review pack: desktop, a painted square ------------------------------ */
  {
    const page = await open(browser);
    await paint(page);
    const live = await page.evaluate(() => document.getElementById("joyday-art-canvas").toDataURL("image/png").split(",")[1]);
    fs.writeFileSync(path.join(OUT, "quality-source-canvas-900px.png"), Buffer.from(live, "base64"));
    await finish(page);
    await shot(page, "01-desktop-export-default.png", "Desktop · export panel, default state", "Original canvas selected · signature off");
    await choose(page, { size: "desktop-1920x1080", fit: "fit" });
    await shot(page, "02-desktop-1920x1080-fit.png", "Desktop · 1920×1080 · Fit", "whole artwork, paper background");
    save(await download(page), "square → 1920×1080 · Fit · paper", "painted artwork");
    await choose(page, { background: "dark" });
    await shot(page, "03-desktop-1920x1080-fit-dark.png", "Desktop · 1920×1080 · Fit · dark", "background choice appears only where it shows");
    await choose(page, { fit: "fill", background: "paper" });
    await shot(page, "04-desktop-1920x1080-fill.png", "Desktop · 1920×1080 · Fill", "frame covered; vertical position enabled");
    const hd = await download(page);
    save(hd, "square → 1920×1080 · Fill", "painted artwork");
    await choose(page, { focalY: 0.12 });
    await shot(page, "05-desktop-1920x1080-fill-focal.png", "Desktop · 1920×1080 · Fill · focal moved up", "preview follows the slider");
    await choose(page, { size: "desktop-3840x2160", focalY: 0.5 });
    await shot(page, "06-desktop-3840x2160.png", "Desktop · 3840×2160", "output line states the enlargement");
    const uhd = await download(page);
    save(uhd, "square → 3840×2160 · Fill", "painted artwork");
    await settle(page, 200);
    await shot(page, "07-desktop-download-state.png", "Desktop · after Download", "status line names the file");
    await choose(page, { size: "custom", width: 1600, height: 900 });
    await shot(page, "08-desktop-custom.png", "Desktop · custom 1600×900");
    await choose(page, { width: 5000, height: 900 });
    await shot(page, "09-desktop-custom-invalid.png", "Desktop · custom size outside the limits", "message shown, Download disabled");
    quality.enlargement = { "1920x1080": 1920 / 900, "3840x2160": 3840 / 900 };
    quality.bytes = { "1920x1080": hd.buffer.length, "3840x2160": uhd.buffer.length };
    /* The same part of the artwork, each at its own pixels. */
    await crop(browser, uhd.buffer, { x: 1280, y: 720, width: 1280, height: 720 }, "quality-3840x2160-at-100pct.png");
    await crop(browser, hd.buffer, { x: 640, y: 360, width: 640, height: 360 }, "quality-1920x1080-at-100pct.png");
    await crop(browser, uhd.buffer, { x: 1600, y: 900, width: 640, height: 360 }, "quality-3840x2160-at-100pct-detail.png");
    await page.close();
  }

  /* 9. Review pack: phone, a painted portrait canvas ----------------------- */
  {
    const page = await open(browser, { viewport: PHONE, canvas: "rect", share: true });
    await paint(page);
    await finish(page);
    check("phone: the share button is offered where the browser can share files", await page.$eval("[data-joyday-share]", (button) => button.getClientRects().length > 0 && button.textContent.trim() === "Share or save image").catch(() => false));
    await shot(page, "10-phone-export-panel.png", "Phone · export panel", "preview pinned above the controls");
    await choose(page, { size: "mobile-1080x1920", fit: "fill" });
    await shot(page, "11-phone-1080x1920.png", "Phone · 1080×1920 · Fill");
    save(await download(page), "rect → 1080×1920 · Fill", "painted artwork");
    await choose(page, { size: "mobile-1290x2796" });
    await shot(page, "12-phone-1290x2796.png", "Phone · 1290×2796 · Fill");
    const image = await page.$eval("[data-joyday-preview-img]", (node) => { const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; });
    const before = (await panelState(page)).focalX;
    await page.touchscreen.touchStart(image.x, image.y);
    for (let step = 1; step <= 6; step += 1) await page.touchscreen.touchMove(image.x + step * 5, image.y);
    await page.touchscreen.touchEnd();
    await settle(page);
    const after = (await panelState(page)).focalX;
    check("phone: a finger on the preview moves the focal point", after < before, `${before} → ${after}`);
    await page.evaluate(() => { document.querySelector(".joyday-finish-card").scrollTop = document.querySelector("[data-joyday-export-focal]").offsetTop - 260; });
    await shot(page, "13-phone-focal-editing.png", "Phone · focal position", "preview stays in view while the sliders move");
    save(await download(page), "rect → 1290×2796 · Fill · focal moved", "painted artwork");
    await page.evaluate(() => { const card = document.querySelector(".joyday-finish-card"); card.scrollTop = card.scrollHeight; });
    await settle(page, 250);
    await shot(page, "14-phone-bottom-controls-download-state.png", "Phone · bottom controls after Download", "status line, Download, Share, safe-area padding");
    const shared = await page.evaluate(async () => { document.querySelector("[data-joyday-share]").click(); for (let index = 0; index < 200 && !window.__j01.shared.length; index += 1) await new Promise((resolve) => setTimeout(resolve, 50)); return window.__j01.shared[0] || null; });
    check("phone: Share hands the same PNG file to the share sheet", shared && shared.type === "image/png" && shared.name.endsWith("-mobile-1290x2796.png") && shared.size > 10000, JSON.stringify(shared));
    await settle(page, 200);
    check("phone: sharing is reported, not a download", /^Shared: /.test((await panelState(page)).status), (await panelState(page)).status);
    await page.close();
  }

  /* 10. Review pack: the round canvas -------------------------------------- */
  {
    const page = await open(browser, { canvas: "circle" });
    await paint(page);
    await finish(page);
    await choose(page, { size: "desktop-1920x1080", fit: "fit", background: "dark" });
    await shot(page, "16-desktop-circle-fit-dark.png", "Desktop · round canvas · 1920×1080 · Fit · dark");
    save(await download(page), "circle → 1920×1080 · Fit · dark", "painted artwork");
    await choose(page, { size: "mobile-1290x2796", fit: "fit", background: "paper" });
    save(await download(page), "circle → 1290×2796 · Fit · paper", "painted artwork");
    await choose(page, { fit: "fill" });
    await shot(page, "17-desktop-circle-fill-portrait.png", "Desktop · round canvas · 1290×2796 · Fill");
    save(await download(page), "circle → 1290×2796 · Fill", "painted artwork");
    await choose(page, { size: "social-1080x1080", fit: "fit", background: "dark" });
    save(await download(page), "circle → 1080×1080 · Fit · dark", "painted artwork");
    await page.close();
  }

  check("no console errors or page errors on any page", issues.length === 0, issues.slice(0, 3).join(" | "));

  await sheet(browser, "00-contact-sheet.png", "J01 · Joyday wallpaper-ready export · desktop", shots.filter((item) => !item.phone), 3, "16 / 10");
  await sheet(browser, "00-contact-sheet-phone.png", "J01 · Joyday wallpaper-ready export · phone", shots.filter((item) => item.phone), 5, "390 / 844");
  await sheet(browser, "00-contact-sheet-exports.png", "J01 · exported PNGs (each file is in exports/)", exportsSaved.map((item) => ({ buffer: item.buffer, label: item.label, note: `${item.width}×${item.height} · ${(item.bytes / 1024).toFixed(0)} KB · ${item.note}` })), 4, "1 / 1");
} finally {
  await browser.close();
  if (server) server.kill();
}

const failed = checks.filter((item) => !item.pass);
const summary = {
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  exports: exportsSaved.map(({ buffer, ...item }) => item),
  screenshots: shots.map(({ buffer, ...item }) => item),
  quality,
};
fs.writeFileSync(path.join(OUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`J01 Joyday export browser QA: ${summary.passed} passed, ${summary.failed} failed · ${exportsSaved.length} PNGs · ${shots.length} captures → ${OUT}`);
if (failed.length) process.exitCode = 1;
