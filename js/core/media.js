/**
 * Image fallback handling for missing or broken assets.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 229-256.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function setupPortfolioImageFallbacks() {
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (
        !image ||
        image.tagName !== "IMG" ||
        image.dataset.fallbackApplied === "true"
      )
        return;

      image.dataset.fallbackApplied = "true";
      const currentSource = image.getAttribute("src") || "";
      const fallbackSource = currentSource.toLowerCase().includes("joyday")
        ? "assets/joyday-homepage-preview.webp"
        : "assets/KAAN BALCI-BÜYÜK LOGO PNG.png";

      if (currentSource !== fallbackSource) {
        image.src = fallbackSource;
      }
    },
    true,
  );
}

setupPortfolioImageFallbacks();

