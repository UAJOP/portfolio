# Master 2 design system

## Direction

Master 2 uses the selected Precision Dark concept as a direction, not a screenshot to copy. The production interpretation keeps the deep-navy technical identity and evidence-first hierarchy while reducing cyan saturation, giving the portrait more presence, and using existing project media as evidence. Light mode is designed from the same semantic system rather than produced by color inversion.

## Design principles

- Evidence before decoration: project media, role, status, scope, and links do the visual work.
- Calm technical character: navy and mineral surfaces, restrained blue, and green reserved for positive status.
- Scan, understand, inspect: every project surface supports a fast summary and a deeper evidence path.
- One sans, one mono: Inter is the primary family; the platform monospace stack is used only for technical labels and metadata.
- Open composition: borders and surfaces group related information; not every item becomes a floating card.
- Motion explains state only: hover, focus, press, and dialog transitions; reduced motion removes nonessential transitions.

## Font study

The candidate set was checked against the real Home statement, Works titles, About prose, case-study headings, controls, forms, and EN/TR/DE/ES/FR character requirements.

| Candidate | Strengths | Trade-off | Decision |
| --- | --- | --- | --- |
| Inter | Best fit with the existing production assets, compact UI text, broad language coverage, and current loading path | Familiar rather than expressive | Selected |
| Manrope | Open, friendly display voice | Wider shapes make German labels and dense evidence cards less efficient | Not selected |
| Geist | Precise product character | Would add a new delivery dependency for a relatively small visual gain | Not selected |
| IBM Plex Sans | Strong technical personality and excellent language support | More editorial/industrial than the selected visual target | Not selected |
| IBM Plex Mono | Strong technical companion | A second webfont would add another request and layout risk | Not shipped |
| JetBrains Mono | Clear code texture | Too distinctive for frequent metadata and another webfont request | Not shipped |
| Platform mono | No request, no CLS, appropriate for short metadata | Varies slightly by operating system | Selected |

Inter remains delivered through the existing Google Fonts path. Production uses weights 400, 500, 600, 700, and 800; synthetic 850/900/950 usage is removed from the Master 2 layer. The platform mono stack adds no download cost. Strong fallbacks keep the first paint usable if the provider is unavailable.

## Tokens

The authoritative production vocabulary lives at the top of `portfolio-v2.css` and maps legacy names to semantic decisions so older components inherit the same system.

- Canvas: `--color-canvas`, `--color-canvas-raised`
- Surfaces: `--color-surface`, `--color-surface-raised`, `--color-surface-inset`
- Text: `--color-text`, `--color-text-secondary`, `--color-text-muted`
- Accent: `--color-accent`, `--color-accent-strong`, `--color-accent-soft`
- Status: `--color-success`, `--color-warning`, `--color-danger`
- Borders: subtle/default/strong
- Radius: 8/12/18/24 and pill
- Spacing: a 4px-based scale from 4px through 96px
- Type: display, H1, H2, H3, lead, body, small, caption, eyebrow, and mono
- Motion: 140/220ms with one standard easing curve
- Layout: 1200px content, 68ch reading measure, fluid page gutter

Dark mode uses a deep ink canvas with blue used for action and active state, not ambient glow. Light mode uses mineral-white canvases, opaque white surfaces, navy text, and a darker blue accent with independently tuned borders and shadows.

### Compatibility aliases

Legacy components read `--bg`, `--surface`, `--line`, `--text`, `--muted`, `--brand`, `--accent`, the status names, `--shadow` and `--max-width`. They are declared once, on `:root, html[data-theme="light"]`, and every value is a `var(--color-*)` (or `--shadow-md` / `--content-width`) reference; no alias carries a literal. The light selector is required: `style.css` declares its V3 palette on `html[data-theme="light"]`, which outranks a plain `:root`, so an alias block on `:root` alone lets light mode fall back to V3. `portfolio-v2.css` must also be the last local stylesheet on every page, and the light `body` resets the V3 gradient to `--color-canvas`.

Filled markers (step numbers, active chips, live badges) that legacy sheets paint as dark ink on a `--brand` fill use the action pair (`--color-action` / `--color-on-action`) in both themes; the dark ink only cleared AA against the bright V3 brand.

`npm run qa:design` enforces all of this: the alias values and selector, a scan of every legacy stylesheet for alias declarations the block does not override, the stylesheet order, the body reset, the filled-marker overrides, the shared project-detail rules, and measured WCAG AA contrast of text, secondary, muted, accent and status tokens on the canvas and surface tiers in both themes.

Measured adjustments made during Master 2 acceptance: light `--color-text-muted` `#65748a` → `#5c6b80` (was 4.03–4.31:1 on the canvas tiers; now ≥ 4.61:1) and light `--color-success` `#267a58` → `#257655` (was 4.45–4.49:1 on raised/inset; now ≥ 4.69:1). Status chips put text on their own `-soft` tint, so they use new `--color-success-strong` / `--color-warning-strong` text tokens (light `#1f6547` / `#74530f`, ≥ 5.2:1 on the tint over every surface; equal to the base in dark), mirroring the existing `--color-accent-strong` chip. About journey years use `--color-accent-strong`, because the plain accent is ~4.2:1 on the raised card tier in dark.

### Production ↔ React token parity

The React migration foundation still uses its own vocabulary. Until Master 3 collapses the two, these pairs must hold identical values in both themes, enforced by `scripts/qa-design-token-parity.mjs`:

| Meaning | `portfolio-v2.css` | `src/react/styles/tokens.css` |
|---|---|---|
| canvas / canvas raised | `--color-canvas` / `--color-canvas-raised` | `--canvas` / `--canvas-raised` |
| surface / surface inset | `--color-surface` / `--color-surface-inset` | `--surface` / `--surface-inset` |
| text / secondary / muted | `--color-text` / `--color-text-secondary` / `--color-text-muted` | `--text-primary` / `--text-secondary` / `--text-muted` |
| accent / accent strong | `--color-accent` / `--color-accent-strong` | `--accent` / `--accent-strong` |
| action fill / hover / on-action | `--color-action` / `--color-action-hover` / `--color-on-action` | `--action-fill` / `--action-fill-hover` / `--action-text` |
| success / warning / danger | `--color-success` / `--color-warning` / `--color-danger` | `--success` / `--warning` / `--danger` |

## Responsive composition

- 1440+: hero uses a seven/five evidence grid; selected work shows three visual cards.
- 1101–1279: navigation becomes denser and hero proportions tighten.
- ≤ 1100: primary navigation collapses behind the menu toggle. Brand, seven links and header actions measure wider than the header between roughly 980 and 1100 px in every production locale (German and Spanish longest), so the collapse point lives here in `portfolio-v2.css`; `js/core/shell.js` reads it from the toggle's computed display rather than hard-coding a width. The brand never shrinks.
- Proof strips: four-up strips drop to two columns from 641 to 1180 px, and every proof value is capped at 19% of its own card's inline size (container query), so word values such as "READY / WARNING / BLOCKED" cannot overflow at any width or locale.
- 768–1023: hero becomes an intentional two-stage story: value and actions first, identity evidence second.
- 320–767: controls remain at least 44px; hero type and action layout are reduced; project imagery remains visible; no evidence is hidden.

## Shared component language

Header, footer, buttons, text links, project cards, evidence panels, badges, forms, dialogs, command palette, recruiter drawer, and case-study blocks all use the same type, border, radius, focus, surface, and motion tokens. Game canvases keep their product-specific art, while their surrounding site shell inherits Master 2.

## Intentionally deferred

- Replacing Boxicons or self-hosting fonts is a Master 3 dependency cleanup decision.
- AJOOP reasoning, retrieval, prompts, connectors, Bridge, Qdrant, and conversation behavior remain untouched.
- Clean-route architecture, canonical URLs, and hreflang structure remain unchanged.
