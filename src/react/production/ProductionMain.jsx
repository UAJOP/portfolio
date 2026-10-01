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
  if (value.type === "message") return props.copy[value.key];
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

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normalizeSearch = (value) => {
  if (typeof globalThis.normalizeI18nText === "function") return globalThis.normalizeI18nText(value).toLowerCase();
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

function resolvedAttributes(node, props) {
  return Object.fromEntries(node.attributes.map(({ name, value }) => [
    PROP_NAMES[name] || name,
    value === true && name.startsWith("data-") ? "" : resolveValue(value, props),
  ]));
}

function nodeText(node, props) {
  if (node.type === "message") return props.copy[node.key] || "";
  if (node.type === "data") return atPath(props.data, node.path) || "";
  if (node.type === "text") return node.value;
  return node.children.map((child) => nodeText(child, props)).join(" ");
}

function descendantCards(node) {
  if (node.type !== "element") return [];
  const attributes = Object.fromEntries(node.attributes.map(({ name, value }) => [name, value]));
  const own = typeof attributes.class === "string" && attributes.class.split(/\s+/).includes("project-card") && attributes["data-category"]
    ? [node]
    : [];
  return own.concat(node.children.flatMap(descendantCards));
}

function firstHref(node, props) {
  if (node.type !== "element") return null;
  const href = node.attributes.find((attribute) => attribute.name === "href");
  if (href) return resolveValue(href.value, props);
  for (const child of node.children) {
    const found = firstHref(child, props);
    if (found) return found;
  }
  return null;
}

function cardVisible(node, props, state) {
  const attributes = resolvedAttributes(node, props);
  const categories = String(attributes["data-category"] || "").split(" ");
  const categoryMatch = state.category === "all" || categories.includes(state.category);
  const query = normalizeSearch(state.query);
  if (!query) return categoryMatch;
  const text = normalizeSearch(nodeText(node, props));
  const destination = normalizeSearch(attributes["data-project-link"] || attributes["data-game-link"] || "");
  return categoryMatch && (text.includes(query) || destination.includes(query));
}

function shouldIgnoreCardActivation(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (event.target.closest('a, button, input, select, textarea, summary, label, [role="button"]')) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

const CatalogSearch = memo(function CatalogSearch({ catalog, setQuery }) {
  const markup = `<label for="catalog-search" data-project-search-label>${escapeHtml(catalog.searchLabel)}</label><div><i class="bx bx-search"></i><input id="catalog-search" type="search" data-project-search placeholder="${escapeHtml(catalog.searchPlaceholder)}" /></div>`;
  return (
    <div
      className="project-search-wrap reveal"
      onInput={(event) => { if (event.target.matches("[data-project-search]")) setQuery(event.target.value); }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

function renderNode(node, props, key, catalogState) {
  if (node.type === "message") return props.copy[node.key];
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
    attributes.onClick = (event) => {
      if (shouldIgnoreCardActivation(event)) return;
      const destination = firstHref(node, props);
      if (!destination) return;
      globalThis.trackAnalyticsNavigation?.(destination, props.page === "games" ? "games" : "works");
      window.location.href = destination;
    };
  }
  if (catalogState && isSection && !descendantCards(node).some((card) => cardVisible(card, props, catalogState))) {
    classes.add("is-hidden");
  }
  if (classes.size) attributes.className = [...classes].join(" ");
  const children = buildLogLimit
    ? <BuildLog entries={props.buildLog} limit={Number(buildLogLimit)} />
    : node.children.length
      ? node.children.map((child, index) => renderNode(child, props, `${key}.${index}`, catalogState))
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
