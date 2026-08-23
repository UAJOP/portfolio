import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
 * Vite is a PARALLEL build system for the React migration foundation. It never
 * touches the live site:
 *
 *  - `root` is src/react/, so Vite's entry HTML is src/react/index.html and the
 *    repository root — which is the deployed static site — is not a Vite root and
 *    contains no Vite entry. None of the root-level QA globs see React sources.
 *  - `outDir` is dist-react/ with emptyOutDir scoped to it, so a build can never
 *    write over index.html, assets/ or any production JavaScript.
 *  - `base` mounts the preview under /react-preview/, so it can never resolve to
 *    the production "/" route.
 *
 * This file is .mjs on purpose: qa-js-syntax.js parses every root-level *.js as a
 * classic script, and an ESM config would fail that check for no useful reason.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

export const REACT_ROOT = path.join(here, "src", "react");
export const REACT_OUT_DIR = path.join(here, "dist-react");
export const REACT_BASE = "/react-preview/";

/**
 * Canonical portfolio JSON, which lives outside the Vite root because the legacy
 * generator reads it too. React imports it at BUILD time through this alias —
 * never by fetching at runtime — so the data is bundled and pre-rendering can
 * see it.
 */
export const DATA_ROOT = path.join(here, "data");
export const ASSETS_ROOT = path.join(here, "assets");

/**
 * Makes `vite preview` resolve URLs the way a plain static host does.
 *
 * A request under the preview base is answered by exactly one of three outcomes,
 * which are the only three a static host offers:
 *
 *   1. an exact file            ->  hand back to Vite's static middleware
 *   2. a directory index        ->  hand back to Vite's static middleware
 *   3. neither                  ->  404.html, with a real 404 status
 *
 * Without this, Vite's SPA fallback answers every unmatched path with index.html
 * at status 200. That would make client-side routing look like it works on static
 * hosting when it does not, and it would serve the home page's pre-rendered
 * markup at a URL whose client render is NotFound — a genuine hydration mismatch.
 *
 * `vite dev` deliberately keeps the SPA fallback. That is a development
 * convenience, not evidence about production hosting.
 */
function staticHostingEmulation() {
  return {
    name: "react-foundation-static-hosting",
    // `vite preview` resolves config with command "serve"; "preview" is not a
    // valid apply value and would silently disable the plugin entirely.
    apply: "serve",
    configurePreviewServer(server) {
      // Registered in the hook body, which installs it ahead of Vite's own
      // static and fallback middleware, so this decides the outcome first.
      server.middlewares.use((req, res, next) => {
        const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (!requestPath.startsWith(REACT_BASE)) return next();

        const relative = requestPath.slice(REACT_BASE.length);
        const isFile = (candidate) => {
          const resolved = path.join(REACT_OUT_DIR, candidate);
          // Refuse anything that escapes the build output.
          if (!resolved.startsWith(REACT_OUT_DIR)) return false;
          return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
        };

        // An exact file (a hashed bundle, say) goes back to Vite, which already
        // sets the right content type and caching headers for it.
        if (relative !== "" && !relative.endsWith("/") && isFile(relative)) return next();

        // A directory index is served directly, at the requested URL, without a
        // redirect to a trailing slash. That keeps the served URL identical to
        // the path the file was pre-rendered at, which is what lets it hydrate
        // cleanly. Hosts differ here — GitHub Pages redirects, Netlify serves in
        // place — and React Router normalizes either form.
        const indexCandidate = path.join(relative, "index.html");
        const notFoundFile = path.join(REACT_OUT_DIR, "404.html");
        const hit = isFile(indexCandidate) ? path.join(REACT_OUT_DIR, indexCandidate) : null;

        if (!hit && !fs.existsSync(notFoundFile)) return next();

        res.statusCode = hit ? 200 : 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(fs.readFileSync(hit || notFoundFile));
      });
    },
  };
}

export default defineConfig(({ isPreview }) => ({
  root: REACT_ROOT,
  base: REACT_BASE,
  plugins: [react(), staticHostingEmulation()],

  /*
   * The distinction this whole routing proof rests on.
   *
   * dev ("spa"): Vite answers any unmatched path with index.html so client-side
   *   routes are directly navigable. That is a development convenience and is NOT
   *   evidence that production static hosting supports SPA routing.
   *
   * preview ("mpa"): no fallback. A path resolves to a real file, to a directory
   *   index, or to 404.html — the same three outcomes a static host offers. This
   *   is what makes the preview a meaningful test of the deployment target, and
   *   it also prevents the home page's pre-rendered markup from being served at
   *   an unknown URL, which would be a genuine hydration mismatch.
   */
  appType: isPreview ? "mpa" : "spa",

  resolve: {
    alias: {
      "@data": DATA_ROOT,
      /*
       * Only the already-optimized assets approved in #22 are imported this way,
       * and only the ones actually referenced get emitted — Vite copies imported
       * files, never the whole directory, so the preview cannot drag the
       * production asset folder into dist-react/.
       */
      "@assets": ASSETS_ROOT,
    },
  },

  build: {
    outDir: REACT_OUT_DIR,
    emptyOutDir: true,
    // Keeps the bundle-size report in the build log honest and comparable.
    reportCompressedSize: true,
  },
  server: {
    port: 5183,
    strictPort: true,
    fs: {
      // The Vite root is src/react/, so the dev server needs explicit permission
      // to read the canonical JSON and the approved assets above it.
      allow: [REACT_ROOT, DATA_ROOT, ASSETS_ROOT],
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
}));
