import { NavLink } from "react-router-dom";
import { profile } from "../data/foundation.js";
import { usePreferences } from "../state/PreferencesContext.jsx";
import { SUPPORTED_LANGUAGES } from "../data/translations.js";

/**
 * Proof-of-parity header. It does NOT replace the production header yet; it
 * exists to show that the canonical profile truth, the theme control and the
 * language control all survive the move to React with real semantics:
 * a <header> landmark, a <nav> landmark, real <button> elements for the
 * controls, and router-aware links rather than simulated ones.
 */

const LANGUAGE_LABELS = { en: "EN", tr: "TR" };
const THEMES = ["dark", "light"];

export default function SiteHeader() {
  const { theme, setTheme, language, setLanguage, t } = usePreferences();

  return (
    <header className="rf-header">
      <div className="rf-header-inner">
        <div className="rf-identity">
          <p className="rf-brand">{profile.name}</p>
          <p className="rf-title">{profile.primaryTitle}</p>
          <p className="rf-background">{profile.backgroundTitle}</p>
        </div>

        <nav className="rf-nav" aria-label={t("nav.label")}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "rf-nav-link is-active" : "rf-nav-link")}>
            {t("nav.home")}
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => (isActive ? "rf-nav-link is-active" : "rf-nav-link")}>
            {t("nav.about")}
          </NavLink>
        </nav>

        <div className="rf-controls">
          {/*
            Both options are always rendered and their text never changes, so the
            active state is carried by aria-pressed alone. That keeps the control
            announceable and avoids any text swapping during hydration.
          */}
          <div className="rf-switch" role="group" aria-label={t("controls.language")}>
            {SUPPORTED_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                className={language === code ? "rf-switch-button is-active" : "rf-switch-button"}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {LANGUAGE_LABELS[code]}
              </button>
            ))}
          </div>

          <div className="rf-switch" role="group" aria-label={t("controls.theme")}>
            {THEMES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={theme === mode ? "rf-switch-button is-active" : "rf-switch-button"}
                aria-pressed={theme === mode}
                onClick={() => setTheme(mode)}
              >
                {mode === "dark" ? t("controls.themeDark") : t("controls.themeLight")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
