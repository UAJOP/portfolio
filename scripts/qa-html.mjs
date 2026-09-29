#!/usr/bin/env node
/**
 * qa-html.mjs — HTML validation over every document the site publishes.
 *
 * The file list is derived from the route contract rather than from globs:
 * clean-route pages are directories (`works/index.html`, `tr/works/index.html`)
 * sitting next to unrelated directories such as the gitignored `dist-react/`,
 * so a `*\/index.html` glob would both over- and under-match. Asking the route
 * module which files serve which URLs keeps validation exactly in step with
 * what GitHub Pages publishes: authored pages, companions, generated project
 * and locale routes, and the legacy `.html` compatibility stubs.
 *
 *   node scripts/qa-html.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { ROOT, loadRegistry, loadProjectRegistry, indexableRoutes, STATIC_ROUTES, COMPANION_ROUTES } from "./i18n-catalog.mjs";
import { loadRouteRuntime } from "./site-routes.mjs";

const registry = loadRegistry();
const ROUTES = loadRouteRuntime(registry);
const routes = [...indexableRoutes(loadProjectRegistry()), ...COMPANION_ROUTES];
const locales = registry.locales
  .map((locale) => locale.id)
  .filter((id) => id === registry.defaultLocale || fs.existsSync(path.join(ROOT, registry.byId.get(id).routePrefix)));

const files = new Set();
for (const locale of locales) {
  const prefix = ROUTES.localeRoutePrefix(locale);
  for (const route of routes) files.add(ROUTES.documentPathFor(route.page, locale));
  for (const route of STATIC_ROUTES) {
    if (route.legacy && route.legacy !== ROUTES.documentPathFor(route.page)) files.add(`${prefix}${route.legacy}`);
  }
}

const missing = [...files].filter((file) => !fs.existsSync(path.join(ROOT, file)));
if (missing.length) {
  console.error(`qa:html: ${missing.length} published document(s) are missing:\n${missing.map((file) => `  - ${file}`).join("\n")}`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve("html-validate/package.json")), "bin", "html-validate.mjs");
const result = spawnSync(process.execPath, [cli, ...[...files].sort()], { cwd: ROOT, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`HTML validation passed. ${files.size} published documents across ${locales.length} locale(s).`);
