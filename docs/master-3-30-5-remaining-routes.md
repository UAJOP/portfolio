# Master 3 #30.5 — Remaining Public Routes

Base: `main` at `726fcde` (#30 + AI Flow drag fix). Scope: the five canonical page routes `now`, `blog`, `certificates`, `request` and `privacy` in every active locale — 5 × 5 = 25 documents, taking canonical React ownership from 190 to 215 of 215. The counts are derived from `data/site/routes.json`, `data/i18n/locales.json` and the project registry.

## Inventory before #30.5

| Route | Page type | Document runtime | What the runtime wrote into `<main>` | Interaction |
| --- | --- | --- | --- | --- |
| `/now/` | `now` | COMMON only | `portfolio-v2.js` rendered the whole Build Log into an empty `[data-build-log]` | None beyond links |
| `/blog/` (Experience) | `blog` | COMMON only | Nothing | None beyond links |
| `/certificates/` | `certificates` | `js/features/certificates.js` (loaded by `script.js`) | `i18n-runtime.js` rewrote the `[data-training-type]` label from the UI pack | Certificate preview dialog |
| `/request/` | `request` | `/request-config.js` (document script), `js/request/submission.js`, `js/request/form.js` (loaded by `script.js`) | Nothing until a submission; then the status region, and a browser reference appended by `portfolio-v2.js` | The request form |
| `/privacy/` | `legal` | COMMON only | Nothing | None beyond links |

`single-work.html` is a compatibility redirect to `/certificates/`; the certificate page itself is `certificates/index.html`. No page loads a page-specific stylesheet.

## Ownership

| Surface | Before | After |
| --- | --- | --- |
| Route identity | `data/site/routes.json`, `renderer: legacy` | Same registry, `renderer: react` |
| Page markup, head, metadata | Static accepted documents | React SSR from `data/site/m3-30-5-remaining-routes-structure.json`, captured from those accepted documents by `scripts/generate-m3-remaining-routes-structure.mjs` |
| `/now/` Build Log | `portfolio-v2.js`, client-side | React SSR from `data/portfolio/build-log.json` and the locale content packs; the legacy renderer already stands down below `[data-react-main]` |
| Certificates training label | `i18n-runtime.js`, client-side | React SSR, resolved from the same UI pack key |
| Header, footer, Recruiter, Ajoop, Command Palette | Legacy per page | The existing production React owners |
| Certificate preview dialog | `js/features/certificates.js` | Unchanged: the same file, still loaded by `script.js` for `data-page="certificates"` |
| Request validation, consent, honeypot, timing guard, transport, status, email fallback | `js/request/form.js`, `js/request/submission.js` | Unchanged: the same files, still loaded by `script.js` for `data-page="request"` |

## Architecture decision

**Captured contract, existing renderer, retained page controllers.**

The pages are rendered by the shared `ProductionMain` structure renderer that #29 and #30 already use; the page markup travels in each document's props payload. Nothing was added to the client bundle: it is byte-identical to #30 (`production-main-iIPZYrVE.js`, 259,995 B raw). No per-route chunk exists.

The two interactive pages keep their controllers exactly as shipped. Unlike the #30 engines they need no lifecycle host: neither changes the markup when it starts. Each only binds listeners, and re-asserts values the server markup already carries (`inert` on the closed dialog; the Google Form link, read from `request-config.js`). Hydration therefore compares the server markup with an equivalent DOM, the listeners survive on the same nodes, and React never re-renders these pages. No legacy public file is edited and none is added.

`/request-config.js` keeps its accepted position before the runtime loader; `ProductionDocument` gained a server-only `leadScripts` slot for it.

With JavaScript disabled every page renders its full content; `/now/` now includes the Build Log, which the accepted document could not show without JavaScript.

## Request form

Unchanged behaviour, verified on the accepted and the React document with the same script and a mock transport (`qa:m3:remaining-routes`); `qa:request` still covers the transport unit contract, including the opaque-response case a browser cannot reproduce under CORS.

A submission displays success only for a readable 2xx response whose body is `{ "ok": true }`. An HTTP error, a rejection, a malformed or unconfirmed body, a network failure and a timeout all show the error state, keep the visitor's entries and offer the email fallback.

## Verification boundary

`qa:m3:remaining-routes` (G-72), in `qa:react` and in the blocking `qa:m3:artifact` chain:

- **Static, 25 documents:** registry ownership (exactly these five ids switch; every canonical route is React-owned; companions stay legacy), locale document paths, doctype, one SSR main, one `h1`, one header/navigation/footer, document locale, canonical, hreflang, accepted title, description and social tags, page type, script order, main copy, inline whitespace, element counts, link destinations and images equal to the accepted document, internal links resolve, the Build Log in registry order, the training label, the request-form contract (required fields, consent, honeypot, status region, fallbacks, labels), policy headings, legal links and connector scopes, one valid `WebPage` JSON-LD record, compatibility redirects, sitemap, bundle budget, controller code absent from the shared bundle, contract freshness.
- **Browser, every document** (English in desktop-dark and mobile-light, the other locales alternating): no effective markup change before hydration, hydration without recoverable error or node replacement, no console diagnostics, no script loaded twice; the rendered `<main>` — every element, attribute and text node — equal to what the accepted runtime renders, with each element's computed style equal and its box within 1 px.
- **Without JavaScript,** all 25 documents: content, navigation, Build Log, form controls, certificates, policy.
- **Certificate dialog,** same script on both documents: open, focus, focus containment, Escape and focus return, backdrop, close button.
- **Request form,** same script on both documents, in English, Turkish and German: invalid, no consent, bad email, honeypot, minimum completion time (in real time), HTTP 500, rejection, malformed body, unconfirmed body, network failure, timeout, pending state, duplicate submission, confirmed success and its payload.
- 26 static and 16 browser negative controls, each against the real emitted document or a mutated copy of the real shipped script.

The older gates derive their React document count from the registries. The foundation and parity gates approve exactly these five more page ids; the parity gate's unauthorized-route control now flips a companion document, since no canonical page is legacy any longer. For the same reason the #27 Recruiter and #28 Ajoop/Command Palette gates, which compared the React owners with the legacy owners on `/now/`, now take the still-legacy 404 companion as that reference, and the #26 differential gate leaves the 25 documents to this gate, as it does for #29 and #30.

## Known differences from the accepted documents

- `/now/` server-renders the Build Log; the accepted document rendered it client-side.
- The Experience `<aside>` carries an `aria-label` (its heading), and the Ajoop aside is labelled on that route, because a React document has several complementary landmarks.
- `now`, `request` and `privacy` gain `og:title`, `og:description` and `og:image` from the canonical page meta; the accepted documents had none. `blog` and `certificates` keep theirs.
- All 25 documents gain a `WebPage` JSON-LD record that restates the head (title, description, canonical URL, language, image) plus the site and author, and claims nothing else.
- The Certificates training label is server-rendered as the accepted runtime resolves it, from the UI pack. In Turkish and German the accepted static documents carry a different phrase from the page pack ("Eğitimler", "Weiterbildung") that the runtime then replaced ("Eğitim", "Training"). Visitors see what they saw before; the two packs disagreeing predates #30.5 and is a content fix.
- The contract is captured from the accepted documents. If a locale pack later changes one of them, regenerate with `npm run m3:remaining-routes:structure`; the gate fails until it matches.

The legacy documents, the redirect stubs, the 404 and project-shell companions and the legacy runtime stay in place (#31).
