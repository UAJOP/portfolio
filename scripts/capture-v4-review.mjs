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
 * This phase's own part starts at “the game, driven and read”: Career
 * Adventure (V4-E06.3). Its rules are checked on the simulation the page
 * shipped, and its winning run is a recording replayed through the page's own
 * clock (scripts/v4-e06-3-career-adventure-sim.mjs writes it).
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
const PHASE = "v4-e06-3-career-adventure";
const PACK = "V4-E06-3-review-pack.zip";
const TITLE = "V4-E06.3 · Career Adventure — the career merge, as a game";
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
const GAME = "/adventure/";
/* The one failure a visitor can really meet: the engine's script never arrives. */
const ENGINE_SCRIPT = "/adventure-game.js";
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

/* One winning run, written down by scripts/v4-e06-3-career-adventure-sim.mjs:
 * a seed and every drop as [step, x]. Replayed through the page's own clock
 * it must reach the same Job Offer with the same score. */
const RECORDING = JSON.parse(await readFile(join(ROOT, "scripts", "fixtures", "v4-e06-3-winning-run.json"), "utf8"));
const STORE = "kaan-career-adventure-v2";
const LEGACY_STORE = "kaan-career-merge-best";
/* The ladder, stated here independently of the engine. */
const LADDER = ["Book", "Keyboard", "Mouse", "Monitor", "HTML / CSS", "JavaScript", "Python", "C# / .NET", "Database", "AI Flow", "Portfolio", "Interview", "Job Offer"];
const LADDER_IDS = ["book", "keyboard", "mouse", "monitor", "htmlcss", "javascript", "python", "csharp", "database", "aiflow", "portfolio", "interview", "joboffer"];
const HZ = [30, 60, 90, 120, 144, 240];

const press = async (page, selector) => { await page.evaluate((target) => document.querySelector(target).click(), selector); await wait(170); };
const stateIs = (page, name, timeout = 20000) => page.waitForFunction((wanted) => document.documentElement.getAttribute("data-ca-state") === wanted, { timeout }, name);
const at = (page, selector) => page.evaluate((target) => { const rect = document.querySelector(target).getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; }, selector);
const stored = (value) => { try { return JSON.parse(value); } catch { return null; } };

/* Test-browser preparation, run before the page's own scripts. The engine's
 * own events are recorded. The display's frames can be held, so that for a
 * while the test is the game's only clock (window.KaanCareerAdventure.tick is
 * the very function a frame calls); released, the game runs on the browser's
 * frames as it does for a visitor. Nothing in the page is replaced. */
const instrument = (page) => page.evaluateOnNewDocument(() => {
  const qa = (window.__qa = { merges: [], ends: [], milestones: [], states: [], frames: 0, held: false, waiting: [], cursor: 0, long: 0 });
  document.addEventListener("adventure:merge", (event) => qa.merges.push({ ...event.detail, step: window.KaanCareerAdventure.run()?.steps }));
  document.addEventListener("adventure:end", (event) => qa.ends.push(JSON.parse(JSON.stringify(event.detail))));
  document.addEventListener("adventure:milestone", (event) => qa.milestones.push({ ...event.detail }));
  document.addEventListener("adventure:state", (event) => qa.states.push(event.detail.phase));
  const frame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    if (qa.held) { qa.waiting.push(callback); return -1; }
    return frame((now) => { qa.frames += 1; callback(now); });
  };
  const api = () => window.KaanCareerAdventure;
  const STEP = 1000 / 120;
  qa.hold = (on) => { qa.held = on; if (!on) qa.waiting.splice(0).forEach((callback) => frame(callback)); };
  /* The next run starts from this seed: the engine draws it from Math.random once. */
  qa.seed = (seed) => { const random = Math.random; Math.random = () => { Math.random = random; return (seed + 0.5) / 0xffffffff; }; };
  qa.frame = (count = 1, ms = 1000 / 60) => { for (let i = 0; i < count; i += 1) api().tick(ms); return api().state(); };
  /* Replays the recorded run, one step of the simulation at a time, up to
   * `upTo` drops; it can stop early on the first merge that asks for it. */
  qa.replay = (recording, upTo, stop = {}) => {
    const game = api();
    while (qa.cursor < Math.min(upTo, recording.drops.length)) {
      const [step, x] = recording.drops[qa.cursor];
      while (game.run().steps < step) {
        const seen = qa.merges.length;
        game.tick(STEP);
        const made = qa.merges.slice(seen);
        if (stop.chain && made.some((merge) => merge.chain >= stop.chain)) return { stopped: "chain", drop: qa.cursor, merge: made.find((merge) => merge.chain >= stop.chain) };
        if (stop.single && made.some((merge) => merge.chain === 1 && merge.level >= stop.single) && made.length === 1) return { stopped: "merge", drop: qa.cursor, merge: made[0] };
        if (stop.pressure && game.state().pressure >= stop.pressure) return { stopped: "pressure", drop: qa.cursor, pressure: game.state().pressure };
        if (game.state().phase !== "playing") return { stopped: game.state().phase, drop: qa.cursor };
      }
      game.aim(x);
      if (!game.drop()) return { stopped: "refused", drop: qa.cursor, steps: game.run().steps, wanted: step };
      qa.cursor += 1;
    }
    return { stopped: null, drop: qa.cursor, state: game.state() };
  };
  /* Every drop into one place, as fast as the dropper allows, until the run ends. */
  qa.spam = (x, limit = 400, until = null) => {
    const game = api();
    let firstAbove = null, recovered = 0, above = false;
    while (game.state().phase === "playing" && game.run().drops < limit) {
      game.aim(typeof x === "function" ? x(game.run().drops) : x);
      game.drop();
      game.tick(STEP);
      const now = game.run().dangerTimer > 0;
      if (now && firstAbove === null) firstAbove = game.run().steps;
      if (above && !now) recovered += 1;
      above = now;
      if (until && until(game)) break;
    }
    return { state: game.state(), firstAbove, recovered, steps: game.run().steps };
  };
  /* The strategies that never look at the board, played on the simulation the
   * page shipped, with the rules checked at every step:
   *   - a dropped object never appears inside another
   *   - two of the same object in contact have merged by the next step
   *   - an object merges once, and the score is exactly the merges' points
   *   - nothing leaves the chamber
   *   - a run ends only after the full grace above the line */
  qa.strategies = (name, games) => {
    const S = api().Sim, CFG = S.CFG, LEVELS = S.LEVELS, LAST = S.LAST;
    const pickers = {
      centre: () => () => CFG.W / 2,
      left: () => () => 0,
      alternate: () => { let n = 0; return () => (n++ % 2 ? CFG.W : 0); },
      random: (seed) => { let a = seed * 7919 + 13; const next = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; return () => next() * CFG.W; },
      bad: () => (sim) => {
        const same = sim.bodies.filter((body) => body.level === sim.held);
        if (!same.length) return sim.drops % 2 ? CFG.W : 0;
        let best = 0, far = -1;
        for (let x = 0; x <= CFG.W; x += 20) { const distance = Math.min(...same.map((body) => Math.abs(body.x - x))); if (distance > far) { far = distance; best = x; } }
        return best;
      },
    };
    const out = { runs: games, won: 0, over: 0, drops: [], scores: [], highest: [], maxBodies: 0, recoveries: 0, violations: { spawnOverlap: 0, lingeringTwins: 0, mergedTwice: 0, scoreMismatch: 0, countMismatch: 0, outside: 0, earlyOver: 0, notANumber: 0 } };
    for (let game = 0; game < games; game += 1) {
      const sim = S.create(1000 + game * 37);
      const choose = pickers[name](1000 + game * 37);
      const merged = new Set();
      let points = 0, above = false, touching = new Set();
      const step = () => {
        S.step(sim);
        for (const event of sim.events) if (event.type === "merge") { points += event.points; for (const source of event.from) { if (merged.has(source.id)) out.violations.mergedTwice += 1; merged.add(source.id); } }
        sim.events.length = 0;
        const now = sim.dangerTimer > 0;
        if (above && !now && !sim.over) out.recoveries += 1;
        above = now;
        if (sim.over || sim.won) return;
        const list = sim.bodies;
        if (list.length > out.maxBodies) out.maxBodies = list.length;
        /* An object made by a merge may be born touching its twin; they merge on the next step. A pair still in contact a step later has lingered. */
        const now2 = new Set();
        for (let i = 0; i < list.length; i += 1) {
          const p = list[i];
          if (!(p.x === p.x && p.y === p.y)) out.violations.notANumber += 1;
          if (p.x < p.r - 0.5 || p.x > CFG.W - p.r + 0.5 || p.y > CFG.H - p.r + 0.5) out.violations.outside += 1;
          if (p.level >= LAST) continue;
          for (let j = i + 1; j < list.length; j += 1) {
            const q = list[j];
            if (q.level !== p.level || Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r) continue;
            const pair = p.id < q.id ? p.id * 65536 + q.id : q.id * 65536 + p.id;
            if (touching.has(pair)) out.violations.lingeringTwins += 1;
            now2.add(pair);
          }
        }
        touching = now2;
      };
      let waited = 0;
      while (!sim.over && !sim.won && sim.drops < 700 && waited < 400) {
        if (S.drop(sim, choose(sim))) {
          waited = 0;
          const fresh = sim.bodies[sim.bodies.length - 1];
          for (const other of sim.bodies) if (other !== fresh && Math.hypot(other.x - fresh.x, other.y - fresh.y) < other.r + fresh.r - 1e-6) out.violations.spawnOverlap += 1;
          for (let i = 0; i < CFG.COOLDOWN + 6 && !sim.over && !sim.won; i += 1) step();
        } else { for (let i = 0; i < 6; i += 1) step(); waited += 1; }
      }
      if (sim.over) { out.over += 1; out.drops.push(sim.drops); }
      if (sim.won) out.won += 1;
      if (points !== sim.score) out.violations.scoreMismatch += 1;
      if (sim.bodies.length !== sim.drops - sim.merges) out.violations.countMismatch += 1;
      out.scores.push(sim.score);
      out.highest.push(sim.highest);
    }
    const middle = (list) => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
    return { strategy: name, runs: out.runs, won: out.won, over: out.over, medianDropsToOver: middle(out.drops), fewestDropsToOver: out.drops.length ? Math.min(...out.drops) : null, medianScore: middle(out.scores), medianFurthest: LEVELS[middle(out.highest)].id, bestFurthest: LEVELS[Math.max(...out.highest)].id, maxBodies: out.maxBodies, recoveries: out.recoveries, violations: out.violations };
  };
  /* A crowd: `count` small objects let go at once. How long does a step take,
   * and does everything stay inside the glass? */
  qa.crowd = (count) => {
    const S = api().Sim, CFG = S.CFG;
    const sim = S.create(99);
    S.drop(sim, 40);
    const seedBody = sim.bodies[0];
    sim.bodies.length = 0;
    for (let i = 0; i < count; i += 1) {
      const level = i % 4, r = S.LEVELS[level].r, mass = (r * r) / 400;
      sim.bodies.push({ ...seedBody, id: 1000 + i, level, r, R: r, im: 1 / mass, ii: 2 / (mass * r * r), x: 30 + (i % 9) * 47 + ((i / 9) | 0) % 2 * 20, y: -60 - ((i / 9) | 0) * 62, px: 0, py: 0, vx: 0, vy: 0, w: 0, a: 0, landed: 0, held: 0, grow: 0, merged: false });
    }
    sim.nextId = 5000;
    let worst = 0, total = 0, peak = sim.bodies.length, merges = 0, outside = 0, burst = 0;
    const steps = 720;
    for (let i = 0; i < steps; i += 1) {
      const before = performance.now();
      S.step(sim);
      const took = performance.now() - before;
      total += took; if (took > worst) worst = took;
      const made = sim.events.filter((event) => event.type === "merge").length;
      if (made > burst) burst = made;
      merges += made; sim.events.length = 0;
      /* this crowd is poured in from above the line on purpose: only the physics is under test */
      sim.over = false; sim.dangerTimer = 0;
    }
    for (const body of sim.bodies) if (!(body.x === body.x) || body.x < body.r - 0.5 || body.x > CFG.W - body.r + 0.5 || body.y > CFG.H - body.r + 0.5) outside += 1;
    return { started: peak, left: sim.bodies.length, merges, mostMergesInOneStep: burst, meanStepMs: Math.round((total / steps) * 1000) / 1000, worstStepMs: Math.round(worst * 100) / 100, outside };
  };
  new PerformanceObserver((list) => { qa.long += list.getEntries().length; }).observe({ type: "longtask" });
});

/* Everything a check may want to know about the game's shell, as it is shown. */
const game = (page) => page.evaluate((key, legacy) => {
  const html = document.documentElement;
  const root = document.querySelector("[data-ca-root]");
  const shown = (entry) => Boolean(entry && entry.getClientRects().length && getComputedStyle(entry).visibility !== "hidden");
  const box = (entry) => { const rect = entry.getBoundingClientRect(); return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  const api = window.KaanCareerAdventure || null;
  const view = api ? api.view() : null;
  const layer = [...document.querySelectorAll("[data-ca-layer]")].find((entry) => !entry.hidden) || null;
  const cards = [...root.querySelectorAll(".ca-hud .ca-card")].filter(shown);
  /* The column the engine drew the chamber in, from the rim's headroom down to the plinth. */
  const column = view ? { left: view.x - 6, right: view.x + view.width + 6, top: view.y - 160 * view.scale, bottom: view.y + view.height + 30 * view.scale } : null;
  const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const inView = (entry) => { const rect = entry.getBoundingClientRect(); return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1; };
  const controls = [...root.querySelectorAll(".ca-hud button")].filter(shown);
  const layerControls = layer ? [...layer.querySelectorAll("button, a, input")].filter(shown) : [];
  const cardBoxes = cards.map(box);
  const focus = document.activeElement;
  return {
    state: html.getAttribute("data-ca-state"),
    layer: layer ? layer.getAttribute("data-ca-layer") : null,
    engine: api ? api.state() : null,
    view,
    rootBox: shown(root) ? box(root) : null,
    canvasBox: box(document.getElementById("career-merge-canvas")),
    board: view ? { width: Math.round(view.width), height: Math.round(view.height), share: Math.round((view.width * view.height) / (innerWidth * innerHeight) * 100), widthShare: Math.round(view.width / innerWidth * 100) } : null,
    hudShown: shown(root.querySelector(".ca-hud .ca-score")),
    cardsOverBoard: column ? cards.filter((card) => hits(card.getBoundingClientRect(), column)).map((card) => card.className) : [],
    cardsOverlap: cardBoxes.some((a, i) => cardBoxes.some((b, j) => j > i && hits(a, b))),
    outOfView: [...cards, ...layerControls].filter((entry) => !inView(entry)).length,
    smallTargets: controls.map(box).filter((item) => item.width < 44 || item.height < 44).length,
    smallest: controls.length ? Math.min(...controls.map(box).map((item) => Math.min(item.width, item.height))) : null,
    hud: {
      score: text(root.querySelector("[data-ca-score]")), best: text(root.querySelector("[data-ca-best]")),
      next: text(root.querySelector("[data-ca-next-name]")), nextLabel: text(root.querySelector(".ca-next > span")), nextDrawn: root.querySelector("[data-ca-next]").getAttribute("data-level"),
      stage: text(root.querySelector("[data-ca-stage]")), stageName: text(root.querySelector("[data-ca-stage-name]")),
      tools: Object.fromEntries([...root.querySelectorAll("[data-ca-tool]")].map((button) => [button.getAttribute("data-ca-tool"), { left: Number(text(button.querySelector("[data-ca-count]"))), disabled: button.disabled, label: text(button.querySelector("span")) }])),
      path: [...root.querySelectorAll("[data-ca-path] li")].map((item) => ({ name: text(item), reached: item.classList.contains("is-reached"), current: item.classList.contains("is-current") })),
      heat: Number(root.style.getPropertyValue("--ca-heat") || 0),
      sound: root.querySelector("[data-ca-sound]").getAttribute("aria-pressed"),
    },
    panel: layer ? {
      title: text(layer.querySelector("h2, strong")),
      buttons: [...layer.querySelectorAll(".ca-list button, .ca-actions button")].filter(shown).map(text),
      text: [...layer.querySelectorAll(".ca-panel p")].filter(shown).map(text),
      stats: Object.fromEntries([...layer.querySelectorAll(".ca-stats div")].map((cell) => [text(cell.querySelector("dt")), text(cell.querySelector("dd"))])),
      steps: [...layer.querySelectorAll(".ca-steps li")].map(text),
      ladder: [...layer.querySelectorAll(".ca-ladder li")].map((item) => ({ name: text(item.querySelector("strong")), reached: item.classList.contains("is-reached"), milestone: item.classList.contains("is-milestone"), drawn: item.querySelector("canvas").getContext("2d").getImageData(56, 56, 1, 1).data[3] > 0 })),
      settings: [...layer.querySelectorAll(".ca-row")].filter(shown).map((row) => ({ label: text(row.querySelector("span")), value: row.querySelector("input").type === "range" ? row.querySelector("input").value : row.querySelector("input").checked })),
      themes: [...layer.querySelectorAll("[data-ca-theme]")].map((button) => ({ id: button.getAttribute("data-ca-theme"), name: text(button.querySelector("strong")), locked: button.disabled, active: button.getAttribute("aria-pressed") === "true", note: text(button.querySelector("small")) })),
      languages: [...layer.querySelectorAll(".ca-langs a")].map((link) => ({ name: text(link), href: link.getAttribute("href"), current: link.getAttribute("aria-current") === "true" })),
      fits: inView(layer.querySelector(".ca-panel")),
      controlsInView: layerControls.every(inView),
    } : null,
    toast: shown(root.querySelector("[data-ca-toast]")) ? [...root.querySelectorAll("[data-ca-toast] > *")].map(text) : null,
    focus: focus === root ? "board" : focus && focus !== document.body ? `${focus.tagName.toLowerCase()}${[...focus.attributes].filter((attribute) => /^data-ca-(play|resume|enter|reload|back|open|menu|exit|pause)$/.test(attribute.name)).map((attribute) => `[${attribute.name}${attribute.value ? `=${attribute.value}` : ""}]`).join("")}` : null,
    focusInGame: Boolean(focus && root.contains(focus)),
    header: shown(document.querySelector(".site-header")),
    footer: shown(document.querySelector(".site-footer")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    floats: [...document.body.children].filter((item) => item.tagName !== "MAIN" && item.tagName !== "SCRIPT" && shown(item)).length,
    inertOutside: [...document.body.children].filter((item) => item.tagName !== "MAIN" && item.tagName !== "SCRIPT" && item.id !== "react-command-root").every((item) => item.inert),
    pageScrolls: (() => { const before = scrollY; window.scrollBy(0, 200); const moved = scrollY !== before; window.scrollTo(0, before); return moved; })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scroll: Math.round(scrollY),
    touchAction: getComputedStyle(document.getElementById("career-merge-canvas")).touchAction,
    profile: localStorage.getItem(key),
    legacyBest: localStorage.getItem(legacy),
  };
}, STORE, LEGACY_STORE);

/* The portfolio page: the way in. */
const intro = (page) => page.evaluate(() => {
  const shown = (target) => Boolean(target && target.getClientRects().length && getComputedStyle(target).visibility !== "hidden");
  const text = (entry) => entry?.textContent.replace(/\s+/g, " ").trim() || "";
  const canvas = document.getElementById("career-merge-canvas");
  const painted = (() => { try { const g = canvas.getContext("2d"); const data = g.getImageData(0, 0, canvas.width, canvas.height).data; let ink = 0; for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) ink += 1; return ink; } catch (error) { return -1; } })();
  return {
    heading: text(document.querySelector("h1")),
    play: shown(document.querySelector(".ca-enter [data-ca-enter]")) ? text(document.querySelector(".ca-enter [data-ca-enter]")) : null,
    poster: shown(document.querySelector(".ca-poster")),
    record: shown(document.querySelector(".ca-enter [data-ca-record]")) ? text(document.querySelector(".ca-enter [data-ca-record]")) : null,
    board: shown(canvas),
    boardPainted: painted,
    boardBackdrop: shown(document.querySelector(".adventure-canvas-wrap")) ? getComputedStyle(document.querySelector(".adventure-canvas-wrap")).backgroundImage !== "none" : null,
    hud: shown(document.querySelector(".ca-hud")),
    layers: shown(document.querySelector(".ca-layers")),
    oldControls: shown(document.querySelector("[data-adventure-drop]")) || shown(document.querySelector(".adventure-stats")),
    ladder: [...document.querySelectorAll("[data-merge-ladder] article")].filter(shown).map((item) => text(item.querySelector("strong"))),
    notice: shown(document.querySelector(".ca-noscript")) ? text(document.querySelector(".ca-noscript")) : null,
    noticeLinks: [...document.querySelectorAll(".ca-noscript a")].map((link) => link.getAttribute("href")),
    header: shown(document.querySelector(".site-header")),
    footer: shown(document.querySelector(".site-footer")),
    launcher: shown(document.querySelector(".chatbot-launcher")),
    state: document.documentElement.getAttribute("data-ca-state"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    focus: document.activeElement?.hasAttribute("data-ca-enter") ? "play" : null,
    engineRunning: window.KaanCareerAdventure ? window.KaanCareerAdventure.view().running : null,
  };
});

const enter = async (page) => { await press(page, ".ca-enter [data-ca-enter]"); await stateIs(page, "menu"); await wait(350); };
/* Play from the menu, on the browser's frames or with them held. */
const start = async (page, { seed = null, hold = false } = {}) => {
  await page.evaluate((seed, hold) => { window.__qa.cursor = 0; window.__qa.merges.length = 0; window.__qa.ends.length = 0; window.__qa.milestones.length = 0; if (hold) window.__qa.hold(true); if (seed !== null) window.__qa.seed(seed); }, seed, hold);
  await press(page, ".ca-layer:not([hidden]) [data-ca-play]");
  await stateIs(page, "playing");
};
const replay = (page, upTo = RECORDING.drops.length, stop = {}) => page.evaluate((recording, upTo, stop) => window.__qa.replay(recording, upTo, stop), RECORDING, upTo, stop);
const frames = (page, count, ms) => page.evaluate((count, ms) => window.__qa.frame(count, ms), count, ms);
const release = (page) => page.evaluate(() => window.__qa.hold(false));
/* Runs the game's own clock until the run has ended and its result is up. */
const toEnd = async (page, limit = 600) => { await page.evaluate((limit) => { const api = window.KaanCareerAdventure; for (let i = 0; i < limit && !["won", "over"].includes(api.state().phase); i += 1) api.tick(1000 / 60); }, limit); await wait(300); };
/* One place, every drop: the run this loses is the game's real game over. */
const lose = (page, x = 220) => page.evaluate((x) => window.__qa.spam(x), x);

/* In contact-sheet order. Each `play` takes the page from the portfolio page to what the shot shows. */
const shots = [
  { name: "01-main-menu.png", label: "Main menu · 1440 × 900 · the portfolio has stepped out: the room, the chamber with a still pile, Play, How to Play, Settings, Career Path, Exit", viewport: DESKTOP, play: async (page) => { await enter(page); } },
  { name: "02-desktop-early-run.png", label: "Early run · the chamber is the hero; score and career path to its left, next object, tools and stage to its right; guide line and landing ring under the object in hand", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 9); await frames(page, 50); } },
  { name: "03-desktop-mid-stack.png", label: "Mid-stack · the recorded run at drop 70: larger objects now, the dropper hands out HTML / CSS to Database", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 70); await frames(page, 50); } },
  { name: "04-danger.png", label: "Danger · a stack that has stayed above the line: the line turns red and runs out as the grace does, the room warms at its edges, “Careful”", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: 3, hold: true }); await page.evaluate(() => window.__qa.spam(220, 400, (game) => game.run().dangerTimer > 110)); await frames(page, 2); } },
  { name: "05-merge.png", label: "A merge · the two sources fold into the centre, a ring opens, the new object swells in, fragments in its colour, the points it earned", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 40); await replay(page, RECORDING.drops.length, { single: 5 }); await frames(page, 5); } },
  { name: "06-chain-merge.png", label: "A chain · one merge sets off the next: “3× Career Combo”, each link worth a quarter more", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 30); await replay(page, RECORDING.drops.length, { chain: 3 }); await frames(page, 5); } },
  { name: "07-job-offer.png", label: "Job Offer · two Interviews merge: the offer lit from behind, confetti, the run's last chain", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page); await page.evaluate(() => { const api = window.KaanCareerAdventure; for (let i = 0; i < 4000 && api.state().phase === "playing"; i += 1) api.tick(1000 / 120); }); await frames(page, 34); } },
  { name: "08-victory.png", label: "Victory · score, best, furthest object, best chain, time; Play Again, Main Menu, Exit to Portfolio", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page); await toEnd(page, 4000); } },
  { name: "09-game-over.png", label: "Game over · reached by dropping everything in one place: what the run came to, and no automatic restart", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: 3, hold: true }); await lose(page); await toEnd(page); } },
  { name: "10-mobile-early-run.png", label: "Mobile · 390 × 844 · the chamber is the screen: pause and sound, score, next object above; tools and stage below", viewport: MOBILE, touch: true, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 9); await frames(page, 50); } },
  { name: "11-mobile-high-stack.png", label: "Mobile · a high stack, the line close", viewport: MOBILE, touch: true, play: async (page) => { await enter(page); await start(page, { seed: 3, hold: true }); await page.evaluate(() => window.__qa.spam(220, 400, (game) => game.run().pressure > 0.5)); await frames(page, 30); } },
  { name: "12-settings.png", label: "Settings · sound, volume, reduced effects, drop guide; environments with what unlocks them; the five languages", viewport: DESKTOP, play: async (page) => { await enter(page); await press(page, '[data-ca-layer="menu"] [data-ca-open="settings"]'); await wait(350); } },
  { name: "13-career-path.png", label: "Career path · the merge ladder, all thirteen objects in order, milestones marked, how far this profile has come", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 70); await page.evaluate(() => window.KaanCareerAdventure.pause()); await wait(200); await press(page, '[data-ca-layer="pause"] [data-ca-menu]'); await wait(200); await press(page, '[data-ca-layer="menu"] [data-ca-open="progress"]'); await wait(350); } },
  { name: "14-how-to-play.png", label: "How to play · four steps, the ladder as a strip, the two tools, the keys", viewport: DESKTOP, play: async (page) => { await enter(page); await press(page, '[data-ca-layer="menu"] [data-ca-open="how"]'); await wait(350); } },
  { name: "15-pause.png", label: "Paused · Resume, Restart run, How to Play, Settings, Main Menu", viewport: DESKTOP, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 30); await frames(page, 40); await page.evaluate(() => window.KaanCareerAdventure.pause()); await wait(300); } },
  { name: "16-city-night.png", label: "Environment: City Night · unlocked by reaching Python; only the room changes, never the physics", viewport: DESKTOP, profile: { highest: 9, theme: "city" }, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 46); await frames(page, 50); } },
  { name: "17-ai-lab.png", label: "Environment: AI Lab · unlocked by reaching AI Flow", viewport: DESKTOP, profile: { highest: 9, theme: "lab" }, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 46); await frames(page, 50); } },
  { name: "18-mobile-menu.png", label: "Mobile · main menu", viewport: MOBILE, touch: true, play: async (page) => { await enter(page); } },
  { name: "19-mobile-game-over.png", label: "Mobile · game over", viewport: MOBILE, touch: true, play: async (page) => { await enter(page); await start(page, { seed: 3, hold: true }); await lose(page); await toEnd(page); } },
  { name: "20-tablet.png", label: "Tablet · 820 × 1180", viewport: TABLET, touch: true, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 60); await frames(page, 50); } },
  { name: "21-landscape-phone.png", label: "Phone on its side · 844 × 390 · the reduced layout: the chamber keeps its shape, the HUD keeps to the corners", viewport: LANDSCAPE, touch: true, play: async (page) => { await enter(page); await start(page, { seed: RECORDING.seed, hold: true }); await replay(page, 30); await frames(page, 50); } },
  { name: "22-portfolio-page.png", label: "The portfolio page · the hero's Play action; nothing of the game is running", viewport: DESKTOP, play: async () => {} },
  { name: "23-portfolio-page-board.png", label: "The portfolio page, further down · the board is a poster of the game; the merge ladder beside it", viewport: DESKTOP, play: async (page) => { await page.evaluate(() => { document.querySelector("#career-merge-game").scrollIntoView({ block: "start", behavior: "instant" }); window.scrollBy({ top: -90, behavior: "instant" }); }); await wait(900); } },
  { name: "24-no-js.png", label: "Without JavaScript · a plain notice with the way to Games and Works; no Play, no empty board", viewport: DESKTOP, noJs: true, play: async () => {} },
  { name: "25-engine-failure.png", label: "Engine failed to load (forced for this capture) · a recoverable state: Reload or Exit to Portfolio", viewport: DESKTOP, fail: true, play: async (page) => { await press(page, ".ca-enter [data-ca-enter]"); await wait(600); } },
];

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

  browser = await puppeteer.launch({ headless: true, protocolTimeout: 600_000 });
  const problems = [];
  const failures = [];
  const expect = (label, condition) => { if (!condition) { failures.push(label); console.log(`[v4:capture] FAILED · ${label}`); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /* Every page gets its own context, and so its own storage: no progress leaks between checks. */
  const fresh = async (options) => {
    const context = await browser.createBrowserContext();
    const page = await open(context, { path: GAME, settle: 700, theme: "dark", ...options, prepare: async (target) => {
      if (!options.noJs) await instrument(target);
      if (options.fail) await blockEngine(target);
      /* A profile that has already come some way, for what only such a profile can show. */
      if (options.profile) await target.evaluateOnNewDocument((key, profile) => localStorage.setItem(key, JSON.stringify({ v: 2, best: 0, highest: profile.highest, wins: 0, runs: 3, settings: { theme: profile.theme } })), STORE, options.profile);
      if (options.prepare) await options.prepare(target);
    } }, options.noJs || options.fail ? [] : problems);
    if (!options.noJs && !options.fail) await page.waitForFunction(() => window.KaanCareerAdventure && document.querySelectorAll("[data-merge-ladder] article").length === 13, { timeout: 20000 });
    page.done = () => context.close();
    return page;
  };

  /* ---------- screenshots ---------- */
  for (const shot of shots) {
    const page = await fresh(shot);
    await shot.play(page);
    expect(`${shot.name}: no horizontal overflow`, (await overflow(page)) === 0);
    await page.screenshot({ path: join(OUTPUT, shot.name), type: "png" });
    console.log(`[v4:capture] ${shot.name}`);
    await page.done();
  }

  /* ---------- motion frames: one continuous session, one tab ---------- */
  const filmFrames = [];
  const film = await fresh({ viewport: DESKTOP });
  const frame = async (label) => {
    const file = join(FRAMES, `${String(filmFrames.length + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}.png`);
    await film.screenshot({ path: file, type: "png" });
    filmFrames.push({ file, label, width: 960 });
  };
  { const cta = await at(film, ".ca-enter [data-ca-enter]"); await film.mouse.move(cta.x, cta.y); await wait(260); }
  await frame("The portfolio page: Play Career Adventure under the pointer");
  await film.mouse.down(); await film.mouse.up(); await wait(140);
  await frame("Entering: the portfolio steps out and the menu arrives over the room");
  await wait(420);
  await frame("Main menu");
  await start(film, { seed: RECORDING.seed, hold: true });
  await frames(film, 2);
  await frame("Play: the HUD comes in around the chamber, a Book in hand");
  { const box = (await game(film)).view; await film.mouse.move(box.x + RECORDING.drops[0][1] * box.scale, box.y + box.height * 0.5); await frames(film, 2); }
  await frame("Aim: the object follows the pointer; a guide line and a ring show where it will land");
  await replay(film, 1); await frames(film, 14);
  await frame("Drop: the Book falls, the next object is already arriving in hand");
  await frames(film, 30);
  await frame("Landed");
  await replay(film, RECORDING.drops.length, { single: 1 });
  await frame("A merge, at contact: two of the same object fold together, a ring opens, the next object flashes in");
  await frames(film, 5);
  await frame("…five frames on: the new object swells, fragments fly, the points rise");
  await frames(film, 30);
  await frame("…and settles");
  const chained = await replay(film, RECORDING.drops.length, { chain: 3 });
  await frames(film, 5);
  await frame("A chain: one merge sets off the next");
  /* The same tab starts over and drops everything in one place. */
  await film.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(film, "paused"); await wait(250);
  await frame("Paused");
  await film.evaluate((seed) => { window.__qa.cursor = 0; window.__qa.merges.length = 0; window.__qa.ends.length = 0; window.__qa.seed(seed); }, 3);
  await press(film, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(film, "playing");
  await film.evaluate(() => window.__qa.spam(220, 400, (game) => game.run().pressure > 0.45));
  await frames(film, 20);
  await frame("Restart, and everything into one place: the stack climbs toward the line");
  await film.evaluate(() => window.__qa.spam(220, 400, (game) => game.run().dangerTimer > 130));
  await frames(film, 2);
  await frame("Danger: something has stayed above the line; the line runs out as the grace does");
  await lose(film);
  await frames(film, 20);
  await frame("The run ends: the board dims");
  await toEnd(film);
  await frame("Game over: what the run came to; nothing restarts by itself");
  const filmedOver = await game(film);
  /* …and plays on, this time the recorded run, to the Job Offer. */
  await film.evaluate((seed) => { window.__qa.cursor = 0; window.__qa.merges.length = 0; window.__qa.ends.length = 0; window.__qa.seed(seed); }, RECORDING.seed);
  await press(film, '[data-ca-layer="over"] [data-ca-play]'); await stateIs(film, "playing");
  await replay(film, 80); await frames(film, 40);
  await frame("Try Again: a new run, played with care this time (the recorded run, at drop 80)");
  await replay(film);
  await film.evaluate(() => { const api = window.KaanCareerAdventure; for (let i = 0; i < 4000 && api.state().phase === "playing"; i += 1) api.tick(1000 / 120); });
  await frames(film, 6);
  await frame("Two Interviews touch: the Job Offer");
  await frames(film, 40);
  await frame("…lit from behind, confetti over the chamber");
  await toEnd(film, 4000);
  await frame("Victory");
  const filmed = await game(film);
  expect("Motion session: one tab plays into a chain, restarts, loses a run by dropping everything in one place, tries again, and reaches the Job Offer with the recorded run", chained.stopped === "chain" && filmedOver.state === "over" && filmed.state === "won" && filmed.engine.score === RECORDING.expect.score);
  await film.done();

  /* ---------- the page, entering, the menu ---------- */
  const q = {};
  const en = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", "en", "common.json"), "utf8"));
  const copy = (key) => en[`adventure.play.${key}`];
  const desk = await fresh({ viewport: DESKTOP });
  q.page = await intro(desk);
  expect("Page: the portfolio-facing intro — the game's name, Play Career Adventure, the board as a painted poster with its own Play, the thirteen-rung ladder; no HUD, no layer, none of the old in-page controls; header, footer and AJOOP launcher present; the engine is not running", q.page.heading === "Kaan's Career Adventure" && q.page.play === copy("enter") && q.page.poster && q.page.board && q.page.boardPainted > 100 && !q.page.hud && !q.page.layers && !q.page.oldControls && same(q.page.ladder, LADDER) && q.page.header && q.page.footer && q.page.launcher && q.page.state === null && q.page.engineRunning === false && q.page.record === null);
  await desk.evaluate(() => window.scrollTo({ top: 60, behavior: "instant" })); await wait(250);
  q.scrollBefore = await desk.evaluate(() => Math.round(scrollY));
  await desk.focus(".ca-enter [data-ca-enter]"); await desk.keyboard.press("Enter"); await stateIs(desk, "menu"); await wait(450);
  q.menu = await game(desk);
  expect("Entered by keyboard: the menu fills the viewport, focus is on Play, and the page behind cannot scroll", q.menu.state === "menu" && q.menu.layer === "menu" && q.menu.rootBox.width === DESKTOP.width && q.menu.rootBox.height === DESKTOP.height && q.menu.canvasBox.width === DESKTOP.width && q.menu.focus === "button[data-ca-play]" && !q.menu.pageScrolls);
  expect("Entered: the portfolio's header, footer, AJOOP launcher and floating controls are gone and inert", !q.menu.header && !q.menu.footer && !q.menu.launcher && q.menu.floats === 0 && q.menu.inertOutside);
  expect("Menu: the title, then Play, How to Play, Settings, Career Path and Exit to Portfolio — and nothing else; no HUD yet; the engine is at rest", q.menu.panel.title === "CareerAdventure" && same(q.menu.panel.buttons, [copy("menu.play"), copy("menu.how"), copy("menu.settings"), copy("menu.progress"), copy("menu.exit")]) && !q.menu.hudShown && q.menu.engine.phase === "idle" && q.menu.view.running === false);
  q.menuIdle = await idleWork(desk, 3000);
  q.menuFrames = await desk.evaluate(async () => { const before = window.__qa.frames; await new Promise((done) => setTimeout(done, 1500)); return window.__qa.frames - before; });
  expect("Menu, idle: no animation frame is asked for and the main thread is quiet", q.menuFrames === 0 && q.menuIdle.longTasks === 0 && q.menuIdle.scriptMs <= 5);

  await press(desk, '[data-ca-layer="menu"] [data-ca-open="how"]'); await wait(300);
  q.how = await game(desk);
  expect("How to Play: four steps, the ladder as a strip of thirteen drawn objects, the tools, the keys; Back returns to the menu", q.how.layer === "how" && q.how.panel.steps.length === 4 && q.how.panel.steps[1] === copy("how.two") && q.how.panel.ladder.length === 13 && q.how.panel.ladder.every((rung) => rung.drawn) && q.how.panel.text.includes(copy("how.tools")) && q.how.panel.text.includes(copy("how.keys")) && q.how.panel.fits);
  await desk.keyboard.press("Escape"); await wait(250);
  q.howBack = (await game(desk)).layer;
  await press(desk, '[data-ca-layer="menu"] [data-ca-open="progress"]'); await wait(300);
  q.progress = await game(desk);
  expect("Career Path: the thirteen objects in the ladder's order with their names, five milestones (HTML / CSS, Python, AI Flow, Portfolio, Interview), only the Book reached on a new profile, and the profile's numbers", q.progress.layer === "progress" && same(q.progress.panel.ladder.map((rung) => rung.name), LADDER) && same(q.progress.panel.ladder.filter((rung) => rung.milestone).map((rung) => rung.name), ["HTML / CSS", "Python", "AI Flow", "Portfolio", "Interview"]) && same(q.progress.panel.ladder.filter((rung) => rung.reached).map((rung) => rung.name), ["Book"]) && q.progress.panel.ladder.every((rung) => rung.drawn) && q.progress.panel.stats[copy("progress.best")] === "0" && q.progress.panel.stats[copy("progress.wins")] === "0");
  await press(desk, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(250);
  await press(desk, '[data-ca-layer="menu"] [data-ca-open="settings"]'); await wait(300);
  q.settings = await game(desk);
  expect("Settings: only real ones — sound, volume, reduced effects, drop guide (vibration only on a device that can); three environments, two locked with what unlocks them; the five languages as links to the game in each", same(q.settings.panel.settings.map((row) => row.label), [copy("settings.sound"), copy("settings.volume"), copy("settings.reduced"), copy("settings.guide")]) && same(q.settings.panel.themes.map((theme) => [theme.id, theme.locked, theme.active]), [["study", false, true], ["city", true, false], ["lab", true, false]]) && q.settings.panel.themes[1].note === copy("settings.locked").replace("{object}", "Python") && q.settings.panel.themes[2].note === copy("settings.locked").replace("{object}", "AI Flow") && same(q.settings.panel.languages.map((item) => item.href), ["/adventure/#career-merge-game", "/tr/adventure/#career-merge-game", "/de/adventure/#career-merge-game", "/es/adventure/#career-merge-game", "/fr/adventure/#career-merge-game"]) && q.settings.panel.languages[0].current);
  await desk.click('[data-ca-set="guide"]'); await wait(150);
  await desk.evaluate(() => { const input = document.querySelector('[data-ca-set="volume"]'); input.value = "35"; input.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(150);
  q.settingsChanged = stored((await game(desk)).profile)?.settings;
  expect("Settings: a switch and the volume are applied by the engine and kept", q.settingsChanged && q.settingsChanged.guide === false && q.settingsChanged.volume === 0.35 && q.settingsChanged.sound === true);
  await desk.click('[data-ca-set="guide"]'); await wait(150);
  await press(desk, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(250);
  expect("Layers: Escape and Back both return to the menu", q.howBack === "menu" && (await game(desk)).layer === "menu");

  /* ---------- a run on the browser's own frames: pointer, keyboard, tools ---------- */
  await start(desk, { seed: 11 });
  await wait(250);
  q.started = await game(desk);
  expect("Play: the chamber is the hero of the screen and the HUD stands around it — no card over the chamber's column, none overlapping another, all in view; score 0, a Book in hand, stage 1 of 13, two Re-scopes and one Debug", q.started.state === "playing" && q.started.layer === null && q.started.hudShown && q.started.board.share >= 18 && q.started.board.height >= 600 && q.started.cardsOverBoard.length === 0 && !q.started.cardsOverlap && q.started.outOfView === 0 && q.started.overflow === 0 && q.started.hud.score === "0" && q.started.engine.held === 0 && q.started.hud.stage === copy("hud.stage").replace("{n}", "1").replace("{total}", "13") && q.started.hud.stageName === "Book" && q.started.hud.tools.swap.left === 2 && q.started.hud.tools.debug.left === 1 && q.started.focus === "board");
  expect("HUD: the next object is named and drawn, the career path lists the thirteen objects with the Book current", q.started.hud.next === LADDER[q.started.engine.next] && q.started.hud.nextDrawn === String(q.started.engine.next) && same(q.started.hud.path.map((rung) => rung.name), LADDER) && q.started.hud.path[0].current && q.started.hud.path.filter((rung) => rung.reached).length === 1);
  {
    const box = q.started.view;
    const targetX = box.x + box.width * 0.25;
    await desk.mouse.move(targetX, box.y + box.height * 0.5); await wait(120);
    q.pointerAim = (await game(desk)).view.aim;
    await desk.mouse.down(); await desk.mouse.up(); await wait(900);
    const after = await desk.evaluate(() => ({ drops: window.KaanCareerAdventure.run().drops, bodies: window.KaanCareerAdventure.run().bodies.map((body) => ({ x: body.x, y: body.y, landed: body.landed })) }));
    q.pointer = { wanted: Math.round((targetX - box.x) / box.scale), aim: Math.round(q.pointerAim), drops: after.drops, landedAt: Math.round(after.bodies[0].x), rested: after.bodies[0].landed > 0 };
    expect("Pointer: the object in hand follows the mouse; a click drops it, and it lands where it was aimed", Math.abs(q.pointer.aim - q.pointer.wanted) <= 1 && q.pointer.drops === 1 && Math.abs(q.pointer.landedAt - q.pointer.wanted) <= 6 && q.pointer.rested);
  }
  {
    const before = (await game(desk)).view.aim;
    await desk.keyboard.down("ArrowRight"); await wait(320); await desk.keyboard.up("ArrowRight"); await wait(60);
    const right = (await game(desk)).view.aim;
    await desk.keyboard.down("a"); await wait(200); await desk.keyboard.up("a"); await wait(60);
    const left = (await game(desk)).view.aim;
    await desk.keyboard.press("Space"); await wait(700);
    const afterSpace = await desk.evaluate(() => window.KaanCareerAdventure.run().drops);
    await desk.keyboard.press("Enter"); await wait(700);
    const afterEnter = await desk.evaluate(() => window.KaanCareerAdventure.run().drops);
    q.keyboard = { aim: [Math.round(before), Math.round(right), Math.round(left)], drops: [afterSpace, afterEnter] };
    expect("Keyboard: → and A move the aim while held, Space drops, Enter drops", right > before + 60 && left < right - 40 && afterSpace === 2 && afterEnter === 3);
  }
  {
    /* the tools: by key, then by their buttons */
    await desk.evaluate(() => { const api = window.KaanCareerAdventure; let guard = 0; while (api.state().held === api.state().next && guard < 40) { api.aim(40 + guard * 9); api.drop(); for (let i = 0; i < 70; i += 1) api.tick(1000 / 120); guard += 1; } });
    await desk.evaluate(() => { for (let i = 0; i < 240; i += 1) window.KaanCareerAdventure.tick(1000 / 120); window.__qa.hold(true); });
    const before = (await game(desk)).engine;
    await desk.keyboard.press("1"); await wait(120);
    const swapped = (await game(desk));
    const bodiesBefore = await desk.evaluate(() => window.KaanCareerAdventure.run().bodies.length);
    const smallest = await desk.evaluate(() => { const target = window.KaanCareerAdventure.Sim.debugTarget(window.KaanCareerAdventure.run()); return target ? target.level : null; });
    await desk.keyboard.press("2"); await wait(150);
    const debugged = await game(desk);
    const bodiesAfter = await desk.evaluate(() => ({ count: window.KaanCareerAdventure.run().bodies.length, levels: window.KaanCareerAdventure.run().bodies.map((body) => body.level) }));
    q.tools = { before: [before.held, before.next, before.tools], swapped: [swapped.engine.held, swapped.engine.next, swapped.engine.tools], hudAfterSwap: swapped.hud.tools.swap.left, removed: bodiesBefore - bodiesAfter.count, removedLevel: smallest, debugLeft: debugged.engine.tools.debug, debugButtonDisabled: debugged.hud.tools.debug.disabled, score: [before.score, debugged.engine.score] };
    expect("Re-scope (key 1): the object in hand and the next one change places, one use is spent, and the HUD says so", swapped.engine.held === before.next && swapped.engine.next === before.held && swapped.engine.tools.swap === before.tools.swap - 1 && swapped.hud.tools.swap.left === before.tools.swap - 1 && swapped.hud.next === LADDER[before.held]);
    expect("Debug (key 2): exactly the smallest object in the chamber is taken out, one use is spent, it adds no points, and with none left its button is off", q.tools.removed === 1 && debugged.engine.tools.debug === before.tools.debug - 1 && debugged.engine.score === swapped.engine.score && (debugged.engine.tools.debug > 0 || debugged.hud.tools.debug.disabled));
    const swapsLeft = debugged.engine.tools.swap;
    if (swapsLeft > 0 && debugged.engine.held !== debugged.engine.next) {
      const button = await at(desk, '[data-ca-tool="swap"]');
      await desk.mouse.click(button.x, button.y); await wait(150);
      const clicked = await game(desk);
      q.tools.button = { swap: clicked.engine.tools.swap, focus: clicked.focus };
      expect("Tools by their buttons: the Re-scope button does what its key does, and the board keeps the keyboard afterwards", clicked.engine.tools.swap === swapsLeft - 1 && clicked.engine.held === debugged.engine.next && clicked.focus === "board");
    }
    await release(desk);
  }
  {
    /* pause: by key, by the tab going out of sight, by the button */
    await desk.keyboard.press("p"); await stateIs(desk, "paused"); await wait(250);
    q.paused = await game(desk);
    const stepsAt = await desk.evaluate(() => window.KaanCareerAdventure.run().steps);
    q.pausedFrames = await desk.evaluate(async () => { const before = window.__qa.frames; await new Promise((done) => setTimeout(done, 1200)); return window.__qa.frames - before; });
    const stepsLater = await desk.evaluate(() => window.KaanCareerAdventure.run().steps);
    expect("Pause (P): the pause layer with Resume, Restart run, How to Play, Settings and Main Menu, focus on Resume; the simulation does not advance and no frame is asked for", q.paused.state === "paused" && q.paused.layer === "pause" && same(q.paused.panel.buttons, [copy("pause.resume"), copy("pause.restart"), copy("menu.how"), copy("menu.settings"), copy("mainMenu")]) && q.paused.focus === "button[data-ca-resume]" && stepsLater === stepsAt && q.pausedFrames === 0);
    await press(desk, '[data-ca-layer="pause"] [data-ca-open="how"]'); await wait(200);
    await desk.keyboard.press("Escape"); await wait(200);
    q.pauseSub = (await game(desk)).layer;
    await desk.keyboard.press("Escape"); await stateIs(desk, "playing"); await wait(200);
    q.resumed = await game(desk);
    await desk.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
    await stateIs(desk, "paused"); await wait(150);
    q.hiddenPause = (await game(desk)).engine.phase;
    await desk.evaluate(() => { delete document.hidden; });
    await press(desk, '[data-ca-layer="pause"] [data-ca-resume]'); await stateIs(desk, "playing"); await wait(150);
    expect("Pause: a layer opened from it returns to it; Escape resumes; a tab that goes out of sight pauses the run", q.pauseSub === "pause" && q.resumed.state === "playing" && q.resumed.layer === null && q.hiddenPause === "paused");
    /* restart */
    await desk.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(desk, "paused"); await wait(150);
    await press(desk, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(desk, "playing"); await wait(250);
    q.restarted = await desk.evaluate(() => ({ ...window.KaanCareerAdventure.state(), bodies: window.KaanCareerAdventure.run().bodies.length }));
    expect("Restart run: score 0, nothing dropped, an empty chamber, a Book in hand, the tools back to two and one", q.restarted.phase === "playing" && q.restarted.score === 0 && q.restarted.drops === 0 && q.restarted.bodies === 0 && q.restarted.held === 0 && q.restarted.tools.swap === 2 && q.restarted.tools.debug === 1);
  }
  {
    /* sound: the switch in the HUD, and that it only speaks after the visitor has acted */
    const button = await at(desk, "[data-ca-sound]");
    await desk.mouse.click(button.x, button.y); await wait(120);
    const off = await game(desk);
    await desk.mouse.click(button.x, button.y); await wait(120);
    const on = await game(desk);
    q.sound = { off: [off.hud.sound, stored(off.profile).settings.sound], on: [on.hud.sound, stored(on.profile).settings.sound] };
    expect("Sound: the HUD switch turns it off and on, and the choice is kept", same(q.sound.off, ["false", false]) && same(q.sound.on, ["true", true]));
  }

  /* ---------- active cost, on the browser's frames ---------- */
  {
    const session = await desk.createCDPSession();
    await session.send("Performance.enable");
    const read = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
    await desk.evaluate(() => { window.__qa.long = 0; window.__gaps = []; let last = performance.now(); const tick = (now) => { window.__gaps.push(now - last); last = now; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); });
    const before = await read();
    const started = Date.now();
    /* twenty seconds of play: a drop every 450 ms across the chamber */
    await desk.evaluate(async () => { const api = window.KaanCareerAdventure; for (let i = 0; i < 44 && api.state().phase === "playing"; i += 1) { api.aim(40 + ((i * 131) % 360)); api.drop(); await new Promise((done) => setTimeout(done, 450)); } });
    const after = await read();
    const gaps = await desk.evaluate(() => { window.__sampling = false; return window.__gaps.slice(2).sort((a, b) => a - b); });
    q.playCost = { ms: Date.now() - started, scriptMs: Math.round((after.ScriptDuration - before.ScriptDuration) * 1000), taskMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000), layouts: after.LayoutCount - before.LayoutCount, longTasks: await desk.evaluate(() => window.__qa.long), frames: gaps.length, medianFrameMs: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10, p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10, worstFrameMs: Math.round(gaps.at(-1) * 10) / 10, merges: await desk.evaluate(() => window.__qa.merges.length), bodies: await desk.evaluate(() => window.KaanCareerAdventure.run().bodies.length) };
    await session.detach();
    expect("Active cost: twenty seconds of ordinary play (a drop every 450 ms, merges and their effects) raise no long task", q.playCost.longTasks === 0 && q.playCost.merges > 10);
  }

  /* ---------- game over: reachable, real, and not restarted ---------- */
  await desk.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(desk, "paused"); await wait(150);
  await desk.evaluate((seed) => { window.__qa.hold(true); window.__qa.seed(seed); window.__qa.merges.length = 0; window.__qa.ends.length = 0; }, 3);
  await press(desk, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(desk, "playing");
  q.lost = await lose(desk);
  const endingAt = await desk.evaluate(() => ({ phase: window.KaanCareerAdventure.state().phase, over: window.KaanCareerAdventure.run().over, steps: window.KaanCareerAdventure.run().steps, grace: window.KaanCareerAdventure.Sim.CFG.GRACE }));
  await toEnd(desk);
  q.over = await game(desk);
  q.overEvent = await desk.evaluate(() => window.__qa.ends.at(-1));
  expect("Game over is reachable: every drop into one place ends the run, and only after something has stayed above the line for the whole grace (2.2 s)", endingAt.over && q.lost.firstAbove !== null && endingAt.steps - q.lost.firstAbove >= endingAt.grace && q.overEvent && q.overEvent.won === false);
  expect("Game over: the layer states score, best, furthest object, best chain and time, sums the run up in a sentence, and offers Try Again, Main Menu and Exit to Portfolio, with focus on Try Again", q.over.state === "over" && q.over.layer === "over" && q.over.panel.title === copy("over.title") && q.over.panel.stats[copy("stat.score")].startsWith(q.overEvent.score.toLocaleString("en")) && q.over.panel.stats[copy("progress.furthest")] === LADDER[q.overEvent.highest] && q.over.panel.stats[copy("stat.chain")] === `${q.overEvent.bestChain}×` && q.over.panel.text.some((line) => line === copy("over.summary").replace("{object}", LADDER[q.overEvent.highest]).replace("{merges}", String(q.overEvent.merges)).replace("{drops}", String(q.overEvent.drops))) && same(q.over.panel.buttons, [copy("over.retry"), copy("mainMenu"), copy("menu.exit")]) && q.over.focus === "button[data-ca-play]" && q.over.panel.fits);
  await release(desk);
  await wait(2600);
  q.overLater = await game(desk);
  q.overFrames = await desk.evaluate(async () => { const before = window.__qa.frames; await new Promise((done) => setTimeout(done, 1000)); return window.__qa.frames - before; });
  expect("Game over stays: 2.6 s later it is the same screen with the same score — nothing restarts by itself — and the engine has stopped asking for frames", q.overLater.state === "over" && q.overLater.engine.score === q.over.engine.score && q.overLater.engine.phase === "over" && q.overFrames === 0);
  q.afterOver = stored(q.overLater.profile);
  expect("Persistence: the best score and the furthest object are kept under a versioned key, and the old key is neither read nor written", q.afterOver && q.afterOver.v === 2 && q.afterOver.best >= q.overEvent.score && q.afterOver.highest >= q.overEvent.highest && q.afterOver.wins === 0 && q.overLater.legacyBest === null);

  /* ---------- victory: the recorded run, through the page's own clock ---------- */
  await desk.evaluate((seed) => { window.__qa.hold(true); window.__qa.cursor = 0; window.__qa.merges.length = 0; window.__qa.ends.length = 0; window.__qa.milestones.length = 0; window.__qa.seed(seed); }, RECORDING.seed);
  await press(desk, '[data-ca-layer="over"] [data-ca-play]'); await stateIs(desk, "playing");
  q.replay = await replay(desk);
  await desk.evaluate(() => { const api = window.KaanCareerAdventure; for (let i = 0; i < 4000 && api.state().phase === "playing"; i += 1) api.tick(1000 / 120); });
  q.wonAt = await desk.evaluate(() => ({ phase: window.KaanCareerAdventure.state().phase, steps: window.KaanCareerAdventure.run().endedAt, score: window.KaanCareerAdventure.run().score, merges: window.KaanCareerAdventure.run().merges, drops: window.KaanCareerAdventure.run().drops, bestChain: window.KaanCareerAdventure.run().bestChain, effects: window.KaanCareerAdventure.view().effects }));
  expect("Victory: the recorded run, replayed step for step through the page, creates the Job Offer at the same step with the same score, merges and best chain as the simulation run outside the browser — the game is one deterministic simulation", q.replay.stopped === null && q.wonAt.phase === "ending" && same([q.wonAt.steps, q.wonAt.score, q.wonAt.merges, q.wonAt.drops, q.wonAt.bestChain], [RECORDING.expect.steps, RECORDING.expect.score, RECORDING.expect.merges, RECORDING.expect.drops, RECORDING.expect.bestChain]));
  q.milestones = await desk.evaluate(() => window.__qa.milestones.map((item) => [item.name, item.theme]));
  expect("Milestones: HTML / CSS, Python, AI Flow, Portfolio and Interview are each announced once, in order; Python opens City Night and AI Flow opens AI Lab", same(q.milestones, [["HTML / CSS", null], ["Python", "city"], ["AI Flow", "lab"], ["Portfolio", null], ["Interview", null]]));
  await frames(desk, 30);
  q.celebration = await desk.evaluate(() => ({ phase: window.KaanCareerAdventure.state().phase, layer: [...document.querySelectorAll("[data-ca-layer]")].find((entry) => !entry.hidden)?.getAttribute("data-ca-layer") || null, effects: window.KaanCareerAdventure.view().effects }));
  expect("Victory: the board keeps the moment first — half a second in, the offer is being celebrated on the canvas and no layer has covered it", q.celebration.phase === "ending" && q.celebration.layer === null && q.celebration.effects > 20);
  await toEnd(desk, 4000);
  q.won = await game(desk);
  q.wonEvent = await desk.evaluate(() => window.__qa.ends.at(-1));
  expect("Victory: the layer names the Job Offer, shows the run's score as a new best, the furthest object, best chain and time, and offers Play Again, Main Menu and Exit to Portfolio", q.won.state === "won" && q.won.layer === "win" && q.won.panel.title === copy("win.title") && q.won.panel.stats[copy("stat.score")].startsWith(RECORDING.expect.score.toLocaleString("en")) && q.won.panel.stats[copy("stat.score")].endsWith(copy("win.newBest")) && q.won.panel.stats[copy("progress.furthest")] === "Job Offer" && same(q.won.panel.buttons, [copy("win.again"), copy("mainMenu"), copy("menu.exit")]) && q.won.focus === "button[data-ca-play]" && q.won.panel.fits && q.wonEvent.won === true && q.wonEvent.newBest === true);
  await release(desk);
  await wait(2600);
  q.wonLater = await game(desk);
  expect("Victory stays: nothing restarts by itself; one win, the best score and the Job Offer are in the profile", q.wonLater.state === "won" && stored(q.wonLater.profile).wins === 1 && stored(q.wonLater.profile).best === RECORDING.expect.score && stored(q.wonLater.profile).highest === 12);
  await press(desk, '[data-ca-layer="win"] [data-ca-play]'); await stateIs(desk, "playing"); await wait(250);
  q.again = await game(desk);
  expect("Play Again: a new run from zero that keeps the best score in sight", q.again.engine.score === 0 && q.again.engine.drops === 0 && q.again.hud.best === RECORDING.expect.score.toLocaleString("en") && q.again.hud.score === "0");
  await desk.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(desk, "paused"); await wait(150);
  await press(desk, '[data-ca-layer="pause"] [data-ca-menu]'); await stateIs(desk, "menu"); await wait(250);
  q.menuAfter = await game(desk);
  expect("Main Menu from a run: the run is given up, the menu shows the profile's record, and every environment is now open", q.menuAfter.state === "menu" && q.menuAfter.engine.phase === "idle" && q.menuAfter.panel.text.some((line) => line.includes(RECORDING.expect.score.toLocaleString("en")) && line.includes("Job Offer")));
  await press(desk, '[data-ca-layer="menu"] [data-ca-open="settings"]'); await wait(250);
  await press(desk, '[data-ca-theme="city"]'); await wait(250);
  q.theme = await game(desk);
  expect("Environments: with Python and AI Flow reached both are unlocked; choosing City Night repaints the room and is kept", q.theme.panel.themes.every((theme) => !theme.locked) && q.theme.panel.themes.find((theme) => theme.id === "city").active && stored(q.theme.profile).settings.theme === "city");
  await press(desk, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(200);

  /* ---------- leaving: Exit, Back, Forward, a reload ---------- */
  await press(desk, '[data-ca-layer="menu"] [data-ca-exit]'); await wait(700);
  q.left = { ...(await intro(desk)), scroll: await desk.evaluate(() => Math.round(scrollY)), inert: await desk.evaluate(() => [...document.body.children].filter((item) => item.inert && item.id !== "react-command-root").length) };
  expect("Exit to Portfolio: the page is back as it was left — header, footer, launcher, scroll position, focus on Play Career Adventure, nothing inert — with the profile's record beside the button and the engine at rest", q.left.state === null && q.left.header && q.left.footer && q.left.launcher && q.left.scroll === q.scrollBefore && q.left.focus === "play" && q.left.inert === 0 && q.left.record.includes(RECORDING.expect.score.toLocaleString("en")) && q.left.engineRunning === false && !q.left.hud);
  await press(desk, ".ca-enter [data-ca-enter]"); await stateIs(desk, "menu"); await wait(300);
  await desk.goBack(); await wait(700);
  q.backButton = await desk.evaluate(() => ({ state: document.documentElement.getAttribute("data-ca-state"), path: location.pathname, header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  expect("Browser Back leaves the game for its page, not the site", q.backButton.state === null && q.backButton.path === GAME && q.backButton.header);
  await desk.goForward(); await wait(700);
  q.forward = (await game(desk)).state;
  await desk.goBack(); await wait(500);
  expect("Browser Forward returns to the game's menu", q.forward === "menu");
  await visit(desk, GAME); await desk.waitForFunction(() => window.KaanCareerAdventure && document.querySelectorAll("[data-merge-ladder] article").length === 13, { timeout: 20000 }); await wait(400);
  q.reloaded = await intro(desk);
  q.reloadedProfile = await desk.evaluate(() => ({ ...window.KaanCareerAdventure.state(), settings: window.KaanCareerAdventure.settings(), themes: window.KaanCareerAdventure.themes(), unlocked: document.querySelectorAll("[data-merge-ladder] article.is-unlocked").length }));
  expect("After a reload: best score, furthest object, the win, the unlocked environments, the chosen one and the changed volume are all still there", q.reloaded.record === q.left.record && q.reloadedProfile.best === RECORDING.expect.score && q.reloadedProfile.furthest === 12 && q.reloadedProfile.wins === 1 && q.reloadedProfile.settings.theme === "city" && q.reloadedProfile.settings.volume === 0.35 && q.reloadedProfile.themes.every((theme) => theme.unlocked) && q.reloadedProfile.unlocked === 13);
  expect("Desktop: no horizontal overflow", (await overflow(desk)) === 0);
  await desk.done();

  /* ---------- a link straight to the game ---------- */
  const linked = await fresh({ viewport: DESKTOP, path: `${GAME}#career-merge-game` });
  await stateIs(linked, "menu"); await wait(300);
  q.linked = (await game(linked)).layer;
  expect("A link to the game (the language links are): the page opens at the menu", q.linked === "menu");
  await linked.done();

  /* ---------- the rules, held on the simulation the page shipped ---------- */
  const lab = await fresh({ viewport: DESKTOP });
  q.strategies = [];
  for (const name of ["centre", "left", "alternate", "random", "bad"]) {
    q.strategies.push(await lab.evaluate((name) => window.__qa.strategies(name, 100), name));
    console.log(`[v4:capture] strategy · ${name}`);
  }
  const strategy = (name) => q.strategies.find((row) => row.strategy === name);
  const clean = (row) => Object.values(row.violations).every((count) => count === 0);
  expect(`Negative control, one position: 100 runs each of every drop in the centre and every drop against the left wall do not reach the Job Offer (${strategy("centre").won} and ${strategy("left").won} wins)`, strategy("centre").won <= 5 && strategy("left").won <= 5);
  expect(`Negative control, alternating edges: 100 runs of left, right, left, right do not solve the game (${strategy("alternate").won} wins)`, strategy("alternate").won <= 5);
  expect(`Negative control, random: 100 runs of random drops fail at a meaningful rate (${strategy("random").over} game overs)`, strategy("random").over >= 80);
  expect(`Game over is reachable in a reasonable number of drops: a deliberately bad strategy (always as far as possible from a match) ends in a median of ${strategy("bad").medianDropsToOver} drops, never surviving 700`, strategy("bad").over === 100 && strategy("bad").medianDropsToOver <= 140);
  expect("Rules, checked at every step of those 500 runs: a dropped object never appears inside another; two of the same object in contact have merged by the next step; no object merges twice; the score is exactly the points of the merges; the chamber holds exactly drops − merges objects; nothing leaves the glass; no run ends before the full grace", q.strategies.every(clean));
  expect("The grace is real: in those runs a stack went above the line and came back under it without ending the run", q.strategies.reduce((sum, row) => sum + row.recoveries, 0) > 0);

  /* ---------- the same game at every refresh rate ---------- */
  await lab.evaluate(() => { document.querySelector(".ca-enter [data-ca-enter]").click(); });
  await stateIs(lab, "menu"); await wait(250);
  await lab.evaluate(() => window.__qa.hold(true));
  q.refresh = { fall: [], scripted: [] };
  for (const hz of HZ) {
    /* one Book, let go at the same place: when does it land? */
    await lab.evaluate((seed) => window.__qa.seed(seed), 7);
    await press(lab, ".ca-layer:not([hidden]) [data-ca-play]"); await stateIs(lab, "playing");
    q.refresh.fall.push(await lab.evaluate((hz) => {
      const api = window.KaanCareerAdventure;
      api.aim(220); api.drop();
      let shown = 0;
      while (!api.run().bodies[0].landed && shown < 2000) { api.tick(1000 / hz); shown += 1; }
      return { hz, framesShown: shown, landedAtStep: api.run().bodies[0].landed, simulatedMs: Math.round(shown * 1000 / hz) };
    }, hz));
    /* forty drops, one every 900 ms of play, at fixed places */
    await lab.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(lab, "paused");
    await lab.evaluate((seed) => window.__qa.seed(seed), 21);
    await press(lab, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(lab, "playing");
    q.refresh.scripted.push(await lab.evaluate((hz) => {
      const api = window.KaanCareerAdventure;
      let clock = 0, next = 0, dropped = 0;
      while (dropped < 40 && api.state().phase === "playing") {
        if (clock >= next) { api.aim(30 + ((dropped * 157) % 380)); if (api.drop()) { dropped += 1; next += 900; } }
        api.tick(1000 / hz); clock += 1000 / hz;
      }
      for (let extra = 0; extra * (1000 / hz) < 1500; extra += 1) api.tick(1000 / hz);
      const run = api.run();
      return { hz, drops: run.drops, steps: run.steps, score: run.score, merges: run.merges, furthest: run.highest, bodies: run.bodies.length, playedMs: Math.round(clock + 1500) };
    }, hz));
    await lab.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(lab, "paused");
    await press(lab, '[data-ca-layer="pause"] [data-ca-menu]'); await stateIs(lab, "menu");
  }
  /* and on frames of no fixed length at all: 4 to 40 ms, as a busy phone gives them */
  await lab.evaluate((seed) => window.__qa.seed(seed), 21);
  await press(lab, ".ca-layer:not([hidden]) [data-ca-play]"); await stateIs(lab, "playing");
  q.refresh.irregular = await lab.evaluate(() => {
    const api = window.KaanCareerAdventure;
    let a = 12345, clock = 0, next = 0, dropped = 0;
    const length = () => { a = (a * 1664525 + 1013904223) >>> 0; return 4 + (a / 4294967296) * 36; };
    while (dropped < 40 && api.state().phase === "playing") {
      if (clock >= next) { api.aim(30 + ((dropped * 157) % 380)); if (api.drop()) { dropped += 1; next += 900; } }
      const ms = length(); api.tick(ms); clock += ms;
    }
    for (let extra = 0; extra < 100; extra += 1) api.tick(15);
    const run = api.run();
    return { drops: run.drops, score: run.score, merges: run.merges, furthest: run.highest, bodies: run.bodies.length };
  });
  {
    const fall = q.refresh.fall;
    const runs = [...q.refresh.scripted, q.refresh.irregular];
    const scores = runs.map((row) => row.score);
    q.refresh.scoreSpreadPercent = Math.round(((Math.max(...scores) - Math.min(...scores)) / Math.max(...scores)) * 1000) / 10;
    expect(`Refresh rate, physics: a Book let go from the same place lands at the same step of the simulation at ${HZ.join(", ")} Hz (step ${fall[0].landedAtStep}), so in the same time on every display — within one frame of ${Math.round(fall[0].landedAtStep * 1000 / 120)} ms`, fall.every((row) => row.landedAtStep === fall[0].landedAtStep && Math.abs(row.simulatedMs - row.landedAtStep * 1000 / 120) <= 1000 / row.hz + 1));
    expect(`Refresh rate, play: the same forty drops on a 900 ms beat reach the same furthest object with the same number of merges and objects left at every rate and on irregular frames; scores within ${q.refresh.scoreSpreadPercent} %`, runs.every((row) => row.drops === 40 && row.furthest === runs[0].furthest && Math.abs(row.merges - runs[0].merges) <= 2 && Math.abs(row.bodies - runs[0].bodies) <= 2) && q.refresh.scoreSpreadPercent <= 10);
  }
  /* a crowd far beyond anything play produces */
  q.crowd = await lab.evaluate(() => window.__qa.crowd(180));
  q.maxBodies = Math.max(...q.strategies.map((row) => row.maxBodies));
  expect(`Extreme object counts: 180 objects poured in at once (play never held more than ${q.maxBodies}) are simulated without anything leaving the glass, a step never costing more than a frame can give`, q.crowd.outside === 0 && q.crowd.left < q.crowd.started && q.crowd.worstStepMs < 12);
  /* a slow frame cannot make the game run away */
  await lab.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(lab, "paused");
  await lab.evaluate((seed) => window.__qa.seed(seed), 5);
  await press(lab, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(lab, "playing");
  q.slowFrame = await lab.evaluate(() => { const api = window.KaanCareerAdventure; api.aim(200); api.drop(); const before = api.run().steps; api.tick(5000); return api.run().steps - before; });
  expect("A stalled frame: five seconds arriving as one frame advance the simulation by at most twelve steps (0.1 s), never by five seconds", q.slowFrame <= 12);
  await lab.done();

  /* ---------- touch: phone ---------- */
  const phone = await fresh({ viewport: MOBILE, touch: true });
  q.phonePage = await intro(phone);
  await phone.touchscreen.tap((await at(phone, ".ca-enter [data-ca-enter]")).x, (await at(phone, ".ca-enter [data-ca-enter]")).y); await stateIs(phone, "menu"); await wait(400);
  q.phoneMenu = await game(phone);
  { const button = await at(phone, '[data-ca-layer="menu"] [data-ca-play]'); await phone.evaluate((seed) => window.__qa.seed(seed), 11); await phone.touchscreen.tap(button.x, button.y); await stateIs(phone, "playing"); await wait(350); }
  q.phoneStart = await game(phone);
  expect("Phone: the chamber takes most of the screen — at least 85 % of its width — with the controls in bars above and below; no side panel, no card over the chamber, every control at least 44 px, nothing scrolls sideways", q.phonePage.overflow === 0 && q.phoneMenu.overflow === 0 && q.phoneStart.board.widthShare >= 85 && q.phoneStart.board.share >= 45 && q.phoneStart.cardsOverBoard.length === 0 && !q.phoneStart.cardsOverlap && q.phoneStart.outOfView === 0 && q.phoneStart.smallTargets === 0 && q.phoneStart.overflow === 0 && q.phoneStart.hudShown);
  expect("Phone: the next object is always in sight, the score is compact, and the AJOOP launcher is not on the screen", q.phoneStart.hud.nextDrawn === String(q.phoneStart.engine.next) && q.phoneStart.hud.nextLabel === copy("hud.next") && !q.phoneStart.launcher && q.phoneStart.touchAction === "none");
  {
    const box = q.phoneStart.view;
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.55 };
    const to = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.3 };
    await phone.touchscreen.touchStart(from.x, from.y); await wait(80);
    const down = await phone.evaluate(() => ({ aim: window.KaanCareerAdventure.view().aim, drops: window.KaanCareerAdventure.run().drops }));
    for (let step = 1; step <= 8; step += 1) await phone.touchscreen.touchMove(from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8);
    await wait(80);
    const dragged = await phone.evaluate(() => ({ aim: window.KaanCareerAdventure.view().aim, drops: window.KaanCareerAdventure.run().drops, scroll: scrollY }));
    await phone.touchscreen.touchEnd(); await wait(900);
    const lifted = await phone.evaluate(() => ({ drops: window.KaanCareerAdventure.run().drops, x: window.KaanCareerAdventure.run().bodies[0]?.x, scroll: scrollY }));
    q.touch = { downAim: Math.round(down.aim), dragAim: Math.round(dragged.aim), wanted: Math.round((to.x - box.x) / box.scale), dropsWhileDown: dragged.drops, dropsAfterLift: lifted.drops, landedAt: Math.round(lifted.x), scroll: lifted.scroll };
    expect("Touch: a finger down aims and nothing drops; dragging moves the object with it; lifting drops it there — one deliberate drop — and the page never scrolls", Math.abs(q.touch.downAim - Math.round((from.x - box.x) / box.scale)) <= 1 && q.touch.dropsWhileDown === 0 && Math.abs(q.touch.dragAim - q.touch.wanted) <= 1 && q.touch.dropsAfterLift === 1 && Math.abs(q.touch.landedAt - q.touch.wanted) <= 6 && q.touch.scroll === 0);
    await phone.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.6); await wait(800);
    q.touch.tap = await phone.evaluate(() => window.KaanCareerAdventure.run().drops);
    const swap = await at(phone, '[data-ca-tool="swap"]');
    const before = await phone.evaluate(() => window.KaanCareerAdventure.state());
    await phone.touchscreen.tap(swap.x, swap.y); await wait(200);
    const after = await phone.evaluate(() => window.KaanCareerAdventure.state());
    q.touch.tool = before.held === before.next ? "same objects" : after.tools.swap === before.tools.swap - 1;
    const pause = await at(phone, "[data-ca-pause]");
    await phone.touchscreen.tap(pause.x, pause.y); await stateIs(phone, "paused"); await wait(250);
    q.phonePause = await game(phone);
    expect("Touch: a tap drops; the tools and pause answer a finger; the pause layer fits the phone", q.touch.tap === 2 && q.touch.tool !== false && q.phonePause.layer === "pause" && q.phonePause.panel.fits && q.phonePause.panel.controlsInView && q.phonePause.overflow === 0);
    await phone.touchscreen.tap((await at(phone, '[data-ca-layer="pause"] [data-ca-resume]')).x, (await at(phone, '[data-ca-layer="pause"] [data-ca-resume]')).y); await stateIs(phone, "playing"); await wait(200);
  }
  {
    /* a phone four times slower than this machine */
    const session = await phone.createCDPSession();
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await phone.evaluate(() => { window.__qa.long = 0; window.__gaps = []; let last = performance.now(); const tick = (now) => { window.__gaps.push(now - last); last = now; if (window.__sampling) requestAnimationFrame(tick); }; window.__sampling = true; requestAnimationFrame(tick); });
    await phone.evaluate(async () => { const api = window.KaanCareerAdventure; for (let i = 0; i < 26 && api.state().phase === "playing"; i += 1) { api.aim(40 + ((i * 131) % 360)); api.drop(); await new Promise((done) => setTimeout(done, 450)); } });
    const gaps = await phone.evaluate(() => { window.__sampling = false; return window.__gaps.slice(2).sort((a, b) => a - b); });
    q.phoneCost = { frames: gaps.length, medianFrameMs: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10, p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10, worstFrameMs: Math.round(gaps.at(-1) * 10) / 10, longTasks: await phone.evaluate(() => window.__qa.long), bodies: await phone.evaluate(() => window.KaanCareerAdventure.run().bodies.length) };
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await session.detach();
    expect("Phone, 4× slower CPU: twelve seconds of play keep their frames — 95 % of them inside 34 ms — with no long task", q.phoneCost.p95FrameMs <= 34 && q.phoneCost.longTasks === 0);
  }
  await phone.evaluate(() => { window.KaanCareerAdventure.pause(); }); await stateIs(phone, "paused"); await wait(150);
  await phone.evaluate((seed) => { window.__qa.hold(true); window.__qa.seed(seed); window.__qa.ends.length = 0; }, 3);
  await press(phone, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(phone, "playing");
  await lose(phone); await toEnd(phone);
  q.phoneOver = await game(phone);
  expect("Phone: game over fits, with its three actions in view", q.phoneOver.state === "over" && q.phoneOver.panel.fits && q.phoneOver.panel.controlsInView && q.phoneOver.overflow === 0);
  await press(phone, '[data-ca-layer="over"] [data-ca-menu]'); await stateIs(phone, "menu"); await wait(200);
  for (const name of ["how", "settings", "progress"]) {
    await press(phone, `[data-ca-layer="menu"] [data-ca-open="${name}"]`); await wait(300);
    const sheetState = await game(phone);
    expect(`Phone: ${name} can be read and left — no sideways overflow, and Back in reach by scrolling its own panel`, sheetState.layer === name && sheetState.overflow === 0 && sheetState.panel.buttons.includes(copy("back")));
    await press(phone, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(200);
  }
  await phone.done();

  /* ---------- other sizes ---------- */
  q.sizes = {};
  for (const [name, viewport, touch, minimumWidthShare] of [["tablet 820 × 1180", TABLET, true, 60], ["tablet landscape 1180 × 820", { width: 1180, height: 820 }, true, 25], ["small laptop 1100 × 720", { width: 1100, height: 720 }, false, 25], ["desktop 1280 × 800", { width: 1280, height: 800 }, false, 25], ["wide 1920 × 1080", { width: 1920, height: 1080 }, false, 25], ["landscape phone 844 × 390", LANDSCAPE, true, 15]]) {
    const page = await fresh({ viewport, touch });
    const before = await intro(page);
    await enter(page);
    const menu = await game(page);
    await start(page, { seed: RECORDING.seed, hold: true });
    await replay(page, 40); await frames(page, 40);
    const playing = await game(page);
    await page.evaluate(() => window.KaanCareerAdventure.pause()); await stateIs(page, "paused"); await wait(150);
    const paused = await game(page);
    await page.evaluate((seed) => { window.__qa.seed(seed); }, 3);
    await press(page, '[data-ca-layer="pause"] [data-ca-play]'); await stateIs(page, "playing");
    await lose(page); await toEnd(page);
    const over = await game(page);
    q.sizes[name] = { board: `${playing.board.width} × ${playing.board.height}`, widthShare: playing.board.widthShare, share: playing.board.share, overflow: before.overflow + menu.overflow + playing.overflow + paused.overflow + over.overflow, cardsOverBoard: playing.cardsOverBoard, cardsOverlap: playing.cardsOverlap, outOfView: playing.outOfView + menu.outOfView, smallTargets: playing.smallTargets, smallest: playing.smallest, menuFits: menu.panel.controlsInView, pauseFits: paused.panel.controlsInView, overReachable: over.state === "over" };
    const row = q.sizes[name];
    expect(`${name}: page, menu, play, pause and game over have no overflow; no HUD card covers the chamber or another card; every HUD control is in view${touch ? " and at least 44 px" : ""}; the run can be lost and its result shown`, row.overflow === 0 && row.cardsOverBoard.length === 0 && !row.cardsOverlap && row.outOfView === 0 && (!touch || row.smallTargets === 0) && row.overReachable && row.widthShare >= minimumWidthShare);
    await page.done();
  }

  /* ---------- reduced motion, no JavaScript, engine failure ---------- */
  const still = await fresh({ viewport: DESKTOP, reducedMotion: true });
  await enter(still);
  q.reducedMotion = { setting: await still.evaluate(() => window.KaanCareerAdventure.settings().reduced) };
  await start(still, { seed: RECORDING.seed, hold: true });
  await replay(still, 30);
  await replay(still, RECORDING.drops.length, { chain: 2 });
  await frames(still, 3);
  q.reducedMotion.afterChain = await still.evaluate(() => ({ shake: window.KaanCareerAdventure.view().shake, merges: window.__qa.merges.length, score: window.KaanCareerAdventure.state().score }));
  q.reducedMotion.css = await motionState(still);
  await replay(still); await toEnd(still, 4000);
  q.reducedMotion.end = (await game(still)).state;
  q.reducedMotion.score = (await game(still)).engine.score;
  expect("Reduced motion: the game starts with reduced effects on; a chain shakes nothing; no CSS animation runs; and the same recorded run still reaches the same Job Offer with the same score — the effects are only ever pictures", q.reducedMotion.setting === true && q.reducedMotion.afterChain.shake === 0 && q.reducedMotion.css.running === 0 && q.reducedMotion.end === "won" && q.reducedMotion.score === RECORDING.expect.score);
  await still.done();

  const plain = await fresh({ viewport: DESKTOP, noJs: true, settle: 500 });
  q.noJs = await intro(plain);
  expect("Without JavaScript: the game's name, a plain notice that it needs JavaScript with links to Games and Works — and no Play button, no poster and no empty board", q.noJs.heading === "Kaan's Career Adventure" && q.noJs.notice === `${copy("noscript")} ${copy("noscriptGames")} · ${copy("noscriptWorks")}` && same(q.noJs.noticeLinks, ["/games/", "/works/"]) && q.noJs.play === null && !q.noJs.poster && !q.noJs.board && q.noJs.header);
  await plain.done();

  const broken = await fresh({ viewport: DESKTOP, fail: true });
  q.failurePage = await intro(broken);
  await press(broken, ".ca-enter [data-ca-enter]"); await wait(600);
  q.failureState = await broken.evaluate(() => ({ state: document.documentElement.getAttribute("data-ca-state"), error: document.querySelector('[data-ca-layer="error"]').hidden ? null : document.querySelector('[data-ca-layer="error"]').textContent.replace(/\s+/g, " ").trim(), focus: document.activeElement?.hasAttribute("data-ca-reload"), header: Boolean(document.querySelector(".site-header").getClientRects().length), buttons: [...document.querySelectorAll('[data-ca-layer="error"] button')].map((button) => button.textContent.trim()) }));
  await press(broken, '[data-ca-layer="error"] [data-ca-exit]'); await wait(500);
  q.failureExit = await broken.evaluate(() => ({ state: document.documentElement.getAttribute("data-ca-state"), header: Boolean(document.querySelector(".site-header").getClientRects().length) }));
  expect("Engine failure (forced): on the page the board's frame is not empty; pressing Play opens a small recoverable state — what happened, Reload, Exit to Portfolio — instead of a blank canvas; leaving works", q.failurePage.boardBackdrop === true && q.failureState.state === "error" && q.failureState.error.startsWith(copy("error.title")) && same(q.failureState.buttons, [copy("error.reload"), copy("menu.exit")]) && q.failureState.focus && !q.failureState.header && q.failureExit.state === null && q.failureExit.header);
  await broken.done();

  /* ---------- every locale ---------- */
  const locales = {};
  for (const locale of LOCALES) {
    const catalog = JSON.parse(await readFile(join(ROOT, "data", "i18n", "messages", locale, "common.json"), "utf8"));
    const local = (key) => catalog[`adventure.play.${key}`];
    const names = LADDER_IDS.map((id) => local(`obj.${id}`));
    locales[locale] = {};
    for (const [name, viewport] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
      const touch = viewport === MOBILE;
      const page = await fresh({ viewport, path: localized(locale, GAME), touch });
      const before = await intro(page);
      await enter(page);
      const menu = await game(page);
      await press(page, '[data-ca-layer="menu"] [data-ca-open="how"]'); await wait(250);
      const how = await game(page);
      await press(page, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(200);
      await press(page, '[data-ca-layer="menu"] [data-ca-open="settings"]'); await wait(250);
      const settings = await game(page);
      await press(page, ".ca-layer:not([hidden]) [data-ca-back]"); await wait(200);
      await start(page, { seed: 3, hold: true });
      await frames(page, 4);
      const playing = await game(page);
      await lose(page); await toEnd(page);
      const over = await game(page);
      const event = await page.evaluate(() => window.__qa.ends.at(-1));
      locales[locale][name] = { touch, lang: await page.evaluate(() => document.documentElement.lang), play: before.play, ladder: before.ladder, menu: menu.panel.buttons, how: how.panel.steps[0], settings: settings.panel.settings.map((row) => row.label), currentLanguage: settings.panel.languages.find((item) => item.current)?.href, stage: playing.hud.stage, next: playing.hud.next, nextLabel: playing.hud.nextLabel, tools: [playing.hud.tools.swap.label, playing.hud.tools.debug.label], path: playing.hud.path.map((rung) => rung.name), overTitle: over.panel.title, overButtons: over.panel.buttons, overSummary: over.panel.text.at(-1), overflow: before.overflow + menu.overflow + how.overflow + settings.overflow + playing.overflow + over.overflow, cardsOverBoard: playing.cardsOverBoard.length, cardsOverlap: playing.cardsOverlap, outOfView: playing.outOfView, fits: menu.panel.controlsInView && over.panel.controlsInView, furthest: names[event.highest] };
      const row = locales[locale][name];
      expect(`${locale} ${name}: served in its locale; page, menu, how to play, settings, play and game over fit with no overflow, no card over the chamber and none overlapping`, row.lang.startsWith(locale) && row.overflow === 0 && row.cardsOverBoard === 0 && !row.cardsOverlap && row.outOfView === 0 && row.fits);
      expect(`${locale} ${name}: the game's own copy is this locale's catalog — the way in, menu, how to play, settings, HUD and game over — and the thirteen objects carry this locale's names on the ladder, in the HUD and in the summary`, row.play === local("enter") && same(row.menu, [local("menu.play"), local("menu.how"), local("menu.settings"), local("menu.progress"), local("menu.exit")]) && row.how === local("how.one") && same(row.settings, [local("settings.sound"), local("settings.volume"), local("settings.reduced"), local("settings.guide"), ...(touch ? [local("settings.haptics")] : [])]) && row.stage === local("hud.stage").replace("{n}", "1").replace("{total}", "13") && row.nextLabel === local("hud.next") && same(row.path, names) && same(row.ladder, names) && names.includes(row.next) && row.overTitle === local("over.title") && same(row.overButtons, [local("over.retry"), local("mainMenu"), local("menu.exit")]) && row.overSummary.includes(row.furthest) && row.currentLanguage === `${localized(locale, GAME)}#career-merge-game`);
      await page.done();
    }
    expect(`${locale}: the ladder keeps its technical names — HTML / CSS, JavaScript, Python, C# / .NET, AI Flow — and Job Offer, in every language`, same([4, 5, 6, 7, 9, 12].map((index) => names[index]), ["HTML / CSS", "JavaScript", "Python", "C# / .NET", "AI Flow", "Job Offer"]));
  }
  for (const key of ["play", "how", "stage", "overSummary"]) expect(`Locales: “${key}” is translated in each of the five`, new Set(LOCALES.map((locale) => locales[locale].desktop[key])).size === LOCALES.length);

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
  const reactEntry = async (root) => (await readFile(join(root, "dist-site", "adventure", "index.html"), "utf8")).match(/assets-react\/[^"]+\.js/)[0];
  const sizeOf = async (root, file) => {
    try { const bytes = await readFile(join(root, "dist-site", file)); return { raw: bytes.length, gzip: gzipSync(bytes).length }; } catch { return null; }
  };
  const sizes = [];
  for (const file of ["adventure/index.html", "adventure-game.js", "js/pages/career-adventure-game.js", "css/v4-career-adventure.css", "css/games/adventure.css", "react"]) {
    const after = await sizeOf(ROOT, file === "react" ? await reactEntry(ROOT) : file);
    const before = BASELINE_ROOT ? await sizeOf(BASELINE_ROOT, file === "react" ? await reactEntry(BASELINE_ROOT) : file) : undefined;
    sizes.push({ file: file === "react" ? "assets-react/production-main-*.js" : file, before, after });
  }
  expect("The page's accepted stylesheet ships byte for byte as before", !BASELINE_ROOT || sizes.filter((size) => size.file === "css/games/adventure.css").every((size) => size.before && size.before.raw === size.after.raw));

  await sheet(browser, "00-contact-sheet.png", TITLE, "Contact sheet · every panel is a production-build capture; full-size files sit beside this sheet", shots.map((shot) => ({ file: join(OUTPUT, shot.name), label: shot.label, width: shot.viewport.width === MOBILE.width ? 390 : shot.viewport === TABLET ? 620 : shot.viewport === LANDSCAPE ? 844 : 1080 })), 4680);
  await sheet(browser, "00-motion-frames.png", `${TITLE} · motion`, "Motion frames, in order, from one continuous session in one tab", filmFrames, 4100);

  const summary = { phase: PHASE, capturedAt: new Date().toISOString(), origin: ORIGIN, baselineOrigin: BASELINE, aiEdge: "stubbed: “down” (503)", recording: { seed: RECORDING.seed, drops: RECORDING.drops.length, expect: RECORDING.expect }, game: q, locales, lcpEntry: lcp, transfers, sizes, motionFrames: filmFrames.map((item) => item.label), consoleProblems: problems, failures };
  await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const sizeCell = (size, key) => (!size.after ? "—" : `${kb(size.after[key])}${size.before === undefined ? "" : size.before === null ? " (new)" : ` (${size.after[key] - size.before[key] >= 0 ? "+" : "−"}${kb(Math.abs(size.after[key] - size.before[key]))})`}`);
  const lcpCell = (cell) => (cell ? `${cell.medianMs} ms on <${cell.element}>${cell.file ? ` (${cell.file})` : ""} · CLS ≤ ${cell.clsMax}` : "not measured");
  const violations = (row) => Object.entries(row.violations).filter(([, count]) => count > 0).map(([name, count]) => `${name} ${count}`).join(", ") || "none";
  const readme = `# ${TITLE} · review pack

Generated by \`npm run v4:review-pack\` on ${summary.capturedAt} from the production build in \`dist-site/\`.
Nothing in this folder is in Git.

- **\`00-contact-sheet.png\`** — all ${shots.length} still panels, labelled.
- **\`00-motion-frames.png\`** — ${filmFrames.length} frames from one continuous session in one tab, in order; the individual frames are in \`motion-frames/\`.
- **\`qa-summary.json\`** — everything measured in this run.
- **\`${PACK}\`** — everything here.

AJOOP's public AI edge (\`${EDGE}\`) was stubbed (503) for every capture and check. Nothing in the page was replaced. The test browser recorded the engine's own events and, where a capture or a check needed an exact moment, held the display's frames and drove the game's own frame function instead (\`KaanCareerAdventure.tick\`, the function every frame calls). The winning run is one recorded run (seed ${RECORDING.seed}, ${RECORDING.drops.length} drops) from \`scripts/v4-e06-3-career-adventure-sim.mjs --record\`; the losing runs drop everything in one place. The engine-failure state was forced by refusing the engine's script.

## Still panels

| # | File | Shows |
| --- | --- | --- |
${shots.map((shot, index) => `| ${index + 1} | ${shot.name} | ${shot.label} |`).join("\n")}

## Motion frames

${filmFrames.map((item, index) => `${index + 1}. ${item.label}`).join("\n")}

## The chamber, measured

| | Chamber | Share of viewport width | Share of viewport |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | ${q.started.board.width} × ${q.started.board.height} | ${q.started.board.widthShare} % | ${q.started.board.share} % |
| Phone 390 × 844 | ${q.phoneStart.board.width} × ${q.phoneStart.board.height} | ${q.phoneStart.board.widthShare} % | ${q.phoneStart.board.share} % |
${Object.entries(q.sizes).map(([name, row]) => `| ${name} | ${row.board} | ${row.widthShare} % | ${row.share} % |`).join("\n")}

## Strategy negative controls (100 runs each, on the simulation the page shipped)

| Strategy | Job Offer | Game over | Drops to game over (median / fewest) | Furthest object (median / best) | Score (median) | Rule violations |
| --- | --- | --- | --- | --- | --- | --- |
${q.strategies.map((row) => `| ${({ centre: "One position: centre", left: "One position: left wall", alternate: "Alternating edges", random: "Random", bad: "Deliberately bad" })[row.strategy]} | ${row.won} | ${row.over} | ${row.medianDropsToOver} / ${row.fewestDropsToOver} | ${row.medianFurthest} / ${row.bestFurthest} | ${row.medianScore} | ${violations(row)} |`).join("\n")}

The recorded winning run reaches the Job Offer in ${RECORDING.expect.drops} drops with ${RECORDING.expect.merges} merges, score ${RECORDING.expect.score}, best chain ${RECORDING.expect.bestChain}×. How often strategies that plan ahead win is measured by \`scripts/v4-e06-3-career-adventure-sim.mjs\` and recorded in \`docs/v4-e06-3-career-adventure.md\`.

Stacks that went above the line and came back under it without ending the run, in those 500 runs: ${q.strategies.reduce((sum, row) => sum + row.recoveries, 0)}. Most objects in the chamber at once: ${q.maxBodies}.

## Refresh-rate stability

A Book let go from the same place:

| Display | Frames shown | Landed at simulation step | Time |
| --- | --- | --- | --- |
${q.refresh.fall.map((row) => `| ${row.hz} Hz | ${row.framesShown} | ${row.landedAtStep} | ${row.simulatedMs} ms |`).join("\n")}

The same forty drops, one every 900 ms of play:

| Display | Drops | Merges | Furthest object | Objects left | Score |
| --- | --- | --- | --- | --- | --- |
${q.refresh.scripted.map((row) => `| ${row.hz} Hz | ${row.drops} | ${row.merges} | ${LADDER[row.furthest]} | ${row.bodies} | ${row.score} |`).join("\n")}
| Irregular frames, 4–40 ms | ${q.refresh.irregular.drops} | ${q.refresh.irregular.merges} | ${LADDER[q.refresh.irregular.furthest]} | ${q.refresh.irregular.bodies} | ${q.refresh.irregular.score} |

Score spread across all of them: ${q.refresh.scoreSpreadPercent} %. A drop takes effect on the frame it is asked for, so two displays can differ by one frame in when an object is let go; the simulation itself advances only in whole steps of 1/120 s. Before E06.3 the physics advanced once per frame: the E06.0 audit measured it at about 145 frames a second, where the game ran about 2.4 times as fast as on a 60 Hz display.

A stalled frame of 5 s advanced the simulation by ${q.slowFrame} steps.

## Focused QA (this run)

- Failures: ${failures.length ? failures.map((failure) => `\n  - ${failure}`).join("") : "none"}
- Console warnings/errors (including React hydration reports; the stubbed edge's own network messages and the forced-failure page excluded): ${problems.length ? problems.map((problem) => `\n  - ${problem}`).join("") : "none"}
- Page: Play “${q.page.play}”; poster ${q.page.poster}; board painted ${q.page.boardPainted > 100}; ladder ${q.page.ladder.length} rungs; HUD in the page: ${q.page.hud}; engine running: ${q.page.engineRunning}.
- Entered by keyboard into “${q.menu.state}”, focus on ${q.menu.focus}; header ${q.menu.header}, footer ${q.menu.footer}, AJOOP launcher ${q.menu.launcher}, other floats ${q.menu.floats}.
- Menu: ${q.menu.panel.buttons.join(" · ")}. Idle: ${q.menuFrames} frames asked for in 1.5 s; over ${q.menuIdle.windowMs} ms: ${q.menuIdle.taskMs} ms of main-thread tasks, ${q.menuIdle.scriptMs} ms script, ${q.menuIdle.longTasks} long tasks.
- Settings: ${q.settings.panel.settings.map((row) => row.label).join(" · ")}; environments ${q.settings.panel.themes.map((theme) => `${theme.name}${theme.locked ? ` (locked: ${theme.note})` : ""}`).join(" · ")}.
- Pointer: aimed ${q.pointer.wanted}, object at ${q.pointer.aim}, landed at ${q.pointer.landedAt}. Keyboard: aim ${q.keyboard.aim.join(" → ")}; drops after Space and Enter: ${q.keyboard.drops.join(", ")}.
- Tools: Re-scope ${JSON.stringify(q.tools.before.slice(0, 2))} → ${JSON.stringify(q.tools.swapped.slice(0, 2))}; Debug removed ${q.tools.removed} object (level ${q.tools.removedLevel + 1}), score ${q.tools.score.join(" → ")}.
- Pause: ${q.paused.panel.buttons.join(" · ")}; frames asked for while paused: ${q.pausedFrames}; hidden tab → “${q.hiddenPause}”. Restart: score ${q.restarted.score}, ${q.restarted.bodies} objects.
- Game over (every drop at x = 220, seed 3): first above the line at step ${q.lost.firstAbove}, over ${Math.round((endingAt.steps - q.lost.firstAbove) / 120 * 10) / 10} s later after ${q.overEvent.drops} drops; “${q.over.panel.text.at(-1)}”; ${q.over.panel.buttons.join(" · ")}; still the same screen 2.6 s later: ${q.overLater.state === "over"}.
- Victory (recorded run): step ${q.wonAt.steps}, score ${q.wonAt.score}, ${q.wonAt.merges} merges, ${q.wonAt.drops} drops, best chain ${q.wonAt.bestChain}× — expected ${RECORDING.expect.steps}, ${RECORDING.expect.score}, ${RECORDING.expect.merges}, ${RECORDING.expect.drops}, ${RECORDING.expect.bestChain}×. Milestones: ${q.milestones.map(([name, theme]) => `${name}${theme ? ` (opens ${theme})` : ""}`).join(" → ")}. Layer: ${q.won.panel.buttons.join(" · ")}.
- Persistence: \`${STORE}\` = \`${q.wonLater.profile}\`; old \`${LEGACY_STORE}\` key: ${q.wonLater.legacyBest === null ? "not written" : "WRITTEN"}. After a reload: best ${q.reloadedProfile.best}, furthest ${LADDER[q.reloadedProfile.furthest]}, wins ${q.reloadedProfile.wins}, environment “${q.reloadedProfile.settings.theme}”.
- Leaving: Exit restores scroll ${q.left.scroll} (was ${q.scrollBefore}) and focus on Play (${q.left.focus === "play"}); browser Back leaves the game (${q.backButton.state === null}), Forward returns to “${q.forward}”; a link with #career-merge-game opens “${q.linked}”.
- Touch (390 × 844): finger down at ${q.touch.downAim}, dragged to ${q.touch.dragAim} (wanted ${q.touch.wanted}), drops while down ${q.touch.dropsWhileDown}, after lifting ${q.touch.dropsAfterLift}, landed at ${q.touch.landedAt}; page scroll ${q.touch.scroll}; smallest HUD control ${q.phoneStart.smallest} px.
- Active play, desktop (${q.playCost.ms} ms, ${q.playCost.merges} merges, ${q.playCost.bodies} objects at the end): ${q.playCost.scriptMs} ms script, ${q.playCost.taskMs} ms tasks, ${q.playCost.layouts} layouts, ${q.playCost.longTasks} long tasks; frames: median ${q.playCost.medianFrameMs} ms, 95 % within ${q.playCost.p95FrameMs} ms, worst ${q.playCost.worstFrameMs} ms.
- Active play, phone with 4× CPU throttling: frames median ${q.phoneCost.medianFrameMs} ms, 95 % within ${q.phoneCost.p95FrameMs} ms, worst ${q.phoneCost.worstFrameMs} ms; ${q.phoneCost.longTasks} long tasks.
- Crowd of ${q.crowd.started} objects at once: ${q.crowd.merges} merges (up to ${q.crowd.mostMergesInOneStep} in one step), ${q.crowd.left} left; a step took ${q.crowd.meanStepMs} ms on average, ${q.crowd.worstStepMs} ms at worst; outside the glass: ${q.crowd.outside}.
- Without JavaScript: “${q.noJs.notice}” → ${q.noJs.noticeLinks.join(", ")}; Play shown: ${q.noJs.play !== null}; board shown: ${q.noJs.board}.
- Forced engine failure: “${q.failureState.error}”.
- Reduced motion: effects reduced by default ${q.reducedMotion.setting}; shake after a chain ${q.reducedMotion.afterChain.shake}; CSS animations running ${q.reducedMotion.css.running}; the recorded run ended “${q.reducedMotion.end}” with score ${q.reducedMotion.score}.
- Locales (EN/TR/DE/ES/FR, desktop and phone): overflow ${LOCALES.map((locale) => `${locales[locale].desktop.overflow}/${locales[locale].mobile.overflow}`).join(" · ")}; Play: ${LOCALES.map((locale) => locales[locale].desktop.play).join(" · ")}; game over: ${LOCALES.map((locale) => locales[locale].desktop.overTitle).join(" · ")}.

## Entry page LCP (headless Chromium, ${BASELINE ? "E06.2 and E06.3 measured in turn, " : ""}5 cold loads each, median)

| Viewport | Conditions | ${BASELINE ? "E06.2 (before) | " : ""}E06.3 (after) |
| --- | --- | ${BASELINE ? "--- | " : ""}--- |
${lcp.map((row) => `| ${row.viewport} | ${row.conditions} | ${BASELINE ? `${lcpCell(row.before)} | ` : ""}${lcpCell(row.after)} |`).join("\n")}

Cold-load transfer of the page at 1440 × 900 (same-origin, encoded, document included): ${Object.entries(transfers).map(([build, row]) => `${build === "before" ? "E06.2" : "E06.3"} ${kb(row.bytes)} in ${row.requests} requests (${row.images} images)`).join(" · ")}.

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
