/**
 * Minimal EN/TR proof for the React preview only.
 *
 * Production translations still live in `legacy-script.js` (`i18nTranslations`)
 * and in the `data-pv2-en` / `data-pv2-tr` attribute pattern. Nothing here is
 * migrated production copy; it exists to prove the shape a JSON i18n system can
 * grow into. Real translation migration is deliberately out of scope for #23.
 *
 * Shape rule: one flat key -> { en, tr } map, so it can be serialized to JSON
 * unchanged when the data layer moves in #24.
 */

export const SUPPORTED_LANGUAGES = ["en", "tr"];
export const DEFAULT_LANGUAGE = "en";

export const translations = {
  "nav.home": { en: "Overview", tr: "Genel Bakış" },
  "nav.about": { en: "Approach", tr: "Yaklaşım" },
  "nav.label": { en: "React preview", tr: "React önizleme" },

  "preview.badge": { en: "Engineering preview", tr: "Mühendislik önizlemesi" },
  "preview.notice": {
    en: "This page is a migration proof. It is not part of the public portfolio and is excluded from search engines.",
    tr: "Bu sayfa bir migrasyon kanıtıdır. Herkese açık portfolyonun parçası değildir ve arama motorlarından hariç tutulmuştur.",
  },

  "home.title": { en: "React migration foundation", tr: "React migrasyon temeli" },
  "home.lead": {
    en: "React, Vite and React Router now run beside the live site instead of replacing it. Every public page still ships from the existing static architecture.",
    tr: "React, Vite ve React Router artık canlı siteyi değiştirmeden onun yanında çalışıyor. Tüm herkese açık sayfalar mevcut statik mimariden yayınlanmaya devam ediyor.",
  },
  "home.provenHeading": { en: "What this foundation proves", tr: "Bu temel neyi kanıtlıyor" },
  "home.proven.router": {
    en: "React Router drives isolated preview routes with working direct entry, client navigation and history.",
    tr: "React Router; doğrudan giriş, istemci navigasyonu ve geçmiş desteğiyle izole önizleme rotalarını yönetiyor.",
  },
  "home.proven.prerender": {
    en: "Each route is pre-rendered to real HTML at build time, so content exists before any JavaScript runs.",
    tr: "Her rota derleme sırasında gerçek HTML'e ön-render ediliyor; içerik JavaScript çalışmadan önce mevcut oluyor.",
  },
  "home.proven.isolation": {
    en: "The React build writes only to dist-react/, so no production file is overwritten.",
    tr: "React derlemesi yalnızca dist-react/ dizinine yazıyor; hiçbir production dosyası değiştirilmiyor.",
  },
  "home.proven.parity": {
    en: "Theme and language use the same storage keys as the live site, so preferences stay in sync.",
    tr: "Tema ve dil, canlı siteyle aynı depolama anahtarlarını kullanıyor; tercihler senkron kalıyor.",
  },
  "home.aboutLink": { en: "See the migration approach", tr: "Migrasyon yaklaşımını gör" },

  "about.title": { en: "How the migration proceeds", tr: "Migrasyon nasıl ilerliyor" },
  "about.lead": {
    en: "Pages move one at a time. A legacy implementation is removed only after the React version proves parity in behavior, accessibility and content.",
    tr: "Sayfalar teker teker taşınıyor. Bir legacy uygulama, ancak React sürümü davranış, erişilebilirlik ve içerik açısından eşitliğini kanıtladıktan sonra kaldırılıyor.",
  },
  "about.rulesHeading": { en: "Rules that hold for every phase", tr: "Her aşamada geçerli kurallar" },
  "about.rules.parity": {
    en: "No page is migrated until its React version matches the live page.",
    tr: "Bir sayfa, React sürümü canlı sayfayla eşleşene kadar taşınmaz.",
  },
  "about.rules.static": {
    en: "Every migrated route must still produce crawlable pre-rendered HTML.",
    tr: "Taşınan her rota, taranabilir ön-render HTML üretmeye devam etmelidir.",
  },
  "about.rules.truth": {
    en: "Portfolio facts keep one source of truth; the React tree never forks it.",
    tr: "Portfolyo verileri tek doğruluk kaynağını korur; React ağacı onu asla çatallamaz.",
  },
  "about.rules.rollback": {
    en: "Legacy stays in place until removal is a separate, reversible step.",
    tr: "Kaldırma ayrı ve geri alınabilir bir adım olana kadar legacy yerinde kalır.",
  },
  "about.homeLink": { en: "Back to the preview overview", tr: "Önizleme genel bakışına dön" },

  "notFound.title": { en: "Preview route not found", tr: "Önizleme rotası bulunamadı" },
  "notFound.lead": {
    en: "This preview route does not exist. Use the preview navigation to return to a known route.",
    tr: "Bu önizleme rotası mevcut değil. Bilinen bir rotaya dönmek için önizleme navigasyonunu kullanın.",
  },
  "notFound.homeLink": { en: "Go to the preview overview", tr: "Önizleme genel bakışına git" },

  "controls.language": { en: "Language", tr: "Dil" },
  "controls.theme": { en: "Theme", tr: "Tema" },
  "controls.themeDark": { en: "Dark", tr: "Koyu" },
  "controls.themeLight": { en: "Light", tr: "Açık" },

  "footer.legacyNote": {
    en: "Rendered by the React foundation using the same canonical profile truth as the live footer.",
    tr: "Canlı footer ile aynı canonical profil verisini kullanarak React temeli tarafından render edildi.",
  },
};

/** Returns the translated string, falling back to the key so drift is visible. */
export function translate(language, key) {
  const entry = translations[key];
  if (!entry) return key;
  return entry[language] || entry[DEFAULT_LANGUAGE] || key;
}
