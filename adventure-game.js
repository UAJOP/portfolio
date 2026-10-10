/* Career Adventure — the simulation (V4-E06.3).
 *
 * Everything the game decides lives here and touches no DOM: the chamber, the
 * bodies, the fixed-step physics, the merge rule, scoring, the spawn pool and
 * the overflow rule. The same code runs the page, the focused QA's strategy
 * runs and Node. A run is a plain object, so it can be copied and replayed.
 *
 * Time is counted in steps of 1/120 s. Nothing reads a clock or a frame. */
const CareerSim = (function () {
  "use strict";

  const LEVELS = [
    { id: "book", r: 19 },
    { id: "keyboard", r: 23 },
    { id: "mouse", r: 29 },
    { id: "monitor", r: 34 },
    { id: "htmlcss", r: 40 },
    { id: "javascript", r: 46 },
    { id: "python", r: 52 },
    { id: "csharp", r: 59 },
    { id: "database", r: 66 },
    { id: "aiflow", r: 73 },
    { id: "portfolio", r: 80 },
    { id: "interview", r: 88 },
    { id: "joboffer", r: 97 }
  ];
  const LAST = LEVELS.length - 1;

  const CFG = {
    W: 440,              /* chamber: inner width */
    H: 620,              /* chamber: floor, measured down from the rim (y = 0) */
    DANGER_Y: 92,        /* the overflow line */
    SPAWN_GAP: 10,       /* the held object waits this far above the rim */
    HZ: 120,
    G: 1900,             /* gravity, units / s² */
    REST: 0.12,          /* bounce, only above REST_SPEED */
    REST_SPEED: 140,
    MU: 0.8,             /* object on object: these are desk things, not marbles */
    MU_WALL: 0.8,
    LIN_DAMP: 0.9992,
    ANG_DAMP: 0.94,
    MAX_SPEED: 2400,
    REST_V: 7,           /* a held body slower than this (and turning slower than REST_W) is at rest */
    REST_W: 0.5,
    VEL_ITERS: 12,
    POS_ITERS: 12,
    SLOP: 0.25,
    BETA: 0.85,
    TOUCH: 0.6,          /* bodies this near are in contact: what rests, stays resting */
    MERGE_EPS: 1.2,      /* same objects this close are touching */
    GROW_STEPS: 18,      /* a merged object swells to its size, it does not appear at it */
    GROW_FROM: 0.65,
    COOLDOWN: 54,        /* steps between a drop and the next object being ready */
    LAND_STEPS: 42,      /* a landed object counts for overflow after this long */
    GRACE: 264,          /* steps above the line before the run ends (2.2 s) */
    CHAIN_WINDOW: 96,    /* steps in which the next merge continues a chain */
    POOL_MAX: 8,         /* the largest object the dropper ever hands out (Database) */
    POOL_LEAD: 5,        /* how early the pool follows the furthest object reached */
    WINDOW: 4,           /* how many different objects the dropper can hand out */
    POOL_BIAS: 0.78,     /* each step up the pool is this much rarer */
    WIN_BONUS: 5000,
    /* Milestones on the way: each one is announced and refills a tool. */
    MILESTONES: [4, 6, 9, 10, 11],
    TOOLS: { swap: 2, debug: 1 }
  };

  /* Points for creating the object at `level` (1..12): triangular, as the
   * objects themselves grow. */
  function points(level) { return 5 * level * (level + 1); }
  function chainFactor(chain) { return 1 + Math.min(4, chain - 1) * 0.25; }

  /* The dropper's pool follows the run: the furthest object reached decides
   * the largest one handed out, and the window above keeps it to WINDOW kinds. */
  function poolTop(highest) { return Math.max(2, Math.min(CFG.POOL_MAX, Math.floor((highest + CFG.POOL_LEAD) / 2))); }
  function pool(highest) {
    let top = poolTop(highest);
    let low = Math.max(0, top - (CFG.WINDOW - 1));
    let list = [];
    for (let level = low; level <= top; level += 1) list.push({ level: level, weight: Math.pow(CFG.POOL_BIAS, level - low) });
    return list;
  }

  function random(sim) {
    let a = (sim.rng = (sim.rng + 0x6d2b79f5) >>> 0);
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function pick(sim) {
    let list = pool(sim.highest);
    let total = 0;
    for (let i = 0; i < list.length; i += 1) total += list[i].weight;
    let roll = random(sim) * total;
    for (let j = 0; j < list.length; j += 1) { roll -= list[j].weight; if (roll < 0) return list[j].level; }
    return list[list.length - 1].level;
  }

  function body(sim, level, x, y) {
    let r = LEVELS[level].r;
    let mass = r * r / 400;
    return { id: (sim.nextId += 1), level: level, x: x, y: y, px: x, py: y, vx: 0, vy: 0, a: 0, pa: 0, w: 0, r: r, R: r, im: 1 / mass, ii: 2 / (mass * r * r), grow: 0, landed: 0, held: 0, born: sim.steps, merged: false };
  }

  function create(seed) {
    let sim = {
      rng: (seed >>> 0) || 1, bodies: [], nextId: 0, steps: 0,
      held: 0, next: 0, cooldown: 0,
      score: 0, highest: 0, merges: 0, drops: 0,
      chain: 0, chainTimer: 0, bestChain: 0,
      dangerTimer: 0, pressure: 0,
      over: false, won: false, endedAt: -1, top: CFG.H, warm: {},
      tools: { swap: CFG.TOOLS.swap, debug: CFG.TOOLS.debug }, used: { swap: 0, debug: 0 },
      events: []
    };
    /* The first objects are the first rungs: a run opens on a Book. */
    sim.held = 0;
    sim.next = pick(sim);
    return sim;
  }

  function clone(sim) {
    let copy = {};
    for (let key in sim) copy[key] = sim[key];
    copy.events = [];
    copy.tools = { swap: sim.tools.swap, debug: sim.tools.debug };
    copy.used = { swap: sim.used.swap, debug: sim.used.debug };
    copy.bodies = sim.bodies.map(function (b) { let c = {}; for (let k in b) c[k] = b[k]; return c; });
    return copy;
  }

  function spawnY(level) { return -LEVELS[level].r - CFG.SPAWN_GAP; }
  function clampX(level, x) { let r = LEVELS[level].r; return Math.max(r + 0.5, Math.min(CFG.W - r - 0.5, x)); }

  /* The waiting object must have clear air: it never appears inside the stack. */
  function blocked(sim, x) {
    let r = LEVELS[sim.held].r;
    for (let i = 0; i < sim.bodies.length; i += 1) {
      let b = sim.bodies[i];
      let dx = b.x - x, dy = b.y - spawnY(sim.held), reach = b.r + r;
      if (dx * dx + dy * dy < reach * reach) return true;
    }
    return false;
  }

  function canDrop(sim, x) {
    return !sim.over && !sim.won && sim.cooldown === 0 && !blocked(sim, clampX(sim.held, x));
  }

  function drop(sim, x) {
    x = clampX(sim.held, x);
    if (!canDrop(sim, x)) return false;
    let b = body(sim, sim.held, x, spawnY(sim.held));
    /* No hand is perfectly still: a drop leaves with a trace of drift and spin,
     * drawn from the run's own sequence, so nothing balances on a pin. */
    b.vx = (random(sim) - 0.5) * 14;
    b.w = (random(sim) - 0.5) * 0.8;
    sim.bodies.push(b);
    sim.drops += 1;
    sim.cooldown = CFG.COOLDOWN;
    sim.events.push({ type: "drop", level: b.level, x: x });
    sim.held = sim.next;
    sim.next = pick(sim);
    return true;
  }

  /* Re-scope: the object in hand and the one after it change places. */
  function swap(sim) {
    if (sim.over || sim.won || sim.tools.swap < 1 || sim.held === sim.next) return false;
    let held = sim.held; sim.held = sim.next; sim.next = held;
    sim.tools.swap -= 1; sim.used.swap += 1;
    sim.events.push({ type: "swap" });
    return true;
  }

  /* Debug: the smallest object in the chamber is taken out. Of several, the
   * one highest in the stack, where it is most in the way. */
  function debugTarget(sim) {
    let found = null;
    for (let i = 0; i < sim.bodies.length; i += 1) {
      let b = sim.bodies[i];
      if (!b.landed) continue;
      if (!found || b.level < found.level || (b.level === found.level && (b.y < found.y || (b.y === found.y && b.id < found.id)))) found = b;
    }
    return found;
  }
  function debug(sim) {
    if (sim.over || sim.won || sim.tools.debug < 1) return false;
    let target = debugTarget(sim);
    if (!target) return false;
    sim.bodies = sim.bodies.filter(function (b) { return b !== target; });
    sim.tools.debug -= 1; sim.used.debug += 1;
    sim.events.push({ type: "debug", level: target.level, x: target.x, y: target.y, r: target.r, id: target.id });
    return true;
  }

  const contacts = [];

  /* Every touch in the chamber this step. A touch that was there a step ago
   * starts from the push it ended on, which is what lets a pile settle. */
  function collect(sim) {
    let bodies = sim.bodies, n = bodies.length, count = 0, kept = sim.warm;
    function add(a, b, nx, ny, pen, key) {
      let c = contacts[count] || (contacts[count] = {});
      let before = kept[key];
      c.a = a; c.b = b; c.nx = nx; c.ny = ny; c.pen = pen; c.key = key;
      c.jn = before ? before[0] : 0; c.jt = before ? before[1] : 0;
      count += 1;
    }
    for (let i = 0; i < n; i += 1) {
      let a = bodies[i];
      /* A body resting on the glass sits exactly on it, so touching counts. */
      if (a.x - a.r < CFG.TOUCH) add(a, null, -1, 0, a.r - a.x, a.id * 65536 + 65533);
      if (a.x + a.r > CFG.W - CFG.TOUCH) add(a, null, 1, 0, a.x + a.r - CFG.W, a.id * 65536 + 65534);
      if (a.y + a.r > CFG.H - CFG.TOUCH) add(a, null, 0, 1, a.y + a.r - CFG.H, a.id * 65536 + 65535);
      for (let j = i + 1; j < n; j += 1) {
        let b = bodies[j];
        let dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r + CFG.TOUCH;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        let d = Math.sqrt(d2);
        let key = a.id < b.id ? a.id * 65536 + b.id : b.id * 65536 + a.id;
        if (d < 1e-6) add(a, b, 0, -1, reach, key); else add(a, b, dx / d, dy / d, reach - d, key);
      }
    }
    return count;
  }

  /* The push a contact ended the last step on, applied before this one is solved. */
  function resume(c) {
    let a = c.a, b = c.b, px = c.jn * c.nx - c.jt * c.ny, py = c.jn * c.ny + c.jt * c.nx;
    a.vx -= px * a.im; a.vy -= py * a.im; a.w -= c.jt * a.r * a.ii;
    if (b) { b.vx += px * b.im; b.vy += py * b.im; b.w -= c.jt * b.r * b.ii; }
  }

  /* One contact, one pass: the normal impulse stops the approach, friction
   * turns sliding into rolling. Impulses are accumulated so each stays within
   * what the contact can really give. */
  function solve(c) {
    let a = c.a, b = c.b, nx = c.nx, ny = c.ny;
    let imb = b ? b.im : 0, iib = b ? b.ii : 0, rb = b ? b.r : 0;
    let bvx = b ? b.vx : 0, bvy = b ? b.vy : 0, bw = b ? b.w : 0;
    let rvx = bvx - a.vx, rvy = bvy - a.vy;
    let vn = rvx * nx + rvy * ny;
    let k = a.im + imb;
    let bounce = -vn > CFG.REST_SPEED ? CFG.REST : 0;
    let jn = -(1 + bounce) * vn / k;
    let before = c.jn;
    c.jn = Math.max(0, before + jn);
    jn = c.jn - before;
    if (jn !== 0) {
      a.vx -= jn * nx * a.im; a.vy -= jn * ny * a.im;
      if (b) { b.vx += jn * nx * imb; b.vy += jn * ny * imb; }
    }
    let tx = -ny, ty = nx;
    rvx = (b ? b.vx : 0) - a.vx; rvy = (b ? b.vy : 0) - a.vy;
    let vt = rvx * tx + rvy * ty - bw * rb - a.w * a.r;
    let kt = a.im + imb + a.r * a.r * a.ii + rb * rb * iib;
    let limit = (b ? CFG.MU : CFG.MU_WALL) * c.jn;
    let jt = -vt / kt;
    let held = c.jt;
    c.jt = Math.max(-limit, Math.min(limit, held + jt));
    jt = c.jt - held;
    if (jt !== 0) {
      a.vx -= jt * tx * a.im; a.vy -= jt * ty * a.im; a.w -= jt * a.r * a.ii;
      if (b) { b.vx += jt * tx * imb; b.vy += jt * ty * imb; b.w -= jt * rb * iib; }
    }
  }

  function separate(sim) {
    let bodies = sim.bodies, n = bodies.length;
    for (let i = 0; i < n; i += 1) {
      let a = bodies[i];
      for (let j = i + 1; j < n; j += 1) {
        let b = bodies[j];
        let dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        let d = Math.sqrt(d2), nx = 0, ny = -1;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; }
        let push = Math.max(0, reach - d - CFG.SLOP) * CFG.BETA / (a.im + b.im);
        a.x -= nx * push * a.im; a.y -= ny * push * a.im;
        b.x += nx * push * b.im; b.y += ny * push * b.im;
      }
    }
    for (let m = 0; m < n; m += 1) {
      let c = bodies[m];
      if (c.x < c.r) c.x = c.r;
      if (c.x > CFG.W - c.r) c.x = CFG.W - c.r;
      if (c.y > CFG.H - c.r) c.y = CFG.H - c.r;
    }
  }

  /* Two of the same object that touch become the next one, once. A body takes
   * part in at most one merge per step, and the order is fixed: the furthest
   * objects first, then the oldest. */
  function merge(sim) {
    let bodies = sim.bodies, n = bodies.length, pairs = null;
    for (let i = 0; i < n; i += 1) {
      let a = bodies[i];
      if (a.level >= LAST) continue;
      for (let j = i + 1; j < n; j += 1) {
        let b = bodies[j];
        if (b.level !== a.level) continue;
        let dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r + CFG.MERGE_EPS;
        if (dx * dx + dy * dy <= reach * reach) (pairs || (pairs = [])).push([a, b]);
      }
    }
    if (!pairs) return;
    pairs.sort(function (p, q) { return q[0].level - p[0].level || p[0].id - q[0].id || p[1].id - q[1].id; });
    for (let p = 0; p < pairs.length; p += 1) {
      let one = pairs[p][0], two = pairs[p][1];
      if (one.merged || two.merged) continue;
      one.merged = two.merged = true;
      let level = one.level + 1;
      let made = body(sim, level, (one.x + two.x) / 2, (one.y + two.y) / 2);
      made.vx = (one.vx + two.vx) / 2; made.vy = (one.vy + two.vy) / 2;
      made.grow = CFG.GROW_STEPS;
      made.r = made.R * CFG.GROW_FROM;
      made.landed = 1;
      made.x = Math.max(made.r, Math.min(CFG.W - made.r, made.x));
      made.y = Math.min(CFG.H - made.r, made.y);
      made.px = made.x; made.py = made.y;
      bodies.push(made);
      sim.merges += 1;
      sim.chain = sim.chainTimer > 0 ? sim.chain + 1 : 1;
      sim.chainTimer = CFG.CHAIN_WINDOW;
      if (sim.chain > sim.bestChain) sim.bestChain = sim.chain;
      let gained = Math.round(points(level) * chainFactor(sim.chain));
      let first = level > sim.highest;
      if (first) {
        sim.highest = level;
        if (CFG.MILESTONES.indexOf(level) !== -1) { sim.tools.swap += 1; sim.tools.debug += 1; sim.events.push({ type: "milestone", level: level }); }
      }
      if (level === LAST) { gained += CFG.WIN_BONUS; sim.won = true; sim.endedAt = sim.steps; }
      sim.score += gained;
      sim.events.push({ type: "merge", level: level, x: made.x, y: made.y, r: made.R, chain: sim.chain, points: gained, first: first, id: made.id, from: [{ id: one.id, x: one.x, y: one.y, a: one.a }, { id: two.id, x: two.x, y: two.y, a: two.a }] });
      if (sim.won) sim.events.push({ type: "win", id: made.id });
    }
    sim.bodies = bodies.filter(function (b) { return !b.merged; });
  }

  function step(sim) {
    let bodies = sim.bodies, dt = 1 / CFG.HZ, i, b;
    sim.steps += 1;
    let live = !sim.over && !sim.won;
    if (sim.cooldown > 0) sim.cooldown -= 1;
    if (sim.chainTimer > 0) { sim.chainTimer -= 1; if (sim.chainTimer === 0) sim.chain = 0; }

    for (i = 0; i < bodies.length; i += 1) {
      b = bodies[i];
      b.px = b.x; b.py = b.y; b.pa = b.a;
      if (b.grow > 0) { b.grow -= 1; b.r = b.R * (CFG.GROW_FROM + (1 - CFG.GROW_FROM) * (1 - b.grow / CFG.GROW_STEPS)); }
      b.vy += CFG.G * dt;
      b.vx *= CFG.LIN_DAMP; b.vy *= CFG.LIN_DAMP; b.w *= CFG.ANG_DAMP;
    }

    /* Lowest first: contacts are then solved from the floor up, the order in
     * which a stack passes its weight down, so a pile comes to rest instead of
     * creeping. The list is nearly in order already; this is a short walk. */
    for (i = 1; i < bodies.length; i += 1) {
      b = bodies[i];
      let edge = b.y + b.r, at = i - 1;
      while (at >= 0 && bodies[at].y + bodies[at].r < edge) { bodies[at + 1] = bodies[at]; at -= 1; }
      bodies[at + 1] = b;
    }

    let count = collect(sim), k, c;
    for (k = 0; k < count; k += 1) {
      c = contacts[k];
      /* Landing: the first touch of the floor or of something that has landed. */
      if (!c.a.landed && (!c.b ? c.ny === 1 : c.b.landed)) { c.a.landed = sim.steps; sim.events.push({ type: "land", id: c.a.id, level: c.a.level, speed: Math.abs(c.a.vy) }); }
      else if (c.b && !c.b.landed && c.a.landed) { c.b.landed = sim.steps; sim.events.push({ type: "land", id: c.b.id, level: c.b.level, speed: Math.abs(c.b.vy) }); }
    }
    for (k = 0; k < count; k += 1) if (contacts[k].jn !== 0 || contacts[k].jt !== 0) resume(contacts[k]);
    for (let pass = 0; pass < CFG.VEL_ITERS; pass += 1) for (k = 0; k < count; k += 1) solve(contacts[k]);
    let warm = {};
    for (k = 0; k < count; k += 1) {
      c = contacts[k];
      if (c.jn > 0) warm[c.key] = [c.jn, c.jt];
      /* Something is holding this body up. */
      if (c.jn > 0) { if (c.ny > 0.3) c.a.held = sim.steps; else if (c.b && c.ny < -0.3) c.b.held = sim.steps; }
      c.a = null; c.b = null;
    }
    /* A new table each step, never edited afterwards, so a copy of the run can share it. */
    sim.warm = warm;

    for (i = 0; i < bodies.length; i += 1) {
      b = bodies[i];
      let speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > CFG.MAX_SPEED) { b.vx *= CFG.MAX_SPEED / speed; b.vy *= CFG.MAX_SPEED / speed; }
      /* What is held up and barely moving comes to rest: a settled pile is still. */
      if (b.held === sim.steps && speed < CFG.REST_V && b.w < CFG.REST_W && b.w > -CFG.REST_W) { b.vx *= 0.5; b.vy *= 0.5; b.w *= 0.5; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
    }
    for (let round = 0; round < CFG.POS_ITERS; round += 1) separate(sim);

    if (live) merge(sim);

    /* Overflow: something that has landed stays above the line. A bounce
     * through it does not end a run; staying there does. */
    let top = CFG.H, above = false;
    bodies = sim.bodies;
    for (i = 0; i < bodies.length; i += 1) {
      b = bodies[i];
      if (!b.landed || sim.steps - b.landed < CFG.LAND_STEPS) continue;
      let edge = b.y - b.r;
      if (edge < top) top = edge;
      if (edge < CFG.DANGER_Y) above = true;
    }
    sim.top = top;
    if (live) {
      if (above) sim.dangerTimer += 1; else if (sim.dangerTimer > 0) sim.dangerTimer = Math.max(0, sim.dangerTimer - 2);
      let near = Math.max(0, Math.min(1, (CFG.DANGER_Y + 150 - top) / 150));
      sim.pressure = Math.max(near * 0.6, above ? 0.6 + 0.4 * sim.dangerTimer / CFG.GRACE : 0);
      if (sim.dangerTimer >= CFG.GRACE) { sim.over = true; sim.endedAt = sim.steps; sim.events.push({ type: "over" }); }
    }
  }

  return { LEVELS: LEVELS, LAST: LAST, CFG: CFG, create: create, clone: clone, step: step, drop: drop, swap: swap, debug: debug, debugTarget: debugTarget, spawnY: spawnY, canDrop: canDrop, blocked: blocked, clampX: clampX, pool: pool, points: points, chainFactor: chainFactor };
})();

/* Career Adventure — the look of things.
 *
 * Every object is drawn here, by hand, on a unit circle: the circle is the
 * object's body in the simulation, so what is drawn fills it. No image, font
 * icon or brand mark is loaded; the room behind the chamber is painted the
 * same way. Nothing in here knows about the game's state. */
const CareerArt = (function () {
  "use strict";

  const INK = "#0b1220";
  const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  /* One colour per rung: its glow, its particles, its place on the ladder. */
  const TINT = ["#ef5b5b", "#8fa3cf", "#c9d1f2", "#4aa8ff", "#fb923c", "#f7d038", "#5aa2e6", "#9b6bff", "#5cc8f0", "#34d399", "#f472b6", "#f59e0b", "#f6c453"];

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function lin(g, x0, y0, x1, y1, a, b) {
    const fill = g.createLinearGradient(x0, y0, x1, y1);
    fill.addColorStop(0, a); fill.addColorStop(1, b);
    return fill;
  }
  function ink(g, fill, width) {
    g.fillStyle = fill; g.fill();
    g.lineWidth = width || 0.07; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke();
  }
  function dot(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
  function line(g, x0, y0, x1, y1, color, width) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round"; g.stroke();
  }
  function label(g, text, x, y, size, color, weight) {
    g.font = (weight || 800) + " " + size + "px " + FONT;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = color; g.fillText(text, x, y);
  }
  function star(g, x, y, outer, inner, points) {
    g.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 ? inner : outer, angle = -Math.PI / 2 + i * Math.PI / points;
      g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    g.closePath();
  }

  const PROPS = [
    /* 1 Book — where it starts */
    function book(g) {
      g.rotate(-0.14);
      rr(g, -0.56, -0.7, 1.26, 1.46, 0.1); ink(g, "#f3ead6");
      line(g, 0.56, -0.5, 0.56, 0.62, "rgba(11,18,32,0.25)", 0.03);
      line(g, 0.62, -0.5, 0.62, 0.62, "rgba(11,18,32,0.25)", 0.03);
      rr(g, -0.7, -0.78, 1.22, 1.46, 0.12); ink(g, lin(g, 0, -0.8, 0, 0.7, "#f2656b", "#b9262f"));
      g.save(); rr(g, -0.7, -0.78, 1.22, 1.46, 0.12); g.clip();
      g.fillStyle = "rgba(11,18,32,0.26)"; g.fillRect(-0.7, -0.8, 0.2, 1.5);
      g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(-0.5, -0.8, 0.06, 1.5);
      g.restore();
      rr(g, -0.32, -0.46, 0.68, 0.4, 0.06); ink(g, "#fff4d6", 0.05);
      line(g, -0.2, -0.32, 0.22, -0.32, INK, 0.05);
      line(g, -0.2, -0.19, 0.08, -0.19, INK, 0.05);
      g.beginPath(); g.moveTo(0.14, -0.78); g.lineTo(0.36, -0.78); g.lineTo(0.36, -0.36); g.lineTo(0.25, -0.48); g.lineTo(0.14, -0.36); g.closePath();
      ink(g, "#ffd24a", 0.05);
    },
    /* 2 Keyboard */
    function keyboard(g) {
      g.rotate(-0.1);
      rr(g, -0.88, -0.6, 1.76, 1.2, 0.2); ink(g, lin(g, 0, -0.6, 0, 0.6, "#6b7da6", "#3a4768"));
      rr(g, -0.78, -0.5, 1.56, 0.94, 0.12); g.fillStyle = "rgba(11,18,32,0.42)"; g.fill();
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          rr(g, -0.7 + col * 0.29 + (row === 1 ? 0.03 : 0), -0.44 + row * 0.24, 0.23, 0.18, 0.05);
          g.fillStyle = row === 0 && col === 4 ? "#3fd0ff" : row === 2 && col === 0 ? "#ffb347" : "#e8eefb"; g.fill();
        }
      }
      rr(g, -0.42, 0.28, 0.84, 0.13, 0.05); g.fillStyle = "#e8eefb"; g.fill();
    },
    /* 3 Mouse */
    function mouse(g) {
      g.rotate(0.12);
      g.beginPath(); g.moveTo(0, -0.84); g.bezierCurveTo(0.2, -1.06, 0.5, -1.0, 0.52, -0.8);
      g.strokeStyle = INK; g.lineWidth = 0.12; g.lineCap = "round"; g.stroke();
      g.strokeStyle = "#7f8fb5"; g.lineWidth = 0.05; g.stroke();
      g.beginPath(); g.ellipse(0, 0.04, 0.66, 0.86, 0, 0, Math.PI * 2); ink(g, lin(g, -0.5, -0.8, 0.5, 0.9, "#f6f8ff", "#a9b3d8"));
      g.save(); g.beginPath(); g.ellipse(0, 0.04, 0.66, 0.86, 0, 0, Math.PI * 2); g.clip();
      g.fillStyle = "rgba(96,112,160,0.28)"; g.fillRect(-0.7, 0.42, 1.4, 0.6);
      line(g, -0.7, -0.14, 0.7, -0.14, INK, 0.05);
      line(g, 0, -0.84, 0, -0.14, INK, 0.05);
      g.restore();
      rr(g, -0.1, -0.62, 0.2, 0.36, 0.1); ink(g, "#3fd0ff", 0.05);
    },
    /* 4 Monitor */
    function monitor(g) {
      rr(g, -0.13, 0.36, 0.26, 0.3, 0.04); ink(g, "#55648a", 0.06);
      rr(g, -0.48, 0.6, 0.96, 0.2, 0.1); ink(g, lin(g, 0, 0.6, 0, 0.8, "#7888ad", "#46557a"), 0.06);
      rr(g, -0.88, -0.78, 1.76, 1.22, 0.14); ink(g, lin(g, 0, -0.8, 0, 0.44, "#39486b", "#1f2940"));
      rr(g, -0.76, -0.66, 1.52, 0.98, 0.07); g.fillStyle = lin(g, -0.7, -0.66, 0.7, 0.32, "#52d2ff", "#2b5fe0"); g.fill();
      g.save(); rr(g, -0.76, -0.66, 1.52, 0.98, 0.07); g.clip();
      g.fillStyle = "rgba(255,255,255,0.16)"; g.beginPath(); g.moveTo(-0.76, -0.66); g.lineTo(0.1, -0.66); g.lineTo(-0.5, 0.32); g.lineTo(-0.76, 0.32); g.closePath(); g.fill();
      g.restore();
      line(g, -0.56, -0.42, -0.2, -0.42, "#ffffff", 0.07);
      line(g, -0.42, -0.22, 0.2, -0.22, "rgba(255,255,255,0.75)", 0.07);
      line(g, -0.42, -0.02, -0.06, -0.02, "#ffe27a", 0.07);
      line(g, -0.56, 0.16, 0.0, 0.16, "rgba(255,255,255,0.75)", 0.07);
    },
    /* 5 HTML / CSS — a page in a browser */
    function htmlcss(g) {
      g.rotate(-0.06);
      rr(g, -0.8, -0.78, 1.6, 1.56, 0.18); ink(g, "#f5f8fd");
      g.save(); rr(g, -0.8, -0.78, 1.6, 1.56, 0.18); g.clip();
      g.fillStyle = lin(g, -0.8, 0, 0.8, 0, "#ff8a3c", "#f2542d"); g.fillRect(-0.8, -0.78, 1.6, 0.36);
      g.fillStyle = "#e6edf8"; g.fillRect(-0.8, 0.38, 1.6, 0.42);
      g.restore();
      line(g, -0.8, -0.42, 0.8, -0.42, INK, 0.05);
      dot(g, -0.6, -0.6, 0.07, "#fff"); dot(g, -0.4, -0.6, 0.07, "#ffe0c2"); dot(g, -0.2, -0.6, 0.07, "#ffc79a");
      label(g, "</>", 0, 0.0, 0.52, "#1d3f8f", 900);
      rr(g, -0.62, 0.48, 0.5, 0.16, 0.08); g.fillStyle = "#38bdf8"; g.fill();
      rr(g, -0.04, 0.48, 0.34, 0.16, 0.08); g.fillStyle = "#ff8a3c"; g.fill();
      rr(g, 0.38, 0.48, 0.24, 0.16, 0.08); g.fillStyle = "#a78bfa"; g.fill();
    },
    /* 6 JavaScript */
    function javascript(g) {
      g.rotate(0.07);
      rr(g, -0.8, -0.8, 1.6, 1.6, 0.22); ink(g, lin(g, -0.6, -0.8, 0.6, 0.8, "#ffe45c", "#f0b400"));
      g.save(); rr(g, -0.8, -0.8, 1.6, 1.6, 0.22); g.clip();
      g.fillStyle = "rgba(255,255,255,0.3)"; g.beginPath(); g.moveTo(-0.8, -0.8); g.lineTo(0.3, -0.8); g.lineTo(-0.8, 0.1); g.closePath(); g.fill();
      g.restore();
      label(g, "JS", 0.2, 0.3, 0.78, INK, 900);
      line(g, -0.56, -0.5, -0.26, -0.5, "rgba(11,18,32,0.55)", 0.08);
      line(g, -0.56, -0.3, -0.42, -0.3, "rgba(11,18,32,0.55)", 0.08);
    },
    /* 7 Python */
    function python(g) {
      g.beginPath(); g.arc(0, 0, 0.88, 0, Math.PI * 2); ink(g, lin(g, -0.6, -0.8, 0.6, 0.8, "#4f93d6", "#234a7a"));
      g.beginPath(); g.arc(0, 0, 0.72, 0, Math.PI * 2); g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 0.04; g.stroke();
      const snake = function () {
        g.beginPath(); g.moveTo(0.42, -0.42);
        g.bezierCurveTo(0.1, -0.74, -0.56, -0.56, -0.44, -0.12);
        g.bezierCurveTo(-0.34, 0.2, 0.46, -0.06, 0.44, 0.32);
        g.bezierCurveTo(0.42, 0.66, -0.2, 0.62, -0.46, 0.42);
      };
      g.lineCap = "round"; g.lineJoin = "round";
      snake(); g.strokeStyle = INK; g.lineWidth = 0.4; g.stroke();
      snake(); g.strokeStyle = "#ffd343"; g.lineWidth = 0.26; g.stroke();
      snake(); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 0.06; g.setLineDash([0.12, 0.2]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(0.44, -0.4, 0.2, 0, Math.PI * 2); ink(g, "#ffd343", 0.07);
      dot(g, 0.5, -0.45, 0.055, INK);
    },
    /* 8 C# / .NET — a development module */
    function csharp(g) {
      g.fillStyle = "#cdb9ff";
      for (let i = -1; i <= 1; i += 1) {
        rr(g, -0.9, i * 0.36 - 0.07, 0.2, 0.14, 0.04); ink(g, "#cdb9ff", 0.05);
        rr(g, 0.7, i * 0.36 - 0.07, 0.2, 0.14, 0.04); ink(g, "#cdb9ff", 0.05);
        rr(g, i * 0.36 - 0.07, -0.9, 0.14, 0.2, 0.04); ink(g, "#cdb9ff", 0.05);
        rr(g, i * 0.36 - 0.07, 0.7, 0.14, 0.2, 0.04); ink(g, "#cdb9ff", 0.05);
      }
      rr(g, -0.74, -0.74, 1.48, 1.48, 0.24); ink(g, lin(g, -0.6, -0.74, 0.6, 0.74, "#a37bff", "#5b21b6"));
      rr(g, -0.6, -0.6, 1.2, 1.2, 0.16); g.strokeStyle = "rgba(255,255,255,0.2)"; g.lineWidth = 0.035; g.stroke();
      label(g, "C#", 0, -0.1, 0.66, "#ffffff", 900);
      label(g, ".NET", 0, 0.38, 0.25, "rgba(255,255,255,0.86)", 800);
    },
    /* 9 Database */
    function database(g) {
      const rx = 0.76, ry = 0.22, tiers = [0.5, 0.06, -0.38];
      for (let i = 0; i < tiers.length; i += 1) {
        const y = tiers[i];
        g.beginPath(); g.moveTo(-rx, y - 0.2); g.lineTo(-rx, y + 0.2);
        g.ellipse(0, y + 0.2, rx, ry, 0, Math.PI, 0, true);
        g.lineTo(rx, y - 0.2); g.closePath();
        ink(g, lin(g, -rx, 0, rx, 0, "#2f7fc0", "#17466f"));
        g.beginPath(); g.ellipse(0, y - 0.2, rx, ry, 0, 0, Math.PI * 2);
        ink(g, lin(g, 0, y - 0.42, 0, y, "#aee6ff", "#5cc8f0"));
        dot(g, -0.5, y + 0.12, 0.055, "#7dffb0"); dot(g, -0.32, y + 0.17, 0.055, i === 1 ? "#ffd24a" : "#7dffb0");
        line(g, 0.14, y + 0.19, 0.5, y + 0.12, "rgba(255,255,255,0.4)", 0.05);
      }
    },
    /* 10 AI Flow — a workflow of connected nodes */
    function aiflow(g) {
      g.beginPath(); g.arc(0, 0, 0.88, 0, Math.PI * 2); ink(g, lin(g, -0.6, -0.8, 0.6, 0.8, "#155e56", "#062925"));
      g.beginPath(); g.arc(0, 0, 0.72, 0, Math.PI * 2); g.setLineDash([0.1, 0.12]); g.strokeStyle = "rgba(94,234,180,0.4)"; g.lineWidth = 0.035; g.stroke(); g.setLineDash([]);
      const nodes = [[-0.5, -0.3], [0.48, -0.36], [0.5, 0.32], [-0.36, 0.46]];
      for (let i = 0; i < nodes.length; i += 1) line(g, 0, 0, nodes[i][0], nodes[i][1], "#34d399", 0.08);
      line(g, nodes[0][0], nodes[0][1], nodes[1][0], nodes[1][1], "rgba(52,211,153,0.5)", 0.05);
      line(g, nodes[2][0], nodes[2][1], nodes[3][0], nodes[3][1], "rgba(52,211,153,0.5)", 0.05);
      const fills = ["#5eead4", "#fde68a", "#a7f3d0", "#7dd3fc"];
      for (let i = 0; i < nodes.length; i += 1) { g.beginPath(); g.arc(nodes[i][0], nodes[i][1], 0.15, 0, Math.PI * 2); ink(g, fills[i], 0.06); }
      const glow = g.createRadialGradient(0, 0, 0.02, 0, 0, 0.42);
      glow.addColorStop(0, "rgba(167,255,214,0.75)"); glow.addColorStop(1, "rgba(52,211,153,0)");
      dot(g, 0, 0, 0.42, glow);
      g.beginPath(); g.arc(0, 0, 0.24, 0, Math.PI * 2); ink(g, "#eafff5", 0.07);
      star(g, 0, 0, 0.15, 0.06, 4); g.fillStyle = "#10b981"; g.fill();
    },
    /* 11 Portfolio — the showcase */
    function portfolio(g) {
      g.rotate(-0.05);
      rr(g, -0.84, -0.76, 1.68, 1.5, 0.18); ink(g, lin(g, -0.6, -0.76, 0.6, 0.74, "#ff8ac4", "#b9327f"));
      rr(g, -0.7, -0.62, 1.4, 1.22, 0.1); ink(g, "#fff7fb", 0.05);
      dot(g, -0.52, -0.44, 0.1, "#b9327f");
      line(g, -0.34, -0.48, 0.2, -0.48, INK, 0.06);
      line(g, -0.34, -0.38, 0.0, -0.38, "rgba(11,18,32,0.45)", 0.05);
      const tiles = [["#38bdf8", -0.6, -0.22], ["#ffd24a", -0.16, -0.22], ["#a78bfa", 0.28, -0.22], ["#34d399", -0.6, 0.16], ["#fb923c", -0.16, 0.16]];
      for (let i = 0; i < tiles.length; i += 1) { rr(g, tiles[i][1], tiles[i][2], 0.36, 0.3, 0.05); g.fillStyle = tiles[i][0]; g.fill(); }
      g.beginPath(); g.arc(0.52, 0.42, 0.3, 0, Math.PI * 2); ink(g, lin(g, 0.3, 0.2, 0.7, 0.7, "#ffe27a", "#f0a400"), 0.06);
      star(g, 0.52, 0.42, 0.19, 0.08, 5); g.fillStyle = "#fffbe6"; g.fill();
    },
    /* 12 Interview — the conversation */
    function interview(g) {
      g.beginPath(); g.arc(0, 0, 0.88, 0, Math.PI * 2); ink(g, lin(g, -0.6, -0.8, 0.6, 0.8, "#ffc04a", "#d97706"));
      g.beginPath(); g.arc(0, 0, 0.74, 0, Math.PI * 2); g.strokeStyle = "rgba(255,255,255,0.28)"; g.lineWidth = 0.04; g.stroke();
      g.beginPath(); g.moveTo(-0.62, -0.5); g.arcTo(0.3, -0.5, 0.3, 0.04, 0.16); g.arcTo(0.3, 0.04, -0.2, 0.04, 0.16); g.lineTo(-0.3, 0.04); g.lineTo(-0.5, 0.26); g.lineTo(-0.46, 0.04); g.arcTo(-0.62, 0.04, -0.62, -0.5, 0.16); g.arcTo(-0.62, -0.5, 0.3, -0.5, 0.16); g.closePath();
      ink(g, "#ffffff", 0.06);
      dot(g, -0.4, -0.23, 0.07, INK); dot(g, -0.16, -0.23, 0.07, INK); dot(g, 0.08, -0.23, 0.07, INK);
      g.beginPath(); g.moveTo(-0.12, -0.06); g.arcTo(0.66, -0.06, 0.66, 0.5, 0.16); g.arcTo(0.66, 0.5, 0.5, 0.5, 0.16); g.lineTo(0.5, 0.5); g.lineTo(0.54, 0.7); g.lineTo(0.3, 0.5); g.arcTo(-0.12, 0.5, -0.12, -0.06, 0.16); g.arcTo(-0.12, -0.06, 0.66, -0.06, 0.16); g.closePath();
      ink(g, lin(g, 0, -0.06, 0, 0.5, "#3fd0ff", "#1877c9"), 0.06);
      g.beginPath(); g.moveTo(0.08, 0.22); g.lineTo(0.22, 0.36); g.lineTo(0.48, 0.08);
      g.strokeStyle = "#ffffff"; g.lineWidth = 0.1; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
    },
    /* 13 Job Offer — the briefcase, and the letter in it */
    function joboffer(g) {
      g.save(); g.rotate(-0.16);
      rr(g, -0.3, -0.86, 0.8, 0.7, 0.06); ink(g, "#fffdf5", 0.05);
      line(g, -0.16, -0.7, 0.32, -0.7, "rgba(11,18,32,0.5)", 0.045);
      line(g, -0.16, -0.58, 0.2, -0.58, "rgba(11,18,32,0.5)", 0.045);
      dot(g, 0.34, -0.52, 0.09, "#e23d4f");
      g.restore();
      g.beginPath(); g.moveTo(-0.3, -0.36); g.lineTo(-0.3, -0.56); g.arcTo(-0.3, -0.66, -0.2, -0.66, 0.1); g.lineTo(0.2, -0.66); g.arcTo(0.3, -0.66, 0.3, -0.56, 0.1); g.lineTo(0.3, -0.36);
      g.strokeStyle = INK; g.lineWidth = 0.2; g.lineJoin = "round"; g.stroke();
      g.strokeStyle = "#8a5a1c"; g.lineWidth = 0.09; g.stroke();
      rr(g, -0.9, -0.4, 1.8, 1.22, 0.2); ink(g, lin(g, 0, -0.4, 0, 0.82, "#e9a73a", "#8f5a17"));
      g.save(); rr(g, -0.9, -0.4, 1.8, 1.22, 0.2); g.clip();
      g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(-0.9, -0.4, 1.8, 0.12);
      g.fillStyle = "rgba(11,18,32,0.22)"; g.fillRect(-0.9, 0.12, 1.8, 0.8);
      g.restore();
      line(g, -0.9, 0.12, 0.9, 0.12, INK, 0.05);
      rr(g, -0.19, -0.04, 0.38, 0.34, 0.07); ink(g, lin(g, 0, -0.04, 0, 0.3, "#fff0a6", "#f6c453"), 0.06);
      dot(g, 0, 0.13, 0.055, INK);
      rr(g, -0.72, -0.28, 0.16, 0.16, 0.04); g.fillStyle = "#f6c453"; g.fill();
      rr(g, 0.56, -0.28, 0.16, 0.16, 0.04); g.fillStyle = "#f6c453"; g.fill();
      star(g, 0.62, 0.52, 0.2, 0.08, 4); g.fillStyle = "#fff6c9"; g.fill();
    }
  ];

  /* One object at (x, y) with radius r. The plate under it is the body the
   * simulation collides: a soft disc in the rung's colour, a little stronger
   * and ringed the further up the ladder it sits. */
  function prop(g, level, x, y, r) {
    const tint = TINT[level];
    g.save();
    g.translate(x, y); g.scale(r, r);
    const plate = g.createRadialGradient(-0.25, -0.3, 0.1, 0, 0, 1);
    plate.addColorStop(0, hexA(tint, 0.34)); plate.addColorStop(1, hexA(tint, 0.14));
    dot(g, 0, 0, 0.985, plate);
    g.beginPath(); g.arc(0, 0, 0.965, 0, Math.PI * 2); g.strokeStyle = hexA(tint, level >= 9 ? 0.85 : 0.5); g.lineWidth = level >= 9 ? 0.045 : 0.03; g.stroke();
    if (level >= 11) { g.beginPath(); g.arc(0, 0, 0.9, 0, Math.PI * 2); g.strokeStyle = hexA("#fff3c4", 0.5); g.lineWidth = 0.02; g.stroke(); }
    g.scale(0.9, 0.9);
    PROPS[level](g);
    g.restore();
  }

  function hexA(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  /* ---------- the room ---------- */

  const THEMES = {
    study: {
      unlock: 0,
      wall: ["#1a1730", "#2a1c33"], sky: ["#141c44", "#5a2f6e", "#e2703a", "#ffc46b"], glow: "#ffb45a",
      far: "#3a2a5c", near: "#161230", lit: ["#ffd98a", "#ffb45a", "#ffe9b8"], litShare: 0.34,
      frame: "#3b2416", frameLight: "#6b4426", desk: ["#5b3a22", "#2e1c10"], lamp: "#ffbe6b",
      accent: "#3fd0ff", stars: 26, moon: false, panel: false, lights: ["#ffd98a", "#ff9e6b", "#ffe9b8"]
    },
    city: {
      unlock: 6,
      wall: ["#0d1226", "#141a36"], sky: ["#050818", "#101c4a", "#2a2f7a", "#6a4aa8"], glow: "#7aa2ff",
      far: "#1a2350", near: "#080c1e", lit: ["#7fd6ff", "#ffd98a", "#ff8ad0", "#b9a1ff"], litShare: 0.5,
      frame: "#1c2238", frameLight: "#39446b", desk: ["#2a3046", "#12162a"], lamp: "#8fd0ff",
      accent: "#ff7ac8", stars: 70, moon: true, panel: false, lights: ["#7fd6ff", "#ff8ad0", "#b9a1ff"]
    },
    lab: {
      unlock: 9,
      wall: ["#07191c", "#0b2226"], sky: ["#04161a", "#07262a", "#0b3a3a", "#0f4f4a"], glow: "#34d399",
      far: "#0e3a3c", near: "#06181b", lit: ["#5eead4", "#a7f3d0", "#7dd3fc"], litShare: 0.4,
      frame: "#12343a", frameLight: "#1f5a5f", desk: ["#1b3a40", "#0a1a1e"], lamp: "#5eead4",
      accent: "#5eead4", stars: 0, moon: false, panel: true, lights: ["#5eead4", "#7dd3fc", "#a7f3d0"]
    }
  };

  /* A fixed sequence, so the skyline is the same city every time. */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function skyline(g, x, y, w, h, theme, rand) {
    /* far: a hill line with a dome, two minarets and a tower — the city this was made in */
    g.fillStyle = theme.far;
    g.beginPath(); g.moveTo(x, y + h);
    for (let i = 0; i <= 12; i += 1) g.lineTo(x + w * i / 12, y + h * (0.56 + 0.07 * Math.sin(i * 1.7) + 0.04 * Math.sin(i * 0.6 + 1)));
    g.lineTo(x + w, y + h); g.closePath(); g.fill();
    const dx = x + w * 0.2, dy = y + h * 0.56, unit = Math.min(w, h * 1.6) * 0.07;
    g.beginPath(); g.arc(dx, dy, unit, Math.PI, 0); g.fill();
    g.fillRect(dx - unit * 1.3, dy, unit * 2.6, unit);
    for (const side of [-1, 1]) {
      g.fillRect(dx + side * unit * 1.7 - unit * 0.09, dy - unit * 1.9, unit * 0.18, unit * 2.9);
      g.beginPath(); g.moveTo(dx + side * unit * 1.7 - unit * 0.16, dy - unit * 1.9); g.lineTo(dx + side * unit * 1.7, dy - unit * 2.7); g.lineTo(dx + side * unit * 1.7 + unit * 0.16, dy - unit * 1.9); g.fill();
    }
    const tx = x + w * 0.8, ty = y + h * 0.6;
    g.fillRect(tx - unit * 0.45, ty - unit * 2.2, unit * 0.9, unit * 3);
    g.fillRect(tx - unit * 0.6, ty - unit * 2.35, unit * 1.2, unit * 0.2);
    g.beginPath(); g.moveTo(tx - unit * 0.5, ty - unit * 2.35); g.lineTo(tx, ty - unit * 3.4); g.lineTo(tx + unit * 0.5, ty - unit * 2.35); g.fill();
    /* near: blocks with lit windows */
    let bx = x - 4;
    while (bx < x + w) {
      const bw = Math.max(18, w * (0.05 + rand() * 0.07)), bh = h * (0.2 + rand() * 0.34);
      g.fillStyle = theme.near;
      g.fillRect(bx, y + h - bh, bw, bh);
      const cell = Math.max(5, Math.min(9, bw / 5));
      for (let wy = y + h - bh + cell; wy < y + h - cell; wy += cell * 1.7) {
        for (let wx = bx + cell * 0.7; wx < bx + bw - cell; wx += cell * 1.5) {
          if (rand() > theme.litShare) continue;
          g.fillStyle = theme.lit[Math.floor(rand() * theme.lit.length)];
          g.globalAlpha = 0.55 + rand() * 0.45;
          g.fillRect(wx, wy, cell * 0.62, cell * 0.8);
          g.globalAlpha = 1;
        }
      }
      bx += bw + rand() * 6;
    }
  }

  function panel(g, x, y, w, h, theme, rand) {
    g.strokeStyle = hexA("#5eead4", 0.09); g.lineWidth = 1;
    const cell = Math.max(22, w / 16);
    g.beginPath();
    for (let gx = x + cell; gx < x + w; gx += cell) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
    for (let gy = y + cell; gy < y + h; gy += cell) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
    g.stroke();
    const nodes = [];
    for (let i = 0; i < 16; i += 1) nodes.push([x + w * (0.06 + rand() * 0.88), y + h * (0.08 + rand() * 0.8)]);
    nodes.sort(function (p, q) { return p[0] - q[0]; });
    g.lineWidth = 2; g.lineCap = "round";
    for (let i = 0; i < nodes.length - 2; i += 1) {
      const to = nodes[i + 1 + Math.floor(rand() * 2)];
      g.strokeStyle = hexA(theme.lit[i % theme.lit.length], 0.32);
      g.beginPath(); g.moveTo(nodes[i][0], nodes[i][1]);
      g.bezierCurveTo((nodes[i][0] + to[0]) / 2, nodes[i][1], (nodes[i][0] + to[0]) / 2, to[1], to[0], to[1]);
      g.stroke();
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const halo = g.createRadialGradient(nodes[i][0], nodes[i][1], 0, nodes[i][0], nodes[i][1], 16);
      halo.addColorStop(0, hexA(theme.lit[i % theme.lit.length], 0.5)); halo.addColorStop(1, hexA(theme.lit[i % theme.lit.length], 0));
      dot(g, nodes[i][0], nodes[i][1], 16, halo);
      dot(g, nodes[i][0], nodes[i][1], 3.6, theme.lit[i % theme.lit.length]);
    }
  }

  function shelf(g, x, y, w, theme, rand) {
    const colors = ["#c9483f", "#3f7fc9", "#e0a030", "#4aa37a", "#8a5fc9", "#d9d2c0", "#c96a9a"];
    let bx = x + 6;
    while (bx < x + w - 14) {
      const bw = 7 + rand() * 9, bh = 26 + rand() * 26, lean = rand() > 0.86 ? 0.16 : 0;
      g.save(); g.translate(bx, y); g.rotate(-lean);
      g.fillStyle = colors[Math.floor(rand() * colors.length)]; g.globalAlpha = 0.78;
      g.fillRect(0, -bh, bw, bh);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(bw - 2, -bh, 2, bh);
      g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(1.5, -bh + 5, bw - 5, 2);
      g.restore(); g.globalAlpha = 1;
      bx += bw + 1.5 + (lean ? 6 : 0);
    }
    g.fillStyle = theme.frameLight; g.fillRect(x, y, w, 7);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, y + 7, w, 4);
  }

  function plant(g, x, y, s) {
    g.fillStyle = "#2f8f63";
    for (let i = 0; i < 7; i += 1) {
      const angle = -Math.PI / 2 + (i - 3) * 0.36;
      g.save(); g.translate(x, y - 8 * s); g.rotate(angle + Math.PI / 2);
      g.beginPath(); g.ellipse(0, -22 * s, 6.5 * s, 22 * s, 0, 0, Math.PI * 2);
      g.fillStyle = i % 2 ? "#2f8f63" : "#3aa876"; g.fill();
      g.restore();
    }
    g.fillStyle = "#b5623a";
    g.beginPath(); g.moveTo(x - 15 * s, y - 10 * s); g.lineTo(x + 15 * s, y - 10 * s); g.lineTo(x + 11 * s, y + 14 * s); g.lineTo(x - 11 * s, y + 14 * s); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x - 15 * s, y - 10 * s, 30 * s, 4 * s);
  }

  function lamp(g, x, y, s, theme) {
    g.strokeStyle = "#1c1420"; g.lineWidth = 5 * s; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 * s, y - 64 * s); g.lineTo(x + 52 * s, y - 104 * s); g.stroke();
    g.fillStyle = "#1c1420"; g.beginPath(); g.ellipse(x, y, 26 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(x + 56 * s, y - 104 * s); g.rotate(0.5);
    g.fillStyle = "#2a2030"; g.beginPath(); g.moveTo(-14 * s, -10 * s); g.lineTo(14 * s, -10 * s); g.lineTo(30 * s, 22 * s); g.lineTo(-30 * s, 22 * s); g.closePath(); g.fill();
    g.fillStyle = theme.lamp; g.beginPath(); g.ellipse(0, 22 * s, 30 * s, 6 * s, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function mug(g, x, y, s) {
    g.strokeStyle = "#e8e2d6"; g.lineWidth = 4 * s;
    g.beginPath(); g.arc(x + 15 * s, y - 14 * s, 8 * s, -Math.PI / 2, Math.PI / 2); g.stroke();
    rr(g, x - 15 * s, y - 28 * s, 30 * s, 30 * s, 5 * s); g.fillStyle = "#e8e2d6"; g.fill();
    g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(x + 6 * s, y - 28 * s, 9 * s, 30 * s);
    g.fillStyle = "#5b3a22"; g.beginPath(); g.ellipse(x, y - 27 * s, 12 * s, 3 * s, 0, 0, Math.PI * 2); g.fill();
  }

  /* The room, painted once per size and theme.
   *   w, h   the canvas, in CSS pixels
   *   box    where the chamber stands: { x, y, w, h } and `base`, the desk line */
  function scene(g, w, h, box, id) {
    const theme = THEMES[id] || THEMES.study;
    const rand = seeded(id === "city" ? 77 : id === "lab" ? 311 : 2024);
    const wide = w >= 900, desk = Math.min(h - 26, box.base);
    g.fillStyle = lin(g, 0, 0, 0, h, theme.wall[0], theme.wall[1]); g.fillRect(0, 0, w, h);

    /* the window, or the lab's wall display */
    const ww = wide ? Math.min(w * 0.58, Math.max(box.w * 2.1, 620)) : w * 0.9;
    const wx = box.x + box.w / 2 - ww / 2, wy = Math.max(18, h * 0.05), wh = Math.max(120, desk - wy - (wide ? 70 : 46));
    g.save(); rr(g, wx, wy, ww, wh, theme.panel ? 14 : 10); g.clip();
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, theme.sky[0]); sky.addColorStop(0.45, theme.sky[1]); sky.addColorStop(0.8, theme.sky[2]); sky.addColorStop(1, theme.sky[3]);
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    if (theme.panel) panel(g, wx, wy, ww, wh, theme, rand);
    else {
      for (let i = 0; i < theme.stars; i += 1) { g.globalAlpha = 0.25 + rand() * 0.6; dot(g, wx + rand() * ww, wy + rand() * wh * 0.5, 0.6 + rand() * 1.1, "#ffffff"); }
      g.globalAlpha = 1;
      if (theme.moon) { dot(g, wx + ww * 0.78, wy + wh * 0.2, Math.min(34, ww * 0.045), "#f3f0ff"); dot(g, wx + ww * 0.78 + 10, wy + wh * 0.2 - 6, Math.min(30, ww * 0.04), theme.sky[1]); }
      const sun = g.createRadialGradient(wx + ww * 0.5, wy + wh * 0.92, 0, wx + ww * 0.5, wy + wh * 0.92, ww * 0.55);
      sun.addColorStop(0, hexA(theme.glow, 0.55)); sun.addColorStop(1, hexA(theme.glow, 0));
      g.fillStyle = sun; g.fillRect(wx, wy, ww, wh);
      skyline(g, wx, wy + wh * 0.3, ww, wh * 0.7, theme, rand);
    }
    g.restore();
    g.lineWidth = wide ? 12 : 8; g.strokeStyle = theme.frame; rr(g, wx, wy, ww, wh, theme.panel ? 14 : 10); g.stroke();
    g.lineWidth = 2; g.strokeStyle = theme.frameLight; rr(g, wx - 5, wy - 5, ww + 10, wh + 10, 14); g.stroke();
    if (!theme.panel) {
      g.strokeStyle = theme.frame; g.lineWidth = wide ? 7 : 5;
      g.beginPath(); g.moveTo(wx + ww / 3, wy); g.lineTo(wx + ww / 3, wy + wh); g.moveTo(wx + ww * 2 / 3, wy); g.lineTo(wx + ww * 2 / 3, wy + wh); g.moveTo(wx, wy + wh * 0.36); g.lineTo(wx + ww, wy + wh * 0.36); g.stroke();
      g.fillStyle = theme.frame; g.fillRect(wx - 14, wy + wh - 2, ww + 28, 12);
      g.fillStyle = theme.frameLight; g.fillRect(wx - 14, wy + wh - 2, ww + 28, 3);
    }

    /* a string of small lights across the top of the wall */
    const sag = wide ? 34 : 22;
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 8); g.quadraticCurveTo(w / 2, 8 + sag * 2, w, 8); g.stroke();
    const bulbs = Math.round(w / 64);
    for (let i = 1; i < bulbs; i += 1) {
      const t = i / bulbs, lx = w * t, ly = 8 + sag * 4 * t * (1 - t), color = theme.lights[i % theme.lights.length];
      const halo = g.createRadialGradient(lx, ly + 5, 0, lx, ly + 5, 22);
      halo.addColorStop(0, hexA(color, 0.5)); halo.addColorStop(1, hexA(color, 0));
      dot(g, lx, ly + 5, 22, halo); dot(g, lx, ly + 5, 3.2, color);
    }

    /* what hangs and stands on the wall, where there is wall to spare */
    if (wide && wx > 190) {
      const sw = Math.min(210, wx - 70);
      shelf(g, wx - sw - 44, h * 0.3, sw, theme, rand);
      shelf(g, wx - sw - 44, h * 0.5, sw * 0.8, theme, rand);
      plant(g, wx - 70, h * 0.3 - 16, 0.9);
      shelf(g, wx + ww + 44, h * 0.36, sw, theme, rand);
      rr(g, wx + ww + 54, h * 0.44, sw * 0.62, sw * 0.46, 6); g.fillStyle = "rgba(8,12,24,0.72)"; g.fill(); g.strokeStyle = theme.frameLight; g.lineWidth = 3; g.stroke();
      for (let i = 0; i < 4; i += 1) line(g, wx + ww + 68, h * 0.44 + 18 + i * 14, wx + ww + 68 + sw * (0.2 + rand() * 0.3), h * 0.44 + 18 + i * 14, hexA(theme.lit[i % theme.lit.length], 0.75), 3);
    }

    /* the desk */
    g.fillStyle = lin(g, 0, desk, 0, h, theme.desk[0], theme.desk[1]); g.fillRect(0, desk, w, h - desk);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(0, desk, w, 3);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let px = (w % 190) / 2; px < w; px += 190) g.fillRect(px, desk + 3, 2, h - desk);
    const things = Math.max(0.55, Math.min(1.25, h / 760));
    if (box.x > 150) { lamp(g, Math.max(60, box.x - (wide ? 190 : 90)), desk + 10, things, theme); }
    if (w - box.x - box.w > 130) { mug(g, Math.min(w - 50, box.x + box.w + (wide ? 150 : 70)), desk + 16, things); }
    if (wide && box.x > 330) plant(g, box.x - 330 * things, desk + 4, things * 1.2);

    /* warm light from the lamp, and the room falling away at the edges */
    const lx = Math.max(60, box.x - (wide ? 130 : 40)), ly = desk - 80 * things;
    const warm = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.55);
    warm.addColorStop(0, hexA(theme.lamp, 0.3)); warm.addColorStop(0.4, hexA(theme.lamp, 0.08)); warm.addColorStop(1, hexA(theme.lamp, 0));
    g.globalCompositeOperation = "lighter"; g.fillStyle = warm; g.fillRect(0, 0, w, h); g.globalCompositeOperation = "source-over";
    const edge = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    edge.addColorStop(0, "rgba(4,6,14,0)"); edge.addColorStop(1, "rgba(4,6,14,0.62)");
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
  }

  return { TINT: TINT, THEMES: THEMES, FONT: FONT, prop: prop, scene: scene, rr: rr, hexA: hexA, star: star };
})();

/* Career Adventure — the game on the page.
 *
 * Runs the simulation on a fixed step under the browser's frames, draws it,
 * takes aim and drop from pointer, touch and keys, plays its sounds and keeps
 * the profile. On a page with the game shell (V4-E06.3: [data-ca-root], see
 * js/pages/career-adventure-game.js) it waits to be started and reports what
 * happens as adventure:* events; on a page without one it plays in place. */
function startCareerAdventure(lifecycle) {
  const canvas = document.getElementById("career-merge-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Career Adventure: this browser gave no 2D canvas");
  const Sim = CareerSim;
  const CFG = Sim.CFG;
  const LEVELS = Sim.LEVELS;
  const TINT = CareerArt.TINT;
  const root = canvas.closest("[data-ca-root]");
  const STORAGE_KEY = "kaan-career-adventure-v2";
  const STEP_MS = 1000 / CFG.HZ;
  /* Above the rim: room for the largest object the dropper ever hands out. */
  const HEAD = 2 * LEVELS[8].r + CFG.SPAWN_GAP + 18;
  const BASE = 30;
  const SIDE = 18;
  /* A rung reached for the first time opens a room. */
  const THEME_IDS = Object.keys(CareerArt.THEMES);

  const copy = {
    en: {
      heroEyebrow: "Interactive portfolio game",
      heroTitle: "Kaan's Career Adventure",
      heroLead: "Combine books, tools, code skills and AI workflow experience. Reach the final Job Offer object and complete the career merge.",
      heroCardTitle: "Merge to Job",
      heroCardText: "A tiny web game built with vanilla JavaScript and Canvas.",
      gameEyebrow: "Career merge lab",
      gameTitle: "Build the path from learning to job offer.",
      scoreLabel: "Score",
      bestLabel: "Best",
      nextLabel: "Next",
      dropButton: "Drop object",
      restartButton: "Restart",
      controlHint: "Move with mouse/touch or A-D keys. On mobile, drag to aim and tap to drop. Space/Enter also work.",
      howEyebrow: "How to play",
      howTitle: "Same objects merge into the next career step.",
      howText: "The game is intentionally short and portfolio-friendly. Merge enough learning objects to unlock stronger drops, then create the final Job Offer.",
      ladderEyebrow: "Merge ladder",
      winTitle: "Kaan reached Job Offer!",
      winText: "Learning, projects, AI workflows and portfolio proof merged into one strong profile.",
      playAgain: "Play again",
      viewProjects: "View projects",
      viewResume: "View resume",
      gameOver: "Brain overloaded. Restarting...",
      dropLocked: "Wait a moment"
    },
    tr: {
      heroEyebrow: "İnteraktif portfolyo oyunu",
      heroTitle: "Kaan'ın Kariyer Macerası",
      heroLead: "Kitapları, araçları, yazılım becerilerini ve AI workflow deneyimini birleştir. Son Job Offer nesnesine ulaş ve kariyer merge'ünü tamamla.",
      heroCardTitle: "Merge to Job",
      heroCardText: "Vanilla JavaScript ve Canvas ile geliştirilmiş küçük bir web oyunu.",
      gameEyebrow: "Kariyer merge laboratuvarı",
      gameTitle: "Öğrenmeden iş teklifine giden yolu inşa et.",
      scoreLabel: "Skor",
      bestLabel: "En iyi",
      nextLabel: "Sıradaki",
      dropButton: "Nesneyi bırak",
      restartButton: "Yeniden başlat",
      controlHint: "Mouse/dokunma veya A-D tuşlarıyla hareket et. Mobilde sürükle, bırakmak için dokun; Space/Enter da çalışır.",
      howEyebrow: "Nasıl oynanır",
      howTitle: "Aynı nesneler birleşip bir sonraki kariyer adımına dönüşür.",
      howText: "Oyun bilerek kısa ve portfolyo dostu tasarlandı. Yeterince öğrenme nesnesi birleştir, daha güçlü drop'ları aç ve finalde Job Offer üret.",
      ladderEyebrow: "Birleşme zinciri",
      winTitle: "Kaan Job Offer seviyesine ulaştı!",
      winText: "Öğrenme, projeler, AI workflow deneyimi ve portfolyo kanıtları tek güçlü profile dönüştü.",
      playAgain: "Tekrar oyna",
      viewProjects: "Projeleri gör",
      viewResume: "CV'yi gör",
      gameOver: "Beyin fazla doldu. Yeniden başlatılıyor...",
      dropLocked: "Bir saniye bekle"
    }
  };

  /* The shell's copy, in the page's locale, travels on the root. Without a
   * shell these few lines are all the game itself ever says. */
  let labels = {};
  try { labels = JSON.parse((root && root.getAttribute("data-ca-labels")) || "{}"); } catch (error) { labels = {}; }
  const OWN = {
    en: { objects: ["Book", "Keyboard", "Mouse", "Monitor", "HTML / CSS", "JavaScript", "Python", "C# / .NET", "Database", "AI Flow", "Portfolio", "Interview", "Job Offer"], chainTwo: "{n}× Chain", chainCombo: "{n}× Career Combo", nice: "Nice merge", careful: "Careful", noRoom: "No room to drop", overTitle: "Game Over" },
    tr: { objects: ["Kitap", "Klavye", "Mouse", "Monitör", "HTML / CSS", "JavaScript", "Python", "C# / .NET", "Veritabanı", "AI Flow", "Portfolyo", "Mülakat", "Job Offer"], chainTwo: "{n}× Zincir", chainCombo: "{n}× Kariyer Kombosu", nice: "Güzel birleşme", careful: "Dikkat", noRoom: "Bırakacak yer yok", overTitle: "Oyun bitti" }
  };

  function lang() { return typeof getCurrentLocale === "function" ? getCurrentLocale() : (document.documentElement.lang || "en"); }
  /* The shipped locale pack supplies any language beyond the inline EN/TR pair,
   * so adding a locale never edits this file. */
  function activeCopy() {
    return typeof getLocalizedCollection === "function"
      ? getLocalizedCollection(copy, lang(), "adventure")
      : copy[lang()] || copy.en;
  }
  function t(key) { const active = activeCopy() || copy.en; return active[key] || copy.en[key] || key; }
  function own(key) { return labels[key] || (OWN[lang()] || OWN.en)[key] || OWN.en[key]; }
  function objectName(level) { return labels["obj" + LEVELS[level].id.charAt(0).toUpperCase() + LEVELS[level].id.slice(1)] || (OWN[lang()] || OWN.en).objects[level]; }
  function fill(template, values) { return String(template || "").replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match)); }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function emit(name, detail) { document.dispatchEvent(new CustomEvent("adventure:" + name, { detail: detail || {} })); }

  /* ---------- profile and settings ---------- */

  const stillMedia = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const profile = { best: 0, highest: 0, wins: 0, runs: 0 };
  const settings = { sound: true, volume: 0.7, reduced: Boolean(stillMedia && stillMedia.matches), guide: true, haptics: true, theme: "study" };
  (function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) { saved = null; }
    if (!saved || saved.v !== 2) return;
    const whole = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    profile.best = whole(saved.best);
    profile.highest = clamp(whole(saved.highest), 0, Sim.LAST);
    profile.wins = whole(saved.wins);
    profile.runs = whole(saved.runs);
    const kept = saved.settings || {};
    for (const key of ["sound", "reduced", "guide", "haptics"]) if (typeof kept[key] === "boolean") settings[key] = kept[key];
    if (Number.isFinite(kept.volume)) settings.volume = clamp(kept.volume, 0, 1);
    if (THEME_IDS.includes(kept.theme) && profile.highest >= CareerArt.THEMES[kept.theme].unlock) settings.theme = kept.theme;
  })();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, best: profile.best, highest: profile.highest, wins: profile.wins, runs: profile.runs, settings: settings })); } catch (error) { /* a private window keeps nothing; the run still plays */ }
  }
  function calm() { return settings.reduced; }

  /* ---------- sound: a few synthesised notes, nothing loaded ---------- */

  let audio = null;
  let master = null;
  function voice() {
    if (!settings.sound) return null;
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      try { audio = new Context(); master = audio.createGain(); master.connect(audio.destination); } catch (error) { audio = null; return null; }
    }
    if (audio.state === "suspended") audio.resume().catch(() => {});
    master.gain.value = settings.volume * 0.5;
    return audio;
  }
  function tone(frequency, length, { type = "triangle", gain = 0.5, delay = 0, slide = 0 } = {}) {
    const out = voice();
    if (!out) return;
    const at = out.currentTime + delay;
    const osc = out.createOscillator();
    const amp = out.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * slide), at + length);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(amp); amp.connect(master);
    osc.start(at); osc.stop(at + length + 0.03);
  }
  function thud(strength) {
    const out = voice();
    if (!out) return;
    const length = 0.09;
    const buffer = out.createBuffer(1, Math.ceil(out.sampleRate * length), out.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = out.createBufferSource();
    const low = out.createBiquadFilter();
    const amp = out.createGain();
    source.buffer = buffer; low.type = "lowpass"; low.frequency.value = 240; amp.gain.value = strength;
    source.connect(low); low.connect(amp); amp.connect(master);
    source.start();
  }
  const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4, 9 / 2, 5];
  const sound = {
    drop() { tone(520, 0.09, { type: "sine", gain: 0.12, slide: 0.6 }); },
    land(speed) { if (speed > 420) thud(clamp((speed - 420) / 2600, 0.06, 0.4)); },
    merge(level, chain) {
      const base = 196 * SCALE[level];
      tone(base, 0.22, { gain: 0.34 });
      tone(base * 2, 0.16, { type: "sine", gain: 0.14, delay: 0.02 });
      if (chain > 1) tone(base * 1.5, 0.2, { gain: 0.2 + Math.min(4, chain) * 0.03, delay: 0.07 });
      if (chain > 2) tone(base * 2, 0.22, { gain: 0.2, delay: 0.14 });
    },
    milestone() { [523, 659, 784].forEach((note, index) => tone(note, 0.2, { gain: 0.24, delay: index * 0.08 })); },
    danger() { tone(116, 0.16, { type: "sine", gain: 0.34 }); tone(116, 0.16, { type: "sine", gain: 0.34, delay: 0.22 }); },
    tool() { tone(880, 0.07, { type: "square", gain: 0.07 }); tone(1320, 0.09, { type: "square", gain: 0.06, delay: 0.06 }); },
    win() { [523, 659, 784, 1047, 1319, 1568].forEach((note, index) => tone(note, 0.34, { gain: 0.3, delay: index * 0.1 })); tone(2093, 0.7, { type: "sine", gain: 0.16, delay: 0.62 }); },
    over() { [330, 262, 196].forEach((note, index) => tone(note, 0.3, { gain: 0.26, delay: index * 0.16, slide: 0.9 })); }
  };
  /* A phone can; a desktop browser has the function and nothing to shake. */
  const canVibrate = typeof navigator.vibrate === "function" && Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  function buzz(pattern) { if (settings.haptics && canVibrate) { try { navigator.vibrate(pattern); } catch (error) { /* not allowed here */ } } }

  /* ---------- the view: where the chamber stands on the canvas ---------- */

  const view = { w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0 };
  const layer = document.createElement("canvas");
  const sprites = [];
  const X = (x) => view.ox + x * view.s;
  const Y = (y) => view.oy + y * view.s;

  function measure() {
    if (!root) {
      /* In place on a page: the board takes the room the layout offers. */
      const wrapper = canvas.parentElement;
      canvas.style.width = "";
      const viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const width = Math.min(wrapper.clientWidth, 980);
      const ratio = viewport <= 640 ? 1.5 : viewport <= 1100 ? 1.0 : 0.78;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.round(clamp(width * ratio, 480, 760))}px`;
    }
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    /* The shell's bars and docks say how much of the canvas they cover. */
    let top = 10, bottom = 10, left = 10, right = 10;
    if (root) {
      root.querySelectorAll("[data-ca-inset]").forEach((node) => {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const side = node.getAttribute("data-ca-inset");
        if (side === "top") top = Math.max(top, box.bottom - rect.top + 8);
        if (side === "bottom") bottom = Math.max(bottom, rect.bottom - box.top + 8);
        if (side === "left") left = Math.max(left, box.right - rect.left + 8);
        if (side === "right") right = Math.max(right, rect.right - box.left + 8);
      });
    }
    const roomW = Math.max(40, w - left - right);
    const roomH = Math.max(40, h - top - bottom);
    const s = Math.min(roomW / (CFG.W + SIDE * 2), roomH / (HEAD + CFG.H + BASE));
    const ox = left + (roomW - CFG.W * s) / 2;
    const oy = h - bottom - (CFG.H + BASE) * s;
    const same = view.w === w && view.h === h && view.dpr === dpr && Math.abs(view.s - s) < 1e-4 && Math.abs(view.ox - ox) < 0.5 && Math.abs(view.oy - oy) < 0.5;
    if (same) return false;
    Object.assign(view, { w, h, dpr, s, ox, oy });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    paintSprites();
    paintLayer();
    return true;
  }

  function paintSprites() {
    for (let level = 0; level < LEVELS.length; level += 1) {
      const radius = LEVELS[level].r * view.s * view.dpr;
      const size = Math.ceil(radius * 2 + 6 * view.dpr);
      const sprite = sprites[level] || (sprites[level] = document.createElement("canvas"));
      sprite.width = size; sprite.height = size;
      CareerArt.prop(sprite.getContext("2d"), level, size / 2, size / 2, radius);
    }
  }

  /* Everything that does not move: the room, and the chamber's glass. */
  function paintLayer() {
    const { w, h, dpr, s } = view;
    layer.width = canvas.width; layer.height = canvas.height;
    const g = layer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box = { x: X(0), y: Y(0), w: CFG.W * s, h: CFG.H * s, base: Y(CFG.H + BASE * 0.6) };
    CareerArt.scene(g, w, h, box, settings.theme);
    const accent = CareerArt.THEMES[settings.theme].accent;
    /* the plinth */
    const shade = g.createRadialGradient(box.x + box.w / 2, Y(CFG.H + BASE), 0, box.x + box.w / 2, Y(CFG.H + BASE), box.w * 0.8);
    shade.addColorStop(0, "rgba(0,0,0,0.5)"); shade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = shade; g.fillRect(box.x - box.w * 0.4, Y(CFG.H + BASE) - 10 * s, box.w * 1.8, 40 * s);
    CareerArt.rr(g, box.x - 20 * s, Y(CFG.H), box.w + 40 * s, BASE * s, 9 * s);
    const plinth = g.createLinearGradient(0, Y(CFG.H), 0, Y(CFG.H + BASE));
    plinth.addColorStop(0, "#222c4a"); plinth.addColorStop(1, "#0b1020");
    g.fillStyle = plinth; g.fill();
    g.strokeStyle = "rgba(255,255,255,0.14)"; g.lineWidth = 1; g.stroke();
    g.shadowColor = accent; g.shadowBlur = 12 * s;
    g.fillStyle = accent; CareerArt.rr(g, box.x + 26 * s, Y(CFG.H) + 11 * s, box.w - 52 * s, 3.5 * s, 2 * s); g.fill();
    g.shadowBlur = 0;
    /* the glass */
    g.beginPath();
    g.moveTo(box.x - 5 * s, box.y);
    g.lineTo(box.x - 5 * s, Y(CFG.H) - 16 * s);
    g.arcTo(box.x - 5 * s, Y(CFG.H) + 1, box.x + 16 * s, Y(CFG.H) + 1, 16 * s);
    g.lineTo(box.x + box.w - 16 * s, Y(CFG.H) + 1);
    g.arcTo(box.x + box.w + 5 * s, Y(CFG.H) + 1, box.x + box.w + 5 * s, Y(CFG.H) - 16 * s, 16 * s);
    g.lineTo(box.x + box.w + 5 * s, box.y);
    g.closePath();
    const glass = g.createLinearGradient(0, box.y, 0, Y(CFG.H));
    glass.addColorStop(0, "rgba(10,16,34,0.62)"); glass.addColorStop(1, "rgba(7,11,24,0.84)");
    g.fillStyle = glass; g.fill();
    const lift = g.createLinearGradient(0, box.y - HEAD * s * 0.8, 0, box.y);
    lift.addColorStop(0, "rgba(255,255,255,0)"); lift.addColorStop(1, "rgba(255,255,255,0.16)");
    g.strokeStyle = lift; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(box.x - 5 * s, box.y - HEAD * s * 0.8); g.lineTo(box.x - 5 * s, box.y); g.moveTo(box.x + box.w + 5 * s, box.y - HEAD * s * 0.8); g.lineTo(box.x + box.w + 5 * s, box.y); g.stroke();
  }

  function chamberFront() {
    const s = view.s, x0 = X(0) - 5 * s, x1 = X(CFG.W) + 5 * s, y0 = Y(0), y1 = Y(CFG.H);
    const accent = CareerArt.THEMES[settings.theme].accent;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, 2.2 * s);
    ctx.strokeStyle = CareerArt.hexA(accent, 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1 - 16 * s); ctx.arcTo(x0, y1 + 1, x0 + 21 * s, y1 + 1, 16 * s);
    ctx.lineTo(x1 - 21 * s, y1 + 1); ctx.arcTo(x1, y1 + 1, x1, y1 - 16 * s, 16 * s); ctx.lineTo(x1, y0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.beginPath(); ctx.moveTo(x0 + 3 * s, y0 + 8 * s); ctx.lineTo(x0 + 3 * s, y0 + (y1 - y0) * 0.42); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.beginPath(); ctx.moveTo(x0 + 34 * s, y0); ctx.lineTo(x0 + 110 * s, y0); ctx.lineTo(x0 + 20 * s, y1 - 40 * s); ctx.lineTo(x0, y1 - 90 * s); ctx.lineTo(x0, y0 + 60 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------- a run ---------- */

  let sim = null;
  let phase = "idle";          /* idle · playing · paused · ending · won · over */
  let acc = 0;
  let frameId = 0;
  let last = 0;
  let clock = 0;               /* ms of this run that were played */
  let aim = CFG.W / 2;
  let endIn = 0;
  let shake = 0;
  let hudKey = "";
  let dangerOn = false;
  let dangerAt = -1e9;
  let roomAt = -1e9;
  let winner = 0;
  let demo = null;
  const held = { left: false, right: false };
  const fx = { bits: [], rings: [], words: [], ghosts: [], pops: new Map(), confetti: [] };

  /* What the board shows while nobody is playing: a small pile, dropped by
   * the same rules a moment ago. */
  function still() {
    if (demo) return demo;
    demo = Sim.create(4127);
    for (let i = 0; i < 26 && !demo.over; i += 1) {
      Sim.drop(demo, 48 + ((i * 149) % (CFG.W - 96)));
      for (let step = 0; step < 64; step += 1) Sim.step(demo);
    }
    for (let step = 0; step < 360; step += 1) Sim.step(demo);
    demo.events.length = 0;
    return demo;
  }

  function snapshot() {
    const run = sim;
    return {
      phase: phase,
      score: run ? run.score : 0,
      best: Math.max(profile.best, run ? run.score : 0),
      held: run ? run.held : 0,
      next: run ? run.next : 0,
      highest: run ? run.highest : 0,
      furthest: profile.highest,
      tools: run ? { swap: run.tools.swap, debug: run.tools.debug } : { swap: CFG.TOOLS.swap, debug: CFG.TOOLS.debug },
      pressure: run ? run.pressure : 0,
      above: Boolean(run && run.dangerTimer > 0),
      drops: run ? run.drops : 0,
      merges: run ? run.merges : 0,
      chain: run ? run.chain : 0,
      bestChain: run ? run.bestChain : 0,
      time: Math.round(clock / 1000),
      wins: profile.wins,
      runs: profile.runs
    };
  }

  function hud(force) {
    const state = snapshot();
    const key = [state.phase, state.score, state.held, state.next, state.highest, state.tools.swap, state.tools.debug, Math.round(state.pressure * 10), state.above, state.furthest].join("|");
    if (!force && key === hudKey) return;
    hudKey = key;
    const score = document.querySelector("[data-adventure-score]");
    const best = document.querySelector("[data-adventure-best]");
    const next = document.querySelector("[data-adventure-next]");
    if (score) score.textContent = String(state.score);
    if (best) best.textContent = String(state.best);
    if (next) next.textContent = objectName(state.held);
    emit("hud", state);
  }

  function setPhase(next) {
    if (phase === next) return;
    phase = next;
    hud(true);
    emit("state", snapshot());
  }

  function clearFx() {
    fx.bits.length = 0; fx.rings.length = 0; fx.words.length = 0; fx.ghosts.length = 0; fx.confetti.length = 0;
    fx.pops.clear();
    shake = 0; winner = 0;
  }

  function start(seed) {
    sim = Sim.create(seed == null ? ((Math.random() * 0xffffffff) >>> 0) || 1 : seed);
    acc = 0; clock = 0; aim = CFG.W / 2; endIn = 0; dangerOn = false;
    held.left = held.right = false;
    clearFx();
    profile.runs += 1;
    save();
    const win = document.querySelector("[data-adventure-win]");
    if (win) win.hidden = true;
    phase = "idle";
    setPhase("playing");
    renderLadder();
    wake();
  }

  function pause() {
    if (phase !== "playing") return;
    held.left = held.right = false;
    setPhase("paused");
    draw();
  }

  function resume() {
    if (phase !== "paused") return;
    setPhase("playing");
    wake();
  }

  /* Back to the still board; the run in progress, if any, is given up. */
  function stop() {
    sim = null;
    clearFx();
    setPhase("idle");
    draw();
  }

  function drop() {
    if (phase !== "playing") return false;
    if (Sim.drop(sim, aim)) return true;
    if (sim.cooldown === 0 && clock - roomAt > 900) { roomAt = clock; word(Sim.clampX(sim.held, aim), Sim.spawnY(sim.held), own("noRoom"), "#ffb4a8", 15); }
    return false;
  }

  function tool(name) {
    if (phase !== "playing") return false;
    const used = name === "swap" ? Sim.swap(sim) : name === "debug" ? Sim.debug(sim) : false;
    if (used) { settle(); hud(); }
    return used;
  }

  /* ---------- what the simulation reports ---------- */

  function word(x, y, text, color, size) { fx.words.push({ x, y, text, color, size, t: 0 }); }

  function burst(x, y, radius, color, count, force) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2, speed = (0.35 + Math.random() * 0.65) * force;
      fx.bits.push({ x: x + Math.cos(angle) * radius * 0.6, y: y + Math.sin(angle) * radius * 0.6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - force * 0.25, size: 3 + Math.random() * 5, spin: (Math.random() - 0.5) * 10, turn: Math.random() * 6, color: i % 3 === 0 ? "#ffffff" : color, t: 0, life: 420 + Math.random() * 380, star: i % 4 === 0 });
    }
  }

  function settle() {
    const events = sim.events;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (event.type === "merge") merged(event);
      else if (event.type === "drop") sound.drop();
      else if (event.type === "land") { sound.land(event.speed); }
      else if (event.type === "swap") sound.tool();
      else if (event.type === "debug") { sound.tool(); fx.rings.push({ x: event.x, y: event.y, r: event.r, color: "#7dd3fc", t: 0 }); if (!calm()) burst(event.x, event.y, event.r, "#7dd3fc", 10, 260); }
      else if (event.type === "milestone") {
        sound.milestone();
        const opened = THEME_IDS.find((id) => CareerArt.THEMES[id].unlock === event.level) || null;
        emit("milestone", { level: event.level, name: objectName(event.level), theme: opened });
      } else if (event.type === "win") {
        winner = event.id; endIn = 2100;
        sound.win(); buzz([20, 40, 20, 40, 70]);
        if (!calm()) for (let n = 0; n < 110; n += 1) fx.confetti.push({ x: Math.random() * CFG.W, y: -HEAD - Math.random() * 260, vx: (Math.random() - 0.5) * 90, vy: 120 + Math.random() * 200, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, turn: Math.random() * 6, spin: (Math.random() - 0.5) * 9, color: TINT[Math.floor(Math.random() * TINT.length)], t: 0 });
        setPhase("ending");
      } else if (event.type === "over") {
        endIn = 1300;
        sound.over(); buzz([40, 60, 90]);
        setPhase("ending");
      }
    }
    events.length = 0;
  }

  function merged(event) {
    const color = TINT[event.level];
    for (const source of event.from) fx.ghosts.push({ level: event.level - 1, x: source.x, y: source.y, a: source.a, tx: event.x, ty: event.y, t: 0 });
    fx.rings.push({ x: event.x, y: event.y, r: event.r, color: color, t: 0 });
    fx.pops.set(event.id, 0);
    if (!calm()) {
      burst(event.x, event.y, event.r, color, 7 + Math.min(9, event.level) + Math.min(4, event.chain) * 3, 240 + event.level * 22);
      shake = Math.max(shake, Math.min(7, 1.2 + event.chain * 1.1 + (event.level > 8 ? 1.5 : 0)));
    }
    word(event.x, event.y - event.r * 0.4, "+" + event.points, "#ffffff", 15 + Math.min(10, event.level));
    if (event.chain >= 2) word(event.x, event.y - event.r - 18, fill(own(event.chain >= 3 ? "chainCombo" : "chainTwo"), { n: event.chain }), event.chain >= 3 ? "#ffd24a" : "#7fe3ff", 17 + Math.min(4, event.chain) * 2);
    else if (event.first && event.level >= 4 && !CFG.MILESTONES.includes(event.level) && event.level < Sim.LAST) word(event.x, event.y - event.r - 18, own("nice"), "#b8f7d4", 16);
    sound.merge(event.level, event.chain);
    buzz(event.chain > 1 ? [10, 30, 16] : 12);
    if (event.first && event.level > profile.highest) { profile.highest = event.level; save(); renderLadder(); }
    emit("merge", { level: event.level, chain: event.chain, points: event.points, first: event.first });
  }

  function finish() {
    const won = sim.won;
    const newBest = sim.score > profile.best;
    if (newBest) profile.best = sim.score;
    if (won) profile.wins += 1;
    if (sim.highest > profile.highest) profile.highest = sim.highest;
    save();
    setPhase(won ? "won" : "over");
    const win = document.querySelector("[data-adventure-win]");
    if (win && !root) win.hidden = !won;
    emit("end", Object.assign(snapshot(), { won: won, newBest: newBest, name: objectName(sim.highest) }));
  }

  /* ---------- time ---------- */

  function busy() {
    /* Paused is paused: what was in the air waits there too. */
    if (phase === "paused") return false;
    return phase === "playing" || phase === "ending" || fx.bits.length > 0 || fx.rings.length > 0 || fx.words.length > 0 || fx.ghosts.length > 0 || fx.confetti.length > 0 || fx.pops.size > 0 || shake > 0.05;
  }

  function wake() {
    if (frameId || lifecycle.aborted) return;
    last = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameId = 0;
    if (lifecycle.aborted) return;
    tick(Math.min(100, now - last));
    last = now;
    if (busy()) frameId = requestAnimationFrame(frame);
  }

  /* One frame of `ms`. The simulation only ever advances in whole steps of
   * 1/120 s, so a 60 Hz display, a 144 Hz display and a slow frame all play
   * the same game; what is left over carries to the next frame and is used
   * to draw between two steps. */
  function tick(ms) {
    if (phase === "playing" || phase === "ending") {
      if (phase === "playing") {
        clock += ms;
        const turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        if (turn) aim = clamp(aim + turn * 560 * ms / 1000, 0, CFG.W);
      }
      acc += ms;
      let steps = 0;
      while (acc >= STEP_MS && steps < 12 && (phase === "playing" || phase === "ending")) {
        Sim.step(sim);
        acc -= STEP_MS; steps += 1;
        if (sim.events.length) settle();
      }
      if (steps === 12) acc = 0;
      if (phase === "playing") {
        const above = sim.dangerTimer > 0;
        if (above && !dangerOn && clock - dangerAt > 2600) { dangerAt = clock; sound.danger(); word(CFG.W / 2, CFG.DANGER_Y - 26, own("careful"), "#ffb4a8", 17); }
        dangerOn = above;
        hud();
      } else if (phase === "ending") {
        endIn -= ms;
        if (endIn <= 0) finish();
      }
    }
    animate(ms);
    draw();
  }

  function animate(ms) {
    const dt = ms / 1000;
    for (const list of [fx.rings, fx.words, fx.ghosts]) {
      for (let i = list.length - 1; i >= 0; i -= 1) { list[i].t += ms; if (list[i].t > (list === fx.words ? 900 : list === fx.rings ? 320 : 110)) list.splice(i, 1); }
    }
    for (let i = fx.bits.length - 1; i >= 0; i -= 1) {
      const bit = fx.bits[i];
      bit.t += ms;
      if (bit.t > bit.life) { fx.bits.splice(i, 1); continue; }
      bit.vy += 900 * dt; bit.x += bit.vx * dt; bit.y += bit.vy * dt; bit.turn += bit.spin * dt;
    }
    for (let i = fx.confetti.length - 1; i >= 0; i -= 1) {
      const piece = fx.confetti[i];
      piece.t += ms; piece.x += (piece.vx + Math.sin(piece.t / 260 + piece.turn) * 40) * dt; piece.y += piece.vy * dt; piece.turn += piece.spin * dt;
      if (piece.y > CFG.H + 80) fx.confetti.splice(i, 1);
    }
    fx.pops.forEach((value, id) => { if (value + ms > 280) fx.pops.delete(id); else fx.pops.set(id, value + ms); });
    shake = shake > 0.05 ? shake * Math.pow(0.0015, dt) : 0;
  }

  /* ---------- drawing ---------- */

  function sprite(level, x, y, radius, angle, alpha) {
    const image = sprites[level];
    const half = (image.width / view.dpr / 2) * (radius / LEVELS[level].r);
    ctx.save();
    ctx.translate(X(x), Y(y));
    if (angle) ctx.rotate(angle);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(image, -half, -half, half * 2, half * 2);
    ctx.restore();
  }

  /* Where an object let go at x would first come to rest. */
  function landing(level, x) {
    const r = LEVELS[level].r;
    let y = CFG.H - r;
    for (const body of sim.bodies) {
      const dx = body.x - x, reach = body.r + r;
      if (Math.abs(dx) >= reach) continue;
      const hit = body.y - Math.sqrt(reach * reach - dx * dx);
      if (hit < y) y = hit;
    }
    return y;
  }

  function drawDanger(pressure, above) {
    const s = view.s, y = Y(CFG.DANGER_Y), x0 = X(0), x1 = X(CFG.W);
    const heat = clamp((pressure - 0.2) / 0.8, 0, 1);
    const red = Math.round(255), green = Math.round(232 - heat * 150), blue = Math.round(200 - heat * 150);
    if (heat > 0.4) {
      const glow = ctx.createLinearGradient(0, y - 70 * s, 0, y + 14 * s);
      const beat = above && !calm() ? 0.75 + 0.25 * Math.sin(performance.now() / 260) : 1;
      glow.addColorStop(0, "rgba(255,70,60,0)"); glow.addColorStop(1, `rgba(255,70,60,${(0.3 * (heat - 0.4) / 0.6 * beat).toFixed(3)})`);
      ctx.fillStyle = glow; ctx.fillRect(x0, y - 70 * s, x1 - x0, 84 * s);
    }
    ctx.save();
    ctx.setLineDash([10 * s, 8 * s]);
    ctx.lineWidth = Math.max(1.5, (1.6 + heat * 1.4) * s);
    ctx.strokeStyle = `rgba(${red},${green},${blue},${(0.3 + heat * 0.65).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(x0 + 4 * s, y); ctx.lineTo(x1 - 4 * s, y); ctx.stroke();
    ctx.restore();
    if (above && sim) {
      /* how long is left, as the line itself running out */
      const left = 1 - sim.dangerTimer / CFG.GRACE;
      ctx.fillStyle = "rgba(255,90,80,0.95)";
      ctx.fillRect(x0 + 4 * s, y - 2.5 * s, (x1 - x0 - 8 * s) * clamp(left, 0, 1), 5 * s);
    }
  }

  function draw() {
    const { w, h, dpr, s } = view;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(layer, 0, 0, w, h);
    const run = sim || still();
    const live = Boolean(sim);
    const between = live && (phase === "playing" || phase === "ending") ? clamp(acc / STEP_MS, 0, 1) : 1;
    ctx.save();
    if (shake > 0.05) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    /* the offer, lit from behind */
    if (winner) {
      const star = run.bodies.find((body) => body.id === winner);
      if (star) {
        const cx = X(star.x), cy = Y(star.y), reach = star.r * s * 2.6, turn = performance.now() / 2600;
        const halo = ctx.createRadialGradient(cx, cy, star.r * s * 0.6, cx, cy, reach);
        halo.addColorStop(0, "rgba(255,214,110,0.55)"); halo.addColorStop(1, "rgba(255,214,110,0)");
        ctx.fillStyle = halo; ctx.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
        if (!calm()) {
          ctx.fillStyle = "rgba(255,226,140,0.16)";
          for (let ray = 0; ray < 10; ray += 1) {
            const angle = turn + ray * Math.PI / 5;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle - 0.1) * reach, cy + Math.sin(angle - 0.1) * reach); ctx.lineTo(cx + Math.cos(angle + 0.1) * reach, cy + Math.sin(angle + 0.1) * reach); ctx.closePath(); ctx.fill();
          }
        }
      }
    }

    for (const ghost of fx.ghosts) {
      const k = ghost.t / 110;
      sprite(ghost.level, ghost.x + (ghost.tx - ghost.x) * k, ghost.y + (ghost.ty - ghost.y) * k, LEVELS[ghost.level].r * (1 - k * 0.45), ghost.a, 1 - k * 0.6);
    }
    for (const body of run.bodies) {
      const x = body.px + (body.x - body.px) * between, y = body.py + (body.y - body.py) * between, angle = body.pa + (body.a - body.pa) * between;
      const pop = fx.pops.get(body.id);
      const swell = pop === undefined || calm() ? 1 : 1 + 0.16 * Math.sin(Math.min(1, pop / 280) * Math.PI) * (1 - pop / 280);
      sprite(body.level, x, y, body.r * swell, angle, 1);
      if (pop !== undefined && pop < 150) {
        ctx.fillStyle = `rgba(255,255,255,${(0.6 * (1 - pop / 150)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(X(x), Y(y), body.r * swell * s, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const ring of fx.rings) {
      const k = ring.t / 320;
      ctx.strokeStyle = CareerArt.hexA(ring.color, (1 - k) * 0.9);
      ctx.lineWidth = (6 * (1 - k) + 1) * s;
      ctx.beginPath(); ctx.arc(X(ring.x), Y(ring.y), ring.r * (1 + k * 0.7) * s, 0, Math.PI * 2); ctx.stroke();
    }

    chamberFront();
    drawDanger(live ? run.pressure : 0, live && run.dangerTimer > 0 && phase === "playing");

    if (live && phase === "playing") {
      const level = run.held, x = Sim.clampX(level, aim), y = Sim.spawnY(level), r = LEVELS[level].r;
      const ready = run.cooldown === 0;
      const closed = ready && Sim.blocked(run, x);
      if (settings.guide && ready && !closed) {
        const rest = landing(level, x);
        ctx.save();
        ctx.setLineDash([5 * s, 8 * s]); ctx.lineWidth = Math.max(1, 1.6 * s); ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.moveTo(X(x), Y(y + r)); ctx.lineTo(X(x), Y(rest - r)); ctx.stroke();
        ctx.setLineDash([]); ctx.strokeStyle = CareerArt.hexA(TINT[level], 0.6); ctx.lineWidth = Math.max(1, 1.6 * s);
        ctx.beginPath(); ctx.arc(X(x), Y(rest), r * s, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = CareerArt.hexA(TINT[level], 0.1); ctx.fill();
        ctx.restore();
      }
      const arrive = ready ? 1 : 1 - run.cooldown / CFG.COOLDOWN;
      sprite(level, x, y, r * (0.5 + 0.5 * arrive), 0, 0.35 + 0.65 * arrive);
      if (closed) { ctx.strokeStyle = "rgba(255,90,80,0.9)"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(X(x), Y(y), r * s, 0, Math.PI * 2); ctx.stroke(); }
    }

    for (const bit of fx.bits) {
      const fade = 1 - bit.t / bit.life;
      ctx.save();
      ctx.translate(X(bit.x), Y(bit.y)); ctx.rotate(bit.turn); ctx.globalAlpha = fade;
      ctx.fillStyle = bit.color;
      if (bit.star) { CareerArt.star(ctx, 0, 0, bit.size * s * 1.3, bit.size * s * 0.5, 4); ctx.fill(); } else ctx.fillRect(-bit.size * s / 2, -bit.size * s / 2, bit.size * s, bit.size * s);
      ctx.restore();
    }
    for (const piece of fx.confetti) {
      ctx.save();
      ctx.translate(X(piece.x), Y(piece.y)); ctx.rotate(piece.turn);
      ctx.fillStyle = piece.color; ctx.fillRect(-piece.w * s / 2, -piece.h * s / 2, piece.w * s, piece.h * s * Math.abs(Math.cos(piece.turn * 1.7)));
      ctx.restore();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const text of fx.words) {
      const k = text.t / 900;
      const size = Math.max(11, text.size * Math.max(0.8, s)) * (k < 0.12 ? 0.7 + k * 2.5 : 1);
      ctx.font = `800 ${size.toFixed(1)}px ${CareerArt.FONT}`;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const tx = clamp(X(text.x), 60, w - 60), ty = Y(text.y) - k * 34 * s;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,10,22,0.85)"; ctx.lineJoin = "round"; ctx.strokeText(text.text, tx, ty);
      ctx.fillStyle = text.color; ctx.fillText(text.text, tx, ty);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (live && (phase === "over" || (phase === "ending" && sim.over))) {
      ctx.fillStyle = "rgba(6,8,18,0.5)"; ctx.fillRect(0, 0, w, h);
      if (!root) {
        ctx.fillStyle = "#f8fbff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `900 ${Math.max(22, 30 * s)}px ${CareerArt.FONT}`;
        ctx.fillText(own("overTitle"), w / 2, h / 2);
      }
    }
  }

  /* ---------- the ladder, and an object as a picture ---------- */

  function icon(target, level) {
    if (!target || !target.getContext || !LEVELS[level]) return;
    const g = target.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, target.width, target.height);
    CareerArt.prop(g, level, target.width / 2, target.height / 2, Math.min(target.width, target.height) / 2 - 2);
  }

  function renderLadder() {
    const holder = document.querySelector("[data-merge-ladder]");
    if (!holder) return;
    const reached = Math.max(profile.highest, sim ? sim.highest : 0);
    holder.innerHTML = LEVELS.map((level, index) => `
      <article class="${index <= reached ? "is-unlocked" : ""}">
        <span><canvas width="96" height="96" aria-hidden="true"></canvas></span>
        <div><strong></strong><small>${String(index + 1).padStart(2, "0")}</small></div>
      </article>
    `).join("");
    holder.querySelectorAll("article").forEach((article, index) => {
      article.querySelector("strong").textContent = objectName(index);
      icon(article.querySelector("canvas"), index);
    });
  }

  function applyText() {
    document.querySelectorAll("[data-adventure-text]").forEach((node) => {
      const key = node.getAttribute("data-adventure-text");
      if (key && t(key)) node.textContent = t(key);
    });
    renderLadder();
    hud(true);
  }

  /* ---------- aim and drop ---------- */

  function toWorld(clientX) {
    const rect = canvas.getBoundingClientRect();
    return clamp((clientX - rect.left - view.ox) / view.s, 0, CFG.W);
  }

  let finger = null;
  let pressed = false;

  canvas.addEventListener("pointermove", (event) => {
    if (phase !== "playing") return;
    if (event.pointerType === "touch" && finger !== event.pointerId) return;
    aim = toWorld(event.clientX);
  }, { signal: lifecycle });

  canvas.addEventListener("pointerdown", (event) => {
    if (phase !== "playing") return;
    aim = toWorld(event.clientX);
    if (event.pointerType === "touch") {
      /* A finger aims while it is down and drops when it lifts. */
      event.preventDefault();
      finger = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button === 0) pressed = true;
  }, { signal: lifecycle });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      if (finger !== event.pointerId) return;
      finger = null;
      canvas.releasePointerCapture?.(event.pointerId);
      if (phase !== "playing") return;
      event.preventDefault();
      aim = toWorld(event.clientX);
      drop();
      return;
    }
    if (!pressed) return;
    pressed = false;
    if (phase !== "playing") return;
    aim = toWorld(event.clientX);
    drop();
  }, { signal: lifecycle });

  canvas.addEventListener("pointercancel", (event) => {
    if (finger === event.pointerId) finger = null;
    pressed = false;
  }, { signal: lifecycle });

  document.querySelector("[data-adventure-drop]")?.addEventListener("click", drop, { signal: lifecycle });
  document.querySelectorAll("[data-adventure-restart]").forEach((button) => button.addEventListener("click", () => start(), { signal: lifecycle }));

  function gameKeys(event) {
    if (!document.body.contains(canvas)) return false;
    /* An open overlay makes the page behind it inert; its keys are not game input. */
    if (canvas.closest("[inert]")) return false;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return false;
    return true;
  }

  window.addEventListener("keydown", (event) => {
    if (phase !== "playing" || !gameKeys(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "ArrowLeft" || key === "a") { if (!held.left) aim = clamp(aim - 14, 0, CFG.W); held.left = true; event.preventDefault(); }
    else if (key === "ArrowRight" || key === "d") { if (!held.right) aim = clamp(aim + 14, 0, CFG.W); held.right = true; event.preventDefault(); }
    else if (key === " " || key === "Enter") {
      /* On a focused link or button these keys are that control's own: the
       * skip link, the navigation and the game's buttons must stay usable from the keyboard. */
      if (event.target.closest?.("a[href], button, summary, [role='button']")) return;
      event.preventDefault();
      if (!event.repeat) drop();
    } else if (key === "1") tool("swap");
    else if (key === "2") tool("debug");
    else if (key === "p") pause();
  }, { signal: lifecycle });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "ArrowLeft" || key === "a") held.left = false;
    if (key === "ArrowRight" || key === "d") held.right = false;
  }, { signal: lifecycle });

  /* Nothing is simulated behind a hidden tab: the run waits. */
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); }, { signal: lifecycle });
  window.addEventListener("blur", () => { held.left = held.right = false; }, { signal: lifecycle });

  function relayout() { if (measure()) draw(); }
  let observer = null;
  if (typeof ResizeObserver === "function") { observer = new ResizeObserver(relayout); observer.observe(canvas); }
  window.addEventListener("resize", relayout, { passive: true, signal: lifecycle });

  function set(key, value) {
    if (key === "volume") settings.volume = clamp(Number(value) || 0, 0, 1);
    else if (key === "theme") { if (!THEME_IDS.includes(value) || profile.highest < CareerArt.THEMES[value].unlock) return false; settings.theme = value; paintLayer(); }
    else if (["sound", "reduced", "guide", "haptics"].includes(key)) settings[key] = Boolean(value);
    else return false;
    save();
    if (key === "sound" && settings.sound) tone(660, 0.1, { gain: 0.2 });
    if (key === "volume") tone(660, 0.1, { gain: 0.2 });
    draw();
    emit("settings", Object.assign({}, settings));
    return true;
  }

  window.KaanCareerAdventure = {
    levels: () => LEVELS.map((level, index) => ({ id: level.id, index: index, name: objectName(index), tint: TINT[index], milestone: CFG.MILESTONES.includes(index) })),
    themes: () => THEME_IDS.map((id) => ({ id: id, unlock: CareerArt.THEMES[id].unlock, unlocked: profile.highest >= CareerArt.THEMES[id].unlock, active: settings.theme === id })),
    state: snapshot,
    settings: () => Object.assign({ canVibrate: canVibrate }, settings),
    set: set,
    start: start,
    pause: pause,
    resume: resume,
    stop: stop,
    drop: drop,
    tool: tool,
    aim: (x) => { aim = clamp(Number(x) || 0, 0, CFG.W); },
    icon: icon,
    relayout: relayout,
    /* Where the chamber stands on the canvas, in CSS pixels, and what is in the air over it. */
    view: () => ({ x: X(0), y: Y(0), width: CFG.W * view.s, height: CFG.H * view.s, scale: view.s, canvas: [view.w, view.h], aim: aim, effects: fx.bits.length + fx.confetti.length + fx.rings.length, shake: shake, running: frameId !== 0 }),
    /* For the focused QA: one frame of `ms` exactly as the display would
     * give it, the run as data, and the simulation itself. */
    tick: tick,
    run: () => sim,
    Sim: Sim
  };
  window.updateCareerAdventureLanguage = function updateCareerAdventureLanguage() { applyText(); };
  lifecycle.addEventListener("abort", () => {
    cancelAnimationFrame(frameId);
    if (observer) observer.disconnect();
    if (audio) audio.close().catch(() => {});
    delete window.KaanCareerAdventure;
    delete window.updateCareerAdventureLanguage;
  }, { once: true });

  measure();
  applyText();
  draw();
  emit("ready", snapshot());
  /* Without a shell there is no menu to start from: the board is the game. */
  if (!root) start();
}
/* Master 3 #30: a React-owned document hosts this engine through
 * js/pages/engine-host.js, which starts it after hydration and can stop it.
 * A legacy document boots it immediately, exactly as before. */
if (typeof document === "undefined") module.exports = { CareerSim: CareerSim };
else if (document.querySelector("main[data-react-main]")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push(["adventure", startCareerAdventure]);
else startCareerAdventure(new AbortController().signal);
