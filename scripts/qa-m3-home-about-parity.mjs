#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHomeAboutFixture, homeAboutRouteRecords, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";
import { documentContract } from "./home-about-contract.mjs";
import { ROOT } from "./i18n-catalog.mjs";

const ACCEPTED_REF = "34fdfad01f63004ed10d616a7b061e3996c28150";
const accepted = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-25b-home-about-accepted.json"), "utf8"));
assert.equal(accepted.schemaVersion, 1);
assert.equal(accepted.acceptedRef, ACCEPTED_REF);
assert.equal(accepted.algorithm, "sha256");

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(process.argv[rootAt + 1]) : null;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`G-62 root does not exist: ${requestedRoot}`);
const fixture = requestedRoot
  ? { mixed: requestedRoot, routes: homeAboutRouteRecords(), cleanup() {} }
  : await buildHomeAboutFixture();
let assertions = 3;
try {
  const migrated = fixture.routes.filter((route) => HOME_ABOUT_IDS.has(route.routeId));
  assert.equal(migrated.length, 10); assertions += 1;
  assert.deepEqual(Object.keys(accepted.documents).sort(), migrated.map((route) => route.output).sort()); assertions += 1;
  for (const route of migrated) {
    const reactHtml = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
    const actual = documentContract(reactHtml);
    const expected = accepted.documents[route.output];
    for (const region of ["head", "header", "main", "footer"]) {
      assert.equal(actual[region], expected[region], `${route.pathname}: accepted ${region} contract drift`);
      assertions += 1;
    }
    assert.match(reactHtml, new RegExp(`<html[^>]*lang="${route.locale}"[^>]*data-route-locale="${route.locale}"`)); assertions += 1;
    assert.match(reactHtml, /<main\b[^>]*data-react-main[^>]*data-prerendered="true"/); assertions += 1;
  }
  console.log(`G-62 independent accepted parity passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · 10 documents · authority=${ACCEPTED_REF} · zero contract drift.`);
} finally {
  fixture.cleanup();
}
