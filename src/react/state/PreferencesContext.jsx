import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, translate } from "../data/translations.js";

/**
 * Theme and language state for the React preview.
 *
 * Storage keys are deliberately the SAME keys the live site already owns, so the
 * preview cannot create a competing preference and a visitor's choice survives
 * moving between the legacy site and the preview:
 *
 *   kaanbalci-site-theme     "dark" | "light"
 *   kaanbalci-site-language  "en"   | "tr"
 *
 * Hydration contract: server rendering has no localStorage, so both values start
 * at the SSR-safe defaults below and are reconciled in an effect AFTER hydration.
 * The first client render therefore matches the pre-rendered HTML exactly, which
 * is why this hydrates with zero mismatch warnings. Page colors do not wait for
 * that effect: the blocking inline script in index.html sets `data-theme` on
 * <html> before first paint, exactly as the production pages do.
 */

const THEME_STORAGE_KEY = "kaanbalci-site-theme";
const LANGUAGE_STORAGE_KEY = "kaanbalci-site-language";

const DEFAULT_THEME = "dark";
const THEMES = ["dark", "light"];

const PreferencesContext = createContext(null);

const readStored = (key, allowed, fallback) => {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.includes(stored) ? stored : fallback;
  } catch {
    // Private mode or blocked storage: defaults are a valid outcome, not an error.
    return fallback;
  }
};

const persist = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference persistence is best-effort; the session still works without it.
  }
};

export function PreferencesProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);

  // Post-hydration reconciliation. Runs once, after the first client render has
  // already matched the pre-rendered markup.
  useEffect(() => {
    setThemeState(readStored(THEME_STORAGE_KEY, THEMES, DEFAULT_THEME));
    setLanguageState(readStored(LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    persist(THEME_STORAGE_KEY, next);
  }, []);

  const setLanguage = useCallback((next) => {
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    setLanguageState(next);
    persist(LANGUAGE_STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, language, setLanguage, t: (key) => translate(language, key) }),
    [theme, setTheme, language, setLanguage],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
