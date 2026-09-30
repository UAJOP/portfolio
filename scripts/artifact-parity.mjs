import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TEXT_EOL_NORMALIZATION = "crlf-to-lf-bytewise";
export const BINARY_NORMALIZATION = "none";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".svg", ".txt", ".xml"]);
const TEXT_FILENAMES = new Set(["CNAME"]);

export function normalizationForArtifactPath(relative) {
  const normalized = String(relative).replaceAll("\\", "/");
  return TEXT_FILENAMES.has(path.posix.basename(normalized)) || TEXT_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())
    ? TEXT_EOL_NORMALIZATION
    : BINARY_NORMALIZATION;
}

/** Convert only the byte pair CR LF to LF. No decoding or other normalization occurs. */
export function canonicalArtifactBytes(bytes, normalization) {
  if (normalization === BINARY_NORMALIZATION) return Buffer.from(bytes);
  if (normalization !== TEXT_EOL_NORMALIZATION) throw new Error(`unknown artifact normalization: ${normalization}`);
  const output = Buffer.allocUnsafe(bytes.length);
  let written = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0d && bytes[index + 1] === 0x0a) continue;
    output[written] = bytes[index];
    written += 1;
  }
  return output.subarray(0, written);
}

export function artifactDigest(file, normalization) {
  const bytes = canonicalArtifactBytes(fs.readFileSync(file), normalization);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function createArtifactManifest(directory, files, acceptedBaseCommit) {
  const entries = files.map((relative) => {
    const normalization = normalizationForArtifactPath(relative);
    return { path: relative, normalization, sha256: artifactDigest(path.join(directory, relative), normalization) };
  });
  return {
    schemaVersion: 2,
    acceptedBaseCommit,
    algorithm: "sha256",
    textEolCanonicalization: TEXT_EOL_NORMALIZATION,
    fileCount: entries.length,
    files: entries,
  };
}

export function validateArtifactManifest(manifest, acceptedBaseCommit) {
  if (
    manifest.schemaVersion !== 2
    || manifest.algorithm !== "sha256"
    || manifest.textEolCanonicalization !== TEXT_EOL_NORMALIZATION
    || manifest.acceptedBaseCommit !== acceptedBaseCommit
  ) {
    throw new Error("#25-A accepted artifact manifest metadata is invalid");
  }
  if (manifest.fileCount !== manifest.files.length || new Set(manifest.files.map((entry) => entry.path)).size !== manifest.fileCount) {
    throw new Error("#25-A accepted artifact manifest file count or path uniqueness is invalid");
  }
  for (const entry of manifest.files) {
    if (entry.normalization !== normalizationForArtifactPath(entry.path)) {
      throw new Error(`artifact normalization classification is invalid: ${entry.path}`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error(`artifact SHA-256 is invalid: ${entry.path}`);
  }
  return manifest;
}

export function compareArtifactManifest(expected, actualDirectory, actualFiles) {
  const expectedEntries = new Map(expected.files.map((entry) => [entry.path, entry]));
  const actualSet = new Set(actualFiles);
  const missing = [...expectedEntries.keys()].filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedEntries.has(file));
  const changed = actualFiles.filter((file) => {
    const entry = expectedEntries.get(file);
    return entry && artifactDigest(path.join(actualDirectory, file), entry.normalization) !== entry.sha256;
  });
  return { actualFiles, missing, extra, changed };
}
