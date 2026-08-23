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
import { REACT_OUT_DIR, REACT_BASE } from "../vite.config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const ssrOutDir = path.join(repoRoot, ".react-ssr-tmp");

/** Every real route renders a header, a main region and a footer, so this floor
 *  is far below a healthy render but far above an empty one. */
const MINIMUM_MARKUP_BYTES = 1000;

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function main() {
  console.log("[prerender] building client bundle");
  await build({ configFile: path.join(repoRoot, "vite.config.mjs") });

  console.log("[prerender] building server bundle");
  const ssrResult = await build({
    configFile: path.join(repoRoot, "vite.config.mjs"),
    build: {
      ssr: path.join(repoRoot, "src", "react", "entry-server.jsx"),
      outDir: ssrOutDir,
      emptyOutDir: true,
      // The server bundle is a build tool, not a deliverable, so its size and
      // its CSS output are irrelevant. CSS already ships from the client build.
      cssCodeSplit: false,
      reportCompressedSize: false,
    },
  });

  // The emitted extension depends on the package type (.mjs in this CommonJS
  // repository), so take the filename from the build result rather than guessing.
  const ssrChunks = (Array.isArray(ssrResult) ? ssrResult : [ssrResult]).flatMap(
    (bundle) => bundle.output || [],
  );
  const entryChunk = ssrChunks.find((chunk) => chunk.isEntry);
  if (!entryChunk) throw new Error('[prerender] server build produced no entry chunk');

  // routes.jsx is JSX, so Node cannot import it directly. The server bundle
  // re-exports the route table, which also guarantees the rendered routes and the
  // emitted files come from the same module instance.
  const serverEntry = path.join(ssrOutDir, entryChunk.fileName);
  const { renderRoute, prerenderTargets } = await import(pathToFileURL(serverEntry).href);

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

main().catch((error) => {
  console.error("[prerender] failed");
  console.error(error);
  process.exit(1);
});
