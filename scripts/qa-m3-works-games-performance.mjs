#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildWorksGamesFixture, WORKS_GAMES_IDS } from "./m3-works-games-fixture.mjs";
import { ROOT } from "./i18n-catalog.mjs";

const budget = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-26-performance-budget.json"), "utf8"));
assert.equal(budget.schemaVersion, 1);
assert.equal(budget.acceptedRef, "24be2f8159a0925dc00f29375ea8740738214df3");
const limits = budget.budgets;
const fixture = await buildWorksGamesFixture();
try {
  const bundleDirectory = path.join(fixture.mixed, "assets-react");
  const bundles = fs.readdirSync(bundleDirectory).filter((file) => file.endsWith(".js"));
  assert.equal(bundles.length, 1, "production React routes must share one namespaced client bundle");
  const bundle = fs.readFileSync(path.join(bundleDirectory, bundles[0]));
  const documents = fixture.routes.filter((route) => WORKS_GAMES_IDS.has(route.routeId)).map((route) => {
    const html = fs.readFileSync(path.join(fixture.mixed, route.output));
    const payload = html.toString("utf8").match(/<script id="react-main-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(payload, `${route.pathname}: hydration payload missing`);
    return { pathname: route.pathname, documentBytes: html.byteLength, hydrationPayloadBytes: Buffer.byteLength(payload) };
  });
  const report = {
    schemaVersion: 1,
    client: { file: bundles[0], rawBytes: bundle.byteLength, gzipBytes: gzipSync(bundle).byteLength },
    documents,
    maxima: {
      documentBytes: Math.max(...documents.map((item) => item.documentBytes)),
      hydrationPayloadBytes: Math.max(...documents.map((item) => item.hydrationPayloadBytes)),
    },
    budgets: limits,
  };
  assert.ok(report.client.rawBytes <= limits.clientBundleRawBytes, "client bundle raw-byte budget exceeded");
  assert.ok(report.client.gzipBytes <= limits.clientBundleGzipBytes, "client bundle gzip-byte budget exceeded");
  assert.ok(report.maxima.documentBytes <= limits.documentMaxBytes, "emitted catalog document byte budget exceeded");
  assert.ok(report.maxima.hydrationPayloadBytes <= limits.hydrationPayloadMaxBytes, "catalog hydration payload byte budget exceeded");
  fs.mkdirSync(path.join(ROOT, "qa-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "qa-results/m3-26-works-games-performance.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`G-66 Works/Games performance passed. client=${report.client.rawBytes}B raw/${report.client.gzipBytes}B gzip · documentMax=${report.maxima.documentBytes}B · payloadMax=${report.maxima.hydrationPayloadBytes}B · routes=10.`);
} finally {
  fixture.cleanup();
}
