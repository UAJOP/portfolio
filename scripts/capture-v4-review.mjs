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
 *               whose AI assistance was attempted and failed. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-e04-ajoop-case-study-hub";
const PACK = "V4-E04-review-pack.zip";
const TITLE = "V4-E04 · AJOOP Case Study + Living AJOOP Hub";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
const FRAMES = join(OUTPUT, "motion-frames");
/* Its own port: 4174/4175 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
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

/* In contact-sheet order. `steps` run in order: ["click", selector],
 * ["hover", selector], ["focus", selector], ["top", selector] (scroll it just
 * under the header), ["into", selector] (centre it), ["ask", text] (type into
 * the composer, send, wait for the turn to settle), ["goto", path]. */
const shots = [
  { name: "01-hub-dark-idle.png", label: "AJOOP Hub · dark · idle", viewport: DESKTOP, theme: "dark", path: HUB },
  { name: "02-hub-conversation-active.png", label: "Hub · conversation in progress (two turns)", viewport: DESKTOP, theme: "dark", path: HUB, steps: [["ask", FOLLOW_UP], ["ask", QUESTION], ["top", ".v4-hub"]] },
  { name: "03-hub-grounded-evidence.png", label: "Hub · grounded answer, its evidence in the context surface", viewport: DESKTOP, theme: "dark", path: HUB, steps: [["ask", QUESTION], ["top", ".v4-hub"], ["hover", ".v4-hub__evidence li:first-child .v4-node"]] },
  { name: "04-hub-fallback.png", label: "Hub · AI assistance attempted and failed (edge stubbed “degraded”)", viewport: DESKTOP, theme: "dark", path: HUB, edge: "degraded", steps: [["ask", QUESTION], ["top", ".v4-hub"]] },
  { name: "05-hub-light.png", label: "Hub · light · grounded answer", viewport: DESKTOP, theme: "light", path: HUB, steps: [["ask", QUESTION], ["top", ".v4-hub"]] },
  { name: "06-hub-mobile.png", label: "Hub · mobile · conversation first", viewport: MOBILE, theme: "dark", path: HUB, steps: [["ask", QUESTION], ["top", ".v4-hub__field"]] },
  { name: "07-launcher-conversation.png", label: "Launcher · the conversation before the Hub", viewport: DESKTOP, theme: "dark", path: "/about/", steps: [["click", TOGGLE], ["ask", QUESTION]] },
  { name: "08-same-conversation-in-hub.png", label: "Hub · the same conversation, continued after the page change", viewport: DESKTOP, theme: "dark", path: "/about/", steps: [["click", TOGGLE], ["ask", QUESTION], ["goto", HUB], ["top", ".v4-hub"]] },
  { name: "09-case-study-hero.png", label: "AJOOP case study · hero and the entry into the live system", viewport: DESKTOP, theme: "dark", path: CASE },
  { name: "10-case-study-architecture.png", label: "Case study · the public answer path", viewport: DESKTOP, theme: "dark", path: CASE, steps: [["into", ".v4-ajoop-sys"]] },
  { name: "11-architecture-node-active.png", label: "Case study · Local model bridge active", viewport: DESKTOP, theme: "dark", path: CASE, steps: [["into", ".v4-ajoop-sys"], ["hover", node("bridge")]] },
  { name: "12-public-private-boundary.png", label: "Case study · the private track, outside the boundary and wired to nothing", viewport: DESKTOP, theme: "dark", path: CASE, steps: [["into", ".v4-ajoop-sys"], ["click", node("owner")]] },
  { name: "13-case-study-hub-cta.png", label: "Case study · the handoff to the Hub", viewport: DESKTOP, theme: "dark", path: CASE, steps: [["into", ".v4-ajoop-live"], ["hover", ".v4-ajoop-live .btn.primary"]] },
  { name: "14-case-study-light.png", label: "Case study · light · architecture", viewport: DESKTOP, theme: "light", path: CASE, steps: [["into", ".v4-ajoop-sys"], ["click", node("planner")]] },
  { name: "15-case-study-mobile.png", label: "Case study · mobile · the path as a list", viewport: MOBILE, theme: "dark", path: CASE, steps: [["top", ".v4-ajoop-sys__stage"]] },
  { name: "16-reduced-motion.png", label: "Hub · reduced motion · grounded answer", viewport: DESKTOP, theme: "dark", path: HUB, reducedMotion: true, steps: [["ask", QUESTION], ["top", ".v4-hub"]] },
  { name: "17-no-js-hub.png", label: "Hub · JavaScript disabled (identity, scope and a static notice)", viewport: DESKTOP, theme: "dark", path: HUB, noJs: true },
  { name: "18-no-js-case-study.png", label: "Case study · JavaScript disabled (every part explained)", viewport: DESKTOP, theme: "dark", path: CASE, noJs: true, steps: [["top", ".v4-ajoop-sys__stage"]] },
  { name: "19-hub-mobile-context.png", label: "Hub · mobile · this turn and its evidence, stacked after the composer", viewport: MOBILE, theme: "dark", path: HUB, steps: [["ask", QUESTION], ["top", ".v4-hub__context"]] },
  { name: "20-hub-composing.png", label: "Hub · composing (the composer has focus)", viewport: DESKTOP, theme: "dark", path: HUB, steps: [["top", ".v4-hub"], ["focus", INPUT]] },
  { name: "21-hub-turkish.png", label: "Hub · Turkish route", viewport: DESKTOP, theme: "dark", path: localized("tr", HUB), steps: [["ask", "en iyi projeler"], ["top", ".v4-hub"]] },
  { name: "22-case-study-mobile-hero.png", label: "Case study · mobile hero", viewport: MOBILE, theme: "dark", path: CASE },
  { name: "23-home-ajoop-port.png", label: "Home · AJOOP flagship port, linked to the Hub and the case study", viewport: DESKTOP, theme: "dark", path: "/", steps: [["into", ".v4-port"]] },
  { name: "24-privacy-policy.png", label: "Privacy Policy · the updated session-storage paragraph", viewport: DESKTOP, theme: "dark", path: "/privacy/", steps: [["into", "[data-v4-shot-privacy]"]] },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, touch = false, edge = "down", path = "/", settle = 2200 }, problems) {
  const page = await browser.newPage();
  page.edgeRequests = [];
  page.foreignRequests = [];
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    /* The stubbed edge is unreachable by design; only its own network messages are expected. */
    if (message.text().includes(EDGE) || String(message.location()?.url || "").startsWith(EDGE)) return;
    problems.push(`${path} ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
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
    if (!url.startsWith(ORIGIN) && !url.startsWith("data:") && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) page.foreignRequests.push(url);
    request.continue().catch(() => {});
  });
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.evaluateOnNewDocument((nextTheme) => localStorage.setItem("kaanbalci-site-theme", nextTheme), theme);
  /* React reports a hydration mismatch as an event, not on the console. */
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
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
    note: shown(".v4-hub__note").map((entry) => entry.textContent.trim()).join(" | "),
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

async function sheet(browser, file, title, note, panels, width) {
  const figures = panels.map((panel, index) => `<figure style="width:${panel.width}px"><figcaption><b>${String(index + 1).padStart(2, "0")}</b>${panel.label}<small>${panel.file.split(/[\\/]/).pop()}</small></figcaption><img src="${pathToFileURL(panel.file).href}" width="${panel.width}"></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 48px; background: #12151b; color: #f3f6fb; font: 500 22px/1.3 "Segoe UI", Arial, sans-serif; }
    h1 { margin: 0 0 8px; font-size: 44px; } p { margin: 0 0 40px; color: #aab3bf; }
    main { display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
    figure { margin: 0; } img { display: block; height: auto; border: 1px solid #323a47; }
    figcaption { display: flex; gap: 14px; align-items: baseline; padding: 0 0 12px; }
    figcaption b { padding: 2px 10px; border-radius: 4px; background: #4fa8ff; color: #050912; }
    figcaption small { margin-left: auto; color: #7f8a98; font-size: 15px; }
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
    if (shot.name.startsWith("24-")) await page.evaluate(() => { const hit = [...document.querySelectorAll("main p, main li")].find((entry) => /session storage/i.test(entry.textContent)); (hit || document.querySelector("main")).setAttribute("data-v4-shot-privacy", ""); });
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
    const file = join(FRAMES, `${String(frames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`);
    await film.screenshot({ path: file, type: "png" });
    frames.push({ file, label, width: 960 });
  };
  const glide = async (selector, dx = 0, dy = 0) => {
    const point = await film.evaluate((target) => {
      const rect = document.querySelector(target).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
    await film.mouse.move(point.x + dx, point.y + dy, { steps: 14 });
  };
  const jump = (selector, block = "center", offset = 0) => film.evaluate((target, where, by) => { document.querySelector(target).scrollIntoView({ block: where, behavior: "instant" }); if (by) window.scrollBy({ top: by, behavior: "instant" }); }, selector, block, offset);
  await frame("Launcher idle on About");
  await film.click(TOGGLE); await wait(220); await frame("Launcher opens");
  await wait(900); await film.type(INPUT, QUESTION); await wait(250); await frame("Prompt typed: the engine reports listening");
  await film.keyboard.press("Enter"); await wait(140); await frame("Prompt submitted: the turn opens in its first real state");
  await settled(film); await wait(250); await frame("Answer arrives: evidence cards, provenance, follow-ups");
  await wait(1300); await glide(".chatbot-hub-link"); await wait(500); await frame("The panel's way into the Hub");
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle2" }), film.click(".chatbot-hub-link")]);
  await film.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"), { timeout: 20000 });
  await wait(1500); await frame("AJOOP Hub opens: the same conversation is already here");
  await jump(".v4-hub", "start", -110); await wait(900); await frame("Hub: the restored answer and its evidence in the context surface");
  await film.click(INPUT); await wait(600); await frame("Hub: composing, the state the engine reports while the composer has focus");
  await film.type(INPUT, FOLLOW_UP); await film.keyboard.press("Enter"); await wait(150); await frame("Hub: turn in flight, the path lit as far as the lookup");
  await settled(film); await wait(300); await frame("Hub: the turn settles");
  await wait(1200); await film.type(INPUT, QUESTION); await film.keyboard.press("Enter"); await settled(film); await wait(450); await frame("Hub: grounded answer, evidence arriving in the context surface");
  await wait(900); await glide(".v4-hub__evidence li:nth-child(2) .v4-node"); await wait(600); await frame("Hub: evidence interaction, a cited record under the pointer");
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle2" }), film.click(".v4-hub__how")]);
  await wait(1700); await frame("How AJOOP works: the case study");
  await jump(".v4-ajoop-sys"); await wait(520); await frame("Architecture enters: the public path drawing once");
  await wait(2300); await frame("Architecture: at rest");
  await glide(node("state")); await wait(320); await frame("Node activation: Conversation state, pulses leaving along its wires");
  await wait(800); await glide(node("planner")); await wait(500); await frame("Along the public path: Deterministic planner");
  await glide(node("evidence")); await wait(500); await frame("Along the public path: Portfolio evidence, read by both answer sources");
  await glide(node("answer")); await wait(500); await frame("Along the public path: Grounded response");
  await glide(node("owner")); await film.mouse.down(); await film.mouse.up(); await wait(800); await frame("The private track: outside the boundary, wired to nothing");
  await film.keyboard.press("Escape"); await film.mouse.move(3, 300);
  await jump(".v4-ajoop-live"); await wait(1500); await glide(".v4-ajoop-live .btn.primary"); await wait(700); await frame("CTA: Try AJOOP under the pointer");
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle2" }), film.click(".v4-ajoop-live .btn.primary")]);
  await film.waitForFunction(() => document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length >= 3, { timeout: 20000 });
  await wait(1500); await jump(".v4-hub", "start", -110); await wait(900); await frame("Handoff: back in the Hub, the conversation still intact");
  await film.done();

  /* ---------- Hub smoke ---------- */
  const h = {};
  const hubPage = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB });
  h.initial = await hub(hubPage);
  expect("Hub: a page surface, not a dialog — no launcher, no modal, nothing inert, composer present", h.initial.present && h.initial.launchers === 0 && h.initial.dialogs === 0 && h.initial.inert === 0 && h.initial.fieldShown === 1 && h.initial.composer === 1 && h.initial.staticNote === 0);
  expect("Hub: opens idle with the greeting, its scope and no stored conversation", h.initial.live === "idle" && h.initial.messages === 1 && h.initial.scope === 5 && h.initial.session === null && h.initial.evidence.length === 0);
  expect("Hub: links to the case study", (await fetch(`${ORIGIN}${h.initial.how}`)).status === 200 && h.initial.how === CASE);
  await hubPage.focus(INPUT); await wait(400);
  h.composing = await hub(hubPage);
  await hubPage.evaluate(() => document.activeElement.blur()); await wait(400);
  h.blurred = await hub(hubPage);
  expect("Hub: composing is the engine's listening state, and ends with it", h.composing.live === "composing" && h.composing.lit === "visitor" && h.blurred.live === "idle");
  /* Every live state the Hub passes through during one real turn. */
  await hubPage.evaluate(() => {
    const root = document.querySelector("[data-v4-hub]");
    window.__states = [root.getAttribute("data-v4-live")];
    new MutationObserver(() => { const next = root.getAttribute("data-v4-live"); if (window.__states.at(-1) !== next) window.__states.push(next); }).observe(root, { attributes: true, attributeFilter: ["data-v4-live"] });
  });
  await ask(hubPage, QUESTION);
  await hubPage.evaluate(() => document.activeElement.blur()); await wait(300);
  h.asked = { ...(await hub(hubPage)), states: await hubPage.evaluate(() => window.__states), transcript: await transcript(hubPage) };
  const lastAnswer = h.asked.transcript.at(-1);
  expect("Hub: a turn passes through real states — composing, retrieving, then a grounded answer", h.asked.states.includes("composing") && h.asked.states.includes("retrieving") && h.asked.live === "grounded" && h.asked.states.indexOf("retrieving") < h.asked.states.lastIndexOf("grounded"));
  expect("Hub: the context surface lists exactly the evidence the answer itself shows", lastAnswer.cards.length > 0 && JSON.stringify(h.asked.evidence.map((item) => item.title)) === JSON.stringify(lastAnswer.cards) && h.asked.lit === "ajoop,evidence,answer" && Boolean(h.asked.provenance));
  const evidenceLinks = await Promise.all(h.asked.evidence.filter((item) => item.href && !/^https?:/.test(item.href)).map(async (item) => (await fetch(new URL(item.href, `${ORIGIN}${HUB}`))).status));
  expect("Hub: every evidence link is a real page", evidenceLinks.length > 0 && evidenceLinks.every((status) => status === 200));
  expect("Hub: the bounded copy lives in this tab's session storage only", h.asked.session?.version === 1 && h.asked.session.language === "en" && h.asked.session.messages === 2 && h.asked.session.bytes < 120000 && h.asked.elsewhere.local === 0 && !h.asked.elsewhere.cookie);
  expect("Public/private boundary: no connected source, no action preview, no request beyond the site, its fonts and the public edge", h.asked.connected === 0 && hubPage.foreignRequests.length === 0);
  h.payload = await hubPage.evaluate(() => [...document.querySelectorAll('script[type="application/json"]')].map((entry) => entry.textContent).join(" "));
  expect("Public/private boundary: the Hub's payload names no owner connector, token or secret", !/gmail\.|google calendar|\.readonly|oauth|bearer|api[_-]?key|client_secret|access_token|refresh_token|system prompt/i.test(h.payload.replaceAll("@gmail.com", "")));
  h.payload = h.payload.length;
  await hubPage.keyboard.press("Escape"); await wait(400);
  h.escape = await hub(hubPage);
  expect("Hub keyboard: Escape closes nothing here", h.escape.fieldShown === 1 && h.escape.composer === 1 && h.escape.messages === h.asked.messages);
  await hubPage.focus(INPUT); await hubPage.keyboard.type(FOLLOW_UP); await hubPage.keyboard.press("Enter"); await settled(hubPage); await wait(700);
  h.keyboard = await hub(hubPage);
  expect("Hub keyboard: the composer sends on Enter and the copy grows with the conversation", h.keyboard.messages === 5 && h.keyboard.session.messages === 4);
  await wait(2600);
  h.atRest = await motionState(hubPage);
  expect("Hub: nothing loops and the page comes to rest", h.atRest.endless === 0 && h.atRest.running === 0);
  const session = await hubPage.createCDPSession();
  await session.send("Performance.enable");
  const sample = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const before = await sample();
  await wait(5000);
  const after = await sample();
  const idle = Object.fromEntries(["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((name) => [name, Math.round((after[name] - before[name]) * 1000)]));
  /* Start over ends the conversation and its stored copy. */
  if (!(await hubPage.$('[data-chatbot-action-kind="reset"]'))) await ask(hubPage, QUESTION);
  await hubPage.click('[data-chatbot-action-kind="reset"]'); await wait(700);
  h.reset = await hub(hubPage);
  expect("Hub: Start over clears the conversation, its stored copy and the context surface", h.reset.messages === 1 && h.reset.session === null && h.reset.live !== "grounded" && h.reset.evidence.length === 0);
  expect("Hub desktop: no horizontal overflow", (await overflow(hubPage)) === 0);
  await hubPage.done();

  /* The 15-minute bound, enforced on read. */
  const ttl = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB });
  await ask(ttl, QUESTION);
  await ttl.evaluate((key) => { const record = JSON.parse(sessionStorage.getItem(key)); record.messages.forEach((entry) => { entry.at -= 15 * 60 * 1000 + 1000; }); sessionStorage.setItem(key, JSON.stringify(record)); }, SESSION_KEY);
  await visit(ttl, HUB); await wait(800);
  h.expired = await hub(ttl);
  expect("Session copy: messages older than 15 minutes are not resumed and are removed", h.expired.messages === 1 && h.expired.session === null && h.expired.live === "idle");
  await ttl.evaluate((key) => sessionStorage.setItem(key, '{"version":1,"language":"en","messages":[{"at":' + Date.now() + ',"spec":{"type":"bot","text":"<img src=x onerror=window.__pwned=1>","cards":"nope","links":7}}]}'), SESSION_KEY);
  await visit(ttl, HUB); await wait(800);
  h.tampered = { ...(await hub(ttl)), pwned: await ttl.evaluate(() => Boolean(window.__pwned)), images: await ttl.evaluate(() => document.querySelectorAll("[data-chatbot-messages] img").length) };
  expect("Session copy: a tampered record is rendered as text, never as markup", !h.tampered.pwned && h.tampered.images === 0);
  await ttl.done();

  /* A turn whose AI assistance was attempted and failed. */
  const degraded = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB, edge: "degraded" });
  await ask(degraded, QUESTION);
  await degraded.evaluate(() => document.activeElement.blur()); await wait(300);
  h.fallback = { ...(await hub(degraded)), transcript: await transcript(degraded), generations: degraded.edgeRequests.filter((body) => !body.includes('"mode":"health"')).length };
  expect("Hub fallback: assistance attempted and failed is stated, and the deterministic answer still stands", h.fallback.live === "fallback" && h.fallback.transcript.at(-1).status === "assist-unavailable" && h.fallback.transcript.at(-1).cards.length > 0 && Boolean(h.fallback.note) && h.fallback.generations >= 1);
  await degraded.done();

  /* ---------- launcher ↔ Hub: one conversation ---------- */
  const c = {};
  const tab = await fresh({ viewport: DESKTOP, theme: "dark", path: "/about/", edge: "degraded" });
  c.launcherOffered = await tab.evaluate(() => ({ launcher: [...document.querySelectorAll(".chatbot-launcher")].filter((entry) => entry.getClientRects().length).length, hubLink: document.querySelector(".chatbot-hub-link")?.getAttribute("href") }));
  await tab.click(TOGGLE); await wait(600);
  await ask(tab, QUESTION);
  c.launcher = await transcript(tab);
  await Promise.all([tab.waitForNavigation({ waitUntil: "networkidle2" }), tab.click(".chatbot-hub-link")]);
  await tab.waitForFunction(() => document.querySelector("[data-chatbot-messages] .chatbot-message.user"), { timeout: 20000 }); await wait(900);
  c.hubArrived = { path: new URL(tab.url()).pathname, transcript: await transcript(tab), state: await hub(tab) };
  const conversation = (messages) => JSON.stringify(messages.slice(1));
  expect("Launcher → Hub: the launcher stays on ordinary pages and links to the Hub", c.launcherOffered.launcher === 1 && c.launcherOffered.hubLink === HUB && c.hubArrived.path === HUB);
  expect("Launcher → Hub: the Hub opens on the same conversation, message for message, with its evidence and follow-ups", c.launcher.length === 3 && conversation(c.hubArrived.transcript) === conversation(c.launcher) && c.hubArrived.state.evidence.length === c.launcher.at(-1).cards.length && c.hubArrived.state.actions.length > 0);
  const sentBefore = tab.edgeRequests.length;
  await ask(tab, FOLLOW_UP);
  c.hubContinued = await transcript(tab);
  const generation = tab.edgeRequests.slice(sentBefore).map((body) => { try { return JSON.parse(body); } catch { return null; } }).find((body) => body && body.mode === "rag");
  c.memory = generation ? generation.history.map((entry) => `${entry.role}: ${entry.content.slice(0, 40)}`) : null;
  expect("Launcher → Hub: the next question reaches the engine with the launcher exchange as its memory", Boolean(generation) && generation.history.length === 2 && generation.history[0].role === "user" && generation.history[0].content === QUESTION && generation.history[1].content === c.launcher.at(-1).text.replace(/\s+/g, " ").slice(0, 700));
  await visit(tab, "/works/"); await wait(700);
  await tab.click(TOGGLE); await wait(700);
  c.backInLauncher = await transcript(tab);
  expect("Hub → launcher: reopening the launcher on another page continues the same conversation", c.hubContinued.length === 5 && conversation(c.backInLauncher) === conversation(c.hubContinued));
  await visit(tab, localized("tr", HUB)); await wait(900);
  c.otherLocale = await hub(tab);
  expect("Locale: a site-language change starts a new conversation and clears the stored copy", c.otherLocale.messages === 1 && c.otherLocale.session === null);
  await visit(tab, HUB); await wait(700);
  c.afterLocale = await hub(tab);
  expect("Locale: nothing resumes after the language change", c.afterLocale.messages === 1);
  await tab.done();

  /* Touch + phone. */
  const phone = await fresh({ viewport: MOBILE, theme: "dark", path: HUB, touch: true });
  await phone.evaluate(() => document.querySelector(".v4-hub__field").scrollIntoView({ block: "start", behavior: "instant" })); await wait(500);
  await ask(phone, QUESTION, { tap: true });
  h.phone = { ...(await hub(phone)), reach: await phone.evaluate(() => {
    document.querySelector("[data-chatbot-send]").scrollIntoView({ block: "center", behavior: "instant" });
    return ["[data-chatbot-send]", "[data-chatbot-input]"].map((selector) => { const rect = document.querySelector(selector).getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return Boolean(hit && hit.closest(selector)); });
  }) };
  expect("Hub touch: a question can be asked on a phone and no fixed control covers the composer or send", h.phone.live === "grounded" && h.phone.launchers === 0 && h.phone.reach.every(Boolean));
  expect("Hub mobile: no horizontal overflow", (await overflow(phone)) === 0);
  await phone.done();

  const hubPlain = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB, noJs: true, settle: 300 });
  h.noJs = await hubPlain.evaluate(() => {
    const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length).length;
    return { heading: document.querySelector("h1").textContent.trim(), notice: shown(".v4-hub__noscript"), noticeLinks: document.querySelectorAll(".v4-hub__noscript a[href]").length, identity: shown(".v4-hub__identity"), scope: shown(".v4-hub__scope .v4-ports li"), composer: shown("[data-chatbot-input]"), staticNote: shown(".v4-hub__static"), how: shown(".v4-hub__how") };
  });
  expect("Hub without JavaScript: identity, scope, a plain notice and links — no dead composer", Boolean(h.noJs.heading) && h.noJs.notice === 1 && h.noJs.noticeLinks === 5 && h.noJs.identity === 1 && h.noJs.scope === 5 && h.noJs.composer === 0 && h.noJs.staticNote === 1 && h.noJs.how === 1);
  await hubPlain.done();
  const hubStill = await fresh({ viewport: DESKTOP, theme: "dark", path: HUB, reducedMotion: true });
  await ask(hubStill, QUESTION); await hubStill.evaluate(() => document.activeElement.blur()); await wait(1500);
  h.reducedMotion = { ...(await hub(hubStill)), motion: await motionState(hubStill) };
  expect("Hub reduced motion: every state is still stated, nothing animates", h.reducedMotion.live === "grounded" && Boolean(h.reducedMotion.stateLabel) && h.reducedMotion.motion.running === 0);
  await hubStill.done();

  /* ---------- case-study smoke ---------- */
  const s = {};
  const study = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE });
  s.initial = await caseStudy(study);
  const canonicalStack = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "ajoop-master-knowledge.json"), "utf8")).projects.flagship["Ajoop Portfolio Copilot"].architecture_public_safe;
  expect("Case study: seven sections, each reachable from the tracker", s.initial.heading === "AJOOP" && s.initial.tracker.length === 7 && s.initial.trackerTargets);
  expect("Case study: the stack is the portfolio's own public-safe record, and no figures are claimed", JSON.stringify(s.initial.stack) === JSON.stringify(canonicalStack) && s.initial.proofFigures === 0);
  expect("Case study: seven public parts on seven wires; the private track has no wire at all", s.initial.nodes.length === 7 && s.initial.edges === 7 && s.initial.ownerLinks === "" && s.initial.ownerEdges === 0 && s.initial.boundary === 1 && s.initial.canvases === 0);
  expect("Case study: every way into the Hub is an ordinary link to it", s.initial.entryLinks.length === 5 && s.initial.entryLinks.every((href) => href === HUB) && s.initial.cta.length === 2 && s.initial.cta.every((href) => href === HUB));
  await scrollTo(study, ".v4-ajoop-sys", "into");
  await study.hover(node("bridge")); await wait(700);
  s.hover = await caseStudy(study);
  expect("Case study: a part in hand lights what it is wired to and explains itself", s.hover.activeNode === "bridge" && s.hover.related === "state,evidence" && s.hover.litEdges === 2 && s.hover.panel === "bridge");
  await study.focus(node("owner")); await study.keyboard.press("Enter"); await study.mouse.move(3, 300); await wait(600);
  s.owner = await caseStudy(study);
  expect("Case study keyboard: the private track can be read, and lights nothing in the public path", s.owner.pressed === "owner" && s.owner.panel === "owner" && s.owner.litEdges === 0 && s.owner.related === "");
  await study.keyboard.press("Escape"); await study.evaluate(() => document.activeElement.blur()); await wait(500);
  s.released = await caseStudy(study);
  expect("Case study keyboard: Escape releases the pin", s.released.pressed === "" && !s.released.active && s.released.panel === "");
  await wait(2600);
  s.atRest = await motionState(study);
  expect("Case study: nothing loops and the page comes to rest", s.atRest.endless === 0 && s.atRest.running === 0);
  const lcp = await study.evaluate(() => new Promise((done) => {
    new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      done({ ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null });
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(null), 1500);
  }));
  expect("Case study desktop: no horizontal overflow", (await overflow(study)) === 0);
  await study.done();
  const studyPhone = await fresh({ viewport: MOBILE, theme: "dark", path: CASE, touch: true });
  s.phone = await caseStudy(studyPhone);
  expect("Case study phone: the path is a list of its eight parts, not a squeezed diagram", s.phone.fieldShown === 0 && s.phone.panelsShown === 8);
  expect("Case study mobile: no horizontal overflow", (await overflow(studyPhone)) === 0);
  await studyPhone.done();
  const studyPlain = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE, noJs: true, settle: 300 });
  s.noJs = await caseStudy(studyPlain);
  expect("Case study without JavaScript: the path is drawn and all eight parts are explained", s.noJs.fieldShown === 1 && s.noJs.panelsShown === 8 && !s.noJs.waiting && s.noJs.cta.length === 2);
  await studyPlain.done();
  const studyStill = await fresh({ viewport: DESKTOP, theme: "dark", path: CASE, reducedMotion: true });
  await studyStill.click(node("planner")); await studyStill.mouse.move(3, 300); await wait(400);
  s.reducedMotion = { ...(await caseStudy(studyStill)), motion: await motionState(studyStill) };
  expect("Case study reduced motion: a part still pins, nothing animates", s.reducedMotion.pressed === "planner" && s.reducedMotion.motion.running === 0);
  await studyStill.done();

  /* Home's flagship port links to both. */
  const home = await fresh({ viewport: DESKTOP, theme: "dark", path: "/", settle: 900 });
  const portLinks = await home.evaluate(() => [...document.querySelectorAll(".v4-port__links a")].map((entry) => entry.getAttribute("href")));
  expect("Home: the AJOOP port links to the Hub and the case study", JSON.stringify(portLinks) === JSON.stringify([HUB, CASE]));
  await home.done();

  /* ---------- both routes in every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = {};
    for (const [surface, path] of [["hub", HUB], ["caseStudy", CASE]]) {
      const wide = await fresh({ viewport: DESKTOP, theme: "dark", path: localized(locale, path), settle: 700 });
      const narrow = await fresh({ viewport: MOBILE, theme: "dark", path: localized(locale, path), settle: 700 });
      locales[locale][surface] = { desktop: await overflow(wide), mobile: await overflow(narrow), lang: await wide.evaluate(() => document.documentElement.lang), heading: await wide.evaluate(() => document.querySelector("h1").textContent.trim()) };
      if (surface === "hub") locales[locale].state = await wide.evaluate(() => document.querySelector("[data-v4-hub-state]").textContent.trim());
      if (surface === "hub") locales[locale].links = await wide.evaluate(() => document.querySelector(".v4-hub__how").getAttribute("href"));
      if (surface === "caseStudy") locales[locale].nodes = await wide.evaluate(() => [...document.querySelectorAll(".v4-ajoop-sys__node span")].map((entry) => entry.textContent.trim()));
      expect(`${locale} ${surface}: served in its locale with no horizontal overflow at 1440 or 390`, locales[locale][surface].desktop === 0 && locales[locale][surface].mobile === 0 && locales[locale][surface].lang.startsWith(locale) && Boolean(locales[locale][surface].heading));
      await wide.done();
      await narrow.done();
    }
    expect(`${locale}: the Hub links to its own locale's case study`, locales[locale].links === localized(locale, CASE));
  }

  /* ---------- measurements + pack ---------- */
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-ajoop.css", "js/v4/runtime.js", "js/ajoop/assistant.js", "js/ajoop/rag-client.js", reactEntry, "ajoop/index.html", "ajoop-case-study/index.html"].map(sizeOf));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", frames, 4120);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, aiEdge: "stubbed: “down” (503) unless a check says “degraded” (healthy, then every generation fails)", hub: h, conversation: c, caseStudy: s, idleFiveSecondsMs: idle, lcp, locales, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${frames.length} frames from one continuous session in one tab, in order; the individual frames are in \`motion-frames/\`.
- **\`${PACK}\`** — everything here.

## How AJOOP was run for this pack

AJOOP's public AI edge (\`${EDGE}\`) was **stubbed** for every capture and check, with the mechanism the project already uses for AJOOP UI QA (browser request interception, as in \`scripts/qa-m3-ajoop-command-palette.mjs\`). No model reply was simulated and nothing was scripted into the page:

- **“down”** (default): the edge answers 503, exactly as when the local bridge is switched off. Every answer shown is the engine's own deterministic answer with its real evidence cards, and the service line says so.
- **“degraded”** (panel 04 and the launcher ↔ Hub checks): the edge reports healthy and then fails each generation, so the turn is one whose AI assistance was really attempted and failed.

The AI-assisted (“responding / preparing”) states are therefore not pictured: they only occur when the local model actually answers.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((entry, index) => `${index + 1}. ${entry.label}`).join("\n")}

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Hub states seen during one real turn: ${h.asked.states.join(" → ")}; final “${h.asked.stateLabel}”, path lit ${h.asked.lit}.
- Evidence: the context surface listed ${h.asked.evidence.map((item) => item.title).join(" · ")} — the same ${lastAnswer.cards.length} cards the answer shows; provenance “${h.asked.provenance}”.
- Fallback (edge “degraded”): state “${h.fallback.stateLabel}”, answer status ${h.fallback.transcript.at(-1).status}, ${h.fallback.transcript.at(-1).cards.length} evidence cards kept.
- One conversation: launcher ${c.launcher.length} messages → Hub ${c.hubArrived.transcript.length} (identical) → after one more question ${c.hubContinued.length} → launcher on /works/ ${c.backInLauncher.length} (identical). Memory sent with the Hub question: ${c.memory ? c.memory.join(" | ") : "none"}.
- Session copy: key \`${SESSION_KEY}\`, ${h.asked.session.messages} messages / ${h.asked.session.bytes} bytes after one turn, fields ${h.asked.session.keys}; localStorage hits ${h.asked.elsewhere.local}, cookie ${h.asked.elsewhere.cookie}; expired copy resumed ${h.expired.messages - 1} messages; cleared by Start over (${h.reset.session === null}) and by a language change (${c.otherLocale.session === null}).
- Public/private negative control: ${h.asked.connected} connected-source or action-preview elements, ${hubPage.foreignRequests.length} requests outside the site, its fonts and the public edge.
- Without JavaScript: Hub notice ${h.noJs.notice} with ${h.noJs.noticeLinks} links, composer ${h.noJs.composer}; case study explains ${s.noJs.panelsShown} parts.
- Case study: tracker ${s.initial.tracker.join(" · ")}; ${s.initial.nodes.length} public parts, ${s.initial.edges} wires, private track wires ${s.initial.ownerEdges}; Local model bridge lights ${s.hover.related}.
- Locales (EN/TR/DE/ES/FR; Hub and case study at 1440 and 390): overflow ${LOCALES.map((locale) => `${locales[locale].hub.desktop}/${locales[locale].hub.mobile}/${locales[locale].caseStudy.desktop}/${locales[locale].caseStudy.mobile}`).join(" · ")}; idle state label ${LOCALES.map((locale) => locales[locale].state).join(" · ")}.

## Performance (headless Chromium, 1440×900)

- Hub, five idle seconds after a conversation: main-thread tasks ${idle.TaskDuration} ms, style recalculation ${idle.RecalcStyleDuration} ms, layout ${idle.LayoutDuration} ms, script ${idle.ScriptDuration} ms.
- LCP on the case study (local, unthrottled): ${lcp ? `${lcp.ms} ms on <${lcp.element}>` : "not reported"}.
- No canvas, no animation loop: at rest ${h.atRest.running} time-driven animations running on the Hub and ${s.atRest.running} on the case study.

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
