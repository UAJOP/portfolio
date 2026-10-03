#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { buildProductionSite } from "./build-production-site.mjs";
import { productionDocumentProps } from "./home-about-react.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootIndex = process.argv.indexOf("--root");
const requestedRoot = rootIndex >= 0 ? path.resolve(ROOT, process.argv[rootIndex + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "m3-27-recruiter-"));
const artifact = requestedRoot || path.join(temporary, "site");
if (!requestedRoot) await buildProductionSite({ outputDirectory: artifact });

const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const file = path.resolve(artifact, relative || "index.html");
  if (!file.startsWith(`${path.resolve(artifact)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("not found"); return;
  }
  response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true });

let assertions = 0;
const count = (text, pattern) => (text.match(pattern) || []).length;
const artifactPathFor = (href) => `${href.replace(/^\//, "")}index.html`;
const localePrefix = (locale) => locale === "en" ? "" : `/${locale}`;
const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

async function recruiterSnapshot(page) {
  return page.$eval("[data-recruiter-drawer]", (drawer) => {
    const text = (selector) => drawer.querySelector(selector)?.textContent.replace(/\s+/g, " ").trim() || "";
    return {
      close: drawer.querySelector("[data-recruiter-close]")?.getAttribute("aria-label"),
      label: text(".eyebrow"),
      title: text("#recruiter-dialog-title"),
      lead: text("#recruiter-dialog-description"),
      status: text(".recruiter-status"),
      dataNote: text(".recruiter-data-note"),
      headings: [...drawer.querySelectorAll("h3")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
      roles: [...drawer.querySelectorAll("[data-recruiter-role]")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
      primary: text(".recruiter-primary-profile:not(.recruiter-focus-title)"),
      focus: text(".recruiter-focus-title"),
      capabilities: [...drawer.querySelectorAll(".mini-stack span")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
      skills: [...drawer.querySelectorAll(".recruiter-capability-list li")].map((node) => node.textContent.replace(/\s+/g, " ").trim()),
      evidence: [...drawer.querySelectorAll(".recruiter-links a")].map((node) => ({
        title: node.querySelector("strong")?.textContent.replace(/\s+/g, " ").trim(),
        summary: node.querySelector("small")?.textContent.replace(/\s+/g, " ").trim(),
        action: node.querySelector("span")?.textContent.replace(/\s+/g, " ").trim(),
        href: node.getAttribute("href"),
      })),
      actions: [...drawer.querySelectorAll(".recruiter-actions a")].map((node) => ({
        text: node.textContent.replace(/\s+/g, " ").trim(),
        href: node.getAttribute("href"),
      })),
    };
  });
}

try {
  const routes = productionReactRoutes();
  const acceptedDynamic = Object.fromEntries(["en", "tr", "de", "es", "fr"].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(ROOT, locale === "en" ? "data/i18n/source/dynamic.json" : `data/i18n/packs/${locale}/dynamic.json`), "utf8")).recruiterV2,
  ]));
  const canonicalProjects = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/projects.json"), "utf8"));
  const canonicalProjectDetails = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/project-details.json"), "utf8"));
  /* The expected count is derived from the canonical registries, not from the
   * route adapter under test. */
  const siteRoutes = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/routes.json"), "utf8"));
  const activeLocales = JSON.parse(fs.readFileSync(path.join(ROOT, "data/i18n/locales.json"), "utf8")).locales.filter((locale) => locale.active);
  const expectedReactDocuments = (siteRoutes.pages.filter((page) => page.renderer === "react").length
    + (siteRoutes.projects.renderer === "react" ? Object.keys(canonicalProjectDetails).length : 0)) * activeLocales.length;
  assert.equal(routes.length, expectedReactDocuments, "React document count must equal the route, locale and project registries"); assertions += 1;
  assert.equal(new Set(routes.map((route) => route.output)).size, routes.length, "registered React documents must be unique"); assertions += 1;
  for (const route of routes) {
    const html = fs.readFileSync(path.join(artifact, route.output), "utf8");
    assert.equal(count(html, /data-react-recruiter-owner="react"/g), 1, `${route.output}: one React recruiter owner`);
    assert.equal(count(html, /data-recruiter-drawer=""/g), 1, `${route.output}: one recruiter dialog`);
    assert.equal(count(html, /id="react-recruiter-props"/g), 1, `${route.output}: one recruiter payload`);
    assertions += 3;
    const props = productionDocumentProps(route, "assets-react/test.js").recruiter;
    assert.deepEqual(props.copy, acceptedDynamic[route.locale], `${route.output}: accepted Recruiter V2 copy authority`); assertions += 1;
    assert.deepEqual(Object.keys(props.profiles), ["applied-ai", "solution-engineering", "software", "game"]); assertions += 1;
    for (const [role, profile] of Object.entries(props.profiles)) {
      assert.ok(profile.label && profile.focusTitle && profile.skills.length === 5, `${route.output}/${role}: localized profile copy`);
      assert.ok(profile.evidence.length >= 2, `${route.output}/${role}: canonical evidence`);
      assertions += 2;
      for (const evidence of profile.evidence) {
        const project = canonicalProjects[evidence.id];
        const acceptedTitle = project.name || canonicalProjectDetails[project.detailSlug].title.en;
        assert.equal(evidence.title, acceptedTitle, `${route.output}/${role}/${evidence.id}: accepted project naming contract`);
        assert.ok(fs.existsSync(path.join(artifact, artifactPathFor(evidence.href))), `${route.output}/${role}/${evidence.id}: ${evidence.href} resolves`);
        assertions += 2;
      }
    }
  }

  const buildLog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/build-log.json"), "utf8"));
  const home = fs.readFileSync(path.join(artifact, "index.html"), "utf8");
  assert.equal(count(home, /class="build-log-item"/g), 3, "homepage SSR keeps the accepted Build Log limit");
  for (const entry of buildLog.slice(0, 3)) {
    assert.ok(home.includes(`<time datetime="${entry.date}">${entry.date}</time>`), `${entry.id}: canonical Build Log date is present without JavaScript`);
    assert.ok(home.includes(entry.title.en) && home.includes(entry.detail.en), `${entry.id}: canonical Build Log copy is present without JavaScript`);
    assertions += 2;
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/routes.json"), "utf8")).pages.find((page) => page.id === "now").renderer, "legacy", "/now/ remains explicitly legacy-owned");
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/routes.json"), "utf8")).pages.find((page) => page.id === "blog").renderer, "legacy", "/blog/ remains explicitly legacy-owned");
  assertions += 3;

  const localeRoles = { en: "applied-ai", tr: "solution-engineering", de: "software", es: "game", fr: "applied-ai" };
  for (const [locale, role] of Object.entries(localeRoles)) {
    const page = await browser.newPage();
    const diagnostics = [];
    page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
    const prefix = locale === "en" ? "" : `/${locale}`;
    const response = await page.goto(`http://127.0.0.1:${port}${prefix}/?role=${role}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden") === "false");
    const expected = productionDocumentProps(routes.find((item) => item.locale === locale && item.routeId === "home"), "assets-react/test.js").recruiter;
    const state = await page.evaluate(() => ({
      owners: document.querySelectorAll("[data-react-recruiter-owner='react']").length,
      dialogs: document.querySelectorAll("[data-recruiter-drawer]").length,
      owner: document.querySelector("[data-recruiter-drawer]")?.dataset.recruiterStateOwner,
      activeRole: document.querySelector("[data-recruiter-role][aria-pressed='true']")?.dataset.recruiterRole,
      labels: [...document.querySelectorAll("[data-recruiter-role]")].map((node) => node.textContent),
      evidence: [...document.querySelectorAll("[data-recruiter-evidence]")].map((node) => ({ id: node.dataset.recruiterEvidence, href: node.getAttribute("href") })),
    }));
    assert.equal(response.status(), 200); assert.deepEqual(diagnostics, []); assertions += 2;
    assert.deepEqual([state.owners, state.dialogs, state.owner, state.activeRole], [1, 1, "react", role]); assertions += 4;
    assert.deepEqual(state.labels, Object.values(expected.profiles).map((item) => item.label)); assertions += 1;
    assert.deepEqual(state.evidence, expected.profiles[role].evidence.map(({ id, href }) => ({ id, href }))); assertions += 1;
    await page.close();
  }

  for (const locale of ["en", "tr", "de", "es", "fr"]) {
    for (const role of ["applied-ai", "solution-engineering", "software", "game"]) {
      const prefix = localePrefix(locale);
      const reactPage = await browser.newPage();
      await reactPage.goto(`http://127.0.0.1:${port}${prefix}/?role=${role}`, { waitUntil: "networkidle0" });
      await reactPage.waitForFunction(() => document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden") === "false");
      const reactSnapshot = await recruiterSnapshot(reactPage);
      await reactPage.close();
      const legacyPage = await browser.newPage();
      await legacyPage.goto(`http://127.0.0.1:${port}${prefix}/now/?role=${role}`, { waitUntil: "networkidle0" });
      await legacyPage.waitForFunction(() => document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden") === "false");
      const legacySnapshot = await recruiterSnapshot(legacyPage);
      await legacyPage.close();
      assert.deepEqual(reactSnapshot, legacySnapshot, `${locale}/${role}: React and accepted legacy Recruiter V2 output match`);
      assert.equal(normalizeText(reactSnapshot.title), acceptedDynamic[locale].title, `${locale}/${role}: accepted title remains exact`);
      assertions += 2;
    }
  }

  const delayedToggleCases = [
    { route: "/", selector: "header [data-recruiter-toggle]", label: "home header" },
    { route: "/", selector: "main [data-recruiter-toggle]", label: "home hero" },
    { route: "/de/works/", selector: "header [data-recruiter-toggle]", label: "DE Works header" },
  ];
  for (const testCase of delayedToggleCases) {
    const delayedPage = await browser.newPage();
    const delayedDiagnostics = [];
    delayedPage.on("console", (message) => { if (["error", "warn"].includes(message.type())) delayedDiagnostics.push(`${message.type()}: ${message.text()}`); });
    delayedPage.on("pageerror", (error) => delayedDiagnostics.push(`pageerror: ${error.message}`));
    await delayedPage.setRequestInterception(true);
    delayedPage.on("request", (request) => {
      if (/\/assets-react\/production-main-[^/]+\.js$/.test(new URL(request.url()).pathname)) {
        setTimeout(() => request.continue().catch(() => {}), 3000);
      } else request.continue().catch(() => {});
    });
    const navigation = delayedPage.goto(`http://127.0.0.1:${port}${testCase.route}`, { waitUntil: "networkidle0" });
    await delayedPage.waitForSelector(testCase.selector);
    await delayedPage.waitForFunction(() => typeof window.setRecruiterMode === "function" && typeof window.trackAnalyticsEvent === "function");
    await delayedPage.evaluate(() => {
      window.__recruiterAnalytics = [];
      const original = window.trackAnalyticsEvent;
      window.trackAnalyticsEvent = (name, properties) => {
        window.__recruiterAnalytics.push({ name, properties });
        return original?.(name, properties);
      };
    });
    assert.equal(await delayedPage.evaluate(() => Boolean(document.querySelector("[data-react-recruiter-owner]")?.__portfolioReactRecruiterReady)), false, `${testCase.label}: click occurs before hydration`); assertions += 1;
    await delayedPage.click(testCase.selector);
    await delayedPage.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
    assert.deepEqual(await delayedPage.evaluate(() => ({
      open: !document.querySelector("[data-recruiter-drawer]").hidden,
      active: document.body.classList.contains("recruiter-mode-active"),
      dialogs: document.querySelectorAll("[data-recruiter-drawer]").length,
      analytics: window.__recruiterAnalytics.filter((item) => item.name === "recruiter_mode_open").length,
    })), { open: true, active: true, dialogs: 1, analytics: 1 }, `${testCase.label}: SSR dialog responds immediately exactly once`); assertions += 1;
    await navigation;
    await delayedPage.waitForFunction(() => document.querySelector("[data-react-recruiter-owner]")?.__portfolioReactRecruiterReady === true);
    assert.deepEqual(await delayedPage.evaluate(() => ({
      open: !document.querySelector("[data-recruiter-drawer]").hidden,
      dialogs: document.querySelectorAll("[data-recruiter-drawer]").length,
      analytics: window.__recruiterAnalytics.filter((item) => item.name === "recruiter_mode_open").length,
    })), { open: true, dialogs: 1, analytics: 1 }, `${testCase.label}: hydration adopts state without replay`); assertions += 1;
    await delayedPage.keyboard.press("Escape");
    assert.equal(await delayedPage.evaluate((selector) => document.activeElement?.matches(selector), testCase.selector), true, `${testCase.label}: original trigger survives handoff`); assertions += 1;
    assert.deepEqual(delayedDiagnostics, [], `${testCase.label}: no hydration warnings/errors`); assertions += 1;
    await delayedPage.close();
  }

  const delayedRolePage = await browser.newPage();
  const delayedRoleDiagnostics = [];
  delayedRolePage.on("console", (message) => { if (["error", "warn"].includes(message.type())) delayedRoleDiagnostics.push(`${message.type()}: ${message.text()}`); });
  delayedRolePage.on("pageerror", (error) => delayedRoleDiagnostics.push(`pageerror: ${error.message}`));
  await delayedRolePage.setRequestInterception(true);
  delayedRolePage.on("request", (request) => {
    if (/\/assets-react\/production-main-[^/]+\.js$/.test(new URL(request.url()).pathname)) {
      setTimeout(() => request.continue().catch(() => {}), 3000);
    } else request.continue().catch(() => {});
  });
  const initialWorksNavigation = delayedRolePage.goto(`http://127.0.0.1:${port}/de/works/`, { waitUntil: "networkidle0" }).catch(() => null);
  await delayedRolePage.waitForSelector("main a[href*='?role=']");
  assert.equal(await delayedRolePage.evaluate(() => Boolean(document.querySelector("[data-react-recruiter-owner]")?.__portfolioReactRecruiterReady)), false, "DE Works role link is clicked before hydration"); assertions += 1;
  const destinationNavigation = delayedRolePage.waitForNavigation({ waitUntil: "networkidle0" });
  await delayedRolePage.click("main a[href*='?role=']");
  await delayedRolePage.waitForSelector("[data-react-recruiter-owner]");
  await delayedRolePage.waitForFunction(() => typeof window.trackAnalyticsEvent === "function");
  await delayedRolePage.evaluate(() => {
    window.__recruiterAnalytics = [];
    const original = window.trackAnalyticsEvent;
    window.trackAnalyticsEvent = (name, properties) => {
      window.__recruiterAnalytics.push({ name, properties });
      return original?.(name, properties);
    };
  });
  await destinationNavigation;
  await initialWorksNavigation;
  await delayedRolePage.waitForFunction(() => document.querySelector("[data-recruiter-drawer]")?.getAttribute("aria-hidden") === "false");
  assert.deepEqual(await delayedRolePage.evaluate(() => ({
    locale: document.documentElement.lang,
    role: document.querySelector("[data-recruiter-role][aria-pressed='true']")?.dataset.recruiterRole,
    dialogs: document.querySelectorAll("[data-recruiter-drawer]").length,
    analytics: window.__recruiterAnalytics.filter((item) => item.name === "recruiter_mode_open").length,
  })), { locale: "de", role: "applied-ai", dialogs: 1, analytics: 1 }, "DE Works hero role entry remains honored after delayed destination hydration"); assertions += 1;
  assert.deepEqual(delayedRoleDiagnostics, [], "DE Works hero role entry emits no hydration warnings/errors"); assertions += 1;
  await delayedRolePage.close();

  const bridgePage = await browser.newPage();
  const bridgeDiagnostics = [];
  bridgePage.on("console", (message) => { if (["error", "warn"].includes(message.type())) bridgeDiagnostics.push(`${message.type()}: ${message.text()}`); });
  bridgePage.on("pageerror", (error) => bridgeDiagnostics.push(`pageerror: ${error.message}`));
  await bridgePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  await bridgePage.evaluate(() => {
    window.initializeAjoopAi = () => {};
    window.__recruiterAnalytics = [];
    const original = window.trackAnalyticsEvent;
    window.trackAnalyticsEvent = (name, properties) => {
      window.__recruiterAnalytics.push({ name, properties });
      return original?.(name, properties);
    };
  });
  const overlayState = () => bridgePage.evaluate(() => ({
    owners: document.querySelectorAll("[data-react-recruiter-owner='react']").length,
    dialogs: document.querySelectorAll("[data-recruiter-drawer]").length,
    recruiterOpen: !document.querySelector("[data-recruiter-drawer]")?.hidden,
    recruiterActive: document.body.classList.contains("recruiter-mode-active"),
    commandOpen: document.querySelector("[data-command-palette]")?.classList.contains("is-open") || false,
    chatbotOpen: document.querySelector("[data-portfolio-chatbot]")?.classList.contains("is-open") || false,
    overlayOpen: document.body.classList.contains("overlay-modal-open"),
    visibleDialogs: [
      !document.querySelector("[data-recruiter-drawer]")?.hidden,
      document.querySelector("[data-command-palette]")?.classList.contains("is-open") || false,
      document.querySelector("[data-portfolio-chatbot]")?.classList.contains("is-open") || false,
    ].filter(Boolean).length,
  }));

  await bridgePage.click("header [data-recruiter-toggle]");
  await bridgePage.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  assert.deepEqual(await overlayState(), { owners: 1, dialogs: 1, recruiterOpen: true, recruiterActive: true, commandOpen: false, chatbotOpen: false, overlayOpen: true, visibleDialogs: 1 }, "header toggle opens only the React recruiter owner"); assertions += 1;

  await bridgePage.keyboard.down("Control"); await bridgePage.keyboard.press("KeyK"); await bridgePage.keyboard.up("Control");
  await bridgePage.waitForFunction(() => document.activeElement?.matches("[data-command-input]"));
  assert.deepEqual(await overlayState(), { owners: 1, dialogs: 1, recruiterOpen: false, recruiterActive: false, commandOpen: true, chatbotOpen: false, overlayOpen: true, visibleDialogs: 1 }, "Recruiter open to Command Palette leaves one overlay owner"); assertions += 1;

  await bridgePage.type("[data-command-input]", "recruiter");
  await bridgePage.waitForSelector("[data-command-id='recruiter']");
  await bridgePage.click("[data-command-id='recruiter']");
  await bridgePage.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  assert.deepEqual(await overlayState(), { owners: 1, dialogs: 1, recruiterOpen: true, recruiterActive: true, commandOpen: false, chatbotOpen: false, overlayOpen: true, visibleDialogs: 1 }, "Command Palette recruiter command opens the React owner"); assertions += 1;

  await bridgePage.evaluate(() => setChatbotOpen(true, { trigger: document.querySelector("[data-chatbot-toggle]") }));
  await bridgePage.waitForFunction(() => document.activeElement?.matches("[data-chatbot-input], [data-chatbot-panel]"));
  assert.deepEqual(await overlayState(), { owners: 1, dialogs: 1, recruiterOpen: false, recruiterActive: false, commandOpen: false, chatbotOpen: true, overlayOpen: true, visibleDialogs: 1 }, "Recruiter open to chatbot leaves one overlay owner"); assertions += 1;
  assert.equal(await bridgePage.evaluate(() => document.querySelector("main").inert && document.querySelector("[data-react-recruiter-owner]").inert), true, "chatbot owns the inert background after the React recruiter closes"); assertions += 1;
  await bridgePage.evaluate(() => setChatbotOpen(false));
  await bridgePage.click("header [data-recruiter-toggle]");
  await bridgePage.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  await bridgePage.keyboard.press("Escape");
  assert.equal(await bridgePage.evaluate(() => document.activeElement?.matches("header [data-recruiter-toggle]")), true, "bridged transitions preserve header focus restoration"); assertions += 1;
  assert.equal(await bridgePage.evaluate(() => window.__recruiterAnalytics.filter((item) => item.name === "recruiter_mode_open").length), 3, "each closed-to-open transition emits exactly one recruiter analytics event"); assertions += 1;
  assert.deepEqual(bridgeDiagnostics, [], "compatibility bridge emits no warnings/errors"); assertions += 1;
  await bridgePage.close();

  const page = await browser.newPage();
  const diagnostics = [];
  page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
  const normalizedMain = (node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("[data-recruiter-toggle]").forEach((toggle) => {
      toggle.removeAttribute("aria-controls");
      toggle.removeAttribute("aria-expanded");
      toggle.classList.remove("is-recruiter-intent");
    });
    return clone.innerHTML;
  };
  const mainBefore = await page.$eval("main[data-react-main]", normalizedMain);
  await page.click("header [data-recruiter-toggle]");
  await page.waitForFunction(() => document.activeElement?.matches("[data-recruiter-close]"));
  assert.equal(await page.evaluate(() => document.activeElement?.matches("[data-recruiter-close]")), true); assertions += 1;
  await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "LinkedIn", "Shift+Tab wraps to the final action"); assertions += 1;
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.matches("[data-recruiter-close]")), true, "Tab wraps to close"); assertions += 1;
  await page.click("[data-recruiter-role='software']");
  assert.equal(new URL(page.url()).searchParams.get("role"), "software"); assertions += 1;
  assert.deepEqual(await page.$eval("[data-recruiter-drawer]", (node) => ({ resume: node.querySelector("[data-recruiter-resume]")?.getAttribute("href"), contact: node.querySelector("[data-recruiter-contact]")?.getAttribute("href") })), {
    resume: JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/profile.json"), "utf8")).resume,
    contact: JSON.parse(fs.readFileSync(path.join(ROOT, "data/portfolio/profile.json"), "utf8")).email,
  }); assertions += 1;
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement?.matches("header [data-recruiter-toggle]")), true, "Escape restores launcher focus"); assertions += 1;
  await page.click("header [data-recruiter-toggle]");
  await page.click(".recruiter-drawer", { offset: { x: 4, y: 4 } });
  assert.equal(await page.$eval("[data-recruiter-drawer]", (node) => node.hidden), true, "backdrop closes dialog"); assertions += 1;
  assert.equal(await page.$eval("main[data-react-main]", normalizedMain), mainBefore, "recruiter interactions only update the launcher's expected ARIA/intent state"); assertions += 1;
  await page.click("header [data-recruiter-toggle]");
  await page.goto(`http://127.0.0.1:${port}/about/`, { waitUntil: "networkidle0" });
  assert.deepEqual(await page.evaluate(() => ({ hidden: document.querySelector("[data-recruiter-drawer]").hidden, active: document.body.classList.contains("recruiter-mode-active"), marker: document.querySelector("[data-recruiter-toggle]").classList.contains("is-recruiter-intent") })), { hidden: true, active: false, marker: true }, "ordinary navigation retains intent without auto-opening"); assertions += 1;
  assert.equal(await page.$eval("main[data-react-main]", normalizedMain) === mainBefore, false, "navigation reached the distinct About main"); assertions += 1;
  assert.deepEqual(diagnostics, [], "React recruiter interactions emit no warnings/errors"); assertions += 1;
  await page.close();

  const legacyPage = await browser.newPage();
  await legacyPage.goto(`http://127.0.0.1:${port}/now/`, { waitUntil: "networkidle0" });
  assert.deepEqual(await legacyPage.evaluate(() => ({ owner: document.querySelectorAll("[data-react-recruiter-owner]").length, dialogs: document.querySelectorAll("[data-recruiter-drawer]").length })), { owner: 0, dialogs: 1 }, "legacy /now/ retains exactly one legacy owner"); assertions += 1;
  await legacyPage.click("[data-recruiter-toggle]");
  assert.equal(await legacyPage.$eval("[data-recruiter-drawer]", (node) => node.hidden), false); assertions += 1;
  await legacyPage.keyboard.press("Escape");
  assert.equal(await legacyPage.evaluate(() => document.activeElement?.matches("[data-recruiter-toggle]")), true, "legacy /now/ keeps its focus-restoring owner"); assertions += 1;
  await legacyPage.close();

  console.log(`Master 3 #27 Recruiter/Build Log passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · ${productionReactRoutes().length} React documents · 4 canonical roles · 5 locales · deep links/focus/session/legacy boundary/static Build Log verified.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
