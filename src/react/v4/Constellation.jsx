import { useState } from "react";

/* V4 learning constellation (Certificates).
 *
 * The page's own credentials, clustered the two ways its data supports: by
 * the category each is listed under and by the provider named on it. Nothing
 * is scored, ranked or linked to a project; the catalog below remains the
 * archive and the default reading. The model and both layouts are derived at
 * build time (scripts/v4-inner-pages.mjs).
 *
 * `state` is the page's presentation state — { view, group, cluster } — shared
 * with the credential grid, so a chosen cluster is the same choice in both
 * views. Offered only once the page can answer; without JavaScript the page
 * is the ordinary credential grid. */
const share = (value, of) => `${Math.round((value / of) * 10000) / 100}%`;

function Modes({ label, options, value, onChange, live }) {
  return (
    <div className="v4-modes" role="group" aria-label={label} data-v4-live={live ? "" : undefined}>
      {options.map(([id, text]) => (
        <button key={id} type="button" className="v4-modes__mode" data-v4-mode={id} aria-pressed={String(value === id)} onClick={() => onChange(id)}>
          <i aria-hidden="true" />
          {text}
        </button>
      ))}
    </div>
  );
}

function Credential({ credential }) {
  return (
    <>
      <p className="v4-sky__kicker"><span>{credential.kind}</span><strong>{credential.providerLabel}</strong></p>
      <h3>{credential.title}</h3>
      <dl>
        {credential.meta.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="certificate-actions">
        {credential.href ? <a href={credential.href} rel="noopener noreferrer" target="_blank"><i className="bx bx-link-external" />{credential.hrefLabel}</a> : null}
        <button className="certificate-preview" data-cert={credential.image} data-cert-title={credential.title} type="button"><i className="bx bx-image" />{credential.previewLabel}</button>
      </div>
    </>
  );
}

export default function Constellation({ sky, state, setState, live }) {
  const { labels } = sky;
  const [pointed, setPointed] = useState(null);
  const [pinned, setPinned] = useState(null);
  const layout = sky.groups[state.group];
  const at = (point) => ({ "--v4-x": share(point.x, sky.width), "--v4-y": share(point.y, sky.height) });
  const inCluster = (credential) => credential[state.group] === state.cluster;
  /* The credential whose details are open: the one pointed at or focused,
   * else the one pinned. */
  const open = sky.credentials.find((credential) => credential.id === pointed) || sky.credentials.find((credential) => credential.id === pinned) || null;
  const hub = layout.hubs.find((entry) => entry.id === pointed) || layout.hubs.find((entry) => entry.id === state.cluster) || null;
  const lit = (credential) => (open ? credential.id === open.id : hub ? credential[state.group] === hub.id : false);
  const stateOf = (credential) => (open?.id === credential.id ? "active" : lit(credential) ? "related" : undefined);
  const point = (id) => ({
    onPointerEnter: (event) => { if (event.pointerType !== "touch") setPointed(id); },
    onPointerLeave: () => setPointed(null),
    onFocus: () => setPointed(id),
    onBlur: () => setPointed(null),
  });
  const choose = (cluster) => { setPinned(null); setState({ ...state, cluster: state.cluster === cluster ? null : cluster }); };
  const shown = state.cluster ? sky.credentials.filter(inCluster) : sky.credentials;
  return (
    <section className="section-shell v4-sky-section" data-v4-view={state.view} aria-label={labels.constellation}>
      <div className="v4-sky__controls">
        <Modes label={labels.viewAria} live={live} value={state.view} onChange={(view) => setState({ ...state, view })} options={[["grid", labels.grid], ["constellation", labels.constellation]]} />
        <Modes label={labels.groupAria} live={live} value={state.group} onChange={(group) => { setPinned(null); setState({ ...state, group, cluster: null }); }} options={[["area", labels.area], ["provider", labels.provider]]} />
      </div>
      {/* The clusters of the current grouping, as one rail for both views. */}
      <div className="v4-sky__rail" role="group" aria-label={labels[state.group]} data-v4-live={live ? "" : undefined} data-v4-count={`${String(shown.length).padStart(2, "0")} / ${sky.core.count}`}>
        <button type="button" className="v4-node v4-sky__cluster" aria-pressed={String(!state.cluster)} onClick={() => choose(state.cluster)}><i className="v4-node__dot" aria-hidden="true" />{labels.all}<small>{sky.core.count}</small></button>
        {layout.hubs.map((entry) => (
          <button key={entry.id} type="button" className="v4-node v4-sky__cluster" data-v4-cluster={entry.id} aria-pressed={String(state.cluster === entry.id)} onClick={() => choose(entry.id)}>
            <i className="v4-node__dot" aria-hidden="true" />{entry.label}<small>{entry.count}</small>
          </button>
        ))}
      </div>
      <div className="v4-sky" data-v4-group={state.group} data-v4-lit={open || hub ? "" : undefined}>
        <svg className="v4-sky__field" viewBox={`0 0 ${sky.width} ${sky.height}`} aria-hidden="true" focusable="false">
          {/* Redrawn when the grouping changes: the wires arrive after the stars. */}
          <g key={state.group} className="v4-sky__wires">
            {layout.hubs.map((entry, index) => (
              <path key={entry.id} className="v4-sky__spoke" d={`M${sky.core.x} ${sky.core.y}L${entry.x} ${entry.y}`} pathLength="1" style={{ "--v4-seq": index }} data-v4-state={hub?.id === entry.id || (open && open[state.group] === entry.id) ? "active" : undefined} />
            ))}
            {sky.credentials.map((credential, index) => {
              const to = layout.at[credential.id];
              const from = layout.hubs.find((entry) => entry.id === to.hub);
              return <path key={credential.id} className="v4-sky__wire" d={`M${from.x} ${from.y}L${to.x} ${to.y}`} pathLength="1" style={{ "--v4-seq": index }} data-v4-state={stateOf(credential)} data-v4-out={state.cluster && !inCluster(credential) ? "" : undefined} />;
            })}
          </g>
        </svg>
        <p className="v4-sky__core" style={at(sky.core)}><strong>{sky.core.count}</strong><span>{sky.core.label}</span></p>
        <div className="v4-sky__hubs" role="group" aria-label={labels[state.group]}>
          {layout.hubs.map((entry) => (
            <button key={`${state.group}:${entry.id}`} type="button" className="v4-node v4-sky__hub" style={at(entry)} aria-pressed={String(state.cluster === entry.id)} data-v4-state={hub?.id === entry.id ? "active" : open && open[state.group] === entry.id ? "related" : undefined} data-v4-out={state.cluster && state.cluster !== entry.id ? "" : undefined} onClick={() => choose(entry.id)} {...point(entry.id)}>
              <i className="v4-node__dot" aria-hidden="true" />
              <span>{entry.label}</span>
              <small aria-hidden="true">{entry.count}</small>
            </button>
          ))}
        </div>
        <ul className="v4-sky__stars">
          {sky.credentials.map((credential) => (
            <li key={credential.id} data-v4-out={state.cluster && !inCluster(credential) ? "" : undefined}>
              <button type="button" className="v4-node v4-sky__star" style={at(layout.at[credential.id])} aria-pressed={String(pinned === credential.id)} data-v4-state={stateOf(credential)} data-v4-linked={credential.href ? "" : undefined} data-v4-above={layout.at[credential.id].above ? "" : undefined} onClick={() => setPinned(pinned === credential.id ? null : credential.id)} {...point(credential.id)}>
                <i className="v4-node__dot" aria-hidden="true" />
                <span>{credential.title}</span>
                <small>{credential.providerLabel}</small>
              </button>
              {/* Always in the document, so the preview dialog stays bound. */}
              <div className="v4-sky__panel" hidden={open?.id !== credential.id}><Credential credential={credential} /></div>
            </li>
          ))}
        </ul>
        <p className="v4-sky__panel v4-sky__rest" hidden={Boolean(open)}>
          {hub ? <strong>{hub.label}</strong> : null}
          <span>{labels.credentials} {hub ? hub.count : sky.core.count}</span>
          <span>{labels.linked} {String((hub ? sky.credentials.filter((credential) => credential[state.group] === hub.id) : sky.credentials).filter((credential) => credential.href).length).padStart(2, "0")}</span>
        </p>
      </div>
    </section>
  );
}
