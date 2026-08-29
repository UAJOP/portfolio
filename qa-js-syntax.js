/**
 * Parses every shipped JavaScript file so a syntax error can never reach
 * production through the bootloader, which loads these files at runtime rather
 * than through a build step.
 *
 * Covers root-level scripts and, since BRIEF 03, the runtime modules under js/.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(next);
    return entry.name.endsWith(".js") ? [next.split(path.sep).join("/")] : [];
  });

const files = [
  ...fs.readdirSync(".").filter((file) => file.endsWith(".js")),
  ...(fs.existsSync("js") ? walk("js") : []),
].sort();
const failures = [];

files.forEach((file) => {
  try {
    new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
});

if (failures.length) {
  console.error(`JavaScript syntax check failed for ${failures.length} file(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`JavaScript syntax check passed for ${files.length} file(s).`);
