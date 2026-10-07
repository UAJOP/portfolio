/* V4 review pack: screenshots + focused smoke + measurements, in one command.
 *
 *   npm run v4:review-pack        (build, then everything below)
 *   npm run v4:capture            (the same, against the existing dist-site/)
 *
 * Captures the production build in dist-site/ through the local preview
 * server and writes the pack outside the repository (V4 rule: review
 * artifacts never live in Git): numbered screenshots, 00-contact-sheet.png,
 * README.md, qa-summary.json and one zip of all of it. The same run is the
 * phase's focused QA: it fails on console problems, horizontal overflow, a
 * missing primitive, a flow label or floating control colliding with the
 * layout in any locale, or V4 route assets leaking onto an unrelated route. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PHASE = "v4-01-design-motion-system";
const OUTPUT = process.env.V4_CAPTURE_DIR || `C:\\PC-Audit\\v4-review\\${PHASE}`;
/* Its own port: 4174 may be held by a long-running `npm run dev:v4`. */
const PORT = process.env.V4_CAPTURE_PORT || "4184";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_SCRIPT = join(ROOT, "scripts", "v4-preview-server.mjs");
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 1100, height: 900 };
const MOBILE = { width: 390, height: 844 };
const LOCALES = ["en", "tr", "de", "es", "fr"];
const NARROW_WIDTHS = [1024, 1100, 1180];
const homePath = (locale) => (locale === "en" ? "/" : `/${locale}/`);
/* The signal is a 13s journey that runs once. Moving captures park it at this
 * moment, so a capture is the same picture on every run: the signal has just
 * left Build for Evaluate. */
const SIGNAL_MOMENT_MS = 8200;

/* In contact-sheet order. */
const shots = [
  { name: "01-desktop-dark-home.png", label: "Desktop dark · Home", viewport: DESKTOP, theme: "dark" },
  { name: "02-desktop-light-home.png", label: "Desktop light · Home", viewport: DESKTOP, theme: "light" },
  { name: "03-mobile-dark-home.png", label: "Mobile dark · Home", viewport: MOBILE, theme: "dark" },
  { name: "04-mobile-light-home.png", label: "Mobile light · Home", viewport: MOBILE, theme: "light" },
  { name: "05-desktop-active-signal.png", label: "Desktop dark · active signal (pointer near Evaluate)", viewport: DESKTOP, theme: "dark", pointer: "evaluate" },
  { name: "06-desktop-reduced-motion.png", label: "Desktop dark · reduced motion (= resting state)", viewport: DESKTOP, theme: "dark", reducedMotion: true },
  { name: "07-mobile-reduced-motion.png", label: "Mobile dark · reduced motion", viewport: MOBILE, theme: "dark", reducedMotion: true },
  { name: "08-system-primitives.png", label: "System primitives · dark", viewport: DESKTOP, theme: "dark", path: "/__v4/specimen", fullPage: true },
  { name: "09-system-primitives-light.png", label: "System primitives · light", viewport: DESKTOP, theme: "light", path: "/__v4/specimen?theme=light", fullPage: true },
  { name: "10-desktop-dark-handoff.png", label: "Desktop dark · hero → evidence hand-off", viewport: DESKTOP, theme: "dark", scrollTo: "handoff" },
  { name: "11-desktop-light-active-signal.png", label: "Desktop light · active signal (pointer near Scope)", viewport: DESKTOP, theme: "light", pointer: "scope" },
  { name: "12-mobile-dark-handoff.png", label: "Mobile dark · hand-off", viewport: MOBILE, theme: "dark", scrollTo: "handoff" },
  { name: "13-desktop-dark-no-js.png", label: "Desktop dark · JavaScript disabled", viewport: DESKTOP, theme: "dark", noJs: true },
  { name: "14-desktop-dark-works.png", label: "Works · desktop (unrelated route)", viewport: DESKTOP, theme: "dark", path: "/works/", plain: true },
  { name: "15-mobile-dark-works.png", label: "Works · mobile (unrelated route)", viewport: MOBILE, theme: "dark", path: "/works/", plain: true },
  { name: "16-narrow-desktop-tr-flow.png", label: "Narrow desktop 1100 · TR flow labels", viewport: NARROW, theme: "dark", path: homePath("tr") },
  { name: "17-narrow-desktop-de-flow.png", label: "Narrow desktop 1100 · DE flow labels", viewport: NARROW, theme: "dark", path: homePath("de") },
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

async function open(browser, { viewport, theme, reducedMotion = false, noJs = false, path = "/", settle = 2200 }, problems) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) problems.push(`${path} ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  await page.evaluateOnNewDocument((nextTheme) => localStorage.setItem("kaanbalci-site-theme", nextTheme), theme);
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
  if (!noJs) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].filter((image) => image.loading !== "lazy").map((image) => image.complete ? undefined : image.decode().catch(() => undefined)));
    });
  }
  /* Entrances and the heading's one-shot sweep finish before anything is judged. */
  await wait(settle);
  return page;
}

/* The signal's own animations, by name. */
const signalState = (page) => page.evaluate(() => {
  const animations = document.getAnimations().filter((animation) => /^v4-(flow|rule)-/.test(animation.animationName || ""));
  return {
    total: animations.length,
    running: animations.filter((animation) => animation.playState === "running").length,
    unfinished: animations.filter((animation) => animation.playState !== "finished").length,
    endless: document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity).length,
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

/* Flow labels against the layout: inside the hero's content box, clear of the
 * hub caption, the portrait caption and one another. */
const flowLayout = (page) => page.evaluate(() => {
  const box = (element) => element.getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  /* A label may occupy at most one line per word: more means a split word. */
  const wordLines = (label) => ({ lines: Math.round(box(label).height / parseFloat(getComputedStyle(label).lineHeight)), words: label.textContent.trim().split(/\s+/).length });
  const hero = box(document.querySelector(".hero"));
  const stages = [...document.querySelectorAll(".hero .v4-flow__stage")].map((stage) => ({ id: stage.dataset.v4FlowStage, rect: box(stage), text: stage.querySelector(".v4-flow__label").textContent, lines: wordLines(stage.querySelector(".v4-flow__label")) }));
  const hub = [...document.querySelectorAll(".hero .v4-flow__hub > *")].map(box);
  const meta = box(document.querySelector(".hero .profile-meta"));
  const collisions = [];
  stages.forEach((stage, index) => {
    if (stage.rect.right > hero.right + 0.5 || stage.rect.left < hero.left - 0.5) collisions.push(`${stage.id} leaves the hero content box by ${Math.round(Math.max(stage.rect.right - hero.right, hero.left - stage.rect.left))}px`);
    if (stage.lines.lines > stage.lines.words) collisions.push(`${stage.id} label "${stage.text}" is split inside a word`);
    if (hub.some((line) => hit(stage.rect, line))) collisions.push(`${stage.id} meets the hub caption`);
    if (hit(stage.rect, meta)) collisions.push(`${stage.id} meets the portrait caption`);
    for (const other of stages.slice(index + 1)) if (hit(stage.rect, other.rect)) collisions.push(`${stage.id} meets ${other.id}`);
  });
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gutterRoom: Math.round(Math.min(...stages.map((stage) => hero.right - stage.rect.right))),
    labels: stages.map((stage) => stage.text),
    collisions,
  };
});

/* Fixed controls against the first screen's content. */
const floatCollisions = (page) => page.evaluate(() => {
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const controls = [...document.querySelectorAll(".easter-trigger, .chatbot-launcher")].filter((control) => control.getClientRects().length);
  const content = [...document.querySelectorAll(".hero .identity-proof, .hero .hero-actions, .hero .hero-text, .hero .profile-meta, .hero .v4-flow__stage, .hero .v4-signal-rule span")];
  const found = [];
  for (const control of controls) for (const element of content) {
    if (hit(control.getBoundingClientRect(), element.getBoundingClientRect())) found.push(`${control.className.split(" ")[0]} over ${element.className.split(" ")[0] || element.tagName.toLowerCase()}`);
  }
  return { controls: controls.length, found };
});

async function contactSheet(browser) {
  const panels = shots.map((shot, index) => {
    const width = shot.viewport.width === MOBILE.width ? 390 : shot.viewport.width === NARROW.width ? 1100 : 1080;
    return `<figure style="width:${width}px"><figcaption><b>${String(index + 1).padStart(2, "0")}</b>${shot.label}<small>${shot.name}</small></figcaption><img src="${pathToFileURL(join(OUTPUT, shot.name)).href}" width="${width}"></figure>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 48px; background: #1b1e24; color: #f3f1ec; font: 500 22px/1.3 "Segoe UI", Arial, sans-serif; }
    h1 { margin: 0 0 8px; font-size: 44px; } p { margin: 0 0 40px; color: #aab3bf; }
    main { display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
    figure { margin: 0; } img { display: block; height: auto; border: 1px solid #3a414c; }
    figcaption { display: flex; gap: 14px; align-items: baseline; padding: 0 0 12px; }
    figcaption b { padding: 2px 10px; border-radius: 4px; background: #8fb8ee; color: #0a0d12; }
    figcaption small { margin-left: auto; color: #7f8a98; font-size: 15px; }
  </style><h1>V4-01 · Shared Design + Motion System</h1><p>Contact sheet · generated ${new Date().toISOString()} · every panel is a production-build capture; full-size files sit beside this sheet.</p><main>${panels}</main>`;
  const file = join(OUTPUT, "contact-sheet.tmp.html");
  await writeFile(file, html, "utf8");
  const page = await browser.newPage();
  await page.setViewport({ width: 4680, height: 1200, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle0" });
  await page.screenshot({ path: join(OUTPUT, "00-contact-sheet.png"), type: "png", fullPage: true });
  await page.close();
  await rm(file);
  console.log("[v4:capture] 00-contact-sheet.png");
}

let server = null;
let browser = null;

try {
  await mkdir(OUTPUT, { recursive: true });
  /* Screenshots from an earlier run (possibly under older names) are stale. */
  for (const entry of await readdir(OUTPUT)) if (/\.(png|zip)$/.test(entry)) await rm(join(OUTPUT, entry));
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
    if (shot.scrollTo === "handoff") {
      await page.evaluate(() => {
        const next = document.querySelector(".hero + .section-shell");
        window.scrollTo({ top: Math.max(0, next.offsetTop - window.innerHeight * 0.46), behavior: "instant" });
      });
      await wait(700);
    }
    /* Hand-off captures show the moment after delivery: flow at rest, dot landed. */
    if (!shot.reducedMotion && !shot.noJs && !shot.plain) await parkSignal(page, shot.scrollTo ? 17_000 : SIGNAL_MOMENT_MS);
    if (shot.pointer) {
      const target = await page.evaluate((stage) => {
        const node = document.querySelector(`[data-v4-flow-stage="${stage}"] .v4-flow__node`).getBoundingClientRect();
        return { x: node.left + node.width / 2, y: node.top + node.height / 2 };
      }, shot.pointer);
      await page.mouse.move(target.x - 60, target.y + 40);
      await page.mouse.move(target.x + 16, target.y + 6, { steps: 8 });
      await wait(900);
      expect(`${shot.name}: pointer focuses the ${shot.pointer} stage`, await page.evaluate((stage) => {
        const focused = document.querySelector("[data-v4-flow-focus]");
        return focused?.getAttribute("data-v4-flow-stage") === stage && Boolean(document.querySelector(`[data-v4-flow-link="${stage}"][data-v4-on]`));
      }, shot.pointer));
    }
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png", fullPage: Boolean(shot.fullPage), captureBeyondViewport: Boolean(shot.fullPage) });
    console.log(`[v4:capture] ${shot.name}`);
    await page.close();
  }

  /* ---------- Home smoke ---------- */
  const home = await open(browser, { viewport: DESKTOP, theme: "dark" }, problems);
  const homeFacts = await home.evaluate(() => ({
    stages: document.querySelectorAll(".hero .v4-flow__stage").length,
    flowInsideOrderedList: Boolean(document.querySelector(".hero ol.v4-flow__stages[aria-label]")),
    ambient: Boolean(document.querySelector('.hero[data-v4-ambient~="grain"]')),
    kinetic: Boolean(document.querySelector("h1[data-v4-kinetic]")) && !document.querySelector("[data-v4-kinetic-run]"),
    magnetic: document.querySelectorAll("[data-v4-magnetic]").length,
    handoff: Boolean(document.querySelector(".hero > .v4-signal-rule")),
    headingText: document.querySelector("h1").textContent.trim().length > 20,
    runtime: typeof window.V4Motion?.destroy === "function",
    canvases: document.querySelectorAll("canvas").length,
  }));
  expect("Home renders five flow stages in an ordered list", homeFacts.stages === 5 && homeFacts.flowInsideOrderedList);
  expect("Home hero is an ambient region", homeFacts.ambient);
  expect("Home heading is kinetic, readable, and its sweep has ended", homeFacts.kinetic && homeFacts.headingText);
  expect("Home has exactly one magnetic action", homeFacts.magnetic === 1);
  expect("Home hands the signal off to the evidence", homeFacts.handoff);
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

  /* The journey is a burst: bounded, and there is nothing endless on the page. */
  const during = await signalState(home);
  expect("the signal is running its journey after load", during.running > 0);
  expect("no animation on Home loops forever", during.endless === 0);
  const burst = await fiveSeconds();

  /* Offscreen pause mid-journey, then resume. */
  await home.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await wait(600);
  const pausedOffscreen = await home.evaluate(() => {
    const regions = [...document.querySelectorAll("[data-v4-ambient], [data-v4-flow], [data-v4-signal-rule]")];
    return { regions: regions.length, paused: regions.filter((region) => region.hasAttribute("data-v4-paused")).length };
  });
  pausedOffscreen.running = (await signalState(home)).running;
  expect("every V4 region pauses offscreen", pausedOffscreen.regions > 0 && pausedOffscreen.paused === pausedOffscreen.regions && pausedOffscreen.running === 0);
  await home.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await wait(600);
  expect("V4 regions resume when back in view", await home.evaluate(() => !document.querySelector("[data-v4-paused]")) && (await signalState(home)).running > 0);

  /* Rest: wait the journey out, then measure five idle seconds. */
  const waitForRest = async () => {
    const deadline = Date.now() + 30_000;
    while ((await signalState(home)).unfinished > 0 && Date.now() < deadline) await wait(500);
  };
  await waitForRest();
  const resting = await signalState(home);
  expect("the signal comes to rest: every signal animation finished", resting.total > 0 && resting.unfinished === 0);
  expect("at rest the flow's rest stage is lit", await home.evaluate(() => getComputedStyle(document.querySelector("[data-v4-flow-rest] .v4-flow__label")).opacity === "1"));
  await wait(800);
  const idle = await fiveSeconds();

  /* Interaction retriggers the journey... */
  const node = await home.evaluate(() => {
    const rect = document.querySelector('[data-v4-flow-stage="build"] .v4-flow__node').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await home.mouse.move(node.x + 10, node.y + 10, { steps: 4 });
  await wait(300);
  await home.mouse.move(200, 500, { steps: 4 });
  await wait(500);
  expect("releasing a stage replays the journey", (await signalState(home)).running > 0);
  /* ...and so does returning to view once it has finished. */
  await waitForRest();
  await home.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await wait(500);
  await home.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await wait(600);
  expect("returning to view replays a finished journey", (await signalState(home)).running > 0);

  const lcp = await home.evaluate(() => new Promise((done) => {
    new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      done({ ms: Math.round(entry.startTime), element: entry.element?.tagName.toLowerCase() || null });
    }).observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => done(null), 1500);
  }));
  await home.close();

  /* ---------- floating controls vs the first screen ---------- */
  const floats = {};
  for (const viewport of [DESKTOP, { width: 1280, height: 900 }, NARROW]) {
    const page = await open(browser, { viewport, theme: "dark", settle: 1200 }, problems);
    const result = await floatCollisions(page);
    floats[`${viewport.width}x${viewport.height}`] = result;
    expect(`${viewport.width}×${viewport.height}: both floating controls present`, result.controls === 2);
    expect(`${viewport.width}×${viewport.height}: no floating control over first-screen content (${result.found.join("; ")})`, result.found.length === 0);
    await page.close();
  }

  /* ---------- flow labels in every locale at narrow desktop ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    locales[locale] = {};
    for (const width of NARROW_WIDTHS) {
      const page = await open(browser, { viewport: { width, height: 900 }, theme: "dark", path: homePath(locale), settle: 700 }, problems);
      const result = await flowLayout(page);
      locales[locale][width] = result;
      expect(`${locale} @${width}: no horizontal overflow`, result.overflow === 0);
      expect(`${locale} @${width}: five labels`, result.labels.length === 5);
      expect(`${locale} @${width}: flow labels clear (${result.collisions.join("; ")})`, result.collisions.length === 0);
      await page.close();
    }
    /* Phone: the rail in this locale. */
    const phone = await open(browser, { viewport: MOBILE, theme: "dark", path: homePath(locale), settle: 700 }, problems);
    const rail = await flowLayout(phone);
    locales[locale][MOBILE.width] = { overflow: rail.overflow, splitWords: rail.collisions.filter((collision) => collision.includes("split inside")) };
    expect(`${locale} @390: no horizontal overflow`, rail.overflow === 0);
    expect(`${locale} @390: no label split inside a word (${locales[locale][MOBILE.width].splitWords.join("; ")})`, locales[locale][MOBILE.width].splitWords.length === 0);
    await phone.close();
  }

  /* ---------- no-JS Home ---------- */
  const staticPage = await open(browser, { viewport: DESKTOP, theme: "dark", noJs: true, settle: 300 }, []);
  const staticFacts = await staticPage.evaluate(() => ({
    stages: [...document.querySelectorAll(".v4-flow__label")].map((label) => label.textContent),
    trace: Boolean(document.querySelector(".v4-flow__trace")?.getAttribute("d")),
    heading: document.querySelector("h1").textContent.trim().length > 20,
  }));
  expect("without JavaScript the flow, its route and the heading are in the document", staticFacts.stages.length === 5 && staticFacts.trace && staticFacts.heading);
  await staticPage.close();

  /* ---------- /works/ isolation ---------- */
  const worksFacts = {};
  for (const [label, viewport] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    const works = await open(browser, { viewport, theme: "dark", path: "/works/", settle: 800 }, problems);
    worksFacts[label] = await works.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      system: Boolean(document.querySelector('link[href="/css/v4-system.css"]')),
      routeAssets: Boolean(document.querySelector('link[href^="/css/v4-"]:not([href="/css/v4-system.css"]), script[src^="/js/v4/"]')),
      primitives: document.querySelectorAll("[data-v4-ambient], [data-v4-flow], [data-v4-magnetic], [data-v4-kinetic], .v4-flow").length,
      runtime: "V4Motion" in window,
      cards: document.querySelectorAll(".project-card").length,
    }));
    const facts = worksFacts[label];
    expect(`/works/ ${label}: no horizontal overflow`, facts.overflow === 0);
    expect(`/works/ ${label}: shares the V4 system stylesheet`, facts.system);
    expect(`/works/ ${label}: ships no V4 route assets, primitives or runtime`, !facts.routeAssets && facts.primitives === 0 && !facts.runtime);
    expect(`/works/ ${label}: catalog still renders`, facts.cards > 0);
    await works.close();
  }

  /* ---------- measurements + pack ---------- */
  const sizeOf = async (file) => {
    const bytes = await readFile(join(ROOT, "dist-site", file));
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const reactEntry = (await readFile(join(ROOT, "dist-site", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizes = await Promise.all(["css/v4-system.css", "css/v4-home.css", "js/v4/runtime.js", "portfolio-v2.css", reactEntry, "index.html"].map(sizeOf));

  await contactSheet(browser);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, signalMomentMs: SIGNAL_MOMENT_MS, home: homeFacts, signal: { duringJourney: during, atRest: resting }, pausedOffscreen, fiveSecondsMs: { duringJourney: burst, idleAtRest: idle }, lcp, floats, locales, noJs: staticFacts, works: worksFacts, sizes, consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const cost = (label, value) => `| ${label} | ${value.TaskDuration} ms | ${value.RecalcStyleDuration} ms | ${value.LayoutDuration} ms (${value.layouts}) | ${value.ScriptDuration} ms |`;
  const readme = `# V4-01 — Shared Design + Motion System · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

**Start with \`00-contact-sheet.png\`** — all ${shots.length} panels, labelled, in one image. \`V4-01-review-pack.zip\` holds everything here.

Moving captures are parked at the same moment of the signal's 13 s journey (${SIGNAL_MOMENT_MS} ms: just past Build), so two
runs produce the same picture. The hand-off captures are parked after the journey, with the flow at rest.

## Panels

| # | File | Demonstrates |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors: ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Home: ${homeFacts.stages} stages, ${homeFacts.magnetic} magnetic action, ${homeFacts.canvases} canvases, ${during.endless} endless animations.
- Signal: ${during.running} animations running during the journey; at rest ${resting.unfinished} unfinished of ${resting.total}. Replays on stage release and on return to view.
- Offscreen: ${pausedOffscreen.paused}/${pausedOffscreen.regions} V4 regions paused, ${pausedOffscreen.running} signal animations running.
- Floating controls vs first-screen content: ${Object.entries(floats).map(([size, result]) => `${size} ${result.found.length ? result.found.join(", ") : "clear"}`).join(" · ")}.
- Flow labels, room left before the hero's content edge (px) at ${NARROW_WIDTHS.join(" / ")}: ${LOCALES.map((locale) => `${locale.toUpperCase()} ${NARROW_WIDTHS.map((width) => locales[locale][width].gutterRoom).join(" / ")}`).join(" · ")}. Every label keeps its words whole (at most one line per word), including the 390 px rail. 390 px overflow: ${LOCALES.map((locale) => `${locale.toUpperCase()} ${locales[locale][MOBILE.width].overflow}`).join(" · ")}.
- /works/: desktop overflow ${worksFacts.desktop.overflow}px, mobile ${worksFacts.mobile.overflow}px, V4 primitives ${worksFacts.desktop.primitives}, runtime loaded: ${worksFacts.desktop.runtime}.

## Performance (headless Chromium, 1440×900, five seconds each)

| Window | Main-thread tasks | Style recalculation | Layout (count) | Script |
| --- | --- | --- | --- | --- |
${cost("During the 13 s journey", burst)}
${cost("Idle, flow at rest", idle)}

| Asset | Raw | Gzip |
| --- | --- | --- |
${sizes.map((size) => `| ${size.file} | ${kb(size.raw)} | ${kb(size.gzip)} |`).join("\n")}

- LCP (local, unthrottled): ${lcp ? `${lcp.ms} ms on <${lcp.element}>` : "not reported"}.
- No canvas, no animation loop, nothing endless: the signal is one CSS journey on inline SVG, then rest.
`;
  await writeFile(join(OUTPUT, "README.md"), readme, "utf8");

  const zip = join(OUTPUT, "V4-01-review-pack.zip");
  const zipped = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
    `Compress-Archive -Path (Get-ChildItem -LiteralPath '${OUTPUT}' -File | Where-Object { $_.Extension -in '.png','.md','.json' }).FullName -DestinationPath '${zip}' -Force`], { encoding: "utf8" });
  if (zipped.status !== 0) failures.push(`review pack zip failed: ${zipped.stderr || zipped.error?.message}`);
  else console.log("[v4:capture] V4-01-review-pack.zip");

  if (problems.length) failures.push(`browser console problems:\n  ${problems.join("\n  ")}`);
  if (failures.length) throw new Error(`V4 focused QA failed:\n- ${failures.join("\n- ")}`);
  console.log(`[v4:capture] focused QA passed · review pack ready at ${OUTPUT}`);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
