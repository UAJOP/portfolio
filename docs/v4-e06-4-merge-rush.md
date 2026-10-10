# V4-E06.4 — Merge Rush: Tiny Factory, playable in the portfolio

`/merge-rush/` is the game's portfolio-facing page. **Play Merge Rush** enters a
full-viewport play mode; the site's header, footer and floating controls step
out until the visitor leaves. `/merge-rush-case-study/` is rebuilt from the game
as it now is, and the Games and Works cards offer Play and Case Study.

## Two repositories

The game is not built here.

```text
private, canonical source          UAJOP/merge-rush-tiny-factory
Phaser 3 + TypeScript + tests      branch feat/portfolio-playable-v1
        ↓  npm run build:portfolio
dist-portfolio/merge-rush.js + assets/
        ↓  node scripts/v4-e06-4-sync-merge-rush.mjs <game checkout>
assets/merge-rush/                 this repository, committed
```

What ships is the production build: one minified ES module that exports
`mountMergeRush`, WebP art and Ogg/MP3 audio. The sync script refuses anything
else (a source map, TypeScript, a test hook, an asset manifest). The art
masters, the tests and the source stay private. The page offers Play and the
case study; it has no GitHub action, because the repository is private.

Shipped build: source commit `e42c127` (`feat/portfolio-playable-v1`).

## What is where

| Piece | File |
| --- | --- |
| The game (module, art, audio) | `assets/merge-rush/` |
| Poster: a capture of the game mid-run | `assets/merge-rush/poster.webp` |
| Page and case-study structure, head | `scripts/v4-merge-rush-page.mjs` |
| Route, build model hooks | `data/site/routes.json`, `scripts/home-about-react.mjs` |
| Way in and way out (the only script) | `js/pages/merge-rush-game.js` |
| Page and stage styles | `css/v4-merge-rush.css` |
| Games/Works cards, as a reviewed delta | `scripts/v4-e06-4-merge-rush-edits.mjs` |
| English source document for the localized documents | `merge-rush/index.html` |
| Copy, five locales | `mergeRush.play.*`, `mergeRush.case.*`, `mergeRush.card.*` in `data/i18n/messages/*/common.json` |
| Route meta, five locales | `mergeRush` in `data/i18n/source/meta.json`, `data/i18n/packs/*/meta.json` |
| Focused QA and the review pack | `scripts/v4-e06-4-merge-rush-review.mjs` |

## Architecture

```text
React (prerendered page)      identity, premise, Play, case study, no-JS notice, stage markup
        ↓
js/pages/merge-rush-game.js   html[data-mr-state]: loading · playing · error
        ↓  import() on Play, never before
mountMergeRush(host, …)       locale, host: "portfolio", assetBase, onReady / onError / onExit
        ↓
Phaser game                   menu, board, orders, input, timers, audio, pause, results, Endless
```

Mounting is direct, not a frame: the game draws only inside its canvas, so
there is no CSS to isolate, and focus, touch, Back and the locale need no
bridge.

| `html[data-mr-state]` | Screen |
| --- | --- |
| absent | The page |
| `loading` | The module and its art are on the way (with Exit) |
| `playing` | The game has the viewport |
| `error` | It did not arrive: Try Again, Exit to Portfolio, View Case Study |

- Nothing of the engine is requested before Play. The six ladder images on the
  page are the game's own files, so the game finds them cached.
- One history entry is added on entering. Back, the game's own Exit to
  Portfolio (menu, pause, win, loss) and Exit on the loading and failure panels
  all leave; leaving destroys the game.
- While playing, the rest of the document is `inert` and hidden, AJOOP included.
- Inside the game, Escape is the game's pause. On the loading and failure
  panels it leaves.
- A hidden tab pauses the run inside the game; it never resumes by itself.

## The case study

The accepted #29 page was written while the game was an unreleased prototype.
It described systems the canonical source does not have (multi-cell
footprints, a Repair Energy currency, named restoration stages) and presented
the game as unreleased. The route now renders
`mergeRushCaseStudyStructure`: the same page shape and classes, with every
statement taken from the source that built `assets/merge-rush/`. The accepted
head is kept. The Games and Works summaries dropped the same multi-cell claim.

## Gates

- `node scripts/v4-e06-4-merge-rush-review.mjs`: 54 checks on the production
  build (five locales, Play, entered mode, Back, Exit, case study, Games,
  Works, phone, tablet, no JavaScript, forced failures, Home untouched).
- The game's own gates run in its repository: 82 unit tests and a real-input
  browser pass (69 checks).
- Pass here: `qa:i18n`, `qa:routes`, `qa:css`, `qa:html`, `qa:assets`,
  `qa:links`, `qa:js`, `qa:a11y:static`, `qa:seo`, `qa:performance`,
  `qa:spelling`, `qa:foundation`, `qa:projects`, `qa:data`, `qa:design`,
  `qa:recruiter`, `qa:analytics`.
- `qa:runtime` fails on the same class of check as after E06.1–E06.3 (page
  controllers and V4 page types the runtime manifest does not list); this
  phase adds `js/pages/merge-rush-game.js` and `data-page="mergeRush"` to that
  list.
- `qa:m3:foundation` stops at its approved-renderer list, which has not named
  a V4-native route since E04; it now stops at `mergeRush` instead of `ajoop`.
- The #29 case-study and #26 catalog parity gates still describe the accepted
  copy. **They have not been rewritten or run**: the Merge Rush case study and
  its two cards are deliberate departures from it.

## Not done here

- `data/portfolio/projects.json` still records Merge Rush as "Active
  Development" (Home ecosystem, recruiter evidence, AJOOP knowledge). That
  belongs to the Works/GitHub coverage phase.
- The legacy source document `merge-rush-case-study/index.html` and its
  localized copies keep the old copy. They are not what the production build
  serves for that route.
- Real-device verification: touch, safe areas and frame pacing were checked in
  emulation only.

## For the Works / coverage pass

```json
{
  "id": "merge-rush",
  "title": "Merge Rush: Tiny Factory",
  "status": "Playable V1",
  "playRoute": "/merge-rush/",
  "caseStudyRoute": "/merge-rush-case-study/",
  "repository": "private (no public GitHub action)",
  "coreMechanic": "5×5 grid merge and order delivery: place parts, merge twins up a six-tier ladder, deliver the product each timed order asks for; deliveries unlock the floor; the final order is the Factory Core.",
  "ladder": ["Bolt", "Gear", "Motor", "Machine", "Robot", "Factory Core"],
  "modes": ["Factory Run (4 minutes, 5 levels)", "Endless (damage and repair)"],
  "stack": ["Phaser 3", "TypeScript", "Vite", "Vitest"],
  "architecture": "Pure GameState rules engine, Phaser scene for rendering and input, platform adapters (browser, YouTube Playables), one mount function for hosts.",
  "evidence": "scripts/v4-e06-4-merge-rush-review.mjs here; unit tests, balance simulation and real-input browser QA in the game repository"
}
```
