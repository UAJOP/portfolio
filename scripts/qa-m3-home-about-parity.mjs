#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHomeAboutFixture, HOME_ABOUT_IDS } from "./m3-home-about-fixture.mjs";
import { productionMainProps } from "./home-about-react.mjs";
import { decodeHtml, renderTag } from "./localized-html.mjs";

const head = (html) => html.match(/<head>[\s\S]*?<\/head>/i)?.[0];
const region = (html, name) => html.match(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}>`, "i"))?.[0];
const visibleText = (html) => decodeHtml(String(html).replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tagSequence = (html) => [...String(html).matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)].map((match) => `${match[0][1] === "/" ? "/" : ""}${match[1].toLowerCase()}`);
const attributes = (html) => [...String(html).matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => {
  const keep = [...match[2].matchAll(/\b(id|class|href|src|alt|role|datetime|type|name|content|property|rel|hreflang|aria-[\w-]+|data-(?:message|pv2)[\w-]*)=(?:"([^"]*)"|'([^']*)')/gi)]
    .map((attribute) => `${attribute[1].toLowerCase()}=${decodeHtml(attribute[2] ?? attribute[3])}`).sort();
  return `${match[1].toLowerCase()}[${keep.join("|")}]`;
});
const contract = (html) => ({ text: visibleText(html), tags: tagSequence(html), attributes: attributes(html) });
const expectedMain = (legacyHtml, props) => {
  const opening = legacyHtml.match(/<main\b[^>]*>/i)?.[0];
  return `${opening}${props.blocks.map((block) => renderTag({ name: block.tag, attributes: Object.entries(block.attributes).map(([name, value]) => ({ name, value: value === true ? null : value, quote: '"' })), selfClosing: false }) + block.innerHtml + `</${block.tag}>`).join("")}</main>`;
};

const fixture = await buildHomeAboutFixture();
let assertions = 0;
try {
  const migrated = fixture.routes.filter((route) => HOME_ABOUT_IDS.has(route.routeId));
  assert.equal(migrated.length, 10); assertions += 1;
  for (const route of migrated) {
    const legacyHtml = fs.readFileSync(path.join(fixture.legacy, route.output), "utf8");
    const reactHtml = fs.readFileSync(path.join(fixture.mixed, route.output), "utf8");
    assert.equal(head(reactHtml), head(legacyHtml), `${route.pathname}: head drift`); assertions += 1;
    assert.deepEqual(contract(region(reactHtml, "header")), contract(region(legacyHtml, "header")), `${route.pathname}: header drift`); assertions += 1;
    assert.deepEqual(contract(region(reactHtml, "footer")), contract(region(legacyHtml, "footer")), `${route.pathname}: footer drift`); assertions += 1;
    assert.deepEqual(contract(region(reactHtml, "main")), contract(expectedMain(legacyHtml, productionMainProps(route))), `${route.pathname}: main parity drift`); assertions += 1;
    assert.match(reactHtml, new RegExp(`<html[^>]*lang="${route.locale === "en" ? "en" : route.locale}"[^>]*data-route-locale="${route.locale}"`)); assertions += 1;
    assert.match(reactHtml, /<main\b[^>]*data-react-main[^>]*data-prerendered="true"/); assertions += 1;
  }
  console.log(`G-62 Home/About cutover parity passed. ${assertions} assertions · 10 documents · zero unexplained contract differences.`);
} finally {
  fixture.cleanup();
}
