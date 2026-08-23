import { Link } from "react-router-dom";
import { usePreferences } from "../state/PreferencesContext.jsx";
import PreviewNotice from "../components/PreviewNotice.jsx";

export default function MigrationHome() {
  const { t } = usePreferences();

  const proofs = [
    "home.proven.router",
    "home.proven.prerender",
    "home.proven.isolation",
    "home.proven.parity",
  ];

  return (
    <>
      <PreviewNotice />

      <section className="rf-section">
        <h1>{t("home.title")}</h1>
        <p className="rf-lead">{t("home.lead")}</p>
      </section>

      <section className="rf-section" aria-labelledby="rf-proven-heading">
        <h2 id="rf-proven-heading">{t("home.provenHeading")}</h2>
        <ul className="rf-list">
          {proofs.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p>
          <Link className="rf-inline-link" to="/about">
            {t("home.aboutLink")}
          </Link>
        </p>
      </section>
    </>
  );
}
