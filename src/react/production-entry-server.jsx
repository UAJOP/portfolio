import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import ProductionMain from "./production/ProductionMain.jsx";

export function renderProductionMain(props) {
  return renderToString(<StrictMode><ProductionMain {...props} /></StrictMode>);
}
