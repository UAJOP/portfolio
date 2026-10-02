#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildWorksGamesFixture, WORKS_GAMES_IDS } from "./m3-works-games-fixture.mjs";
import { ROOT } from "./i18n-catalog.mjs";

const budget = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-26-performance-budget.json"), "utf8"));
const phase27 = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-27-performance-budget.json"), "utf8"));
assert.equal(budget.schemaVersion, 1);
assert.equal(budget.acceptedRef, "24be2f8159a0925dc00f29375ea8740738214df3");
assert.equal(phase27.acceptedBaseCommit, "df39ea32f34eacf1ee68ee6d0c8b6d464eb7d6d8");
const limits = budget.budgets;
const phase27Limits = phase27.budgets;
const fixture = await buildWorksGamesFixture();
try {
  const bundleDirectory = path.join(fixture.mixed, "assets-react");
  const bundles = fs.readdirSync(bundleDirectory).filter((file) => file.endsWith(".js"));
  assert.equal(bundles.length, 1, "production React routes must share one namespaced client bundle");
  const bundle = fs.readFileSync(path.join(bundleDirectory, bundles[0]));
  const documents = fixture.routes.filter((route) => WORKS_GAMES_IDS.has(route.routeId)).map((route) => {
    const html = fs.readFileSync(path.join(fixture.mixed, route.output));
    const source = html.toString("utf8");
    const payload = source.match(/<script id="react-main-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    const recruiterPayload = source.match(/<script id="react-recruiter-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    const recruiterStart = source.indexOf('<div id="react-recruiter-root"');
    const footerStart = source.indexOf('<footer class="site-footer">', recruiterStart);
    assert.ok(payload, `${route.pathname}: hydration payload missing`);
    assert.ok(recruiterPayload && recruiterStart >= 0 && footerStart > recruiterStart, `${route.pathname}: #27 recruiter SSR/payload missing`);
    return { pathname: route.pathname, documentBytes: html.byteLength, hydrationPayloadBytes: Buffer.byteLength(payload), recruiterPayloadBytes: Buffer.byteLength(recruiterPayload), recruiterSsrBytes: Buffer.byteLength(source.slice(recruiterStart, footerStart)) };
  });
  const report = {
    schemaVersion: 1,
    client: { file: bundles[0], rawBytes: bundle.byteLength, gzipBytes: gzipSync(bundle).byteLength },
    documents,
    maxima: {
      documentBytes: Math.max(...documents.map((item) => item.documentBytes)),
      hydrationPayloadBytes: Math.max(...documents.map((item) => item.hydrationPayloadBytes)),
      recruiterPayloadBytes: Math.max(...documents.map((item) => item.recruiterPayloadBytes)),
      recruiterSsrBytes: Math.max(...documents.map((item) => item.recruiterSsrBytes)),
    },
    budgets: limits,
  };
  assert.ok(report.client.rawBytes <= limits.clientBundleRawBytes, "client bundle raw-byte budget exceeded");
  assert.ok(report.client.gzipBytes <= limits.clientBundleGzipBytes, "client bundle gzip-byte budget exceeded");
  assert.ok(report.maxima.documentBytes <= limits.documentMaxBytes + phase27Limits.documentIncrementMaxBytes, "emitted catalog document byte budget exceeded");
  assert.ok(report.maxima.hydrationPayloadBytes <= limits.hydrationPayloadMaxBytes, "catalog hydration payload byte budget exceeded");
  assert.ok(report.maxima.recruiterPayloadBytes <= phase27Limits.recruiterPayloadMaxBytes, "#27 recruiter payload byte budget exceeded");
  assert.ok(report.maxima.recruiterSsrBytes <= phase27Limits.recruiterSsrMaxBytes, "#27 recruiter SSR byte budget exceeded");
  fs.mkdirSync(path.join(ROOT, "qa-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "qa-results/m3-26-works-games-performance.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`G-66 Works/Games performance passed. client=${report.client.rawBytes}B raw/${report.client.gzipBytes}B gzip · documentMax=${report.maxima.documentBytes}B · mainPayloadMax=${report.maxima.hydrationPayloadBytes}B · recruiter=${report.maxima.recruiterSsrBytes}B SSR/${report.maxima.recruiterPayloadBytes}B payload · routes=10.`);
} finally {
  fixture.cleanup();
}
