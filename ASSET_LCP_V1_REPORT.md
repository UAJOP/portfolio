# Asset and LCP Optimization V1

Measured against production baseline `559ffddaaa4ff538bf49f06c4a40f1b301767143` on 2026-08-22/23. The implementation is intentionally limited to asset delivery, intrinsic sizing, loading policy and deterministic regression protection. It does not change the visual system, career positioning, product claims, fonts, icon delivery or runtime architecture.

## Measurement method

- The repository baseline passed the complete deterministic QA suite, Pa11y on all 11 configured pages and Lighthouse on all 11 configured pages before edits.
- Index and About were measured three times before and three times after with the same LHCI desktop preset and static server. Medians are reported.
- Lighthouse attributed LCP to the page heading on both pages before and after. The profile image was not the measured LCP element, but it was the dominant image transfer.
- Browser visual checks used the baseline commit in a detached temporary checkout and the branch build on separate local ports.

## Baseline asset inventory

The complete baseline inventory contains 102 public media files: 37 WebP, 30 JPEG, 29 PNG, 2 AVIF, 2 PDF, 1 ICO and 1 SVG. There are no public GIF or video files. A complete machine-readable inventory, including hashes, dimensions and references, was retained with the local QA evidence.

- 63 assets had at least one HTML, CSS or production JavaScript reference.
- 39 assets had no production reference and were classified for review rather than automatically deleted.
- All 86 static image elements lacked explicit intrinsic width and height at baseline. Five are data-URI/modal placeholders; the remaining 81 asset-backed images now carry verified dimensions.

Largest baseline files:

| Asset | Size | Baseline state |
|---|---:|---|
| `assets/WarehouseWreckage main pp.png` | 2,101,418 B | Referenced by dynamic project detail |
| `assets/kaanfoto.png` | 1,162,659 B | Historical / uncertain |
| `assets/single-post-2.png` | 1,092,862 B | Historical / uncertain |
| `CV-KAAN-BALCI.pdf` | 962,066 B | Unreferenced public artifact; currentness unknown |
| `assets/item-1.jpg` | 915,488 B | Historical / uncertain |
| `assets/CV_foto_mavi.png` | 908,647 B | Index and About profile source |
| `assets/DrivenfinityPng.png` | 835,094 B | Referenced by dynamic project detail |
| `assets/CV_foto_beyaz.png` | 793,333 B | Historical / uncertain |
| `assets/converted_image.png` | 757,569 B | Referenced by dynamic project detail |

## Critical profile and logo assets

### Profile

- Source: `assets/CV_foto_mavi.png`, PNG, RGB/no alpha, 700 × 1000, 908,647 B.
- Production: `assets/kaan-balci-profile.webp`, WebP quality 90, 700 × 1000, 49,654 B.
- Reduction: 858,993 B / 94.5%.
- A tested AVIF was 40,221 B. Its additional 9,433 B saving did not justify a second source and more complex markup.
- The WebP and PNG were compared at 100% and 200%. Face, hair, blue background edges and gradients remained visually equivalent.
- Index keeps native image discovery, default eager loading, `fetchpriority="high"`, asynchronous decoding and verified dimensions.
- About uses the same optimized file with lazy loading and asynchronous decoding, without high priority, because its heading is the measured LCP and the photo begins below the initial viewport.

### Logo

- Source used in header/footer: `assets/KAAN BALCI-KÜÇÜK LOGO PNG.png`, 500 × 500, 101,027 B.
- Production: `assets/kaan-balci-logo-128.webp`, lossless WebP with alpha, 128 × 128, 16,534 B.
- Reduction: 84,493 B / 83.6%.
- The 128-pixel source retains more than two device pixels per CSS pixel at the current 36–40 pixel render size.
- Favicon behavior is unchanged. The large fallback logo used by legacy dynamic data also remains valid.

## Other production raster replacements

| Source | Production asset | Old | New | Reduction |
|---|---|---:|---:|---:|
| `WarehouseWreckage main pp.png` | `warehouse-wreckage-cover.webp` | 2,101,418 B | 172,804 B | 91.8% |
| `DrivenfinityPng.png` | `drivenfinity-cover.webp` | 835,094 B | 123,432 B | 85.2% |
| `converted_image.png` | `unity-essentials-cover.webp` | 757,569 B | 88,384 B | 88.3% |
| `escape.jpg` | `escape-island-cover.webp` | 272,158 B | 133,686 B | 50.9% |
| `111266f6-5226-4f00-aacc-efde413516ed.jpg` | `legacy-of-the-lost-cover.webp` | 266,480 B | 133,138 B | 50.0% |

The dynamic project-detail registry now points to these production files. The original exports remain as historical/source-master candidates because source-retention intent cannot be proven from the repository. They are not requested by the public runtime after this change.

No responsive source set was added. The critical profile is already 49.7 KB, the logo is 16.5 KB, and the remaining replacements are fixed-ratio card/detail media loaded only on relevant routes. Additional variants would add maintenance and markup complexity for limited measured benefit.

## Loading and layout policy

- Homepage profile: eager/default, high priority, asynchronous decoding.
- Case-study hero media: eager/default, explicit high priority where already intended, never rewritten to lazy by the compatibility runtime.
- About profile, project cards and case-study galleries: lazy where below fold.
- Dynamic detail galleries: lazy with fixed CSS height; the dynamic hero remains eager with a reserved minimum height.
- All 81 static asset-backed image elements now carry verified intrinsic dimensions.
- CSS explicitly preserves the established profile, About, case-study hero and gallery aspect-ratio behavior so intrinsic attributes cannot alter crops or card height.
- The compatibility runtime no longer assigns high priority to the first header logo and no longer adds lazy loading to an image that already declares high priority.

## Duplicate and orphan review

### Removed

`assets/sinama-home-featured-case-study.webp` was removed. It had zero production references and was byte-identical to retained, referenced `assets/sinama-works-card.webp`; both shared SHA-256 `a0801c23fba155caa0c3198dbe550c3c1c6a869745bd811eb46531d207a9ca91`.

### Kept

- Original profile, logo and five project-image exports: retained as source-master/historical candidates; public runtime references now use optimized derivatives.
- `assets/hospital.avif`: retained because legacy dynamic project data still references it.
- Legacy fallback `assets/KAAN BALCI-BÜYÜK LOGO PNG.png`: retained because runtime fallback behavior still references it.
- Mini-game and certificate assets: retained when referenced by their pages or runtime.

### Historical / uncertain

Unreferenced alternatives such as `assets/kaanfoto.png`, `assets/CV_foto_beyaz.png`, `assets/single-post-1.png`, `assets/single-post-2.png` and the `assets/item-*.jpg` set remain untouched. Their lack of a current runtime reference is proven, but their intended source/archive role is not.

The final filesystem inventory is 108 media files: 63 referenced and 45 unreferenced. The increase in unreferenced count is intentional because optimized production derivatives replaced, but did not erase, uncertain source masters.

## PDF and resume review

| File | Size | Public reference | Evidence | Recommendation |
|---|---:|---|---|---|
| `CV-KAAN-BALCI.pdf` | 962,066 B | None | 2 pages; SHA-256 `86b44be4216e33cf2ffd638900efa039e4a95aa1b03ca04f207507ecfbc9b83e` | Currentness UNKNOWN; keep pending explicit provenance review |
| `assets/kaan-balci-portfolio.pdf` | 49,428 B | None | 3 pages; SHA-256 `b215a961c9a8d5761646fffd82529afd7e81d807aec34777c37b07d39d7303e0` | Distinct document; currentness UNKNOWN; keep |

The public resume action still uses the canonical external Drive URL. The two local PDFs are not byte duplicates, and repository evidence cannot establish which, if either, is current.

## Before and after medians

| Page | Metric | Baseline | Optimized | Result |
|---|---|---:|---:|---:|
| Index | Lighthouse performance | 93 | 98 | +5 |
| Index | FCP | 819 ms | 840 ms | +21 ms; normal run noise |
| Index | LCP | 1,666 ms | 931 ms | -735 ms / 44.1% |
| Index | CLS | 0.000079 | 0.000079 | unchanged |
| Index | Image requests | 2 | 2 | unchanged |
| Index | Image transfer | 1,010,286 B | 66,798 B | -943,488 B / 93.4% |
| Index | Total transfer | 1,438,157 B | 494,649 B | -943,508 B / 65.6% |
| About | Lighthouse performance | 93 | 98 | +5 |
| About | FCP | 857 ms | 820 ms | -37 ms / 4.3% |
| About | LCP | 1,626 ms | 912 ms | -714 ms / 43.9% |
| About | CLS | 0.000079 | 0.000079 | unchanged |
| About | Image requests | 2 | 2 | unchanged |
| About | Image transfer | 1,010,286 B | 66,798 B | -943,488 B / 93.4% |
| About | Total transfer | 1,437,391 B | 493,985 B | -943,406 B / 65.6% |

The heading remains the LCP element on both pages. The byte, discovery and decode improvements are real even though the profile itself is not the recorded LCP node.

The single-run full-site comparison also verifies the two directly relevant case studies:

| Page | Performance | LCP before / after | CLS before / after | Image transfer before / after |
|---|---:|---:|---:|---:|
| SINAMA | 98 → 98 | 865 / 918 ms | 0.000702 / 0.000707 | 128,674 / 44,180 B |
| Merge Rush | 98 → 98 | 924 / 930 ms | 0.016579 / 0.016579 | 103,300 / 18,806 B |

The 53 ms SINAMA and 6 ms Merge Rush LCP changes are within normal run noise; no timing improvement is claimed. Their image transfer reductions are deterministic. The pre-existing Labs CLS value of 0.130 also reproduced before and after, so it is documented but not attributed to this pass.

## Regression protection

`npm run qa:assets` is a deterministic blocking check. It verifies:

- every quoted production asset reference resolves;
- every static asset-backed image has numeric intrinsic dimensions;
- a high-priority image is never lazy;
- critical profile/logo assets exist and remain below 80 KB / 24 KB budgets;
- Index and About keep their intended profile loading policies;
- old heavy production paths are not reintroduced;
- project-card and case-gallery lazy policy remains intact;
- aspect-ratio CSS needed by intrinsic dimensions remains present;
- the proven SINAMA duplicate stays removed.

The check is part of `npm run qa`, runs as a blocking Site Preflight step and writes `qa-results/asset-policy.txt` in CI.

## Deferred by scope

- Google Fonts migration or self-hosting.
- Boxicons replacement or self-hosting.
- Legacy runtime modularization.
- Broad deletion of uncertain source/archive assets.
- A larger responsive-source matrix unless future measurements show meaningful mobile transfer value.
