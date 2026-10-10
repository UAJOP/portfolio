# J01 — Joyday wallpaper-ready export

Joyday Action Painting exports a finished artwork as a PNG of an exact,
chosen size: desktop and phone wallpapers, social formats or a custom size,
composed with Fit or Fill and a focal point the visitor controls.

## Ownership

| File | Role |
| --- | --- |
| `joyday-paint.js` | Everything about the export: `JoydayExport` (sizes, validation, geometry, file name — pure functions), the offscreen renderer, the export panel, the download and share paths, the dialog's focus handling. |
| `js/pages/joyday-studio.js` | Unchanged. The studio shell still only enters, leaves and hands off. |
| `css/games/joyday-paint.css`, `css/v4-joyday-studio.css` | The panel's base styles and its studio skin. |
| `data/i18n/packs/{de,es,fr}/dynamic.json` | `joydayPaint.export` copy; EN and TR live in the engine's `copy` literal as before. |

The page markup is an accepted contract (`data/site/m3-30-labs-games-structure.json`),
so the engine builds the panel itself inside the finished-artwork dialog, the
way it already builds the palette, and removes it when the engine is disposed.

## Pipeline

```text
painting canvas (900×900 or 720×1080, never resized, only read)
  → makeArtworkCanvas()      the artwork in its own shape, no signature
  → JoydayExport.geometry()  Fit / Fill placement with the focal point
  → makeFrameCanvas()        an offscreen canvas of exactly width × height,
                             imageSmoothingQuality "high"
  → canvas.toBlob("image/png") → download, or the share sheet on a phone
```

The preview is the same frame drawn at most 720 px on its longer side, so its
composition is the PNG's.

## Geometry

One scale is used for both axes in every case.

- **Fit** — `scale = min(W / sw, H / sh)`. The whole artwork is drawn, centred:
  `dx = (W − sw·scale) / 2`, `dy = (H − sh·scale) / 2`. The background shows
  around it.
- **Fill** — `scale = max(W / sw, H / sh)`. The part drawn is `W / scale` by
  `H / scale`, which has the frame's proportions. Only one axis overflows; the
  focal point (0–1, clamped, 0.5 by default) places the crop on it:
  `sx = (sw − W/scale) · focalX`, `sy = (sh − H/scale) · focalY`.
- **Round canvas** — placed by its bounding square, so it is always a circle.
  Fit shows the whole disc on the background; Fill lets the disc span the
  frame's longer side, with the background in the corners.

Where the background shows (a fitted artwork, or the round canvas) it is Paper
or Dark by choice, and the artwork casts a soft shadow on it.

## Sizes

| Group | Sizes |
| --- | --- |
| Original | the canvas as painted (default; the former Clean canvas export) |
| Desktop wallpaper | 1920×1080, 2560×1440, 3840×2160 |
| Mobile wallpaper | 1080×1920, 1170×2532, 1290×2796, 1440×3200 |
| Social and general | 1080×1080, 1080×1350 |
| Custom | whole pixels, 320–4096 per side |

The output line always states the exact size before download, and says when
the frame is an enlargement of the canvas ("enlarged 4.3× from the canvas").
The Joyday card keeps its one fixed size (1400×1700) and is outside the size
system. File names carry the resolution:
`joyday-action-painting-<name>-<desktop|mobile|social|custom|shape|joyday-card>-<W>x<H>.png`.

## Behaviour changes to know about

- The Joyday signature now starts **off** (the markup still declares it
  checked; the engine unchecks it on start).
- The finished-artwork dialog takes focus when it opens, keeps Tab inside and
  returns focus to the control that opened it.
- File names end with the resolution instead of the date.

## Quality: enlargement, not native detail

The live canvas stays 900 px wide (history keeps 32 full snapshots), so every
wallpaper size is a high-quality resample of it. Measured on a painted
artwork: phone and 1080p frames (about 2–2.6×) hold up; 3840×2160 (4.3×) is
smooth and free of pixelation but visibly soft at 100 %. It is offered as a
size, not as native 4K, and the panel says so. A resolution-independent
replay renderer (J01.1) is the way to real 4K detail; it is not built.

## Gates

- `npm run qa:joyday:export` — the geometry's rules and ten negative
  controls, without a browser. Part of `npm run qa`.
- `npm run qa:joyday:export:browser` — against `dist-site/`: real PNG header
  sizes for every preset, pixel placement for every shape in Fit and Fill,
  focal point, preview parity, custom validation, signature, Joyday card,
  dialog focus and keyboard, five locales, narrow screens, drawing / undo /
  redo / clear / new artwork, eight faulty-engine controls; then the review
  pack.
