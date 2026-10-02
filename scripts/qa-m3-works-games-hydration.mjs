#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";
import { buildWorksGamesFixture, worksGamesRouteRecords, WORKS_GAMES_IDS } from "./m3-works-games-fixture.mjs";

const browserLaunchOptions = process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true };
const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };

/* The probe runs immediately after </main> is parsed: the earliest moment the
 * React-owned subtree exists, and before any later classic script, deferred
 * work or the module bundle. A <template> holding the server-rendered main is
 * parsed beside it, so parse-time changes are detected too. The observer then
 * stays attached through hydration, load-time COMMON work and every scripted
 * interaction phase; each record is attributed to the phase it occurred in. */
const ownershipProbe = `<script>
(() => {
  const main = document.querySelector("main[data-react-main]");
  const ssr = document.getElementById("m3-ssr-main");
  const collect = (root) => { const nodes=[root], walker=document.createTreeWalker(root,NodeFilter.SHOW_ALL); while(walker.nextNode())nodes.push(walker.currentNode); return nodes; };
  const attrs = (root) => collect(root).filter((node)=>node.nodeType===Node.ELEMENT_NODE).map((node)=>({node,values:Object.fromEntries([...node.attributes].map((item)=>[item.name,item.value]).sort())}));
  const probe=window.__m3CatalogProbe={main,html:main.innerHTML,ssrMatch:ssr?ssr.innerHTML===main.innerHTML:false,nodes:collect(main),attrs:attrs(main),mainAttributes:JSON.stringify([...main.attributes].map((item)=>[item.name,item.value])),records:[],errors:[],signals:0,started:false,settled:false,failure:null,phase:"pre-hydration"};
  ssr?.remove();
  const describe=(record)=>({phase:probe.phase,type:record.type,target:record.target.nodeName,isMain:record.target===main,attributeName:record.attributeName||null,oldValue:record.oldValue,final:record.type==="attributes"?record.target.getAttribute(record.attributeName):null,searchInput:record.target.nodeType===1&&record.target.matches("input[data-project-search]")});
  const observer=new MutationObserver((records)=>probe.records.push(...records.map(describe)));
  observer.observe(main,{attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true,childList:true,subtree:true});
  probe.flush=()=>probe.records.push(...observer.takeRecords().map(describe));
  probe.snapshot=()=>{probe.flush();probe.postMain=document.querySelector("main[data-react-main]");probe.postHtml=probe.postMain?.innerHTML;probe.postNodes=collect(probe.postMain);probe.postAttrs=attrs(probe.postMain);};
  const loaded=new Promise((resolve)=>document.readyState==="complete"?resolve():addEventListener("load",resolve,{once:true}));
  const idle=()=>new Promise((resolve)=>requestIdleCallback(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),{timeout:3000}));
  addEventListener("portfolio:react-main-hydration-start",()=>{probe.flush();probe.started=true;probe.phase="hydration";});
  addEventListener("portfolio:react-main-hydration-error",(event)=>probe.errors.push(event.detail||{}));
  addEventListener("portfolio:react-main-hydrated",()=>{probe.flush();probe.signals+=1;probe.phase="post-hydration";Promise.all([loaded,document.fonts.ready]).then(idle).then(()=>{probe.snapshot();probe.settled=true;});},{once:true});
  loaded.then(()=>{if(!probe.signals)setTimeout(()=>{if(!probe.signals&&!probe.settled){probe.failure="hydration completion signal missing after load";probe.snapshot();probe.settled=true;}},5000);});
})();
</script>`;

/* In-browser negative controls; each is placed after the probe so it acts on
 * the observed document, exactly where a regressed legacy script would. The
 * signal-suppression control must register before the probe's listener. */
const BEFORE_PROBE = new Set(["missing-signal"]);
const sabotageScripts = {
  "pre-hydration legacy rewrite": `<script>document.querySelector("[data-project-search]").placeholder = "Search projects...";</script>`,
  "attribute-mutation": `<script>addEventListener("portfolio:react-main-hydration-start",()=>document.querySelector(".project-card").setAttribute("data-sabotage","1"));</script>`,
  "late-legacy-mutation": `<script>addEventListener("load",()=>document.querySelector("main [data-message-key]").setAttribute("data-preserve-case",""));</script>`,
  "missing-signal": `<script>addEventListener("portfolio:react-main-hydrated",(event)=>event.stopImmediatePropagation(),{capture:true});</script>`,
  "subtree-replacement": `<script>addEventListener("portfolio:react-main-hydration-start",()=>{const card=document.querySelector(".project-card");card.replaceWith(card.cloneNode(true));});</script>`,
  "recoverable-error": `<script>document.querySelector(".project-card h3 a").append(" drift");</script>`,
  "type-rewrite": `<script>addEventListener("portfolio:react-main-hydration-start",()=>document.querySelector("[data-project-search]").setAttribute("type","text"));</script>`,
  "parse-time rewrite": "PARSE",
};

function serverFor(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (path.extname(file) === ".html" && /data-react-main/.test(fs.readFileSync(file, "utf8"))) {
      const html = fs.readFileSync(file, "utf8");
      const inner = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)[1];
      const sabotage = sabotageScripts[url.searchParams.get("sabotage")] || "";
      /* The parse-time control changes the served main but not its template. */
      const served = sabotage === "PARSE" ? html.replace("<h3>", "<h3 data-parse=\"1\">") : html;
      const name = url.searchParams.get("sabotage");
      const placed = sabotage === "PARSE" ? "" : sabotage;
      const after = BEFORE_PROBE.has(name)
        ? `</main><template id="m3-ssr-main">${inner}</template>${placed}${ownershipProbe}`
        : `</main><template id="m3-ssr-main">${inner}</template>${ownershipProbe}${placed}`;
      response.end(served.replace(/<\/main>/i, () => after));
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
}

const probeState = () => {
  const p = window.__m3CatalogProbe;
  return {
    started: p?.started, settled: p?.settled, failure: p?.failure, signals: p?.signals, errors: p?.errors || [], ssrMatch: p?.ssrMatch,
    sameMain: p?.main === p?.postMain, sameHtml: p?.html === p?.postHtml,
    sameNodes: p?.nodes?.length === p?.postNodes?.length && p.nodes.every((node,index)=>node===p.postNodes[index]),
    sameAttrs: p?.attrs?.length === p?.postAttrs?.length && p.attrs.every((entry,index)=>entry.node===p.postAttrs[index].node&&JSON.stringify(entry.values)===JSON.stringify(p.postAttrs[index].values)),
    mutations: (p?.records || []).filter((record) => ["pre-hydration", "hydration", "post-hydration"].includes(record.phase)),
  };
};

/* React 19 hydrates an <input> by assigning element.type = props.type
 * (react-dom initInput). For the native search field that rewrites the
 * accepted value with itself, which a MutationObserver records. It is the
 * only tolerated record, and only while old value, final value and the
 * declared type are all exactly "search" on the one catalog search input,
 * during hydration. */
const isIdempotentSearchTypeWrite = (record) => record.phase === "hydration"
  && record.type === "attributes"
  && record.target === "INPUT"
  && record.searchInput === true
  && record.attributeName === "type"
  && record.oldValue === "search"
  && record.final === "search";

function assertHydration(state, label) {
  assert.equal(state.ssrMatch, true, `${label}: main changed while the document was parsed`);
  assert.equal(state.started, true, `${label}: hydration never started`);
  assert.equal(state.settled, true, `${label}: probe did not settle`);
  assert.equal(state.failure, null, `${label}: ${state.failure}`);
  assert.equal(state.signals, 1, `${label}: completion signal count`);
  assert.deepEqual(state.errors, [], `${label}: recoverable React errors`);
  assert.equal(state.sameMain, true, `${label}: main replaced`);
  assert.equal(state.sameHtml, true, `${label}: hydration changed innerHTML`);
  assert.equal(state.sameNodes, true, `${label}: descendant replaced`);
  assert.equal(state.sameAttrs, true, `${label}: attribute map changed`);
  const idempotent = state.mutations.filter(isIdempotentSearchTypeWrite);
  assert.ok(idempotent.length <= 1, `${label}: repeated search type writes`);
  assert.deepEqual(state.mutations.filter((record) => !isIdempotentSearchTypeWrite(record)), [], `${label}: mutations between parsing, hydration and load`);
}

/* Interaction phases: COMMON may isolate the page behind a dialog by toggling
 * inert / aria-hidden on the main container itself, and must restore it; it
 * may not touch any React-owned descendant. */
function assertInteractionPhase(records, mainBefore, mainAfter, label) {
  const foreign = records.filter((record) => !(record.isMain && record.type === "attributes" && ["inert", "aria-hidden"].includes(record.attributeName)));
  assert.deepEqual(foreign, [], `${label}: legacy runtime mutated React-owned main`);
  assert.equal(mainAfter, mainBefore, `${label}: main container attributes not restored`);
}

/* Synthetic controls: every individual hydration failure mode must fail. */
function assertSyntheticControls() {
  const write = { phase: "hydration", type: "attributes", target: "INPUT", isMain: false, attributeName: "type", oldValue: "search", final: "search", searchInput: true };
  const clean = { ssrMatch: true, started: true, settled: true, failure: null, signals: 1, errors: [], sameMain: true, sameHtml: true, sameNodes: true, sameAttrs: true, mutations: [write] };
  assertHydration(clean, "synthetic baseline");
  const controls = [
    ["parse-time change", { ssrMatch: false }],
    ["missing hydration start", { started: false }],
    ["missing completion signal", { signals: 0, failure: "hydration completion signal missing after load" }],
    ["duplicate completion signal", { signals: 2 }],
    ["recoverable hydration error", { errors: [{ message: "Hydration failed" }] }],
    ["main replacement", { sameMain: false }],
    ["subtree replacement", { sameNodes: false }],
    ["innerHTML drift", { sameHtml: false }],
    ["attribute map drift", { sameAttrs: false }],
    ["value-changing type write", { mutations: [{ ...write, oldValue: "text" }] }],
    ["type write before hydration", { mutations: [{ ...write, phase: "pre-hydration" }] }],
    ["type write on another input", { mutations: [{ ...write, searchInput: false }] }],
    ["type left changed", { mutations: [{ ...write, final: "text" }] }],
    ["repeated type write", { mutations: [write, write] }],
    ["idempotent write on another attribute", { mutations: [{ ...write, attributeName: "placeholder" }] }],
    ["pre-hydration placeholder rewrite", { mutations: [{ ...write, phase: "pre-hydration", target: "INPUT", attributeName: "placeholder", oldValue: "a", final: "b" }] }],
    ["child list mutation", { mutations: [{ phase: "post-hydration", type: "childList", target: "LABEL", isMain: false, attributeName: null, oldValue: null, final: null, searchInput: false }] }],
    ["character data mutation", { mutations: [{ phase: "post-hydration", type: "characterData", target: "#text", isMain: false, attributeName: null, oldValue: "a", final: null, searchInput: false }] }],
  ];
  for (const [name, override] of controls) {
    assert.throws(() => assertHydration({ ...clean, ...override }, name), undefined, `${name} synthetic control did not fail`);
  }
  const dialog = { phase: "recruiter", type: "attributes", target: "MAIN", isMain: true, attributeName: "inert", oldValue: null, final: "" };
  assertInteractionPhase([dialog], "a", "a", "synthetic dialog baseline");
  for (const [name, records, after] of [
    ["descendant mutated by a dialog", [{ ...dialog, target: "INPUT", isMain: false, attributeName: "placeholder" }], "a"],
    ["label text replaced by a dialog", [{ ...dialog, type: "childList", target: "LABEL", isMain: false, attributeName: null }], "a"],
    ["container left inert", [dialog], "b"],
  ]) {
    assert.throws(() => assertInteractionPhase(records, "a", after, name), undefined, `${name} synthetic control did not fail`);
  }
  return controls.length + 4;
}

async function waitForHydration(page) {
  await page.waitForFunction(() => window.__m3CatalogProbe?.settled === true, { timeout: 15000 });
  return page.evaluate(probeState);
}

/* Condition-based quiescence for interaction phases: two frames after an idle
 * period in the foreground tab. */
const quiesce = (page) => page.evaluate(() => new Promise((resolve) => requestIdleCallback(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), { timeout: 3000 })));

async function runPhase(page, name, action) {
  await page.bringToFront();
  const before = await page.evaluate((phase) => {
    const probe = window.__m3CatalogProbe;
    probe.flush();
    probe.phase = phase;
    return JSON.stringify([...probe.main.attributes].map((item) => [item.name, item.value]));
  }, name);
  await action();
  await quiesce(page);
  return page.evaluate((phase, mainBefore) => {
    const probe = window.__m3CatalogProbe;
    probe.flush();
    probe.phase = "idle";
    return { records: probe.records.filter((record) => record.phase === phase), mainBefore, mainAfter: JSON.stringify([...probe.main.attributes].map((item) => [item.name, item.value])) };
  }, name, before);
}

/* Recruiter Mode, Command Palette, a locale-sensitive refresh and the theme
 * toggle, each driven through the real COMMON entry points. */
async function ownershipPhases(page) {
  const results = {};
  results.recruiter = await runPhase(page, "recruiter", async () => {
    await page.click(".recruiter-toggle");
    await page.waitForFunction(() => document.querySelector("main").hasAttribute("inert"), { timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("main").hasAttribute("inert"), { timeout: 5000 });
  });
  results.command = await runPhase(page, "command", async () => {
    await page.click(".command-toggle");
    await page.waitForFunction(() => document.querySelector("main").hasAttribute("inert"), { timeout: 5000 });
    await page.keyboard.type("works");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("main").hasAttribute("inert"), { timeout: 5000 });
  });
  results.locale = await runPhase(page, "locale", async () => {
    const refreshed = await page.evaluate(() => {
      let notified = false;
      document.addEventListener("site:localechange", () => { notified = true; }, { once: true });
      setCurrentLocale(getCurrentLocale(), { persist: false, source: "m3-ownership-qa", force: true });
      return notified;
    });
    assert.equal(refreshed, true, "locale refresh must notify subscribers");
  });
  results.theme = await runPhase(page, "theme", async () => {
    const initial = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click("[data-theme-toggle]");
    await page.waitForFunction((value) => document.documentElement.dataset.theme !== value, { timeout: 5000 }, initial);
    await page.click("[data-theme-toggle]");
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, { timeout: 5000 }, initial);
  });
  return results;
}

async function catalogState(page) {
  return page.evaluate(() => ({
    active: [...document.querySelectorAll("[data-filter-btn].active")].map((node) => node.dataset.filterBtn),
    visibleCards: [...document.querySelectorAll(".project-card[data-category]")].filter((node) => !node.classList.contains("is-hidden")).map((node) => node.dataset.projectLink || node.dataset.gameLink),
    hiddenSections: [...document.querySelectorAll("[data-project-section]")].map((node) => node.classList.contains("is-hidden")),
    value: document.querySelector("[data-project-search]").value,
  }));
}

/* Category oracle from the accepted SSR attributes, independent of React state. */
async function categoryOracle(page, category) {
  return page.evaluate((filter) => {
    const match = (card) => filter === "all" || (card.dataset.category || "").split(" ").includes(filter);
    return {
      visibleCards: [...document.querySelectorAll(".project-card[data-category]")].filter(match).map((node) => node.dataset.projectLink || node.dataset.gameLink),
      hiddenSections: [...document.querySelectorAll("[data-project-section]")].map((section) => ![...section.querySelectorAll(".project-card[data-category]")].some(match)),
    };
  }, category);
}

async function clearByKeyboard(page, key) {
  await page.focus("[data-project-search]");
  if (key === "Escape") await page.keyboard.press("Escape");
  else {
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
  }
}

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
const fixture = requestedRoot ? { mixed: requestedRoot, routes: worksGamesRouteRecords(), cleanup() {} } : await buildWorksGamesFixture();
const server = serverFor(fixture.mixed);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch(browserLaunchOptions);
let assertions = assertSyntheticControls();
let liveControls = 0;
let phaseChecks = 0;
try {
  const catalogRoutes = fixture.routes.filter((item) => WORKS_GAMES_IDS.has(item.routeId));
  assert.equal(catalogRoutes.length, 10, "ten Works/Games documents");
  for (const route of catalogRoutes) {
    for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile", isMobile: true, hasTouch: true }]) {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setViewport(viewport);
      const diagnostics = [];
      page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
      page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
      const response = await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
      assert.equal(response.status(), 200, `${route.pathname}/${viewport.name}: HTTP`); assertions += 1;
      await page.bringToFront();
      assertHydration(await waitForHydration(page), `${route.pathname}/${viewport.name}`); assertions += 12;
      if (viewport.name === "desktop") {
        for (const [phase, result] of Object.entries(await ownershipPhases(page))) {
          assertInteractionPhase(result.records, result.mainBefore, result.mainAfter, `${route.pathname}/${phase}`);
          phaseChecks += 1;
        }
      }
      assert.deepEqual(diagnostics, [], `${route.pathname}/${viewport.name}: browser diagnostics`); assertions += 1;
      const shell = await page.evaluate(() => ({
        roots: document.querySelectorAll("main[data-react-main]").length,
        bundles: document.querySelectorAll('script[type="module"][src^="/assets-react/"]').length,
        current: document.querySelectorAll('[data-nav] a[aria-current="page"]').length,
        search: document.querySelectorAll("[data-project-search]").length,
        cards: document.querySelectorAll(".project-card[data-category]").length,
        legacyMarkers: document.querySelectorAll("main [data-game-card-ready]").length,
      }));
      assert.deepEqual(shell, { roots: 1, bundles: 1, current: 1, search: 1, cards: route.routeId === "works" ? 10 : 4, legacyMarkers: 0 }); assertions += 1;
      if (viewport.name === "mobile") {
        await page.click(".nav-toggle");
        assert.equal(await page.$eval("[data-nav]", (node) => node.classList.contains("is-open")), true); assertions += 1;
        await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".nav-toggle")), true); assertions += 1;
        await page.tap("[data-filter-btn]:not(.active)");
        assert.equal((await catalogState(page)).active.length, 1, `${route.pathname}: touch filter activation`); assertions += 1;
      }
      await page.close();
    }
  }

  /* Without JavaScript the SSR document alone carries the complete catalog. */
  for (const route of catalogRoutes) {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
    const noScript = await page.evaluate(() => {
      const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
      const cards = [...document.querySelectorAll(".project-card[data-category]")];
      return {
        probe: typeof window.__m3CatalogProbe,
        cards: cards.length,
        renderedCards: cards.filter(visible).length,
        hiddenCards: cards.filter((card) => card.classList.contains("is-hidden")).length,
        filters: [...document.querySelectorAll("[data-filter-btn]")].filter(visible).length,
        search: [...document.querySelectorAll("[data-project-search]")].filter(visible).length,
        links: cards.filter((card) => card.querySelector("a[href]")).length,
      };
    });
    const count = route.routeId === "works" ? 10 : 4;
    assert.deepEqual(noScript, {
      probe: "undefined", cards: count, renderedCards: count, hiddenCards: 0,
      filters: route.routeId === "works" ? 7 : 5, search: 1, links: count,
    }, `${route.pathname}: SSR without JavaScript`);
    assertions += 1;
    await page.close();
  }

  /* Interaction coverage in all ten documents, driven by real input events. */
  for (const route of catalogRoutes) {
    const label = route.pathname;
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
    await page.bringToFront();
    assertHydration(await waitForHydration(page), `${label}/interaction`); assertions += 1;

    const search = await page.$("[data-project-search]");
    const accessible = await page.accessibility.snapshot({ root: search });
    const labelText = await page.$eval("[data-project-search-label]", (node) => node.textContent);
    /* Chromium applies the label's CSS uppercase to the computed name; the
     * exact name is compared with the accepted page by the differential gate. */
    assert.deepEqual(
      { role: accessible.role, name: accessible.name.toLocaleLowerCase(route.locale) },
      { role: "searchbox", name: labelText.toLocaleLowerCase(route.locale) },
      `${label}: accessible role/name`,
    );
    assert.equal(await page.$eval("[data-project-search]", (node) => node.type), "search", `${label}: native search input`);
    assertions += 2;

    const categories = await page.evaluate(() => [...document.querySelectorAll("[data-filter-btn]")].map((node) => node.dataset.filterBtn));
    assert.equal(categories.length, route.routeId === "works" ? 7 : 5, `${label}: filter count`); assertions += 1;
    for (const round of [0, 1]) {
      for (const [index, category] of categories.entries()) {
        await page.focus(`[data-filter-btn="${category}"]`);
        await page.keyboard.press((index + round) % 2 ? "Space" : "Enter");
        const state = await catalogState(page);
        assert.deepEqual(state.active, [category], `${label}: ${category} active`);
        assert.deepEqual({ visibleCards: state.visibleCards, hiddenSections: state.hiddenSections }, await categoryOracle(page, category), `${label}: ${category} visibility`);
        assertions += 2;
      }
    }
    if (route.routeId === "works") {
      await page.click('[data-filter-btn="game"]');
      assert.ok((await catalogState(page)).visibleCards.includes("/merge-rush-case-study/"), `${label}: multi-category game/software card`);
      await page.click('[data-filter-btn="software"]');
      assert.ok((await catalogState(page)).visibleCards.includes("/merge-rush-case-study/"), `${label}: multi-category card in second category`);
      assertions += 2;
    }

    const all = await categoryOracle(page, "all");
    await page.click('[data-filter-btn="all"]');
    await search.type("merge-rush");
    const positive = await catalogState(page);
    assert.deepEqual(positive.visibleCards, ["/merge-rush-case-study/"], `${label}: positive typed search`);
    assertions += 1;
    await clearByKeyboard(page, "Escape");
    assert.deepEqual(await catalogState(page), { active: ["all"], ...all, value: "" }, `${label}: Escape clears the native search field`);
    await search.type("zz-no-such-catalog-result");
    const empty = await catalogState(page);
    assert.deepEqual(empty.visibleCards, [], `${label}: empty result`);
    assert.ok(empty.hiddenSections.every(Boolean), `${label}: every tier hides when empty`);
    await clearByKeyboard(page, "Backspace");
    assert.deepEqual(await catalogState(page), { active: ["all"], ...all, value: "" }, `${label}: Backspace clears`);
    assertions += 4;

    /* Combined state: a destination outside the category hides everything,
     * and clearing restores exactly the category-only result. */
    const otherCategory = "ai";
    const outside = await categoryOracle(page, otherCategory);
    assert.equal(outside.visibleCards.includes("/merge-rush-case-study/"), false, `${label}: control card outside ${otherCategory}`);
    await page.click(`[data-filter-btn="${otherCategory}"]`);
    await search.type("merge-rush");
    assert.deepEqual((await catalogState(page)).visibleCards, [], `${label}: category AND search`);
    await page.click('[data-filter-btn="all"]');
    assert.deepEqual((await catalogState(page)).visibleCards, ["/merge-rush-case-study/"], `${label}: search persists across category change`);
    await page.click(`[data-filter-btn="${otherCategory}"]`);
    await clearByKeyboard(page, "Escape");
    const restored = await catalogState(page);
    assert.deepEqual({ visibleCards: restored.visibleCards, hiddenSections: restored.hiddenSections }, outside, `${label}: clearing restores category result`);
    assertions += 4;

    if (route.routeId === "games") {
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("[data-game-link]")].map((node) => node.dataset.gameLink)), [
        "/merge-rush-case-study/", "/ai-flow-puzzle/", "/joyday-paint/", "/adventure/",
      ]); assertions += 1;
    }
    await page.click('[data-filter-btn="all"]');
    await page.close();

    /* Whole-card activation against an oracle derived from the accepted
     * contract, independent of React: Works cards navigate only through
     * data-project-link (a path is a page, a slug is /projects/<slug>/) with
     * Works analytics; Games cards only through data-game-link without
     * analytics; every other card is inert. */
    const nav = await browser.newPage();
    await nav.setViewport({ width: 1280, height: 900 });
    let navigations = null;
    await nav.setRequestInterception(true);
    nav.on("request", (request) => {
      if (navigations && request.isNavigationRequest() && request.frame() === nav.mainFrame()) {
        navigations.push(new URL(request.url()).pathname);
        request.respond({ status: 204, body: "" });
        return;
      }
      request.continue();
    });
    await nav.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
    await nav.bringToFront();
    await waitForHydration(nav);
    navigations = [];
    const prefix = route.locale === "en" ? "" : `/${route.locale}`;
    const expectations = await nav.evaluate((routeId, localePrefix) => [...document.querySelectorAll(".project-card[data-category]")].map((card) => {
      const value = routeId === "works" ? card.dataset.projectLink : card.dataset.gameLink;
      if (!value) return { destination: null, analytics: [] };
      const destination = `${localePrefix}${value.includes("/") || value.includes(".") ? value : `/projects/${value}/`}`;
      return { destination, analytics: routeId === "works" ? [`${destination}|works`] : [] };
    }), route.routeId, prefix);
    assert.ok(expectations.some((item) => item.destination) && (route.routeId === "games" || expectations.some((item) => !item.destination)), `${label}: oracle must include navigable${route.routeId === "works" ? " and inert" : ""} cards`);
    for (const [index, expected] of expectations.entries()) {
      navigations.length = 0;
      const analytics = await nav.evaluate((cardIndex) => {
        const calls = [];
        window.trackAnalyticsNavigation = (...values) => calls.push(values.join("|"));
        const card = document.querySelectorAll(".project-card[data-category]")[cardIndex];
        [...card.querySelectorAll("p, img, h3, span")].find((node) => !node.closest("a, button"))
          .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        return calls;
      }, index);
      await quiesce(nav);
      assert.deepEqual({ destination: navigations[0] ?? null, analytics }, expected, `${label}: card ${index} activation`);
      assertions += 1;
    }
    await nav.close();
  }

  /* Live negative controls: real sabotage inside the browser must fail. */
  for (const sabotage of Object.keys(sabotageScripts)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/works/?sabotage=${encodeURIComponent(sabotage)}`, { waitUntil: "networkidle0" });
    await page.bringToFront();
    const state = await waitForHydration(page);
    assert.throws(() => assertHydration(state, sabotage), undefined, `${sabotage} live negative control did not fail`);
    liveControls += 1;
    await page.close();
  }
  for (const [name, phase, install] of [
    ["Recruiter Mode rewrites search copy", "recruiter", () => document.querySelector(".recruiter-toggle").addEventListener("click", () => { document.querySelector("[data-project-search-label]").textContent = "Search projects"; })],
    ["Command Palette rewrites placeholder", "command", () => document.querySelector(".command-toggle").addEventListener("click", () => { document.querySelector("[data-project-search]").placeholder = "Search"; })],
    ["locale refresh rewrites a card", "locale", () => subscribeSiteLocale(() => { document.querySelector(".project-card h3 a").textContent = "Stale"; })],
    ["theme toggle touches a card", "theme", () => document.querySelector("[data-theme-toggle]").addEventListener("click", () => document.querySelector(".project-card").setAttribute("data-theme-seen", "1"))],
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/de/works/`, { waitUntil: "networkidle0" });
    await page.bringToFront();
    await waitForHydration(page);
    await page.evaluate(install);
    const result = (await ownershipPhases(page))[phase];
    assert.throws(() => assertInteractionPhase(result.records, result.mainBefore, result.mainAfter, name), undefined, `${name} live negative control did not fail`);
    liveControls += 1;
    await page.close();
  }

  console.log(`G-65 Works/Games hydration, ownership and interaction passed. ${assertions} assertions · 10 documents · observed from end of main parsing · ${phaseChecks} Recruiter/Command/locale/theme ownership phases · desktop/mobile · keyboard/touch filters · typed search · Escape/Backspace clearing · combined filters · empty state · accessible role/name · contract-derived card activation · no-JS SSR · ${assertSyntheticControls()} synthetic + ${liveControls} live negative controls.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
