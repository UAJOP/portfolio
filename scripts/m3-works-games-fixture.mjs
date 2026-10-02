import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLegacyPagesArtifact, mergeProductionReactArtifact } from "./build-pages-artifact.mjs";
import { buildProductionReact } from "./prerender-react.mjs";
import { canonicalReactRoutes } from "./react-route-adapter.mjs";

export const WORKS_GAMES_IDS = new Set(["works", "games"]);
export const worksGamesRouteRecords = () => canonicalReactRoutes().map((route) => ({
  ...route,
  renderer: WORKS_GAMES_IDS.has(route.routeId) ? "react" : "legacy",
}));

export async function buildWorksGamesFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-m3-26-"));
  const legacy = path.join(root, "legacy");
  const mixed = path.join(root, "mixed");
  const react = path.join(root, "react");
  const routes = worksGamesRouteRecords();
  buildLegacyPagesArtifact(legacy);
  buildLegacyPagesArtifact(mixed);
  const proof = await buildProductionReact({ outputDirectory: react, routes: routes.filter((route) => route.renderer === "react") });
  mergeProductionReactArtifact(mixed, proof, { routeRecords: routes });
  return { root, legacy, mixed, routes, proof, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
