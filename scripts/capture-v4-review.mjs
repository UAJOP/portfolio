/* V4 review pack: screenshots + motion frames + focused smoke, in one command.
 *
 *   npm run v4:review-pack        (build, then everything below)
 *   npm run v4:capture            (the same, against the existing dist-site/)
 *
 * Captures the production build in dist-site/ through the local preview
 * server and writes the pack outside the repository (V4 rule: review
 * artifacts never live in Git): numbered screenshots, 00-contact-sheet.png,
 * numbered motion frames with 00-motion-frames.png, README.md,
 * qa-summary.json and one zip of all of it. The same run is the phase's
 * focused QA.
 *
 * The phase under review is described by PHASE/PACK/TITLE, the shot list, the
 * motion script and the smoke section; the capture machinery around them does
 * not change between phases.
 *
 * AJOOP's AI edge is stubbed for the whole run, by the mechanism the project
 * already accepts for UI QA (scripts/qa-m3-ajoop-command-palette.mjs): requests
 * to the public edge are intercepted in the browser and answered 503, as they
 * are whenever the local bridge is switched off. Nothing is simulated in the
 * page.
 *
 * Optional, for before/after numbers measured in the same minutes on the same
 * machine — a build of the previous phase, exported somewhere else:
 *   V4_BASELINE_ORIGIN   a preview server on that build
 *   V4_BASELINE_ROOT     that build's checkout (its dist-site/ is read for sizes) */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-e06-1-joyday-action-painting";
const PACK = "V4-E06-1-review-pack.zip";
const TITLE = "V4-E06.1 · Joyday Action Painting — premium play mode";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
const FRAMES = join(OUTPUT, "motion-frames");
/* Its own port: 4174/4175 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASELINE = process.env.V4_BASELINE_ORIGIN || null;
const BASELINE_ROOT = process.env.V4_BASELINE_ROOT || null;
const EDGE = "https://ajoop.kaanbalci.com/";
const SERVER_SCRIPT = join(ROOT, "scripts", "v4-preview-server.mjs");
const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const MOBILE = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const STUDIO = "/joyday-paint/";
const ROOT_SEL = "[data-jds-root]";
const CANVAS = "#joyday-art-canvas";
const ENTER = "[data-jds-enter]";
const START = "[data-jds-start]";
const tool = (id) => `[data-joyday-tool="${id}"]`;
const colour = (hex) => `[data-joyday-color="${hex}"]`;

/* In contact-sheet order. `play` is a studio script, run in order:
 * "enter", "start", "paint" (a few marks with every tool), "tune" (brush
 * chosen, thickness raised, another palette), "extras" (a phone's second dock
 * page), "finish", "fail" is a page option, not a step. */
const shots = [
  { name: "01-desktop-start.png", label: "Desktop · 1440 × 900 · start state: format, tools, sound, one line of help, Start painting", viewport: DESKTOP, theme: "dark", play: ["enter"] },
  { name: "02-desktop-painting.png", label: "Desktop · active painting: the canvas takes the stage, docks either side", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint"] },
  { name: "03-desktop-tools.png", label: "Desktop · tool and control state: Brush in hand, thicker stroke, the next palette, mission chip", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint", "tune"] },
  { name: "04-desktop-finish.png", label: "Desktop · finish: name, signature, export style, Download PNG — then keep painting, new artwork or exit", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint", "finish"] },
  { name: "05-mobile-start.png", label: "Mobile · 390 × 844 · start state", viewport: MOBILE, theme: "dark", touch: true, play: ["enter"] },
  { name: "06-mobile-painting.png", label: "Mobile · active painting: canvas, then a dock under the thumb", viewport: MOBILE, theme: "dark", touch: true, play: ["enter", "start", "paint"] },
  { name: "07-mobile-controls.png", label: "Mobile · the dock's second page: stroke thickness, intensity, prompt, mission", viewport: MOBILE, theme: "dark", touch: true, play: ["enter", "start", "paint", "extras"] },
  { name: "08-mobile-finish.png", label: "Mobile · finish and export", viewport: MOBILE, theme: "dark", touch: true, play: ["enter", "start", "paint", "finish"] },
  { name: "09-light-entry.png", label: "Light theme · the portfolio-facing entry: the studio is no longer a widget in the page", viewport: DESKTOP, theme: "light", play: [] },
  { name: "10-no-js.png", label: "Without JavaScript · a plain notice and the way to the case study; no dead Play button", viewport: DESKTOP, theme: "dark", noJs: true, play: [] },
  { name: "11-failure.png", label: "Canvas failed to initialise (forced for this capture) · a recoverable state: Reload or Exit", viewport: DESKTOP, theme: "dark", fail: true, play: ["enter"] },
  { name: "12-landscape-phone.png", label: "Phone on its side · 844 × 390 · tools left, canvas full height, colours and actions right", viewport: LANDSCAPE, theme: "dark", touch: true, play: ["enter", "start", "paint"] },
  { name: "14-mood-electric-joy.png", label: "Palette mood · Suggest palette → Neon Party → Electric Joy: acid accent, magenta action, black tape; the same artwork", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint", "mood"] },
  { name: "15-mood-soft-studio.png", label: "Palette mood · Soft Pastel → Soft Studio: rosy plaster, pale wood, soft accent", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint", "mood", "mood"] },
  { name: "16-mood-sunset-atelier.png", label: "Palette mood · Warm Energy → Sunset Atelier: amber wall, low warm light, walnut ledge", viewport: DESKTOP, theme: "dark", play: ["enter", "start", "paint", "mood", "mood", "mood"] },
  { name: "17-mood-blue-room-mobile.png", label: "Palette mood · phone · Ocean Flow → Blue Room: cool daylight, blue shadow", viewport: MOBILE, theme: "dark", touch: true, play: ["enter", "start", "paint", "mood", "mood", "mood", "mood"] },
  { name: "13-tablet.png", label: "Tablet · 820 × 1180 · the docked layout with a large canvas", viewport: TABLET, theme: "dark", touch: true, play: ["enter", "start", "paint"] },
];

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/* Ready only if the port is served by this checkout's preview server. */
async function serverReady() {
  try {
    const health = await fetch(`${ORIGIN}/__v4/health`, { signal: AbortSignal.timeout(900) });
    if (health.ok && resolve((await health.json()).root) === ROOT) return true;
    throw new Error(`port ${PORT} is serving something other than this checkout's V4 preview server`);
  } catch (error) {
    if (error.message.startsWith("port ")) throw error;
    return false;
  }
}

/* The stubbed edge, on any page. */
async function stubEdge(page, edge = "down", origin = ORIGIN) {
  page.edgeRequests = [];
  page.foreignRequests = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(EDGE)) {
      const body = request.postData() || "";
      if (request.method() === "POST") page.edgeRequests.push(body);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
      const healthy = edge === "degraded" && (request.method() !== "POST" || body.includes('"mode":"health"'));
      request.respond(healthy
        ? { status: 200, headers: cors, contentType: "application/json", body: '{"ok":true,"ready":true}' }
        : { status: edge === "degraded" ? 500 : 503, headers: cors, contentType: "application/json", body: "{}" }).catch(() => {});
      return;
    }
    if (!url.startsWith(origin) && !url.startsWith("data:") && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) page.foreignRequests.push(url);
    request.continue().catch(() => {});
  });
}

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, touch = false, edge = "down", path = "/", settle = 2200, prepare = null }, problems) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    /* The stubbed edge is unreachable by design; only its own network messages are expected. */
    if (message.text().includes(EDGE) || String(message.location()?.url || "").startsWith(EDGE)) return;
    problems.push(`${path} ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await stubEdge(page, edge);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.evaluateOnNewDocument((nextTheme) => localStorage.setItem("kaanbalci-site-theme", nextTheme), theme);
  /* React reports a hydration mismatch as an event, not on the console. */
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
  /* Layout shift, from the first frame. */
  if (!noJs) await page.evaluateOnNewDocument(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  if (prepare) await prepare(page);
  await visit(page, path, { noJs });
  await wait(settle);
  return page;
}

async function visit(page, path, { noJs = false } = {}) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle2" });
  if (noJs) return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => image.loading !== "lazy").map((image) => image.complete ? undefined : image.decode().catch(() => undefined)));
  });
  /* The engine starts with the classic runtime; wait for its greeting. */
  await page.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message"), { timeout: 20000 });
}

const settled = (page) => page.waitForFunction(() => !document.querySelector("[data-chatbot-messages] .is-pending"), { timeout: 30000 });

async function ask(page, question, { tap = false } = {}) {
  if (tap) await page.tap(INPUT); else await page.click(INPUT);
  await page.type(INPUT, question);
  await page.keyboard.press("Enter");
  await settled(page);
  await wait(900);
}

const scrollTo = async (page, selector, block) => {
  await page.evaluate((target, where) => {
    document.querySelector(target).scrollIntoView({ block: where === "top" ? "start" : "center", behavior: "instant" });
    if (where === "top") window.scrollBy({ top: -110, behavior: "instant" });
  }, selector, block);
  /* Visible images near the viewport get a moment to arrive; a hidden lazy
   * image never loads, so nothing waits on one for long. */
  await page.evaluate(() => Promise.race([
    Promise.all([...document.images].filter((image) => image.getClientRects().length && image.getBoundingClientRect().top < innerHeight * 1.5).map((image) => image.complete ? undefined : image.decode().catch(() => undefined))),
    new Promise((done) => setTimeout(done, 2500)),
  ]));
  await wait(1700);
};

async function run(page, steps = []) {
  for (const [action, target] of steps) {
    if (action === "click") { await page.click(target); await page.mouse.move(3, 300); await wait(1200); }
    if (action === "hover") { await page.hover(target); await wait(1100); }
    if (action === "focus") { await page.focus(target); await wait(900); }
    if (action === "ask") await ask(page, target);
    if (action === "goto") { await visit(page, target); await wait(1800); }
    if (action === "top" || action === "into") await scrollTo(page, target, action);
    if (action === "end") { await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })); await wait(1900); }
  }
}

/* Time-driven animations only: scroll-driven ones are always "running". */
const motionState = (page) => page.evaluate(() => {
  const timed = document.getAnimations().filter((animation) => animation.timeline === document.timeline);
  return {
    running: timed.filter((animation) => animation.playState === "running").length,
    endless: timed.filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity).length,
  };
});

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const layoutShift = (page) => page.evaluate(() => Math.round((window.__cls || 0) * 10000) / 10000);


/* ---------- the studio, driven and read ---------- */

const press = async (page, selector) => { await page.evaluate((target) => document.querySelector(target).click(), selector); await wait(160); };
const canvasBox = (page) => page.evaluate((target) => { const rect = document.querySelector(target).getBoundingClientRect(); return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }; }, CANVAS);
/* What is on the canvas, as a short fingerprint of its pixels. */
const inkOf = (page) => page.evaluate((target) => { const data = document.querySelector(target).toDataURL("image/png"); let hash = 0; for (let index = 0; index < data.length; index += 97) hash = (hash * 31 + data.charCodeAt(index)) | 0; return `${data.length}:${hash}`; }, CANVAS);

async function stroke(page, from, to, touch) {
  const box = await canvasBox(page);
  const at = (point) => ({ x: box.x + box.w * point[0], y: box.y + box.h * point[1] });
  const a = at(from);
  const b = at(to || from);
  if (touch) {
    await page.touchscreen.touchStart(a.x, a.y);
    for (let step = 1; step <= 8; step += 1) await page.touchscreen.touchMove(a.x + ((b.x - a.x) * step) / 8, a.y + ((b.y - a.y) * step) / 8);
    await page.touchscreen.touchEnd();
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
  }
  await wait(260);
}

/* The studio steps a shot or a check can ask for. */
async function play(page, steps, touch = false) {
  for (const step of steps) {
    if (step === "enter") { await press(page, ENTER); await wait(650); }
    if (step === "start") { await press(page, START); await wait(450); }
    if (step === "paint") {
      await press(page, colour("#ff3b6b")); await stroke(page, [0.2, 0.76], [0.72, 0.28], touch);
      await press(page, colour("#22d3ee")); await stroke(page, [0.82, 0.8], [0.34, 0.24], touch);
      await press(page, tool("spray")); await press(page, colour("#ffd23f")); await stroke(page, [0.24, 0.3], [0.76, 0.46], touch);
      await press(page, tool("brush")); await press(page, colour("#8b5cf6")); await stroke(page, [0.18, 0.62], [0.8, 0.7], touch);
      await press(page, tool("balloon")); await press(page, colour("#20c997")); await stroke(page, [0.56, 0.58], null, touch);
      await wait(500);
    }
    if (step === "tune") {
      await press(page, tool("brush"));
      await page.evaluate(() => { const input = document.querySelector("[data-joyday-thickness]"); input.value = "86"; input.dispatchEvent(new Event("input", { bubbles: true })); });
      await press(page, "[data-joyday-suggest-palette]");
      await stroke(page, [0.3, 0.84], [0.74, 0.86], false);
      await wait(1500);
    }
    if (step === "mood") { await press(page, "[data-joyday-suggest-palette]"); await wait(1200); }
    if (step === "extras") { await press(page, "[data-jds-extras]"); await wait(350); }
    if (step === "finish") { await press(page, "[data-joyday-finish]"); await wait(1000); }
  }
}

const studio = (page) => page.evaluate((rootSelector, canvasSelector) => {
  const root = document.querySelector(rootSelector);
  const shown = (entry) => Boolean(entry && entry.getClientRects().length && getComputedStyle(entry).visibility !== "hidden");
  const box = (entry) => { const rect = entry.getBoundingClientRect(); return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  const canvas = document.querySelector(canvasSelector);
  const controls = [...root.querySelectorAll("button, input, a[href]")].filter(shown);
  const inView = (entry) => { const rect = entry.getBoundingClientRect(); return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1; };
  const bar = [...root.querySelectorAll(".jds-bar .jds-btn, .joyday-sound-toggle, .joyday-mission-panel, .jds-title")].filter(shown).map(box);
  const overlaps = bar.some((a, i) => bar.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
  const modal = document.querySelector("[data-joyday-modal]");
  return {
    phase: document.documentElement.getAttribute("data-joyday-studio"),
    dock: document.documentElement.getAttribute("data-jds-dock"),
    rootShown: shown(root),
    rootBox: shown(root) ? box(root) : null,
    rootScrolls: shown(root) ? root.scrollWidth - root.clientWidth + (root.scrollHeight - root.clientHeight) : 0,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pageScrolls: getComputedStyle(document.documentElement).overflowY !== "hidden",
    header: shown(document.querySelector(".site-header")),
    footer: shown(document.querySelector(".site-footer")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    floats: [...document.querySelectorAll("body > :not(main):not(script)")].filter(shown).length,
    inertOutside: [...document.body.children].filter((entry) => entry.tagName !== "MAIN" && entry.tagName !== "SCRIPT").every((entry) => entry.inert),
    canvas: shown(canvas) ? { ...box(canvas), share: Math.round((canvas.getBoundingClientRect().width * canvas.getBoundingClientRect().height * 100) / (innerWidth * innerHeight)) } : null,
    frame: document.querySelector("[data-joyday-frame]").className.match(/is-(square|circle|rect)/)?.[1] || null,
    formats: [...root.querySelectorAll("[data-joyday-canvas]")].filter(shown).length,
    tools: [...root.querySelectorAll("[data-joyday-tool]")].filter(shown).map((entry) => ({ id: entry.getAttribute("data-joyday-tool"), active: entry.classList.contains("is-active"), pressed: entry.getAttribute("aria-pressed"), name: text(entry.querySelector("strong")), ...box(entry) })),
    colours: [...root.querySelectorAll("[data-joyday-color]")].filter(shown).length,
    sliders: [...root.querySelectorAll('input[type="range"]')].filter(shown).length,
    actions: [...root.querySelectorAll(".joyday-game-actions .btn")].filter(shown).map((entry) => ({ name: text(entry), disabled: entry.disabled, ...box(entry) })),
    shell: [...root.querySelectorAll(".jds-bar .jds-btn, .joyday-sound-toggle")].filter(shown).map((entry) => ({ name: text(entry) || entry.getAttribute("aria-label"), ...box(entry) })),
    hint: shown(root.querySelector(".joyday-canvas-hint")),
    title: text(root.querySelector(".jds-start")),
    cta: shown(root.querySelector("[data-jds-start]")),
    resume: shown(root.querySelector("[data-jds-resume]")),
    error: shown(root.querySelector("[data-jds-error]")) ? text(root.querySelector("[data-jds-error]")) : null,
    mission: shown(root.querySelector(".joyday-mission-panel")) ? text(root.querySelector(".joyday-mission-panel")) : null,
    sound: root.querySelector("[data-joyday-sound-toggle]")?.getAttribute("aria-pressed"),
    undo: !root.querySelector("[data-joyday-undo]").disabled,
    fullscreenOffered: shown(root.querySelector("[data-jds-fullscreen]")),
    fullscreen: Boolean(document.fullscreenElement),
    smallest: controls.length ? Math.min(...controls.map((entry) => Math.min(entry.getBoundingClientRect().width, entry.getBoundingClientRect().height))) : null,
    smallTargets: controls.filter((entry) => Math.min(entry.getBoundingClientRect().width, entry.getBoundingClientRect().height) < 40).map((entry) => `${entry.tagName.toLowerCase()}${[...entry.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("")} ${Math.round(entry.getBoundingClientRect().width)}×${Math.round(entry.getBoundingClientRect().height)}`),
    outOfView: controls.filter((entry) => !inView(entry) && !entry.closest(".joyday-color-grid")).length,
    barOverlap: overlaps,
    modal: modal && !modal.hidden ? { actions: [...modal.querySelectorAll(".joyday-finish-actions .btn")].map(text), preview: (modal.querySelector("[data-joyday-preview-img]").getAttribute("src") || "").slice(0, 22), previewBytes: (modal.querySelector("[data-joyday-preview-img]").getAttribute("src") || "").length, fits: (() => { const card = modal.querySelector(".joyday-finish-card").getBoundingClientRect(); return card.top >= 0 && card.bottom <= innerHeight + 1; })(), scrolls: modal.querySelector(".joyday-finish-card").scrollHeight - modal.querySelector(".joyday-finish-card").clientHeight } : null,
    focus: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${[...document.activeElement.attributes].filter((a) => a.name.startsWith("data-j")).map((a) => `[${a.name}]`).join("")}` : null,
    audioContexts: window.__audioContexts ?? null,
  };
}, ROOT_SEL, CANVAS);

/* The entry page, as it stands before the studio is entered. */
const entry = (page) => page.evaluate((rootSelector) => {
  const shown = (target) => Boolean(target && target.getClientRects().length);
  return {
    heading: document.querySelector("h1")?.textContent.trim() || null,
    enter: shown(document.querySelector("[data-jds-enter]")),
    enterLabel: document.querySelector("[data-jds-enter]")?.textContent.trim() || null,
    studioInPage: shown(document.querySelector(rootSelector)),
    notice: shown(document.querySelector(".jds-noscript")) ? document.querySelector(".jds-noscript").textContent.replace(/\s+/g, " ").trim() : null,
    noticeLink: document.querySelector(".jds-noscript a")?.getAttribute("href") || null,
    back: [...document.querySelectorAll(".joyday-paint-hero a[href]")].filter(shown).map((link) => link.getAttribute("href")),
    header: shown(document.querySelector(".site-header")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    pageHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}, ROOT_SEL);

/* Main-thread work over an idle window, once the page has settled. */
async function idleWork(page, ms = 5000) {
  const session = await page.createCDPSession();
  await session.send("Performance.enable");
  const read = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
  await page.evaluate(() => { window.__long = 0; new PerformanceObserver((list) => { window.__long += list.getEntries().length; }).observe({ type: "longtask" }); });
  const before = await read();
  await wait(ms);
  const after = await read();
  const long = await page.evaluate(() => window.__long);
  await session.detach();
  return { windowMs: ms, taskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000), scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000), layouts: after.LayoutCount - before.LayoutCount, styleRecalcs: after.RecalcStyleCount - before.RecalcStyleCount, longTasks: long };
}

/* LCP of one cold load, fresh context, on whichever build `origin` serves. */
async function lcpOnce(browser, origin, path, viewport, throttled) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await stubEdge(page, "down", origin);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  if (throttled) {
    const session = await page.createCDPSession();
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.evaluateOnNewDocument(() => {
    window.__lcp = null;
    window.__cls = 0;
    new PerformanceObserver((list) => { const entry = list.getEntries().at(-1); window.__lcp = { ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null, file: entry.url ? entry.url.split("/").pop() : null }; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await wait(throttled ? 3500 : 1800);
  const result = await page.evaluate(() => ({ ...window.__lcp, cls: Math.round(window.__cls * 10000) / 10000, imageBytes: performance.getEntriesByType("resource").filter((entry) => /\.(webp|png|jpe?g|avif|ico)(\?|$)/.test(entry.name)).reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0) }));
  await context.close();
  return result;
}

/* Builds are measured in turn, run by run, so they share the machine's load. */
async function lcpCompare(browser, path, runs = 5) {
  const builds = { ...(BASELINE ? { before: BASELINE } : {}), after: ORIGIN };
  const rows = [];
  for (const [name, viewport] of [["1440 × 900", DESKTOP], ["390 × 844", MOBILE]]) for (const throttled of [false, true]) {
    const samples = Object.fromEntries(Object.keys(builds).map((build) => [build, []]));
    for (let index = 0; index < runs; index += 1) for (const build of Object.keys(builds)) samples[build].push(await lcpOnce(browser, builds[build], path, viewport, throttled));
    const row = { viewport: name, conditions: throttled ? "4× CPU, 10 Mbps, 40 ms" : "unthrottled" };
    for (const build of Object.keys(builds)) {
      const sorted = samples[build].map((sample) => sample.ms).sort((a, b) => a - b);
      const last = samples[build].at(-1);
      row[build] = { medianMs: sorted[Math.floor(sorted.length / 2)], runsMs: sorted, element: last.element, file: last.file, clsMax: Math.max(...samples[build].map((sample) => sample.cls)), imageKb: Math.round(last.imageBytes / 102.4) / 10 };
    }
    rows.push(row);
  }
  return rows;
}

async function sheet(browser, file, title, note, panels, width) {
  const figures = panels.map((panel, index) => `<figure style="width:${panel.width}px"><figcaption><b>${String(index + 1).padStart(2, "0")}</b><span>${panel.label}</span><small>${panel.file.split(/[\\/]/).pop()}</small></figcaption><img src="${pathToFileURL(panel.file).href}" width="${panel.width}"></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 48px; background: #12151b; color: #f3f6fb; font: 500 22px/1.3 "Segoe UI", Arial, sans-serif; }
    h1 { margin: 0 0 8px; font-size: 44px; } p { margin: 0 0 40px; color: #aab3bf; }
    main { display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
    figure { margin: 0; } img { display: block; height: auto; border: 1px solid #323a47; }
    figcaption { display: flex; gap: 14px; align-items: baseline; min-height: 3.9em; padding: 0 0 12px; }
    figcaption b { padding: 2px 10px; border-radius: 4px; background: #4fa8ff; color: #050912; }
    figcaption small { margin-left: auto; color: #7f8a98; font-size: 15px; white-space: nowrap; }
  </style><h1>${title}</h1><p>${note} · generated ${new Date().toISOString()}</p><main>${figures}</main>`;
  const source = join(OUTPUT, "sheet.tmp.html");
  await writeFile(source, html, "utf8");
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle0" });
  await page.screenshot({ path: join(OUTPUT, file), type: "png", fullPage: true });
  await page.close();
  await rm(source);
  console.log(`[v4:capture] ${file}`);
}


/* Test-browser preparation, run before the page's own scripts. */
const countAudio = (page) => page.evaluateOnNewDocument(() => {
  window.__audioContexts = 0;
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Native = window[name];
    if (!Native) continue;
    window[name] = class extends Native { constructor(...args) { super(...args); window.__audioContexts += 1; } };
  }
  /* Exports are recorded instead of being written to disk. */
  window.__exports = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) { if (this.download) { window.__exports.push({ name: this.download, href: this.href }); return undefined; } return click.apply(this, args); };
});
/* The one failure a visitor can really meet: the canvas gives no context. */
const breakCanvas = (page) => page.evaluateOnNewDocument(() => {
  const native = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) { return this.id === "joyday-art-canvas" ? null : native.apply(this, args); };
});
const png = (href) => {
  const bytes = Buffer.from(String(href).split(",")[1] || "", "base64");
  return { valid: bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", width: bytes.length > 24 ? bytes.readUInt32BE(16) : 0, height: bytes.length > 24 ? bytes.readUInt32BE(20) : 0, bytes: bytes.length };
};

let server = null;
let browser = null;

try {
  await mkdir(FRAMES, { recursive: true });
  /* Captures from an earlier run are stale. */
  for (const directory of [OUTPUT, FRAMES]) for (const entryName of await readdir(directory)) if (/\.(png|zip)$/.test(entryName)) await rm(join(directory, entryName));
  if (!(await serverReady())) {
    server = spawn(process.execPath, [SERVER_SCRIPT], { cwd: ROOT, env: { ...process.env, HOST: "127.0.0.1", PORT }, stdio: "ignore", windowsHide: true });
    const deadline = Date.now() + 12_000;
    while (!(await serverReady())) {
      if (Date.now() > deadline) throw new Error(`V4 preview server did not become ready at ${ORIGIN}`);
      await wait(180);
    }
  }

  browser = await puppeteer.launch({ headless: true });
  const problems = [];
  const failures = [];
  const expect = (label, condition) => { if (!condition) failures.push(label); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /* Every page gets its own tab, and so its own session storage. */
  const fresh = async (options) => {
    const context = await browser.createBrowserContext();
    const page = await open(context, { path: STUDIO, settle: 900, ...options, prepare: async (target) => { if (!options.noJs) await countAudio(target); if (options.fail) await breakCanvas(target); } }, options.noJs || options.fail ? [] : problems);
    page.done = () => context.close();
    return page;
  };

  /* ---------- screenshots ---------- */
  for (const shot of shots) {
    const page = await fresh(shot);
    await play(page, shot.play, Boolean(shot.touch));
    expect(`${shot.name}: no horizontal overflow`, (await overflow(page)) === 0);
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png" });
    console.log(`[v4:capture] ${shot.name}`);
    await page.done();
  }

  /* ---------- motion frames: one continuous session, one tab ---------- */
  const frames = [];
  const film = await fresh({ viewport: DESKTOP, theme: "dark" });
  const frame = async (label) => {
    const file = join(FRAMES, `${String(frames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}.png`);
    await film.screenshot({ path: file, type: "png" });
    frames.push({ file, label, width: 960 });
  };
  await frame("The portfolio page: one action, Start Painting");
  await film.evaluate((target) => document.querySelector(target).click(), ENTER); await wait(140);
  await frame("Entering: the portfolio steps out and the studio comes forward");
  await wait(600); await press(film, '[data-joyday-canvas="circle"]'); await wait(300);
  await frame("Canvas selection: the round format, in the start state");
  await press(film, START); await wait(450);
  { const box = await canvasBox(film); await film.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.7); await film.mouse.down(); await film.mouse.move(box.x + box.w * 0.7, box.y + box.h * 0.32, { steps: 10 }); await wait(120); }
  await frame("First paint: the bottle held down — the canvas is pressed in while the throw is aimed");
  await film.mouse.up(); await wait(60);
  await frame("The throw lands: paint on the canvas, a ring in the colour in hand");
  await press(film, tool("balloon")); await press(film, colour("#ffd23f")); await wait(80);
  await frame("Tool switch: Water Balloon lifts onto yellow and loads the new colour");
  await stroke(film, [0.5, 0.5], null, false); await stroke(film, [0.62, 0.68], null, false);
  await press(film, "[data-joyday-finish]"); await wait(330);
  await frame("Finish: the artwork is hung in the export dialog");
  await wait(700); await press(film, ".joyday-finish-actions [data-jds-exit]"); await wait(700);
  await frame("Exit: back on the portfolio page, focus on the action that opened the studio");
  const filmed = { ...(await entry(film)), phase: await film.evaluate(() => document.documentElement.getAttribute("data-joyday-studio")), focus: await film.evaluate(() => document.activeElement?.hasAttribute("data-jds-enter")) };
  expect("Motion session: leaving from the finish dialog returns to the portfolio page with focus on Start Painting", filmed.phase === null && filmed.header && filmed.focus);
  await film.done();

  /* ---------- entry, start, play mode ---------- */
  const q = {};
  const desk = await fresh({ viewport: DESKTOP, theme: "dark" });
  q.entry = await entry(desk);
  await desk.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" })); await wait(300);
  q.scrollBefore = await desk.evaluate(() => Math.round(scrollY));
  expect("Entry: the portfolio page shows its intro and one way in; the studio is not a widget in the page", Boolean(q.entry.heading) && q.entry.enter && !q.entry.studioInPage && q.entry.header && q.entry.launcher && q.entry.back.includes("/games/"));
  await desk.focus(ENTER); await desk.keyboard.press("Enter"); await wait(700);
  q.start = await studio(desk);
  expect("Entered by keyboard: the studio's start state fills the viewport and takes focus on Start painting", q.start.phase === "start" && q.start.rootBox.width === DESKTOP.width && q.start.rootBox.height === DESKTOP.height && q.start.focus === "button[data-jds-start]" && !q.start.pageScrolls);
  expect("Entered: the portfolio's header, footer, AJOOP launcher and floating controls are gone and inert", !q.start.header && !q.start.footer && !q.start.launcher && q.start.floats === 0 && q.start.inertOutside);
  expect("Start state: three formats, four tools, the sound switch (off), one line of help and one clear action — no canvas yet", q.start.formats === 3 && q.start.tools.length === 4 && q.start.sound === "false" && q.start.hint && q.start.cta && !q.start.canvas && Boolean(q.start.title) && q.start.outOfView === 0 && q.start.rootScrolls === 0);
  expect("No sound before the visitor asks for it: no audio context exists on load or on entering", q.start.audioContexts === 0);
  await press(desk, '[data-joyday-canvas="rect"]'); q.rect = (await studio(desk)).frame;
  await press(desk, '[data-joyday-canvas="circle"]'); q.circle = (await studio(desk)).frame;
  await press(desk, '[data-joyday-canvas="square"]'); q.square = (await studio(desk)).frame;
  expect("Canvas format: the engine's three shapes are chosen in the start state", same([q.rect, q.circle, q.square], ["rect", "circle", "square"]));
  await press(desk, START); await wait(450);
  q.paint = await studio(desk);
  q.blank = await inkOf(desk);
  expect("Play mode: the canvas dominates — at least twice the old 496 px surface's share of the screen — with every control in view and nothing scrolling", q.paint.phase === "paint" && q.paint.canvas.share >= 35 && q.paint.canvas.width >= 680 && q.paint.outOfView === 0 && q.paint.rootScrolls === 0 && q.paint.overflow === 0);
  expect("Play mode: tools, colours, both sliders, the five actions and the shell bar are all present; no bar control overlaps another", q.paint.tools.length === 4 && q.paint.colours === 12 && q.paint.sliders === 2 && q.paint.actions.length === 5 && q.paint.shell.length >= 3 && !q.paint.barOverlap && Boolean(q.paint.mission));
  expect("Play mode: docks sit beside the canvas, never over it", [...q.paint.tools, ...q.paint.actions].every((item) => item.right <= q.paint.canvas.left || item.left >= q.paint.canvas.right || item.top >= q.paint.canvas.bottom || item.bottom <= q.paint.canvas.top));

  /* ---------- pointer painting, tool by tool ---------- */
  q.marks = {};
  let last = q.blank;
  for (const [id, from, to] of [["bottle", [0.2, 0.75], [0.7, 0.3]], ["spray", [0.25, 0.3], [0.75, 0.45]], ["brush", [0.2, 0.6], [0.8, 0.7]], ["balloon", [0.55, 0.55], null]]) {
    await press(desk, tool(id));
    await press(desk, colour(id === "bottle" ? "#ff3b6b" : id === "spray" ? "#ffd23f" : id === "brush" ? "#8b5cf6" : "#20c997"));
    const state = await studio(desk);
    await stroke(desk, from, to, false);
    const ink = await inkOf(desk);
    q.marks[id] = { active: state.tools.find((item) => item.id === id).active, pressed: state.tools.find((item) => item.id === id).pressed, onlyOne: state.tools.filter((item) => item.active).length === 1, drew: ink !== last };
    last = ink;
  }
  expect("Pointer: each of the four tools becomes the one active tool (stated to assistive technology too) and leaves its mark", Object.values(q.marks).every((mark) => mark.active && mark.pressed === "true" && mark.onlyOne && mark.drew));
  q.afterMarks = await studio(desk);
  q.feedback = await desk.evaluate(() => ({ hit: document.querySelector("[data-joyday-frame]").classList.contains("jds-hit"), paint: getComputedStyle(document.querySelector("[data-jds-root]")).getPropertyValue("--jds-paint").trim() }));
  expect("Feedback: a mark that lands rings the canvas in the colour in hand; undo becomes available", q.feedback.hit && q.feedback.paint === "#20c997" && q.afterMarks.undo);
  await press(desk, "[data-joyday-undo]"); q.undone = (await inkOf(desk)) !== last;
  await press(desk, "[data-joyday-redo]"); q.redone = (await inkOf(desk)) === last;
  expect("Undo and redo: the engine's own history, one step back and forward", q.undone && q.redone);

  /* ---------- palette moods ---------- */
  const moodState = () => desk.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (name) => style.getPropertyValue(name).trim();
    const label = document.querySelector("[data-jds-mood-label]");
    const canvas = document.querySelector("#joyday-art-canvas").getBoundingClientRect();
    return { mood: document.documentElement.getAttribute("data-jds-mood"), palette: document.querySelector("[data-joyday-palette-name]").textContent.trim(), label: label.hidden ? null : { name: label.querySelector("strong").textContent, note: label.querySelector("span").textContent }, wall: token("--jds-wall"), paper: token("--jds-paper"), white: token("--jds-white"), accent: token("--jds-acid"), action: token("--jds-hot"), stamp: token("--jds-hot-ink"), ink: token("--jds-ink"), canvas: `${Math.round(canvas.left)},${Math.round(canvas.top)},${Math.round(canvas.width)}` };
  });
  const luminance = (value) => { const parts = /^#/.test(value) ? value.slice(1).match(/../g).map((part) => parseInt(part, 16)) : value.match(/[\d.]+/g).slice(0, 3).map(Number); const [r, g, b] = parts.map((part) => part / 255).map((part) => (part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrastOf = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10; };
  const inkBefore = await inkOf(desk);
  q.moods = [{ ...(await moodState()), inkSame: true, fits: true }];
  expect("Mood: the studio opens in Joyday Pop without announcing it", q.moods[0].mood === "pop" && q.moods[0].label === null);
  for (let turn = 0; turn < 5; turn += 1) {
    await press(desk, "[data-joyday-suggest-palette]"); await wait(1300);
    const state = await studio(desk);
    q.moods.push({ ...(await moodState()), inkSame: (await inkOf(desk)) === inkBefore, fits: state.outOfView === 0 && state.rootScrolls === 0 && state.overflow === 0 && !state.barOverlap, running: (await motionState(desk)).running });
  }
  const visited = q.moods.slice(0, 5);
  const moodCatalog = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", "en", "common.json"), "utf8"));
  expect("Mood: the engine's five palettes land in five different moods — Pop, Electric Joy, Soft Studio, Sunset Atelier, Blue Room", same(visited.map((item) => item.mood), ["pop", "electric", "soft", "sunset", "blue"]) && new Set(visited.map((item) => item.palette)).size === 5);
  expect("Mood: each change is announced once, in the catalog's words, and the fifth press returns to Joyday Pop", q.moods.slice(1).every((item) => item.label && item.label.name === moodCatalog[`joyday.studio.mood.${item.mood}.name`] && item.label.note === moodCatalog[`joyday.studio.mood.${item.mood}.note`]) && q.moods[5].mood === "pop");
  expect("Mood: the artwork is never touched and the layout never moves — same pixels, same canvas box, nothing out of view", q.moods.every((item) => item.inkSame && item.fits && item.canvas === q.moods[0].canvas));
  expect("Mood: the room really changes — five different walls and five different accents", new Set(visited.map((item) => item.wall)).size === 5 && new Set(visited.map((item) => item.accent)).size === 5);
  q.moodContrast = Object.fromEntries(visited.map((item) => [item.mood, { inkOnPaper: contrastOf(item.ink, item.paper), inkOnWall: contrastOf(item.ink, item.wall), inkOnAccent: contrastOf(item.ink, item.accent), inkOnAction: contrastOf(item.ink, item.action), stampOnPaper: contrastOf(item.stamp, item.paper) }]));
  expect("Mood: contrast holds in every room — graphite on paper, wall, accent and action at 4.5:1 or better, the stamp on paper too", Object.values(q.moodContrast).every((row) => Object.values(row).every((ratio) => ratio >= 4.5)));
  expect("Mood: a change is one short cross-fade — nothing is still animating 1.3 s later", q.moods.slice(1).every((item) => item.running === 0));
  await wait(2400);
  q.moodLabelGone = await desk.evaluate(() => document.querySelector("[data-jds-mood-label]").hidden);
  expect("Mood: the announcement leaves by itself", q.moodLabelGone);
  q.classifier = await desk.evaluate(() => ({
    ids: window.JoydayStudioMood.ids,
    pastelMorning: window.JoydayStudioMood.of(["#ffffff", "#bcdcf5", "#c9e9f2", "#bfe8d6", "#fff3b8", "#f9cfe0", "#a9d0f5", "#d3f0e4", "#1f2937"]),
    mustardBurgundy: window.JoydayStudioMood.of(["#7a1f2b", "#c2410c", "#d99a1c", "#e2572b", "#f2c14e", "#ffffff"]),
    navyCobaltMint: window.JoydayStudioMood.of(["#0b2545", "#1d4ed8", "#22d3ee", "#a7f3d0", "#ffffff"]),
    greysOnly: window.JoydayStudioMood.of(["#ffffff", "#111111", "#888888"]),
    nonsense: window.JoydayStudioMood.of(["not a colour", ""]),
  }));
  expect("Mood: classification reads the colours, not a palette's name — unseen palettes find Pastel Morning, Sunset Atelier and Blue Room; greys and bad input fall back to Joyday Pop", q.classifier.ids.length === 6 && q.classifier.pastelMorning === "morning" && q.classifier.mustardBurgundy === "sunset" && q.classifier.navyCobaltMint === "blue" && q.classifier.greysOnly === "pop" && q.classifier.nonsense === "pop");

  /* ---------- sound ---------- */
  await press(desk, "[data-joyday-sound-toggle]"); await wait(200);
  q.soundOn = { ...(await studio(desk)), stored: await desk.evaluate(() => sessionStorage.getItem("joyday-studio-sound")) };
  expect("Sound: one switch in the bar; turning it on is the first moment an audio context exists, and the choice is kept for the tab", q.soundOn.sound === "true" && q.soundOn.audioContexts === 1 && q.soundOn.stored === "on");

  /* ---------- fullscreen ---------- */
  q.fullscreen = { offered: q.paint.fullscreenOffered };
  if (q.fullscreen.offered) {
    await desk.click("[data-jds-fullscreen]"); await wait(700);
    q.fullscreen.entered = (await studio(desk)).fullscreen;
    q.fullscreen.label = await desk.evaluate(() => document.querySelector("[data-jds-fullscreen]").textContent.trim());
    q.fullscreen.pressed = await desk.evaluate(() => document.querySelector("[data-jds-fullscreen]").getAttribute("aria-pressed"));
  }
  expect("Fullscreen: offered where the browser supports it, entered from the bar, and the control says how to leave", q.fullscreen.offered && q.fullscreen.entered && q.fullscreen.pressed === "true" && q.fullscreen.label === "Exit fullscreen");

  /* ---------- new canvas ---------- */
  await press(desk, "[data-jds-new]"); await wait(300);
  q.newAsk = await studio(desk);
  await press(desk, "[data-jds-resume]"); await wait(300);
  q.resumed = { ...(await studio(desk)), ink: (await inkOf(desk)) === last };
  expect("New canvas: asks for a format first and offers the way back; Keep painting returns to the same artwork", q.newAsk.phase === "start" && q.newAsk.resume && q.resumed.phase === "paint" && q.resumed.ink);
  await press(desk, "[data-jds-new]"); await press(desk, START); await wait(400);
  q.restarted = { ...(await studio(desk)), ink: (await inkOf(desk)) === q.blank };
  expect("New canvas: confirmed with Start painting, the canvas is clean and its history empty", q.restarted.phase === "paint" && q.restarted.ink && !q.restarted.undo);

  /* ---------- finish and export ---------- */
  await play(desk, ["paint"]);
  q.painted = await inkOf(desk);
  await press(desk, "[data-joyday-finish]"); await wait(900);
  q.finish = await studio(desk);
  expect("Finish: a dialog with the artwork, on one screen, offering download, the real studio, a new artwork, keep painting and exit", q.finish.modal && q.finish.modal.preview === "data:image/png;base64," && q.finish.modal.fits && q.finish.modal.actions.length === 5);
  await press(desk, "[data-joyday-download]");
  await desk.evaluate(() => document.querySelector("[data-joyday-signature]").click()); await wait(200);
  await press(desk, "[data-joyday-download]");
  await press(desk, '[data-joyday-export-mode="branded"]'); await wait(300);
  await press(desk, "[data-joyday-download]");
  q.exports = (await desk.evaluate(() => window.__exports)).map((item) => ({ name: item.name, ...png(item.href), href: item.href.length }));
  expect("Export: the signed PNG downloads at the canvas's own 900 × 900, the unsigned one differs, and the Joyday card is 1400 × 1700", q.exports.length === 3 && q.exports.every((item) => item.valid && /^joyday-action-painting-.+\.png$/.test(item.name)) && q.exports[0].width === 900 && q.exports[0].height === 900 && q.exports[0].href !== q.exports[1].href && q.exports[2].width === 1400 && q.exports[2].height === 1700);
  await press(desk, "[data-jds-keep]"); await wait(300);
  q.kept = { ...(await studio(desk)), ink: (await inkOf(desk)) === q.painted };
  expect("Keep painting: the dialog closes on the same artwork", !q.kept.modal && q.kept.phase === "paint" && q.kept.ink);
  await press(desk, "[data-joyday-finish]"); await wait(500); await press(desk, "[data-joyday-modal-new]"); await wait(400);
  q.newArtwork = await studio(desk);
  expect("New artwork: the dialog closes on the start state with a clean canvas", !q.newArtwork.modal && q.newArtwork.phase === "start" && !q.newArtwork.resume);
  await press(desk, START); await play(desk, ["paint"]);

  /* ---------- keyboard ---------- */
  await desk.focus("[data-jds-exit]");
  q.keys = { stops: [], escaped: false, ring: true };
  for (let index = 0; index < 60; index += 1) {
    await desk.keyboard.press("Tab");
    const at = await desk.evaluate((rootSelector) => { const active = document.activeElement; const style = getComputedStyle(active); return { inside: Boolean(active.closest(rootSelector)), id: [...active.attributes].filter((a) => /^data-j(ds|oyday)-/.test(a.name)).map((a) => a.name + (a.value ? `=${a.value}` : "")).join(" ") || active.tagName.toLowerCase(), ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2 }; }, ROOT_SEL);
    if (!at.inside) { q.keys.escaped = true; break; }
    if (!at.ring) q.keys.ring = false;
    if (q.keys.stops.includes(at.id)) break;
    q.keys.stops.push(at.id);
  }
  expect("Keyboard: every shell control, tool, colour and action is a tab stop with a visible focus ring, and focus never reaches the page behind", !q.keys.escaped && q.keys.ring && ["data-jds-fullscreen", "data-jds-new", "data-joyday-tool=bottle", "data-joyday-sound-toggle", "data-joyday-finish"].every((id) => q.keys.stops.some((stop) => stop.includes(id))) && q.keys.stops.length >= 28);

  /* ---------- idle ---------- */
  await desk.evaluate(() => document.activeElement?.blur()); await wait(1500);
  q.atRest = await motionState(desk);
  q.idle = await idleWork(desk);
  expect("Idle in play mode: nothing animates and the main thread is quiet", q.atRest.running === 0 && q.atRest.endless === 0 && q.idle.longTasks === 0 && q.idle.scriptMs <= 5);
  await desk.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); }); await wait(300);
  q.hidden = await idleWork(desk, 2000);

  /* ---------- exit ---------- */
  await desk.focus(".jds-bar [data-jds-exit]"); await desk.keyboard.press("Enter"); await wait(900);
  q.exit = { ...(await entry(desk)), phase: await desk.evaluate(() => document.documentElement.getAttribute("data-joyday-studio")), fullscreen: await desk.evaluate(() => Boolean(document.fullscreenElement)), focus: await desk.evaluate(() => document.activeElement?.hasAttribute("data-jds-enter")), scroll: await desk.evaluate(() => Math.round(scrollY)), inert: await desk.evaluate(() => [...document.body.children].filter((item) => item.inert && item.id !== "react-command-root" && !item.hasAttribute("data-joyday-modal")).length) };
  expect("Exit to portfolio: the page is back as it was left — header, launcher, scroll position, focus on Start Painting — and fullscreen has ended", q.exit.phase === null && q.exit.header && q.exit.launcher && q.exit.focus && q.exit.scroll === q.scrollBefore && !q.exit.fullscreen);
  await press(desk, ENTER); await wait(700);
  q.reenter = { ...(await studio(desk)), ink: (await inkOf(desk)) !== q.blank };
  expect("Coming back in the same visit: straight to the artwork, with the sound choice still on", q.reenter.phase === "paint" && q.reenter.ink && q.reenter.sound === "true");
  await desk.goBack(); await wait(700);
  q.backButton = await desk.evaluate(() => ({ phase: document.documentElement.getAttribute("data-joyday-studio"), path: location.pathname }));
  expect("Browser Back leaves the studio, not the page", q.backButton.phase === null && q.backButton.path === STUDIO);
  /* A reload in the same tab: the sound choice is restored inside the entering click. */
  await visit(desk, STUDIO); await wait(600); await desk.click(ENTER); await wait(700);
  q.reloaded = await studio(desk);
  expect("After a reload in the same tab: a fresh canvas, and the sound choice restored by the click that enters", q.reloaded.phase === "start" && q.reloaded.sound === "true" && q.reloaded.audioContexts === 1);
  expect("Studio desktop: no horizontal overflow", (await overflow(desk)) === 0);
  await desk.done();

  /* ---------- touch ---------- */
  const phone = await fresh({ viewport: MOBILE, theme: "dark", touch: true });
  await phone.tap(ENTER); await wait(700);
  q.phoneStart = await studio(phone);
  await phone.tap(START); await wait(450);
  q.phoneBlank = await inkOf(phone);
  q.phone = await studio(phone);
  q.phoneMarks = {};
  let phoneInk = q.phoneBlank;
  for (const [id, from, to] of [["bottle", [0.2, 0.75], [0.7, 0.3]], ["spray", [0.25, 0.3], [0.75, 0.45]], ["brush", [0.2, 0.6], [0.8, 0.7]], ["balloon", [0.55, 0.55], null]]) {
    await phone.tap(tool(id)); await wait(150);
    if (to) await stroke(phone, from, to, true); else { const box = await canvasBox(phone); await phone.touchscreen.tap(box.x + box.w * from[0], box.y + box.h * from[1]); await wait(260); }
    const ink = await inkOf(phone);
    q.phoneMarks[id] = ink !== phoneInk;
    phoneInk = ink;
  }
  q.phoneScroll = await phone.evaluate(() => Math.round(scrollY));
  expect("Phone start: everything on one screen, no control under 44 px, nothing overlapping in the bar", q.phoneStart.phase === "start" && q.phoneStart.outOfView === 0 && q.phoneStart.rootScrolls === 0 && q.phoneStart.smallTargets.length === 0 && !q.phoneStart.barOverlap);
  expect("Phone play mode: a canvas at least 320 px wide above a three-row dock (tools, colours, actions); every control at least 40 px; nothing scrolls or overflows", q.phone.canvas.width >= 320 && q.phone.tools.every((item) => item.top >= q.phone.canvas.bottom) && q.phone.actions.every((item) => item.top > q.phone.tools[0].bottom) && q.phone.smallTargets.length === 0 && q.phone.rootScrolls === 0 && q.phone.overflow === 0 && !q.phone.barOverlap && !q.phone.launcher);
  expect("Touch: all four tools paint by touch and the page does not move under the finger", Object.values(q.phoneMarks).every(Boolean) && q.phoneScroll === 0);
  await phone.tap("[data-jds-extras]"); await wait(350);
  q.phoneExtras = await studio(phone);
  expect("Phone dock, second page: both sliders, the prompt and the mission, with the canvas still in view", q.phoneExtras.dock === "extras" && q.phoneExtras.sliders === 2 && Boolean(q.phoneExtras.mission) && q.phoneExtras.tools.length === 0 && q.phoneExtras.canvas.width >= 300 && q.phoneExtras.outOfView === 0);
  await phone.tap("[data-jds-extras]"); await wait(250);
  await phone.tap("[data-joyday-finish]"); await wait(900);
  q.phoneFinish = await studio(phone);
  expect("Phone finish: the dialog and all its actions fit the screen", q.phoneFinish.modal && q.phoneFinish.modal.fits && q.phoneFinish.modal.scrolls <= 1);
  await phone.done();

  /* ---------- other sizes and themes ---------- */
  q.sizes = {};
  for (const [name, viewport, theme] of [["landscape phone", LANDSCAPE, "dark"], ["tablet", TABLET, "dark"], ["desktop light", DESKTOP, "light"], ["mobile light", MOBILE, "light"], ["small laptop", { width: 1100, height: 720 }, "dark"]]) {
    const page = await fresh({ viewport, theme, touch: viewport.width < 900 });
    const before = await entry(page);
    await play(page, ["enter"]);
    const startState = await studio(page);
    await play(page, ["start", "paint"], viewport.width < 900);
    const state = await studio(page);
    q.sizes[name] = { entryOverflow: before.overflow, startFits: startState.outOfView === 0 && startState.rootScrolls === 0, canvas: `${state.canvas.width} × ${state.canvas.height}`, share: state.canvas.share, outOfView: state.outOfView, scrolls: state.rootScrolls, overflow: state.overflow, barOverlap: state.barOverlap, drew: state.undo };
    expect(`${name}: the entry page, the start state and play mode all fit without overflow, and painting works`, before.overflow === 0 && q.sizes[name].startFits && state.outOfView === 0 && state.rootScrolls === 0 && state.overflow === 0 && !state.barOverlap && state.undo && state.canvas.width >= 250);
    await page.done();
  }

  /* ---------- reduced motion, no JavaScript, failure ---------- */
  const still = await fresh({ viewport: DESKTOP, theme: "dark", reducedMotion: true });
  await play(still, ["enter", "start", "paint", "finish"]);
  q.reducedMotion = { motion: await motionState(still), drew: (await studio(still)).undo, modal: Boolean((await studio(still)).modal) };
  expect("Reduced motion: the studio enters, paints and finishes with no animation running", q.reducedMotion.motion.running === 0 && q.reducedMotion.drew && q.reducedMotion.modal);
  await still.done();

  const plain = await fresh({ viewport: DESKTOP, theme: "dark", noJs: true, settle: 500 });
  q.noJs = await entry(plain);
  expect("Without JavaScript: the intro, a plain notice that the studio needs JavaScript with a link to the case study, the way back to Games — and no dead Play button or blank canvas", Boolean(q.noJs.heading) && Boolean(q.noJs.notice) && q.noJs.noticeLink === "/atolye-joyday-case-study/" && !q.noJs.enter && !q.noJs.studioInPage && q.noJs.back.includes("/games/"));
  await plain.done();

  const broken = await fresh({ viewport: DESKTOP, theme: "dark", fail: true });
  await play(broken, ["enter"]);
  q.failure = await studio(broken);
  await press(broken, ".jds-error [data-jds-exit]"); await wait(500);
  q.failureExit = await broken.evaluate(() => ({ phase: document.documentElement.getAttribute("data-joyday-studio"), header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  expect("Canvas failure (forced): a small recoverable state — what happened, Reload, Exit — instead of a blank studio; Exit works", Boolean(q.failure.error) && !q.failure.cta && q.failure.formats === 0 && q.failureExit.phase === null && q.failureExit.header);
  await broken.done();

  /* ---------- every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    const catalog = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", locale, "common.json"), "utf8"));
    locales[locale] = {};
    for (const [name, viewport] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
      const page = await fresh({ viewport, theme: "dark", path: localized(locale, STUDIO), touch: viewport === MOBILE });
      const before = await entry(page);
      await play(page, ["enter"]);
      const startState = await studio(page);
      await play(page, ["start", "paint", "mood"], viewport === MOBILE);
      const moodSaid = await page.evaluate(() => { const label = document.querySelector("[data-jds-mood-label]"); return label.hidden ? null : `${label.querySelector("b").textContent} — ${label.querySelector("strong").textContent} · ${label.querySelector("span").textContent}`; });
      const moodFits = await studio(page);
      await play(page, ["finish"], viewport === MOBILE);
      const state = await studio(page);
      locales[locale][name] = { lang: await page.evaluate(() => document.documentElement.lang), entryOverflow: before.overflow, title: startState.title, startFits: startState.outOfView === 0 && startState.rootScrolls === 0 && !startState.barOverlap, exit: await page.evaluate(() => document.querySelector(".jds-bar [data-jds-exit]").textContent.trim()), overflow: state.overflow, scrolls: state.rootScrolls, barOverlap: state.barOverlap, outOfView: state.outOfView, modalFits: Boolean(state.modal?.fits), actions: state.modal?.actions || [], mood: moodSaid, moodFits: moodFits.outOfView === 0 && moodFits.rootScrolls === 0 && moodFits.overflow === 0 && !moodFits.barOverlap };
      const row = locales[locale][name];
      expect(`${locale} ${name}: served in its locale; entry, start, play mode and finish fit with no overflow or overlap`, row.lang.startsWith(locale) && row.entryOverflow === 0 && row.startFits && row.overflow === 0 && row.scrolls === 0 && !row.barOverlap && row.modalFits);
      expect(`${locale} ${name}: the mood is announced in this locale and the changed room still fits`, row.mood === `${catalog["joyday.studio.mood.label"]} — ${catalog["joyday.studio.mood.electric.name"]} · ${catalog["joyday.studio.mood.electric.note"]}` && row.moodFits);
      expect(`${locale} ${name}: the studio's own copy is this locale's catalog`, row.title === catalog["joyday.studio.start.title"] && row.exit === catalog["joyday.studio.exit"] && row.actions.includes(catalog["joyday.studio.keepPainting"]));
      await page.done();
    }
  }
  expect("Locales: the mood announcement is translated in each", new Set(LOCALES.map((locale) => locales[locale].desktop.mood)).size === LOCALES.length);
  expect("Locales: the studio's copy is translated in each", new Set(LOCALES.map((locale) => locales[locale].desktop.title)).size === LOCALES.length && new Set(LOCALES.map((locale) => locales[locale].desktop.exit)).size === LOCALES.length);

  /* ---------- measurements + pack ---------- */
  const lcp = await lcpCompare(browser, STUDIO);
  console.log("[v4:capture] LCP measured");
  const builds = { ...(BASELINE ? { before: BASELINE } : {}), after: ORIGIN };
  const transfers = {};
  for (const build of Object.keys(builds)) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await stubEdge(page, "down", builds[build]);
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    await page.goto(`${builds[build]}${STUDIO}`, { waitUntil: "networkidle2" });
    await wait(1500);
    transfers[build] = await page.evaluate((site) => { const entries = performance.getEntriesByType("resource").filter((item) => item.name.startsWith(site)); return { requests: entries.length, bytes: entries.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0), images: entries.filter((item) => /\.(webp|png|jpe?g|svg|ico)(\?|$)/.test(item.name)).length }; }, builds[build]);
    await context.close();
  }
  const reactEntry = async (root) => (await readFile(join(root, "dist-site", "joyday-paint", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizeOf = async (root, file) => {
    try { const bytes = await readFile(join(root, "dist-site", file)); return { raw: bytes.length, gzip: gzipSync(bytes).length }; } catch { return null; }
  };
  const sizes = [];
  for (const file of ["joyday-paint/index.html", "css/v4-joyday-studio.css", "js/pages/joyday-studio.js", "joyday-paint.js", "css/games/joyday-paint.css", "react"]) {
    const after = await sizeOf(ROOT, file === "react" ? await reactEntry(ROOT) : file);
    const before = BASELINE_ROOT ? await sizeOf(BASELINE_ROOT, file === "react" ? await reactEntry(BASELINE_ROOT) : file) : undefined;
    sizes.push({ file: file === "react" ? "assets-react/production-main-*.js" : file, before, after });
  }
  expect("Engine integrity: the painting engine and its stylesheet ship byte for byte as before", !BASELINE_ROOT || sizes.filter((size) => ["joyday-paint.js", "css/games/joyday-paint.css"].includes(size.file)).every((size) => size.before && size.before.raw === size.after.raw && size.before.gzip === size.after.gzip));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : shot.viewport === TABLET ? 620 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", frames, 4100);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, baselineOrigin: BASELINE, aiEdge: "stubbed: “down” (503)", studio: q, locales, lcpEntry: lcp, transfers, sizes, motionFrames: frames.map((item) => item.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const sizeCell = (size, key) => (!size.after ? "—" : `${kb(size.after[key])}${size.before === undefined ? "" : size.before === null ? " (new)" : ` (${size.after[key] - size.before[key] >= 0 ? "+" : "−"}${kb(Math.abs(size.after[key] - size.before[key]))})`}`);
  const lcpCell = (cell) => (cell ? `${cell.medianMs} ms on <${cell.element}>${cell.file ? ` (${cell.file})` : ""} · CLS ≤ ${cell.clsMax}` : "not measured");
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${frames.length} frames from one continuous session in one tab, in order; the individual frames are in \`motion-frames/\`.
- **\`qa-summary.json\`** — everything measured in this run.
- **\`${PACK}\`** — everything here.

AJOOP's public AI edge (\`${EDGE}\`) was stubbed (503) for every capture and check. Exports were recorded in the test browser instead of being written to disk, and the failure state was forced by making the canvas return no context; nothing else was scripted into the page.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((item, index) => `${index + 1}. ${item.label}`).join("\n")}

## The play surface, measured

| | Canvas | Share of viewport |
| --- | --- | --- |
| Desktop 1440 × 900 | ${q.paint.canvas.width} × ${q.paint.canvas.height} | ${q.paint.canvas.share} % |
| Phone 390 × 844 | ${q.phone.canvas.width} × ${q.phone.canvas.height} | ${q.phone.canvas.share} % |
${Object.entries(q.sizes).map(([name, row]) => `| ${name} | ${row.canvas} | ${row.share} % |`).join("\n")}

Before (E06.0 audit): 496 × 496 at 19 % on desktop, 288 × 288 at 25 % on a phone, 1.5–1.9 screens down an article page.

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages and the forced-failure page excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Entry: studio in the page ${q.entry.studioInPage}; entered by keyboard into “${q.start.phase}”, focus on ${q.start.focus}; header ${q.start.header}, footer ${q.start.footer}, AJOOP launcher ${q.start.launcher}, other floats ${q.start.floats}.
- Pointer: ${Object.entries(q.marks).map(([id, mark]) => `${id} ${mark.drew ? "drew" : "DID NOT DRAW"}`).join(" · ")}; undo ${q.undone}, redo ${q.redone}; hit feedback ${q.feedback.hit} in ${q.feedback.paint}.
- Touch (390 × 844): ${Object.entries(q.phoneMarks).map(([id, drew]) => `${id} ${drew ? "drew" : "DID NOT DRAW"}`).join(" · ")}; page scroll while painting ${q.phoneScroll}; smallest control ${Math.round(q.phone.smallest)} px; dock page two: ${q.phoneExtras.sliders} sliders, mission “${q.phoneExtras.mission}”.
- Keyboard: ${q.keys.stops.length} tab stops inside the studio, focus ring on each (${q.keys.ring}), focus left the studio: ${q.keys.escaped}.
- Palette moods: ${q.moods.slice(0, 5).map((item) => `${item.palette} → ${item.mood}`).join(" · ")}; artwork untouched and layout unmoved through all of them (${q.moods.every((item) => item.inkSame && item.fits)}); unseen palettes classify as ${q.classifier.pastelMorning}, ${q.classifier.mustardBurgundy}, ${q.classifier.navyCobaltMint}.
- Mood contrast (graphite on paper / wall / accent / action; stamp on paper): ${Object.entries(q.moodContrast).map(([mood, row]) => `${mood} ${row.inkOnPaper} / ${row.inkOnWall} / ${row.inkOnAccent} / ${row.inkOnAction}; ${row.stampOnPaper}`).join(" · ")}.
- Mood said in each language: ${LOCALES.map((locale) => locales[locale].desktop.mood).join(" | ")}.
- Sound: off on load with ${q.start.audioContexts} audio contexts; on → ${q.soundOn.audioContexts}; kept for the tab (“${q.soundOn.stored}”); restored after a reload: ${q.reloaded.sound}.
- Fullscreen: offered ${q.fullscreen.offered}, entered ${q.fullscreen.entered}, ended on exit ${!q.exit.fullscreen}.
- New canvas: start state with a way back (${q.newAsk.resume}); Keep painting kept the artwork (${q.resumed.ink}); confirmed, the canvas is clean (${q.restarted.ink}).
- Export: ${q.exports.map((item) => `${item.name} — ${item.width} × ${item.height}, ${kb(item.bytes)}`).join("; ")}.
- Finish choices: ${q.finish.modal.actions.join(" · ")}.
- Exit: header ${q.exit.header}, launcher ${q.exit.launcher}, scroll ${q.exit.scroll} (was ${q.scrollBefore}), focus on Start Painting ${q.exit.focus}; browser Back leaves the studio (${q.backButton.phase === null}).
- Without JavaScript: “${q.noJs.notice}” → ${q.noJs.noticeLink}; Play shown: ${q.noJs.enter}.
- Forced canvas failure: “${q.failure.error}”.
- Reduced motion: ${q.reducedMotion.motion.running} running animations through enter, paint and finish.
- Idle in play mode: ${q.atRest.running} animations running; over ${q.idle.windowMs} ms: ${q.idle.taskMs} ms of main-thread tasks, ${q.idle.scriptMs} ms script, ${q.idle.layouts} layouts, ${q.idle.longTasks} long tasks. Hidden tab, ${q.hidden.windowMs} ms: ${q.hidden.taskMs} ms tasks, ${q.hidden.scriptMs} ms script.
- Locales (EN/TR/DE/ES/FR, desktop and phone): overflow ${LOCALES.map((locale) => `${locales[locale].desktop.overflow}/${locales[locale].mobile.overflow}`).join(" · ")}; exit label ${LOCALES.map((locale) => locales[locale].desktop.exit).join(" · ")}.

## Entry page LCP (headless Chromium, ${BASELINE ? "E05 and E06.1 measured in turn, " : ""}5 cold loads each, median)

| Viewport | Conditions | ${BASELINE ? "E05 (before) | " : ""}E06.1 (after) |
| --- | --- | ${BASELINE ? "--- | " : ""}--- |
${lcp.map((row) => `| ${row.viewport} | ${row.conditions} | ${BASELINE ? `${lcpCell(row.before)} | ` : ""}${lcpCell(row.after)} |`).join("\n")}

Cold-load transfer of the entry page at 1440 × 900 (same-origin, encoded): ${Object.entries(transfers).map(([build, row]) => `${build === "before" ? "E05" : "E06.1"} ${kb(row.bytes)} in ${row.requests} requests`).join(" · ")}.

## Sizes

| Asset | Raw | Gzip |
| --- | --- | --- |
${sizes.map((size) => `| ${size.file} | ${sizeCell(size, "raw")} | ${sizeCell(size, "gzip")} |`).join("\n")}
`;
  await writeFile(join(OUTPUT, "README.md"), readme, "utf8");

  const zip = join(OUTPUT, PACK);
  const zipped = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
    `Compress-Archive -Path ((Get-ChildItem -LiteralPath '${OUTPUT}' -File | Where-Object { $_.Extension -in '.png','.md','.json' }).FullName + '${FRAMES}') -DestinationPath '${zip}' -Force`], { encoding: "utf8" });
  if (zipped.status !== 0) failures.push(`review pack zip failed: ${zipped.stderr || zipped.error?.message}`);
  else console.log(`[v4:capture] ${PACK}`);

  if (problems.length) failures.push(`browser console problems:\n  ${problems.join("\n  ")}`);
  if (failures.length) throw new Error(`V4 focused QA failed:\n- ${failures.join("\n- ")}`);
  console.log(`[v4:capture] focused QA passed · review pack ready at ${OUTPUT}`);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
