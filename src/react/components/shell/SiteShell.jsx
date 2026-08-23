import SiteHeader from "./SiteHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";

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
  skipLabel = "Skip to main content",
  children,
}) {
  return (
    <div className="v3-shell">
      <a className="v3-skip-link" href="#main">
        {skipLabel}
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
