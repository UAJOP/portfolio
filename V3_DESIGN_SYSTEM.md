# V3 Design System

The visual system behind Portfolio Modernization V3, as implemented in `src/react/styles/` and `src/react/components/`.

This documents what exists, not what is aspired to. Everything below is in the codebase and visible in the preview.

## 1. Design objective

The portfolio has to survive a specific reading: a hiring manager scanning it for ninety seconds, deciding whether this person can build real systems.

That sets the bar. The design must make evidence fast to find and credible when found. Anything that slows that down — a decorative effect, an animation that must finish, a card that looks important but says nothing — is working against the only job the site has.

The old production visual system is the baseline this improves on, not a target to reproduce.

## 2. Visual personality

Confident, technical, editorial. Specifically:

- **Editorial typography.** Headings are set tight — negative tracking, snug leading — so large sizes read as deliberately set type rather than scaled-up body copy.
- **A mono register.** Section eyebrows, tech chips and technical detail use the mono stack. This is what makes the system read as engineering without a single neon accent.
- **Layered surfaces.** Depth ranks content. A flagship card sits higher than a supporting one, and the ranking is visible before any text is read.
- **Restrained accent.** One accent hue, used for emphasis and state. A second (indigo) separates categories. Neither appears on more than a small fraction of the page.
- **Generous whitespace.** The spacing scale starts at 4px but section rhythm works in 3–6rem. Density is the enemy of scanning.

## 3. Recruiter-first principles

1. **Evidence outranks decoration.** No visual effect may compete with a project fact for attention.
2. **Hierarchy is immediate.** Eyebrow → heading → lead → detail, repeated so the eye learns it once.
3. **Status is legible at a glance.** Live / active / archived read as distinct chips, distinguished by more than hue.
4. **Nothing important requires interaction.** No hover-to-reveal, no accordion hiding a headline fact.
5. **Nothing important requires JavaScript.** Every page is pre-rendered; content exists before hydration.

## 4. Dark and light strategy

Dark is the flagship identity. Light is **not** dark with the lightness flipped — the two palettes were designed and measured separately, and they build depth by different means:

| | Dark | Light |
|---|---|---|
| Depth from | surfaces lifting toward the light | white cards over a cool paper canvas |
| Borders | low-opacity white | real, slightly darker than the canvas |
| Shadow | deep and soft | shallow and cool — heavy shadow on light reads as dirt |
| Sheen | 1px top highlight (`--sheen`) | none; it would be invisible |

Two tokens exist specifically because a single value could not serve both themes:

- **`--accent-text`** — accent used as *text*. `--accent` is tuned for fills, borders and focus rings, where contrast rules do not apply. On light it only reaches ~3.9:1 as text, so accent text has its own value per theme.
- **`--text-on-accent`** — ink placed *on* an accent fill. Dark ink on dark theme's lighter accent, white on light theme's deeper accent.

Both themes hold WCAG AA on every text pair, verified by measurement rather than assumed.

## 5. Typography system

One fluid scale in `tokens.css`, applied through classes in `typography.css`:

| Class | Token | Role |
|---|---|---|
| `.v3-display` | `--text-display` | page-level statement |
| `.v3-h1` | `--text-h1` | page title |
| `.v3-h2` | `--text-h2` | section |
| `.v3-h3` | `--text-h3` | card / subsection |
| `.v3-body-lg` | `--text-body-lg` | lead paragraph |
| `.v3-body` | `--text-body` | body copy |
| `.v3-small` | `--text-small` | supporting detail |
| `.v3-eyebrow` | `--text-label` | section label — mono, uppercase, wide tracking |
| `.v3-mono` | `--text-small` | technical detail |

Every size uses `clamp()`, so there are no typography breakpoints to maintain.

**Appearance and semantics are separate.** `SectionHeading` takes `level` (which element) and `size` (which appearance) as independent props, because document outline is a semantics decision and must never be driven by how large a heading should look.

`.v3-measure` caps line length at `--width-text` (68ch). It is applied to text, never to layout containers.

No webfont is introduced. Font and CDN delivery are dealt with as one measured change in #32.

## 6. Spacing and layout

A 9-step spacing scale (`--space-1` … `--space-9`) and a small set of layout primitives in `layout.css`:

- `.v3-container` / `--narrow` — page width and gutters
- `.v3-section` / `--tight` / `--divided` — vertical rhythm and hairline separation
- `.v3-stack` / `--sm` / `--lg` — vertical flow
- `.v3-cluster` / `--sm` — horizontal wrapping groups
- `.v3-grid` / `--wide` / `--compact` — auto-fitting card grids
- `.v3-bento` — an emphasized lead cell beside supporting cells
- `.v3-split` — content beside a trailing element

The grids use `minmax(min(<floor>, 100%), 1fr)`. The inner `min()` is what stops them overflowing on narrow screens, which a bare `minmax()` floor does.

The test for this layer: **#25 should be able to build Home without adding a container or a spacing rule.**

## 7. Surfaces and depth

Four surface levels — `--surface-inset`, `--surface`, `--surface-elevated`, `--surface-interactive` — plus three shadow steps and `--sheen`.

The `Surface` component exposes these as `variant`, `padding`, `interactive` and `accented`.

Two rules that keep depth meaningful:

- **`interactive` adds hover affordance styling only.** It does not make a surface clickable. A card that navigates must contain a real anchor — there is no clickable `div` in this system.
- **`accented` is for lead cells only.** The 2px gradient rule marks the single most important card in a group. If every card has one, it marks nothing.

## 8. Color usage

Semantic tokens exclusively. `components.css` contains **no literal color values** — that is what makes the two themes independently designable rather than mechanically derived.

- `--accent` — fills, borders, focus rings, active markers
- `--accent-text` — accent as text (see §4)
- `--accent-alt` — category separation, used sparingly
- `--success` / `--warning` / `--danger` — status, each with a `-soft` background

Status chips pair color with a dot and a text label, so status never depends on hue alone.

## 9. Motion rules

CSS only. No animation dependency — `motion.css` is 45 lines.

- Transitions live in **150–320 ms** (`--duration-fast` / `--duration-normal` / `--duration-slow`). Slower reads as lag on a page being scanned.
- Two easings: `--easing-standard` for color, `--easing-emphasized` for movement.
- Motion is **state feedback only**: hover, focus, press. No entrance animations, no scroll-triggered reveals, no parallax, no cursor effects.
- `prefers-reduced-motion: reduce` collapses all durations, and the one motion that carries meaning — the interactive surface lift — is removed rather than merely accelerated.

**No information depends on motion.** Every transition is decoration over a state already expressed by color, border or ARIA state.

## 10. Accessibility rules

- Native semantics only: `header`, `nav`, `main`, `footer`, `button`, `a`. No `div role="button"`, no `href="#"`.
- `Action` renders the element its behavior requires — `to` → router `Link`, `href` → `a`, `onClick` → `button`. There is no variant that produces a fake control, which is *why* the system has none.
- External links get `rel="noopener noreferrer"` automatically whenever they open a new tab; a caller cannot forget it.
- One focus treatment, `:focus-visible` only, with offset so it clears the element's own border in both themes.
- Skip link targets `#main`, which carries `tabIndex={-1}` so focus actually moves rather than just the viewport.
- Interactive targets are at least 40px, actions 44px.
- Active navigation state uses `aria-current="page"`; the underline is styled *from* that attribute, so visual and announced state cannot diverge.
- Language and theme controls are `role="group"` with both options always rendered and `aria-pressed` carrying state — no text swaps between server render and hydration.
- Target: **0 Pa11y errors**, verified in both themes.

## 11. Component principles

The system is intentionally small — four primitives and three shell pieces:

| Component | Responsibility |
|---|---|
| `Container` | width + gutters |
| `Surface` | the card |
| `Badge` | status / category / tech chip |
| `Action` | every call to action |
| `SectionHeading` | eyebrow + heading + lead |
| `SiteShell` | landmarks: skip link, header, main, footer |
| `SiteHeader` | brand, navigation, language, theme |
| `SiteFooter` | brand, positioning, canonical destinations |

Principles:

1. **No component invents a fact.** Product truth arrives from canonical JSON.
2. **Props configure, never override identity.** `SiteHeader` takes `navItems` but reads the name and primary title from canonical data — a page cannot rename the person.
3. **The shell holds no route literals.** That is the single property that lets #25 reuse it for production routes.
4. **Preview chrome lives outside `components/shell/`.** `PreviewNotice` is passed through the `banner` slot, so removing the preview touches no shell component.
5. **Abstraction only when it is used twice.** No component exists here that has one caller.

## 12. Forbidden visual patterns

Not stylistic preferences — these are ruled out:

- generic SaaS template appearance
- neon, cyberpunk overload, Matrix-green
- gradients on every element; glassmorphism on every card
- glow, particles, cursor-following effects
- scroll hijacking, gratuitous 3D
- large animation libraries
- excessive pill UI
- any effect that competes with portfolio evidence

The system may feel futuristic. It must remain credible in a serious hiring context.

## 13. How #25 consumes this system

Home and About are the first real pages. They should:

1. **Render inside `SiteShell`**, passing production `navItems`. Do not build a second shell.
2. **Compose existing layout primitives.** If a layout genuinely needs a new primitive, add it to `layout.css` — not a one-off rule in a page file.
3. **Read every fact from canonical JSON.** No copy that states a product fact may be typed into a component.
4. **Use `SectionHeading` for section entry points**, so hierarchy stays consistent across pages.
5. **Reserve `accented` surfaces for flagship evidence** — SINAMA and Merge Rush.
6. **Pass no `banner`.** That slot is preview-only.
7. **Keep the parity bar from `REACT_MIGRATION_PLAN.md` §5**: content, truth, behavior, accessibility, metadata, URL and performance.

The preview at `/react-preview/` is a labelled specimen of the system, deliberately *not* a home page layout. #25 designs the page; this document defines the vocabulary it is designed in.
