#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHomeAboutFixture, homeAboutRouteRecords, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";
import { documentContract } from "./home-about-contract.mjs";
import { ROOT } from "./i18n-catalog.mjs";
import { buildProductionReact } from "./prerender-react.mjs";

const ACCEPTED_REF = "34fdfad01f63004ed10d616a7b061e3996c28150";
const accepted = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-25b-home-about-accepted.json"), "utf8"));
assert.equal(accepted.schemaVersion, 2);
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
    const actual = documentContract(reactHtml);
    const expected = accepted.documents[route.output];
    for (const region of ["head", "header", "main", "footer"]) {
      assert.deepEqual(actual[region], expected[region], `${route.pathname}: accepted ${region} contract drift`);
      assertions += 1;
    }
    assert.match(reactHtml, new RegExp(`<html[^>]*lang="${route.locale}"[^>]*data-route-locale="${route.locale}"`)); assertions += 1;
    assert.match(reactHtml, /<main\b[^>]*data-react-main[^>]*data-prerendered="true"/); assertions += 1;
  }
  const home = fs.readFileSync(path.join(fixture.mixed, "index.html"), "utf8");
  const expectedHomeHead = accepted.documents["index.html"].head;
  const jsonLdMatch = home.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i);
  assert.ok(jsonLdMatch, "Home must contain the accepted Person JSON-LD"); assertions += 1;
  for (const [label, mutant] of [
    ["changed JSON-LD", home.replace('"name":"Kaan Balcı"', '"name":"Changed Person"')],
    ["missing JSON-LD", home.replace(jsonLdMatch[0], "")],
    ["duplicate JSON-LD", home.replace(jsonLdMatch[0], `${jsonLdMatch[0]}${jsonLdMatch[0]}`)],
    ["changed theme bootstrap", home.replace("kaanbalci-site-theme", "changed-theme-key")],
  ]) {
    assert.notDeepEqual(documentContract(mutant).head, expectedHomeHead, `G-62 negative control must reject ${label}`);
    assertions += 1;
  }
  const corruptedJsonLd = home.replace(jsonLdMatch[0], '<script type="application/ld+json">{</script>');
  assert.throws(() => documentContract(corruptedJsonLd), /not valid JSON/, "G-62 negative control must reject corrupted JSON-LD"); assertions += 1;
  console.log(`G-62 independent accepted parity passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · 10 documents · authority=${ACCEPTED_REF} · zero contract drift.`);
} finally {
  fixture.cleanup();
}
