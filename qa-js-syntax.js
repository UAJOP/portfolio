/**
 * Parses every root-level JavaScript file so a syntax error can never reach
 * production through the compatibility bootloader, which loads these files at
 * runtime rather than through a build step.
 */
const fs = require("fs");
const vm = require("vm");

const files = fs.readdirSync(".").filter((file) => file.endsWith(".js")).sort();
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
