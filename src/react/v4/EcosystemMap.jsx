import { ecosystemGeometry } from "./flowGeometry.js";

/* V4 project ecosystem.
 *
 * A map of what the portfolio actually contains: every project on the Works
 * catalog, wired to the catalog categories it is filed under. Both sets and
 * every wire come from that catalog (scripts/home-about-react.mjs); nothing
 * here is authored by hand, and the layout is derived from the same data.
 *
 * Complete without JavaScript: capabilities are buttons, projects are links to
 * their pages, the wires are inline SVG. js/v4/runtime.js adds activation —
 * pointing at, focusing or pressing a node lights what it is really connected
 * to, lets the rest recede, and says so in the readout. Below 1100px the map
 * becomes a capability rail over a project list; the wires are not squeezed
 * onto a phone. */
export default function EcosystemMap({ model }) {
  const geometry = ecosystemGeometry(model);
  const projectsOf = (capability) => model.projects.filter((project) => project.categories.includes(capability.id));
  const two = (value) => String(value).padStart(2, "0");
  return (
    <section className="section-shell section-block v4-eco-section" aria-labelledby="v4-eco-title" data-v4-ambient="">
      <div className="section-heading">
        <p className="eyebrow">{model.eyebrow}</p>
        <h2 id="v4-eco-title">{model.title}</h2>
        <p>{model.lead}</p>
      </div>
      <div className="v4-eco" data-v4-eco="" style={{ "--v4-eco-aspect": geometry.aspect }}>
        <svg className="v4-eco__field" viewBox={geometry.viewBox} aria-hidden="true" focusable="false">
          <path className="v4-eco__loop-glow" d={geometry.loop} />
          <path className="v4-eco__loop" d={geometry.loop} pathLength="1" />
          {geometry.edges.map((edge) => (
            <g key={`${edge.project}:${edge.capability}`} className="v4-eco__edge" data-v4-edge={`${edge.project} ${edge.capability}`}>
              <path className="v4-eco__wire-glow" d={edge.d} />
              <path className="v4-eco__wire" d={edge.d} pathLength="1" />
              <path className="v4-eco__pulse" d={edge.d} pathLength="100" />
            </g>
          ))}
        </svg>
        <div className="v4-eco__capabilities" role="group" aria-label={model.capabilitiesLabel}>
          {model.capabilities.map((capability) => {
            const at = geometry.capability(capability);
            return (
              <button
                key={capability.id}
                type="button"
                className="v4-node v4-eco__capability"
                data-v4-eco-node={capability.id}
                data-v4-eco-kind="capability"
                data-v4-eco-tier={at.tier}
                data-v4-eco-links={projectsOf(capability).map((project) => project.id).join(" ")}
                aria-pressed="false"
                style={{ "--v4-x": at.x, "--v4-y": at.y, "--v4-degree": at.degree }}
              >
                <i className="v4-node__dot" aria-hidden="true" />
                <span>{capability.label}</span>
                <small aria-hidden="true">{two(at.degree)}</small>
              </button>
            );
          })}
        </div>
        <ul className="v4-eco__projects" aria-label={model.projectsLabel}>
          {model.projects.map((project) => {
            const at = geometry.project(project.id);
            return (
              <li key={project.id} data-v4-eco-side={at.side} style={{ "--v4-x": at.x, "--v4-y": at.y }}>
                <a
                  className="v4-node v4-eco__project"
                  href={project.href}
                  data-v4-eco-node={project.id}
                  data-v4-eco-kind="project"
                  data-v4-eco-links={project.categories.join(" ")}
                  data-v4-eco-tier={project.tier}
                >
                  <i className="v4-node__dot" aria-hidden="true" />
                  <span className="v4-eco__title">{project.title}</span>
                  {project.status ? <small>{project.status}</small> : null}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      {/* What the map is showing, in words: the runtime rewrites it from the
          lit nodes' own labels. Its resting text is the map's real totals. */}
      <p className="v4-eco__readout" data-v4-eco-readout="" aria-live="polite">
        <span>{model.capabilitiesLabel} {two(model.capabilities.length)}</span>
        <span>{model.projectsLabel} {two(model.projects.length)}</span>
        <a href={model.viewAll.href}>{model.viewAll.label}</a>
      </p>
      <i className="v4-handoff" aria-hidden="true" />
    </section>
  );
}
