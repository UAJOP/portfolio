#!/usr/bin/env node
/**
 * Master 3 #32A gate: React-owned documents load a self-hosted Boxicons subset.
 *
 * Static: the committed subset is the generator's output for the pinned
 * upstream package; its stylesheet references only the local font and keeps
 * upstream's code points; the font ships with its copyright notice, the
 * complete SIL Open Font License 1.1 and the upstream MIT notice; every
 * React-owned document carries exactly the reviewed head edit; and every icon
 * a published document or script names is in the subset.
 *
 * Normalization scope: the parity and browser gates compare accepted and React
 * documents through `withIconSubset` / `iconSubsetAcceptedBase`. Measured here
 * without those helpers' own matching, each changes four <link> tags and
 * nothing else, and leaves both sides loading the same resources.
 *
 * Browser (hermetic, the upstream host is unreachable): the pages fetch the
 * font once from their own origin, every icon renders a subset glyph, no
 * icon-only control is left without an accessible name, and each subset glyph
 * is pixel-identical to the same glyph of the upstream font.
 *
 * Independent reference: those gates load the same subset on both sides, so a
 * broken subset would be equally wrong on both and pass them. Here each side
 * is rendered with the subset and then with the upstream stylesheet and font
 * from the pinned package; icon styles, the geometry of every element and the
 * pixels of every icon must not change. Pixels are compared icon by icon, over
 * each icon's own box: the two sides are separate page loads, and anything
 * else in the viewport is outside what this change can affect. Two
 * deliberately broken stylesheets must be caught in those icon pixels.
 *
 * Legacy-owned documents (404, the project-detail shell) are out of scope and
 * still load the upstream stylesheet.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";
import { buildProductionSite } from "./build-production-site.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";
import { ROOT } from "./i18n-catalog.mjs";
import {
  ICON_FONT,
  ICON_LICENSE,
  ICON_OFL,
  ICON_STYLESHEET,
  ICON_VERSION,
  OFL_SOURCE,
  OFL_SOURCE_SHA256,
  UPSTREAM_COPYRIGHT,
  assertNoReservedFontName,
  fontNames,
  generateIconFont,
  iconOfl,
} from "./generate-icon-font.mjs";
import {
  ICON_SUBSET_LINK,
  ICON_SUBSET_PUBLIC_FILES,
  ICON_UPSTREAM_LINK,
  iconSubsetAcceptedBase,
  servesUpstreamIcons,
  withIconSubset,
} from "./m3-32a-public-edits.mjs";

/* Raw bytes. The upstream pair these replace is 68028 B and 115680 B. */
const BUDGET = Object.freeze({ fontBytes: 12_000, stylesheetBytes: 12_000, stylesheetGzipBytes: 3_000 });
/* Class names the site uses that Boxicons 2.1.4 never defined. They rendered
 * nothing from the upstream stylesheet either; they are pinned so that a new
 * misspelled icon name fails here instead of joining them. */
const KNOWN_UNDEFINED_ICONS = Object.freeze(["bx-bookmark-check", "bx-flask", "bx-magic-wand", "bx-sparkles"]);
const BROWSER_ROUTES = Object.freeze(["/", "/works/", "/tr/games/", "/labs/", "/sinama-case-study/", "/request/"]);
const ICON_CLASS = /\bbx[sl]?-[a-z0-9-]+/g;
const ICON_RULE = /\.(bx[sl]?-[a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}/g;
const UPSTREAM = path.join(ROOT, "node_modules/boxicons");

const requestedRoot = process.argv.includes("--root") ? path.resolve(ROOT, process.argv[process.argv.indexOf("--root") + 1]) : null;
const temporary = requestedRoot ? null : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-32a-icons-"));
const artifact = requestedRoot || path.join(temporary, "site");
let assertions = 0;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const lf = (text) => text.replace(/\r\n/g, "\n");
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
const readText = (file) => lf(fs.readFileSync(path.join(ROOT, file), "utf8"));

/* ---------- generator output ---------- */

const subset = await generateIconFont({ check: true });
const upstreamIcons = subset.upstream.icons;
const font = fs.readFileSync(path.join(ROOT, ICON_FONT));
const stylesheet = readText(ICON_STYLESHEET);
const notice = readText(ICON_LICENSE);
const fontUrl = `/${ICON_FONT}?v=${sha256(font).slice(0, 10)}`;
const rules = new Map([...stylesheet.matchAll(ICON_RULE)].map((match) => [match[1], match[2]]));
const header = stylesheet.slice(0, stylesheet.indexOf("*/\n") + 3);
const body = stylesheet.slice(header.length);

assert.deepEqual([...rules.keys()], subset.names, "subset stylesheet defines exactly the icons the generator selected"); assertions += 1;
for (const [name, codePoint] of rules) assert.equal(codePoint, upstreamIcons.get(name), `${name}: code point differs from upstream`);
assertions += rules.size;
assert.equal(occurrences(body, "@font-face"), 1, "subset stylesheet declares one font face"); assertions += 1;
assert.deepEqual(body.match(/url\([^)]*\)/g), [`url(${fontUrl})`], "subset stylesheet references only the local font, addressed by its content hash"); assertions += 1;
assert.equal(/https?:|\/\/[a-z]/i.test(body), false, "subset stylesheet has no remote reference"); assertions += 1;
assert.ok(body.includes(subset.upstream.stylesheet.replace(ICON_RULE, "").replace(/^@font-face\{[^}]*\}/, "")), "every non-icon upstream rule is kept verbatim"); assertions += 1;
for (const text of [`Boxicons ${ICON_VERSION}`, "Aniket Suvarna", "MIT License", "SIL OFL 1.1", `/${ICON_LICENSE}`, `/${ICON_OFL}`]) {
  assert.ok(header.includes(text), `subset stylesheet header names ${text}`); assertions += 1;
}

/* ---------- licensing ---------- */

/* The font: the upstream copyright notice, then the official licence text,
 * complete and unedited. */
const official = readText(OFL_SOURCE);
const ofl = readText(ICON_OFL);
const licence = official.slice(official.indexOf("This Font Software is licensed under the SIL Open Font License, Version 1.1."));
assert.equal(sha256(official), OFL_SOURCE_SHA256, `${OFL_SOURCE} is the official SIL Open Font License 1.1 file`); assertions += 1;
assert.equal(ofl, `${UPSTREAM_COPYRIGHT}\n\n${licence}`, `${ICON_OFL} is the upstream copyright notice followed by the official licence`); assertions += 1;
for (const text of ["SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007", "PREAMBLE", "DEFINITIONS", "PERMISSION & CONDITIONS", "TERMINATION", "DISCLAIMER"]) {
  assert.equal(occurrences(ofl, text), 1, `${ICON_OFL} carries the ${text} section once`); assertions += 1;
}
assert.ok(ofl.trimEnd().endsWith("OTHER DEALINGS IN THE FONT SOFTWARE."), `${ICON_OFL} runs to the end of the licence`); assertions += 1;
assert.equal(/<dates>|<Copyright Holder>|<Reserved Font Name>|<additional/.test(ofl), false, `${ICON_OFL} has no unfilled placeholder`); assertions += 1;
/* The stylesheet: attribution, what changed, and the upstream MIT notice. */
for (const text of [`${UPSTREAM_COPYRIGHT}.`, "SIL Open Font License 1.1", "Modified Version", "no Reserved Font Name", `/${ICON_OFL}`, lf(subset.upstream.license).trimEnd()]) {
  assert.ok(notice.includes(text), `licence notice carries ${JSON.stringify(text.slice(0, 40))}`); assertions += 1;
}
assert.ok(lf(subset.upstream.license).includes("The MIT License (MIT)") && lf(subset.upstream.license).includes(UPSTREAM_COPYRIGHT), "the upstream LICENSE is the MIT notice with the copyright line"); assertions += 1;
/* Neither font carries copyright, trademark or licence metadata, so the text
 * files published next to the font are the notice; and no name is reserved,
 * so the subset may keep the upstream family name. */
for (const [label, bytes] of [["upstream font", subset.upstream.font], [ICON_FONT, font]]) {
  const names = await fontNames(bytes);
  assert.deepEqual(names.filter((name) => [0, 7, 13, 14].includes(name.id)), [], `${label}: no copyright, trademark or licence record in the name table`);
  assert.deepEqual([...new Set(names.filter((name) => name.id === 1).map((name) => name.text))], ["boxicons"], `${label}: family name`);
  assertions += 2;
}
await assertNoReservedFontName({ ...subset.upstream, font }); assertions += 1;
assert.throws(() => iconOfl(official.replace("may be sold by itself", "may be sold")), /not the official SIL Open Font License/, "an edited licence text must be rejected"); assertions += 1;
assert.throws(() => iconOfl(official.replace(/\n$/, "")), /not the official SIL Open Font License/, "a truncated licence text must be rejected"); assertions += 1;
for (const source of ["license", "readme", "manifest"]) {
  await assert.rejects(assertNoReservedFontName({ ...subset.upstream, font, [source]: `${subset.upstream[source]}\nwith Reserved Font Name Boxicons.` }), /declares a Reserved Font Name/, `a Reserved Font Name in the upstream ${source} must stop generation`);
  assertions += 1;
}

const sizes = { fontBytes: font.byteLength, stylesheetBytes: Buffer.byteLength(stylesheet), stylesheetGzipBytes: gzipSync(Buffer.from(stylesheet), { level: 9 }).length };
for (const [key, limit] of Object.entries(BUDGET)) {
  assert.ok(sizes[key] <= limit, `${key} ${sizes[key]} exceeds the #32A budget ${limit}`); assertions += 1;
}
const documentSource = fs.readFileSync(path.join(ROOT, "src/react/production/ProductionDocument.jsx"), "utf8");
assert.equal(occurrences(documentSource, '<link rel="stylesheet" href="/css/boxicons-subset.css" />'), 1, "the React document links the subset stylesheet once"); assertions += 1;
assert.equal(documentSource.includes("unpkg"), false, "the React document has no upstream icon host reference"); assertions += 1;

/* ---------- emitted artifact ---------- */

if (!requestedRoot) await buildProductionSite({ outputDirectory: artifact });

/** One React-owned document: the reviewed head edit, in the accepted cascade
 * position, and no icon the subset does not carry. */
function validateDocument(html, file) {
  iconSubsetAcceptedBase(html, file);
  const head = html.slice(0, html.indexOf("</head>"));
  const sheets = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"\/>/g)].map((match) => match[1]);
  const at = sheets.indexOf("/css/boxicons-subset.css");
  assert.ok(at >= 0 && sheets[at - 1]?.startsWith("https://fonts.googleapis.com/") && sheets[at + 1] === "/style.css", `${file}: icon stylesheet must sit between the font stylesheet and /style.css`);
  assertIconNames(html, file);
}
function assertIconNames(source, file) {
  for (const [name] of source.matchAll(ICON_CLASS)) {
    if (upstreamIcons.has(name)) assert.ok(rules.has(name), `${file}: ${name} is not in the icon subset; run npm run icons:generate`);
  }
}
const walk = (directory, files = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else files.push(path.relative(artifact, target).replaceAll("\\", "/"));
  }
  return files;
};

/* ---------- normalization scope ---------- */

/* Deliberately not built on the helpers under test: every <link> of a
 * document as its sorted attributes, and the document with its links removed. */
const linkIdentity = (tag) => JSON.stringify([...tag.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)].slice(1).map(([, name, value = ""]) => [name.toLowerCase(), value]).sort());
function census(html) {
  const links = [];
  const rest = html.replace(/<link\b[^>]*>/gi, (tag) => { links.push(linkIdentity(tag)); return ""; });
  const having = (rel) => links.filter((link) => link.includes(`["rel","${rel}"]`));
  return { links, rest, stylesheets: having("stylesheet"), preconnects: having("preconnect").sort() };
}
/** Elements of `from` that `to` does not have, as a multiset. */
function without(from, to) {
  const remaining = [...to];
  return from.filter((item) => {
    const at = remaining.indexOf(item);
    if (at < 0) return true;
    remaining.splice(at, 1);
    return false;
  }).sort();
}
const UPSTREAM_LINKS = [
  '<link rel="preconnect" href="https://unpkg.com">',
  '<link rel="preconnect" href="https://unpkg.com" crossorigin="">',
  '<link rel="stylesheet" href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css">',
].map(linkIdentity).sort();
const SUBSET_LINKS = ['<link rel="stylesheet" href="/css/boxicons-subset.css">'].map(linkIdentity);

/** A normalization may exchange the icon links and must change nothing else. */
function assertIconOnlyDifference(upstreamSide, subsetSide, where) {
  assert.equal(subsetSide.rest, upstreamSide.rest, `${where}: bytes outside <link> tags changed`);
  assert.deepEqual(without(upstreamSide.links, subsetSide.links), UPSTREAM_LINKS, `${where}: links removed are not exactly the upstream icon links`);
  assert.deepEqual(without(subsetSide.links, upstreamSide.links), SUBSET_LINKS, `${where}: links added are not exactly the subset stylesheet`);
  assert.deepEqual(subsetSide.stylesheets, upstreamSide.stylesheets.map((link) => (link === UPSTREAM_LINKS.find((item) => item.includes("stylesheet")) ? SUBSET_LINKS[0] : link)), `${where}: stylesheet order changed`);
}

try {
  const routes = canonicalReactRoutes();
  const reactDocuments = routes.filter((route) => route.renderer === "react").map((route) => route.output);
  assert.ok(reactDocuments.length >= 215, "the route registry still lists the React-owned documents"); assertions += 1;
  for (const file of reactDocuments) validateDocument(fs.readFileSync(path.join(artifact, file), "utf8"), file);
  assertions += reactDocuments.length * 3;
  for (const file of ICON_SUBSET_PUBLIC_FILES) {
    const published = fs.readFileSync(path.join(artifact, file));
    const committed = fs.readFileSync(path.join(ROOT, file));
    const same = file === ICON_FONT ? published.equals(committed) : lf(published.toString("utf8")) === lf(committed.toString("utf8"));
    assert.ok(same, `${file}: the artifact does not carry the committed icon subset`); assertions += 1;
  }
  assert.deepEqual([ICON_OFL, ICON_LICENSE].filter((file) => !ICON_SUBSET_PUBLIC_FILES.includes(file)), [], "both notices are published with the font"); assertions += 1;
  const published = walk(artifact);
  const undefinedIcons = new Set();
  for (const file of published.filter((name) => /\.(html|js)$/.test(name))) {
    const source = fs.readFileSync(path.join(artifact, file), "utf8");
    assertIconNames(source, file);
    for (const [name] of source.matchAll(ICON_CLASS)) if (!upstreamIcons.has(name)) undefinedIcons.add(name);
  }
  assertions += 1;
  assert.deepEqual([...undefinedIcons].sort(), [...KNOWN_UNDEFINED_ICONS], `icon class names Boxicons ${ICON_VERSION} does not define`); assertions += 1;

  const home = fs.readFileSync(path.join(artifact, "index.html"), "utf8");
  const absent = [...upstreamIcons.keys()].find((name) => !rules.has(name));
  const controls = [
    ["upstream stylesheet restored", home.replace(ICON_SUBSET_LINK, ICON_UPSTREAM_LINK), /#32A/],
    ["upstream stylesheet beside the subset", home.replace(ICON_SUBSET_LINK, `${ICON_SUBSET_LINK}${ICON_UPSTREAM_LINK}`), /#32A/],
    ["missing icon stylesheet", home.replace(ICON_SUBSET_LINK, ""), /#32A/],
    ["icon stylesheet after the site stylesheets", home.replace(ICON_SUBSET_LINK, "").replace('<link rel="stylesheet" href="/portfolio-v2.css"/>', `<link rel="stylesheet" href="/portfolio-v2.css"/>${ICON_SUBSET_LINK}`), /must sit between/],
    ["an icon the subset does not carry", home.replace('class="bx bx-moon"', `class="bx ${absent}"`), /is not in the icon subset/],
  ];
  for (const [name, mutant, expected] of controls) {
    assert.notEqual(mutant, home, `${name}: control must mutate the document`);
    assert.throws(() => validateDocument(mutant, "index.html"), expected, `${name} negative control did not fail`);
    assertions += 2;
  }

  /* Every React-owned route, both directions: the accepted source document as
   * the browser gates serve it, and the emitted document as the parity gates
   * read it. After normalization the two sides load the same stylesheets in
   * the same order and warm the same connections. */
  for (const file of reactDocuments) {
    const accepted = fs.readFileSync(path.join(ROOT, file), "utf8");
    const emitted = fs.readFileSync(path.join(artifact, file), "utf8");
    assert.ok(servesUpstreamIcons(accepted), `${file}: accepted source document loads the upstream icon stylesheet`);
    const [acceptedCensus, servedCensus, emittedCensus, reversedCensus] = [accepted, withIconSubset(accepted, file), emitted, iconSubsetAcceptedBase(emitted, file)].map(census);
    assertIconOnlyDifference(acceptedCensus, servedCensus, `${file}: accepted document as served`);
    assertIconOnlyDifference(reversedCensus, emittedCensus, `${file}: emitted document reversed`);
    assert.deepEqual(servedCensus.stylesheets, emittedCensus.stylesheets, `${file}: accepted and React documents load different stylesheets`);
    assert.deepEqual(servedCensus.preconnects, emittedCensus.preconnects, `${file}: accepted and React documents warm different connections`);
    assertions += 11;
  }
  /* A normalization that hid anything else would be caught. */
  const acceptedHome = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scopeControls = [
    ["a rewritten stylesheet", (html) => html.replace('"/style.css"', '"/style-2.css"'), /links removed/],
    ["a dropped connection hint", (html) => html.replace(/<link\b[^>]*fonts\.gstatic\.com[^>]*>/, ""), /links removed/],
    ["a changed body byte", (html) => html.replace("</main>", "</main> "), /bytes outside <link> tags changed/],
    ["a reordered stylesheet", (html) => { const sheet = html.match(/<link\b[^>]*css\/a11y\.css[^>]*>/)[0]; return html.replace(sheet, "").replace(ICON_SUBSET_LINK, `${sheet}${ICON_SUBSET_LINK}`); }, /stylesheet order changed/],
  ];
  for (const [name, mutate, expected] of scopeControls) {
    const served = withIconSubset(acceptedHome, "index.html");
    const mutant = mutate(served);
    assert.notEqual(mutant, served, `${name}: control must mutate the document`);
    assert.throws(() => assertIconOnlyDifference(census(acceptedHome), census(mutant), "index.html"), expected, `${name} scope control did not fail`);
    assertions += 2;
  }

  /* ---------- browser ---------- */

  const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
  const upstreamFont = path.join(UPSTREAM, "fonts/boxicons.woff2");
  const glyphPage = `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:subset;src:url(/${ICON_FONT})}@font-face{font-family:upstream;src:url(/__upstream.woff2)}</style><body>`;
  /* The reference is the upstream package as published: its stylesheet,
   * unmodified, resolving its own relative font URLs. */
  const REFERENCE = "/__reference/css/boxicons.min.css";
  /* Broken on purpose. Both would look the same on an accepted and a React
   * page that load them alike; the reference comparison must reject each. */
  const [swapA, swapB] = ["bx-search", "bx-moon"].map((name) => `.${name}:before{content:"\\${rules.get(name)}"}`);
  const BROKEN = {
    "/__broken/wrong-glyph.css": stylesheet.replace(swapA, "\u0000").replace(swapB, swapA.replace("bx-search", "bx-moon")).replace("\u0000", swapB.replace("bx-moon", "bx-search")),
    "/__broken/no-font.css": stylesheet.replace(fontUrl, "/__broken/missing.woff2"),
  };
  assert.ok(Object.values(BROKEN).every((css) => css !== stylesheet), "the broken stylesheets differ from the subset"); assertions += 1;
  /* `?icons=<variant>` serves a document with that stylesheet where its icon
   * stylesheet is; everything else about the document and the load is equal. */
  const VARIANTS = { reference: REFERENCE, "wrong-glyph": "/__broken/wrong-glyph.css", "no-font": "/__broken/no-font.css" };

  function serverFor(directory, { accepted = false } = {}) {
    return http.createServer((request, response) => {
      const url = new URL(request.url, "http://local");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/__glyphs") return response.writeHead(200, { "content-type": types[".html"] }).end(glyphPage);
      if (pathname === "/__upstream.woff2") return response.writeHead(200, { "content-type": types[".woff2"] }).end(fs.readFileSync(upstreamFont));
      if (pathname === REFERENCE) return response.writeHead(200, { "content-type": types[".css"] }).end(fs.readFileSync(path.join(UPSTREAM, "css/boxicons.min.css")));
      const referenceFont = pathname.match(/^\/__reference\/fonts\/(boxicons\.[a-z0-9]+)$/)?.[1];
      if (referenceFont && fs.existsSync(path.join(UPSTREAM, "fonts", referenceFont))) return response.writeHead(200, { "content-type": types[path.extname(referenceFont)] || "application/octet-stream" }).end(fs.readFileSync(path.join(UPSTREAM, "fonts", referenceFont)));
      if (Object.hasOwn(BROKEN, pathname)) return response.writeHead(200, { "content-type": types[".css"] }).end(BROKEN[pathname]);
      const file = path.resolve(directory, pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1));
      if (!file.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end("not found");
      response.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      if (path.extname(file) === ".html") {
        let html = fs.readFileSync(file, "utf8");
        /* The accepted side, exactly as the browser gates serve it. */
        if (accepted && servesUpstreamIcons(html)) html = withIconSubset(html, pathname);
        const variant = url.searchParams.get("icons");
        if (variant !== null) {
          if (!Object.hasOwn(VARIANTS, variant) || occurrences(html, ICON_SUBSET_LINK) !== 1) return response.end("unknown icon variant");
          html = html.replace(ICON_SUBSET_LINK, `<link rel="stylesheet" href="${VARIANTS[variant]}"/>`);
        }
        return response.end(html);
      }
      fs.createReadStream(file).pipe(response);
    });
  }
  const servers = { React: serverFor(artifact), accepted: serverFor(ROOT, { accepted: true }) };
  await Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))));
  const originOf = (side) => `http://127.0.0.1:${servers[side].address().port}`;
  const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true" ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] } : { headless: true });
  const report = { icons: 0, hidden: 0, named: 0, bare: 0 };
  const reference = { pages: 0, icons: 0, elements: 0, pixels: 0, rejected: 0, swapped: 0, fontless: 0 };

  /** Everything the reference comparison holds constant: each icon's glyph,
   * font and box, and the box of every element on the page. */
  const renderState = (page) => page.evaluate(() => {
    const box = (node) => { const r = node.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height].map((value) => Math.round(value * 1000) / 1000).join(","); };
    return {
      icons: [...document.querySelectorAll(".bx")].map((node) => {
        const before = getComputedStyle(node, "::before");
        const own = getComputedStyle(node);
        return [node.className, before.content, before.fontFamily, own.fontSize, own.lineHeight, own.color, own.display, own.textTransform, box(node)].join(" | ");
      }),
      layout: [...document.querySelectorAll("body *")].map((node) => `${node.tagName} ${box(node)}`),
    };
  });
  /** One capture of every icon Boxicons defines, in document order: its class
   * identity and the pixels of its own box, or null where it has no box inside
   * the document. The page is not scrolled, so capturing changes nothing. */
  async function captureIcons(page) {
    const regions = await page.evaluate((undefinedIcons) => {
      const extent = { width: Math.max(document.documentElement.scrollWidth, innerWidth), height: Math.max(document.documentElement.scrollHeight, innerHeight) };
      return [...document.querySelectorAll(".bx")].filter((node) => !undefinedIcons.some((name) => node.classList.contains(name))).map((node) => {
        const rect = node.getBoundingClientRect();
        const [left, top] = [Math.max(0, rect.left + scrollX), Math.max(0, rect.top + scrollY)];
        const [right, bottom] = [Math.min(extent.width, rect.right + scrollX), Math.min(extent.height, rect.bottom + scrollY)];
        return { identity: node.getAttribute("class"), clip: right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null };
      });
    }, KNOWN_UNDEFINED_ICONS);
    const icons = [];
    for (const { identity, clip } of regions) {
      icons.push({ identity, pixels: clip ? await page.screenshot({ type: "png", clip, captureBeyondViewport: true }) : null });
    }
    return icons;
  }
  /** The icons of `left` whose pixels are not byte-identical in `right`. Both
   * sides must hold the same icons in the same order. */
  function differingIcons(left, right, where) {
    assert.deepEqual(left.map((icon) => icon.identity), right.map((icon) => icon.identity), `${where}: the two renderings do not hold the same icons in the same order`);
    return left.flatMap((icon, index) => {
      const other = right[index].pixels;
      const same = icon.pixels === null || other === null ? icon.pixels === other : icon.pixels.equals(other);
      return same ? [] : [`#${index} ${icon.identity}`];
    });
  }
  /** Icon pixels, once two consecutive captures of every icon agree. */
  async function stableIconPixels(page, where) {
    let previous = await captureIcons(page);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      const next = await captureIcons(page);
      if (differingIcons(previous, next, where).length === 0) return next;
      previous = next;
    }
    throw new Error(`${where}: the icons never settled, so their pixels cannot be compared`);
  }
  /** A fresh, hermetic load of one document, settled, with its network log. */
  async function open(side, route, variant = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    /* Counted on the network layer: an intercepted request can be announced
     * to the page-level listener more than once. */
    const requests = [];
    const network = await page.createCDPSession();
    await network.send("Network.enable");
    network.on("Network.requestWillBeSent", (event) => requests.push(new URL(event.request.url)));
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "127.0.0.1") request.continue();
      else request.abort();
    });
    const statuses = new Map();
    page.on("response", (response) => statuses.set(new URL(response.url()).pathname, response.status()));
    const response = await page.goto(`${originOf(side)}${route}${variant ? `?icons=${variant}` : ""}`, { waitUntil: "load" });
    assert.equal(response.status(), 200, `${side} ${route}: HTTP`);
    await page.evaluate(() => document.fonts.ready);
    /* The icon font has finished: loaded, or failed for the font-less control. */
    await page.waitForFunction((settled) => [...document.fonts].some((face) => face.family.replace(/["']/g, "") === "boxicons" && face.status === settled), { timeout: 15000 }, variant === "no-font" ? "error" : "loaded");
    /* The React AJOOP launcher, which holds an icon, stays hidden until its
     * handler is attached; the runtime marks that moment on the shell. Pages
     * without a React shell (the accepted side) have nothing to wait for. */
    await page.waitForFunction(() => {
      const owner = document.querySelector('[data-react-ajoop-shell="react"]');
      return !owner || owner.hasAttribute("data-ajoop-interactive");
    }, { timeout: 15000 });
    return { page, requests, statuses };
  }

  try {
    const expectedGlyphs = new Set(subset.codePoints);
    for (const side of ["React", "accepted"]) {
      for (const route of BROWSER_ROUTES) {
        const where = `${side} ${route}`;
        const { page, requests, statuses } = await open(side, route);
        assert.deepEqual(requests.filter((url) => /unpkg/.test(url.hostname)).map(String), [], `${where}: no request reaches the upstream icon host`);
        const fontRequests = requests.filter((url) => url.pathname === `/${ICON_FONT}`);
        assert.deepEqual(fontRequests.map((url) => `${url.pathname}${url.search}`), [fontUrl], `${where}: the icon font is fetched once, from this origin, by its hashed address`);
        assert.deepEqual([statuses.get(`/${ICON_STYLESHEET}`), statuses.get(`/${ICON_FONT}`)], [200, 200], `${where}: icon stylesheet and font load`);
        assertions += 4;
        const icons = await page.evaluate(() => [...document.querySelectorAll(".bx")].map((node) => {
          const before = getComputedStyle(node, "::before");
          const control = node.closest("a, button, summary, [role='button'], [role='link'], [role='tab'], label");
          const label = (element) => (element.getAttribute("aria-label") || element.getAttribute("title") || [...(element.getAttribute("aria-labelledby") || "").split(/\s+/)].map((id) => document.getElementById(id)?.textContent || "").join(" ") || element.textContent || "").trim();
          return {
            classes: node.className,
            tag: node.tagName,
            content: before.content,
            family: before.fontFamily.replace(/["']/g, ""),
            width: node.getClientRects().length ? node.getBoundingClientRect().width : null,
            hidden: node.getAttribute("aria-hidden") === "true" || Boolean(node.closest("[aria-hidden='true']")),
            control: control ? control.tagName : null,
            controlName: control ? label(control) : null,
            ownText: node.textContent.trim(),
          };
        }));
        assert.ok(icons.length > 0, `${where}: the page renders icons`); assertions += 1;
        for (const icon of icons) {
          const element = `${where}: <${icon.tag.toLowerCase()} class="${icon.classes}">`;
          const names = icon.classes.split(/\s+/).filter((name) => /^bx[sl]?-/.test(name));
          if (names.some((name) => KNOWN_UNDEFINED_ICONS.includes(name))) continue;
          assert.equal(icon.family, "boxicons", `${element} uses the icon font`);
          const glyph = icon.content.replace(/^"|"$/g, "");
          assert.ok([...glyph].length === 1 && expectedGlyphs.has(glyph.codePointAt(0)), `${element} renders a subset glyph (content ${icon.content})`);
          if (icon.width !== null) assert.ok(icon.width > 0, `${element} has a rendered width`);
          assert.equal(icon.ownText, "", `${element} carries no text of its own`);
          assertions += 3;
          /* Accessibility is asserted on the documents this change ships. */
          if (side !== "React") continue;
          /* The icon is never the only thing naming a control. */
          if (icon.control) assert.ok(icon.controlName.length > 0, `${element} sits in an unnamed <${icon.control.toLowerCase()}>`);
          report.icons += 1;
          if (icon.hidden) report.hidden += 1;
          else if (icon.control) report.named += 1;
          else report.bare += 1;
          assertions += 1;
        }

        /* Independent reference: the same document loaded again with the
         * upstream package's own stylesheet and full font where the subset is. */
        const withSubset = { state: await renderState(page), icons: await stableIconPixels(page, `${where} (subset)`) };
        await page.close();
        const upstream = await open(side, route, "reference");
        assert.deepEqual(upstream.requests.filter((url) => [`/${ICON_STYLESHEET}`, `/${ICON_FONT}`].includes(url.pathname)).map(String), [], `${where}: the reference load uses nothing of the subset`);
        assert.deepEqual([upstream.statuses.get(REFERENCE), upstream.statuses.get("/__reference/fonts/boxicons.woff2")], [200, 200], `${where}: the reference is the upstream stylesheet and font`);
        const withUpstream = { state: await renderState(upstream.page), icons: await stableIconPixels(upstream.page, `${where} (upstream reference)`) };
        await upstream.page.close();
        assert.deepEqual(withSubset.state.icons, withUpstream.state.icons, `${where}: an icon renders differently from the upstream reference`);
        assert.deepEqual(withSubset.state.layout, withUpstream.state.layout, `${where}: the subset moves or resizes an element relative to the upstream reference`);
        assert.deepEqual(differingIcons(withSubset.icons, withUpstream.icons, where), [], `${where}: icon pixels differ from the upstream reference`);
        const captured = withSubset.icons.filter((icon) => icon.pixels !== null).length;
        assert.ok(captured > 0, `${where}: no icon has a box to capture`);
        assertions += 6;
        reference.pages += 1;
        reference.icons += withSubset.state.icons.length;
        reference.elements += withSubset.state.layout.length;
        reference.pixels += captured;

        /* The comparison has teeth: a wrong glyph and a missing font each
         * change the icon pixels it measures. Every step below is a direct
         * comparison of two finished captures; a load, a font or a capture that
         * times out throws and fails the gate instead of passing as a rejection. */
        if (route === "/") {
          const swapped = (identity) => /(^|\s)bx-(search|moon)(\s|$)/.test(identity);
          const wrong = await open(side, route, "wrong-glyph");
          const wrongGlyph = { state: await renderState(wrong.page), icons: await stableIconPixels(wrong.page, `${where} (wrong glyph)`) };
          await wrong.page.close();
          assert.notDeepEqual(wrongGlyph.state.icons, withUpstream.state.icons, `${where}: a swapped glyph was not detected in the icon state`);
          const wrongPixels = differingIcons(wrongGlyph.icons, withUpstream.icons, `${where} (wrong glyph)`);
          assert.ok(wrongPixels.length > 0, `${where}: a swapped glyph was not detected in the icon pixels`);
          assert.deepEqual(wrongPixels.filter((icon) => !swapped(icon)), [], `${where}: swapping two glyphs changed the pixels of an icon that was not swapped`);
          const missing = await open(side, route, "no-font");
          assert.equal(missing.statuses.get("/__broken/missing.woff2"), 404, `${where}: the font-less control requests its missing font`);
          const noFont = await stableIconPixels(missing.page, `${where} (no font)`);
          await missing.page.close();
          const noFontPixels = differingIcons(noFont, withUpstream.icons, `${where} (no font)`);
          assert.ok(noFontPixels.length > 0, `${where}: a stylesheet without its font was not detected in the icon pixels`);
          assertions += 5;
          reference.rejected += 2;
          reference.swapped = Math.max(reference.swapped, wrongPixels.length);
          reference.fontless = Math.max(reference.fontless, noFontPixels.length);
        }
      }
    }

    /* Each subset glyph against the same glyph of the upstream font. */
    const page = await browser.newPage();
    await page.goto(`${originOf("React")}/__glyphs`, { waitUntil: "load" });
    const { loaded, glyphs } = await page.evaluate(async (codePoints) => {
      await Promise.all(["subset", "upstream"].map((family) => document.fonts.load(`96px ${family}`, String.fromCodePoint(codePoints[0]))));
      const draw = (family, codePoint) => {
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 160;
        const context = canvas.getContext("2d");
        context.font = `96px ${family}`;
        context.textBaseline = "alphabetic";
        context.fillText(String.fromCodePoint(codePoint), 24, 120);
        const { data } = context.getImageData(0, 0, 160, 160);
        let inked = 0;
        for (let index = 3; index < data.length; index += 4) if (data[index]) inked += 1;
        return { data: Array.from(data).join(","), inked, advance: context.measureText(String.fromCodePoint(codePoint)).width };
      };
      const loaded = [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replace(/["']/g, "")).sort();
      const seen = new Map();
      return { loaded, glyphs: codePoints.map((codePoint) => {
        const [subsetGlyph, upstreamGlyph] = [draw("subset", codePoint), draw("upstream", codePoint)];
        if (!seen.has(subsetGlyph.data)) seen.set(subsetGlyph.data, seen.size);
        return { codePoint, shape: seen.get(subsetGlyph.data), inked: subsetGlyph.inked, identical: subsetGlyph.data === upstreamGlyph.data, advance: subsetGlyph.advance === upstreamGlyph.advance };
      }) };
    }, subset.codePoints);
    for (const glyph of glyphs) {
      const name = subset.names.find((candidate) => parseInt(upstreamIcons.get(candidate), 16) === glyph.codePoint);
      assert.ok(glyph.inked > 200, `${name}: subset glyph is blank`);
      assert.ok(glyph.identical && glyph.advance, `${name}: subset glyph differs from the upstream glyph`);
      assertions += 2;
    }
    /* A font that failed to load would draw the same fallback box for every
     * code point, on both sides. */
    assert.deepEqual(loaded, ["subset", "upstream"], "both fonts loaded for the glyph comparison");
    assert.equal(new Set(glyphs.map((glyph) => glyph.shape)).size, subset.codePoints.length, "every subset glyph draws a distinct shape");
    assertions += 2;
  } finally {
    await browser.close();
    await Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.close(resolve))));
  }

  console.log(`Master 3 #32A icon subset passed${requestedRoot ? " against emitted dist-site" : ""}. ${assertions} assertions · Boxicons ${ICON_VERSION} · ${subset.names.length} of ${upstreamIcons.size} icons · font ${sizes.fontBytes} B · stylesheet ${sizes.stylesheetBytes} B raw/${sizes.stylesheetGzipBytes} B gzip · OFL 1.1 complete + MIT notice published, no Reserved Font Name · ${reactDocuments.length} React documents · ${controls.length} negative controls · normalization changes only the icon links on ${reactDocuments.length} accepted + ${reactDocuments.length} emitted documents (${scopeControls.length} scope controls) · ${BROWSER_ROUTES.length} routes rendered hermetically: ${report.icons} icons (${report.hidden} aria-hidden, ${report.named} inside a named control, ${report.bare} decorative without aria-hidden) · ${subset.names.length} glyphs pixel-identical to upstream · upstream-reference rendering identical on ${reference.pages} pages (accepted + React): ${reference.icons} icon states, ${reference.elements} element boxes, ${reference.pixels} icon boxes pixel-exact · ${reference.rejected} broken stylesheets rejected in the icon pixels (swapped glyph: ${reference.swapped} icons, missing font: ${reference.fontless} icons).`);
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
