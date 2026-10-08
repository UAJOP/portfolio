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
 * not change between phases. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-e02-works-project-detail";
const PACK = "V4-E02-review-pack.zip";
const TITLE = "V4-E02 · Works + Project Detail";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
const FRAMES = join(OUTPUT, "motion-frames");
/* Its own port: 4174/4175 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_SCRIPT = join(ROOT, "scripts", "v4-preview-server.mjs");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const DETAIL = "/sinama-case-study/";
const CASE_STUDIES = ["/sinama-case-study/", "/merge-rush-case-study/", "/atolye-joyday-case-study/", "/hospital-system-case-study/", "/ai-flow-puzzle-case-study/"];
const RAIL = "[data-v4-rail]";
const mode = (name) => `[data-v4-mode="${name}"]`;
const filter = (name) => `[data-filter-btn="${name}"]`;

/* In contact-sheet order. `steps` run in order: ["click", selector],
 * ["hover", selector], ["top", selector] (scroll it just under the header),
 * ["into", selector] (centre it), ["type", selector, text]. */
const shots = [
  { name: "01-works-dark-project-grid.png", label: "Works · dark · Project Grid", viewport: DESKTOP, theme: "dark", path: "/works/", steps: [["top", RAIL]] },
  { name: "02-works-dark-ecosystem-map.png", label: "Works · dark · Ecosystem Map", viewport: DESKTOP, theme: "dark", path: "/works/", steps: [["click", mode("map")], ["into", ".v4-explorer__map .v4-eco"]] },
  { name: "03-works-dark-capability-view.png", label: "Works · dark · Capability View (Software)", viewport: DESKTOP, theme: "dark", path: "/works/", steps: [["click", mode("capability")], ["click", filter("software")], ["top", RAIL]] },
  { name: "04-works-light.png", label: "Works · light · Ecosystem Map, AI & Automation", viewport: DESKTOP, theme: "light", path: "/works/", steps: [["click", mode("map")], ["click", '.v4-explorer__map [data-v4-eco-node="ai"]'], ["into", ".v4-explorer__map .v4-eco"]] },
  { name: "05-works-mobile.png", label: "Works · mobile · explorer", viewport: MOBILE, theme: "dark", path: "/works/", steps: [["top", RAIL]] },
  { name: "06-works-filter-reconfigure.png", label: "Works · reconfigured to Games & Interactive (map)", viewport: DESKTOP, theme: "dark", path: "/works/", steps: [["click", mode("map")], ["click", filter("game")], ["top", RAIL]] },
  { name: "07-sinama-detail-hero.png", label: "SINAMA · detail hero", viewport: DESKTOP, theme: "dark", path: DETAIL },
  { name: "08-sinama-detail-process.png", label: "SINAMA · evidence pipeline (step under the pointer)", viewport: DESKTOP, theme: "dark", path: DETAIL, steps: [["into", "[data-v4-process]"], ["hover", "[data-v4-process] > li:nth-child(5)"]] },
  { name: "09-sinama-detail-evidence.png", label: "SINAMA · proof figures and problem", viewport: DESKTOP, theme: "dark", path: DETAIL, steps: [["top", ".case-proof-strip"]] },
  { name: "10-sinama-detail-mobile.png", label: "SINAMA · mobile hero", viewport: MOBILE, theme: "dark", path: DETAIL },
  { name: "11-related-work.png", label: "SINAMA · related work", viewport: DESKTOP, theme: "dark", path: DETAIL, steps: [["into", ".v4-related"], ["hover", ".v4-related__project"]] },
  { name: "12-reduced-motion.png", label: "Works · reduced motion · Ecosystem Map", viewport: DESKTOP, theme: "dark", path: "/works/", reducedMotion: true, steps: [["click", mode("map")], ["into", ".v4-explorer__map .v4-eco"]] },
  { name: "13-no-js-works.png", label: "Works · JavaScript disabled (ordinary project list)", viewport: DESKTOP, theme: "dark", path: "/works/", noJs: true, steps: [["top", RAIL]] },
  { name: "14-no-js-detail.png", label: "SINAMA · JavaScript disabled", viewport: DESKTOP, theme: "dark", path: DETAIL, noJs: true, steps: [["into", "[data-v4-process]"]] },
  { name: "15-sinama-detail-architecture.png", label: "SINAMA · contracts and architecture components", viewport: DESKTOP, theme: "dark", path: DETAIL, steps: [["top", "#v4-s-10"]] },
  { name: "16-sinama-detail-light.png", label: "SINAMA · light hero", viewport: DESKTOP, theme: "light", path: DETAIL },
  { name: "17-sinama-process-mobile.png", label: "SINAMA · mobile pipeline and tracker", viewport: MOBILE, theme: "dark", path: DETAIL, steps: [["top", "[data-v4-process]"]] },
  { name: "18-works-mobile-capability.png", label: "Works · mobile · Capability View (AI & Automation)", viewport: MOBILE, theme: "dark", path: "/works/", steps: [["click", mode("capability")], ["click", filter("ai")], ["top", RAIL]] },
  { name: "19-works-mobile-map.png", label: "Works · mobile · Ecosystem Map (Software)", viewport: MOBILE, theme: "dark", path: "/works/", steps: [["click", mode("map")], ["click", filter("software")], ["top", ".v4-modes"]] },
  { name: "20-merge-rush-detail.png", label: "Merge Rush · the same shell on another case study", viewport: DESKTOP, theme: "dark", path: "/merge-rush-case-study/" },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, path = "/", settle = 2600, waitUntil = "networkidle0" }, problems) {
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

const scrollTo = async (page, selector, block) => {
  await page.evaluate((target, where) => {
    document.querySelector(target).scrollIntoView({ block: where === "top" ? "start" : "center", behavior: "instant" });
    if (where === "top") window.scrollBy({ top: -140, behavior: "instant" });
  }, selector, block);
  /* Visible images near the viewport get a moment to arrive; a hidden lazy
   * image never loads, so nothing waits on one for long. */
  await page.evaluate(() => Promise.race([
    Promise.all([...document.images].filter((image) => image.getClientRects().length && image.getBoundingClientRect().top < innerHeight * 1.5).map((image) => image.complete ? undefined : image.decode().catch(() => undefined))),
    new Promise((done) => setTimeout(done, 2500)),
  ]));
  await wait(1900);
};

async function run(page, steps = []) {
  for (const [action, selector, text] of steps) {
    if (action === "click") { await page.click(selector); await page.mouse.move(3, 3); await wait(1300); }
    if (action === "hover") { await page.hover(selector); await wait(1200); }
    if (action === "type") { await page.type(selector, text, { delay: 25 }); await wait(900); }
    if (action === "top" || action === "into") await scrollTo(page, selector, action);
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

/* The Works explorer, as the page reports it. */
const explorer = (page) => page.evaluate(() => {
  const root = document.querySelector("[data-v4-explorer]");
  const shown = (selector) => [...root.querySelectorAll(selector)].filter((node) => node.getClientRects().length).length;
  return {
    view: root.getAttribute("data-v4-view"),
    pressedMode: [...root.querySelectorAll('.v4-modes__mode[aria-pressed="true"]')].map((node) => node.getAttribute("data-v4-mode")).join(),
    modesShown: shown(".v4-modes__mode"),
    cardsShown: shown(".project-card"),
    cardsMatching: root.querySelectorAll(".project-card:not(.is-hidden)").length,
    mapShown: shown(".v4-explorer__map .v4-eco"),
    mapProjects: root.querySelectorAll('.v4-explorer__map [data-v4-eco-kind="project"]').length,
    mapOut: root.querySelectorAll(".v4-explorer__map li[data-v4-out]").length,
    mapPressed: [...root.querySelectorAll('.v4-explorer__map [aria-pressed="true"]')].map((node) => node.getAttribute("data-v4-eco-node")).join(),
    mapLitEdges: root.querySelectorAll('.v4-explorer__map [data-v4-edge][data-v4-state="active"]').length,
    activeFilter: root.querySelector(".filter-btn.active")?.getAttribute("data-filter-btn"),
    count: root.querySelector("[data-v4-rail]").getAttribute("data-v4-count"),
    search: root.querySelector("[data-project-search]").value,
    rows: [...root.querySelectorAll(".project-card:not(.is-hidden)")].filter((card) => getComputedStyle(card).flexDirection === "row").length,
    ports: root.querySelectorAll(".project-card .v4-ports [data-v4-cap]").length,
    portsExpected: [...root.querySelectorAll(".project-card")].reduce((sum, card) => sum + card.dataset.category.split(" ").length, 0),
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

  /* ---------- screenshots ---------- */
  for (const shot of shots) {
    const page = await open(browser, shot, shot.noJs ? [] : problems);
    await run(page, shot.steps);
    expect(`${shot.name}: no horizontal overflow`, (await overflow(page)) === 0);
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png" });
    console.log(`[v4:capture] ${shot.name}`);
    await page.close();
  }

  /* ---------- motion frames: one continuous session ---------- */
  const frames = [];
  const film = await open(browser, { viewport: DESKTOP, theme: "dark", path: "/works/" }, problems);
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
  await scrollTo(film, RAIL, "top"); await frame("Works: Project Grid");
  await film.click(mode("map")); await wait(260); await frame("Grid to Map: cards step back, currents begin to draw");
  await wait(1500); await scrollTo(film, ".v4-explorer__map .v4-eco", "into"); await frame("Ecosystem Map: at rest");
  await glide('.v4-explorer__map [data-v4-eco-node="ai"]'); await wait(450); await frame("Map: AI and Automation under the pointer, pulses travelling");
  await film.mouse.down(); await film.mouse.up(); await film.mouse.move(720, 110, { steps: 8 }); await wait(1100); await frame("Map: AI and Automation chosen, the catalog filter follows");
  await scrollTo(film, RAIL, "top"); await film.click(mode("capability")); await wait(260); await frame("Map to Capability View: rows arriving");
  await wait(1300); await frame("Capability View: AI and Automation, settled (filter kept)");
  await film.click(filter("software")); await wait(180); await frame("Filter reconfigure: rows receding and taking the current");
  await wait(1000); await frame("Filter reconfigure: settled on Software");
  await film.click(mode("grid")); await film.click(filter("all")); await wait(1200); await frame("Back to Project Grid, all projects");
  await scrollTo(film, ".project-card", "into");
  await glide(".project-card", -80, -40); await wait(700); await frame("Project selection: SINAMA card under the pointer");
  await Promise.all([film.waitForNavigation({ waitUntil: "domcontentloaded" }), film.click('.project-card h3 a')]);
  await wait(420); await frame("Project detail entrance: currents drawing around the project");
  await wait(2300); await frame("Project detail: hero settled");
  await film.evaluate(() => document.querySelector("[data-v4-process]").scrollIntoView({ block: "center", behavior: "instant" }));
  await wait(520); await frame("Pipeline enters view: the current runs, nodes wake in order");
  await wait(1900); await frame("Pipeline: at rest");
  await glide("[data-v4-process] > li:nth-child(4)"); await wait(700); await frame("Pipeline: step 04 under the pointer");
  await scrollTo(film, "#v4-s-10", "top"); await glide(".case-service-card", -60, -20); await wait(700); await frame("Contracts: connected card under the pointer, tracker on Deterministic engine");
  await scrollTo(film, ".v4-related", "into"); await frame("Related work: the path onward");
  await glide(".v4-related__group:nth-of-type(2) .v4-related__project"); await wait(700); await frame("Related work: Merge Rush under the pointer");
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle0" }), film.click(".v4-related__group:nth-of-type(2) .v4-related__project")]);
  await wait(2200); await frame("Related-project path: arrived at Merge Rush");
  await film.close();

  /* ---------- Works smoke ---------- */
  const works = await open(browser, { viewport: DESKTOP, theme: "dark", path: "/works/" }, problems);
  const w = {};
  w.initial = await explorer(works);
  expect("Works opens as the Project Grid with all three modes offered", w.initial.view === "grid" && w.initial.pressedMode === "grid" && w.initial.modesShown === 3 && w.initial.cardsShown === 10 && w.initial.mapShown === 0);
  expect("every Works card carries exactly its catalog categories as ports", w.initial.ports === w.initial.portsExpected && w.initial.ports > 0);
  expect("the rail reports the real count", w.initial.count === "10 / 10");

  await works.click(mode("map")); await wait(900);
  w.map = await explorer(works);
  expect("Ecosystem Map: the map replaces the cards without a reload", w.map.view === "map" && w.map.mapShown === 1 && w.map.cardsShown === 0 && w.map.mapProjects === 10);

  await works.click('.v4-explorer__map [data-v4-eco-node="ai"]'); await works.mouse.move(3, 3); await wait(900);
  w.mapFiltered = await explorer(works);
  expect("pressing a capability in the map is the catalog filter: same state, same count", w.mapFiltered.activeFilter === "ai" && w.mapFiltered.mapPressed === "ai" && w.mapFiltered.count === "03 / 10" && w.mapFiltered.mapOut === 7 && w.mapFiltered.mapLitEdges === 3);

  await works.click(mode("capability")); await wait(900);
  w.capability = await explorer(works);
  expect("Capability View keeps the filter and shows its projects as rows", w.capability.view === "capability" && w.capability.activeFilter === "ai" && w.capability.cardsShown === 3 && w.capability.rows === 3);

  await works.type("[data-project-search]", "fastapi"); await wait(900);
  w.searched = await explorer(works);
  await works.click(mode("grid")); await wait(900);
  w.backToGrid = await explorer(works);
  expect("search still narrows the catalog and survives a view change", w.searched.cardsMatching === 1 && w.backToGrid.view === "grid" && w.backToGrid.search === "fastapi" && w.backToGrid.cardsShown === 1 && w.backToGrid.count === "01 / 10");

  await works.evaluate(() => { const input = document.querySelector("[data-project-search]"); input.focus(); input.select(); });
  await works.keyboard.press("Backspace"); await works.click(filter("all")); await wait(700);
  await works.focus(mode("map")); await works.keyboard.press("Enter"); await wait(700);
  w.keyboard = await explorer(works);
  expect("keyboard: Enter on a mode switches the view", w.keyboard.view === "map" && w.keyboard.cardsMatching === 10);
  await works.click(filter("game")); await wait(900);
  w.railInMap = await explorer(works);
  expect("the rail filters the map too: three projects stay, the rest recede", w.railInMap.mapPressed === "game" && w.railInMap.mapOut === 7 && w.railInMap.count === "03 / 10");
  w.motion = await motionState(works);
  await wait(2500);
  w.atRest = await motionState(works);
  expect("Works: nothing loops and the explorer comes to rest", w.motion.endless === 0 && w.atRest.running === 0);
  expect("Works desktop: no horizontal overflow", (await overflow(works)) === 0);

  /* Selection anchor, then the real navigation. */
  await works.click(mode("grid")); await works.click(filter("all")); await wait(900);
  await works.evaluate(() => document.querySelector(".project-card").scrollIntoView({ block: "center", behavior: "instant" }));
  const visual = await works.evaluate(() => { const rect = document.querySelector(".project-card img").getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; });
  await works.mouse.move(visual.x, visual.y); await works.mouse.down();
  w.anchored = await works.evaluate(() => [...document.querySelectorAll(".project-card img")].filter((image) => image.style.viewTransitionName === "v4-project-visual").length);
  await Promise.all([works.waitForNavigation({ waitUntil: "networkidle0" }), works.mouse.up()]);
  w.arrived = new URL(works.url()).pathname;
  w.destinationAnchor = await works.evaluate(() => getComputedStyle(document.querySelector("[data-v4-anchor]")).viewTransitionName);
  expect("choosing a card names exactly that card's visual, and the link still navigates normally", w.anchored === 1 && w.arrived === DETAIL);
  expect("the destination hero carries the matching anchor", w.destinationAnchor === "v4-project-visual");
  await works.close();

  /* Touch + phone. */
  const phone = await open(browser, { viewport: MOBILE, theme: "dark", path: "/works/" }, problems);
  await phone.emulate({ viewport: { ...MOBILE, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, userAgent: await browser.userAgent() });
  await phone.reload({ waitUntil: "networkidle0" }); await wait(2400);
  await phone.evaluate(() => document.querySelector(".v4-modes").scrollIntoView({ block: "center", behavior: "instant" }));
  await phone.tap(mode("capability")); await wait(800);
  w.touch = await explorer(phone);
  expect("touch: tapping a mode switches the view on a phone", w.touch.view === "capability" && w.touch.modesShown === 3);
  await phone.tap(mode("map")); await wait(800);
  w.touchMap = await explorer(phone);
  expect("phone map is the project list, not a squeezed graph", w.touchMap.view === "map" && await phone.evaluate(() => getComputedStyle(document.querySelector(".v4-explorer__map .v4-eco__field")).display === "none"));
  expect("Works mobile: no horizontal overflow in any view", (await overflow(phone)) === 0);
  await phone.close();

  /* Reduced motion and no-JS. */
  const still = await open(browser, { viewport: DESKTOP, theme: "dark", path: "/works/", reducedMotion: true }, problems);
  await still.click(mode("map")); await wait(500);
  w.reducedMotion = { ...(await explorer(still)), motion: await motionState(still) };
  expect("reduced motion: views still switch, nothing animates", w.reducedMotion.view === "map" && w.reducedMotion.mapShown === 1 && w.reducedMotion.motion.running === 0);
  await still.close();
  const plain = await open(browser, { viewport: DESKTOP, theme: "dark", path: "/works/", noJs: true, settle: 300 }, []);
  w.noJs = await plain.evaluate(() => {
    const shown = (selector) => [...document.querySelectorAll(selector)].filter((node) => node.getClientRects().length).length;
    return { modes: shown(".v4-modes__mode"), cards: shown(".project-card"), map: shown(".v4-explorer__map .v4-eco"), links: document.querySelectorAll(".project-card h3 a[href]").length };
  });
  expect("without JavaScript Works is the ordinary project list: no mode switch, every card and link present", w.noJs.modes === 0 && w.noJs.cards === 10 && w.noJs.map === 0 && w.noJs.links === 10);
  await plain.close();

  /* ---------- project-detail smoke ---------- */
  const detail = await open(browser, { viewport: DESKTOP, theme: "dark", path: DETAIL }, problems);
  const d = {};
  d.facts = await detail.evaluate(() => {
    const links = [...document.querySelectorAll("[data-v4-tracker] a")];
    return {
      tracker: links.map((link) => link.textContent.replace(/\s+/g, " ").trim()),
      trackerTargets: links.every((link) => document.getElementById(link.getAttribute("href").slice(1))?.classList.contains("case-section")),
      sections: document.querySelectorAll("main .case-section").length,
      ports: [...document.querySelectorAll(".case-hero .v4-ports [data-v4-cap]")].map((port) => port.getAttribute("data-v4-cap")).join(),
      steps: document.querySelectorAll("[data-v4-process] > li").length,
      processWaiting: document.querySelector("[data-v4-process]").hasAttribute("data-v4-await"),
      proof: [...document.querySelectorAll(".case-proof strong")].map((node) => node.textContent.trim()),
      cards: document.querySelectorAll("main [data-v4-card]").length,
      related: [...document.querySelectorAll(".v4-related__group")].map((group) => `${group.querySelector("h3").textContent.trim()}: ${group.querySelectorAll("a").length}`),
      relatedLinks: [...document.querySelectorAll(".v4-related__project")].map((link) => link.getAttribute("href")),
      heading: document.querySelector("h1").textContent.trim(),
      runtime: typeof window.V4Motion?.destroy === "function",
      canvases: document.querySelectorAll("canvas").length,
    };
  });
  expect("detail: the tracker lists every content section, each link reaching its section", d.facts.tracker.length === d.facts.sections && d.facts.tracker.length >= 2 && d.facts.trackerTargets);
  expect("detail: the hero carries exactly SINAMA's catalog capabilities", d.facts.ports === "ai,software");
  expect("detail: the six-step pipeline is a process that waits to be seen", d.facts.steps === 6 && d.facts.processWaiting);
  expect("detail: related work is grouped by the two shared capabilities, five projects in catalog order", d.facts.related.length === 2 && d.facts.relatedLinks.length === 5);
  const reachable = await Promise.all(d.facts.relatedLinks.map(async (href) => (await fetch(`${ORIGIN}${href}`)).status));
  expect("detail: every related link resolves", reachable.every((status) => status === 200));

  await scrollTo(detail, "[data-v4-process]", "into");
  d.afterScroll = await detail.evaluate(() => ({
    waiting: document.querySelector("[data-v4-process]").hasAttribute("data-v4-await"),
    current: [...document.querySelectorAll("[data-v4-tracker] a[aria-current]")].map((link) => link.getAttribute("href")),
    section: document.querySelector("[data-v4-process]").closest(".case-section").id,
  }));
  expect("detail: the pipeline runs when first seen and the tracker marks its section", !d.afterScroll.waiting && d.afterScroll.current.length === 1 && d.afterScroll.current[0] === `#${d.afterScroll.section}`);
  await detail.click("[data-v4-tracker] li:last-child a"); await wait(1400);
  d.jumped = await detail.evaluate(() => ({ hash: location.hash, current: document.querySelector("[data-v4-tracker] a[aria-current]")?.getAttribute("href") }));
  expect("detail: a tracker link jumps to its section and becomes current", d.jumped.hash === d.jumped.current && Boolean(d.jumped.hash));

  const session = await detail.createCDPSession();
  await session.send("Performance.enable");
  const sample = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  await wait(2500);
  d.atRest = await motionState(detail);
  const before = await sample();
  await wait(5000);
  const after = await sample();
  const idle = Object.fromEntries(["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((name) => [name, Math.round((after[name] - before[name]) * 1000)]));
  expect("detail: nothing loops and the page comes to rest", d.atRest.endless === 0 && d.atRest.running === 0);
  await detail.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await wait(700);
  d.pausedOffscreen = await detail.evaluate(() => {
    const regions = [...document.querySelectorAll("[data-v4-ambient], [data-v4-process], [data-v4-arrive]")];
    const off = regions.filter((region) => { const rect = region.getBoundingClientRect(); return rect.bottom < -64 || rect.top > innerHeight + 64; });
    return { offscreen: off.length, paused: off.filter((region) => region.hasAttribute("data-v4-paused")).length };
  });
  expect("detail: offscreen V4 regions are paused", d.pausedOffscreen.offscreen > 0 && d.pausedOffscreen.paused === d.pausedOffscreen.offscreen);
  const lcp = await detail.evaluate(() => new Promise((done) => {
    new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      done({ ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null });
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(null), 1500);
  }));
  expect("detail desktop: no horizontal overflow", (await overflow(detail)) === 0);
  await detail.close();

  const detailPlain = await open(browser, { viewport: DESKTOP, theme: "dark", path: DETAIL, noJs: true, settle: 300 }, []);
  d.noJs = await detailPlain.evaluate(() => ({
    tracker: document.querySelectorAll('[data-v4-tracker] a[href^="#v4-s-"]').length,
    steps: document.querySelectorAll("[data-v4-process] > li").length,
    related: document.querySelectorAll(".v4-related__project[href]").length,
    waiting: document.querySelectorAll("[data-v4-await]").length,
  }));
  expect("without JavaScript the detail page keeps its tracker links, pipeline and related work", d.noJs.tracker >= 2 && d.noJs.steps === 6 && d.noJs.related === 5 && d.noJs.waiting === 0);
  await detailPlain.close();

  const detailStill = await open(browser, { viewport: DESKTOP, theme: "dark", path: DETAIL, reducedMotion: true }, problems);
  await scrollTo(detailStill, "[data-v4-process]", "into");
  d.reducedMotion = await motionState(detailStill);
  expect("reduced motion: the detail page does not animate", d.reducedMotion.running === 0);
  await detailStill.close();

  /* The shell on every case study, and both surfaces in every locale. */
  const shell = {};
  for (const path of CASE_STUDIES) {
    const page = await open(browser, { viewport: MOBILE, theme: "dark", path, settle: 900 }, problems);
    shell[path] = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tracker: document.querySelectorAll("[data-v4-tracker] a").length,
      related: document.querySelectorAll(".v4-related__project").length,
      ports: document.querySelectorAll(".case-hero .v4-ports [data-v4-cap]").length,
      emptyTrackerLabels: [...document.querySelectorAll("[data-v4-tracker] a span")].filter((label) => !label.textContent.trim()).length,
    }));
    expect(`${path} (390): shell renders with real ports, a labelled tracker and no overflow`, shell[path].overflow === 0 && shell[path].ports > 0 && shell[path].tracker >= 2 && shell[path].emptyTrackerLabels === 0);
    await page.close();
  }
  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = {};
    for (const [surface, path] of [["works", "/works/"], ["detail", DETAIL]]) {
      const wide = await open(browser, { viewport: DESKTOP, theme: "dark", path: localized(locale, path), settle: 800 }, problems);
      if (surface === "works") { await wide.click(mode("capability")); await wait(500); }
      const narrow = await open(browser, { viewport: MOBILE, theme: "dark", path: localized(locale, path), settle: 800 }, problems);
      locales[locale][surface] = { desktop: await overflow(wide), mobile: await overflow(narrow) };
      if (surface === "works") locales[locale].modes = await wide.evaluate(() => [...document.querySelectorAll(".v4-modes__mode")].map((node) => node.textContent.trim()));
      if (surface === "detail") locales[locale].tracker = await wide.evaluate(() => document.querySelectorAll("[data-v4-tracker] a").length);
      expect(`${locale} ${surface}: no horizontal overflow at 1440 or 390`, locales[locale][surface].desktop === 0 && locales[locale][surface].mobile === 0);
      await wide.close();
      await narrow.close();
    }
  }

  /* ---------- measurements + pack ---------- */
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-works.css", "css/v4-detail.css", "js/v4/runtime.js", reactEntry, "works/index.html", "sinama-case-study/index.html"].map(sizeOf));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session", frames, 4120);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, works: w, detail: d, idleFiveSecondsMs: idle, lcp, caseStudies: shell, locales, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
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
- Works: three modes; the map's capability buttons and the rail are one filter state (AI & Automation: ${w.mapFiltered.count}, ${w.mapFiltered.mapOut} projects receding, ${w.mapFiltered.mapLitEdges} wires lit); search "fastapi" → ${w.backToGrid.count} and survives a view change.
- Works without JavaScript: ${w.noJs.cards} cards, ${w.noJs.modes} mode buttons, ${w.noJs.links} project links.
- SINAMA detail: tracker ${d.facts.tracker.join(" · ")}; ${d.facts.steps} pipeline steps; proof ${d.facts.proof.join(" · ")}; related ${d.facts.related.join(" · ")}.
- Transition: ${w.anchored} card visual named on selection, destination anchor "${w.destinationAnchor}", arrived at ${w.arrived}.
- Shell on every case study at 390 px: ${Object.entries(shell).map(([path, value]) => `${path} tracker ${value.tracker}, related ${value.related}`).join(" · ")}.
- Locales (EN/TR/DE/ES/FR, Works and SINAMA at 1440 and 390): overflow ${LOCALES.map((locale) => `${locales[locale].works.desktop}/${locales[locale].works.mobile}/${locales[locale].detail.desktop}/${locales[locale].detail.mobile}`).join(" · ")}.

## Performance (headless Chromium, 1440×900)

- SINAMA detail, five idle seconds at rest: main-thread tasks ${idle.TaskDuration} ms, style recalculation ${idle.RecalcStyleDuration} ms, layout ${idle.LayoutDuration} ms, script ${idle.ScriptDuration} ms.
- LCP on the detail page (local, unthrottled): ${lcp ? `${lcp.ms} ms on <${lcp.element}>` : "not reported"}.
- No canvas, no animation loop: ${d.facts.canvases} canvases; at rest ${d.atRest.running} time-driven animations running on the detail page and ${w.atRest.running} on Works.

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
