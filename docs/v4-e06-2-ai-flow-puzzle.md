# V4-E06.2 — AI Flow Puzzle: the game

`/ai-flow-puzzle/` is the game's level select. Choosing a mission enters a
full-viewport play mode — briefing, workspace, result — and the portfolio's
header, footer and floating controls step out until the visitor leaves.

The game is **AI Flow Puzzle — by Kaan Balcı**. It borrows n8n's
node-and-wire grammar and the loop of *while True: learn()* (read the brief,
build, run, see where it breaks, fix, level up); it copies neither.

## What is where

| Piece | File |
| --- | --- |
| Rules: levels, board, run, validation, scoring, progress | `ai-flow-puzzle.js` |
| Accepted page markup (unchanged) | `data/site/m3-30-labs-games-structure.json` |
| Game shell markup, added at render time | `src/react/v4/consumers.jsx` (`flowPuzzle`) |
| Game flow controller | `js/pages/flow-puzzle-game.js` |
| Hub, workspace, briefing and result layout and look | `css/v4-flow-puzzle.css` |
| Shell copy, five locales | `aiFlow.game.*` in `data/i18n/messages/*/common.json` |
| What the shell adds to the page, as a reviewed delta | `scripts/v4-e06-2-flow-puzzle-edits.mjs` |
| Review pack and focused QA | `scripts/capture-v4-review.mjs` |

## State model

Presentation state belongs to the controller and is one attribute:

| `html[data-afp-state]` | Screen |
| --- | --- |
| absent | Hub: the page, with the level select in its hero |
| `mission` | Mission briefing |
| `building` | Workspace |
| `running` | Run flow in progress |
| `success` / `failure` | Result layer over the workspace |
| `error` | The engine did not start |

Puzzle state belongs to the engine. The controller reads it through
`window.KaanFlowPuzzle` and the engine's `aiflow:*` events (`ready`, `change`,
`touched`, `select`, `level`, `run-start`, `run-step`, `result`, `hint`), and
where it needs the engine to act it presses the engine's own control. It never
decides a verdict or a score.

One history entry is added on entering; browser Back returns to the level
select.

## What the engine kept, and what changed

Kept as they were: the three authored levels with their required nodes and
connections, the validation rule, the quality score and its five parts, the
award (`max(120, total × 4)`), templates, auto-arrange, JSON export/import,
the text report and the PNG export, and DOM + SVG as the rendering layer.

Changed on purpose — these are contract changes, not regressions:

- **Scoring is idempotent.** Progress is stored per level under
  `kaan-ai-flow-puzzle-progress-v3` (best quality and the award it earned);
  the score is the sum of those awards. Validating or running a finished level
  again can raise its best and can never add twice. The old
  `kaan-ai-flow-puzzle-score-v2` running total is no longer read or written,
  so a score inflated under it does not carry over.
- **Connections start at a port.** A node's body selects it. A connection is
  made by dragging its output port onto a node, or by pressing the port and
  then the target (touch and keyboard). The old "any click arms a connection"
  is gone.
- **Structural rules are stated by the ports.** A trigger takes no input and
  End gives no output; those connections are refused with a reason.
- **A wire can be picked up** at its target end and dropped on another node
  (rewired) or on the empty board (removed). A wire can be selected and
  deleted with Delete.
- **Run flow always runs.** The signal walks the flow as built, in execution
  order (depth first from the trigger), as far as the connections take it;
  only then is the flow judged. Before, an invalid flow refused to run.
- **A failure says where to look.** Besides the missing nodes and connections
  the rules name, the verdict reports nodes the trigger cannot reach, nodes
  where the flow stops, and which closing branches reached End. These point at
  the board; they do not change the verdict or the score.
- **Hints are counted** per attempt and shown with the result. They do not
  affect the score, and there is no hint limit.
- **A full-solution template is reported** on the result it produces.
- The board pans, zooms (wheel, pinch, buttons) and fits; on a tall board
  (a phone) the flow is laid out top to bottom with ports on top and bottom.

Not added, because the game does not have them: time limits, budgets, locks
between levels, star ratings. Difficulty on a mission card is its stated size
(required nodes plus connections; more than 14 reads "Advanced").

## Gates

- `qa:m3:labs-games`, static part: knows the shell as a reviewed delta
  (`withoutFlowPuzzleGame`) and the controller script. It still stops at the
  shared-bundle budget, as it did before this phase.
- `qa:m3:labs-games`, browser part: AI Flow Puzzle's behaviour functions were
  rewritten to the contract above (enter the game first, connect by port, v3
  progress, a repeated validation leaves the score unchanged), and its
  comparison with the accepted engine was retired — the engine was reworked on
  purpose, so there is no accepted play to be equal to. **These edits have not
  been executed**: the gate cannot reach its browser part past the budget
  stop, and Joyday's part of it is still unreconciled from E06.1. The other
  three engines' checks were not touched.
- The #30 reviewed edits (`scripts/m3-30-public-edits.mjs`) can no longer be
  reversed out of `ai-flow-puzzle.js`. `qa:m3:parity`, which was already red
  on this branch before E06.2 for an unrelated reason, will need the E06.2
  engine recorded as its own reviewed change when it is repaired.
- The behaviour itself is held by the focused QA in
  `scripts/capture-v4-review.mjs`, which builds every flow with real pointer
  and touch input.

## Shared game shell

Not extracted. After this phase the two play modes repeat the same small set
of responsibilities — entering and leaving (one history entry, focus
returned), holding everything outside the game inert, hiding the portfolio's
chrome, safe-area padding, a no-JavaScript notice, a recoverable failure state
— in `js/pages/joyday-studio.js` and `js/pages/flow-puzzle-game.js`. Those are
the candidates. Everything else (docks, tabs, briefing, result) is specific to
its game and should stay so.

## Future work

Recorded, not started:

- **Real-device verification.** Touch, pinch, safe areas and the tall board
  were checked in emulation only.
- **Handwritten notes use a system font stack** (`Segoe Print`, `Bradley Hand`,
  `Chalkboard SE`, …). It differs by platform; a bundled face would fix that.
- **The test message cannot be changed on a phone or tablet**; the briefing
  uses the first one. On desktop the selector is on the board.
- **Older browsers.** The layout uses `:has()`, `:is()`, `color-mix()` and
  individual transform properties (`translate`, `rotate`, `scale`).
- **Landscape-phone playability.** A phone on its side lays out correctly but
  its board is too short to wire comfortably; it was checked for layout only.
- **Inherited bundle-budget reconciliation** (shared React client over the
  `qa:m3:labs-games` budget since before this phase).
- **Joyday browser-flow reconciliation** in `qa:m3:labs-games` (from E06.1).
- **M3 parity reconciliation** for the reviewed E06.2 engine delta.
- **The legacy document** (`/ai-flow-puzzle.html` outside the React build)
  still loads the engine but not this shell or its stylesheet.
