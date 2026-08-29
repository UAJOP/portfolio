/**
 * Public, non-secret analytics configuration.
 *
 * Production remains a safe no-op until `websiteId` is filled with the Umami
 * Cloud website ID for kaanbalci.com. Never put an API key or other secret in
 * this client-side file.
 */
const portfolioAnalyticsConfig = Object.freeze({
  provider: "umami",
  enabled: true,
  websiteId: "bd717aec-2bde-40ff-b55a-ccc18559b174",
  scriptUrl: "https://cloud.umami.is/script.js",
  domains: Object.freeze(["kaanbalci.com", "www.kaanbalci.com"]),
  excludeSearch: true,
  excludeHash: true,
  respectDoNotTrack: true,
  debugLocal: true,
});
