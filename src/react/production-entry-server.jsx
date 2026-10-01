import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import ProductionMain from "./production/ProductionMain.jsx";
import ProductionDocument from "./production/ProductionDocument.jsx";

const normalizeProductionMarkup = (markup) => markup
  .replace(/<link rel="preload" as="image"[^>]*\/>/g, "")
  .replaceAll("charSet=", "charset=")
  .replaceAll("hrefLang=", "hreflang=")
  .replaceAll("fetchPriority=", "fetchpriority=")
  .replaceAll("dateTime=", "datetime=");

export function renderProductionMain(props) {
  // React 19 opportunistically hoists eager-image preload hints into the
  // returned fragment. The accepted production shell owns resource hints;
  // keep the hydrated main contract limited to the component's DOM.
  return normalizeProductionMarkup(renderToString(<StrictMode><ProductionMain {...props} /></StrictMode>));
}

export function renderProductionDocument(props) {
  return `<!DOCTYPE html>${normalizeProductionMarkup(renderToString(<StrictMode><ProductionDocument {...props} /></StrictMode>))}`;
}
