/* V4-E06.4 — focused QA and the review pack for Merge Rush in the portfolio.
 *
 *   npm run build:site && node scripts/v4-e06-4-merge-rush-review.mjs
 *
 * Checks the production build in dist-site/ through the local preview server:
 * the /merge-rush/ page in five locales, Play, the entered mode, Back, Exit,
 * the case-study handoff, the Games and Works cards, phone and tablet, no
 * JavaScript, and a game that fails to arrive. Writes the portfolio stills
 * and then composes the phase's two sheets from them and from the stills the
 * game repository's own QA wrote beside them (npm run qa:browser there).
 *
 * The pack lives outside the repository (V4 rule). The game's rules are not
 * tested here: that is the game repository's job, and its 82 tests and
 * real-input browser pass are recorded in the same qa-summary.json. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = process.env.V4_CAPTURE_DIR || "C:\\PC-Audit\\v4-review\\v4-e06-4-merge-rush";
const SHOTS = join(OUTPUT, "portfolio");
const FRAMES = join(OUTPUT, "motion-frames");
const PORT = process.env.V4_CAPTURE_PORT || "4186";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = "https://ajoop.kaanbalci.com/";
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const PLAY = "/merge-rush/";
const CASE = "/merge-rush-case-study/";
const MODULE = "/assets/merge-rush/merge-rush.js";
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TABLET = { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PLAY_LABEL = { en: "Play Merge Rush", tr: "Merge Rush'ı oyna", de: "Merge Rush spielen", es: "Jugar a Merge Rush", fr: "Jouer à Merge Rush" };

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const checks = [];
const problems = [];
const stills = [];
const film = [];
const metrics = {};

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function serverReady() {
  try {
    const health = await fetch(`${ORIGIN}/__v4/health`, { signal: AbortSignal.timeout(900) });
    return health.ok && resolve((await health.json()).root) === ROOT;
  } catch { return false; }
}

async function open(browser, { viewport = DESKTOP, path = PLAY, noJs = false, block = null, settle = 1200 } = {}) {
  const page = await browser.newPage();
  page.requests = [];
  page.blocked = block;
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    if (message.text().includes(EDGE) || String(message.location()?.url || "").startsWith(EDGE)) return;
    if (page.blocked && /ERR_FAILED|Failed to load resource|Failed to fetch dynamically imported module/.test(message.text())) return;
    problems.push(`${path} ${message.type()}: ${message.text().slice(0, 240)}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(EDGE)) { request.respond({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" }).catch(() => {}); return; }
    if (url.startsWith(ORIGIN)) page.requests.push(new URL(url).pathname + new URL(url).search);
    if (page.blocked && new URL(url).pathname.endsWith(page.blocked)) { request.abort().catch(() => {}); return; }
    request.continue().catch(() => {});
  });
  await page.setViewport(viewport);
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
  await wait(settle);
  return page;
}

const mrState = (page) => page.evaluate(() => document.documentElement.getAttribute("data-mr-state"));
const playing = (page, timeout = 25_000) => page.waitForFunction(() => document.documentElement.getAttribute("data-mr-state") === "playing", { timeout }).then(() => true, () => false);

async function still(page, file, label, options = {}) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, file), ...options });
  stills.push({ file: `portfolio/${file}`, label });
}

async function frames(page, id, label, count, gap) {
  await mkdir(FRAMES, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    const file = `${id}-${index + 1}.png`;
    await page.screenshot({ path: join(FRAMES, file) });
    film.push({ file: `motion-frames/${file}`, label: `${label} · ${index + 1}/${count}` });
    if (index < count - 1) await wait(gap);
  }
}

async function sheet(browser, file, title, note, panels, columns, panelWidth) {
  const page = await browser.newPage();
  const cells = await Promise.all(panels.map(async (panel) => `<figure><img src="data:image/png;base64,${(await readFile(join(OUTPUT, panel.file))).toString("base64")}"><figcaption>${panel.label}</figcaption></figure>`));
  await page.setViewport({ width: columns * (panelWidth + 20) + 40, height: 800, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#0b1118;color:#e8f4fb;font:14px system-ui,Segoe UI,Arial,sans-serif}
    h1{font-size:22px;margin:0 0 4px}p{margin:0 0 18px;color:#9bc0d0}
    main{display:grid;grid-template-columns:repeat(${columns},${panelWidth}px);gap:20px;align-items:end}
    figure{margin:0}img{display:block;max-width:100%;max-height:${Math.round(panelWidth * 1.5)}px;margin:0 auto;border:1px solid #24465a}
    figcaption{padding:6px 0 0;font-size:13px;color:#cfe8f3;text-align:center}
  </style><h1>${title}</h1><p>${note}</p><main>${cells.join("")}</main>`, { waitUntil: "load" });
  await page.screenshot({ path: join(OUTPUT, file), fullPage: true });
  await page.close();
}

async function dirBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? await dirBytes(path) : (await stat(path)).size;
  }
  return total;
}

async function walk(directory, base = directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path, base));
    else out.push(path.slice(base.length + 1).replaceAll("\\", "/"));
  }
  return out;
}

// ------------------------------------------------------------------ the run

await rm(SHOTS, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
let server = null;
if (!(await serverReady())) {
  server = spawn(process.execPath, [join(ROOT, "scripts", "v4-preview-server.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
  for (let attempt = 0; attempt < 40 && !(await serverReady()); attempt += 1) await wait(150);
  if (!(await serverReady())) throw new Error("preview server did not start");
}
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000 });

try {
  // ---- the artifact itself ----
  const shipped = await walk(join(ROOT, "dist-site", "assets", "merge-rush"));
  const code = await readFile(join(ROOT, "dist-site", "assets", "merge-rush", "merge-rush.js"));
  check("the shipped game is a build, not source: no map, TypeScript, test or manifest", shipped.every((file) => /\.(js|webp|ogg|mp3)$/.test(file)) && shipped.filter((file) => file.endsWith(".js")).length === 1, `${shipped.length} files`);
  check("the module carries no source map and no test hook", !/sourceMappingURL|sourcesContent|__mergeRush/.test(code.toString("utf8")));

  // ---- five locales ----
  for (const locale of LOCALES) {
    const path = localized(locale, PLAY);
    const response = await fetch(`${ORIGIN}${path}`);
    const html = await response.text();
    const page = await open(browser, { path, settle: 500 });
    const facts = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelector("h1")?.textContent,
      play: document.querySelector(".mr-enter")?.textContent,
      playShown: getComputedStyle(document.querySelector(".mr-enter")).display !== "none",
      locale: document.querySelector("[data-mr-root]")?.getAttribute("data-mr-locale"),
      caseHref: document.querySelector(".mr-hero__actions a")?.getAttribute("href"),
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      alternates: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
      navCurrent: document.querySelector('.nav-links [aria-current="page"]')?.getAttribute("href"),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      github: [...document.querySelectorAll("main a")].some((link) => /github\.com/.test(link.href)),
    }));
    check(`${locale}: /merge-rush/ is served, in its language, with Play`, response.status === 200 && facts.lang.startsWith(locale) && facts.h1 === "Merge Rush: Tiny Factory" && facts.play === PLAY_LABEL[locale] && facts.playShown && facts.locale === locale, `${facts.play}`);
    check(`${locale}: canonical, six alternates, Games is the current section, case study link is localized`,
      facts.canonical === `https://kaanbalci.com${path}` && facts.alternates === 6 && facts.navCurrent === localized(locale, "/games/") && facts.caseHref === localized(locale, CASE));
    check(`${locale}: no leaked key, no overflow, no repository link`, !/mergeRush\.play\.|undefined|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")) && !facts.overflow && !facts.github);
    await page.close();
  }

  // ---- desktop: page, Play, entered, Back, Exit ----
  const page = await open(browser);
  await still(page, "p01-page-desktop.png", "P01 · /merge-rush/ · the page", { fullPage: true });
  const before = page.requests.filter((url) => url.includes("/assets/merge-rush/"));
  check("nothing of the engine is requested before Play", !before.some((url) => url.endsWith(".js") || url.includes("/audio/") || url.includes("/ui/")), before.map((url) => url.split("/").pop()).join(", "));
  await frames(page, "p1-enter-a", "P1 portfolio → play", 1, 0);
  /* Where the page stood at the moment Play was pressed (the click itself may scroll the button into view). */
  await page.evaluate(() => { window.scrollTo(0, 240); document.addEventListener("click", () => { window.__scrollAtPlay = window.scrollY; }, { capture: true, once: true }); });
  const historyBefore = await page.evaluate(() => history.length);
  const startedAt = Date.now();
  await page.click(".mr-enter");
  await wait(60);
  await frames(page, "p1-enter-b", "P1 portfolio → play", 1, 0);
  check("Play enters the game", await playing(page), `${Date.now() - startedAt} ms to ready`);
  metrics.playToReadyMs = Date.now() - startedAt;
  await wait(900);
  await frames(page, "p1-enter-c", "P1 portfolio → play", 2, 500);
  await still(page, "p02-entered-desktop.png", "P02 · entered play · the game has the viewport");
  const entered = await page.evaluate(() => {
    const canvas = document.querySelector(".mr-stage canvas");
    const shown = (node) => getComputedStyle(node).display !== "none";
    return {
      canvas: canvas ? [canvas.clientWidth, canvas.clientHeight, canvas.width, canvas.height] : null,
      chrome: [...document.body.children].filter((node) => !["MAIN", "SCRIPT"].includes(node.tagName) && shown(node)).map((node) => node.tagName.toLowerCase() + (node.id ? `#${node.id}` : "")),
      mainOthers: [...document.querySelector("main").children].filter((node) => node.id !== "merge-rush-game" && shown(node)).length,
      inert: [...document.body.children].filter((node) => !["MAIN", "SCRIPT"].includes(node.tagName)).every((node) => node.inert),
      ajoop: [...document.querySelectorAll('[data-react-ajoop-shell], .ajoop-launcher, [class*="ajoop"]')].some((node) => node.getClientRects().length > 0 && !node.closest("#merge-rush-game")),
      focus: document.activeElement?.tagName,
      overflow: getComputedStyle(document.documentElement).overflow,
      history: history.length,
    };
  });
  check("the canvas fills the viewport", entered.canvas && entered.canvas[0] === DESKTOP.width && entered.canvas[1] === DESKTOP.height, String(entered.canvas));
  check("site header, footer and floating controls step out; nothing of the page shows around the game", entered.chrome.length === 0 && entered.mainOthers === 0, entered.chrome.join(", "));
  check("AJOOP is not on screen during play, and the page behind is inert", !entered.ajoop && entered.inert);
  check("focus is in the game and the page cannot scroll", entered.focus === "CANVAS" && entered.overflow === "hidden");
  check("entering adds exactly one history entry", entered.history === historyBefore + 1);
  const afterPlay = page.requests.filter((url) => url.includes("/assets/merge-rush/"));
  /* The six ladder images were already on the page; the game asks for them again and the cache answers. */
  const engineOnly = afterPlay.slice(before.length).filter((url) => !before.includes(url));
  check("the engine and its art arrive only now, each once, in one audio format", afterPlay.filter((url) => url === MODULE).length === 1 && new Set(engineOnly).size === engineOnly.length && !afterPlay.some((url) => url.endsWith(".mp3")), `${engineOnly.length} new requests`);

  await frames(page, "p2-back-a", "P2 play → Back", 1, 0);
  await page.goBack();
  await wait(500);
  await frames(page, "p2-back-b", "P2 play → Back", 1, 0);
  const back = await page.evaluate(() => ({ state: document.documentElement.getAttribute("data-mr-state"), canvas: Boolean(document.querySelector(".mr-stage canvas")), path: location.pathname, scroll: window.scrollY, header: getComputedStyle(document.querySelector(".site-header")).display !== "none", inert: [...document.body.children].some((node) => node.inert) }));
  const scrollBefore = await page.evaluate(() => window.__scrollAtPlay);
  check("browser Back returns to the page: game destroyed, chrome back, scroll restored", back.state === null && !back.canvas && back.path === PLAY && back.header && !back.inert && scrollBefore > 0 && Math.abs(back.scroll - scrollBefore) < 2, `${JSON.stringify(back)} (was ${scrollBefore})`);

  // the poster is the second way in; the in-game exit is the way out
  await page.click(".mr-poster");
  check("the poster also enters the game", await playing(page));
  await wait(1_400);
  /* EXIT TO PORTFOLIO is the fourth menu button; its place follows the game's menu layout at 1440 × 900. */
  await page.mouse.click(720, 805);
  await wait(700);
  const exited = await page.evaluate(() => ({ state: document.documentElement.getAttribute("data-mr-state"), canvas: Boolean(document.querySelector(".mr-stage canvas")), path: location.pathname, focus: document.activeElement?.className }));
  check("the game's own Exit to Portfolio leaves play and removes its history entry", exited.state === null && !exited.canvas && exited.path === PLAY && (await page.evaluate(() => history.length)) >= historyBefore, JSON.stringify(exited));
  await page.goBack().catch(() => {});
  await wait(300);
  check("after exiting, Back does not re-enter the game", (await mrState(page)) === null);
  await page.close();

  // ---- case study handoff, Games, Works ----
  const study = await open(browser, { path: CASE });
  await still(study, "p03-case-study.png", "P03 · case study, rebuilt from the playable game", { fullPage: true });
  const studyFacts = await study.evaluate(() => ({
    text: document.querySelector("main").innerText,
    play: [...document.querySelectorAll('main a[href="/merge-rush/"]')].length,
    github: [...document.querySelectorAll("main a")].some((link) => /github\.com/.test(link.href)),
    poster: document.querySelector(".case-hero-visual img")?.getAttribute("src"),
  }));
  check("the case study says Playable V1 and links to Play (twice)", /Playable V1/.test(studyFacts.text) && studyFacts.play === 2);
  check("the case study no longer states systems the game does not have", !/multi-cell|footprint|Repair Energy|not presented as a finished|2×2/i.test(studyFacts.text));
  check("the case study describes the real engineering", ["GameState", "Weighted generation", "Deadlock", "Endless", "Platform Adapter", "Embed contract", "Asset pipeline", "automated tests", "3,500"].every((term) => studyFacts.text.includes(term)));
  check("no GitHub action points at the private repository", !studyFacts.github && studyFacts.poster === "/assets/merge-rush/poster.webp");
  await study.click('main a[href="/merge-rush/"]');
  await study.waitForFunction(() => location.pathname === "/merge-rush/", { timeout: 10_000 }).catch(() => {});
  check("Play on the case study opens /merge-rush/", (await study.evaluate(() => location.pathname)) === PLAY);
  await study.close();

  for (const locale of ["en", "tr"]) {
    const games = await open(browser, { path: localized(locale, "/games/"), settle: 600 });
    const card = await games.evaluate(() => {
      const node = document.querySelector('[data-game-link="/merge-rush/"]');
      return node ? { status: node.querySelector(".game-status")?.textContent, live: node.querySelector(".game-status")?.classList.contains("live"), actions: [...node.querySelectorAll(".project-actions a")].map((link) => link.getAttribute("href")), text: node.innerText } : null;
    });
    check(`${locale}: Games card is Playable V1 with Play and Case Study`, card && card.live && card.actions.join() === [localized(locale, PLAY), localized(locale, CASE)].join() && !/multi-cell/i.test(card.text), card?.status);
    if (locale === "en") {
      await games.evaluate(() => document.querySelector('[data-game-link="/merge-rush/"]').scrollIntoView({ block: "center" }));
      await wait(500);
      await still(games, "p04-games-card.png", "P04 · Games · Merge Rush is Play + Case Study");
    }
    await games.close();
  }
  const works = await open(browser, { path: "/works/", settle: 600 });
  const workCard = await works.evaluate(() => {
    const node = document.querySelector('[data-project-link="/merge-rush-case-study/"]');
    return node ? { status: node.querySelector(".project-status")?.textContent, actions: [...node.querySelectorAll(".project-actions a")].map((link) => link.getAttribute("href")), title: node.querySelector("h3 a")?.getAttribute("href"), text: node.innerText } : null;
  });
  check("Works card leads to the case study and offers Play", workCard && workCard.title === CASE && workCard.actions.join() === [CASE, PLAY].join() && workCard.status === "Playable V1" && !/multi-cell/i.test(workCard.text));
  await works.evaluate(() => document.querySelector('[data-project-link="/merge-rush-case-study/"]').scrollIntoView({ block: "center" }));
  await wait(500);
  await still(works, "p05-works-card.png", "P05 · Works · project card → case study, with Play");
  await works.close();

  // ---- phone and tablet ----
  const phone = await open(browser, { viewport: MOBILE, path: localized("tr", PLAY) });
  await still(phone, "p06-page-phone.png", "P06 · phone · the page (TR)", { fullPage: true });
  const phoneFacts = await phone.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, play: document.querySelector(".mr-enter").getBoundingClientRect().height }));
  check("phone: the page has no horizontal overflow and Play is a full touch target", !phoneFacts.overflow && phoneFacts.play >= 44, `${Math.round(phoneFacts.play)} px`);
  await phone.tap(".mr-enter");
  check("phone: Play enters the game by touch", await playing(phone));
  await wait(1_300);
  await still(phone, "p07-entered-phone.png", "P07 · phone · entered play, in Turkish");
  const phoneEntered = await phone.evaluate(() => { const canvas = document.querySelector(".mr-stage canvas"); return { css: [canvas.clientWidth, canvas.clientHeight], pixels: [canvas.width, canvas.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }; });
  check("phone: the game fills the screen at device resolution, with nothing to scroll", phoneEntered.css.join() === "390,844" && phoneEntered.pixels[0] === 780 && phoneEntered.scroll[0] <= 390 && phoneEntered.scroll[1] <= 844, JSON.stringify(phoneEntered));
  await phone.setViewport({ ...MOBILE, width: 844, height: 390 });
  await wait(700);
  check("phone: rotating keeps the game mounted and resized", (await mrState(phone)) === "playing" && (await phone.evaluate(() => document.querySelector(".mr-stage canvas").clientWidth)) === 844);
  await phone.goBack();
  await wait(400);
  check("phone: Back leaves the game", (await mrState(phone)) === null);
  await phone.close();

  const tablet = await open(browser, { viewport: TABLET });
  check("tablet: no horizontal overflow on the page", !(await tablet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await tablet.tap(".mr-enter");
  check("tablet: Play enters the game", await playing(tablet));
  await wait(1_300);
  await still(tablet, "p08-entered-tablet.png", "P08 · tablet · entered play");
  await tablet.close();

  // ---- no JavaScript ----
  const plain = await open(browser, { noJs: true });
  const plainFacts = await plain.evaluate(() => ({
    play: [...document.querySelectorAll("[data-mr-enter]")].filter((node) => node.matches(".mr-enter")).map((node) => getComputedStyle(node).display),
    notice: document.querySelector(".mr-noscript")?.innerText || document.querySelector("noscript")?.textContent || "",
    links: [...(document.querySelector(".mr-noscript")?.parentElement?.innerHTML.matchAll(/href="([^"]+)"/g) || [])].map((match) => match[1]),
    stage: getComputedStyle(document.querySelector("#merge-rush-game")).display,
    caseLink: document.querySelector(".mr-hero__actions a")?.getAttribute("href"),
  }));
  check("no JavaScript: Play is not offered, the stage stays away", plainFacts.play.every((display) => display === "none") && plainFacts.stage === "none");
  check("no JavaScript: the page says the game needs it and offers the case study and Games", /JavaScript/.test(plainFacts.notice) && plainFacts.links.includes(CASE) && plainFacts.links.includes("/games/") && plainFacts.caseLink === CASE, plainFacts.links.join(", "));
  await still(plain, "p09-no-javascript.png", "P09 · no JavaScript · notice, Case Study, All games");
  await plain.close();

  // ---- the game does not arrive ----
  const broken = await open(browser, { block: "/merge-rush.js" });
  await broken.click(".mr-enter");
  await broken.waitForFunction(() => document.documentElement.getAttribute("data-mr-state") === "error", { timeout: 15_000 }).catch(() => {});
  await wait(300);
  const failed = await broken.evaluate(() => ({
    state: document.documentElement.getAttribute("data-mr-state"),
    title: document.querySelector("[data-mr-error] h2")?.innerText,
    actions: [...document.querySelectorAll("[data-mr-error] .mr-stage__actions > *")].map((node) => node.tagName + ":" + node.textContent),
    focus: document.activeElement?.hasAttribute("data-mr-retry"),
    canvas: Boolean(document.querySelector(".mr-stage canvas")),
  }));
  check("module blocked: the stage shows the failure, never a blank canvas", failed.state === "error" && !failed.canvas && /could not load/.test(failed.title || ""));
  check("failure offers Retry, Exit and the Case Study, with focus on Retry", failed.actions.length === 3 && failed.actions[0].startsWith("BUTTON:Try Again") && failed.actions[1].startsWith("BUTTON:Exit") && failed.actions[2].startsWith("A:View Case Study") && failed.focus, failed.actions.join(" | "));
  await still(broken, "p10-load-failure.png", "P10 · the game did not arrive · Retry, Exit, Case Study");
  broken.blocked = null;
  await broken.click("[data-mr-retry]");
  check("Retry loads the game once the network is back", await playing(broken));
  await broken.goBack();
  await wait(300);
  broken.blocked = "/items/gear.webp";
  await broken.click(".mr-enter");
  await broken.waitForFunction(() => document.documentElement.getAttribute("data-mr-state") === "error", { timeout: 20_000 }).catch(() => {});
  check("a missing art file is reported the same way (the game calls onError before drawing)", (await mrState(broken)) === "error" && !(await broken.evaluate(() => Boolean(document.querySelector(".mr-stage canvas")))));
  await broken.click("[data-mr-error] [data-mr-exit]");
  await wait(400);
  check("Exit from the failure returns to the page", (await mrState(broken)) === null && (await broken.evaluate(() => location.pathname)) === PLAY);
  await broken.close();

  // ---- performance: Home is not paying for the game ----
  const home = await open(browser, { path: "/", settle: 800 });
  const homeRequests = home.requests;
  const homeHtml = await (await fetch(`${ORIGIN}/`)).text();
  check("Home requests nothing of Merge Rush and its document does not mention the module", !homeRequests.some((url) => url.includes("merge-rush")) && !homeHtml.includes("merge-rush.js"));
  await home.close();
  const reactDir = join(ROOT, "dist-site", "assets-react");
  const client = (await readdir(reactDir)).filter((name) => /^production-main-.*\.js$/.test(name));
  const clientBytes = await readFile(join(reactDir, client[0]));
  metrics.sharedClient = { file: client[0], rawBytes: clientBytes.length, gzipBytes: gzipSync(clientBytes).length };
  check("the shared React client does not contain the engine", client.length === 1 && !clientBytes.includes("Phaser") && clientBytes.length < 400_000, `${client[0]} ${(clientBytes.length / 1024).toFixed(0)} KB`);
  const assetsDir = join(ROOT, "dist-site", "assets", "merge-rush");
  const bytes = async (file) => (await stat(join(assetsDir, file))).size;
  const fetched = [...new Set(afterPlay)].map((url) => url.replace("/assets/merge-rush/", ""));
  let coldBytes = 0;
  for (const file of fetched) coldBytes += file === "merge-rush.js" ? gzipSync(code).length : await bytes(file);
  metrics.game = {
    moduleRawBytes: code.length,
    moduleGzipBytes: gzipSync(code).length,
    requestsAfterPlay: fetched.length,
    coldTransferBytes: coldBytes,
    shippedDirectoryBytes: await dirBytes(assetsDir),
    posterBytes: await bytes("poster.webp"),
  };
  metrics.pageWeight = { cssBytes: (await stat(join(ROOT, "dist-site", "css", "v4-merge-rush.css"))).size, controllerBytes: (await stat(join(ROOT, "dist-site", "js", "pages", "merge-rush-game.js"))).size };

  check("console and hydration are clean on every page opened", problems.length === 0, problems.slice(0, 4).join(" | "));

  // ---- the two sheets, from this run and from the game repository's QA ----
  const gameDir = join(OUTPUT, "game");
  const gameStills = existsSync(gameDir) ? (await readdir(gameDir)).filter((name) => name.endsWith(".png")).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((name) => ({ file: `game/${name}`, label: name.replace(/\.png$/, "").replace(/-/g, " ") })) : [];
  await sheet(browser, "00-contact-sheet.png", "V4-E06.4 · Merge Rush: Tiny Factory — Playable V1 and its portfolio integration",
    `Game panels (${gameStills.length}) are captures of the built game under real pointer and touch input; portfolio panels (${stills.length}) are the production build of the site. Full-size files: game/ and portfolio/.`,
    [...gameStills, ...stills], 4, 440);
  const MOTION = { m1: "M1 menu → Factory Run", m2: "M2 NEXT placement", m3: "M3 merge", m4: "M4 delivery", m5: "M5 combo and unlock", m6: "M6 final Core delivery", m7: "M7 victory → Endless", m8: "M8 Endless damage and repair" };
  const gameFilm = existsSync(FRAMES) ? (await readdir(FRAMES)).filter((name) => /^m\d/.test(name)).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((name) => ({ file: `motion-frames/${name}`, label: `${MOTION[name.slice(0, 2)] || name} · ${name.replace(/\.png$/, "").split("-").slice(-2).join(" ")}` })) : [];
  await sheet(browser, "00-motion-frames.png", "V4-E06.4 · Merge Rush — motion",
    "In order. M1–M8: one continuous desktop session of the game under real input. P1–P2: the portfolio page entering play and Back leaving it.",
    [...gameFilm, ...film], 4, 440);
  metrics.sheets = { stills: gameStills.length + stills.length, motionFrames: gameFilm.length + film.length };
} finally {
  await browser.close();
  server?.kill();
}

const failedChecks = checks.filter((entry) => !entry.pass);
const summaryPath = join(OUTPUT, "qa-summary.json");
let summary = {};
try { summary = JSON.parse(await readFile(summaryPath, "utf8")); } catch { /* the game QA has not written yet */ }
summary.portfolio = { capturedAt: new Date().toISOString(), passed: checks.length - failedChecks.length, failed: failedChecks.length, checks, metrics, stills: stills.map((entry) => entry.file) };
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${checks.length - failedChecks.length}/${checks.length} portfolio checks passed → ${OUTPUT}`);
process.exit(failedChecks.length === 0 ? 0 : 1);
