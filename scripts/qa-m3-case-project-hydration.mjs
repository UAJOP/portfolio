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
import { servesUpstreamIcons, withIconSubset } from "./m3-32a-public-edits.mjs";

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

function serverFor(root, instrument = false, acceptedIcons = false) {
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
      const visual = url.searchParams.get("visual");
      const style = visual !== null && Object.hasOwn(VISUAL_SABOTAGE, visual) ? `<style>${VISUAL_SABOTAGE[visual]}</style>` : "";
      response.end(html.replace(/<\/head>/i, `${style}</head>`).replace(/<\/main>/i, `</main>${probe}${sabotage}`));
      return;
    }
    /* #32A: the upstream icon host is unreachable here, so the accepted
     * documents load the same local icons the React documents do. */
    if (acceptedIcons && path.extname(target) === ".html") {
      const html = fs.readFileSync(target, "utf8");
      if (servesUpstreamIcons(html)) return response.end(withIconSubset(html, relative));
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

/* Real layout differences a negative control adds to the React document. */
const VISUAL_SABOTAGE = Object.freeze({
  taller: "main > section:nth-of-type(2){padding-bottom:91.5625px!important}",
  slightlyTaller: "main > section:nth-of-type(2){padding-bottom:3px!important}",
  shifted: "main > section:nth-of-type(3){position:relative!important;top:4px!important}",
  reflowed: "main > section:nth-of-type(2){grid-template-columns:repeat(2,minmax(0,1fr))!important}",
  /* Taller content inside a contained section. The section's own box model is
   * untouched, so its content-visibility placeholder keeps its size: only a
   * measurement of the rendered section can see this. */
  containedTaller: ".cta-panel > *{padding-bottom:40px!important}",
  uncontained: ".cta-panel{content-visibility:visible!important}",
});

/* Geometry is comparable only once a page has actually been rendered.
 *
 * Two pages opened together share one foreground. The other is a hidden tab
 * that has not produced a single frame: its document timeline still reads 0.
 * And a `content-visibility: auto` section is a placeholder until the browser
 * renders it, so its box says what has been rendered so far, not what the
 * document is. Neither is a property of the page under test.
 *
 * So each page is brought to the front, its containment and placeholder
 * geometry are recorded, the containment is lifted for the measurement — the
 * strategy of the #26 differential and #30 gates — and a sample is accepted
 * only when the page is visible, fonts and images are resolved, the browser
 * has rendered at least two frames since the lift (observed on the document
 * timeline; scripts are disabled, so no frame callback can be used) and a
 * painted frame has been captured, and the geometry equals the previous
 * sample. Two equal samples alone are not taken as proof of a finished
 * render. Bounded; the comparison and its ±2 px tolerance are unchanged. */
const CONTAINED = ".section-block,.cta-panel,.site-footer,.project-detail-grid,.math-lab-section";
const SETTLE_ATTEMPTS = 40;
const SETTLE_INTERVAL_MS = 50;
const REQUIRED_FRAMES = 2;

/* One instant of one page: the compared geometry of every top-level section
 * and, with it, what is needed to understand a difference from a CI log. */
const visualSample = () => {
  const round = (value) => Math.round(value * 100) / 100;
  const box = (node) => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(round); };
  const sections = [...document.querySelectorAll("main > section")];
  const images = [...document.querySelectorAll("main img")];
  return {
    page: {
      viewport: [innerWidth, innerHeight, devicePixelRatio], scroll: [scrollX, scrollY], documentHeight: document.documentElement.scrollHeight,
      visibility: document.visibilityState, focused: document.hasFocus(), timeline: document.timeline.currentTime,
      fonts: document.fonts.status, fontFaces: document.fonts.size, images: images.length, pendingImages: images.filter((image) => !image.complete).length,
    },
    sections: sections.map((node) => { const r = node.getBoundingClientRect(), s = getComputedStyle(node); return { tag: node.tagName, classes: node.className, x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, grid: s.gridTemplateColumns, gap: s.gap }; }),
    evidence: sections.map((node) => {
      const style = getComputedStyle(node);
      return {
        box: box(node), contentVisibility: style.contentVisibility, containerType: style.containerType, padding: style.padding,
        children: [...node.children].slice(0, 8).map((child) => { const s = getComputedStyle(child); return { tag: child.tagName, classes: child.className, box: box(child), containerType: s.containerType }; }),
        text: [...node.querySelectorAll("h1, h2, h3, strong, p, span, a, li")].filter((item) => item.children.length === 0 && item.textContent.trim()).slice(0, 12).map((item) => {
          const s = getComputedStyle(item), height = item.getBoundingClientRect().height, lineHeight = parseFloat(s.lineHeight);
          return { tag: item.tagName, text: item.textContent.trim().slice(0, 28), fontSize: s.fontSize, lineHeight: s.lineHeight, width: round(item.getBoundingClientRect().width), height: round(height), lines: lineHeight ? Math.round(height / lineHeight) : null, family: s.fontFamily.slice(0, 24) };
        }),
      };
    }),
  };
};

async function settledSample(page) {
  await page.bringToFront();
  /* Before the lift: what containment the page declares, and the placeholder
   * geometry the comparison used to read. */
  const containment = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((node) => { const style = getComputedStyle(node); return [node.tagName, node.className, style.contentVisibility, style.containIntrinsicSize].join("|"); }), CONTAINED);
  const placeholder = (await page.evaluate(visualSample)).sections;
  await page.addStyleTag({ content: `${CONTAINED}{content-visibility:visible!important}` });
  let previous = null, frames = 0, painted = false, waiting = "no sample";
  for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt += 1) {
    const sample = await page.evaluate(visualSample);
    if (previous && sample.page.timeline > previous.page.timeline) frames += 1;
    /* A captured frame is a painted one. */
    if (!painted && frames >= 1) painted = (await page.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 } })).length > 0;
    const moved = previous ? sample.sections.flatMap((section, index) => ["x", "y", "width", "height", "grid", "display", "gap"].filter((key) => section[key] !== previous.sections[index]?.[key]).map((key) => `section ${index} ${key} ${previous.sections[index]?.[key]} -> ${section[key]}`)) : ["first sample"];
    waiting = [
      sample.page.visibility !== "visible" && `page is ${sample.page.visibility}`,
      sample.page.fonts !== "loaded" && `fonts ${sample.page.fonts}`,
      sample.page.pendingImages > 0 && `${sample.page.pendingImages} image(s) not resolved`,
      frames < REQUIRED_FRAMES && `${frames} of ${REQUIRED_FRAMES} frames rendered`,
      !painted && "no painted frame captured",
      moved.length > 0 && `geometry still changing (${moved.slice(0, 4).join("; ")})`,
    ].filter(Boolean).join(", ");
    previous = sample;
    if (!waiting) return { ...sample, containment, placeholder, settle: { attempts: attempt, frames, painted, stable: true } };
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
  }
  return { ...previous, containment, placeholder, settle: { attempts: SETTLE_ATTEMPTS, frames, painted, stable: false, waiting } };
}

/** A failed comparison: what failed, as data, and the snapshots it was measured on. */
function visualFailure(pathname, visual, accepted, react, index = null) {
  const side = (sample) => ({ page: sample.page, settle: sample.settle, containment: sample.containment, placeholder: index === null ? undefined : sample.placeholder[index] && { y: sample.placeholder[index].y, height: sample.placeholder[index].height }, section: index === null ? undefined : sample.evidence[index] });
  const what = visual.kind === "geometry" ? `section ${visual.index} ${visual.key} delta ${visual.delta}` : visual.kind === "style" ? `section ${visual.index} style contract` : visual.detail;
  const error = new assert.AssertionError({ message: `${pathname}: ${what}\n  evidence (snapshots taken at measurement): ${JSON.stringify({ accepted: side(accepted), react: side(react) })}`, actual: visual.actual, expected: visual.expected, operator: "visualComparison" });
  error.visual = visual;
  return error;
}

/* One accepted-vs-React comparison with JavaScript disabled. */
async function compareVisual(browser, origins, route, condition, { visual = null } = {}) {
  const [accepted, react] = await Promise.all([browser.newPage(), browser.newPage()]);
  try {
    await Promise.all([accepted.setJavaScriptEnabled(false), react.setJavaScriptEnabled(false)]);
    await Promise.all([prepare(accepted, condition.theme, condition.viewport), prepare(react, condition.theme, condition.viewport)]);
    /* Scripts are disabled, so nothing holds DOMContentLoaded back for the
     * stylesheets; geometry is only comparable once both pages have loaded. */
    await Promise.all([accepted.goto(`${origins.accepted}${route.pathname}`, { waitUntil: "load" }), react.goto(`${origins.react}${route.pathname}${visual ? `?visual=${visual}` : ""}`, { waitUntil: "load" })]);
    await Promise.all([accepted.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, condition.theme), react.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, condition.theme)]);
    const before = await settledSample(accepted);
    const after = await settledSample(react);
    const fail = (details, index = null) => { throw visualFailure(route.pathname, details, before, after, index); };
    if (!before.settle.stable || !after.settle.stable) {
      const moving = Number(((before.settle.waiting || after.settle.waiting || "").match(/section (\d+)/) || [])[1]);
      fail({ kind: "settle", detail: `layout did not settle within ${SETTLE_ATTEMPTS} samples (accepted: ${before.settle.waiting || "settled"}; React: ${after.settle.waiting || "settled"})` }, Number.isInteger(moving) ? moving : 0);
    }
    if (JSON.stringify(after.containment) !== JSON.stringify(before.containment)) fail({ kind: "containment", detail: "content-visibility containment", actual: after.containment, expected: before.containment });
    if (after.sections.length !== before.sections.length) fail({ kind: "count", detail: "top-level section count", actual: after.sections.length, expected: before.sections.length });
    const sections = before.sections.length;
    for (let index = 0; index < sections; index += 1) {
      const expected = before.sections[index], actual = after.sections[index];
      const contract = (section) => ({ tag: section.tag, classes: section.classes, display: section.display, grid: section.grid, gap: section.gap });
      if (JSON.stringify(contract(actual)) !== JSON.stringify(contract(expected))) fail({ kind: "style", index, sections, actual: contract(actual), expected: contract(expected) }, index);
      for (const key of ["x", "y", "width", "height"]) {
        if (Math.abs(actual[key] - expected[key]) <= 2) continue;
        /* The same quantity as the comparison read it before the lift. */
        fail({ kind: "geometry", index, sections, key, delta: actual[key] - expected[key], placeholderDelta: after.placeholder[index][key] - before.placeholder[index][key], actual: actual[key], expected: expected[key] }, index);
      }
    }
    return { accepted: before.settle, react: after.settle };
  } finally {
    await Promise.all([accepted.close(), react.close()].map((closing) => closing.catch(() => {})));
  }
}

const requestedRoot = process.argv.includes("--root") ? path.resolve(process.argv[process.argv.indexOf("--root") + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-29-browser-"));
const reactRoot = requestedRoot || path.join(temporary, "site");
if (!requestedRoot) await buildProductionSite({ outputDirectory: reactRoot });
const reactServer = serverFor(reactRoot, true), legacyServer = serverFor(ROOT, false, true);
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
      const settled = await compareVisual(browser, { accepted: legacyOrigin, react: reactOrigin }, route, condition);
      visualComparisons += 1;
      console.log(`[G-70 visual ${visualComparisons}/${visualRoutes.length * 2}] ${route.pathname} ${condition.viewport.width}px · settled after ${settled.accepted.attempts}/${settled.react.attempts} samples, ${settled.accepted.frames}/${settled.react.frames} frames (accepted/React)`);
    }
  }

  /* The comparison must still reject a real difference after it has waited
   * for the render: each control adds one to the served React document and
   * must be rejected for exactly that difference. Any other failure — another
   * assertion, a timeout, a protocol error — fails the control. */
  let visualControls = 0;
  const desktop = { theme: "dark", viewport: { width: 1440, height: 900 } };
  const mobile = { theme: "light", viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } };
  const caseRoute = (routeId) => { const route = visualRoutes.find((item) => item.routeId === routeId); assert.ok(route, `visual controls need the ${routeId} route`); return route; };
  const sinamaRoute = caseRoute("sinamaCaseStudy");
  /* A case study whose closing section is content-visibility contained. */
  const containedRoute = caseRoute("aiFlowPuzzleCaseStudy");
  const near = (value, target) => typeof value === "number" && Math.abs(value - target) < 0.01;
  const VISUAL_CONTROLS = [
    ["taller", sinamaRoute, desktop, (v) => v.kind === "geometry" && v.index === 1 && v.key === "height" && near(v.delta, 91.5625)],
    ["slightlyTaller", sinamaRoute, desktop, (v) => v.kind === "geometry" && v.index === 1 && v.key === "height" && near(v.delta, 3)],
    ["shifted", sinamaRoute, mobile, (v) => v.kind === "geometry" && v.index === 2 && v.key === "y" && near(v.delta, 4)],
    ["reflowed", sinamaRoute, desktop, (v) => v.kind === "style" && v.index === 1 && v.actual.grid !== v.expected.grid],
    /* Rejected only by the rendered measurement: the placeholder the
     * comparison used to read is the same on both pages. */
    ["containedTaller", containedRoute, desktop, (v) => v.kind === "geometry" && v.index === v.sections - 1 && v.key === "height" && near(v.delta, 40) && near(v.placeholderDelta, 0)],
    ["uncontained", containedRoute, desktop, (v) => v.kind === "containment"],
  ];
  for (const [visual, route, condition, isExpected] of VISUAL_CONTROLS) {
    let caught = null;
    try { await compareVisual(browser, { accepted: legacyOrigin, react: reactOrigin }, route, condition, { visual }); } catch (error) { caught = error; }
    assert.ok(caught, `visual control "${visual}": the comparison accepted a real layout difference`);
    assert.ok(caught instanceof assert.AssertionError && caught.visual && isExpected(caught.visual), `visual control "${visual}": the comparison failed for another reason: ${caught.stack || caught}`);
    visualControls += 1;
    const reason = caught.visual.kind === "geometry" ? `section ${caught.visual.index} ${caught.visual.key} delta ${caught.visual.delta} (placeholder delta ${caught.visual.placeholderDelta})` : caught.visual.kind === "style" ? `section ${caught.visual.index} style contract` : caught.visual.detail;
    console.log(`[G-70 visual control ${visualControls}/${VISUAL_CONTROLS.length}] ${visual} on ${route.pathname} ${condition.viewport.width}px -> rejected: ${reason}`);
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
  console.log(`G-70 case/project browser gate passed. ${browserConditions} hydrated documents · ${cases.length} case documents + ${projectSamples.length} localized project samples · alternating desktop dark/mobile light · ${visualComparisons} accepted-vs-React desktop/mobile case-study geometry comparisons + ${projectVisualComparisons} project-detail · ${interactions} interaction checks · ${negativeControls} hydration + ${visualControls} visual observed negative-control failures.`);
} finally {
  await browser.close();
  await Promise.all([new Promise((resolve) => reactServer.close(resolve)), new Promise((resolve) => legacyServer.close(resolve))]);
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
