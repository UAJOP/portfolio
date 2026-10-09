/* V4-E06.6 — focused browser QA and the review pack for the Works card
 * system, the Games archive and the Request surface.
 *
 *   npm run build:site && node scripts/v4-e06-6-works-presentation-review.mjs
 *
 * Checks the production build in dist-site/ through the local preview server:
 * the catalog groups and their card grids in five locales (pointer, keyboard,
 * no JavaScript, reduced motion), tier layout at seven viewports, image
 * loading, every catalog link, Play / Case Study pairing, the Request page's
 * states, console and hydration. Writes the stills, a contact sheet and
 * qa-summary.json OUTSIDE the repository (V4 rule).
 *
 * It supersedes the E06.5 review script: the catalog it checked is now cards.
 * The static halves are scripts/qa-v4-works-coverage.mjs (what is listed) and
 * scripts/qa-v4-works-presentation.mjs (how it is presented). */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = process.env.V4_CAPTURE_DIR || "C:\\PC-Audit\\v4-review\\v4-e06-6-works-presentation";
const PORT = process.env.V4_CAPTURE_PORT || "4187";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = "https://ajoop.kaanbalci.com/";
const FORM_ENDPOINT = "https://script.google.com/";
const LOCALES = ["en", "tr", "de", "es", "fr"];
const localized = (locale, path) => (locale === "en" ? path : `/${locale}${path}`);
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VIEWPORTS = [
  ["1440×900", { width: 1440, height: 900 }, { featured: 2, standard: 3, nativeGames: 4, compact: 4 }],
  ["1280×800", { width: 1280, height: 800 }, { featured: 2, standard: 3, nativeGames: 4, compact: 4 }],
  ["1024×768", { width: 1024, height: 768 }, { featured: 2, standard: 2, nativeGames: 2, compact: 2 }],
  ["768×1024", { width: 768, height: 1024, isMobile: true, hasTouch: true }, { featured: 2, standard: 2, nativeGames: 2, compact: 2 }],
  ["430×932", { width: 430, height: 932, isMobile: true, hasTouch: true }, { featured: 1, standard: 1, nativeGames: 1, compact: 1 }],
  ["390×844", { width: 390, height: 844, isMobile: true, hasTouch: true }, { featured: 1, standard: 1, nativeGames: 1, compact: 1 }],
  ["844×390 landscape", { width: 844, height: 390, isMobile: true, hasTouch: true }, { featured: 2, standard: 2, nativeGames: 2, compact: 2 }],
];
const GRID_OF = { featured: "#catalog-current .v4-pcards", standard: "#catalog-software .v4-pcards", nativeGames: "#catalog-nativeGames .v4-pcards", compact: "#catalog-earlier .v4-pcards" };

const catalog = JSON.parse(await readFile(join(ROOT, "data", "portfolio", "catalog.json"), "utf8"));
const members = catalog.collections.flatMap((collection) => collection.members);
const carded = [...catalog.identities, ...members.filter((member) => !member.incomplete)];
const tiers = Object.fromEntries(["featured", "standard", "compact"].map((tier) => [tier, carded.filter((entry) => entry.card.tier === tier).length]));
const nativeCount = catalog.identities.filter((identity) => identity.group === "nativeGames").length;
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

async function open(browser, { viewport = DESKTOP, path = "/works/", noJs = false, reducedMotion = false, settle = 900, requests = null, expectFailure = false } = {}) {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const source = String(message.location()?.url || "");
    if ([EDGE, FORM_ENDPOINT].some((blocked) => message.text().includes(blocked) || source.startsWith(blocked))) return;
    /* The delivery-failure test blocks the endpoint on purpose; the form logs that failure. */
    if (expectFailure && message.text().includes("Request form submission failed")) return;
    problems.push(`${path} ${message.type()}: ${message.text().slice(0, 220)}`);
  });
  page.on("pageerror", (error) => problems.push(`${path} pageerror: ${error.message}`));
  if (noJs) await page.setJavaScriptEnabled(false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    requests?.push(request.url());
    /* Nothing leaves the machine: the assistant edge and the form endpoint are answered here. */
    if (request.url().startsWith(EDGE) || request.url().startsWith(FORM_ENDPOINT)) { request.respond({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" }).catch(() => {}); return; }
    request.continue().catch(() => {});
  });
  await page.setViewport({ deviceScaleFactor: 1, ...viewport });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]);
  if (!noJs) await page.evaluateOnNewDocument(() => window.addEventListener("portfolio:react-main-hydration-error", (event) => console.error(`hydration: ${event.detail.message}`)));
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
  /* The site scrolls smoothly; a capture must not catch a scroll half-way. */
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" }).catch(() => {});
  await wait(settle);
  return page;
}

/** Opens catalog groups and waits for the images they reveal. */
async function openGroups(page, ids) {
  await page.evaluate(async (list) => {
    document.querySelectorAll(".v4-catalog__group--cards").forEach((group) => { group.open = list.includes(group.id.replace("catalog-", "")); });
    const images = [...document.querySelectorAll(".v4-catalog__group[open] img, #native-archive img")];
    images.forEach((image) => { image.loading = "eager"; });
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
  }, ids);
  await wait(250);
}

async function still(page, file, label, options = {}) {
  await mkdir(OUTPUT, { recursive: true });
  await page.screenshot({ path: join(OUTPUT, file), ...options });
  stills.push({ file, label });
}

async function stillOf(page, selector, file, label, offset = 90) {
  await page.evaluate((target, lift) => { document.querySelector(target).scrollIntoView({ block: "start" }); window.scrollBy(0, -lift); }, selector, offset);
  await wait(350);
  await still(page, file, label);
}

async function closeUp(page, selector, file, label) {
  /* The card is brought under the sticky header's lower edge, then cut out of the viewport. */
  const box = await page.evaluate((target) => {
    const node = document.querySelector(target);
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -110);
    const rect = node.getBoundingClientRect();
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  }, selector);
  await wait(350);
  /* Clip coordinates are the page's, not the viewport's. */
  await still(page, file, label, { clip: { x: Math.max(0, Math.floor(box.x - 16)), y: Math.max(0, Math.floor(box.y - 16)), width: Math.ceil(box.width + 32), height: Math.ceil(box.height + 32) } });
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

for (const gate of ["qa-v4-works-coverage.mjs", "qa-v4-works-presentation.mjs"]) {
  const run = spawnSync(process.execPath, [join(ROOT, "scripts", gate)], { encoding: "utf8" });
  check(`static gate ${gate} passes`, run.status === 0, (run.stdout || run.stderr).trim().split("\n")[0].slice(0, 160));
}

let server = null;
if (!(await serverReady())) {
  server = spawn(process.execPath, [join(ROOT, "scripts", "v4-preview-server.mjs")], { env: { ...process.env, PORT }, stdio: "ignore" });
  for (let attempt = 0; attempt < 40 && !(await serverReady()); attempt += 1) await wait(150);
  if (!(await serverReady())) throw new Error("preview server did not start");
}
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000 });

try {
  // ---- five locales: Works, Games, Request ----
  for (const locale of LOCALES) {
    const works = await open(browser, { path: localized(locale, "/works/"), settle: 500 });
    const facts = await works.evaluate(() => ({
      projects: document.querySelectorAll(".v4-pcard[data-catalog-id]").length,
      members: document.querySelectorAll(".v4-pcard[data-catalog-member]").length,
      unfinished: document.querySelectorAll(".v4-pcard--note [data-catalog-member]").length,
      tiers: Object.fromEntries(["featured", "standard", "compact"].map((tier) => [tier, document.querySelectorAll(`.v4-pcard[data-card-tier="${tier}"]`).length])),
      collapsed: [...document.querySelectorAll(".v4-catalog__group")].every((group) => !group.open),
      curated: document.querySelectorAll(".project-card[data-v4-card]").length,
      empty: [...document.querySelectorAll(".v4-pcard__summary, .v4-pcard__title, .v4-catalog__status, .v4-catalog__summary-note")].filter((node) => !node.textContent.trim()).length,
    }));
    check(`${locale}: Works shows ${catalog.identities.length} project cards and ${members.length - 2} collection cards behind ${facts.curated} curated cards, collapsed on load`, facts.projects === catalog.identities.length && facts.members === carded.length - catalog.identities.length && facts.unfinished === 2 && facts.collapsed && facts.curated === 10, JSON.stringify(facts));
    check(`${locale}: the tiers are ${JSON.stringify(tiers)} and no card part is empty`, JSON.stringify(facts.tiers) === JSON.stringify(tiers) && facts.empty === 0, JSON.stringify(facts.tiers));
    await openGroups(works, catalog.groups);
    check(`${locale}: Works has no horizontal overflow with every group open`, !(await works.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await works.close();

    const games = await open(browser, { path: localized(locale, "/games/"), settle: 500 });
    const gameFacts = await games.evaluate(() => ({
      playable: [...document.querySelectorAll(".game-card[data-card-playable]")].map((card) => card.querySelectorAll(".project-actions a").length),
      native: document.querySelectorAll("#native-archive .v4-pcard[data-catalog-id]").length,
      order: document.querySelector("#native-archive").compareDocumentPosition(document.querySelector(".games-featured")) & Node.DOCUMENT_POSITION_PRECEDING,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    check(`${locale}: Games shows four playable cards with Play + Case Study, then ${nativeCount} native archive cards`, gameFacts.playable.length === 4 && gameFacts.playable.every((count) => count === 2) && gameFacts.native === nativeCount && gameFacts.order && !gameFacts.overflow, JSON.stringify(gameFacts));
    await games.close();

    const request = await open(browser, { path: localized(locale, "/request/"), settle: 400 });
    const requestFacts = await request.evaluate(() => ({
      direct: [...document.querySelectorAll(".v4-request-direct__links a")].map((link) => link.getAttribute("href")),
      note: document.querySelector(".request-note").textContent.trim().length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      gap: document.querySelector(".request-layout").getBoundingClientRect().top - document.querySelector(".request-hero").getBoundingClientRect().bottom,
    }));
    check(`${locale}: Request offers direct contact beside the form, with no empty band above it`, requestFacts.direct.length === 2 && requestFacts.direct[0].startsWith("mailto:") && requestFacts.note > 40 && !requestFacts.overflow && requestFacts.gap < 60, JSON.stringify(requestFacts));
    await request.close();
  }

  // ---- desktop: the review stills and the behaviour of the cards ----
  const requests = [];
  const page = await open(browser, { requests });
  check("no catalog image is requested before its group is opened", !requests.some((url) => url.includes("/assets/catalog/")), String(requests.filter((url) => url.includes("/assets/catalog/")).length));
  await still(page, "01a-works-top.png", "01a · Works · top");
  await page.evaluate(async () => { const images = [...document.querySelectorAll(".project-card[data-v4-card] img")]; images.forEach((image) => { image.loading = "eager"; }); await Promise.all(images.map((image) => image.decode().catch(() => {}))); });
  await stillOf(page, ".project-card[data-v4-card]", "01b-works-curated-primary.png", "01b · Works · curated cards: SINAMA, a plate, Atölye Joyday");
  await page.evaluate(() => { document.querySelectorAll(".project-card[data-v4-card]")[3].scrollIntoView({ block: "start" }); window.scrollBy(0, -130); });
  await wait(350);
  await still(page, "01c-works-curated-supporting.png", "01c · Works · curated cards, supporting row");
  const curated = await page.evaluate((retired) => {
    const cards = [...document.querySelectorAll(".project-card[data-v4-card]")];
    return {
      count: cards.length,
      visuals: cards.map((card) => (card.querySelector(":scope > img") ? "image" : card.querySelector(":scope > .v4-curated-plate") ? "plate" : "none")),
      retired: cards.flatMap((card) => [...card.querySelectorAll("img")]).filter((image) => retired.includes(decodeURIComponent(image.currentSrc.split("/").pop()))).length,
      broken: cards.flatMap((card) => [...card.querySelectorAll("img")]).filter((image) => !image.naturalWidth).length,
    };
  }, [...catalog.cards.retiredCovers, ...catalog.cards.curatedOnly]);
  check("curated Works cards: ten cards, each with an authentic image or a plate, no retired cover", curated.count === 10 && !curated.visuals.includes("none") && curated.retired === 0 && curated.broken === 0, JSON.stringify(curated));
  await stillOf(page, "#catalog", "02a-catalog-collapsed.png", "02a · Complete catalog · four groups, collapsed");

  await page.evaluate(() => document.querySelector("#catalog-current > summary").scrollIntoView({ block: "center" }));
  await page.click("#catalog-current > summary");
  await openGroups(page, ["current"]);
  check("a click opens a group and reveals its card grid", await page.evaluate(() => document.querySelector("#catalog-current").open && document.querySelector("#catalog-current .v4-pcards").getBoundingClientRect().height > 400));
  await stillOf(page, "#catalog-current", "02b-current-work-open.png", "02b · Current work · lead card and flagship grid");
  await stillOf(page, '#catalog-current .v4-pcard[data-catalog-id="merge-rush"]', "02c-current-work-playables.png", "02c · Current work · the playable games", 120);

  for (const [group, file, label] of [["software", "03-software-data-mobile.png", "03 · Software, data & mobile · standard cards"], ["nativeGames", "04-native-game-archive.png", "04 · Native game archive · standard cards"], ["earlier", "05-earlier-learning.png", "05 · Earlier learning · compact cards and the unfinished note"]]) {
    await openGroups(page, [group]);
    await stillOf(page, `#catalog-${group}`, file, label);
  }
  await openGroups(page, catalog.groups);
  const media = await page.evaluate(() => [...document.querySelectorAll("#catalog .v4-pcard[data-card-tier]")].map((card) => {
    const image = card.querySelector("img");
    const box = card.getBoundingClientRect();
    return { id: card.dataset.catalogId || card.dataset.catalogMember, loaded: image ? image.complete && image.naturalWidth > 0 : Boolean(card.querySelector(".v4-pcard__media--plate")), served: image ? image.currentSrc.split("/").pop() : "", width: Math.round(box.width), height: Math.round(box.height) };
  }));
  check("every card shows its image or its identity plate", media.every((entry) => entry.loaded), media.filter((entry) => !entry.loaded).map((entry) => entry.id).join(" "));
  check("cards are served card-sized variants, never a full-size cover", media.every((entry) => !entry.served || /-(640|720|724|960)\.webp$/.test(entry.served)), [...new Set(media.map((entry) => entry.served))].slice(0, 4).join(" "));
  const catalogImages = requests.filter((url) => url.includes("/assets/catalog/"));
  check("no card image is requested twice", new Set(catalogImages).size === catalogImages.length, `${catalogImages.length} requests`);
  const rowHeights = await page.evaluate(() => [...document.querySelectorAll("#catalog .v4-pcards")].map((grid) => {
    const rows = new Map();
    for (const card of grid.children) { const box = card.getBoundingClientRect(); rows.set(Math.round(box.top), [...(rows.get(Math.round(box.top)) || []), Math.round(box.height)]); }
    return [...rows.values()].every((heights) => new Set(heights).size === 1);
  }));
  check("cards in one row share one height", rowHeights.every(Boolean));
  const dimmed = await page.evaluate(() => [...document.querySelectorAll("#catalog .v4-pcard")].filter((card) => Number(getComputedStyle(card).opacity) < 1 || getComputedStyle(card).filter !== "none").length);
  check("no archive or learning card is dimmed or desaturated", dimmed === 0, String(dimmed));

  /* A taller window, so a whole card fits under the header for its close-up. */
  await page.setViewport({ ...DESKTOP, height: 1500 });
  await wait(300);
  await closeUp(page, '.v4-pcard[data-catalog-id="sinama"]', "06-flagship-card.png", "06 · Flagship card (lead) · SINAMA");
  await closeUp(page, '.v4-pcard[data-catalog-id="agency-db"]', "07a-standard-card.png", "07a · Standard card · Agency DB");
  await closeUp(page, '.v4-pcard[data-catalog-id="my-museum"]', "07b-standard-card-plate.png", "07b · Standard card with identity plate · MyMuseum");
  await closeUp(page, '.v4-pcard[data-catalog-member="unity-essentials"]', "08a-archive-card.png", "08a · Compact card · Unity Essentials");
  await closeUp(page, ".v4-pcard--note", "08b-unfinished-note.png", "08b · The unfinished repositories · a note, not cards");

  await page.setViewport(DESKTOP);
  await wait(300);

  // whole-card click, and actions that stay their own targets
  const targets = await page.evaluate(() => {
    const card = document.querySelector('.v4-pcard[data-catalog-id="sinama"]');
    card.scrollIntoView({ block: "center" });
    const at = (node) => { const box = node.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); };
    return {
      body: at(card.querySelector(".v4-pcard__summary")).closest("a")?.getAttribute("href"),
      media: at(card.querySelector(".v4-pcard__media")).closest("a")?.getAttribute("href"),
      actions: [...card.querySelectorAll(".v4-pcard__actions a")].map((link) => at(link) === link),
      hrefs: [...card.querySelectorAll(".v4-pcard__actions a")].map((link) => link.getAttribute("href")),
    };
  });
  check("the whole card opens the project, and each action stays its own target", targets.body === "/sinama-case-study/" && targets.media === "/sinama-case-study/" && targets.actions.length === 3 && targets.actions.every(Boolean), JSON.stringify(targets));

  // keyboard
  await openGroups(page, []);
  await page.focus("#catalog-software > summary");
  await page.keyboard.press("Enter");
  await wait(200);
  await page.keyboard.press("Tab");
  const firstStop = await page.evaluate(() => ({ open: document.querySelector("#catalog-software").open, cls: document.activeElement.className, card: document.activeElement.closest(".v4-pcard")?.dataset.catalogId, outline: getComputedStyle(document.activeElement.closest(".v4-pcard") || document.body).outlineStyle }));
  await page.keyboard.press("Tab");
  const secondStop = await page.evaluate(() => ({ inActions: Boolean(document.activeElement.closest(".v4-pcard__actions")), outline: getComputedStyle(document.activeElement).outlineStyle }));
  check("keyboard: Enter opens a group, Tab lands on the first card's title with a visible ring, then on its actions", firstStop.open && firstStop.cls.includes("v4-catalog__title") && firstStop.card === "hospital-system" && firstStop.outline !== "none" && secondStop.inActions && secondStop.outline !== "none", JSON.stringify({ firstStop, secondStop }));

  // every link on a card resolves
  const internal = new Set();
  for (const entry of carded) {
    if (entry.detailSlug) internal.add(`/projects/${entry.detailSlug}/`);
    for (const target of Object.values(entry.links)) if (!/^https?:/.test(target)) internal.add(target);
  }
  const statuses = await Promise.all(LOCALES.flatMap((locale) => [...internal].map(async (path) => [localized(locale, path), (await fetch(`${ORIGIN}${localized(locale, path)}`)).status])));
  check(`every card destination resolves in five locales (${statuses.length})`, statuses.every(([, status]) => status === 200), statuses.filter(([, status]) => status !== 200).map(([path]) => path).join(" "));
  const retired = await Promise.all(LOCALES.flatMap((locale) => ["weather-app", "calculator-javascript"].map(async (slug) => (await fetch(`${ORIGIN}${localized(locale, `/projects/${slug}/`)}`)).status)));
  check("Weather App and Calculator JavaScript still have no page in any locale", retired.every((status) => status === 404), retired.join(" "));

  // the proof layer still follows the cards
  await page.evaluate(() => { document.querySelector("#catalog-relations").open = true; });
  check("relations and capability evidence remain, after the card groups", await page.evaluate(() => document.querySelectorAll("#catalog-relations li").length > 0 && document.querySelectorAll("#catalog-capabilities dt").length > 0 && Boolean(document.querySelector("#catalog-earlier").compareDocumentPosition(document.querySelector("#catalog-relations")) & Node.DOCUMENT_POSITION_FOLLOWING)));
  await page.close();

  // ---- System Map and Capability View are untouched ----
  const explorer = await open(browser, {});
  const nodes = await explorer.evaluate(() => [...document.querySelectorAll(".v4-eco__project")].map((node) => node.dataset.v4EcoNode));
  check("System Map and Capability View are still the ten curated projects", nodes.length === 10 && !nodes.some((id) => members.some((member) => member.id === id)), String(nodes.length));
  await explorer.close();

  // ---- Games ----
  const games = await open(browser, { path: "/games/" });
  await games.evaluate(async () => { const images = [...document.querySelectorAll(".games-grid img, #native-archive img")]; images.forEach((image) => { image.loading = "eager"; }); await Promise.all(images.map((image) => image.decode().catch(() => {}))); });
  await stillOf(games, ".games-grid", "09a-games-browser-playables.png", "09a · Games · four browser games, Play + Case Study", 110);
  await stillOf(games, "#native-archive", "09b-games-native-archive.png", "09b · Games · native archive as cards");
  check("Games: the native archive is always visible and shows its images", await games.evaluate(() => !document.querySelector("#native-archive details") && [...document.querySelectorAll("#native-archive img")].every((image) => image.naturalWidth > 0)));
  await games.close();

  // ---- seven viewports ----
  for (const [name, viewport, columns] of VIEWPORTS) {
    const view = await open(browser, { viewport, settle: 400 });
    await openGroups(view, catalog.groups);
    const layout = await view.evaluate((grids) => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      columns: Object.fromEntries(Object.entries(grids).map(([key, selector]) => [key, getComputedStyle(document.querySelector(selector)).gridTemplateColumns.split(" ").length])),
      narrow: Math.min(...[...document.querySelectorAll("#catalog .v4-pcard")].map((card) => card.getBoundingClientRect().width)),
      clipped: [...document.querySelectorAll("#catalog .v4-pcard__actions a, #catalog .v4-pcard__stack li, #catalog .v4-catalog__status")].filter((node) => node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > node.closest(".v4-pcard").getBoundingClientRect().right + 1).length,
      targets: Math.min(...[...document.querySelectorAll("#catalog .v4-pcard__actions a")].map((link) => link.getBoundingClientRect().height)),
    }), GRID_OF);
    check(`${name}: columns ${JSON.stringify(columns)}, no overflow, no clipped tag or action, cards ≥ 240px`, layout.overflow <= 0 && JSON.stringify(layout.columns) === JSON.stringify(columns) && layout.narrow >= 240 && layout.clipped === 0 && layout.targets >= 40, JSON.stringify(layout));
    await view.close();
  }

  // ---- phone and tablet stills ----
  const phone = await open(browser, { viewport: PHONE });
  await still(phone, "10-mobile-works-top.png", "10 · Phone · Works top");
  await openGroups(phone, ["software"]);
  await stillOf(phone, "#catalog", "11a-mobile-catalog.png", "11a · Phone · catalog, a group open", 70);
  await stillOf(phone, '.v4-pcard[data-catalog-id="agency-db"]', "11b-mobile-card.png", "11b · Phone · a standard card", 80);
  const launcher = await phone.evaluate(() => {
    const button = document.querySelector("[data-chatbot-toggle], .chatbot-toggle, .ajoop-launcher");
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { width: Math.round(box.width), right: Math.round(window.innerWidth - box.right), bottom: Math.round(window.innerHeight - box.bottom) };
  });
  check("phone: the floating assistant launcher stays a corner control, not a bar across the cards", !launcher || launcher.width <= 72, JSON.stringify(launcher));
  await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(300);
  await still(phone, "11c-mobile-footer-transition.png", "11c · Phone · catalog to footer");
  await phone.close();

  const tablet = await open(browser, { viewport: { width: 768, height: 1024, isMobile: true, hasTouch: true } });
  await openGroups(tablet, ["nativeGames"]);
  await stillOf(tablet, "#catalog-nativeGames", "12-tablet-native-archive.png", "12 · Tablet · native archive, two columns");
  await tablet.close();

  // ---- Request ----
  const request = await open(browser, { path: "/request/", expectFailure: true });
  await still(request, "13a-request-desktop.png", "13a · Request · desktop");
  await request.click("[data-request-submit]");
  await wait(200);
  check("Request: an empty form is stopped by the browser's own validation, on the first required field", await request.evaluate(() => !document.querySelector("[data-request-form]").checkValidity() && document.activeElement?.name === "name" && !document.querySelector("[data-request-status]").classList.contains("is-visible")));
  await request.type('input[name="name"]', "Review Visitor");
  await request.type('input[name="email"]', "visitor@example.com");
  await request.select('select[name="serviceType"]', "Other software request");
  await request.type('textarea[name="details"]', "A browser QA submission that never leaves this machine.");
  await request.click('input[name="consent"]');
  await wait(3200);
  await request.click("[data-request-submit]");
  await request.waitForFunction(() => document.querySelector("[data-request-status]").classList.contains("error"), { timeout: 15000 }).catch(() => {});
  const errorState = await request.evaluate(() => { const status = document.querySelector("[data-request-status]"); return { cls: status.className, live: status.getAttribute("aria-live"), mail: status.querySelector("a")?.getAttribute("href") || "", kept: document.querySelector('textarea[name="details"]').value.length > 0 }; });
  check("Request: a failed delivery says so, keeps what was typed and offers email", errorState.cls.includes("error") && errorState.live === "polite" && errorState.mail.startsWith("mailto:") && errorState.kept, JSON.stringify(errorState));
  await request.evaluate(() => document.querySelector("[data-request-status]").scrollIntoView({ block: "center" }));
  await wait(200);
  await still(request, "13b-request-error-state.png", "13b · Request · delivery failed (endpoint blocked by the test)");
  const tabOrder = await request.evaluate(() => [...document.querySelectorAll("[data-request-form] input:not([type=hidden]):not([tabindex='-1']), [data-request-form] select, [data-request-form] textarea, [data-request-form] button, [data-request-form] a")].map((node) => node.name || node.textContent.trim().slice(0, 12)));
  check("Request: the form's tab order runs top to bottom and ends on the actions", tabOrder[0] === "name" && tabOrder.indexOf("consent") < tabOrder.length - 3, tabOrder.join(" → "));
  await request.close();

  const requestPhone = await open(browser, { viewport: PHONE, path: "/tr/request/" });
  check("Request, phone, Turkish: no horizontal overflow and the direct links fit", await requestPhone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll(".v4-request-direct__links a")].every((link) => link.getBoundingClientRect().right <= window.innerWidth)));
  await still(requestPhone, "14a-request-mobile.png", "14a · Request · phone (tr)");
  await stillOf(requestPhone, ".v4-request-direct", "14b-request-mobile-direct.png", "14b · Request · phone · direct contact", 300);
  await requestPhone.close();

  const requestPlain = await open(browser, { noJs: true, path: "/request/" });
  check("Request without JavaScript: the form, email and online-form fallbacks and direct contact are all in the HTML", await requestPlain.evaluate(() => Boolean(document.querySelector("[data-request-form]")) && Boolean(document.querySelector('.request-form-actions a[href^="mailto:"]')) && Boolean(document.querySelector("[data-google-form-link]")) && document.querySelectorAll(".v4-request-direct__links a").length === 2));
  await requestPlain.close();

  // ---- Works ↔ Case Study ↔ Play ----
  const plateDetail = await open(browser, { path: "/projects/control-panel/" });
  await still(plateDetail, "15c-project-detail-plate.png", "15c · Project hero with no authentic image · identity plate");
  check("a project page without an authentic image shows a plate and no gallery", await plateDetail.evaluate(() => Boolean(document.querySelector(".v4-detail-plate")) && !document.querySelector(".detail-gallery") && !document.querySelector(".project-detail-visual img")));
  await plateDetail.close();
  const phoneDetail = await open(browser, { path: "/projects/my-museum/" });
  await still(phoneDetail, "15d-project-detail-screenshot.png", "15d · Project hero · MyMuseum's own login screen, shown whole");
  check("MyMuseum's hero is its repository screenshot, shown whole", await phoneDetail.evaluate(() => { const image = document.querySelector(".project-detail-visual img"); return image.naturalWidth === 1080 && getComputedStyle(image).objectFit === "contain"; }));
  await phoneDetail.close();
  const hospitalCase = await open(browser, { path: "/hospital-system-case-study/" });
  check("the Hospital case study's hero is the project's own screenshot", await hospitalCase.evaluate(() => [...document.querySelectorAll("main img")].every((image) => !image.currentSrc.includes("hospital_form_app_cover")) && [...document.querySelectorAll("main img")].some((image) => image.currentSrc.includes("hospital-system-patient-workflow"))));
  await still(hospitalCase, "15e-hospital-case-study-hero.png", "15e · Hospital case study · hero is the real application");
  await hospitalCase.close();
  const detail = await open(browser, { path: "/projects/agency-db/" });
  await still(detail, "15a-project-detail.png", "15a · Project detail · Agency DB with its ER diagram");
  check("a project detail page has a visual header, a real status and a way back to Works", await detail.evaluate(() => Boolean(document.querySelector(".project-detail-visual img")) && !/^repository$/i.test(document.querySelector(".project-status, [class*=status]")?.textContent.trim() || "") && Boolean(document.querySelector('main a[href="/works/"], header a[href="/works/"]'))));
  await detail.close();
  const caseStudy = await open(browser, { path: "/career-adventure-case-study/" });
  check("a browser game's case study links to its Play page", await caseStudy.evaluate(() => Boolean(document.querySelector('main a[href="/adventure/"]'))));
  await still(caseStudy, "15b-case-study-to-play.png", "15b · Case study with its Play link");
  await caseStudy.close();

  // ---- no JavaScript ----
  const plain = await open(browser, { noJs: true });
  const plainFacts = await plain.evaluate(() => ({ cards: document.querySelectorAll(".v4-pcard[data-card-tier]").length, images: [...document.querySelectorAll("#catalog img")].every((image) => image.getAttribute("src") && image.getAttribute("srcset")) }));
  await plain.evaluate(() => document.querySelector("#catalog-nativeGames > summary").scrollIntoView({ behavior: "instant", block: "center" }));
  await plain.click("#catalog-nativeGames > summary");
  await wait(600);
  check("no JavaScript: every card is in the HTML and a group still opens to its grid", plainFacts.cards === carded.length && plainFacts.images && await plain.evaluate(() => document.querySelector("#catalog-nativeGames").open && document.querySelector("#catalog-nativeGames .v4-pcards").getBoundingClientRect().height > 300));
  await plain.evaluate(() => { document.querySelector("#catalog-nativeGames").scrollIntoView({ behavior: "instant", block: "start" }); window.scrollBy({ top: -80, behavior: "instant" }); });
  await wait(500);
  await still(plain, "16-no-javascript-catalog.png", "16 · No JavaScript · groups open to card grids");
  await plain.close();

  // ---- reduced motion ----
  const calm = await open(browser, { reducedMotion: true });
  await openGroups(calm, ["software"]);
  await calm.hover('.v4-pcard[data-catalog-id="agency-db"]');
  await wait(200);
  check("reduced motion: cards neither animate nor move on hover", await calm.evaluate(() => { const card = document.querySelector('.v4-pcard[data-catalog-id="agency-db"]'); const style = getComputedStyle(card); return style.animationName === "none" && style.transform === "none" && style.transitionDuration.split(",").every((value) => parseFloat(value) <= 0.001); }), await calm.evaluate(() => { const style = getComputedStyle(document.querySelector('.v4-pcard[data-catalog-id="agency-db"]')); return [style.animationName, style.transform, style.transitionDuration].join(" | "); }));
  await calm.close();

  check("console and hydration are clean on every page opened", problems.length === 0, problems.slice(0, 4).join(" | "));

  await sheet(browser, "00-contact-sheet.png", "V4-E06.6 · Works presentation uplift + remaining surfaces",
    `Production build. ${catalog.identities.length} project cards and ${carded.length - catalog.identities.length} collection cards in three tiers (${JSON.stringify(tiers)}); the curated explorer above is unchanged.`,
    [...stills].sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true })), 4, 440);
} finally {
  await browser.close();
  server?.kill();
}

const failed = checks.filter((entry) => !entry.pass);
await writeFile(join(OUTPUT, "qa-summary.json"), `${JSON.stringify({ phase: "V4-E06.6", capturedAt: new Date().toISOString(), projectCards: catalog.identities.length, collectionCards: carded.length - catalog.identities.length, tiers, plates: carded.filter((entry) => entry.card.plate).map((entry) => entry.id), passed: checks.length - failed.length, failed: failed.length, checks, stills: stills.map((entry) => entry.file) }, null, 2)}\n`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed → ${OUTPUT}`);
process.exit(failed.length === 0 ? 0 : 1);
