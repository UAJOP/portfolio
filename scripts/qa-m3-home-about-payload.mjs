#!/usr/bin/env node
/* Home/About hydration-payload gate. Every Home/About payload must be
 * byte-exact to the accepted #25-B payload contract, which is grounded in the
 * accepted cutover build and independent of the #26 snapshot hashes.
 *
 *   node scripts/qa-m3-home-about-payload.mjs                 fresh build
 *   node scripts/qa-m3-home-about-payload.mjs --root dist-site emitted artifact */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { buildProductionReact } from "./prerender-react.mjs";
import { HOME_ABOUT_IDS, homeAboutRouteRecords } from "./m3-home-about-fixture.mjs";
import { HOME_ABOUT_DOCUMENTS, M3_26_SNAPSHOT_FILE, bundleNormalized, digest } from "./m3-26-accepted-snapshot.mjs";
import { HOME_ABOUT_PAYLOAD_FILE, assertHomeAboutPayload, extractMainPayload, loadHomeAboutPayloadContract } from "./m3-25b-home-about-payload.mjs";

const rootAt = process.argv.indexOf("--root");
const requestedRoot = rootAt >= 0 ? path.resolve(ROOT, process.argv[rootAt + 1]) : null;
if (requestedRoot && !fs.existsSync(requestedRoot)) throw new Error(`payload gate root does not exist: ${requestedRoot}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "m3-25b-payload-"));
let assertions = 0;
try {
  const root = requestedRoot || path.join(temp, "react");
  if (!requestedRoot) await buildProductionReact({ outputDirectory: root, routes: homeAboutRouteRecords().filter((route) => HOME_ABOUT_IDS.has(route.routeId)) });
  const contract = loadHomeAboutPayloadContract();
  const documents = Object.fromEntries(HOME_ABOUT_DOCUMENTS.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  for (const file of HOME_ABOUT_DOCUMENTS) {
    assertHomeAboutPayload(documents[file], file, contract);
    assertions += 1;
  }

  /* Payload mutations use the production serializer, so only the intended
   * change differs; an unmodified round trip must be byte-identical. */
  const serialize = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
  const withPayload = (html, file, mutate) => {
    const text = extractMainPayload(html, file);
    assert.equal(serialize(JSON.parse(text)), text, `${file}: payload round trip must be exact`);
    return html.replace(text, () => serialize(mutate(JSON.parse(text))));
  };
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, M3_26_SNAPSHOT_FILE), "utf8"));
  const snapshotAccepts = (html, file, homeAbout) => digest(Buffer.from(bundleNormalized(html))) === homeAbout[file].bundleNormalizedSha256;

  /* Coordinated drift: each payload changes and the #26 snapshot hashes are
   * re-pinned to the drifted documents. The #26 check alone then accepts all
   * ten; the payload contract must still reject every one. */
  const payloadDrifts = [
    ["catalog prop leaked into Home/About", (props) => ({ ...props, structure: null })],
    ["unreviewed field", (props) => ({ drift: "unreviewed", ...props })],
    ["copy value changed", (props) => ({ ...props, copy: Object.fromEntries(Object.entries(props.copy).map(([key, value], index) => [key, index === 0 ? `${value} (changed)` : value])) })],
    ["keys reordered", ({ buildLog, ...rest }) => ({ buildLog, ...rest })],
  ];
  for (const [name, mutate] of payloadDrifts) {
    const drifted = Object.fromEntries(HOME_ABOUT_DOCUMENTS.map((file) => [file, withPayload(documents[file], file, mutate)]));
    const repinned = structuredClone(snapshot.homeAbout);
    for (const file of HOME_ABOUT_DOCUMENTS) repinned[file].bundleNormalizedSha256 = digest(Buffer.from(bundleNormalized(drifted[file])));
    for (const file of HOME_ABOUT_DOCUMENTS) {
      assert.notEqual(drifted[file], documents[file], `${name}: control must mutate ${file}`);
      assert.equal(snapshotAccepts(drifted[file], file, snapshot.homeAbout), false, `${name}: committed #26 snapshot must reject ${file}`);
      assert.equal(snapshotAccepts(drifted[file], file, repinned), true, `${name}: re-pinned #26 snapshot accepts ${file}`);
      assert.throws(() => assertHomeAboutPayload(drifted[file], file, contract), /payload/, `${name} + re-pinned #26 snapshot negative control did not fail for ${file}`);
      assertions += 4;
    }
  }

  const home = documents["index.html"];
  const homePayload = extractMainPayload(home, "index.html");
  const structuralControls = [
    ["another locale's payload", home.replace(homePayload, () => extractMainPayload(documents["tr/index.html"], "tr/index.html"))],
    ["missing payload", home.replace(/<script id="react-main-props"[\s\S]*?<\/script>/, "")],
    ["duplicate payload", home.replace("</body>", `<script id="react-main-props" type="application/json">${homePayload}</script></body>`)],
  ];
  for (const [name, mutated] of structuralControls) {
    assert.notEqual(mutated, home, `${name}: control must mutate the document`);
    assert.throws(() => assertHomeAboutPayload(mutated, "index.html", contract), undefined, `${name} negative control did not fail`);
    assertions += 2;
  }

  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, HOME_ABOUT_PAYLOAD_FILE), "utf8"));
  const contractControls = [
    ["contract missing a document", (value) => { delete value.documents["about/index.html"]; }],
    ["contract tied to another ref", (value) => { value.acceptedRef = "34fdfad01f63004ed10d616a7b061e3996c28150"; }],
  ];
  for (const [name, mutate] of contractControls) {
    const value = structuredClone(committed);
    mutate(value);
    const file = path.join(temp, "contract.json");
    fs.writeFileSync(file, JSON.stringify(value));
    assert.throws(() => loadHomeAboutPayloadContract(file), undefined, `${name} negative control did not fail`);
    assertions += 1;
  }
  const controls = payloadDrifts.length + structuralControls.length + contractControls.length;
  console.log(`Home/About payload contract passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · ${HOME_ABOUT_DOCUMENTS.length} documents byte-exact to #25-B ${contract.acceptedRef} · ${controls} negative controls (${payloadDrifts.length} with the #26 snapshot re-pinned) · git-history=none.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
