import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import ProductionMain from "./production/ProductionMain.jsx";

export function renderProductionMain(props) {
  // React 19 opportunistically hoists eager-image preload hints into the
  // returned fragment. The accepted production shell owns resource hints;
  // keep the hydrated main contract limited to the component's DOM.
  return renderToString(<StrictMode><ProductionMain {...props} /></StrictMode>)
    .replace(/<link rel="preload" as="image"[^>]*\/>/g, "")
    .replaceAll("fetchPriority=", "fetchpriority=")
    .replaceAll("dateTime=", "datetime=");
}
