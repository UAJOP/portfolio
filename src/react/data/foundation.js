/**
 * TEMPORARY MIGRATION PARITY FIXTURE — NOT a production source of truth.
 *
 * The canonical registry stays `portfolio-data.js` at the repository root. It is
 * a browser global (`window.KAAN_PORTFOLIO`), so it cannot be imported by a Vite
 * module graph yet; converting it into a real JSON source of truth is #24.
 *
 * Until then this file mirrors the handful of profile values the React preview
 * renders. `qa-react-foundation.js` loads the real registry and fails the build
 * if any value here drifts from it, so this fixture can never quietly become a
 * second competing truth. Delete it in #24 once the JSON source lands.
 */

export const profile = {
  name: "Kaan Balcı",
  // Canonical primary title. Never replace this with a role-specific variant.
  primaryTitle: "Forward Deployed Engineer",
  // Professional background, not a competing target title.
  backgroundTitle: "AI Designer & Software Developer",
  footerTagline:
    "Forward Deployed Engineer building reliable AI systems and product-minded software.",
  footerTaglineTr:
    "Güvenilir AI sistemleri ve ürün odaklı yazılımlar geliştiren Forward Deployed Engineer.",
};

/**
 * The five canonical public destinations, in the same order the production
 * footer renders them. `label` is the accessible name; the icon is decorative.
 */
export const socials = [
  { id: "github", label: "GitHub", url: "https://github.com/UAJOP" },
  { id: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
  { id: "instagram", label: "Instagram", url: "https://www.instagram.com/kaan_ba1/" },
  { id: "youtube", label: "YouTube", url: "https://www.youtube.com/channel/UCCoOWMoemn93OX7cHyGTZuA" },
  { id: "x", label: "X", url: "https://x.com/KaanAjop" },
];
