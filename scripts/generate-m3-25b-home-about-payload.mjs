#!/usr/bin/env node
/* Maintainer tool (needs full git history): derives or checks the #25-B
 * Home/About hydration-payload contract from the accepted cutover commit
 * itself, never from the current renderer.
 *
 *   node scripts/generate-m3-25b-home-about-payload.mjs           write
 *   node scripts/generate-m3-25b-home-about-payload.mjs --check   verify
 *
 * It exports 24be2f8 with `git archive` into a temporary directory, runs that
 * commit's own production build there, and records each Home/About payload's
 * digest and top-level key order. As a consistency check, the accepted build's
 * documents must also equal the #26 snapshot's Home/About hashes. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { HOME_ABOUT_DOCUMENTS, acceptedHomeAboutHash, bundleNormalized, digest } from "./m3-26-accepted-snapshot.mjs";
import { HOME_ABOUT_PAYLOAD_FILE, HOME_ABOUT_PAYLOAD_REF, payloadRecord } from "./m3-25b-home-about-payload.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-25b-payload-"));
try {
  const accepted = path.join(temp, "accepted");
  fs.mkdirSync(accepted);
  const archive = path.join(temp, "accepted.tar");
  execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--output", archive, HOME_ABOUT_PAYLOAD_REF], { cwd: ROOT, stdio: "pipe" });
  /* Relative paths: GNU tar reads a drive letter as a remote host. */
  execFileSync("tar", ["-xf", path.join("..", path.basename(archive))], { cwd: accepted, stdio: "pipe" });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(accepted, "node_modules"), "junction");
  execFileSync(process.execPath, ["scripts/build-production-site.mjs"], { cwd: accepted, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
  const documents = {};
  for (const file of HOME_ABOUT_DOCUMENTS) {
    const html = fs.readFileSync(path.join(accepted, "dist-site", file), "utf8");
    if (digest(Buffer.from(bundleNormalized(html))) !== acceptedHomeAboutHash(file)) throw new Error(`${file}: accepted build disagrees with the #26 snapshot`);
    documents[file] = payloadRecord(html, file);
  }
  const contract = { schemaVersion: 1, acceptedRef: HOME_ABOUT_PAYLOAD_REF, algorithm: "sha256", scope: "react-main-props payload text, verbatim", documents };
  const serialized = `${JSON.stringify(contract, null, 2)}\n`;
  const target = path.join(ROOT, HOME_ABOUT_PAYLOAD_FILE);
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== serialized) throw new Error(`${HOME_ABOUT_PAYLOAD_FILE} differs from ${HOME_ABOUT_PAYLOAD_REF}`);
    console.log(`#25-B Home/About payload contract matches ${HOME_ABOUT_PAYLOAD_REF}.`);
  } else {
    fs.writeFileSync(target, serialized, "utf8");
    console.log(`#25-B Home/About payload contract written: ${HOME_ABOUT_DOCUMENTS.length} documents from ${HOME_ABOUT_PAYLOAD_REF}.`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
