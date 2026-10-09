/* V4-E06.5 — focused QA and the review pack for the complete catalog.
 *
 *   npm run build:site && node scripts/v4-e06-5-works-coverage-review.mjs
 *
 * Checks the production build in dist-site/ through the local preview server:
 * Works and Games in five locales, the catalog groups (pointer, keyboard, no
 * JavaScript), the System Map and Capability View, project and archive detail
 * pages, the new and updated case studies, every catalog link, phone and
 * tablet, reduced motion, console and hydration. Writes the stills, a contact
 * sheet and qa-summary.json OUTSIDE the repository (V4 rule).
 *
 * The static half of the gate is scripts/qa-v4-works-coverage.mjs. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = process.env.V4_CAPTURE_DIR || "C:\\PC-Audit\\v4-review\\v4-e06-5-works-coverage";
const PORT = process.env.V4_CAPTURE_PORT || "4187";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = "https://ajoop.kaanbalci.com/";
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TABLET = { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const GROUP_LABEL = { en: "Current work", tr: "Güncel çalışmalar", de: "Aktuelle Arbeiten", es: "Trabajo actual", fr: "Travaux actuels" };

const catalog = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "catalog.json"), "utf8"));
const details = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "project-details.json"), "utf8"));
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

async function open(browser, { viewport = DESKTOP, path = "/works/", noJs = false, reducedMotion = false, settle = 900 } = {}) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    if (message.text().includes(EDGE) || String(message.location()?.url || "").startsWith(EDGE)) return;
    problems.push(`${path} ${message.type()}: ${message.text().slice(0, 220)}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith(EDGE)) { request.respond({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" }).catch(() => {}); return; }
    request.continue().catch(() => {});
  });
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
  /* The site scrolls smoothly; a capture must not catch a scroll half-way. */
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" }).catch(() => {});
  await wait(settle);
  return page;
}

async function still(page, file, label, options = {}) {
  await mkdir(OUTPUT, { recursive: true });
  await page.screenshot({ path: join(OUTPUT, file), ...options });
  stills.push({ file, label });
}

/** A capture of one element's neighbourhood, scrolled into view. */
async function stillOf(page, selector, file, label) {
  await page.evaluate((target) => document.querySelector(target).scrollIntoView({ block: "start" }), selector);
  await page.evaluate(() => window.scrollBy(0, -90));
  await wait(350);
  await still(page, file, label);
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

// ------------------------------------------------------------------ the run

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });

const gate = spawnSync(process.execPath, [join(ROOT, "scripts", "qa-v4-works-coverage.mjs")], { encoding: "utf8" });
check("static coverage gate (qa:v4:works-coverage) passes", gate.status === 0, (gate.stdout || gate.stderr).trim().split("\n").pop());

let server = null;
if (!(await serverReady())) {
  server = spawn(process.execPath, [join(ROOT, "scripts", "v4-preview-server.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
  for (let attempt = 0; attempt < 40 && !(await serverReady()); attempt += 1) await wait(150);
  if (!(await serverReady())) throw new Error("preview server did not start");
}
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000 });
const publicCount = catalog.identities.length;
const members = catalog.collections.flatMap((collection) => collection.members);
const nativeCount = catalog.identities.filter((identity) => identity.group === "nativeGames").length;

try {
  // ---- five locales: Works, Games, the two new case studies ----
  for (const locale of LOCALES) {
    const works = await open(browser, { path: localized(locale, "/works/"), settle: 400 });
    const facts = await works.evaluate(() => ({
      rows: document.querySelectorAll("[data-catalog-id]").length,
      memberRows: document.querySelectorAll("[data-catalog-member]").length,
      groups: [...document.querySelectorAll(".v4-catalog__group")].map((group) => ({ label: group.querySelector(".v4-catalog__label").textContent, open: group.open })),
      cards: document.querySelectorAll(".project-card").length,
      leaked: /catalog\.[a-z]+\.[a-zA-Z-]+|\[object Object\]|undefined/.test(document.querySelector("#catalog").innerText),
      internal: [...document.querySelectorAll("#catalog a[href^='/']")].map((link) => link.getAttribute("href")),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    check(`${locale}: Works lists ${publicCount} standalone projects and a collection of ${members.length} learning artifacts, collapsed, behind ${facts.cards} curated cards`, facts.rows === publicCount && facts.memberRows === members.length && facts.groups.length === 6 && facts.groups.every((group) => !group.open) && facts.cards <= 12);
    check(`${locale}: the catalog is in the page's language, with no leaked key and no overflow`, facts.groups[0].label === GROUP_LABEL[locale] && !facts.leaked && !facts.overflow, facts.groups[0].label);
    check(`${locale}: catalog links stay in the locale`, facts.internal.every((href) => locale === "en" ? !/^\/(tr|de|es|fr)\//.test(href) : href.startsWith(`/${locale}/`)));
    await works.close();

    const games = await open(browser, { path: localized(locale, "/games/"), settle: 400 });
    const gameFacts = await games.evaluate(() => ({
      rows: document.querySelectorAll("#native-archive .v4-catalog__row").length,
      playable: [...document.querySelectorAll(".game-card")].map((card) => [...card.querySelectorAll(".project-actions a")].length),
      order: document.querySelector(".games-featured").compareDocumentPosition(document.querySelector("#native-archive")) & Node.DOCUMENT_POSITION_FOLLOWING,
    }));
    check(`${locale}: Games shows four browser games, each with Play and Case Study, above the native archive`, gameFacts.rows === nativeCount && gameFacts.playable.length === 4 && gameFacts.playable.every((count) => count === 2) && gameFacts.order > 0, JSON.stringify(gameFacts.playable));
    await games.close();

    for (const route of ["/career-adventure-case-study/", "/portfolio-case-study/"]) {
      const response = await fetch(`${ORIGIN}${localized(locale, route)}`);
      const html = await response.text();
      check(`${locale}: ${route} is served with its own head`, response.status === 200 && html.includes(`<link rel="canonical" href="https://kaanbalci.com${localized(locale, route)}"`) && !/career\.case\.|portfolio\.case\./.test(html.replace(/<script[\s\S]*?<\/script>/g, "")));
    }
  }

  // ---- every catalog link ----
  const internal = new Set();
  const external = new Set();
  for (const identity of [...catalog.identities, ...members]) {
    if (identity.detailSlug) internal.add(`/projects/${identity.detailSlug}/`);
    for (const target of Object.values(identity.links)) (/^https?:/.test(target) ? external : internal).add(target);
  }
  for (const record of Object.values(details)) for (const link of record.links || []) (/^https?:/.test(link.url) ? external : internal).add(link.url);
  const internalStatus = await Promise.all([...internal].map(async (target) => [target, (await fetch(`${ORIGIN}${target}`)).status]));
  check(`every internal catalog link resolves (${internal.size})`, internalStatus.every(([, status]) => status === 200), internalStatus.filter(([, status]) => status !== 200).map(([target]) => target).join(", "));
  const externalStatus = [];
  for (const target of external) {
    try { externalStatus.push([target, (await fetch(target, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) })).status]); } catch (error) { externalStatus.push([target, error.message]); }
  }
  check(`every public GitHub, live and video link answers 200 (${external.size})`, externalStatus.every(([, status]) => status === 200), externalStatus.filter(([, status]) => status !== 200).map(([target, status]) => `${target} ${status}`).join(", "));
  const projectStatus = await Promise.all(LOCALES.flatMap((locale) => Object.keys(details).map(async (slug) => (await fetch(`${ORIGIN}${localized(locale, `/projects/${slug}/`)}`)).status)));
  check(`every project page is served in five locales (${projectStatus.length})`, projectStatus.every((status) => status === 200));

  // ---- Works on desktop: default, groups, map, capability ----
  const page = await open(browser);
  await still(page, "01-works-default-desktop.png", "01 · Works · default: the curated explorer");
  await stillOf(page, "#catalog", "02a-catalog-collapsed.png", "02a · Complete catalog, collapsed: four groups, relations, capability evidence");

  const openGroup = async (id) => {
    await page.click(`#catalog-${id} > summary`);
    await wait(200);
    return page.evaluate(() => [...document.querySelectorAll(".v4-catalog__group")].filter((group) => group.open).map((group) => group.id));
  };
  check("a group opens on click", (await openGroup("nativeGames")).join() === "catalog-nativeGames");
  await stillOf(page, "#catalog-nativeGames", "03-catalog-games-archive.png", "03 · Games group: the native archive, with what each repository holds");
  check("opening another group closes the first", (await openGroup("software")).join() === "catalog-software");
  await stillOf(page, "#catalog-software", "02b-catalog-software.png", "02b · Archive view: software, data and mobile");
  await openGroup("earlier");
  await stillOf(page, "#catalog-earlier", "04-catalog-earlier-learning.png", "04 · Earlier work and learning, labelled as such");
  const earlier = await page.evaluate(() => [...document.querySelectorAll("#catalog-earlier .v4-catalog__row")].map((row) => { const title = row.querySelector(".v4-catalog__title"); return `${title.textContent}:${title.tagName}:${row.querySelector(".v4-catalog__status").dataset.catalogStatus}:${[...row.querySelectorAll(".v4-catalog__links a")].map((link) => link.getAttribute("href")).join("+")}`; }));
  check("the collection holds learning artifacts as members, none of them a project row", earlier.length === members.length && await page.evaluate(() => document.querySelectorAll("#catalog-earlier [data-catalog-id]").length === 0 && document.querySelector("#catalog-earlier").hasAttribute("data-catalog-collection")));
  check("the two incomplete artifacts are named without a page, under the real repository names", earlier.includes("Weather App:SPAN:unfinished:https://github.com/UAJOP/Weather-App") && earlier.includes("Calculator JavaScript:SPAN:unfinished:https://github.com/UAJOP/Calculator-JavaScript"), earlier.filter((row) => /Weather|Calculator JavaScript/.test(row)).join(" | "));
  check("the private coursework entry has no repository link", earlier.some((row) => /^IC Supply:A:privateArchive:$/.test(row)), earlier.find((row) => row.startsWith("IC Supply")));

  await page.focus("#catalog-current > summary");
  await page.keyboard.press("Enter");
  await wait(200);
  const keyboard = await page.evaluate(() => ({ open: document.querySelector("#catalog-current").open, focus: document.activeElement?.tagName, outline: getComputedStyle(document.activeElement).outlineStyle }));
  check("groups are keyboard-operable with a visible focus", keyboard.open && keyboard.focus === "SUMMARY" && keyboard.outline !== "none", JSON.stringify(keyboard));
  await page.keyboard.press("Tab");
  check("Tab moves into the opened group's first link", await page.evaluate(() => document.activeElement?.classList.contains("v4-catalog__title")));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-v4-mode="map"]');
  await wait(700);
  check("System Map is still a view of the curated catalog", await page.evaluate(() => document.querySelector("[data-v4-explorer]").getAttribute("data-v4-view") === "map" && document.querySelectorAll(".v4-eco__project").length > 0));
  await stillOf(page, "[data-v4-explorer]", "05a-system-map.png", "05a · System Map (unchanged E02 view)");
  await openGroup("relations");
  await stillOf(page, "#catalog-relations", "05b-system-map-relations.png", "05b · System Map expanded: the factual relations");
  const relations = await page.evaluate(() => [...document.querySelectorAll("#catalog-relations li")].map((item) => item.innerText.replace(/\s+/g, " ")));
  check(`the relations are the catalog's ${catalog.relations.length}, each between two standalone projects`, relations.length === catalog.relations.length && relations.some((line) => /kaanbalci\.com.*hosts.*AJOOP/.test(line)) && !relations.some((line) => /Unity Essentials|Porto 25|Weather App/.test(line)));
  check("System Map and Capability View are still the curated projects only", await page.evaluate((ids) => { const nodes = [...document.querySelectorAll(".v4-eco__project")].map((node) => node.dataset.v4EcoNode); return nodes.length === 10 && !nodes.some((id) => ids.includes(id)); }, members.map((member) => member.id)));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-v4-mode="capability"]');
  await wait(600);
  await stillOf(page, "[data-v4-explorer]", "06a-capability-view.png", "06a · Capability View (unchanged E02 view)");
  await openGroup("capabilities");
  await stillOf(page, "#catalog-capabilities", "06b-capability-evidence.png", "06b · Evidence by capability: learning work is not counted");
  const clusters = await page.evaluate(() => [...document.querySelectorAll("#catalog-capabilities [data-catalog-capability]")].map((cluster) => ({ id: cluster.dataset.catalogCapability, projects: [...cluster.querySelectorAll("a")].map((link) => link.textContent) })));
  check("capability evidence excludes learning and superseded work", clusters.length >= 8 && !clusters.some((cluster) => cluster.projects.some((title) => /My Java Projects|Python Projects|Weather App|Calculator|Mandelas|Porto 25|Unity Essentials/.test(title))), clusters.map((cluster) => `${cluster.id}:${cluster.projects.length}`).join(" "));
  await page.close();

  // ---- detail pages ----
  const detail = await open(browser, { path: "/projects/control-panel/" });
  await still(detail, "07-project-detail.png", "07 · Project detail: Control Panel, described from its source", { fullPage: true });
  const detailFacts = await detail.evaluate(() => ({ text: document.querySelector("main").innerText, links: [...document.querySelectorAll("main a")].map((link) => link.href) }));
  check("a project page states what the source shows and keeps no generic filler", /prepared statement/.test(detailFacts.text) && !/represents my ability|Clarified the project goal|The goal of this repository/.test(detailFacts.text) && detailFacts.links.includes("https://github.com/UAJOP/Control-Panel"));
  await detail.close();

  const native = await open(browser, { path: "/projects/dunker-madness/" });
  await still(native, "08-native-game-archive-detail.png", "08 · Native game archive detail: Dunker Madness", { fullPage: true });
  await native.close();
  const unity = await (await fetch(`${ORIGIN}/projects/unity-essentials/`)).text();
  check("the Unity learning project is titled as such and says the old name is unrelated to AJOOP", /<h1[^>]*>Unity Essentials — First Unity Learning Project<\/h1>/.test(unity) && /nothing to do with AJOOP, the assistant on this site/.test(unity));
  const retired = await Promise.all(LOCALES.flatMap((locale) => ["weather-app", "calculator-javascript"].map(async (slug) => (await fetch(`${ORIGIN}${localized(locale, `/projects/${slug}/`)}`)).status)));
  check("Weather App and Calculator JavaScript have no project page in any locale", retired.every((status) => status === 404), retired.join(" "));
  const supply = await (await fetch(`${ORIGIN}/projects/ic-supply/`)).text();
  check("IC Supply has no repository link and says the source is private", !/github\.com\/UAJOP\/Ic-Supply/i.test(supply) && /The source is kept private/.test(supply));
  const old = await (await fetch(`${ORIGIN}/projects/portfolio-website/`)).text();
  check("the old Portfolio Website page hands over to the case study", old.includes('href="/portfolio-case-study/"'));

  // ---- case studies ----
  const career = await open(browser, { path: "/career-adventure-case-study/" });
  await still(career, "09-career-adventure-case-study.png", "09 · Career Adventure case study", { fullPage: true });
  const careerText = await career.evaluate(() => document.querySelector("main").innerText);
  check("Career Adventure case study covers ladder, fixed step, difficulty, endings, replay, mobile and limits", ["Job Offer", "1/120", "0 / 200", "5 / 16", "2.2 seconds", "replayed", "lifting the finger", "emulation only"].every((term) => careerText.includes(term)));
  check("it offers Play and returns to Games", await career.evaluate(() => Boolean(document.querySelector('main a[href="/adventure/"]')) && Boolean(document.querySelector('main a[href="/games/"]'))));
  await career.close();

  const site = await open(browser, { path: "/portfolio-case-study/" });
  await still(site, "10-portfolio-case-study.png", "10 · kaanbalci.com case study", { fullPage: true });
  const siteText = await site.evaluate(() => document.querySelector("main").innerText);
  check("the portfolio case study covers evolution, architecture, Connected Systems, the games, AJOOP, reliability and privacy", ["prerender", "five languages", "System Map", "Capability View", "Joyday Action Painting", "AI Flow Puzzle", "Career Adventure", "Merge Rush", "session storage", "worktree", "Private repositories"].every((term) => siteText.toLowerCase().includes(term.toLowerCase())));
  check("it says the owner cockpit is roadmap, not built", /owner cockpit is on the roadmap; it is not built/i.test(siteText));
  await site.close();

  const flow = await (await fetch(`${ORIGIN}/ai-flow-puzzle-case-study/`)).text();
  check("the AI Flow Puzzle case study gained the V4 section (ports, diagnostics, idempotent scoring, pan/zoom, missions, phone)", ["Wiring by ports", "Validation with diagnostics", "Idempotent scoring", "Pan, zoom and fit", "Missions and results", "Phone layout"].every((term) => flow.includes(term)));
  const joyday = await (await fetch(`${ORIGIN}/atolye-joyday-case-study/`)).text();
  check("the Atölye Joyday case study points at the Action Painting studio", joyday.includes("Joyday Action Painting: the studio as a browser game.") && joyday.includes('href="/joyday-paint/"'));

  // ---- Games ----
  const games = await open(browser, { path: "/games/" });
  await stillOf(games, ".games-featured", "03b-games-browser-playables.png", "03b · Games: the four browser playables, Play + Case Study");
  await stillOf(games, "#native-archive", "03c-games-native-archive.png", "03c · Games: the native archive below them");
  await games.close();

  // ---- phone and tablet ----
  const phone = await open(browser, { viewport: MOBILE });
  await still(phone, "11-phone-works-default.png", "11 · Phone · Works default");
  check("phone: Works has no horizontal overflow", !(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await phone.evaluate(() => document.querySelector("#catalog-nativeGames > summary").scrollIntoView({ block: "center" }));
  await phone.tap("#catalog-nativeGames > summary");
  await wait(300);
  const phoneRows = await phone.evaluate(() => { const group = document.querySelector("#catalog-nativeGames"); const row = group.querySelector(".v4-catalog__row"); return { open: group.open, overflow: document.documentElement.scrollWidth > window.innerWidth, rowWidth: row.getBoundingClientRect().width, summary: group.querySelector("summary").getBoundingClientRect().height }; });
  check("phone: a group opens by touch, rows stack inside the viewport, the summary is a full touch target", phoneRows.open && !phoneRows.overflow && phoneRows.rowWidth <= 390 && phoneRows.summary >= 44, JSON.stringify(phoneRows));
  await phone.evaluate(() => { document.querySelector("#catalog-nativeGames").scrollIntoView({ block: "start" }); window.scrollBy(0, -70); });
  await wait(300);
  await still(phone, "12-phone-archive-filter.png", "12 · Phone · archive group open");
  await phone.close();

  const tablet = await open(browser, { viewport: TABLET });
  await tablet.evaluate(() => { document.querySelector("#catalog-current").open = true; document.querySelector("#catalog").scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
  await wait(300);
  check("tablet: no horizontal overflow with a group open", !(await tablet.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await still(tablet, "13-tablet-catalog.png", "13 · Tablet · catalog, current work open");
  await tablet.close();

  // ---- no JavaScript ----
  const plain = await open(browser, { noJs: true });
  const plainFacts = await plain.evaluate(() => ({ rows: document.querySelectorAll(".v4-catalog__row").length, cards: document.querySelectorAll(".project-card").length }));
  await plain.evaluate(() => document.querySelector("#catalog-earlier > summary").scrollIntoView({ behavior: "instant", block: "center" }));
  await plain.click("#catalog-earlier > summary");
  await wait(150);
  check("no JavaScript: the whole catalog is in the HTML and its groups still open", plainFacts.rows === publicCount + members.length && plainFacts.cards >= 8 && await plain.evaluate(() => document.querySelector("#catalog-earlier").open));
  await plain.evaluate(() => { document.querySelector("#catalog").scrollIntoView({ behavior: "instant", block: "start" }); window.scrollBy({ top: -80, behavior: "instant" }); });
  await wait(200);
  await still(plain, "14-no-javascript-catalog.png", "14 · No JavaScript · the catalog is complete and operable");
  await plain.close();
  const plainGames = await open(browser, { noJs: true, path: "/games/" });
  check("no JavaScript: Games lists the native archive, open", await plainGames.evaluate((count) => document.querySelectorAll("#native-archive .v4-catalog__row").length === count && document.querySelector("#native-archive details").open, nativeCount));
  await plainGames.close();

  // ---- reduced motion ----
  const calm = await open(browser, { reducedMotion: true });
  check("reduced motion: the catalog runs no animation", await calm.evaluate(() => [...document.querySelectorAll("#catalog, #catalog *")].every((node) => getComputedStyle(node).animationName === "none")));
  await calm.close();

  check("console and hydration are clean on every page opened", problems.length === 0, problems.slice(0, 4).join(" | "));

  await sheet(browser, "00-contact-sheet.png", "V4-E06.5 · Complete GitHub / Works / case-study coverage",
    `Production build. ${catalog.repositories.length} repositories audited, ${publicCount} public identities; the curated explorer is unchanged and the complete catalog sits behind it.`,
    [...stills].sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true })), 4, 440);
} finally {
  await browser.close();
  server?.kill();
}

const failed = checks.filter((entry) => !entry.pass);
const totals = Object.fromEntries(catalog.dispositions.map((disposition) => [disposition, catalog.repositories.filter((entry) => entry.disposition === disposition).length]));
await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify({ phase: "V4-E06.5", capturedAt: new Date().toISOString(), repositories: catalog.repositories.length, dispositions: totals, publicIdentities: publicCount, passed: checks.length - failed.length, failed: failed.length, checks, stills: stills.map((entry) => entry.file) }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed → ${OUTPUT}`);
process.exit(failed.length === 0 ? 0 : 1);
