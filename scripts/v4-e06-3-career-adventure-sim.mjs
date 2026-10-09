/* V4-E06.3 — Career Adventure, played by strategies (development only).
 *
 * The game's rules live in a simulation that touches no DOM (CareerSim, the
 * first part of adventure-game.js), so the same file the page ships can be
 * played here, thousands of drops a second. This tool is how the difficulty
 * was tuned and how its numbers are reproduced:
 *
 *   node scripts/v4-e06-3-career-adventure-sim.mjs                 the strategy table
 *   node scripts/v4-e06-3-career-adventure-sim.mjs --games 200     …with more runs each
 *   node scripts/v4-e06-3-career-adventure-sim.mjs --record        find a winning run and
 *                                                                  write it down as a fixture
 *
 * Strategies that never look at the board (one position, alternating edges,
 * random, deliberately bad) are the negative controls: they must not reach
 * the Job Offer. The two that look ahead stand in for a player who plans;
 * they are the evidence that the game can be won, and how often.
 *
 * The fixture (scripts/fixtures/v4-e06-3-winning-run.json) is a seed and every
 * drop of one winning run as [step, x]. The focused QA in
 * scripts/capture-v4-review.mjs replays it through the page's own clock.
 * Record it again whenever the simulation's numbers change. */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { CareerSim: S } = require("../adventure-game.js");
const { CFG, LEVELS } = S;
const FIXTURE = fileURLToPath(new URL("./fixtures/v4-e06-3-winning-run.json", import.meta.url));

const option = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at === -1 ? fallback : process.argv[at + 1]; };
const GAMES = Number(option("games", 100));
const PLANNED = Number(option("planned", 12));

const quiet = (sim, steps) => { for (let i = 0; i < steps && !sim.over && !sim.won; i += 1) { S.step(sim); sim.events.length = 0; } };

/* How good a board is to be left with: points gained, a low stack, small
 * things not buried under large ones, and twins close to each other. */
function evaluate(trial, sim) {
  let top = CFG.H, buried = 0, twins = 0, rungs = 0;
  const list = trial.bodies;
  for (const body of list) top = Math.min(top, body.y - body.r);
  for (let i = 0; i < list.length; i += 1) for (let j = 0; j < list.length; j += 1) {
    if (i === j) continue;
    const p = list[i], q = list[j];
    if (q.level >= p.level + 2 && q.y < p.y && Math.abs(q.x - p.x) < q.r * 0.9) buried += 1;
    if (j > i) {
      const gap = Math.max(0, Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r);
      if (p.level === q.level) twins += Math.min(220, gap) * (1 + p.level * 0.25);
      else if (Math.abs(p.level - q.level) === 1) rungs += Math.min(160, gap) * 0.25;
    }
  }
  const height = CFG.H - top;
  return (trial.score - sim.score) - height * height * 0.035 - buried * 30 - twins * 0.35 - rungs * 0.2 - trial.dangerTimer * 6 - (trial.over ? 1e7 : 0) + (trial.won ? 1e7 : 0);
}

/* Tries a spread of positions on a copy of the run and keeps the best. */
function bestMove(sim, spread = 9, horizon = 130) {
  let best = CFG.W / 2, bestValue = -Infinity;
  const r = LEVELS[sim.held].r;
  const xs = [];
  for (let i = 0; i < spread; i += 1) xs.push(Math.round(r + (CFG.W - 2 * r) * i / (spread - 1)));
  for (const body of sim.bodies) if (body.level === sim.held) xs.push(Math.round(body.x));
  for (const x of xs) {
    const trial = S.clone(sim);
    if (!S.drop(trial, x)) continue;
    quiet(trial, horizon);
    const value = evaluate(trial, sim);
    if (value > bestValue) { bestValue = value; best = x; }
  }
  return { x: best, value: bestValue };
}

const STRATEGIES = {
  "one position (centre)": { pick: () => () => CFG.W / 2 },
  "one position (left wall)": { pick: () => () => 0 },
  "alternating edges": { pick: () => { let n = 0; return () => (n++ % 2 ? CFG.W : 0); } },
  random: { pick: (seed) => { let a = seed * 7919 + 13; const next = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; return () => next() * CFG.W; } },
  /* As far as it can get from anything it could merge with. */
  "deliberately bad": { pick: () => (sim) => {
    const same = sim.bodies.filter((body) => body.level === sim.held);
    if (!same.length) return sim.drops % 2 ? CFG.W : 0;
    let best = 0, far = -1;
    for (let x = 0; x <= CFG.W; x += 20) { const distance = Math.min(...same.map((body) => Math.abs(body.x - x))); if (distance > far) { far = distance; best = x; } }
    return best;
  } },
  "looks one drop ahead": { planned: true, pick: () => (sim) => bestMove(sim).x },
  "looks ahead, uses both tools": { planned: true, pick: () => (sim) => {
    /* Debug clears what the dropper no longer hands out, or anything when the line is near. */
    if (sim.tools.debug > 0) { const target = S.debugTarget(sim); if (target && (target.level < S.pool(sim.highest)[0].level || sim.pressure > 0.7)) S.debug(sim); }
    const now = bestMove(sim);
    if (sim.tools.swap > 0 && sim.held !== sim.next) {
      const other = S.clone(sim); S.swap(other);
      const swapped = bestMove(other);
      if (swapped.value > now.value + 60) { S.swap(sim); return swapped.x; }
    }
    return now.x;
  } },
};

function play(strategy, seed, record) {
  const sim = S.create(seed);
  const choose = strategy.pick(seed);
  const drops = [];
  let waited = 0;
  while (!sim.over && !sim.won && sim.drops < 700 && waited < 400) {
    const x = choose(sim);
    if (S.drop(sim, x)) { waited = 0; if (record) drops.push([sim.steps, x]); quiet(sim, strategy.planned ? 96 : CFG.COOLDOWN + 6); }
    else { quiet(sim, 6); waited += 1; }
  }
  quiet(sim, 400);
  return { sim, drops };
}

const median = (list) => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

if (process.argv.includes("--record")) {
  const strategy = STRATEGIES["looks one drop ahead"];
  for (let seed = Number(option("seed", 1)); ; seed += 1) {
    const { sim, drops } = play(strategy, seed, true);
    console.log(`seed ${seed}: ${sim.won ? "Job Offer" : `over at ${LEVELS[sim.highest].id}`} · ${sim.drops} drops · score ${sim.score}`);
    if (!sim.won) continue;
    writeFileSync(FIXTURE, `${JSON.stringify({ note: "One winning run of Career Adventure: the seed and every drop as [step, x]. Written by scripts/v4-e06-3-career-adventure-sim.mjs --record; record it again when the simulation changes.", seed, drops, expect: { steps: sim.endedAt, score: sim.score, merges: sim.merges, drops: sim.drops, bestChain: sim.bestChain } })}\n`);
    console.log(`written: ${FIXTURE}`);
    break;
  }
} else {
  console.log(`Career Adventure · chamber ${CFG.W} × ${CFG.H}, line at ${CFG.DANGER_Y}, ${CFG.HZ} steps/s, grace ${(CFG.GRACE / CFG.HZ).toFixed(1)} s\n`);
  const rows = [];
  for (const [name, strategy] of Object.entries(STRATEGIES)) {
    const games = strategy.planned ? PLANNED : GAMES;
    const started = Date.now();
    const runs = [];
    for (let game = 0; game < games; game += 1) runs.push(play(strategy, 1000 + game * 37).sim);
    const won = runs.filter((sim) => sim.won), over = runs.filter((sim) => sim.over);
    rows.push({
      strategy: name, runs: games, "Job Offer": `${won.length} (${Math.round((won.length / games) * 100)} %)`, "game over": over.length,
      "drops to win (median)": median(won.map((sim) => sim.drops)), "drops to game over (median)": median(over.map((sim) => sim.drops)), "fewest drops to game over": over.length ? Math.min(...over.map((sim) => sim.drops)) : null,
      "furthest object (median)": LEVELS[median(runs.map((sim) => sim.highest))].id, "score (median)": median(runs.map((sim) => sim.score)), seconds: ((Date.now() - started) / 1000).toFixed(1),
    });
    console.log(`${name}: done`);
  }
  console.table(rows);
}
