/**
 * Minimal, dependency-free CSS helpers for the design-system QA guards.
 *
 * Only what the guards need: top-level style rules (rules nested in @media /
 * @supports are deliberately ignored, because theme tokens and compatibility
 * aliases must be declared unconditionally), their declarations, and WCAG
 * contrast arithmetic. This is not a general CSS parser.
 */

export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level style rules as { selectors: string[], declarations: Map }. */
export function topLevelRules(css) {
  const source = stripComments(css);
  const rules = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      if (depth === 0) {
        prelude = source.slice(start, index).trim();
        start = index + 1;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        if (!prelude.startsWith("@")) {
          rules.push({
            selectors: splitSelectorList(prelude),
            declarations: declarations(source.slice(start, index)),
          });
        }
        start = index + 1;
      }
    }
  }
  return rules;
}

/** Split a selector list on top-level commas only (not inside :is(), :not() …). */
export function splitSelectorList(prelude) {
  const selectors = [];
  let depth = 0;
  let current = "";
  for (const char of prelude) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  selectors.push(current);
  return selectors.map((selector) => selector.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function declarations(body) {
  const map = new Map();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim().replace(/\s+/g, " ");
    if (name) map.set(name, value);
  }
  return map;
}

/** Declarations of every top-level rule whose selector list contains `selector`, merged in order. */
export function declarationsFor(css, selector) {
  const merged = new Map();
  for (const rule of topLevelRules(css)) {
    if (!rule.selectors.includes(selector)) continue;
    for (const [name, value] of rule.declarations) merged.set(name, value);
  }
  return merged;
}

/** Custom properties declared by a rule whose selector list is exactly `selector`. */
export function exactTokenBlock(css, selector) {
  const merged = new Map();
  for (const rule of topLevelRules(css)) {
    if (rule.selectors.length !== 1 || rule.selectors[0] !== selector) continue;
    for (const [name, value] of rule.declarations) if (name.startsWith("--")) merged.set(name, value);
  }
  return merged;
}

export function parseHex(value) {
  const match = String(value).trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
}

const channel = (value) => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

export function luminance(rgb) {
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
