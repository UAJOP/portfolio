import { createElement } from "react";
import structure from "../../../data/site/m3-25b-home-about-structure.json";

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

function renderNode(node, props, key) {
  if (node.type === "message") return props.copy[node.key];
  if (node.type === "data") return atPath(props.data, node.path);
  if (node.type === "text") return node.value;
  const attributes = Object.fromEntries(node.attributes.map(({ name, value }) => [
    PROP_NAMES[name] || name,
    value === true && name.startsWith("data-") ? "" : resolveValue(value, props),
  ]));
  const action = attributes["data-react-action"];
  if (action) {
    delete attributes["data-react-action"];
    if (action === "openResume") attributes.onClick = () => globalThis.openDrivePreviews?.();
  }
  const buildLogLimit = attributes["data-build-log-limit"];
  const children = buildLogLimit
    ? <BuildLog entries={props.buildLog} limit={Number(buildLogLimit)} />
    : node.children.length
      ? node.children.map((child, index) => renderNode(child, props, `${key}.${index}`))
      : undefined;
  return createElement(node.tag, { ...attributes, key }, children);
}

export default function ProductionMain(props) {
  const page = structure.pages[props.page];
  if (!page) throw new Error(`unsupported production React page ${props.page}`);
  return page.children.map((node, index) => renderNode(node, props, `${props.page}.${index}`));
}
