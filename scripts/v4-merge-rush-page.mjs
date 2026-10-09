/* V4-E06.4 — /merge-rush/, the playable page of Merge Rush: Tiny Factory.
 *
 * The game is not built in this repository. Its source (Phaser 3 +
 * TypeScript, with its own tests) lives in its own private repository; what
 * ships here is that repository's production build:
 *
 *   assets/merge-rush/merge-rush.js     one ES module exporting mountMergeRush
 *   assets/merge-rush/assets/           the optimized art and audio it loads
 *
 * (scripts/v4-e06-4-sync-merge-rush.mjs copies a build in and records which.)
 *
 * This file builds the portfolio-facing page around it, at build time, from
 * the message catalog: who the game is, what a run is, Play, and the way to
 * the case study. The page states the game's rules and its stack and nothing
 * else — no player counts, no ratings, no benchmark. The public page offers
 * Play and the case study; it does not link the private repository.
 *
 * The game itself mounts into the stage only after Play
 * (js/pages/merge-rush-game.js), so no route pays for Phaser unless a visitor
 * asks for the game. */

export const MERGE_RUSH_ROUTE = "mergeRush";
export const MERGE_RUSH_SCRIPT = "/js/pages/merge-rush-game.js";
export const MERGE_RUSH_MODULE = "/assets/merge-rush/merge-rush.js";
export const MERGE_RUSH_ASSETS = "/assets/merge-rush/assets/";
export const MERGE_RUSH_POSTER = "/assets/merge-rush/poster.webp";
const NAME = "Merge Rush: Tiny Factory";
/* Stated by the game's own package and case study. */
const STACK = "Phaser 3 · TypeScript · Vite";
const TIERS = ["bolt", "gear", "motor", "machine", "robot-arm", "factory-core"];

const text = (value) => ({ type: "text", value: String(value) });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => (typeof value === "string" ? text(value) : value)),
});

export function mergeRushStructure({ message, locale, caseStudyHref, gamesHref }) {
  const m = (key) => message(`mergeRush.play.${key}`);
  const fact = (label, value) => element("div", { class: "mr-fact" }, [element("dt", {}, [label]), element("dd", {}, [value])]);
  const step = (index) => element("li", { class: "mr-step" }, [
    element("span", { class: "mr-step__index", "aria-hidden": "true" }, [`0${index}`]),
    element("h3", {}, [m(`steps.${index}.title`)]),
    element("p", {}, [m(`steps.${index}.body`)]),
  ]);
  return [
    element("section", { class: "section-shell mr-hero" }, [
      element("div", { class: "mr-hero__copy" }, [
        element("p", { class: "eyebrow" }, [m("eyebrow")]),
        element("h1", {}, [NAME]),
        element("p", { class: "mr-hero__lead" }, [m("lead")]),
        element("div", { class: "hero-actions left mr-hero__actions" }, [
          element("button", { class: "btn primary mr-enter", type: "button", "data-mr-enter": "" }, [m("enter")]),
          element("a", { class: "btn ghost", href: caseStudyHref }, [m("caseStudy")]),
        ]),
        /* Without JavaScript there is no game to offer; say so and point at what can be read. */
        element("noscript", {}, [
          element("div", { class: "mr-noscript" }, [
            element("p", {}, [m("noscript")]),
            element("p", { class: "mr-noscript__links" }, [
              element("a", { class: "btn primary", href: caseStudyHref }, [m("caseStudy")]),
              element("a", { class: "btn ghost", href: gamesHref }, [m("backToGames")]),
            ]),
          ]),
        ]),
      ]),
      /* The poster is a capture of the game itself; it is the second way in. */
      element("button", { class: "mr-poster", type: "button", "data-mr-enter": "", "aria-label": m("enter") }, [
        element("img", { src: MERGE_RUSH_POSTER, alt: "", width: "1200", height: "750", decoding: "async", fetchpriority: "high" }),
        element("span", { class: "mr-poster__play", "aria-hidden": "true" }, [m("enter")]),
      ]),
    ]),
    element("section", { class: "section-shell mr-about" }, [
      element("dl", { class: "mr-facts", "aria-label": m("facts.aria") }, [
        fact(m("facts.statusLabel"), m("facts.status")),
        fact(m("facts.loopLabel"), m("facts.loop")),
        fact(m("facts.modesLabel"), m("facts.modes")),
        fact(m("facts.stackLabel"), STACK),
      ]),
      element("h2", { class: "mr-about__heading" }, [m("steps.heading")]),
      element("ol", { class: "mr-steps" }, [step(1), step(2), step(3)]),
      /* The six-tier ladder, in the game's own art. Decorative: step 01 names it. */
      element("div", { class: "mr-ladder", "aria-hidden": "true" }, TIERS.map((tier) => element("img", { src: `${MERGE_RUSH_ASSETS}items/${tier}.webp`, alt: "", width: "288", height: "288", loading: "lazy", decoding: "async" }))),
    ]),
    /* The stage: empty until Play. The controller mounts the game into the
     * canvas host and owns every state below through html[data-mr-state]. */
    element("section", {
      class: "mr-stage",
      id: "merge-rush-game",
      "aria-label": m("aria"),
      "data-mr-root": "",
      "data-mr-locale": locale,
      "data-mr-module": MERGE_RUSH_MODULE,
      "data-mr-assets": MERGE_RUSH_ASSETS,
    }, [
      element("div", { class: "mr-stage__canvas", "data-mr-canvas": "" }),
      element("div", { class: "mr-stage__panel mr-stage__loading", "data-mr-loading": "", role: "status" }, [
        element("span", { class: "mr-stage__spinner", "aria-hidden": "true" }),
        element("p", {}, [m("loading")]),
        element("button", { class: "btn ghost", type: "button", "data-mr-exit": "" }, [m("exit")]),
      ]),
      element("div", { class: "mr-stage__panel mr-stage__error", "data-mr-error": "", role: "alert" }, [
        element("h2", {}, [m("error.title")]),
        element("p", {}, [m("error.body")]),
        element("div", { class: "mr-stage__actions" }, [
          element("button", { class: "btn primary", type: "button", "data-mr-retry": "" }, [m("error.retry")]),
          element("button", { class: "btn ghost", type: "button", "data-mr-exit": "" }, [m("exit")]),
          element("a", { class: "btn ghost", href: caseStudyHref }, [m("caseStudy")]),
        ]),
      ]),
    ]),
  ];
}

/* The head, from the route's canonical per-locale meta. */
export function mergeRushHead({ meta, canonical, origin, alternates, htmlLang, ogLocale, authorName, themeBootstrap }) {
  if (!meta?.title || !meta?.description) throw new Error("mergeRush: missing canonical meta");
  const image = `${origin}${MERGE_RUSH_POSTER}`;
  return {
    title: meta.title, description: meta.description, keywords: null, canonical, robots: "index, follow",
    alternates,
    og: { siteName: "Kaan Balcı Portfolio", locale: ogLocale, title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, type: "website", url: canonical, image, imageWidth: "1200", imageHeight: "750" },
    twitter: { card: "summary_large_image", title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, image },
    themeBootstrap,
    /* What the page is, and nothing the game has not earned: no rating, no play count. */
    jsonLd: {
      "@context": "https://schema.org", "@type": "VideoGame", name: NAME, description: meta.description, url: canonical,
      inLanguage: htmlLang, image, genre: "Puzzle", gamePlatform: "Web browser", applicationCategory: "Game",
      author: { "@type": "Person", name: authorName, url: `${origin}/` },
      isPartOf: { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: `${origin}/` },
    },
  };
}

/* ---------- /merge-rush-case-study/ ---------- */

export const MERGE_RUSH_CASE_ROUTE = "mergeRushCaseStudy";

/* The case study, rebuilt from the game as it is.
 *
 * The accepted #29 page (data/site/m3-29-case-studies-structure.json) was
 * written while the game was an unreleased prototype. It described systems
 * the shipped source does not have (multi-cell footprints, a Repair Energy
 * currency, named restoration stages) and called the game case-study-only.
 * This is the same page shape and the same classes, with every statement
 * taken from the source that built assets/merge-rush/: its rules
 * (GameState.ts), its numbers (runConfig.ts), its hosts and its tests. The
 * head is the accepted one. */
export function mergeRushCaseStudyStructure({ message, playHref, gamesHref, recruiterHref, buildLogHref }) {
  const c = (key) => message(`mergeRush.case.${key}`);
  const heading = (eyebrow, title, body = null) => element("div", { class: "case-section-heading" }, [
    element("p", { class: "eyebrow" }, [eyebrow]),
    element("h2", {}, [title]),
    body ? element("p", {}, [body]) : null,
  ]);
  const section = (children) => element("section", { class: "case-section section-shell" }, children);
  const card = (title, body) => element("article", { class: "case-service-card" }, [element("h3", {}, [title]), element("p", {}, [body])]);
  const meta = (label, value) => element("div", {}, [element("dt", {}, [label]), element("dd", {}, [value])]);
  const proof = (value, label) => element("article", { class: "case-proof" }, [element("strong", {}, [value]), element("span", {}, [label])]);
  const shot = (value, label) => element("article", {}, [element("strong", {}, [value]), element("span", {}, [label])]);
  const steps = [message("mergeRush.loop.drop"), message("mergeRush.loop.merge"), message("mergeRush.loop.order"), c("loop.score"), c("loop.unlock"), c("loop.core")];
  return [
    element("section", { class: "case-hero section-shell" }, [
      element("div", {}, [
        element("p", { class: "eyebrow" }, [message("mergeRush.hero.eyebrow")]),
        element("div", { class: "case-status-note" }, [element("i", { class: "bx bx-joystick", "aria-hidden": "true" }), element("span", {}, [c("statusNote")])]),
        element("h1", {}, [NAME]),
        element("p", { class: "case-hero-lead" }, [c("lead")]),
        element("dl", { class: "case-meta-grid" }, [
          meta(message("mergeRush.play.facts.statusLabel"), message("mergeRush.play.facts.status")),
          meta(c("yearLabel"), "2026"),
          meta(c("roleLabel"), c("role")),
          meta(c("hostsLabel"), c("hosts")),
        ]),
        element("div", { class: "case-stack" }, ["Phaser 3", "TypeScript", "Vite", "Vitest", message("mergeRush.stack.responsiveUi"), message("mergeRush.stack.gameState"), "Platform Adapter"].map((item) => element("span", {}, [item]))),
        element("div", { class: "case-actions" }, [
          element("a", { class: "btn primary", href: playHref }, [element("i", { class: "bx bx-joystick", "aria-hidden": "true" }), element("span", {}, [message("mergeRush.play.enter")])]),
          element("a", { class: "btn ghost", href: gamesHref }, [element("span", {}, [message("mergeRush.cta.gamePortfolio")])]),
        ]),
        element("p", { class: "case-private-note" }, [c("privateNote")]),
      ]),
      element("figure", { class: "case-hero-visual" }, [
        element("img", { alt: c("posterAlt"), decoding: "async", fetchpriority: "high", src: MERGE_RUSH_POSTER, width: "1200", height: "750" }),
      ]),
    ]),
    element("section", { class: "case-proof-strip is-four section-shell", "aria-label": c("proof.aria") }, [
      proof(message("mergeRush.proof.runTarget.value"), message("mergeRush.proof.runTarget.label")),
      proof("5", c("proof.levels")),
      proof("25", message("mergeRush.proof.cells.label")),
      proof("6", c("proof.tiers")),
    ]),
    section([
      heading(message("mergeRush.problem.eyebrow"), c("problem.title")),
      element("div", { class: "case-split" }, [
        element("article", { class: "case-panel case-copy" }, [element("p", {}, [c("problem.p1")]), element("p", {}, [c("problem.p2")])]),
        element("article", { class: "case-panel case-copy" }, [
          element("p", { class: "eyebrow" }, [message("mergeRush.goal.eyebrow")]),
          element("h3", {}, [message("mergeRush.designGoal.title")]),
          element("p", {}, [c("goal.body")]),
        ]),
      ]),
    ]),
    section([
      heading(message("mergeRush.loop.eyebrow"), message("mergeRush.loop.title")),
      element("ol", { class: "case-journey" }, steps.map((step, index) => element("li", {}, [element("strong", {}, [`0${index + 1}`]), element("span", {}, [step])]))),
    ]),
    section([
      heading(message("mergeRush.engineering.eyebrow"), c("eng.title")),
      element("div", { class: "case-service-grid" }, [
        card(c("eng.state.title"), c("eng.state.body")),
        card(c("eng.weights.title"), c("eng.weights.body")),
        card(message("mergeRush.engineering.deadlock.title"), c("eng.deadlock.body")),
        card(message("mergeRush.engineering.endless"), message("mergeRush.engineering.repair")),
      ]),
    ]),
    section([
      heading(message("portfolio.label.progression"), c("prog.title")),
      element("div", { class: "case-service-grid" }, [1, 2, 3, 4, 5].map((level) => card(c(`prog.${level}.title`), c(`prog.${level}.body`)))),
    ]),
    section([
      heading(message("mergeRush.architecture.eyebrow"), c("arch.title")),
      element("div", { class: "case-service-grid" }, [
        card("Platform Adapter", message("mergeRush.platform.adapters")),
        card(c("arch.embed.title"), c("arch.embed.body")),
        card(message("mergeRush.architecture.lifecycle"), c("arch.lifecycle.body")),
        card(c("arch.assets.title"), c("arch.assets.body")),
      ]),
    ]),
    section([
      heading(message("mergeRush.qa.eyebrow"), c("qa.title"), c("qa.body")),
      element("div", { class: "qa-proof-grid" }, [
        shot("1440×900", message("mergeRush.qa.wide")),
        shot("390×844", message("mergeRush.qa.portrait")),
        shot("844×390", message("mergeRush.qa.landscape")),
        shot("820×1180", c("qa.tablet")),
        shot("EN · TR · DE · ES · FR", c("qa.locales")),
        shot("4×", c("qa.cpu")),
      ]),
    ]),
    section([
      heading(message("mergeRush.status.eyebrow"), c("status.title")),
      element("div", { class: "case-split" }, [
        element("article", { class: "case-panel case-copy" }, [element("h3", {}, [message("mergeRush.play.facts.status")]), element("p", {}, [c("status.done")])]),
        element("article", { class: "case-panel case-copy" }, [element("h3", {}, [message("mergeRush.status.refining.title")]), element("p", {}, [c("status.open")])]),
      ]),
    ]),
    element("section", { class: "section-shell contact-hub reveal" }, [
      element("div", {}, [
        element("p", { class: "eyebrow" }, [message("portfolio.label.roleEvidence")]),
        element("h2", {}, [c("cta.title")]),
      ]),
      element("div", { class: "contact-actions" }, [
        element("a", { class: "btn primary", href: playHref }, [message("mergeRush.play.enter")]),
        element("a", { class: "btn ghost", href: recruiterHref }, [message("portfolio.cta.gameRecruiterView")]),
        element("a", { class: "btn ghost", href: gamesHref }, [message("shell.nav.games")]),
        element("a", { class: "btn ghost", href: buildLogHref }, [message("games.direction.buildLog")]),
      ]),
    ]),
  ];
}
