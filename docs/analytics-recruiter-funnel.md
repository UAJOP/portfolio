# kaanbalci.com Analytics & Recruiter Funnel

Established by **BRIEF 06 — Analytics & Recruiter Funnel Measurement**, branch `feat/recruiter-funnel-analytics-v1`.

## Goal

Measure a small recruiter and project-inquiry funnel without turning the portfolio into a surveillance product. The implementation answers whether visitors discover selected work, validate projects through source/live evidence, open the CV or contact path, use Recruiter Mode, and complete the Request flow.

The repository audit found no existing analytics provider, tracker tag, `dataLayer`, telemetry module, or Search Console verification. BRIEF 05 contained only a future event list. This implementation therefore introduces one provider architecture rather than stacking a second tracker.

## Provider

**Selected: Umami Cloud, standard cookieless tracker. Production configuration is still required.**

Why it fits:

- managed hosting works with static GitHub Pages and needs no backend;
- the Hobby plan is free for a small site;
- normal page views and custom events are supported;
- the tracker supports domain restriction, query/hash exclusion, and Do Not Track;
- the live tracker transfer measured **2,301 bytes with Brotli** on 2026-08-29;
- the public Website ID can live in client configuration; no API key is needed by the website.

Official references: [Umami documentation](https://docs.umami.is/docs), [Cloud FAQ](https://docs.umami.is/docs/cloud/faq), [tracker configuration](https://docs.umami.is/docs/tracker-configuration), and [tracker functions](https://docs.umami.is/docs/tracker-functions).

Plausible was also technically suitable and privacy-oriented, but its managed service continues as a paid subscription after the trial. GA4 was not selected because its standard JavaScript tags use first-party visitor/session cookies and would create a larger consent and configuration surface for this deliberately small funnel. No self-hosted database, analytics stack, tag manager, or custom collection API was added.

## Privacy Model

The provider receives its normal cookieless page-view fields and only the approved custom events/properties below. The tracker is configured to exclude URL search parameters and hashes, restrict collection to `kaanbalci.com` / `www.kaanbalci.com`, and respect Do Not Track.

Collected by this integration:

- normal page path, referrer, browser/device summary and coarse location supplied by Umami's standard page-view model;
- one approved event name;
- controlled identifiers such as `project_slug`, `source`, `page_type`, `contact_type`, and a boolean `recruiter_mode`.

Explicitly not collected:

- name, email, phone, form fields, request details, chatbot text, search text, CV contents, visible CTA copy, raw query strings, storage contents, or manually collected IP addresses;
- theme/language toggles, scroll depth, hover, animation, replay, heatmap, fingerprint, or arbitrary click streams;
- a distinct user ID or any call to `umami.identify()`.

Umami documents that its server derives an anonymous session hash from connection metadata such as IP address, user agent, and Website ID. The portfolio code neither reads nor sends the IP itself and does not add a persistent identifier. No legal-compliance claim is made here; deployment ownership, regional selection, privacy notice, and applicable-law review remain the site owner's responsibility.

## Funnel

The measurement model is:

`VISIT → DISCOVER → EVIDENCE → VALIDATE → CONVERT`

- **Visit:** Umami's normal page view; there is no duplicate custom `page_view`.
- **Discover:** Recruiter Mode or one of five homepage Selected Work interactions.
- **Evidence:** project/case-study navigation from Works, Recruiter Mode, Ajoop, or project navigation.
- **Validate:** GitHub or live-demo intent.
- **Convert:** CV, direct contact, Request start, and confirmed Request submission.

Homepage project entry emits `selected_work_open`; it does not also emit `project_open` for the same click. Other project entries emit `project_open`. Page views remain separate provider-native observations.

## Event Taxonomy

| Event | Trigger | Parameters | Product question |
|---|---|---|---|
| `recruiter_mode_open` | Recruiter Mode changes from closed to open through an intentional action | `source`, automatic context | Is the accelerated recruiter path used? |
| `selected_work_open` | One of five recruiter-priority homepage project links | `project_slug`, `source=selected_work`, automatic context | Which homepage evidence earns intent? |
| `project_open` | A project/case-study navigation outside that homepage set | `project_slug`, `source`, automatic context | Which project evidence is intentionally opened? |
| `github_open` | A project or general GitHub link | `project_slug` when canonical context exists, `source`, automatic context | Does evidence continue to source validation? |
| `live_demo_open` | A canonical project's live/demo link | `project_slug`, `source`, automatic context | Which projects earn hands-on validation? |
| `cv_open` | Hero, About, game, Recruiter Mode, command palette, or Ajoop CV action | `source`, automatic context | Does the visitor move toward candidate review? |
| `contact_open` | Direct email or Request entry | `contact_type=email|request`, `source`, automatic context | Does the visitor move toward contact? |
| `request_start` | First non-hidden request field focus/change | `source=request`, automatic context | Did a project-inquiry visitor meaningfully begin? |
| `request_submit` | Only after the strict confirmed-success result | `source=request`, automatic context | Did the validated Request flow complete? |

“Automatic context” means `page_type` from the existing `<body data-page>` contract and `recruiter_mode` as a boolean. No optional `recruiter_mode_resume`, previous/next, or role-tab event was justified.

## Event Parameter Vocabulary

- `project_slug`: canonical detail slug or a stable kebab-case flagship identifier derived from canonical project IDs (`sinama`, `merge-rush`).
- `source`: one of `hero`, `selected_work`, `works`, `project`, `recruiter_mode`, `ajoop`, `header`, `footer`, `contact`, `request`, `about`, `games`.
- `page_type`: one of the 13 existing BRIEF 03 page types.
- `recruiter_mode`: boolean state at the moment of the action.
- `contact_type`: `email` or `request`, only for `contact_open`.

Unknown event names, project IDs, sources, page types, parameter keys, and contact types are dropped or reject the event. The code never derives properties from text content.

## Project Identification

`buildAnalyticsProjectCatalog()` reads `window.KAAN_PORTFOLIO.projects` and `.projectDetails`. Canonical `/projects/<slug>/` routes use their detail slugs. Authored flagship case studies are resolved through their canonical project IDs/links; records that already correspond to a detail record reuse that detail slug. Project titles are never identifiers.

The current catalog yields 27 analytics project identifiers: 25 canonical detail slugs plus `sinama` and `merge-rush`.

## Recruiter Mode

`recruiter_mode_open` fires only on a closed-to-open transition. Restoring the session intent marker does not open the modal and does not emit an event. Role tabs, focus movement, close actions, and drawer rendering are not tracked.

Actions inside the drawer use `source=recruiter_mode`; only resulting project, GitHub/live, CV, and contact actions are measurable.

## CV

The single `resumeLink` remains the destination contract. Declarative hero markers and central URL/inline-action classification cover the hero, About, game, Recruiter Mode, command palette, and Ajoop entry points without inspecting the document contents.

## Contact

`contact_open` covers intentional `mailto:` and Request-entry navigation. It sends `contact_type=email` or `request`, never the email address. LinkedIn is deliberately not a contact conversion event in this first taxonomy.

## Request Flow

`request_start` fires once per page lifetime at the first focus/change on a non-hidden input, select, or textarea. Loading `request.html`, focusing the honeypot, or reading field values does not trigger or populate analytics.

`request_submit` is inside the existing `REQUEST_SUBMISSION_STATE.SUCCESS` branch. That state is reachable only after a readable successful HTTP response, parseable JSON, and explicit `{ ok: true }`. Fetch start, fallback email, timeout, network failure, malformed response, HTTP failure, and `{ ok: false }` do not emit it.

## Ajoop Privacy

Ajoop message, matcher, user-input, and response code contains no analytics call. Central link classification sees only the clicked destination, resolves known canonical links, and assigns `source=ajoop`. User text, detected phrases, intent labels, and response copy never enter an event payload.

## Local Development

On `localhost`, `127.0.0.1`, `::1`, and `file://`:

- the external provider script is never added;
- production events are never sent;
- sanitized event objects are written with the `[analytics:debug]` console prefix;
- the same object is dispatched as `portfolio:analytics-debug` for browser automation.

Normal production does not emit debug console output. Unapproved preview domains also remain a silent no-op.

## Failure Behavior

Analytics initialization is idempotent and the provider script is appended asynchronously after local content. Event delegation runs in a guarded capture listener and never prevents navigation. Provider absence, ad blocking, load failure, missing configuration, queue failure, or exceptions from `umami.track()` are swallowed. The bounded pre-load queue holds at most 40 sanitized events and is discarded if the provider fails.

Recruiter Mode, navigation, project rendering, Ajoop, CV, and Request behavior never await analytics delivery.

## Analytics QA

Run:

```bash
npm run qa:analytics
```

The zero-dependency suite executes the real normalization/configuration functions and the full analytics module in local, unconfigured-production, configured-production, unavailable-provider, and throwing-provider harnesses. It validates the nine-event registry, canonical slugs, PII stripping, local no-network behavior, async loader, pre-load queue, single initialization, request-start deduplication, confirmed-success placement, Ajoop isolation, and production configuration safety.

`npm run qa` includes this suite.

## How to Configure Production

1. Create/sign in to an Umami Cloud account and choose the appropriate hosting region.
2. Add one website for `kaanbalci.com`.
3. Copy the site's public **Website ID**. Do not create or copy an API key for client use.
4. Set only `websiteId` in `js/core/analytics-config.js`.
5. Run `npm run qa:analytics` and `npm run qa`.
6. Deploy through the normal static-site process.

The empty value committed by BRIEF 06 is intentional. Until it is replaced, production collection is disabled.

## How to Verify Events

1. Open the production site with browser developer tools Network panel visible.
2. Confirm `https://cloud.umami.is/script.js` loads asynchronously and no search/hash data appears in collection requests.
3. Use Umami's Realtime and Events views while opening Recruiter Mode, one Selected Work project, GitHub/live evidence, CV, contact, and a controlled Request path.
4. Confirm failed/malformed Request responses emit no `request_submit`; confirm a successful test only with a safe test endpoint or approved real submission.
5. Check event properties for canonical slugs and controlled sources; no visible copy or user-entered content should appear.

For local inspection, watch `[analytics:debug]` in the console; local events never reach Umami.

Google Search Console is the natural SEO companion for search impressions, queries, indexing, and click-through data. No repository verification token exists, so no Search Console code or account-level setup was attempted.

## Future Dashboard

Documented only; no dashboard or vanity counter was built:

- Selected Work CTR = `selected_work_open / homepage views`
- Project → GitHub validation = `github_open / relevant project page views`
- Project → Demo validation = `live_demo_open / relevant project page views`
- CV intent = `cv_open / portfolio sessions`
- Contact intent = `contact_open / portfolio sessions`
- Request completion = `request_submit / request_start`
- Recruiter Mode adoption = `recruiter_mode_open / homepage views`

Total page views, bounce rate, time on site, and scroll depth are not success metrics by themselves. A recruiter can make a high-quality decision quickly.

## Remaining Measurement Debt

- Production collection is disabled until the user supplies an Umami Website ID.
- No real traffic exists yet, so no conversion rate can be claimed.
- Provider-region, privacy-notice, retention, and applicable-law decisions still require owner review.
- Event delivery is intentionally best effort; ad blockers and privacy tools will create undercounting.
- Search Console is not configured from this repository.
- No session replay, heatmap, user identity, revenue, cohort, or request-failure telemetry is enabled.
