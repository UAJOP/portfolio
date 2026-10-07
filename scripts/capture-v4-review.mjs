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
 * focused QA. PHASE/PACK below are the only phase-specific names; the shot
 * list and the motion script are data. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-e01-1-impact-refinement";
const PACK = "V4-E01-1-review-pack.zip";
const TITLE = "V4-E01.1 · Connected Systems impact refinement";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
const FRAMES = join(OUTPUT, "motion-frames");
/* Its own port: 4174/4175 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_SCRIPT = join(ROOT, "scripts", "v4-preview-server.mjs");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const homePath = (locale) => (locale === "en" ? "/" : `/${locale}/`);
/* The hero's signal is one 13s journey. Moving captures park it here. */
const SIGNAL_MOMENT_MS = 8200;

/* In contact-sheet order. */
const shots = [
  { name: "01-home-dark-desktop.png", label: "Home · dark desktop", viewport: DESKTOP, theme: "dark" },
  { name: "02-home-light-desktop.png", label: "Home · light desktop", viewport: DESKTOP, theme: "light" },
  { name: "03-home-dark-mobile.png", label: "Home · dark mobile", viewport: MOBILE, theme: "dark" },
  { name: "04-home-active-system.png", label: "Home · active system (pointer on Evaluate)", viewport: DESKTOP, theme: "dark", pointer: "evaluate" },
  { name: "05-flagship-dark.png", label: "Flagship evidence · dark", viewport: DESKTOP, theme: "dark", into: ".selected-work-grid", block: "center", rest: true },
  { name: "06-ajoop-live-port.png", label: "AJOOP live port · under the pointer", viewport: DESKTOP, theme: "dark", into: ".selected-work-grid", block: "center", hover: ".v4-port__composer", rest: true },
  { name: "07-ecosystem-idle.png", label: "Project ecosystem · idle", viewport: DESKTOP, theme: "dark", into: ".v4-eco", block: "center", rest: true },
  { name: "08-ecosystem-capability-active.png", label: "Ecosystem · capability active (Software)", viewport: DESKTOP, theme: "dark", into: ".v4-eco", block: "center", hover: '[data-v4-eco-node="software"]', rest: true },
  { name: "09-ecosystem-project-active.png", label: "Ecosystem · project active (Merge Rush)", viewport: DESKTOP, theme: "dark", into: ".v4-eco", block: "center", hover: '[data-v4-eco-node="merge-rush-case-study"]', rest: true },
  { name: "10-home-ecosystem-handoff.png", label: "Flagship → ecosystem hand-off, AI & Automation pinned", viewport: DESKTOP, theme: "dark", into: ".v4-eco", block: "center", click: '[data-v4-eco-node="ai"]', then: ".v4-eco-section", thenBlock: "start", offset: -470, rest: true },
  { name: "11-works-all.png", label: "Works · all projects", viewport: DESKTOP, theme: "dark", path: "/works/", into: "[data-v4-rail]", block: "start", offset: -120 },
  { name: "12-works-filter-reconfigure.png", label: "Works · reconfigured to Games & Interactive", viewport: DESKTOP, theme: "dark", path: "/works/", into: "[data-v4-rail]", block: "start", offset: -120, click: '[data-filter-btn="game"]' },
  { name: "13-works-mobile.png", label: "Works · mobile", viewport: MOBILE, theme: "dark", path: "/works/" },
  { name: "14-reduced-motion.png", label: "Home · reduced motion", viewport: DESKTOP, theme: "dark", reducedMotion: true },
  { name: "15-no-js-home.png", label: "Home · JavaScript disabled", viewport: DESKTOP, theme: "dark", noJs: true },
  { name: "16-ecosystem-light.png", label: "Ecosystem · light, capability active (AI & Automation)", viewport: DESKTOP, theme: "light", into: ".v4-eco", block: "center", hover: '[data-v4-eco-node="ai"]', rest: true },
  { name: "17-flagship-light.png", label: "Flagship evidence · light", viewport: DESKTOP, theme: "light", into: ".selected-work-grid", block: "center", rest: true },
  { name: "18-home-light-mobile.png", label: "Home · light mobile", viewport: MOBILE, theme: "light" },
  { name: "19-flagship-mobile.png", label: "Flagship evidence · mobile", viewport: MOBILE, theme: "dark", into: ".selected-work-grid", block: "start", rest: true },
  { name: "20-ecosystem-mobile.png", label: "Ecosystem · mobile, capability pinned (Games)", viewport: MOBILE, theme: "dark", into: ".v4-eco", block: "start", click: '[data-v4-eco-node="game"]', rest: true },
  { name: "21-works-light.png", label: "Works · light desktop", viewport: DESKTOP, theme: "light", path: "/works/" },
  { name: "22-ecosystem-no-js.png", label: "Ecosystem · JavaScript disabled", viewport: DESKTOP, theme: "dark", noJs: true, into: ".v4-eco", block: "center" },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, path = "/", settle = 2800, waitUntil = "networkidle0" }, problems) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) problems.push(`${path} ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.evaluateOnNewDocument((nextTheme) => localStorage.setItem("kaanbalci-site-theme", nextTheme), theme);
  await page.goto(`${ORIGIN}${path}`, { waitUntil });
  if (!noJs && waitUntil === "networkidle0") {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].filter((image) => image.loading !== "lazy").map((image) => image.complete ? undefined : image.decode().catch(() => undefined)));
    });
  }
  await wait(settle);
  return page;
}

const scrollInto = async (page, selector, block = "center", offset = 0) => {
  await page.evaluate((target, where, nudge) => { document.querySelector(target).scrollIntoView({ block: where, behavior: "instant" }); if (nudge) window.scrollBy({ top: nudge, behavior: "instant" }); }, selector, block, offset);
  /* Lazy images and first-view currents get time to arrive. */
  await page.evaluate(() => Promise.all([...document.images].filter((image) => image.getBoundingClientRect().top < innerHeight * 1.5).map((image) => image.complete ? undefined : image.decode().catch(() => undefined))));
  await wait(2000);
};

/* Time-driven animations only: scroll-driven ones are always "running". */
const motionState = (page) => page.evaluate(() => {
  const timed = document.getAnimations().filter((animation) => animation.timeline === document.timeline);
  const signal = timed.filter((animation) => /^v4-(flow|rule)-/.test(animation.animationName || ""));
  return {
    signal: signal.length,
    signalRunning: signal.filter((animation) => animation.playState === "running").length,
    signalUnfinished: signal.filter((animation) => animation.playState !== "finished").length,
    running: timed.filter((animation) => animation.playState === "running").length,
    endless: timed.filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity).length,
  };
});

const parkSignal = (page, moment) => page.evaluate((at) => {
  for (const animation of document.getAnimations()) {
    if (!/^v4-(flow|rule)-/.test(animation.animationName || "")) continue;
    animation.pause();
    animation.currentTime = at;
  }
}, moment);

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* What the ecosystem is showing right now. */
const ecoState = (page) => page.evaluate(() => {
  const root = document.querySelector("[data-v4-eco]");
  const ids = (selector) => [...root.querySelectorAll(selector)].map((node) => node.getAttribute("data-v4-eco-node")).sort();
  return {
    active: ids('[data-v4-eco-node][data-v4-state="active"]'),
    related: ids('[data-v4-eco-node][data-v4-state="related"]'),
    litEdges: root.querySelectorAll('[data-v4-edge][data-v4-state="active"]').length,
    pressed: ids('[aria-pressed="true"]'),
    relatedCards: document.querySelectorAll("[data-v4-card][data-v4-related]").length,
    litPorts: document.querySelectorAll("[data-v4-cap][data-v4-state]").length,
    readout: document.querySelector("[data-v4-eco-readout]").textContent.replace(/\s+/g, " ").trim(),
    live: document.querySelector("[data-v4-eco-readout]").hasAttribute("data-v4-live"),
    receding: root.hasAttribute("data-v4-eco-active"),
  };
});

/* Ecosystem labels against one another, in whichever layout is showing. */
const ecoCollisions = (page) => page.evaluate(() => {
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const nodes = [...document.querySelectorAll("[data-v4-eco-node]")].map((node) => ({ id: node.getAttribute("data-v4-eco-node"), rect: node.getBoundingClientRect() }));
  const found = [];
  nodes.forEach((node, index) => {
    for (const other of nodes.slice(index + 1)) if (hit(node.rect, other.rect)) found.push(`${node.id} × ${other.id}`);
  });
  return found;
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

  /* ---------- screenshots ---------- */
  for (const shot of shots) {
    const page = await open(browser, shot, problems);
    expect(`${shot.name}: no horizontal overflow`, (await overflow(page)) === 0);
    if (shot.into) await scrollInto(page, shot.into, shot.block, shot.offset);
    if (shot.click) { await page.click(shot.click); await page.mouse.move(4, 4); await wait(1100); }
    if (shot.then) await scrollInto(page, shot.then, shot.thenBlock, shot.offset);
    if (!shot.reducedMotion && !shot.noJs && !shot.path) await parkSignal(page, shot.rest ? 17_000 : SIGNAL_MOMENT_MS);
    if (shot.pointer) {
      const target = await page.evaluate((stage) => {
        const node = document.querySelector(`[data-v4-flow-stage="${stage}"] .v4-flow__node`).getBoundingClientRect();
        return { x: node.left + node.width / 2, y: node.top + node.height / 2 };
      }, shot.pointer);
      await page.mouse.move(target.x - 60, target.y + 40);
      await page.mouse.move(target.x + 16, target.y + 6, { steps: 8 });
      await wait(900);
    }
    if (shot.hover) { await page.hover(shot.hover); await wait(1300); }
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png" });
    console.log(`[v4:capture] ${shot.name}`);
    await page.close();
  }

  /* ---------- motion frames: one continuous session ---------- */
  const frames = [];
  const film = await open(browser, { viewport: DESKTOP, theme: "dark", settle: 0, waitUntil: "domcontentloaded" }, problems);
  const frame = async (label) => {
    const file = join(FRAMES, `${String(frames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`);
    await film.screenshot({ path: file, type: "png" });
    frames.push({ file, label, width: 960 });
  };
  const centreOf = (selector) => film.evaluate((target) => {
    const rect = document.querySelector(target).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  const glide = async (selector, dx = 0, dy = 0) => {
    const point = await centreOf(selector);
    await film.mouse.move(point.x + dx, point.y + dy, { steps: 14 });
  };
  await wait(350); await frame("Home: idle field, currents begin to draw");
  await wait(1100); await frame("Home: currents drawn, signal enters from the copy");
  await wait(2300); await frame("Home: signal at Scope, heading for the human node");
  await wait(2500); await frame("Home: signal through the human node, Build lit");
  await glide('[data-v4-flow-stage="evaluate"] .v4-flow__node', 14, 6); await wait(900); await frame("Home: pointer on Evaluate, the human decision link responds");
  await glide('[data-v4-flow-stage="discover"] .v4-flow__node', 14, 6); await wait(900); await frame("Home: pointer on Discover");
  await film.mouse.move(380, 560, { steps: 10 });
  await film.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" })); await wait(700); await frame("Signal exits the hero: rule and spine pick it up");
  await film.evaluate(() => document.querySelector(".selected-work-grid").scrollIntoView({ block: "center", behavior: "instant" }));
  await wait(330); await frame("Flagship receives the hand-off (cards take the current)");
  await wait(1500); await frame("Flagship: settled");
  await glide(".v4-port__composer"); await wait(700); await frame("AJOOP live port under the pointer");
  await film.mouse.move(700, 880, { steps: 6 });
  await film.evaluate(() => document.querySelector(".v4-eco").scrollIntoView({ block: "center", behavior: "instant" }));
  await wait(420); await frame("Ecosystem enters view: currents drawing");
  await wait(1900); await frame("Ecosystem: at rest");
  await glide('[data-v4-eco-node="software"]'); await wait(420); await frame("Capability active: Software, pulses travelling");
  await wait(1000); await frame("Capability active: Software, settled");
  await glide('[data-v4-eco-node="sinama-case-study"]'); await wait(1100); await frame("Project active: SINAMA lights its two capabilities");
  await glide('[data-v4-eco-node="game"]'); await film.mouse.down(); await film.mouse.up(); await film.mouse.move(720, 120, { steps: 8 }); await wait(1100); await frame("Pinned: Games and Interactive, pointer away");
  await film.goto(`${ORIGIN}/works/`, { waitUntil: "networkidle0" }); await wait(1800); await frame("Works: entry");
  await scrollInto(film, "[data-v4-rail]", "start", -120); await frame("Works: all projects");
  await film.click('[data-filter-btn="ai"]'); await wait(170); await frame("Works: category change, cards receding and taking the current");
  await wait(1000); await frame("Works: settled on AI and Automation");
  await film.click('[data-filter-btn="all"]'); await film.type("[data-project-search]", "fastapi", { delay: 30 }); await wait(900); await frame("Works: search for fastapi, settled");
  await film.close();

  /* ---------- Home smoke ---------- */
  const home = await open(browser, { viewport: DESKTOP, theme: "dark" }, problems);
  const homeFacts = await home.evaluate(() => ({
    stages: document.querySelectorAll(".hero .v4-flow__stage").length,
    ambient: Boolean(document.querySelector('.hero[data-v4-ambient~="grain"]')),
    currentField: document.querySelectorAll(".hero .v4-current-field__near path, .hero .v4-current-field__far path").length,
    kineticSettled: Boolean(document.querySelector("h1[data-v4-kinetic]")) && !document.querySelector("[data-v4-kinetic-run]"),
    magnetic: document.querySelectorAll("[data-v4-magnetic]").length,
    flagshipCards: document.querySelectorAll(".selected-work-grid > [data-v4-card]").length,
    ajoopPort: Boolean(document.querySelector(".selected-work-grid > .v4-port button")),
    capabilities: document.querySelectorAll('[data-v4-eco-kind="capability"]').length,
    projects: document.querySelectorAll('[data-v4-eco-kind="project"]').length,
    edges: document.querySelectorAll("[data-v4-edge]").length,
    edgesDeclared: [...document.querySelectorAll('[data-v4-eco-kind="project"]')].reduce((sum, node) => sum + node.getAttribute("data-v4-eco-links").split(" ").length, 0),
    projectLinks: [...document.querySelectorAll('[data-v4-eco-kind="project"]')].every((node) => node.tagName === "A" && node.getAttribute("href")),
    handoffs: document.querySelectorAll(".v4-handoff").length,
    spokes: document.querySelectorAll(".hero .v4-flow__spoke").length,
    ports: [...document.querySelectorAll(".selected-work-grid [data-v4-cap]")].map((port) => port.getAttribute("data-v4-cap")).join(","),
    quicks: document.querySelectorAll(".v4-port__quicks button").length,
    readout: document.querySelector("[data-v4-eco-readout]")?.textContent.replace(/\s+/g, " ").trim(),
    runtime: typeof window.V4Motion?.destroy === "function",
    canvases: document.querySelectorAll("canvas").length,
  }));
  expect("Home keeps the five-stage delivery flow", homeFacts.stages === 5);
  expect("Home hero is an ambient region with a current field", homeFacts.ambient && homeFacts.currentField >= 3);
  expect("Home heading sweep has ended and one action is magnetic", homeFacts.kineticSettled && homeFacts.magnetic === 1);
  expect("hero: the human node has a line to each of the five stages", homeFacts.spokes === 5);
  expect("flagship row: four connected cards, AJOOP among them as a live port with its four shipped quick questions", homeFacts.flagshipCards === 4 && homeFacts.ajoopPort && homeFacts.quicks === 4);
  expect("flagship cards carry exactly their catalog capabilities as ports", homeFacts.ports === "ai,software,ai,web");
  expect("the flagship row waits for its hand-off until first seen", await home.evaluate(() => document.querySelector("[data-v4-arrive]").hasAttribute("data-v4-await")));
  expect("ecosystem: six capabilities, ten projects, one wire per catalog relationship", homeFacts.capabilities === 6 && homeFacts.projects === 10 && homeFacts.edges === homeFacts.edgesDeclared && homeFacts.edges > 0);
  expect("ecosystem: every project is a real link", homeFacts.projectLinks);
  expect("V4 runtime is loaded on Home", homeFacts.runtime);

  const session = await home.createCDPSession();
  await session.send("Performance.enable");
  const sample = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const fiveSeconds = async () => {
    const before = await sample();
    await wait(5000);
    const after = await sample();
    const cost = Object.fromEntries(["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((name) => [name, Math.round((after[name] - before[name]) * 1000)]));
    cost.layouts = after.LayoutCount - before.LayoutCount;
    return cost;
  };
  const during = await motionState(home);
  expect("the hero signal is running its journey after load", during.signalRunning > 0);
  expect("no animation on Home loops forever", during.endless === 0);
  const burst = await fiveSeconds();

  /* Offscreen pause mid-journey, then resume. */
  await home.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await wait(700);
  const pausedOffscreen = await home.evaluate(() => {
    const regions = [...document.querySelectorAll("[data-v4-ambient], [data-v4-flow], [data-v4-signal-rule], [data-v4-eco]")];
    const off = regions.filter((region) => { const rect = region.getBoundingClientRect(); return rect.bottom < -64 || rect.top > innerHeight + 64; });
    return { regions: regions.length, offscreen: off.length, paused: off.filter((region) => region.hasAttribute("data-v4-paused")).length };
  });
  pausedOffscreen.signalRunning = (await motionState(home)).signalRunning;
  expect("every offscreen V4 region is paused", pausedOffscreen.offscreen > 0 && pausedOffscreen.paused === pausedOffscreen.offscreen && pausedOffscreen.signalRunning === 0);
  await home.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await wait(700);
  expect("the hero resumes when back in view", (await motionState(home)).signalRunning > 0);

  /* Rest: wait the journey out; nothing time-driven may still be running. */
  const deadline = Date.now() + 30_000;
  while ((await motionState(home)).signalUnfinished > 0 && Date.now() < deadline) await wait(500);
  await wait(1200);
  const resting = await motionState(home);
  expect("idle settles: no time-driven animation left running", resting.signalUnfinished === 0 && resting.running === 0);
  const idle = await fiveSeconds();

  /* Ecosystem: first view, pointer, keyboard, pin, release. */
  expect("ecosystem waits to draw until first seen", await home.evaluate(() => document.querySelector("[data-v4-eco]").hasAttribute("data-v4-await")));
  await scrollInto(home, ".v4-eco", "center");
  expect("ecosystem draws on first view", await home.evaluate(() => !document.querySelector("[data-v4-eco]").hasAttribute("data-v4-await")));
  const eco = {};
  await home.hover('[data-v4-eco-node="ai"]'); await wait(500);
  eco.pointerCapability = await ecoState(home);
  expect("pointer on AI & Automation lights exactly its three catalog projects", eco.pointerCapability.active.join() === "ai" && eco.pointerCapability.related.join() === ["ai-chatbot-flow-design", "ai-flow-puzzle-case-study", "sinama-case-study"].join() && eco.pointerCapability.litEdges === 3 && eco.pointerCapability.receding);
  expect("flagship cards for lit projects answer, and so do their matching capability ports", eco.pointerCapability.relatedCards === 2 && eco.pointerCapability.litPorts === 2);
  expect("the readout names what is lit", eco.pointerCapability.live && eco.pointerCapability.readout.includes("SINAMA"));
  await home.hover('[data-v4-eco-node="merge-rush-case-study"]'); await wait(500);
  eco.pointerProject = await ecoState(home);
  expect("pointer on Merge Rush lights exactly its two catalog categories", eco.pointerProject.related.join() === "game,software" && eco.pointerProject.litEdges === 2);
  await home.mouse.move(5, 300); await wait(400);
  eco.released = await ecoState(home);
  expect("leaving the map releases it and the readout returns to the totals", !eco.released.receding && !eco.released.live && eco.released.readout === homeFacts.readout);
  await home.focus('[data-v4-eco-node="data"]'); await wait(400);
  eco.keyboard = await ecoState(home);
  expect("keyboard focus activates a node", eco.keyboard.active.join() === "data" && eco.keyboard.related.join() === "cars-dataset-analysis");
  await home.keyboard.press("Enter"); await wait(400);
  eco.pinned = await ecoState(home);
  expect("pressing a capability pins it (aria-pressed)", eco.pinned.pressed.join() === "data");
  await home.keyboard.press("Escape"); await wait(400);
  expect("Escape releases the pin", (await ecoState(home)).pressed.length === 0);
  await home.evaluate(() => document.activeElement.blur()); await wait(300);
  expect("desktop ecosystem labels do not collide", (await ecoCollisions(home)).length === 0);

  const lcp = await home.evaluate(() => new Promise((done) => {
    new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      done({ ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null });
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(null), 1500);
  }));
  await home.close();

  /* Touch: a tap pins, with no hover to rely on. */
  const phone = await open(browser, { viewport: MOBILE, theme: "dark" }, problems);
  await phone.emulate({ viewport: { ...MOBILE, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: await browser.userAgent() });
  await phone.reload({ waitUntil: "networkidle0" }); await wait(2600);
  await scrollInto(phone, '[data-v4-eco-node="game"]', "center");
  await phone.tap('[data-v4-eco-node="game"]'); await wait(500);
  eco.touch = await ecoState(phone);
  expect("touch: tapping a capability pins it and lights its projects", eco.touch.pressed.join() === "game" && eco.touch.related.length === 3);
  expect("mobile ecosystem rows do not collide", (await ecoCollisions(phone)).length === 0);
  expect("mobile Home has no horizontal overflow", (await overflow(phone)) === 0);
  await phone.close();

  /* Reduced motion: activation still works, nothing animates. */
  const still = await open(browser, { viewport: DESKTOP, theme: "dark", reducedMotion: true }, problems);
  await scrollInto(still, ".v4-eco", "center");
  await still.hover('[data-v4-eco-node="web"]'); await wait(400);
  eco.reducedMotion = { ...(await ecoState(still)), motion: await motionState(still) };
  expect("reduced motion: activation works with no animation running", eco.reducedMotion.related.join() === "atolye-joyday-case-study" && eco.reducedMotion.motion.running === 0);
  await still.close();

  /* ---------- no-JS Home ---------- */
  const staticPage = await open(browser, { viewport: DESKTOP, theme: "dark", noJs: true, settle: 300 }, []);
  const staticFacts = await staticPage.evaluate(() => ({
    stages: document.querySelectorAll(".v4-flow__label").length,
    capabilities: [...document.querySelectorAll('[data-v4-eco-kind="capability"]')].map((node) => node.textContent.trim()).length,
    projects: document.querySelectorAll('a[data-v4-eco-kind="project"][href]').length,
    wires: document.querySelectorAll(".v4-eco__wire[d]").length,
    awaiting: document.querySelectorAll("[data-v4-await]").length,
  }));
  expect("without JavaScript the flow, the ecosystem, its links and its wires are in the document and drawn", staticFacts.stages === 5 && staticFacts.capabilities === 6 && staticFacts.projects === 10 && staticFacts.wires > 0 && staticFacts.awaiting === 0);
  await staticPage.close();

  /* ---------- Works smoke: the catalog still filters and searches ---------- */
  const works = await open(browser, { viewport: DESKTOP, theme: "dark", path: "/works/" }, problems);
  const visible = () => works.evaluate(() => document.querySelectorAll(".project-card:not(.is-hidden)").length);
  const railCount = () => works.evaluate(() => document.querySelector("[data-v4-rail]").getAttribute("data-v4-count"));
  const worksFacts = { countAll: await railCount(), all: await visible(), cards: await works.evaluate(() => document.querySelectorAll(".project-card[data-v4-card]").length), rail: await works.evaluate(() => Boolean(document.querySelector("[data-v4-rail] .filter-btn.active"))), runtime: await works.evaluate(() => "V4Motion" in window) };
  await works.click('[data-filter-btn="ai"]'); await wait(400);
  worksFacts.reconfigured = await works.evaluate(() => Boolean(document.querySelector("[data-v4-reconfig]")));
  await wait(500);
  worksFacts.ai = await visible();
  worksFacts.countAi = await railCount();
  worksFacts.aiExpected = await works.evaluate(() => [...document.querySelectorAll(".project-card")].filter((card) => card.dataset.category.split(" ").includes("ai")).length);
  await works.click('[data-filter-btn="all"]'); await wait(300);
  await works.type("[data-project-search]", "fastapi"); await wait(900);
  worksFacts.search = await visible();
  worksFacts.overflow = await overflow(works);
  expect("Works: every card is a connected card and the rail is live", worksFacts.all === 10 && worksFacts.cards === 10 && worksFacts.rail && worksFacts.runtime);
  expect("Works: the AI filter shows exactly the AI-category cards", worksFacts.ai === worksFacts.aiExpected && worksFacts.ai > 0 && worksFacts.ai < worksFacts.all);
  expect("Works: search narrows the catalog", worksFacts.search > 0 && worksFacts.search < worksFacts.all);
  expect("Works: the rail reports the real count and the set is told it changed", worksFacts.countAll === "10 / 10" && worksFacts.countAi === "03 / 10" && worksFacts.reconfigured);
  expect("Works desktop: no horizontal overflow", worksFacts.overflow === 0);
  await works.close();
  const worksPhone = await open(browser, { viewport: MOBILE, theme: "dark", path: "/works/", settle: 1200 }, problems);
  worksFacts.mobileOverflow = await overflow(worksPhone);
  expect("Works mobile: no horizontal overflow", worksFacts.mobileOverflow === 0);
  await worksPhone.close();

  /* ---------- five-locale sanity for the new translated layout ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    const wide = await open(browser, { viewport: DESKTOP, theme: "dark", path: homePath(locale), settle: 900 }, problems);
    const narrow = await open(browser, { viewport: MOBILE, theme: "dark", path: homePath(locale), settle: 900 }, problems);
    locales[locale] = {
      desktopOverflow: await overflow(wide),
      desktopCollisions: await ecoCollisions(wide),
      mobileOverflow: await overflow(narrow),
      mobileCollisions: await ecoCollisions(narrow),
      capabilities: await wide.evaluate(() => [...document.querySelectorAll('[data-v4-eco-kind="capability"] span')].map((node) => node.textContent)),
    };
    const result = locales[locale];
    expect(`${locale}: no horizontal overflow at 1440 or 390`, result.desktopOverflow === 0 && result.mobileOverflow === 0);
    expect(`${locale}: ecosystem labels clear at 1440 (${result.desktopCollisions.join("; ")})`, result.desktopCollisions.length === 0);
    expect(`${locale}: ecosystem rows clear at 390 (${result.mobileCollisions.join("; ")})`, result.mobileCollisions.length === 0);
    await wide.close();
    await narrow.close();
  }

  /* ---------- measurements + pack ---------- */
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-home.css", "css/v4-works.css", "js/v4/runtime.js", reactEntry, "index.html", "works/index.html"].map(sizeOf));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session (no video encoder is available on this machine)", frames, 4120);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, home: homeFacts, motion: { duringJourney: during, atRest: resting }, pausedOffscreen, fiveSecondsMs: { duringJourney: burst, idleAtRest: idle }, lcp, ecosystem: eco, noJs: staticFacts, works: worksFacts, locales, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const cost = (label, value) => `| ${label} | ${value.TaskDuration} ms | ${value.RecalcStyleDuration} ms | ${value.LayoutDuration} ms (${value.layouts}) | ${value.ScriptDuration} ms |`;
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${frames.length} frames from one continuous session, in order; the individual frames are in \`motion-frames/\`.
- **\`${PACK}\`** — everything here.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${frames.map((entry, index) => `${index + 1}. ${entry.label}`).join("\n")}

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors: ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Home: ${homeFacts.stages} flow stages, ${homeFacts.flagshipCards} flagship cards, ${homeFacts.capabilities} capabilities, ${homeFacts.projects} projects, ${homeFacts.edges} wires, ${homeFacts.canvases} canvases.
- Ecosystem: pointer, keyboard focus, press-to-pin, Escape, touch tap and reduced motion all activate exactly the catalog's relationships.
- Motion: ${during.endless} endless animations; at rest ${resting.running} time-driven animations running. Offscreen ${pausedOffscreen.paused}/${pausedOffscreen.offscreen} regions paused.
- Works: ${worksFacts.all} cards, AI filter ${worksFacts.ai}/${worksFacts.aiExpected} expected, search "fastapi" ${worksFacts.search}; overflow desktop ${worksFacts.overflow}px, mobile ${worksFacts.mobileOverflow}px.
- Locales (EN/TR/DE/ES/FR at 1440 and 390): overflow ${LOCALES.map((locale) => `${locales[locale].desktopOverflow}/${locales[locale].mobileOverflow}`).join(" · ")}; ecosystem label collisions ${LOCALES.map((locale) => locales[locale].desktopCollisions.length + locales[locale].mobileCollisions.length).join(" · ")}.

## Performance (headless Chromium, 1440×900, five seconds each)

| Window | Main-thread tasks | Style recalculation | Layout (count) | Script |
| --- | --- | --- | --- | --- |
${cost("During the hero's 13 s signal journey", burst)}
${cost("Idle, everything at rest", idle)}

| Asset | Raw | Gzip |
| --- | --- | --- |
${sizes.map((size) => `| ${size.file} | ${kb(size.raw)} | ${kb(size.gzip)} |`).join("\n")}

- LCP (local, unthrottled): ${lcp ? `${lcp.ms} ms on <${lcp.element}>` : "not reported"}.
- No canvas and no animation loop. Currents are inline SVG drawn once by CSS; the section hand-off is scroll-driven CSS where supported.
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
