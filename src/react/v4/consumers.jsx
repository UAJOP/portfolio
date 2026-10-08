import SignalFlow, { SignalRule } from "./SignalFlow.jsx";
import { EcosystemField } from "./EcosystemMap.jsx";

/* Route consumers of the V4 system.
 *
 * The accepted Master 3 structures are not edited. While a route renders,
 * its consumer opts existing elements into V4 primitives by attribute and
 * appends the few elements V4 adds. Each returns the extra children for the
 * node, or null. */

/* A section's atmosphere: data currents in two depths. The far ones sweep the
 * whole first screen; the near ones converge on the section's focal node and
 * part again. Decorative; drawn once, then still. */
const FAR_CURRENTS = [
  "M-80 700C320 760 640 600 900 660S1260 720 1520 640",
  "M-80 120C300 60 620 200 900 150S1280 40 1520 110",
  "M-80 430C200 480 420 350 660 410S1100 570 1520 480",
];
const NEAR_CURRENTS = [
  "M-80 560C260 520 640 470 1030 400S1350 250 1520 220",
  "M-80 240C300 300 700 380 1030 400S1310 520 1520 610",
  "M470 880C680 720 880 540 1030 400S1230 130 1310 -70",
];

function CurrentField() {
  return (
    <svg className="v4-current-field" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="v4-current-ink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--v4-current)", stopOpacity: 0 }} />
          <stop offset="0.35" style={{ stopColor: "var(--v4-current)" }} />
          <stop offset="0.7" style={{ stopColor: "var(--v4-current-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--v4-current-2)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <g className="v4-current-field__far">{FAR_CURRENTS.map((d, index) => <path key={d} d={d} pathLength="1" style={{ "--v4-seq": index }} />)}</g>
      <g className="v4-current-field__glow">{NEAR_CURRENTS.map((d) => <path key={d} d={d} />)}</g>
      <g className="v4-current-field__near">{NEAR_CURRENTS.map((d, index) => <path key={d} d={d} pathLength="1" style={{ "--v4-seq": index + 2 }} />)}</g>
    </svg>
  );
}

/* The capabilities a surface really exercises, as ports on it. They are the
 * same nodes as the ecosystem's and light with them. */
function CapabilityPorts({ capabilities }) {
  return (
    <ul className="v4-ports">
      {capabilities.map((capability) => <li key={capability.id} className="v4-node" data-v4-cap={capability.id}><i className="v4-node__dot" aria-hidden="true" />{capability.label}</li>)}
    </ul>
  );
}

/* AJOOP in the flagship row: not a project card but the live system itself.
 * Every word is the assistant's own shipped copy — its resting state, its
 * composer line and its own quick questions — and every control opens the
 * same conversation the launcher does. Nothing here simulates a reply. */
function AjoopPort({ model }) {
  const open = () => globalThis.setChatbotOpen?.(true);
  return (
    <article className="evidence-card v4-port" data-v4-card="">
      <div className="evidence-card-media v4-port__field">
        <span className="v4-port__node" aria-hidden="true"><i /><i /><i /></span>
        <span className="v4-state v4-port__state">{model.state}</span>
      </div>
      <div className="evidence-card-content">
        <div className="project-meta"><span>{model.subtitle}</span></div>
        <h3>{model.title}</h3>
        <ul className="v4-port__quicks">
          {model.quicks.map((quick) => <li key={quick}><button type="button" onClick={open}>{quick}</button></li>)}
        </ul>
        <button type="button" className="v4-port__composer" onClick={open} aria-label={model.launcher}>
          <span>{model.prompt}</span>
          <b aria-hidden="true">{model.launcher}</b>
        </button>
      </div>
    </article>
  );
}

function home(v4, node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  /* Magnetic is for the one action the hero exists to produce. */
  if (classes.has("primary") && String(attributes["data-message-key"]).startsWith("home.hero.")) attributes["data-v4-magnetic"] = "";
  if (classes.has("hero")) {
    attributes["data-v4-ambient"] = "grain";
    return [<CurrentField key={`${key}.v4-field`} />, <SignalRule key={`${key}.v4-rule`} label={v4.flow.handoff} />];
  }
  if (classes.has("hero-visual")) return [<SignalFlow key={`${key}.v4-flow`} model={v4.flow} />];
  if (classes.has("evidence-card")) {
    attributes["data-v4-card"] = "";
    /* Flagship cards are keyed by position; the catalog says what each is. */
    const project = v4.ecosystem.projects.find((entry) => entry.id === v4.flow.flagship[Number(key.split(".").pop())]);
    const capabilities = project ? v4.ecosystem.capabilities.filter((capability) => project.categories.includes(capability.id)) : [];
    return capabilities.length ? [<CapabilityPorts key={`${key}.v4-ports`} capabilities={capabilities} />] : null;
  }
  if (classes.has("selected-work-grid")) {
    attributes["data-v4-arrive"] = "";
    return [<AjoopPort key={`${key}.v4-ajoop`} model={v4.ajoop} />];
  }
  /* The flagship section carries the current down from the hero. */
  if (key === "home.1") return [<i key={`${key}.v4-handoff`} className="v4-handoff" aria-hidden="true" />];
  return null;
}

/* Works: one catalog, three ways to read it. The view is presentation state
 * only — the catalog's own filter and search decide what is showing in all
 * three, and without JavaScript the page is the ordinary project list. */
const VIEWS = ["grid", "map", "capability"];

function ViewModes({ v4 }) {
  return (
    <div className="v4-modes" role="group" aria-label={v4.labels.viewAria} data-v4-live={v4.live ? "" : undefined}>
      {VIEWS.map((view) => (
        <button key={view} type="button" className="v4-modes__mode" data-v4-mode={view} aria-pressed={String(v4.view === view)} onClick={() => v4.setView(view)}>
          <i aria-hidden="true" />
          {v4.labels[view]}
        </button>
      ))}
    </div>
  );
}

function works(v4, node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  if (classes.has("page-hero")) attributes["data-v4-ambient"] = "grain";
  if (classes.has("filter-bar")) {
    attributes["data-v4-rail"] = "";
    /* What is showing, of what there is: the catalog's own state. */
    const two = (value) => String(value).padStart(2, "0");
    attributes["data-v4-count"] = `${two(v4.ecosystem.projects.length - v4.out.size)} / ${two(v4.ecosystem.projects.length)}`;
  }
  if (classes.has("project-card")) {
    attributes["data-v4-card"] = "";
    const filed = String(attributes["data-category"] || "").split(/\s+/);
    return [<CapabilityPorts key={`${key}.v4-ports`} capabilities={v4.ecosystem.capabilities.filter((capability) => filed.includes(capability.id))} />];
  }
  /* The catalog section becomes the explorer: it carries the view and gains
   * the mode switch and the map. */
  if (node.tag === "section" && node.children.some((child) => child.type === "element" && child.attributes.some((entry) => entry.name === "class" && String(entry.value).split(/\s+/).includes("filter-bar")))) {
    attributes["data-v4-explorer"] = "";
    attributes["data-v4-view"] = v4.view;
    return [
      <ViewModes key={`${key}.v4-modes`} v4={v4} />,
      <div key={`${key}.v4-map`} className="v4-explorer__map">
        <EcosystemField model={v4.ecosystem} control={{ category: v4.catalog.category, setCategory: v4.catalog.setCategory, out: v4.out }} />
      </div>,
    ];
  }
  return null;
}

/* Project detail: the page is the selected node, opened. Its own sections
 * become the system; nothing is added to them but the primitives. */
function detail(v4, node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  if (classes.has("case-hero")) {
    attributes["data-v4-ambient"] = "grain";
    return [<CurrentField key={`${key}.v4-field`} />, ...(v4.ports.length ? [<CapabilityPorts key={`${key}.v4-ports`} capabilities={v4.ports} />] : [])];
  }
  if (classes.has("case-hero-visual")) attributes["data-v4-anchor"] = "";
  if (classes.has("case-section")) attributes.id = `v4-s-${key.split(".").pop()}`;
  if (classes.has("case-journey")) attributes["data-v4-process"] = "";
  if (classes.has("case-proof-strip")) attributes["data-v4-arrive"] = "";
  if (classes.has("case-proof") || classes.has("case-service-card") || classes.has("case-panel")) attributes["data-v4-card"] = "";
  return null;
}

const CONSUMERS = { home, works, detail };

export function applyV4(page, v4, node, classes, attributes, key) {
  const consumer = CONSUMERS[v4.consumer || page];
  return consumer ? consumer(v4, node, classes, attributes, key) : null;
}
