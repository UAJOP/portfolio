/* V4 local preview server (development only; nothing here is deployed).
 *
 *   /                      the production build in dist-site/, served as built
 *   /__v4/specimen         the V4 system specimen (prototypes/v4-system/)
 *
 * Run `npm run build:site` first; this serves whatever dist-site/ contains. */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SITE_ROOT = join(ROOT, "dist-site");
const SPECIMEN_ROOT = join(ROOT, "prototypes", "v4-system");
const V4_SOURCE_ROOT = join(ROOT, "src", "react", "v4");
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function inside(root, file) {
  const target = normalize(resolve(file));
  const child = relative(root, target);
  return child && !child.startsWith("..") && !child.startsWith("/") ? target : child === "" ? target : null;
}

function resolveSiteFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const direct = inside(SITE_ROOT, join(SITE_ROOT, decoded));
  if (!direct) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const nestedIndex = inside(SITE_ROOT, join(direct, "index.html"));
  if (nestedIndex && existsSync(nestedIndex)) return nestedIndex;
  const htmlFile = inside(SITE_ROOT, `${direct}.html`);
  if (htmlFile && existsSync(htmlFile)) return htmlFile;
  return null;
}

function sendFile(response, file, cacheControl = "no-cache", status = 200) {
  response.writeHead(status, {
    "Cache-Control": cacheControl,
    "Content-Type": MIME_TYPES[extname(file).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(file).pipe(response);
}

/* Dev-only mounts: URL prefix -> directory outside dist-site. */
const MOUNTS = [
  ["/__v4/specimen/", SPECIMEN_ROOT],
  ["/__v4/src/", V4_SOURCE_ROOT],
];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);
    /* Lets tooling confirm which checkout a listening port belongs to. */
    if (url.pathname === "/__v4/health") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": MIME_TYPES[".json"] }).end(JSON.stringify({ root: ROOT }));
      return;
    }
    if (url.pathname === "/__v4/specimen") return sendFile(response, join(SPECIMEN_ROOT, "specimen.html"), "no-store");
    for (const [prefix, root] of MOUNTS) {
      if (!url.pathname.startsWith(prefix)) continue;
      const file = inside(root, join(root, url.pathname.slice(prefix.length)));
      if (file && existsSync(file) && statSync(file).isFile()) return sendFile(response, file, "no-store");
      response.writeHead(404).end("V4 preview asset not found");
      return;
    }

    const file = resolveSiteFile(url.pathname);
    if (!file) {
      const notFound = join(SITE_ROOT, "404.html");
      if (existsSync(notFound)) return sendFile(response, notFound, "no-cache", 404);
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); return;
    }

    sendFile(response, file);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(error.stack || error.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[v4-preview] http://${HOST}:${PORT}/                  production build (dist-site)`);
  console.log(`[v4-preview] http://${HOST}:${PORT}/__v4/specimen     V4 system specimen`);
});
