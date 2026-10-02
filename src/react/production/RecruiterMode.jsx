import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const INTENT_KEY = "kaanbalci-recruiter-intent";
const BRIDGE_EVENT = "portfolio:react-recruiter-request";
const DEFAULT_ROLE = "applied-ai";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function readIntent() {
  try {
    return sessionStorage.getItem(INTENT_KEY) === "active";
  } catch {
    return false;
  }
}

function writeIntent(active) {
  try {
    if (active) sessionStorage.setItem(INTENT_KEY, "active");
    else sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // Storage is optional; the dialog remains fully usable without it.
  }
}

function markIntent(active, open, { includeReactMain = true } = {}) {
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {
    if (!includeReactMain && button.closest("[data-react-main]")) return;
    button.classList.toggle("is-recruiter-intent", active);
    button.setAttribute("aria-controls", "recruiter-dialog");
    button.setAttribute("aria-expanded", String(open));
  });
}

function setBackgroundInert(activeRoot) {
  const changed = [];
  if (!("inert" in HTMLElement.prototype)) return () => {};
  for (const element of document.body.children) {
    if (element === activeRoot || element.contains(activeRoot) || element.tagName === "SCRIPT") continue;
    changed.push([element, element.inert]);
    element.inert = true;
  }
  return () => changed.forEach(([element, previous]) => { element.inert = previous; });
}

function focusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((element) => (
    element.getAttribute("aria-hidden") !== "true"
    && (element.offsetParent !== null || element === document.activeElement)
  ));
}

export default function RecruiterMode({ model }) {
  const initialRequest = typeof document === "undefined"
    ? null
    : document.querySelector("[data-react-recruiter-owner='react']")?.__portfolioReactRecruiterRequest;
  const initiallyOpen = Boolean(initialRequest?.preHydrationApplied && initialRequest.isOpen);
  const roleIds = Object.keys(model.profiles);
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [open, setOpen] = useState(initiallyOpen);
  const openRef = useRef(initiallyOpen);
  const drawerRef = useRef(null);
  const triggerRef = useRef(
    typeof HTMLElement !== "undefined" && initialRequest?.trigger instanceof HTMLElement
      ? initialRequest.trigger
      : null,
  );
  const restoreInertRef = useRef(() => {});
  const profile = model.profiles[role] || model.profiles[DEFAULT_ROLE];

  const close = useCallback(({ restoreFocus = true } = {}) => {
    const wasOpen = openRef.current;
    openRef.current = false;
    setOpen(false);
    writeIntent(false);
    markIntent(false, false);
    restoreInertRef.current();
    restoreInertRef.current = () => {};
    if (wasOpen && restoreFocus && triggerRef.current?.isConnected) triggerRef.current.focus();
    triggerRef.current = null;
  }, []);

  const show = useCallback((nextRole, trigger = null) => {
    const wasOpen = openRef.current;
    if (nextRole && model.profiles[nextRole]) setRole(nextRole);
    openRef.current = true;
    triggerRef.current = trigger instanceof HTMLElement
      ? trigger
      : triggerRef.current || document.querySelector("[data-recruiter-toggle]");
    globalThis.closeMobileNavigation?.();
    globalThis.setChatbotOpen?.(false, { restoreFocus: false });
    globalThis.setCommandPaletteOpen?.(false, { restoreFocus: false });
    setOpen(true);
    writeIntent(true);
    markIntent(true, true);
    if (!wasOpen) {
      globalThis.trackAnalyticsEvent?.("recruiter_mode_open", {
        source: globalThis.analyticsSourceForElement?.(trigger) || "header",
      });
    }
  }, [model.profiles]);

  const selectRole = useCallback((nextRole) => {
    if (!model.profiles[nextRole]) return;
    setRole(nextRole);
    const url = new URL(window.location.href);
    url.searchParams.set("role", nextRole);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [model.profiles]);

  useBrowserLayoutEffect(() => {
    const click = (event) => {
      const trigger = event.target.closest?.("[data-recruiter-toggle]");
      if (!trigger) return;
      event.preventDefault();
      if (open) close();
      else show(null, trigger);
    };
    document.addEventListener("click", click);
    markIntent(readIntent(), open, { includeReactMain: false });
    return () => document.removeEventListener("click", click);
  }, [close, open, show]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("role");
    if (requested && model.profiles[requested]) show(requested, null);
  }, [model.profiles, show]);

  useBrowserLayoutEffect(() => {
    const owner = drawerRef.current?.closest("[data-react-recruiter-owner='react']");
    if (!owner) return undefined;
    const handleRequest = (event) => {
      const request = event.detail || {};
      if (owner.__portfolioReactRecruiterRequest === request) delete owner.__portfolioReactRecruiterRequest;
      flushSync(() => {
        if (request.isOpen) show(null, request.trigger);
        else close({ restoreFocus: request.restoreFocus !== false });
      });
    };
    owner.addEventListener(BRIDGE_EVENT, handleRequest);
    owner.__portfolioReactRecruiterReady = true;
    owner.__portfolioReactRecruiterEntryCleanup?.();
    const pending = owner.__portfolioReactRecruiterRequest;
    if (pending) {
      delete owner.__portfolioReactRecruiterRequest;
      if (pending.preHydrationApplied) {
        /* Remove the temporary legacy inert state. The following layout effect
         * installs React's state from the already-visible SSR dialog. */
        globalThis.setBackgroundInert?.();
      } else if (pending.isOpen) show(null, pending.trigger);
      else close({ restoreFocus: pending.restoreFocus !== false });
    }
    return () => {
      owner.removeEventListener(BRIDGE_EVENT, handleRequest);
      delete owner.__portfolioReactRecruiterReady;
    };
  }, [close, show]);

  useBrowserLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return undefined;
    restoreInertRef.current();
    restoreInertRef.current = () => {};
    document.body.classList.toggle("recruiter-mode-active", open);
    document.body.classList.toggle("overlay-modal-open", open);
    if (!open) return undefined;
    restoreInertRef.current = setBackgroundInert(drawer);
    const frame = drawer.contains(document.activeElement)
      ? 0
      : requestAnimationFrame(() => drawer.querySelector("[data-recruiter-close]")?.focus());
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(drawer);
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      restoreInertRef.current();
      restoreInertRef.current = () => {};
    };
  }, [close, open]);

  useEffect(() => () => {
    openRef.current = false;
    restoreInertRef.current();
    document.body.classList.remove("recruiter-mode-active", "overlay-modal-open");
  }, []);

  return (
    <div
      className="recruiter-drawer"
      id="recruiter-dialog"
      data-recruiter-drawer=""
      data-recruiter-state-owner="react"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recruiter-dialog-title"
      aria-describedby="recruiter-dialog-description"
      aria-hidden={String(!open)}
      hidden={!open}
      ref={drawerRef}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="recruiter-card recruiter-card-v2">
        <button className="recruiter-close" type="button" data-recruiter-close="" aria-label={model.copy.close} onClick={() => close()}>
          <i className="bx bx-x" aria-hidden="true" />
        </button>
        <p className="eyebrow">{model.copy.label}</p>
        <h2 id="recruiter-dialog-title">{model.copy.title}</h2>
        <p id="recruiter-dialog-description">{model.copy.lead}</p>
        <div className="recruiter-status"><span />{model.availability}</div>
        <div className="recruiter-data-note"><i className="bx bx-data" aria-hidden="true" />{model.copy.updated} · {model.updatedAt}</div>
        <h3>{model.copy.choose}</h3>
        <div className="recruiter-role-switch" role="group" aria-label={model.copy.choose}>
          {roleIds.map((id) => (
            <button
              id={`recruiter-role-${id}`}
              key={id}
              type="button"
              data-recruiter-role={id}
              className={id === role ? "active" : undefined}
              aria-pressed={id === role}
              onClick={() => selectRole(id)}
            >{model.profiles[id].label}</button>
          ))}
        </div>
        <h3>{model.copy.primary}</h3>
        <div className="recruiter-primary-profile">{model.primaryTitle}</div>
        <h3>{model.copy.focus}</h3>
        <div className="recruiter-primary-profile recruiter-focus-title">{profile.focusTitle}</div>
        <h3>{model.copy.capabilities}</h3>
        <div className="mini-stack">{profile.capabilities.map((item) => <span key={item}>{item}</span>)}</div>
        <h3>{model.copy.skills}</h3>
        <ul className="recruiter-proof-list recruiter-capability-list">{profile.skills.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>{model.copy.proof}</h3>
        <div className="recruiter-links">
          {profile.evidence.map((item) => (
            <a id={`recruiter-evidence-${item.id}`} data-recruiter-evidence={item.id} href={item.href} key={item.id}>
              <strong>{item.title}</strong><small>{item.summary}</small><span>{model.copy.openEvidence}</span>
            </a>
          ))}
        </div>
        <div className="recruiter-actions">
          <a className="btn primary" data-recruiter-resume="" href={model.resume} target="_blank" rel="noopener noreferrer">{model.copy.cv}</a>
          <a className="btn ghost" data-recruiter-contact="" href={model.email}>{model.copy.email}</a>
          <a className="btn ghost" href={model.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </div>
    </div>
  );
}
