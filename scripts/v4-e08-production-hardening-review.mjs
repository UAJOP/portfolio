#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
/* The review pack is written outside the repository by default (V4 rule). CI
 * runs this script as the blocking V4 release check and points it at its
 * reports directory instead. */
const OUT = process.env.V4_CAPTURE_DIR ? path.resolve(process.env.V4_CAPTURE_DIR) : "C:\\PC-Audit\\v4-review\\v4-e08-production-hardening";
const PORT = process.env.V4_CAPTURE_PORT || "4188";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = "https://ajoop.kaanbalci.com/";
const FORM = "https://script.google.com/";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const viewports = [
  [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932],
  [390, 844], [375, 812], [320, 568], [844, 390], [932, 430],
];
/* Each route with the image its preview must show. A page with authentic
 * evidence of its own previews as itself; Home, Works, Request, About and a
 * project whose card is an identity plate share the general portfolio cover,
 * on purpose. */
const COVER = "portfolio_website_cover.webp";
const socialRoutes = [
  ["Home", "/", COVER], ["Works", "/works/", COVER], ["SINAMA", "/sinama-case-study/", "sinama-social-cover.png"],
  ["AJOOP", "/ajoop/", "ajoop-living-hub-1600.webp"], ["AJOOP case study", "/ajoop-case-study/", "ajoop-living-hub-1600.webp"],
  ["Atölye Joyday", "/atolye-joyday-case-study/", "joyday-case-study-social.webp"],
  ["AI Chatbot Flow Design", "/projects/ai-chatbot-flow-design/", COVER], ["Merge Rush", "/merge-rush/", "poster.webp"],
  ["AI Flow Puzzle", "/ai-flow-puzzle/", "ai-flow-puzzle.webp"], ["Career Adventure", "/adventure/", "career-adventure.webp"],
  ["Joyday Action Painting", "/joyday-paint/", "joyday-action-painting.webp"], ["Hospital System", "/hospital-system-case-study/", "hospital-system-social.webp"],
  ["MyMuseum", "/projects/my-museum/", "my-museum-login-screen.png"], ["Agency DB", "/projects/agency-db/", "agency-db-er-diagram.png"],
  ["Cars Dataset Analysis", "/projects/cars-dataset-analysis/", "cars-price-distribution.png"], ["Plate fallback", "/projects/control-panel/", COVER],
  ["Request", "/request/", COVER], ["About", "/about/", COVER],
];
const captures = [
  ["Home · dark", "/", { width: 1440, height: 900 }, "dark"],
  ["Works · light", "/works/", { width: 1440, height: 900 }, "light"],
  ["Project detail", "/projects/my-museum/", { width: 1440, height: 900 }, "dark"],
  ["Case study", "/sinama-case-study/", { width: 1440, height: 900 }, "dark"],
  ["404", "/missing/e08-route/", { width: 1440, height: 900 }, "dark"],
  ["Games", "/games/", { width: 1440, height: 900 }, "light"],
  ["Game entry", "/merge-rush/", { width: 844, height: 390 }, "dark"],
  ["Request", "/request/", { width: 390, height: 844 }, "light"],
  ["AJOOP", "/ajoop/", { width: 390, height: 844 }, "dark"],
  ["German stress", "/de/works/", { width: 320, height: 568 }, "dark"],
];

fs.mkdirSync(OUT, { recursive: true });
let server = null;
async function ready() {
  try {
    const response = await fetch(`${ORIGIN}/__v4/health`, { signal: AbortSignal.timeout(800) });
    return response.ok && path.resolve((await response.json()).root) === ROOT;
  } catch { return false; }
}
async function ensureServer() {
  if (await ready()) return;
  server = spawn(process.execPath, [path.join(ROOT, "scripts", "v4-preview-server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT }, stdio: "ignore", windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) { if (await ready()) return; await wait(250); }
  throw new Error(`preview server did not become ready on ${PORT}`);
}
async function prepare(page, issues, noJs = false) {
  if (noJs) await page.setJavaScriptEnabled(false);
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location()?.url || "";
    if (message.text().includes(EDGE) || message.text().includes(FORM) || source.startsWith(EDGE) || source.startsWith(FORM)) return;
    if (message.text().includes("Failed to load resource") && page.url().includes("not-found-e08")) return;
    if (message.text().includes("Failed to load resource") && page.url().includes("missing/e08-route")) return;
    if (message.text().includes("Failed to load resource") && new URL(page.url()).pathname.startsWith("/assets/")) return;
    if (message.text().includes("Failed to load resource") && page.url().includes("bulunamadi-e08")) return;
    issues.push(`${page.url()} console: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`${page.url()} pageerror: ${error.message}`));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(EDGE) || url.startsWith(FORM)) {
      request.respond({ status: 503, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" }).catch(() => {});
    } else request.continue().catch(() => {});
  });
}
const meta = (page, selector) => page.$eval(selector, (element) => element.content).catch(() => null);
const safeName = (index, label) => `${String(index + 1).padStart(2, "0")}-${label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function sheet(browser, filename, title, items, columns = 2) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cards = items.map((item) => `<article><img src="data:image/png;base64,${item.buffer.toString("base64")}"><h2>${escape(item.label)}</h2>${item.note ? `<p>${escape(item.note)}</p>` : ""}</article>`).join("");
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#07111f;color:#edf4ff;font:14px Inter,Arial}h1{font-size:26px;margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:18px}article{background:#101c2c;border:1px solid #29405f;border-radius:14px;overflow:hidden}img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;object-position:top}h2{font-size:15px;margin:12px 14px 4px}p{color:#aabbd0;margin:0 14px 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><h1>${escape(title)}</h1><div class="grid">${cards}</div>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
  await page.close();
}

const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });
const issues = [];
const screenshots = [];
const socials = [];
await ensureServer();
/* As every browser gate of this repository launches on the GitHub runner. */
const browser = await puppeteer.launch(process.env.GITHUB_ACTIONS === "true"
  ? { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }
  : { headless: true });
try {
  for (let index = 0; index < captures.length; index += 1) {
    const [label, route, viewport, theme] = captures[index];
    const page = await browser.newPage();
    await prepare(page, issues);
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((value) => localStorage.setItem("kaanbalci-site-theme", value), theme);
    const response = await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle2" });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: HTTP and no horizontal overflow`, response.status() === (route.includes("missing") ? 404 : 200) && overflow === 0, `${response.status()} / ${overflow}px`);
    const buffer = await page.screenshot({ path: path.join(OUT, safeName(index, label)), fullPage: false });
    screenshots.push({ label, buffer, viewport });
    await page.close();
  }
  for (const [width, height] of viewports) {
    const page = await browser.newPage();
    await prepare(page, issues);
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width <= 430, hasTouch: width <= 430 });
    await page.goto(`${ORIGIN}/404.html`, { waitUntil: "networkidle2" });
    const result = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, main: !!document.querySelector("main[data-react-main]"), targets: [...document.querySelectorAll("main a, main button")].every((element) => element.getBoundingClientRect().height >= 40) }));
    check(`404 ${width}×${height}`, result.overflow === 0 && result.main && result.targets, JSON.stringify(result));
    await page.close();
  }
  for (const [label, route, expected] of socialRoutes) {
    const page = await browser.newPage();
    await prepare(page, issues);
    await page.setViewport({ width: 1200, height: 630 });
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle2" });
    const record = {
      label, route,
      title: await meta(page, 'meta[property="og:title"]'), description: await meta(page, 'meta[property="og:description"]'),
      image: await meta(page, 'meta[property="og:image"]'), width: await meta(page, 'meta[property="og:image:width"]'), height: await meta(page, 'meta[property="og:image:height"]'),
      url: await meta(page, 'meta[property="og:url"]'), twitter: await meta(page, 'meta[name="twitter:card"]'), twitterImage: await meta(page, 'meta[name="twitter:image"]'), canonical: await page.$eval('link[rel="canonical"]', (element) => element.href).catch(() => null),
    };
    const imagePath = record.image?.startsWith("https://kaanbalci.com/") ? record.image.replace("https://kaanbalci.com/", "") : null;
    record.imageExists = Boolean(imagePath && fs.existsSync(path.join(ROOT, "dist-site", imagePath)));
    check(`${label}: deliberate social metadata`, Boolean(record.title && record.description && record.image && record.imageExists && record.width && record.height && record.url && record.twitter && record.canonical), JSON.stringify(record));
    const imageResponse = await page.goto(record.image.replace("https://kaanbalci.com", ORIGIN), { waitUntil: "load" });
    const natural = await page.evaluate(() => { const image = document.images[0]; return image ? `${image.naturalWidth}×${image.naturalHeight}` : ""; });
    check(`${label}: previews as ${expected}, the same image for Open Graph and X, at its real size`, path.basename(imagePath || "") === expected && record.twitterImage === record.image && natural === `${record.width}×${record.height}`, `${path.basename(imagePath || "")} · declared ${record.width}×${record.height} · actual ${natural}`);
    const buffer = await page.screenshot({ fullPage: false });
    socials.push({ label, buffer, note: `${record.title} · ${path.basename(imagePath)} · ${record.width}×${record.height}` });
    check(`${label}: social image loads`, imageResponse.ok(), String(imageResponse.status()));
    await page.close();
  }
  const noJs = await browser.newPage();
  await prepare(noJs, issues, true);
  const noJsResponse = await noJs.goto(`${ORIGIN}/nested/not-found-e08/`, { waitUntil: "load" });
  const fallback = await noJs.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, links: document.querySelectorAll("main a").length, canonical: document.querySelectorAll('link[rel="canonical"]').length }));
  check("404 nested no-JS fallback keeps real 404 semantics", noJsResponse.status() === 404 && fallback.h1 && fallback.links >= 3 && fallback.canonical === 0, JSON.stringify({ status: noJsResponse.status(), ...fallback }));
  await noJs.close();
  const tr404 = await browser.newPage();
  await prepare(tr404, issues);
  const trResponse = await tr404.goto(`${ORIGIN}/tr/bulunamadi-e08/`, { waitUntil: "networkidle2" });
  const trState = await tr404.evaluate(() => ({ lang: document.documentElement.lang, heading: document.querySelector("h1")?.textContent, root: document.documentElement.hasAttribute("data-route-locale-from-path") }));
  check("localized bad URL derives Turkish from failed path", trResponse.status() === 404 && trState.lang === "tr" && trState.root && trState.heading !== "This route is not deployed yet.", JSON.stringify(trState));
  await tr404.close();
  const sample = fs.readFileSync(path.join(ROOT, "dist-site", "index.html"), "utf8");
  const assetAudit = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "site", "v4-e08-asset-audit.json"), "utf8"));
  check("stale asset audit is explicit and removed files stay out of the artifact", Object.keys(assetAudit.removed).every((file) => !fs.existsSync(path.join(ROOT, file)) && !fs.existsSync(path.join(ROOT, "dist-site", file))));
  check("retained retired assets have a production reason", Object.keys(assetAudit.retained).length === 14 && Object.values(assetAudit.retained).every(Boolean));
  check("security meta policy is emitted", /Content-Security-Policy/.test(sample) && /object-src &#x27;none&#x27;/.test(sample) && /blob:/.test(sample));
  check("strict referrer policy is emitted", /name="referrer" content="strict-origin-when-cross-origin"/.test(sample));
  check("browser console and hydration stay clean", issues.length === 0, issues.join(" | "));
  await sheet(browser, "00-contact-sheet.png", "V4-E08 · Production hardening · desktop and landscape", screenshots.filter((item) => item.viewport.width > 430), 2);
  await sheet(browser, "00-mobile-contact-sheet.png", "V4-E08 · Mobile acceptance simulation", screenshots.filter((item) => item.viewport.width <= 430), 2);
  await sheet(browser, "00-social-preview-sheet.png", "V4-E08 · Deliberate social preview assets", socials, 3);
} finally {
  await browser.close();
  if (server) server.kill();
}

const passed = checks.filter((item) => item.pass).length;
const failed = checks.length - passed;
const summary = { phase: "V4-E08", generatedAt: new Date().toISOString(), passed, failed, checks, consoleIssues: issues, realDeviceStatus: "pending" };
fs.writeFileSync(path.join(OUT, "qa-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
const report = `# V4-E08 Production Hardening\n\n## Result\n\n- Browser/review-pack checks: ${passed}/${checks.length}${failed ? ` (${failed} failed)` : ""}\n- Real-device acceptance: PENDING (simulation is not a physical-device pass)\n- Hosting: GitHub Pages cannot set arbitrary response headers; CSP and Referrer-Policy are enforced with supported document metadata. X-Content-Type-Options, Permissions-Policy and response-level frame-ancestors remain hosting limitations.\n\n## Real-device checklist\n\n- iPhone/Safari: navigation, locale/theme, safe area, AJOOP, Request form, one case-study → game flow, audio, orientation and Back.\n- Android/Chrome: repeat the same flow; verify touch targets and pinch zoom.\n- Desktop Chrome (optionally Edge/Firefox): keyboard-only flow, overlays/focus return, reduced motion and game exit.\n- After deploy: validate one project URL in social debuggers and verify the live custom 404 status/body.\n\n## Checks\n\n${checks.map((item) => `- ${item.pass ? "PASS" : "FAIL"}: ${item.name}${item.detail ? ` — ${item.detail}` : ""}`).join("\n")}\n`;
fs.writeFileSync(path.join(OUT, "E08-PRODUCTION-HARDENING.md"), report);
/* The patch is the whole intended checkpoint: every change against HEAD, staged
 * or not, then each new file in full. A plain `git diff` leaves out both the
 * staged changes and the untracked files. The index is not touched. */
const git = (args, allowed = [0]) => {
  const run = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!allowed.includes(run.status)) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  return run.stdout;
};
const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
const patch = [git(["diff", "--binary", "HEAD", "--", "."]), ...untracked.map((file) => git(["diff", "--binary", "--no-index", "--", "/dev/null", file], [0, 1]))].join("");
fs.writeFileSync(path.join(OUT, "E08-ACTUAL-DIFF.patch"), patch);
console.log(`V4-E08 review: ${passed}/${checks.length} passed · ${failed} failed → ${OUT}`);
if (failed) process.exitCode = 1;
