/**
 * Eyebrow + heading + optional lead paragraph.
 *
 * `level` controls the heading ELEMENT, `size` controls its appearance. They are
 * separate on purpose: document outline is a semantics decision and must not be
 * driven by how large the heading should look on a given page.
 *
 * `id` is forwarded to the heading so a section can be labelled with
 * aria-labelledby.
 */
export default function SectionHeading({
  eyebrow,
  title,
  lead,
  level = 2,
  size,
  id,
  className = "",
}) {
  const Heading = `h${level}`;
  const appearance = size || (level === 1 ? "v3-h1" : level === 2 ? "v3-h2" : "v3-h3");

  return (
    <div className={["v3-section-heading", className].filter(Boolean).join(" ")}>
      {eyebrow ? <p className="v3-eyebrow">{eyebrow}</p> : null}
      <Heading className={appearance} id={id}>
        {title}
      </Heading>
      {lead ? <p className="v3-section-heading__lead">{lead}</p> : null}
    </div>
  );
}
