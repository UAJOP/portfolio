#!/usr/bin/env node
/**
 * Build the self-hosted Boxicons subset that React-owned documents load
 * (Master 3 #32A).
 *
 * The documents used to load the whole icon set from unpkg: a 12 KB
 * render-blocking stylesheet and a 116 KB font for the few dozen icons the
 * site uses. This writes a stylesheet and a WOFF2 font that carry exactly the
 * icons referenced in the repository, taken unmodified from the pinned
 * `boxicons` package (the same bytes unpkg serves for that version):
 *
 *   css/boxicons-subset.css          every non-icon rule of the upstream
 *                                    stylesheet, verbatim, plus the used
 *                                    icon rules in upstream order
 *   assets/fonts/boxicons-subset.woff2   the same glyphs at the same code points
 *   assets/fonts/boxicons-subset.OFL.txt   the font's licence: the upstream
 *                                    copyright notice and the complete SIL
 *                                    Open Font License 1.1
 *   assets/fonts/boxicons-subset.LICENSE.txt   attribution, what was changed,
 *                                    and the upstream MIT LICENSE file,
 *                                    verbatim, for the stylesheet
 *
 * The licence text comes from scripts/licenses/SIL-OFL-1.1.txt, the official
 * SIL file (https://openfontlicense.org/documents/OFL.txt) pinned by hash.
 * Upstream ships no copy of it and its fonts carry no copyright, licence or
 * trademark metadata, so the published text files are the notice. Upstream
 * declares no Reserved Font Name; generation stops if that ever changes,
 * because the subset keeps the family name `boxicons`.
 *
 * `--check` fails when the committed files no longer match the repository:
 * the stylesheet and both notices must be byte-exact, and the committed font
 * must contain exactly the expected code points (font bytes are not compared,
 * so a different compressor build cannot fail the check).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = path.join(ROOT, "node_modules/boxicons");
export const ICON_VERSION = "2.1.4";
export const ICON_STYLESHEET = "css/boxicons-subset.css";
export const ICON_FONT = "assets/fonts/boxicons-subset.woff2";
export const ICON_LICENSE = "assets/fonts/boxicons-subset.LICENSE.txt";
export const ICON_OFL = "assets/fonts/boxicons-subset.OFL.txt";
export const OFL_SOURCE = "scripts/licenses/SIL-OFL-1.1.txt";
/* sha256 of https://openfontlicense.org/documents/OFL.txt (4599 bytes, LF). */
export const OFL_SOURCE_SHA256 = "1d361a8f8e8ce6e68457dcd93fb56e162e6baa3bbb7e7573a290d44399f6b57e";
/* The placeholder notice the official file opens with; the licence follows it. */
const OFL_PLACEHOLDER = [
  "Copyright (c) <dates>, <Copyright Holder> (<URL|email>),",
  "with Reserved Font Name <Reserved Font Name>.",
  "Copyright (c) <dates>, <additional Copyright Holder> (<URL|email>),",
  "with Reserved Font Name <additional Reserved Font Name>.",
  "Copyright (c) <dates>, <additional Copyright Holder> (<URL|email>).",
  "",
].join("\n");
const UPSTREAM_LICENSE = "(CC-BY-4.0 OR OFL-1.1 OR MIT)";
export const UPSTREAM_COPYRIGHT = "Copyright (c) 2015-2021 Aniket Suvarna";
const ICON_RULE = /\.(bx[sl]?-[a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}/g;
const ICON_CLASS = /\bbx[sl]?-[a-z0-9-]+/g;
const FONT_FACE = /^@font-face\{[^}]*\}/;
/* Every place an icon class can come from: authored and generated documents,
 * the classic runtime, the React sources, and the data and contracts React
 * renders from. A name that is not an upstream icon is ignored, so the scan
 * may be generous. */
const SCAN_ROOTS = ["js", "src/react", "data/site", "data/portfolio", "data/i18n", "i18n"];
const SCAN_ROOT_FILES = /\.(html|js)$/;
const SCAN_SCRIPTS = /^(home-about-react|m3-[\w-]*copy|m3-works-games[\w-]*|site-head|generate-project-pages|generate-localized-routes|localized-html)\.mjs$/;
const TEXT = /\.(html|js|jsx|mjs|json)$/;

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
function walk(directory, files = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) walk(relative, files);
    else if (TEXT.test(entry.name)) files.push(relative);
  }
  return files;
}

function upstreamPackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(UPSTREAM, "package.json"), "utf8"));
  if (manifest.version !== ICON_VERSION) throw new Error(`boxicons ${manifest.version} is installed; the site is pinned to ${ICON_VERSION}`);
  const stylesheet = fs.readFileSync(path.join(UPSTREAM, "css/boxicons.min.css"), "utf8");
  const icons = new Map([...stylesheet.matchAll(ICON_RULE)].map((match) => [match[1], match[2]]));
  if (icons.size < 1500) throw new Error(`unexpected upstream stylesheet: ${icons.size} icon rules`);
  if (manifest.license !== UPSTREAM_LICENSE) throw new Error(`boxicons is now licensed ${manifest.license}; review ${ICON_LICENSE}`);
  const license = fs.readFileSync(path.join(UPSTREAM, "LICENSE"), "utf8").replace(/\r\n/g, "\n");
  const copyright = license.match(/^Copyright \(c\) .+$/gm) || [];
  if (copyright.length !== 1 || copyright[0].trim() !== UPSTREAM_COPYRIGHT) throw new Error(`boxicons copyright notice changed to ${JSON.stringify(copyright)}; review ${ICON_OFL}`);
  const readme = fs.readFileSync(path.join(UPSTREAM, "README.md"), "utf8");
  if (!readme.includes("The fonts files are licensed under SIL OFL 1.1.") || !readme.includes("Other files which are not fonts or icons are licensed under the MIT License.")) {
    throw new Error(`boxicons README no longer states the font and stylesheet licences; review ${ICON_OFL} and ${ICON_LICENSE}`);
  }
  return { stylesheet, icons, license, readme, manifest: JSON.stringify(manifest), font: fs.readFileSync(path.join(UPSTREAM, "fonts/boxicons.ttf")) };
}

/** Every string of a font's `name` table (copyright, licence, trademark, names). */
export async function fontNames(buffer) {
  const { default: fontverter } = await import("fontverter");
  const sfnt = await fontverter.convert(buffer, "truetype");
  let table = -1;
  for (let index = 0; index < sfnt.readUInt16BE(4); index += 1) if (sfnt.toString("latin1", 12 + index * 16, 16 + index * 16) === "name") table = sfnt.readUInt32BE(12 + index * 16 + 8);
  if (table < 0) return [];
  const strings = table + sfnt.readUInt16BE(table + 4);
  const names = [];
  for (let index = 0; index < sfnt.readUInt16BE(table + 2); index += 1) {
    const record = table + 6 + index * 12;
    const bytes = Buffer.from(sfnt.subarray(strings + sfnt.readUInt16BE(record + 10), strings + sfnt.readUInt16BE(record + 10) + sfnt.readUInt16BE(record + 8)));
    names.push({ id: sfnt.readUInt16BE(record + 6), text: sfnt.readUInt16BE(record) === 1 ? bytes.toString("latin1") : bytes.swap16().toString("utf16le") });
  }
  return names;
}

/** OFL condition 3: a Modified Version may not use a Reserved Font Name. The
 * subset keeps the family name `boxicons`, which is only allowed while
 * upstream reserves no name: not in its licence, readme or manifest, and not
 * in the font's own metadata. */
export async function assertNoReservedFontName({ license, readme, manifest, font }) {
  const names = await fontNames(font);
  const sources = { LICENSE: license, "README.md": readme, "package.json": manifest, "font name table": names.map((name) => name.text).join("\n") };
  for (const [source, text] of Object.entries(sources)) {
    if (/reserved\s+font\s+name/i.test(text)) throw new Error(`boxicons ${source} now declares a Reserved Font Name; the subset font must be renamed before it is published`);
  }
  return names;
}

/** The font's licence file: the official text with its placeholder notice
 * replaced by the upstream copyright notice. No Reserved Font Name clause is
 * written because upstream declares none. */
export function iconOfl(official, copyright = UPSTREAM_COPYRIGHT) {
  const text = official.replace(/\r\n/g, "\n");
  if (crypto.createHash("sha256").update(text).digest("hex") !== OFL_SOURCE_SHA256) throw new Error(`${OFL_SOURCE} is not the official SIL Open Font License 1.1 text`);
  if (!text.startsWith(OFL_PLACEHOLDER)) throw new Error(`${OFL_SOURCE} no longer opens with the placeholder copyright notice`);
  return `${copyright}\n${text.slice(OFL_PLACEHOLDER.length)}`;
}

/** Icon classes referenced anywhere a page can get them from, in upstream order. */
export function usedIcons(icons = upstreamPackage().icons) {
  const files = [
    ...fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isFile() && SCAN_ROOT_FILES.test(entry.name) && !entry.name.startsWith("qa-")).map((entry) => entry.name),
    ...fs.readdirSync(path.join(ROOT, "scripts")).filter((name) => SCAN_SCRIPTS.test(name)).map((name) => `scripts/${name}`),
    ...SCAN_ROOTS.flatMap((directory) => walk(directory)),
    /* Route documents live one or more directories deep. */
    ...fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !["node_modules", "scripts", "docs", "assets", "css", "server", "automation", "tests", ...SCAN_ROOTS.map((item) => item.split("/")[0])].includes(entry.name) && !entry.name.startsWith(".") && !entry.name.startsWith("dist"))
      .flatMap((entry) => walk(entry.name).filter((file) => file.endsWith(".html"))),
  ];
  const referenced = new Set();
  for (const file of files) for (const match of read(file).matchAll(ICON_CLASS)) if (icons.has(match[0])) referenced.add(match[0]);
  return [...icons.keys()].filter((name) => referenced.has(name));
}

const codePointsOf = (names, icons) => [...new Set(names.map((name) => parseInt(icons.get(name), 16)))].sort((a, b) => a - b);

export function iconStylesheet(names, { stylesheet, icons }, fontHash) {
  const shared = stylesheet.replace(ICON_RULE, "");
  if (!FONT_FACE.test(shared)) throw new Error("upstream stylesheet no longer starts with its @font-face rule");
  const face = `@font-face{font-family:boxicons;font-weight:400;font-style:normal;src:url(/${ICON_FONT}?v=${fontHash}) format('woff2')}`;
  const header = `/*! Boxicons ${ICON_VERSION} subset (${names.length} icons) | https://boxicons.com | (c) 2015-2021 Aniket Suvarna | font: SIL OFL 1.1, /${ICON_OFL} | stylesheet: MIT License, /${ICON_LICENSE} | generated by scripts/generate-icon-font.mjs - do not edit */\n`;
  return `${header}${face}${shared.replace(FONT_FACE, "")}${names.map((name) => `.${name}:before{content:"\\${icons.get(name)}"}`).join("")}\n`;
}

/** The notice published next to the font: what the files are, how they differ
 * from upstream, and the terms upstream distributes them under. */
export function iconLicense(names, { license }) {
  return [
    `Boxicons ${ICON_VERSION} icon font subset`,
    "",
    `  /${ICON_STYLESHEET}`,
    `  /${ICON_FONT}`,
    "",
    `Source: https://boxicons.com (https://github.com/atisawd/boxicons, npm boxicons@${ICON_VERSION}).`,
    `${UPSTREAM_COPYRIGHT}.`,
    "",
    `Changes from upstream: both files are reduced to the ${names.length} icons this site`,
    "uses. Glyph outlines, code points and class names are unchanged, and every",
    "other rule of the upstream stylesheet is kept verbatim. The font is therefore",
    "a Modified Version in the terms of the SIL Open Font License. Upstream",
    "declares no Reserved Font Name, so it keeps the family name \"boxicons\".",
    "",
    'Licensing, as stated by upstream (README, "License"):',
    "  - The font files are licensed under the SIL Open Font License 1.1. The",
    `    copyright notice and the complete licence are in /${ICON_OFL}.`,
    "  - Files that are not fonts or icons, including the stylesheet, are licensed",
    "    under the MIT License, reproduced below.",
    `  - The package as a whole declares "${UPSTREAM_LICENSE}".`,
    "",
    "Generated by scripts/generate-icon-font.mjs. Do not edit.",
    "",
    "---- upstream LICENSE, verbatim ----",
    "",
    license.trimEnd(),
    "",
  ].join("\n");
}

/** Unicode code points a font maps, read from its cmap table (formats 4 and 12). */
export async function fontCodePoints(buffer) {
  const { default: fontverter } = await import("fontverter");
  const sfnt = await fontverter.convert(buffer, "truetype");
  const tables = sfnt.readUInt16BE(4);
  let cmap = -1;
  for (let index = 0; index < tables; index += 1) if (sfnt.toString("latin1", 12 + index * 16, 16 + index * 16) === "cmap") cmap = sfnt.readUInt32BE(12 + index * 16 + 8);
  if (cmap < 0) throw new Error("font has no cmap table");
  const points = new Set();
  for (let index = 0; index < sfnt.readUInt16BE(cmap + 2); index += 1) {
    const table = cmap + sfnt.readUInt32BE(cmap + 4 + index * 8 + 4);
    const format = sfnt.readUInt16BE(table);
    if (format === 4) {
      const segments = sfnt.readUInt16BE(table + 6) / 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const end = sfnt.readUInt16BE(table + 14 + segment * 2);
        const start = sfnt.readUInt16BE(table + 16 + segments * 2 + segment * 2);
        if (start === 0xffff) continue;
        for (let point = start; point <= end; point += 1) points.add(point);
      }
    } else if (format === 12) {
      for (let group = 0; group < sfnt.readUInt32BE(table + 12); group += 1) {
        const start = sfnt.readUInt32BE(table + 16 + group * 12);
        const end = sfnt.readUInt32BE(table + 20 + group * 12);
        for (let point = start; point <= end; point += 1) points.add(point);
      }
    }
  }
  return [...points].sort((a, b) => a - b);
}

export async function generateIconFont({ check = false } = {}) {
  const upstream = upstreamPackage();
  await assertNoReservedFontName(upstream);
  const names = usedIcons(upstream.icons);
  const expected = codePointsOf(names, upstream.icons);
  const fontPath = path.join(ROOT, ICON_FONT);
  if (!check) {
    const { default: subsetFont } = await import("subset-font");
    const font = await subsetFont(upstream.font, String.fromCodePoint(...expected), { targetFormat: "woff2" });
    fs.mkdirSync(path.dirname(fontPath), { recursive: true });
    fs.writeFileSync(fontPath, font);
  }
  if (!fs.existsSync(fontPath)) throw new Error(`${ICON_FONT} is missing. Run npm run icons:generate.`);
  const font = fs.readFileSync(fontPath);
  const fontHash = crypto.createHash("sha256").update(font).digest("hex").slice(0, 10);
  const stylesheet = iconStylesheet(names, upstream, fontHash);
  const license = iconLicense(names, upstream);
  const ofl = iconOfl(read(OFL_SOURCE));
  if (!check) {
    fs.writeFileSync(path.join(ROOT, ICON_STYLESHEET), stylesheet, "utf8");
    fs.writeFileSync(path.join(ROOT, ICON_LICENSE), license, "utf8");
    fs.writeFileSync(path.join(ROOT, ICON_OFL), ofl, "utf8");
  }
  const committedText = (file) => (fs.existsSync(path.join(ROOT, file)) ? read(file).replace(/\r\n/g, "\n") : "");
  const committed = committedText(ICON_STYLESHEET);
  const mapped = (await fontCodePoints(font)).filter((point) => point >= 0xe000);
  const problems = [];
  if (committed !== stylesheet) problems.push(`${ICON_STYLESHEET} is stale`);
  if (committedText(ICON_LICENSE) !== license) problems.push(`${ICON_LICENSE} is stale`);
  if (committedText(ICON_OFL) !== ofl) problems.push(`${ICON_OFL} is stale`);
  if (JSON.stringify(mapped) !== JSON.stringify(expected)) problems.push(`${ICON_FONT} maps ${mapped.length} icon code points, expected ${expected.length}`);
  /* The published font must reserve no name either, and must still be named
   * as upstream names it. */
  const family = (await assertNoReservedFontName({ ...upstream, font })).filter((name) => name.id === 1).map((name) => name.text);
  if (family.some((name) => name !== "boxicons")) problems.push(`${ICON_FONT} is named ${JSON.stringify(family)}, expected "boxicons"`);
  if (problems.length) throw new Error(`${problems.join("; ")}. Run npm run icons:generate.`);
  return { names, codePoints: expected, fontBytes: font.byteLength, fontHash, stylesheet, stylesheetBytes: Buffer.byteLength(stylesheet), upstreamIcons: upstream.icons.size, upstream, ofl, license };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const check = process.argv.includes("--check");
  try {
    const result = await generateIconFont({ check });
    console.log(`Boxicons ${ICON_VERSION} subset: ${result.names.length} of ${result.upstreamIcons} icons · stylesheet ${result.stylesheetBytes} B · font ${result.fontBytes} B${check ? " · up to date" : ""}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
