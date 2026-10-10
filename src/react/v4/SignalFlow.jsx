import { flowGeometry, HUB } from "./flowGeometry.js";

/* V4 engineering signal flow.
 *
 * A stage set, the route a signal takes through it, and optionally the hub
 * that directs it. The markup is complete without JavaScript: stages are an
 * ordered list, the currents are inline SVG, and the travelling signal and
 * each stage's arrival are CSS animations timed from the geometry.
 * js/v4/runtime.js only adds pointer focus and offscreen pausing.
 *
 * Two SVG layers, so the still network never repaints with the signal:
 *   depth   the hub's ring, the background loop, the hub's line to every
 *           stage, and the route's glow
 *   field   the route itself, the line a focused stage lights, the signal
 *
 * model: { id, layout: "orbit" | "rail", field, stages[{ id, x, y, label }],
 *          route[], hub?{ x, y, radius, label, value }, inlet?, outlet?,
 *          loop?, rest?, aria } */
export default function SignalFlow({ model }) {
  const geometry = flowGeometry(model);
  const count = model.stages.length;
  return (
    <div
      className="v4-flow"
      data-v4-flow={model.id}
      data-v4-flow-layout={model.layout}
      style={{
        "--v4-flow-aspect": geometry.aspect,
        ...(model.hub ? { "--v4-hub-x": `${model.hub.x}%`, "--v4-hub-y": `${model.hub.y}%` } : {}),
      }}
    >
      <svg className="v4-flow__depth" viewBox={geometry.viewBox} aria-hidden="true" focusable="false">
        <path className="v4-flow__glow" d={geometry.trace} />
        {geometry.loop ? <path className="v4-flow__loop" d={geometry.loop} /> : null}
        {geometry.hub ? <circle className="v4-flow__ring" cx={geometry.hub.x} cy={geometry.hub.y} r={geometry.hub.radius * 1.5} /> : null}
        {geometry.spokes.map((spoke) => <path key={spoke.id} className="v4-flow__spoke" d={spoke.d} />)}
      </svg>
      <svg className="v4-flow__field" viewBox={geometry.viewBox} aria-hidden="true" focusable="false">
        {geometry.hub ? (
          <circle
            className="v4-flow__orbit"
            cx={geometry.hub.x}
            cy={geometry.hub.y}
            r={geometry.hub.radius}
            pathLength="100"
            transform={`rotate(-64 ${geometry.hub.x} ${geometry.hub.y})`}
            style={{ "--v4-at": geometry.arrival[HUB] ?? 0 }}
          />
        ) : null}
        {geometry.spokes.map((spoke) => (
          <path key={spoke.id} className="v4-flow__link" data-v4-flow-link={spoke.id} d={spoke.d} pathLength="100" />
        ))}
        <path className="v4-flow__trace" d={geometry.trace} />
        <g className="v4-flow__signal">
          <path className="v4-flow__comet" d={geometry.trace} pathLength="1000" />
          <path className="v4-flow__halo" d={geometry.trace} pathLength="1000" />
          <path className="v4-flow__head" d={geometry.trace} pathLength="1000" />
        </g>
      </svg>
      <ol className="v4-flow__stages" aria-label={model.aria}>
        {model.stages.map((stage, index) => (
          <li
            key={stage.id}
            className="v4-flow__stage"
            data-v4-flow-stage={stage.id}
            data-v4-flow-rest={stage.id === model.rest ? "" : undefined}
            style={{
              "--v4-x": `${stage.x}%`,
              "--v4-y": `${stage.y}%`,
              "--v4-at": geometry.arrival[stage.id] ?? 0,
              "--v4-seq": Math.round((index / count) * 100) / 100,
            }}
          >
            <i className="v4-flow__node" aria-hidden="true" />
            <span className="v4-flow__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <strong className="v4-flow__label">{stage.label}</strong>
          </li>
        ))}
      </ol>
      {model.hub ? (
        <p className="v4-flow__hub" style={{ "--v4-at": geometry.arrival[HUB] ?? 0 }}>
          <span>{model.hub.label}</span>
          <strong>{model.hub.value}</strong>
        </p>
      ) : null}
    </div>
  );
}

/* A labelled rule that hands the signal from one section to the next. */
export function SignalRule({ label }) {
  return (
    <div className="v4-signal-rule" data-v4-signal-rule="">
      <span>{label}</span>
      <i aria-hidden="true" />
    </div>
  );
}
