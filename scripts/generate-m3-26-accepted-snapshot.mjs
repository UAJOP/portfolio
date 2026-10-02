#!/usr/bin/env node
/* Maintainer tool (needs full git history): writes or checks the committed
 * #26 acceptance snapshot so QA never reads git history at gate time.
 *
 *   node scripts/generate-m3-26-accepted-snapshot.mjs --accepted-artifact <24be2f8 dist-site>
 *   node scripts/generate-m3-26-accepted-snapshot.mjs --check --accepted-artifact <dir>
 *
 * The ten Works/Games documents are stored verbatim. Home/About documents are
 * stored as hashes with the content-addressed React bundle name normalized,
 * because #26 legitimately rebuilds that shared bundle. CI verifies the
 * documents hermetically against the independently accepted #25-A manifest. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import {
  M3_26_ACCEPTED_REF,
  M3_26_SNAPSHOT_FILE,
  WORKS_GAMES_DOCUMENTS,
  HOME_ABOUT_DOCUMENTS,
  digest,
  bundleNormalized,
} from "./m3-26-accepted-snapshot.mjs";

const argument = (name) => (process.argv.includes(name) ? path.resolve(process.argv[process.argv.indexOf(name) + 1]) : null);
const acceptedArtifact = argument("--accepted-artifact");
if (!acceptedArtifact) throw new Error("usage: [--check] --accepted-artifact <dist-site built from 24be2f8>");
const show = (file) => execFileSync("git", ["show", `${M3_26_ACCEPTED_REF}:${file}`], { cwd: ROOT, maxBuffer: 30 * 1024 * 1024 });

const snapshot = {
  schemaVersion: 1,
  acceptedRef: M3_26_ACCEPTED_REF,
  algorithm: "sha256",
  normalization: "crlf-to-lf-bytewise",
  documents: Object.fromEntries(WORKS_GAMES_DOCUMENTS.map((file) => {
    const source = show(file);
    const emitted = fs.readFileSync(path.join(acceptedArtifact, file));
    if (digest(source) !== digest(emitted)) throw new Error(`${file}: accepted source and emitted document differ`);
    return [file, { sha256: digest(source), content: source.toString("utf8").replace(/\r\n/g, "\n") }];
  })),
  homeAbout: Object.fromEntries(HOME_ABOUT_DOCUMENTS.map((file) => [
    file,
    { bundleNormalizedSha256: digest(Buffer.from(bundleNormalized(fs.readFileSync(path.join(acceptedArtifact, file), "utf8")))) },
  ])),
};
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
const target = path.join(ROOT, M3_26_SNAPSHOT_FILE);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== serialized) throw new Error(`${M3_26_SNAPSHOT_FILE} differs from ${M3_26_ACCEPTED_REF}`);
  console.log(`#26 acceptance snapshot matches ${M3_26_ACCEPTED_REF}.`);
} else {
  fs.writeFileSync(target, serialized, "utf8");
  console.log(`#26 acceptance snapshot written: ${WORKS_GAMES_DOCUMENTS.length} documents · ${HOME_ABOUT_DOCUMENTS.length} Home/About hashes.`);
}
