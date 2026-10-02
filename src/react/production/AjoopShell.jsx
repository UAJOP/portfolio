import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ajoopEngine, overlays, shell } from "./commonRuntime.js";

/* Master 3 #28: the public Ajoop panel shell on React production documents.
 *
 * React owns the launcher, the panel chrome, the composer, the action row and
 * every open/close, focus, inert and keyboard transition. The engine
 * (js/ajoop/*) stays the single owner of conversation state and responses.
 *
 * Transcript island contract (docs/master-3-28-ajoop-command-palette.md):
 * [data-chatbot-messages] is rendered once, empty, with a constant
 * dangerouslySetInnerHTML object, so React never creates, diffs or clears its
 * children — not during hydration and not on any later render. The engine's
 * QA-pinned message builders are its only writers. The element is never
 * unmounted, so its children live exactly as long as the engine's transcript.
 *
 * Presentation port: on takeover React calls connectAjoopPresentation() and
 * receives the engine's recorded mascot, service line, action row, busy state
 * and chrome copy, then every later change. React never reads engine
 * internals and the engine never reads React state. */
const OWNER = '[data-react-ajoop-shell="react"]';
const REQUEST_EVENT = "portfolio:react-ajoop-request";
const TRANSCRIPT_ISLAND = Object.freeze({ __html: "" });
/* React 19 SSR writes attribute names as given; HTML wants this one lowercase. */
const COMPOSER_ATTRIBUTES = Object.freeze({ autocomplete: "off" });
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* The engine's character (ajoopMascotMarkup), static and decorative: its
 * state is carried by the wrapper's attributes, which React renders. */
const MASCOT_SVG = Object.freeze({
  __html: '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g class="ajoop-mascot-antenna"><line x1="20" y1="9" x2="20" y2="4"></line><circle class="ajoop-mascot-bulb" cx="20" cy="3" r="2.4"></circle></g><rect class="ajoop-mascot-head" x="7" y="9" width="26" height="22" rx="8"></rect><g class="ajoop-mascot-face"><rect class="ajoop-mascot-eye is-left" x="13" y="16" width="4" height="6" rx="2"></rect><rect class="ajoop-mascot-eye is-right" x="23" y="16" width="4" height="6" rx="2"></rect><rect class="ajoop-mascot-mouth" x="15" y="25" width="10" height="2.4" rx="1.2"></rect></g><g class="ajoop-mascot-dots" aria-hidden="true"><circle cx="15" cy="26" r="1.5"></circle><circle cx="20" cy="26" r="1.5"></circle><circle cx="25" cy="26" r="1.5"></circle></g><text class="ajoop-mascot-null" x="20" y="28" text-anchor="middle">NULL</text></svg>',
});

function AjoopMascot({ mascot }) {
  return <span className="ajoop-mascot" data-ajoop-mascot={mascot.state} role="img" aria-label={mascot.label} title={mascot.label} dangerouslySetInnerHTML={MASCOT_SVG} />;
}

function ActionButton({ action, busy }) {
  return (
    <button type="button" data-chatbot-action-kind={action.action} disabled={busy} onClick={() => ajoopEngine.runAction(action, action.label)}>
      {action.label}
    </button>
  );
}

export default function AjoopShell({ model }) {
  const initialRequest = typeof document === "undefined" ? null : document.querySelector(OWNER)?.__portfolioReactAjoopRequest;
  const initiallyOpen = Boolean(initialRequest?.preHydrationApplied && initialRequest.isOpen);
  const [open, setOpen] = useState(initiallyOpen);
  const [copy, setCopy] = useState(model.copy);
  const [mascot, setMascot] = useState(model.mascot);
  const [service, setService] = useState({ state: null, label: "" });
  const [busy, setBusy] = useState(false);
  /* Each row from the engine is a new generation: its buttons are remounted,
   * as the classic renderer rebuilt them, never reused for other actions. */
  const [actionRow, setActionRow] = useState({ model: null, generation: 0 });
  const actions = actionRow.model;
  const openRef = useRef(initiallyOpen);
  const widgetRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const handlersRef = useRef(null);

  const openPanel = (trigger) => {
    shell.closeMobileNavigation();
    overlays.setCommandPaletteOpen(false, { restoreFocus: false });
    overlays.setRecruiterMode(false, { restoreFocus: false });
    shell.rememberOverlayTrigger(panelRef.current, trigger || launcherRef.current);
    openRef.current = true;
    setOpen(true);
    ajoopEngine.panelState(true);
    shell.setBackgroundInert(widgetRef.current);
    shell.setOverlayBodyState(true);
    /* One probe per open, subject to the bridge's own backoff. */
    ajoopEngine.initializeAi();
    window.setTimeout(() => ajoopEngine.focusEntry(), 80);
  };

  const closePanel = ({ restoreFocus = true } = {}) => {
    const wasOpen = openRef.current;
    openRef.current = false;
    if (wasOpen) setOpen(false);
    ajoopEngine.panelState(false);
    if (!wasOpen) return;
    shell.setBackgroundInert();
    shell.setOverlayBodyState(false);
    if (restoreFocus) shell.restoreOverlayFocus(panelRef.current);
  };
  handlersRef.current = { openPanel, closePanel };

  /* Takeover: connect the presentation port, adopt the SSR shell in its
   * current state, end the temporary classic entry listeners, then accept
   * requests from the other overlays. */
  useBrowserLayoutEffect(() => {
    const owner = widgetRef.current?.closest(OWNER);
    if (!owner) return undefined;
    let inTakeover = true;
    /* Action-row changes commit synchronously: the engine scrolls the
     * transcript right after it, and the row's height decides how much of the
     * transcript is visible. */
    const sync = (update) => (inTakeover ? update() : flushSync(update));
    const connection = ajoopEngine.connect({
      mascot: (value) => setMascot(value),
      service: (value) => setService(value),
      copy: (value) => setCopy(value),
      busy: (value) => sync(() => setBusy(value)),
      actions: (value) => sync(() => {
        setActionRow((row) => ({ model: value, generation: row.generation + 1 }));
        setBusy(false);
      }),
    });
    const snapshot = connection?.snapshot;
    if (snapshot) {
      if (snapshot.copy) setCopy(snapshot.copy);
      if (snapshot.mascot) setMascot(snapshot.mascot);
      setService(snapshot.service || { state: null, label: "" });
      setBusy(Boolean(snapshot.busy));
      if (snapshot.actions) setActionRow((row) => ({ model: snapshot.actions, generation: row.generation + 1 }));
    }
    const handleRequest = (event) => {
      const request = event.detail || {};
      if (owner.__portfolioReactAjoopRequest === request) delete owner.__portfolioReactAjoopRequest;
      if (request.isOpen) handlersRef.current.openPanel(request.trigger);
      else handlersRef.current.closePanel({ restoreFocus: request.restoreFocus !== false });
    };
    owner.__portfolioReactAjoopEntryCleanup?.();
    owner.addEventListener(REQUEST_EVENT, handleRequest);
    owner.__portfolioReactAjoopReady = true;
    /* React's own handlers are live: keep (or establish) launcher readiness. */
    owner.setAttribute("data-ajoop-interactive", "");
    delete owner.__portfolioReactAjoopRequest;
    ajoopEngine.panelState(openRef.current);
    inTakeover = false;
    return () => {
      connection?.disconnect?.();
      owner.removeEventListener(REQUEST_EVENT, handleRequest);
      delete owner.__portfolioReactAjoopReady;
    };
  }, []);

  /* Keyboard inside the open panel: Escape closes it, Tab stays inside it.
   * On a touch-first device the dialog itself holds focus on open, so Tab
   * from the container goes to the first control and Shift+Tab to the last. */
  useBrowserLayoutEffect(() => {
    if (!open) return undefined;
    const keydown = (event) => {
      const panel = panelRef.current;
      if (!openRef.current || !panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        handlersRef.current.closePanel();
        return;
      }
      if (event.key === "Tab" && document.activeElement === panel) {
        const focusable = shell.getFocusableElements(panel);
        const target = event.shiftKey ? focusable[focusable.length - 1] : focusable[0];
        if (target) {
          event.preventDefault();
          target.focus();
          return;
        }
      }
      shell.trapFocus(event, panel);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);

  const quicksClass = ["chatbot-quicks", actions?.mode === "followups" ? "is-followups" : null, busy ? "is-busy" : null].filter(Boolean).join(" ");
  const keyFor = (index) => `${actionRow.generation}:${index}`;

  return (
    <aside className={open ? "portfolio-chatbot is-open" : "portfolio-chatbot"} data-portfolio-chatbot="" ref={widgetRef}>
      <div className="chatbot-panel" data-chatbot-panel="" aria-hidden={String(!open)} role="dialog" aria-modal="true" aria-labelledby="ajoop-dialog-title" tabIndex={-1} hidden={!open} ref={panelRef}>
        <div className="chatbot-header">
          <AjoopMascot mascot={mascot} />
          <div className="chatbot-identity">
            <h2 id="ajoop-dialog-title" data-chatbot-title="">{copy.title}</h2>
            <p data-chatbot-subtitle="">{copy.subtitle}</p>
            <p className="chatbot-service" data-chatbot-bridge="" role="status" hidden={!service.state} data-ajoop-service={service.state || undefined}>
              <span className="chatbot-service-dot" aria-hidden="true" />
              <span data-chatbot-bridge-text="">{service.label}</span>
            </p>
          </div>
          <span className="ajoop-mascot-state" data-ajoop-mascot-label="">{mascot.label}</span>
          <button className="chatbot-close" type="button" data-chatbot-close="" aria-label={copy.closeLabel} onClick={() => closePanel()}>
            <i className="bx bx-x" aria-hidden="true" />
          </button>
        </div>
        <div className="chatbot-messages" data-chatbot-messages="" aria-live="polite" dangerouslySetInnerHTML={TRANSCRIPT_ISLAND} suppressHydrationWarning />
        <div className={quicksClass} data-chatbot-quicks="" aria-busy={String(busy)}>
          {actions ? (
            <>
              <p className="chatbot-actions-label">{actions.heading}</p>
              <div className="chatbot-actions-list" role="group" aria-label={actions.heading}>
                {actions.actions.map((action, index) => <ActionButton key={keyFor(index)} action={action} busy={busy} />)}
              </div>
              {actions.secondary.length ? (
                <div className="chatbot-actions-secondary">
                  {actions.secondary.map((action, index) => <ActionButton key={keyFor(`s${index}`)} action={action} busy={busy} />)}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <form className="chatbot-form" data-chatbot-form="" onSubmit={(event) => {
          event.preventDefault();
          ajoopEngine.submit(inputRef.current);
        }}>
          <input
            type="text"
            data-chatbot-input=""
            {...COMPOSER_ATTRIBUTES}
            aria-label={copy.inputPlaceholder}
            placeholder={copy.inputPlaceholder}
            ref={inputRef}
            onFocus={() => ajoopEngine.composerActivity("focus")}
            onInput={() => ajoopEngine.composerActivity("input")}
            onBlur={() => ajoopEngine.composerActivity("blur")}
          />
          <button type="submit" data-chatbot-send="" aria-label={copy.sendLabel}>
            <i className="bx bx-send" aria-hidden="true" />
          </button>
        </form>
      </div>
      <button
        className="chatbot-launcher"
        type="button"
        data-chatbot-toggle=""
        aria-expanded={String(open)}
        aria-label={copy.openLabel}
        ref={launcherRef}
        onClick={(event) => (openRef.current ? closePanel() : openPanel(event.currentTarget))}
      >
        <span className="chatbot-launcher-icon"><i className="bx bx-message-dots" aria-hidden="true" /></span>
        <span data-chatbot-launcher-text="">{copy.launcher}</span>
      </button>
    </aside>
  );
}
