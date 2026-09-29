#!/usr/bin/env node
/** Build the deliberately bounded static artifact deployed to GitHub Pages. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, loadProjectRegistry, indexableRoutes } from "./i18n-catalog.mjs";
import { loadSiteRoutes, loadRouteRuntime } from "./site-routes.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONFIG_FILE = "data/site/public-artifact.json";

const posix = (value) => value.replaceAll(path.sep, "/");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

export function loadArtifactConfig() {
  return readJson(CONFIG_FILE);
}

export function listFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`public artifact source cannot contain a symbolic link: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(posix(path.relative(directory, absolute)));
    }
  };
  walk(directory);
  return files;
}

function copyFile(relative, output, copied) {
  const source = path.resolve(ROOT, relative);
  const destination = path.resolve(output, relative);
  if (!source.startsWith(`${ROOT}${path.sep}`) || !destination.startsWith(`${output}${path.sep}`)) {
    throw new Error(`public artifact path escaped its root: ${relative}`);
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`required public artifact source is missing: ${relative}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  copied.add(posix(relative));
}

function copyDirectory(relative, output, copied, excluded) {
  const source = path.join(ROOT, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`required public artifact directory is missing: ${relative}/`);
  }
  for (const file of listFiles(source)) {
    const target = posix(path.posix.join(relative, file));
    if (!excluded.has(target)) copyFile(target, output, copied);
  }
}

/** Returns every committed/generated document required by the route contract. */
export function routeDocuments() {
  const site = loadSiteRoutes();
  const registry = loadRegistry();
  const runtime = loadRouteRuntime(registry, site);
  const locales = [
    registry.defaultLocale,
    ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale),
  ];
  const routes = indexableRoutes(loadProjectRegistry());
  const documents = new Set();

  for (const locale of locales) {
    for (const route of routes) documents.add(runtime.documentPathFor(route.page, locale));
    for (const companion of site.companions) {
      documents.add(locale === registry.defaultLocale
        ? companion.document
        : `${runtime.localeRoutePrefix(locale)}${companion.document}`);
    }
    for (const page of site.pages) {
      if (!page.legacy) continue;
      documents.add(locale === registry.defaultLocale
        ? page.legacy
        : `${runtime.localeRoutePrefix(locale)}${page.legacy}`);
    }
  }
  return [...documents].sort();
}

export function validateArtifactFiles(files, config = loadArtifactConfig()) {
  const normalized = files.map((file) => posix(file).replace(/^\.\//, ""));
  const forbidden = [];
  for (const file of normalized) {
    if (!file || file.startsWith("/") || file.includes("../")) forbidden.push(file || "<empty>");
    if ((config.forbiddenPrefixes || []).some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix))) forbidden.push(file);
    if ((config.forbiddenExtensions || []).includes(path.extname(file).toLowerCase())) forbidden.push(file);
  }
  if (forbidden.length) {
    throw new Error(`public artifact containment violation: ${[...new Set(forbidden)].join(", ")}`);
  }
  for (const required of ["CNAME", "404.html", "robots.txt", "sitemap.xml", ".nojekyll"]) {
    if (!normalized.includes(required)) throw new Error(`public artifact is missing required file: ${required}`);
  }
  return true;
}

export function buildPagesArtifact(outputDirectory = path.join(ROOT, loadArtifactConfig().outputDirectory)) {
  const output = path.resolve(outputDirectory);
  const configuredOutput = path.resolve(ROOT, loadArtifactConfig().outputDirectory);
  const temporaryRoot = path.resolve(os.tmpdir());
  const isTemporary = output.startsWith(`${temporaryRoot}${path.sep}`);
  if (output !== configuredOutput && !isTemporary) {
    throw new Error(`refusing unsafe Pages artifact output: ${output}`);
  }
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  const config = loadArtifactConfig();
  const copied = new Set();
  const excluded = new Set(config.excludedBrowserFiles || []);
  for (const directory of config.browserDirectories || []) copyDirectory(directory, output, copied, excluded);
  for (const file of config.rootRuntimeFiles || []) copyFile(file, output, copied);
  for (const file of routeDocuments()) copyFile(file, output, copied);
  for (const file of config.generatedDeploymentFiles || []) {
    const destination = path.join(output, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "", "utf8");
    copied.add(file);
  }

  const files = listFiles(output);
  validateArtifactFiles(files, config);
  return { output, files, copied: [...copied].sort() };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const requested = process.argv.includes("--output")
      ? process.argv[process.argv.indexOf("--output") + 1]
      : undefined;
    const result = buildPagesArtifact(requested ? path.resolve(ROOT, requested) : undefined);
    console.log(`Pages artifact built: ${path.relative(ROOT, result.output) || result.output} · ${result.files.length} files`);
  } catch (error) {
    console.error(`Pages artifact build failed: ${error.message}`);
    process.exit(1);
  }
}
