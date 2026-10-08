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
 * to the public edge are intercepted in the browser. Nothing is simulated in
 * the page — every answer shown is the engine's own deterministic answer, and
 * every state shown is the state the engine reported.
 *
 *   "down"      the edge answers 503: assistance is unavailable, as it is
 *               whenever the local bridge is switched off.
 *   "degraded"  the edge reports healthy, then fails each generation: a turn
 *               whose AI assistance was attempted and failed.
 *
 * V4_BASELINE_ORIGIN (optional): a preview server on the previous phase's
 * build. When set, the case study's LCP is measured on both builds in turn,
 * so the two numbers come from the same minutes on the same machine. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-e04-1-ajoop-brand-lock";
const PACK = "V4-E04-1-review-pack.zip";
const TITLE = "V4-E04.1 · AJOOP Brand Integration + Visual Lock";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
const FRAMES = join(OUTPUT, "motion-frames");
/* Its own port: 4174/4175 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASELINE = process.env.V4_BASELINE_ORIGIN || null;
const EDGE = "https://ajoop.kaanbalci.com/";
const SERVER_SCRIPT = join(ROOT, "scripts", "v4-preview-server.mjs");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const HUB = "/ajoop/";
const CASE = "/ajoop-case-study/";
const SESSION_KEY = "ajoop-session-v1";
const node = (id) => `[data-v4-eco-node="${id}"]`;
const TOGGLE = "[data-chatbot-toggle]";
const INPUT = "[data-chatbot-input]";
const QUESTION = "best projects";
const FOLLOW_UP = "Who is Kaan?";
/* What the site ships of the approved brand pack (scripts/v4-ajoop-brand-assets.mjs). */
const BRAND = { markDark: "ajoop-mark-dark.webp", markLight: "ajoop-mark-light.webp", wordmark: "ajoop-wordmark-dark.webp", appIcon: "ajoop-launcher-192.webp", art: [640, 960, 1600].map((width) => `ajoop-living-hub-${width}.webp`) };
const BRAND_FILES = [BRAND.markDark, BRAND.markLight, BRAND.wordmark, BRAND.appIcon, ...BRAND.art];

/* In contact-sheet order. `steps` run in order: ["click", selector],
 * ["hover", selector], ["focus", selector], ["top", selector] (scroll it just
 * under the header), ["into", selector] (centre it), ["ask", text] (type into
 * the composer, send, wait for the turn to settle), ["goto", path]. */
const shots = [
  { name: "01-hub-dark-branded-idle.png", label: "AJOOP Hub · dark · idle: the Living Hub core on the hero's nexus, the mark in the rail and in the empty field", viewport: DESKTOP, theme: "dark", path: HUB },
  { name: "02-hub-dark-active-conversation.png", label: "Hub · dark · conversation active: the core has stepped back, the empty-field mark is gone", viewport: DESKTOP, theme: "dark", path: HUB, steps: [["ask", QUESTION], ["top", ".page-hero"]] },
  { name: "03-hub-light.png", label: "Hub · light: the light mark; the artwork as a contained dark panel", viewport: DESKTOP, theme: "light", path: HUB },
  { name: "04-hub-mobile.png", label: "Hub · mobile: the mark in the identity bar, conversation first", viewport: MOBILE, theme: "dark", path: HUB },
  { name: "05-case-study-hero-dark.png", label: "Case study · hero · dark: the Living Hub visual under the approved lockup", viewport: DESKTOP, theme: "dark", path: CASE },
  { name: "06-case-study-architecture.png", label: "Case study · architecture: the same path, around the core and the mark; Local model bridge in hand", viewport: DESKTOP, theme: "dark", path: CASE, steps: [["into", ".v4-ajoop-sys"], ["hover", node("bridge")]] },
  { name: "07-case-study-light.png", label: "Case study · light: the visual stays a dark product surface", viewport: DESKTOP, theme: "light", path: CASE },
  { name: "08-case-study-mobile.png", label: "Case study · mobile: the visual and the entry into the Hub", viewport: MOBILE, theme: "dark", path: CASE, steps: [["top", ".v4-ajoop-entry"]] },
  { name: "09-launcher-approved-icon.png", label: "Launcher · the approved app icon; the panel it opens, unchanged", viewport: DESKTOP, theme: "dark", path: "/about/", steps: [["click", TOGGLE]] },
  { name: "10-home-ajoop-flagship.png", label: "Home · AJOOP flagship: the same artwork and app icon, the same two links", viewport: DESKTOP, theme: "dark", path: "/", steps: [["into", ".v4-port"]] },
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

/* The conversation as the visitor sees it, wherever it is presented. */
const transcript = (page) => page.evaluate(() => [...document.querySelectorAll("[data-chatbot-messages] .chatbot-message")].map((message) => ({
  who: message.classList.contains("user") ? "user" : "bot",
  text: message.querySelector("[data-chatbot-prose]")?.textContent.trim() || "",
  cards: [...message.querySelectorAll(".ajoop-card-title")].map((entry) => entry.textContent.trim()),
  provenance: message.querySelector("[data-ajoop-provenance]")?.textContent.trim() || null,
  status: message.getAttribute("data-ajoop-turn-status"),
})));

/* The Hub, as the page reports it. */
const hub = (page) => page.evaluate((key) => {
  const root = document.querySelector("[data-v4-hub]");
  const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length);
  let record = null;
  try { record = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { record = "unreadable"; }
  return {
    present: Boolean(root),
    live: root?.getAttribute("data-v4-live") || null,
    stateLabel: root?.querySelector("[data-v4-hub-state]")?.textContent.trim() || null,
    launchers: shown(".chatbot-launcher").length,
    dialogs: document.querySelectorAll('[data-v4-hub] [role="dialog"], [data-v4-hub][aria-modal], [data-v4-hub] [aria-modal]').length,
    inert: document.querySelectorAll("main[inert], header[inert], footer[inert]").length,
    fieldShown: shown(".v4-hub__field").length,
    composer: shown("[data-chatbot-input]").length,
    staticNote: shown(".v4-hub__static").length,
    messages: document.querySelectorAll("[data-chatbot-messages] .chatbot-message").length,
    lit: [...(root?.querySelectorAll(".v4-hub__path li[data-v4-state]") || [])].map((entry) => entry.getAttribute("data-v4-stage")).join(),
    evidence: [...(root?.querySelectorAll(".v4-hub__evidence li") || [])].map((entry) => ({ title: entry.textContent.trim(), href: entry.querySelector("a")?.getAttribute("href") || null })),
    provenance: root?.querySelector(".v4-hub__provenance")?.textContent.trim() || null,
    service: root?.querySelector("[data-chatbot-bridge]")?.getAttribute("data-ajoop-service") || null,
    scope: root?.querySelectorAll(".v4-hub__scope .v4-ports li").length || 0,
    how: root?.querySelector(".v4-hub__how")?.getAttribute("href") || null,
    actions: shown("[data-chatbot-quicks] button").map((entry) => entry.textContent.trim()),
    connected: document.querySelectorAll(".ajoop-provenance-connected, .ajoop-action-preview").length,
    session: record && record !== "unreadable" ? { version: record.version, language: record.language, messages: record.messages.length, keys: Object.keys(record).sort().join(), bytes: JSON.stringify(record).length } : record,
    elsewhere: { local: Object.keys(localStorage).filter((name) => /ajoop-session/i.test(name) || /ajoop-session/i.test(localStorage.getItem(name) || "")).length, cookie: /ajoop/i.test(document.cookie) },
  };
}, SESSION_KEY);

/* The case study, as the page reports it. */
const caseStudy = (page) => page.evaluate(() => {
  const root = document.querySelector(".v4-ajoop-sys");
  const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length);
  return {
    heading: document.querySelector("h1")?.textContent.trim(),
    tracker: [...document.querySelectorAll("[data-v4-tracker] a")].map((entry) => entry.textContent.replace(/\s+/g, " ").trim()),
    trackerTargets: [...document.querySelectorAll("[data-v4-tracker] a")].every((entry) => document.getElementById(entry.getAttribute("href").slice(1))),
    stack: [...document.querySelectorAll(".case-stack span")].map((entry) => entry.textContent.trim()),
    proofFigures: document.querySelectorAll(".case-proof").length,
    nodes: [...root.querySelectorAll('.v4-ajoop-sys__node[data-v4-zone="public"]')].map((entry) => entry.getAttribute("data-v4-eco-node")),
    parts: root.querySelectorAll("[data-v4-eco-node]").length,
    ownerLinks: root.querySelector('.v4-ajoop-sys__node[data-v4-zone="private"]').getAttribute("data-v4-eco-links"),
    ownerEdges: root.querySelectorAll('[data-v4-edge~="owner"]').length,
    edges: root.querySelectorAll(".v4-ajoop-sys__edge").length,
    boundary: shown(".v4-ajoop-sys__boundary").length,
    fieldShown: shown(".v4-ajoop-sys__field").length,
    active: root.hasAttribute("data-v4-eco-active"),
    activeNode: root.querySelector('[data-v4-state="active"][data-v4-eco-node]')?.getAttribute("data-v4-eco-node") || null,
    related: [...root.querySelectorAll('[data-v4-state="related"][data-v4-eco-node]')].map((entry) => entry.getAttribute("data-v4-eco-node")).join(),
    litEdges: root.querySelectorAll('.v4-ajoop-sys__edge[data-v4-state="active"]').length,
    pressed: [...root.querySelectorAll('[aria-pressed="true"]')].map((entry) => entry.getAttribute("data-v4-eco-node")).join(),
    panel: shown("[data-v4-eco-panel]").map((entry) => entry.getAttribute("data-v4-eco-panel")).join(),
    panelsShown: shown(".v4-ajoop-sys__panel").length,
    waiting: root.hasAttribute("data-v4-await"),
    entryLinks: [...document.querySelectorAll(".v4-ajoop-entry a")].map((entry) => entry.getAttribute("href")),
    cta: [...document.querySelectorAll(".case-actions a, .v4-ajoop-live a.btn.primary")].map((entry) => entry.getAttribute("href")),
    canvases: document.querySelectorAll("canvas").length,
  };
});

/* The approved identity, as each page actually renders it: which file every
 * brand surface resolves to, its box, and the state of every brand image. */
const brand = (page) => page.evaluate(() => {
  const file = (value) => (/url\(/.test(value || "") ? value.replace(/^.*url\(["']?/, "").replace(/["']?\).*$/, "").split("/").pop() : null);
  const one = (selector, pseudo) => {
    const entry = document.querySelector(selector);
    if (!entry) return null;
    const style = getComputedStyle(entry, pseudo);
    const rect = entry.getBoundingClientRect();
    return { file: file(style.backgroundImage), width: pseudo ? Math.round(parseFloat(style.width)) : Math.round(rect.width), height: pseudo ? Math.round(parseFloat(style.height)) : Math.round(rect.height), shown: entry.getClientRects().length > 0, opacity: Number(style.opacity), transform: style.textTransform, text: pseudo ? null : entry.textContent.trim() };
  };
  return {
    hubMark: one(".v4-hub__mark .ajoop-mark"),
    hubTitle: one(".v4-hub__identity h2"),
    hubIdle: one(".v4-hub__idle"),
    hubIdleMark: one(".v4-hub__idle .ajoop-mark"),
    hubCore: one(".v4-hub-core"),
    hubCoreMotion: document.querySelector(".v4-hub-core") ? getComputedStyle(document.querySelector(".v4-hub-core")).transitionDuration : null,
    hubMascots: document.querySelectorAll(".v4-hub .ajoop-mascot, .v4-ajoop-entry .ajoop-mascot").length,
    entryLockup: one(".v4-ajoop-entry__lockup"),
    entryMedia: one(".v4-ajoop-entry__media"),
    systemCore: one(".v4-ajoop-sys", "::after"),
    launcher: one(".chatbot-launcher"),
    launcherIcon: one(".chatbot-launcher .chatbot-launcher-icon"),
    launcherGlyph: one(".chatbot-launcher .chatbot-launcher-icon i"),
    launcherText: one(".chatbot-launcher [data-chatbot-launcher-text]"),
    panelTitle: one(".chatbot-header h2"),
    hubLink: document.querySelector(".chatbot-hub-link")?.getAttribute("href") || null,
    portIcon: one(".v4-port__node .ajoop-app-icon"),
    portTitle: one(".v4-port h3"),
    images: [...document.images].filter((image) => /\/assets\/ajoop-/.test(image.currentSrc || image.getAttribute("src") || "")).map((image) => ({
      chosen: (image.currentSrc || "").split("/").pop() || null,
      natural: image.naturalWidth,
      complete: image.complete,
      width: image.getAttribute("width"),
      height: image.getAttribute("height"),
      loading: image.getAttribute("loading"),
      priority: image.getAttribute("fetchpriority"),
      alt: image.getAttribute("alt"),
      box: `${Math.round(image.getBoundingClientRect().width)}×${Math.round(image.getBoundingClientRect().height)}`,
    })),
    /* The approved pack lives outside the site; nothing may point back at it. */
    offSite: [...document.querySelectorAll("[src], [srcset], link[href]")].filter((entry) => /OneDrive|Masa|AJOOP-ASSETS|file:/i.test(`${entry.getAttribute("src") || ""} ${entry.getAttribute("srcset") || ""} ${entry.getAttribute("href") || ""}`)).length,
  };
});

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
  const film = await fresh({ viewport: DESKTOP, theme: "dark", path: "/about/" });
  const frame = async (label) => {
    const file = join(FRAMES, `${String(frames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}.png`);
    await film.screenshot({ path: file, type: "png" });
    frames.push({ file, label, width: 960 });
  };
  const glide = async (selector) => {
    const point = await film.evaluate((target) => {
      const rect = document.querySelector(target).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
    await film.mouse.move(point.x, point.y, { steps: 14 });
  };
  const jump = (selector, block = "center", offset = 0) => film.evaluate((target, where, by) => { document.querySelector(target).scrollIntoView({ block: where, behavior: "instant" }); if (by) window.scrollBy({ top: by, behavior: "instant" }); }, selector, block, offset);
  const hasQuestion = () => film.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"), { timeout: 20000, polling: "raf" });
  await film.click(TOGGLE); await wait(260); await frame("Launcher opens, under the approved app icon");
  await wait(700); await ask(film, QUESTION);
  /* Caught as the conversation lands: the core is still on its way back. */
  await Promise.all([film.waitForNavigation({ waitUntil: "domcontentloaded" }), film.click(".chatbot-hub-link")]);
  await hasQuestion(); await film.evaluate(() => document.fonts.ready);
  await frame("Hub opens with the same conversation: the core begins to step back");
  await wait(2200); await frame("Hub identity settled: the core receded, the mark holding the rail");
  await Promise.all([film.waitForNavigation({ waitUntil: "domcontentloaded" }), film.click(".v4-hub__how")]);
  await film.waitForFunction(() => document.querySelector(".v4-ajoop-entry .ajoop-art")?.complete, { timeout: 20000 }); await film.evaluate(() => document.fonts.ready);
  await wait(260); await frame("Case-study hero enters: the Living Hub visual under the lockup");
  await wait(1500); await jump(".v4-ajoop-sys"); await wait(2600); await glide(node("bridge")); await wait(420);
  await frame("Architecture activates: Local model bridge, around the core");
  await film.mouse.move(3, 300); await jump(".v4-ajoop-live"); await wait(1200);
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle2" }), film.click(".v4-ajoop-live .btn.primary")]);
  await hasQuestion(); await wait(1500);
  await frame("Handoff: back in the Hub, the conversation intact");
  const filmed = await transcript(film);
  expect("Motion session: the launcher's conversation is the one the Hub shows at the end", filmed.length === 3 && filmed[1].text === QUESTION && filmed[2].cards.length > 0);
  await film.done();

  /* ---------- brand: the Hub ---------- */
  const b = {};
  const h = {};
  const hubPage = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB });
  h.initial = await hub(hubPage);
  b.hubIdle = await brand(hubPage);
  const coreImage = b.hubIdle.images[0];
  expect("Hub: a page surface, not a dialog — no launcher, no modal, nothing inert, composer present", h.initial.present && h.initial.launchers === 0 && h.initial.dialogs === 0 && h.initial.inert === 0 && h.initial.fieldShown === 1 && h.initial.composer === 1 && h.initial.staticNote === 0);
  expect("Hub: opens idle with the greeting, its scope and no stored conversation", h.initial.live === "idle" && h.initial.messages === 1 && h.initial.scope === 5 && h.initial.session === null && h.initial.evidence.length === 0);
  expect("Hub brand: the rail carries the approved mark (dark rendering), not the panel's mascot", b.hubIdle.hubMark?.file === BRAND.markDark && b.hubIdle.hubMark.shown && b.hubIdle.hubMascots === 0);
  expect("Hub brand: the name is set AJOOP", b.hubIdle.hubTitle.transform === "uppercase" && b.hubIdle.hubTitle.text.toUpperCase() === "AJOOP");
  expect("Hub brand: the empty field shows the mark", b.hubIdle.hubIdle.shown && b.hubIdle.hubIdle.opacity > 0.4 && b.hubIdle.hubIdleMark.file === BRAND.markDark);
  expect("Hub brand: the Living Hub core is one sized, eager, decorative image, loaded", b.hubIdle.images.length === 1 && BRAND.art.includes(coreImage.chosen) && coreImage.complete && coreImage.natural > 0 && coreImage.width === "1600" && coreImage.height === "900" && coreImage.loading === null && coreImage.alt === "" && b.hubIdle.hubCore.opacity > 0.9);
  expect("Hub brand: nothing points at the approved pack's folder", b.hubIdle.offSite === 0);
  /* Every live state the Hub passes through during one real turn. */
  await hubPage.evaluate(() => {
    const root = document.querySelector("[data-v4-hub]");
    window.__states = [root.getAttribute("data-v4-live")];
    new MutationObserver(() => { const next = root.getAttribute("data-v4-live"); if (window.__states.at(-1) !== next) window.__states.push(next); }).observe(root, { attributes: true, attributeFilter: ["data-v4-live"] });
  });
  await ask(hubPage, QUESTION);
  await hubPage.evaluate(() => document.activeElement.blur()); await wait(900);
  h.asked = { ...(await hub(hubPage)), states: await hubPage.evaluate(() => window.__states), transcript: await transcript(hubPage) };
  b.hubActive = await brand(hubPage);
  const lastAnswer = h.asked.transcript.at(-1);
  expect("Hub: a turn passes through real states — composing, retrieving, then a grounded answer", h.asked.states.includes("composing") && h.asked.states.includes("retrieving") && h.asked.live === "grounded" && h.asked.states.indexOf("retrieving") < h.asked.states.lastIndexOf("grounded"));
  expect("Hub: the context surface lists exactly the evidence the answer itself shows", lastAnswer.cards.length > 0 && JSON.stringify(h.asked.evidence.map((item) => item.title)) === JSON.stringify(lastAnswer.cards) && h.asked.lit === "ajoop,evidence,answer" && Boolean(h.asked.provenance));
  expect("Hub: the bounded copy lives in this tab's session storage only", h.asked.session?.version === 1 && h.asked.session.language === "en" && h.asked.session.messages === 2 && h.asked.session.keys === "actions,conversationState,language,messages,replyLanguage,turn,version" && h.asked.elsewhere.local === 0 && !h.asked.elsewhere.cookie);
  expect("Public/private boundary: no connected source, no action preview, no request beyond the site, its fonts and the public edge", h.asked.connected === 0 && hubPage.foreignRequests.length === 0);
  expect("Hub brand: once a question is asked the core steps back and the empty-field mark leaves", b.hubActive.hubCore.opacity < 0.35 && b.hubActive.hubIdle.opacity === 0 && b.hubActive.hubMark.file === BRAND.markDark);
  await wait(2600);
  h.atRest = await motionState(hubPage);
  expect("Hub: nothing loops and the page comes to rest", h.atRest.endless === 0 && h.atRest.running === 0);
  h.shift = await layoutShift(hubPage);
  await hubPage.click('[data-chatbot-action-kind="reset"]'); await wait(1300);
  h.reset = await hub(hubPage);
  b.hubReset = await brand(hubPage);
  expect("Hub: Start over clears the conversation, its stored copy and the context surface — and the idle identity returns", h.reset.messages === 1 && h.reset.session === null && h.reset.evidence.length === 0 && b.hubReset.hubCore.opacity > 0.9 && b.hubReset.hubIdle.opacity > 0.4);
  expect("Hub desktop: no horizontal overflow", (await overflow(hubPage)) === 0);
  await hubPage.done();

  const hubLight = await fresh({ viewport: DESKTOP, theme: "light", path: HUB });
  b.hubLight = await brand(hubLight);
  expect("Hub light: the light mark in the rail and the empty field; the artwork contained in a dark panel, not blended into the page", b.hubLight.hubMark.file === BRAND.markLight && b.hubLight.hubIdleMark.file === BRAND.markLight && b.hubLight.hubCore.opacity === 1 && (await hubLight.evaluate(() => { const style = getComputedStyle(document.querySelector(".v4-hub-core")); return style.maskImage === "none" && parseFloat(style.borderTopWidth) > 0; })));
  expect("Hub light: no horizontal overflow", (await overflow(hubLight)) === 0);
  await hubLight.done();

  /* Touch + phone. */
  const phone = await fresh({ viewport: MOBILE, theme: "dark", path: HUB, touch: true });
  b.hubPhone = await brand(phone);
  await phone.evaluate(() => document.querySelector(".v4-hub__field").scrollIntoView({ block: "start", behavior: "instant" })); await wait(500);
  await ask(phone, QUESTION, { tap: true });
  h.phone = { ...(await hub(phone)), reach: await phone.evaluate(() => {
    document.querySelector("[data-chatbot-send]").scrollIntoView({ block: "center", behavior: "instant" });
    return ["[data-chatbot-send]", "[data-chatbot-input]"].map((selector) => { const rect = document.querySelector(selector).getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return Boolean(hit && hit.closest(selector)); });
  }) };
  expect("Hub phone: the mark heads the identity bar; the empty-field mark is not drawn over the short transcript", b.hubPhone.hubMark.file === BRAND.markDark && b.hubPhone.hubMark.shown && !b.hubPhone.hubIdle.shown);
  expect("Hub touch: a question can be asked on a phone and no fixed control covers the composer or send", h.phone.live === "grounded" && h.phone.launchers === 0 && h.phone.reach.every(Boolean));
  expect("Hub mobile: no horizontal overflow", (await overflow(phone)) === 0);
  await phone.done();

  const hubPlain = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB, noJs: true, settle: 600 });
  const loadingCopy = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", "en", "common.json"), "utf8"))["ajoop.hub.loading"];
  h.noJs = await hubPlain.evaluate(() => {
    const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length).length;
    return { heading: document.querySelector("h1").textContent.trim(), notice: shown(".v4-hub__noscript"), noticeLinks: document.querySelectorAll(".v4-hub__noscript a[href]").length, identity: shown(".v4-hub__identity"), scope: shown(".v4-hub__scope .v4-ports li"), composer: shown("[data-chatbot-input]"), staticNote: shown(".v4-hub__static"), staticText: document.querySelector(".v4-hub__static").textContent.trim(), how: shown(".v4-hub__how") };
  });
  b.hubNoJs = await brand(hubPlain);
  expect("Hub without JavaScript: identity, scope, a plain notice and links — no dead composer", Boolean(h.noJs.heading) && h.noJs.notice === 1 && h.noJs.noticeLinks === 5 && h.noJs.identity === 1 && h.noJs.scope === 5 && h.noJs.composer === 0 && h.noJs.staticNote === 1 && h.noJs.how === 1);
  expect("Hub without JavaScript: the static line makes no promise about loading, and is the catalog's own", h.noJs.staticText === loadingCopy && !/finished loading|becomes available/i.test(h.noJs.staticText));
  expect("Hub without JavaScript: the mark and the core still render; the empty-field mark does not", b.hubNoJs.hubMark.file === BRAND.markDark && b.hubNoJs.images[0]?.natural > 0 && !b.hubNoJs.hubIdle.shown);
  await hubPlain.done();

  const hubStill = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB, reducedMotion: true });
  await ask(hubStill, QUESTION); await hubStill.evaluate(() => document.activeElement.blur()); await wait(400);
  h.reducedMotion = { ...(await hub(hubStill)), motion: await motionState(hubStill) };
  b.hubStill = await brand(hubStill);
  expect("Hub reduced motion: every state is still stated, the core steps back without a transition, nothing animates", h.reducedMotion.live === "grounded" && Boolean(h.reducedMotion.stateLabel) && h.reducedMotion.motion.running === 0 && b.hubStill.hubCore.opacity < 0.35 && /^0s/.test(b.hubStill.hubCoreMotion));
  await hubStill.done();

  /* ---------- launcher ↔ Hub: one conversation ---------- */
  const c = {};
  const tab = await fresh({ viewport: DESKTOP, theme: "dark", path: "/about/", edge: "degraded" });
  b.launcher = await brand(tab);
  expect("Launcher brand: the approved app icon at the launcher's own size; the glyph it replaces is not drawn", b.launcher.launcherIcon?.file === BRAND.appIcon && b.launcher.launcherIcon.width === 44 && b.launcher.launcherIcon.height === 44 && b.launcher.launcher.height === 56 && !b.launcher.launcherGlyph.shown);
  expect("Launcher brand: its label and the panel's title are set AJOOP; the engine's strings are untouched", b.launcher.launcherText.transform === "uppercase" && b.launcher.panelTitle.transform === "uppercase" && b.launcher.launcherText.text === "Ask Ajoop" && b.launcher.panelTitle.text === "Ajoop");
  expect("Launcher → Hub: the launcher stays on ordinary pages and links to the Hub", b.launcher.launcher.shown && b.launcher.hubLink === HUB);
  await tab.click(TOGGLE); await wait(600);
  c.focus = await tab.evaluate(() => ({ expanded: document.querySelector("[data-chatbot-toggle]").getAttribute("aria-expanded"), inPanel: Boolean(document.activeElement?.closest("[data-chatbot-panel]")), dialog: document.querySelector("[data-chatbot-panel]").getAttribute("role") }));
  expect("Launcher: opening it still moves focus into its dialog", c.focus.expanded === "true" && c.focus.inPanel && c.focus.dialog === "dialog");
  await ask(tab, QUESTION);
  c.launcher = await transcript(tab);
  await Promise.all([tab.waitForNavigation({ waitUntil: "networkidle2" }), tab.click(".chatbot-hub-link")]);
  await tab.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"), { timeout: 20000 }); await wait(900);
  c.hubArrived = { path: new URL(tab.url()).pathname, transcript: await transcript(tab), state: await hub(tab) };
  const conversation = (messages) => JSON.stringify(messages.slice(1));
  expect("Launcher → Hub: the Hub opens on the same conversation, message for message, with its evidence and follow-ups", c.hubArrived.path === HUB && c.launcher.length === 3 && conversation(c.hubArrived.transcript) === conversation(c.launcher) && c.hubArrived.state.evidence.length === c.launcher.at(-1).cards.length && c.hubArrived.state.actions.length > 0);
  const sentBefore = tab.edgeRequests.length;
  await ask(tab, FOLLOW_UP);
  c.hubContinued = await transcript(tab);
  const generation = tab.edgeRequests.slice(sentBefore).map((body) => { try { return JSON.parse(body); } catch { return null; } }).find((body) => body && body.mode === "rag");
  c.memory = generation ? generation.history.map((entry) => `${entry.role}: ${entry.content.slice(0, 40)}`) : null;
  expect("Launcher → Hub: the next question reaches the engine with the launcher exchange as its memory", Boolean(generation) && generation.history.length === 2 && generation.history[0].role === "user" && generation.history[0].content === QUESTION);
  await visit(tab, "/works/"); await wait(700);
  await tab.click(TOGGLE); await wait(700);
  c.backInLauncher = await transcript(tab);
  expect("Hub → launcher: reopening the launcher on another page continues the same conversation", c.hubContinued.length === 5 && conversation(c.backInLauncher) === conversation(c.hubContinued));
  await tab.done();

  const launcherLight = await fresh({ viewport: MOBILE, theme: "light", path: "/about/", touch: true, settle: 900 });
  b.launcherPhone = await brand(launcherLight);
  c.phoneLauncher = await launcherLight.evaluate(() => { const rect = document.querySelector(".chatbot-launcher").getBoundingClientRect(); return { right: Math.round(innerWidth - rect.right), bottom: Math.round(innerHeight - rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; });
  expect("Launcher phone + light: the same app icon, inside the viewport's safe area", b.launcherPhone.launcherIcon.file === BRAND.appIcon && b.launcherPhone.launcherIcon.shown && c.phoneLauncher.right >= 8 && c.phoneLauncher.bottom >= 8 && c.phoneLauncher.height >= 44 && (await overflow(launcherLight)) === 0);
  await launcherLight.done();

  /* ---------- case-study smoke ---------- */
  const s = {};
  const study = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE });
  s.initial = await caseStudy(study);
  b.caseStudy = await brand(study);
  const heroImage = b.caseStudy.images[0];
  const canonicalStack = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "ajoop-master-knowledge.json"), "utf8")).projects.flagship["Ajoop Portfolio Copilot"].architecture_public_safe;
  expect("Case study: seven sections, each reachable from the tracker", s.initial.heading === "AJOOP" && s.initial.tracker.length === 7 && s.initial.trackerTargets);
  expect("Case study: the stack is the portfolio's own public-safe record, and no figures are claimed", JSON.stringify(s.initial.stack) === JSON.stringify(canonicalStack) && s.initial.proofFigures === 0);
  expect("Case study: still seven public parts on seven wires and one private part with no wire — the brand pass added no node and no wire", s.initial.nodes.length === 7 && s.initial.parts === 8 && s.initial.edges === 7 && s.initial.ownerLinks === "" && s.initial.ownerEdges === 0 && s.initial.boundary === 1 && s.initial.canvases === 0);
  expect("Case study: every way into the Hub is an ordinary link to it", s.initial.entryLinks.length === 5 && s.initial.entryLinks.every((href) => href === HUB) && s.initial.cta.length === 2 && s.initial.cta.every((href) => href === HUB));
  expect("Case study brand: the hero visual is one sized, high-priority, non-lazy image, loaded, in a 21:9 frame", b.caseStudy.images.length === 1 && BRAND.art.includes(heroImage.chosen) && heroImage.complete && heroImage.natural > 0 && heroImage.width === "1600" && heroImage.height === "900" && heroImage.priority === "high" && heroImage.loading === null && Math.abs(b.caseStudy.entryMedia.width / b.caseStudy.entryMedia.height - 21 / 9) < 0.02);
  expect("Case study brand: the approved lockup signs the visual; the diagram's core carries the mark", b.caseStudy.entryLockup.file === BRAND.wordmark && b.caseStudy.entryLockup.shown && b.caseStudy.systemCore.file === BRAND.markDark && b.caseStudy.hubMascots === 0 && b.caseStudy.offSite === 0);
  await scrollTo(study, ".v4-ajoop-sys", "into");
  await study.hover(node("bridge")); await wait(700);
  s.hover = await caseStudy(study);
  expect("Case study: a part in hand lights what it is wired to and explains itself", s.hover.activeNode === "bridge" && s.hover.related === "state,evidence" && s.hover.litEdges === 2 && s.hover.panel === "bridge");
  /* The core is not a part: the point at its centre selects nothing. */
  await study.mouse.move(3, 300); await wait(500);
  s.core = await study.evaluate(() => {
    const rect = document.querySelector(".v4-ajoop-sys").getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width * 0.5818, rect.top + rect.height * 0.3462);
    return { button: Boolean(hit?.closest("button, a")), within: Boolean(hit?.closest(".v4-ajoop-sys")) };
  });
  expect("Case study: the mark at the diagram's core is not a part — nothing there can be selected", s.core.within && !s.core.button);
  await study.focus(node("owner")); await study.keyboard.press("Enter"); await study.mouse.move(3, 300); await wait(600);
  s.owner = await caseStudy(study);
  expect("Case study keyboard: the private track can be read, and lights nothing in the public path", s.owner.pressed === "owner" && s.owner.panel === "owner" && s.owner.litEdges === 0 && s.owner.related === "");
  await study.keyboard.press("Escape"); await study.evaluate(() => document.activeElement.blur()); await wait(2800);
  s.atRest = await motionState(study);
  expect("Case study: nothing loops and the page comes to rest", s.atRest.endless === 0 && s.atRest.running === 0);
  s.shift = await layoutShift(study);
  expect("Case study desktop: no horizontal overflow", (await overflow(study)) === 0);
  await study.done();

  const studyLight = await fresh({ viewport: DESKTOP, theme: "light", path: CASE });
  b.caseLight = await brand(studyLight);
  expect("Case study light: the visual stays a dark surface under the same lockup; the diagram's core takes the light mark", b.caseLight.entryLockup.file === BRAND.wordmark && b.caseLight.systemCore.file === BRAND.markLight && (await studyLight.evaluate(() => getComputedStyle(document.querySelector(".v4-ajoop-entry__media")).backgroundColor)) === "rgb(7, 13, 24)");
  expect("Case study light: no horizontal overflow", (await overflow(studyLight)) === 0);
  await studyLight.done();

  const studyPhone = await fresh({ viewport: MOBILE, theme: "dark", path: CASE, touch: true });
  s.phone = await caseStudy(studyPhone);
  await scrollTo(studyPhone, ".v4-ajoop-entry", "top");
  b.casePhone = await brand(studyPhone);
  expect("Case study phone: the path is a list of its eight parts, not a squeezed diagram", s.phone.fieldShown === 0 && s.phone.panelsShown === 8);
  expect("Case study phone: the visual loads at a phone's width and the lockup fits its frame", b.casePhone.images[0].natural > 0 && b.casePhone.images[0].chosen === BRAND.art[0] && b.casePhone.entryLockup.width < b.casePhone.entryMedia.width * 0.62);
  expect("Case study mobile: no horizontal overflow", (await overflow(studyPhone)) === 0);
  await studyPhone.done();

  const studyPlain = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE, noJs: true, settle: 600 });
  s.noJs = await caseStudy(studyPlain);
  b.caseNoJs = await brand(studyPlain);
  expect("Case study without JavaScript: the path is drawn, all eight parts are explained, and the visual and lockup are there", s.noJs.fieldShown === 1 && s.noJs.panelsShown === 8 && !s.noJs.waiting && s.noJs.cta.length === 2 && b.caseNoJs.images[0]?.natural > 0 && b.caseNoJs.entryLockup.file === BRAND.wordmark);
  await studyPlain.done();

  const studyStill = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE, reducedMotion: true });
  await studyStill.click(node("planner")); await studyStill.mouse.move(3, 300); await wait(400);
  s.reducedMotion = { ...(await caseStudy(studyStill)), motion: await motionState(studyStill) };
  expect("Case study reduced motion: a part still pins, nothing animates", s.reducedMotion.pressed === "planner" && s.reducedMotion.motion.running === 0);
  await studyStill.done();

  /* ---------- Home's flagship port ---------- */
  const home = await fresh({ viewport: DESKTOP, theme: "dark", path: "/", settle: 900 });
  b.homeBefore = await brand(home);
  const portLinks = await home.evaluate(() => [...document.querySelectorAll(".v4-port__links a")].map((entry) => entry.getAttribute("href")));
  await scrollTo(home, ".v4-port", "into");
  b.home = await brand(home);
  s.homeFlagship = await home.evaluate(() => [...document.querySelectorAll(".selected-work-grid > *")].map((entry) => entry.querySelector("h3")?.textContent.trim()));
  expect("Home: the AJOOP port links to the Hub and the case study", JSON.stringify(portLinks) === JSON.stringify([HUB, CASE]));
  expect("Home brand: the port carries the Living Hub artwork (lazy, sized, loaded once in view) under the app icon, and its name is set AJOOP", b.homeBefore.images[0].loading === "lazy" && b.home.images.length === 1 && b.home.images[0].natural > 0 && b.home.images[0].width === "1600" && b.home.images[0].height === "900" && b.home.portIcon.file === BRAND.appIcon && b.home.portTitle.transform === "uppercase");
  expect("Home brand: the port's launcher chip carries the mark at the chip's own height", b.home.launcherIcon.file === BRAND.markDark && b.home.launcher.height === 56);
  expect("Home: no horizontal overflow", (await overflow(home)) === 0);
  await home.done();

  /* ---------- every locale: both routes, and the launcher on shared layout ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = {};
    for (const [surface, path] of [["hub", HUB], ["caseStudy", CASE], ["home", "/"]]) {
      const wide = await fresh({ viewport: DESKTOP, theme: "dark", path: localized(locale, path), settle: 700 });
      const narrow = await fresh({ viewport: MOBILE, theme: "dark", path: localized(locale, path), settle: 700 });
      const seen = await brand(wide);
      locales[locale][surface] = { desktop: await overflow(wide), mobile: await overflow(narrow), lang: await wide.evaluate(() => document.documentElement.lang), heading: await wide.evaluate(() => document.querySelector("h1").textContent.trim()) };
      if (surface === "hub") Object.assign(locales[locale], { state: await wide.evaluate(() => document.querySelector("[data-v4-hub-state]").textContent.trim()), links: await wide.evaluate(() => document.querySelector(".v4-hub__how").getAttribute("href")), staticNote: await wide.evaluate(() => document.querySelector(".v4-hub__static").textContent.trim()), mark: seen.hubMark?.file });
      if (surface === "caseStudy") Object.assign(locales[locale], { lockup: seen.entryLockup?.file, launcher: seen.launcherIcon?.file, launcherLabel: seen.launcherText?.text });
      if (surface === "home") Object.assign(locales[locale], { port: seen.portIcon?.file });
      expect(`${locale} ${surface}: served in its locale with no horizontal overflow at 1440 or 390`, locales[locale][surface].desktop === 0 && locales[locale][surface].mobile === 0 && locales[locale][surface].lang.startsWith(locale) && Boolean(locales[locale][surface].heading));
      await wide.done();
      await narrow.done();
    }
    const catalog = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", locale, "common.json"), "utf8"));
    expect(`${locale}: the Hub links to its own locale's case study and carries the same identity`, locales[locale].links === localized(locale, CASE) && locales[locale].mark === BRAND.markDark && locales[locale].lockup === BRAND.wordmark && locales[locale].launcher === BRAND.appIcon && locales[locale].port === BRAND.appIcon);
    expect(`${locale}: the Hub's static line is its catalog's own`, locales[locale].staticNote === catalog["ajoop.hub.loading"]);
  }
  expect("Locales: the static line is translated in each", new Set(LOCALES.map((locale) => locales[locale].staticNote)).size === LOCALES.length);

  /* ---------- the shipped brand files ---------- */
  const assets = [];
  for (const file of BRAND_FILES) {
    const response = await fetch(`${ORIGIN}/assets/${file}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assets.push({ file, status: response.status, type: response.headers.get("content-type"), bytes: bytes.length, webp: bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP" });
  }
  expect("Brand files: every one the pages use is served from the site as WebP", assets.every((asset) => asset.status === 200 && asset.type === "image/webp" && asset.webp));
  expect("Brand files: within budget — icons and marks under 24 KB each, the largest artwork under 130 KB", assets.every((asset) => asset.bytes < (asset.file.includes("living-hub") ? 130 : 24) * 1024));
  const shippedBrand = (await readdir(join(ROOT, "dist-site", "assets"))).filter((file) => file.startsWith("ajoop-")).sort();
  expect("Brand files: the build ships exactly these, and no original PNG from the pack", JSON.stringify(shippedBrand) === JSON.stringify([...BRAND_FILES].sort()));

  /* ---------- measurements + pack ---------- */
  const lcp = await lcpCompare(browser, CASE);
  console.log("[v4:capture] LCP measured");
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-ajoop.css", "css/v4-home.css", "js/v4/runtime.js", "js/ajoop/assistant.js", "js/ajoop/rag-client.js", reactEntry, "ajoop/index.html", "ajoop-case-study/index.html", "index.html"].map(sizeOf));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", frames, 3100);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, baselineOrigin: BASELINE, aiEdge: "stubbed: “down” (503) unless a check says “degraded” (healthy, then every generation fails)", brand: b, brandFiles: assets, hub: h, conversation: c, caseStudy: s, lcpCaseStudy: lcp, locales, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const lcpCell = (cell) => (cell ? `${cell.medianMs} ms on <${cell.element}>${cell.file ? ` (${cell.file})` : ""} · CLS ≤ ${cell.clsMax} · images ${cell.imageKb} KB` : "not measured");
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${frames.length} frames from one continuous session in one tab, in order; the individual frames are in \`motion-frames/\`.
- **\`qa-summary.json\`** — everything measured in this run.
- **\`${PACK}\`** — everything here.

## How AJOOP was run for this pack

AJOOP's public AI edge (\`${EDGE}\`) was **stubbed** for every capture and check, with the mechanism the project already uses for AJOOP UI QA (browser request interception). No model reply was simulated and nothing was scripted into the page: with the edge “down” (503) every answer shown is the engine's own deterministic answer with its real evidence cards; the launcher ↔ Hub check runs with the edge “degraded” so that a generation is really attempted and its memory can be read.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((entry, index) => `${index + 1}. ${entry.label}`).join("\n")}

## Brand, as rendered

- Hub rail and empty field: \`${b.hubIdle.hubMark.file}\` (dark) / \`${b.hubLight.hubMark.file}\` (light); the panel's mascot elements on the Hub and the case study: ${b.hubIdle.hubMascots + b.caseStudy.hubMascots}.
- Hub core: \`${coreImage.chosen}\` chosen at 1440 from the 640/960/1600 set, drawn ${coreImage.box}; opacity ${b.hubIdle.hubCore.opacity} idle → ${b.hubActive.hubCore.opacity} once a question is asked → ${b.hubReset.hubCore.opacity} after Start over. Light theme: a bordered dark panel, opacity ${b.hubLight.hubCore.opacity}.
- Case-study visual: \`${heroImage.chosen}\` at 1440, \`${b.casePhone.images[0].chosen}\` at 390; \`fetchpriority="${heroImage.priority}"\`, not lazy, ${heroImage.width} × ${heroImage.height} declared; lockup \`${b.caseStudy.entryLockup.file}\` in both themes (the visual is a dark surface in both); diagram core \`${b.caseStudy.systemCore.file}\` / \`${b.caseLight.systemCore.file}\`.
- Launcher: \`${b.launcher.launcherIcon.file}\` at ${b.launcher.launcherIcon.width} × ${b.launcher.launcherIcon.height} in a ${b.launcher.launcher.height}px launcher; on Home's chip \`${b.home.launcherIcon.file}\` at ${b.home.launcherIcon.width} × ${b.home.launcherIcon.height}.
- Home port: \`${b.home.images[0].chosen}\` (lazy) under \`${b.home.portIcon.file}\`.
- Casing: the Hub title, the launcher label, the panel title and Home's port name are set in capitals by the stylesheet; their text is still the engine's (“${b.launcher.launcherText.text}”, “${b.launcher.panelTitle.text}”).

| Shipped file | Size |
| --- | --- |
${assets.map((asset) => `| assets/${asset.file} | ${kb(asset.bytes)} |`).join("\n")}

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Engine, unchanged: one real Hub turn went ${h.asked.states.join(" → ")}; final “${h.asked.stateLabel}”, path lit ${h.asked.lit}; evidence ${h.asked.evidence.map((item) => item.title).join(" · ")} — the same ${lastAnswer.cards.length} cards the answer shows.
- One conversation: launcher ${c.launcher.length} messages → Hub ${c.hubArrived.transcript.length} (identical) → after one more question ${c.hubContinued.length} → launcher on /works/ ${c.backInLauncher.length} (identical). Memory sent with the Hub question: ${c.memory ? c.memory.join(" | ") : "none"}.
- Session copy: key \`${SESSION_KEY}\`, ${h.asked.session.messages} messages / ${h.asked.session.bytes} bytes after one turn, fields ${h.asked.session.keys}; localStorage hits ${h.asked.elsewhere.local}, cookie ${h.asked.elsewhere.cookie}; cleared by Start over (${h.reset.session === null}).
- Public/private negative control: ${h.asked.connected} connected-source or action-preview elements, ${hubPage.foreignRequests.length} requests outside the site, its fonts and the public edge.
- Without JavaScript: Hub notice ${h.noJs.notice} with ${h.noJs.noticeLinks} links, composer ${h.noJs.composer}, static line “${h.noJs.staticText}”; case study explains ${s.noJs.panelsShown} parts.
- Case study: ${s.initial.nodes.length} public parts, ${s.initial.edges} wires, private track wires ${s.initial.ownerEdges}; Local model bridge lights ${s.hover.related}; the core is selectable: ${s.core.button}.
- Reduced motion: Hub ${h.reducedMotion.motion.running} running animations, core transition ${b.hubStill.hubCoreMotion}; case study ${s.reducedMotion.motion.running}.
- At rest: ${h.atRest.running} time-driven animations running on the Hub and ${s.atRest.running} on the case study; no canvas.
- Layout shift over the whole session: Hub ${h.shift}, case study ${s.shift} (1440 × 900).
- Locales (EN/TR/DE/ES/FR; Hub, case study and Home at 1440 and 390): overflow ${LOCALES.map((locale) => ["hub", "caseStudy", "home"].map((surface) => `${locales[locale][surface].desktop}/${locales[locale][surface].mobile}`).join("/")).join(" · ")}; launcher label ${LOCALES.map((locale) => locales[locale].launcherLabel).join(" · ")}.

## Case-study LCP (headless Chromium, ${BASELINE ? "E04 and E04.1 measured in turn, " : ""}5 cold loads each, median)

| Viewport | Conditions | ${BASELINE ? "E04 (before) | " : ""}E04.1 (after) |
| --- | --- | ${BASELINE ? "--- | " : ""}--- |
${lcp.map((row) => `| ${row.viewport} | ${row.conditions} | ${BASELINE ? `${lcpCell(row.before)} | ` : ""}${lcpCell(row.after)} |`).join("\n")}

## Sizes

| Asset | Raw | Gzip |
| --- | --- | --- |
${sizes.map((size) => `| ${size.file} | ${kb(size.raw)} | ${kb(size.gzip)} |`).join("\n")}
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
