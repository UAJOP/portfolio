/**
 * Performance pass, easter egg and the algorithmic 3D lab.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 4184-4659.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
(function setupPortfolioOptimizationPass() {
  document.querySelectorAll("img").forEach((img) => {
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    if (
      !img.hasAttribute("loading") &&
      !img.closest(".hero") &&
      img.getAttribute("fetchpriority") !== "high"
    )
      img.setAttribute("loading", "lazy");
    if (!img.hasAttribute("fetchpriority") && img.closest(".hero"))
      img.setAttribute("fetchpriority", "high");
  });
})();

function getCreativeText() {
  const tr = getCurrentLocale() === "tr";
  return tr
    ? {
        surprise: "Sürpriz",
        title: "Tebrikler maceracı!",
        body: "Bu kadar gezdiğine göre portfolyonun gizli köşesini de hak ettin. Kod, tasarım ve biraz kaos: hepsi burada.",
        close: "Devam edelim",
        hint: "Gizli sürprizi başlat",
      }
    : {
        surprise: "Surprise",
        title: "Congrats, explorer!",
        body: "You explored deep enough to unlock the hidden corner of this portfolio. Code, design and a little chaos: all in one place.",
        close: "Keep exploring",
        hint: "Launch hidden surprise",
      };
}

function setupEasterEgg() {
  if (document.querySelector("[data-easter-trigger]")) return;
  const text = getCreativeText();
  const trigger = document.createElement("button");
  trigger.className = "easter-trigger";
  trigger.type = "button";
  trigger.setAttribute("data-easter-trigger", "");
  trigger.setAttribute("aria-label", text.hint);
  trigger.setAttribute("title", text.hint);
  trigger.innerHTML = '<i class="bx bxs-party"></i>';
  document.body.appendChild(trigger);
  trigger.addEventListener("click", launchEasterEgg);

  let logoClicks = 0;
  document.querySelectorAll(".brand img, .footer-brand img").forEach((logo) => {
    logo.addEventListener("click", () => {
      logoClicks += 1;
      clearTimeout(logo.__easterTimer);
      logo.__easterTimer = setTimeout(() => {
        logoClicks = 0;
      }, 1200);
      if (logoClicks >= 3) {
        logoClicks = 0;
        launchEasterEgg();
      }
    });
  });
}

function launchEasterEgg() {
  const text = getCreativeText();
  let layer = document.querySelector("[data-easter-layer]");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "easter-layer";
    layer.setAttribute("data-easter-layer", "");
    layer.innerHTML =
      '<canvas></canvas><div class="easter-message" data-easter-message><h2></h2><p></p><button class="btn primary easter-close" type="button"></button></div>';
    document.body.appendChild(layer);
    layer
      .querySelector(".easter-close")
      ?.addEventListener("click", () => closeEasterEgg(layer));
  }

  const canvas = layer.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const message = layer.querySelector("[data-easter-message]");
  message.querySelector("h2").textContent = text.title;
  message.querySelector("p").textContent = text.body;
  message.querySelector("button").textContent = text.close;
  layer.classList.add("is-active");
  requestAnimationFrame(() => message.classList.add("is-visible"));
  document.body.classList.remove("site-shake");
  void document.body.offsetWidth;
  document.body.classList.add("site-shake");

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const particles = [];
  const colors = [
    "#38bdf8",
    "#22d3ee",
    "#818cf8",
    "#34d399",
    "#fbbf24",
    "#fb7185",
    "#ffffff",
  ];
  const burst = (x, y, amount = 86) => {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 70 + Math.random() * 45,
        age: 0,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  };

  const positions = [0.18, 0.38, 0.62, 0.82];
  positions.forEach((pos, index) =>
    setTimeout(
      () =>
        burst(
          window.innerWidth * pos,
          window.innerHeight * (0.24 + Math.random() * 0.42),
          74,
        ),
      index * 220,
    ),
  );
  const interval = setInterval(
    () =>
      burst(
        80 + Math.random() * (window.innerWidth - 160),
        90 + Math.random() * (window.innerHeight * 0.5),
        54,
      ),
    420,
  );
  setTimeout(() => clearInterval(interval), 2200);

  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += 1;
      p.vy += 0.045;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      if (p.age >= p.life) particles.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (now - start < 5200 || particles.length) requestAnimationFrame(frame);
    else closeEasterEgg(layer);
  }
  requestAnimationFrame(frame);
  setTimeout(() => document.body.classList.remove("site-shake"), 900);
}

function closeEasterEgg(layer = document.querySelector("[data-easter-layer]")) {
  if (!layer) return;
  layer.querySelector("[data-easter-message]")?.classList.remove("is-visible");
  setTimeout(() => layer.classList.remove("is-active"), 220);
}


function extendCreativeCommands() {
  if (typeof ultimateContent === "undefined") return;
  const hasCommand = (lang, id) =>
    ultimateContent[lang]?.commands?.some((command) => command.id === id);
  if (!hasCommand("en", "mathlab"))
    ultimateContent.en.commands.push({
      id: "mathlab",
      label: "Open 3D Math Lab",
      hint: "Interactive canvas model",
      keywords: "3d math canvas model rotate",
      type: "nav",
      value: "labs.html#algorithmic-3d-lab",
    });
  if (!hasCommand("en", "easter"))
    ultimateContent.en.commands.push({
      id: "easter",
      label: "Launch Easter Egg",
      hint: "Fireworks surprise",
      keywords: "easter egg fireworks surprise",
      type: "easter",
    });
  if (!hasCommand("tr", "mathlab"))
    ultimateContent.tr.commands.push({
      id: "mathlab",
      label: "3D Matematik Labını Aç",
      hint: "İnteraktif canvas modeli",
      keywords: "3d matematik canvas model döndür",
      type: "nav",
      value: "labs.html#algorithmic-3d-lab",
    });
  if (!hasCommand("tr", "easter"))
    ultimateContent.tr.commands.push({
      id: "easter",
      label: "Easter Egg Başlat",
      hint: "Havai fişek sürprizi",
      keywords: "easter egg havai fişek sürpriz",
      type: "easter",
    });
}

extendCreativeCommands();
setupEasterEgg();
/* Lives in js/pages/labs.js, loaded only on labs.html. */
if (typeof setupAlgorithmic3DLab === "function") setupAlgorithmic3DLab();

/* Project request page and service inquiry flow */
