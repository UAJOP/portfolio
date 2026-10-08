/* V4 project-detail shell: the two things a detail page gains that its own
 * content does not already carry.
 *
 * Both are derived at build time (scripts/home-about-react.mjs): the tracker
 * from the page's own section labels, related work from the Works catalog's
 * project/category relationships. Neither invents a section, a ranking or a
 * relationship; a page with nothing to list renders neither. */

/* Where you are in the system you have entered. Plain in-page links; the
 * runtime marks the section in view. */
export function SectionTracker({ model }) {
  if (model.items.length < 2) return null;
  return (
    <nav className="v4-tracker" data-v4-tracker="" aria-label={model.aria}>
      <ol>
        {model.items.map((item, index) => (
          <li key={item.id}>
            <a className="v4-node" href={`#${item.id}`}>
              <i className="v4-node__dot" aria-hidden="true" />
              <small aria-hidden="true">{String(index + 1).padStart(2, "0")}</small>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* The way onward: every other catalog project filed under a capability this
 * one is filed under, grouped by that capability, in catalog order. */
export function RelatedWork({ model }) {
  if (!model.groups.length) return null;
  return (
    <section className="section-shell v4-related" aria-labelledby="v4-related-title">
      <div className="case-section-heading">
        <p className="eyebrow">{model.eyebrow}</p>
        <h2 id="v4-related-title">{model.title}</h2>
      </div>
      <div className="v4-related__map">
        <p className="v4-related__self v4-node" data-v4-state="active"><i className="v4-node__dot" aria-hidden="true" />{model.self}</p>
        {model.groups.map((group) => (
          <div key={group.id} className="v4-related__group">
            <h3 className="v4-node v4-related__hub" data-v4-state="related"><i className="v4-node__dot" aria-hidden="true" />{group.label}</h3>
            <ul>
              {group.projects.map((project) => (
                <li key={project.id}>
                  <a className="v4-related__project" data-v4-card="" href={project.href}>
                    <strong>{project.title}</strong>
                    {project.status ? <small>{project.status}</small> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
