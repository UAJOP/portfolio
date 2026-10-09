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
const PHASE = "v4-e06-2-ai-flow-puzzle";
const PACK = "V4-E06-2-review-pack.zip";
const TITLE = "V4-E06.2 · AI Flow Puzzle — a mission-based visual puzzle game";
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
const GAME = "/ai-flow-puzzle/";
/* The one failure a visitor can really meet: the engine's script never arrives. */
const ENGINE_SCRIPT = "/ai-flow-puzzle.js";
const blockEngine = async (page) => { page.blocked = ENGINE_SCRIPT; };

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
    if (page.blocked && new URL(url).pathname === page.blocked) { request.abort().catch(() => {}); return; }
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


/* ---------- the game, driven and read ---------- */

/* The three authored levels, stated here independently of the engine: what
 * each needs added to its starter board, and the connections its rules ask for. */
const NODE_ORDER = ["trigger", "intent", "router", "condition", "kb", "llm", "response", "fallback", "sheet", "crm", "email", "handoff", "end"];
const LEVELS = [
  { id: "joyday", add: ["intent", "condition", "sheet", "response", "fallback"], edges: [["trigger", "intent"], ["intent", "condition"], ["condition", "sheet"], ["sheet", "response"], ["response", "end"], ["condition", "fallback"], ["fallback", "end"]], outcomes: ["response", "fallback"] },
  { id: "support", add: ["intent", "router", "kb", "llm", "response", "fallback", "handoff"], edges: [["trigger", "intent"], ["intent", "router"], ["router", "kb"], ["kb", "llm"], ["llm", "response"], ["response", "end"], ["router", "handoff"], ["handoff", "end"], ["router", "fallback"], ["fallback", "end"]], outcomes: ["response", "handoff", "fallback"] },
  { id: "lead", add: ["intent", "crm", "email", "response", "fallback"], edges: [["trigger", "intent"], ["intent", "crm"], ["crm", "email"], ["email", "response"], ["response", "end"], ["intent", "fallback"], ["fallback", "end"]], outcomes: ["response", "fallback"] },
];
/* The order a flow executes in, worked out here from its connections alone:
 * depth first from the trigger, branches in the engine's stated node order. */
function executionOrder(edges) {
  const seen = new Set();
  const order = [];
  const walk = (type) => {
    if (seen.has(type)) return;
    seen.add(type); order.push(type);
    edges.filter(([from]) => from === type).map(([, to]) => to).sort((a, b) => NODE_ORDER.indexOf(a) - NODE_ORDER.indexOf(b)).forEach(walk);
  };
  walk("trigger");
  return order;
}

const node = (type) => `[data-ai-board] .ai-flow-node[data-type="${type}"]`;
const body = (type) => `${node(type)} [data-ai-node-body]`;
const outPort = (type) => `${node(type)} [data-ai-port="out"]`;
const inPort = (type) => `${node(type)} [data-ai-port="in"]`;
const press = async (page, selector) => { await page.evaluate((target) => document.querySelector(target).click(), selector); await wait(170); };
const phaseIs = (page, name, timeout = 20000) => page.waitForFunction((wanted) => document.documentElement.getAttribute("data-afp-state") === wanted, { timeout }, name);
const at = (page, selector) => page.evaluate((target) => { const rect = document.querySelector(target).getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; }, selector);

/* A real drag, by mouse or by finger. */
async function dragBetween(page, from, to, touch, { release = true, steps = 10 } = {}) {
  if (touch) {
    await page.touchscreen.touchStart(from.x, from.y);
    for (let step = 1; step <= steps; step += 1) await page.touchscreen.touchMove(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    if (release) await page.touchscreen.touchEnd();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    if (release) await page.mouse.up();
  }
  await wait(190);
}
/* Connect two nodes the way a visitor does: with a mouse, drag the output
 * port onto the target; with a finger, tap the port and then the target. */
async function connect(page, from, to, touch) {
  if (touch) {
    const port = await at(page, outPort(from));
    await page.touchscreen.tap(port.x, port.y); await wait(140);
    const target = await at(page, body(to));
    await page.touchscreen.tap(target.x, target.y); await wait(190);
    return;
  }
  await dragBetween(page, await at(page, outPort(from)), await at(page, body(to)), false);
}
async function addNode(page, type, touch) {
  /* A phone keeps the library in a sheet; a tablet shows it as a rail. */
  const inReach = await page.evaluate(() => Boolean(document.querySelector("[data-ai-add-node]")?.getClientRects().length));
  if (touch && !inReach) { await press(page, '[data-afp-sheet="library"]'); await wait(260); }
  if (touch) {
    /* The sheet scrolls: bring the entry under the finger first. */
    await page.evaluate((target) => document.querySelector(target).scrollIntoView({ block: "center", behavior: "instant" }), `[data-ai-add-node="${type}"]`); await wait(120);
    const button = await at(page, `[data-ai-add-node="${type}"]`); await page.touchscreen.tap(button.x, button.y); await wait(240);
  } else await press(page, `[data-ai-add-node="${type}"]`);
}
/* On a small screen, zoom out until the whole flow is under the finger. */
async function reach(page) {
  await press(page, '[data-afp-zoom="out"]'); await press(page, '[data-afp-zoom="out"]'); await press(page, '[data-afp-zoom="out"]');
  await page.evaluate(() => { const api = window.KaanFlowPuzzle; const middle = document.querySelector('.ai-flow-node[data-type="condition"], .ai-flow-node[data-type="router"], .ai-flow-node[data-type="crm"]'); if (middle) api.focusNode(middle.dataset.nodeId); document.activeElement?.blur(); });
  await wait(220);
}
/* Lay the flow out and bring all of it into reach of the pointer. */
async function tidy(page, touch) {
  await press(page, "[data-ai-arrange]");
  if (touch) await reach(page);
  await wait(260);
}
/* Build a level's whole flow by hand. `skip` leaves connections out. */
async function buildLevel(page, level, touch, skip = []) {
  for (const type of level.add) await addNode(page, type, touch);
  await tidy(page, touch);
  for (const [from, to] of level.edges) if (!skip.some(([a, b]) => a === from && b === to)) await connect(page, from, to, touch);
  await press(page, '[data-afp-zoom="fit"]');
  await wait(200);
}
async function runFlow(page, touch) {
  await press(page, touch ? "[data-afp-run]" : "[data-ai-run]");
}

const PROGRESS_KEY = "kaan-ai-flow-puzzle-progress-v3";
const game = (page) => page.evaluate((key) => {
  const html = document.documentElement;
  const root = document.querySelector("[data-afp-root]");
  const shown = (entry) => Boolean(entry && entry.getClientRects().length && getComputedStyle(entry).visibility !== "hidden");
  const box = (entry) => { const rect = entry.getBoundingClientRect(); return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  const api = window.KaanFlowPuzzle;
  const board = document.querySelector("[data-ai-board]");
  const typeOf = Object.fromEntries([...board.querySelectorAll(".ai-flow-node")].map((entry) => [entry.dataset.nodeId, entry.dataset.type]));
  const live = (entry) => !entry.closest("[inert]");
  const fixed = [...root.querySelectorAll(".afp-bar button, .afp-dock button, .afp-zoom button, .ai-puzzle-actions .btn, .afp-actions button, .afp-tabs button, .afp-selbar button, .afp-menu button, .afp-menu a")].filter(shown).filter(live);
  const inView = (entry) => { const rect = entry.getBoundingClientRect(); return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1; };
  const bar = [...root.querySelectorAll(".afp-bar > *, .ai-puzzle-topbar h2, .ai-puzzle-stats, .ai-puzzle-actions .btn")].filter(shown).map(box);
  const mission = root.querySelector(".afp-mission");
  const result = root.querySelector(".afp-result");
  const note = root.querySelector("[data-afp-note]");
  const world = board.querySelector("[data-ai-world]");
  const port = board.querySelector(".ai-flow-port-out");
  return {
    phase: html.getAttribute("data-afp-state"),
    sheet: html.getAttribute("data-afp-sheet"),
    tab: html.getAttribute("data-afp-tab"),
    rootShown: shown(root),
    rootBox: shown(root) ? box(root) : null,
    overflow: html.scrollWidth - html.clientWidth,
    pageScrolls: getComputedStyle(html).overflowY !== "hidden",
    scrollY: Math.round(scrollY),
    header: shown(document.querySelector(".site-header")),
    footer: shown(document.querySelector(".site-footer")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    floats: [...document.querySelectorAll("body > :not(main):not(script)")].filter(shown).length,
    inertOutside: [...document.body.children].filter((entry) => entry.tagName !== "MAIN" && entry.tagName !== "SCRIPT").every((entry) => entry.inert),
    board: shown(board) ? { ...box(board), share: Math.round((board.getBoundingClientRect().width * board.getBoundingClientRect().height * 100) / (innerWidth * innerHeight)) } : null,
    engine: api ? api.state() : null,
    transform: world ? world.style.transform : null,
    nodes: [...board.querySelectorAll(".ai-flow-node")].map((entry) => ({ type: entry.dataset.type, left: entry.style.left, top: entry.style.top, flagged: entry.classList.contains("is-flagged"), visited: entry.classList.contains("is-visited"), running: entry.classList.contains("is-running"), selected: entry.classList.contains("is-selected"), source: entry.classList.contains("is-source"), width: Math.round(entry.getBoundingClientRect().width) })),
    links: [...document.querySelectorAll("[data-ai-lines] .ai-flow-link")].map((entry) => { const [from, to] = entry.getAttribute("data-link-key").split("->"); return { edge: `${typeOf[from]}>${typeOf[to]}`, live: entry.classList.contains("is-live"), done: entry.classList.contains("is-done"), selected: entry.classList.contains("is-selected") }; }),
    status: { text: text(root.querySelector("[data-ai-flow-status] span")), tone: root.querySelector("[data-ai-flow-status]").dataset.tone || null },
    score: Number(text(root.querySelector("[data-ai-score]"))),
    hints: Number(text(root.querySelector("[data-afp-hints]"))),
    level: text(root.querySelector("[data-afp-level]")),
    title: text(root.querySelector("[data-ai-scenario-title]")),
    note: shown(note) ? text(note) : null,
    hinted: [...root.querySelectorAll(".ai-palette-node.is-hinted")].map((entry) => entry.getAttribute("data-ai-add-node")),
    library: { shown: shown(root.querySelector("[data-ai-palette]")), groups: [...root.querySelectorAll(".ai-palette-group")].map((entry) => text(entry.querySelector(".ai-palette-group-title"))), nodes: root.querySelectorAll("[data-ai-add-node]").length },
    panel: shown(root.querySelector(".ai-puzzle-side")) ? [...root.querySelectorAll(".ai-side-card")].filter(shown).length : 0,
    dock: shown(root.querySelector(".afp-dock")),
    selbar: shown(root.querySelector("[data-afp-selbar]")) ? [...root.querySelectorAll("[data-afp-selbar] button")].map(text) : null,
    mission: shown(mission) ? { title: text(mission.querySelector("h2")), kicker: text(mission.querySelector(".afp-kicker")), scenario: text(mission.querySelector(".afp-brief section p")), input: text(mission.querySelector("blockquote")), expected: [...mission.querySelectorAll(".afp-expect li")].map(text), constraints: [...mission.querySelectorAll(".afp-chips li")].map(text), tip: text(mission.querySelector(".afp-sticky")), progress: text(mission.querySelector(".afp-card__count")), levels: [...mission.querySelectorAll(".afp-progress li")].map((entry) => ({ solved: entry.classList.contains("is-solved"), current: entry.classList.contains("is-current"), text: text(entry) })), start: text(mission.querySelector("[data-afp-start]")), back: text(mission.querySelector("[data-afp-leave]")), startInView: inView(mission.querySelector("[data-afp-start]")) } : null,
    result: shown(result) ? { title: text(result.querySelector("h2")), lead: text(result.querySelector(".afp-verdict p")), issues: [...result.querySelectorAll(".afp-issues button")].map(text), outcomes: [...result.querySelectorAll(".afp-outcomes li")].map((entry) => ({ text: text(entry), reached: entry.classList.contains("is-ok") })), stats: [...result.querySelectorAll(".afp-stats div")].map((entry) => `${text(entry.querySelector("dt"))}: ${text(entry.querySelector("dd"))}`), meters: [...result.querySelectorAll(".afp-meters li")].map(text), total: text(result.querySelector(".afp-total")), assisted: text(result.querySelector(".afp-assisted")) || null, actions: [...result.querySelectorAll(".afp-actions button")].map(text), fits: (() => { const sheet = result.querySelector(".afp-sheet").getBoundingClientRect(); return sheet.left >= 0 && sheet.right <= innerWidth + 1; })(), actionsInView: [...result.querySelectorAll(".afp-actions button")].every(inView) } : null,
    error: shown(root.querySelector("[data-afp-error]")) ? text(root.querySelector("[data-afp-error]")) : null,
    smallest: fixed.length ? Math.round(Math.min(...fixed.map((entry) => Math.min(entry.getBoundingClientRect().width, entry.getBoundingClientRect().height)))) : null,
    smallTargets: fixed.filter((entry) => Math.min(entry.getBoundingClientRect().width, entry.getBoundingClientRect().height) < 40).map((entry) => `${entry.tagName.toLowerCase()}${[...entry.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}${a.value ? `=${a.value}` : ""}]`).join("")} ${Math.round(entry.getBoundingClientRect().width)}×${Math.round(entry.getBoundingClientRect().height)}`),
    /* A port's touch area: its dot plus the invisible margin around it, at the board's zoom. */
    portTarget: port ? (() => { const area = getComputedStyle(port, "::before"); const side = (name) => Math.abs(parseFloat(area[name])) || 0; return Math.round(Math.min(port.offsetWidth + side("left") + side("right"), port.offsetHeight + side("top") + side("bottom")) * (api ? api.state().zoom : 1)); })() : null,
    portOverBody: port ? (() => { const bodyBox = port.parentElement.querySelector("[data-ai-node-body]").getBoundingClientRect(); const hit = document.elementFromPoint(bodyBox.left + bodyBox.width / 2, bodyBox.top + bodyBox.height / 2); return Boolean(hit && hit.closest(".ai-flow-port")); })() : null,
    outOfView: fixed.filter((entry) => !inView(entry)).length,
    barOverlap: bar.some((a, i) => bar.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)),
    focus: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${[...document.activeElement.attributes].filter((a) => /^data-a(fp|i)-/.test(a.name)).map((a) => `[${a.name}${a.value ? `=${a.value}` : ""}]`).join("")}` : null,
    progress: localStorage.getItem(key),
    legacyScore: localStorage.getItem("kaan-ai-flow-puzzle-score-v2"),
  };
}, PROGRESS_KEY);

/* The portfolio page: the hub. */
const hub = (page) => page.evaluate(() => {
  const shown = (target) => Boolean(target && target.getClientRects().length);
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  return {
    heading: text(document.querySelector("h1")),
    by: text(document.querySelector(".afp-by span")),
    play: shown(document.querySelector("[data-afp-play]")) ? text(document.querySelector("[data-afp-play]")) : null,
    missions: text(document.querySelector(".afp-hub__head strong")),
    progress: text(document.querySelector("[data-afp-progress]")),
    cards: [...document.querySelectorAll("[data-afp-levels] .afp-level")].filter(shown).map((entry) => ({ title: text(entry.querySelector("strong")), difficulty: text(entry.querySelector(".afp-level__meta em")), size: text(entry.querySelector(".afp-level__meta span")), state: text(entry.querySelector(".afp-level__state")), solved: entry.classList.contains("is-solved"), height: Math.round(entry.getBoundingClientRect().height) })),
    how: [...document.querySelectorAll(".afp-how li")].filter(shown).length,
    workspaceInPage: shown(document.querySelector("[data-afp-root]")),
    notice: shown(document.querySelector(".afp-noscript")) ? text(document.querySelector(".afp-noscript")) : null,
    noticeLink: document.querySelector(".afp-noscript a")?.getAttribute("href") || null,
    back: [...document.querySelectorAll(".ai-puzzle-hero a[href]")].filter(shown).map((link) => link.getAttribute("href")),
    header: shown(document.querySelector(".site-header")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    phase: document.documentElement.getAttribute("data-afp-state"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    focus: document.activeElement?.getAttribute("data-afp-open") ?? (document.activeElement?.hasAttribute("data-afp-play") ? "play" : null),
  };
});

/* Test-browser preparation, run before the page's own scripts: the engine's
 * own events are recorded, and downloads are kept instead of written to disk. */
const instrument = (page) => page.evaluateOnNewDocument(() => {
  window.__steps = [];
  window.__results = [];
  document.addEventListener("aiflow:run-step", (event) => window.__steps.push({ type: event.detail.type, via: event.detail.via }));
  document.addEventListener("aiflow:result", (event) => window.__results.push(JSON.parse(JSON.stringify(event.detail))));
  window.__exports = [];
  URL.revokeObjectURL = () => {};
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) { if (this.download) { window.__exports.push({ name: this.download, href: this.href }); return undefined; } return click.apply(this, args); };
});
const lastResult = (page) => page.evaluate(() => window.__results.at(-1) || null);
const stored = (value) => { try { return JSON.parse(value); } catch { return null; } };

/* In contact-sheet order. `play` is a script of steps, run in order. */
const shots = [
  { name: "01-level-select.png", label: "Level select · 1440 × 900 · the page is the hub: the game's name, three missions with their size and state, how to play, Play", viewport: DESKTOP, theme: "dark", play: [] },
  { name: "02-mission-briefing.png", label: "Mission briefing · scenario, the input message, what must reach End, the level's real constraints, one action", viewport: DESKTOP, theme: "dark", play: ["open"] },
  { name: "03-workspace-empty.png", label: "Workspace, empty · the portfolio is gone: bar, node library by role, the board with the starter nodes, the panel on Mission", viewport: DESKTOP, theme: "dark", play: ["open", "start"] },
  { name: "04-workspace-built.png", label: "Workspace, flow built · seven nodes wired port to port; wires take the colour of the node they leave", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build"] },
  { name: "05-run-flow.png", label: "Run flow, in progress · the signal crosses a wire into the next node; passed nodes and wires stay lit; the log fills", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build", "run-mid"] },
  { name: "06-failure.png", label: "Failure · a flow with its fallback branch left open: what went wrong (each line jumps to the node), expected vs. actual", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build-open", "run-end"] },
  { name: "07-failure-on-board.png", label: "Back on the board · the nodes the verdict named are flagged, and a hint is pinned as a note", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build-open", "run-end", "resume", "hint"] },
  { name: "08-success.png", label: "Success · the level's real quality score and its five parts, hints used, nodes used, total score", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build", "run-end"] },
  { name: "09-progression.png", label: "Progression · Next mission opens level 02's briefing with one of three solved and the best score kept", viewport: DESKTOP, theme: "dark", play: ["open", "start", "build", "run-end", "next"] },
  { name: "10-mobile-workspace.png", label: "Mobile · 390 × 844 · the board is the screen: the flow runs top to bottom, ports sit on top and bottom, Run in the dock", viewport: MOBILE, theme: "dark", touch: true, play: ["open", "start", "build"] },
  { name: "11-mobile-library.png", label: "Mobile · node library as a bottom sheet, grouped by role", viewport: MOBILE, theme: "dark", touch: true, play: ["open", "start", "library"] },
  { name: "12-mobile-result.png", label: "Mobile · result", viewport: MOBILE, theme: "dark", touch: true, play: ["open", "start", "build", "run-end"] },
  { name: "13-mobile-mission.png", label: "Mobile · mission briefing, Start mission kept in reach", viewport: MOBILE, theme: "dark", touch: true, play: ["open"] },
  { name: "14-mobile-selection.png", label: "Mobile · a selected node: connect, inspect or remove without opening a panel", viewport: MOBILE, theme: "dark", touch: true, play: ["open", "start", "build", "select"] },
  { name: "15-tablet-workspace.png", label: "Tablet · 820 × 1180 · library as an icon rail, panel as a drawer, dock", viewport: TABLET, theme: "dark", touch: true, play: ["open", "start", "build", "panel"] },
  { name: "16-light-level-select.png", label: "Light theme · the hub is the same paper in either site theme", viewport: DESKTOP, theme: "light", play: [] },
  { name: "17-mobile-level-select.png", label: "Mobile · level select", viewport: MOBILE, theme: "dark", touch: true, play: [] },
  { name: "18-no-js.png", label: "Without JavaScript · a plain notice and the way to the case study; no Play, no empty board", viewport: DESKTOP, theme: "dark", noJs: true, play: [] },
  { name: "19-engine-failure.png", label: "Engine failed to load (forced for this capture) · a recoverable state: Reload or Level select", viewport: DESKTOP, theme: "dark", fail: true, play: ["play"] },
];

/* The steps a shot or a check can ask for. */
async function play(page, steps, touch = false) {
  const level = LEVELS[0];
  for (const step of steps) {
    if (step === "open") { await press(page, '[data-afp-open="0"]'); await wait(520); }
    if (step === "play") { await press(page, "[data-afp-play]"); await wait(520); }
    if (step === "start") { await press(page, "[data-afp-start]"); await wait(520); }
    if (step === "build") await buildLevel(page, level, touch);
    if (step === "build-open") await buildLevel(page, level, touch, [["condition", "fallback"], ["fallback", "end"]]);
    if (step === "run-mid") { await runFlow(page, touch); await wait(1560); }
    if (step === "run-end") { await runFlow(page, touch); await page.waitForFunction(() => ["success", "failure"].includes(document.documentElement.getAttribute("data-afp-state")), { timeout: 20000 }); await wait(650); }
    if (step === "resume") { await press(page, "[data-afp-resume]"); await wait(300); }
    if (step === "hint") { await press(page, touch ? '[data-afp-press="[data-ai-hint]"]' : "[data-ai-hint]"); await wait(420); }
    if (step === "next") { await press(page, "[data-afp-next]"); await wait(520); }
    if (step === "library") { await press(page, '[data-afp-sheet="library"]'); await wait(420); }
    if (step === "panel") { await press(page, '[data-afp-sheet="side"]'); await wait(420); }
    if (step === "select") { const target = await at(page, body("condition")); if (touch) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y); await wait(320); }
  }
}

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
  /* Every page gets its own context, and so its own storage: no progress leaks between checks. */
  const fresh = async (options) => {
    const context = await browser.createBrowserContext();
    const page = await open(context, { path: GAME, settle: 700, ...options, prepare: async (target) => { if (!options.noJs) await instrument(target); if (options.fail) await blockEngine(target); if (options.prepare) await options.prepare(target); } }, options.noJs || options.fail ? [] : problems);
    if (!options.noJs && !options.fail) await page.waitForFunction(() => window.KaanFlowPuzzle && document.querySelector("[data-afp-levels] .afp-level"), { timeout: 20000 });
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
  { const card = await at(film, '[data-afp-open="0"]'); await film.mouse.move(card.x, card.y); await wait(260); }
  await frame("Choose a level: the first mission lifts under the pointer");
  await film.mouse.down(); await film.mouse.up(); await wait(120);
  await frame("The briefing arrives: the portfolio steps out, the paper sheet rises");
  await wait(520);
  await frame("Briefing: scenario, input, expected output, constraints");
  await press(film, "[data-afp-start]"); await wait(110);
  await frame("Start mission: the workspace comes forward with the starter board");
  await wait(420);
  for (const type of LEVELS[0].add) await addNode(film, type, false);
  await tidy(film, false);
  await connect(film, "trigger", "intent", false);
  await dragBetween(film, await at(film, outPort("intent")), await at(film, body("condition")), false, { release: false });
  await frame("Connect: a wire drawn from Intent Detector's port; the node under it takes the ring");
  await film.mouse.up(); await wait(200);
  for (const [from, to] of LEVELS[0].edges.slice(2, 5)) await connect(film, from, to, false);
  await press(film, '[data-afp-zoom="fit"]'); await wait(200);
  await frame("The main branch is wired; the fallback branch is still open");
  await runFlow(film, false); await wait(820);
  await frame("Run flow: the signal has left the trigger and is crossing the second wire");
  await wait(1250);
  await frame("Run flow: three steps on — passed wires and nodes stay lit, the log follows");
  await phaseIs(film, "failure"); await wait(520);
  await frame("Failure: the branch that never reached End, named and compared");
  await press(film, "[data-afp-resume]"); await wait(350);
  await frame("Retry: back on the board with the two nodes to connect flagged");
  await connect(film, "condition", "fallback", false); await connect(film, "fallback", "end", false);
  await runFlow(film, false); await phaseIs(film, "success"); await wait(560);
  await frame("Success: the level's score, and the way to the next mission");
  await press(film, "[data-afp-next]"); await wait(520);
  await frame("Next: level 02's briefing, one of three solved");
  const filmed = await game(film);
  expect("Motion session: fail, retry, solve and Next mission lead to level 02's briefing with level 01 solved", filmed.phase === "mission" && filmed.mission.levels[0].solved && filmed.mission.levels[1].current);
  await film.done();

  /* ---------- hub, entering, mission ---------- */
  const q = {};
  const en = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", "en", "common.json"), "utf8"));
  const desk = await fresh({ viewport: DESKTOP, theme: "dark" });
  q.hub = await hub(desk);
  expect("Hub: the page is the level select — the game's name and by-line, three missions each stating its size, progress at 0 of 3, how to play in three steps, and the workspace not in the page", q.hub.heading === "AI Flow Puzzle" && q.hub.by === en["aiFlow.game.by"] && q.hub.cards.length === 3 && q.hub.cards.every((card) => /^\d+ Nodes · \d+ Links$/.test(card.size) && !card.solved) && q.hub.progress.startsWith("0 of 3 solved") && q.hub.how === 3 && !q.hub.workspaceInPage && q.hub.header && q.hub.launcher && q.hub.back.includes("/games/"));
  expect("Hub: difficulty is the level's stated size and nothing is locked — Standard, Advanced, Standard; all three open", same(q.hub.cards.map((card) => card.difficulty), ["Standard", "Advanced", "Standard"]));
  await desk.evaluate(() => window.scrollTo({ top: 60, behavior: "instant" })); await wait(250);
  q.scrollBefore = await desk.evaluate(() => Math.round(scrollY));
  await desk.focus('[data-afp-open="0"]'); await desk.keyboard.press("Enter"); await wait(600);
  q.mission = await game(desk);
  expect("Entered by keyboard: the briefing fills the viewport, focus is on Start mission, and the page behind cannot scroll", q.mission.phase === "mission" && q.mission.rootBox.width === DESKTOP.width && q.mission.rootBox.height === DESKTOP.height && q.mission.focus === "button[data-afp-start]" && !q.mission.pageScrolls);
  expect("Entered: the portfolio's header, footer, AJOOP launcher and floating controls are gone and inert", !q.mission.header && !q.mission.footer && !q.mission.launcher && q.mission.floats === 0 && q.mission.inertOutside);
  expect("Briefing: level 01's title, its scenario, the test message as input, the two branches that must reach End, and its real constraints (7 nodes, 7 connections, hints counted)", q.mission.mission.title === "Joyday Reservation Bot" && q.mission.mission.kicker.startsWith("Level 01") && q.mission.mission.scenario.length > 40 && q.mission.mission.input.length > 10 && same(q.mission.mission.expected, ["Response reaches End", "Fallback reaches End"]) && same(q.mission.mission.constraints, ["7 required nodes", "7 required connections", en["aiFlow.game.mission.hints"]]) && q.mission.mission.start === en["aiFlow.game.mission.start"] && q.mission.mission.startInView);
  await desk.keyboard.press("Enter"); await wait(600);
  q.empty = await game(desk);
  expect("Workspace: the board takes at least half the screen with the library and panel docked beside it; nothing scrolls the page; no bar control overlaps another", q.empty.phase === "building" && q.empty.board.share >= 50 && q.empty.board.width >= 800 && q.empty.overflow === 0 && !q.empty.pageScrolls && !q.empty.barOverlap && q.empty.outOfView === 0);
  expect("Workspace: the starter board (trigger and end), the library's thirteen nodes in their seven existing roles, the panel on Mission, score 0, no hints used", same(q.empty.nodes.map((item) => item.type), ["trigger", "end"]) && q.empty.library.nodes === 13 && same(q.empty.library.groups, ["Input", "AI Logic", "Logic", "Data", "Output", "Safety", "Automation"]) && q.empty.tab === "mission" && q.empty.panel === 1 && q.empty.score === 0 && q.empty.hints === 0 && q.empty.level === "Level 01");

  /* ---------- add, drag, connect, reconnect, delete ---------- */
  await addNode(desk, "intent", false);
  { const from = await at(desk, '[data-ai-add-node="fallback"]'); const boardBox = q.empty.board; const drop = { x: boardBox.left + boardBox.width * 0.62, y: boardBox.top + boardBox.height * 0.72 }; await dragBetween(desk, from, drop, false, { steps: 14 }); q.dropped = { drop, landed: await at(desk, node("fallback")) }; }
  q.added = await game(desk);
  expect("Add: a library node is added with a click, and another carried onto the board lands under the pointer", same(q.added.nodes.map((item) => item.type), ["trigger", "end", "intent", "fallback"]) && Math.abs(q.dropped.landed.x - q.dropped.drop.x) < 6 && Math.abs(q.dropped.landed.y - q.dropped.drop.y) < 6);
  { const from = await at(desk, body("intent")); await dragBetween(desk, from, { x: from.x - 90, y: from.y - 120 }, false); }
  q.moved = await game(desk);
  expect("Drag: a node follows the pointer", q.moved.nodes.find((item) => item.type === "intent").left !== q.added.nodes.find((item) => item.type === "intent").left && q.moved.nodes.find((item) => item.type === "intent").top !== q.added.nodes.find((item) => item.type === "intent").top);
  await desk.mouse.click((await at(desk, body("intent"))).x, (await at(desk, body("intent"))).y); await wait(200);
  q.selected = await game(desk);
  expect("Select: clicking a node selects it and opens its inspector — it no longer arms a connection", q.selected.nodes.find((item) => item.type === "intent").selected && !q.selected.nodes.some((item) => item.source) && q.selected.tab === "node" && q.selected.links.length === 0);
  await connect(desk, "trigger", "intent", false);
  q.linked = await game(desk);
  expect("Connect: dragging an output port onto a node makes the connection", same(q.linked.links.map((item) => item.edge), ["trigger>intent"]) && q.linked.status.tone === "success");
  await connect(desk, "trigger", "intent", false);
  q.duplicate = await game(desk);
  await connect(desk, "intent", "trigger", false);
  q.intoTrigger = await game(desk);
  expect("Invalid connections are refused and said: a duplicate, and a wire into the trigger", q.duplicate.links.length === 1 && q.duplicate.status.tone === "warning" && q.intoTrigger.links.length === 1 && q.intoTrigger.status.tone === "warning" && q.intoTrigger.status.text === en["aiFlow.game.triggerInput"]);
  q.endHasNoOutput = await desk.evaluate((selector) => document.querySelector(selector) === null, outPort("end"));
  expect("Ports state the rule: the trigger has no input port and End has no output port", q.endHasNoOutput && (await desk.evaluate((selector) => document.querySelector(selector) === null, inPort("trigger"))));
  await addNode(desk, "condition", false);
  await connect(desk, "intent", "fallback", false);
  await dragBetween(desk, await at(desk, inPort("fallback")), await at(desk, body("condition")), false);
  q.rewired = await game(desk);
  expect("Reconnect: a wire picked up at its target end and dropped on another node is rewired there", same(q.rewired.links.map((item) => item.edge).sort(), ["intent>condition", "trigger>intent"]));
  { const from = await at(desk, inPort("condition")); await dragBetween(desk, from, { x: from.x - 40, y: from.y + 170 }, false); }
  q.dropped2 = await game(desk);
  expect("Delete by gesture: a wire picked up and let go over the empty board is removed", same(q.dropped2.links.map((item) => item.edge), ["trigger>intent"]));
  await connect(desk, "intent", "condition", false);
  { const label = await desk.evaluate(() => { const rect = document.querySelectorAll("[data-ai-lines] .ai-flow-link")[1].querySelector(".ai-flow-label rect").getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }); await desk.mouse.click(label.x, label.y); await wait(200); }
  q.wireSelected = await game(desk);
  await desk.keyboard.press("Delete"); await wait(200);
  q.wireDeleted = await game(desk);
  expect("Delete by key: a wire is selected by clicking it and removed with Delete", q.wireSelected.links[1].selected && q.wireSelected.tab === "node" && same(q.wireDeleted.links.map((item) => item.edge), ["trigger>intent"]));
  await desk.mouse.click((await at(desk, body("fallback"))).x, (await at(desk, body("fallback"))).y); await wait(160);
  await desk.keyboard.press("Delete"); await wait(200);
  q.nodeDeleted = await game(desk);
  expect("Delete by key: the selected node goes, with focus still on the board", !q.nodeDeleted.nodes.some((item) => item.type === "fallback") && q.nodeDeleted.nodes.length === 4);

  /* ---------- keyboard on the board ---------- */
  await desk.focus(body("condition"));
  const beforeKeys = (await game(desk)).nodes.find((item) => item.type === "condition");
  await desk.keyboard.press("ArrowRight"); await desk.keyboard.press("ArrowDown"); await wait(120);
  const afterKeys = (await game(desk)).nodes.find((item) => item.type === "condition");
  await desk.focus(outPort("intent")); await desk.keyboard.press("Enter"); await wait(160);
  q.armed = (await game(desk)).nodes.find((item) => item.type === "intent").source;
  await desk.focus(body("condition")); await desk.keyboard.press("Enter"); await wait(200);
  q.keyboard = { moved: beforeKeys.left !== afterKeys.left && beforeKeys.top !== afterKeys.top, armed: q.armed, links: (await game(desk)).links.map((item) => item.edge), focus: (await game(desk)).focus };
  expect("Keyboard: arrow keys move the focused node; Enter on an output port arms it and Enter on a node connects — focus stays on the board throughout", q.keyboard.moved && q.keyboard.armed && same(q.keyboard.links.sort(), ["intent>condition", "trigger>intent"]) && q.keyboard.focus.startsWith("button[data-ai-node-body"));

  /* ---------- pan, zoom, fit ---------- */
  const viewOf = async () => { const state = await game(desk); return { transform: state.transform, zoom: Math.round(state.engine.zoom * 1000) / 1000, scrollY: state.scrollY }; };
  q.view = { start: await viewOf() };
  { const boardBox = q.empty.board; const from = { x: boardBox.left + boardBox.width * 0.5, y: boardBox.top + 60 }; await dragBetween(desk, from, { x: from.x + 140, y: from.y + 90 }, false); }
  q.view.panned = await viewOf();
  { const boardBox = q.empty.board; await desk.mouse.move(boardBox.left + boardBox.width / 2, boardBox.top + boardBox.height / 2); await desk.mouse.wheel({ deltaY: -360 }); await wait(200); }
  q.view.wheeled = await viewOf();
  await press(desk, '[data-afp-zoom="out"]'); q.view.out = await viewOf();
  await press(desk, '[data-afp-zoom="in"]'); q.view.in = await viewOf();
  await press(desk, '[data-afp-zoom="fit"]'); q.view.fit = await viewOf();
  q.view.nodesInView = await desk.evaluate(() => { const board = document.querySelector("[data-ai-board]").getBoundingClientRect(); return [...document.querySelectorAll(".ai-flow-node")].every((entry) => { const rect = entry.getBoundingClientRect(); return rect.left >= board.left && rect.right <= board.right && rect.top >= board.top && rect.bottom <= board.bottom; }); });
  expect("Pan and zoom: dragging the empty board pans it, the wheel and the buttons zoom, Fit brings every node back into view — and the page never scrolls", q.view.panned.transform !== q.view.start.transform && q.view.panned.zoom === q.view.start.zoom && q.view.wheeled.zoom > q.view.panned.zoom && q.view.out.zoom < q.view.wheeled.zoom && q.view.in.zoom > q.view.out.zoom && q.view.nodesInView && [q.view.panned, q.view.wheeled, q.view.fit].every((item) => item.scrollY === q.empty.scrollY));

  /* ---------- Run flow on an unfinished board: failure that teaches ---------- */
  await desk.evaluate(() => { window.__steps.length = 0; });
  await runFlow(desk, false);
  await wait(520);
  q.runningPartial = await game(desk);
  await phaseIs(desk, "failure"); await wait(300);
  q.failure = { state: await game(desk), detail: await lastResult(desk), steps: await desk.evaluate(() => window.__steps.map((step) => step.type)) };
  expect("Run flow on an unfinished board: the signal still travels the flow as built — trigger, Intent Detector, Condition — and stops where the connections stop", q.runningPartial.phase === "running" && same(q.failure.steps, ["trigger", "intent", "condition"]));
  expect("Failure names what is really wrong with this board: the three nodes not added, End unreachable from the trigger, the flow stopping at Condition — and both closing branches shown as not reaching End", q.failure.state.phase === "failure" && !q.failure.detail.valid && same(q.failure.detail.issues.map((issue) => issue.kind), ["missingNode", "missingNode", "missingNode", "unreachable", "deadEnd"]) && same(q.failure.detail.issues.slice(0, 3).map((issue) => issue.type), ["sheet", "response", "fallback"]) && q.failure.state.result.issues.length === 5 && q.failure.state.result.issues[3].includes("End") && q.failure.state.result.issues[4].includes("Condition") && same(q.failure.state.result.outcomes.map((item) => item.reached), [false, false]) && q.failure.state.result.title === en["aiFlow.game.fail.title"]);
  expect("Failure scores nothing: score 0 and no progress stored", q.failure.state.score === 0 && q.failure.state.progress === null && q.failure.detail.completion === null);
  await press(desk, '[data-afp-issue="3"]'); await wait(300);
  q.afterFailure = await game(desk);
  expect("An issue line returns to the board with the nodes it names flagged, and focus on the first of them", q.afterFailure.phase === "building" && q.afterFailure.nodes.filter((item) => item.flagged).map((item) => item.type).sort().join() === "condition,end" && q.afterFailure.focus.startsWith("button[data-ai-node-body"));

  /* ---------- hints ---------- */
  await press(desk, "[data-ai-hint]"); await wait(300);
  q.hint = await game(desk);
  expect("Hint: names the next missing piece on a note, points at it in the library, and is counted", q.hint.hints === 1 && q.hint.engine.hints === 1 && same(q.hint.hinted, ["sheet"]) && q.hint.note.includes("Google Sheets"));
  await addNode(desk, "sheet", false);
  q.hintCleared = await game(desk);
  expect("A hint that has been acted on leaves the board", q.hintCleared.note === null && q.hintCleared.hinted.length === 0);

  /* ---------- finish level 01 by hand: run order, success, score ---------- */
  await addNode(desk, "response", false); await addNode(desk, "fallback", false);
  await tidy(desk, false);
  for (const [from, to] of LEVELS[0].edges.slice(2)) await connect(desk, from, to, false);
  await press(desk, '[data-afp-zoom="fit"]');
  q.built = await game(desk);
  expect("Level 01 built by hand: seven nodes and exactly the seven required connections", q.built.nodes.length === 7 && same(q.built.links.map((item) => item.edge).sort(), LEVELS[0].edges.map(([from, to]) => `${from}>${to}`).sort()));
  await desk.evaluate(() => { window.__steps.length = 0; });
  await runFlow(desk, false);
  q.runSamples = [];
  for (let index = 0; index < 9; index += 1) { await wait(330); const state = await game(desk); q.runSamples.push({ phase: state.phase, live: state.links.filter((item) => item.live).length, done: state.links.filter((item) => item.done).length, running: state.nodes.filter((item) => item.running).map((item) => item.type).join(), visited: state.nodes.filter((item) => item.visited).length }); }
  await phaseIs(desk, "success"); await wait(300);
  q.success = { state: await game(desk), detail: await lastResult(desk), steps: await desk.evaluate(() => window.__steps) };
  const edgeOf = (key, state) => state.links.length && key;
  expect("Run flow follows the real execution order: the steps are exactly the flow's depth-first order from the trigger, worked out independently from its connections", same(q.success.steps.map((step) => step.type), executionOrder(LEVELS[0].edges)) && q.success.steps[0].via === null && q.success.steps.slice(1).every((step) => typeof step.via === "string" && Boolean(edgeOf(step.via, q.success.state))));
  expect("Run flow is visible while it happens: one wire or node lit at a time, passed ones staying lit and only ever growing", q.runSamples.filter((sample) => sample.phase === "running").length >= 5 && q.runSamples.some((sample) => sample.live === 1) && q.runSamples.some((sample) => sample.running) && q.runSamples.every((sample) => sample.live <= 1) && q.runSamples.every((sample, index) => index === 0 || sample.visited >= q.runSamples[index - 1].visited));
  const award = (total) => Math.max(120, total * 4);
  expect("Success shows the engine's own numbers: quality total out of 100 with its five parts, hints used, nodes used of required, and the award stored as the level's progress", q.success.state.phase === "success" && q.success.detail.valid && q.success.state.result.stats[0] === `Score: ${q.success.detail.quality.total}/100` && q.success.state.result.stats[1] === "Hints used: 1" && q.success.state.result.stats[2] === "Nodes: 7/7" && q.success.state.result.meters.length === 5 && q.success.detail.completion.award === award(q.success.detail.quality.total) && q.success.state.score === q.success.detail.completion.award && same(stored(q.success.state.progress), { levels: { joyday: { best: q.success.detail.quality.total, award: q.success.detail.completion.award } } }) && q.success.state.legacyScore === null && q.success.state.result.assisted === null);
  expect("Success offers the next mission and a way back to the flow", same(q.success.state.result.actions, [en["aiFlow.game.win.next"], en["aiFlow.game.win.inspect"]]) && q.success.state.result.actionsInView);

  /* ---------- negative control: repeated validation cannot inflate the score ---------- */
  await press(desk, "[data-afp-resume]"); await wait(250);
  q.repeat = { before: { score: q.success.state.score, progress: q.success.state.progress }, rounds: [] };
  for (let round = 0; round < 3; round += 1) {
    await press(desk, "[data-ai-validate]"); await phaseIs(desk, "success"); await wait(120);
    const state = await game(desk); const detail = await lastResult(desk);
    q.repeat.rounds.push({ how: "validate", score: state.score, progress: state.progress, improved: detail.completion.improved, shown: state.result.total });
    await press(desk, "[data-afp-resume]"); await wait(160);
  }
  await runFlow(desk, false); await phaseIs(desk, "success"); await wait(200);
  { const state = await game(desk); const detail = await lastResult(desk); q.repeat.rounds.push({ how: "run", score: state.score, progress: state.progress, improved: detail.completion.improved, shown: state.result.total }); }
  await press(desk, "[data-afp-resume]"); await wait(200);
  /* A worse but still valid flow: three nodes it does not need cost efficiency. */
  await addNode(desk, "llm", false); await addNode(desk, "kb", false); await addNode(desk, "router", false);
  await press(desk, "[data-ai-validate]"); await phaseIs(desk, "success"); await wait(150);
  { const state = await game(desk); const detail = await lastResult(desk); q.repeat.worse = { total: detail.quality.total, score: state.score, progress: state.progress, improved: detail.completion.improved }; }
  await press(desk, "[data-afp-resume]"); await wait(200);
  q.repeat.oldModelWouldBe = q.repeat.before.score + q.repeat.rounds.length * q.success.detail.completion.award + award(q.repeat.worse.total);
  expect("Negative control: validating a finished level three more times, running it again, and validating a weaker version of it leave the score and the stored progress exactly as they were (the old running total would have reached " + q.repeat.oldModelWouldBe + ")", q.repeat.rounds.length === 4 && q.repeat.rounds.every((round) => round.score === q.repeat.before.score && round.progress === q.repeat.before.progress && round.improved === false) && q.repeat.worse.total < q.success.detail.quality.total && q.repeat.worse.score === q.repeat.before.score && q.repeat.worse.progress === q.repeat.before.progress && q.repeat.worse.improved === false && q.repeat.oldModelWouldBe > q.repeat.before.score);

  /* ---------- export and import (kept engine features) ---------- */
  await press(desk, '[data-afp-tab="tools"]');
  await press(desk, "[data-ai-export]");
  q.exported = await desk.evaluate(async () => { const item = window.__exports.at(-1); const flow = JSON.parse(await (await fetch(item.href)).text()); return { name: item.name, nodes: flow.nodes.length, links: flow.connections.length, scenario: flow.scenario, body: JSON.stringify(flow) }; });
  await press(desk, "[data-ai-reset]"); await wait(200);
  q.afterReset = (await game(desk)).nodes.length;
  const importFile = join(OUTPUT, "flow-import.tmp.json");
  await writeFile(importFile, q.exported.body, "utf8");
  await (await desk.$("[data-ai-import-input]")).uploadFile(importFile);
  await desk.waitForFunction(() => document.querySelectorAll(".ai-flow-node").length === 10, { timeout: 8000 }); await wait(250);
  await rm(importFile);
  q.imported = await game(desk);
  delete q.exported.body;
  expect("Export and import still work: the flow downloads as JSON, Reset restores the starter board, and the file imports back node for node", q.exported.name.endsWith(".json") && q.exported.nodes === 10 && q.exported.links === 7 && q.exported.scenario === "joyday" && q.afterReset === 2 && q.imported.nodes.length === 10 && q.imported.links.length === 7 && q.imported.score === q.repeat.before.score);

  /* ---------- progression: levels 02 and 03, by hand ---------- */
  await press(desk, "[data-ai-validate]"); await phaseIs(desk, "success"); await wait(150);
  await press(desk, "[data-afp-next]"); await wait(520);
  q.progression = await game(desk);
  expect("Next mission: level 02's briefing, with level 01 shown solved at its best score and the count at 1 of 3", q.progression.phase === "mission" && q.progression.mission.title === "Enterprise Support Bot" && q.progression.mission.progress === "1 of 3 solved" && q.progression.mission.levels[0].solved && q.progression.mission.levels[0].text.includes(`Best ${q.success.detail.quality.total}/100`) && q.progression.mission.levels[1].current && same(q.progression.mission.constraints.slice(0, 2), ["9 required nodes", "10 required connections"]) && q.progression.mission.expected.length === 3);
  q.levels = [{ id: "joyday", total: q.success.detail.quality.total, award: q.success.detail.completion.award, order: q.success.steps.map((step) => step.type) }];
  for (const index of [1, 2]) {
    const level = LEVELS[index];
    await press(desk, "[data-afp-start]"); await wait(450);
    const opened = await game(desk);
    await buildLevel(desk, level, false);
    await desk.evaluate(() => { window.__steps.length = 0; });
    await runFlow(desk, false); await phaseIs(desk, "success", 30000); await wait(250);
    const state = await game(desk); const detail = await lastResult(desk);
    const steps = await desk.evaluate(() => window.__steps.map((step) => step.type));
    q.levels.push({ id: level.id, starter: opened.nodes.map((item) => item.type), hintsAtStart: opened.hints, total: detail.quality.total, award: detail.completion.award, order: steps, outcomes: detail.outcomes, score: state.score, actions: state.result.actions });
    expect(`Level 0${index + 1} (${level.id}): starts from a clean board with hints at 0, is solved by hand, runs in its own depth-first order, every closing branch reaches End, and adds its award once`, same(opened.nodes.map((item) => item.type), ["trigger", "end"]) && opened.hints === 0 && detail.valid && same(steps, executionOrder(level.edges)) && same(detail.outcomes.map((item) => [item.type, item.reached]), level.outcomes.map((type) => [type, true])) && detail.completion.award === award(detail.quality.total) && state.score === q.levels.reduce((sum, item) => sum + item.award, 0));
    if (index === 1) { await press(desk, "[data-afp-next]"); await wait(450); }
  }
  q.final = await game(desk);
  expect("After the last level: all three are stored, the score is the sum of the three awards, and the result offers Level select instead of a next mission", Object.keys(stored(q.final.progress).levels).length === 3 && q.final.score === q.levels.reduce((sum, item) => sum + item.award, 0) && q.final.result.actions[0] === en["aiFlow.game.levels"] && q.final.result.total.includes(en["aiFlow.game.win.allDone"]));

  /* ---------- idle and active cost ---------- */
  await press(desk, "[data-afp-resume]"); await wait(300);
  await desk.evaluate(() => document.activeElement?.blur()); await wait(1500);
  q.atRest = await motionState(desk);
  q.idle = await idleWork(desk);
  expect("Idle in the workspace: nothing animates and the main thread is quiet", q.atRest.running === 0 && q.atRest.endless === 0 && q.idle.longTasks === 0 && q.idle.scriptMs <= 5);
  {
    const session = await desk.createCDPSession();
    await session.send("Performance.enable");
    const read = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
    await desk.evaluate(() => { window.__long = 0; window.__gaps = []; let last = performance.now(); const tick = (now) => { window.__gaps.push(now - last); last = now; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); new PerformanceObserver((list) => { window.__long += list.getEntries().length; }).observe({ type: "longtask" }); });
    let before = await read();
    const started = Date.now();
    await runFlow(desk, false); await phaseIs(desk, "success", 30000);
    let after = await read();
    q.runCost = { ms: Date.now() - started, scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000), taskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000), layouts: after.LayoutCount - before.LayoutCount, longTasks: await desk.evaluate(() => window.__long), worstFrameMs: Math.round(await desk.evaluate(() => Math.max(...window.__gaps.slice(2)))) };
    await press(desk, "[data-afp-resume]"); await wait(300);
    await desk.evaluate(() => { window.__long = 0; window.__gaps = []; });
    before = await read();
    { const from = await at(desk, body("crm")); await dragBetween(desk, from, { x: from.x + 220, y: from.y + 140 }, false, { steps: 60 }); }
    after = await read();
    q.dragCost = { moves: 60, scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000), layouts: after.LayoutCount - before.LayoutCount, longTasks: await desk.evaluate(() => window.__long), worstFrameMs: Math.round(await desk.evaluate(() => Math.max(...window.__gaps.slice(2)))) };
    await desk.evaluate(() => { window.__sampling = false; });
    await session.detach();
  }
  expect("Active cost: a full Run flow and a 60-step node drag raise no long task", q.runCost.longTasks === 0 && q.dragCost.longTasks === 0);
  await wait(900);
  q.afterRun = await motionState(desk);
  expect("After a run nothing is left animating", q.afterRun.running === 0 && q.afterRun.endless === 0);

  /* ---------- leaving: level select, Back, exit, persistence ---------- */
  await press(desk, "[data-afp-menu]"); await wait(200);
  q.menu = await desk.evaluate(() => ({ items: [...document.querySelectorAll("[data-afp-menu-list] > *")].map((entry) => entry.textContent.trim()), exit: document.querySelector("[data-afp-menu-list] a").getAttribute("href"), expanded: document.querySelector("[data-afp-menu]").getAttribute("aria-expanded") }));
  expect("Menu: Level select, the engine's arrange / reset / validate, and Exit to portfolio as a link to Games", q.menu.items.length === 5 && q.menu.items[0] === en["aiFlow.game.levels"] && q.menu.items[4] === en["aiFlow.game.exit"] && q.menu.exit === "/games/" && q.menu.expanded === "true");
  await desk.keyboard.press("Escape"); await wait(150);
  await press(desk, ".afp-bar [data-afp-leave]"); await wait(700);
  q.left = { ...(await hub(desk)), scroll: await desk.evaluate(() => Math.round(scrollY)), inert: await desk.evaluate(() => [...document.body.children].filter((item) => item.inert && item.id !== "react-command-root").length) };
  expect("Level select: the page is back as it was left — header, launcher, scroll position, focus on the mission card that was opened — with all three missions solved and the score shown", q.left.phase === null && q.left.header && q.left.launcher && q.left.scroll === q.scrollBefore && q.left.focus === "0" && q.left.cards.every((card) => card.solved && /Best \d+\/100/.test(card.state)) && q.left.progress.startsWith("3 of 3 solved") && q.left.progress.endsWith(String(q.final.score)) && q.left.inert === 0);
  await press(desk, '[data-afp-open="2"]'); await wait(450); await press(desk, "[data-afp-start]"); await wait(400);
  await desk.goBack(); await wait(700);
  q.backButton = await desk.evaluate(() => ({ phase: document.documentElement.getAttribute("data-afp-state"), path: location.pathname, header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  expect("Browser Back leaves the game for the level select, not the page", q.backButton.phase === null && q.backButton.path === GAME && q.backButton.header);
  await desk.goForward(); await wait(700);
  q.forward = (await game(desk)).phase;
  await desk.goBack(); await wait(500);
  expect("Browser Forward returns to the game's briefing", q.forward === "mission");
  await visit(desk, GAME); await desk.waitForFunction(() => document.querySelector("[data-afp-levels] .afp-level"), { timeout: 20000 }); await wait(400);
  q.reloaded = await hub(desk);
  expect("After a reload: the three solved missions, their best scores and the total are still there", q.reloaded.cards.every((card) => card.solved) && q.reloaded.progress === q.left.progress && q.reloaded.play === en["aiFlow.game.play"]);
  expect("Desktop: no horizontal overflow", (await overflow(desk)) === 0);
  await desk.done();

  /* ---------- an assisted solve is said to be one ---------- */
  const helped = await fresh({ viewport: DESKTOP, theme: "dark" });
  await play(helped, ["open", "start"]);
  await press(helped, '[data-ai-template="happy"]'); await runFlow(helped, false); await phaseIs(helped, "failure"); await wait(200);
  q.happy = { detail: await lastResult(helped), state: await game(helped) };
  expect("The happy-path template alone fails, and the failure says exactly why: Fallback missing, Response reached End, Fallback did not", same(q.happy.detail.issues.map((issue) => `${issue.kind}:${issue.type || ""}`), ["missingNode:fallback"]) && same(q.happy.state.result.outcomes.map((item) => item.reached), [true, false]));
  await press(helped, "[data-afp-resume]");
  await press(helped, '[data-ai-template="solution"]'); await runFlow(helped, false); await phaseIs(helped, "success"); await wait(200);
  q.assisted = (await game(helped)).result.assisted;
  expect("A flow loaded from the full-solution template is reported as such on its result", q.assisted === en["aiFlow.game.win.assisted"]);
  await helped.done();

  /* ---------- touch: phone ---------- */
  const phone = await fresh({ viewport: MOBILE, theme: "dark", touch: true });
  q.phoneHub = await hub(phone);
  await phone.evaluate(() => document.querySelector('[data-afp-open="0"]').scrollIntoView({ block: "center", behavior: "instant" })); await wait(250);
  { const card = await at(phone, '[data-afp-open="0"]'); await phone.touchscreen.tap(card.x, card.y); await wait(600); }
  q.phoneMission = await game(phone);
  { const start = await at(phone, "[data-afp-start]"); await phone.touchscreen.tap(start.x, start.y); await wait(600); }
  q.phoneEmpty = await game(phone);
  expect("Phone hub and briefing: three mission cards at least 44 px tall, no overflow; in the briefing Start mission is on screen without scrolling", q.phoneHub.cards.length === 3 && q.phoneHub.cards.every((card) => card.height >= 44) && q.phoneHub.overflow === 0 && q.phoneMission.phase === "mission" && q.phoneMission.mission.startInView && q.phoneMission.overflow === 0);
  expect("Phone workspace: the board is the full width and most of the screen; no permanent sidebars — library and panel are closed sheets behind a dock with Run in it; every bar and dock control at least 44 px; nothing overflows", q.phoneEmpty.phase === "building" && q.phoneEmpty.board.width === MOBILE.width && q.phoneEmpty.board.share >= 85 && !q.phoneEmpty.library.shown && q.phoneEmpty.panel === 0 && q.phoneEmpty.dock && q.phoneEmpty.smallTargets.length === 0 && q.phoneEmpty.smallest >= 44 && q.phoneEmpty.overflow === 0 && !q.phoneEmpty.barOverlap && q.phoneEmpty.outOfView === 0 && !q.phoneEmpty.launcher);
  expect("Phone board is tall, not a shrunk desktop: the flow starts at the top and ends at the bottom; a port's touch area is at least 44 px and does not cover the middle of its node", q.phoneEmpty.engine.portrait && parseFloat(q.phoneEmpty.nodes[0].top) < parseFloat(q.phoneEmpty.nodes[1].top) && q.phoneEmpty.nodes[0].left === q.phoneEmpty.nodes[1].left && q.phoneEmpty.portTarget >= 44 && q.phoneEmpty.portOverBody === false);
  await press(phone, '[data-afp-sheet="library"]'); await wait(350);
  q.phoneLibrary = await game(phone);
  await addNode(phone, "intent", true);
  q.phoneAdded = await game(phone);
  expect("Phone library: a bottom sheet with all thirteen nodes by role; choosing one adds it to the board and puts the sheet away", q.phoneLibrary.sheet === "library" && q.phoneLibrary.library.shown && q.phoneLibrary.library.nodes === 13 && q.phoneAdded.sheet === null && q.phoneAdded.nodes.length === 3);
  { const target = await at(phone, body("intent")); await phone.touchscreen.tap(target.x, target.y); await wait(300); }
  q.phoneSelected = await game(phone);
  expect("Phone selection: a tapped node offers connect, inspect and remove in a bar above the dock; the inspector stays a sheet until asked for", q.phoneSelected.selbar && q.phoneSelected.selbar.length === 3 && q.phoneSelected.sheet === null);
  await press(phone, '[data-afp-sel="inspect"]'); await wait(350);
  q.phoneInspector = await game(phone);
  expect("Phone inspector: the selected node's sheet, on the Inspector tab", q.phoneInspector.sheet === "side" && q.phoneInspector.tab === "node" && q.phoneInspector.panel === 1);
  await press(phone, "[data-afp-close]"); await wait(250);
  /* one-finger pan and two-finger pinch, as real touch input */
  const phoneView = async () => { const state = await game(phone); return { transform: state.transform, zoom: Math.round(state.engine.zoom * 1000) / 1000, scrollY: state.scrollY }; };
  q.phoneView = { start: await phoneView() };
  await dragBetween(phone, { x: 60, y: 560 }, { x: 150, y: 470 }, true);
  q.phoneView.panned = await phoneView();
  {
    const session = await phone.createCDPSession();
    const points = (spread) => [{ x: 195 - spread, y: 420, id: 1 }, { x: 195 + spread, y: 420, id: 2 }];
    await phone.evaluate(() => { window.__long = 0; new PerformanceObserver((list) => { window.__long += list.getEntries().length; }).observe({ type: "longtask" }); });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(40) });
    for (let spread = 50; spread <= 130; spread += 10) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(spread) });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(200);
    q.phoneView.pinchedOut = await phoneView();
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(130) });
    for (let spread = 120; spread >= 50; spread -= 10) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(spread) });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await wait(200);
    q.phoneView.pinchedIn = await phoneView();
    q.phoneView.longTasks = await phone.evaluate(() => window.__long);
    await session.detach();
  }
  expect("Touch on the board: one finger pans it, two fingers pinch it larger and smaller, no long task is raised, and the page never moves under the finger", q.phoneView.panned.transform !== q.phoneView.start.transform && q.phoneView.panned.zoom === q.phoneView.start.zoom && q.phoneView.pinchedOut.zoom > q.phoneView.panned.zoom && q.phoneView.pinchedIn.zoom < q.phoneView.pinchedOut.zoom && q.phoneView.longTasks === 0 && [q.phoneView.panned, q.phoneView.pinchedOut, q.phoneView.pinchedIn].every((item) => item.scrollY === 0));
  /* a node dragged by finger */
  await press(phone, '[data-afp-zoom="fit"]'); await wait(250);
  { const before = (await game(phone)).nodes.find((item) => item.type === "intent"); const from = await at(phone, body("intent")); await dragBetween(phone, from, { x: from.x + 70, y: from.y + 50 }, true); const after = (await game(phone)).nodes.find((item) => item.type === "intent"); q.phoneDrag = before.left !== after.left && before.top !== after.top; }
  expect("Touch: a node is dragged by finger", q.phoneDrag);
  /* the rest of level 01, by tap-to-connect, then Run from the dock */
  for (const type of LEVELS[0].add.slice(1)) await addNode(phone, type, true);
  await tidy(phone, true);
  for (const [from, to] of LEVELS[0].edges) await connect(phone, from, to, true);
  q.phoneBuilt = await game(phone);
  expect("Touch: level 01 is wired by tapping a port and then its target", same(q.phoneBuilt.links.map((item) => item.edge).sort(), LEVELS[0].edges.map(([from, to]) => `${from}>${to}`).sort()));
  await press(phone, '[data-afp-zoom="fit"]'); await wait(200);
  { const run = await at(phone, "[data-afp-run]"); await phone.touchscreen.tap(run.x, run.y); await wait(700); }
  q.phoneRunning = await game(phone);
  q.phoneRunLabel = await phone.evaluate(() => document.querySelector("[data-afp-run] span").textContent);
  await phaseIs(phone, "success"); await wait(350);
  q.phoneResult = await game(phone);
  expect("Phone Run flow: started from the dock, which becomes Stop while it runs; the result sheet fits the screen with its actions in reach", q.phoneRunning.phase === "running" && q.phoneRunLabel === en["aiFlow.game.stop"] && q.phoneResult.phase === "success" && q.phoneResult.result.fits && q.phoneResult.overflow === 0 && q.phoneResult.smallTargets.length === 0);
  await phone.done();

  /* ---------- other sizes and themes ---------- */
  q.sizes = {};
  /* [name, viewport, theme, touch input, built by hand]. A phone on its side
   * is checked for layout only: its board is too short to wire by scripted taps. */
  for (const [name, viewport, theme, touch, byHand] of [["tablet", TABLET, "dark", true, true], ["tablet landscape", { width: 1180, height: 820 }, "dark", true, true], ["small laptop", { width: 1100, height: 720 }, "dark", false, true], ["desktop 1280", { width: 1280, height: 800 }, "dark", false, true], ["desktop light", DESKTOP, "light", false, true], ["mobile light", MOBILE, "light", true, true], ["landscape phone", LANDSCAPE, "dark", true, false]]) {
    const page = await fresh({ viewport, theme, touch });
    const before = await hub(page);
    await play(page, ["open"], touch);
    const briefing = await game(page);
    await play(page, ["start"], touch);
    const empty = await game(page);
    if (byHand) await buildLevel(page, LEVELS[0], touch); else { await press(page, '[data-ai-template="solution"]'); await wait(300); }
    await runFlow(page, empty.dock); await phaseIs(page, "success"); await wait(300);
    const result = await game(page);
    q.sizes[name] = { hubOverflow: before.overflow, briefingOverflow: briefing.overflow, board: `${empty.board.width} × ${empty.board.height}`, share: empty.board.share, dock: empty.dock, libraryShown: empty.library.shown, panel: empty.panel, overflow: empty.overflow + result.overflow, barOverlap: empty.barOverlap, outOfView: empty.outOfView, smallTargets: empty.smallTargets, solved: result.phase === "success", resultFits: result.result.fits, builtByHand: byHand };
    expect(`${name}: hub, briefing, workspace and result fit without overflow or overlapping bar controls, and level 01 is ${byHand ? "built by hand and solved" : "run to its result"}`, before.overflow === 0 && briefing.overflow === 0 && q.sizes[name].overflow === 0 && !empty.barOverlap && empty.outOfView === 0 && q.sizes[name].solved && result.result.fits && empty.board.share >= 45);
    await page.done();
  }
  expect("Tablet and small laptop: the library is an icon rail beside the board and the panel a closed drawer, with the dock for Run; every bar and dock control at least 40 px", ["tablet", "tablet landscape", "small laptop"].every((name) => q.sizes[name].libraryShown && q.sizes[name].panel === 0 && q.sizes[name].dock && q.sizes[name].smallTargets.length === 0));
  expect("Desktop from 1280 px: library, board and panel side by side with the engine's actions in the bar", ["desktop 1280", "desktop light"].every((name) => q.sizes[name].libraryShown && q.sizes[name].panel === 1 && !q.sizes[name].dock && q.sizes[name].smallTargets.length === 0));

  /* ---------- reduced motion, no JavaScript, engine failure ---------- */
  const still = await fresh({ viewport: DESKTOP, theme: "dark", reducedMotion: true });
  await play(still, ["open", "start", "build"]);
  await still.evaluate(() => { window.__steps.length = 0; });
  await runFlow(still, false);
  q.reducedMotion = { during: await motionState(still) };
  await phaseIs(still, "success"); await wait(250);
  q.reducedMotion.after = await motionState(still);
  q.reducedMotion.steps = await still.evaluate(() => window.__steps.length);
  q.reducedMotion.phase = (await game(still)).phase;
  expect("Reduced motion: the game enters, builds, runs all seven steps and reaches the result with no animation running", q.reducedMotion.during.running === 0 && q.reducedMotion.after.running === 0 && q.reducedMotion.steps === 7 && q.reducedMotion.phase === "success");
  await still.done();

  const plain = await fresh({ viewport: DESKTOP, theme: "dark", noJs: true, settle: 500 });
  q.noJs = await hub(plain);
  expect("Without JavaScript: the game's name, a plain notice that it needs JavaScript with a link to its case study, the way back to Games — and no Play button, empty mission list or blank board", q.noJs.heading === "AI Flow Puzzle" && q.noJs.notice === `${en["aiFlow.game.noscript"]} ${en["aiFlow.game.caseStudy"]}` && q.noJs.noticeLink === "/ai-flow-puzzle-case-study/" && q.noJs.play === null && q.noJs.cards.length === 0 && !q.noJs.workspaceInPage && q.noJs.back.includes("/games/"));
  await plain.done();

  const broken = await fresh({ viewport: DESKTOP, theme: "dark", fail: true });
  await press(broken, "[data-afp-play]"); await wait(600);
  q.failureState = await broken.evaluate(() => ({ phase: document.documentElement.getAttribute("data-afp-state"), error: document.querySelector("[data-afp-error]").hidden ? null : document.querySelector("[data-afp-error]").textContent.replace(/\s+/g, " ").trim(), focus: document.activeElement?.hasAttribute("data-afp-reload"), header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  await press(broken, "[data-afp-error] [data-afp-leave]"); await wait(500);
  q.failureExit = await broken.evaluate(() => ({ phase: document.documentElement.getAttribute("data-afp-state"), header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  expect("Engine failure (forced): a small recoverable state — what happened, Reload, Level select — instead of an empty workspace; leaving works", q.failureState.phase === "error" && q.failureState.error.startsWith(en["aiFlow.game.error.title"]) && q.failureState.focus && !q.failureState.header && q.failureExit.phase === null && q.failureExit.header);
  await broken.done();

  /* ---------- every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    const catalog = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", locale, "common.json"), "utf8"));
    locales[locale] = {};
    for (const [name, viewport] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
      const touch = viewport === MOBILE;
      const page = await fresh({ viewport, theme: "dark", path: localized(locale, GAME), touch });
      const before = await hub(page);
      await play(page, ["open"], touch);
      const briefing = await game(page);
      await play(page, ["start"], touch);
      const empty = await game(page);
      await buildLevel(page, LEVELS[0], touch, [["fallback", "end"]]);
      await runFlow(page, touch); await phaseIs(page, "failure"); await wait(300);
      const failed = await game(page);
      await press(page, "[data-afp-resume]"); await wait(200);
      if (touch) await reach(page);
      await connect(page, "fallback", "end", touch);
      await runFlow(page, touch); await phaseIs(page, "success"); await wait(300);
      const won = await game(page);
      locales[locale][name] = { lang: await page.evaluate(() => document.documentElement.lang), hubOverflow: before.overflow, missions: before.missions, by: before.by, exitHref: before.back[0], start: briefing.mission.start, constraints: briefing.mission.constraints[0], briefingOverflow: briefing.overflow, startInView: briefing.mission.startInView, overflow: empty.overflow + failed.overflow + won.overflow, barOverlap: empty.barOverlap, outOfView: empty.outOfView, failTitle: failed.result.title, failIssue: failed.result.issues[0], failFits: failed.result.fits, winActions: won.result.actions, winFits: won.result.fits && won.result.actionsInView, title: empty.title };
      const row = locales[locale][name];
      expect(`${locale} ${name}: served in its locale; hub, briefing, workspace, failure and success fit with no overflow or bar overlap; the level is solved`, row.lang.startsWith(locale) && row.hubOverflow === 0 && row.briefingOverflow === 0 && row.overflow === 0 && !row.barOverlap && row.outOfView === 0 && row.failFits && row.winFits && row.startInView);
      expect(`${locale} ${name}: the game's own copy is this locale's catalog — hub, briefing, failure and success`, row.missions === catalog["aiFlow.game.missions"] && row.by === catalog["aiFlow.game.by"] && row.start === catalog["aiFlow.game.mission.start"] && row.constraints === catalog["aiFlow.game.mission.nodes"].replace("{n}", "7") && row.failTitle === catalog["aiFlow.game.fail.title"] && same(row.winActions, [catalog["aiFlow.game.win.next"], catalog["aiFlow.game.win.inspect"]]));
      await page.done();
    }
  }
  for (const key of ["start", "constraints", "failTitle", "failIssue"]) expect(`Locales: “${key}” is translated in each of the five`, new Set(LOCALES.map((locale) => locales[locale].desktop[key])).size === LOCALES.length);

  /* ---------- measurements + pack ---------- */
  const lcp = await lcpCompare(browser, GAME);
  console.log("[v4:capture] LCP measured");
  const builds = { ...(BASELINE ? { before: BASELINE } : {}), after: ORIGIN };
  const transfers = {};
  for (const build of Object.keys(builds)) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await stubEdge(page, "down", builds[build]);
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    await page.goto(`${builds[build]}${GAME}`, { waitUntil: "networkidle2" });
    await wait(1500);
    transfers[build] = await page.evaluate((site) => { const entries = performance.getEntriesByType("resource").filter((item) => item.name.startsWith(site)); return { requests: entries.length, bytes: entries.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0) + (performance.getEntriesByType("navigation")[0]?.encodedBodySize || 0), images: entries.filter((item) => /\.(webp|png|jpe?g|svg|ico)(\?|$)/.test(item.name)).length }; }, builds[build]);
    await context.close();
  }
  const reactEntry = async (root) => (await readFile(join(root, "dist-site", "ai-flow-puzzle", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizeOf = async (root, file) => {
    try { const bytes = await readFile(join(root, "dist-site", file)); return { raw: bytes.length, gzip: gzipSync(bytes).length }; } catch { return null; }
  };
  const sizes = [];
  for (const file of ["ai-flow-puzzle/index.html", "ai-flow-puzzle.js", "js/pages/flow-puzzle-game.js", "css/v4-flow-puzzle.css", "css/games/ai-flow-puzzle.css", "react"]) {
    const after = await sizeOf(ROOT, file === "react" ? await reactEntry(ROOT) : file);
    const before = BASELINE_ROOT ? await sizeOf(BASELINE_ROOT, file === "react" ? await reactEntry(BASELINE_ROOT) : file) : undefined;
    sizes.push({ file: file === "react" ? "assets-react/production-main-*.js" : file, before, after });
  }
  expect("The page's accepted stylesheet ships byte for byte as before", !BASELINE_ROOT || sizes.filter((size) => size.file === "css/games/ai-flow-puzzle.css").every((size) => size.before && size.before.raw === size.after.raw));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : shot.viewport === TABLET ? 620 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", frames, 4100);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, baselineOrigin: BASELINE, aiEdge: "stubbed: “down” (503)", game: q, locales, lcpEntry: lcp, transfers, sizes, motionFrames: frames.map((item) => item.label), consoleProblems: problems, failures };
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

AJOOP's public AI edge (\`${EDGE}\`) was stubbed (503) for every capture and check. Every flow in these captures was built with real pointer or touch input: nodes added from the library, wires dragged port to node (tapped port then node on touch). Only the engine's own events were recorded and downloads kept in the test browser; the engine-failure state was forced by refusing the engine's script.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((item, index) => `${index + 1}. ${item.label}`).join("\n")}

## The board, measured

| | Board | Share of viewport |
| --- | --- | --- |
| Desktop 1440 × 900 | ${q.empty.board.width} × ${q.empty.board.height} | ${q.empty.board.share} % |
| Phone 390 × 844 | ${q.phoneEmpty.board.width} × ${q.phoneEmpty.board.height} | ${q.phoneEmpty.board.share} % |
${Object.entries(q.sizes).map(([name, row]) => `| ${name} | ${row.board} | ${row.share} % |`).join("\n")}

Before (E06.0 audit): 49 % on desktop 1.5 screens down an article page; a 322 × 578 board 4.4 screens down on a phone.

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages and the forced-failure page excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Hub: ${q.hub.cards.map((card) => `${card.title} (${card.difficulty}, ${card.size})`).join(" · ")}; workspace in the page: ${q.hub.workspaceInPage}.
- Entered by keyboard into “${q.mission.phase}”, focus on ${q.mission.focus}; header ${q.mission.header}, footer ${q.mission.footer}, AJOOP launcher ${q.mission.launcher}, other floats ${q.mission.floats}.
- Briefing: “${q.mission.mission.input}” → ${q.mission.mission.expected.join(" · ")}; ${q.mission.mission.constraints.join(" · ")}.
- Board interaction (mouse): library click and library drag add nodes; node drag ${q.moved ? "moves" : "FAILS"}; port drag connects (${q.linked.links.map((item) => item.edge).join()}); duplicate and into-trigger refused (“${q.intoTrigger.status.text}”); reconnect → ${q.rewired.links.map((item) => item.edge).join(", ")}; drop on empty board removes; wire selected and deleted by key; node deleted by key.
- Keyboard: arrows move ${q.keyboard.moved}; port armed by Enter ${q.keyboard.armed}; connected by Enter → ${q.keyboard.links.join(", ")}.
- Pan / zoom / fit: zoom ${q.view.start.zoom} → wheel ${q.view.wheeled.zoom} → out ${q.view.out.zoom} → in ${q.view.in.zoom} → fit ${q.view.fit.zoom}; all nodes in view after Fit: ${q.view.nodesInView}.
- Run flow on an unfinished board: steps ${q.failure.steps.join(" → ")}; issues ${q.failure.detail.issues.map((issue) => issue.kind).join(", ")}; shown as: ${q.failure.state.result.issues.map((line) => `“${line}”`).join(" ")}.
- Hint: “${q.hint.note}”; library entry flagged: ${q.hint.hinted.join()}; hints used ${q.hint.hints}.
- Execution order per level (recorded from the run, equal to the order worked out from the connections):
${q.levels.map((item) => `  - ${item.id}: ${item.order.join(" → ")} — quality ${item.total}/100, award ${item.award}`).join("\n")}
- Score: ${q.levels.map((item) => item.award).join(" + ")} = ${q.final.score}; stored as \`${PROGRESS_KEY}\` = \`${q.final.progress}\`; the old \`-score-v2\` key is ${q.final.legacyScore === null ? "not written" : "WRITTEN"}.
- **Repeated-validation negative control:** score ${q.repeat.before.score} before; after ${q.repeat.rounds.map((round) => round.how).join(", ")}: ${q.repeat.rounds.map((round) => round.score).join(", ")}; after validating a weaker valid flow (quality ${q.repeat.worse.total}): ${q.repeat.worse.score}. Stored progress unchanged throughout: ${q.repeat.rounds.every((round) => round.progress === q.repeat.before.progress) && q.repeat.worse.progress === q.repeat.before.progress}. The pre-E06.2 running total would have reached ${q.repeat.oldModelWouldBe}.
- Templates: happy path alone → ${q.happy.detail.issues.map((issue) => `${issue.kind} ${issue.type || ""}`).join()}; full solution → “${q.assisted}”.
- Export / import: ${q.exported.name}, ${q.exported.nodes} nodes, ${q.exported.links} connections; reset to ${q.afterReset} nodes; imported back ${q.imported.nodes.length} nodes, ${q.imported.links.length} connections.
- Touch (390 × 844): pan ${q.phoneView.panned.transform !== q.phoneView.start.transform}; pinch ${q.phoneView.panned.zoom} → ${q.phoneView.pinchedOut.zoom} → ${q.phoneView.pinchedIn.zoom}, long tasks ${q.phoneView.longTasks}; node dragged ${q.phoneDrag}; tap-to-connect built ${q.phoneBuilt.links.length} connections; smallest bar/dock control ${q.phoneEmpty.smallest} px; port touch area ${q.phoneEmpty.portTarget} px; page scroll ${q.phoneView.pinchedIn.scrollY}.
- Leaving: Level select restores scroll ${q.left.scroll} (was ${q.scrollBefore}) and focus on the mission card (${q.left.focus === "0"}); browser Back leaves the game (${q.backButton.phase === null}), Forward returns to “${q.forward}”; after a reload: ${q.reloaded.progress}.
- Without JavaScript: “${q.noJs.notice}” → ${q.noJs.noticeLink}; Play shown: ${q.noJs.play !== null}.
- Forced engine failure: “${q.failureState.error}”.
- Reduced motion: ${q.reducedMotion.during.running} animations during the run, ${q.reducedMotion.after.running} after; ${q.reducedMotion.steps} steps; ended in “${q.reducedMotion.phase}”.
- Idle in the workspace: ${q.atRest.running} animations running, ${q.atRest.endless} endless; over ${q.idle.windowMs} ms: ${q.idle.taskMs} ms of main-thread tasks, ${q.idle.scriptMs} ms script, ${q.idle.layouts} layouts, ${q.idle.longTasks} long tasks.
- Run flow, active (level 03, ${q.runCost.ms} ms): ${q.runCost.scriptMs} ms script, ${q.runCost.taskMs} ms tasks, ${q.runCost.layouts} layouts, ${q.runCost.longTasks} long tasks, worst frame ${q.runCost.worstFrameMs} ms.
- Node drag, ${q.dragCost.moves} pointer moves: ${q.dragCost.scriptMs} ms script, ${q.dragCost.layouts} layouts, ${q.dragCost.longTasks} long tasks, worst frame ${q.dragCost.worstFrameMs} ms.
- Locales (EN/TR/DE/ES/FR, desktop and phone): overflow ${LOCALES.map((locale) => `${locales[locale].desktop.overflow}/${locales[locale].mobile.overflow}`).join(" · ")}; Start mission: ${LOCALES.map((locale) => locales[locale].desktop.start).join(" · ")}; failure title: ${LOCALES.map((locale) => locales[locale].desktop.failTitle).join(" · ")}.

## Entry page LCP (headless Chromium, ${BASELINE ? "E06.1 and E06.2 measured in turn, " : ""}5 cold loads each, median)

| Viewport | Conditions | ${BASELINE ? "E06.1 (before) | " : ""}E06.2 (after) |
| --- | --- | ${BASELINE ? "--- | " : ""}--- |
${lcp.map((row) => `| ${row.viewport} | ${row.conditions} | ${BASELINE ? `${lcpCell(row.before)} | ` : ""}${lcpCell(row.after)} |`).join("\n")}

Cold-load transfer of the page at 1440 × 900 (same-origin, encoded, document included): ${Object.entries(transfers).map(([build, row]) => `${build === "before" ? "E06.1" : "E06.2"} ${kb(row.bytes)} in ${row.requests} requests`).join(" · ")}.

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
