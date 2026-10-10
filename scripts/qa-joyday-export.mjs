#!/usr/bin/env node
/**
 * J01 — Joyday wallpaper-ready export: the rules of the export geometry.
 *
 * joyday-paint.js keeps sizes, validation, Fit / Fill placement and the file
 * name in `JoydayExport`, plain functions with no canvas and no DOM. This gate
 * evaluates the shipped file and holds those functions to their rules, then
 * proves the rules bite: each negative control is the real geometry with one
 * deliberate fault, and every one of them has to be caught.
 *
 * What a browser has to show — the PNG's real pixel size, the artwork-only
 * output, a round canvas that stays round — is scripts/j01-joyday-export-review.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "joyday-paint.js"), "utf8");

let passed = 0;
const failures = [];
function ok(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/* The engine file, evaluated without a page: it finds no canvas and stops. */
const context = vm.createContext({ document: { querySelector: () => null, getElementById: () => null }, AbortController });
vm.runInContext(source, context, { filename: "joyday-paint.js" });
const api = vm.runInContext("JoydayExport", context);

/* ---------- 1. sizes on offer ---------- */

const EXPECTED = {
  desktop: [[1920, 1080], [2560, 1440], [3840, 2160]],
  mobile: [[1080, 1920], [1170, 2532], [1290, 2796], [1440, 3200]],
  social: [[1080, 1080], [1080, 1350]],
};
for (const [group, sizes] of Object.entries(EXPECTED)) {
  const listed = api.PRESETS.filter((item) => item.group === group).map((item) => [item.width, item.height]);
  ok(`${group} presets are exactly the brief's`, JSON.stringify(listed) === JSON.stringify(sizes), JSON.stringify(listed));
}
ok("no preset outside the three groups", api.PRESETS.length === 9);
for (const item of api.PRESETS) {
  ok(`${item.id} is named after its own size`, item.id === `${item.group}-${item.width}x${item.height}`);
  ok(`${item.id} resolves to itself`, api.preset(item.id) === item);
  ok(`${item.id} is inside the custom limits`, api.customSize(item.width, item.height) !== null);
}
ok("desktop presets are landscape", api.PRESETS.filter((item) => item.group === "desktop").every((item) => item.width > item.height));
ok("mobile presets are portrait", api.PRESETS.filter((item) => item.group === "mobile").every((item) => item.height > item.width));
ok("an unknown preset is nothing", api.preset("desktop-1x1") === null && api.preset("original") === null);

/* ---------- 2. custom size validation ---------- */

const { min, max } = api.LIMITS;
ok("limits are 320–4096 px", min === 320 && max === 4096);
ok("a valid custom size passes through unchanged", JSON.stringify(api.customSize(1600, 900)) === JSON.stringify({ width: 1600, height: 900 }));
ok("form strings are read as numbers", JSON.stringify(api.customSize("1290", "2796")) === JSON.stringify({ width: 1290, height: 2796 }));
ok("both limits are allowed", api.customSize(min, max) !== null && api.customSize(max, min) !== null);
for (const [label, width, height] of [
  ["below the lower limit", min - 1, 1080], ["above the upper limit", 1920, max + 1], ["zero", 0, 1080], ["negative", -1920, 1080],
  ["a fraction", 1920.5, 1080], ["empty width", "", 1080], ["empty height", 1920, "  "], ["not a number", "wide", 1080],
  ["missing", undefined, 1080], ["infinite", Infinity, 1080], ["absurd", 100000, 100000],
]) ok(`custom size rejected: ${label}`, api.customSize(width, height) === null);

/* ---------- 3. the rules of placement ---------- */

const SOURCES = { square: [900, 900], circle: [900, 900], rect: [720, 1080], landscape: [1200, 800] };
const TARGETS = [...api.PRESETS.map((item) => [item.width, item.height]), [320, 4096], [4096, 320], [900, 900], [720, 1080]];
const FOCALS = [[0.5, 0.5], [0, 0], [1, 1], [0.2, 0.9], [-3, 7], [NaN, undefined]];

/* Every rule a placement has to keep, for one geometry function. */
function violations(geometry) {
  const found = new Set();
  const flag = (rule) => found.add(rule);
  for (const [shape, [sourceWidth, sourceHeight]] of Object.entries(SOURCES)) {
    for (const [width, height] of TARGETS) {
      for (const mode of ["fit", "fill"]) {
        for (const [focalX, focalY] of FOCALS) {
          const g = geometry({ sourceWidth, sourceHeight, width, height, mode, focalX, focalY });
          /* One scale on both axes: the drawn part keeps its own proportions. */
          if (!near(g.dw / g.sw, g.dh / g.sh, 1e-9)) flag("stretched");
          if (!near(g.dw / g.sw, g.scale, 1e-9)) flag("scale misreported");
          /* A round canvas is drawn with the same factor across and down. */
          if (shape === "circle" && !near((g.dw / g.sw) * sourceWidth, (g.dh / g.sh) * sourceHeight, 1e-6)) flag("circle elliptical");
          /* Only artwork that exists is read. */
          if (g.sx < -1e-9 || g.sy < -1e-9 || g.sx + g.sw > sourceWidth + 1e-9 || g.sy + g.sh > sourceHeight + 1e-9) flag("reads outside the artwork");
          if (mode === "fit") {
            if (!near(g.sw, sourceWidth) || !near(g.sh, sourceHeight) || g.sx !== 0 || g.sy !== 0) flag("fit crops the artwork");
            if (g.dx < -1e-9 || g.dy < -1e-9 || g.dx + g.dw > width + 1e-9 || g.dy + g.dh > height + 1e-9) flag("fit leaves the frame");
            if (!near(g.dx, (width - g.dw) / 2) || !near(g.dy, (height - g.dh) / 2)) flag("fit is off centre");
            if (!near(g.dw, width) && !near(g.dh, height)) flag("fit does not reach the frame");
          } else {
            if (g.dx !== 0 || g.dy !== 0 || g.dw !== width || g.dh !== height) flag("fill leaves the frame uncovered");
            if (!near(g.sw / g.sh, width / height, 1e-9)) flag("fill crop is not the frame's shape");
            if (!near(g.sw, sourceWidth) && !near(g.sh, sourceHeight)) flag("fill crops both axes");
          }
        }
      }
    }
  }
  /* A portrait frame from a landscape artwork crops across, and the other way round. */
  const across = (focalX) => geometry({ sourceWidth: 1200, sourceHeight: 800, width: 1080, height: 1920, mode: "fill", focalX, focalY: 0.5 });
  const down = (focalY) => geometry({ sourceWidth: 720, sourceHeight: 1080, width: 1920, height: 1080, mode: "fill", focalX: 0.5, focalY });
  if (!(across(0).sx === 0 && across(1).sx > across(0.5).sx && across(0.5).sx > 0)) flag("horizontal focal point ignored");
  if (!near(across(1).sx + across(1).sw, 1200)) flag("horizontal focal point does not reach the edge");
  if (!(down(0).sy === 0 && down(1).sy > down(0.5).sy && down(0.5).sy > 0)) flag("vertical focal point ignored");
  if (!near(down(1).sy + down(1).sh, 1080)) flag("vertical focal point does not reach the edge");
  if (across(-5).sx !== across(0).sx || across(9).sx !== across(1).sx || down(-5).sy !== down(0).sy || down(9).sy !== down(1).sy) flag("focal point not clamped");
  if (!near(across(0.5).sx, (1200 - across(0.5).sw) / 2) || !near(across(NaN).sx, across(0.5).sx)) flag("default focal point is not the centre");
  /* The axis that is not cropped has nowhere to move. */
  if (across(0.5).sy !== 0 || down(0.5).sx !== 0) flag("focal point moves an uncropped axis");
  /* The frame is the size asked for, not its transpose. */
  const wide = geometry({ sourceWidth: 900, sourceHeight: 900, width: 1920, height: 1080, mode: "fill" });
  if (!(wide.dw === 1920 && wide.dh === 1080 && near(wide.sw / wide.sh, 1920 / 1080, 1e-9))) flag("width and height inverted");
  return [...found];
}

const real = violations(api.geometry);
ok("the shipped geometry keeps every placement rule", real.length === 0, real.join("; "));

/* The four cases the brief names, stated on their own. */
const fit = (sourceWidth, sourceHeight, width, height) => api.geometry({ sourceWidth, sourceHeight, width, height, mode: "fit" });
const letterboxed = fit(1200, 800, 1080, 1920);
ok("fit: landscape artwork in a portrait frame spans the width", near(letterboxed.dw, 1080) && near(letterboxed.dh, 720) && near(letterboxed.dy, 600) && letterboxed.dx === 0);
const pillarboxed = fit(720, 1080, 1920, 1080);
ok("fit: portrait artwork in a landscape frame spans the height", near(pillarboxed.dh, 1080) && near(pillarboxed.dw, 720) && near(pillarboxed.dx, 600) && pillarboxed.dy === 0);
const squareWide = fit(900, 900, 1920, 1080);
ok("fit: square artwork in a landscape frame stays square and centred", near(squareWide.dw, 1080) && near(squareWide.dh, 1080) && near(squareWide.dx, 420));
const squareTall = fit(900, 900, 1080, 1920);
ok("fit: square artwork in a portrait frame stays square and centred", near(squareTall.dw, 1080) && near(squareTall.dh, 1080) && near(squareTall.dy, 420));
const cover = api.geometry({ sourceWidth: 900, sourceHeight: 900, width: 3840, height: 2160, mode: "fill" });
ok("fill: square artwork covers 3840 × 2160 at one scale", near(cover.scale, 3840 / 900) && near(cover.sw, 900) && near(cover.sh, 506.25) && near(cover.sy, 196.875));

/* ---------- 4. negative controls ---------- */

const CONTROLS = [
  ["accidental stretching", /stretched/, (input) => {
    const g = api.geometry(input);
    return input.mode === "fit" ? { ...g, dx: 0, dy: 0, dw: input.width, dh: input.height } : { ...g, sx: 0, sy: 0, sw: input.sourceWidth, sh: input.sourceHeight };
  }],
  ["width and height inverted", /inverted|uncovered|leaves the frame/, (input) => api.geometry({ ...input, width: input.height, height: input.width })],
  ["focal point ignored", /focal point ignored/, (input) => api.geometry({ ...input, focalX: 0.5, focalY: 0.5 })],
  ["horizontal focal point ignored", /horizontal focal point ignored/, (input) => api.geometry({ ...input, focalX: 0.5 })],
  ["vertical focal point ignored", /vertical focal point ignored/, (input) => api.geometry({ ...input, focalY: 0.5 })],
  ["focal point not clamped", /reads outside the artwork|not clamped/, (input) => {
    const g = api.geometry(input);
    if (input.mode !== "fill") return g;
    const raw = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0.5);
    return { ...g, sx: g.slackX * raw(input.focalX), sy: g.slackY * raw(input.focalY) };
  }],
  ["preview size used for the frame", /uncovered|leaves the frame|does not reach/, (input) => {
    const small = api.previewSize(input.width, input.height);
    return api.geometry({ ...input, width: small.width, height: small.height });
  }],
  ["circle drawn as an ellipse", /circle elliptical/, (input) => {
    const g = api.geometry(input);
    return input.mode === "fit" ? { ...g, dw: g.dw * 1.2 } : { ...g, sw: g.sw / 1.2 };
  }],
  ["fit that crops", /fit crops the artwork/, (input) => (input.mode === "fit" ? api.geometry({ ...input, mode: "fill" }) : api.geometry(input))],
  ["fill that letterboxes", /uncovered/, (input) => (input.mode === "fill" ? api.geometry({ ...input, mode: "fit" }) : api.geometry(input))],
];
for (const [label, expected, faulty] of CONTROLS) {
  const found = violations(faulty);
  ok(`negative control caught: ${label}`, found.some((rule) => expected.test(rule)), found.join("; ") || "nothing was flagged");
}

/* ---------- 5. preview and file name ---------- */

for (const [width, height] of TARGETS) {
  const small = api.previewSize(width, height);
  ok(`${width}×${height} preview fits ${api.PREVIEW_MAX} px`, Math.max(small.width, small.height) <= api.PREVIEW_MAX && Math.min(small.width, small.height) >= 1);
  /* Rounding to whole pixels may move the shorter side by half a pixel. */
  ok(`${width}×${height} preview keeps the frame's shape`, Math.abs(small.width / small.height - width / height) <= (width / height) * (1 / Math.min(small.width, small.height)));
  const full = api.geometry({ sourceWidth: 900, sourceHeight: 900, width, height, mode: "fill", focalX: 0.3, focalY: 0.8 });
  const shown = api.geometry({ sourceWidth: 900, sourceHeight: 900, width: small.width, height: small.height, mode: "fill", focalX: 0.3, focalY: 0.8 });
  ok(`${width}×${height} preview shows the crop the PNG gets`, Math.abs(full.sx - shown.sx) <= 2 && Math.abs(full.sy - shown.sy) <= 2 && Math.abs(full.sw - shown.sw) <= 3 && Math.abs(full.sh - shown.sh) <= 3);
}
ok("a small frame is previewed as it is", JSON.stringify(api.previewSize(640, 360)) === JSON.stringify({ width: 640, height: 360 }));
ok("the file name carries the resolution", api.filename({ base: "joyday-action-painting", name: "my-piece", label: "mobile", width: 1290, height: 2796 }) === "joyday-action-painting-my-piece-mobile-1290x2796.png");

/* ---------- 6. what the engine must keep doing ---------- */

ok("the live canvas is sized in one place only", (source.match(/\bcanvas\.(?:width|height)\s*=(?!=)/g) || []).length === 2 && /function setCanvasSize[\s\S]{0,260}canvas\.width = w;\s*canvas\.height = h;/.test(source));
ok("the live canvas keeps its modest sizes", source.includes("{ square: [900, 900], circle: [900, 900], rect: [720, 1080] }"));
ok("frames are resampled at high quality", /imageSmoothingEnabled = true;\s*targetCtx\.imageSmoothingQuality = "high";/.test(source));
ok("a frame is drawn on its own offscreen canvas", /function makeFrameCanvas[\s\S]*?document\.createElement\("canvas"\)[\s\S]*?target\.width = size\.width;\s*target\.height = size\.height;/.test(source));
ok("the artwork is read from the painting canvas, never written for an export", !/function make(?:Artwork|Frame|Export)Canvas[\s\S]*?\bctx\./.test(source.slice(source.indexOf("function exportSpec"), source.indexOf("function roundRect"))));
ok("the signature is opt-in", source.includes("if (signatureInput) signatureInput.checked = false;"));
ok("the PNG is encoded from the export canvas as a blob", /exportCanvas\.toBlob\(/.test(source) && /link\.download = name;/.test(source));

if (failures.length) {
  console.error(`Joyday export QA: ${failures.length} failure(s), ${passed} passed.`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`Joyday export QA passed. ${passed} assertions · ${CONTROLS.length} negative controls caught.`);
