/* Exact Home/About hydration-payload contract, grounded in the accepted #25-B
 * cutover build (24be2f8) independently of the #26 acceptance snapshot.
 *
 * The #26 snapshot pins Home/About only as self-recorded whole-document
 * hashes, and G-62 pins the head/header/main/footer contracts but not the
 * `#react-main-props` payload. This contract holds, per document, the digest of
 * the exact payload text the accepted #25-B build emitted and its top-level
 * key order. It holds no copy: re-pinning the #26 snapshot cannot move it, and
 * only `generate-m3-25b-home-about-payload.mjs` (maintainer, needs history)
 * derives it, by building the accepted commit itself. QA never reads history. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { HOME_ABOUT_DOCUMENTS } from "./m3-26-accepted-snapshot.mjs";

export const HOME_ABOUT_PAYLOAD_REF = "24be2f8159a0925dc00f29375ea8740738214df3";
export const HOME_ABOUT_PAYLOAD_FILE = "data/site/m3-25b-home-about-payload.json";
const PAYLOAD = /<script id="react-main-props" type="application\/json">([\s\S]*?)<\/script>/g;

export const payloadDigest = (text) => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

/** The single hydration payload of a production React document, verbatim. */
export function extractMainPayload(html, file) {
  const matches = [...String(html).matchAll(PAYLOAD)];
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one react-main-props payload, found ${matches.length}`);
  return matches[0][1];
}

export function payloadRecord(html, file) {
  const text = extractMainPayload(html, file);
  return { sha256: payloadDigest(text), keys: Object.keys(JSON.parse(text)) };
}

export function loadHomeAboutPayloadContract(file = path.join(ROOT, HOME_ABOUT_PAYLOAD_FILE)) {
  const contract = JSON.parse(fs.readFileSync(file, "utf8"));
  if (contract.schemaVersion !== 1 || contract.acceptedRef !== HOME_ABOUT_PAYLOAD_REF || contract.algorithm !== "sha256") {
    throw new Error("unsupported #25-B Home/About payload contract");
  }
  if (JSON.stringify(Object.keys(contract.documents || {}).sort()) !== JSON.stringify([...HOME_ABOUT_DOCUMENTS].sort())) {
    throw new Error("#25-B payload contract must pin exactly the ten Home/About documents");
  }
  return contract;
}

/** Throws unless the document's payload is byte-exact to the accepted #25-B payload. */
export function assertHomeAboutPayload(html, file, contract = loadHomeAboutPayloadContract()) {
  const expected = contract.documents[file];
  if (!expected) throw new Error(`${file} is not a pinned Home/About document`);
  const actual = payloadRecord(html, file);
  if (JSON.stringify(actual.keys) !== JSON.stringify(expected.keys)) {
    throw new Error(`${file}: payload keys ${actual.keys.join(",")} differ from accepted #25-B ${expected.keys.join(",")}`);
  }
  if (actual.sha256 !== expected.sha256) throw new Error(`${file}: payload drifted from the accepted #25-B payload`);
}
