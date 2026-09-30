import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLegacyPagesArtifact, mergeProductionReactArtifact } from "./build-pages-artifact.mjs";
import { buildProductionReact } from "./prerender-react.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";

export const HOME_ABOUT_IDS = new Set(["home", "about"]);
export const homeAboutRouteRecords = () => canonicalReactRoutes().map((route) => ({
  ...route,
  renderer: HOME_ABOUT_IDS.has(route.routeId) ? "react" : route.renderer,
}));

export async function buildHomeAboutFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-25b-"));
  const legacy = path.join(root, "legacy");
  const mixed = path.join(root, "mixed");
  const react = path.join(root, "react");
  const routes = homeAboutRouteRecords();
  buildLegacyPagesArtifact(legacy);
  buildLegacyPagesArtifact(mixed);
  const proof = await buildProductionReact({ outputDirectory: react, routes: routes.filter((route) => route.renderer === "react") });
  mergeProductionReactArtifact(mixed, proof, { routeRecords: routes });
  return { root, legacy, mixed, routes, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
