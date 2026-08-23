import { Link } from "react-router-dom";
import { usePreferences } from "../state/PreferencesContext.jsx";
import PreviewNotice from "../components/PreviewNotice.jsx";

export default function MigrationAbout() {
  const { t } = usePreferences();

  const rules = [
    "about.rules.parity",
    "about.rules.static",
    "about.rules.truth",
    "about.rules.rollback",
  ];

  return (
    <>
      <PreviewNotice />

      <section className="rf-section">
        <h1>{t("about.title")}</h1>
        <p className="rf-lead">{t("about.lead")}</p>
      </section>

      <section className="rf-section" aria-labelledby="rf-rules-heading">
        <h2 id="rf-rules-heading">{t("about.rulesHeading")}</h2>
        <ul className="rf-list">
          {rules.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p>
          <Link className="rf-inline-link" to="/">
            {t("about.homeLink")}
          </Link>
        </p>
      </section>
    </>
  );
}
