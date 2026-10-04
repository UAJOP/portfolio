# Master 3 #30 — Labs and Mini-game Shells

Base: `main` at `760feca` (#29). Scope: the four canonical page routes `labs`, `adventure`, `joydayPaint` and `aiFlowPuzzle` in every active locale — 4 × 5 = 20 documents, taking the React-owned total from 170 to 190. The count is derived from `data/site/routes.json` and `data/i18n/locales.json`.

## Inventory before #30

| Route | Document runtime | Boot | Listeners | Frames / timers | Surface |
| --- | --- | --- | --- | --- | --- |
| `/labs/` | `js/pages/labs.js`, loaded by `script.js` for `data-page="labs"`; cards rendered by `portfolio-v2.js` into an empty `[data-labs-grid]` | Top-level call when the script is parsed; `portfolio-v2.js` at `DOMContentLoaded` | 5 on the canvas, 1 on `window` (resize), 1 `IntersectionObserver` | One `requestAnimationFrame` loop while the canvas is visible | `#math-3d-canvas` |
| `/adventure/` | `adventure-game.js` (page script tag), `js/pages/games.js` | IIFE at parse time | 4 on the canvas, 3 on buttons, 2 on `window` (keydown, resize) | One permanent `requestAnimationFrame` loop; one restart timeout | `#career-merge-canvas` |
| `/joyday-paint/` | `joyday-paint.js`, `js/pages/games.js` | IIFE at parse time | 28 (tools, controls, modal, canvas, `window` pointerup and keydown) | Two short UI timeouts; an `AudioContext` on demand | `#joyday-art-canvas` |
| `/ai-flow-puzzle/` | `ai-flow-puzzle.js`, `js/pages/games.js` | IIFE at parse time | 26 (controls, rendered nodes, `window` resize, `document` keydown and drag) | A one-shot frame per board render; the run timer | `[data-ai-board]` (DOM + SVG, no canvas) |

All four mutate their page markup the moment they run: text from the locale pack, the merge ladder, the colour palette, scenario lists, the random Joyday prompt. Every script keeps its state in a closure; none exposed a way to stop.

## Ownership

| Surface | Before | After |
| --- | --- | --- |
| Route identity | `data/site/routes.json`, `renderer: legacy` | Same registry, `renderer: react` |
| Page markup, head, metadata | Static accepted documents | React SSR from `data/site/m3-30-labs-games-structure.json`, captured from those accepted documents by `scripts/generate-m3-labs-games-structure.mjs` |
| Labs experiment cards | `portfolio-v2.js`, client-side | React SSR from `data/portfolio/labs.json` and the locale content packs; the legacy renderer stands down below `[data-react-main]` |
| Header, footer, Recruiter, Ajoop, Command Palette | Legacy per page | The existing production React owners |
| Game mechanics, canvas drawing, game copy, PNG/JSON export | The four vanilla engines | Unchanged: the same four files |
| Engine start and stop | Each script, at parse time | `js/pages/engine-host.js`, after hydration |

React owns every node of `<main>` until hydration completes. From then on the engine owns the dynamic state of the nodes it always managed (text it localizes, lists it renders, the canvas). React never re-renders these pages — they have no React state — so the two do not contend.

## Architecture decision

**React shell, retained engines, one host-owned lifecycle.**

The shared client bundle had 5 bytes of raw headroom (259,995 of 260,000). A React wrapper component per game, or a dynamic `import()`, would have gone into that bundle. Instead the lifecycle lives in a 3 KB classic script that only these four pages load, and the shared bundle is byte-identical to #29 (`production-main-iIPZYrVE.js`). No per-route chunk exists.

1. Each engine's IIFE became a named start function taking an `AbortSignal`. On a legacy document it still runs immediately, exactly as before. On a React-owned document it queues itself in `window.KaanEngineQueue` instead.
2. `js/pages/engine-host.js` — the last classic script of the document — drains the queue and gives each engine id one lifecycle:
   - **mount** once, on `portfolio:react-main-hydrated`. Hydration therefore always compares the server markup with an untouched DOM.
   - **dispose** aborts the signal. Every listener the engine registered carries that signal, so they are removed; the animation frame is cancelled; pending timers are guarded; the language hook is deleted; Joyday closes its modal and audio context.
   - **remount** (mount after dispose) starts a fresh engine on the same markup.
   - `mount` is idempotent, and an id queued twice (the same script evaluated again) is ignored.
3. If the React client bundle cannot be fetched, the host starts the engines anyway: the server markup is final and the game still works.

With JavaScript disabled every page still renders its heading, description, controls and, on Labs, the four experiment cards.

## Engine changes

All four engines are reviewed, reversible edits (`scripts/m3-30-public-edits.mjs`, 54 hunks): the accepted `760feca` bytes plus exactly those edits, checked by reversal against the previously pinned hashes.

- Lifecycle only: the start wrapper, `{ signal }` on each `addEventListener`, frame/timer guards, abort cleanup.
- Asynchronous completions belong to the engine that started them. AI Flow tracks its pending `FileReader`s, aborts them on dispose, and ignores a file read or a clipboard write that completes after disposal, so a late completion cannot write into the board of an engine mounted afterwards.
- Keyboard isolation: Adventure and AI Flow ignore keys while the page is `inert`, which is how every overlay (Recruiter, Ajoop, Command Palette) marks the page behind it. Before, Space with the Recruiter drawer open still dropped an object.
- **One defect repaired.** `edgeLabel` in `ai-flow-puzzle.js` read an undeclared `tr` since `ad10eae` (2026-08-30), so connecting two nodes or loading a template threw `ReferenceError: tr is not defined`. The fix restores the missing flag (`const tr = lang() === "tr"`); the three labels and their fallback are unchanged, and no translatable phrase is added. The gate reproduces the defect on the accepted engine.

No drawing, physics, scoring, validation or export code changed.

## Verification boundary

`qa:m3:labs-games` (G-71), in `qa:react` and in the blocking `qa:m3:artifact` chain:

- **Static, 20 documents:** registry-derived coverage, doctype, SSR main, one `h1`, document locale, canonical, hreflang, accepted title/description/OpenGraph, page type, main copy and inline whitespace equal to the accepted document, element counts, engine script + host script order, page stylesheet, server-rendered engine surface, no inline handlers, Labs anchor and four localized cards, compatibility redirects, bundle budget, engine code absent from the shared bundle, contract freshness, and one valid `WebPage` JSON-LD record per document that agrees with the route, canonical, document language, title, description and `og:image`. 23 negative controls.
- **Browser, every document** (English in desktop/mobile × dark/light, the other locales alternating): no markup change before hydration, hydration without recoverable error or node replacement, engine not started before hydration and mounted exactly once after it, visible surface, no console diagnostics; the rendered `<main>` equal to what the accepted runtime renders; every element's box (±1 px) and computed style equal to the accepted page.
- **Gameplay**, the same script on the accepted and on the React document, outcomes compared: Labs (cards, anchor, drag, wheel, resize, theme, touch), Adventure (keyboard aim and drop, pointer aim, button and canvas drop, merge on contact after the fall, score and best, restart, touch), Joyday (brush, colour, thickness, intensity, undo/redo, spray, bottle, balloon, three canvas shapes, finish modal, clean and branded PNG, Escape, touch, hit targets), AI Flow (add, connect, duplicate refusal, drag, remove link and node, Delete, validation fail/pass rules, run log, PNG and JSON export, reset, next scenario, touch). Extended scripts: Adventure played to Job Offer (whole ladder unlocked, no drop after the win, View resume, Play again, best score kept, input restored); Joyday sound (silent and context-free while off, one context from the visitor's click, one sound per paint action, reuse on re-enable); AI Flow JSON import (a real export round-trips and validates, four malformed files are refused and leave the board unchanged, unknown node types and dangling links are dropped).
- **Outcome comparison is typed.** Scores, counts, states, labels and export dimensions are compared exactly. Only listed paths get a tolerance: painted-pixel counts (1.5%, anti-aliasing at sub-pixel pointer positions), measured boxes (1 px), and the two values the physics of a winning run decides (drop count and final score, each required to be positive). 14 controls change one real outcome value and require the rule for that value to reject it.
- **Lifecycle**, per engine: idempotent second mount, the script evaluated twice, dispose (frames stop, listeners removed, hook deleted), three dispose/mount cycles without listener growth (counted through the DevTools protocol), playable after remount, start when the bundle fails to load. Joyday audio: dispose closes the audio context, a remounted studio starts silent. AI Flow: a held-back JSON import and a pending clipboard write (resolved and rejected) are delivered after dispose and remount and leave the fresh board's nodes, links and status unchanged; import and copy still work on the remounted engine.
- **Isolation:** keys typed into an overlay input or pressed while an overlay is open do not reach the game; they work again after it closes.
- 38 browser negative controls: 14 on the outcome comparator and 24 that serve a mutated copy of the real shipped script or document, each of which must be reported by the check it targets.

The older gates derive their React document count from the registries. The parity gate approves exactly four more page ids, rejects an unapproved one (`now`) and a missing one (`joydayPaint`) through the real ownership check, and pins the one new public file by hash.

## Known differences from the accepted documents

- The Adventure "View resume" button no longer has an inline `onclick`; React attaches the same `openDrivePreviews()` call.
- The Adventure and Joyday `<aside>` elements carry an `aria-label` (their localized section eyebrow), and the Ajoop aside is labelled on the three game routes, because a React document has several complementary landmarks.
- Labs gains `og:title`, `og:description` and `og:image` from the canonical page meta; the accepted document had none.
- All 20 documents gain a `WebPage` JSON-LD record. The accepted documents had no structured data. It restates the head (title, description, canonical URL, language, image) plus the site and author, and makes no claim about the game.
- The lab-card call to action is resolved as the runtime resolves it: the locale pack phrase for "Open experiment", else the Turkish text `portfolio-v2.js` carries inline, else English. No pack defines the phrase, so German, Spanish and French show English, exactly as the accepted pages do. That is missing locale content that predates #30; adding the phrase to the three `pages.json` packs fixes the runtime and the server render together.
- The AI Flow accepted engine could not connect nodes; its gameplay baseline is therefore the accepted document running the repaired engine.
- Not automated: the Adventure loss path (the board overflowing and auto-restarting), the audible output of Joyday sound (only that sounds are scheduled on an open context), and AI Flow's text-report download.
- The contract is captured from the accepted documents. If a locale pack later changes one of them, regenerate with `npm run m3:labs-games:structure`; the gate fails until it matches.

Legacy documents, redirect stubs and the engines stay in place. `now`, `blog`, `certificates`, `request` and `privacy` are untouched (#30.5).
