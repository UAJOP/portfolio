import { profile, socials } from "../data/foundation.js";
import { usePreferences } from "../state/PreferencesContext.jsx";

/**
 * Proof-of-parity footer. It renders the same canonical contract the production
 * footer must satisfy: the brand, the positioning sentence, exactly the five
 * canonical public destinations, and the copyright line.
 *
 * Two deliberate differences from the production footer, both documented in
 * REACT_MIGRATION_PLAN.md:
 *
 *  1. The destinations use visible text labels instead of Boxicons glyphs. The
 *     preview must not add a third-party icon CDN, and replacing Boxicons is its
 *     own migration step. Visible text is also a stronger accessible name than an
 *     aria-label on a decorative icon.
 *  2. The brand is plain text, not a link to index.html. The preview is isolated
 *     from production routes and must not link into the public site.
 */
export default function SiteFooter() {
  const { language, t } = usePreferences();
  const tagline = language === "tr" ? profile.footerTaglineTr : profile.footerTagline;

  return (
    <footer className="rf-footer">
      <div className="rf-footer-inner">
        <div>
          <p className="rf-footer-brand">{profile.name}</p>
          <p className="rf-footer-tagline">{tagline}</p>
        </div>

        <ul className="rf-socials" aria-label="Social links">
          {socials.map((social) => (
            <li key={social.id}>
              <a
                className="rf-social-link"
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {social.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p className="rf-footer-note">{t("footer.legacyNote")}</p>
      {/*
        Fixed year rather than new Date(): a build-time value and a client-time
        value can disagree across a year boundary, which would be a real
        hydration mismatch. The production footer fills this in with script.
      */}
      <p className="rf-copyright">© 2026 {profile.name}. All rights reserved.</p>
    </footer>
  );
}
