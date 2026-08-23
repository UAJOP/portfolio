/**
 * Status / category / tech chip.
 *
 * `tone` maps to a semantic token set rather than a color, so a status keeps its
 * meaning in both themes. `dot` adds a leading indicator for live-status chips.
 */
export default function Badge({ tone = "neutral", tech = false, dot = false, children }) {
  const classes = [
    "v3-badge",
    tone !== "neutral" ? `v3-badge--${tone}` : "",
    tech ? "v3-badge--tech" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {dot ? <span className="v3-badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
