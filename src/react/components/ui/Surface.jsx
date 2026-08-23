/**
 * The system's card. Depth comes from tokens, so the same component reads
 * correctly against both the dark and the light canvas.
 *
 * `interactive` only adds hover affordance styling; it does not make the surface
 * clickable. A card that navigates must contain a real anchor.
 */
export default function Surface({
  variant = "default",
  padding = "md",
  interactive = false,
  accented = false,
  as: Tag = "div",
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "v3-surface",
    variant !== "default" ? `v3-surface--${variant}` : "",
    padding === "lg" ? "v3-surface--padded-lg" : padding === "none" ? "" : "v3-surface--padded",
    interactive ? "v3-surface--interactive v3-transition-surface" : "",
    accented ? "v3-surface--accented" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
