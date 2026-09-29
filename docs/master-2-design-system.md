# Design system (Master 2B)

`portfolio-v2.css` is the production design system. It loads last on every page, after `style.css`, `css/a11y.css` and any page-scoped sheet, and owns the public visual language. `style.css` stays the legacy runtime's structural baseline; it is superseded here, not edited, and its removal belongs to Master 3 (#31).

## North star

A technical editorial portfolio: the work of someone who builds serious AI and software systems, presented with the restraint of a good product case study rather than a template.

- **Evidence before decoration.** Real screenshots, product media, status, scope and implementation facts carry the page.
- **Composition before cards.** Rules, alignment, column relationships and whitespace group content first. Cards are reserved for things you open (work, games, certificates, the request form) and for overlays.
- **Type by function.** One display statement on Home; compact page titles; section titles that introduce rather than shout.
- **Accent means intent.** Blue marks action, selection and focus. Green marks real status only. No glow, glass, gradients or decorative pills.
- **A person, not a component library.** The portrait and the real work are the identity.

## Typography

Inter (Google Fonts, existing delivery) for everything; the platform mono stack for technical labels, metadata, dates and statuses only.

| Role | Token | Range |
| --- | --- | --- |
| Home statement | `--type-display` | 2.25 → 3.5rem |
| Page / case / project title | `--type-h1` | 2 → 2.75rem |
| Section title | `--type-h2` | 1.5 → 2.05rem |
| Feature title (flagship cards, About lead) | `--type-feature` | 1.45 → 1.95rem |
| Card / row title | `--type-h3` | 1.1 → 1.25rem |
| Lead | `--type-lead` | 1.05 → 1.18rem |

Headings are weight 700 (h3/h4 600) with tight tracking, `text-wrap: balance` and language-aware hyphenation. Section labels are mono caps preceded by a short accent rule. `qa:design` enforces ceilings on the display, h1, h2 and h3 scales so a heading can never grow back into a viewport-filling billboard.

## Composition patterns

- **Masthead** (every secondary route): label and title on the left, lead and actions on the right, closed by a hairline. Variants by function: utility routes (Now, Request, Certificates) use a quiet single column; Games is the most expressive; Labs uses a mono lead and a dashed rule; Privacy is a document header; 404 is a single recovery statement.
- **Home**: statement, actions and three identity facts in the first fold, with "Strongest evidence" linking straight to SINAMA; the portrait and availability beside it. SINAMA leads Selected Work as a full-width editorial feature; AI Chatbot Flow Design and Atölye Joyday share the next row. "What I do" is a numbered process on rules, experience a dated ledger, supporting work two quiet entries, and the page ends on a closing band.
- **Works**: the primary tier opens with the SINAMA feature; supporting work uses media cards; archive work renders as index rows (small thumbnail, role, one line, one action) so it never competes with flagship work.
- **About**: an editorial profile (narrow portrait column beside long-form prose), capabilities as ruled columns, a horizontal milestone timeline, numbered process rows and a toolbox table.
- **Case studies**: hero with ruled project facts beside the product visual; an evidence strip of large values on a rule; every section opens on a rule with a two-column heading. The first lead paragraph sits beside the title; further lead paragraphs stack beneath it (the Home Selected Work heading follows the same rule), and `qa:design` fails any masthead or heading that gives two paragraphs one grid cell. SINAMA (`case-flagship`) carries the largest title; Hospital and AI Flow Puzzle (`case-archive`) keep the grammar at a quieter scale.
- **Project detail** (25 routes × 5 locales): hero with contained media (square icons never tower), a ruled four-cell facts row, open narrative panels, numbered process rows, and a sticky side panel for stack and highlights. Sparse projects stay honest.
- **Experience / Now**: ledgers. A sticky summary beside dated entries; the build log is a dated changelog.
- **Games / Labs**: Games is image-led cards with softer corners; Labs is a mono technical index.
- **Request**: the form leads (first in source order); process and alternatives are a quiet sticky aside.
- **Overlays**: Recruiter Mode is a scannable evidence sheet of ruled sections; the Command Palette is query, results (label over hint) and keyboard hints; the AJOOP shell keeps its behaviour and sits compactly above its launcher. Stacking scale: page content ≤ 3, sticky header 50, easter trigger 82, floating AJOOP shell 120, header with its mobile menu open 130, every full-screen dialog 160 (Recruiter Mode, Command Palette, case gallery, certificate image modal, Joyday finish dialog), skip link 200. `qa:design` fails a header or open mobile menu that would paint over a dialog, and an open menu that would sit under the floating controls.

## Tokens

Semantic `--color-*` tokens are declared independently for dark (`:root`) and light (`html[data-theme="light"]`).

- Canvas: `--color-canvas`, `--color-canvas-raised`
- Surfaces: `--color-surface`, `--color-surface-raised`, `--color-surface-inset`
- Text: `--color-text`, `--color-text-secondary`, `--color-text-muted`
- Accent: `--color-accent`, `--color-accent-strong`, `--color-accent-soft`
- Action: `--color-action`, `--color-action-hover`, `--color-on-action`
- Status: `--color-success`, `--color-warning`, `--color-danger`, their `-soft` tints and `-strong` chip text
- Borders: subtle / default / strong; `--color-header`, `--color-scrim`
- Radius: 6 / 10 / 14 / 20 and pill
- Spacing: a 4px-based scale from 4px through 96px
- Motion: 140 / 220ms with one easing curve; entrances are 0.5s and 8px
- Layout: 1200px content, 68ch reading measure, fluid gutter, 64px header

**Dark** is a deep navy-mineral canvas; depth comes from surface steps, hairlines and media, not glow. **Light** is its own environment: a quiet paper-mineral canvas (`#f4f4f1`), white work surfaces, ink text (`#111820`) and a deep controlled blue (`#2d5f96`), with minimal shadow.

### Compatibility aliases

Legacy components read `--bg`, `--surface`, `--line`, `--text`, `--muted`, `--brand`, `--accent`, the status names, `--shadow` and `--max-width`. They are declared once, on `:root, html[data-theme="light"]`, and every value is a `var(--color-*)` (or `--shadow-md` / `--content-width`) reference. The light selector is required: `style.css` declares its V3 palette on `html[data-theme="light"]`, which outranks a plain `:root`. `portfolio-v2.css` must be the last local stylesheet on every page, and the light `body` resets the V3 gradient to `--color-canvas`.

`style.css` and `case-study.css` also repaint ~30 components in light mode through `html[data-theme="light"] .x` rules. A single "light-theme parity" block restates the system's intent at matching specificity, so light mode follows the same composition as dark.

Filled markers that legacy sheets paint as dark ink on a `--brand` fill use the action pair (`--color-action` / `--color-on-action`) in both themes.

`npm run qa:design` enforces: alias values and selector; a scan of every legacy stylesheet for alias declarations, dark-ink-on-brand markers and bright V3 text literals that the system does not override; stylesheet order; the body reset; project-detail rules; measured WCAG AA contrast of text, secondary, muted, accent and status tokens (and chip text on its tint) on every surface tier in both themes; the type-scale ceilings; and the composition invariants above (Home fold evidence link, Works tiers, Request form order).

### Production ↔ React token parity

The React migration foundation still uses its own vocabulary. Until Master 3 collapses the two, these pairs hold identical values in both themes, enforced by `scripts/qa-design-token-parity.mjs`:

| Meaning | `portfolio-v2.css` | `src/react/styles/tokens.css` |
|---|---|---|
| canvas / canvas raised | `--color-canvas` / `--color-canvas-raised` | `--canvas` / `--canvas-raised` |
| surface / surface inset | `--color-surface` / `--color-surface-inset` | `--surface` / `--surface-inset` |
| text / secondary / muted | `--color-text` / `--color-text-secondary` / `--color-text-muted` | `--text-primary` / `--text-secondary` / `--text-muted` |
| accent / accent strong | `--color-accent` / `--color-accent-strong` | `--accent` / `--accent-strong` |
| action fill / hover / on-action | `--color-action` / `--color-action-hover` / `--color-on-action` | `--action-fill` / `--action-fill-hover` / `--action-text` |
| success / warning / danger | `--color-success` / `--color-warning` / `--color-danger` | `--success` / `--warning` / `--danger` |

## Responsive strategy

Layouts are recomposed per class, not merely stacked.

- **≥ 1280**: full compositions; the header keeps the complete navigation and labelled secondary controls. Availability remains in Home's first fold and Recruiter Mode rather than the shared header.
- **1101–1279**: same compositions, denser header.
- **≤ 1100**: primary navigation collapses behind the menu toggle (owned here; `js/core/shell.js` reads the toggle's computed display). The mobile menu is a left-aligned list with 52px rows.
- **≤ 900**: mastheads, case heroes and two-column layouts become single column; the Home identity becomes portrait-beside-facts; secondary Selected Work cards go media-left.
- **≤ 760**: mobile: phones get a one-row portrait card, labelled identity rows, stacked media cards, archive rows without summaries, and paired secondary actions under a full-width primary.
- **≤ 360**: header controls shrink to 38px (above the 24px WCAG 2.2 target) rather than any disappearing.
- **Laptop heights (≤ 820px tall)**: the Home statement tightens so actions and identity facts stay in the fold.

## Font delivery

Inter remains delivered through the existing Google Fonts path; the platform mono stack adds no download. Replacing Boxicons or self-hosting fonts is a Master 3 dependency cleanup decision.

## Intentionally deferred

- Legacy runtime and `style.css` removal (Master 3, #31).
- Collapsing the production and React token vocabularies (Master 3).
- AJOOP reasoning, retrieval, prompts, connectors, Bridge, Qdrant and conversation behaviour remain untouched; only the shell's visual layer is in scope here.
