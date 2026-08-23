import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.jsx";
import { PREVIEW_BASENAME } from "./routing/routes.jsx";

/**
 * Client entry.
 *
 * The production build pre-renders every route, so the container already holds
 * real markup and must be HYDRATED, not re-rendered — calling createRoot on
 * pre-rendered HTML throws the content away and defeats the whole point.
 *
 * `vite dev` serves the unmodified template, where the container is empty, so
 * dev must use createRoot. The data attribute is written by the pre-render step
 * and is the only reliable signal that distinguishes the two.
 */
const container = document.getElementById("root");
const tree = (
  <StrictMode>
    <BrowserRouter basename={PREVIEW_BASENAME}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

if (container.dataset.prerendered === "true") {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
