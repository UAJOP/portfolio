import { createElement } from "react";

const PROP_NAMES = {
  class: "className",
  tabindex: "tabIndex",
};

export default function ProductionMain({ blocks }) {
  return blocks.map((block, index) => createElement(block.tag, {
    ...Object.fromEntries(Object.entries(block.attributes).map(([name, value]) => [PROP_NAMES[name] || name, value])),
    dangerouslySetInnerHTML: { __html: block.innerHtml },
    key: `${block.tag}:${block.attributes.id || block.attributes.class || index}`,
  }));
}
