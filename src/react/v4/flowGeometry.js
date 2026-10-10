/* V4 connected-system geometry.
 *
 * Flows and ecosystems are authored as positions in a fixed-aspect field.
 * Everything the stylesheet needs to draw and time them — the currents, where
 * a signal is when it reaches each stop, where a node sits — is derived here
 * once, at render time, so no browser code measures the DOM.
 *
 * Plain JavaScript on purpose: the React primitives and the dev specimen share
 * it without a build step. */

export const HUB = "@hub";
export const INLET = "@in";
export const OUTLET = "@out";

const round = (value) => Math.round(value * 100) / 100;

/** A current through the given points: a smooth curve, never a wireframe. */
export function currentPath(points, { closed = false } = {}) {
  if (points.length < 3) return points.map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`).join("");
  const at = (index) => (closed ? points[(index + points.length) % points.length] : points[Math.max(0, Math.min(points.length - 1, index))]);
  const count = closed ? points.length : points.length - 1;
  let path = `M${points[0].x} ${points[0].y}`;
  for (let index = 0; index < count; index += 1) {
    const [before, from, to, after] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    path += `C${round(from.x + (to.x - before.x) / 6)} ${round(from.y + (to.y - before.y) / 6)} ${round(to.x - (after.x - from.x) / 6)} ${round(to.y - (after.y - from.y) / 6)} ${to.x} ${to.y}`;
  }
  return closed ? `${path}Z` : path;
}

/** One wire between two points, bowed toward (or away from) a third. */
function wire(from, to, toward, pull = 0.18) {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return `M${from.x} ${from.y}Q${round(middle.x + (toward.x - middle.x) * pull)} ${round(middle.y + (toward.y - middle.y) * pull)} ${to.x} ${to.y}`;
}

export function flowGeometry(model) {
  const { width, height } = model.field;
  const point = ({ x, y }) => ({ x: round((x / 100) * width), y: round((y / 100) * height) });
  const stages = new Map(model.stages.map((stage) => [stage.id, point(stage)]));
  const fixed = new Map([[HUB, model.hub], [INLET, model.inlet], [OUTLET, model.outlet]].filter(([, value]) => value).map(([id, value]) => [id, point(value)]));
  const hub = fixed.get(HUB) || null;
  const resolve = (id) => {
    const target = fixed.get(id) || stages.get(id);
    if (!target) throw new Error(`signal flow "${model.id}" routes through unknown stop ${id}`);
    return target;
  };

  const stops = model.route.map((id) => ({ id, ...resolve(id) }));
  const lengths = stops.slice(1).map((stop, index) => Math.hypot(stop.x - stops[index].x, stop.y - stops[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  /* Fraction of the journey at which the signal reaches each stop (0–1). */
  const arrival = {};
  let travelled = 0;
  stops.forEach((stop, index) => {
    if (index) travelled += lengths[index - 1];
    if (!(stop.id in arrival)) arrival[stop.id] = round(travelled / total);
  });
  const centre = { x: width / 2, y: height / 2 };

  return {
    viewBox: `0 0 ${width} ${height}`,
    aspect: `${width} / ${height}`,
    trace: currentPath(stops),
    loop: model.loop ? currentPath(model.stages.map(point), { closed: true }) : null,
    hub: hub && { ...hub, radius: round((model.hub.radius / 100) * width) },
    /* The hub's own line to every stage, bowed outward so it clears the hub. */
    spokes: hub ? model.stages.map((stage) => ({ id: stage.id, d: wire(hub, point(stage), centre, -0.22) })) : [],
    arrival,
  };
}

/* Ecosystem: a spatial map derived only from which project is filed under
 * which capability.
 *
 *   core hubs      capabilities that share a project with another capability,
 *                  on an inner ring, joined by one closed current
 *   satellites     capabilities that share none, further out, in the gaps
 *   shared work    a project under two or more hubs sits between them
 *   single work    a project under one hub fans out beyond it
 *
 * The layout is a pure function of the data; change the catalog and the map
 * re-forms. Nothing here adds, weights or implies a relationship. */
export const ECOSYSTEM_FIELD = { width: 1000, height: 580 };

export function ecosystemGeometry({ capabilities, projects }) {
  const { width, height } = ECOSYSTEM_FIELD;
  const centre = { x: width / 2, y: height / 2 };
  const reach = { x: 425, y: 218 };
  const polar = (degrees, radius) => ({
    x: round(centre.x + Math.cos((degrees * Math.PI) / 180) * reach.x * radius),
    y: round(centre.y + Math.sin((degrees * Math.PI) / 180) * reach.y * radius),
  });
  const shared = new Set(projects.filter((project) => project.categories.length > 1).flatMap((project) => project.categories));
  const core = capabilities.filter((capability) => shared.has(capability.id));
  const ring = core.length >= 2 ? core : capabilities;
  const satellites = capabilities.filter((capability) => !ring.includes(capability));
  const step = 360 / ring.length;
  const angle = new Map(ring.map((capability, index) => [capability.id, -90 + index * step]));
  const tier = new Map([...ring.map((capability) => [capability.id, "core"]), ...satellites.map((capability) => [capability.id, "satellite"])]);
  const capabilityAt = new Map(ring.map((capability) => [capability.id, polar(angle.get(capability.id), 0.4)]));
  /* Everything placed so far, and the roomiest of a few candidate spots for
   * what comes next. Labels are wide, so vertical room counts for more. */
  const placed = [...capabilityAt.values()];
  const roomiest = (candidates) => {
    const room = (spot) => Math.min(...placed.map((other) => Math.hypot(spot.x - other.x, (spot.y - other.y) * 1.7)));
    const best = candidates.reduce((winner, spot) => (room(spot) > room(winner) ? spot : winner));
    placed.push(best);
    return best;
  };

  const singles = new Map();
  for (const project of projects) if (project.categories.length === 1) singles.set(project.categories[0], [...(singles.get(project.categories[0]) || []), project.id]);
  const projectAt = new Map();
  for (const project of projects) {
    const hubs = project.categories.filter((id) => angle.has(id));
    if (hubs.length > 1) {
      /* Between its hubs: the circular mean of their directions, a ring out. */
      const sum = hubs.reduce((total, id) => ({ x: total.x + Math.cos((angle.get(id) * Math.PI) / 180), y: total.y + Math.sin((angle.get(id) * Math.PI) / 180) }), { x: 0, y: 0 });
      const between = (Math.atan2(sum.y, sum.x) * 180) / Math.PI;
      projectAt.set(project.id, roomiest([polar(between - 13, 0.68), polar(between + 13, 0.68)]));
    } else if (tier.get(hubs[0]) === "core") {
      const family = singles.get(hubs[0]);
      const offset = family.indexOf(project.id) - (family.length - 1) / 2;
      projectAt.set(project.id, polar(angle.get(hubs[0]) + offset * 27, 1));
      placed.push(projectAt.get(project.id));
    }
  }
  /* Satellites last, each with its own work beside it, wherever the map still
   * has the most room. */
  satellites.forEach((capability, index) => {
    const gap = -90 + step / 2 + index * (360 / satellites.length);
    const spots = [-24, -12, 12, 24].flatMap((turn) => [polar(gap + turn, 0.88), polar(gap + turn, 1)]);
    capabilityAt.set(capability.id, roomiest(spots));
    const home = capabilityAt.get(capability.id);
    const bearing = (Math.atan2((home.y - centre.y) / reach.y, (home.x - centre.x) / reach.x) * 180) / Math.PI;
    (singles.get(capability.id) || []).forEach((id) => projectAt.set(id, roomiest([-34, -26, 26, 34].flatMap((turn) => [polar(bearing + turn, 1), polar(bearing + turn, 0.8)]))));
  });

  const percent = ({ x, y }) => ({ x: `${round((x / width) * 100)}%`, y: `${round((y / height) * 100)}%` });
  const degree = (capability) => projects.filter((project) => project.categories.includes(capability.id)).length;
  return {
    viewBox: `0 0 ${width} ${height}`,
    aspect: `${width} / ${height}`,
    loop: ring.length >= 3 ? currentPath(ring.map((capability) => capabilityAt.get(capability.id)), { closed: true }) : currentPath(ring.map((capability) => capabilityAt.get(capability.id))),
    edges: projects.flatMap((project) => project.categories.filter((id) => capabilityAt.has(id)).map((id) => ({
      project: project.id,
      capability: id,
      d: wire(projectAt.get(project.id), capabilityAt.get(id), centre),
    }))),
    capability: (capability) => ({ ...percent(capabilityAt.get(capability.id)), tier: tier.get(capability.id), degree: degree(capability) }),
    project: (id) => ({ ...percent(projectAt.get(id)), side: projectAt.get(id).y < centre.y ? "above" : "below" }),
  };
}
