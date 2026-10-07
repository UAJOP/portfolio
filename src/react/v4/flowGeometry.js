/* V4 signal-flow geometry.
 *
 * A flow is authored as stage positions in percent of a fixed-aspect field,
 * plus the route the signal travels. Everything the stylesheet needs to draw
 * and time it — the trace, where the signal is when it reaches each stage — is
 * derived here once, at render time, so no browser code measures the DOM.
 *
 * Plain JavaScript on purpose: the React primitive and the dev specimen share
 * it without a build step. */

export const HUB = "@hub";

const round = (value) => Math.round(value * 100) / 100;

export function flowGeometry(model) {
  const { width, height } = model.field;
  const point = ({ x, y }) => ({ x: round((x / 100) * width), y: round((y / 100) * height) });
  const stages = new Map(model.stages.map((stage) => [stage.id, point(stage)]));
  const hub = model.hub ? point(model.hub) : null;
  const resolve = (id) => {
    const target = id === HUB ? hub : stages.get(id);
    if (!target) throw new Error(`signal flow "${model.id}" routes through unknown stop ${id}`);
    return target;
  };
  const pathFor = (points, closed = false) => `${points.map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`).join("")}${closed ? "Z" : ""}`;

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

  return {
    viewBox: `0 0 ${width} ${height}`,
    aspect: `${width} / ${height}`,
    trace: pathFor(stops),
    loop: model.loop ? pathFor(model.stages.map(point), true) : null,
    hub: hub && { ...hub, radius: round((model.hub.radius / 100) * width) },
    links: hub ? model.stages.map((stage) => ({ id: stage.id, ...point(stage) })) : [],
    arrival,
  };
}
