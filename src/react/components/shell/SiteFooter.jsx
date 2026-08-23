import Container from "../ui/Container.jsx";
import { profile, socials } from "../../data/portfolio.js";
import { usePreferences } from "../../state/PreferencesContext.jsx";

/**
 * Production-intended site footer.
 *
 * Everything factual comes from canonical JSON: the name, the bilingual
 * positioning line and the five canonical destinations with their URLs. Nothing
 * here is a literal, and there are no availability or metric claims — the footer
 * has no authority to make any.
 *
 * The destinations render as visible text labels rather than icon-only links.
 * That is a stronger accessible name than an aria-label on a decorative glyph,
 * and it keeps the shell free of an icon dependency until #32.
 */
export default function SiteFooter({ closingNote }) {
  const { language, t } = usePreferences();
  const tagline = profile.footerTagline[language] || profile.footerTagline.en;

  return (
    <footer className="v3-footer">
      <Container>
        <div className="v3-footer-inner">
          <div className="v3-stack v3-stack--sm">
            <p className="v3-brand-name">{profile.name}</p>
            <p className="v3-footer-tagline">{tagline}</p>
            {closingNote ? <p className="v3-small">{closingNote}</p> : null}
          </div>

          <nav aria-label={t("footer.socialsLabel")}>
            <ul className="v3-footer-socials">
              {socials.map((social) => (
                <li key={social.id}>
                  <a
                    className="v3-social-link v3-transition-colors"
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="v3-footer-base">
          {/*
            A fixed year, not new Date(): the build and the browser can disagree
            across a year boundary, which would be a real hydration mismatch.
          */}
          <p>© 2026 {profile.name}. All rights reserved.</p>
          <p>{profile.location[language] || profile.location.en}</p>
        </div>
      </Container>
    </footer>
  );
}
