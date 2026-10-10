# V4-E07 — Global experience and final design polish

E07 changes no page's design. It makes the parts every page shares come from
one place: the route transition, the floating controls and the page grammar
(labels, headings, actions). Before it, each of these had been written route by
route, so a route without its own V4 composition still looked like the older
system, and two routes could disagree about whether a navigation is animated.

## Where it lives

| Piece | File |
| --- | --- |
| Route transition: look, header carried across | `css/v4-system.css`, 24 |
| Route transition: opt-in and skipped-transition guard | `ProductionDocument.jsx` (`V4_TRANSITION`, `V4_REVEAL`), `404.html` |
| Brand mark in header and footer | `css/v4-system.css`, 2 |
| Floating controls: AJOOP launcher, easter-egg trigger | `css/v4-system.css`, 25 |
| Page grammar: tokens, labels, headings, actions | `css/v4-system.css`, 26 |
| Identity plate primitive (moved from the catalog sheet) | `css/v4-system.css`, 27 |
| Home's AI Chatbot card plate | `plates` in `v4HomeModel` (`scripts/home-about-react.mjs`), `home` in `src/react/v4/consumers.jsx`, `css/v4-home.css` |
| Case-study section nav placement | `ProductionMain.jsx` |
| Overlays closed on back/forward restore | `AjoopShell.jsx` |
| Focus after leaving Merge Rush | `js/pages/merge-rush-game.js` |
| Browser QA and review pack | `scripts/v4-e07-global-experience-review.mjs` |

## Route transitions

**What was wrong.** `@view-transition { navigation: auto }` was declared in
three route stylesheets (Works, case studies, AJOOP). A cross-document view
transition needs both documents to opt in. Leaving an opted-in page for one
that was not (case study → `/merge-rush/`, Works → a project page) made the
browser skip the transition and report `AbortError: Transition was skipped` on
the page being left. That is the "intermittent Merge Rush" report from E06.4:
it was deterministic for those pairs, and Home → Works had no transition at all.

**A second cause, found while fixing the first.** Read from a stylesheet, the
opt-in can arrive after the browser has decided how to reveal the incoming
page. The 404 page skipped four to six of ten transitions that way. An inline
rule at the top of the head did not skip once in the runs measured.

**Now.**

- Every document opts in with one inline rule, ahead of every stylesheet. No
  stylesheet declares it.
- Every React document answers a skipped transition's promises at both ends
  (`pageswap`, `pagereveal`) in the head, not only V4 routes.
- One look for all routes: the page cross-fades in 260 ms, the header is one
  object carried across documents, and a chosen project visual still travels
  to its case-study hero in 460 ms.
- Reduced motion: no opt-in, so navigation is an ordinary one.
- A page restored from the back/forward cache comes back as the page: an open
  AJOOP panel, palette, Recruiter Mode or mobile menu is closed. Before, Back
  to a page left through the panel's Hub link returned an open dialog over an
  inert page.

The browser rejects one promise of its own when it skips an outgoing
transition, and no page code can reach it. The fix is that no pair of this
site's documents is asymmetric any more, not that the report is hidden.

## Brand mark

The `KB` mark stood in a bordered tile with its own ground, like an app icon.
It now stands by itself beside the name in the header and the footer: no
border, radius, ground or shadow, 36 px (32 px at 480 px and narrower). The
artwork is unchanged; it is round and drawn on transparency. Hover and
keyboard focus add a soft glow to the mark, and the link keeps its focus ring.

## Floating controls

The V4 launcher (a quiet system chip with the AJOOP mark and a state light)
existed only on Home. Every other route showed the older blue pill. The
launcher and the easter-egg trigger are now one family on every route: same
surface, radius and baseline. Where the label would cost room (≤ 820 px wide,
or ≤ 480 px tall for a phone on its side) the launcher is a square the size of
the trigger. Behaviour, state and the Hub's no-launcher rule are unchanged.

## Page grammar

The older layer's tokens (`--color-*`, `--font-mono`, and their aliases) are
pointed at the V4 tokens on every route except the three game shells, and the
few parts whose shape differs are set once: labels (IBM Plex Mono, 11.2 px,
accent, with the current rule), headings (Manrope 700), the page-hero title
and lead, section headings, and primary and ghost actions. Route compositions
are more specific and keep the last word.

| Route | Before | After |
| --- | --- | --- |
| Games, Request, Now, Labs, Privacy, project pages | Inter 900 titles, 17–18 px grey labels, steel-blue 10 px-radius buttons | the V4 registers |
| Merge Rush page | V4 title, older labels and buttons | the V4 registers |
| Closing bands on About, Experience, Works, three case studies | older buttons inside V4 pages | one action treatment |
| Home, Works, Experience, Certificates, About, AJOOP, case studies | unchanged | unchanged |

Left distinct on purpose: the three game shells (`data-page="game"`) keep
their art direction and take only the launcher and the transition; hero
compositions, section rhythm and closing-band shapes stay per page type.

## Fixes by surface

- **Home.** The AI Chatbot Flow Design card showed
  `ai_flow_chatbot_design_cover.webp`, a retired cover. It now shows the
  identity plate its Works card shows, from the same catalog entry. Home's
  structure is unchanged; the plate is added by the Home consumer.
- **Case studies.** On three captured case studies (AI Flow Puzzle, Atölye
  Joyday, Hospital) the section nav rendered above the hero, because it was
  inserted at index 1 and their first child is whitespace. It now follows the
  hero on all eight.
- **Kinetic headings.** During the first light sweep the last line's
  descenders were clipped (About, Experience, Certificates, AJOOP Hub). The
  heading's box now has room for them.
- **Merge Rush.** Leaving with no remembered control dropped focus on the
  document: the fallback looked for Play inside the stage, and Play is on the
  page. Focus now lands on Play.
- **404.** Takes part in the transition. It is not restyled: see Open.

## Labels

English only, key-based, so no other locale changes:

| Was | Now | Where |
| --- | --- | --- |
| Live site | Live Website | Works catalog cards |
| All games | All Games | Merge Rush, Career Adventure |
| Exit to portfolio | Exit to Portfolio | Joyday studio, AI Flow Puzzle |

Not changed, and why: "Case study" (catalog links and Home) and "Live
product" (Home) stay in sentence case. Raising them makes the English text
equal to another key's with a different translation, which drops it from the
reverse map and changes accepted Turkish and Spanish copy on Works and Games.
"Back to works" is the key its four translations are stored under.

## Gates

- `node scripts/v4-e07-global-experience-review.mjs`: 85 checks on the
  production build. 21 routes in five locales (nav state, grammar, launcher,
  opt-in), 12 journeys, Back and Forward, the 404 hand-off, reduced motion,
  floating controls at seven viewports, all eight case studies in two
  locales, four games (enter, Back, focus), language and theme switching,
  keyboard, no JavaScript, console and hydration, and the brand mark on every
  route, at seven viewports and under keyboard focus.
- Earlier phase scripts, rerun unchanged: E06.6 Works presentation 63 of 63,
  E06.4 Merge Rush 54 of 54.
- Pass: `qa:data`, `qa:i18n`, `qa:routes`, `qa:routes:http`, `qa:foundation`,
  `qa:projects`, `qa:seo`, `qa:performance`, `qa:css`, `qa:design`,
  `qa:a11y:static`, `qa:recruiter`, `qa:analytics`, `qa:js`, `qa:assets`,
  `qa:links`, `qa:html`, `qa:spelling`, `qa:portfolio`, `qa:icons`,
  `qa:v4:works-coverage`, `qa:v4:works-presentation`, `qa:ajoop:knowledge`,
  `qa:ajoop:facts`.
- Inherited, unchanged by this phase:
  - `qa:runtime`: 8 failures. Four V4 page controllers and three V4 page
    types the runtime manifest does not list (as after E06.4), and the
    line-ending-only `labs` check on a Windows checkout.
  - `qa:m3:foundation`: stops at its approved-renderer list
    (`careerAdventureCaseStudy`).
  - Not run: the `qa:m3` parity gates, A5.3.

## Open

- **404 is still the older design.** `qa:css` and `qa:design` require that the
  legacy 404 document loads no React-only stylesheet, which `v4-system.css`
  is. Linking it was tried and reverted for that reason. Rendering 404 as a
  React document is the fix; it is a renderer change, not polish.
- **Mixed case on Home's evidence links** ("Case study", "Live product"), for
  the reason above. Aligning the Turkish and Spanish translations of the two
  keys would remove the collision.
- **Closing bands** are a boxed panel on case studies and an open rule on
  inner pages. Left as a page-type difference.
- **Real devices.** Touch, safe areas and the transition were checked in
  emulation only.
