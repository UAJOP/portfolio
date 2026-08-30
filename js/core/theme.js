/**
 * Dark/light theme state, persistence and toggle.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 148-228.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const siteThemeState = {
  current: "dark",
};

function getStoredSiteTheme() {
  try {
    return localStorage.getItem("kaanbalci-site-theme") === "light"
      ? "light"
      : "dark";
  } catch (error) {
    return "dark";
  }
}

function applySiteTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  siteThemeState.current = nextTheme;
  document.documentElement.setAttribute("data-theme", nextTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const icon = button.querySelector("i");
    const label = button.querySelector("[data-theme-label]");
    const isLight = nextTheme === "light";

    if (icon) {
      icon.className = isLight ? "bx bx-sun" : "bx bx-moon";
    }

    if (label) {
      label.textContent = getUiText(isLight ? "theme.light" : "theme.dark");
    }

    const toggleLabel = getUiText(isLight ? "theme.switchToDark" : "theme.switchToLight");
    button.setAttribute("aria-label", toggleLabel);
    button.setAttribute("title", toggleLabel);
    button.setAttribute("aria-pressed", String(isLight));
  });

  try {
    localStorage.setItem("kaanbalci-site-theme", nextTheme);
  } catch (error) {
    // Ignore storage errors.
  }
}

function setupSiteThemeToggle() {
  applySiteTheme(getStoredSiteTheme());

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      applySiteTheme(siteThemeState.current === "light" ? "dark" : "light");
    });
  });
}

setupSiteThemeToggle();


subscribeSiteLocale(() => applySiteTheme(siteThemeState.current));
