/** Constrains content to the system's measure and applies the page gutter. */
export default function Container({ narrow = false, as: Tag = "div", className = "", children }) {
  const classes = ["v3-container", narrow ? "v3-container--narrow" : "", className]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}
