/**
 * localized-html.mjs — HTML transforms for localized static routes (BRIEF 09C).
 *
 * A tiny, quote-aware HTML walker. The repo has no DOM library and no bundler,
 * and adding one for a generator would be a heavier dependency than the problem
 * deserves, so tags and text nodes are scanned directly.
 *
 * The transforms deliberately mirror the runtime exactly:
 *   - text nodes are keyed on their whitespace-collapsed content, like
 *     `normalizeI18nText()`, and surrounding whitespace is preserved, like
 *     `preserveWhitespace()`
 *   - `aria-label`, `alt`, `title` and `placeholder` translate from the same
 *     attribute dictionary the runtime uses
 *   - `data-case-i18n*` and the `data-*-en` / `data-*-tr` compat pairs are
 *     pre-applied, so the static page already says what the runtime would.
 *
 * Node built-ins only.
 */

/** Elements whose character data is never page copy. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "noscript", "textarea", "title"]);

/** Attributes the runtime translates through the attribute dictionary. */
export const TRANSLATABLE_ATTRIBUTES = ["aria-label", "alt", "title", "placeholder"];

/** Attributes that address a document rather than describe one. */
const URL_ATTRIBUTES = new Set(["href", "src", "poster", "action", "data-case-gallery"]);

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function decodeHtml(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export const normalizeText = (value) => String(value).replace(/\s+/g, " ").trim();

export function preserveWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

/**
 * Index just past the `>` that closes the tag starting at `start`.
 * Quote-aware, so an attribute value containing `>` cannot end the tag early.
 */
export function findTagEnd(html, start) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === ">") return index + 1;
  }
  return html.length;
}

/**
 * Index of the `<` that opens this element's matching close tag.
 *
 * Searching is done with case-insensitive regexes against the original string
 * rather than against a lowercased copy. `String.prototype.toLowerCase()` is
 * not length-preserving — Turkish `İ` (U+0130) lowercases to two code units —
 * so indices taken from a lowercased copy silently drift on exactly the pages
 * this generator exists to produce.
 */
export function findMatchingClose(html, from, tagName) {
  const name = String(tagName).replace(/[^a-zA-Z0-9-]/g, "");
  if (!name) return -1;
  const openPattern = new RegExp(`<${name}(?=[\\s/>])`, "gi");
  const closePattern = new RegExp(`</${name}(?=[\\s>])`, "gi");
  let depth = 1;
  let index = from;
  while (index < html.length) {
    openPattern.lastIndex = index;
    closePattern.lastIndex = index;
    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      index = findTagEnd(html, nextOpen.index);
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose.index;
    index = findTagEnd(html, nextClose.index);
  }
  return -1;
}

/** Parses a start tag into `{ name, attributes, selfClosing }`. */
export function parseTag(tag) {
  const name = tag.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/)?.[1] || "";
  const attributes = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  const body = tag.slice(1 + name.length, tag.endsWith("/>") ? -2 : -1);
  for (const match of body.matchAll(pattern)) {
    attributes.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? null,
      quote: match[2] !== undefined ? '"' : match[3] !== undefined ? "'" : match[4] !== undefined ? "" : null,
    });
  }
  return { name, attributes, selfClosing: tag.endsWith("/>") };
}

export function renderTag({ name, attributes, selfClosing }) {
  const rendered = attributes
    .map((attribute) => {
      if (attribute.value === null) return attribute.name;
      const quote = attribute.quote || '"';
      return quote ? `${attribute.name}=${quote}${attribute.value}${quote}` : `${attribute.name}=${attribute.value}`;
    })
    .join(" ");
  return `<${name}${rendered ? ` ${rendered}` : ""}${selfClosing ? "/" : ""}>`;
}

/**
 * Rewrites one document into a locale.
 *
 * `translateText` / `translateAttribute` return null when a string has no
 * translation, which leaves the English source in place rather than blanking
 * it. `qa:i18n` is what guarantees that never happens for a complete locale;
 * this is only the defensive floor.
 */
export function localizeDocument(html, options) {
  const {
    translateText,
    translateAttribute,
    caseStudyValue = () => null,
    compatValue = () => null,
    rewriteUrl = (value) => value,
  } = options;

  let out = "";
  let index = 0;

  while (index < html.length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      out += localizeTextNode(html.slice(index), translateText);
      break;
    }
    out += localizeTextNode(html.slice(index, lt), translateText);

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt);
      const stop = end < 0 ? html.length : end + 3;
      out += html.slice(lt, stop);
      index = stop;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const stop = findTagEnd(html, lt);
      out += html.slice(lt, stop);
      index = stop;
      continue;
    }

    const tagEnd = findTagEnd(html, lt);
    const rawTag = html.slice(lt, tagEnd);
    index = tagEnd;

    if (rawTag.startsWith("</")) {
      out += rawTag;
      continue;
    }

    const tag = parseTag(rawTag);
    const attributeByName = new Map(tag.attributes.map((attribute) => [attribute.name.toLowerCase(), attribute]));

    for (const attribute of tag.attributes) {
      const name = attribute.name.toLowerCase();
      if (attribute.value === null) continue;
      if (URL_ATTRIBUTES.has(name)) {
        attribute.value = escapeHtml(rewriteUrl(decodeHtml(attribute.value), name));
        continue;
      }
      if (TRANSLATABLE_ATTRIBUTES.includes(name)) {
        const caseKey = attributeByName.get(name === "alt" ? "data-case-i18n-alt" : "data-case-i18n-aria-label");
        const cased = name === "alt" || name === "aria-label" ? caseStudyValue(caseKey?.value) : null;
        const translated = cased ?? translateAttribute(decodeHtml(attribute.value));
        if (translated) attribute.value = escapeHtml(translated);
      }
    }

    out += renderTag(tag);

    if (tag.selfClosing || !tag.name) continue;

    /* Raw-text elements keep their character data untouched. */
    if (RAW_TEXT_ELEMENTS.has(tag.name.toLowerCase())) {
      const close = findMatchingClose(html, index, tag.name);
      const stop = close < 0 ? html.length : close;
      out += html.slice(index, stop);
      index = stop;
      continue;
    }

    /* Elements whose whole content is one translated string are replaced
     * wholesale, exactly as the runtime sets their textContent. */
    const replacement =
      caseStudyValue(attributeByName.get("data-case-i18n")?.value) ??
      compatValue(attributeByName);
    if (replacement !== null && replacement !== undefined) {
      const close = findMatchingClose(html, index, tag.name);
      if (close >= 0) {
        out += escapeHtml(replacement);
        index = close;
        continue;
      }
    }
  }

  return out;
}

function localizeTextNode(text, translateText) {
  if (!text || !text.trim()) return text;
  const key = normalizeText(decodeHtml(text));
  const translated = key ? translateText(key) : null;
  return translated ? preserveWhitespace(text, escapeHtml(translated)) : text;
}
