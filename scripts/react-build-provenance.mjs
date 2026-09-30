import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const issuedBuilds = new WeakSet();
const posix = (value) => value.replaceAll(path.sep, "/");
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function listFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`React production output cannot contain a symbolic link: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(posix(path.relative(directory, absolute)));
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  return files;
}

/** Attest the exact files emitted by a React build in this Node invocation. */
export function attestReactBuild({ output, routes }) {
  const resolvedOutput = path.resolve(output);
  const files = listFiles(resolvedOutput);
  const hashes = Object.fromEntries(files.map((file) => [file, digest(path.join(resolvedOutput, file))]));
  const proof = Object.freeze({
    output: resolvedOutput,
    routes: Object.freeze(routes.map((route) => Object.freeze({ ...route }))),
    files: Object.freeze([...files]),
    hashes: Object.freeze(hashes),
  });
  issuedBuilds.add(proof);
  return proof;
}

/** Reject stale, forged, moved, added, removed, or modified React output. */
export function verifyReactBuildProof(proof) {
  if (!proof || !issuedBuilds.has(proof)) {
    throw new Error("React production output is stale or unproven for this build invocation");
  }
  const files = listFiles(proof.output);
  if (files.length !== proof.files.length || files.some((file, index) => file !== proof.files[index])) {
    throw new Error("React production output changed after it was built (file set mismatch)");
  }
  for (const file of files) {
    if (digest(path.join(proof.output, file)) !== proof.hashes[file]) {
      throw new Error(`React production output changed after it was built: ${file}`);
    }
  }
  return proof;
}
