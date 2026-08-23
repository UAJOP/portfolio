import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import SiteShell from "../components/shell/SiteShell.jsx";
import PreviewNotice from "../components/preview/PreviewNotice.jsx";
import NotFound from "../pages/NotFound.jsx";
import { previewRoutes, notFoundRoute } from "../routing/routes.jsx";
import { PreferencesProvider, usePreferences } from "../state/PreferencesContext.jsx";
import "../styles/index.css";

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

/**
 * The preview supplies its own navigation to the shared shell. #25 will supply
 * production routes to the same component — this is the seam that makes the
 * shell reusable rather than preview-specific.
 */
function PreviewShell() {
  const { t } = usePreferences();

  const navItems = previewRoutes.map((route) => ({
    to: route.path,
    label: t(route.navKey),
    end: route.path === "/",
  }));

  return (
    <SiteShell
      navItems={navItems}
      navLabel={t("nav.label")}
      brandTo="/"
      banner={<PreviewNotice />}
      footerNote={t("footer.note")}
    >
      <Routes>
        {previewRoutes.map((route) => (
          <Route key={route.id} path={route.path} element={<route.Component />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SiteShell>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <DocumentTitle />
      <PreviewShell />
    </PreferencesProvider>
  );
}
