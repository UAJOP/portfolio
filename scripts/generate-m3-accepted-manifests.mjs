#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";
import { canonicalArtifactBytes, normalizationForArtifactPath, TEXT_EOL_NORMALIZATION } from "./artifact-parity.mjs";
import { documentContract } from "./home-about-contract.mjs";

const CUTOVER_REF = "34fdfad01f63004ed10d616a7b061e3996c28150";
const DELTA_REF = "4d0e37b496f70d851397d9976b2022350d11edd6";
const deltaPaths = [
  "i18n/pack-de-core.js", "i18n/pack-es-core.js", "i18n/pack-fr-core.js", "i18n/pack-tr-core.js",
  "js/core/locale.js", "js/core/i18n-runtime.js", "js/features/creative.js", "portfolio-v2.js",
];
const routePaths = ["index.html", "about/index.html", ...["tr", "de", "es", "fr"].flatMap((locale) => [`${locale}/index.html`, `${locale}/about/index.html`])];

const git = (args, encoding = "utf8") => execFileSync("git", args, { cwd: ROOT, encoding, maxBuffer: 20 * 1024 * 1024 });
const resolve = (ref) => git(["rev-parse", `${ref}^{commit}`]).trim();
const argument = (name) => {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`missing ${name}`);
  return process.argv[at + 1];
};
const requestedCutover = resolve(argument("--cutover-ref"));
const requestedDelta = resolve(argument("--delta-ref"));
if (requestedCutover !== CUTOVER_REF || requestedDelta !== DELTA_REF) {
  throw new Error(`accepted manifests require cutover=${CUTOVER_REF} and delta=${DELTA_REF}`);
}

const acceptedBuildLog = JSON.parse(git(["show", `${requestedCutover}:data/portfolio/build-log.json`]));
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
function withHistoricalBuildLog(document, file) {
  if (!/(^|\/)index\.html$/.test(file) || /about\/index\.html$/.test(file)) return document;
  const locale = file.includes("/") ? file.split("/")[0] : "en";
  const overlay = ["de", "es", "fr"].includes(locale)
    ? JSON.parse(git(["show", `${requestedCutover}:data/i18n/packs/${locale}/content.json`]))
    : {};
  const labels = { shipped: "Shipped", building: "Building", integration: "Integration" };
  const markup = acceptedBuildLog.slice(0, 3).map((entry, index) => {
    const title = locale === "en" ? entry.title.en : locale === "tr" ? entry.title.tr : overlay[`buildLog.[${index}].title`];
    const detail = locale === "en" ? entry.detail.en : locale === "tr" ? entry.detail.tr : overlay[`buildLog.[${index}].detail`];
    if (!title || !detail) throw new Error(`${file}: accepted build log copy missing at index ${index}`);
    return `<article class="build-log-item"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</time><div><div class="build-log-meta"><span>${escapeHtml(entry.area)}</span><span class="build-log-status is-${escapeHtml(entry.status)}">${escapeHtml(labels[entry.status] || entry.status)}</span></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div></article>`;
  }).join("");
  return document.replace(/(<div\b[^>]*data-build-log\b[^>]*>)[\s\S]*?(<\/div>)/i, `$1${markup}$2`);
}

const cutover = {
  schemaVersion: 2,
  acceptedRef: requestedCutover,
  algorithm: "sha256",
  documents: Object.fromEntries(routePaths.map((file) => [file, documentContract(withHistoricalBuildLog(git(["show", `${requestedCutover}:${file}`]), file))])),
};
const publicDelta = {
  schemaVersion: 2,
  acceptedBaseCommit: requestedDelta,
  algorithm: "sha256",
  textEolCanonicalization: TEXT_EOL_NORMALIZATION,
  fileCount: deltaPaths.length,
  files: deltaPaths.map((file) => {
    const normalization = normalizationForArtifactPath(file);
    const bytes = git(["show", `${requestedDelta}:${file}`], null);
    const sha256 = crypto.createHash("sha256").update(canonicalArtifactBytes(bytes, normalization)).digest("hex");
    return { path: file, normalization, sha256 };
  }),
};

for (const [file, value] of [
  ["data/site/m3-25b-home-about-accepted.json", cutover],
  ["data/site/m3-25b-public-delta.json", publicDelta],
]) {
  fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${file}`);
}
