import { StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import ProductionMain from "./production/ProductionMain.jsx";
import RecruiterMode from "./production/RecruiterMode.jsx";

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
