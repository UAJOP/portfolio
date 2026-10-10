/* V4-E06.6 — the presentation gate for the Works catalog, the Games archive
 * and the Request surface.
 *
 *   npm run build:site && npm run qa:v4:works-presentation
 *
 * scripts/qa-v4-works-coverage.mjs answers "is the right thing listed?".
 * This answers "is everything listed presented as a card, completely and
 * honestly?": one card per standalone project, in the tier its catalog entry
 * names, with a visual, a status, a summary, a stack and links that exist;
 * collections as collections; nothing surfaced that the catalog excludes.
 * Static: it reads the catalog, the messages and the production build. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "dist-site");
const LOCALES = ["en", "tr", "de", "es", "fr"];
const TIERS = ["featured", "standard", "compact"];
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const json = (file) => JSON.parse(read(file));
const page = (locale, route) => fs.readFileSync(path.join(DIST, locale === "en" ? "" : locale, route, "index.html"), "utf8");

let passed = 0;
const failures = [];
function ok(name, pass, detail = "") {
  if (pass) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const catalog = json("data/portfolio/catalog.json");
const details = json("data/portfolio/project-details.json");
const members = catalog.collections.flatMap((collection) => collection.members);
const carded = [...catalog.identities, ...members.filter((member) => !member.incomplete)];
const incomplete = members.filter((member) => member.incomplete);
const messages = Object.fromEntries(LOCALES.map((locale) => [locale, json(`data/i18n/messages/${locale}/common.json`)]));

/* ---------- 1. every entry that deserves a card has a complete one ---------- */
for (const identity of catalog.identities) ok(`1. ${identity.id}: a standalone project has a card`, Boolean(identity.card));
for (const member of incomplete) ok(`1. ${member.id}: an unfinished repository has no card`, !member.card);
for (const entry of carded) {
  const card = entry.card || {};
  ok(`1. ${entry.id}: tier is one of ${TIERS.join(", ")}`, TIERS.includes(card.tier), String(card.tier));
  ok(`1. ${entry.id}: has an image or an identity plate, not both`, Boolean(card.image) !== Boolean(card.plate));
  ok(`1. ${entry.id}: names 3 to 6 stack tokens`, Array.isArray(card.stack) && card.stack.length >= 3 && card.stack.length <= 6 && new Set(card.stack).size === card.stack.length, String(card.stack?.length));
  if (card.image) {
    ok(`1. ${entry.id}: the image source exists`, fs.existsSync(path.join(ROOT, card.image.source)), card.image.source);
    ok(`1. ${entry.id}: has card variants`, (card.image.variants || []).length >= 1);
    for (const variant of card.image.variants || []) {
      const file = path.join(ROOT, variant.src);
      ok(`1. ${entry.id}: variant ${variant.src} exists and is published`, fs.existsSync(file) && fs.existsSync(path.join(DIST, variant.src)));
      ok(`1. ${entry.id}: variant ${variant.src} is a card-sized image`, variant.width <= 960 && fs.existsSync(file) && fs.statSync(file).size <= 90_000, `${variant.width}px`);
    }
  }
  if (card.roleRef) ok(`1. ${entry.id}: its role has a canonical source`, card.roleRef === "sinama" || Boolean(details[card.roleRef]?.role), card.roleRef);
  for (const locale of LOCALES) {
    const summary = messages[locale][`catalog.card.${entry.id}.summary`];
    ok(`1. ${locale}/${entry.id}: has a summary`, typeof summary === "string" && summary.length >= 40 && summary.length <= 260, String(summary?.length));
    if (locale !== "en") ok(`1. ${locale}/${entry.id}: the summary is translated`, summary !== messages.en[`catalog.card.${entry.id}.summary`]);
  }
  /* Honesty is carried by the status; the copy does not apologise for the work. */
  ok(`1. ${entry.id}: the summary does not diminish the work`, !/\b(just a|simple little|basic project|small project|old game|nothing special|only a)\b/i.test(messages.en[`catalog.card.${entry.id}.summary`] || ""));
}
const tiersOf = (list) => Object.fromEntries(TIERS.map((tier) => [tier, list.filter((entry) => entry.card.tier === tier).length]));
const expected = tiersOf(carded);
ok("1. the hierarchy is tiered, not flat", expected.featured >= 5 && expected.standard >= 8 && expected.compact >= 5 && expected.featured < expected.standard + expected.compact, JSON.stringify(expected));
ok("1. every learning-collection member is a compact card", members.filter((member) => !member.incomplete).every((member) => member.card.tier === "compact"));
ok("1. no native game or learning artifact is presented at flagship size", carded.filter((entry) => entry.card.tier === "featured").every((entry) => entry.group === "current"));
for (const group of catalog.groups) {
  const lead = catalog.cards.lead[group];
  if (lead) ok(`1. group ${group}: its lead card belongs to it`, catalog.identities.some((identity) => identity.id === lead && identity.group === group), lead);
}

/* ---------- 2. the built pages, five locales ---------- */
/* A card runs from its opening <li> to the next card (or the end of its grid). */
function cardBlocks(html, attribute) {
  const starts = [...html.matchAll(/<li class="v4-catalog__row v4-pcard[^"]*"[^>]*>/g)];
  return starts.map((match, index) => {
    const end = Math.min(...[starts[index + 1]?.index, html.indexOf("</ul></details>", match.index), html.indexOf("</ul></section>", match.index), html.indexOf('<li class="v4-pcard v4-pcard--note"', match.index)].filter((value) => value !== undefined && value > match.index));
    return { id: new RegExp(`${attribute}="([^"]+)"`).exec(match[0])?.[1], open: match[0], html: html.slice(match.index, end) };
  }).filter((card) => card.id);
}
const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const privateRepos = catalog.repositories.filter((entry) => entry.visibility === "private").map((entry) => entry.repo.toLowerCase());
const unrepresented = catalog.repositories.filter((entry) => !entry.identity && !entry.collection);

for (const locale of LOCALES) {
  const works = page(locale, "works");
  const games = page(locale, "games");
  const projectCards = cardBlocks(works, "data-catalog-id");
  const memberCards = cardBlocks(works, "data-catalog-member");

  ok(`2. ${locale}: one card per standalone project, no duplicates`, projectCards.length === catalog.identities.length && new Set(projectCards.map((card) => card.id)).size === catalog.identities.length, `${projectCards.length} of ${catalog.identities.length}`);
  ok(`2. ${locale}: one card per collection member that has a page`, memberCards.length === members.length - incomplete.length && new Set(memberCards.map((card) => card.id)).size === memberCards.length, String(memberCards.length));
  ok(`2. ${locale}: no plain project list is left`, !/class="v4-catalog__list"/.test(works) && !/class="v4-catalog__tech"/.test(works));
  for (const group of catalog.groups) ok(`2. ${locale}: group ${group} is a keyboard-operable <details> revealing a card grid`, new RegExp(`<details[^>]*id="catalog-${group}"[^>]*><summary>[\\s\\S]*?</summary><ul class="v4-pcards`).test(works));
  ok(`2. ${locale}: the curated explorer above is untouched in size`, (works.match(/data-v4-card=""/g) || []).length === 10);

  const byId = new Map([...projectCards, ...memberCards].map((card) => [card.id, card]));
  for (const entry of carded) {
    const card = byId.get(entry.id);
    if (!card) { ok(`2. ${locale}/${entry.id}: rendered`, false); continue; }
    ok(`2. ${locale}/${entry.id}: rendered in its tier`, card.open.includes(`data-card-tier="${entry.card.tier}"`) && card.open.includes(`v4-pcard--${entry.card.tier}`));
    const hasImage = /<img [^>]*alt=""[^>]*srcSet=|<img [^>]*alt=""[^>]*srcset=/i.test(card.html) && /loading="lazy"/.test(card.html) && /width="\d+"/.test(card.html) && /height="\d+"/.test(card.html);
    const hasPlate = card.html.includes("v4-pcard__media--plate") && card.html.includes('aria-hidden="true"');
    ok(`2. ${locale}/${entry.id}: shows its ${entry.card.image ? "image, lazily and sized" : "identity plate"}`, entry.card.image ? hasImage && !hasPlate : hasPlate && !/<img/.test(card.html));
    ok(`2. ${locale}/${entry.id}: has status, title link, summary, stack and actions`, ["v4-catalog__status", "v4-pcard__title", "v4-pcard__summary", "v4-pcard__stack", "v4-pcard__actions"].every((part) => card.html.includes(part)) && plain(card.html).includes(messages[locale][`catalog.card.${entry.id}.summary`]));
    ok(`2. ${locale}/${entry.id}: no empty action slot or placeholder link`, !/href="#?"/.test(card.html) && !/<a[^>]*><\/a>/.test(card.html));
    if (entry.kind === "browserGame") {
      ok(`2. ${locale}/${entry.id}: offers Play and Case Study together`, card.html.includes(entry.links.play) && card.html.includes(entry.links.caseStudy) && card.open.includes("data-card-playable"));
    } else {
      ok(`2. ${locale}/${entry.id}: is not marked playable`, !card.open.includes("data-card-playable"));
    }
    if (!["live", "playable"].includes(entry.status)) ok(`2. ${locale}/${entry.id}: an archive or learning status is not shown as live`, !/data-catalog-status="(live|playable)"/.test(card.html));
    if (!entry.links.github) ok(`2. ${locale}/${entry.id}: no repository link is invented`, !card.html.includes("github.com"));
  }
  for (const member of incomplete) {
    ok(`2. ${locale}/${member.id}: named in the note, never a card or a page`, !byId.has(member.id) && works.includes(`class="v4-catalog__row" data-catalog-member="${member.id}"`) && !fs.existsSync(path.join(DIST, locale === "en" ? "" : locale, "projects", member.id)));
  }
  for (const entry of unrepresented) {
    const name = entry.repo.split("/")[1];
    if (name === "UAJOP") continue;
    ok(`2. ${locale}: ${entry.repo} (${entry.disposition}) is not surfaced`, !works.includes(`github.com/${entry.repo}`) && !games.includes(`github.com/${entry.repo}`));
  }
  ok(`2. ${locale}: no private repository is named on Works or Games`, privateRepos.every((repo) => !works.toLowerCase().includes(`github.com/${repo}`) && !games.toLowerCase().includes(`github.com/${repo}`)));

  /* Games: four browser games with the shared treatment, then the native archive as cards. */
  const native = cardBlocks(games, "data-catalog-id");
  const nativeIds = catalog.identities.filter((identity) => identity.group === "nativeGames").map((identity) => identity.id);
  ok(`2. ${locale}: Games shows the native archive as ${nativeIds.length} cards`, native.length === nativeIds.length && nativeIds.every((id) => native.some((card) => card.id === id)));
  ok(`2. ${locale}: no native game card claims to be playable`, native.every((card) => !card.open.includes("data-card-playable") && !/data-catalog-status="(live|playable)"/.test(card.html)));
  const playable = [...games.matchAll(/<article class="project-card game-card[^>]*data-card-playable=""[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[0]);
  ok(`2. ${locale}: Games gives the four browser games one playable treatment`, playable.length === 4);
  for (const identity of catalog.identities.filter((entry) => entry.kind === "browserGame")) {
    const card = playable.find((html) => html.includes(`${identity.links.play}"`));
    ok(`2. ${locale}/${identity.id}: its Games card pairs Play with Case Study and shows the game`, Boolean(card) && card.includes(identity.links.caseStudy) && card.includes(`/${identity.card.image.variants[0].src}`));
  }

  /* Request: the collaboration surface. */
  const request = page(locale, "request");
  ok(`2. ${locale}: Request keeps the accepted form`, request.includes("data-request-form") && (request.match(/<(input|select|textarea)[^>]* required[ =/>]/g) || []).length >= 5 && request.includes("data-request-submit") && request.includes('name="consent"'));
  ok(`2. ${locale}: Request offers direct contact`, request.includes("v4-request-direct") && request.includes('href="mailto:') && request.includes("linkedin.com/in/"));
  ok(`2. ${locale}: Request speaks to the visitor, not about the endpoint`, !/no-cors|Apps Script/i.test(request.slice(request.indexOf("<main"), request.indexOf("</main>"))) && plain(request).includes(messages[locale]["request.v4.note"]));
  ok(`2. ${locale}: Request loads its stylesheet`, request.includes("/css/v4-request.css"));
}

/* ---------- 3. what E06.5 removed stays removed ---------- */
for (const slug of ["weather-app", "calculator-javascript"]) {
  ok(`3. ${slug}: no project record`, !Object.hasOwn(details, slug));
  for (const locale of LOCALES) ok(`3. ${locale}/${slug}: no page`, !fs.existsSync(path.join(DIST, locale === "en" ? "" : locale, "projects", slug)));
}
ok("3. no project status is the generic \"Repository\"", Object.values(details).every((record) => !/^repository$/i.test(record.status.en)));

/* ---------- 3b. no cover that imitates a screenshot is shown ----------
 * Retired covers (generated mock-ups, stock art, third-party logos) do not
 * appear in the main content of Works, Games, a project page or a case
 * study. Home is outside this phase and is not checked here. */
const retired = catalog.cards.retiredCovers;
const mainOf = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const shows = (html, file) => mainOf(html).includes(`/${encodeURI(file)}"`) || mainOf(html).includes(`/${file}"`);
const caseRoutes = ["sinama-case-study", "atolye-joyday-case-study", "hospital-system-case-study", "ai-flow-puzzle-case-study", "career-adventure-case-study", "portfolio-case-study", "ajoop-case-study"];
for (const locale of LOCALES) {
  const surfaces = [["works", page(locale, "works")], ["games", page(locale, "games")], ...caseRoutes.map((route) => [route, page(locale, route)]), ...Object.keys(details).map((slug) => [`projects/${slug}`, page(locale, `projects/${slug}`)])];
  for (const [name, html] of surfaces) {
    const found = retired.filter((file) => shows(html, file));
    ok(`3b. ${locale}/${name}: shows no retired cover`, found.length === 0, found.join(" "));
  }
  ok(`3b. ${locale}: the curated Works card of Merge Rush shows the game, not a drawn cover`, !shows(page(locale, "works"), "merge-rush-case-cover.svg"));
  for (const [slug, record] of Object.entries(details)) {
    const html = mainOf(page(locale, `projects/${slug}`));
    const entry = carded.find((item) => item.detailSlug === slug);
    if (entry?.card.plate) ok(`3b. ${locale}/projects/${slug}: the hero is an identity plate and there is no gallery of covers`, html.includes("v4-detail-plate") && !html.includes('class="detail-gallery"') && !/<div class="project-detail-visual[^"]*"[^>]*><img/.test(html));
    else ok(`3b. ${locale}/projects/${slug}: the hero is an image the record names`, [record.image, entry?.card.image?.source].filter(Boolean).some((file) => html.includes(`/${encodeURI(file)}"`) || html.includes(`/${file}"`)));
  }
}
for (const entry of carded.filter((item) => item.card.image?.evidence)) ok(`3b. ${entry.id}: its repository evidence is in the repository`, fs.existsSync(path.join(ROOT, entry.card.image.source)), entry.card.image.evidence);
for (const [file, owner] of Object.entries(catalog.cards.curatedCoverOwner)) ok(`3b. curated cover ${file} belongs to a carded entry`, carded.some((entry) => entry.id === owner), owner);
for (const [slug, record] of Object.entries(details)) {
  const entry = carded.find((item) => item.detailSlug === slug);
  if (!entry?.card.plate) ok(`3b. ${slug}: the record's image and gallery name no retired cover`, ![record.image, ...(record.gallery || [])].some((file) => retired.includes(file.split("/").pop())), record.image);
}

/* ---------- 4. the stylesheet keeps its promises ---------- */
const css = read("css/v4-catalog.css");
ok("4. archive and learning cards are not dimmed", !/\.v4-pcard--(compact|standard)[^{]*\{[^}]*(opacity|grayscale|saturate)/.test(css));
ok("4. focus is visible on cards and actions", css.includes(":has(.v4-catalog__title:focus-visible)") && css.includes(".v4-catalog :is(a):focus-visible"));
ok("4. motion yields to reduced motion", /prefers-reduced-motion: reduce\)[\s\S]*\.v4-pcard[\s\S]*transition: none/.test(css));
ok("4. one column on phones, more as the page widens", css.includes("grid-template-columns: minmax(0, 1fr)") && css.includes("repeat(2, minmax(0, 1fr))") && css.includes("repeat(3, minmax(0, 1fr))") && css.includes("repeat(4, minmax(0, 1fr))"));

if (failures.length) {
  console.error(`Works presentation: ${failures.length} failed, ${passed} passed`);
  failures.slice(0, 40).forEach((failure) => console.error(`  FAIL ${failure}`));
  process.exit(1);
}
console.log(`Works presentation: ${passed} checks passed · ${catalog.identities.length} project cards + ${members.length - incomplete.length} collection cards · tiers ${JSON.stringify(expected)}`);
