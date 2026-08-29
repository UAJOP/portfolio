/**
 * Command palette.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 3894-4047.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function executeCommand(command) {
  if (!command) return;
  setCommandPaletteOpen(false);
  if (command.type === "nav") {
    if (typeof trackAnalyticsNavigation === "function") {
      trackAnalyticsNavigation(command.value, "header");
    }
    if (command.external)
      window.open(command.value, "_blank", "noopener,noreferrer");
    else window.location.href = command.value;
  } else if (command.type === "resume") {
    if (typeof trackAnalyticsEvent === "function") {
      trackAnalyticsEvent(ANALYTICS_EVENTS.CV_OPEN, { source: "header" });
    }
    openDrivePreviews();
  } else if (command.type === "theme") {
    applySiteTheme(siteThemeState.current === "light" ? "dark" : "light");
  } else if (command.type === "language") {
    applyLanguage((currentSiteLanguage || "en") === "tr" ? "en" : "tr");
  } else if (command.type === "chatbot") {
    setChatbotOpen(true);
  } else if (command.type === "recruiter") {
    setRecruiterMode(
      !document.body.classList.contains("recruiter-mode-active"),
    );
  } else if (command.type === "scroll") {
    document
      .getElementById(command.value)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (command.type === "easter") {
    launchEasterEgg();
  }
}

function renderCommandPalette(language = currentSiteLanguage || "en") {
  const palette = document.querySelector("[data-command-palette]");
  if (!palette) return;
  const content = getUltimateContent(language);
  const query =
    palette.querySelector("[data-command-input]")?.value?.toLowerCase() || "";
  const results = content.commands
    .filter((cmd) =>
      `${cmd.label} ${cmd.hint} ${cmd.keywords}`.toLowerCase().includes(query),
    )
    .slice(0, 18);
  const list = palette.querySelector("[data-command-results]");
  const title = palette.querySelector("[data-command-title]");
  const input = palette.querySelector("[data-command-input]");
  if (title) title.textContent = content.commandsTitle;
  if (input) {
    input.placeholder = content.commandPlaceholder;
    input.setAttribute("aria-label", content.commandDialogLabel);
  }
  if (!list) return;
  list.innerHTML = results.length
    ? results
        .map(
          (cmd) =>
            `<button type="button" data-command-id="${escapeProjectHtml(cmd.id)}"><strong>${escapeProjectHtml(cmd.label)}</strong><span>${escapeProjectHtml(cmd.hint)}</span></button>`,
        )
        .join("")
    : `<p class="command-empty">${escapeProjectHtml(content.noResults)}</p>`;
  list.querySelectorAll("[data-command-id]").forEach((button) => {
    button.addEventListener("click", () =>
      executeCommand(
        content.commands.find((cmd) => cmd.id === button.dataset.commandId),
      ),
    );
  });
}

function setCommandPaletteOpen(
  isOpen,
  { restoreFocus = true, trigger = null } = {},
) {
  const palette = document.querySelector("[data-command-palette]");
  if (!palette) return;
  const wasOpen = palette.classList.contains("is-open");

  if (isOpen) {
    closeMobileNavigation();
    setChatbotOpen(false, { restoreFocus: false });
    setRecruiterMode(false, { restoreFocus: false });
    rememberOverlayTrigger(
      palette,
      trigger || document.querySelector("[data-command-toggle]"),
    );
  }

  palette.classList.toggle("is-open", Boolean(isOpen));
  palette.hidden = !isOpen;
  palette.setAttribute("aria-hidden", String(!isOpen));
  document.querySelectorAll("[data-command-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", String(isOpen));
  });
  if (isOpen) {
    setBackgroundInert(palette);
    setOverlayBodyState(true);
    const input = palette.querySelector("[data-command-input]");
    input.value = "";
    renderCommandPalette();
    setTimeout(() => input.focus(), 40);
  } else if (wasOpen) {
    setBackgroundInert();
    setOverlayBodyState(false);
    if (restoreFocus) restoreOverlayFocus(palette);
    else overlayTriggerMap.delete(palette);
  }
  updateUltimateStaticLabels(currentSiteLanguage || "en");
}

function setupCommandPalette() {
  if (document.querySelector("[data-command-palette]")) return;
  const content = getUltimateContent();
  const palette = document.createElement("div");
  palette.className = "command-palette";
  palette.id = "command-palette";
  palette.setAttribute("data-command-palette", "");
  palette.setAttribute("aria-hidden", "true");
  palette.hidden = true;
  palette.innerHTML = `<div class="command-box" role="dialog" aria-modal="true" aria-labelledby="command-palette-title"><div class="command-head"><i class="bx bx-search" aria-hidden="true"></i><input type="search" data-command-input aria-label="${escapeProjectHtml(content.commandDialogLabel)}" placeholder="${escapeProjectHtml(content.commandPlaceholder)}" /><kbd>Esc</kbd></div><div class="command-title" id="command-palette-title" data-command-title>${escapeProjectHtml(content.commandsTitle)}</div><div class="command-results" data-command-results></div></div>`;
  document.body.appendChild(palette);
  palette
    .querySelector("[data-command-input]")
    ?.addEventListener("input", () => renderCommandPalette());
  palette.addEventListener("click", (event) => {
    if (event.target === palette) setCommandPaletteOpen(false);
  });
  document.querySelectorAll("[data-command-toggle]").forEach((button) => {
    button.setAttribute("aria-controls", palette.id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) =>
      setCommandPaletteOpen(true, { trigger: event.currentTarget }),
    );
  });
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setCommandPaletteOpen(true, { trigger: document.activeElement });
    }
    if (
      event.key === "Escape" &&
      document
        .querySelector("[data-command-palette]")
        ?.classList.contains("is-open")
    ) {
      event.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    const activePalette = document.querySelector(
      "[data-command-palette].is-open [role='dialog']",
    );
    if (activePalette) trapFocus(event, activePalette);
  });
  renderCommandPalette();
}

