#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildProductionSite } from "./build-production-site.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";
import { ROOT } from "./i18n-catalog.mjs";

const CASE_IDS = new Set(["sinamaCaseStudy", "mergeRushCaseStudy", "joydayCaseStudy", "hospitalCaseStudy", "aiFlowPuzzleCaseStudy"]);
const launch = process.env.GITHUB_ACTIONS === "true" ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"], protocolTimeout: 180000 } : { headless: true, protocolTimeout: 180000 };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
/* React cedes the subtree of the legacy-owned SINAMA evidence root (the root
 * element itself stays under the identity contract); the explorer is asserted
 * separately below. */
const probe = `<script>(()=>{const I='[data-sinama-evidence]',m=document.querySelector('main[data-react-main]'),nodes=r=>{const a=[r],w=document.createTreeWalker(r,NodeFilter.SHOW_ALL);while(w.nextNode())a.push(w.currentNode);return a.filter(n=>!n.parentElement?.closest(I)||n===r)},inner=r=>{const c=r.cloneNode(true);c.querySelectorAll(I).forEach(n=>{n.textContent=''});return c.innerHTML},attrs=r=>nodes(r).filter(n=>n.nodeType===1).map(n=>({n,v:JSON.stringify([...n.attributes].map(a=>[a.name,a.value]).sort())}));const p=window.__m329={m,html:inner(m),nodes:nodes(m),attrs:attrs(m),records:[],errors:[],signals:0,settled:false,phase:'pre'};const rec=r=>({phase:p.phase,type:r.type,name:r.attributeName||null,target:r.target.nodeName});const o=new MutationObserver(rs=>p.records.push(...rs.map(rec)));o.observe(m,{subtree:true,childList:true,characterData:true,attributes:true});addEventListener('portfolio:react-main-hydration-start',()=>{p.records.push(...o.takeRecords().map(rec));p.phase='hydration'});addEventListener('portfolio:react-main-hydration-error',e=>p.errors.push(e.detail||{}));addEventListener('portfolio:react-main-hydrated',()=>{p.records.push(...o.takeRecords().map(rec));p.phase='post';p.signals++;requestAnimationFrame(()=>requestAnimationFrame(()=>{p.post=document.querySelector('main[data-react-main]');p.postHtml=inner(p.post);p.postNodes=nodes(p.post);p.postAttrs=attrs(p.post);p.records.push(...o.takeRecords().map(rec));p.settled=true}))},{once:true})})();</script>`;

/* This gate must always exercise the artifact exactly as built. A former
 * diagnostic switch could blank or strip a script from the served site; it is
 * gone, and a leftover value is refused rather than silently ignored. */
if (process.env.M3_DISABLE_SCRIPT !== undefined) {
  throw new Error("M3_DISABLE_SCRIPT is not supported: the G-70 gate never serves a modified artifact. Unset it and rerun.");
}

/* Live negative controls: each drifts the real served document before React
 * hydrates it, so the probe itself (not a hand-edited state object) has to
 * observe the drift. */
const SABOTAGE = Object.freeze({
  copy: "document.querySelector('main').append(' hydration drift')",
  attribute: "document.querySelector('main h1').setAttribute('data-hydration-drift','1')",
  identity: "(()=>{const n=document.querySelector('main section');n.replaceWith(n.cloneNode(true))})()",
  text: "document.querySelector('main h1').textContent='hydration drift'",
});

function serverFor(root, instrument = false) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const target = path.resolve(root, relative.endsWith("/") ? `${relative}index.html` : relative);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (instrument && path.extname(target) === ".html") {
      const html = fs.readFileSync(target, "utf8");
      const mode = url.searchParams.get("sabotage");
      const sabotage = mode !== null && Object.hasOwn(SABOTAGE, mode) ? `<script>${SABOTAGE[mode]}</script>` : "";
      response.end(html.replace(/<\/main>/i, `</main>${probe}${sabotage}`));
      return;
    }
    fs.createReadStream(target).pipe(response);
  });
}

const state = () => { const p = window.__m329; let at=0;while(at<(p?.html?.length||0)&&p.html[at]===p.postHtml?.[at])at++; return { settled: p?.settled, signals: p?.signals, errors: p?.errors, records: p?.records, sameMain: p?.m === p?.post, sameHtml: p?.html === p?.postHtml, sameNodes: p?.nodes?.length === p?.postNodes?.length && p.nodes.every((n,i)=>n===p.postNodes[i]), sameAttrs: p?.attrs?.length === p?.postAttrs?.length && p.attrs.every((x,i)=>x.n===p.postAttrs[i].n&&x.v===p.postAttrs[i].v), diff: p?.html===p?.postHtml?null:{at,before:p?.html?.slice(Math.max(0,at-160),at+240),after:p?.postHtml?.slice(Math.max(0,at-160),at+240)} }; };
/** Every hydration contract the observed page state breaks, by name. */
function hydrationViolations(value) {
  return [
    [value.settled === true, "hydration did not settle"],
    [value.signals === 1, "hydration completion signal"],
    [Array.isArray(value.errors) && value.errors.length === 0, "recoverable hydration error"],
    [value.sameMain === true, "main replaced"],
    [value.sameHtml === true, "innerHTML changed"],
    [value.sameNodes === true, "descendant identity changed"],
    [value.sameAttrs === true, "attributes changed"],
  ].filter(([held]) => !held).map(([, contract]) => contract);
}
function assertHydration(value, label, { quiet = false } = {}) {
  const violations = hydrationViolations(value);
  if (violations.length && !quiet) console.error(`[G-70 hydration diagnostics] ${label}`, JSON.stringify(value, null, 2));
  assert.deepEqual(violations, [], `${label}: ${violations.join("; ")}`);
}

async function prepare(page, theme, viewport) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") request.continue();
    else request.abort();
  });
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((value) => localStorage.setItem("kaanbalci-site-theme", value), theme);
}

async function geometry(page) {
  return page.evaluate(() => [...document.querySelectorAll("main > section")].map((node) => {
    const r = node.getBoundingClientRect(), s = getComputedStyle(node);
    return { tag: node.tagName, classes: node.className, x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, grid: s.gridTemplateColumns, gap: s.gap };
  }));
}

const requestedRoot = process.argv.includes("--root") ? path.resolve(process.argv[process.argv.indexOf("--root") + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-29-browser-"));
const reactRoot = requestedRoot || path.join(temporary, "site");
if (!requestedRoot) await buildProductionSite({ outputDirectory: reactRoot });
const reactServer = serverFor(reactRoot, true), legacyServer = serverFor(ROOT, false);
await Promise.all([new Promise((resolve) => reactServer.listen(0, "127.0.0.1", resolve)), new Promise((resolve) => legacyServer.listen(0, "127.0.0.1", resolve))]);
const reactOrigin = `http://127.0.0.1:${reactServer.address().port}`;
const legacyOrigin = `http://127.0.0.1:${legacyServer.address().port}`;
const browser = await puppeteer.launch(launch);
let browserConditions = 0, visualComparisons = 0, interactions = 0, negativeControls = 0;
try {
  const routes = canonicalReactRoutes();
  const cases = routes.filter((route) => CASE_IDS.has(route.routeId));
  const projects = routes.filter((route) => route.kind === "project");
  const projectSamples = ["en", "tr", "de", "es", "fr"].map((locale) => projects.find((route) => route.locale === locale && route.slug === "portfolio-website"));
  for (const [routeIndex, route] of [...cases, ...projectSamples].entries()) {
    for (const condition of [routeIndex % 2 === 0 ? { name: "desktop-dark", theme: "dark", viewport: { width: 1440, height: 900 } } : { name: "mobile-light", theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } }]) {
      const page = await browser.newPage();
      await prepare(page, condition.theme, condition.viewport);
      const diagnostics = [];
      page.on("console", (message) => { if (["error", "warn"].includes(message.type()) && !message.text().startsWith("Failed to load resource:")) diagnostics.push(`${message.type()}: ${message.text()}`); });
      page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
      const response = await page.goto(`${reactOrigin}${route.pathname}`, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, `${route.pathname}/${condition.name}: HTTP`);
      await page.waitForFunction(() => window.__m329?.settled, { timeout: 15000 });
      assertHydration(await page.evaluate(state), `${route.pathname}/${condition.name}`);
      assert.deepEqual(diagnostics, [], `${route.pathname}/${condition.name}: console diagnostics`);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), condition.theme, `${route.pathname}/${condition.name}: theme`);
      browserConditions += 1;
      if (route.kind === "project") {
        /* The retained runtime (project routing, AJOOP page context) resolves
         * the current project from the slug the document declares on <body>. */
        const identity = await page.evaluate(() => ({ declared: document.body.dataset.projectSlug ?? null, resolved: typeof resolveCurrentProjectSlug === "function" ? resolveCurrentProjectSlug() : null }));
        assert.deepEqual(identity, { declared: route.slug, resolved: route.slug }, `${route.pathname}: runtime project identity`);
        interactions += 1;
      }
      if (route.locale === "en") {
        await page.click("[data-theme-toggle]");
        assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), condition.theme, `${route.pathname}: theme interaction`);
        interactions += 1;
      }
      if (CASE_IDS.has(route.routeId) && route.locale === "en" && await page.$("[data-case-gallery]")) {
        await page.click("[data-case-gallery]");
        assert.equal(await page.$eval("[data-case-modal]", (node) => node.getAttribute("aria-hidden")), "false", `${route.pathname}: gallery modal opens`);
        await page.keyboard.press("Escape");
        assert.equal(await page.$eval("[data-case-modal]", (node) => node.getAttribute("aria-hidden")), "true", `${route.pathname}: gallery modal closes`);
        interactions += 2;
      }
      if (route.routeId === "sinamaCaseStudy") {
        const explorer = () => page.$eval("[data-sinama-evidence]", (node) => ({ scenarios: node.querySelectorAll("[data-evidence-scenario]").length, pressed: node.querySelector('[aria-pressed="true"]')?.dataset.evidenceScenario, verdict: node.querySelector(".evidence-verdict strong")?.textContent, findings: node.querySelectorAll(".evidence-findings li").length }));
        await page.waitForFunction(() => document.querySelector("[data-sinama-evidence] [data-evidence-scenario]"), { timeout: 15000 });
        const healthy = await explorer();
        assert.deepEqual([healthy.scenarios, healthy.pressed, healthy.findings > 0], [2, "healthy", true], `${route.pathname}: evidence explorer renders after hydration`);
        await page.click('[data-evidence-scenario="broken"]');
        const broken = await explorer();
        assert.equal(broken.pressed, "broken", `${route.pathname}: evidence scenario switches`);
        assert.notEqual(broken.verdict, healthy.verdict, `${route.pathname}: evidence verdict follows the scenario`);
        assert.equal(await page.evaluate(() => window.__m329.m.isConnected && window.__m329.m.contains(document.querySelector("[data-sinama-evidence]"))), true, `${route.pathname}: explorer stays inside the hydrated main`);
        interactions += 3;
      }
      await page.close();
      console.log(`[G-70 hydrate ${routeIndex + 1}/${cases.length + projectSamples.length}] ${route.pathname} ${condition.name}`);
    }
  }

  const visualRoutes = routes.filter((route) => route.locale === "en" && CASE_IDS.has(route.routeId));
  for (const route of visualRoutes) {
    for (const condition of [{ theme: "dark", viewport: { width: 1440, height: 900 } }, { theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } }]) {
      const [accepted, react] = await Promise.all([browser.newPage(), browser.newPage()]);
      await Promise.all([accepted.setJavaScriptEnabled(false), react.setJavaScriptEnabled(false)]);
      await Promise.all([prepare(accepted, condition.theme, condition.viewport), prepare(react, condition.theme, condition.viewport)]);
      /* Scripts are disabled, so nothing holds DOMContentLoaded back for the
       * stylesheets; geometry is only comparable once both pages have loaded. */
      await Promise.all([accepted.goto(`${legacyOrigin}${route.pathname}`, { waitUntil: "load" }), react.goto(`${reactOrigin}${route.pathname}`, { waitUntil: "load" })]);
      await Promise.all([accepted.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, condition.theme), react.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, condition.theme)]);
      const [before, after] = await Promise.all([geometry(accepted), geometry(react)]);
      assert.equal(after.length, before.length, `${route.pathname}: top-level section count`);
      for (let index = 0; index < before.length; index += 1) {
        assert.deepEqual({ tag: after[index].tag, classes: after[index].classes, display: after[index].display, grid: after[index].grid, gap: after[index].gap }, { tag: before[index].tag, classes: before[index].classes, display: before[index].display, grid: before[index].grid, gap: before[index].gap }, `${route.pathname}: section ${index} style contract`);
        for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(after[index][key] - before[index][key]) <= 2, `${route.pathname}: section ${index} ${key} delta ${after[index][key] - before[index][key]}`);
      }
      visualComparisons += 1;
      await Promise.all([accepted.close(), react.close()]);
      console.log(`[G-70 visual ${visualComparisons}/${visualRoutes.length * 2}] ${route.pathname} ${condition.viewport.width}px`);
    }
  }

  /* One representative project route. The accepted page builds its main at
   * runtime, so scripts stay on and both pages are measured only once they
   * are settled: document loaded, main rendered (hydrated on the React side),
   * fonts ready, then an idle period and two frames. */
  const projectVisual = projectSamples[0];
  let projectVisualComparisons = 0;
  for (const condition of [{ theme: "dark", viewport: { width: 1440, height: 900 } }, { theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } }]) {
    const [accepted, react] = await Promise.all([browser.newPage(), browser.newPage()]);
    await Promise.all([prepare(accepted, condition.theme, condition.viewport), prepare(react, condition.theme, condition.viewport)]);
    const sections = [];
    for (const [page, origin] of [[accepted, legacyOrigin], [react, reactOrigin]]) {
      await page.bringToFront();
      await page.goto(`${origin}${projectVisual.pathname}`, { waitUntil: "load" });
      await page.waitForFunction(() => document.readyState === "complete" && document.querySelector("main .detail-navigation")
        && (!document.querySelector("main[data-react-main]") || window.__m329?.settled === true), { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => {
        requestIdleCallback(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), { timeout: 3000 });
      })));
      sections.push(await geometry(page));
    }
    const [before, after] = sections;
    assert.equal(after.length, before.length, `${projectVisual.pathname}: top-level section count`);
    assert.ok(before.length >= 5, `${projectVisual.pathname}: accepted project main is fully rendered`);
    for (let index = 0; index < before.length; index += 1) {
      assert.deepEqual({ tag: after[index].tag, classes: after[index].classes, display: after[index].display, grid: after[index].grid, gap: after[index].gap }, { tag: before[index].tag, classes: before[index].classes, display: before[index].display, grid: before[index].grid, gap: before[index].gap }, `${projectVisual.pathname}: section ${index} style contract`);
      for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(after[index][key] - before[index][key]) <= 2, `${projectVisual.pathname}: section ${index} ${key} delta ${after[index][key] - before[index][key]}`);
    }
    projectVisualComparisons += 1;
    await Promise.all([accepted.close(), react.close()]);
    console.log(`[G-70 project visual ${projectVisualComparisons}/2] ${projectVisual.pathname} ${condition.viewport.width}px`);
  }

  const clean = await browser.newPage();
  await prepare(clean, "dark", { width: 1280, height: 900 });
  await clean.goto(`${reactOrigin}/projects/portfolio-website/`, { waitUntil: "domcontentloaded" });
  await clean.waitForFunction(() => window.__m329?.settled, { timeout: 15000 });
  const baseline = await clean.evaluate(state);
  assertHydration(baseline, "negative baseline");
  await clean.close();
  /* The same route, drifted in the served document. The state comes from the
   * probe in a real browser; the control counts only when the probe reports
   * the specific contract that drift breaks, and the gate rejects it. */
  for (const [mode, contract] of [
    ["copy", "innerHTML changed"],
    ["attribute", "attributes changed"],
    ["identity", "descendant identity changed"],
    ["text", "recoverable hydration error"],
  ]) {
    const sabotaged = await browser.newPage();
    await prepare(sabotaged, "dark", { width: 1280, height: 900 });
    await sabotaged.goto(`${reactOrigin}/projects/portfolio-website/?sabotage=${mode}`, { waitUntil: "domcontentloaded" });
    await sabotaged.waitForFunction(() => window.__m329?.settled, { timeout: 15000 });
    const driftedState = await sabotaged.evaluate(state);
    const observed = hydrationViolations(driftedState);
    assert.ok(observed.includes(contract), `live ${mode} drift: probe must report "${contract}", observed ${JSON.stringify(observed)}`);
    assert.throws(() => assertHydration(driftedState, `live ${mode} drift`, { quiet: true }), assert.AssertionError);
    negativeControls += 1;
    await sabotaged.close();
    console.log(`[G-70 negative ${negativeControls}/4] ${mode} drift -> ${observed.join("; ")}`);
  }
  console.log(`G-70 case/project browser gate passed. ${browserConditions} hydrated documents · ${cases.length} case documents + ${projectSamples.length} localized project samples · alternating desktop dark/mobile light · ${visualComparisons} accepted-vs-React desktop/mobile case-study geometry comparisons + ${projectVisualComparisons} project-detail · ${interactions} interaction checks · ${negativeControls} observed negative-control failures.`);
} finally {
  await browser.close();
  await Promise.all([new Promise((resolve) => reactServer.close(resolve)), new Promise((resolve) => legacyServer.close(resolve))]);
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
