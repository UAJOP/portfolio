/* V4 AJOOP routes: the Living AJOOP Hub (/ajoop/) and the AJOOP case study
 * (/ajoop-case-study/).
 *
 * Both pages are built here, at build time, from the message catalog and the
 * portfolio's own public-safe record of AJOOP
 * (data/portfolio/ajoop-master-knowledge.json → "Ajoop Portfolio Copilot").
 * Nothing on either page states a number, a benchmark, a usage figure or a
 * capability the public assistant does not have; the owner-only tools appear
 * once, outside the public path, exactly as the Privacy Policy already
 * describes them. */

const text = (value) => ({ type: "text", value: String(value) });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => (typeof value === "string" ? text(value) : value)),
});
const two = (value) => String(value).padStart(2, "0");

/* ---------- /ajoop/ ---------- */

/** The Hub's own hero: identity and context that exist without JavaScript. */
export function ajoopHubStructure({ message, links }) {
  return [
    element("section", { class: "page-hero section-shell" }, [
      element("p", { class: "eyebrow" }, [message("ajoop.hub.eyebrow")]),
      element("h1", {}, [message("ajoop.hub.title")]),
      element("p", {}, [message("ajoop.hub.lead")]),
      /* Without JavaScript there is no conversation to offer; say so, and
       * point at what the assistant would have drawn on. */
      element("noscript", {}, [
        element("div", { class: "v4-hub__noscript" }, [
          element("p", {}, [message("ajoop.hub.noscript")]),
          element("ul", {}, links.map((link) => element("li", {}, [element("a", { href: link.href }, [link.label])]))),
        ]),
      ]),
    ]),
  ];
}

/** What the Hub presentation of the shell needs beyond the shell's own copy. */
export function ajoopHubModel({ message, caseStudyHref }) {
  const states = ["idle", "composing", "retrieving", "responding", "grounded", "answered", "fallback", "error"];
  return {
    caseStudy: { href: caseStudyHref, label: message("ajoop.hub.how") },
    labels: {
      identity: message("ajoop.hub.aria.identity"),
      conversation: message("ajoop.hub.aria.conversation"),
      context: message("ajoop.hub.aria.context"),
      unavailable: message("ajoop.hub.loading"),
      state: Object.fromEntries(states.map((state) => [state, message(`ajoop.hub.state.${state}`)])),
      scopeHeading: message("ajoop.hub.scope.heading"),
      scope: ["projects", "experience", "skills", "certificates", "contact"].map((key) => message(`ajoop.hub.scope.${key}`)),
      bounds: ["public", "live", "private"].map((key) => message(`ajoop.hub.bounds.${key}`)),
      pathHeading: message("ajoop.hub.path.heading"),
      path: { visitor: message("ajoop.hub.path.visitor"), ajoop: "AJOOP", evidence: message("ajoop.hub.path.evidence"), answer: message("ajoop.hub.path.answer") },
      evidenceHeading: message("ajoop.hub.evidence.heading"),
      evidenceEmpty: message("ajoop.hub.evidence.empty"),
      evidenceGeneral: message("ajoop.hub.evidence.general"),
      provenance: { evidence: message("ajoop.hub.path.evidence"), ai: message("ajoop.hub.evidence.ai") },
      assistFailed: message("ajoop.hub.evidence.assistFailed"),
      failed: message("ajoop.hub.evidence.failed"),
    },
  };
}

/* ---------- /ajoop-case-study/ ---------- */

const SYSTEM = { width: 1100, height: 520, boundary: 372 };
/* The public path, left to right; the planner and the bridge run side by
 * side, and both read the same evidence. */
const NODES = [
  { id: "visitor", x: 90, y: 180 },
  { id: "ui", x: 262, y: 180 },
  { id: "state", x: 442, y: 180 },
  { id: "planner", x: 640, y: 92 },
  { id: "bridge", x: 640, y: 268 },
  { id: "evidence", x: 838, y: 180 },
  { id: "answer", x: 1010, y: 180 },
];
const EDGES = [["visitor", "ui"], ["ui", "state"], ["state", "planner"], ["state", "bridge"], ["planner", "evidence"], ["bridge", "evidence"], ["evidence", "answer"]];
const OWNER = { id: "owner", x: 640, y: 452 };

export function ajoopSystemModel({ message }) {
  const at = (id) => NODES.find((node) => node.id === id);
  const node = ({ id, x, y }) => ({ id, x, y, label: message(`ajoop.case.node.${id}`), body: message(`ajoop.case.node.${id}.body`) });
  return {
    aria: message("ajoop.case.arch.aria"),
    width: SYSTEM.width,
    height: SYSTEM.height,
    boundary: SYSTEM.boundary,
    labels: { public: message("ajoop.case.arch.public"), boundary: message("ajoop.case.arch.boundary"), private: message("ajoop.case.arch.private"), rest: message("ajoop.case.arch.rest") },
    nodes: NODES.map((entry) => ({ ...node(entry), links: EDGES.filter((edge) => edge.includes(entry.id)).map((edge) => edge.find((id) => id !== entry.id)) })),
    edges: EDGES.map(([from, to]) => {
      const a = at(from);
      const b = at(to);
      const mid = (a.x + b.x) / 2;
      return { from, to, d: `M${a.x} ${a.y}C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}` };
    }),
    owner: node(OWNER),
  };
}

export function ajoopCaseStudyStructure({ message, hubHref, worksHref, stack }) {
  const m = (key) => message(`ajoop.case.${key}`);
  const heading = (key, withBody = false) => element("div", { class: "case-section-heading" }, [
    element("p", { class: "eyebrow" }, [m(`${key}.eyebrow`)]),
    element("h2", {}, [m(`${key}.title`)]),
    withBody ? element("p", {}, [m(`${key}.body`)]) : null,
  ]);
  const card = (key) => element("article", { class: "case-service-card" }, [element("h3", {}, [m(`${key}.title`)]), element("p", {}, [m(`${key}.body`)])]);
  const journey = (key, steps) => element("ol", { class: "case-journey", "aria-label": m(`${key}.aria`) }, steps.map((step, index) => element("li", {}, [element("strong", {}, [two(index + 1)]), element("span", {}, [m(`${key}.${step}`)])])));
  const meta = ["status", "type", "runtime", "surfaces"];
  return [
    element("section", { class: "case-hero section-shell" }, [
      element("div", {}, [
        element("p", { class: "eyebrow" }, [m("hero.eyebrow")]),
        element("h1", {}, ["AJOOP"]),
        element("p", { class: "case-hero-lead" }, [m("hero.lead")]),
        element("dl", { class: "case-meta-grid" }, meta.map((key) => element("div", {}, [element("dt", {}, [m(`meta.${key}Label`)]), element("dd", {}, [m(`meta.${key}`)])]))),
        element("div", { class: "case-stack", role: "group", "aria-label": m("aria.stack") }, stack.map((item) => element("span", {}, [item]))),
        element("div", { class: "case-actions" }, [element("a", { class: "btn primary", href: hubHref }, [m("cta.try")])]),
      ]),
      /* Filled by the route's consumer with the live entry into the Hub. */
      element("figure", { class: "case-hero-visual", "data-v4-ajoop-entry": "" }),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("problem"),
      element("div", { class: "case-split" }, [
        element("article", { class: "case-panel case-copy" }, [element("p", {}, [m("problem.body")]), element("p", {}, [m("problem.detail")])]),
        element("article", { class: "case-panel case-copy" }, [
          element("p", { class: "eyebrow" }, [m("goal.eyebrow")]),
          element("h3", {}, [m("goal.title")]),
          element("ul", { class: "case-detail-list" }, ["natural", "grounded", "coherent", "honest"].map((key) => element("li", {}, [m(`goal.${key}`)]))),
        ]),
      ]),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("arch", true),
      /* Filled by the route's consumer with the system diagram. */
      element("div", { class: "v4-ajoop-system-slot", "data-v4-ajoop-system": "" }),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("ground"),
      element("div", { class: "case-service-grid" }, ["canonical", "retrieval", "cards", "validated"].map((key) => card(`ground.${key}`))),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("flow"),
      journey("flow", ["step1", "step2", "step3", "step4", "step5"]),
      element("div", { class: "case-split case-section-support" }, ["memory", "shared"].map((key) => element("article", { class: "case-panel" }, [element("h3", {}, [m(`flow.${key}.title`)]), element("p", { class: "case-muted" }, [m(`flow.${key}.body`)])]))),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("safe"),
      element("div", { class: "case-service-grid" }, ["boundary", "live", "restricted", "fallback", "internal"].map((key) => card(`safe.${key}`))),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("evo"),
      journey("evo", ["step1", "step2", "step3", "step4"]),
      element("p", { class: "case-muted v4-ajoop-note" }, [m("evo.body")]),
    ]),
    element("section", { class: "case-section section-shell" }, [
      heading("decide"),
      element("div", { class: "case-service-grid" }, ["once", "secrets", "boring"].map((key) => card(`decide.${key}`))),
    ]),
    element("section", { class: "section-shell contact-hub v4-ajoop-live" }, [
      element("div", {}, [
        element("p", { class: "eyebrow" }, [m("live.eyebrow")]),
        element("h2", {}, [m("live.title")]),
        element("p", {}, [m("live.body")]),
      ]),
      element("div", { class: "contact-actions" }, [
        element("a", { class: "btn primary", href: hubHref, "data-v4-magnetic": "" }, [m("cta.try")]),
        element("a", { class: "btn ghost", href: worksHref.href }, [worksHref.label]),
      ]),
    ]),
  ];
}
