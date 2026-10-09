/* V4-E06.5 — the case studies this phase adds or brings up to date.
 *
 *   /career-adventure-case-study/   new: the drop-and-merge game and its rewrite
 *   /portfolio-case-study/          new: kaanbalci.com itself
 *   /ai-flow-puzzle-case-study/     one added section: what the V4 game changed
 *   /atolye-joyday-case-study/      one added section: the Action Painting studio
 *
 * Everything is built at build time from the message catalog. The facts are
 * the ones the repository already records: docs/v4-e06-3-career-adventure.md
 * (rules, numbers, strategy runs), docs/v4-e06-2-ai-flow-puzzle.md, and the
 * build itself. Nothing here states a visitor count, a rating or a benchmark,
 * and the portfolio case study says in so many words that the owner cockpit
 * is not built.
 *
 * The two added sections follow the accepted #29 pages; those pages' own
 * copy is not touched. */

export const CAREER_CASE_ROUTE = "careerAdventureCaseStudy";
export const PORTFOLIO_CASE_ROUTE = "portfolioCaseStudy";
export const V4_NATIVE_CASE_ROUTES = new Set([CAREER_CASE_ROUTE, PORTFOLIO_CASE_ROUTE]);

const text = (value) => ({ type: "text", value: String(value) });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => (typeof value === "string" ? text(value) : value)),
});

const heading = (eyebrow, title, body = null) => element("div", { class: "case-section-heading" }, [
  element("p", { class: "eyebrow" }, [eyebrow]),
  element("h2", {}, [title]),
  body ? element("p", {}, [body]) : null,
]);
const section = (children) => element("section", { class: "case-section section-shell" }, children);
const card = (title, body) => element("article", { class: "case-service-card" }, [element("h3", {}, [title]), element("p", {}, [body])]);
const cards = (items) => element("div", { class: "case-service-grid" }, items.map(([title, body]) => card(title, body)));
const meta = (label, value) => element("div", {}, [element("dt", {}, [label]), element("dd", {}, [value])]);
const proof = (value, label) => element("article", { class: "case-proof" }, [element("strong", {}, [value]), element("span", {}, [label])]);
const shot = (value, label) => element("article", {}, [element("strong", {}, [value]), element("span", {}, [label])]);
const panel = (children) => element("article", { class: "case-panel case-copy" }, children);
const action = (href, label, variant = "ghost", external = false) => element("a", { class: `btn ${variant}`, href, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, [label]);

function hero({ eyebrow, note, title, lead, facts, stack, actions, image }) {
  return element("section", { class: "case-hero section-shell" }, [
    element("div", {}, [
      element("p", { class: "eyebrow" }, [eyebrow]),
      element("div", { class: "case-status-note" }, [element("i", { class: "bx bx-joystick", "aria-hidden": "true" }), element("span", {}, [note])]),
      element("h1", {}, [title]),
      element("p", { class: "case-hero-lead" }, [lead]),
      element("dl", { class: "case-meta-grid" }, facts.map(([label, value]) => meta(label, value))),
      element("div", { class: "case-stack" }, stack.map((item) => element("span", {}, [item]))),
      element("div", { class: "case-actions" }, actions),
    ]),
    element("figure", { class: "case-hero-visual" }, [element("img", { ...image, decoding: "async", fetchpriority: "high" })]),
  ]);
}

function closing(eyebrow, title, actions) {
  return element("section", { class: "section-shell contact-hub reveal" }, [
    element("div", {}, [element("p", { class: "eyebrow" }, [eyebrow]), element("h2", {}, [title])]),
    element("div", { class: "contact-actions" }, actions),
  ]);
}

/* ---------- /career-adventure-case-study/ ---------- */

export function careerAdventureCaseStructure({ message, href }) {
  const c = (key) => message(`career.case.${key}`);
  return [
    hero({
      eyebrow: message("mergeRush.hero.eyebrow"),
      note: c("statusNote"),
      title: "Career Adventure",
      lead: c("lead"),
      facts: [
        [message("mergeRush.play.facts.statusLabel"), message("catalog.status.playable")],
        [message("mergeRush.case.yearLabel"), "2026"],
        [message("mergeRush.case.roleLabel"), message("mergeRush.case.role")],
        [message("mergeRush.case.hostsLabel"), c("hosts")],
      ],
      stack: ["Vanilla JavaScript", "Canvas 2D", "Web Audio", "Node.js"],
      actions: [action(href("/adventure/"), message("adventure.play.enter"), "primary"), action(href("/games/"), message("mergeRush.cta.gamePortfolio"))],
      image: { src: "/assets/kaanin_kariyer_cover.webp", alt: c("coverAlt"), width: "1920", height: "1072" },
    }),
    element("section", { class: "case-proof-strip is-four section-shell", "aria-label": c("proof.aria") }, [
      proof("13", c("proof.objects")), proof("120", c("proof.steps")), proof("500", c("proof.runs")), proof("5", c("proof.locales")),
    ]),
    section([
      heading(c("concept.eyebrow"), c("concept.title")),
      element("div", { class: "case-split" }, [
        panel([element("p", {}, [c("concept.p1")]), element("p", {}, [c("concept.p2")])]),
        panel([element("p", { class: "eyebrow" }, [c("goal.eyebrow")]), element("h3", {}, [c("goal.title")]), element("p", {}, [c("goal.body")])]),
      ]),
    ]),
    section([
      heading(c("engine.eyebrow"), c("engine.title")),
      cards(["step", "rest", "pure", "replay"].map((key) => [c(`engine.${key}.title`), c(`engine.${key}.body`)])),
    ]),
    section([
      heading(c("difficulty.eyebrow"), c("difficulty.title"), c("difficulty.body")),
      element("div", { class: "qa-proof-grid" }, [
        shot("0 / 400", c("difficulty.single")), shot("0 / 200", c("difficulty.edges")), shot("0 / 200", c("difficulty.random")),
        shot("0 / 200", c("difficulty.bad")), shot("5 / 16", c("difficulty.ahead")), shot("10 / 16", c("difficulty.tools")),
      ]),
      element("p", { class: "case-private-note" }, [c("difficulty.note")]),
    ]),
    section([
      heading(c("rules.eyebrow"), c("rules.title")),
      cards(["over", "score", "tools", "win"].map((key) => [c(`rules.${key}.title`), c(`rules.${key}.body`)])),
    ]),
    section([heading(c("shell.eyebrow"), c("shell.title"), c("shell.body"))]),
    section([
      heading(message("mergeRush.status.eyebrow"), c("status.title")),
      element("div", { class: "case-split" }, [
        panel([element("h3", {}, [c("status.doneLabel")]), element("p", {}, [c("status.done")])]),
        panel([element("h3", {}, [message("mergeRush.status.refining.title")]), element("p", {}, [c("status.open")])]),
      ]),
    ]),
    closing(message("portfolio.label.roleEvidence"), c("cta.title"), [
      action(href("/adventure/"), message("adventure.play.enter"), "primary"),
      action(href("/games/"), message("shell.nav.games")),
      action(href("/merge-rush-case-study/"), "Merge Rush"),
    ]),
  ];
}

/* ---------- /portfolio-case-study/ ---------- */

export function portfolioCaseStructure({ message, href, repositoryCount }) {
  const c = (key) => message(`portfolio.case.${key}`);
  return [
    hero({
      eyebrow: c("eyebrow"),
      note: c("statusNote"),
      title: "kaanbalci.com",
      lead: c("lead"),
      facts: [
        [message("mergeRush.play.facts.statusLabel"), message("catalog.status.live")],
        [message("mergeRush.case.yearLabel"), "2026"],
        [message("mergeRush.case.roleLabel"), c("role")],
        [c("hostingLabel"), c("hosting")],
      ],
      stack: ["React 19", "Vite", "Static prerender", "Vanilla JavaScript", "Node.js build", "Puppeteer"],
      actions: [action(href("/works/"), message("home.hero.viewWork"), "primary"), action("https://github.com/UAJOP/portfolio", "GitHub", "ghost", true)],
      image: { src: "/assets/portfolio_website_cover.webp", alt: c("coverAlt") },
    }),
    element("section", { class: "case-proof-strip is-four section-shell", "aria-label": c("proof.aria") }, [
      proof("5", c("proof.locales")), proof("4", c("proof.games")), proof(String(repositoryCount), c("proof.repos")), proof("0", c("proof.servers")),
    ]),
    section([
      heading(c("evolution.eyebrow"), c("evolution.title")),
      element("div", { class: "case-split" }, [
        panel([element("p", {}, [c("evolution.p1")]), element("p", {}, [c("evolution.p2")])]),
        panel([element("p", { class: "eyebrow" }, [c("why.eyebrow")]), element("h3", {}, [c("why.title")]), element("p", {}, [c("why.body")])]),
      ]),
    ]),
    section([
      heading(c("arch.eyebrow"), c("arch.title")),
      cards(["registry", "prerender", "locales", "runtimes"].map((key) => [c(`arch.${key}.title`), c(`arch.${key}.body`)])),
    ]),
    section([heading(c("connected.eyebrow"), c("connected.title"), c("connected.body"))]),
    section([
      heading(c("products.eyebrow"), c("products.title")),
      cards([
        ["Joyday Action Painting", c("products.joyday")],
        ["AI Flow Puzzle", c("products.flow")],
        ["Career Adventure", c("products.career")],
        ["Merge Rush: Tiny Factory", c("products.merge")],
      ]),
    ]),
    section([heading(c("ajoop.eyebrow"), c("ajoop.title"), c("ajoop.body"))]),
    section([
      heading(c("reliability.eyebrow"), c("reliability.title")),
      cards(["nojs", "motion", "gates", "worktree"].map((key) => [c(`reliability.${key}.title`), c(`reliability.${key}.body`)])),
    ]),
    section([heading(c("privacy.eyebrow"), c("privacy.title"), c("privacy.body"))]),
    section([
      heading(message("mergeRush.status.eyebrow"), c("status.title")),
      element("div", { class: "case-split" }, [
        panel([element("h3", {}, [c("status.doneLabel")]), element("p", {}, [c("status.done")])]),
        panel([element("h3", {}, [message("mergeRush.status.refining.title")]), element("p", {}, [c("status.open")])]),
      ]),
    ]),
    closing(message("portfolio.label.roleEvidence"), c("cta.title"), [
      action(href("/works/"), message("home.hero.viewWork"), "primary"),
      action(href("/ajoop-case-study/"), "AJOOP"),
      action(href("/games/"), message("shell.nav.games")),
    ]),
  ];
}

/* ---------- sections added to accepted case studies ---------- */

/** Inserted before a case study's closing section. */
export function withAddedSection(children, added) {
  const index = children.map((node) => node.type === "element" && String(node.attributes.find((entry) => entry.name === "class")?.value || "").split(/\s+/).includes("contact-hub")).lastIndexOf(true);
  if (index === -1) return [...children, added];
  return [...children.slice(0, index), added, ...children.slice(index)];
}

export function aiFlowV4Section({ message }) {
  const c = (key) => message(`aiFlow.case.v4.${key}`);
  return section([
    heading(c("eyebrow"), c("title")),
    cards(["ports", "diagnostics", "scoring", "board", "missions", "phone"].map((key) => [c(`${key}.title`), c(`${key}.body`)])),
  ]);
}

export function joydayPaintSection({ message, href }) {
  const c = (key) => message(`joyday.case.paint.${key}`);
  return section([
    heading(c("eyebrow"), c("title"), c("body")),
    element("div", { class: "case-actions" }, [action(href("/joyday-paint/"), c("open"), "primary")]),
  ]);
}

/** Heads of the two native case studies, from their canonical per-locale meta. */
export function nativeCaseHead({ meta, canonical, origin, alternates, htmlLang, ogLocale, authorName, themeBootstrap, image }) {
  if (!meta?.title || !meta?.description) throw new Error("native case study: missing canonical meta");
  return {
    title: meta.title, description: meta.description, keywords: null, canonical, robots: "index, follow",
    alternates,
    og: { siteName: "Kaan Balcı Portfolio", locale: ogLocale, title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, type: "article", url: canonical, image },
    twitter: { card: "summary_large_image", title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, image },
    themeBootstrap,
    jsonLd: {
      "@context": "https://schema.org", "@type": "WebPage", name: meta.title, description: meta.description, url: canonical,
      inLanguage: htmlLang, image,
      isPartOf: { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: `${origin}/` },
      author: { "@type": "Person", name: authorName, url: `${origin}/` },
    },
    extraStyles: ["/case-study.css"],
  };
}
