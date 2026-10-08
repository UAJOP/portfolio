# V4-E06.1 — Joyday Action Painting: the studio

`/joyday-paint/` opens as a portfolio-facing intro. "Start Painting" enters the
studio: a full-viewport play mode with its own look (a daylight painting
studio) that leaves the portfolio's header, footer and floating controls
behind until the visitor exits.

## What is where

| Piece | File |
| --- | --- |
| Painting engine (unchanged) | `joyday-paint.js`, `css/games/joyday-paint.css` |
| Accepted page markup (unchanged) | `data/site/m3-30-labs-games-structure.json` |
| Studio shell markup, added at render time | `src/react/v4/consumers.jsx` (`joydayStudio`) |
| Studio controller | `js/pages/joyday-studio.js` |
| Studio layout, look and moods | `css/v4-joyday-studio.css` |
| Copy, five locales | `joyday.studio.*` in `data/i18n/messages/*/common.json` |
| What the studio adds to the page, as a reviewed delta | `scripts/v4-e06-1-joyday-studio-edits.mjs` |
| Review pack and focused QA | `scripts/capture-v4-review.mjs` |

The controller never draws and never reads the engine's state. Where it needs
the engine to act, it presses the engine's own control.

## Palette moods

"Suggest palette" changes the room, not only the swatches. The controller
reads the palette's colours and sorts them into one of six moods by hue,
lightness and saturation; the stylesheet re-tunes tokens (wall, light, paper,
wood, accent, action colour, flecks). The artwork's pixels and the layout
never change.

| Mood | Engine palette today |
| --- | --- |
| Joyday Pop | Joyday Bright |
| Electric Joy | Neon Party |
| Soft Studio | Soft Pastel |
| Sunset Atelier | Warm Energy |
| Blue Room | Ocean Flow |
| Pastel Morning | none yet |

## Future enhancements

Recorded, not started:

- **Multi-format artwork export.** Wallpaper presets (desktop, QHD, 4K,
  phone, custom size) with fit / crop / background-extension behaviour, beside
  today's canvas-size PNG and Joyday card.
- **A sixth palette for Pastel Morning.** The mood exists and classifies
  correctly; no engine palette lands in it. Needs one palette added to
  `joyday-paint.js`.
- **Audio quality.** The engine's sounds are short synthesised tones. No new
  audio has been sourced.
- **Real-device verification.** Touch, safe areas and landscape were checked
  in emulation only.
- **Reload persistence.** Artwork survives leaving and re-entering the studio
  within a visit; a reload starts clean.
- **Older browsers.** The layout uses container-query units and
  `display: contents`, and the mood cross-fade uses registered custom
  properties. Browsers from before about 2023 need a fallback.
- **`qa:m3:labs-games` browser flow.** The gate's static part knows the
  studio's reviewed delta. Its browser part still paints on the canvas in the
  page and must enter the studio first; it has not been reconciled. The gate
  also stops at the shared-bundle budget, as it did before this phase.
