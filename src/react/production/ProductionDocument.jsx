import ProductionMain from "./ProductionMain.jsx";
import RecruiterMode from "./RecruiterMode.jsx";
import AjoopShell from "./AjoopShell.jsx";
import CommandPalette from "./CommandPalette.jsx";

/* Routes that consume V4 primitives, by page type, and the composition
 * stylesheet each one loads with the motion runtime. Every other route ships
 * neither. */
const V4_ROUTES = new Map([["home", "home"], ["works", "works"], ["caseStudy", "detail"], ["blog", "experience"], ["certificates", "certificates"], ["about", "about"], ["ajoop", "ajoop"], ["mergeRush", "merge-rush"]]);

/* Every route takes part in cross-document view transitions (css/v4-system.css,
 * 24). One the browser skips rejects its promises on the page being left and
 * on the page arriving, before any deferred script runs; that is the fallback
 * working, so both ends are answered here, in the head of every document. */
/* The opt-in, inline and first, so it is known before the page is revealed. */
const V4_TRANSITION = "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:auto}}";
const V4_REVEAL = '["pageswap","pagereveal"].forEach(function(n){addEventListener(n,function(e){var t=e.viewTransition;t&&[t.ready,t.finished,t.updateCallbackDone].forEach(function(p){p&&p.catch&&p.catch(function(){})})})});';
const V4_NO_JS = "[data-jds-enter],[data-afp-play],.afp-hub,[data-ca-enter],.ca-poster,.adventure-canvas-wrap,.adventure-side .detail-panel:last-child{display:none!important}.v4-ajoop-sys__panels [hidden]{display:block!important}.v4-ajoop-sys__rest{display:none!important}";
const CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://cloud.umami.is; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://ajoop.kaanbalci.com https://cloud.umami.is https://script.google.com; form-action 'self' mailto: https://script.google.com https://docs.google.com; frame-src https://docs.google.com https://drive.google.com; upgrade-insecure-requests";
const SOCIAL_IMAGE_DIMENSIONS = new Map([
  ["portfolio_website_cover.webp", [1846, 927]],
  ["sinama-social-cover.png", [1200, 630]],
  ["ajoop-living-hub-1600.webp", [1600, 900]],
  ["hospital-system-patient-workflow.webp", [1557, 905]],
  ["ai-flow-puzzle.webp", [1280, 800]],
  ["career-adventure.webp", [1280, 800]],
  ["joyday-action-painting.webp", [1280, 800]],
  ["joyday-brand-logo.webp", [1600, 703]],
  ["my-museum-login-screen.png", [1080, 2340]],
  ["agency-db-er-diagram.png", [1800, 1100]],
  ["cars-price-distribution.png", [1774, 1231]],
]);
const socialImageDimensions = (url) => SOCIAL_IMAGE_DIMENSIONS.get(String(url || "").split("/").pop()) || [];

function ProductionHead({ head, page, v4Styles = [] }) {
  const [socialWidth, socialHeight] = socialImageDimensions(head.og.image);
  const socialUrl = head.og.url || head.canonical;
  const socialAlt = head.og.imageAlt || (head.og.image && head.og.title ? `${head.og.title} preview` : null);
  const twitter = {
    card: head.twitter.card || (head.og.image ? "summary_large_image" : null),
    title: head.twitter.title || head.og.title,
    description: head.twitter.description || head.og.description,
    image: head.twitter.image || head.og.image,
    imageAlt: head.twitter.imageAlt || socialAlt,
  };
  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="Content-Security-Policy" content={CONTENT_SECURITY_POLICY} />
      <meta name="referrer" content="strict-origin-when-cross-origin" />
      <style>{V4_TRANSITION}</style>
      <noscript><style>{V4_NO_JS}</style></noscript>
      <meta name="description" content={head.description} />
      {head.keywords ? <meta name="keywords" content={head.keywords} /> : null}
      <meta name="author" content="Kaan Balcı" />
      <title>{head.title}</title>
      <meta name="theme-color" content="#07111f" />
      {head.canonical ? <link rel="canonical" href={head.canonical} /> : null}
      {(head.alternates || []).map((link) => <link key={link.hrefLang} rel="alternate" hrefLang={link.hrefLang} href={link.href} />)}
      <meta name="robots" content={head.robots || "index, follow"} />
      {head.og.siteName ? <meta property="og:site_name" content={head.og.siteName} /> : null}
      {head.og.locale ? <meta property="og:locale" content={head.og.locale} /> : null}
      {head.og.title ? <meta property="og:title" content={head.og.title} /> : null}
      {head.og.description ? <meta property="og:description" content={head.og.description} /> : null}
      {head.og.type ? <meta property="og:type" content={head.og.type} /> : null}
      {socialUrl ? <meta property="og:url" content={socialUrl} /> : null}
      {head.og.image ? <meta property="og:image" content={head.og.image} /> : null}
      {head.og.imageWidth || socialWidth ? <meta property="og:image:width" content={head.og.imageWidth || socialWidth} /> : null}
      {head.og.imageHeight || socialHeight ? <meta property="og:image:height" content={head.og.imageHeight || socialHeight} /> : null}
      {socialAlt ? <meta property="og:image:alt" content={socialAlt} /> : null}
      {twitter.card ? <meta name="twitter:card" content={twitter.card} /> : null}
      {twitter.title ? <meta name="twitter:title" content={twitter.title} /> : null}
      {twitter.description ? <meta name="twitter:description" content={twitter.description} /> : null}
      {twitter.image ? <meta name="twitter:image" content={twitter.image} /> : null}
      {twitter.imageAlt ? <meta name="twitter:image:alt" content={twitter.imageAlt} /> : null}
      <script>{head.themeBootstrap}</script>
      <script src="/js/core/locale-bootstrap.js" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" />
      <link rel="stylesheet" href="/css/boxicons-subset.css" />
      <link rel="stylesheet" href="/style.css" />
      <link rel="stylesheet" href="/css/a11y.css" />
      {(head.extraStyles || []).map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <link rel="stylesheet" href="/portfolio-v2.css" />
      {/* V4 layer: the shared system on every route, compositions per route. */}
      <link rel="stylesheet" href="/css/v4-system.css" />
      {V4_ROUTES.has(page) ? <link rel="stylesheet" href={`/css/v4-${V4_ROUTES.get(page)}.css`} /> : null}
      {v4Styles.map((name) => <link key={name} rel="stylesheet" href={`/css/v4-${name}.css`} />)}
      <script>{V4_REVEAL}</script>
      <link rel="icon" type="image/x-icon" href="/assets/KAAN BALCI-KÜÇÜK LOGO PNG.ico" />
      {head.jsonLd ? <script type="application/ld+json">{JSON.stringify(head.jsonLd)}</script> : null}
    </head>
  );
}

function ProductionHeader({ page, shell }) {
  const { text } = shell;
  return (
    <>
      <a className="skip-link" href="#main-content">{text.skipToContent}</a>
      <header className="site-header">
        <a className="brand" href={shell.homeHref} aria-label={text.brandHomeAria}>
          <img src="/assets/kaan-balci-logo-128.webp" alt={text.brandLogoAlt} width="128" height="128" />
          <span>{shell.name}</span>
        </a>
        <a className="availability-badge" data-availability-badge="" href={shell.email} aria-label={text.availabilityAria}>
          <span />
          <strong>{shell.availability}</strong>
        </a>
        <nav className="nav-links" data-nav="" id="site-navigation" aria-label={text.primaryNavAria}>
          {shell.nav.map((item) => <a key={item.id} className={item.id === page ? "selected" : undefined} aria-current={item.id === page ? "page" : undefined} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="header-actions">
          <button className="recruiter-toggle" data-recruiter-toggle="" type="button" title={text.recruiterTitle} aria-label={text.recruiterOpenAria}>
            <i className="bx bx-briefcase-alt-2" />
            <span data-recruiter-label="">{text.recruiterLabel}</span>
          </button>
          <button className="command-toggle" data-command-toggle="" type="button" title={text.commandLabel} aria-label={text.commandLabel}>
            <i className="bx bx-search" />
            <span data-command-label="">{text.commandLabel}</span>
          </button>
          <div className="lang-switch" role="group" aria-label={text.languageSelectorAria}>
            <button className="active" data-lang-switch="en" type="button">EN</button>
            <button data-lang-switch="tr" type="button">TR</button>
          </div>
          <button className="theme-toggle" data-theme-toggle="" data-message-aria-label-key={shell.bindings.themeSwitchToLight} data-message-title-key={shell.bindings.themeSwitchToLight} type="button" title={text.themeSwitchToLight} aria-label={text.themeSwitchToLight}>
            <i className="bx bx-moon" />
            <span data-theme-label="" data-message-key={shell.bindings.themeDark}>{text.themeDark}</span>
          </button>
          <button className="nav-toggle" type="button" aria-label={text.navOpen} aria-controls="site-navigation" aria-expanded="false">
            <span />
            <span />
          </button>
        </div>
      </header>
    </>
  );
}

function ProductionFooter({ shell }) {
  const { text } = shell;
  return (
    <footer className="site-footer">
      <div className="footer-inner section-shell">
        <div>
          <a className="footer-brand" href={shell.homeHref}>
            <img src="/assets/kaan-balci-logo-128.webp" alt={text.brandLogoAlt} width="128" height="128" />
            <span>{shell.name}</span>
          </a>
          <p data-pv2-en={shell.footerCompat.en} data-pv2-tr={shell.footerCompat.tr}>{text.footerTagline}</p>
        </div>
        <div className="footer-socials" role="group" aria-label={text.footerSocialAria}>
          {shell.socialLinks.map((item) => (
            <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer" title={item.title} aria-label={item.label}>
              <i className={item.icon} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
      <p className="copyright">© <span data-year="" /> {text.footerRights} <a href={shell.privacyHref}>{text.footerPrivacy}</a></p>
    </footer>
  );
}

export default function ProductionDocument({ document, head, main, recruiter, ajoop, commandPalette, shell }) {
  const payload = JSON.stringify(main).replaceAll("<", "\\u003c");
  const recruiterPayload = JSON.stringify(recruiter).replaceAll("<", "\\u003c");
  const ajoopPayload = JSON.stringify(ajoop).replaceAll("<", "\\u003c");
  const commandPayload = JSON.stringify(commandPalette).replaceAll("<", "\\u003c");
  const ajoopRoot = <div id="react-ajoop-root" data-react-ajoop-shell="react" data-prerendered="true"><AjoopShell model={ajoop} /></div>;
  return (
    <html lang={document.htmlLang} dir={document.dir} data-route-locale={document.routeLocaleFromPath ? undefined : document.locale} data-route-locale-from-path={document.routeLocaleFromPath ? "" : undefined}>
      <ProductionHead head={head} page={document.page} v4Styles={document.v4Styles} />
      <body className={document.bodyClass || undefined} data-page={document.page} data-project-slug={document.projectSlug || undefined}>
        <ProductionHeader page={document.navPage || document.page} shell={shell} />
        <main id="main-content" tabIndex="-1" data-react-main="" data-prerendered="true" {...(document.mainAttributes || {})}><ProductionMain {...main} /></main>
        {document.afterMain?.length ? <ProductionMain page={`${main.page}:after-main`} structure={document.afterMain} /> : null}
        {/* On the Hub route the shell is the page's conversation surface, so
            its root sits with the content rather than after the footer. */}
        {document.hub ? ajoopRoot : null}
        <div id="react-recruiter-root" data-react-recruiter-owner="react" data-prerendered="true"><RecruiterMode model={recruiter} /></div>
        <ProductionFooter shell={shell} />
        {document.hub ? null : ajoopRoot}
        <div id="react-command-root" data-react-command-owner="react" data-prerendered="true"><CommandPalette model={commandPalette} /></div>
        {(document.leadScripts || []).map((src) => <script key={src} src={src} />)}
        <script src="/portfolio-data.js" />
        <script src="/script.js" />
        <script src="/portfolio-v2.js" />
        {(document.scripts || []).map((src) => <script key={src} src={src} />)}
        <script id="react-main-props" type="application/json">{payload}</script>
        <script id="react-recruiter-props" type="application/json">{recruiterPayload}</script>
        <script id="react-ajoop-props" type="application/json">{ajoopPayload}</script>
        <script id="react-command-props" type="application/json">{commandPayload}</script>
        {V4_ROUTES.has(document.page) ? <script src="/js/v4/runtime.js" defer /> : null}
        <script type="module" src={`/${document.clientEntry}`} />
      </body>
    </html>
  );
}
