# V4-E06.6 — Works presentation uplift and remaining surfaces

E06.5 settled what is listed. E06.6 settles how it is shown: every project in
the catalog is a card, in one of three tiers, and no tier is a plain row.
Classifications, identities and retired pages from E06.5 are unchanged.

## Where it lives

| Piece | File |
| --- | --- |
| Card data: tier, stack, role source, image or plate, group lead | `card` on each entry and `cards` in `data/portfolio/catalog.json` |
| Card structure for Works and Games | `scripts/v4-e06-5-catalog.mjs` |
| Card styles, playable treatment on Games | `css/v4-catalog.css` |
| Card image variants and the captured frames | `scripts/v4-e06-6-card-images.mjs`, `assets/catalog/` |
| Request surface | `scripts/v4-e06-6-request.mjs`, `css/v4-request.css` |
| Project hero image, plate and fit | `projectVisual` in `scripts/home-about-react.mjs`, `css/v4-project.css` |
| Presentation gate | `scripts/qa-v4-works-presentation.mjs` (`npm run qa:v4:works-presentation`) |
| Browser QA and review pack | `scripts/v4-e06-6-works-presentation-review.mjs` |

## The tier system

One card, three sizes. Each has the same parts in the same order: visual,
kind · year · status, title, role where one is recorded, one line on what was
built, stack, and only the links that exist.

| Tier | Cards | Who | Layout |
| --- | ---: | --- | --- |
| Featured | 9 | SINAMA (lead), AJOOP, kaanbalci.com, Atölye Joyday, AI Chatbot Flow Design, Merge Rush, AI Flow Puzzle, Career Adventure, Joyday Action Painting | lead card across the row, then two columns |
| Standard | 13 | Hospital Form App, MyMuseum, Hospital Appointment System, Agency DB, Cars Dataset Analysis, Control Panel; the seven native games | three columns; native games four, with Escape Island as lead |
| Compact | 7 | the learning collection's members that have a page | four columns |

Two columns on tablets, one on phones. The two unfinished repositories are
not cards: they are named in a dashed note inside the learning collection,
with their source link and no image or page.

**Grouping.** The four groups stay native `<details>`, collapsed on load, and
each opens to a card grid. They no longer close each other. The group header
now carries its note, so a closed group still says what is inside.
Hospital Form App moved from "Current work" to "Software, data & mobile": it
is 2024 academic software, and each group now holds one tier.

## Images

A card never loads a full-size cover. `scripts/v4-e06-6-card-images.mjs`
writes 640 and 960 px WebP variants (never upscaled) to `assets/catalog/`;
cards load them lazily with `srcset` and `sizes`, and nothing is requested
until a group is opened.

| | Cards |
| --- | --- |
| Existing authentic image, resized | SINAMA, AJOOP, Atölye Joyday, Merge Rush (game frame), Hospital Form App (privacy-redacted screenshot), the seven native games, Unity Essentials |
| Captured from the running site | Joyday Action Painting, Career Adventure, AI Flow Puzzle, kaanbalci.com |
| Taken from the project's own repository | MyMuseum (`docs/screenshots/login-screen.png`), Agency DB (`docs/diagrams/agency-er-diagram.png`), Cars Dataset Analysis (`docs/figures/price-distribution.png`; the other two figures are in its gallery) |
| Identity plate (no authentic image exists) | AI Chatbot Flow Design, Hospital Appointment System, Control Panel, My Java Projects, Python Projects, Calculator Android Studio, Mandelas Website Project, Porto 25, IC Supply |

An identity plate is the project's real stack set in type on the V4 grid. It
cannot be read as a screenshot. Before a plate was used the repository was
checked for visual evidence: Hospital Appointment System holds only icon art,
Control Panel only a placeholder avatar, and the enterprise chatbot work has
no publishable screen.

## Retired covers

These files imitated screenshots (generated mock-ups with garbled labels, a
generator watermark, or invented metrics), or were stock art or third-party
logos. They are listed in `cards.retiredCovers` and no longer appear in the
main content of Works, Games, any project page or any case study. The gate
fails if one returns.

| Retired cover | Was shown on | Now |
| --- | --- | --- |
| `ai_flow_chatbot_design_cover.webp` | curated Works card, project page | identity plate |
| `hospital_form_app_cover.webp` | curated Works card, project page, case-study hero | the application's own screenshot |
| `ai_flow_puzzle_cover.webp` | curated Works card | a frame of the running game |
| `kaanin_kariyer_cover.webp` | Career Adventure case study | a frame of the running game |
| `agency_db_cover.webp` | project page | the repository's ER diagram |
| `insatagram.webp` | curated Works card, project page | the repository's login screenshot |
| `what-is-data-analyst.jpg` | curated Works card, project page | the repository's figures |
| `hastane.jpg` | curated Works card, project page | identity plate |
| `control_panel_cover.webp`, `porto_25_cover.webp`, `ic_supply_cover.webp` | project pages | identity plate |
| `calculator-cartoon-illustration-png.webp`, `java.png`, `Python-Symbol.png`, `images (1).png` | project pages | identity plate |

The curated Merge Rush card showed a drawn cover; it now shows the game
frame. The drawing stays on Merge Rush's own accepted pages.

**How it is wired.** The catalog entry is the one source of a project's
visual. The curated cards swap only a retired cover
(`withCuratedVisuals`); a project page takes its hero from its catalog card
and drops its gallery when the card is a plate (`projectVisual`); a captured
case study swaps a retired hero for the project's screenshot
(`withAuthenticCaseCovers`). Project pages link `css/v4-project.css`.

## Games

- **Browser playables.** The four cards keep their accepted layout. Each now
  shows a frame of the game itself, a Play button and a Case Study button.
- **Native archive.** Seven standard cards, always visible, none marked
  playable, each with engine, status and only its verified links.

## Request

The form, its fields, validation and submission are untouched.

- The note under "Good for" described the endpoint (no-cors, Apps Script) and
  was also out of date: the transport reads a confirmed response. It now says
  who reads a request and what to do if the form does not confirm it.
- A "Direct contact" panel offers email and LinkedIn.
- The empty band between the introduction and the form is closed, and the
  side column stays in view beside the form on desktop.

## Other surfaces

- Works "Archive policy" copy no longer contrasts older work with
  "portfolio-grade evidence".
- Catalog statuses read "Academic project", "Media archive" and "Unfinished
  experiment".
- No project status is the generic "Repository" (gate).

## Gates

- `npm run qa:v4:works-presentation`: 1,868 checks, including that no retired
  cover is shown on Works, Games, a project page or a case study.
- `node scripts/v4-e06-6-works-presentation-review.mjs`: 63 checks on the
  production build, at seven viewports, in five locales, with and without
  JavaScript and with reduced motion.
- `npm run qa:v4:works-coverage`: 714 checks, unchanged.
- Pass: `qa:data`, `qa:i18n`, `qa:routes`, `qa:foundation`, `qa:projects`,
  `qa:seo`, `qa:performance`, `qa:css`, `qa:design`, `qa:a11y:static`,
  `qa:recruiter`, `qa:analytics`, `qa:js`, `qa:assets`, `qa:links`, `qa:html`,
  `qa:spelling`, `qa:portfolio`, `qa:ajoop:knowledge`, `qa:ajoop:facts`.
- E06.4 integration checks: 54 of 54.
- Inherited, not rewritten, not run: `qa:runtime`, `qa:m3:foundation`, the
  `qa:m3` parity gates, A5.3.

The E06.5 browser script is removed: it asserted a row list that no longer
exists. Its behaviour checks live on in the E06.6 script.

## Open

- **Home** still shows `ai_flow_chatbot_design_cover.webp` on its flagship
  card. Home is outside this phase.
- **Open Graph images.** A project page whose hero is a plate uses the site
  cover as its share image. The retired files stay in `assets/`; the accepted
  M3 artifact manifest lists them.
- **Nine plates.** Hospital Appointment System and Control Panel would get an
  image only from running the projects.
- **Renderer.** `srcset` is mapped to React's `srcSet` in
  `src/react/production/ProductionMain.jsx`, one line.
