#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHomeAboutFixture, homeAboutRouteRecords, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";
import { attributes, documentContract, HOME_ABOUT_ATTRIBUTE_EXCEPTIONS } from "./home-about-contract.mjs";
import { ROOT } from "./i18n-catalog.mjs";
import { buildProductionReact } from "./prerender-react.mjs";
import { ICON_SUBSET_LINK, ICON_UPSTREAM_LINK, iconSubsetAcceptedBase } from "./m3-32a-public-edits.mjs";

const ACCEPTED_REF = "34fdfad01f63004ed10d616a7b061e3996c28150";
const accepted = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-25b-home-about-accepted.json"), "utf8"));
assert.equal(accepted.schemaVersion, 3);
assert.equal(accepted.acceptedRef, ACCEPTED_REF);
assert.equal(accepted.algorithm, "sha256");

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`G-62 root does not exist: ${requestedRoot}`);
let assertions = 3;
if (!requestedRoot) {
  const independenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "m3-home-about-independent-"));
  const routes = homeAboutRouteRecords().filter((route) => HOME_ABOUT_IDS.has(route.routeId));
  const forbidden = new Set(routes.map((route) => path.resolve(ROOT, route.output).toLowerCase()));
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function interceptedRead(file, ...args) {
    const candidate = file instanceof URL ? fileURLToPath(file) : file;
    const resolved = typeof candidate === "string" ? path.resolve(candidate).toLowerCase() : "";
    if (forbidden.has(resolved)) throw new Error(`production React renderer attempted to read legacy document ${file}`);
    return originalReadFileSync.call(this, file, ...args);
  };
  try {
    await buildProductionReact({ outputDirectory: independenceRoot, routes });
    assertions += 1;
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.rmSync(independenceRoot, { recursive: true, force: true });
  }
}
const fixture = requestedRoot
  ? { mixed: requestedRoot, routes: homeAboutRouteRecords(), cleanup() {} }
  : await buildHomeAboutFixture();
try {
  const migrated = fixture.routes.filter((route) => HOME_ABOUT_IDS.has(route.routeId));
  assert.equal(migrated.length, 10); assertions += 1;
  assert.deepEqual(Object.keys(accepted.documents).sort(), migrated.map((route) => route.output).sort()); assertions += 1;
  for (const route of migrated) {
    const reactHtml = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
    /* #32A: the accepted contract is pinned with the upstream icon stylesheet. */
    const actual = documentContract(iconSubsetAcceptedBase(reactHtml, route.output), { route: route.output, source: "current" });
    const expected = accepted.documents[route.output];
    for (const region of ["head", "document", "header", "main", "footer"]) {
      assert.deepEqual(actual[region], expected[region], `${route.pathname}: accepted ${region} contract drift`);
      assertions += 1;
    }
    assert.match(reactHtml, new RegExp(`<html[^>]*lang="${route.locale}"[^>]*data-route-locale="${route.locale}"`)); assertions += 1;
    assert.match(reactHtml, /<main\b[^>]*data-react-main[^>]*data-prerendered="true"/); assertions += 1;
    assert.equal((reactHtml.match(/<a\b[^>]*aria-current="page"[^>]*>/g) || []).length, 1, `${route.pathname}: exactly one current navigation link`); assertions += 1;
  }
  const emittedHome = fs.readFileSync(path.join(fixture.mixed, "index.html"), "utf8");
  const home = iconSubsetAcceptedBase(emittedHome, "index.html");
  for (const [label, mutant] of [
    ["a document that still loads the upstream icon stylesheet", home],
    ["a document that loads both icon stylesheets", emittedHome.replace(ICON_SUBSET_LINK, `${ICON_SUBSET_LINK}${ICON_UPSTREAM_LINK}`)],
    ["a duplicated icon stylesheet", emittedHome.replace(ICON_SUBSET_LINK, `${ICON_SUBSET_LINK}${ICON_SUBSET_LINK}`)],
  ]) {
    assert.throws(() => iconSubsetAcceptedBase(mutant, "index.html"), /#32A/, `G-62 negative control must reject ${label}`); assertions += 1;
  }
  const expectedHomeHead = accepted.documents["index.html"].head;
  const jsonLdMatch = home.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i);
  assert.ok(jsonLdMatch, "Home must contain the accepted Person JSON-LD"); assertions += 1;
  for (const [label, mutant] of [
    ["changed JSON-LD", home.replace('"name":"Kaan Balcı"', '"name":"Changed Person"')],
    ["missing JSON-LD", home.replace(jsonLdMatch[0], "")],
    ["duplicate JSON-LD", home.replace(jsonLdMatch[0], `${jsonLdMatch[0]}${jsonLdMatch[0]}`)],
    ["changed theme bootstrap", home.replace("kaanbalci-site-theme", "changed-theme-key")],
  ]) {
    assert.notDeepEqual(documentContract(mutant, { route: "index.html", source: "current" }).head, expectedHomeHead, `G-62 negative control must reject ${label}`);
    assertions += 1;
  }
  const corruptedJsonLd = home.replace(jsonLdMatch[0], '<script type="application/ld+json">{</script>');
  assert.throws(() => documentContract(corruptedJsonLd, { route: "index.html", source: "current" }), /not valid JSON/, "G-62 negative control must reject corrupted JSON-LD"); assertions += 1;
  const homeContract = documentContract(home, { route: "index.html", source: "current" });
  for (const [label, region, mutate] of [
    ["data attribute removal", "header", (value) => value.replace(' data-availability-badge=""', "")],
    ["ARIA modification", "header", (value) => value.replace(/aria-label="[^"]+"/, 'aria-label="mutated"')],
    ["tabindex removal", "main", (value) => value.replace(' tabindex="-1"', "")],
    ["title modification", "header", (value) => value.replace(/title="[^"]+"/, 'title="mutated"')],
    ["loading removal", "main", (value) => value.replace(' loading="lazy"', "")],
    ["decoding modification", "main", (value) => value.replace(' decoding="async"', ' decoding="sync"')],
    ["fetchpriority modification", "main", (value) => value.replace(' fetchpriority="high"', ' fetchpriority="low"')],
    ["width modification", "header", (value) => value.replace(' width="128"', ' width="127"')],
    ["height modification", "header", (value) => value.replace(' height="128"', ' height="127"')],
    ["href modification", "header", (value) => value.replace('class="brand" href="/"', 'class="brand" href="/mutant/"')],
    ["target removal", "footer", (value) => value.replace('href="https://github.com/UAJOP" target="_blank"', 'href="https://github.com/UAJOP"')],
    ["rel modification", "footer", (value) => value.replace('href="https://github.com/UAJOP" target="_blank" rel="noopener noreferrer"', 'href="https://github.com/UAJOP" target="_blank" rel="nofollow"')],
    ["html lang modification", "document", (value) => value.replace('lang="en"', 'lang="xx"')],
    ["html locale marker removal", "document", (value) => value.replace(' data-route-locale="en"', "")],
    ["body attribute modification", "document", (value) => value.replace('data-page="home"', 'data-page="mutant"')],
  ]) {
    const mutant = mutate(home);
    assert.notEqual(mutant, home, `G-62 ${label} fixture must mutate the document`); assertions += 1;
    const candidate = documentContract(mutant, { route: "index.html", source: "current" });
    assert.notDeepEqual(candidate[region], homeContract[region], `G-62 must reject ${label}`); assertions += 1;
  }
  assert.notDeepEqual(
    attributes("<main hidden></main>", { route: "synthetic.html", region: "main", source: "current" }),
    attributes("<main></main>", { route: "synthetic.html", region: "main", source: "current" }),
    "G-62 must retain boolean attributes",
  ); assertions += 1;
  assert.throws(
    () => documentContract(home.replace(' aria-current="page"', ""), { route: "index.html", source: "current" }),
    /aria-current exception expected/,
    "G-62 must reject removal of the explicit aria-current improvement",
  ); assertions += 1;
  assert.throws(
    () => documentContract(home.replace(" data-react-main=\"\"", ""), { route: "index.html", source: "current" }),
    /data-react-main exception expected/,
    "G-62 must reject removal of the React ownership marker",
  ); assertions += 1;
  assert.equal(HOME_ABOUT_ATTRIBUTE_EXCEPTIONS.length, 37, "G-62 exception registry stays route/element/attribute exact"); assertions += 1;
  console.log(`G-62 independent accepted parity passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · 10 documents · authority=${ACCEPTED_REF} · zero contract drift.`);
} finally {
  fixture.cleanup();
}
