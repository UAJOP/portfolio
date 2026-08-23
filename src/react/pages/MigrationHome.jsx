import Container from "../components/ui/Container.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import Surface from "../components/ui/Surface.jsx";
import Badge from "../components/ui/Badge.jsx";
import Action from "../components/ui/Action.jsx";
import { usePreferences } from "../state/PreferencesContext.jsx";
import { profile, projects, recruiterProfileList } from "../data/portfolio.js";

/**
 * V3 design-system specimen.
 *
 * This is deliberately NOT the future home page. It is a labelled specimen of
 * the system — type scale, actions, badges, surfaces, grid — so the design
 * language can be reviewed before #25 commits a real page layout to it.
 *
 * Every product fact rendered here (titles, project names, statuses, stacks,
 * capabilities) is read from canonical JSON. Nothing is invented, and there are
 * no metrics, user counts or performance claims anywhere on the page.
 */
export default function MigrationHome() {
  const { language, t } = usePreferences();
  const local = (value) => (value ? value[language] || value.en : "");

  // Two flagship projects, straight from the registry.
  const lead = projects.sinama;
  const second = projects.mergeRush;

  return (
    <>
      {/* ---------------------------------------------------- identity ---- */}
      <Container>
        <section className="v3-section">
          <div className="v3-stack v3-stack--lg">
            <div className="v3-stack">
              <p className="v3-eyebrow">{t("home.eyebrow")}</p>
              <h1 className="v3-display v3-measure">{t("home.title")}</h1>
              <p className="v3-body-lg v3-measure">{t("home.lead")}</p>
            </div>

            <div className="v3-cluster">
              <Action to="/about" variant="primary" arrow>
                {t("home.actionPrimary")}
              </Action>
              <Action
                href={profile.socials.github}
                variant="secondary"
                external
              >
                GitHub
              </Action>
            </div>

            {/* Canonical identity, shown as the system renders it. */}
            <div className="v3-cluster v3-cluster--sm">
              <Badge tone="accent">{profile.primaryTitle[language]}</Badge>
              <Badge>{profile.backgroundTitle[language]}</Badge>
              <Badge tech>{local(profile.location)}</Badge>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- typography --- */}
        <section className="v3-section v3-section--divided" aria-labelledby="specimen-type">
          <SectionHeading
            id="specimen-type"
            eyebrow="01"
            title={t("home.typographyHeading")}
            lead={t("home.typographyLead")}
          />

          <Surface variant="elevated" padding="lg">
            <div className="v3-stack v3-stack--lg">
              {[
                { label: t("type.display"), className: "v3-display", token: "--text-display" },
                { label: `${t("type.heading")} 1`, className: "v3-h1", token: "--text-h1" },
                { label: `${t("type.heading")} 2`, className: "v3-h2", token: "--text-h2" },
                { label: `${t("type.heading")} 3`, className: "v3-h3", token: "--text-h3" },
                { label: t("type.body"), className: "v3-body-lg", token: "--text-body-lg" },
              ].map((row) => (
                <div key={row.token} className="v3-split">
                  <p className={`${row.className} v3-text-primary`}>{t("type.sample")}</p>
                  <p className="v3-mono">{row.token}</p>
                </div>
              ))}

              <div className="v3-split">
                <p className="v3-eyebrow">{t("type.eyebrow")} · {t("type.sample")}</p>
                <p className="v3-mono">--text-label</p>
              </div>
            </div>
          </Surface>
        </section>

        {/* ---------------------------------------------- actions/signals -- */}
        <section className="v3-section v3-section--divided" aria-labelledby="specimen-actions">
          <SectionHeading
            id="specimen-actions"
            eyebrow="02"
            title={t("home.actionsHeading")}
            lead={t("home.actionsLead")}
          />

          <div className="v3-grid">
            <Surface padding="lg">
              <div className="v3-stack">
                <p className="v3-eyebrow">Actions</p>
                <div className="v3-cluster">
                  <Action to="/about" variant="primary">
                    Primary
                  </Action>
                  <Action to="/about" variant="secondary">
                    Secondary
                  </Action>
                  <Action to="/about" variant="quiet" arrow>
                    Quiet
                  </Action>
                </div>
              </div>
            </Surface>

            <Surface padding="lg">
              <div className="v3-stack">
                <p className="v3-eyebrow">Signals</p>
                <div className="v3-cluster v3-cluster--sm">
                  <Badge tone="success" dot>
                    {local(lead.status)}
                  </Badge>
                  <Badge tone="warning" dot>
                    {local(second.status)}
                  </Badge>
                  <Badge tone="accent">{local(lead.category)}</Badge>
                  <Badge tech>FastAPI</Badge>
                  <Badge tech>PostgreSQL</Badge>
                </div>
              </div>
            </Surface>
          </div>
        </section>

        {/* ------------------------------------------------ evidence cards -- */}
        <section className="v3-section v3-section--divided" aria-labelledby="specimen-evidence">
          <SectionHeading
            id="specimen-evidence"
            eyebrow="03"
            title={t("home.evidenceHeading")}
            lead={t("home.evidenceLead")}
          />

          <div className="v3-bento">
            {/* Lead cell: accented, the only card carrying the accent rule. */}
            <Surface variant="elevated" padding="lg" interactive accented as="article">
              <div className="v3-stack">
                <div className="v3-cluster v3-cluster--sm">
                  <Badge tone="success" dot>
                    {local(lead.status)}
                  </Badge>
                  <Badge>{local(lead.category)}</Badge>
                </div>

                <h3 className="v3-h3">{lead.name}</h3>
                <p className="v3-body">{local(lead.summary)}</p>

                <ul className="v3-stack v3-stack--sm">
                  {lead.proof.slice(0, 3).map((item) => (
                    <li key={item.en} className="v3-small v3-text-secondary">
                      {local(item)}
                    </li>
                  ))}
                </ul>

                <div>
                  <p className="v3-eyebrow">{t("home.stackLabel")}</p>
                  <div className="v3-cluster v3-cluster--sm" style={{ marginTop: "var(--space-2)" }}>
                    {lead.stack.slice(0, 5).map((tech) => (
                      <Badge key={tech} tech>
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Surface>

            <Surface padding="lg" interactive as="article">
              <div className="v3-stack">
                <div className="v3-cluster v3-cluster--sm">
                  <Badge tone="warning" dot>
                    {local(second.status)}
                  </Badge>
                  <Badge>{local(second.category)}</Badge>
                </div>

                <h3 className="v3-h3">{second.name}</h3>
                <p className="v3-body">{local(second.summary)}</p>

                <div className="v3-cluster v3-cluster--sm">
                  {second.stack.slice(0, 4).map((tech) => (
                    <Badge key={tech} tech>
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            </Surface>
          </div>
        </section>

        {/* ------------------------------------------------- capabilities --- */}
        <section className="v3-section v3-section--divided" aria-labelledby="specimen-capabilities">
          <SectionHeading
            id="specimen-capabilities"
            eyebrow="04"
            title={t("home.capabilitiesHeading")}
            lead={t("home.capabilitiesLead")}
          />

          <div className="v3-grid v3-grid--compact">
            {recruiterProfileList.map((entry) => (
              <Surface key={entry.id} variant="inset" padding="lg" as="article">
                <div className="v3-stack v3-stack--sm">
                  <p className="v3-eyebrow">{local(entry.label)}</p>
                  <p className="v3-small v3-text-primary">{local(entry.focusTitle)}</p>
                  {/*
                    capabilities are plain language-neutral strings in the
                    registry, not bilingual pairs — rendered as-is, exactly as
                    the live recruiter surface renders them.
                  */}
                  <ul className="v3-cluster v3-cluster--sm" style={{ marginTop: "var(--space-2)" }}>
                    {entry.capabilities.slice(0, 3).map((capability) => (
                      <li key={capability}>
                        <Badge tech>{capability}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </Surface>
            ))}
          </div>
        </section>
      </Container>
    </>
  );
}
