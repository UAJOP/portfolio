/**
 * Algorithmic 3D Lab (labs.html only).
 *
 * Extracted from js/features/creative.js by BRIEF 03. It gates on the
 * #math-3d-canvas element, which exists on exactly one page, so ~250 lines of
 * canvas maths no longer ship with every page.
 */
function setupAlgorithmic3DLab() {
  const canvas = document.getElementById("math-3d-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const state = {
    rx: -0.62,
    ry: 0.72,
    rz: 0.05,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    visible: false,
    raf: null,
    t: 0,
  };
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointFromBarycentric(i, j, n, time) {
    const u = i / n;
    const v = j / n;
    const w = 1 - u - v;
    const ax = -1.75,
      ay = -1.12;
    const bx = 1.75,
      by = -1.12;
    const cx = 0,
      cy = 1.72;
    const x = ax * w + bx * u + cx * v;
    const y = ay * w + by * u + cy * v;
    const z =
      0.46 *
        Math.sin((u * 4.4 + time) * Math.PI) *
        Math.cos((v * 3.8 - time * 0.7) * Math.PI) +
      0.18 * Math.sin((w * 5.2 + time * 0.5) * Math.PI);
    return { x, y, z };
  }

  function rotate(p) {
    const cx = Math.cos(state.rx),
      sx = Math.sin(state.rx);
    const cy = Math.cos(state.ry),
      sy = Math.sin(state.ry);
    const cz = Math.cos(state.rz),
      sz = Math.sin(state.rz);
    let y = p.y * cx - p.z * sx;
    let z = p.y * sx + p.z * cx;
    let x = p.x * cy + z * sy;
    z = -p.x * sy + z * cy;
    const x2 = x * cz - y * sz;
    const y2 = x * sz + y * cz;
    return { x: x2, y: y2, z };
  }

  function project(p, width, height) {
    const camera = 5.2;
    const scale = Math.min(width, height) * 0.31 * state.zoom;
    const perspective = camera / (camera - p.z);
    return {
      x: width / 2 + p.x * scale * perspective,
      y: height / 2 - p.y * scale * perspective,
      z: p.z,
      perspective,
    };
  }

  function buildFaces(time) {
    const n = 18;
    const vertices = [];
    const index = new Map();
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n - i; j += 1) {
        index.set(`${i},${j}`, vertices.length);
        vertices.push(pointFromBarycentric(i, j, n, time));
      }
    }
    const faces = [];
    const get = (i, j) => vertices[index.get(`${i},${j}`)];
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        faces.push([get(i, j), get(i + 1, j), get(i, j + 1)]);
        if (j < n - i - 1)
          faces.push([get(i + 1, j), get(i + 1, j + 1), get(i, j + 1)]);
      }
    }
    return faces;
  }

  function drawAxes(width, height) {
    const axes = [
      [{ x: 0, y: 0, z: 0 }, { x: 2.25, y: 0, z: 0 }, "X"],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 2.25, z: 0 }, "Y"],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1.8 }, "Z"],
    ];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.font = "700 12px Inter, system-ui";
    axes.forEach(([a, b, label]) => {
      const pa = project(rotate(a), width, height);
      const pb = project(rotate(b), width, height);
      ctx.strokeStyle =
        label === "X"
          ? "rgba(56,189,248,.75)"
          : label === "Y"
            ? "rgba(52,211,153,.75)"
            : "rgba(251,191,36,.8)";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.fillText(label, pb.x + 6, pb.y + 4);
    });
    ctx.restore();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(
      width * 0.45,
      height * 0.35,
      20,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.62,
    );
    gradient.addColorStop(0, "rgba(56,189,248,.16)");
    gradient.addColorStop(1, "rgba(7,17,31,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const faces = buildFaces(state.t)
      .map((face) => {
        const rp = face.map(rotate);
        const pp = rp.map((p) => project(p, width, height));
        const depth = rp.reduce((sum, p) => sum + p.z, 0) / rp.length;
        const heightValue = face.reduce((sum, p) => sum + p.z, 0) / face.length;
        return { points: pp, depth, heightValue };
      })
      .sort((a, b) => a.depth - b.depth);

    drawAxes(width, height);
    faces.forEach((face) => {
      const light = Math.max(0, Math.min(1, (face.heightValue + 0.75) / 1.5));
      const alpha = 0.32 + light * 0.38;
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      ctx.lineTo(face.points[1].x, face.points[1].y);
      ctx.lineTo(face.points[2].x, face.points[2].y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(50 + light * 80)}, ${Math.round(150 + light * 80)}, 248, ${alpha})`;
      ctx.strokeStyle = "rgba(210, 235, 255, 0.15)";
      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();
    });
  }

  function animate() {
    if (!state.visible) return;
    if (!state.dragging && !prefersReducedMotion) state.ry += 0.0025;
    state.t += prefersReducedMotion ? 0 : 0.004;
    draw();
    state.raf = requestAnimationFrame(animate);
  }

  function start() {
    if (state.visible) return;
    state.visible = true;
    resizeCanvas();
    animate();
  }

  function stop() {
    state.visible = false;
    if (state.raf) cancelAnimationFrame(state.raf);
  }

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.ry += dx * 0.008;
    state.rx += dy * 0.008;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    state.dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.zoom = Math.max(
        0.72,
        Math.min(1.7, state.zoom + (event.deltaY > 0 ? -0.06 : 0.06)),
      );
      draw();
    },
    { passive: false },
  );

  window.addEventListener(
    "resize",
    () => {
      resizeCanvas();
      draw();
    },
    { passive: true },
  );
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
      },
      { threshold: 0.12 },
    );
    observer.observe(canvas);
  } else {
    start();
  }
}

/* This page-scoped module owns its own lifecycle. It is loaded only when
 * <body data-page="labs"> is present, so initialization must happen here
 * after the implementation is defined instead of from an earlier COMMON module. */
setupAlgorithmic3DLab();
