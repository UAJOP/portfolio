import { StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import ProductionMain from "./production/ProductionMain.jsx";
import RecruiterMode from "./production/RecruiterMode.jsx";
import AjoopShell from "./production/AjoopShell.jsx";
import CommandPalette from "./production/CommandPalette.jsx";

const container = document.querySelector("main[data-react-main]");
const payload = document.getElementById("react-main-props");
if (!container || !payload) throw new Error("production React main hydration contract is missing");
const props = JSON.parse(payload.textContent);
const recruiterContainer = document.querySelector("[data-react-recruiter-owner='react']");
const recruiterPayload = document.getElementById("react-recruiter-props");
if (!recruiterContainer || !recruiterPayload) throw new Error("production React recruiter hydration contract is missing");
const recruiterProps = JSON.parse(recruiterPayload.textContent);
const COMPLETE_EVENT = "portfolio:react-main-hydrated";
const ERROR_EVENT = "portfolio:react-main-hydration-error";

function HydrationCompletionSignal() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(COMPLETE_EVENT));
  }, []);
  return null;
}

window.dispatchEvent(new CustomEvent("portfolio:react-main-hydration-start"));
hydrateRoot(container, (
  <StrictMode>
    <ProductionMain {...props} />
    <HydrationCompletionSignal />
  </StrictMode>
), {
  onRecoverableError(error, errorInfo) {
    window.dispatchEvent(new CustomEvent(ERROR_EVENT, {
      detail: {
        message: error instanceof Error ? error.message : String(error),
        componentStack: errorInfo?.componentStack || "",
      },
    }));
  },
});

hydrateRoot(recruiterContainer, <StrictMode><RecruiterMode model={recruiterProps} /></StrictMode>, {
  onRecoverableError(error, errorInfo) {
    window.dispatchEvent(new CustomEvent(ERROR_EVENT, {
      detail: {
        message: error instanceof Error ? error.message : String(error),
        componentStack: errorInfo?.componentStack || "",
        root: "recruiter",
      },
    }));
  },
});

/* #28 overlay owners: the Ajoop panel shell and the Command Palette. */
for (const [selector, payloadId, root, render] of [
  ['[data-react-ajoop-shell="react"]', "react-ajoop-props", "ajoop", (model) => <AjoopShell model={model} />],
  ['[data-react-command-owner="react"]', "react-command-props", "command", (model) => <CommandPalette model={model} />],
]) {
  const overlayContainer = document.querySelector(selector);
  const overlayPayload = document.getElementById(payloadId);
  if (!overlayContainer || !overlayPayload) throw new Error(`production React ${root} hydration contract is missing`);
  hydrateRoot(overlayContainer, <StrictMode>{render(JSON.parse(overlayPayload.textContent))}</StrictMode>, {
    onRecoverableError(error, errorInfo) {
      window.dispatchEvent(new CustomEvent(ERROR_EVENT, {
        detail: {
          message: error instanceof Error ? error.message : String(error),
          componentStack: errorInfo?.componentStack || "",
          root,
        },
      }));
    },
  });
}
