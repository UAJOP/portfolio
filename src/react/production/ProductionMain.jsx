import { Fragment, createElement, memo, useEffect, useMemo, useState } from "react";
import homeAboutStructure from "../../../data/site/m3-25b-home-about-structure.json";
import BuildLog from "./BuildLog.jsx";
import { applyV4 } from "../v4/consumers.jsx";
import EcosystemMap from "../v4/EcosystemMap.jsx";
import { RelatedWork, SectionTracker } from "../v4/DetailShell.jsx";
import CareerCurrent, { Onward } from "../v4/CareerCurrent.jsx";
import Constellation from "../v4/Constellation.jsx";
import HumanMap from "../v4/HumanMap.jsx";

const PROP_NAMES = {
  class: "className",
  tabindex: "tabIndex",
  fetchpriority: "fetchPriority",
};

const atPath = (source, dataPath) => String(dataPath).split(".").reduce((value, segment) => value?.[segment], source);

function resolveValue(value, props) {
  if (!value || typeof value !== "object") return value;
  if (!value.type) return value;
  if (value.type === "message") return value.locale ? props.fixedCopy[`${value.locale}:${value.key}`] : props.copy[value.key];
  if (value.type === "role") return props.fixedRoles[`${value.locale}:${value.ref}`];
  if (value.type === "compat") return props.compat[value.locale][value.key];
  if (value.type === "internal") return props.links[value.path];
  if (value.type === "data") return atPath(props.data, value.path);
  throw new Error(`unsupported production React value type ${value.type}`);
}

/* Same semantics as the accepted catalog search: whitespace-collapsed,
 * trimmed, lower-cased text with no diacritic folding. */
const normalizeSearch = (value) => String(value).replace(/\s+/g, " ").trim().toLowerCase();

function resolvedAttributes(node, props) {
  return Object.fromEntries(node.attributes.map(({ name, value }) => [
    PROP_NAMES[name] || name,
    value === true && name.startsWith("data-") ? "" : resolveValue(value, props),
  ]));
}

function nodeText(node, props) {
  if (node.type === "message") return props.copy[node.key] || "";
  if (node.type === "role") return props.roles[node.ref] || "";
  if (node.type === "data") return atPath(props.data, node.path) || "";
  if (node.type === "text") return node.value;
  if (node.type === "space") return " ";
  return node.children.map((child) => nodeText(child, props)).join("");
}

function descendantCards(node) {
  if (node.type !== "element") return [];
  const attributes = Object.fromEntries(node.attributes.map(({ name, value }) => [name, value]));
  const own = typeof attributes.class === "string" && attributes.class.split(/\s+/).includes("project-card") && attributes["data-category"]
    ? [node]
    : [];
  return own.concat(node.children.flatMap(descendantCards));
}

function cardVisible(node, props, state) {
  const attributes = resolvedAttributes(node, props);
  const categories = String(attributes["data-category"] || "").split(" ");
  const categoryMatch = state.category === "all" || categories.includes(state.category);
  const query = normalizeSearch(state.query);
  if (!query) return categoryMatch;
  const text = normalizeSearch(nodeText(node, props));
  const keywordMatch = text.includes(query)
    || String(attributes["data-project-link"] || "").includes(query)
    || String(attributes["data-game-link"] || "").includes(query);
  return categoryMatch && keywordMatch;
}

function shouldIgnoreCardActivation(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (event.target.closest('a, button, input, select, textarea, summary, label, [role="button"]')) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

/* V4 inner pages address repeated entries by position: the nth entry of a
 * kind in the structure is the nth record of its model. */
const ORDINAL_CLASSES = ["experience-item", "experience-card", "training-category", "certificate-card"];
function ordinalsOf(nodes) {
  const ordinal = new Map();
  const seen = {};
  const walk = (node) => {
    if (node.type !== "element") return;
    const classes = String(node.attributes.find((entry) => entry.name === "class")?.value || "").split(/\s+/);
    for (const name of ORDINAL_CLASSES) if (classes.includes(name)) { ordinal.set(node, seen[name] || 0); seen[name] = (seen[name] || 0) + 1; }
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ordinal;
}
const topLevelIndex = (nodes, name) => nodes.findIndex((node) => node.type === "element" && String(node.attributes.find((entry) => entry.name === "class")?.value || "").split(/\s+/).includes(name));

const CatalogSearch = memo(function CatalogSearch({ catalog, setQuery }) {
  return (
    <div className="project-search-wrap reveal">
      <label htmlFor="catalog-search" data-project-search-label="">{catalog.searchLabel}</label>
      <div>
        <i className="bx bx-search" />
        <input id="catalog-search" type="search" data-project-search="" placeholder={catalog.searchPlaceholder} onInput={(event) => setQuery(event.currentTarget.value)} />
      </div>
    </div>
  );
});

function renderNode(node, props, key, catalogState) {
  if (node.type === "space") return null;
  if (node.type === "message") return props.copy[node.key];
  if (node.type === "role") return props.roles[node.ref];
  if (node.type === "data") return atPath(props.data, node.path);
  if (node.type === "text") return node.value;
  const attributes = resolvedAttributes(node, props);
  const action = attributes["data-react-action"];
  if (action) {
    delete attributes["data-react-action"];
    if (action === "openResume") attributes.onClick = () => globalThis.openDrivePreviews?.();
  }
  const buildLogLimit = attributes["data-build-log-limit"];
  const classes = new Set(String(attributes.className || "").split(/\s+/).filter(Boolean));
  const isFilter = attributes["data-filter-btn"] !== undefined;
  const isCard = classes.has("project-card") && attributes["data-category"] !== undefined;
  const isSection = attributes["data-project-section"] !== undefined;
  const isFilterBar = classes.has("filter-bar") && props.catalog;
  if (catalogState && isFilter) {
    classes.delete("active");
    if (attributes["data-filter-btn"] === catalogState.category) classes.add("active");
    attributes.onClick = () => catalogState.setCategory(attributes["data-filter-btn"]);
  }
  if (catalogState && isCard) {
    if (!cardVisible(node, props, catalogState)) classes.add("is-hidden");
  }
  /* Whole-card navigation exactly as accepted: on Works only data-project-link
   * authorizes it (with Works analytics); on Games only data-game-link does
   * (without analytics). Any other card, including a Works card that carries
   * data-game-link, stays inert. */
  const cardLink = props.page === "games" ? attributes["data-game-link"] : attributes["data-project-link"];
  if (catalogState && cardLink !== undefined) {
    const destination = props.cardDestinations[cardLink];
    const tracked = props.page !== "games";
    attributes.onClick = (event) => {
      if (shouldIgnoreCardActivation(event)) return;
      if (tracked) globalThis.trackAnalyticsNavigation?.(destination, "works");
      window.location.href = destination;
    };
  }
  if (catalogState && isSection && !descendantCards(node).some((card) => cardVisible(card, props, catalogState))) {
    classes.add("is-hidden");
  }
  /* V4 primitives a consuming route opts into; null on every other route. */
  const v4Children = props.v4 ? applyV4(props.page, props.v4, node, classes, attributes, key) : null;
  if (classes.size) attributes.className = [...classes].join(" ");
  const ownChildren = buildLogLimit
    ? <BuildLog entries={props.buildLog} limit={Number(buildLogLimit)} />
    : node.children.some((child) => child.type !== "space")
      ? node.children.flatMap((child, index) => child.type === "space" ? [] : [renderNode(child, props, `${key}.${index}`, catalogState)])
      : undefined;
  const children = v4Children ? [...(ownChildren || []), ...v4Children] : ownChildren;
  const element = createElement(node.tag, { ...attributes, key }, children);
  if (!isFilterBar) return element;
  return (
    <Fragment key={key}>
      {element}
      <CatalogSearch catalog={props.catalog} setQuery={catalogState.setQuery} />
    </Fragment>
  );
}

export default function ProductionMain(props) {
  const structuredPage = props.structure ? { children: props.structure } : null;
  const catalogPage = props.catalog ? structuredPage : null;
  const page = structuredPage || homeAboutStructure.pages[props.page];
  if (!page) throw new Error(`unsupported production React page ${props.page}`);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const catalogState = catalogPage ? { category, query, setCategory, setQuery } : null;
  /* V4 view state (Works). `live` turns on once hydrated, so controls that
   * need JavaScript are not offered before it can answer. */
  const [view, setView] = useState("grid");
  const [live, setLive] = useState(false);
  useEffect(() => { setLive(true); }, []);
  /* V4 Certificates: which view, which grouping, which cluster. */
  const [sky, setSky] = useState({ view: "grid", group: "area", cluster: null });
  const consumer = props.v4?.consumer;
  const ordinal = useMemo(() => (consumer === "experience" || consumer === "certificates" ? ordinalsOf(props.structure) : null), [consumer, props.structure]);
  let live4 = props;
  if (ordinal) live4 = { ...props, v4: { ...props.v4, ordinal, state: sky } };
  if (props.v4 && catalogState) {
    /* The projects the catalog's own filter and search currently exclude. */
    const out = new Set(page.children.flatMap(descendantCards).filter((card) => !cardVisible(card, props, catalogState)).map((card) => {
      const attributes = resolvedAttributes(card, props);
      return String(attributes["data-project-link"] || attributes["data-game-link"]).split("/").filter(Boolean).pop();
    }));
    live4 = { ...props, v4: { ...props.v4, view, setView, live, catalog: catalogState, out } };
  }
  const sections = page.children.map((node, index) => renderNode(node, live4, `${props.page}.${index}`, catalogState));
  /* V4: Home places the project ecosystem straight after its flagship evidence. */
  if (props.v4?.flow && props.v4.ecosystem) sections.splice(2, 0, <EcosystemMap key={`${props.page}.v4-ecosystem`} model={props.v4.ecosystem} />);
  /* V4: a project detail gains its tracker after the hero and its related
   * work before the closing section. */
  if (props.v4?.consumer === "detail") {
    if (props.v4.related) sections.splice(sections.length - 1, 0, <RelatedWork key={`${props.page}.v4-related`} model={props.v4.related} />);
    sections.splice(1, 0, <SectionTracker key={`${props.page}.v4-tracker`} model={props.v4.tracker} />);
  }
  /* V4 inner pages. Experience gains its career chart under the hero and the
   * way on to About before its closing section. */
  if (consumer === "experience") {
    sections.splice(sections.length - 1, 0, <Onward key={`${props.page}.v4-onward`} model={props.v4.handoff} />);
    sections.splice(topLevelIndex(page.children, "page-hero") + 1, 0, <CareerCurrent key={`${props.page}.v4-career`} model={props.v4.career} />);
  }
  /* Certificates gains its views, and the constellation, above the catalog. */
  if (consumer === "certificates") {
    sections.splice(topLevelIndex(page.children, "training-catalog"), 0, <Constellation key={`${props.page}.v4-sky`} sky={props.v4.sky} state={sky} setState={setSky} live={live} />);
  }
  /* About reads in narrative order, with the human map after the hero and
   * the way on to Experience after the journey that summarises it. */
  if (consumer === "about") {
    const [hero, ...story] = props.v4.order.map((index) => sections[index]);
    const closing = story.pop();
    return [
      hero,
      <SectionTracker key={`${props.page}.v4-tracker`} model={props.v4.tracker} />,
      <HumanMap key={`${props.page}.v4-human`} model={props.v4.human} />,
      ...story,
      <Onward key={`${props.page}.v4-onward`} model={props.v4.handoff} />,
      closing,
    ];
  }
  return sections;
}
