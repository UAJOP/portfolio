import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { analytics, overlays, shell, site } from "./commonRuntime.js";

/* Master 3 #28: the Command Palette on React production documents.
 *
 * React owns the dialog, its open state, filtering, keyboard entry, command
 * execution and focus. Command copy has one authority, the runtime command
 * surface (js/features/ultimate.js plus the commands other COMMON modules add
 * at load), read through getUltimateContent() whenever the palette renders
 * results — exactly when the classic palette read it. SSR carries the dialog
 * chrome for the document locale and no results: the result list is runtime
 * data, so it appears once React has hydrated. */
const OWNER = '[data-react-command-owner="react"]';
const REQUEST_EVENT = "portfolio:react-command-request";
const RESULT_LIMIT = 18;
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const matches = (command, query) => `${command.label} ${command.hint} ${command.keywords}`.toLowerCase().includes(query);

function markToggles(open) {
  document.querySelectorAll("[data-command-toggle]").forEach((button) => {
    button.setAttribute("aria-controls", "command-palette");
    button.setAttribute("aria-expanded", String(open));
  });
}

export default function CommandPalette({ model }) {
  const initialRequest = typeof document === "undefined" ? null : document.querySelector(OWNER)?.__portfolioReactCommandRequest;
  const initiallyOpen = Boolean(initialRequest?.preHydrationApplied && initialRequest.isOpen);
  const [open, setOpen] = useState(initiallyOpen);
  const [content, setContent] = useState(null);
  const [query, setQuery] = useState("");
  const openRef = useRef(initiallyOpen);
  const languageRef = useRef(model.language);
  const paletteRef = useRef(null);
  const inputRef = useRef(null);
  const copy = content || model.copy;

  const readContent = useCallback(() => site.commandContent(languageRef.current) || null, []);

  const closePalette = useCallback(({ restoreFocus = true } = {}) => {
    const wasOpen = openRef.current;
    openRef.current = false;
    if (wasOpen) setOpen(false);
    markToggles(false);
    if (wasOpen) {
      shell.releaseOverlay(paletteRef.current);
      if (restoreFocus) shell.restoreOverlayFocus(paletteRef.current);
    }
    site.updateStaticLabels(languageRef.current);
  }, []);

  const openPalette = useCallback((trigger) => {
    shell.closeMobileNavigation();
    overlays.setChatbotOpen(false, { restoreFocus: false });
    overlays.setRecruiterMode(false, { restoreFocus: false });
    shell.rememberOverlayTrigger(paletteRef.current, trigger || document.querySelector("[data-command-toggle]"));
    openRef.current = true;
    setOpen(true);
    markToggles(true);
    shell.claimOverlay(paletteRef.current);
    if (inputRef.current) inputRef.current.value = "";
    setQuery("");
    setContent(readContent());
    window.setTimeout(() => inputRef.current?.focus(), 40);
    site.updateStaticLabels(languageRef.current);
  }, [readContent]);

  const execute = useCallback((command) => {
    if (!command) return;
    closePalette();
    if (command.type === "nav") {
      analytics.navigation(command.value, "header");
      if (command.external) window.open(command.value, "_blank", "noopener,noreferrer");
      /* Command values are canonical routes; siteUrl keeps them in the
       * current locale and correct from any page depth. */
      else window.location.href = site.url(command.value);
    } else if (command.type === "resume") {
      analytics.track("cv_open", { source: "header" });
      shell.openDrivePreviews();
    } else if (command.type === "theme") {
      site.applyTheme(site.currentTheme() === "light" ? "dark" : "light");
    } else if (command.type === "language") {
      site.setLocale(site.nextLocale(), { persist: true, source: "command-palette" });
    } else if (command.type === "chatbot") {
      overlays.setChatbotOpen(true);
    } else if (command.type === "recruiter") {
      overlays.setRecruiterMode(!document.body.classList.contains("recruiter-mode-active"));
    } else if (command.type === "scroll") {
      document.getElementById(command.value)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (command.type === "easter") {
      site.launchEasterEgg();
    }
  }, [closePalette]);

  /* Takeover: adopt the SSR dialog in its current state, end the temporary
   * classic entry listeners, then accept requests and own keyboard entry. */
  useBrowserLayoutEffect(() => {
    const owner = paletteRef.current?.closest(OWNER);
    if (!owner) return undefined;
    languageRef.current = site.currentLocale() || model.language;
    const handleRequest = (event) => {
      const request = event.detail || {};
      if (owner.__portfolioReactCommandRequest === request) delete owner.__portfolioReactCommandRequest;
      if (request.isOpen) openPalette(request.trigger);
      else closePalette({ restoreFocus: request.restoreFocus !== false });
    };
    const click = (event) => {
      const toggle = event.target.closest?.("[data-command-toggle]");
      if (toggle) openPalette(toggle);
    };
    const keydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "k") {
        event.preventDefault();
        openPalette(document.activeElement);
      }
      if (event.key === "Escape" && openRef.current) {
        event.preventDefault();
        closePalette();
        return;
      }
      if (openRef.current) shell.trapFocus(event, paletteRef.current?.querySelector("[role='dialog']"));
    };
    owner.__portfolioReactCommandEntryCleanup?.();
    owner.addEventListener(REQUEST_EVENT, handleRequest);
    document.addEventListener("click", click);
    document.addEventListener("keydown", keydown);
    owner.__portfolioReactCommandReady = true;
    markToggles(openRef.current);
    const pending = owner.__portfolioReactCommandRequest;
    if (pending) delete owner.__portfolioReactCommandRequest;
    /* Results are runtime data: load them now, honouring anything typed
     * into the SSR input before hydration. */
    setContent(readContent());
    setQuery((inputRef.current?.value || "").toLowerCase());
    const unsubscribe = site.subscribeLocale(({ locale } = {}) => {
      languageRef.current = locale || site.currentLocale() || languageRef.current;
      setContent(readContent());
    });
    return () => {
      unsubscribe();
      owner.removeEventListener(REQUEST_EVENT, handleRequest);
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keydown);
      delete owner.__portfolioReactCommandReady;
    };
  }, [closePalette, model.language, openPalette, readContent]);

  const results = content ? content.commands.filter((command) => matches(command, query)).slice(0, RESULT_LIMIT) : null;

  return (
    <div
      className={open ? "command-palette is-open" : "command-palette"}
      id="command-palette"
      data-command-palette=""
      aria-hidden={String(!open)}
      hidden={!open}
      ref={paletteRef}
      onClick={(event) => { if (event.target === event.currentTarget) closePalette(); }}
    >
      <div className="command-box" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
        <div className="command-head">
          <i className="bx bx-search" aria-hidden="true" />
          <input
            type="search"
            data-command-input=""
            aria-label={copy.commandDialogLabel}
            placeholder={copy.commandPlaceholder}
            ref={inputRef}
            onInput={(event) => {
              setContent(readContent());
              setQuery(event.currentTarget.value.toLowerCase());
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-title" id="command-palette-title" data-command-title="">{copy.commandsTitle}</div>
        <div className="command-results" data-command-results="">
          {results === null ? null : results.length
            ? results.map((command) => (
              <button type="button" data-command-id={command.id} key={command.id} onClick={() => execute(command)}>
                <strong>{command.label}</strong>
                <span>{command.hint}</span>
              </button>
            ))
            : <p className="command-empty">{copy.noResults}</p>}
        </div>
      </div>
    </div>
  );
}
