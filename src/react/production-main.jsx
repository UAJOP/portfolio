import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import ProductionMain from "./production/ProductionMain.jsx";

const container = document.querySelector("main[data-react-main]");
const payload = document.getElementById("react-main-props");
if (!container || !payload) throw new Error("production React main hydration contract is missing");
const props = JSON.parse(payload.textContent);
hydrateRoot(container, <StrictMode><ProductionMain {...props} /></StrictMode>);
