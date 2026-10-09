/* V4-E07 — focused browser QA and the review pack for the global experience:
 * the shared page grammar, navigation, route transitions, floating controls,
 * game entry and exit, locale and theme switching, keyboard, reduced motion
 * and no JavaScript.
 *
 *   npm run build:site && node scripts/v4-e07-global-experience-review.mjs
 *
 * Checks the production build in dist-site/ through the local preview server
 * and writes the stills, a contact sheet, a motion sheet and qa-summary.json
 * OUTSIDE the repository (V4 rule). Page-specific behaviour stays with its own
 * phase script (E06.4 Merge Rush, E06.6 Works presentation); this one checks
 * what every route shares. */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SITE = join(ROOT, "dist-site");
const OUTPUT = process.env.V4_CAPTURE_DIR || "C:\\PC-Audit\\v4-review\\v4-e07-global-experience";
const PORT = process.env.V4_CAPTURE_PORT || "4187";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = "https://ajoop.kaanbalci.com/";
const FORM_ENDPOINT = "https://script.google.com/";
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const VIEWPORTS = [
  ["1440×900", { width: 1440, height: 900 }],
  ["1280×800", { width: 1280, height: 800 }],
  ["1024×768", { width: 1024, height: 768 }],
  ["768×1024", { width: 768, height: 1024, isMobile: true, hasTouch: true }],
  ["430×932", { width: 430, height: 932, isMobile: true, hasTouch: true }],
  ["390×844", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ["844×390 landscape", { width: 844, height: 390, isMobile: true, hasTouch: true }],
];
/* Every page type once; the nav item each one marks as current. */
const ROUTES = [
  ["/", "home"], ["/works/", "works"], ["/games/", "games"], ["/blog/", "blog"], ["/certificates/", "certificates"], ["/about/", "about"], ["/request/", "request"],
  ["/ajoop/", null], ["/ajoop-case-study/", null], ["/sinama-case-study/", "works"], ["/merge-rush-case-study/", "works"], ["/hospital-system-case-study/", "works"],
  ["/merge-rush/", "games"], ["/projects/agency-db/", "works"], ["/projects/control-panel/", "works"], ["/now/", null], ["/labs/", null], ["/privacy/", null],
  ["/adventure/", null], ["/joyday-paint/", null], ["/ai-flow-puzzle/", null],
];
const GAME_SHELLS = new Set(["/adventure/", "/joyday-paint/", "/ai-flow-puzzle/"]);
const CASE_STUDIES = ["/sinama-case-study/", "/merge-rush-case-study/", "/career-adventure-case-study/", "/portfolio-case-study/", "/ajoop-case-study/", "/ai-flow-puzzle-case-study/", "/atolye-joyday-case-study/", "/hospital-system-case-study/"];
/* The journeys the brief names, as [from, link on that page]. */
const JOURNEYS = [
  ["/", "/works/"], ["/works/", "/projects/agency-db/"], ["/projects/agency-db/", "/works/"], ["/works/", "/sinama-case-study/"],
  ["/merge-rush-case-study/", "/merge-rush/"], ["/merge-rush/", "/games/"], ["/games/", "/merge-rush/"], ["/games/", "/merge-rush-case-study/"],
  ["/ajoop-case-study/", "/ajoop/"], ["/ajoop/", "/ajoop-case-study/"], ["/adventure/", "/games/"], ["/request/", "/about/"],
];

const catalog = JSON.parse(readFileSync(join(ROOT, "data", "portfolio", "catalog.json"), "utf8"));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const checks = [];
const problems = [];
const stills = [];

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

async function open(browser, { viewport = DESKTOP, path = "/", noJs = false, reducedMotion = false, settle = 500, theme = "dark", events = null } = {}) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (events && message.text().startsWith("VT ")) { events.push(message.text()); return; }
    if (!["error", "warning"].includes(message.type())) return;
    const source = String(message.location()?.url || "");
    if ([EDGE, FORM_ENDPOINT].some((blocked) => message.text().includes(blocked) || source.startsWith(blocked))) return;
    /* The assistant edge is answered with 503 by this script, on purpose. */
    if (/Failed to load resource/.test(message.text()) && /503|ERR_FAILED/.test(message.text())) return;
    problems.push(`${path} ${message.type()}: ${message.text().slice(0, 220)}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    /* Nothing leaves the machine: the assistant edge and the form endpoint are answered here. */
    if (request.url().startsWith(EDGE) || request.url().startsWith(FORM_ENDPOINT)) { request.respond({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" }).catch(() => {}); return; }
    request.continue().catch(() => {});
  });
  await page.setViewport({ deviceScaleFactor: 1, ...viewport });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  if (!noJs) {
    await page.evaluateOnNewDocument((wanted, watch) => {
      /* Pages share one storage: each opens in the theme it asks for (dark unless told), or, with
       * theme: null, in whatever the visitor last chose. */
      if (wanted) { try { localStorage.setItem("kaanbalci-site-theme", wanted); } catch { /* storage unavailable */ } }
      window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`));
      if (watch) for (const type of ["pageswap", "pagereveal"]) window.addEventListener(type, (event) => console.log(`VT ${type} ${location.pathname} ${event.viewTransition ? "transition" : "none"}`));
    }, theme, Boolean(events));
  }
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
  /* The site scrolls smoothly; a capture must not catch a scroll half-way. */
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" }).catch(() => {});
  await wait(settle);
  return page;
}

async function decodeImages(page) {
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll("main img")].filter((image) => image.getBoundingClientRect().top < innerHeight * 2);
    images.forEach((image) => { image.loading = "eager"; });
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
  });
}

async function still(page, file, label, options = {}) {
  await mkdir(OUTPUT, { recursive: true });
  await decodeImages(page).catch(() => {});
  await wait(200);
  await page.screenshot({ path: join(OUTPUT, file), ...options });
  stills.push({ file, label });
}

async function stillOf(page, selector, file, label, lift = 90) {
  await page.evaluate((target, up) => { document.querySelector(target).scrollIntoView({ block: "start" }); window.scrollBy(0, -up); }, selector, lift);
  await wait(350);
  await still(page, file, label);
}

async function follow(page, href) {
  const [, clicked] = await Promise.all([
    page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch((error) => problems.push(`navigation to ${href}: ${error.message}`)),
    page.evaluate((target) => { const link = [...document.querySelectorAll("main a, .nav-links a, #react-ajoop-root a")].find((anchor) => anchor.getAttribute("href") === target && anchor.getClientRects().length); if (!link) return false; link.click(); return true; }, href),
  ]);
  await wait(600);
  return clicked;
}

async function sheet(browser, file, title, note, panels, columns, panelWidth) {
  const page = await browser.newPage();
  const cells = await Promise.all(panels.map(async (panel) => `<figure><img src="data:image/png;base64,${(await readFile(join(OUTPUT, panel.file))).toString("base64")}"><figcaption>${panel.label}</figcaption></figure>`));
  await page.setViewport({ width: columns * (panelWidth + 20) + 40, height: 800, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#0b1118;color:#e8f4fb;font:14px system-ui,Segoe UI,Arial,sans-serif}
    h1{font-size:22px;margin:0 0 4px}p{margin:0 0 18px;color:#9bc0d0}
    main{display:grid;grid-template-columns:repeat(${columns},${panelWidth}px);gap:20px;align-items:start}
    figure{margin:0}img{display:block;max-width:100%;max-height:${Math.round(panelWidth * 1.7)}px;margin:0 auto;border:1px solid #24465a;object-fit:cover;object-position:top}
    figcaption{padding:6px 0 0;font-size:13px;color:#cfe8f3;text-align:center}
  </style><h1>${title}</h1><p>${note}</p><main>${cells.join("")}</main>`, { waitUntil: "load" });
  await page.screenshot({ path: join(OUTPUT, file), fullPage: true });
  await page.close();
}

/** What a route's shared parts look like, as computed. */
const grammarOf = () => {
  const style = (node, ...names) => { if (!node) return null; const computed = getComputedStyle(node); return names.map((name) => computed[name]).join(" | "); };
  const family = (node) => (node ? getComputedStyle(node).fontFamily.split(",")[0].replace(/"/g, "") : null);
  const main = document.querySelector("main");
  const launcher = document.querySelector("[data-chatbot-toggle]");
  const trigger = document.querySelector(".easter-trigger");
  const box = (node) => { if (!node) return null; const rect = node.getBoundingClientRect(); return { left: Math.round(rect.left), right: Math.round(innerWidth - rect.right), bottom: Math.round(innerHeight - rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) }; };
  let transitions = false;
  for (const sheet of document.styleSheets) { try { const walk = (rules) => { for (const rule of rules) { if (rule.constructor.name === "CSSViewTransitionRule") transitions = true; if (rule.cssRules) walk(rule.cssRules); } }; walk(sheet.cssRules); } catch { /* a cross-origin sheet */ } }
  return {
    page: document.body.dataset.page,
    overflow: document.documentElement.scrollWidth - innerWidth,
    current: [...document.querySelectorAll(".nav-links a[aria-current='page']")].map((link) => link.getAttribute("href")),
    transitions,
    h1: family(main.querySelector("h1")),
    eyebrows: [...new Set([...main.querySelectorAll(".eyebrow")].filter((node) => node.getClientRects().length).map((node) => `${family(node)} ${getComputedStyle(node).fontSize}`))],
    /* A filled primary action; one set as a text link (transparent) is a different part. */
    primary: [...new Set([...main.querySelectorAll(".btn.primary")].filter((node) => node.getClientRects().length && getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)").map((node) => style(node, "backgroundColor", "borderTopLeftRadius")))],
    launcher: launcher && { style: style(launcher, "borderTopLeftRadius", "backgroundColor", "fontFamily"), visibility: getComputedStyle(launcher).visibility, ...box(launcher) },
    trigger: trigger && box(trigger),
    header: style(document.querySelector(".site-header"), "position", "viewTransitionName"),
    /* The brand mark: its box, and anything drawn around or behind the artwork. */
    brand: [".brand img"].map((selector) => { const image = document.querySelector(selector); const computed = getComputedStyle(image);
      return { size: Math.round(image.getBoundingClientRect().width), frame: [computed.borderTopWidth, computed.borderTopLeftRadius, computed.backgroundColor, computed.boxShadow].join(" | ") }; }),
  };
};

// ------------------------------------------------------------------ the run

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

// ---- static: what every built document carries ----
const documents = [];
(function walk(directory) {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) { if (!["assets", "assets-react", "css", "js", "i18n"].includes(name)) walk(full); } else if (name === "index.html" || name === "404.html") documents.push(full);
  }
})(SITE);
const sources = documents.map((file) => [file.slice(SITE.length).replace(/\\/g, "/"), readFileSync(file, "utf8")]);
const react = sources.filter(([file]) => file.endsWith("/index.html"));
check(`all ${react.length} React documents load the shared V4 layer`, react.every(([, html]) => html.includes("/css/v4-system.css")), react.filter(([, html]) => !html.includes("/css/v4-system.css")).map(([file]) => file).slice(0, 4).join(" "));
check(`all ${react.length} React documents answer a skipped transition at both ends, in the head`, react.every(([, html]) => html.slice(0, html.indexOf("</head>")).includes('["pageswap","pagereveal"]')));
const OPT_IN = "@view-transition{navigation:auto}";
const late = sources.filter(([, html]) => { const at = html.indexOf(OPT_IN); return at < 0 || at > html.indexOf("<link rel=\"stylesheet\"") && html.indexOf("<link rel=\"stylesheet\"") >= 0 && at > html.indexOf("rel=\"stylesheet\""); }).map(([file]) => file);
const sheets = readdirSync(join(ROOT, "css")).filter((file) => file.endsWith(".css") && /@view-transitions*{/.test(readFileSync(join(ROOT, "css", file), "utf8")));
check(`all ${sources.length} documents opt into the transition inline, ahead of every stylesheet, and no stylesheet repeats it`, late.length === 0 && sheets.length === 0, [...late.slice(0, 4), ...sheets].join(" "));
const retired = [...catalog.cards.retiredCovers];
const mainOf = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>")).replace(/<script[\s\S]*?<\/script>/g, "");
const homes = LOCALES.map((locale) => [locale, mainOf(readFileSync(join(SITE, locale === "en" ? "" : locale, "index.html"), "utf8"))]);
check("Home shows no retired cover in any locale, and the AI Chatbot card carries its identity plate", homes.every(([, main]) => !retired.some((file) => main.includes(encodeURI(file)) || main.includes(file)) && main.includes("v4-curated-plate")), homes.filter(([, main]) => retired.some((file) => main.includes(file))).map(([locale]) => locale).join(" "));
const english = react.filter(([file]) => !/^\/(tr|de|es|fr)\//.test(file)).map(([file, html]) => [file, mainOf(html).replace(/<[^>]+>/g, "\n")]);
const stray = english.flatMap(([file, text]) => ["Live site", "All games", "Exit to portfolio"].filter((label) => new RegExp(`^\\s*${label}\\s*$`, "m").test(text)).map((label) => `${file}: ${label}`));
check("action labels: no English page still says “Live site”, “All games” or “Exit to portfolio”", stray.length === 0, stray.slice(0, 4).join(" | "));
const leaks = sources.filter(([, html]) => /react-(main|ajoop|recruiter|command)-props/.test(html) && /"(gmailRead|calendarRead|driveRead|ownerGeneration|ownerMemory)"|ajoop-owner|refresh_token|client_secret/i.test(html)).map(([file]) => file);
check("no built document carries an owner-only AJOOP surface or a credential field", leaks.length === 0, leaks.slice(0, 4).join(" "));

let server = null;
if (!(await serverReady())) {
  server = spawn(process.execPath, [join(ROOT, "scripts", "v4-preview-server.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
  for (let attempt = 0; attempt < 40 && !(await serverReady()); attempt += 1) await wait(150);
  if (!(await serverReady())) throw new Error("preview server did not start");
}
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000 });

try {
  // ---- one grammar, every route, five locales ----
  const reference = {};
  for (const locale of LOCALES) {
    const facts = [];
    for (const [path, nav] of ROUTES) {
      const page = await open(browser, { path: localized(locale, path), settle: 250 });
      facts.push([path, nav, await page.evaluate(grammarOf)]);
      await page.close();
    }
    const system = facts.filter(([path]) => !GAME_SHELLS.has(path));
    const launchers = new Set(facts.filter(([, , fact]) => fact.launcher).map(([, , fact]) => fact.launcher.style));
    if (locale === "en") Object.assign(reference, { launcher: [...launchers][0], primary: system.find(([path]) => path === "/")[2].primary[0] });
    check(`${locale}: no horizontal overflow on ${facts.length} routes, and each marks its own nav item`, facts.every(([path, nav, fact]) => fact.overflow <= 0 && (nav === null ? fact.current.length === 0 : fact.current.length === 1 && fact.current[0] === localized(locale, ROUTES.find(([, id]) => id === nav)[0]))), facts.filter(([path, nav, fact]) => fact.overflow > 0 || (nav === null ? fact.current.length : fact.current.length !== 1)).map(([path, , fact]) => `${path}:${fact.overflow}:${fact.current}`).join(" "));
    check(`${locale}: every route opts into the cross-document transition and carries the header across`, facts.every(([, , fact]) => fact.transitions && fact.header === "sticky | v4-header"), facts.filter(([, , fact]) => !fact.transitions).map(([path]) => path).join(" "));
    check(`${locale}: headings are Manrope and labels IBM Plex Mono at 11.2px on every non-game route`, system.every(([, , fact]) => fact.h1 === "Manrope" && fact.eyebrows.every((entry) => entry === "IBM Plex Mono 11.2px")), system.filter(([, , fact]) => fact.h1 !== "Manrope" || fact.eyebrows.some((entry) => entry !== "IBM Plex Mono 11.2px")).map(([path, , fact]) => `${path}:${fact.h1}:${fact.eyebrows}`).join(" "));
    check(`${locale}: one primary action treatment on every non-game route`, system.every(([, , fact]) => fact.primary.every((entry) => entry === reference.primary)), system.filter(([, , fact]) => fact.primary.some((entry) => entry !== reference.primary)).map(([path, , fact]) => `${path}:${fact.primary}`).join(" "));
    check(`${locale}: the header brand mark stands unframed on every route: no border, radius, ground or shadow, 36px`, facts.every(([, , fact]) => fact.brand.every((mark) => mark.frame === "0px | 0px | rgba(0, 0, 0, 0) | none" && mark.size === 36)), facts.filter(([, , fact]) => fact.brand.some((mark) => mark.frame !== "0px | 0px | rgba(0, 0, 0, 0) | none" || mark.size !== 36)).map(([path, , fact]) => `${path}:${JSON.stringify(fact.brand)}`).slice(0, 3).join(" "));
    check(`${locale}: the AJOOP launcher is the same port on every route that has one (the Hub has none)`, launchers.size === 1 && [...launchers][0] === reference.launcher && !facts.find(([path]) => path === "/ajoop/")[2].launcher, [...launchers].join(" || "));
  }

  // ---- route transitions ----
  for (const [from, to] of JOURNEYS) {
    const events = [];
    const before = problems.length;
    const page = await open(browser, { path: from, events, settle: 200 });
    const clicked = await follow(page, to);
    const arrived = await page.evaluate(() => ({ path: location.pathname, main: Boolean(document.querySelector("main h1")), overlay: document.body.classList.contains("overlay-modal-open"), headers: document.querySelectorAll(".site-header").length }));
    check(`${from} → ${to}: both documents take part, the page arrives whole, nothing is reported`, clicked && arrived.path === to && arrived.main && !arrived.overlay && arrived.headers === 1 && events.includes(`VT pageswap ${from} transition`) && events.includes(`VT pagereveal ${to} transition`) && problems.length === before, `${JSON.stringify(arrived)} ${events.join("; ")} ${problems.slice(before).join(" | ")}`);
    await page.close();
  }
  {
    /* The inherited report: once in three E06.4 runs this hand-off logged "Transition was skipped". */
    const before = problems.length;
    let transitions = 0;
    for (let run = 0; run < 8; run += 1) {
      const events = [];
      const page = await open(browser, { path: "/merge-rush-case-study/", events, settle: run % 2 ? 0 : 300 });
      await follow(page, "/merge-rush/");
      if (events.includes("VT pagereveal /merge-rush/ transition")) transitions += 1;
      await page.close();
    }
    check("Merge Rush case study → game, eight runs: a transition every time and no “Transition was skipped”", transitions === 8 && problems.length === before, `${transitions}/8 ${problems.slice(before).join(" | ")}`);
  }
  {
    const before = problems.length;
    const page = await open(browser, { path: "/works/" });
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }).catch(() => {}), page.evaluate(() => { const link = document.createElement("a"); link.href = "/404.html"; document.body.append(link); link.click(); })]);
    await wait(500);
    check("leaving for the 404 page is a transition too, and reports nothing", (await page.evaluate(() => location.pathname)) === "/404.html" && problems.length === before, problems.slice(before).join(" | "));
    await page.close();
  }
  {
    const events = [];
    const before = problems.length;
    const page = await open(browser, { path: "/works/", events, settle: 200 });
    await page.evaluate(() => window.scrollTo(0, 900));
    await follow(page, "/sinama-case-study/");
    await page.goBack({ waitUntil: "load" });
    await wait(700);
    const back = await page.evaluate(() => ({ path: location.pathname, scroll: Math.round(scrollY), inert: [...document.body.children].filter((node) => node.inert).length }));
    await page.goForward({ waitUntil: "load" });
    await wait(700);
    const forward = await page.evaluate(() => ({ path: location.pathname, title: Boolean(document.querySelector("main h1")) }));
    check("browser Back and Forward: the page left is the page returned to, at its scroll position", back.path === "/works/" && Math.abs(back.scroll - 900) < 40 && back.inert === 0 && forward.path === "/sinama-case-study/" && forward.title && problems.length === before, `${JSON.stringify(back)} ${JSON.stringify(forward)}`);
    await page.close();
  }
  {
    const page = await open(browser, { path: "/works/" });
    await page.click("[data-chatbot-toggle]");
    await wait(500);
    const opened = await page.evaluate(() => !document.querySelector("[data-chatbot-panel]").hidden && document.body.classList.contains("overlay-modal-open"));
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click(".chatbot-hub-link")]);
    await wait(400);
    await page.goBack({ waitUntil: "load" });
    await wait(700);
    const restored = await page.evaluate(() => ({ path: location.pathname, panel: !document.querySelector("[data-chatbot-panel]").hidden, modal: document.body.classList.contains("overlay-modal-open"), inert: [...document.body.children].filter((node) => node.inert).length }));
    check("Back to a page left with the AJOOP panel open: it comes back as the page, nothing stale over it", opened && restored.path === "/works/" && !restored.panel && !restored.modal && restored.inert === 0, JSON.stringify(restored));
    await page.close();
  }
  {
    const events = [];
    const page = await open(browser, { path: "/works/", events, reducedMotion: true });
    await follow(page, "/sinama-case-study/");
    const calm = await page.evaluate(() => { const launcher = getComputedStyle(document.querySelector("[data-chatbot-toggle]")); return { path: location.pathname, launcher: launcher.transitionDuration, running: document.getAnimations().filter((animation) => animation.playState === "running").length }; });
    check("reduced motion: navigation is an ordinary one, and the floating controls do not animate", calm.path === "/sinama-case-study/" && !events.some((entry) => entry.endsWith("transition")) && calm.launcher.split(",").every((value) => parseFloat(value) <= 0.001) && calm.running === 0, `${JSON.stringify(calm)} ${events.join("; ")}`);
    await page.close();
  }

  // ---- motion sheet: Works → a case study, slowed, frame by frame ----
  {
    const page = await open(browser, { path: "/works/" });
    await decodeImages(page);
    const session = await page.createCDPSession();
    const frames = [];
    session.on("Page.screencastFrame", (frame) => { frames.push({ data: frame.data, at: frame.metadata.timestamp }); session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {}); });
    await session.send("Animation.enable");
    await session.send("Animation.setPlaybackRate", { playbackRate: 0.12 });
    await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    const start = frames.length;
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.evaluate(() => document.querySelector('.project-card[data-v4-card] a[href="/sinama-case-study/"], main a[href="/sinama-case-study/"]').click())]);
    await wait(4200);
    await session.send("Page.stopScreencast").catch(() => {});
    await session.send("Animation.setPlaybackRate", { playbackRate: 1 }).catch(() => {});
    const taken = frames.slice(Math.max(0, start - 1));
    const picks = taken.length <= 6 ? taken : Array.from({ length: 6 }, (unused, index) => taken[Math.round((index * (taken.length - 1)) / 5)]);
    const cells = picks.map((frame, index) => `<figure><img src="data:image/png;base64,${frame.data}"><figcaption>frame ${index + 1} of ${picks.length} · +${Math.round((frame.at - picks[0].at) * 1000)} ms at 0.12× speed</figcaption></figure>`);
    const board = await browser.newPage();
    await board.setViewport({ width: 3 * 740 + 40, height: 800, deviceScaleFactor: 1 });
    await board.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#0b1118;color:#e8f4fb;font:14px system-ui,Segoe UI,Arial,sans-serif}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 18px;color:#9bc0d0}main{display:grid;grid-template-columns:repeat(3,720px);gap:20px}figure{margin:0}img{display:block;width:100%;border:1px solid #24465a}figcaption{padding:6px 0 0;font-size:13px;color:#cfe8f3;text-align:center}</style><h1>V4-E07 · Route transition · Works → SINAMA case study</h1><p>The cross-document view transition every route now shares: the page cross-fades (260 ms), the header is carried across, and the chosen project's visual travels to its hero (460 ms). Captured from the production build, slowed to 0.12×; ${taken.length} frames recorded.</p><main>${cells.join("")}</main>`, { waitUntil: "load" });
    await board.screenshot({ path: join(OUTPUT, "00-motion-frames.png"), fullPage: true });
    await board.close();
    check("the motion sheet holds frames of a real transition", picks.length >= 3, `${taken.length} frames`);
    await page.close();
  }

  // ---- floating controls at seven viewports ----
  for (const [name, viewport] of VIEWPORTS) {
    const results = [];
    for (const path of ["/", "/works/", "/request/", "/sinama-case-study/", "/games/"]) {
      const page = await open(browser, { viewport, path, settle: 200 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(350);
      results.push([path, await page.evaluate(() => {
        const box = (node) => node.getBoundingClientRect();
        const launcher = box(document.querySelector("[data-chatbot-toggle]"));
        const trigger = box(document.querySelector(".easter-trigger"));
        /* What is really under the control: hit-tested at nine points, so nothing hidden or clipped counts. */
        const hits = (floating) => [...new Set([0.1, 0.5, 0.9].flatMap((x) => [0.1, 0.5, 0.9].flatMap((y) => document.elementsFromPoint(floating.left + floating.width * x, floating.top + floating.height * y))).map((node) => node.closest("a, button, input, select, textarea")).filter((node) => node && !node.matches("[data-chatbot-toggle], .easter-trigger")))].map((node) => (node.textContent.trim() || node.getAttribute("aria-label") || node.name || node.tagName).slice(0, 24));
        const mark = document.querySelector(".footer-brand img");
        const markStyle = getComputedStyle(mark);
        return { footerBrand: `${Math.round(box(mark).width)} ${markStyle.borderTopWidth} ${markStyle.borderTopLeftRadius} ${markStyle.backgroundColor} ${markStyle.boxShadow}`, headerBrand: Math.round(box(document.querySelector(".brand img")).width), launcher: [Math.round(launcher.width), Math.round(launcher.height)], trigger: [Math.round(trigger.width), Math.round(trigger.height)], baseline: Math.round(Math.abs(launcher.bottom - trigger.bottom)), gap: Math.round(launcher.left - trigger.right), covered: [...hits(launcher), ...hits(trigger)], overflow: document.documentElement.scrollWidth - innerWidth };
      })]);
      await page.close();
    }
    const compact = viewport.width <= 820 || viewport.height <= 480;
    check(`${name}: the brand mark is ${viewport.width <= 480 ? 32 : 36}px in the header and stands unframed in the footer`, results.every(([, fact]) => fact.headerBrand === (viewport.width <= 480 ? 32 : 36) && fact.footerBrand === "36 0px 0px rgba(0, 0, 0, 0) none"), results.filter(([, fact]) => fact.footerBrand !== "36 0px 0px rgba(0, 0, 0, 0) none").map(([path, fact]) => `${path}:${fact.headerBrand}:${fact.footerBrand}`).join(" "));
    check(`${name}: launcher and trigger share one baseline, ${compact ? "are the same square" : "the launcher keeps its label"}, and cover no link or control at the end of a page`, results.every(([, fact]) => fact.baseline <= 1 && fact.covered.length === 0 && fact.gap > 40 && fact.overflow <= 0 && fact.trigger[0] >= 44 && (compact ? fact.launcher[0] === fact.trigger[0] && fact.launcher[1] === fact.trigger[1] : fact.launcher[0] > 100)), results.filter(([, fact]) => fact.baseline > 1 || fact.covered.length).map(([path, fact]) => `${path}:${JSON.stringify(fact)}`).join(" ") || JSON.stringify(results[0][1]));
  }
  {
    const page = await open(browser, { viewport: PHONE, path: "/request/" });
    const covered = await page.evaluate(() => {
      const floating = [document.querySelector("[data-chatbot-toggle]"), document.querySelector(".easter-trigger")].map((node) => node.getBoundingClientRect());
      return [...document.querySelectorAll("[data-request-form] input:not([type=hidden]), [data-request-form] select, [data-request-form] textarea, [data-request-submit]")].filter((field) => {
        field.scrollIntoView({ block: "center" });
        const rect = field.getBoundingClientRect();
        return floating.some((box) => rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top);
      }).map((field) => field.name || "submit");
    });
    check("Request on a phone: no field or the submit button sits under a floating control when brought into view", covered.length === 0, covered.join(" "));
    await page.close();
  }

  // ---- case studies: one section nav, in one place ----
  for (const locale of ["en", "de"]) {
    const results = [];
    for (const path of CASE_STUDIES) {
      const page = await open(browser, { path: localized(locale, path), settle: 200 });
      results.push([path, await page.evaluate(async () => {
        const hero = document.querySelector("main .case-hero");
        const tracker = document.querySelector("main .v4-tracker");
        const order = Boolean(hero.compareDocumentPosition(tracker) & Node.DOCUMENT_POSITION_FOLLOWING) && hero.nextElementSibling === tracker;
        window.scrollTo(0, tracker.offsetTop + 600);
        await new Promise((done) => setTimeout(done, 300));
        const header = document.querySelector(".site-header").getBoundingClientRect();
        return { order, stuck: Math.round(tracker.getBoundingClientRect().top - header.bottom), links: tracker.querySelectorAll("a").length, current: tracker.querySelectorAll("[aria-current]").length };
      })]);
      await page.close();
    }
    check(`${locale}: every case study's section nav follows its hero, sticks under the header and marks the section in view`, results.every(([, fact]) => fact.order && Math.abs(fact.stuck) <= 1 && fact.links >= 4 && fact.current === 1), results.filter(([, fact]) => !fact.order || Math.abs(fact.stuck) > 1 || fact.current !== 1).map(([path, fact]) => `${path}:${JSON.stringify(fact)}`).join(" "));
  }

  // ---- games: entry, entered, exit ----
  {
    const page = await open(browser, { path: "/merge-rush/" });
    await page.evaluate(() => window.scrollTo(0, 240));
    await page.focus("[data-mr-enter]");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mr-state"), { timeout: 8000 }).catch(() => {});
    await wait(400);
    const entered = await page.evaluate(() => ({ state: document.documentElement.getAttribute("data-mr-state"), header: getComputedStyle(document.querySelector(".site-header")).display, launcher: document.querySelector("[data-chatbot-toggle]").getBoundingClientRect().width, trigger: document.querySelector(".easter-trigger").getBoundingClientRect().width, inert: Boolean(document.querySelector(".site-footer").inert) }));
    await page.waitForFunction(() => document.documentElement.getAttribute("data-mr-state") === "playing", { timeout: 30000 }).catch(() => {});
    await wait(900);
    await still(page, "08b-game-entered.png", "08b · Merge Rush · entered: the game has the viewport");
    await page.goBack({ waitUntil: "load" }).catch(() => {});
    await wait(700);
    const left = await page.evaluate(() => ({ state: document.documentElement.getAttribute("data-mr-state"), path: location.pathname, header: getComputedStyle(document.querySelector(".site-header")).display, launcher: document.querySelector("[data-chatbot-toggle]").getBoundingClientRect().width > 0, focus: document.activeElement.hasAttribute("data-mr-enter"), scroll: Math.round(scrollY), canvas: Boolean(document.querySelector("[data-mr-canvas] canvas")) }));
    check("Merge Rush: entering hides the site's chrome and both floating controls; Back returns to the page, at its scroll position, with focus on Play", ["loading", "playing"].includes(entered.state) && entered.header === "none" && entered.launcher === 0 && entered.trigger === 0 && entered.inert && left.state === null && left.path === "/merge-rush/" && left.header !== "none" && left.launcher && left.focus && !left.canvas && Math.abs(left.scroll - 240) < 4, `${JSON.stringify(entered)} ${JSON.stringify(left)}`);
    await still(page, "09-game-exit-return.png", "09 · Merge Rush · after Back: the portfolio page again, focus on Play");

    /* With no control remembered (a pointer that never focused the button). */
    await page.evaluate(() => { document.activeElement.blur(); document.querySelector("[data-mr-enter]").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mr-state"), { timeout: 8000 }).catch(() => {});
    await page.goBack({ waitUntil: "load" }).catch(() => {});
    await wait(600);
    check("Merge Rush: leaving without a remembered control still puts focus on Play, not on the document", await page.evaluate(() => document.activeElement.hasAttribute("data-mr-enter")));
    await page.close();
  }
  for (const [path, enter, state] of [["/adventure/", "[data-ca-enter]", "data-ca-state"], ["/joyday-paint/", "[data-jds-enter]", "data-joyday-studio"], ["/ai-flow-puzzle/", "[data-afp-play]", "data-afp-state"]]) {
    const before = problems.length;
    const page = await open(browser, { path });
    const page0 = await page.evaluate(grammarOf);
    await page.focus(enter);
    await page.keyboard.press("Enter");
    await page.waitForFunction((attribute) => document.documentElement.hasAttribute(attribute), { timeout: 8000 }, state).catch(() => {});
    await wait(700);
    const entered = await page.evaluate((attribute) => ({ state: document.documentElement.getAttribute(attribute), header: getComputedStyle(document.querySelector(".site-header")).display, launcher: document.querySelector("[data-chatbot-toggle]").getBoundingClientRect().width, trigger: document.querySelector(".easter-trigger").getBoundingClientRect().width }), state);
    await page.goBack({ waitUntil: "load" }).catch(() => {});
    await wait(700);
    const left = await page.evaluate((attribute, selector) => ({ state: document.documentElement.getAttribute(attribute), path: location.pathname, header: getComputedStyle(document.querySelector(".site-header")).display, launcher: document.querySelector("[data-chatbot-toggle]").getBoundingClientRect().width > 0, focus: document.activeElement.matches(selector) }), state, enter);
    check(`${path}: the page shows the shared launcher; entering hides chrome and floating controls; Back restores the page and its focus`, page0.launcher.style === reference.launcher && Boolean(entered.state) && entered.header === "none" && entered.launcher === 0 && entered.trigger === 0 && left.state === null && left.path === path && left.header !== "none" && left.launcher && left.focus && problems.length === before, `${JSON.stringify(entered)} ${JSON.stringify(left)}`);
    await page.close();
  }

  // ---- locale and theme ----
  {
    const results = [];
    for (const path of ["/works/", "/projects/agency-db/", "/merge-rush-case-study/", "/merge-rush/", "/ajoop/", "/request/", "/adventure/", "/certificates/"]) {
      const page = await open(browser, { path, settle: 200 });
      await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {}), page.select("[data-lang-select]", "de")]);
      await wait(400);
      const german = await page.evaluate(() => `${location.pathname}|${document.documentElement.lang}`);
      await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {}), page.select("[data-lang-select]", "en")]);
      await wait(400);
      results.push([path, german, await page.evaluate(() => `${location.pathname}|${document.documentElement.lang}`)]);
      await page.close();
    }
    check("language switch: every route goes to its own German page and back to its own English page", results.every(([path, german, english]) => german === `/de${path}|de` && english === `${path}|en`), results.filter(([path, german, english]) => german !== `/de${path}|de` || english !== `${path}|en`).map((entry) => entry.join(" ")).join(" ; "));
  }
  {
    const first = await open(browser, { path: "/privacy/", settle: 100 });
    await first.close();
    /* theme: null, so the choice made here is the only thing that sets it on the next page. */
    const page = await open(browser, { path: "/games/", theme: null });
    const dark = await page.evaluate(grammarOf);
    await page.click("[data-theme-toggle]");
    await wait(400);
    const light = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, canvas: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.querySelector("main h1")).color, launcher: getComputedStyle(document.querySelector("[data-chatbot-toggle]")).backgroundColor, primary: getComputedStyle(document.querySelector("main .btn.primary")).backgroundColor }));
    await follow(page, "/works/");
    const kept = await page.evaluate(() => document.documentElement.dataset.theme);
    const contrast = await page.evaluate(() => {
      const luminance = (colour) => { const [r, g, b] = colour.match(/[\d.]+/g).slice(0, 3).map((value) => { const channel = Number(value) / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + 0.05) / (dark + 0.05); };
      const canvas = getComputedStyle(document.body).backgroundColor;
      const button = document.querySelector("main .btn.primary");
      return { eyebrow: ratio(getComputedStyle(document.querySelector("main .eyebrow")).color, canvas), button: ratio(getComputedStyle(button).color, getComputedStyle(button).backgroundColor), lead: ratio(getComputedStyle(document.querySelector("main .page-hero > p:not(.eyebrow)")).color, canvas) };
    });
    check("theme switch: light is applied from the same tokens, survives a navigation, and labels, lead and primary action keep AA contrast", light.theme === "light" && kept === "light" && light.canvas !== "rgb(5, 9, 18)" && light.launcher !== dark.launcher.style.split(" | ")[1] && contrast.eyebrow >= 4.5 && contrast.button >= 4.5 && contrast.lead >= 4.5, `${JSON.stringify(light)} ${JSON.stringify(contrast)}`);
    await still(page, "16-light-theme-works.png", "16 · Light theme · Works");
    await page.close();
  }

  // ---- keyboard ----
  {
    const page = await open(browser, { path: "/games/" });
    await page.keyboard.press("Tab");
    await wait(400);
    const skip = await page.evaluate(() => { const node = document.activeElement; return { skip: node.classList.contains("skip-link"), visible: node.getBoundingClientRect().top >= 0, outline: getComputedStyle(node).outlineStyle }; });
    await page.keyboard.press("Enter");
    await wait(250);
    const target = await page.evaluate(() => document.activeElement.id);
    const rings = [];
    for (let stop = 0; stop < 10; stop += 1) { await page.keyboard.press("Tab"); rings.push(await page.evaluate(() => { const node = document.activeElement; const style = getComputedStyle(node); return `${node.tagName.toLowerCase()}:${style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2}`; })); }
    check("keyboard: the first Tab shows the skip link, Enter moves to the content, and the next ten stops each show a focus ring", skip.skip && skip.visible && skip.outline !== "none" && target === "main-content" && rings.every((entry) => entry.endsWith("true")), `${JSON.stringify(skip)} ${target} ${rings.join(" ")}`);
    await page.focus("[data-chatbot-toggle]");
    const ring = await page.evaluate(() => { const style = getComputedStyle(document.querySelector("[data-chatbot-toggle]")); return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2; });
    await page.keyboard.press("Enter");
    await wait(500);
    const openState = await page.evaluate(() => !document.querySelector("[data-chatbot-panel]").hidden);
    await page.keyboard.press("Escape");
    await wait(300);
    check("keyboard: the launcher shows its ring, opens the panel on Enter, and Escape returns focus to it", ring && openState && await page.evaluate(() => document.querySelector("[data-chatbot-panel]").hidden && document.activeElement.hasAttribute("data-chatbot-toggle")));
    await page.close();

    const phone = await open(browser, { viewport: PHONE, path: "/works/" });
    await phone.focus(".brand");
    const mark = await phone.evaluate(() => { const link = document.querySelector(".brand"); const image = link.querySelector("img"); const computed = getComputedStyle(image); const ring = getComputedStyle(link); return { size: Math.round(image.getBoundingClientRect().width), frame: [computed.borderTopWidth, computed.backgroundColor].join(" | "), ring: ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth) >= 2, sharp: image.naturalWidth >= image.getBoundingClientRect().width * 3 }; });
    check("brand mark on a phone: 32px, unframed, a visible focus ring on its link, and artwork with at least 3× the pixels it is shown at", mark.size === 32 && mark.frame === "0px | rgba(0, 0, 0, 0)" && mark.ring && mark.sharp, JSON.stringify(mark));
    await phone.focus(".nav-toggle");
    await phone.keyboard.press("Enter");
    await wait(300);
    const menu = await phone.evaluate(() => ({ expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"), links: [...document.querySelectorAll(".nav-links a")].filter((link) => link.getBoundingClientRect().height >= 44).length, overflow: document.documentElement.scrollWidth - innerWidth }));
    await still(phone, "02b-mobile-navigation.png", "02b · Phone · navigation open");
    await phone.keyboard.press("Escape");
    await wait(300);
    check("phone navigation: opens from the keyboard with seven 44px targets, and Escape closes it and returns focus to its button", menu.expanded === "true" && menu.links === 7 && menu.overflow <= 0 && await phone.evaluate(() => document.querySelector(".nav-toggle").getAttribute("aria-expanded") === "false" && document.activeElement.classList.contains("nav-toggle")), JSON.stringify(menu));
    await phone.close();
  }

  // ---- no JavaScript ----
  {
    const facts = [];
    for (const path of ["/", "/works/", "/games/", "/request/", "/sinama-case-study/", "/projects/agency-db/", "/ajoop/", "/merge-rush/"]) {
      const page = await open(browser, { noJs: true, path, settle: 150 });
      facts.push([path, await page.evaluate(() => ({ nav: document.querySelectorAll(".nav-links a[href]").length, title: Boolean(document.querySelector("main h1")?.textContent.trim()), visible: Number(getComputedStyle(document.querySelector("main h1")).opacity) > 0.9, launcher: getComputedStyle(document.querySelector("[data-chatbot-toggle]") || document.body).visibility, overflow: document.documentElement.scrollWidth - innerWidth, font: getComputedStyle(document.querySelector("main h1")).fontFamily.split(",")[0] }))]);
      if (path === "/games/") await still(page, "21-no-javascript-games.png", "21 · No JavaScript · Games");
      await page.close();
    }
    check("no JavaScript: navigation, title and the shared grammar are in the HTML on eight routes; the launcher that needs a script stays hidden", facts.every(([path, fact]) => fact.nav === 7 && fact.title && fact.visible && fact.overflow <= 0 && fact.font === "Manrope" && (path === "/ajoop/" || fact.launcher === "hidden")), facts.filter(([path, fact]) => fact.nav !== 7 || !fact.visible || (path !== "/ajoop/" && fact.launcher !== "hidden")).map(([path, fact]) => `${path}:${JSON.stringify(fact)}`).join(" "));
    const plain = await open(browser, { noJs: true, path: "/works/" });
    await plain.evaluate(() => document.querySelector("#catalog-software > summary").scrollIntoView({ behavior: "instant", block: "center" }));
    await plain.click("#catalog-software > summary");
    await wait(400);
    const works = await plain.evaluate(() => document.querySelector("#catalog-software").open && document.querySelector("#catalog-software .v4-pcards").getBoundingClientRect().height > 300);
    await plain.close();
    const hub = await open(browser, { noJs: true, path: "/ajoop/" });
    const fallback = await hub.evaluate(() => ({ text: document.querySelector("main").textContent.trim().length > 200, links: document.querySelectorAll("main a[href], #react-ajoop-root a[href]").length }));
    await hub.close();
    const request = await open(browser, { noJs: true, path: "/request/" });
    const form = await request.evaluate(() => Boolean(document.querySelector("[data-request-form]")) && Boolean(document.querySelector('.request-form-actions a[href^="mailto:"]')));
    await request.close();
    check("no JavaScript: Works groups open, the Request form and its email fallback are present, and the AJOOP Hub still reads as a page with links", works && form && fallback.text && fallback.links > 0, JSON.stringify({ works, form, fallback }));
  }

  // ---- the review stills ----
  const home = await open(browser, { path: "/" });
  await still(home, "01-home-desktop.png", "01 · Home · desktop");
  await stillOf(home, "[data-v4-support]", "01b-home-identity-plate.png", "01b · Home · the AI Chatbot card: identity plate, not the retired cover", 260);
  await stillOf(home, ".contact-hub", "01c-home-closing.png", "01c · Home · closing hand-off and footer", 120);
  await home.close();
  const homePhone = await open(browser, { viewport: PHONE, path: "/" });
  await still(homePhone, "02-home-mobile.png", "02 · Home · phone");
  await homePhone.close();
  const works = await open(browser, { path: "/works/" });
  await still(works, "03-works-desktop.png", "03 · Works · desktop");
  await works.close();
  const worksPhone = await open(browser, { viewport: PHONE, path: "/works/" });
  await still(worksPhone, "04-works-mobile.png", "04 · Works · phone");
  await worksPhone.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await wait(350);
  await still(worksPhone, "04b-works-mobile-page-end.png", "04b · Phone · page end: footer clear of both floating controls");
  await worksPhone.close();
  for (const [path, file, label] of [
    ["/projects/agency-db/", "05-project-detail.png", "05 · Project detail · Agency DB"],
    ["/hospital-system-case-study/", "06-case-study.png", "06 · Case study · section nav after the hero"],
    ["/games/", "07-games.png", "07 · Games · the shared grammar on a route without its own composition"],
    ["/merge-rush/", "08-playable-entry.png", "08 · Playable entry · Merge Rush"],
    ["/blog/", "10-experience.png", "10 · Experience"],
    ["/certificates/", "11-certificates.png", "11 · Certificates"],
    ["/about/", "12-about.png", "12 · About"],
    ["/request/", "13-request.png", "13 · Request"],
    ["/ajoop/", "14-ajoop-hub.png", "14 · AJOOP Hub"],
    ["/labs/", "17-dark-theme-labs.png", "17 · Dark theme · Labs"],
    ["/now/", "17b-now.png", "17b · Now / build log"],
    ["/privacy/", "17c-privacy.png", "17c · Privacy"],
    ["/404.html", "17d-not-found.png", "17d · 404 · the legacy shell (takes part in the transition; not restyled, see the report)"],
  ]) {
    const page = await open(browser, { path });
    await still(page, file, label);
    await page.close();
  }
  {
    const page = await open(browser, { path: "/works/" });
    await page.click("[data-chatbot-toggle]");
    await wait(900);
    await still(page, "15-ajoop-conversation.png", "15 · AJOOP conversation · the panel over Works");
    await page.close();
    const tablet = await open(browser, { viewport: { width: 768, height: 1024, isMobile: true, hasTouch: true }, path: "/games/" });
    await still(tablet, "18-tablet-games.png", "18 · Tablet · Games");
    await tablet.close();
    const landscape = await open(browser, { viewport: { width: 844, height: 390, isMobile: true, hasTouch: true }, path: "/" });
    await still(landscape, "19-phone-landscape-home.png", "19 · Phone landscape · Home, compact floating controls");
    await landscape.close();
    const german = await open(browser, { viewport: PHONE, path: "/de/request/" });
    await still(german, "20-locale-de-request-mobile.png", "20 · German · Request · phone");
    await german.close();
    const french = await open(browser, { path: "/fr/games/" });
    await still(french, "20b-locale-fr-games.png", "20b · French · Games");
    await french.close();
    const lightHome = await open(browser, { path: "/", theme: "light" });
    await stillOf(lightHome, "[data-v4-support]", "16b-light-theme-home-plate.png", "16b · Light theme · Home, the identity plate", 320);
    await lightHome.close();
  }

  check("console and hydration are clean on every page opened", problems.length === 0, problems.slice(0, 4).join(" | "));

  await sheet(browser, "00-contact-sheet.png", "V4-E07 · Global experience / final design polish",
    "Production build. One page grammar, one launcher, one transition on every route; Home without the retired cover.",
    [...stills].sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true })), 4, 440);
} finally {
  await browser.close();
  server?.kill();
}

const failed = checks.filter((entry) => !entry.pass);
await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify({ phase: "V4-E07", capturedAt: new Date().toISOString(), routes: ROUTES.length, locales: LOCALES, viewports: VIEWPORTS.map(([name]) => name), journeys: JOURNEYS.map((pair) => pair.join(" → ")), passed: checks.length - failed.length, failed: failed.length, checks, stills: stills.map((entry) => entry.file) }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed → ${OUTPUT}`);
process.exit(failed.length === 0 ? 0 : 1);
