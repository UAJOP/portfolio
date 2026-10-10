/* V4 human system map (About).
 *
 * The person at the centre, the capability focuses the page itself offers
 * around them, and the work each focus's recruiter profile already cites as
 * evidence beyond that. Every theme, statement and wire is canonical
 * (scripts/v4-inner-pages.mjs); no interest, trait or relationship is added.
 *
 * Complete without JavaScript: themes are listed with their titles, projects
 * are links. js/v4/runtime.js adds activation, as on the ecosystem map.
 * Below 1100px the orbit is not drawn: the portrait leads, and each theme
 * becomes a small group of its own evidence. */
const share = (value, of) => `${Math.round((value / of) * 10000) / 100}%`;
const two = (value) => String(value).padStart(2, "0");

export default function HumanMap({ model }) {
  const at = (point) => ({ "--v4-x": share(point.x, model.width), "--v4-y": share(point.y, model.height) });
  const project = (id) => model.projects.find((entry) => entry.id === id);
  return (
    <section className="section-shell v4-human-section" aria-label={model.aria}>
      <p className="eyebrow">{model.eyebrow}</p>
      <div className="v4-human__stage">
        <div className="v4-human" data-v4-eco="" style={{ "--v4-human-aspect": `${model.width} / ${model.height}` }}>
          <svg className="v4-human__field" viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true" focusable="false">
            {model.orbits.map(([rx, ry], index) => <ellipse key={rx} className={index ? "v4-human__orbit v4-human__orbit--far" : "v4-human__orbit"} cx={model.core.x} cy={model.core.y} rx={rx} ry={ry} pathLength="1" />)}
            {model.themes.map((theme, index) => (
              <g key={theme.id} className="v4-human__spoke" data-v4-edge={theme.id} style={{ "--v4-seq": index }}>
                <path d={`M${model.core.x} ${model.core.y}L${theme.x} ${theme.y}`} pathLength="1" />
              </g>
            ))}
            {model.edges.map((edge, index) => (
              <g key={`${edge.theme}:${edge.project}`} className="v4-human__edge" data-v4-edge={`${edge.theme} ${edge.project}`} style={{ "--v4-seq": index }}>
                <path className="v4-human__wire" d={edge.d} pathLength="1" />
                <path className="v4-eco__pulse" d={edge.d} pathLength="100" />
              </g>
            ))}
          </svg>
          <figure className="v4-human__core" style={at(model.core)}>
            <img src={model.core.src} alt={model.core.alt} width="700" height="1000" decoding="async" />
            <figcaption><strong>{model.core.role}</strong><span>{model.core.location}</span></figcaption>
          </figure>
          <div className="v4-human__themes" role="group" aria-label={model.labels.themes}>
            {model.themes.map((theme) => (
              <button key={theme.id} type="button" className="v4-node v4-human__theme" style={at(theme)} data-v4-eco-node={theme.id} data-v4-eco-kind="capability" data-v4-eco-links={theme.links.join(" ")} aria-pressed="false">
                <i className="v4-node__dot" aria-hidden="true" />
                <span>{theme.label}</span>
              </button>
            ))}
          </div>
          <ul className="v4-human__projects" aria-label={model.labels.evidence}>
            {model.projects.map((entry) => (
              <li key={entry.id} style={at(entry)} data-v4-align={entry.align} data-v4-above={entry.above ? "" : undefined}>
                <a className="v4-node v4-human__project" href={entry.href} data-v4-eco-node={entry.id} data-v4-eco-kind="project" data-v4-eco-links={entry.themes.join(" ")}>
                  <i className="v4-node__dot" aria-hidden="true" />
                  <span className="v4-eco__title">{entry.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="v4-human__panels">
          {/* At rest: the themes and what each one stands for. */}
          <ol className="v4-human__panel v4-human__index" data-v4-eco-panel="">
            {model.themes.map((theme, index) => (
              <li key={theme.id}><small aria-hidden="true">{two(index + 1)}</small><span>{theme.title}</span></li>
            ))}
          </ol>
          {model.themes.map((theme, index) => (
            <article key={theme.id} className="v4-human__panel v4-human__theme-panel" data-v4-eco-panel={theme.id} hidden>
              <p className="v4-human__kicker"><small aria-hidden="true">{two(index + 1)}</small><a href={theme.href}>{theme.label}</a></p>
              <h3>{theme.title}</h3>
              <ul className="v4-human__skills">{theme.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
              <ul className="v4-human__cited" aria-label={model.labels.evidence}>
                {theme.links.map((id) => <li key={id}><a className="v4-node" href={project(id).href}><i className="v4-node__dot" aria-hidden="true" />{project(id).title}</a></li>)}
              </ul>
            </article>
          ))}
          {model.projects.map((entry) => (
            <article key={entry.id} className="v4-human__panel v4-human__project-panel" data-v4-eco-panel={entry.id} hidden>
              <p className="v4-human__kicker"><span>{model.labels.evidence}</span></p>
              <h3>{entry.title}</h3>
              <p>{entry.summary}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
