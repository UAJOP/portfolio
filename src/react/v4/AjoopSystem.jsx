/* V4 AJOOP case-study visuals.
 *
 * AjoopSystem: the public answer path as a diagram of its own — the visitor,
 * the public UI, the bounded conversation state, the two answer sources that
 * read the same portfolio evidence, and the one grounded response. Below a
 * drawn boundary sits the owner-only track, with no wire to anything above
 * it, because there is none. Geometry and copy are built at build time
 * (scripts/v4-ajoop-pages.mjs).
 *
 * Complete without JavaScript: the path is drawn and every part is explained
 * in a list. js/v4/runtime.js adds activation, as on the ecosystem map: a
 * part in hand lights what it is wired to and shows its own explanation. The
 * wires draw once when the diagram is first seen; nothing travels along them
 * that is not the visitor's own pointer or focus.
 *
 * AjoopEntry: the case study's way into the live system — the Living Hub
 * artwork under the approved lockup, then the assistant's own resting state
 * and quick questions, each an ordinary link to the Hub.
 *
 * LivingHubArt: the approved artwork, one image in three widths. It is always
 * a dark surface; the frame around it decides how much of it shows. */
const share = (value, of) => `${Math.round((value / of) * 10000) / 100}%`;
const NOSCRIPT_STYLE = { __html: ".v4-ajoop-sys__panels [hidden]{display:block!important}.v4-ajoop-sys__rest{display:none!important}" };
const ART = "/assets/ajoop-living-hub";
const ART_SET = [640, 960, 1600].map((width) => `${ART}-${width}.webp ${width}w`).join(", ");

/* `priority` is for the one place the artwork can be the largest thing in the
 * first viewport; everywhere else it loads when it is near. */
export function LivingHubArt({ sizes, priority = false }) {
  return <img className="ajoop-art" src={`${ART}-960.webp`} srcSet={ART_SET} sizes={sizes} width="1600" height="900" alt="" {...(priority ? { fetchPriority: "high" } : { loading: "lazy", decoding: "async" })} />;
}

export default function AjoopSystem({ model }) {
  const at = (point) => ({ "--v4-x": share(point.x, model.width), "--v4-y": share(point.y, model.height) });
  const boundary = share(model.boundary, model.height);
  const node = (entry, kind) => (
    <button key={entry.id} type="button" className="v4-node v4-ajoop-sys__node" style={at(entry)} data-v4-eco-node={entry.id} data-v4-eco-kind="capability" data-v4-eco-links={(entry.links || []).join(" ")} data-v4-zone={kind} aria-pressed="false">
      <i className="v4-node__dot" aria-hidden="true" />
      <span>{entry.label}</span>
    </button>
  );
  return (
    <div className="v4-ajoop-sys__stage">
      <div className="v4-ajoop-sys" data-v4-eco="" role="group" aria-label={model.aria} style={{ "--v4-sys-aspect": `${model.width} / ${model.height}`, "--v4-sys-boundary": boundary }}>
        <svg className="v4-ajoop-sys__field" viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true" focusable="false">
          <path className="v4-ajoop-sys__boundary" d={`M0 ${model.boundary}H${model.width}`} />
          {model.edges.map((edge, index) => (
            <g key={`${edge.from}:${edge.to}`} className="v4-ajoop-sys__edge" data-v4-edge={`${edge.from} ${edge.to}`} style={{ "--v4-seq": index }}>
              <path className="v4-ajoop-sys__wire-glow" d={edge.d} />
              <path className="v4-ajoop-sys__wire" d={edge.d} pathLength="1" />
              <path className="v4-eco__pulse" d={edge.d} pathLength="100" />
            </g>
          ))}
        </svg>
        <p className="v4-ajoop-sys__zone" data-v4-zone="public">{model.labels.public}</p>
        <p className="v4-ajoop-sys__zone" data-v4-zone="boundary">{model.labels.boundary}</p>
        <p className="v4-ajoop-sys__zone" data-v4-zone="private">{model.labels.private}</p>
        {model.nodes.map((entry) => node(entry, "public"))}
        {node(model.owner, "private")}
      </div>
      <div className="v4-ajoop-sys__panels">
        <noscript><style dangerouslySetInnerHTML={NOSCRIPT_STYLE} /></noscript>
        <p className="v4-ajoop-sys__rest" data-v4-eco-panel="">{model.labels.rest}</p>
        {[...model.nodes, model.owner].map((entry) => (
          <article key={entry.id} className="v4-ajoop-sys__panel" data-v4-eco-panel={entry.id} data-v4-zone={entry.id === model.owner.id ? "private" : "public"} hidden>
            <h3>{entry.label}</h3>
            <p>{entry.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AjoopEntry({ model }) {
  return (
    <div className="v4-ajoop-entry" data-v4-card="">
      <div className="v4-ajoop-entry__media">
        <LivingHubArt sizes="(min-width: 981px) 44vw, 100vw" priority />
        {/* The page's heading already says the name; this is its lockup. */}
        <span className="v4-ajoop-entry__lockup" aria-hidden="true" />
        <span className="v4-state">{model.state}</span>
      </div>
      <p className="v4-ajoop-entry__ask">{model.ask}</p>
      <ul>
        {model.quicks.map((quick) => <li key={quick}><a href={model.href}>{quick}</a></li>)}
      </ul>
      <a className="v4-ajoop-entry__cta" href={model.href}>{model.cta}</a>
    </div>
  );
}
