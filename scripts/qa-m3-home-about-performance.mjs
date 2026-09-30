#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildHomeAboutFixture, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";
import { ROOT } from "./i18n-catalog.mjs";

const budget = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-25b-performance-budget.json"), "utf8"));
assert.equal(budget.schemaVersion, 1);
assert.equal(budget.acceptedRef, "34fdfad01f63004ed10d616a7b061e3996c28150");
const limits = budget.budgets;
const fixture = await buildHomeAboutFixture();
try {
  const bundleDirectory = path.join(fixture.mixed, "assets-react");
  const bundles = fs.readdirSync(bundleDirectory).filter((file) => file.endsWith(".js"));
  assert.equal(bundles.length, 1, "Home/About must ship one namespaced client bundle");
  const bundle = fs.readFileSync(path.join(bundleDirectory, bundles[0]));
  const documents = fixture.routes.filter((route) => HOME_ABOUT_IDS.has(route.routeId)).map((route) => {
    const html = fs.readFileSync(path.join(fixture.mixed, route.output));
    const source = html.toString("utf8");
    const payload = source.match(/<script id="react-main-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(payload, `${route.pathname}: hydration payload missing`);
    return {
      pathname: route.pathname,
      documentBytes: html.byteLength,
      hydrationPayloadBytes: Buffer.byteLength(payload),
    };
  });
  const report = {
    schemaVersion: 1,
    client: {
      file: bundles[0],
      rawBytes: bundle.byteLength,
      gzipBytes: gzipSync(bundle).byteLength,
      addedFirstPartyJsRawBytes: bundle.byteLength,
      addedFirstPartyJsGzipBytes: gzipSync(bundle).byteLength,
    },
    documents,
    maxima: {
      documentBytes: Math.max(...documents.map((item) => item.documentBytes)),
      hydrationPayloadBytes: Math.max(...documents.map((item) => item.hydrationPayloadBytes)),
    },
    budgets: limits,
  };
  assert.ok(report.client.rawBytes <= limits.clientBundleRawBytes, "client bundle raw-byte budget exceeded");
  assert.ok(report.client.gzipBytes <= limits.clientBundleGzipBytes, "client bundle gzip-byte budget exceeded");
  assert.ok(report.maxima.documentBytes <= limits.documentMaxBytes, "emitted document byte budget exceeded");
  assert.ok(report.maxima.hydrationPayloadBytes <= limits.hydrationPayloadMaxBytes, "hydration payload byte budget exceeded");
  const reportDirectory = path.join(ROOT, "qa-results");
  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(path.join(reportDirectory, "m3-25b-home-about-performance.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`G-63 performance budget passed. client=${report.client.rawBytes}B raw/${report.client.gzipBytes}B gzip · documentMax=${report.maxima.documentBytes}B · payloadMax=${report.maxima.hydrationPayloadBytes}B · routes=10.`);
} finally {
  fixture.cleanup();
}
