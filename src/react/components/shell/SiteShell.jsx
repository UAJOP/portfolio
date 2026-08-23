import SiteHeader from "./SiteHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";
import { usePreferences } from "../../state/PreferencesContext.jsx";

/**
 * The page frame every React page renders inside: skip link, header, main
 * landmark, footer.
 *
 * It owns the document's landmark structure and nothing else. It has no opinion
 * about routes, and no preview-specific content — `banner` is the seam through
 * which the preview injects its notice, and which production simply leaves
 * unset.
 *
 * #25 mounts real pages in this component by passing production `navItems`.
 */
export default function SiteShell({
  navItems,
  navLabel,
  brandTo,
  banner,
  footerNote,
  skipLabel,
  children,
}) {
  const { t } = usePreferences();

  return (
    <div className="v3-shell">
      {/*
        The skip link is the first thing a keyboard user hears, so it is
        translated like any other UI copy. `skipLabel` stays overridable for a
        page that needs a more specific target name, but the default comes from
        the i18n layer rather than an English literal.
      */}
      <a className="v3-skip-link" href="#main">
        {skipLabel || t("shell.skipLink")}
      </a>

      <SiteHeader navItems={navItems} navLabel={navLabel} brandTo={brandTo} />

      {/* tabIndex -1 so the skip link can move focus, not just the viewport. */}
      <main className="v3-main" id="main" tabIndex={-1}>
        {banner}
        {children}
      </main>

      <SiteFooter closingNote={footerNote} />
    </div>
  );
}
