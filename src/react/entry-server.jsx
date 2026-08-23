import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./app/App.jsx";
import { PREVIEW_BASENAME, prerenderTargets } from "./routing/routes.jsx";

/**
 * Build-time render entry, consumed by scripts/prerender-react.mjs.
 *
 * StaticRouter matches against the FULL location, so the basename has to be part
 * of the location it is given as well as declared separately. With both set,
 * <Link to="/about"> emits /react-preview/about in the generated HTML — the same
 * URL the browser router produces after hydration.
 */
export function renderRoute(pathname) {
  // Join without doubling the slash: PREVIEW_BASENAME has no trailing slash.
  const location = `${PREVIEW_BASENAME}${pathname === "/" ? "/" : pathname}`;

  return renderToString(
    <StrictMode>
      <StaticRouter basename={PREVIEW_BASENAME} location={location}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}

/**
 * Re-exported so the pre-render script gets the route table from the compiled
 * bundle. routes.jsx is JSX and cannot be imported by Node directly, and going
 * through the bundle guarantees the emitted files and the rendered routes come
 * from the exact same module instance.
 */
export { prerenderTargets };
