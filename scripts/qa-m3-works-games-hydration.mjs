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

/* The probe observes main from before the bundle executes until hydration has
 * completed AND the COMMON runtime has finished its load-time work, so later
 * legacy interference inside React-owned main is recorded as well. */
const hydrationProbe = `<script>
(() => {
  const main = document.querySelector("main[data-react-main]");
  const collect = (root) => { const nodes=[root], walker=document.createTreeWalker(root,NodeFilter.SHOW_ALL); while(walker.nextNode())nodes.push(walker.currentNode); return nodes; };
  const attrs = (root) => collect(root).filter((node)=>node.nodeType===Node.ELEMENT_NODE).map((node)=>({node,values:Object.fromEntries([...node.attributes].map((item)=>[item.name,item.value]).sort())}));
  const probe=window.__m3CatalogProbe={main,html:main.innerHTML,nodes:collect(main),attrs:attrs(main),records:[],errors:[],signals:0,started:false,settled:false,failure:null};
  const observer=new MutationObserver((records)=>probe.records.push(...records));
  observer.observe(main,{attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true,childList:true,subtree:true});
  const describe=(record)=>({type:record.type,target:record.target.nodeName,attributeName:record.attributeName||null,oldValue:record.oldValue,final:record.type==="attributes"?record.target.getAttribute(record.attributeName):null,searchInput:record.target.nodeType===1&&record.target.matches("input[data-project-search]")});
  const finish=()=>{probe.postMain=document.querySelector("main[data-react-main]");probe.postHtml=probe.postMain?.innerHTML;probe.postNodes=collect(probe.postMain);probe.postAttrs=attrs(probe.postMain);probe.records.push(...observer.takeRecords());observer.disconnect();probe.mutations=probe.records.map(describe);probe.records=null;probe.settled=true;};
  const loaded=new Promise((resolve)=>document.readyState==="complete"?resolve():addEventListener("load",resolve,{once:true}));
  addEventListener("portfolio:react-main-hydration-start",()=>{probe.started=true});
  addEventListener("portfolio:react-main-hydration-error",(event)=>probe.errors.push(event.detail||{}));
  addEventListener("portfolio:react-main-hydrated",()=>{probe.signals+=1;loaded.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(finish,400))));},{once:true});
  setTimeout(()=>{if(!probe.settled&&!probe.signals){probe.failure="hydration completion signal timeout";probe.mutations=[];probe.settled=true;observer.disconnect();}},4000);
})();
</script>`;

/* In-browser negative controls are injected ahead of the probe on request. */
const sabotageScripts = {
  "attribute-mutation": `<script>addEventListener("portfolio:react-main-hydration-start",()=>document.querySelector(".project-card").setAttribute("data-sabotage","1"));</script>`,
  "late-legacy-mutation": `<script>addEventListener("load",()=>document.querySelector("main [data-message-key]").setAttribute("data-preserve-case",""));</script>`,
  "missing-signal": `<script>addEventListener("portfolio:react-main-hydrated",(event)=>event.stopImmediatePropagation(),{capture:true});</script>`,
  "subtree-replacement": `<script>addEventListener("portfolio:react-main-hydration-start",()=>{const card=document.querySelector(".project-card");card.replaceWith(card.cloneNode(true));});</script>`,
  "recoverable-error": `<script>document.querySelector(".project-card h3 a").append(" drift");</script>`,
  "type-rewrite": `<script>addEventListener("portfolio:react-main-hydration-start",()=>document.querySelector("[data-project-search]").setAttribute("type","text"));</script>`,
};

function serverFor(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (path.extname(file) === ".html") {
      const sabotage = sabotageScripts[url.searchParams.get("sabotage")] || "";
      response.end(fs.readFileSync(file, "utf8").replace(/<script type="module" src="\/assets-react\/[^"]+"><\/script>/, (bundle) => `${sabotage}${hydrationProbe}${bundle}`));
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
}

const probeState = () => {
  const p = window.__m3CatalogProbe;
  return {
    started: p?.started, settled: p?.settled, failure: p?.failure, signals: p?.signals, errors: p?.errors || [],
    sameMain: p?.main === p?.postMain, sameHtml: p?.html === p?.postHtml,
    sameNodes: p?.nodes?.length === p?.postNodes?.length && p.nodes.every((node,index)=>node===p.postNodes[index]),
    sameAttrs: p?.attrs?.length === p?.postAttrs?.length && p.attrs.every((entry,index)=>entry.node===p.postAttrs[index].node&&JSON.stringify(entry.values)===JSON.stringify(p.postAttrs[index].values)),
    mutations: p?.mutations || [],
  };
};

/* React 19 hydrates an <input> by assigning element.type = props.type
 * (react-dom initInput). For the native search field that rewrites the
 * accepted value with itself, which a MutationObserver records. It is the
 * only tolerated record, and only while old value, final value and the
 * declared type are all exactly "search" on the one catalog search input. */
const isIdempotentSearchTypeWrite = (record) => record.type === "attributes"
  && record.target === "INPUT"
  && record.searchInput === true
  && record.attributeName === "type"
  && record.oldValue === "search"
  && record.final === "search";

function assertHydration(state, label) {
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
  assert.deepEqual(state.mutations.filter((record) => !isIdempotentSearchTypeWrite(record)), [], `${label}: hydration or post-hydration mutations`);
}

/* Synthetic controls: every individual hydration failure mode must fail. */
function assertSyntheticControls() {
  const write = { type: "attributes", target: "INPUT", attributeName: "type", oldValue: "search", final: "search", searchInput: true };
  const clean = { started: true, settled: true, failure: null, signals: 1, errors: [], sameMain: true, sameHtml: true, sameNodes: true, sameAttrs: true, mutations: [write] };
  assertHydration(clean, "synthetic baseline");
  const controls = [
    ["missing hydration start", { started: false }],
    ["missing completion signal", { signals: 0, failure: "hydration completion signal timeout" }],
    ["duplicate completion signal", { signals: 2 }],
    ["recoverable hydration error", { errors: [{ message: "Hydration failed" }] }],
    ["main replacement", { sameMain: false }],
    ["subtree replacement", { sameNodes: false }],
    ["innerHTML drift", { sameHtml: false }],
    ["attribute map drift", { sameAttrs: false }],
    ["value-changing type write", { mutations: [{ ...write, oldValue: "text" }] }],
    ["type write on another input", { mutations: [{ ...write, searchInput: false }] }],
    ["type left changed", { mutations: [{ ...write, final: "text" }] }],
    ["repeated type write", { mutations: [write, write] }],
    ["idempotent write on another attribute", { mutations: [{ ...write, attributeName: "placeholder" }] }],
    ["child list mutation", { mutations: [{ type: "childList", target: "DIV", attributeName: null, oldValue: null, final: null, searchInput: false }] }],
    ["character data mutation", { mutations: [{ type: "characterData", target: "#text", attributeName: null, oldValue: "a", final: null, searchInput: false }] }],
  ];
  for (const [name, override] of controls) {
    assert.throws(() => assertHydration({ ...clean, ...override }, name), undefined, `${name} synthetic control did not fail`);
  }
  return controls.length + 1;
}

async function waitForHydration(page) {
  await page.waitForFunction(() => window.__m3CatalogProbe?.settled === true, { timeout: 8000 });
  return page.evaluate(probeState);
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
      assertHydration(await waitForHydration(page), `${route.pathname}/${viewport.name}`); assertions += 11;
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

    /* Inert card-surface activation navigates to the card's localized link. */
    await page.click('[data-filter-btn="all"]');
    const target = await page.evaluate(() => {
      const card = document.querySelector(".project-card[data-category]");
      const anchor = card.querySelector("a[href]");
      const surface = [...card.querySelectorAll("p, img")].find((node) => !node.closest("a, button"));
      surface.setAttribute("data-m3-surface", "");
      return new URL(anchor.getAttribute("href"), location.href).pathname;
    });
    if (route.locale !== "en" && target.startsWith("/") && !/^\/(tr|de|es|fr)\//.test(target)) {
      assert.fail(`${label}: card destination ${target} lost the ${route.locale} locale`);
    }
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click("[data-m3-surface]")]);
    assert.equal(new URL(page.url()).pathname, target, `${label}: card surface navigation`);
    assertions += 2;
    await page.close();
  }

  /* Live negative controls: real sabotage inside the browser must fail. */
  for (const sabotage of Object.keys(sabotageScripts)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/works/?sabotage=${sabotage}`, { waitUntil: "networkidle0" });
    const state = await waitForHydration(page);
    assert.throws(() => assertHydration(state, sabotage), undefined, `${sabotage} live negative control did not fail`);
    liveControls += 1;
    assertions += 1;
    await page.close();
  }

  console.log(`G-65 Works/Games hydration and interaction passed. ${assertions} assertions · 10 documents · desktop/mobile · keyboard/touch filters · typed search · Escape/Backspace clearing · combined filters · empty state · accessible role/name · card navigation · no-JS SSR · 16 synthetic + ${liveControls} live negative controls.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
