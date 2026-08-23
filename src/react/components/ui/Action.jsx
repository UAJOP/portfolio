import { Link } from "react-router-dom";

/**
 * The system's single call-to-action component.
 *
 * It renders whichever element is semantically correct and never fakes one:
 *
 *   to       -> react-router <Link>   (in-app navigation)
 *   href     -> <a>                   (external or non-router destination)
 *   onClick  -> <button>              (an action, not a destination)
 *
 * That rule is why the design system has no `div role="button"` anywhere: there
 * is no variant of this component that produces one.
 *
 * External links get `rel="noopener noreferrer"` automatically whenever they
 * open in a new tab, so a caller cannot forget it.
 */
export default function Action({
  to,
  href,
  onClick,
  variant = "secondary",
  external = false,
  arrow = false,
  className = "",
  children,
  ...rest
}) {
  const classes = ["v3-action", `v3-action--${variant}`, "v3-transition-colors", className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {children}
      {arrow ? (
        <svg className="v3-action__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d="M3 8h9M8.5 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link className={classes} to={to} {...rest}>
        {content}
      </Link>
    );
  }

  if (href) {
    const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
    return (
      <a className={classes} href={href} {...externalProps} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button className={classes} type="button" onClick={onClick} {...rest}>
      {content}
    </button>
  );
}
