(function () {
  const canvas = document.getElementById("career-merge-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = 900;
  const H = 720;
  const BOX = { x: 70, y: 128, w: 760, h: 520 };
  const FLOOR = BOX.y + BOX.h;
  const LEFT = BOX.x;
  const RIGHT = BOX.x + BOX.w;
  const TOP = BOX.y;
  const STORAGE_KEY = "kaan-career-merge-best";
  const safeCrypto = window.crypto || {};

  const levels = [
    { emoji: "📘", en: "Book", tr: "Kitap", color: "#38bdf8", r: 24 },
    { emoji: "⌨️", en: "Keyboard", tr: "Klavye", color: "#22d3ee", r: 29 },
    { emoji: "🖱️", en: "Mouse", tr: "Mouse", color: "#818cf8", r: 34 },
    { emoji: "🖥️", en: "Monitor", tr: "Monitör", color: "#60a5fa", r: 39 },
    { emoji: "🎨", en: "HTML / CSS", tr: "HTML / CSS", color: "#fb923c", r: 44 },
    { emoji: "JS", en: "JavaScript", tr: "JavaScript", color: "#facc15", r: 49 },
    { emoji: "🐍", en: "Python", tr: "Python", color: "#34d399", r: 54 },
    { emoji: "C#", en: "C# /.NET", tr: "C# /.NET", color: "#a78bfa", r: 59 },
    { emoji: "🗄️", en: "Database", tr: "Veritabanı", color: "#38bdf8", r: 64 },
    { emoji: "⚙️", en: "AI Flow", tr: "AI Flow", color: "#22c55e", r: 69 },
    { emoji: "🚀", en: "Portfolio", tr: "Portfolyo", color: "#f472b6", r: 74 },
    { emoji: "🤝", en: "Interview", tr: "Mülakat", color: "#f59e0b", r: 80 },
    { emoji: "💼", en: "Job Offer", tr: "Job Offer", color: "#34d399", r: 88 }
  ];

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

  const state = {
    items: [],
    dropX: W / 2,
    nextLevel: 0,
    score: 0,
    best: Number(localStorage.getItem(STORAGE_KEY) || 0),
    highest: 0,
    merges: 0,
    drops: 0,
    cooldown: 0,
    won: false,
    lost: false,
    message: ""
  };

  function lang() { return (document.documentElement.lang || "en") === "tr" ? "tr" : "en"; }
  function t(key) { return copy[lang()][key] || copy.en[key] || key; }

  function applyText() {
    document.querySelectorAll("[data-adventure-text]").forEach((node) => {
      const key = node.getAttribute("data-adventure-text");
      if (key && t(key)) node.textContent = t(key);
    });
    renderLadder();
    updateHud();
  }

  function renderLadder() {
    const holder = document.querySelector("[data-merge-ladder]");
    if (!holder) return;
    holder.innerHTML = levels.map((level, index) => `
      <article class="${index <= state.highest ? "is-unlocked" : ""}">
        <span>${level.emoji}</span>
        <div><strong>${level[lang()]}</strong><small>${String(index + 1).padStart(2, "0")}</small></div>
      </article>
    `).join("");
  }

  function updateHud() {
    document.querySelector("[data-adventure-score]").textContent = String(state.score);
    document.querySelector("[data-adventure-best]").textContent = String(state.best);
    document.querySelector("[data-adventure-next]").textContent = levels[state.nextLevel]?.emoji || "📘";
  }

  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const width = Math.min(wrapper.clientWidth, 980);
    const isMobile = viewport <= 640;
    const isTablet = viewport > 640 && viewport <= 1100;
    const heightRatio = isMobile ? 1.08 : (isTablet ? 0.86 : 0.8);
    const minHeight = isMobile ? 430 : 520;
    const height = Math.max(minHeight, Math.min(720, width * heightRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function toCanvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    return Math.max(LEFT + 36, Math.min(RIGHT - 36, x));
  }

  function chooseNextLevel() {
    if (state.drops > 0 && state.drops % 7 === 0) {
      return Math.max(0, Math.min(levels.length - 4, state.highest - 1));
    }
    const max = Math.min(levels.length - 4, Math.max(2, state.highest + Math.floor(state.merges / 8)));
    const roll = Math.random();
    if (roll < 0.54) return Math.floor(Math.random() * Math.min(3, max + 1));
    if (roll < 0.86) return Math.floor(Math.random() * (max + 1));
    return Math.max(0, max);
  }

  function createItem(level, x, y) {
    const data = levels[level];
    return {
      id: safeCrypto.randomUUID ? safeCrypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      level, x, y,
      vx: (Math.random() - 0.5) * 1.4,
      vy: 0,
      r: data.r,
      settled: 0,
      mergeLock: 0
    };
  }

  function dropItem() {
    if (state.won || state.lost) return;
    if (state.cooldown > 0) { state.message = t("dropLocked"); return; }
    state.items.push(createItem(state.nextLevel, state.dropX, TOP - 62));
    state.drops += 1;
    state.nextLevel = chooseNextLevel();
    state.cooldown = 18;
    state.message = "";
    updateHud();
  }

  function mergeItems(a, b) {
    const newLevel = Math.min(levels.length - 1, a.level + 1);
    const merged = createItem(newLevel, (a.x + b.x) / 2, (a.y + b.y) / 2);
    merged.vy = -4;
    merged.vx = (a.vx + b.vx) * 0.4;
    merged.mergeLock = 10;
    state.items = state.items.filter((item) => item !== a && item !== b);
    state.items.push(merged);
    state.highest = Math.max(state.highest, newLevel);
    state.merges += 1;
    state.score += (newLevel + 1) * (newLevel + 1) * 45;
    state.best = Math.max(state.best, state.score);
    localStorage.setItem(STORAGE_KEY, String(state.best));
    if (newLevel >= levels.length - 1) winGame();
    renderLadder();
    updateHud();
  }

  function mergeThreshold(a, b) {
    return a.r + b.r + Math.max(8, (a.r + b.r) * 0.08);
  }

  function canMergePair(a, b) {
    if (!a || !b) return false;
    if (a.level !== b.level) return false;
    if (a.level >= levels.length - 1) return false;
    if (a.mergeLock > 0 || b.mergeLock > 0) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    return distance <= mergeThreshold(a, b);
  }

  function findMergeCandidate() {
    let bestPair = null;
    let bestScore = -Infinity;

    for (let i = 0; i < state.items.length; i++) {
      for (let j = i + 1; j < state.items.length; j++) {
        const a = state.items[i];
        const b = state.items[j];
        if (!canMergePair(a, b)) continue;

        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const relativeMotion = Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy);
        const score = a.level * 1000 - distance - relativeMotion * 8;
        if (score > bestScore) {
          bestScore = score;
          bestPair = [a, b];
        }
      }
    }

    return bestPair;
  }

  function mergeTouchingItems() {
    const pair = findMergeCandidate();
    if (!pair) return false;
    mergeItems(pair[0], pair[1]);
    return true;
  }

  function winGame() {
    state.won = true;
    const overlay = document.querySelector("[data-adventure-win]");
    if (overlay) overlay.hidden = false;
  }

  function resetGame() {
    state.items = [];
    state.dropX = W / 2;
    state.nextLevel = 0;
    state.score = 0;
    state.highest = 0;
    state.merges = 0;
    state.drops = 0;
    state.cooldown = 0;
    state.won = false;
    state.lost = false;
    state.message = "";
    const overlay = document.querySelector("[data-adventure-win]");
    if (overlay) overlay.hidden = true;
    renderLadder();
    updateHud();
  }

  function stepPhysics() {
    if (state.won || state.lost) return;
    if (state.cooldown > 0) state.cooldown -= 1;
    for (const item of state.items) {
      if (item.mergeLock > 0) item.mergeLock -= 1;
      item.vy += 0.32;
      item.vx *= 0.996;
      item.x += item.vx;
      item.y += item.vy;
      if (item.x - item.r < LEFT) { item.x = LEFT + item.r; item.vx *= -0.56; }
      if (item.x + item.r > RIGHT) { item.x = RIGHT - item.r; item.vx *= -0.56; }
      if (item.y + item.r > FLOOR) { item.y = FLOOR - item.r; item.vy *= -0.44; item.vx *= 0.965; }
      if (item.y - item.r < TOP - 92 && Math.abs(item.vy) < 0.4) item.settled += 1;
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < state.items.length; i++) {
        for (let j = i + 1; j < state.items.length; j++) {
          const a = state.items[i];
          const b = state.items[j];
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minDist = a.r + b.r;
          if (dist < minDist) {
            if (canMergePair(a, b)) {
              mergeItems(a, b);
              return;
            }
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            const push = 0.028;
            a.vx -= nx * push; a.vy -= ny * push;
            b.vx += nx * push; b.vy += ny * push;
          }
        }
      }
    }
    if (mergeTouchingItems()) return;

    const overloaded = state.items.some((item) => item.y - item.r < TOP - 48 && item.settled > 90);
    if (overloaded) {
      state.lost = true;
      state.message = t("gameOver");
      setTimeout(resetGame, 1600);
    }
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawItem(item) {
    const data = levels[item.level];
    const gradient = ctx.createRadialGradient(item.x - item.r * 0.3, item.y - item.r * 0.38, item.r * 0.15, item.x, item.y, item.r);
    gradient.addColorStop(0, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.36, data.color);
    gradient.addColorStop(1, "rgba(7,17,31,0.95)");
    ctx.save();
    ctx.shadowColor = data.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.stroke();
    ctx.fillStyle = item.level >= 5 && item.level !== 6 ? "#07111f" : "#f8fbff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const isText = data.emoji.length <= 2 && /[A-Z#]/.test(data.emoji);
    ctx.font = isText ? `900 ${Math.max(18, item.r * 0.48)}px Inter, system-ui` : `${Math.max(24, item.r * 0.62)}px serif`;
    ctx.fillText(data.emoji, item.x, item.y - 1);
    if (item.r > 52) {
      ctx.font = `800 ${Math.max(10, item.r * 0.18)}px Inter, system-ui`;
      ctx.fillStyle = "rgba(248,251,255,0.92)";
      ctx.fillText(data[lang()], item.x, item.y + item.r * 0.52);
    }
    ctx.restore();
  }

  function drawKaan() {
    const x = state.dropX;
    const y = 56;
    ctx.save();
    ctx.fillStyle = "rgba(56,189,248,0.12)";
    roundRect(ctx, x - 72, y - 38, 144, 76, 28);
    ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,0.32)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 36, y, 25, 0, Math.PI * 2);
    ctx.fillStyle = "#0f2a44";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "900 16px Inter, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("KB", x - 36, y);
    ctx.textAlign = "left";
    ctx.fillStyle = "#f8fbff";
    ctx.font = "900 16px Inter, system-ui";
    ctx.fillText("Kaan", x - 5, y - 8);
    ctx.fillStyle = "#a8b7ca";
    ctx.font = "700 11px Inter, system-ui";
    ctx.fillText("drop", x - 5, y + 12);
    ctx.strokeStyle = "rgba(56,189,248,0.8)";
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(x, y + 45);
    ctx.lineTo(x, TOP - 24);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const sx = canvas.width / W;
    const sy = canvas.height / H;
    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#07111f");
    bg.addColorStop(0.55, "#0d1b2f");
    bg.addColorStop(1, "#102846");
    ctx.fillStyle = bg;
    roundRect(ctx, 16, 16, W - 32, H - 32, 34);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let x = 40; x < W; x += 70) ctx.fillRect(x, 24, 1, H - 48);
    for (let y = 48; y < H; y += 70) ctx.fillRect(24, y, W - 48, 1);
    ctx.fillStyle = "rgba(12,25,43,0.76)";
    roundRect(ctx, BOX.x, BOX.y, BOX.w, BOX.h, 28);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(56,189,248,0.28)";
    ctx.stroke();
    ctx.fillStyle = "rgba(52,211,153,0.92)";
    roundRect(ctx, BOX.x + 16, FLOOR - 18, BOX.w - 32, 18, 9);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(168,183,202,0.75)";
    ctx.font = "800 13px Inter, system-ui";
    ctx.fillText("CAREER MERGE", BOX.x + 20, BOX.y + 18);
    drawKaan();
    state.items.sort((a, b) => a.r - b.r).forEach(drawItem);
    if (state.message) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(248,251,255,0.95)";
      ctx.font = "900 26px Inter, system-ui";
      ctx.fillText(state.message, W / 2, H / 2);
    }
    ctx.restore();
  }

  function loop() {
    stepPhysics();
    draw();
    requestAnimationFrame(loop);
  }

  let activeTouchPointer = null;

  canvas.addEventListener("pointermove", (event) => {
    state.dropX = toCanvasX(event.clientX);
  });

  canvas.addEventListener("pointerdown", (event) => {
    state.dropX = toCanvasX(event.clientX);
    if (event.pointerType === "touch") {
      event.preventDefault();
      activeTouchPointer = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    dropItem();
  });

  canvas.addEventListener("pointerup", (event) => {
    state.dropX = toCanvasX(event.clientX);
    if (event.pointerType === "touch" && activeTouchPointer === event.pointerId) {
      event.preventDefault();
      activeTouchPointer = null;
      canvas.releasePointerCapture?.(event.pointerId);
      dropItem();
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (activeTouchPointer === event.pointerId) activeTouchPointer = null;
  });

  document.querySelector("[data-adventure-drop]")?.addEventListener("click", dropItem);
  document.querySelectorAll("[data-adventure-restart]").forEach((button) => button.addEventListener("click", resetGame));
  window.addEventListener("keydown", (event) => {
    if (!document.body.contains(canvas)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.dropX = Math.max(LEFT + 36, state.dropX - 24);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.dropX = Math.min(RIGHT - 36, state.dropX + 24);
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); dropItem(); }
  });
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.querySelectorAll("[data-lang-switch]").forEach((button) => button.addEventListener("click", () => setTimeout(applyText, 30)));
  resizeCanvas();
  resetGame();
  applyText();
  loop();
})();
