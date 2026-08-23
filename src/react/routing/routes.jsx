import MigrationHome from "../pages/MigrationHome.jsx";
import MigrationAbout from "../pages/MigrationAbout.jsx";
import NotFound from "../pages/NotFound.jsx";

/**
 * One route table, consumed by three callers:
 *
 *  - main.jsx            client hydration / client-side navigation
 *  - entry-server.jsx    build-time rendering
 *  - prerender-react.mjs decides which files to emit
 *
 * Keeping it single-sourced is what makes the pre-rendered output and the client
 * router provably describe the same set of routes.
 *
 * `basename` is the public path the preview is mounted under. It is intentionally
 * NOT "/" so the preview can never be confused with the production homepage.
 */
export const PREVIEW_BASENAME = "/react-preview";

/**
 * `output` is the path written under dist-react/, chosen so a plain static host
 * resolves the route with its normal directory-index rule and no rewrite config.
 * `metadata` is baked into the pre-rendered <head> and reapplied on client
 * navigation, which is what keeps the document title correct for both entries.
 */
export const previewRoutes = [
  {
    id: "home",
    path: "/",
    output: "index.html",
    // Navigation label key, so the shell's nav is derived from this table
    // rather than maintained beside it.
    navKey: "nav.home",
    Component: MigrationHome,
    metadata: {
      title: "V3 design system | Kaan Balcı engineering preview",
      description:
        "Engineering preview of the Portfolio Modernization V3 design system: tokens, typography, surfaces and the shared React shell, rendered from canonical portfolio data.",
    },
  },
  {
    id: "about",
    path: "/about",
    output: "about/index.html",
    navKey: "nav.about",
    Component: MigrationAbout,
    metadata: {
      title: "System principles | Kaan Balcı engineering preview",
      description:
        "The rules the V3 design system holds itself to, and the canonical JSON data architecture underneath the React shell.",
    },
  },
];

/**
 * The catch-all. A static host cannot know a route is unknown until it fails to
 * find a file, so this is pre-rendered to dist-react/404.html — the file a static
 * host serves for an unmatched path. Because the pre-rendered content is the same
 * NotFound view the client router renders for any unmatched path, the 404 page
 * hydrates without a mismatch.
 */
export const notFoundRoute = {
  id: "not-found",
  output: "404.html",
  Component: NotFound,
  // Rendered through StaticRouter at a path guaranteed not to match a real route.
  prerenderPath: "/__not-found__",
  metadata: {
    title: "Preview route not found | Kaan Balcı engineering preview",
    description: "The requested React preview route does not exist.",
  },
};

/** Every file the React build is expected to emit, in a hash-independent form. */
export const prerenderTargets = [
  ...previewRoutes.map((route) => ({ ...route, prerenderPath: route.path })),
  notFoundRoute,
];
