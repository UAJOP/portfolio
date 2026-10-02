/* Hermetic #26 acceptance authority. QA reads the committed snapshot and the
 * previously accepted artifact manifests; it never reads git history, so it
 * runs unchanged in shallow CI checkouts. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";
import { canonicalArtifactBytes, TEXT_EOL_NORMALIZATION } from "./artifact-parity.mjs";

export const M3_26_ACCEPTED_REF = "24be2f8159a0925dc00f29375ea8740738214df3";
export const M3_26_SNAPSHOT_FILE = "data/site/m3-26-accepted-snapshot.json";
const LOCALE_PREFIXES = ["", "tr/", "de/", "es/", "fr/"];
export const WORKS_GAMES_DOCUMENTS = Object.freeze(LOCALE_PREFIXES.flatMap((prefix) => [`${prefix}works/index.html`, `${prefix}games/index.html`]));
export const HOME_ABOUT_DOCUMENTS = Object.freeze(LOCALE_PREFIXES.flatMap((prefix) => [`${prefix}index.html`, `${prefix}about/index.html`]));

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
export const digest = (bytes) => crypto.createHash("sha256").update(canonicalArtifactBytes(Buffer.from(bytes), TEXT_EOL_NORMALIZATION)).digest("hex");
/* The shared React client is content-addressed; #26 rebuilds it by design. */
export const bundleNormalized = (html) => String(html).replace(/\/assets-react\/production-main-[A-Za-z0-9_-]+\.js/g, "/assets-react/production-main-BUNDLE.js");

let cached = null;

/** Every artifact path accepted at 24be2f8 except the React-owned Home/About
 * documents and bundle: the #25-A manifest overridden by the #25-B delta. */
export function acceptedArtifactManifest() {
  const baseline = readJson("data/site/m3-25a-accepted-artifact.json");
  const delta = readJson("data/site/m3-25b-public-delta.json");
  const files = new Map(baseline.files.map((entry) => [entry.path, entry]));
  for (const entry of delta.files) files.set(entry.path, entry);
  for (const file of HOME_ABOUT_DOCUMENTS) files.delete(file);
  return files;
}

export function loadAcceptedSnapshot() {
  if (cached) return cached;
  const snapshot = readJson(M3_26_SNAPSHOT_FILE);
  if (snapshot.schemaVersion !== 1 || snapshot.acceptedRef !== M3_26_ACCEPTED_REF) throw new Error("unsupported #26 acceptance snapshot");
  const accepted = acceptedArtifactManifest();
  const documents = Object.keys(snapshot.documents || {});
  if (JSON.stringify([...documents].sort()) !== JSON.stringify([...WORKS_GAMES_DOCUMENTS].sort())) throw new Error("#26 snapshot must hold exactly the ten Works/Games documents");
  for (const file of WORKS_GAMES_DOCUMENTS) {
    const entry = snapshot.documents[file];
    const sha = digest(entry.content);
    if (sha !== entry.sha256) throw new Error(`${file}: snapshot content does not match its recorded hash`);
    /* Independent anchor: the same bytes were already accepted by #25-A. */
    if (accepted.get(file)?.sha256 !== sha) throw new Error(`${file}: snapshot is not the independently accepted #25-A document`);
  }
  if (JSON.stringify(Object.keys(snapshot.homeAbout || {}).sort()) !== JSON.stringify([...HOME_ABOUT_DOCUMENTS].sort())) throw new Error("#26 snapshot must pin all ten Home/About documents");
  cached = snapshot;
  return snapshot;
}

export function acceptedDocument(file) {
  const entry = loadAcceptedSnapshot().documents[file];
  if (!entry) throw new Error(`${file} is not a #26 accepted document`);
  return entry.content;
}

export function acceptedMain(file) {
  const main = acceptedDocument(file).match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) throw new Error(`${file}: accepted document has no main`);
  return main[1];
}

export function acceptedHomeAboutHash(file) {
  const entry = loadAcceptedSnapshot().homeAbout[file];
  if (!entry) throw new Error(`${file} is not a pinned Home/About document`);
  return entry.bundleNormalizedSha256;
}
