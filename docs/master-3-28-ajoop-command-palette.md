# Master 3 #28 — Ajoop + Command Palette React ownership

## Scope

On the 20 React production documents (Home, About, Works and Games in `en`, `tr`, `de`, `es` and `fr`), React owns the public Ajoop panel **shell** and the complete **Command Palette**. The Ajoop conversation engine is unchanged: routing, context, evidence, responses, follow-ups, the optional local AI bridge (`ajoop-ai-config.js`, `js/ajoop/ai-bridge.js`, `rag-client.js`) and the local/free fallback. Legacy-owned routes keep the classic shell and palette through an explicit compatibility boundary. Nothing is removed; removal belongs to #31.

## Ownership map (React documents)

| Subtree / event | Owner |
| --- | --- |
| `#react-ajoop-root` → `[data-portfolio-chatbot]`: launcher, panel chrome, header, mascot, service line, action row, composer | React (`src/react/production/AjoopShell.jsx`) |
| Ajoop open/close, focus entry, Escape, Tab trap, inert background, overlay body state | React |
| `[data-chatbot-messages]` — the transcript island | Ajoop engine (`js/ajoop/assistant.js` message builders) |
| Conversation state, turns, answers, actions, AI bridge, mascot state machine, service verdict | Ajoop engine |
| `#react-command-root` → `[data-command-palette]`, results, filtering, Ctrl/⌘+K, toggles, Escape, backdrop, command execution | React (`src/react/production/CommandPalette.jsx`) |
| Command data (incl. commands added at load by `creative.js`, `games.js`, `portfolio-v2.js`) | Runtime command surface, read with `getUltimateContent()` |
| Header, footer, theme, locale switching, mobile navigation | Unchanged COMMON runtime |

## Transcript island contract

1. **One container.** `[data-chatbot-messages]` (`class="chatbot-messages"`, `aria-live="polite"`) is the only part of the Ajoop panel React does not reconcile.
2. **SSR empty, never reconciled.** React renders it with a module-level constant `dangerouslySetInnerHTML={{ __html: "" }}` and `suppressHydrationWarning`. React compares that prop by identity, so it never sets `innerHTML` after the first render and never diffs the children — not during hydration and not on any later render.
3. **Single writer.** Only the engine's QA-pinned builders write into it (`renderAjoopMessage`, `fillAjoopMessage`, `openAjoopTurn`, `commitAjoopTurnNode`, `resetChatbotMessages`, …), located with `ajoopMessageList()`. React never reads or writes its children; the engine never touches any other part of a React-owned shell.
4. **Lifecycle.** The React root is hydrated once and never unmounted, so the island lives exactly as long as the page and the engine's transcript. Resetting a conversation (Start over, locale change, engine initialization) is the engine clearing its own container. There is nothing for React to clean up; the port connection is released by `disconnect()` if the root ever unmounts.

## Presentation port (engine ↔ shell)

`js/ajoop/assistant.js` (`ajoop-presentation-port` block) routes every non-transcript write through `presentAjoop(kind, value)`:

| Kind | Value | Engine source |
| --- | --- | --- |
| `mascot` | `{ state, label }` | `setAjoopMascotState` (transient-state timers stay in the engine) |
| `service` | `{ state, label }` | `renderAjoopBridgeStatus` |
| `busy` | boolean | `setAjoopTurnBusy` |
| `actions` | `{ mode, heading, actions, secondary }` | `renderAjoopActions` |
| `copy` | `{ launcher, title, subtitle, inputPlaceholder, sendLabel, openLabel, closeLabel }` | `updatePortfolioChatbotLanguage` |

- Legacy documents: `ajoopDomShell` writes the classic DOM exactly as before (`qa:ajoop` turn-feedback suite unchanged).
- React documents: the engine records the latest state and never writes shell DOM. React calls `connectAjoopPresentation(port)` on takeover, applies the snapshot, and receives every later change. `actions` and `busy` commit synchronously because the engine scrolls the transcript right after them.
- React → engine calls are the existing public functions: `submitAjoopComposer`, `noteAjoopComposerActivity`, `runAjoopAction`, `setAjoopPanelOpenState`, `initializeAjoopAi`, `focusAjoopEntry`, `isAjoopTouchFirst`. React keeps no conversation state.

## Before hydration

Both overlays follow the #27 handoff:

1. The SSR markup is complete. On React documents `setupPortfolioChatbot()` / `setupCommandPalette()` build nothing; they start the engine (greeting into the island, recorded shell state) and install temporary entry listeners.
2. `setChatbotOpen` / `setCommandPaletteOpen` record the request on the owner (`__portfolioReactAjoopRequest`, `__portfolioReactCommandRequest`). Before React is ready they open or close the SSR markup at the attribute level and mark it `preHydrationApplied`.
3. React initializes from that state, calls the owner's `…EntryCleanup()` to remove the entry listeners, sets `…Ready`, and from then on receives requests as `portfolio:react-ajoop-request` / `portfolio:react-command-request` events. At any moment exactly one set of listeners owns each event.
4. Palette results are runtime data and appear when React hydrates; text typed earlier becomes the filter at that moment. The Ajoop action row likewise appears from the engine's recorded state.
5. The closed Ajoop panel carries `hidden` in addition to the classic `aria-hidden="true"`. It is `display: none` either way; the attribute makes the server-rendered markup valid HTML (no focusable controls inside an `aria-hidden` container). Opening removes it, before hydration as well. This is the only attribute in which the React shell differs from the classic shell, and the #28 gate asserts it explicitly.

## Launcher readiness

Before #28 the classic runtime created the launcher, so it never existed without a handler. The server-rendered launcher must not regress that: a visible, apparently enabled control that drops clicks while the classic scripts load (measured at ~5 s on Fast 3G and ~19 s on Slow 3G with 4× CPU before this contract).

- `portfolio-v2.css` keeps `.chatbot-launcher` at `visibility: hidden` inside `[data-react-ajoop-shell]` until the owner container carries `data-ajoop-interactive`. Hidden means not visible, not hit-testable and not focusable; the box is kept, so revealing it shifts nothing.
- Only a handler owner sets the marker: `setupReactOwnedAjoopEntry()` sets it in the same step that installs the classic entry listeners, and React sets it again on takeover. Parsing the HTML or downloading the module never does. The launcher is therefore revealed as soon as the classic entry is live, without waiting for hydration, and it stays revealed across the takeover.
- The marker lives on the `hydrateRoot` container, which React does not reconcile, so it cannot cause a hydration mismatch. Without JavaScript the launcher stays hidden, as it was absent before.
- The #28 gate samples every animation frame (delayed `assistant.js`, and Fast 3G with 4× CPU) and requires zero frames in which the launcher is visible without a handler, an immediate open on the first click after reveal, exactly one open transition and no Ajoop analytics event (classic routes emit none either). Legacy routes keep the classic launcher unchanged.

## COMMON dependency surface

Every classic global React uses is named in `src/react/production/commonRuntime.js` and nowhere else: `shell.js` (overlay stacking, inert, focus trap, CV preview), `analytics.js`, `locale.js`, `theme.js`, `routing.js`, `ultimate.js`, `creative.js`, the three cross-overlay open functions, and the Ajoop engine functions above. All are function declarations of the classic runtime; none comes from `legacy-script.js`. #31 replaces this one module when it removes the classic runtime.

## Copy

- SSR chrome copy (`scripts/m3-28-overlay-copy.mjs`) is resolved exactly as the runtime resolves it: English from the feature literals, other locales by merging the shipped `i18n/pack-{locale}-core.js` with `locale.js`'s own `mergeLocaleCopy`, phrases with `getI18nText` semantics. It holds no copy.
- After hydration the shell shows what the engine pushes; the #28 gate proves it equals the SSR copy in all five locales. No translation was added or changed.

## Legacy edit boundary

`data/site/m3-28-public-delta.json` pins the five touched public files; `scripts/m3-28-public-edits.mjs` holds the reviewed edits, and reversing them reproduces the previously pinned bytes (`0543fce`):

- `js/ajoop/assistant.js` — presentation port, React entry, shared submit/composer functions.
- `js/features/command-palette.js` — request bridge, renderer stand-down, React entry.
- `js/features/ultimate.js` — no rewrite of the React-owned palette input.
- `js/core/i18n-runtime.js` — the classic i18n walker skips both new React roots.
- `portfolio-v2.css` — the launcher readiness rule.

## Gates

- `qa:m3:ajoop-command-palette` (in `qa:m3:cutover`, repeated in `qa:m3:artifact`): SSR contract and payload privacy for 20 documents; SSR = runtime copy and zero hydration errors in five locales; legacy-route vs React-route differential of shell DOM, multi-turn transcripts, action rows, palette results and command analytics; pre-hydration open/submit/typing with exactly-once handoff; Ajoop ↔ Command Palette ↔ Recruiter Mode transitions with inert/focus/Escape/backdrop/Tab trap; touch-first focus; internal navigation; legacy routes as negative controls; comparator negative controls. The AI edge is stubbed, so no network is used.
- `qa:m3:parity`: the #28 public delta, layered under #25-B/#26/#27, with four controls; Home/About stay byte-identical to the accepted documents once the #27 and #28 roots are stripped.
- G-63 / G-66: earlier budgets unchanged; `data/site/m3-28-performance-budget.json` adds a measured document increment and per-root SSR/payload limits. The client bundle stays within the existing budget.

## Pre-existing defects recorded, not changed

### #27 Recruiter Mode takeover clears other overlays' modal state (UI/runtime defect)

Opening the Ajoop panel or the Command Palette before the Recruiter root hydrates calls `setRecruiterMode(false)`, which records a pre-hydration close request. When `RecruiterMode` takes over it treats that request as applied and calls `setBackgroundInert()` with no argument (`src/react/production/RecruiterMode.jsx`, takeover effect), which clears the shared inert list, and its layout effect removes `overlay-modal-open`. The other overlay stays open but without an inert background or modal body state. The accepted `0543fce` build behaves identically for the classic panel; #28 does not change it. This is an overlay-ownership defect in the #27 runtime, unrelated to Ajoop's conversation engine or reasoning, and it remains open for a separate fix.

### Early-message reset (conversation lifecycle defect)

`portfolio-v2.js` runs `syncAjoop()` at `DOMContentLoaded` and ends it with `updatePortfolioChatbotLanguage()`, which restarts the conversation. On React documents the module bundle delays `DOMContentLoaded`, so a question asked before then is replaced by the greeting when the page finishes loading. The accepted `0543fce` build behaves identically. It is engine initialization, outside #28's presentation scope; the gate asserts the accepted outcome.
