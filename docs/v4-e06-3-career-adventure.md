# V4-E06.3 — Career Adventure: the game

`/adventure/` is the game's portfolio-facing page. **Play Career Adventure**
enters a full-viewport play mode — menu, run, pause, result — and the
portfolio's header, footer and floating controls step out until the visitor
leaves.

It is the same game it was: aim, drop, physics, two of the same object merge
into the next one, the stack grows, the last merge is the Job Offer. The
thirteen objects and their order are unchanged. What changed is everything
under and around that loop.

## What is where

| Piece | File |
| --- | --- |
| Rules: chamber, bodies, fixed-step physics, merging, scoring, spawn pool, overflow, tools (`CareerSim`, no DOM) | `adventure-game.js`, first part |
| The look: the thirteen objects and the three rooms, drawn in code (`CareerArt`) | `adventure-game.js`, second part |
| The game on the page: clock, canvas, input, sound, profile, `window.KaanCareerAdventure` | `adventure-game.js`, third part |
| Accepted page markup (unchanged) | `data/site/m3-30-labs-games-structure.json` |
| Game shell markup, added at render time | `src/react/v4/consumers.jsx` (`careerAdventure`) |
| Game flow controller | `js/pages/career-adventure-game.js` |
| Page additions, HUD, layers | `css/v4-career-adventure.css` |
| Shell copy and object names, five locales | `adventure.play.*` in `data/i18n/messages/*/common.json` |
| What the shell adds to the page, as a reviewed delta | `scripts/v4-e06-3-career-adventure-edits.mjs` |
| Strategy runs and the recorded winning run | `scripts/v4-e06-3-career-adventure-sim.mjs`, `scripts/fixtures/v4-e06-3-winning-run.json` |
| Review pack and focused QA | `scripts/capture-v4-review.mjs` |

## Architecture

```text
Shell (controller + CSS)      menu, HUD, pause, results; reads events, presses the API
        ↓
window.KaanCareerAdventure    start · pause · resume · stop · drop · aim · tool · set · state
        ↓
Input                         pointer, touch, keys → an aim and a drop
        ↓
Clock                         frames in, whole steps of 1/120 s out (at most 12 per frame)
        ↓
CareerSim                     contacts → impulses → positions → merges → overflow
        ↓
Renderer                      the room (painted once), bodies between two steps, effects
        ↓
Sound / haptics               synthesised notes; vibration on a phone
```

The simulation is a plain object and touches no DOM, so the file the page
ships also runs in Node (`require("./adventure-game.js").CareerSim`). Nothing
in it reads a clock; the same seed and the same drops give the same run.

Presentation state is one attribute, owned by the controller:

| `html[data-ca-state]` | Screen |
| --- | --- |
| absent | The page: hero with Play, the board as a poster |
| `menu` | Main menu (and How to Play, Settings, Career Path over it) |
| `playing` / `paused` | A run, with its HUD |
| `won` / `over` | Result layer |
| `error` | The engine did not start |

The engine reports through `adventure:ready`, `hud`, `state`, `merge`,
`milestone`, `end` and `settings`. The controller never decides a score, a
merge or an ending. One history entry is added on entering; browser Back
returns to the page.

## The rules, in numbers

- Chamber 440 × 620 units; the line 92 below the rim. Bodies are circles;
  each object is drawn to fill its circle.
- 120 steps a second. Contacts are solved floor-up with impulses carried from
  step to step, so a pile rests and does not sink into itself.
- A drop leaves from above the rim and is refused while that place is
  occupied; the next object is ready 0.45 s later.
- Two of the same object in contact merge by the next step, once. The new
  object swells to size over 0.15 s rather than appearing at it.
- Points for creating rung *n*: `5·n·(n+1)`. A merge within 0.8 s of the last
  continues a chain; each link is worth a quarter more, up to ×2. The Job
  Offer adds 5,000.
- The dropper hands out four neighbouring objects. Which four follows the
  furthest object reached, up to HTML / CSS … Database.
- Game over: something that has landed stays above the line for 2.2 s. The
  timer runs down twice as fast as it runs up, so a bounce does not end a run.
- Tools: **Re-scope** swaps the object in hand with the next (2 to start);
  **Debug** removes the smallest object (1 to start). HTML / CSS, Python,
  AI Flow, Portfolio and Interview are milestones; each refills one of both.
  Python opens the City Night room, AI Flow the AI Lab. Rooms change nothing
  but the picture.

## Difficulty, measured

`npm run v4:adventure:sim` plays the shipped simulation with strategies.
Measured on this build:

| Strategy | Runs | Job Offer | Median drops to game over |
| --- | --- | --- | --- |
| One position (centre) | 200 | 0 | 94 |
| One position (left wall) | 200 | 0 | 79 |
| Alternating edges | 200 | 0 | 86 |
| Random | 200 | 0 | 89 |
| Deliberately bad (far from any match) | 200 | 0 | 83 |
| Looks one drop ahead | 16 | 5 (31 %) | — |
| Looks ahead and uses both tools | 16 | 10 (62 %), median 144 drops | — |

The last two are small samples of a simple planner, not a model of a person.
They show that the game can be won and that planning and the tools are what
win it. Nothing in the simulation looks at how the player is doing.

## What changed on purpose

These are contract changes, not regressions:

- **Physics no longer depends on the display.** Before, the simulation
  advanced once per frame.
- **Game over exists and stays.** The old rule could not be met in play, and
  what it led to was an automatic restart.
- **The board is narrower and the objects larger for it**; one drop position
  no longer wins.
- **Scoring is new** (see above), so the old best score is not comparable.
  The profile is kept under `kaan-career-adventure-v2`
  (`best`, `highest`, `wins`, `runs`, `settings`). `kaan-career-merge-best`
  is neither read nor written; an old best does not carry over.
- **Objects are drawn, not emoji**, and named in the page's language. Job
  Offer keeps its name in every language, as the page's own copy does.
- **A touch drops on lifting the finger**, a mouse on click, Space or Enter
  from the keyboard; `1` and `2` are the tools, `P` pauses.
- Sound is synthesised in the browser after the first press; no audio file,
  image or font is loaded by the game.

## Gates

- Focused QA and the review pack: `scripts/capture-v4-review.mjs`. It checks
  the rules at every step of 500 strategy runs, replays the recorded winning
  run through the page and compares it with the run outside the browser, and
  drives the game at 30–240 Hz and on irregular frames.
- `qa:m3:labs-games`, static part: knows the shell as a reviewed delta
  (`withoutCareerAdventureGame`) and the controller script. It still stops at
  the shared-bundle budget, as it did before this phase (the React client is
  328 KB raw / 85 KB gzip; it was 317 / 83 KB after E06.2).
- `qa:m3:labs-games`, browser part: Career Adventure's functions
  (`adventureBehaviour`, `adventureTouch`, `adventureWin`, the lifecycle and
  keyboard-isolation controls that edit the engine's source by exact text)
  still describe the old engine. **They have not been rewritten or run.** As
  with AI Flow Puzzle in E06.2 there is no accepted play left to be equal to.
- The #30 reviewed edits can no longer be reversed out of `adventure-game.js`;
  `qa:m3:parity` will need the E06.3 engine recorded as its own reviewed
  change when it is repaired.
- `qa:runtime` fails on six checks that fail identically without this phase.

## Future work

Recorded, not started:

- **Real-device verification.** Touch, safe areas, vibration and frame pacing
  were checked in emulation only.
- **`qa:m3:labs-games` browser-flow reconciliation** for this game.
- **Landscape phone** lays out and plays, but its chamber is small; it is the
  reduced layout, not a tuned one.
- **The legacy document** (`/adventure/index.html` outside the React build)
  loads the engine and plays in place, without the shell.
- **Older browsers.** The layout uses `:has()`-free CSS but relies on `:is()`,
  `dvh`, `inert` and `aspect-ratio`.
- **The planner's win rate is a small sample.** A larger one, or a person's
  results, may argue for a different chamber or pool.

## For the Works / case-study pass

```json
{
  "id": "career-adventure",
  "title": "Kaan's Career Adventure",
  "status": "Playable",
  "playRoute": "/adventure/",
  "coreMechanic": "Drop-and-merge physics game: two of the same career object merge into the next, from Book to Job Offer, in a chamber that must not overflow.",
  "ladder": ["Book", "Keyboard", "Mouse", "Monitor", "HTML / CSS", "JavaScript", "Python", "C# / .NET", "Database", "AI Flow", "Portfolio", "Interview", "Job Offer"],
  "stack": ["Vanilla JavaScript", "Canvas 2D", "Web Audio (synthesised)", "React-rendered shell", "CSS"],
  "architecture": "A DOM-free deterministic simulation (fixed 1/120 s step, warm-started impulse solver) under a clock, a canvas renderer and an event-driven game shell.",
  "improvements": [
    "Fixed-timestep physics: the same game at every refresh rate",
    "A real, reachable game over with a grace period",
    "Difficulty from geometry and the spawn pool; single-position play no longer wins",
    "Hand-drawn objects and three rooms, no image assets",
    "Menu, HUD, pause, victory and game-over screens; mobile-first touch control",
    "Chains, milestones, two career-themed tools, unlockable environments",
    "Five locales; reduced-effects mode; keyboard play"
  ],
  "evidence": "scripts/capture-v4-review.mjs (focused QA), scripts/v4-e06-3-career-adventure-sim.mjs (strategy runs)"
}
```
