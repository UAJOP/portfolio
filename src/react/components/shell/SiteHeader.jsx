import { NavLink } from "react-router-dom";
import Container from "../ui/Container.jsx";
import { profile } from "../../data/portfolio.js";
import { usePreferences } from "../../state/PreferencesContext.jsx";
import { SUPPORTED_LANGUAGES } from "../../i18n/translate.js";
import logoUrl from "@assets/kaan-balci-logo-128.webp";

/**
 * Production-intended site header.
 *
 * It knows nothing about the preview. Navigation arrives entirely through
 * `navItems`, and the brand destination through `brandTo`, so #25 supplies real
 * production routes to this same component without editing it. The only reason
 * it can be reused that way is that it holds no route literals.
 *
 * Identity copy comes from canonical JSON, never from props: the name and the
 * primary title are product truth and must not be overridable per page.
 */

const LANGUAGE_LABELS = { en: "EN", tr: "TR" };

/** Inline SVG rather than an icon dependency; Boxicons replacement is #32. */
function ThemeIcon({ mode }) {
  if (mode === "dark") {
    return (
      <svg className="v3-segmented-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg className="v3-segmented-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SiteHeader({ navItems = [], navLabel, brandTo = "/" }) {
  const { theme, setTheme, language, setLanguage, t } = usePreferences();

  return (
    <header className="v3-header">
      <Container className="v3-header-inner">
        <NavLink className="v3-brand" to={brandTo}>
          {/*
            The logo is decorative here: the brand name sits next to it as real
            text, so an alt text would be announced twice.
          */}
          <img className="v3-brand-mark" src={logoUrl} alt="" width="128" height="128" />
          <span className="v3-brand-text">
            <span className="v3-brand-name">{profile.name}</span>
            <span className="v3-brand-title">{profile.primaryTitle.en}</span>
          </span>
        </NavLink>

        {navItems.length > 0 ? (
          <nav className="v3-header-nav" aria-label={navLabel || t("nav.label")}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  ["v3-nav-link", "v3-transition-colors", isActive ? "is-active" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
                // NavLink sets aria-current="page" itself when active; this is
                // what the active underline in CSS keys off, so the visual state
                // and the announced state cannot diverge.
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}

        <div className="v3-header-controls">
          {/*
            Both options always render with fixed labels, so the active state is
            carried by aria-pressed alone. Nothing swaps text between the server
            render and hydration.
          */}
          <div className="v3-segmented" role="group" aria-label={t("controls.language")}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                className="v3-segmented-option v3-transition-colors"
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {LANGUAGE_LABELS[code]}
              </button>
            ))}
          </div>

          <div className="v3-segmented" role="group" aria-label={t("controls.theme")}>
            {["dark", "light"].map((mode) => (
              <button
                key={mode}
                type="button"
                className="v3-segmented-option v3-transition-colors"
                aria-pressed={theme === mode}
                onClick={() => setTheme(mode)}
              >
                <ThemeIcon mode={mode} />
                {mode === "dark" ? t("controls.themeDark") : t("controls.themeLight")}
              </button>
            ))}
          </div>
        </div>
      </Container>
    </header>
  );
}
