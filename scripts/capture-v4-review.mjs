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
const PHASE = "v4-e05-final-home";
const PACK = "V4-E05-review-pack.zip";
const TITLE = "V4-E05 · Final Home Evolution";
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
/* The flagship row is taller than one screen; one still shows it whole. */
const DESKTOP_TALL = { width: 1440, height: 1400 };
const TABLET = { width: 820, height: 1180 };
const MOBILE = { width: 390, height: 844 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const HOME = "/";
const HUB = "/ajoop/";
const CASE = "/ajoop-case-study/";
const node = (id) => `[data-v4-eco-node="${id}"]`;
const GRID = ".selected-work-grid";
const LANES = ".v4-lanes";
const CLOSING = ".contact-hub";
const SINAMA = "sinama-case-study";
const JOYDAY = "atolye-joyday-case-study";

/* In contact-sheet order. `steps` run in order: ["click", selector],
 * ["hover", selector], ["focus", selector], ["top", selector] (scroll it just
 * under the header), ["into", selector] (centre it), ["end"] (the page's
 * end), ["goto", path]. */
const shots = [
  { name: "01-dark-desktop-hero.png", label: "Dark · 1440 × 900 · hero: identity and the system premise", viewport: DESKTOP, theme: "dark" },
  { name: "02-dark-desktop-flagship-trio.png", label: "Dark · flagship trio (tall capture, 1440 × 1400): SINAMA leads with its pipeline; AJOOP and Atölye Joyday beside it; the supporting strip beneath", viewport: DESKTOP_TALL, theme: "dark", steps: [["top", GRID]] },
  { name: "03-dark-desktop-ecosystem.png", label: "Dark · 1440 × 900 · ecosystem: the catalog read by capability, SINAMA in hand", viewport: DESKTOP, theme: "dark", steps: [["top", ".v4-eco-section"], ["hover", `.v4-lane__project${node(SINAMA)}`]] },
  { name: "04-dark-desktop-closing.png", label: "Dark · 1440 × 900 · the page's end: the closing hand-off into the footer", viewport: DESKTOP, theme: "dark", steps: [["end"]] },
  { name: "05-light-desktop-hero.png", label: "Light · 1440 × 900 · hero", viewport: DESKTOP, theme: "light" },
  { name: "06-light-desktop-flagship.png", label: "Light · flagship area (tall capture, 1440 × 1400): SINAMA and AJOOP keep their dark product surfaces", viewport: DESKTOP_TALL, theme: "light", steps: [["top", GRID]] },
  { name: "07-mobile-hero.png", label: "Mobile · 390 × 844 · hero", viewport: MOBILE, theme: "dark", touch: true },
  { name: "08-mobile-flagships.png", label: "Mobile · flagships: the lead system first", viewport: MOBILE, theme: "dark", touch: true, steps: [["top", GRID]] },
  { name: "09-mobile-ecosystem.png", label: "Mobile · ecosystem as lanes; supporting work on the same lanes", viewport: MOBILE, theme: "dark", touch: true, steps: [["top", LANES]] },
  { name: "10-mobile-closing-footer.png", label: "Mobile · closing hand-off and footer", viewport: MOBILE, theme: "dark", touch: true, steps: [["top", CLOSING]] },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, touch = false, edge = "down", path = "/", settle = 2200 }, problems) {
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

/* Home, as the page reports it. */
const home = (page) => page.evaluate(() => {
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  const box = (entry) => { const rect = entry.getBoundingClientRect(); return { left: Math.round(rect.left), top: Math.round(rect.top + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  const signature = (card) => ({
    caption: text(card?.querySelector(".v4-sig__caption")),
    steps: [...(card?.querySelectorAll(".v4-sig__steps > li > span") || [])].map(text),
    proof: [...(card?.querySelectorAll(".v4-sig__proof > div") || [])].map((entry) => ({ value: [...entry.querySelectorAll("dd b")].map(text).join(" / ") || text(entry.querySelector("dd")), label: text(entry.querySelector("dt")) })),
  });
  const kind = (entry) => (entry.matches(".hero") ? "hero" : entry.querySelector(".selected-work-grid") ? "flagship" : entry.matches(".v4-eco-section") ? "ecosystem" : entry.querySelector(".service-grid") ? "model" : entry.querySelector(".timeline-preview") ? "experience" : entry.matches(".v4-onward") ? "bridge" : entry.querySelector("[data-build-log]") ? "latest" : entry.matches(".contact-hub") ? "closing" : entry.querySelector(".compact-evidence-grid") ? "supporting-list" : "other");
  const cards = [...document.querySelectorAll(".selected-work-grid > *")];
  const lanes = document.querySelector(".v4-lanes");
  return {
    sections: [...document.querySelectorAll("main > *")].map(kind),
    heights: Object.fromEntries([...document.querySelectorAll("main > *")].map((entry) => [kind(entry), box(entry).height])),
    heading: text(document.querySelector("h1")),
    cards: cards.map((card) => ({
      title: text(card.querySelector("h3")),
      role: card.hasAttribute("data-v4-flagship") ? `flagship:${card.getAttribute("data-v4-flagship")}` : card.hasAttribute("data-v4-support") ? "support" : "other",
      links: [...card.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")),
      ports: [...card.querySelectorAll(".v4-ports [data-v4-cap]")].map((port) => port.getAttribute("data-v4-cap")),
      related: card.hasAttribute("data-v4-related"),
      opacity: Number(getComputedStyle(card).opacity),
      box: box(card),
    })),
    sinama: signature(cards[0]),
    joyday: signature(cards[2]),
    supportLabel: text(document.querySelector(".v4-support-label")),
    port: {
      state: text(document.querySelector(".v4-port__state")),
      lead: text(document.querySelector(".v4-port .evidence-card-content > p")),
      quicks: document.querySelectorAll(".v4-port__quicks button").length,
      composer: document.querySelectorAll(".v4-port__composer").length,
      links: [...document.querySelectorAll(".v4-port__links a")].map((link) => link.getAttribute("href")),
      panelOpen: document.querySelector("[data-chatbot-toggle]")?.getAttribute("aria-expanded") || null,
    },
    lanes: [...document.querySelectorAll(".v4-lane")].map((lane) => ({
      id: lane.querySelector(".v4-lane__capability")?.getAttribute("data-v4-eco-node"),
      label: text(lane.querySelector(".v4-lane__capability span")),
      lit: lane.getAttribute("data-v4-state") === "active",
      pressed: lane.querySelector(".v4-lane__capability")?.getAttribute("aria-pressed"),
      projects: [...lane.querySelectorAll(".v4-lane__project")].map((project) => ({ id: project.getAttribute("data-v4-eco-node"), tier: project.getAttribute("data-v4-eco-tier"), href: project.getAttribute("href"), state: project.getAttribute("data-v4-state"), title: text(project.querySelector(".v4-eco__title")) })),
    })),
    lanesActive: Boolean(lanes?.hasAttribute("data-v4-eco-active")),
    lanesWaiting: Boolean(lanes?.hasAttribute("data-v4-await")),
    readout: [...document.querySelectorAll("[data-v4-eco-readout] span")].map(text),
    ecoLinks: [...document.querySelectorAll("[data-v4-eco-readout] a, .v4-eco__ajoop a")].map((link) => link.getAttribute("href")),
    ecoAjoop: text(document.querySelector(".v4-eco__ajoop")),
    model: [...document.querySelectorAll(".service-grid[data-v4-model] .service-card h3")].map(text),
    roles: [...document.querySelectorAll(".timeline-card h3")].map(text),
    bridge: [...document.querySelectorAll(".split-section .btn, .v4-onward a")].map((link) => link.getAttribute("href")),
    buildLog: document.querySelectorAll(".build-log-item").length,
    closing: [...document.querySelectorAll(".contact-actions a")].map((link) => link.getAttribute("href")),
    internal: [...new Set([...document.querySelectorAll("main a[href]")].map((link) => link.getAttribute("href")).filter((href) => href.startsWith("/")))],
    external: [...document.querySelectorAll('main a[href^="http"]')].map((link) => ({ href: link.getAttribute("href"), rel: link.getAttribute("rel") || "", target: link.getAttribute("target") || "" })),
    images: [...document.querySelectorAll("main img")].map((image) => ({ file: (image.currentSrc || image.getAttribute("src") || "").split("/").pop(), loading: image.getAttribute("loading"), priority: image.getAttribute("fetchpriority"), width: image.getAttribute("width"), height: image.getAttribute("height"), loaded: image.complete && image.naturalWidth > 0 })),
    canvases: document.querySelectorAll("canvas").length,
    launcher: (() => { const entry = document.querySelector(".chatbot-launcher"); return entry && entry.getClientRects().length ? box(entry) : null; })(),
  };
});

/* What the two flagship case studies document, read from the same accepted
 * structure the build reads — independently, so the page can be held to it. */
async function canonicalSignatures(locale) {
  const structure = JSON.parse(await readFile(join(ROOT, "data", "site", "m3-29-case-studies-structure.json"), "utf8"));
  const text = (entry) => (entry.type === "text" ? entry.value : entry.type === "element" ? entry.children.map(text).join("") : "");
  const clean = (entry) => text(entry).replace(/\s+/g, " ").trim();
  const classOf = (entry) => String(entry.attributes?.find((attribute) => attribute.name === "class")?.value || "").split(/\s+/);
  const all = (entry, test, hits = []) => { if (entry.type !== "element") return hits; if (test(entry)) hits.push(entry); entry.children.forEach((child) => all(child, test, hits)); return hits; };
  const read = (pageId) => {
    const children = structure.pages[pageId].locales[locale].children;
    const section = children.find((entry) => all(entry, (item) => classOf(item).includes("case-journey")).length);
    const parts = (entry) => entry.children.filter((child) => child.type === "element").map(clean);
    return {
      caption: clean(all(section, (item) => item.tag === "h2")[0]),
      steps: all(section, (item) => classOf(item).includes("case-journey"))[0].children.filter((child) => child.type === "element").map((step) => parts(step)[1]),
      proof: children.flatMap((entry) => all(entry, (item) => classOf(item).includes("case-proof"))).map((entry) => { const [value, label] = parts(entry); return { value, label }; }),
    };
  };
  return { sinama: read("sinamaCaseStudy"), joyday: read("joydayCaseStudy") };
}

/* The Works catalog, as the Works page itself renders it. */
const catalog = (page) => page.evaluate(() => ({
  capabilities: [...document.querySelectorAll("[data-filter-btn]")].map((entry) => entry.getAttribute("data-filter-btn")).filter((id) => id !== "all"),
  projects: [...document.querySelectorAll(".project-card[data-category]")].map((card) => ({ id: String(card.getAttribute("data-project-link") || card.getAttribute("data-game-link")).split("/").filter(Boolean).pop(), categories: card.getAttribute("data-category").split(/\s+/).filter(Boolean) })),
}));

/* What a cold load of a page transfers before anyone scrolls, and by its end. */
async function transfer(browser, origin, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await stubEdge(page, "down", origin);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.setCacheEnabled(false);
  await page.goto(`${origin}${HOME}`, { waitUntil: "networkidle2" });
  await wait(1500);
  const read = () => page.evaluate((site) => {
    const entries = performance.getEntriesByType("resource").filter((entry) => entry.name.startsWith(site));
    const kind = (name) => (/\.(webp|png|jpe?g|avif|ico|svg)(\?|$)/.test(name) ? "images" : /\.css(\?|$)/.test(name) ? "css" : /\.m?js(\?|$)/.test(name) ? "js" : /\.woff2?(\?|$)/.test(name) ? "fonts" : "other");
    const totals = {};
    for (const entry of entries) totals[kind(entry.name)] = (totals[kind(entry.name)] || 0) + (entry.encodedBodySize || 0);
    const images = entries.filter((entry) => kind(entry.name) === "images").map((entry) => entry.name.split("/").pop());
    return { requests: entries.length, bytes: Object.values(totals).reduce((sum, value) => sum + value, 0), byKind: totals, images, repeated: images.filter((name, index) => images.indexOf(name) !== index) };
  }, origin);
  const firstScreen = await read();
  await page.evaluate(async () => { for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight * 0.8) { scrollTo(0, top); await new Promise((done) => setTimeout(done, 220)); } });
  await wait(1500);
  const wholePage = await read();
  await context.close();
  return { firstScreen, wholePage };
}

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

let server = null;
let browser = null;

try {
  await mkdir(FRAMES, { recursive: true });
  /* Captures from an earlier run are stale. */
  for (const directory of [OUTPUT, FRAMES]) for (const entry of await readdir(directory)) if (/\.(png|zip)$/.test(entry)) await rm(join(directory, entry));
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
    const page = await open(context, options, options.noJs ? [] : problems);
    page.done = () => context.close();
    return page;
  };

  /* ---------- screenshots ---------- */
  for (const shot of shots) {
    const page = await fresh(shot);
    await run(page, shot.steps);
    expect(`${shot.name}: no horizontal overflow`, (await overflow(page)) === 0);
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png" });
    console.log(`[v4:capture] ${shot.name}`);
    await page.done();
  }

  /* ---------- motion frames: one continuous session, one tab ---------- */
  const frames = [];
  const film = await fresh({ viewport: DESKTOP, theme: "dark", settle: 300 });
  const frame = async (label) => {
    const file = join(FRAMES, `${String(frames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}.png`);
    await film.screenshot({ path: file, type: "png" });
    frames.push({ file, label, width: 960 });
  };
  const glide = async (selector, at = 0.5) => {
    const point = await film.evaluate((target, share) => {
      const rect = document.querySelector(target).getBoundingClientRect();
      return { x: rect.left + rect.width * share, y: rect.top + rect.height / 2 };
    }, selector, at);
    await film.mouse.move(point.x, point.y, { steps: 14 });
  };
  const jump = (selector, offset = -110) => film.evaluate((target, by) => { document.querySelector(target).scrollIntoView({ block: "start", behavior: "instant" }); window.scrollBy({ top: by, behavior: "instant" }); }, selector, offset);
  await frame("Hero, as it opens: the signal on its way round the delivery flow");
  await glide('[data-v4-flow-stage="evaluate"]'); await wait(700);
  await frame("Hero response: the pointer nearest Evaluate lights that stage and its line to the hub");
  await film.mouse.move(3, 300); await jump(GRID); await wait(2400); await glide('[data-v4-flagship="pipeline"] .evidence-card-content'); await wait(900);
  await frame("Flagship emphasis: SINAMA in hand, the current running its pipeline again");
  await film.mouse.move(3, 300); await jump(".v4-eco-section"); await wait(1500); await glide(`.v4-lane__project${node(SINAMA)}`); await wait(800);
  await frame("Ecosystem relationship: SINAMA lights both capabilities it is filed under");
  await film.mouse.move(3, 300); await jump('[data-v4-flagship="ajoop"]', -140); await wait(900);
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle2" }), film.click(".v4-port__links a")]);
  await film.evaluate(() => document.fonts.ready); await wait(1500);
  const arrived = new URL(film.url()).pathname;
  await frame("Hand-off: Home's AJOOP port opens the Hub");
  await film.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await visit(film, HOME); await wait(1200);
  await frame("Reduced motion: the hero as a designed still, the route drawn and its rest stage lit");
  expect("Motion session: the port's first link arrives at the Hub", arrived === HUB);
  await film.done();

  /* ---------- structure and hierarchy ---------- */
  const q = {};
  const canon = await canonicalSignatures("en");
  const desk = await fresh({ viewport: DESKTOP, theme: "dark" });
  q.initial = await home(desk);
  const [lead, port, third, support] = q.initial.cards;
  expect("Structure: one story in order — hero, flagship proof, ecosystem, operating model, experience, bridge, latest build, closing", same(q.initial.sections, ["hero", "flagship", "ecosystem", "model", "experience", "bridge", "latest", "closing"]));
  expect("Flagship hierarchy: SINAMA, AJOOP, Atölye Joyday in reading order, then the supporting evidence — four surfaces, three flagships", q.initial.cards.length === 4 && same(q.initial.cards.map((card) => card.role), ["flagship:pipeline", "flagship:ajoop", "flagship:route", "support"]) && lead.title.startsWith("SINAMA") && port.title.toUpperCase() === "AJOOP" && third.title === "Atölye Joyday" && support.title === "AI Chatbot Flow Design");
  expect("Flagship hierarchy, drawn: the lead spans the row; AJOOP and Joyday share the next; the supporting strip sits beneath both", lead.box.width > port.box.width * 1.9 && lead.box.top < port.box.top && port.box.top === third.box.top && port.box.left < third.box.left && support.box.top > third.box.top && support.box.height < third.box.height);
  expect("Supporting evidence is labelled as such, in the catalog's own words", Boolean(q.initial.supportLabel) && support.links[0] === "/projects/ai-chatbot-flow-design/");
  expect("SINAMA: the pipeline and proof shown are its case study's, word for word and figure for figure", same(q.initial.sinama, canon.sinama) && canon.sinama.steps.length === 6);
  expect("Atölye Joyday: the route and proof shown are its case study's, word for word and figure for figure", same(q.initial.joyday, canon.joyday) && canon.joyday.steps.length === 6);
  expect("Flagship links: each case study, and SINAMA's and Joyday's live sites", lead.links[0] === "/sinama-case-study/" && third.links[0] === "/atolye-joyday-case-study/" && lead.links.length === 2 && third.links.length === 2);
  expect("AJOOP on Home: its own resting state, summary, four quick questions and one composer — and exactly two links, to the Hub and the case study", Boolean(q.initial.port.state) && Boolean(q.initial.port.lead) && q.initial.port.quicks === 4 && q.initial.port.composer === 1 && same(q.initial.port.links, [HUB, CASE]));
  expect("Collapsed sections: four operating stages, three roles, the build log's latest three, and no separate supporting list", q.initial.model.length === 4 && q.initial.roles.length === 3 && q.initial.buildLog === 3 && !q.initial.sections.includes("supporting-list"));
  expect("Bridge: Experience from the summary, then Certificates and About", same(q.initial.bridge, ["/blog/", "/certificates/", "/about/"]));
  expect("Closing: the capability view first, then Works, the AJOOP Hub, Request and contact", q.initial.closing[0].startsWith("/?role=") && same(q.initial.closing.slice(1, 4), ["/works/", HUB, "/request/"]) && q.initial.closing.some((href) => href.startsWith("mailto:")));
  expect("Media: the portrait is the one prioritised image; everything below the hero is lazy; every image declares its size", q.initial.images.filter((image) => image.priority === "high").length === 1 && q.initial.images.filter((image) => image.loading !== "lazy").length === 1 && q.initial.images.every((image) => image.width && image.height));
  expect("No canvas on Home", q.initial.canvases === 0);

  /* ---------- ecosystem: the catalog, and nothing else ---------- */
  const works = await fresh({ viewport: DESKTOP, theme: "dark", path: "/works/", settle: 600 });
  q.catalog = await catalog(works);
  await works.done();
  const filed = (capability) => q.catalog.projects.filter((project) => project.categories.includes(capability)).map((project) => project.id);
  const laneOf = Object.fromEntries(q.initial.lanes.map((lane) => [lane.id, lane.projects.map((project) => project.id)]));
  const drawn = q.initial.lanes.flatMap((lane) => lane.projects);
  expect("Ecosystem: one lane per Works capability, each carrying exactly the projects the Works catalog files under it, in catalog order", q.catalog.capabilities.length > 0 && same(Object.keys(laneOf).sort(), [...q.catalog.capabilities].sort()) && q.catalog.capabilities.every((capability) => same(laneOf[capability], filed(capability))));
  expect("Ecosystem: every catalog project is on a lane, and nothing that is not in the catalog", same([...new Set(drawn.map((project) => project.id))].sort(), q.catalog.projects.map((project) => project.id).sort()));
  expect("Ecosystem: only SINAMA and Atölye Joyday are set as flagships; flagship lanes come first", drawn.every((project) => (project.tier === "flagship") === [SINAMA, JOYDAY].includes(project.id)) && q.initial.lanes.findIndex((lane) => !lane.projects.some((project) => project.tier === "flagship")) === q.initial.lanes.filter((lane) => lane.projects.some((project) => project.tier === "flagship")).length);
  expect("Ecosystem: AJOOP is on no lane — it closes the section as the assistant that answers over it, with one link to its Hub", !drawn.some((project) => /ajoop/i.test(project.href)) && same(q.initial.ecoLinks, ["/works/", HUB]) && q.initial.ecoAjoop.toUpperCase().startsWith("AJOOP"));

  /* ---------- every link Home exposes ---------- */
  q.links = [];
  for (const href of q.initial.internal) q.links.push({ href, status: (await fetch(`${ORIGIN}${href.split("#")[0]}`)).status });
  expect("Links: every internal destination Home links to is served", q.links.length > 10 && q.links.every((link) => link.status === 200));
  expect("Links: every external one opens apart from the site, without an opener", q.initial.external.length > 0 && q.initial.external.every((link) => link.target === "_blank" && /noopener/.test(link.rel)));

  /* ---------- interaction ---------- */
  await scrollTo(desk, LANES, "into");
  await desk.hover(`.v4-lane__project${node(SINAMA)}`); await wait(700);
  q.hover = await home(desk);
  const sinamaLanes = q.catalog.projects.find((project) => project.id === SINAMA).categories;
  expect("Relationship highlight: SINAMA in hand lights the lanes it is filed under, everywhere it sits, and its flagship card answers", q.hover.lanesActive && same(q.hover.lanes.filter((lane) => lane.lit).map((lane) => lane.id).sort(), [...sinamaLanes].sort()) && q.hover.lanes.flatMap((lane) => lane.projects).filter((project) => project.id === SINAMA).every((project) => project.state === "active") && q.hover.cards[0].related && !q.hover.cards[2].related);
  expect("Relationship highlight: the readout says it in words, naming each capability once", q.hover.readout[0].startsWith("SINAMA") && same(q.hover.readout[1].split(" · ").sort(), q.hover.lanes.filter((lane) => sinamaLanes.includes(lane.id)).map((lane) => lane.label).sort()));
  await desk.mouse.move(3, 300); await wait(500);
  q.released = await home(desk);
  expect("Relationship highlight: releasing it returns the map to rest", !q.released.lanesActive && same(q.released.readout, q.initial.readout));
  /* Keyboard: reach a capability, pin it, walk onto its first project. */
  await desk.focus(`.v4-lane__capability${node("ai")}`); await desk.keyboard.press("Enter"); await wait(400);
  q.pinned = await home(desk);
  await desk.keyboard.press("Tab"); await wait(400);
  q.focus = await desk.evaluate(() => { const style = getComputedStyle(document.activeElement); return { node: document.activeElement.getAttribute("data-v4-eco-node"), outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2 }; });
  await desk.keyboard.press("Escape"); await wait(300);
  q.unpinned = await home(desk);
  expect("Keyboard: a capability can be pinned and released, and Tab moves onto its first project with a visible focus ring", q.pinned.lanes.find((lane) => lane.id === "ai").pressed === "true" && q.focus.node === laneOf.ai[0] && q.focus.outline && q.unpinned.lanes.every((lane) => lane.pressed === "false"));
  q.tabOrder = await desk.evaluate(() => {
    const cards = [...document.querySelectorAll(".selected-work-grid > *")];
    return [...document.querySelectorAll(".selected-work-grid a[href], .selected-work-grid button")].map((entry) => cards.findIndex((card) => card.contains(entry)));
  });
  expect("Keyboard: focus moves through the flagship row in the order it is drawn", q.tabOrder.length >= 12 && q.tabOrder.every((card, index) => index === 0 || card >= q.tabOrder[index - 1]));
  await desk.focus(".contact-actions a:last-child");
  q.leaves = false;
  for (let press = 0; press < 12 && !q.leaves; press += 1) { await desk.keyboard.press("Tab"); q.leaves = await desk.evaluate(() => Boolean(document.activeElement?.closest("footer"))); }
  expect("Keyboard: focus leaves the closing panel for the footer — no trap", q.leaves);
  /* The port opens the launcher's own conversation, not a second one. */
  await scrollTo(desk, ".v4-port", "into");
  await desk.click(".v4-port__composer"); await wait(900);
  q.portOpens = (await home(desk)).port.panelOpen;
  expect("AJOOP port: its composer opens the global launcher's panel", q.portOpens === "true");
  await desk.keyboard.press("Escape"); await wait(400);
  await desk.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
  /* The hero's signal is bounded: once it has run, nothing is left running. */
  await wait(27000);
  q.atRest = await motionState(desk);
  q.idle = await idleWork(desk);
  q.shift = await layoutShift(desk);
  expect("Idle: nothing loops, and once the hero's signal has run nothing is animating", q.atRest.endless === 0 && q.atRest.running === 0);
  expect("Idle: the main thread is quiet — no long task in five seconds at rest", q.idle.longTasks === 0);
  expect("Home desktop: no horizontal overflow", (await overflow(desk)) === 0);
  await desk.done();

  /* ---------- themes and widths ---------- */
  q.widths = {};
  for (const [name, viewport] of [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", MOBILE]]) for (const theme of ["dark", "light"]) {
    const page = await fresh({ viewport, theme, touch: viewport !== DESKTOP, settle: 700 });
    const state = await home(page);
    q.widths[`${name}-${theme}`] = { overflow: await overflow(page), flagship: state.heights.flagship, ecosystem: state.heights.ecosystem, page: await page.evaluate(() => document.documentElement.scrollHeight), launcher: state.launcher };
    expect(`${name} ${theme}: no horizontal overflow, four flagship surfaces, six lanes`, q.widths[`${name}-${theme}`].overflow === 0 && state.cards.length === 4 && state.lanes.length === q.catalog.capabilities.length);
    if (name === "mobile" && theme === "dark") {
      q.phone = state;
      q.phoneReach = await page.evaluate(() => {
        const reach = (selector) => { const entry = document.querySelector(selector); entry.scrollIntoView({ block: "center", behavior: "instant" }); const rect = entry.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return Boolean(hit && entry.contains(hit)) && rect.height >= 32; };
        return [".hero-actions .btn.primary", '[data-v4-flagship="pipeline"] .project-actions a', ".v4-port__composer", ".v4-lane__capability", ".contact-actions .btn.primary"].map(reach);
      });
      expect("Phone: one column, the lead system first; the pipeline and the route read down their cards", state.cards.every((card) => card.box.left === state.cards[0].box.left) && state.cards.map((card) => card.box.top).every((top, index, tops) => index === 0 || top > tops[index - 1]) && state.sinama.steps.length === 6);
      expect("Phone: the primary action of the hero, the lead flagship, the port, the lanes and the closing can each be reached at the centre of the screen", q.phoneReach.every(Boolean));
    }
    await page.done();
  }

  /* ---------- without JavaScript ---------- */
  const plain = await fresh({ viewport: DESKTOP, theme: "dark", noJs: true, settle: 600 });
  q.noJs = await home(plain);
  q.noJsNav = await plain.evaluate(() => ({ nav: document.querySelectorAll(".site-header nav a[href]").length, mail: document.querySelectorAll('main a[href^="mailto:"]').length, hidden: [...document.querySelectorAll("main > *")].filter((entry) => Number(getComputedStyle(entry).opacity) < 1).length }));
  expect("Without JavaScript: identity, the four flagship surfaces with their systems and links, every lane, the bridge and the contact path are all there and visible", Boolean(q.noJs.heading) && same(q.noJs.cards.map((card) => card.links), q.initial.cards.map((card) => card.links)) && same(q.noJs.sinama, canon.sinama) && same(q.noJs.joyday, canon.joyday) && same(q.noJs.lanes.map((lane) => lane.projects.map((project) => project.href)), q.initial.lanes.map((lane) => lane.projects.map((project) => project.href))) && same(q.noJs.bridge, q.initial.bridge) && same(q.noJs.closing, q.initial.closing) && q.noJsNav.nav >= 7 && q.noJsNav.mail >= 1 && q.noJs.cards.every((card) => card.opacity === 1) && !q.noJs.lanesWaiting);
  await plain.done();

  /* ---------- reduced motion ---------- */
  const still = await fresh({ viewport: DESKTOP, theme: "dark", reducedMotion: true });
  await scrollTo(still, GRID, "top"); await still.hover('[data-v4-flagship="pipeline"] .evidence-card-content'); await wait(500);
  await scrollTo(still, LANES, "into"); await still.hover(`.v4-lane__project${node(JOYDAY)}`); await wait(500);
  q.reducedMotion = { motion: await motionState(still), lanes: (await home(still)).lanes.filter((lane) => lane.lit).map((lane) => lane.id), transition: await still.evaluate(() => getComputedStyle(document.querySelector(".v4-lane"), "::after").transitionDuration) };
  expect("Reduced motion: nothing animates or travels, and a relationship is still shown — by state, at once", q.reducedMotion.motion.running === 0 && same(q.reducedMotion.lanes, ["web"]) && /^0s/.test(q.reducedMotion.transition));
  await still.done();

  /* ---------- every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    const wide = await fresh({ viewport: DESKTOP, theme: "dark", path: localized(locale, HOME), settle: 700 });
    const narrow = await fresh({ viewport: MOBILE, theme: "dark", path: localized(locale, HOME), touch: true, settle: 700 });
    const state = await home(wide);
    const localCanon = await canonicalSignatures(locale);
    const statuses = [];
    for (const href of state.internal) statuses.push((await fetch(`${ORIGIN}${href.split("#")[0]}`)).status);
    locales[locale] = { desktop: await overflow(wide), mobile: await overflow(narrow), lang: await wide.evaluate(() => document.documentElement.lang), heading: state.heading, sections: state.sections.length, pipeline: state.sinama.steps[0], route: state.joyday.steps[0], links: state.internal.length, served: statuses.every((status) => status === 200), flagshipHeight: state.heights.flagship };
    expect(`${locale}: served in its locale, the same eight sections, no horizontal overflow at 1440 or 390`, locales[locale].desktop === 0 && locales[locale].mobile === 0 && locales[locale].lang.startsWith(locale) && Boolean(state.heading) && same(state.sections, q.initial.sections));
    expect(`${locale}: both flagship systems are that locale's case study, and every internal link stays in the locale and is served`, same(state.sinama, localCanon.sinama) && same(state.joyday, localCanon.joyday) && locales[locale].served && (locale === "en" || state.internal.every((href) => href.startsWith(`/${locale}/`))));
    await wide.done();
    await narrow.done();
  }
  expect("Locales: the flagship systems are translated, not repeated in English", new Set(LOCALES.map((locale) => locales[locale].pipeline)).size === LOCALES.length && new Set(LOCALES.map((locale) => locales[locale].route)).size === LOCALES.length);

  /* ---------- measurements + pack ---------- */
  const lcp = await lcpCompare(browser, HOME);
  console.log("[v4:capture] LCP measured");
  const builds = { ...(BASELINE ? { before: BASELINE } : {}), after: ORIGIN };
  const transfers = {};
  for (const [name, viewport] of [["1440 × 900", DESKTOP], ["390 × 844", MOBILE]]) {
    transfers[name] = {};
    for (const build of Object.keys(builds)) transfers[name][build] = await transfer(browser, builds[build], viewport);
    expect(`Transfer ${name}: no image is fetched twice, and one rendition of the AJOOP artwork`, transfers[name].after.wholePage.repeated.length === 0 && transfers[name].after.wholePage.images.filter((file) => file.startsWith("ajoop-living-hub")).length === 1);
  }
  let idleBefore = null;
  if (BASELINE) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await stubEdge(page, "down", BASELINE);
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 1 });
    await page.goto(`${BASELINE}${HOME}`, { waitUntil: "networkidle2" });
    await wait(27000);
    idleBefore = await idleWork(page);
    await context.close();
  }
  const reactEntry = async (root) => (await readFile(join(root, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizeOf = async (root, file) => {
    const bytes = await readFile(join(root, "dist-site", file));
    return { raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const sizes = [];
  for (const file of ["index.html", "css/v4-home.css", "css/v4-system.css", "js/v4/runtime.js", "react"]) {
    const after = await sizeOf(ROOT, file === "react" ? await reactEntry(ROOT) : file);
    const before = BASELINE_ROOT ? await sizeOf(BASELINE_ROOT, file === "react" ? await reactEntry(BASELINE_ROOT) : file) : null;
    sizes.push({ file: file === "react" ? "assets-react/production-main-*.js" : file, before, after });
  }

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", frames, 3100);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, baselineOrigin: BASELINE, aiEdge: "stubbed: “down” (503)", home: q, canonical: canon, locales, lcpHome: lcp, transfers, idleBefore, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const delta = (before, after) => (before === null || before === undefined ? "" : ` (${after - before >= 0 ? "+" : "−"}${kb(Math.abs(after - before))})`);
  const lcpCell = (cell) => (cell ? `${cell.medianMs} ms on <${cell.element}>${cell.file ? ` (${cell.file})` : ""} · CLS ≤ ${cell.clsMax}` : "not measured");
  const moved = (row) => `${kb(row.bytes)} in ${row.requests} requests (images ${kb(row.byKind.images || 0)}, CSS ${kb(row.byKind.css || 0)}, JS ${kb(row.byKind.js || 0)})`;
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${frames.length} frames from one continuous session in one tab, in order; the individual frames are in \`motion-frames/\`.
- **\`qa-summary.json\`** — everything measured in this run.
- **\`${PACK}\`** — everything here.

AJOOP's public AI edge (\`${EDGE}\`) was stubbed (503) for every capture and check; nothing was scripted into the page.

## Home, in order

${q.initial.sections.map((section, index) => `${index + 1}. ${section} — ${q.initial.heights[section]} px at 1440`).join("\n")}

Page height: ${Object.entries(q.widths).map(([name, entry]) => `${name} ${entry.page} px`).join(" · ")}.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((entry, index) => `${index + 1}. ${entry.label}`).join("\n")}

## Flagship hierarchy, as rendered

${q.initial.cards.map((card) => `- **${card.title}** — ${card.role}, ${card.box.width} × ${card.box.height} at 1440; links ${card.links.join(", ")}`).join("\n")}
- SINAMA's pipeline: “${q.initial.sinama.caption}” — ${q.initial.sinama.steps.length} steps; proof ${q.initial.sinama.proof.map((entry) => `${entry.value} ${entry.label}`).join(" · ")}. All of it read from its case study.
- Atölye Joyday's route: “${q.initial.joyday.caption}” — ${q.initial.joyday.steps.length} stops; proof ${q.initial.joyday.proof.map((entry) => `${entry.value} ${entry.label}`).join(" · ")}. All of it read from its case study.
- AJOOP: state “${q.initial.port.state}”, ${q.initial.port.quicks} quick questions, links ${q.initial.port.links.join(" and ")}; its composer opens the global launcher (${q.portOpens}).

## Ecosystem, as rendered

${q.initial.lanes.map((lane) => `- ${lane.label}: ${lane.projects.map((project) => `${project.title}${project.tier === "flagship" ? " (flagship)" : project.tier === "archive" ? " (archive)" : ""}`).join(" · ")}`).join("\n")}
- AJOOP is not a Works catalog project, so it is on no lane: “${q.initial.ecoAjoop}”.

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Overflow (1440 / 820 / 390, dark and light): ${Object.entries(q.widths).map(([name, entry]) => `${name} ${entry.overflow}`).join(" · ")}.
- Links: ${q.links.length} internal destinations, all ${q.links.every((link) => link.status === 200) ? "served" : "NOT all served"}; ${q.initial.external.length} external, each in a new tab without an opener.
- Relationship highlight: SINAMA lights ${q.hover.lanes.filter((lane) => lane.lit).map((lane) => lane.label).join(" + ")}; readout “${q.hover.readout.join(" — ")}”.
- Keyboard: capability pinned ${q.pinned.lanes.find((lane) => lane.id === "ai").pressed}, Tab lands on ${q.focus.node} with a focus ring (${q.focus.outline}), Escape releases; flagship row focus order by card ${q.tabOrder.join("")}; focus leaves the closing panel (${q.leaves}).
- Without JavaScript: ${q.noJs.cards.length} flagship surfaces, ${q.noJs.lanes.length} lanes, ${q.noJs.closing.length} closing actions, ${q.noJsNav.nav} navigation links; sections not fully visible: ${q.noJsNav.hidden}.
- Reduced motion: ${q.reducedMotion.motion.running} running animations; lanes lit for Joyday: ${q.reducedMotion.lanes.join()}; lane transition ${q.reducedMotion.transition}.
- At rest (1440, after the hero's bounded signal): ${q.atRest.running} time-driven animations running, ${q.atRest.endless} endless; over ${q.idle.windowMs} ms idle: ${q.idle.taskMs} ms of main-thread tasks, ${q.idle.scriptMs} ms script, ${q.idle.layouts} layouts, ${q.idle.longTasks} long tasks${idleBefore ? ` (before: ${idleBefore.taskMs} ms tasks, ${idleBefore.scriptMs} ms script, ${idleBefore.layouts} layouts, ${idleBefore.longTasks} long tasks)` : ""}.
- Layout shift over the whole desktop session: ${q.shift}.
- Locales (EN/TR/DE/ES/FR at 1440 and 390): overflow ${LOCALES.map((locale) => `${locales[locale].desktop}/${locales[locale].mobile}`).join(" · ")}; internal links ${LOCALES.map((locale) => `${locales[locale].links} ${locales[locale].served ? "ok" : "FAILED"}`).join(" · ")}; flagship section height ${LOCALES.map((locale) => locales[locale].flagshipHeight).join(" · ")} px.

## Home LCP (headless Chromium, ${BASELINE ? "E04.1 and E05 measured in turn, " : ""}5 cold loads each, median)

| Viewport | Conditions | ${BASELINE ? "E04.1 (before) | " : ""}E05 (after) |
| --- | --- | ${BASELINE ? "--- | " : ""}--- |
${lcp.map((row) => `| ${row.viewport} | ${row.conditions} | ${BASELINE ? `${lcpCell(row.before)} | ` : ""}${lcpCell(row.after)} |`).join("\n")}

## Transfer (cold load, same-origin resources, encoded bytes)

| Viewport | Build | Before scrolling | By the end of the page |
| --- | --- | --- | --- |
${Object.entries(transfers).flatMap(([name, entry]) => Object.entries(entry).map(([build, rows]) => `| ${name} | ${build === "before" ? "E04.1" : "E05"} | ${moved(rows.firstScreen)} | ${moved(rows.wholePage)} |`)).join("\n")}

## Sizes

| Asset | Raw | Gzip |
| --- | --- | --- |
${sizes.map((size) => `| ${size.file} | ${kb(size.after.raw)}${delta(size.before?.raw, size.after.raw)} | ${kb(size.after.gzip)}${delta(size.before?.gzip, size.after.gzip)} |`).join("\n")}
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
