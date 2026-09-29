#!/usr/bin/env node
/**
 * qa-routes-http.mjs — clean-route smoke test over real HTTP.
 *
 * `qa:routes` proves the files are in the right places; this proves a server
 * actually answers for them the way a browser refresh, an external link and a
 * crawler will ask:
 *
 *   - every clean route in every published locale answers 200 with its own
 *     canonical, straight from its directory index (no SPA fallback, no 404
 *     interception)
 *   - every legacy `.html` URL answers 200 with a stub that forwards to its
 *     clean route, and that route answers 200
 *   - an extensionless legacy URL either redirects to the clean directory or
 *     resolves through its matching `.html` compatibility document
 *   - every first-party asset the published pages reference answers 200
 *   - every sitemap URL answers 200
 *   - an unknown URL answers 404 (with the site's recovery page where the host
 *     serves a custom 404, as GitHub Pages does)
 *
 * With no arguments it serves the working tree itself, mimicking GitHub Pages'
 * static rules. Point it at any running server instead with --base:
 *
 *   node scripts/qa-routes-http.mjs
 *   node scripts/qa-routes-http.mjs --base http://127.0.0.1:4173
 *   node scripts/qa-routes-http.mjs --base https://kaanbalci.com --sample
 *
 * `--sample` checks a representative subset (every locale home and a spread of
 * routes) for smoke-testing production without crawling all of it.
 * `--no-custom-404` skips the 404 body check for servers, such as Python's
 * http.server, that answer with their own error page.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  ROOT,
  read,
  loadRegistry,
  loadProjectRegistry,
  indexableRoutes,
  STATIC_ROUTES,
  COMPANION_ROUTES,
} from "./i18n-catalog.mjs";
import { loadSiteRoutes, loadRouteRuntime } from "./site-routes.mjs";

const args = process.argv.slice(2);
const argValue = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};
const sample = args.includes("--sample");
const customNotFound = !args.includes("--no-custom-404");

const site = loadSiteRoutes();
const registry = loadRegistry();
const ROUTES = loadRouteRuntime(registry, site);
const allRoutes = indexableRoutes(loadProjectRegistry());
const locales = [
  registry.defaultLocale,
  ...(registry.localizedRoutes?.generate || []).filter((id) => id !== registry.defaultLocale),
];

/* ---------- a GitHub Pages-shaped static server ---------- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

/**
 * GitHub Pages' rules for a static branch deploy: a file is served as itself;
 * an extensionless request may resolve the matching `.html` file; otherwise a
 * directory without a slash redirects and a directory with one serves its
 * index.html. Unknown paths get the custom 404. There is no SPA fallback.
 */
function startPagesServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (error) {
      response.writeHead(400).end();
      return;
    }
    const absolute = path.join(ROOT, pathname);
    if (!absolute.startsWith(ROOT)) {
      response.writeHead(403).end();
      return;
    }
    let file = absolute;
    const extensionlessHtml = !pathname.endsWith("/") && !path.extname(pathname) ? `${absolute}.html` : null;
    if (extensionlessHtml && fs.existsSync(extensionlessHtml) && fs.statSync(extensionlessHtml).isFile()) {
      file = extensionlessHtml;
    } else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith("/")) {
        response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { "Content-Type": TYPES[".html"] });
      response.end(fs.readFileSync(path.join(ROOT, "404.html")));
      return;
    }
    response.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---------- checks ---------- */

let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};

/* Small single-process dev servers (Python's http.server listens with a
 * backlog of five) refuse connections under a burst; a refused connection is
 * the harness's problem, not a route failure, so it is retried briefly. */
const TRANSIENT = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(base, pathname, { redirect = "follow" } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(new URL(pathname, base), { redirect });
      const type = response.headers.get("content-type") || "";
      const body = /html|xml|text/.test(type) ? await response.text() : (await response.arrayBuffer(), "");
      return { status: response.status, type, body, location: response.headers.get("location"), url: response.url };
    } catch (error) {
      if (attempt >= 4 || !TRANSIENT.has(error.cause?.code)) throw error;
      await sleep(150 * (attempt + 1));
    }
  }
}

const CONCURRENCY = Math.max(1, Number(argValue("--concurrency")) || 8);

/** Runs async checks with a small concurrency cap so a remote host is not hammered. */
async function inBatches(items, worker, size = CONCURRENCY) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker));
  }
}

const pick = (list, count) => {
  if (!sample || list.length <= count) return list;
  const step = list.length / count;
  return Array.from({ length: count }, (_, index) => list[Math.floor(index * step)]);
};

async function run(base) {
  for (const locale of locales) {
    const definition = registry.byId.get(locale);
    assert(Boolean(definition), `localized route registry references unknown locale ${locale}`);
    if (!definition || locale === registry.defaultLocale) continue;
    assert(
      fs.existsSync(path.join(ROOT, definition.routePrefix)),
      `required locale directory is missing: ${definition.routePrefix}/`,
    );
    for (const route of allRoutes) {
      const file = ROUTES.documentPathFor(route.page, locale);
      assert(fs.existsSync(path.join(ROOT, file)), `required localized route document is missing: ${file}`);
    }
  }

  /* 1. clean routes load directly, each with its own canonical */
  const routeUrls = [];
  for (const locale of locales) {
    const routes = sample ? [allRoutes[0], ...pick(allRoutes.slice(1), 6)] : allRoutes;
    for (const route of routes) routeUrls.push(`/${ROUTES.localizedRouteKey(route.page, locale)}`);
  }
  await inBatches(routeUrls, async (pathname) => {
    const response = await get(base, pathname, { redirect: "manual" });
    assert(response.status === 200, `${pathname} must answer 200 on a direct load, got ${response.status}`);
    if (response.status !== 200) return;
    assert(/text\/html/.test(response.type), `${pathname} must be served as HTML, got ${response.type}`);
    const canonical = response.body.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ||
      response.body.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/)?.[1];
    assert(canonical && new URL(canonical).pathname === pathname, `${pathname} must be its own canonical, got ${canonical}`);
    assert(!/GENERATED legacy compatibility stub/.test(response.body), `${pathname} must be a page, not a stub`);
  });

  /* 2. legacy .html URLs keep resolving and forward to the clean route */
  const legacy = [];
  for (const locale of locales) {
    const prefix = ROUTES.localeRoutePrefix(locale);
    for (const route of pick(STATIC_ROUTES.filter((item) => item.legacy && item.legacy !== ROUTES.documentPathFor(item.page)), 4)) {
      legacy.push([`/${prefix}${route.legacy}`, `/${prefix}${route.page}`]);
    }
  }
  await inBatches(legacy, async ([pathname, target]) => {
    const response = await get(base, pathname, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      /* A host that answers legacy URLs with a real redirect is strictly better. */
      assert(new URL(response.location, base).pathname === target, `${pathname} redirects to ${response.location}, expected ${target}`);
      return;
    }
    assert(response.status === 200, `legacy ${pathname} must not become a dead link, got ${response.status}`);
    assert(response.body.includes(`location.replace(${JSON.stringify(target)}`), `legacy ${pathname} must forward to ${target}`);
    assert(response.body.includes(`url=${target}"`), `legacy ${pathname} must forward to ${target} without JavaScript`);
    const destination = await get(base, target, { redirect: "manual" });
    assert(destination.status === 200, `legacy ${pathname} forwards to ${target}, which answers ${destination.status}`);
  });

  /* 3. home index documents stay reachable */
  for (const locale of locales) {
    const pathname = `/${ROUTES.localeRoutePrefix(locale)}index.html`;
    const response = await get(base, pathname, { redirect: "manual" });
    assert(response.status === 200, `${pathname} must keep answering, got ${response.status}`);
  }

  /* 4. GitHub Pages extensionless lookup and directory routing. */
  const assertCompatibility = async (pathname, target) => {
    const response = await get(base, pathname, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      assert(new URL(response.location, base).pathname === target, `${pathname} redirects to ${response.location}, expected ${target}`);
      return;
    }
    assert(response.status === 200, `${pathname} must resolve through its compatibility document, got ${response.status}`);
    assert(/GENERATED legacy compatibility stub/.test(response.body), `${pathname} 200 response must be the compatibility document`);
    assert(response.body.includes(`location.replace(${JSON.stringify(target)}`), `${pathname} compatibility document must forward to ${target}`);
    assert(response.body.includes(`url=${target}"`), `${pathname} compatibility document must refresh to ${target}`);
  };
  const assertClean = async (pathname) => {
    const response = await get(base, pathname, { redirect: "manual" });
    assert(response.status === 200, `${pathname} clean route must answer 200, got ${response.status}`);
    assert(!/GENERATED legacy compatibility stub/.test(response.body), `${pathname} clean route must not be a compatibility stub`);
    const canonical = response.body.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ||
      response.body.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/)?.[1];
    assert(canonical && new URL(canonical).pathname === pathname, `${pathname} clean route canonical is ${canonical}`);
  };
  for (const [pathname, target] of [
    ["/works", "/works/"],
    ["/works.html", "/works/"],
    ["/tr/works", "/tr/works/"],
    ["/tr/works.html", "/tr/works/"],
    ["/single-work", "/certificates/"],
    ["/single-work.html", "/certificates/"],
  ]) {
    await assertCompatibility(pathname, target);
  }
  for (const pathname of ["/works/", "/tr/works/", "/certificates/"]) await assertClean(pathname);

  const projectWithoutSlash = await get(base, "/projects/hospital-form-app", { redirect: "manual" });
  assert(projectWithoutSlash.status >= 300 && projectWithoutSlash.status < 400, `/projects/hospital-form-app must redirect, got ${projectWithoutSlash.status}`);
  if (projectWithoutSlash.location) {
    assert(new URL(projectWithoutSlash.location, base).pathname === "/projects/hospital-form-app/", "project route must add its trailing slash");
  }

  /* 5. the legacy project shell stays a working, unindexed compatibility endpoint */
  const shell = await get(base, "/project-detail.html?project=hospital-form-app", { redirect: "manual" });
  assert(shell.status === 200, `legacy project shell must answer 200, got ${shell.status}`);
  assert(/noindex/.test(shell.body), "legacy project shell must stay noindex");
  const noShellRoute = await get(base, "/project-detail/", { redirect: "manual" });
  assert(noShellRoute.status === 404, `/project-detail/ must not exist as a route, got ${noShellRoute.status}`);

  /* 6. unknown URLs are real 404s, with the recovery page where the host allows */
  for (const pathname of ["/does-not-exist/", "/de/does-not-exist/"]) {
    const response = await get(base, pathname, { redirect: "manual" });
    assert(response.status === 404, `${pathname} must answer 404, got ${response.status}`);
    if (customNotFound) assert(/data-route-locale-from-path/.test(response.body), `${pathname} must serve the site's recovery 404 page`);
  }

  /* 7. first-party assets referenced by published pages */
  const assets = new Set();
  const documents = [];
  for (const locale of locales) {
    for (const route of [...allRoutes, ...COMPANION_ROUTES]) documents.push(ROUTES.documentPathFor(route.page, locale));
  }
  for (const file of documents) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    for (const [, raw] of read(file).matchAll(/\s(?:src|href|data-cert|data-case-gallery)="(\/[^"/][^"]*)"/g)) {
      const value = raw.replaceAll("&amp;", "&").split("#")[0].split("?")[0];
      if (!ROUTES.isLocalizableRoute(ROUTES.canonicalRouteKey(value))) assets.add(value);
    }
  }
  for (const asset of ["/script.js", "/i18n-data.js", "/js/core/locale-routes.js", "/portfolio-data.js", "/sitemap.xml", "/robots.txt"]) assets.add(asset);
  const assetList = pick([...assets].sort(), 40);
  await inBatches(assetList, async (asset) => {
    const response = await get(base, encodeURI(asset), { redirect: "manual" });
    assert(response.status === 200, `asset ${asset} must answer 200, got ${response.status}`);
  });

  /* 8. every sitemap URL is live */
  const sitemap = await get(base, "/sitemap.xml");
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  assert(locs.length > 0, "sitemap.xml must list URLs");
  await inBatches(pick(locs, 30), async (pathname) => {
    const response = await get(base, pathname, { redirect: "manual" });
    assert(response.status === 200, `sitemap URL ${pathname} must answer 200, got ${response.status}`);
  });

  return { routes: routeUrls.length, legacy: legacy.length, assets: assetList.length, sitemap: locs.length };
}

const external = argValue("--base");
const server = external ? null : await startPagesServer();
const base = external || `http://127.0.0.1:${server.address().port}`;
let summary;
try {
  summary = await run(base);
} catch (error) {
  failures.push(`smoke test aborted: ${error.cause?.message || error.message}`);
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

if (failures.length) {
  console.error(`Route HTTP smoke test: ${failures.length} failure(s), ${assertions} assertions against ${base}\n`);
  for (const failure of failures.slice(0, 60)) console.error(`  x ${failure}`);
  if (failures.length > 60) console.error(`  … ${failures.length - 60} more`);
  process.exit(1);
}

console.log(
  `Route HTTP smoke test passed against ${external ? base : "a GitHub Pages-shaped local server"}${sample ? " (sample)" : ""}. ` +
    `${assertions} assertions · ${summary.routes} clean routes · ${summary.legacy} legacy URLs · ${summary.assets} assets · ${summary.sitemap} sitemap URLs.`,
);
