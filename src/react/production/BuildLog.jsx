const STATUS_LABELS = {
  shipped: "Shipped",
  building: "Building",
  integration: "Integration",
};

/** Reusable static-first Build Log renderer. Identity, order, dates, status and
 * localized descriptions arrive from the canonical build-log model. */
export default function BuildLog({ entries, limit = entries.length }) {
  return entries.slice(0, limit).map((entry) => (
    <article className="build-log-item" key={entry.id}>
      <time dateTime={entry.date}>{entry.date}</time>
      <div>
        <div className="build-log-meta">
          <span>{entry.area}</span>
          <span className={`build-log-status is-${entry.status}`}>{STATUS_LABELS[entry.status] || entry.status}</span>
        </div>
        <h3>{entry.title}</h3>
        <p>{entry.detail}</p>
      </div>
    </article>
  ));
}
