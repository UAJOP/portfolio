import crypto from "node:crypto";
import { decodeHtml } from "./localized-html.mjs";

export const region = (html, name) => html.match(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}>`, "i"))?.[0] || "";
export const head = (html) => region(html, "head");
export const visibleText = (html) => decodeHtml(String(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style>/gi, "")
  .replace(/<!--.*?-->/gs, "")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();
export const tagSequence = (html) => [...String(html).matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)]
  .map((match) => `${match[0][1] === "/" ? "/" : ""}${match[1].toLowerCase()}`);
export const attributes = (html) => [...String(html).matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => {
  const keep = [...match[2].matchAll(/\b(id|class|href|src|alt|role|datetime|type|name|content|property|rel|hreflang|aria-[\w-]+|data-(?:message|pv2)[\w-]*)=(?:"([^"]*)"|'([^']*)')/gi)]
    .map((attribute) => `${attribute[1].toLowerCase()}=${decodeHtml(attribute[2] ?? attribute[3])}`)
    .sort();
  return `${match[1].toLowerCase()}[${keep.join("|")}]`;
});
export const contract = (html) => ({ text: visibleText(html), tags: tagSequence(html), attributes: attributes(html) });
export const hashValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export function documentContract(html) {
  return {
    head: hashValue(contract(head(html))),
    header: hashValue(contract(region(html, "header"))),
    main: hashValue(contract(region(html, "main"))),
    footer: hashValue(contract(region(html, "footer"))),
  };
}
