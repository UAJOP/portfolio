/**
 * Build-time pre-rendering for the React migration foundation.
 *
 * Why this exists at all: a portfolio must be crawlable, must carry per-page
 * metadata and must show content without waiting on JavaScript. A pure client
 * SPA gives up all three. Rather than adopt a full SSR framework for a static
 * site, this does the smallest thing that actually works — render each known
 * route once at build time and write real HTML files.
 *
 * Pipeline:
 *   1. vite build            -> dist-react/ client bundle + HTML template
 *   2. vite build --ssr      -> a throwaway server bundle of entry-server.jsx
 *   3. renderToString each route and inject it into the template
 *   4. write one HTML file per route, shaped for static directory-index hosting
 *   5. delete the throwaway server bundle
 *
 * Run via `npm run build:react`, which is what CI executes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import {
  REACT_OUT_DIR,
  REACT_BASE,
  REACT_PRODUCTION_OUT_DIR,
} from "./react-build-config.mjs";
import { productionReactRoutes } from "./react-route-adapter.mjs";
import { attestReactBuild } from "./react-build-provenance.mjs";
import { loadRegistry } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { productionDocumentProps } from "./home-about-react.mjs";
import { loadArtifactConfig } from "./public-artifact-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const ssrOutDir = path.join(repoRoot, ".react-ssr-tmp");

/** Every real route renders a header, a main region and a footer, so this floor
 *  is far below a healthy render but far above an empty one. */
const MINIMUM_MARKUP_BYTES = 1000;

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Build and execute the complete SSR import graph with browser globals absent.
 * This is deliberately an execution boundary rather than a source-text scan:
 * a browser-only read in any transitive import fails while the bundle loads or
 * renders. The caller owns cleanup so QA can inspect failures when needed. */
export async function executePreviewSsrBundle({ outputDirectory = ssrOutDir } = {}) {
  const ssrResult = await build({
    configFile: path.join(repoRoot, "vite.config.mjs"),
    ssr: { noExternal: true },
    build: {
      ssr: path.join(repoRoot, "src", "react", "entry-server.jsx"),
      outDir: outputDirectory,
      emptyOutDir: true,
      cssCodeSplit: false,
      reportCompressedSize: false,
    },
  });
  const ssrChunks = (Array.isArray(ssrResult) ? ssrResult : [ssrResult]).flatMap(
    (bundle) => bundle.output || [],
  );
  const entryChunk = ssrChunks.find((chunk) => chunk.isEntry);
  if (!entryChunk) throw new Error("[prerender] server build produced no entry chunk");
  const serverEntry = path.join(outputDirectory, entryChunk.fileName);
  const module = await import(`${pathToFileURL(serverEntry).href}?qa=${Date.now()}`);
  for (const target of module.prerenderTargets) module.renderRoute(target.prerenderPath);
  return module;
}

export async function buildProductionReact({ outputDirectory = REACT_PRODUCTION_OUT_DIR, routes = productionReactRoutes() } = {}) {
  const output = path.resolve(outputDirectory);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  const registry = loadRegistry();
  for (const definition of registry.activeLocales) {
    const localization = loadProductionLocalization(definition.id);
    localization.message("nav.open");
    localization.message("theme.switchToLight");
  }

  if (!routes.length) {
    console.log("[prerender:production] 0 React-owned routes · emitted 0 files · legacy production ownership unchanged");
    return attestReactBuild({ output, routes });
  }

  const clientResult = await build({
    configFile: path.join(repoRoot, "vite.config.mjs"),
    mode: "production-migration",
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: { input: path.join(repoRoot, "src/react/production-main.jsx") },
    },
  });
  const clientChunks = (Array.isArray(clientResult) ? clientResult : [clientResult]).flatMap((bundle) => bundle.output || []);
  const clientEntry = clientChunks.find((chunk) => chunk.type === "chunk" && chunk.isEntry)?.fileName;
  const bundleDirectory = `${loadArtifactConfig().reactBundleDirectory}/`;
  if (!clientEntry?.startsWith(bundleDirectory)) throw new Error("production client entry escaped the approved React namespace");

  const serverOutput = path.join(path.dirname(output), `ssr-${path.basename(output)}`);
  try {
    const serverResult = await build({
      configFile: path.join(repoRoot, "vite.config.mjs"),
      mode: "production-migration",
      ssr: { noExternal: true },
      build: {
        ssr: path.join(repoRoot, "src/react/production-entry-server.jsx"),
        outDir: serverOutput,
        emptyOutDir: true,
        reportCompressedSize: false,
      },
    });
    const serverChunks = (Array.isArray(serverResult) ? serverResult : [serverResult]).flatMap((bundle) => bundle.output || []);
    const serverEntry = serverChunks.find((chunk) => chunk.type === "chunk" && chunk.isEntry)?.fileName;
    if (!serverEntry) throw new Error("production SSR build emitted no entry");
    const server = await import(`${pathToFileURL(path.join(serverOutput, serverEntry)).href}?build=${Date.now()}`);
    for (const route of routes) {
      const props = productionDocumentProps(route, clientEntry);
      const html = server.renderProductionDocument(props);
      const destination = path.join(output, route.output);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, html, "utf8");
    }
  } finally {
    fs.rmSync(serverOutput, { recursive: true, force: true });
  }
  console.log(`[prerender:production] ${routes.length} React-owned production documents · client ${clientEntry}`);
  return attestReactBuild({ output, routes });
}

async function buildPreviewReact() {
  console.log("[prerender] building client bundle");
  await build({ configFile: path.join(repoRoot, "vite.config.mjs") });

  console.log("[prerender] building server bundle");
  const { renderRoute, prerenderTargets } = await executePreviewSsrBundle();

  const template = fs.readFileSync(path.join(REACT_OUT_DIR, "index.html"), "utf8");

  for (const target of prerenderTargets) {
    const markup = renderRoute(target.prerenderPath);

    let html = template
      // The flag main.jsx reads to choose hydrateRoot over createRoot.
      .replace('<div id="root"></div>', `<div id="root" data-prerendered="true">${markup}</div>`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(target.metadata.title)}</title>`)
      .replace(
        /<meta\s+name="description"[\s\S]*?\/>/,
        `<meta name="description" content="${escapeHtml(target.metadata.description)}" />`,
      );

    // A silent empty render is the failure mode that matters here. The files
    // would still be written, still contain #root and still look like a
    // successful build, while proving nothing. Fail the build instead.
    if (!html.includes('data-prerendered="true"')) {
      throw new Error(`[prerender] could not inject markup for ${target.id}; template shape changed`);
    }
    if (markup.length < MINIMUM_MARKUP_BYTES) {
      throw new Error(
        `[prerender] ${target.id} rendered only ${markup.length} B of markup; expected at least ${MINIMUM_MARKUP_BYTES} B`,
      );
    }

    const destination = path.join(REACT_OUT_DIR, target.output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, html, "utf8");

    const bytes = Buffer.byteLength(html);
    console.log(
      `[prerender] ${String(target.output).padEnd(18)} ${String(markup.length).padStart(6)} B of markup · ${bytes} B total`,
    );
  }

  fs.rmSync(ssrOutDir, { recursive: true, force: true });

  console.log(`[prerender] done · base ${REACT_BASE} · output ${path.relative(repoRoot, REACT_OUT_DIR)}/`);
}

const productionMode = process.argv.includes("--production");
const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) (productionMode ? buildProductionReact() : buildPreviewReact()).catch((error) => {
  console.error("[prerender] failed");
  console.error(error);
  process.exit(1);
});
