import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_FILE = "data/site/public-artifact.json";

export function validateReactBundleNamespace(config, { reservedFiles = [] } = {}) {
  const namespace = config.reactBundleDirectory;
  if (typeof namespace !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(namespace)) {
    throw new Error(`reactBundleDirectory must be one safe relative directory name; received ${JSON.stringify(namespace)}`);
  }
  if ((config.browserDirectories || []).includes(namespace)) {
    throw new Error(`React bundle namespace collides with a legacy browser directory: ${namespace}`);
  }
  const reservedRoots = new Set([
    ...(config.rootRuntimeFiles || []),
    ...(config.generatedDeploymentFiles || []),
    ...reservedFiles,
  ].map((file) => String(file).replaceAll("\\", "/").split("/")[0]));
  if (reservedRoots.has(namespace)) {
    throw new Error(`React bundle namespace collides with a legacy artifact path: ${namespace}`);
  }
  return namespace;
}

export function loadArtifactConfig(options = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG_FILE), "utf8"));
  validateReactBundleNamespace(config, options);
  return config;
}
