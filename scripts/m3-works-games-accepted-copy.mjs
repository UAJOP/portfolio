/* Reads the immutable #26 acceptance documents from the committed, hermetic
 * snapshot (never from git history). Shared by the structure generator
 * (English shape) and the semantic-key promotion (five-locale values). */
import { M3_26_ACCEPTED_REF, acceptedMain } from "./m3-26-accepted-snapshot.mjs";
import { decodeHtml, findMatchingClose, findTagEnd, normalizeText, parseTag } from "./localized-html.mjs";

export const WORKS_GAMES_ACCEPTED_REF = M3_26_ACCEPTED_REF;
export const WORKS_GAMES_LOCALES = Object.freeze(["en", "tr", "de", "es", "fr"]);
export const WORKS_GAMES_PAGES = Object.freeze({ works: "works/index.html", games: "games/index.html" });
export const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
export const LOCALIZED_ATTRIBUTES = new Set(["alt", "aria-label", "placeholder", "title"]);
/* Canonical project facts rendered from data/portfolio/projects.json. */
export const DATA_TEXT = new Map([
  ["SINAMA — AI Agent Reliability Lab", "projects.sinama.name"],
  ["Merge Rush: Tiny Factory", "projects.mergeRush.name"],
]);

export function resolveAcceptedRef(ref) {
  if (ref !== WORKS_GAMES_ACCEPTED_REF) throw new Error(`Works/Games copy must use accepted ref ${WORKS_GAMES_ACCEPTED_REF}; received ${ref}`);
  return ref;
}

export function mainSource(ref, source) {
  resolveAcceptedRef(ref);
  return acceptedMain(source);
}

export function walkValues(html, values = { text: [], attributes: [] }) {
  let index = 0;
  while (index < html.length) {
    const nextTag = html.indexOf("<", index);
    const stop = nextTag < 0 ? html.length : nextTag;
    const text = normalizeText(decodeHtml(html.slice(index, stop)));
    if (text) values.text.push(text);
    if (nextTag < 0) break;
    if (html.startsWith("<!--", nextTag)) {
      const end = html.indexOf("-->", nextTag);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    const tagEnd = findTagEnd(html, nextTag);
    const rawTag = html.slice(nextTag, tagEnd);
    if (rawTag.startsWith("</")) throw new Error(`unexpected close tag ${rawTag}`);
    const tag = parseTag(rawTag);
    for (const attribute of tag.attributes) {
      if (LOCALIZED_ATTRIBUTES.has(attribute.name.toLowerCase()) && attribute.value !== null) {
        values.attributes.push({ name: attribute.name.toLowerCase(), value: decodeHtml(attribute.value) });
      }
    }
    const name = tag.name.toLowerCase();
    if (tag.selfClosing || VOID.has(name)) index = tagEnd;
    else {
      const close = findMatchingClose(html, tagEnd, name);
      if (close < 0) throw new Error(`unclosed ${name}`);
      walkValues(html.slice(tagEnd, close), values);
      index = findTagEnd(html, close);
    }
  }
  return values;
}

/** English copy → accepted value per locale, aligned by document position. */
export function acceptedPageCopy(ref, source) {
  const sources = Object.fromEntries(WORKS_GAMES_LOCALES.map((locale) => [
    locale,
    walkValues(mainSource(ref, locale === "en" ? source : `${locale}/${source}`)),
  ]));
  const english = sources.en;
  const text = new Map();
  const attribute = new Map();
  const record = (map, englishValue, locale, value, label) => {
    const entry = map.get(englishValue) || map.set(englishValue, {}).get(englishValue);
    if (entry[locale] !== undefined && entry[locale] !== value) throw new Error(`${source}/${locale}: inconsistent accepted ${label} for ${JSON.stringify(englishValue)}`);
    entry[locale] = value;
  };
  for (const locale of WORKS_GAMES_LOCALES) {
    if (sources[locale].text.length !== english.text.length) throw new Error(`${source}/${locale}: text shape drift`);
    if (sources[locale].attributes.length !== english.attributes.length) throw new Error(`${source}/${locale}: attribute shape drift`);
    english.text.forEach((value, index) => {
      if (!DATA_TEXT.has(value)) record(text, value, locale, sources[locale].text[index], "text");
    });
    english.attributes.forEach((item, index) => {
      if (sources[locale].attributes[index].name !== item.name) throw new Error(`${source}/${locale}: localized attribute order drift`);
      record(attribute, item.value, locale, sources[locale].attributes[index].value, "attribute");
    });
  }
  return { text, attribute };
}
