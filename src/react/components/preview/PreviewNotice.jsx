import Container from "../ui/Container.jsx";
import Badge from "../ui/Badge.jsx";
import { usePreferences } from "../../state/PreferencesContext.jsx";

/**
 * Preview-only banner, passed into SiteShell's `banner` slot.
 *
 * It lives outside components/shell/ deliberately. The shell is
 * production-intended and must carry no preview assumptions, so when #25 mounts
 * real pages it simply stops passing this — no shell component changes.
 */
export default function PreviewNotice() {
  const { t } = usePreferences();

  return (
    <Container>
      <aside className="v3-preview-notice" aria-label={t("preview.badge")}>
        <Badge tone="accent">{t("preview.badge")}</Badge>
        <p className="v3-preview-notice__text">{t("preview.notice")}</p>
      </aside>
    </Container>
  );
}
