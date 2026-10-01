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
const hydrationProbe = `<script>
(() => {
  const main = document.querySelector("main[data-react-main]");
  const collect = (root) => { const nodes=[root], walker=document.createTreeWalker(root,NodeFilter.SHOW_ALL); while(walker.nextNode())nodes.push(walker.currentNode); return nodes; };
  const attrs = (root) => collect(root).filter((node)=>node.nodeType===Node.ELEMENT_NODE).map((node)=>({node,values:Object.fromEntries([...node.attributes].map((item)=>[item.name,item.value]).sort())}));
  const probe=window.__m3CatalogProbe={main,html:main.innerHTML,nodes:collect(main),attrs:attrs(main),mutations:[],errors:[],signals:0,started:false,settled:false,failure:null};
  const observer=new MutationObserver((records)=>probe.mutations.push(...records.map((record)=>({type:record.type,target:record.target.nodeName,attributeName:record.attributeName||null}))));
  observer.observe(main,{attributes:true,characterData:true,childList:true,subtree:true});
  addEventListener("portfolio:react-main-hydration-start",()=>{probe.started=true});
  addEventListener("portfolio:react-main-hydration-error",(event)=>probe.errors.push(event.detail||{}));
  addEventListener("portfolio:react-main-hydrated",()=>{probe.signals+=1;requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>{probe.postMain=document.querySelector("main[data-react-main]");probe.postHtml=probe.postMain?.innerHTML;probe.postNodes=collect(probe.postMain);probe.postAttrs=attrs(probe.postMain);probe.mutations.push(...observer.takeRecords().map((record)=>({type:record.type,target:record.target.nodeName,attributeName:record.attributeName||null})));probe.settled=true;observer.disconnect();},0)))},{once:true});
  setTimeout(()=>{if(!probe.settled&&!probe.signals){probe.failure="hydration completion signal timeout";probe.settled=true;observer.disconnect();}},2500);
})();
</script>`;

function serverFor(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://local");
    const relative = decodeURIComponent(url.pathname).endsWith("/") ? `${decodeURIComponent(url.pathname).slice(1)}index.html` : decodeURIComponent(url.pathname).slice(1);
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end("not found");
    response.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    if (path.extname(file) === ".html") {
      response.end(fs.readFileSync(file, "utf8").replace(/(<script type="module" src="\/assets-react\/[^\"]+"><\/script>)/, `${hydrationProbe}$1`));
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
  assert.deepEqual(state.mutations, [], `${label}: hydration mutations`);
}

async function waitForHydration(page) {
  await page.waitForFunction(() => window.__m3CatalogProbe?.settled === true, { timeout: 5000 });
  return page.evaluate(probeState);
}

async function catalogState(page) {
  return page.evaluate(() => ({
    active: [...document.querySelectorAll("[data-filter-btn].active")].map((node) => node.dataset.filterBtn),
    visibleCards: [...document.querySelectorAll(".project-card[data-category]")].filter((node) => !node.classList.contains("is-hidden")).map((node) => node.dataset.projectLink || node.dataset.gameLink),
    hiddenSections: document.querySelectorAll("[data-project-section].is-hidden").length,
  }));
}

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
const fixture = requestedRoot ? { mixed: requestedRoot, routes: worksGamesRouteRecords(), cleanup() {} } : await buildWorksGamesFixture();
const server = serverFor(fixture.mixed);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await puppeteer.launch(browserLaunchOptions);
let assertions = 0;
try {
  for (const route of fixture.routes.filter((item) => WORKS_GAMES_IDS.has(item.routeId))) {
    for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setViewport(viewport);
      const diagnostics = [];
      page.on("console", (message) => { if (["error", "warn"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`); });
      page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
      page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ""}`));
      const response = await page.goto(`http://127.0.0.1:${port}${route.pathname}`, { waitUntil: "networkidle0" });
      assert.equal(response.status(), 200, `${route.pathname}/${viewport.name}: HTTP`); assertions += 1;
      assertHydration(await waitForHydration(page), `${route.pathname}/${viewport.name}`); assertions += 10;
      assert.deepEqual(diagnostics, [], `${route.pathname}/${viewport.name}: browser diagnostics`); assertions += 1;
      const shell = await page.evaluate(() => ({
        roots: document.querySelectorAll("main[data-react-main]").length,
        bundles: document.querySelectorAll('script[type="module"][src^="/assets-react/"]').length,
        current: document.querySelectorAll('[data-nav] a[aria-current="page"]').length,
        search: document.querySelectorAll("[data-project-search]").length,
        cards: document.querySelectorAll(".project-card[data-category]").length,
      }));
      assert.deepEqual(shell, { roots: 1, bundles: 1, current: 1, search: 1, cards: route.routeId === "works" ? 10 : 4 }); assertions += 1;
      if (viewport.name === "mobile") {
        await page.click(".nav-toggle");
        assert.equal(await page.$eval("[data-nav]", (node) => node.classList.contains("is-open")), true); assertions += 1;
        await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".nav-toggle")), true); assertions += 1;
      }
      await page.close();
    }
  }

  for (const routeId of ["works", "games"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/${routeId}/`, { waitUntil: "networkidle0" });
    await waitForHydration(page);
    const initial = await catalogState(page);
    assert.equal(initial.visibleCards.length, routeId === "works" ? 10 : 4); assertions += 1;
    const category = routeId === "works" ? "game" : "product";
    await page.focus(`[data-filter-btn="${category}"]`);
    await page.keyboard.press("Enter");
    const filtered = await catalogState(page);
    assert.deepEqual(filtered.active, [category]); assertions += 1;
    assert.equal(filtered.visibleCards.length, routeId === "works" ? 3 : 1); assertions += 1;
    if (routeId === "works") assert.ok(filtered.visibleCards.includes("/merge-rush-case-study/"), "multi-category game/software card must remain visible");
    assertions += routeId === "works" ? 1 : 0;
    await page.click('[data-filter-btn="all"]');
    const search = await page.$("[data-project-search]");
    await search.type(routeId === "works" ? "FastAPI" : "Node Logic");
    assert.equal((await catalogState(page)).visibleCards.length, 1, `${routeId}: positive search`); assertions += 1;
    await page.$eval("[data-project-search]", (node) => { node.value = "no-such-catalog-result"; node.dispatchEvent(new Event("input", { bubbles: true })); });
    const empty = await catalogState(page);
    assert.equal(empty.visibleCards.length, 0, `${routeId}: empty-result behavior`); assertions += 1;
    if (routeId === "works") assert.equal(empty.hiddenSections, 2, "works: both project tiers hide when empty");
    assertions += routeId === "works" ? 1 : 0;
    if (routeId === "games") {
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("[data-game-link]")].map((node) => node.dataset.gameLink)), [
        "/merge-rush-case-study/", "/ai-flow-puzzle/", "/joyday-paint/", "/adventure/",
      ]); assertions += 1;
    }
    await page.close();
  }
  console.log(`G-65 Works/Games hydration and interaction passed. ${assertions} assertions · 10 documents · desktop/mobile · filters/search/empty state/keyboard/original destinations.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fixture.cleanup();
}
