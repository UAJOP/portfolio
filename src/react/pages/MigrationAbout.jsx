import Container from "../components/ui/Container.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Surface from "../components/ui/Surface.jsx";
import Action from "../components/ui/Action.jsx";
import Badge from "../components/ui/Badge.jsx";
import { usePreferences } from "../state/PreferencesContext.jsx";
import { meta, projectList, labs } from "../data/portfolio.js";

/**
 * The rules the system holds itself to, plus the data architecture underneath.
 *
 * The counts at the bottom are derived from the canonical data at build time
 * rather than written down, so they cannot go stale and cannot overstate.
 */
export default function MigrationAbout() {
  const { t } = usePreferences();

  const principles = [
    "about.principles.tokens",
    "about.principles.semantics",
    "about.principles.motion",
    "about.principles.evidence",
  ];

  const dataPoints = ["about.data.canonical", "about.data.generated", "about.data.react"];

  return (
    <Container>
      <section className="v3-section">
        <div className="v3-stack">
          <p className="v3-eyebrow">{t("home.eyebrow")}</p>
          <h1 className="v3-h1 v3-measure">{t("about.title")}</h1>
          <p className="v3-body-lg v3-measure">{t("about.lead")}</p>
        </div>
      </section>

      <section className="v3-section v3-section--divided" aria-labelledby="principles-heading">
        <SectionHeading id="principles-heading" eyebrow="01" title={t("about.principlesHeading")} />

        <div className="v3-grid">
          {principles.map((key, index) => (
            <Surface key={key} padding="lg" as="article">
              <div className="v3-stack v3-stack--sm">
                <p className="v3-mono">{String(index + 1).padStart(2, "0")}</p>
                <p className="v3-body">{t(key)}</p>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="v3-section v3-section--divided" aria-labelledby="data-heading">
        <SectionHeading id="data-heading" eyebrow="02" title={t("about.dataHeading")} />

        <Surface variant="elevated" padding="lg">
          <ul className="v3-stack">
            {dataPoints.map((key) => (
              <li key={key} className="v3-body">
                {t(key)}
              </li>
            ))}
          </ul>
        </Surface>

        {/* Counted from the canonical data, so these cannot drift from reality. */}
        <div className="v3-cluster v3-cluster--sm" style={{ marginTop: "var(--space-5)" }}>
          <Badge tech>
            {t("about.registryLabel")} {meta.version}
          </Badge>
          <Badge tech>
            {projectList.length} {t("about.countProjects")}
          </Badge>
          <Badge tech>
            {labs.length} {t("about.countLabs")}
          </Badge>
        </div>
      </section>

      <section className="v3-section">
        <Action to="/" variant="secondary" arrow>
          {t("about.homeLink")}
        </Action>
      </section>
    </Container>
  );
}
