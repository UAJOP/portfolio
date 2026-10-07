import SignalFlow, { SignalRule } from "./SignalFlow.jsx";

/* Home is the first consumer of the V4 system.
 *
 * The accepted Master 3 Home structure is not edited. While it renders, this
 * opts the hero's existing elements into V4 primitives by attribute and
 * appends the two elements V4 adds: the delivery flow and the hand-off rule.
 * Returns the extra children for the node, or null. */
export function applyHomeV4(v4, node, classes, attributes, key) {
  if (node.tag === "h1") attributes["data-v4-kinetic"] = "";
  /* Magnetic is for the one action the hero exists to produce. */
  if (classes.has("primary") && String(attributes["data-message-key"]).startsWith("home.hero.")) attributes["data-v4-magnetic"] = "";
  if (classes.has("hero")) {
    attributes["data-v4-ambient"] = "grain";
    return [<SignalRule key={`${key}.v4-rule`} label={v4.flow.handoff} />];
  }
  if (classes.has("hero-visual")) return [<SignalFlow key={`${key}.v4-flow`} model={v4.flow} />];
  return null;
}
