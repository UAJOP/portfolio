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
const PHASE = "v4-e03-experience-certificates-about";
const PACK = "V4-E03-review-pack.zip";
const TITLE = "V4-E03 · Experience + Certificates + About";
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
const EXPERIENCE = "/blog/";
const CERTIFICATES = "/certificates/";
const ABOUT = "/about/";
const SURFACES = [["experience", EXPERIENCE], ["certificates", CERTIFICATES], ["about", ABOUT]];
const mode = (name) => `[data-v4-mode="${name}"]`;
const node = (id) => `[data-v4-eco-node="${id}"]`;
const star = (index) => `.v4-sky__stars li:nth-child(${index}) .v4-sky__star`;
const hub = (index) => `.v4-sky__hub:nth-child(${index})`;
const cluster = (id) => `[data-v4-cluster="${id}"]`;
const SKY = [["click", mode("constellation")], ["into", ".v4-sky"]];

/* In contact-sheet order. `steps` run in order: ["click", selector],
 * ["hover", selector], ["top", selector] (scroll it just under the header),
 * ["into", selector] (centre it). */
const shots = [
  { name: "01-experience-dark-overview.png", label: "Experience · dark · career current", viewport: DESKTOP, theme: "dark", path: EXPERIENCE, steps: [["into", ".v4-career"]] },
  { name: "02-experience-active-milestone.png", label: "Experience · CBOT active, its evidence branch lit", viewport: DESKTOP, theme: "dark", path: EXPERIENCE, steps: [["into", ".v4-career"], ["hover", node("r1")]] },
  { name: "03-experience-mobile.png", label: "Experience · mobile · vertical current, folded milestones", viewport: MOBILE, theme: "dark", path: EXPERIENCE, steps: [["top", ".experience-timeline"]] },
  { name: "04-experience-light.png", label: "Experience · light · career current", viewport: DESKTOP, theme: "light", path: EXPERIENCE, steps: [["into", ".v4-career"]] },
  { name: "05-certificates-dark-grid.png", label: "Certificates · dark · Credential Grid", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, steps: [["top", ".v4-sky__controls"]] },
  { name: "06-certificates-dark-constellation.png", label: "Certificates · dark · Learning Constellation (by skill area)", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, steps: SKY },
  { name: "07-certificates-active-cluster.png", label: "Certificates · Networking & Systems chosen, a credential open", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, steps: [...SKY, ["click", hub(6)], ["click", star(8)]] },
  { name: "08-certificates-mobile.png", label: "Certificates · mobile · cluster rail and credential list", viewport: MOBILE, theme: "dark", path: CERTIFICATES, steps: [["click", mode("constellation")], ["click", star(4)], ["top", ".v4-sky__controls"]] },
  { name: "09-certificates-light.png", label: "Certificates · light · constellation, linked credential open", viewport: DESKTOP, theme: "light", path: CERTIFICATES, steps: [...SKY, ["click", star(4)]] },
  { name: "10-about-dark-human-system-map.png", label: "About · dark · human system map", viewport: DESKTOP, theme: "dark", path: ABOUT, steps: [["into", ".v4-human"]] },
  { name: "11-about-active-theme.png", label: "About · AI Deployment active", viewport: DESKTOP, theme: "dark", path: ABOUT, steps: [["into", ".v4-human"], ["hover", node("applied-ai")]] },
  { name: "12-about-mobile.png", label: "About · mobile · the person first", viewport: MOBILE, theme: "dark", path: ABOUT },
  { name: "13-about-light.png", label: "About · light · Full-Stack Delivery pinned", viewport: DESKTOP, theme: "light", path: ABOUT, steps: [["into", ".v4-human"], ["click", node("software")]] },
  { name: "14-reduced-motion.png", label: "Experience · reduced motion · Atölye Joyday active", viewport: DESKTOP, theme: "dark", path: EXPERIENCE, reducedMotion: true, steps: [["into", ".v4-career"], ["hover", node("r0")]] },
  { name: "15-no-js-certificates.png", label: "Certificates · JavaScript disabled (ordinary credential grid)", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, noJs: true, steps: [["top", ".training-catalog"]] },
  { name: "16-no-js-experience.png", label: "Experience · JavaScript disabled (chart of links, open chronology)", viewport: DESKTOP, theme: "dark", path: EXPERIENCE, noJs: true, steps: [["into", ".v4-career"]] },
  { name: "17-no-js-about.png", label: "About · JavaScript disabled", viewport: DESKTOP, theme: "dark", path: ABOUT, noJs: true, steps: [["into", ".v4-human"]] },
  { name: "18-experience-chronology.png", label: "Experience · the chronology as the current, direction beside it", viewport: DESKTOP, theme: "dark", path: EXPERIENCE, steps: [["top", ".experience-layout"]] },
  { name: "19-certificates-by-provider.png", label: "Certificates · constellation regrouped by provider", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, steps: [["click", mode("constellation")], ["click", mode("provider")], ["into", ".v4-sky"]] },
  { name: "20-certificates-grid-cluster.png", label: "Certificates · the grid narrowed by the same cluster rail", viewport: DESKTOP, theme: "dark", path: CERTIFICATES, steps: [["click", cluster("a5")], ["top", ".v4-sky__controls"]] },
  { name: "21-about-narrative.png", label: "About · narrative: profile beside its heading, tracker marking it", viewport: DESKTOP, theme: "dark", path: ABOUT, steps: [["click", "[data-v4-tracker] li:first-child a"]] },
  { name: "22-about-journey-handoff.png", label: "About · journey on one current, handing on to Experience", viewport: DESKTOP, theme: "dark", path: ABOUT, steps: [["into", ".journey-grid"]] },
  { name: "23-about-mobile-themes.png", label: "About · mobile · each theme with its own evidence", viewport: MOBILE, theme: "dark", path: ABOUT, steps: [["top", ".v4-human__panels"]] },
  { name: "24-experience-light-chronology.png", label: "Experience · light · chronology", viewport: DESKTOP, theme: "light", path: EXPERIENCE, steps: [["top", ".experience-layout"]] },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, touch = false, path = "/", settle = 2600, waitUntil = "networkidle0" }, problems) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) problems.push(`${path} ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.evaluateOnNewDocument((nextTheme) => localStorage.setItem("kaanbalci-site-theme", nextTheme), theme);
  /* React reports a hydration mismatch as an event, not on the console. */
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
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
const shownCount = (page, selector) => page.evaluate((target) => [...document.querySelectorAll(target)].filter((entry) => entry.getClientRects().length).length, selector);

/* The career chart, as the page reports it. */
const career = (page) => page.evaluate(() => {
  const root = document.querySelector(".v4-career");
  const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length);
  return {
    chartShown: root.getClientRects().length > 0,
    roles: [...root.querySelectorAll('[data-v4-eco-kind="role"]')].map((entry) => entry.querySelector(".v4-eco__title").textContent.trim()),
    anchorsResolve: [...root.querySelectorAll('[data-v4-eco-kind="role"]')].every((entry) => document.querySelector(entry.getAttribute("href"))?.matches(".experience-item")),
    live: root.querySelectorAll(".v4-career__role[data-v4-live]").length,
    evidence: [...root.querySelectorAll('[data-v4-eco-kind="project"]')].map((entry) => entry.getAttribute("href")),
    cardLinks: [...document.querySelectorAll(".experience-card > a")].map((entry) => entry.getAttribute("href")),
    threads: [...root.querySelectorAll('[data-v4-eco-kind="thread"]')].map((entry) => entry.textContent.trim()),
    years: [...root.querySelectorAll(".v4-career__years li")].map((entry) => entry.textContent.trim()),
    active: root.hasAttribute("data-v4-eco-active"),
    activeNode: root.querySelector('[data-v4-state="active"][data-v4-eco-node]')?.getAttribute("data-v4-eco-node") || null,
    litEdges: root.querySelectorAll('[data-v4-edge][data-v4-state="active"]').length,
    entry: shown("[data-v4-eco-panel]").map((entry) => entry.getAttribute("data-v4-eco-panel")).join(),
    entryText: shown("[data-v4-eco-panel]").map((entry) => entry.textContent.replace(/\s+/g, " ").trim()).join(),
    milestones: document.querySelectorAll("[data-v4-milestone]").length,
    folded: document.querySelectorAll("[data-v4-folded]").length,
    toggles: shown(".v4-milestone__toggle").length,
    accounts: shown(".experience-card > p").length,
    direction: document.querySelector(root.querySelector(".v4-career__direction").getAttribute("href"))?.matches(".experience-summary") || false,
    onward: document.querySelector(".v4-onward__link")?.getAttribute("href"),
    waiting: root.hasAttribute("data-v4-await"),
  };
});

/* The certificates explorer, as the page reports it. */
const sky = (page) => page.evaluate(() => {
  const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length);
  return {
    view: document.querySelector(".v4-sky-section").getAttribute("data-v4-view"),
    group: document.querySelector(".v4-sky").getAttribute("data-v4-group"),
    modes: shown(".v4-sky__controls .v4-modes__mode").length,
    rail: shown(".v4-sky__cluster").map((entry) => entry.textContent.replace(/\s+/g, " ").trim()),
    pressedCluster: document.querySelector(".v4-sky__cluster[aria-pressed='true']")?.getAttribute("data-v4-cluster") || "all",
    count: document.querySelector(".v4-sky__rail").getAttribute("data-v4-count"),
    cards: shown(".certificate-card").length,
    categories: shown(".training-category").length,
    catalogShown: shown(".training-catalog").length,
    skyShown: shown(".v4-sky").length,
    fieldShown: shown(".v4-sky__field").length,
    stars: shown(".v4-sky__star").length,
    hubs: shown(".v4-sky__hub").map((entry) => entry.querySelector("span").textContent.trim()),
    starsOut: document.querySelectorAll(".v4-sky__stars li[data-v4-out]").length,
    starsLinked: document.querySelectorAll(".v4-sky__star[data-v4-linked]").length,
    litWires: document.querySelectorAll(".v4-sky__wire[data-v4-state]").length,
    pinned: document.querySelectorAll(".v4-sky__star[aria-pressed='true']").length,
    panel: shown(".v4-sky__stars .v4-sky__panel").map((entry) => ({ title: entry.querySelector("h3").textContent.trim(), link: entry.querySelector("a")?.getAttribute("href") || null, firstAction: entry.querySelector(".certificate-actions > *").tagName.toLowerCase() }))[0] || null,
    rest: shown(".v4-sky__rest").map((entry) => entry.textContent.replace(/\s+/g, " ").trim())[0] || null,
    credentialLinks: [...document.querySelectorAll(".certificate-card .certificate-actions a")].map((entry) => entry.getAttribute("href")),
    modalOpen: document.querySelector(".image-modal").classList.contains("is-open"),
  };
});

/* The human system map, as the page reports it. */
const human = (page) => page.evaluate(() => {
  const root = document.querySelector(".v4-human");
  const shown = (selector) => [...document.querySelectorAll(selector)].filter((entry) => entry.getClientRects().length);
  return {
    sections: [...document.querySelectorAll("main > *")].map((entry) => entry.matches(".page-hero") ? "hero" : entry.matches(".v4-tracker") ? "tracker" : entry.matches(".v4-human-section") ? "map" : entry.matches(".about-hero") ? "profile" : entry.matches(".journey-section") ? "journey" : entry.matches(".v4-onward") ? "onward" : entry.matches(".contact-hub") ? "contact" : entry.querySelector(".process-list") ? "process" : entry.querySelector(".capability-grid") ? "capability" : entry.querySelector(".toolbox-grid") ? "toolbox" : "?").join(" → "),
    fieldShown: shown(".v4-human__field").length,
    themes: [...root.querySelectorAll('[data-v4-eco-kind="capability"]')].map((entry) => `${entry.getAttribute("data-v4-eco-node")}: ${entry.getAttribute("data-v4-eco-links")}`),
    themeLabels: [...root.querySelectorAll('[data-v4-eco-kind="capability"]')].map((entry) => entry.textContent.trim()),
    projects: [...root.querySelectorAll('[data-v4-eco-kind="project"]')].map((entry) => entry.getAttribute("href")),
    edges: root.querySelectorAll(".v4-human__edge").length,
    portraits: shown('main img[src*="kaan-balci-profile"]').length,
    active: root.hasAttribute("data-v4-eco-active"),
    activeNode: root.querySelector('[data-v4-state="active"][data-v4-eco-node]')?.getAttribute("data-v4-eco-node") || null,
    related: [...root.querySelectorAll('[data-v4-state="related"][data-v4-eco-node]')].map((entry) => entry.getAttribute("data-v4-eco-node")).join(),
    litEdges: root.querySelectorAll('.v4-human__edge[data-v4-state="active"]').length,
    pressed: [...root.querySelectorAll('[aria-pressed="true"]')].map((entry) => entry.getAttribute("data-v4-eco-node")).join(),
    panel: shown("[data-v4-eco-panel]").map((entry) => entry.getAttribute("data-v4-eco-panel")).join(),
    panelHeading: shown("[data-v4-eco-panel] h3").map((entry) => entry.textContent.trim()).join(" | "),
    groups: shown(".v4-human__theme-panel").length,
    cited: shown(".v4-human__cited a").length,
    ports: [...document.querySelectorAll(".contact-actions [data-v4-cap]")].map((entry) => entry.getAttribute("data-v4-cap")).join(),
    litPorts: document.querySelectorAll('.contact-actions [data-v4-cap][data-v4-state="related"]').length,
    tracker: [...document.querySelectorAll("[data-v4-tracker] a")].map((entry) => entry.textContent.replace(/\s+/g, " ").trim()),
    trackerTargets: [...document.querySelectorAll("[data-v4-tracker] a")].every((entry) => document.getElementById(entry.getAttribute("href").slice(1))),
    trackerCurrent: [...document.querySelectorAll("[data-v4-tracker] a[aria-current]")].map((entry) => entry.getAttribute("href")).join(),
    onward: document.querySelector(".v4-onward__link")?.getAttribute("href"),
    canvases: document.querySelectorAll("canvas").length,
    runtime: typeof window.V4Motion?.destroy === "function",
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
  const film = await open(browser, { viewport: DESKTOP, theme: "dark", path: EXPERIENCE, settle: 0, waitUntil: "domcontentloaded" }, problems);
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
  const jump = (selector, block = "center") => film.evaluate((target, where) => document.querySelector(target).scrollIntoView({ block: where, behavior: "instant" }), selector, block);
  await film.waitForSelector(".v4-career");
  await jump(".v4-career"); await wait(650); await frame("Experience: the current entering, lanes beginning to draw");
  await wait(900); await frame("Experience: roles waking in date order");
  await wait(3200); await frame("Career current: at rest");
  await glide(node("r1") + " .v4-node__dot"); await wait(320); await frame("Milestone activation: CBOT under the pointer, the rest receding");
  await wait(600); await frame("Evidence branch: the pulse reaches AI Chatbot Flow Design");
  await glide(node("ai-chatbot-flow-design") + " .v4-eco__title"); await wait(700); await frame("Evidence branch highlight: the project lights the role that links it");
  await glide(node("t0")); await film.mouse.move(3, 300, { steps: 6 }); await glide(node("r0") + " .v4-node__dot"); await wait(700); await frame("The live role: Atölye Joyday, still running");
  await Promise.all([film.click(node("r0")), wait(1500)]); await film.mouse.move(3, 300); await wait(600); await frame("Choosing a role arrives at its entry in the chronology");
  await film.goto(`${ORIGIN}${CERTIFICATES}`, { waitUntil: "networkidle0" }); await wait(1800);
  await jump(".v4-sky__controls", "start"); await film.evaluate(() => window.scrollBy({ top: -140, behavior: "instant" })); await wait(900); await frame("Certificates: Credential Grid");
  await film.click(mode("constellation")); await film.mouse.move(3, 300); await wait(330); await frame("Grid to Constellation: clusters arriving, wires beginning to draw");
  await wait(1700); await jump(".v4-sky"); await wait(700); await frame("Learning Constellation: at rest");
  await glide(hub(6)); await wait(600); await frame("Cluster under the pointer: Networking and Systems lights its credentials");
  await film.mouse.down(); await film.mouse.up(); await film.mouse.move(720, 130, { steps: 8 }); await wait(900); await frame("Cluster activation: chosen, the others recede, the rail agrees");
  await glide(star(8) + " .v4-node__dot"); await film.mouse.down(); await film.mouse.up(); await wait(800); await frame("Active credential: its details open beside the field");
  await jump(".v4-sky__controls", "start"); await film.evaluate(() => window.scrollBy({ top: -110, behavior: "instant" })); await wait(700);
  await film.click(mode("provider")); await film.mouse.move(3, 300); await wait(280); await frame("Regroup by provider: stars travelling, old wires gone");
  await jump(".v4-sky"); await wait(1900); await frame("By provider: settled");
  await film.goto(`${ORIGIN}${ABOUT}`, { waitUntil: "networkidle0" }); await wait(500);
  await jump(".v4-human"); await wait(500); await frame("About: the human system map drawing its wires");
  await wait(2600); await frame("Human system map: at rest");
  await glide(node("applied-ai")); await wait(380); await frame("Human-map activation: AI Deployment under the pointer, pulses leaving");
  await film.mouse.down(); await film.mouse.up(); await film.mouse.move(1150, 760, { steps: 8 }); await wait(900); await frame("Theme pinned: what it stands for and the work it cites");
  await glide(node("sinama") + " .v4-eco__title"); await wait(800); await frame("A project under the pointer: the themes that cite it answer");
  await film.keyboard.press("Escape"); await film.mouse.move(3, 300);
  await film.click("[data-v4-tracker] li:first-child a"); await film.mouse.move(3, 300); await wait(1700); await frame("Narrative scroll: who, with the tracker marking the profile");
  await jump(".journey-grid"); await wait(420); await frame("Narrative scroll: the journey's current running as it is first seen");
  await wait(1900); await glide(".v4-onward__link strong"); await wait(800); await frame("Narrative handoff: the way on to Experience under the pointer");
  await Promise.all([film.waitForNavigation({ waitUntil: "networkidle0" }), film.click(".v4-onward__link")]);
  await wait(2600); await frame("Handoff: arrived at Experience");
  await film.close();

  /* ---------- Experience smoke ---------- */
  const e = {};
  const experience = await open(browser, { viewport: DESKTOP, theme: "dark", path: EXPERIENCE }, problems);
  e.initial = await career(experience);
  expect("Experience: six roles on the chart, each linking to its own entry, one of them live", e.initial.chartShown && e.initial.roles.length === 6 && e.initial.anchorsResolve && e.initial.live === 1 && e.initial.milestones === 6);
  expect("Experience: a branch exists only for a role whose entry links to a project, to that same project", e.initial.evidence.length === e.initial.cardLinks.length && e.initial.evidence.every((href) => e.initial.cardLinks.includes(href)));
  expect("Experience: the chart rests on its real totals and leads to the page's own direction", e.initial.entry === "" && /06/.test(e.initial.entryText) && e.initial.direction && !e.initial.active);
  const reachable = await Promise.all([...e.initial.evidence, e.initial.onward].map(async (href) => (await fetch(`${ORIGIN}${href}`)).status));
  expect("Experience: every evidence link and the way on resolve", reachable.every((status) => status === 200));
  await scrollTo(experience, ".v4-career", "into");
  await experience.hover(node("r1")); await wait(700);
  e.hover = await career(experience);
  expect("Experience: pointing at CBOT lights its run and its one branch, and shows its entry", e.hover.active && e.hover.activeNode === "r1" && e.hover.litEdges === 2 && e.hover.entry === "r1" && /CBOT/.test(e.hover.entryText));
  await experience.mouse.move(3, 300); await wait(600);
  e.released = await career(experience);
  expect("Experience: leaving the chart returns it to rest", !e.released.active && e.released.entry === "");
  await experience.focus(node("r5")); await wait(500);
  e.keyboard = await career(experience);
  expect("Experience keyboard: focusing a role activates it and its shared thread", e.keyboard.activeNode === "r5" && e.keyboard.entry === "r5" && e.keyboard.litEdges === 2);
  await experience.keyboard.press("Enter"); await wait(1200);
  e.followed = await experience.evaluate(() => ({ hash: location.hash, onScreen: (() => { const rect = document.querySelector(location.hash).getBoundingClientRect(); return rect.top >= 0 && rect.top < innerHeight; })() }));
  expect("Experience keyboard: Enter on a role arrives at its entry", e.followed.hash === "#v4-role-5" && e.followed.onScreen);
  await experience.evaluate(() => document.activeElement.blur()); await experience.mouse.move(3, 300);
  await wait(2600);
  e.atRest = await motionState(experience);
  expect("Experience: nothing loops and the page comes to rest", e.atRest.endless === 0 && e.atRest.running === 0);
  expect("Experience desktop: no horizontal overflow", (await overflow(experience)) === 0);
  await experience.close();

  const experiencePhone = await open(browser, { viewport: MOBILE, theme: "dark", path: EXPERIENCE, touch: true }, problems);
  e.phone = await career(experiencePhone);
  expect("Experience phone: no squeezed chart; six milestones, all but the first folded", !e.phone.chartShown && e.phone.milestones === 6 && e.phone.folded === 5 && e.phone.toggles === 6 && e.phone.accounts === 1);
  await experiencePhone.evaluate(() => document.querySelector("#v4-role-1").scrollIntoView({ block: "center", behavior: "instant" })); await wait(500);
  await experiencePhone.tap("#v4-role-1 .v4-milestone__toggle"); await wait(600);
  e.phoneOpened = { ...(await career(experiencePhone)), expanded: await experiencePhone.evaluate(() => document.querySelector("#v4-role-1 .v4-milestone__toggle").getAttribute("aria-expanded")) };
  expect("Experience touch: tapping a milestone opens its account", e.phoneOpened.folded === 4 && e.phoneOpened.accounts === 2 && e.phoneOpened.expanded === "true");
  expect("Experience mobile: no horizontal overflow", (await overflow(experiencePhone)) === 0);
  await experiencePhone.close();

  const experiencePlain = await open(browser, { viewport: DESKTOP, theme: "dark", path: EXPERIENCE, noJs: true, settle: 300 }, []);
  e.noJs = await career(experiencePlain);
  expect("Experience without JavaScript: the chart is links, the chronology is open, nothing waits", e.noJs.roles.length === 6 && e.noJs.anchorsResolve && e.noJs.accounts === 6 && e.noJs.toggles === 0 && e.noJs.folded === 0 && !e.noJs.waiting);
  await experiencePlain.close();
  const experienceNarrowPlain = await open(browser, { viewport: MOBILE, theme: "dark", path: EXPERIENCE, noJs: true, settle: 300 }, []);
  e.noJsPhone = await career(experienceNarrowPlain);
  expect("Experience phone without JavaScript: every account is readable, nothing is folded", e.noJsPhone.accounts === 6 && e.noJsPhone.toggles === 0);
  await experienceNarrowPlain.close();
  const experienceStill = await open(browser, { viewport: DESKTOP, theme: "dark", path: EXPERIENCE, reducedMotion: true }, problems);
  await experienceStill.hover(node("r0")); await wait(400);
  e.reducedMotion = { ...(await career(experienceStill)), motion: await motionState(experienceStill) };
  expect("Experience reduced motion: activation still works, nothing animates", e.reducedMotion.activeNode === "r0" && e.reducedMotion.motion.running === 0);
  await experienceStill.close();

  /* ---------- Certificates smoke ---------- */
  const c = {};
  const certificates = await open(browser, { viewport: DESKTOP, theme: "dark", path: CERTIFICATES }, problems);
  c.initial = await sky(certificates);
  expect("Certificates opens as the Credential Grid with both switches offered", c.initial.view === "grid" && c.initial.modes === 4 && c.initial.cards === 9 && c.initial.categories === 6 && c.initial.skyShown === 0 && c.initial.count === "09 / 09");
  expect("Certificates: the rail lists the page's own six categories", c.initial.rail.length === 7 && c.initial.pressedCluster === "all");
  await certificates.click(cluster("a5")); await wait(700);
  c.gridCluster = await sky(certificates);
  expect("Certificates grid: a cluster narrows the archive to its own credentials", c.gridCluster.cards === 3 && c.gridCluster.categories === 1 && c.gridCluster.count === "03 / 09");
  await certificates.click(mode("constellation")); await certificates.mouse.move(3, 300); await wait(1500);
  c.constellation = await sky(certificates);
  expect("Constellation: replaces the grid without a reload and keeps the chosen cluster", c.constellation.view === "constellation" && c.constellation.catalogShown === 0 && c.constellation.fieldShown === 1 && c.constellation.stars === 9 && c.constellation.hubs.length === 6 && c.constellation.pressedCluster === "a5" && c.constellation.starsOut === 6 && c.constellation.litWires === 3);
  expect("Constellation: exactly the credentials that carry a link are marked as linked", c.constellation.starsLinked === c.initial.credentialLinks.length && c.constellation.starsLinked === 6);
  await certificates.click(cluster("a5")); await wait(500);
  await scrollTo(certificates, ".v4-sky", "into");
  await certificates.hover(hub(1)); await wait(600);
  c.hubHover = await sky(certificates);
  expect("Constellation: pointing at a cluster lights its credentials and reports its real count", c.hubHover.litWires === 2 && /02/.test(c.hubHover.rest || ""));
  await certificates.click(star(4)); await wait(700);
  c.open = await sky(certificates);
  expect("Constellation: a chosen credential opens its details, its own link first", c.open.pinned === 1 && c.open.panel && c.open.panel.link === c.initial.credentialLinks[3] && c.open.panel.firstAction === "a");
  await certificates.click(".v4-sky__stars li:nth-child(4) .v4-sky__panel .certificate-preview"); await wait(700);
  c.preview = await sky(certificates);
  await certificates.keyboard.press("Escape"); await wait(500);
  c.previewClosed = await sky(certificates);
  expect("Constellation: the credential's preview opens the page's own dialog and Escape closes it", c.preview.modalOpen && !c.previewClosed.modalOpen);
  await certificates.focus(star(9)); await certificates.keyboard.press("Enter"); await wait(600);
  c.keyboard = await sky(certificates);
  expect("Constellation keyboard: Enter on a credential opens it; one without a link offers only its preview", c.keyboard.panel && c.keyboard.panel.link === null && c.keyboard.panel.firstAction === "button");
  await certificates.evaluate(() => document.activeElement.blur());
  await scrollTo(certificates, ".v4-sky__controls", "top");
  await certificates.click(mode("provider")); await certificates.mouse.move(3, 300); await wait(1600);
  c.provider = await sky(certificates);
  expect("Constellation: regrouping by provider reconfigures it into the two real providers and clears the choice", c.provider.group === "provider" && c.provider.hubs.length === 2 && c.provider.rail.length === 3 && c.provider.pressedCluster === "all" && c.provider.pinned === 0 && c.provider.stars === 9);
  await certificates.click(cluster("p1")); await wait(700);
  c.providerCluster = await sky(certificates);
  await certificates.click(mode("grid")); await wait(700);
  c.providerGrid = await sky(certificates);
  expect("Certificates: a provider cluster is the same choice in the constellation and in the grid", c.providerCluster.starsOut === 6 && c.providerCluster.count === "03 / 09" && c.providerGrid.cards === 3 && c.providerGrid.pressedCluster === "p1");
  await certificates.mouse.move(3, 300); await wait(2600);
  c.atRest = await motionState(certificates);
  expect("Certificates: nothing loops and the page comes to rest", c.atRest.endless === 0 && c.atRest.running === 0);
  expect("Certificates desktop: no horizontal overflow", (await overflow(certificates)) === 0);
  await certificates.close();

  const certificatesPhone = await open(browser, { viewport: MOBILE, theme: "dark", path: CERTIFICATES, touch: true }, problems);
  await certificatesPhone.evaluate(() => document.querySelector(".v4-sky__controls").scrollIntoView({ block: "center", behavior: "instant" })); await wait(400);
  await certificatesPhone.tap(mode("constellation")); await wait(800);
  c.phone = { ...(await sky(certificatesPhone)), railScrolls: await certificatesPhone.evaluate(() => { const rail = document.querySelector(".v4-sky__rail"); return rail.scrollWidth > rail.clientWidth; }) };
  expect("Certificates phone: a scrollable cluster rail over a credential list, no squeezed field", c.phone.view === "constellation" && c.phone.fieldShown === 0 && c.phone.stars === 9 && c.phone.railScrolls);
  await certificatesPhone.tap(star(1)); await wait(600);
  c.phoneOpen = await sky(certificatesPhone);
  expect("Certificates touch: tapping a credential opens its details in place, link first", c.phoneOpen.pinned === 1 && c.phoneOpen.panel?.firstAction === "a");
  await certificatesPhone.tap(cluster("a5")); await wait(600);
  c.phoneCluster = await sky(certificatesPhone);
  expect("Certificates touch: a cluster narrows the list", c.phoneCluster.stars === 3);
  expect("Certificates mobile: no horizontal overflow", (await overflow(certificatesPhone)) === 0);
  await certificatesPhone.close();

  const certificatesPlain = await open(browser, { viewport: DESKTOP, theme: "dark", path: CERTIFICATES, noJs: true, settle: 300 }, []);
  c.noJs = { cards: await shownCount(certificatesPlain, ".certificate-card"), modes: await shownCount(certificatesPlain, ".v4-modes__mode"), rail: await shownCount(certificatesPlain, ".v4-sky__cluster"), sky: await shownCount(certificatesPlain, ".v4-sky"), links: await shownCount(certificatesPlain, ".certificate-card .certificate-actions a") };
  expect("Certificates without JavaScript: the ordinary grid, every credential and link, no switches", c.noJs.cards === 9 && c.noJs.modes === 0 && c.noJs.rail === 0 && c.noJs.sky === 0 && c.noJs.links === 6);
  await certificatesPlain.close();
  const certificatesStill = await open(browser, { viewport: DESKTOP, theme: "dark", path: CERTIFICATES, reducedMotion: true }, problems);
  await certificatesStill.click(mode("constellation")); await certificatesStill.click(mode("provider")); await certificatesStill.mouse.move(3, 300); await wait(500);
  c.reducedMotion = { ...(await sky(certificatesStill)), motion: await motionState(certificatesStill) };
  expect("Certificates reduced motion: views and grouping still switch, nothing animates", c.reducedMotion.view === "constellation" && c.reducedMotion.group === "provider" && c.reducedMotion.motion.running === 0);
  await certificatesStill.close();

  /* ---------- About smoke ---------- */
  const a = {};
  const about = await open(browser, { viewport: DESKTOP, theme: "dark", path: ABOUT }, problems);
  a.initial = await human(about);
  expect("About reads in narrative order", a.initial.sections === "hero → tracker → map → profile → process → capability → toolbox → journey → onward → contact");
  expect("About: the map's themes are the page's own four capability focuses", a.initial.themes.length === 4 && a.initial.ports === a.initial.themes.map((theme) => theme.split(":")[0]).join());
  expect("About: five evidence projects on eleven wires, one portrait, no canvas", a.initial.projects.length === 5 && a.initial.edges === 11 && a.initial.portraits === 1 && a.initial.canvases === 0);
  expect("About: at rest the map lists what each theme stands for", a.initial.panel === "" && !a.initial.active);
  expect("About: the tracker reaches every chapter", a.initial.tracker.length === 6 && a.initial.trackerTargets);
  const aboutLinks = await Promise.all([...a.initial.projects, a.initial.onward].map(async (href) => (await fetch(`${ORIGIN}${href}`)).status));
  expect("About: every project link and the way on resolve", aboutLinks.every((status) => status === 200));
  await scrollTo(about, ".v4-human", "into");
  await about.hover(node("game")); await wait(700);
  a.hover = await human(about);
  expect("About: pointing at a theme lights exactly the work its profile cites", a.hover.activeNode === "game" && a.hover.related === "hospital,mergeRush" && a.hover.litEdges === 2 && a.hover.panel === "game" && a.hover.litPorts === 1);
  await about.click(node("applied-ai")); await about.mouse.move(1150, 760); await wait(700);
  a.pinned = await human(about);
  expect("About: pressing a theme pins it and keeps its statement open", a.pinned.pressed === "applied-ai" && a.pinned.panel === "applied-ai" && a.pinned.litEdges === 3 && a.pinned.cited === 3);
  await about.hover(node("hospital")); await wait(600);
  a.project = await human(about);
  expect("About: a project lights the themes that cite it", a.project.activeNode === "hospital" && a.project.related === "software,game" && a.project.panel === "hospital");
  await about.focus(node("applied-ai")); await about.keyboard.press("Escape"); await about.evaluate(() => document.activeElement.blur()); await about.mouse.move(3, 300); await wait(600);
  a.released = await human(about);
  expect("About keyboard: Escape releases the pin and the map returns to rest", a.released.pressed === "" && !a.released.active && a.released.panel === "");
  await about.click("[data-v4-tracker] li:first-child a"); await wait(1500);
  a.narrative = await human(about);
  expect("About: the tracker marks the chapter being read", a.narrative.trackerCurrent === "#v4-s-1");
  const session = await about.createCDPSession();
  await session.send("Performance.enable");
  const sample = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  await wait(2500);
  a.atRest = await motionState(about);
  const before = await sample();
  await wait(5000);
  const after = await sample();
  const idle = Object.fromEntries(["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((name) => [name, Math.round((after[name] - before[name]) * 1000)]));
  expect("About: nothing loops and the page comes to rest", a.atRest.endless === 0 && a.atRest.running === 0);
  a.pausedOffscreen = await about.evaluate(() => {
    const regions = [...document.querySelectorAll("[data-v4-ambient], [data-v4-eco], [data-v4-arrive]")];
    const off = regions.filter((region) => { const rect = region.getBoundingClientRect(); return rect.bottom < -64 || rect.top > innerHeight + 64; });
    return { offscreen: off.length, paused: off.filter((region) => region.hasAttribute("data-v4-paused")).length };
  });
  expect("About: offscreen V4 regions are paused", a.pausedOffscreen.offscreen > 0 && a.pausedOffscreen.paused === a.pausedOffscreen.offscreen);
  const lcp = await about.evaluate(() => new Promise((done) => {
    new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      done({ ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null });
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(null), 1500);
  }));
  expect("About desktop: no horizontal overflow", (await overflow(about)) === 0);
  await about.close();

  const aboutPhone = await open(browser, { viewport: MOBILE, theme: "dark", path: ABOUT, touch: true }, problems);
  a.phone = await human(aboutPhone);
  expect("About phone: the portrait leads and each theme is a group of its own evidence, no squeezed orbit", a.phone.fieldShown === 0 && a.phone.portraits === 1 && a.phone.groups === 4 && a.phone.cited === 11);
  expect("About mobile: no horizontal overflow", (await overflow(aboutPhone)) === 0);
  await aboutPhone.close();
  const aboutPlain = await open(browser, { viewport: DESKTOP, theme: "dark", path: ABOUT, noJs: true, settle: 300 }, []);
  a.noJs = await human(aboutPlain);
  expect("About without JavaScript: the map, its project links, its themes' statements and the tracker are all there", a.noJs.projects.length === 5 && a.noJs.panel === "" && a.noJs.tracker.length === 6 && a.noJs.portraits === 1 && a.noJs.sections === a.initial.sections);
  await aboutPlain.close();
  const aboutStill = await open(browser, { viewport: DESKTOP, theme: "dark", path: ABOUT, reducedMotion: true }, problems);
  await aboutStill.click(node("software")); await aboutStill.mouse.move(1150, 760); await wait(400);
  a.reducedMotion = { ...(await human(aboutStill)), motion: await motionState(aboutStill) };
  expect("About reduced motion: a theme still pins, nothing animates", a.reducedMotion.pressed === "software" && a.reducedMotion.motion.running === 0);
  await aboutStill.close();

  /* ---------- all three surfaces in every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = {};
    for (const [surface, path] of SURFACES) {
      const wide = await open(browser, { viewport: DESKTOP, theme: "dark", path: localized(locale, path), settle: 800 }, problems);
      if (surface === "certificates") { await wide.click(mode("constellation")); await wait(900); }
      const narrow = await open(browser, { viewport: MOBILE, theme: "dark", path: localized(locale, path), settle: 800 }, problems);
      if (surface === "certificates") { await narrow.click(mode("constellation")); await wait(600); }
      locales[locale][surface] = { desktop: await overflow(wide), mobile: await overflow(narrow) };
      if (surface === "experience") locales[locale].labels = await wide.evaluate(() => [document.querySelector(".v4-career-section > .eyebrow").textContent.trim(), document.querySelector(".v4-career__now").textContent.trim(), document.querySelector(".v4-career__direction").textContent.trim()]);
      if (surface === "experience") locales[locale].clipped = await wide.evaluate(() => { const box = document.querySelector(".v4-career").getBoundingClientRect(); return [...document.querySelectorAll(".v4-career .v4-node")].filter((entry) => { const rect = entry.getBoundingClientRect(); return rect.left < 0 || rect.right > innerWidth || rect.bottom > box.bottom + 4; }).length; });
      if (surface === "certificates") locales[locale].modes = await wide.evaluate(() => [...document.querySelectorAll(".v4-modes__mode")].map((entry) => entry.textContent.trim()));
      if (surface === "about") locales[locale].themes = await wide.evaluate(() => [...document.querySelectorAll(".v4-human__theme")].map((entry) => entry.textContent.trim()));
      expect(`${locale} ${surface}: no horizontal overflow at 1440 or 390`, locales[locale][surface].desktop === 0 && locales[locale][surface].mobile === 0);
      await wide.close();
      await narrow.close();
    }
    expect(`${locale}: the career chart keeps every label inside its field`, locales[locale].clipped === 0);
  }

  /* ---------- measurements + pack ---------- */
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-experience.css", "css/v4-certificates.css", "css/v4-about.css", "js/v4/runtime.js", reactEntry, "blog/index.html", "certificates/index.html", "about/index.html"].map(sizeOf));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session", frames, 4120);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, experience: e, certificates: c, about: a, idleFiveSecondsMs: idle, lcp, locales, sizes, motionFrames: frames.map((entry) => entry.label), consoleProblems: problems, failures };
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
- Console warnings/errors (including React hydration reports): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Experience: roles ${e.initial.roles.join(" · ")}; years ${e.initial.years.join(" ")}; ${e.initial.live} live; branches to ${e.initial.evidence.join(" and ")}; shared thread ${e.initial.threads.join(", ") || "none"}; CBOT under the pointer lights ${e.hover.litEdges} edges.
- Experience phone: ${e.phone.folded} of ${e.phone.milestones} milestones folded, ${e.phoneOpened.folded} after one tap; without JavaScript ${e.noJsPhone.accounts} accounts readable.
- Certificates: rail ${c.initial.rail.join(" · ")}; Networking & Systems → grid ${c.gridCluster.count}, constellation ${c.constellation.starsOut} receding and ${c.constellation.litWires} wires lit; ${c.constellation.starsLinked} of 9 credentials carry a link; by provider ${c.provider.hubs.join(" · ")}.
- Certificates without JavaScript: ${c.noJs.cards} cards, ${c.noJs.links} credential links, ${c.noJs.modes} switches.
- About: ${a.initial.sections}; themes ${a.initial.themeLabels.join(" · ")}; wires ${a.initial.themes.join(" | ")}; tracker ${a.initial.tracker.join(" · ")}.
- About phone: ${a.phone.groups} theme groups citing ${a.phone.cited} evidence links.
- Locales (EN/TR/DE/ES/FR; Experience, Certificates constellation and About at 1440 and 390): overflow ${LOCALES.map((locale) => SURFACES.map(([surface]) => `${locales[locale][surface].desktop}/${locales[locale][surface].mobile}`).join("/")).join(" · ")}.

## Performance (headless Chromium, 1440×900)

- About, five idle seconds at rest: main-thread tasks ${idle.TaskDuration} ms, style recalculation ${idle.RecalcStyleDuration} ms, layout ${idle.LayoutDuration} ms, script ${idle.ScriptDuration} ms.
- LCP on About (local, unthrottled): ${lcp ? `${lcp.ms} ms on <${lcp.element}>` : "not reported"}.
- No canvas, no animation loop: at rest ${e.atRest.running} time-driven animations running on Experience, ${c.atRest.running} on Certificates and ${a.atRest.running} on About.

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
