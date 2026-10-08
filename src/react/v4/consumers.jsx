import SignalFlow, { SignalRule } from "./SignalFlow.jsx";
import { EcosystemField } from "./EcosystemMap.jsx";
import { EvidencePorts, MilestoneToggle } from "./CareerCurrent.jsx";
import AjoopSystem, { AjoopEntry, LivingHubArt } from "./AjoopSystem.jsx";

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
 * same conversation the launcher does. Nothing here simulates a reply. Its
 * media is the same Living Hub artwork and app icon the Hub and the case
 * study open with. */
function AjoopPort({ model }) {
  const open = () => globalThis.setChatbotOpen?.(true);
  return (
    <article className="evidence-card v4-port" data-v4-card="" data-v4-flagship="ajoop">
      <div className="evidence-card-media v4-port__field">
        <LivingHubArt sizes="(min-width: 1101px) 22vw, (min-width: 700px) 40vw, 100vw" />
        <span className="v4-port__node" aria-hidden="true"><i className="ajoop-app-icon" /></span>
        <span className="v4-state v4-port__state">{model.state}</span>
      </div>
      <div className="evidence-card-content">
        <div className="project-meta"><span>{model.subtitle}</span></div>
        <h3>{model.title}</h3>
        <p>{model.lead}</p>
        <ul className="v4-port__quicks">
          {model.quicks.map((quick) => <li key={quick}><button type="button" onClick={open}>{quick}</button></li>)}
        </ul>
        <button type="button" className="v4-port__composer" onClick={open} aria-label={model.launcher}>
          <span>{model.prompt}</span>
          <b aria-hidden="true">{model.launcher}</b>
        </button>
        {/* The same assistant as a page, and how it is built. */}
        <p className="v4-port__links">{model.links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</p>
      </div>
    </article>
  );
}

const two = (value) => String(value).padStart(2, "0");

/* A flagship's own journey, as its case study documents it: the steps on one
 * current, under the heading the case study gives them. */
function Journey({ signature, kind }) {
  return (
    <div className="v4-sig" data-v4-sig={kind}>
      <h4 className="v4-sig__caption">{signature.caption}</h4>
      <ol className="v4-sig__steps" data-v4-process="">
        {signature.steps.map((step, index) => <li key={step}><strong>{two(index + 1)}</strong><span>{step}</span></li>)}
      </ol>
    </div>
  );
}

/* Its proof strip. A value that lists states (a release policy's verdicts)
 * is set as those states; any other is a figure. */
function Proof({ signature }) {
  return (
    <dl className="v4-sig__proof">
      {signature.proof.map((entry) => {
        const states = entry.value.includes(" / ") ? entry.value.split(" / ") : null;
        return (
          <div key={entry.label} data-v4-proof={states ? "states" : "figure"}>
            <dt>{entry.label}</dt>
            <dd>{states ? states.map((state, index) => <b key={state} data-v4-verdict={index}>{state}</b>) : entry.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/* Home's evidence cards are keyed by position; the catalog says what each
 * is. Two are flagships, shown with their own system; the third is the
 * enterprise evidence that supports them. */
const SIGNATURE_KINDS = { 0: "pipeline", 2: "route" };

function home(v4, node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  /* Magnetic is for the one action the hero exists to produce. */
  if (classes.has("primary") && String(attributes["data-message-key"]).startsWith("home.hero.")) attributes["data-v4-magnetic"] = "";
  if (classes.has("hero")) {
    attributes["data-v4-ambient"] = "grain";
    return [<CurrentField key={`${key}.v4-field`} />, <SignalRule key={`${key}.v4-rule`} label={v4.flow.handoff} />];
  }
  if (classes.has("hero-visual")) return [<SignalFlow key={`${key}.v4-flow`} model={v4.flow} />];
  const path = key.split(".");
  if (classes.has("evidence-card")) {
    attributes["data-v4-card"] = "";
    const position = Number(path.pop());
    const id = v4.flow.evidence[position];
    const project = v4.ecosystem.projects.find((entry) => entry.id === id);
    const capabilities = project ? v4.ecosystem.capabilities.filter((capability) => project.categories.includes(capability.id)) : [];
    const signature = v4.signatures[id];
    attributes[signature ? "data-v4-flagship" : "data-v4-support"] = signature ? SIGNATURE_KINDS[position] : "";
    return [
      ...(capabilities.length ? [<CapabilityPorts key={`${key}.v4-ports`} capabilities={capabilities} />] : []),
      /* The lead flagship's pipeline runs the width of its card. */
      ...(signature && position === 0 ? [<Journey key={`${key}.v4-sig`} signature={signature} kind="pipeline" />] : []),
      ...(signature ? [] : [<span key={`${key}.v4-support`} className="v4-support-label">{v4.supportLabel}</span>]),
    ];
  }
  if (classes.has("evidence-card-content")) {
    const position = Number(path[path.length - 2]);
    const signature = v4.signatures[v4.flow.evidence[position]];
    if (!signature) return null;
    /* Between the card's summary and its links. */
    return {
      arrange: (own) => [
        ...own.slice(0, -1),
        <Proof key={`${key}.v4-proof`} signature={signature} />,
        ...(position === 0 ? [] : [<Journey key={`${key}.v4-sig`} signature={signature} kind={SIGNATURE_KINDS[position]} />]),
        own[own.length - 1],
      ],
    };
  }
  if (classes.has("selected-work-grid")) {
    attributes["data-v4-arrive"] = "";
    /* Reading order is the order shown: the lead flagship, AJOOP, the third
     * flagship, then the supporting evidence. */
    return { arrange: ([lead, support, third]) => [lead, <AjoopPort key={`${key}.v4-ajoop`} model={v4.ajoop} />, third, support] };
  }
  /* The closing hand-off also leads back into the work and to AJOOP. */
  if (classes.has("contact-actions")) {
    return { arrange: ([first, ...rest]) => [first, ...v4.closing.map((link) => <a key={link.href} className="btn ghost" href={link.href}>{link.label}</a>), ...rest] };
  }
  if (classes.has("service-grid")) attributes["data-v4-model"] = "";
  if (classes.has("contact-hub")) attributes["data-v4-ambient"] = "";
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
  /* The AJOOP case study: its hero opens onto the live system, and its
   * architecture section carries the system diagram. */
  if (attributes["data-v4-ajoop-entry"] !== undefined && v4.entry) return [<AjoopEntry key={`${key}.v4-entry`} model={v4.entry} />];
  if (attributes["data-v4-ajoop-system"] !== undefined && v4.system) return [<AjoopSystem key={`${key}.v4-system`} model={v4.system} />];
  if (classes.has("case-hero-visual")) attributes["data-v4-anchor"] = "";
  if (classes.has("case-section")) attributes.id = `v4-s-${key.split(".").pop()}`;
  if (classes.has("case-journey")) attributes["data-v4-process"] = "";
  if (classes.has("case-proof-strip")) attributes["data-v4-arrive"] = "";
  if (classes.has("case-proof") || classes.has("case-service-card") || classes.has("case-panel")) attributes["data-v4-card"] = "";
  return null;
}

/* Inner pages enter the same way: an atmospheric hero with a kinetic title. */
function entry(node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  if (!classes.has("page-hero")) return null;
  attributes["data-v4-ambient"] = "grain";
  attributes["data-v4-entry"] = "";
  return [<CurrentField key={`${key}.v4-field`} />];
}

/* Experience: the chronology is the current. Each entry is a milestone on it
 * with the id the chart links to; the page's own direction is where it leads. */
function experience(v4, node, classes, attributes, key) {
  const role = v4.career.roles[v4.ordinal.get(node)];
  if (classes.has("experience-summary")) attributes.id = "v4-direction";
  if (classes.has("experience-timeline")) attributes["data-v4-current"] = "";
  if (classes.has("experience-item")) {
    attributes.id = role.anchor;
    attributes["data-v4-milestone"] = "";
    if (role.live) attributes["data-v4-live"] = "";
  }
  if (classes.has("experience-card")) {
    return [
      ...(role.evidence?.capabilities.length ? [<EvidencePorts key={`${key}.v4-ports`} evidence={role.evidence} />] : []),
      <MilestoneToggle key={`${key}.v4-toggle`} labels={v4.milestone} />,
    ];
  }
  return entry(node, classes, attributes, key);
}

/* Certificates: the catalog stays the archive. A chosen cluster narrows it,
 * and the constellation view stands in for it. */
function certificates(v4, node, classes, attributes, key) {
  const { sky, state } = v4;
  const outside = (credential) => Boolean(state.cluster) && credential[state.group] !== state.cluster;
  if (classes.has("training-catalog")) attributes["data-v4-view"] = state.view;
  if (classes.has("training-category")) {
    const listed = sky.credentials.filter((credential) => credential.area === `a${v4.ordinal.get(node)}`);
    if (listed.every(outside)) attributes["data-v4-out"] = "";
  }
  if (classes.has("certificate-card")) {
    attributes["data-v4-card"] = "";
    if (outside(sky.credentials[v4.ordinal.get(node)])) attributes["data-v4-out"] = "";
  }
  return entry(node, classes, attributes, key);
}

/* About: the narrative's sections carry the ids its tracker links to, the
 * portrait moves into the map, and every capability focus is a port. */
function about(v4, node, classes, attributes, key) {
  const path = key.split(".");
  if (path.length === 2 && v4.tracker.items.some((item) => item.id === `v4-s-${path[1]}`)) attributes.id = `v4-s-${path[1]}`;
  if (classes.has("about-photo")) attributes["data-v4-moved"] = "";
  if (classes.has("journey-grid")) attributes["data-v4-arrive"] = "";
  const focus = node.tag === "a" ? /[?&]role=([\w-]+)/.exec(String(attributes.href)) : null;
  if (focus && v4.human.themes.some((theme) => theme.id === focus[1])) attributes["data-v4-cap"] = focus[1];
  return entry(node, classes, attributes, key);
}

/* The Hub: the page is the hero; the conversation is the shell's own root.
 * The hero's field converges on the Living Hub core, which steps back once a
 * conversation is under way (css/v4-ajoop.css). */
function hub(v4, node, classes, attributes, key) {
  const extra = entry(node, classes, attributes, key);
  if (!classes.has("page-hero")) return extra;
  return [
    <figure key={`${key}.v4-core`} className="v4-hub-core" aria-hidden="true"><LivingHubArt sizes="(min-width: 901px) 60vw, 100vw" priority /></figure>,
    ...extra,
  ];
}

/* Joyday Action Painting (V4-E06.1): the page's own studio markup becomes an
 * entered play mode. Nothing of the accepted structure is edited and the
 * painting engine is not touched: this adds the studio's shell controls —
 * exit, fullscreen, new canvas, the start state, a failure state, a notice
 * for no JavaScript — and marks the elements js/pages/joyday-studio.js and
 * css/v4-joyday-studio.css work with. Every control is a real button; the
 * sound switch is the engine's own. */
const STUDIO_ICONS = {
  exit: "M15 6l-6 6 6 6M9 12h11",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  newCanvas: "M12 5v14M5 12h14",
  extras: "M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M11 15v4",
};

function StudioIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={STUDIO_ICONS[name]} /></svg>;
}

function joydayStudio(v4, node, classes, attributes, key) {
  const { labels } = v4;
  if (attributes.id === "joyday-paint-game") {
    attributes["data-jds-root"] = "";
    attributes["aria-label"] = labels.aria;
    return {
      arrange: (own) => [
        <div key={`${key}.jds-bar-start`} className="jds-bar jds-bar--start">
          <button type="button" className="jds-btn" data-jds-exit=""><StudioIcon name="exit" /><span>{labels.exit}</span></button>
          <strong className="jds-title" aria-hidden="true">Joyday Action Painting</strong>
        </div>,
        <div key={`${key}.jds-bar-end`} className="jds-bar jds-bar--end">
          {/* Offered only where the browser can do it (the controller shows it). */}
          <button type="button" className="jds-btn" data-jds-fullscreen="" data-jds-label-on={labels.fullscreenExit} data-jds-label-off={labels.fullscreen} aria-pressed="false" hidden><StudioIcon name="fullscreen" /><span>{labels.fullscreen}</span></button>
          <button type="button" className="jds-btn" data-jds-new=""><StudioIcon name="newCanvas" /><span>{labels.newCanvas}</span></button>
          <button type="button" className="jds-btn jds-btn--extras" data-jds-extras="" aria-pressed="false" aria-label={labels.extras} title={labels.extras}><StudioIcon name="extras" /></button>
        </div>,
        <h2 key={`${key}.jds-start`} className="jds-start">{labels.startTitle}</h2>,
        ...own,
        <div key={`${key}.jds-go`} className="jds-go">
          <button type="button" className="jds-cta" data-jds-start="">{labels.startCta}</button>
          <button type="button" className="jds-btn" data-jds-resume="" hidden><span>{labels.keepPainting}</span></button>
        </div>,
        /* The studio's mood, said once when a palette changes it. The names
           travel as data; the controller writes the one that applies. */
        <p key={`${key}.jds-mood`} className="jds-mood" data-jds-mood-label="" data-jds-moods={JSON.stringify(v4.moods)} role="status" hidden>
          <b>{v4.moodLabel}</b>
          <strong />
          <span />
        </p>,
        <div key={`${key}.jds-error`} className="jds-error" role="alert" data-jds-error="" hidden>
          <strong>{labels.errorTitle}</strong>
          <p>{labels.errorText}</p>
          <div>
            <button type="button" className="jds-cta" data-jds-reload="">{labels.errorReload}</button>
            <button type="button" className="jds-btn" data-jds-exit=""><span>{labels.exit}</span></button>
          </div>
        </div>,
      ],
    };
  }
  /* The hero's own action is the way in. Without JavaScript there is no
   * studio to enter: the action gives way to a plain notice. */
  if (node.tag === "a" && attributes.href === "#joyday-paint-game") attributes["data-jds-enter"] = "";
  if (classes.has("joyday-paint-copy")) {
    return [
      <noscript key={`${key}.jds-noscript`}>
        <style>{"[data-jds-enter]{display:none!important}"}</style>
        <p className="jds-noscript">{labels.noscript} <a href={v4.caseStudyHref}>{labels.caseStudy}</a></p>
      </noscript>,
    ];
  }
  /* The finished artwork's choices: keep painting, start again, or leave. */
  if (classes.has("joyday-finish-actions")) {
    return [
      <button key={`${key}.jds-keep`} type="button" className="btn ghost" data-jds-keep="">{labels.keepPainting}</button>,
      <button key={`${key}.jds-leave`} type="button" className="btn ghost" data-jds-exit="">{labels.exit}</button>,
    ];
  }
  return null;
}

const CONSUMERS = { home, works, detail, experience, certificates, about, hub, joydayStudio };

export function applyV4(page, v4, node, classes, attributes, key) {
  const consumer = CONSUMERS[v4.consumer || page];
  return consumer ? consumer(v4, node, classes, attributes, key) : null;
}
