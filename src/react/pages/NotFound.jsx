import { Link } from "react-router-dom";
import { usePreferences } from "../state/PreferencesContext.jsx";
import PreviewNotice from "../components/PreviewNotice.jsx";

/**
 * Rendered for any unmatched preview path, and pre-rendered to dist-react/404.html
 * so a static host serves this exact markup for an unknown URL.
 *
 * It deliberately does NOT echo the attempted path. The pre-rendered file is
 * produced at a sentinel path but served for arbitrary unknown paths, so echoing
 * the URL would make the build-time HTML and the client render disagree — a real
 * hydration mismatch. Keeping the view path-independent is what lets one
 * pre-rendered file hydrate cleanly at any unknown URL.
 */
export default function NotFound() {
  const { t } = usePreferences();

  return (
    <>
      <PreviewNotice />

      <section className="rf-section">
        <h1>{t("notFound.title")}</h1>
        <p className="rf-lead">{t("notFound.lead")}</p>
        <p>
          <Link className="rf-inline-link" to="/">
            {t("notFound.homeLink")}
          </Link>
        </p>
      </section>
    </>
  );
}
