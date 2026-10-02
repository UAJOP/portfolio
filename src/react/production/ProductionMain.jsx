import { Fragment, createElement, memo, useState } from "react";
import homeAboutStructure from "../../../data/site/m3-25b-home-about-structure.json";

const PROP_NAMES = {
  class: "className",
  tabindex: "tabIndex",
  fetchpriority: "fetchPriority",
};

const atPath = (source, dataPath) => String(dataPath).split(".").reduce((value, segment) => value?.[segment], source);

function resolveValue(value, props) {
  if (!value || typeof value !== "object") return value;
  if (value.type === "message") return value.locale ? props.fixedCopy[`${value.locale}:${value.key}`] : props.copy[value.key];
  if (value.type === "role") return props.fixedRoles[`${value.locale}:${value.ref}`];
  if (value.type === "compat") return props.compat[value.locale][value.key];
  if (value.type === "internal") return props.links[value.path];
  if (value.type === "data") return atPath(props.data, value.path);
  throw new Error(`unsupported production React value type ${value.type}`);
}

function BuildLog({ entries, limit }) {
  const labels = { shipped: "Shipped", building: "Building", integration: "Integration" };
  return entries.slice(0, limit).map((entry) => (
    <article className="build-log-item" key={entry.id}>
      <time dateTime={entry.date}>{entry.date}</time>
      <div>
        <div className="build-log-meta">
          <span>{entry.area}</span>
          <span className={`build-log-status is-${entry.status}`}>{labels[entry.status] || entry.status}</span>
        </div>
        <h3>{entry.title}</h3>
        <p>{entry.detail}</p>
      </div>
    </article>
  ));
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
  if (classes.size) attributes.className = [...classes].join(" ");
  const children = buildLogLimit
    ? <BuildLog entries={props.buildLog} limit={Number(buildLogLimit)} />
    : node.children.some((child) => child.type !== "space")
      ? node.children.flatMap((child, index) => child.type === "space" ? [] : [renderNode(child, props, `${key}.${index}`, catalogState)])
      : undefined;
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
  const catalogPage = props.structure ? { children: props.structure } : null;
  const page = catalogPage || homeAboutStructure.pages[props.page];
  if (!page) throw new Error(`unsupported production React page ${props.page}`);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const catalogState = catalogPage ? { category, query, setCategory, setQuery } : null;
  return page.children.map((node, index) => renderNode(node, props, `${props.page}.${index}`, catalogState));
}
