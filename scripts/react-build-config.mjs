import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REACT_ROOT = path.join(REPO_ROOT, "src", "react");
export const REACT_OUT_DIR = path.join(REPO_ROOT, "dist-react");
export const REACT_BASE = "/react-preview/";
export const REACT_PRODUCTION_OUT_DIR = path.join(REPO_ROOT, "dist-react-production");
export const REACT_PRODUCTION_BASE = "/";
export const REACT_PRODUCTION_ASSETS = "assets-react";
export const DATA_ROOT = path.join(REPO_ROOT, "data");
export const ASSETS_ROOT = path.join(REPO_ROOT, "assets");
