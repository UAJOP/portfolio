import Container from "../components/ui/Container.jsx";
import Action from "../components/ui/Action.jsx";
import { usePreferences } from "../state/PreferencesContext.jsx";

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
    <Container narrow>
      <section className="v3-section">
        <div className="v3-stack v3-stack--lg">
          <div className="v3-stack">
            <p className="v3-eyebrow">404</p>
            <h1 className="v3-h1">{t("notFound.title")}</h1>
            <p className="v3-body-lg">{t("notFound.lead")}</p>
          </div>

          <div>
            <Action to="/" variant="primary" arrow>
              {t("notFound.homeLink")}
            </Action>
          </div>
        </div>
      </section>
    </Container>
  );
}
