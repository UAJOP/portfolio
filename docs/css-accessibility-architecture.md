# kaanbalci.com CSS & Accessibility Architecture

Established by **BRIEF 04 — CSS Architecture + Accessibility & Responsive Polish**, branch `refactor/css-accessibility-responsive-v1`.

Before this, one 6,608-line `style.css` shipped to every page — **39% of it game styling** that only three pages could use. The skip link lived in `case-study.css`, so it worked on 5 of 19 pages. Three `aria-label` warnings sat on bare `<canvas>` elements.

## Goals

1. **Ownership.** Page-specific styling belongs to its page, not to every page.
2. **No redesign.** The site must look identical. Verified by computed-style comparison against the pre-change build.
3. **Accessibility baseline.** Consistent skip link, visible focus, correct dialog behaviour, honest canvas semantics.
4. **Responsive robustness.** No page-level horizontal overflow at 320 or 375 px.
5. **Still static.** No build step, no bundler, no CSS framework, no runtime injection.

---

## CSS Module Tree

```
style.css                       shared: tokens, theme, layout, nav, cards, features   (all pages)
css/a11y.css                    skip link, focus ring, touch targets, reduced motion  (all pages)
portfolio-v2.css                V2 rendering layer, minified                          (all pages)
case-study.css                  case-study layout                                     (5 pages)
css/games/adventure.css         Career Adventure                                      (1 page)
css/games/joyday-paint.css      Joyday Action Painting                                (1 page)
css/games/ai-flow-puzzle.css    AI Flow Puzzle                                        (1 page)
```

Seven stylesheets, not twenty. Files exist where ownership is genuinely different, not to maximise modularity.

### Why the shared sheet was not split further

`style.css` is still 3,361 lines and deliberately remains one file. **CSS cascade depends on source order**: splitting a chronologically-grown stylesheet into base/layout/components files reorders rules, and any equal-specificity tie then resolves differently. That is a visual-regression risk with no functional gain, in a brief whose first constraint is "no redesign".

The game extraction was safe because those selectors are namespaced (`.joyday-*`, `.ai-puzzle-*`, `.adventure-*`) and can only match markup on their own page. Splitting `style.css` by *category* has no such guarantee. Recorded under [Remaining Debt](#remaining-debt).

### How the split was verified

Rules were assigned by **evidence, not line ranges**. A class-usage index was built from every HTML page plus the JS modules each page loads (BRIEF 03's manifest), so a class only ever emitted by `js/pages/games.js` is known to be game-only. A block moved to a game stylesheet only if *every* selector in it was rooted in that game's namespace.

Result, verified in-browser against the pre-change build at `7d58e6e`: identical element counts and identical computed-style hashes on all three game pages and the homepage.

| Page | Elements | Style hash before | after |
|---|---|---|---|
| joyday-paint | 44 | 4631 | 4631 |
| adventure | 14 | 1406 | 1406 |
| ai-flow-puzzle | 76 | 7335 | 7335 |
| index | 378 | 29072 | 29072 |

### Dead CSS removed

34 classes were referenced in **no** shipped HTML, JS or JSON — 289 lines of rules. Several (`ai-demo`, `ai-demo-stage`, `ai-flow-map`) belonged to the AI-workflow demo whose JavaScript BRIEF 03 removed as dead, so the story is consistent. Verified across every shipped file before removal.

---

## Common Styles

`style.css` owns tokens and theme, page shell, header/nav/footer, hero, buttons, cards, forms, modal primitives, and the shared features (Ajoop, Recruiter Mode, command palette, creative layer).

`css/a11y.css` owns only cross-cutting accessibility affordances and loads **after** `style.css` so its focus and skip-link rules win.

## Page-Specific Styles

| Stylesheet | Pages | Why |
|---|---|---|
| `case-study.css` | 5 case studies | Case-study layout, unused elsewhere |
| `css/games/adventure.css` | `adventure.html` | `.adventure-*`, `.merge-ladder` namespace |
| `css/games/joyday-paint.css` | `joyday-paint.html` | `.joyday-*` namespace |
| `css/games/ai-flow-puzzle.css` | `ai-flow-puzzle.html` | `.ai-puzzle-*`, `.ai-flow-*`, `.ai-node-*` namespace |

Each game sheet is linked **immediately after `style.css`**, which preserves the cascade position those rules previously held inside it.

---

## Theme Architecture

Unchanged. `:root` defines the dark palette; `html[data-theme="light"]` overrides the colour tokens. A blocking `<head>` script sets `data-theme` before first paint, so there is no flash of wrong theme.

Colour tokens (`--bg`, `--text`, `--muted`, `--brand`, `--surface`, `--line`, `--accent`) exist in both themes and are asserted by `qa:css`. Geometry tokens (`--radius-*`, `--max-width`) are theme-independent by design and only live in `:root`.

The focus ring uses `var(--brand)`, so its contrast follows the active theme automatically rather than needing two hard-coded colours.

---

## Responsive Strategy

Desktop-first, `max-width` queries, as before. BRIEF 04 did not renumber the existing breakpoints — that would touch every component for no functional gain.

### Breakpoints

`style.css` uses ~18 ad-hoc widths (560, 620, 640, 720, 820, 900, 980, 1100, 1120, 1180, 1240, 1280, 1360, 1540). `css/a11y.css` adds two deliberate ones:

- **≤ 820 px** — touch-target sizing.
- **≤ 400 px** — header wrapping, which is where the overflow actually occurred.

Consolidating the existing breakpoints into a scale is recorded as debt.

### The 320 px overflow, and its real cause

Every page overflowed horizontally at 320 px **before this brief** (317 px of content in 305 px). The cause was not a wide element: `style.css:2865` sizes `.header-actions` with `flex: 0 0 auto`, so the row never shrinks below its max-content width and `flex-wrap` can never trigger.

The fix lets that one container shrink below 400 px:

```css
.header-actions { flex: 1 1 auto; min-width: 0; flex-wrap: wrap; }
```

No `overflow-x: hidden` band-aid was used anywhere — `qa:css` asserts that.

Verified: `index`, `works`, `request`, `games`, `about`, `labs`, `single-work`, all three game pages and a generated project route report `scrollWidth === clientWidth` at 320 and 375 px.

---

## Accessibility Baseline

> This is an improved baseline with WCAG-oriented fixes. It is **not** a WCAG conformance audit — no such audit has been performed, and static checks cannot prove conformance.

### Keyboard & Focus

`style.css` already carried `a:focus-visible` / `button:focus-visible` rings. `css/a11y.css` extends coverage to inputs, selects, textareas, `summary`, `[tabindex]` and ARIA widget roles, using `:focus-visible` so pointer users keep the existing hover styling. Controls on brand-coloured surfaces get an inverted ring so it stays visible.

Verified by keyboard: the first Tab on the homepage reveals the skip link with a visible ring.

### Skip Link Contract

- One skip link per page, the **first focusable element** in the document.
- Always `href="#main-content"`.
- Target is `<main id="main-content" tabindex="-1">` — the `tabindex` is what makes focus actually land there.
- Off-screen until focused, then anchored top-left.
- Translated: `Skip to content` / `İçeriğe geç`.

**Coverage: 19/19 authored pages + 25 generated = 44/44** (was 5/19). Generated pages inherit it from `project-detail.html`, so none were edited by hand.

Verified: activating it moves focus to `<main>`, bypassing **15 header controls**.

### Dialog / Modal Contract

`js/core/shell.js` already provided `trapFocus`, `rememberOverlayTrigger`, `restoreOverlayFocus` and `setBackgroundInert`, and Ajoop, the command palette and Recruiter Mode already used them.

The **certificate modal did not**. It cancelled every Tab and forced focus back to the close button, so nothing else in the dialog could be reached, and it restored focus through its own ad-hoc variable. It now uses the shared helpers:

| Behaviour | Before | After |
|---|---|---|
| Focus enters dialog | ✅ | ✅ |
| Tab cycles within dialog | ❌ forced to close button | ✅ shared trap |
| Background inert | ❌ | ✅ |
| Escape closes | ✅ | ✅ |
| Focus returns to trigger | partial | ✅ shared helper |

Verified in-browser: opening inerts the header, focus lands on the close button, Escape returns focus to the originating thumbnail.

### Canvas / Interactive Experiences

The three `aria-label` warnings were a real defect: a bare `<canvas>` has no implicit role, so its accessible name may be ignored. Each canvas now carries `role="img"`, keeps its name, and has **fallback content** describing what it renders and where the controls are — the spec-defined mechanism, not a silenced validator.

Game logic and rendering were not touched. Interaction remains available through the DOM controls beside each canvas.

> The Labs 3D canvas renders 0 painted pixels in the Claude browser environment. BRIEF 03 verified this is **also** true at `891388d`, so it is environmental, not a regression. Rendering repair was explicitly out of scope; only surrounding accessibility was addressed.

### Reduced Motion

`@media (prefers-reduced-motion: reduce)` now applies site-wide: animations and transitions collapse to ~0, smooth scrolling is disabled, and — importantly — `.reveal` elements are forced to `opacity: 1; transform: none` so suppressing the transition cannot leave content permanently invisible.

Essential state changes are untouched, and game rendering is unaffected.

### Touch Targets

Primary controls reach **44×44 px** at ≤ 820 px: nav toggle, theme/recruiter/command toggles, language switch, Ajoop launcher and close, modal close, project filters. Desktop sizing is unchanged.

Below 400 px the header row wraps rather than shrinking the targets, so they stay full-size on the smallest screens.

### Boxicons

**Kept, with a preconnect added.** Evidence: 266 usages across 67 distinct icons. Replacing the icon system is far outside this brief, and self-hosting would mean copying third-party font assets whose licence was not verified here.

It is a render-blocking third-party stylesheet and had **no connection warm-up**, while the site already preconnects for Google Fonts. Adding `<link rel="preconnect" href="https://unpkg.com">` reduces connection latency at zero risk. The availability dependency itself remains, and is still recorded as debt in the baseline audit (P2-6).

---

## Adding a New Component

1. If it appears on more than one page type, add it to `style.css` near related rules.
2. If it belongs to one page, create or extend that page's stylesheet and register it in `SCOPED_CSS` in `scripts/qa-css-architecture.mjs`.
3. Use existing tokens; do not introduce a new colour or radius without a reason.
4. Give interactive elements a `:focus-visible` state, or rely on the shared ring in `css/a11y.css`.
5. Run `npm run qa:css`.

## Adding a New Page

Every page loads, in this order:

```html
<link href="style.css" rel="stylesheet"/>
<link href="css/a11y.css" rel="stylesheet"/>
<!-- optional page-scoped stylesheet here -->
```

Then:

1. `<body>` starts with `<a class="skip-link" href="#main-content">Skip to content</a>`.
2. The page has exactly one `<main id="main-content" tabindex="-1">` and one `<h1>`.
3. A page-scoped stylesheet must be registered in `SCOPED_CSS` so QA knows where it is allowed.
4. Run `npm run qa` — `qa:css` and `qa:a11y:static` both check these contracts.

---

## Accessibility QA

```bash
npm run qa:css          # CSS ownership, stylesheet contracts, tokens
npm run qa:a11y:static  # skip links, landmarks, dialogs, labels, canvas, ids
npm run qa:html         # html-validate: 0 errors, 0 warnings
npm run qa:a11y         # pa11y-ci (existing, browser-driven)
```

`qa:a11y:static` covers 44 pages. **Static checks cannot prove** keyboard order, focus movement, focus visibility, contrast ratios, or screen-reader output. Those were verified manually in a browser for this brief and still need a human for future changes.

No screen reader (NVDA/VoiceOver) was used; semantics were inspected via the DOM and computed accessibility properties only.

---

## Remaining Debt

- **`style.css` is still 3,361 lines.** Splitting by category would reorder the cascade; it needs per-component extraction with visual verification at each step.
- **~18 ad-hoc breakpoints** remain unconsolidated.
- **33 `!important` declarations** remain in `style.css` (down from 35). `css/a11y.css` adds 6, all inside the reduced-motion block where overriding animation is the intent.
- **Boxicons remains a render-blocking third-party dependency** (P2-6), now with preconnect.
- **Flash of wrong language (P2-3)** — still deferred; see the baseline audit for why.
- **Contrast ratios not measured.** No automated or manual contrast audit was run.
- **`portfolio-v2.css` is minified and unformatted**, so it cannot be reviewed line by line. It was left untouched.
