/* V4 career current (Experience).
 *
 * The page's own roles on one time axis: every role starts where its printed
 * start date falls, runs for its printed duration, and shares the current
 * with whatever it overlapped. A branch leaves a role only for the project
 * its card already links to; a thread joins two roles only where both carry
 * the same tag. The model, dates and geometry are derived at build time
 * (scripts/v4-inner-pages.mjs) from the accepted page.
 *
 * Complete without JavaScript: every role is a link to its entry in the
 * chronology below, every branch a link to its project. js/v4/runtime.js adds
 * activation, as on the ecosystem map. Below 1100px this chart is not shown;
 * the chronology itself is the current there. */
const share = (value, of) => `${Math.round((value / of) * 10000) / 100}%`;

function Ports({ items }) {
  return (
    <ul className="v4-ports">
      {items.map((item) => <li key={item.id || item} className="v4-node" data-v4-cap={item.id}><i className="v4-node__dot" aria-hidden="true" />{item.label || item}</li>)}
    </ul>
  );
}

/* One destination, or (Home) a row of them. */
export function Onward({ model, links = [model] }) {
  return (
    <nav className="section-shell v4-onward" aria-label={links.map((link) => link.label).join(" · ")} data-v4-onward-row={links.length > 1 ? "" : undefined}>
      {links.map((link) => (
        <a key={link.href} className="v4-onward__link" href={link.href}>
          <small>{link.label}</small>
          <strong>{link.title}</strong>
          <i aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}

export default function CareerCurrent({ model }) {
  const at = (x, y) => ({ "--v4-x": share(x, model.width), "--v4-y": share(y, model.height) });
  /* Oldest first: the order the current reaches them in. */
  const order = [...model.roles].sort((a, b) => a.x - b.x).map((role) => role.id);
  const branches = model.roles.filter((role) => role.evidence);
  return (
    <section className="section-shell v4-career-section" aria-label={model.aria}>
      <p className="eyebrow">{model.eyebrow}</p>
      <div className="v4-career" data-v4-eco="" style={{ "--v4-career-aspect": `${model.width} / ${model.height}` }}>
        <svg className="v4-career__field" viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true" focusable="false">
          <g className="v4-career__grid">
            {model.years.map((year) => <path key={year.label} d={`M${year.x} 22V${model.height - 42}`} />)}
          </g>
          <path className="v4-career__glow" d={model.current} />
          <path className="v4-career__current" d={model.current} pathLength="1" />
          <path className="v4-career__onward" d={model.onward} />
          {model.threads.map((thread) => (
            <g key={thread.id} className="v4-career__thread" data-v4-edge={[thread.id, ...thread.roles].join(" ")}>
              <path d={thread.d} />
            </g>
          ))}
          {model.roles.map((role) => (
            <g key={role.id} className="v4-career__span" data-v4-edge={role.id} data-v4-live={role.live ? "" : undefined} style={{ "--v4-seq": order.indexOf(role.id) }}>
              <path className="v4-career__lane-glow" d={role.d} />
              <path className="v4-career__lane" d={role.d} pathLength="1" />
            </g>
          ))}
          {branches.map((role) => (
            <g key={role.id} className="v4-career__branch" data-v4-edge={`${role.id} ${role.evidence.id}`} style={{ "--v4-seq": order.indexOf(role.id) }}>
              <path className="v4-career__wire" d={role.evidence.d} pathLength="1" />
              <path className="v4-eco__pulse" d={role.evidence.d} pathLength="100" />
            </g>
          ))}
        </svg>
        <ol className="v4-career__years" aria-hidden="true">
          {model.years.map((year) => <li key={year.label} style={{ "--v4-x": share(year.x, model.width) }}>{year.label}</li>)}
        </ol>
        <ol className="v4-career__roles">
          {model.roles.map((role) => (
            <li key={role.id} style={{ ...at(role.x, role.y), "--v4-seq": order.indexOf(role.id) }} data-v4-side={role.side} data-v4-align={role.align} data-v4-branch={role.evidence ? "" : undefined}>
              <a className="v4-node v4-career__role" href={`#${role.anchor}`} data-v4-eco-node={role.id} data-v4-eco-kind="role" data-v4-eco-links={role.links.join(" ")} data-v4-live={role.live ? "" : undefined}>
                <i className="v4-node__dot" aria-hidden="true" />
                <span className="v4-eco__title">{role.org}</span>
                <small>{role.period}</small>
              </a>
            </li>
          ))}
        </ol>
        <ul className="v4-career__evidence" aria-label={model.labels.evidence}>
          {branches.map((role) => (
            <li key={role.id} style={at(role.evidence.x, role.evidence.y)} data-v4-align={role.evidence.align}>
              <a className="v4-node v4-career__project" href={role.evidence.href} data-v4-eco-node={role.evidence.id} data-v4-eco-kind="project" data-v4-eco-links={role.id}>
                <i className="v4-node__dot" aria-hidden="true" />
                <span className="v4-eco__title">{role.evidence.title}</span>
                {role.evidence.status ? <small>{role.evidence.status}</small> : null}
              </a>
            </li>
          ))}
        </ul>
        {model.threads.map((thread) => (
          <p key={thread.id} className="v4-node v4-career__tag" style={at(thread.x, thread.y)} data-v4-eco-node={thread.id} data-v4-eco-kind="thread" data-v4-eco-links={thread.roles.join(" ")}>{thread.label}</p>
        ))}
        <span className="v4-career__now" style={at(model.now.x, model.now.y)} aria-hidden="true">{model.now.label}</span>
        <a className="v4-node v4-career__direction" href="#v4-direction" style={at(model.direction.x, model.direction.y)} data-v4-eco-node="direction" data-v4-eco-kind="direction" data-v4-eco-links="">
          <i className="v4-node__dot" aria-hidden="true" />
          <span>{model.direction.label}</span>
        </a>
      </div>
      {/* What the chart is showing, in the page's own words. The runtime
          swaps the resting line for the active node's entry. */}
      <div className="v4-career__readout">
        <p className="v4-career__entry" data-v4-eco-panel="">
          <span>{model.labels.roles} {model.counts.roles}</span>
          <span>{model.labels.evidence} {model.counts.evidence}</span>
        </p>
        {model.roles.map((role) => (
          <div key={role.id} className="v4-career__entry" data-v4-eco-panel={role.id} hidden>
            <p><strong>{role.org}</strong>{role.title}</p>
            <p><span>{role.place}</span><span>{role.period}</span></p>
            <Ports items={role.tags} />
          </div>
        ))}
        {branches.map((role) => (
          <div key={role.evidence.id} className="v4-career__entry" data-v4-eco-panel={role.evidence.id} hidden>
            <p><strong>{role.evidence.title}</strong>{role.org}</p>
            <p>{role.evidence.status ? <span>{role.evidence.status}</span> : null}</p>
            <Ports items={role.evidence.capabilities} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* The capabilities a linked project is filed under, on the role that links it. */
export function EvidencePorts({ evidence }) {
  return <Ports items={evidence.capabilities} />;
}

/* Phones: a milestone can be folded to its heading. Rendered open; the
 * runtime offers it only where folding is in effect. */
export function MilestoneToggle({ labels }) {
  return (
    <button type="button" className="v4-milestone__toggle" aria-expanded="true">
      <span data-v4-when="open">{labels.less}</span>
      <span data-v4-when="closed">{labels.more}</span>
    </button>
  );
}
