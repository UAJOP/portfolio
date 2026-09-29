#!/usr/bin/env node
/** Blocking ownership/deployment-boundary checks, including guard mutations. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPagesArtifact, listFiles, loadArtifactConfig, validateArtifactFiles, ROOT } from "./build-pages-artifact.mjs";

let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const rejects = (label, callback, fragment) => {
  assertions += 1;
  try { callback(); failures.push(`${label}: accepted an unsafe mutation`); }
  catch (error) { if (!String(error.message).includes(fragment)) failures.push(`${label}: wrong diagnostic: ${error.message}`); }
};

const artifactAt = process.argv.indexOf("--artifact");
const suppliedArtifact = artifactAt >= 0 ? process.argv[artifactAt + 1] : null;
const temp = suppliedArtifact ? path.resolve(ROOT, suppliedArtifact) : fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-pages-artifact-"));
try {
  if (suppliedArtifact && (!fs.existsSync(temp) || !fs.statSync(temp).isDirectory())) {
    throw new Error(`Pages artifact does not exist: ${temp}`);
  }
  const result = suppliedArtifact ? { files: listFiles(temp) } : buildPagesArtifact(temp);
  const config = loadArtifactConfig();
  const files = result.files;
  assert(files.length > 300, `bounded artifact should contain the complete site, got ${files.length} files`);
  for (const file of ["CNAME", ".nojekyll", "index.html", "works/index.html", "tr/works/index.html", "projects/hospital-form-app/index.html", "i18n-data.js", "portfolio-data.js"]) {
    assert(files.includes(file), `bounded artifact is missing ${file}`);
  }
  assert(fs.readFileSync(path.join(temp, "CNAME"), "utf8").trim() === "kaanbalci.com", "bounded artifact must preserve the canonical custom domain");
  for (const file of ["README.md", "package.json", "scripts/qa-i18n.mjs", "server/ajoop-bridge.mjs", "data/portfolio/profile.json", "docs/clean-public-routes.md", "js/core/i18n.js"]) {
    assert(!files.includes(file), `engineering/private source leaked into artifact: ${file}`);
  }

  const smoke = spawnSync(process.execPath, ["scripts/qa-routes-http.mjs", "--root", temp], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(smoke.status === 0, `bounded artifact route smoke failed:\n${smoke.stdout}\n${smoke.stderr}`);

  /* Negative mutations prove containment fails closed rather than merely
   * checking the happy artifact produced above. */
  rejects("server source mutation", () => validateArtifactFiles([...files, "server/private.mjs"], config), "containment violation");
  rejects("documentation mutation", () => validateArtifactFiles([...files, "internal-notes.md"], config), "containment violation");
  rejects("missing custom domain mutation", () => validateArtifactFiles(files.filter((file) => file !== "CNAME"), config), "missing required file: CNAME");
} finally {
  if (!suppliedArtifact) fs.rmSync(temp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`Site foundation QA failed: ${failures.length} failure(s), ${assertions} assertions`);
  failures.forEach((failure) => console.error(`  x ${failure}`));
  process.exit(1);
}
console.log(`Site foundation QA passed. ${assertions} assertions · bounded Pages artifact · negative containment guards.`);
