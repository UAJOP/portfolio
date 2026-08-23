import { usePreferences } from "../state/PreferencesContext.jsx";

/** Makes it unmistakable, on every preview route, that this is not the live site. */
export default function PreviewNotice() {
  const { t } = usePreferences();

  return (
    <aside className="rf-notice" aria-label={t("preview.badge")}>
      <p className="rf-notice-badge">{t("preview.badge")}</p>
      <p className="rf-notice-text">{t("preview.notice")}</p>
    </aside>
  );
}
