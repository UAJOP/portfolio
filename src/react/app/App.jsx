import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import NotFound from "../pages/NotFound.jsx";
import { previewRoutes, notFoundRoute } from "../routing/routes.jsx";
import { PreferencesProvider } from "../state/PreferencesContext.jsx";
import "../styles/react-foundation.css";

/**
 * Layout + routes. The Router itself is supplied by the entry: BrowserRouter in
 * main.jsx, StaticRouter in entry-server.jsx. Keeping it out of App is what lets
 * one component tree serve both the build-time render and the browser.
 */

/**
 * Pre-rendering bakes the correct <title> into each emitted file, so the first
 * paint already has it. This keeps it correct across client-side navigation too,
 * where no document is fetched.
 */
function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const match = previewRoutes.find((route) => route.path === pathname);
    document.title = (match || notFoundRoute).metadata.title;
  }, [pathname]);

  return null;
}

function Layout() {
  return (
    <div className="rf-shell">
      <a className="rf-skip-link" href="#rf-main">
        Skip to preview content
      </a>
      <SiteHeader />
      <main className="rf-main" id="rf-main">
        <Routes>
          {previewRoutes.map((route) => (
            <Route key={route.id} path={route.path} element={<route.Component />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <DocumentTitle />
      <Layout />
    </PreferencesProvider>
  );
}
