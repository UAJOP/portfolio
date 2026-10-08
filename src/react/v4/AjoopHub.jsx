/* V4 Living AJOOP Hub (/ajoop/).
 *
 * A presentation of the public Ajoop shell, not a second assistant: the
 * transcript, the action row and the composer are the shell's own elements
 * (src/react/production/AjoopShell.jsx), handed in and placed here. This
 * component adds only what a page surface needs around them — an identity and
 * status rail, and a context surface — and it draws nothing it was not told.
 *
 * Everything that looks alive is state the engine reported through its
 * presentation port: the mascot's state, the service verdict, whether a turn
 * is in flight and where it is (`turn.phase`), and how the last one settled,
 * including the evidence already shown in that answer. No state is inferred
 * from time, and nothing here animates while the engine is at rest. */

/* The one live state the Hub shows, from what the engine reported. A turn in
 * flight outranks the composer; a settled turn stays on screen until the next
 * one starts or the visitor begins to type. */
export function liveStateOf({ mascot, turn }) {
  if (turn?.phase === "checking" || turn?.phase === "reading") return "retrieving";
  if (turn?.phase === "preparing") return "responding";
  if (mascot?.state === "listening") return "composing";
  if (turn?.phase === "unavailable") return "error";
  if (turn?.phase === "completed" || turn?.phase === "partial") {
    if (turn.assistFailed) return "fallback";
    if (turn.provenance && turn.evidence?.length) return "grounded";
    return "answered";
  }
  return "idle";
}

/* The path a public turn takes, and which of its stages each state lights. */
const PATH = ["visitor", "ajoop", "evidence", "answer"];
const LIT = {
  idle: [],
  composing: ["visitor"],
  retrieving: ["visitor", "ajoop", "evidence"],
  responding: ["visitor", "ajoop", "answer"],
  grounded: ["ajoop", "evidence", "answer"],
  answered: ["ajoop", "answer"],
  fallback: ["ajoop", "answer"],
  error: ["ajoop"],
};

export default function AjoopHub({ model, copy, mascot, mascotState, service, turn, busy, widgetRef, panelRef, transcript, actionRow, composer }) {
  const { labels } = model;
  const live = liveStateOf({ mascot: mascotState, turn });
  const lit = LIT[live];
  const settled = turn && (turn.phase === "completed" || turn.phase === "partial") ? turn : null;
  const evidence = settled?.evidence || [];
  return (
    <section className="v4-hub section-shell" data-portfolio-chatbot="" data-v4-hub="" data-v4-live={live} aria-labelledby="ajoop-dialog-title" ref={widgetRef}>
      <aside className="v4-hub__rail" aria-label={labels.identity}>
        <div className="v4-hub__identity">
          {mascot}
          <div>
            <h2 id="ajoop-dialog-title" data-chatbot-title="">{copy.title}</h2>
            <p data-chatbot-subtitle="">{copy.subtitle}</p>
          </div>
        </div>
        {/* The live state, in words; the engine's own service verdict under it. */}
        <p className="v4-hub__state" role="status">
          <span className="v4-state" data-v4-hub-state={live}>{labels.state[live]}</span>
        </p>
        <p className="chatbot-service v4-hub__service" data-chatbot-bridge="" role="status" hidden={!service.state} data-ajoop-service={service.state || undefined}>
          <span className="chatbot-service-dot" aria-hidden="true" />
          <span data-chatbot-bridge-text="">{service.label}</span>
        </p>
        <div className="v4-hub__scope">
          <h3>{labels.scopeHeading}</h3>
          <ul className="v4-ports">
            {labels.scope.map((item) => <li key={item} className="v4-node"><i className="v4-node__dot" aria-hidden="true" />{item}</li>)}
          </ul>
          <ul className="v4-hub__bounds">
            {labels.bounds.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <a className="v4-hub__how" href={model.caseStudy.href}>{model.caseStudy.label}</a>
      </aside>

      <div className="v4-hub__field" data-chatbot-panel="" role="group" aria-label={labels.conversation} tabIndex={-1} ref={panelRef}>
        {transcript}
        {actionRow}
        {composer}
        {/* Shown only until a handler owns the composer (never, without JavaScript). */}
        <p className="v4-hub__static">{labels.unavailable}</p>
      </div>

      <aside className="v4-hub__context" aria-label={labels.context}>
        <div className="v4-hub__path">
          <h3>{labels.pathHeading}</h3>
          <ol aria-busy={String(Boolean(busy))}>
            {PATH.map((stage) => (
              <li key={stage} className="v4-node" data-v4-stage={stage} data-v4-state={lit.includes(stage) ? (live === "error" ? "error" : "active") : undefined}>
                <i className="v4-node__dot" aria-hidden="true" />
                <span>{labels.path[stage]}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="v4-hub__evidence" data-v4-evidence={evidence.length ? "" : undefined}>
          <h3>{labels.evidenceHeading}</h3>
          {evidence.length ? (
            <>
              <p className="v4-hub__provenance">{settled.provenance === "ai" ? labels.provenance.ai : labels.provenance.evidence}</p>
              <ul>
                {evidence.map((item) => (
                  <li key={`${item.title}:${item.url}`}>
                    {item.url
                      ? <a className="v4-node" href={item.url}><i className="v4-node__dot" aria-hidden="true" /><span>{item.title}</span></a>
                      : <span className="v4-node"><i className="v4-node__dot" aria-hidden="true" /><span>{item.title}</span></span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="v4-hub__empty">{settled?.general ? labels.evidenceGeneral : labels.evidenceEmpty}</p>
          )}
          {settled?.assistFailed ? <p className="v4-hub__note">{labels.assistFailed}</p> : null}
          {live === "error" ? <p className="v4-hub__note">{labels.failed}</p> : null}
        </div>
      </aside>
      {/* No launcher and no toggle: with neither in the document the engine's
          open/close requests are no-ops here, before and after hydration, so
          nothing can hide the Hub the way it would close a dialog. */}
    </section>
  );
}
