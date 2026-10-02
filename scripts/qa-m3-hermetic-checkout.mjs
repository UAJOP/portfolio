#!/usr/bin/env node
/* CI reproducibility for Master 3 gates. GitHub Actions checks out with
 * actions/checkout@v5 (fetch-depth 1), so no gate may read git history.
 *
 * 1. Static guard (always): every script reachable from the package scripts
 *    CI and deploy run, following static imports, must not access git history.
 * 2. History-free run (--run, optional --full): exports the current working
 *    tree into a fresh repository with a single commit, proves the accepted
 *    commit is absent there, and runs the history-sensitive gates in it. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./i18n-catalog.mjs";

const CI_SCRIPTS = ["qa", "build:react", "qa:react", "build:site", "qa:m3:artifact", "qa:site:artifact"];
const ACCEPTED_REFS = ["24be2f8159a0925dc00f29375ea8740738214df3", "34fdfad01f63004ed10d616a7b061e3996c28150"];
const HISTORY_ACCESS = /(execFileSync|execSync|spawnSync|spawn|exec)\(\s*["'`]git["'`]|["'`]git["'`]\s*,\s*\[\s*["'`](show|rev-parse|read-tree|archive|cat-file|log|checkout-index|diff)["'`]|\bgit (show|rev-parse|read-tree|archive|cat-file|log|checkout-index)\b/;
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function reachableFiles() {
  const scripts = new Set();
  const files = new Set();
  const visitScript = (name) => {
    if (scripts.has(name)) return;
    scripts.add(name);
    const command = packageJson.scripts[name];
    assert.ok(command !== undefined, `package script ${name} must exist`);
    for (const match of command.matchAll(/npm run ([\w:.-]+)/g)) visitScript(match[1]);
    for (const match of command.matchAll(/\bnode\s+([\w./-]+\.(?:mjs|js))/g)) visitFile(path.join(ROOT, match[1]));
  };
  const visitFile = (file) => {
    if (files.has(file) || !fs.existsSync(file)) return;
    files.add(file);
    /* The guard names the maintainer snapshot tool only as its own negative
     * control; it never executes it, so its references are not followed. */
    if (file === SELF) return;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:import\s[^"'`]*?from\s*|import\(\s*|export\s[^"'`]*?from\s*)["'`](\.{1,2}\/[^"'`]+)["'`]/g)) {
      visitFile(path.resolve(path.dirname(file), match[1]));
    }
    /* Gates also spawn sibling scripts with process.execPath. */
    for (const match of source.matchAll(/["'`]scripts\/([\w.-]+\.mjs)["'`]/g)) visitFile(path.join(ROOT, "scripts", match[1]));
  };
  CI_SCRIPTS.forEach(visitScript);
  return { scripts, files };
}

/* Code only: block comments and whole-line comments are documentation. */
const code = (file) => fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/* This guard itself only runs ls-files/init on a temporary copy, which a
 * shallow checkout supports; it never reads history. */
const SELF = path.join(ROOT, "scripts/qa-m3-hermetic-checkout.mjs");

function staticGuard() {
  const { scripts, files } = reachableFiles();
  const offenders = [...files].filter((file) => file !== SELF && (HISTORY_ACCESS.test(code(file))
    || ACCEPTED_REFS.some((ref) => new RegExp(`git[^\\n]*${ref}|${ref}[^\\n]*\\^\\{(commit|tree)\\}`).test(code(file)))));
  assert.deepEqual(offenders.map((file) => path.relative(ROOT, file)), [], "CI-reachable scripts must not read git history");
  /* Negative control: a known history reader must be detected by the guard. */
  assert.ok(HISTORY_ACCESS.test(code(path.join(ROOT, "scripts/generate-m3-26-accepted-snapshot.mjs"))),"static guard failed to detect a git history reader");
  return { scripts: scripts.size, files: files.size };
}

function exportHistoryFreeCheckout() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-hermetic-"));
  const target = path.join(temp, "repo");
  const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  for (const file of listed) {
    const source = path.join(ROOT, file);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(source, path.join(target, file));
  }
  const git = (...args) => execFileSync("git", ["-c", "user.name=qa", "-c", "user.email=qa@example.invalid", "-c", "core.autocrlf=false", ...args], { cwd: target, stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "history-free checkout");
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(target, "node_modules"), "junction");
  return { target, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

const { scripts, files } = staticGuard();
console.log(`Hermetic static guard passed. ${scripts} CI package scripts · ${files} reachable scripts · git-history readers=0 · 1 negative control.`);

if (process.argv.includes("--run")) {
  const checkout = exportHistoryFreeCheckout();
  try {
    /* Negative precondition: the accepted commits must be unreachable here. */
    for (const ref of ACCEPTED_REFS) {
      assert.throws(() => execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: checkout.target, stdio: "pipe" }), undefined, `${ref} must be absent from the history-free checkout`);
    }
    const gates = [
      "scripts/qa-m3-foundation.mjs",
      "scripts/qa-m3-works-games-parity.mjs",
      "scripts/qa-m3-works-games-i18n-authority.mjs",
      "scripts/qa-m3-artifact-parity.mjs",
      ...(process.argv.includes("--full") ? ["scripts/qa-m3-works-games-differential.mjs"] : []),
    ];
    for (const gate of gates) {
      const output = execFileSync(process.execPath, [gate], { cwd: checkout.target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
      console.log(`  history-free: ${gate} → ${output.trim().split("\n").filter((line) => /passed/.test(line)).pop()}`);
    }
    console.log(`History-free checkout run passed. ${gates.length} gates · accepted commits absent · no git history read.`);
  } finally {
    checkout.cleanup();
  }
}
