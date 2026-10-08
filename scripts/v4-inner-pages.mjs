/* V4 inner pages: Experience, Certificates and About as connected systems.
 *
 * Each model is read from the page's own accepted structure and the canonical
 * portfolio data, at build time. Nothing is authored here: a role's dates are
 * the dates printed on its card, a credential's cluster is the category it is
 * listed under and the provider named on it, and an About theme's evidence is
 * the evidence its recruiter profile already declares. A relationship the
 * sources do not make is not drawn. Geometry is derived from the same data,
 * so a map cannot drift from the page it describes. */

const attribute = (node, name) => node.attributes?.find((entry) => entry.name === name)?.value;
const hasClass = (node, name) => node.type === "element" && String(attribute(node, "class") || "").split(/\s+/).includes(name);
const all = (nodes, test, out = []) => {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (test(node)) out.push(node);
    all(node.children, test, out);
  }
  return out;
};
const first = (nodes, test) => all(nodes, test)[0] || null;
const clean = (value) => String(value).replace(/\s+/g, " ").trim();
const round = (value) => Math.round(value * 10) / 10;
const two = (value) => String(value).padStart(2, "0");
const elements = (node) => node.children.filter((child) => child.type === "element");

/* ---------- Experience: the career current ---------- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CAREER = { width: 1200, height: 470, from: 64, now: 968, onward: 1044, low: 372, rise: 236, lane: 46 };

/* "Istanbul | Jan 2026 – Present", as the accepted English card prints it. */
function period(value, what) {
  const [place, range] = clean(value).split(" | ");
  const [from, to] = String(range || "").split(" – ");
  const month = (entry) => {
    const match = /^([A-Za-z]{3})[a-z.]*\s+(\d{4})$/.exec(clean(entry || ""));
    if (!match) return null;
    const index = MONTHS.indexOf(match[1].toLowerCase());
    if (index < 0) throw new Error(`${what}: unreadable month in ${JSON.stringify(value)}`);
    return Number(match[2]) * 12 + index;
  };
  const start = month(from);
  if (start === null || !place || !to) throw new Error(`${what}: unreadable period ${JSON.stringify(value)}`);
  return { start, end: month(to) };
}

export function v4ExperienceModel({ locale, children, english, text, ecosystem, asOf, message, about }) {
  const cardsOf = (nodes) => all(nodes, (node) => hasClass(node, "experience-card"));
  const cards = cardsOf(children);
  const source = cardsOf(english);
  if (!cards.length || cards.length !== source.length) throw new Error(`${locale}/blog: experience cards do not line up with the English contract`);
  const [year, monthOfYear] = asOf.split("-").map(Number);
  const present = year * 12 + monthOfYear;
  const roles = cards.map((card, index) => {
    const time = clean(text(first([card], (node) => hasClass(node, "time"))));
    const [org, ...rest] = clean(text(first([card], (node) => node.tag === "h3"))).split(" — ");
    const [place, range] = time.split(" | ");
    const span = period(text(first([source[index]], (node) => hasClass(node, "time"))), `${locale}/blog role ${index}`);
    const link = elements(card).find((node) => node.tag === "a");
    const project = link ? ecosystem.projects.find((entry) => entry.href === attribute(link, "href")) : null;
    return {
      id: `r${index}`,
      anchor: `v4-role-${index}`,
      org,
      title: rest.join(" — "),
      place,
      period: range,
      start: span.start,
      end: span.end === null ? present : span.end + 1,
      live: span.end === null,
      tags: all([card], (node) => hasClass(node, "project-tags")).flatMap(elements).map((node) => clean(text(node))),
      keys: all([source[index]], (node) => hasClass(node, "project-tags")).flatMap(elements).map((node) => clean(text(node))),
      evidence: project ? { id: project.id, title: project.title, href: project.href, ...(project.status ? { status: project.status } : {}), capabilities: ecosystem.capabilities.filter((capability) => project.categories.includes(capability.id)) } : null,
    };
  });

  const first12 = Math.floor(Math.min(...roles.map((role) => role.start)) / 12) * 12;
  const last = Math.max(present, ...roles.map((role) => role.end));
  const xOf = (months) => CAREER.from + ((months - first12) / (last - first12)) * (CAREER.now - CAREER.from);
  const yOf = (x) => {
    const u = Math.max(0, Math.min(1, (x - CAREER.from) / (CAREER.onward - CAREER.from)));
    return CAREER.low - CAREER.rise * u * u * (3 - 2 * u);
  };
  const along = (from, to, offset = 0, step = 20) => {
    const points = [];
    for (let x = from; x < to; x += step) points.push([x, yOf(x) + offset]);
    points.push([to, yOf(to) + offset]);
    return points.map(([x, y]) => `${round(x)} ${round(y)}`).join("L");
  };

  /* Roles that overlap in time run side by side: the first free lane, oldest
   * first. Lane 0 is the current itself. */
  const lanes = [];
  for (const role of [...roles].sort((a, b) => a.start - b.start)) {
    let lane = lanes.findIndex((end) => end <= role.start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = role.end;
    role.lane = lane;
  }
  for (const role of roles) {
    const x0 = xOf(role.start);
    const x1 = Math.max(xOf(role.end), x0 + 10);
    const offset = -role.lane * CAREER.lane;
    role.x = round(x0);
    role.y = round(yOf(x0) + offset);
    role.side = role.lane ? "above" : "below";
    role.d = role.lane
      ? `M${round(x0 - 18)} ${round(yOf(x0 - 18))}Q${round(x0 - 4)} ${round(yOf(x0) + offset)} ${along(x0, x1, offset, 12)}Q${round(x1 + 6)} ${round(yOf(x1) + offset)} ${round(x1 + 18)} ${round(yOf(x1 + 18))}`
      : `M${along(x0, x1)}`;
  }
  /* A label runs away from its nearest neighbour on the same side. */
  for (const side of ["above", "below"]) {
    const row = roles.filter((role) => role.side === side).sort((a, b) => a.x - b.x);
    row.forEach((role, index) => { role.align = row[index + 1] && row[index + 1].x - role.x < 175 ? "end" : "start"; });
  }
  for (const role of roles) {
    if (!role.evidence) continue;
    const x = role.x + (role.align === "end" ? -70 : 70);
    const y = Math.min(role.y + 118, CAREER.height - 86);
    Object.assign(role.evidence, { x: round(x), y: round(y), align: role.align, d: `M${role.x} ${role.y}Q${role.x} ${round(y)} ${round(x)} ${round(y)}` });
  }
  /* A capability two roles are both tagged with is one thread between them. */
  const shared = new Map();
  roles.forEach((role) => role.keys.forEach((key, index) => shared.set(key, [...(shared.get(key) || []), { role, label: role.tags[index] }])));
  const threads = [...shared.entries()].filter(([, entries]) => entries.length > 1).map(([, entries], index) => {
    const [a, b] = entries.map((entry) => entry.role).sort((left, right) => left.x - right.x);
    const mid = (a.x + b.x) / 2;
    const top = Math.min(a.y, b.y) - 84;
    return { id: `t${index}`, label: entries[0].label, roles: entries.map((entry) => entry.role.id), x: round(mid), y: round((Math.min(a.y, b.y) + top) / 2 - 6), d: `M${a.x} ${a.y}Q${round(mid)} ${round(top)} ${b.x} ${b.y}` };
  });

  const direction = first(children, (node) => hasClass(node, "experience-summary"));
  const years = [];
  for (let months = first12; months <= last; months += 12) years.push({ label: String(months / 12), x: round(xOf(months)) });
  const publicRole = ({ start, end, keys, lane, ...role }) => ({ ...role, links: [...(role.evidence ? [role.evidence.id] : []), ...threads.filter((thread) => thread.roles.includes(role.id)).map((thread) => thread.id)] });
  return {
    consumer: "experience",
    career: {
      aria: message("experience.current.aria"),
      eyebrow: message("experience.current.eyebrow"),
      width: CAREER.width,
      height: CAREER.height,
      current: `M${along(CAREER.from - 44, CAREER.now)}`,
      onward: `M${along(CAREER.now, CAREER.onward)}`,
      now: { x: CAREER.now, y: round(yOf(CAREER.now)), label: message("experience.current.now") },
      years,
      roles: roles.map(publicRole),
      threads,
      direction: { label: clean(text(first([direction], (node) => node.tag === "h2"))), x: CAREER.onward, y: round(yOf(CAREER.onward)) },
      labels: { roles: message("experience.current.roles"), evidence: message("experience.current.evidence") },
      counts: { roles: two(roles.length), evidence: two(roles.filter((role) => role.evidence).length) },
    },
    milestone: { more: message("experience.milestone.more"), less: message("experience.milestone.less") },
    handoff: about,
  };
}

/* ---------- Certificates: the learning constellation ---------- */

const SKY = { width: 1000, height: 640, x: 500, y: 320 };
const polar = (cx, cy, rx, ry, degrees) => ({ x: round(cx + rx * Math.cos((degrees * Math.PI) / 180)), y: round(cy + ry * Math.sin((degrees * Math.PI) / 180)) });
const fan = (count, spread) => Array.from({ length: count }, (_, index) => (count === 1 ? 0 : -spread + (2 * spread * index) / (count - 1)));

export function v4CertificatesModel({ locale, children, english, text, message }) {
  const categoriesOf = (nodes) => all(nodes, (node) => hasClass(node, "training-category"));
  const sections = categoriesOf(children);
  const sourceSections = categoriesOf(english);
  const areas = sections.map((section, index) => ({ id: `a${index}`, label: clean(text(first([section], (node) => node.tag === "h2"))) }));
  const providers = [];
  const credentials = [];
  sections.forEach((section, areaIndex) => {
    const sourceCards = all([sourceSections[areaIndex]], (node) => hasClass(node, "certificate-card"));
    all([section], (node) => hasClass(node, "certificate-card")).forEach((card, cardIndex) => {
      const kicker = elements(first([card], (node) => hasClass(node, "certificate-kicker")));
      /* Providers are proper names; the English contract keys them. */
      const providerKey = clean(text(elements(first([sourceCards[cardIndex]], (node) => hasClass(node, "certificate-kicker")))[1]));
      let provider = providers.find((entry) => entry.key === providerKey);
      if (!provider) providers.push(provider = { key: providerKey, id: `p${providers.length}`, label: clean(text(kicker[1])) });
      const preview = first([card], (node) => hasClass(node, "certificate-preview"));
      const link = elements(first([card], (node) => hasClass(node, "certificate-actions"))).find((node) => node.tag === "a");
      const image = attribute(preview, "data-cert");
      if (!image || !kicker[1]) throw new Error(`${locale}/certificates: credential ${credentials.length} is missing its provider or preview`);
      credentials.push({
        id: `k${credentials.length}`,
        area: areas[areaIndex].id,
        provider: provider.id,
        title: clean(text(first([card], (node) => node.tag === "h3"))),
        kind: clean(text(kicker[0])),
        providerLabel: provider.label,
        meta: all([card], (node) => node.tag === "dl").flatMap(elements).map((row) => elements(row).map((cell) => clean(text(cell)))),
        image,
        previewLabel: clean(text(preview)),
        ...(link ? { href: attribute(link, "href"), hrefLabel: clean(text(link)) } : {}),
      });
    });
  });
  if (!credentials.length) throw new Error(`${locale}/certificates: no credentials found`);

  /* One layout per grouping the data supports: the category a credential is
   * listed under, and the provider named on it. */
  const layout = (groups, key, ring) => {
    const hubs = groups.map((group, index) => {
      const members = credentials.filter((credential) => credential[key] === group.id);
      const angle = ring.start + (360 / groups.length) * index;
      return { id: group.id, label: group.label, count: two(members.length), angle, members, ...polar(SKY.x, SKY.y, ring.rx, ring.ry, angle) };
    });
    const at = {};
    for (const hub of hubs) {
      /* A few members fan away from the core; many surround their hub. */
      const count = hub.members.length;
      const open = count > 3 ? Array.from({ length: count }, (_, index) => 180 / count + (360 / count) * index) : fan(count, [0, 0, 38, 62][count]);
      hub.members.forEach((credential, index) => {
        const point = polar(hub.x, hub.y, ring.reach[0], ring.reach[1], hub.angle + open[index]);
        /* A star above its hub is named above, clear of the wire. */
        at[credential.id] = { ...point, hub: hub.id, ...(point.y < hub.y - 4 ? { above: true } : {}) };
      });
    }
    return { hubs: hubs.map(({ members, angle, ...hub }) => hub), at };
  };
  return {
    consumer: "certificates",
    sky: {
      width: SKY.width,
      height: SKY.height,
      core: { x: SKY.x, y: SKY.y, label: clean(text(first(children, (node) => hasClass(node, "eyebrow")))), count: two(credentials.length) },
      credentials,
      groups: {
        area: layout(areas, "area", { start: -90, rx: 255, ry: 150, reach: [165, 128] }),
        provider: layout(providers.map(({ id, label }) => ({ id, label })), "provider", { start: 180, rx: 235, ry: 0, reach: [200, 215] }),
      },
      labels: {
        viewAria: message("certificates.view.aria"),
        grid: message("certificates.view.grid"),
        constellation: message("certificates.view.constellation"),
        groupAria: message("certificates.group.aria"),
        area: message("certificates.group.area"),
        provider: message("certificates.group.provider"),
        all: message("works.filter.all"),
        credentials: message("certificates.count.credentials"),
        linked: message("certificates.count.linked"),
      },
      linked: two(credentials.filter((credential) => credential.href).length),
    },
  };
}

/* ---------- About: the human system map ---------- */

const HUMAN = { width: 960, height: 640, x: 440, y: 320, near: [250, 200], far: [372, 272] };

export function v4AboutModel({ locale, children, text, value, message, recruiter, experience }) {
  /* The themes are the capability focuses the page itself offers, each one
   * already bound to a recruiter profile by its own link. */
  const themes = all(children, (node) => hasClass(node, "contact-actions")).flatMap(elements).map((link) => {
    const role = new URLSearchParams(String(attribute(link, "href")?.path || "").split("?")[1] || "").get("role");
    const profile = recruiter.profiles[role];
    if (!profile) throw new Error(`${locale}/about: capability focus ${role} has no recruiter profile`);
    return { id: role, label: clean(text(link)), href: value(attribute(link, "href")), title: profile.focusTitle, skills: profile.skills, evidence: profile.evidence };
  });
  if (themes.length < 2) throw new Error(`${locale}/about: capability focuses are missing`);
  const projects = [];
  for (const theme of themes) for (const item of theme.evidence) if (!projects.some((project) => project.id === item.id)) projects.push({ id: item.id, title: item.title, summary: item.summary, href: item.href });

  /* Four themes sit wide of the portrait, clear of its caption; any other
   * number is spaced evenly. */
  const wide = themes.length === 4 ? [-150, -30, 30, 150] : null;
  themes.forEach((theme, index) => Object.assign(theme, { angle: wide ? wide[index] : -90 - 180 / themes.length + (360 / themes.length) * index }));
  themes.forEach((theme) => Object.assign(theme, polar(HUMAN.x, HUMAN.y, HUMAN.near[0], HUMAN.near[1], theme.angle)));
  /* A project sits toward the themes that cite it. */
  for (const project of projects) {
    const cited = themes.filter((theme) => theme.evidence.some((item) => item.id === project.id));
    const sum = cited.reduce((total, theme) => ({ x: total.x + Math.cos((theme.angle * Math.PI) / 180), y: total.y + Math.sin((theme.angle * Math.PI) / 180) }), { x: 0, y: 0 });
    project.angle = (Math.atan2(sum.y, sum.x) * 180) / Math.PI;
    project.themes = cited.map((theme) => theme.id);
  }
  const ring = [...projects].sort((a, b) => a.angle - b.angle);
  for (let pass = 0; pass < 40; pass += 1) {
    ring.forEach((project, index) => {
      const next = ring[(index + 1) % ring.length];
      const gap = (((next.angle - project.angle) % 360) + 360) % 360;
      if (ring.length > 1 && gap < 40) { project.angle -= (40 - gap) / 2; next.angle += (40 - gap) / 2; }
    });
  }
  for (const project of projects) {
    Object.assign(project, polar(HUMAN.x, HUMAN.y, HUMAN.far[0], HUMAN.far[1], project.angle));
    const cos = Math.cos((project.angle * Math.PI) / 180);
    project.align = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "center";
    project.above = Math.sin((project.angle * Math.PI) / 180) < 0;
  }
  const edges = themes.flatMap((theme) => theme.evidence.map((item) => {
    const project = projects.find((entry) => entry.id === item.id);
    /* Routed round the outside, the short way, so no wire crosses the portrait. */
    const turn = ((((project.angle - theme.angle) % 360) + 540) % 360) - 180;
    const bend = polar(HUMAN.x, HUMAN.y, HUMAN.far[0] * (0.78 + Math.abs(turn) / 420), HUMAN.far[1] * (0.78 + Math.abs(turn) / 420), theme.angle + turn / 2);
    return { theme: theme.id, project: project.id, d: `M${theme.x} ${theme.y}Q${bend.x} ${bend.y} ${project.x} ${project.y}` };
  }));
  const photo = first(children, (node) => hasClass(node, "about-photo"));
  const badge = elements(first([photo], (node) => hasClass(node, "about-badge")));
  const image = first([photo], (node) => node.tag === "img");
  const statement = first(children, (node) => hasClass(node, "about-copy"));
  const labelOf = (node) => clean(text(first([node], (entry) => hasClass(entry, "eyebrow")) || first([node], (entry) => entry.tag === "h2") || { type: "text", value: "" }));
  /* Narrative order: who, how I think, how I build, what shaped it, where next. */
  const indexOf = (name) => children.findIndex((node) => hasClass(node, name) || Boolean(first([node], (entry) => hasClass(entry, name))));
  const order = [indexOf("page-hero"), indexOf("about-hero"), indexOf("process-list"), indexOf("capability-grid"), indexOf("toolbox-grid"), indexOf("journey-grid"), indexOf("contact-hub")];
  if (order.some((index) => index < 0) || new Set(order).size !== children.length) throw new Error(`${locale}/about: the page no longer has the sections the V4 narrative orders`);
  return {
    consumer: "about",
    order,
    tracker: { aria: message("project.tracker.aria"), items: order.slice(1).map((index) => ({ id: `v4-s-${index}`, label: labelOf(children[index]) })).filter((item) => item.label) },
    human: {
      aria: message("about.map.aria"),
      eyebrow: message("about.map.eyebrow"),
      width: HUMAN.width,
      height: HUMAN.height,
      orbits: [HUMAN.near, HUMAN.far],
      core: { x: HUMAN.x, y: HUMAN.y, src: attribute(image, "src"), alt: value(attribute(image, "alt")), role: clean(text(badge[0])), location: clean(text(badge[1])) },
      statement: clean(text(first([statement], (node) => node.tag === "h2"))),
      themes: themes.map(({ evidence, angle, ...theme }) => ({ ...theme, links: evidence.map((item) => item.id) })),
      projects: projects.map(({ angle, ...project }) => project),
      edges,
      labels: { themes: message("about.map.themes"), evidence: message("about.map.evidence") },
      counts: { themes: two(themes.length), evidence: two(projects.length) },
    },
    handoff: experience,
  };
}
