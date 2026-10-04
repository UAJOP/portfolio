#!/usr/bin/env node
/* Master 3 #28 gate: Ajoop panel shell + Command Palette React ownership.
 *
 * The decisive check is an in-build differential. The same Ajoop engine and
 * the same command authority run on a legacy-owned route (classic DOM shell
 * and palette) and on React routes (React shell, transcript island, React
 * palette). Shell DOM, transcripts, action rows, palette results and command
 * analytics must be identical; any difference is a #28 presentation change.
 * The AI bridge endpoint is answered with a deterministic 503, so the gate
 * needs no network and always exercises the local fallback. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer, { PredefinedNetworkConditions } from "puppeteer";
import { ROOT } from "./i18n-catalog.mjs";
import { buildProductionSite } from "./build-production-site.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";
import { ajoopShellModel, commandPaletteModel } from "./m3-28-overlay-copy.mjs";

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(ROOT, process.argv[rootAt + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "m3-28-overlays-"));
const artifact = requestedRoot || path.join(temporary, "site");
if (!requestedRoot) await buildProductionSite({ outputDirectory: artifact });

const LOCALES = ["en", "tr", "de", "es", "fr"];
const prefix = (locale) => (locale === "en" ? "" : `/${locale}`);
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
let bundleDelayMs = 0;
let assistantDelayMs = 0;
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const file = path.resolve(artifact, relative || "index.html");
  if (!file.startsWith(`${path.resolve(artifact)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  const send = () => {
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  };
  if (bundleDelayMs && pathname.startsWith("/assets-react/")) setTimeout(send, bundleDelayMs);
  else if (assistantDelayMs && pathname === "/js/ajoop/assistant.js") setTimeout(send, assistantDelayMs);
  else send();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true });

let assertions = 0;
let controls = 0;
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- page helpers (run in the page) ---------- */

/** Canonical DOM: element tree with sorted attributes and class tokens,
 * whitespace-only text dropped. Classic and React markup differ only in
 * insignificant whitespace and attribute order. */
function canonicalTree(selector, { skip = [], ignore = [] } = {}) {
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? node.nodeValue : null;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const attributes = [...node.attributes]
      .filter(({ name }) => !ignore.some(([match, attribute]) => attribute === name && node.matches(match)))
      .map(({ name, value }) => [name, name === "class" ? value.split(/\s+/).sort().join(" ") : value])
      .sort(([a], [b]) => a.localeCompare(b));
    const children = skip.some((item) => node.matches(item)) ? ["<skipped>"] : [...node.childNodes].map(walk).filter((item) => item !== null);
    return { tag: node.tagName.toLowerCase(), attributes, children };
  };
  const element = document.querySelector(selector);
  return element ? walk(element) : null;
}

/* The one intended shell difference from the classic DOM: React marks the
 * closed panel hidden (it is display:none either way) so the SSR markup is
 * valid HTML. Asserted positively in section 2. */
const SHELL_IGNORED_ATTRIBUTES = [["[data-chatbot-panel]", "hidden"]];

const overlayState = () => ({
  ajoop: document.querySelector("[data-portfolio-chatbot]")?.classList.contains("is-open") || false,
  palette: document.querySelector("[data-command-palette]")?.classList.contains("is-open") || false,
  recruiter: document.body.classList.contains("recruiter-mode-active"),
  overlay: document.body.classList.contains("overlay-modal-open"),
  inert: [...document.body.children].filter((element) => element.inert).map((element) => element.id || element.tagName.toLowerCase()).sort(),
  focus: (() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "body";
    for (const hook of ["data-chatbot-input", "data-chatbot-panel", "data-chatbot-toggle", "data-command-input", "data-command-toggle", "data-recruiter-close", "data-recruiter-toggle"]) {
      if (active.hasAttribute(hook)) return `${active.closest("header") ? "header " : ""}${hook}`;
    }
    return active.tagName.toLowerCase();
  })(),
});

async function open(route, { viewport = { width: 1280, height: 860 }, waitForHydration = true, setup = null, edgeDelayMs = 0 } = {}) {
  const page = await browser.newPage();
  page.diagnostics = [];
  page.on("pageerror", (error) => page.diagnostics.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (!["error", "warn"].includes(message.type())) return;
    /* The stubbed AI edge is unreachable by design; only its own network
     * messages are expected. Everything else must stay silent. */
    const edge = "https://ajoop.kaanbalci.com/";
    if (message.text().includes(edge) || String(message.location()?.url || "").startsWith(edge)) return;
    page.diagnostics.push(`${message.type()}: ${message.text()}`);
  });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    /* The public AI edge: a deterministic, CORS-clean "unavailable". */
    if (request.url().startsWith("https://ajoop.kaanbalci.com/")) {
      const unavailable = () => request.respond({ status: 503, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" }, contentType: "application/json", body: "{}" }).catch(() => {});
      if (edgeDelayMs) setTimeout(unavailable, edgeDelayMs);
      else unavailable();
      return;
    }
    request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    Math.random = () => 0;
    window.__hydrationErrors = [];
    addEventListener("portfolio:react-main-hydration-error", (event) => window.__hydrationErrors.push(event.detail));
    addEventListener("portfolio:react-main-hydrated", () => { window.__mainHydrated = true; }, { once: true });
  });
  if (setup) await setup(page);
  await page.setViewport(viewport);
  const navigation = page.goto(`${base}${route}`, { waitUntil: "load", timeout: 60000 });
  page.navigation = navigation;
  if (waitForHydration) {
    await navigation;
    await hydrated(page);
  }
  return page;
}

async function hydrated(page) {
  await page.waitForFunction(() => {
    const ajoop = document.querySelector('[data-react-ajoop-shell="react"]');
    const command = document.querySelector('[data-react-command-owner="react"]');
    if (!ajoop) return document.readyState === "complete" && document.querySelector("[data-portfolio-chatbot]") && document.querySelector("[data-command-palette]");
    return window.__mainHydrated && ajoop.__portfolioReactAjoopReady && command.__portfolioReactCommandReady;
  }, { timeout: 30000 });
}

/* A turn is settled when the engine has nothing left to change, observed
 * rather than timed:
 *   - no pending turn bubble and the action row is no longer busy;
 *   - the AI bridge's health probe has reached its verdict. Opening the panel
 *     starts that probe, and a turn sent while it is still "checking" attempts
 *     a generation, fails against the stubbed edge and is marked
 *     data-ajoop-turn-status; a turn sent after the "unavailable" verdict is
 *     not. Clicking before the verdict made the transcript depend on timing;
 *   - the transcript and the action row are unchanged for three frames.
 * Nothing is removed from what is compared afterwards. */
const bridgeState = (page) => page.evaluate(() => (typeof getAjoopAiState === "function" ? getAjoopAiState().state : "absent"));
async function settleTurn(page) {
  await page.evaluate(() => { window.__ajoopSettle = { signature: null, frames: 0 }; });
  await page.waitForFunction(() => {
    const list = document.querySelector("[data-chatbot-messages]");
    const row = document.querySelector("[data-chatbot-quicks]");
    const bridge = typeof getAjoopAiState === "function" ? getAjoopAiState().state : "absent";
    const idle = list && !list.querySelector("[data-ajoop-turn='pending']")
      && !row?.classList.contains("is-busy") && row?.getAttribute("aria-busy") !== "true"
      && bridge !== "checking";
    const signature = idle ? `${list.innerHTML}
--actions--
${row ? row.outerHTML : ""}` : null;
    const state = window.__ajoopSettle;
    if (!idle || signature !== state.signature) { state.signature = signature; state.frames = 0; return false; }
    state.frames += 1;
    return state.frames >= 3;
  }, { timeout: 30000, polling: "raf" });
}

const transcript = (page) => page.evaluate(() => document.querySelector("[data-chatbot-messages]").innerHTML);
const actionRow = (page) => page.evaluate(canonicalTree, "[data-chatbot-quicks]");

async function conversation(page) {
  /* Starter, follow-up, typed question, depth and Start over: one of each turn
   * source the engine distinguishes. */
  const steps = [];
  await page.click("[data-chatbot-toggle]");
  await page.waitForFunction(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"));
  await settleTurn(page);
  steps.push({ step: "greeting", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page) });
  await page.click("[data-chatbot-quicks] .chatbot-actions-list button");
  await settleTurn(page);
  steps.push({ step: "starter", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page) });
  await page.click("[data-chatbot-quicks] .chatbot-actions-list button");
  await settleTurn(page);
  steps.push({ step: "follow-up", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page) });
  await page.type("[data-chatbot-input]", "Which projects show AI deployment and reliability?");
  await page.keyboard.press("Enter");
  await settleTurn(page);
  steps.push({ step: "typed", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page), input: await page.$eval("[data-chatbot-input]", (node) => node.value) });
  await page.type("[data-chatbot-input]", "tell me more");
  await page.keyboard.press("Enter");
  await settleTurn(page);
  steps.push({ step: "multi-turn", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page) });
  await page.click("[data-chatbot-quicks] .chatbot-actions-secondary button");
  await settleTurn(page);
  steps.push({ step: "start over", bridge: await bridgeState(page), transcript: await transcript(page), actions: await actionRow(page) });
  return steps;
}

async function paletteResults(page, queries) {
  const results = {};
  await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
  await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  for (const query of queries) {
    await page.$eval("[data-command-input]", (node) => { node.value = ""; });
    if (query) await page.type("[data-command-input]", query);
    else await page.$eval("[data-command-input]", (node) => node.dispatchEvent(new Event("input", { bubbles: true })));
    results[query] = await page.evaluate(canonicalTree, "[data-command-results]");
  }
  await page.keyboard.press("Escape");
  return results;
}

try {
  /* ---------- 1. SSR contract: every registered React document ---------- */
  const routes = productionReactRoutes();
  /* The expected count is derived from the canonical registries, not from the
   * route adapter under test. */
  const registryJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const siteRoutes = registryJson("data/site/routes.json");
  const expectedReactDocuments = (siteRoutes.pages.filter((page) => page.renderer === "react").length
    + (siteRoutes.projects.renderer === "react" ? Object.keys(registryJson("data/portfolio/project-details.json")).length : 0))
    * registryJson("data/i18n/locales.json").locales.filter((locale) => locale.active).length;
  check(routes.length, expectedReactDocuments, "#28 overlays cover exactly the React documents the route, locale and project registries define");
  check(new Set(routes.map((route) => route.output)).size, routes.length, "#28 React production documents are unique");
  const payloadKeys = { ajoop: ["copy", "language", "mascot"], command: ["copy", "language"] };
  for (const route of routes) {
    const html = fs.readFileSync(path.join(artifact, route.output), "utf8");
    for (const [pattern, count, what] of [
      [/data-react-ajoop-shell="react"/g, 1, "Ajoop shell owner"],
      [/data-react-command-owner="react"/g, 1, "Command Palette owner"],
      [/data-portfolio-chatbot=""/g, 1, "Ajoop panel"],
      [/data-command-palette=""/g, 1, "Command Palette"],
      [/data-chatbot-messages=""/g, 1, "transcript island"],
      [/id="react-ajoop-props"/g, 1, "Ajoop payload"],
      [/id="react-command-props"/g, 1, "Command Palette payload"],
    ]) check((html.match(pattern) || []).length, count, `${route.output}: one ${what}`);
    ok(/<div class="chatbot-messages" data-chatbot-messages="" aria-live="polite"><\/div>/.test(html), `${route.output}: the transcript island is SSR-empty`);
    ok(/<div class="command-results" data-command-results=""><\/div>/.test(html), `${route.output}: palette results are runtime data, absent from SSR`);
    const ajoopPayload = JSON.parse(html.match(/<script id="react-ajoop-props" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const commandPayload = JSON.parse(html.match(/<script id="react-command-props" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    /* #29 project/case-study routes, the #30 mini-game shells and the #30.5
     * Experience page have page asides of their own, so the Ajoop aside is
     * named there (Labs and the other #30.5 pages have none). */
    const labelsAjoopLandmark = /^(?:(?:tr|de|es|fr)\/)?(?:projects\/[^/]+|(?:sinama|merge-rush|ai-flow-puzzle|atolye-joyday|hospital-system)-case-study|adventure|joyday-paint|ai-flow-puzzle|blog)\/index\.html$/.test(route.output);
    const expectedAjoop = { ...ajoopShellModel(route.locale), ...(labelsAjoopLandmark ? { a: true } : {}) };
    check(Object.keys(ajoopPayload).sort(), Object.keys(expectedAjoop).sort(), `${route.output}: Ajoop payload carries chrome only`);
    check(Object.keys(commandPayload).sort(), payloadKeys.command, `${route.output}: palette payload carries chrome only`);
    check(ajoopPayload, expectedAjoop, `${route.output}: Ajoop payload is the canonical model`);
    check(commandPayload, commandPaletteModel(route.locale), `${route.output}: palette payload is the canonical model`);
    const serialized = JSON.stringify([ajoopPayload, commandPayload]);
    ok(!/token|secret|password|endpoint|ajoop\.kaanbalci|memory|owner|gmail|calendar|drive|oauth/i.test(serialized), `${route.output}: overlay payloads expose no private or bridge data`);
  }

  /* ---------- 2. Hydration and SSR = runtime copy, five locales ---------- */
  for (const locale of LOCALES) {
    for (const pageId of ["", "works/"]) {
      const route = `${prefix(locale)}/${pageId}`;
      const page = await open(route);
      const model = { ajoop: ajoopShellModel(locale), command: commandPaletteModel(locale) };
      const rendered = await page.evaluate(() => ({
        launcher: document.querySelector("[data-chatbot-launcher-text]").textContent,
        title: document.querySelector("[data-chatbot-title]").textContent,
        subtitle: document.querySelector("[data-chatbot-subtitle]").textContent,
        inputPlaceholder: document.querySelector("[data-chatbot-input]").placeholder,
        inputLabel: document.querySelector("[data-chatbot-input]").getAttribute("aria-label"),
        sendLabel: document.querySelector("[data-chatbot-send]").getAttribute("aria-label"),
        openLabel: document.querySelector("[data-chatbot-toggle]").getAttribute("aria-label"),
        closeLabel: document.querySelector("[data-chatbot-close]").getAttribute("aria-label"),
        mascot: document.querySelector("[data-ajoop-mascot]").getAttribute("aria-label"),
        mascotText: document.querySelector("[data-ajoop-mascot-label]").textContent,
        commandsTitle: document.querySelector("[data-command-title]").textContent,
        commandPlaceholder: document.querySelector("[data-command-input]").placeholder,
        commandDialogLabel: document.querySelector("[data-command-input]").getAttribute("aria-label"),
        hydrationErrors: window.__hydrationErrors,
        closedPanelHidden: document.querySelector("[data-chatbot-panel]").hidden,
        greeting: document.querySelectorAll("[data-chatbot-messages] .chatbot-message").length,
        starters: document.querySelectorAll("[data-chatbot-quicks] .chatbot-actions-list button").length,
      }));
      const { copy } = model.ajoop;
      /* After hydration the shell shows what the engine pushed; it must be the SSR copy. */
      check({
        launcher: rendered.launcher, title: rendered.title, subtitle: rendered.subtitle, inputPlaceholder: rendered.inputPlaceholder,
        inputLabel: rendered.inputLabel, sendLabel: rendered.sendLabel, openLabel: rendered.openLabel, closeLabel: rendered.closeLabel,
        mascot: rendered.mascot, mascotText: rendered.mascotText,
        commandsTitle: rendered.commandsTitle, commandPlaceholder: rendered.commandPlaceholder, commandDialogLabel: rendered.commandDialogLabel,
      }, {
        launcher: copy.launcher, title: copy.title, subtitle: copy.subtitle, inputPlaceholder: copy.inputPlaceholder,
        inputLabel: copy.inputPlaceholder, sendLabel: copy.sendLabel, openLabel: copy.openLabel, closeLabel: copy.closeLabel,
        mascot: model.ajoop.mascot.label, mascotText: model.ajoop.mascot.label,
        commandsTitle: model.command.copy.commandsTitle, commandPlaceholder: model.command.copy.commandPlaceholder, commandDialogLabel: model.command.copy.commandDialogLabel,
      }, `${route}: SSR copy equals the runtime copy React received`);
      check(rendered.hydrationErrors, [], `${route}: zero hydration errors`);
      check(rendered.closedPanelHidden, true, `${route}: the closed panel is hidden`);
      await page.click("[data-chatbot-toggle]");
      await page.waitForFunction(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"));
      check(await page.evaluate(() => [document.querySelector("[data-chatbot-panel]").hidden, document.querySelector("[data-chatbot-input]").getAttribute("autocomplete")]), [false, "off"], `${route}: the open panel is shown; the composer keeps autocomplete off`);
      await page.keyboard.press("Escape");
      check([rendered.greeting, rendered.starters], [1, 4], `${route}: engine greeting in the island, four starters in the React action row`);
      check(page.diagnostics, [], `${route}: no console errors or warnings`);
      await page.close();
    }
  }

  /* ---------- 3. Legacy vs React differential, five locales ---------- */
  const queries = ["", "a", "works", "cv", "recruiter", "zz-no-command"];
  const CLASSIC = "/404.html";
  /* The classic palette's ids per locale and query: the oracle for later checks. */
  const classicIds = {};
  const idsOf = (tree) => (tree?.children || []).filter((child) => child.tag === "button").map((child) => Object.fromEntries(child.attributes)["data-command-id"]);
  /* The classic reference is a document that is still legacy-owned: the 404
   * companion (#31), which loads the COMMON runtime and no page module. /now/
   * served this purpose until #30.5 migrated it. */
  for (const locale of LOCALES) {
    const legacy = await open(`${prefix(locale)}${CLASSIC}`);
    check(await legacy.evaluate(() => [document.querySelectorAll("[data-react-ajoop-shell], [data-react-command-owner]").length, document.querySelectorAll("[data-portfolio-chatbot]").length, document.querySelectorAll("[data-command-palette]").length]), [0, 1, 1], `${locale} ${CLASSIC}: legacy owners only (negative control)`);
    const legacyShell = await legacy.evaluate(canonicalTree, "[data-portfolio-chatbot]", { skip: ["[data-chatbot-messages]", "[data-chatbot-quicks]"], ignore: SHELL_IGNORED_ATTRIBUTES });
    const legacyPalette = await legacy.evaluate(canonicalTree, "[data-command-palette]", { skip: ["[data-command-results]"] });
    const legacyConversation = await conversation(legacy);
    await legacy.keyboard.press("Escape");
    const legacyResults = await paletteResults(legacy, queries);
    classicIds[locale] = Object.fromEntries(queries.map((query) => [query, idsOf(legacyResults[query])]));
    await legacy.close();
    for (const pageId of ["", "about/", "works/", "games/"]) {
      const route = `${prefix(locale)}/${pageId}`;
      const page = await open(route);
      check(await page.evaluate(canonicalTree, "[data-portfolio-chatbot]", { skip: ["[data-chatbot-messages]", "[data-chatbot-quicks]"], ignore: SHELL_IGNORED_ATTRIBUTES }), legacyShell, `${route}: Ajoop shell DOM equals the classic shell`);
      check(await page.evaluate(canonicalTree, "[data-command-palette]", { skip: ["[data-command-results]"] }), legacyPalette, `${route}: palette DOM equals the classic palette`);
      if (pageId === "" || pageId === "about/") {
        const steps = await conversation(page);
        for (const [index, step] of steps.entries()) {
          check(step, legacyConversation[index], `${route}: ${step.step} transcript and action row equal the classic renderer`);
        }
        await page.keyboard.press("Escape");
      }
      if (pageId !== "games/") {
        /* Games adds its own command (js/pages/games.js); other pages share the classic list. */
        check(await paletteResults(page, queries), legacyResults, `${route}: palette results equal the classic palette for every query`);
      }
      check(await page.evaluate(() => window.__hydrationErrors), [], `${route}: zero hydration errors`);
      await page.close();
    }
  }

  /* ---------- 3b. In-place locale change (the palette's language command) ---------- */
  const afterLanguageCommand = async (route) => {
    const page = await open(route);
    await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
    await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
    await page.type("[data-command-input]", "language");
    await page.waitForSelector("[data-command-id='language']");
    await page.click("[data-command-id='language']");
    await page.waitForFunction(() => document.documentElement.lang !== "en");
    await sleep(150);
    const state = {
      lang: await page.evaluate(() => document.documentElement.lang),
      shell: await page.evaluate(canonicalTree, "[data-portfolio-chatbot]", { skip: ["[data-chatbot-messages]", "[data-chatbot-quicks]"], ignore: SHELL_IGNORED_ATTRIBUTES }),
      actions: await actionRow(page),
      transcript: await transcript(page),
      palette: await page.evaluate(canonicalTree, "[data-command-palette]", { skip: ["[data-command-results]"] }),
      results: (await paletteResults(page, ["", "cv"])),
    };
    check(page.diagnostics, [], `${route}: in-place locale change emits no console errors or warnings`);
    await page.close();
    return state;
  };
  const classicSwitch = await afterLanguageCommand(CLASSIC);
  check(classicSwitch.lang !== "en", true, "the language command changes the locale in place");
  check(await afterLanguageCommand("/"), classicSwitch, "after an in-place locale change the React shell, transcript, action row and palette equal the classic ones");

  /* ---------- 4. Before hydration: immediate, then adopted exactly once ---------- */
  bundleDelayMs = 2500;
  for (const route of ["/", "/de/works/"]) {
    const page = await open(route, { waitForHydration: false });
    await page.waitForFunction(() => typeof setCommandPaletteOpen === "function" && document.querySelector('[data-react-ajoop-shell="react"]').__portfolioReactAjoopEntryCleanup, { timeout: 20000, polling: 25 });
    ok(!(await page.evaluate(() => Boolean(window.__mainHydrated))), `${route}: interactions start before hydration`);
    await page.click("[data-chatbot-toggle]");
    check(await page.evaluate(() => [document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"), document.querySelector("main").inert]), [true, true], `${route}: launcher opens the SSR shell before hydration`);
    await page.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
    await page.type("[data-chatbot-input]", "SINAMA");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length === 1);
    ok(!(await page.evaluate(() => Boolean(window.__mainHydrated))), `${route}: the pre-hydration turn ran before hydration`);
    await page.navigation;
    await hydrated(page);
    await settleTurn(page);
    const adopted = await page.evaluate(() => ({
      open: document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"),
      users: document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length,
      bots: document.querySelectorAll("[data-chatbot-messages] .chatbot-message.bot").length,
      followups: document.querySelector("[data-chatbot-quicks]").classList.contains("is-followups"),
      entryRemoved: !document.querySelector('[data-react-ajoop-shell="react"]').__portfolioReactAjoopEntryCleanup,
      errors: window.__hydrationErrors,
    }));
    /* Pre-existing engine initialization, identical on the accepted 0543fce
     * build: portfolio-v2.js syncAjoop() runs at DOMContentLoaded — which a
     * module bundle delays — and restarts the conversation with the greeting.
     * #28 changes presentation only, so React adopts exactly that outcome. */
    check(adopted, { open: true, users: 0, bots: 1, followups: false, entryRemoved: true, errors: [] }, `${route}: React adopted the open shell and the engine's post-init transcript and action row`);
    /* Exactly one owner now: one Enter = one echo; one click = one toggle. */
    await page.type("[data-chatbot-input]", "skills");
    await page.keyboard.press("Enter");
    await settleTurn(page);
    check(await page.evaluate(() => document.querySelectorAll("[data-chatbot-messages] .chatbot-message.user").length), 1, `${route}: one submit after hydration is one turn`);
    await page.click("[data-chatbot-toggle]");
    check(await page.evaluate(overlayState), { ajoop: false, palette: false, recruiter: false, overlay: false, inert: [], focus: "data-chatbot-toggle" }, `${route}: one launcher click after hydration toggles once`);
    await page.close();

    const palettePage = await open(route, { waitForHydration: false });
    await palettePage.waitForFunction(() => typeof setCommandPaletteOpen === "function" && document.querySelector('[data-react-command-owner="react"]').__portfolioReactCommandEntryCleanup, { timeout: 20000, polling: 25 });
    await palettePage.keyboard.down("Control"); await palettePage.keyboard.press("KeyK"); await palettePage.keyboard.up("Control");
    await palettePage.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
    check(await palettePage.evaluate(() => [document.querySelector("[data-command-palette]").classList.contains("is-open"), document.querySelectorAll("[data-command-results] [data-command-id]").length, Boolean(window.__mainHydrated)]), [true, 0, false], `${route}: Ctrl+K opens the SSR palette before hydration; results wait for runtime data`);
    await palettePage.type("[data-command-input]", "recruiter");
    await palettePage.navigation;
    await hydrated(palettePage);
    await sleep(50);
    const routeLocale = route === "/" ? "en" : route.split("/")[1];
    const hydratedIds = await palettePage.evaluate(() => [...document.querySelectorAll("[data-command-results] [data-command-id]")].map((node) => node.dataset.commandId));
    ok(hydratedIds.length > 0, `${route}: hydrated results exist for the pre-typed query`);
    /* Works adds no commands, so its list equals the classic list. */
    check(hydratedIds, classicIds[routeLocale].recruiter, `${route}: text typed before hydration filters the hydrated results exactly as the classic palette`);
    await palettePage.evaluate(() => {
      window.__remembered = 0;
      const original = window.rememberOverlayTrigger;
      window.rememberOverlayTrigger = (...args) => { window.__remembered += 1; return original(...args); };
    });
    await palettePage.keyboard.press("Escape");
    await palettePage.keyboard.down("Control"); await palettePage.keyboard.press("KeyK"); await palettePage.keyboard.up("Control");
    await sleep(80);
    check(await palettePage.evaluate(() => window.__remembered), 1, `${route}: one Ctrl+K after hydration opens the palette exactly once`);
    await palettePage.close();
  }
  bundleDelayMs = 0;

  /* ---------- 4b. Progressive launcher readiness ---------- */
  /* Every animation frame from document start: the launcher may be visible
   * only while a handler owns it (the classic entry, then React). */
  const watchReadiness = () => {
    window.__readiness = { violations: 0, visibleFrames: 0, firstVisible: null, opens: 0, revealedAt: null, hydratedAt: null };
    addEventListener("portfolio:react-main-hydrated", () => { window.__readiness.hydratedAt = performance.now(); }, { once: true });
    const tick = () => {
      const launcher = document.querySelector("[data-chatbot-toggle]");
      const owner = document.querySelector('[data-react-ajoop-shell="react"]');
      if (launcher && owner) {
        const box = launcher.getBoundingClientRect();
        const visible = box.width > 0 && box.height > 0 && getComputedStyle(launcher).visibility === "visible";
        const handled = Boolean(owner.__portfolioReactAjoopEntryCleanup || owner.__portfolioReactAjoopReady);
        if (visible) {
          window.__readiness.visibleFrames += 1;
          if (window.__readiness.firstVisible === null) window.__readiness.firstVisible = performance.now();
          if (!handled) window.__readiness.violations += 1;
        }
        if (!window.__readinessObserver) {
          window.__readinessObserver = new MutationObserver(() => {
            const open = owner.querySelector("[data-portfolio-chatbot]").classList.contains("is-open");
            if (open && !window.__readinessWasOpen) window.__readiness.opens += 1;
            window.__readinessWasOpen = open;
          });
          window.__readinessObserver.observe(owner, { subtree: true, attributes: true, attributeFilter: ["class"] });
          if (owner.hasAttribute("data-ajoop-interactive")) window.__readiness.revealedAt = performance.now();
          else new MutationObserver((records, observer) => {
            if (!owner.hasAttribute("data-ajoop-interactive")) return;
            window.__readiness.revealedAt = performance.now();
            observer.disconnect();
          }).observe(owner, { attributes: true, attributeFilter: ["data-ajoop-interactive"] });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  assistantDelayMs = 2500;
  for (const route of ["/", "/de/works/"]) {
    const page = await open(route, { waitForHydration: false, setup: (target) => target.evaluateOnNewDocument(watchReadiness) });
    await page.waitForFunction(() => document.querySelector('[data-react-ajoop-shell="react"] [data-chatbot-toggle]'), { polling: 25, timeout: 20000 });
    await sleep(800);
    const early = await page.evaluate(() => {
      const launcher = document.querySelector("[data-chatbot-toggle]");
      const box = launcher.getBoundingClientRect();
      return {
        runtime: typeof setChatbotOpen === "function",
        visibility: getComputedStyle(launcher).visibility,
        hit: Boolean(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-chatbot-toggle]")),
        focusable: (() => { launcher.focus(); return document.activeElement === launcher; })(),
        marker: document.querySelector('[data-react-ajoop-shell="react"]').hasAttribute("data-ajoop-interactive"),
      };
    });
    check(early, { runtime: false, visibility: "hidden", hit: false, focusable: false, marker: false }, `${route}: before its handler exists the SSR launcher is neither visible, hit-testable nor focusable`);
    await page.waitForFunction(() => document.querySelector('[data-react-ajoop-shell="react"]').hasAttribute("data-ajoop-interactive"), { polling: 20, timeout: 30000 });
    await page.evaluate(() => {
      window.__analyticsDuringOpen = [];
      const original = window.trackAnalyticsEvent;
      window.trackAnalyticsEvent = (...args) => { window.__analyticsDuringOpen.push(args[0]); return typeof original === "function" ? original(...args) : undefined; };
    });
    await page.click("[data-chatbot-toggle]");
    check(await page.evaluate(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open")), true, `${route}: once visible, the launcher opens the panel immediately`);
    await page.navigation;
    await hydrated(page);
    await sleep(200);
    const settled = await page.evaluate(() => ({
      readiness: { violations: window.__readiness.violations, opens: window.__readiness.opens },
      open: document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"),
      marker: document.querySelector('[data-react-ajoop-shell="react"]').hasAttribute("data-ajoop-interactive"),
      analytics: window.__analyticsDuringOpen,
      hydrationErrors: window.__hydrationErrors,
    }));
    ok(await page.evaluate(() => window.__readiness.revealedAt !== null && window.__readiness.hydratedAt !== null && window.__readiness.revealedAt <= window.__readiness.hydratedAt), `${route}: the classic entry reveals the launcher, without waiting for hydration`);
    check(settled, { readiness: { violations: 0, opens: 1 }, open: true, marker: true, analytics: [], hydrationErrors: [] }, `${route}: no visible handler-less frame, exactly one open transition and no Ajoop analytics event (as on legacy routes) across takeover`);
    await page.close();
  }
  assistantDelayMs = 0;

  /* Same contract with no artificial delay: Fast 3G and 4x CPU. Third-party
   * fonts and icons are answered locally so they do not decide the timing. */
  {
    const page = await browser.newPage();
    await page.emulateNetworkConditions(PredefinedNetworkConditions["Fast 3G"]);
    await page.emulateCPUThrottling(4);
    await page.setRequestInterception(true);
    page.on("request", (request) => (/^https?:\/\/(?!127\.0\.0\.1)/.test(request.url()) ? request.respond({ status: 204, body: "" }) : request.continue()));
    await page.evaluateOnNewDocument(watchReadiness);
    await page.evaluateOnNewDocument(() => addEventListener("portfolio:react-main-hydrated", () => { window.__mainHydrated = true; }, { once: true }));
    await page.goto(`${base}/`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__mainHydrated, { timeout: 60000 });
    await page.click("[data-chatbot-toggle]");
    await sleep(300);
    check(await page.evaluate(() => ({ violations: window.__readiness.violations, visible: window.__readiness.visibleFrames > 0, opens: window.__readiness.opens })), { violations: 0, visible: true, opens: 1 }, "Fast 3G + 4x CPU: the launcher is never visible without a handler and opens once");
    await page.close();
  }

  const legacyLauncher = await open(CLASSIC);
  check(await legacyLauncher.evaluate(() => {
    const launcher = document.querySelector("[data-chatbot-toggle]");
    return { owner: document.querySelectorAll("[data-react-ajoop-shell]").length, marker: document.querySelectorAll("[data-ajoop-interactive]").length, visibility: getComputedStyle(launcher).visibility };
  }), { owner: 0, marker: 0, visibility: "visible" }, "legacy 404 companion: the classic launcher is unchanged (negative control)");
  await legacyLauncher.close();

  /* ---------- 5. Overlay transitions, focus, inert, Escape, backdrop ---------- */
  const desktop = await open("/about/");
  const executeCommand = async (page, id) => {
    await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
    await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
    await page.type("[data-command-input]", id);
    await page.waitForSelector(`[data-command-id='${id}']`);
    await page.click(`[data-command-id='${id}']`);
  };
  await desktop.click("[data-chatbot-toggle]");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  check(await desktop.evaluate(overlayState), { ajoop: true, palette: false, recruiter: false, overlay: true, inert: ["a", "button", "footer", "header", "main-content", "react-command-root", "react-recruiter-root"], focus: "data-chatbot-input" }, "Ajoop open: background inert, composer focused");
  await desktop.keyboard.down("Control"); await desktop.keyboard.press("KeyK"); await desktop.keyboard.up("Control");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  check(await desktop.evaluate(overlayState), { ajoop: false, palette: true, recruiter: false, overlay: true, inert: ["a", "button", "footer", "header", "main-content", "react-ajoop-root", "react-recruiter-root"], focus: "data-command-input" }, "Ajoop → Command Palette leaves one overlay owner");
  await desktop.type("[data-command-input]", "ajoop");
  await desktop.click("[data-command-id='ajoop']");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  check(await desktop.evaluate(overlayState), { ajoop: true, palette: false, recruiter: false, overlay: true, inert: ["a", "button", "footer", "header", "main-content", "react-command-root", "react-recruiter-root"], focus: "data-chatbot-input" }, "Command Palette → Ajoop command leaves one overlay owner");
  await executeCommand(desktop, "recruiter");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  check(await desktop.evaluate(overlayState), { ajoop: false, palette: false, recruiter: true, overlay: true, inert: ["a", "button", "footer", "header", "main-content", "react-ajoop-root", "react-command-root"], focus: "data-recruiter-close" }, "Ajoop → Command Palette → Recruiter Mode leaves one overlay owner");
  await desktop.evaluate(() => setChatbotOpen(true, { trigger: document.querySelector("[data-chatbot-toggle]") }));
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  check(await desktop.evaluate(overlayState), { ajoop: true, palette: false, recruiter: false, overlay: true, inert: ["a", "button", "footer", "header", "main-content", "react-command-root", "react-recruiter-root"], focus: "data-chatbot-input" }, "Recruiter Mode → Ajoop leaves one overlay owner");
  await desktop.keyboard.press("Escape");
  check(await desktop.evaluate(overlayState), { ajoop: false, palette: false, recruiter: false, overlay: false, inert: [], focus: "data-chatbot-toggle" }, "Escape closes Ajoop and restores its launcher");
  await desktop.click("header [data-command-toggle]");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  await desktop.mouse.click(8, 8);
  await sleep(80);
  check(await desktop.evaluate(overlayState), { ajoop: false, palette: false, recruiter: false, overlay: false, inert: [], focus: "header data-command-toggle" }, "the palette backdrop closes it and restores the header toggle");
  check(await desktop.evaluate(() => [...document.querySelectorAll("[data-command-toggle]")].map((node) => [node.getAttribute("aria-controls"), node.getAttribute("aria-expanded")])), [["command-palette", "false"]], "palette toggles carry their dialog relationship");
  await desktop.click("[data-chatbot-toggle]");
  await desktop.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input]"));
  const trapped = [];
  for (let index = 0; index < 12; index += 1) {
    await desktop.keyboard.press("Tab");
    trapped.push(await desktop.evaluate(() => Boolean(document.activeElement?.closest("[data-chatbot-panel]"))));
  }
  check(trapped.every(Boolean), true, "Tab stays inside the open Ajoop panel");
  await desktop.keyboard.press("Escape");
  check(desktop.diagnostics, [], "overlay transitions emit no console errors or warnings");
  await desktop.close();

  const touch = await open("/", { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await touch.tap("[data-chatbot-toggle]");
  await touch.waitForFunction(() => document.activeElement?.matches("[data-chatbot-panel]"));
  check(await touch.evaluate(() => document.activeElement.matches("[data-chatbot-panel]")), true, "touch-first: the dialog, not the composer, takes focus");
  await touch.keyboard.press("Tab");
  check(await touch.evaluate(() => Boolean(document.activeElement?.closest("[data-chatbot-panel]")) && !document.activeElement.matches("[data-chatbot-panel]")), true, "touch-first: Tab from the dialog reaches its first control");
  await touch.close();

  /* ---------- 6. Command analytics: React route = classic route ---------- */
  const commandAnalytics = async (route, ids) => {
    const result = {};
    for (const id of ids) {
      const page = await open(route, {
        setup: (target) => target.evaluateOnNewDocument(() => {
          window.__calls = [];
          window.open = (...args) => { window.__calls.push(["window.open", ...args]); return null; };
          addEventListener("DOMContentLoaded", () => {
            for (const name of ["trackAnalyticsEvent", "trackAnalyticsNavigation"]) {
              const original = window[name];
              window[name] = (...args) => { window.__calls.push([name, ...args]); return typeof original === "function" ? original(...args) : undefined; };
            }
          });
        }),
      });
      page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame() && page.armed) page.navigated = new URL(request.url()).pathname; });
      page.armed = true;
      await page.keyboard.down("Control"); await page.keyboard.press("KeyK"); await page.keyboard.up("Control");
      await page.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
      await page.type("[data-command-input]", id);
      await page.waitForSelector(`[data-command-id='${id}']`);
      const calls = await page.evaluate((commandId) => {
        window.__calls.length = 0;
        document.querySelector(`[data-command-id='${commandId}']`).click();
        return window.__calls.map((call) => call.map((value) => (typeof value === "object" ? JSON.stringify(value) : value)));
      }, id);
      await sleep(150);
      result[id] = { calls, navigated: page.navigated || null };
      await page.close().catch(() => {});
    }
    return result;
  };
  const analyticsIds = ["works", "cv", "linkedin"];
  check(await commandAnalytics("/de/", analyticsIds), await commandAnalytics(`/de${CLASSIC}`, analyticsIds), "palette command analytics and destinations equal the classic palette");

  /* ---------- 7. Internal navigation keeps one owner per page ---------- */
  const navigationPage = await open("/");
  await Promise.all([navigationPage.waitForNavigation({ waitUntil: "load" }), navigationPage.click("header nav a[href='/works/']")]);
  await hydrated(navigationPage);
  check(await navigationPage.evaluate(() => [document.querySelectorAll("[data-portfolio-chatbot]").length, document.querySelectorAll("[data-command-palette]").length, window.__hydrationErrors.length]), [1, 1, 0], "after internal navigation the next page has one shell and one palette");
  await navigationPage.close();

  /* ---------- 8. Negative controls: each comparator must catch a regression ---------- */
  const controlPage = await open("/");
  const pristineShell = await controlPage.evaluate(canonicalTree, "[data-portfolio-chatbot]", { skip: ["[data-chatbot-messages]", "[data-chatbot-quicks]"], ignore: SHELL_IGNORED_ATTRIBUTES });
  await controlPage.evaluate(() => document.querySelector("[data-chatbot-send]").setAttribute("aria-label", "Changed"));
  const changedShell = await controlPage.evaluate(canonicalTree, "[data-portfolio-chatbot]", { skip: ["[data-chatbot-messages]", "[data-chatbot-quicks]"], ignore: SHELL_IGNORED_ATTRIBUTES });
  assert.throws(() => assert.deepEqual(changedShell, pristineShell), assert.AssertionError, "shell DOM comparator control did not fail");
  controls += 1;
  const pristineResults = await paletteResults(controlPage, ["works"]);
  await controlPage.evaluate(() => {
    const original = window.getUltimateContent;
    window.getUltimateContent = (...args) => { const content = original(...args); return { ...content, commands: content.commands.filter((command) => command.id !== "works") }; };
  });
  const changedResults = await paletteResults(controlPage, ["works"]);
  assert.throws(() => assert.deepEqual(changedResults, pristineResults), assert.AssertionError, "palette results comparator control did not fail");
  controls += 1;
  await controlPage.click("[data-chatbot-toggle]");
  await controlPage.waitForFunction(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"));
  await settleTurn(controlPage);
  const before = await transcript(controlPage);
  await controlPage.evaluate(() => { document.querySelector("[data-chatbot-messages] .chatbot-message-text").textContent += " (changed)"; });
  const changedTranscript = await transcript(controlPage);
  assert.throws(() => assert.equal(changedTranscript, before), assert.AssertionError, "transcript comparator control did not fail");
  controls += 1;
  /* A changed action is rejected by the action-row comparison. */
  const pristineActions = await actionRow(controlPage);
  await controlPage.evaluate(() => { document.querySelector("[data-chatbot-quicks] .chatbot-actions-list button").textContent += " (changed)"; });
  const changedActions = await actionRow(controlPage);
  assert.throws(() => assert.deepEqual(changedActions, pristineActions), assert.AssertionError, "action-row comparator control did not fail");
  controls += 1;
  /* The turn-status marker stays part of the comparison. A starter clicked
   * while the bridge probe is still in flight attempts a generation that fails,
   * and its bubble says so; the same starter after the verdict does not. The
   * transcript comparison must tell the two apart. */
  const settledPage = await open("/");
  await settledPage.click("[data-chatbot-toggle]");
  await settledPage.waitForFunction(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"));
  await settleTurn(settledPage);
  assert.equal(await bridgeState(settledPage), "unavailable", "a settled panel has the bridge verdict");
  await settledPage.click("[data-chatbot-quicks] .chatbot-actions-list button");
  await settleTurn(settledPage);
  const settledStarter = await transcript(settledPage);
  await settledPage.close();
  assert.doesNotMatch(settledStarter, /data-ajoop-turn-status/, "a turn after the bridge verdict carries no status marker");
  const racing = await open("/", { edgeDelayMs: 1200 });
  await racing.click("[data-chatbot-toggle]");
  await racing.waitForFunction(() => document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open") && document.querySelector("[data-chatbot-quicks] .chatbot-actions-list button"));
  assert.equal(await bridgeState(racing), "checking", "the delayed edge keeps the bridge probe in flight");
  await racing.click("[data-chatbot-quicks] .chatbot-actions-list button");
  await settleTurn(racing);
  const racedStarter = await transcript(racing);
  assert.match(racedStarter, /data-ajoop-turn-status="/, "a turn sent before the bridge verdict is marked");
  assert.throws(() => assert.equal(racedStarter, settledStarter), assert.AssertionError, "turn-status comparator control did not fail");
  controls += 1;
  await racing.close();
  await controlPage.keyboard.press("Escape");
  /* A second, classic-style launcher listener would toggle twice per click. */
  await controlPage.evaluate(() => document.querySelector("[data-chatbot-toggle]").addEventListener("click", () => setChatbotOpen(!document.querySelector("[data-portfolio-chatbot]").classList.contains("is-open"))));
  await controlPage.click("[data-chatbot-toggle]");
  await sleep(120);
  const duplicated = await controlPage.evaluate(overlayState);
  assert.throws(() => assert.equal(duplicated.ajoop, true), assert.AssertionError, "duplicate launcher owner control did not fail");
  controls += 1;
  await controlPage.close();

  console.log(`Master 3 #28 Ajoop + Command Palette passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · ${routes.length} React documents · 5 locales · legacy/React differential (shell, transcripts, action rows, palette results, analytics) · pre-hydration adoption · overlay transitions/focus/inert · touch-first · ${controls} negative controls · AI edge stubbed, no network.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
