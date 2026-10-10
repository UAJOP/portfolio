/* V4-E06.4 — bring a Merge Rush production build into the portfolio.
 *
 *   node scripts/v4-e06-4-sync-merge-rush.mjs <path to the game checkout>
 *
 * The game's source is private and stays in its own repository. Run
 * `npm run build:portfolio` there first; this copies that build's module and
 * the assets it loads into assets/merge-rush/ and refuses anything that
 * should not be public: a source map, TypeScript, a test hook, an asset
 * manifest. The art masters, the tests and the source never come along.
 *
 * It prints the source commit, so the docs can record which build shipped.
 * Nothing here runs in the site build; the copied files are committed. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET = path.join(ROOT, "assets", "merge-rush");
const source = process.argv[2] && path.resolve(process.argv[2]);
if (!source) throw new Error("usage: node scripts/v4-e06-4-sync-merge-rush.mjs <path to the game checkout>");
const build = path.join(source, "dist-portfolio");
const moduleFile = path.join(build, "merge-rush.js");
if (!fs.existsSync(moduleFile)) throw new Error(`${build} has no merge-rush.js; run "npm run build:portfolio" in the game checkout`);

const ALLOWED = new Set([".js", ".webp", ".ogg", ".mp3"]);
/* The standalone page's favicon; the embedded game never requests it. */
const SKIP = new Set(["assets/branding/merge-rush-icon.png"]);

function walk(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).replaceAll(path.sep, "/")];
  });
}

const files = walk(build).filter((file) => !SKIP.has(file));
for (const file of files) {
  if (!ALLOWED.has(path.extname(file))) throw new Error(`refusing to publish ${file}: only the module, WebP art and Ogg/MP3 audio are expected`);
}
const code = fs.readFileSync(moduleFile, "utf8");
for (const [what, pattern] of [["a source map reference", /sourceMappingURL/], ["the QA hook", /__mergeRush/], ["an inline source map", /sourcesContent/]]) {
  if (pattern.test(code)) throw new Error(`refusing to publish merge-rush.js: it carries ${what}`);
}
if (!/export\s*\{[^}]*\bmountMergeRush\b/.test(code)) throw new Error("merge-rush.js does not export mountMergeRush");

/* The poster is this repository's own file (a capture of the game); it stays. */
const keep = new Map(["poster.webp"].map((name) => [name, path.join(TARGET, name)]).filter(([, file]) => fs.existsSync(file)).map(([name, file]) => [name, fs.readFileSync(file)]));
fs.rmSync(TARGET, { recursive: true, force: true });
for (const file of files) {
  const to = path.join(TARGET, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(build, file), to);
}
for (const [name, bytes] of keep) fs.writeFileSync(path.join(TARGET, name), bytes);

const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
const dirty = git("status", "--porcelain").length > 0;
const bytes = files.reduce((total, file) => total + fs.statSync(path.join(build, file)).size, 0);
console.log(`Merge Rush build copied: ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
console.log(`source: ${git("rev-parse", "--abbrev-ref", "HEAD")} @ ${git("rev-parse", "HEAD")}${dirty ? " (working tree has uncommitted changes)" : ""}`);
