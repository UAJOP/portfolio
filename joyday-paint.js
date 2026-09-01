(function () {
  const canvas = document.getElementById("joyday-art-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frame = document.querySelector("[data-joyday-frame]");
  const infoBanner = document.querySelector("[data-joyday-info-banner]");
  const infoTitle = document.querySelector("[data-joyday-info-title]");
  const infoText = document.querySelector("[data-joyday-info-text]");
  const infoClose = document.querySelector("[data-joyday-info-close]");
  const canvasLabel = document.querySelector("[data-joyday-current-canvas]");
  const toolLabel = document.querySelector("[data-joyday-current-tool]");
  const colorGrid = document.querySelector("[data-joyday-colors]");
  const customColor = document.querySelector("[data-joyday-custom-color]");
  const undoButton = document.querySelector("[data-joyday-undo]");
  const redoButton = document.querySelector("[data-joyday-redo]");
  const remixButton = document.querySelector("[data-joyday-remix]");
  const clearButton = document.querySelector("[data-joyday-clear]");
  const finishButton = document.querySelector("[data-joyday-finish]");
  const downloadButton = document.querySelector("[data-joyday-download]");
  const thicknessInput = document.querySelector("[data-joyday-thickness]");
  const thicknessTitle = document.querySelector("[data-joyday-thickness-title]");
  const thicknessValue = document.querySelector("[data-joyday-thickness-value]");
  const thicknessMin = document.querySelector("[data-joyday-thickness-min]");
  const thicknessMax = document.querySelector("[data-joyday-thickness-max]");
  const intensityInput = document.querySelector("[data-joyday-intensity]");
  const intensityTitle = document.querySelector("[data-joyday-intensity-title]");
  const intensityValue = document.querySelector("[data-joyday-intensity-value]");
  const intensityMin = document.querySelector("[data-joyday-intensity-min]");
  const intensityMax = document.querySelector("[data-joyday-intensity-max]");
  const paletteName = document.querySelector("[data-joyday-palette-name]");
  const suggestPaletteButton = document.querySelector("[data-joyday-suggest-palette]");
  const newThemeButton = document.querySelector("[data-joyday-new-theme]");
  const starterButton = document.querySelector("[data-joyday-starter]");
  const themeTitle = document.querySelector("[data-joyday-theme-title]");
  const themeText = document.querySelector("[data-joyday-theme-text]");
  const missionTitle = document.querySelector("[data-joyday-mission-title]");
  const missionText = document.querySelector("[data-joyday-mission-text]");
  const missionProgress = document.querySelector("[data-joyday-mission-progress]");
  const missionStatus = document.querySelector("[data-joyday-mission-status]");
  const soundToggle = document.querySelector("[data-joyday-sound-toggle]");
  const soundLabel = document.querySelector("[data-joyday-sound-label]");
  const modal = document.querySelector("[data-joyday-modal]");
  const modalClose = document.querySelector("[data-joyday-modal-close]");
  const modalNew = document.querySelector("[data-joyday-modal-new]");
  const previewImg = document.querySelector("[data-joyday-preview-img]");
  const artNameInput = document.querySelector("[data-joyday-art-name]");
  const signatureInput = document.querySelector("[data-joyday-signature]");
  const exportButtons = document.querySelectorAll("[data-joyday-export-mode]");
  if (modal) modal.inert = true;

  const palettePool = [
    { key: "joydayBright", colors: ["#ffffff", "#101827", "#ff3b6b", "#ff7a1a", "#ffd23f", "#20c997", "#22d3ee", "#2563eb", "#8b5cf6", "#ec4899", "#9b5c2e", "#f5efe6"] },
    { key: "neonParty", colors: ["#0f172a", "#ffffff", "#ff007f", "#00f5d4", "#fee440", "#7c3aed", "#00bbf9", "#f15bb5", "#22c55e", "#ff6b35", "#f8fafc", "#111827"] },
    { key: "softPastel", colors: ["#fffaf1", "#f8c8dc", "#b8e0d2", "#cdb4db", "#ffd6a5", "#fdffb6", "#a0c4ff", "#ffc6ff", "#d0f4de", "#f1f5f9", "#64748b", "#0f172a"] },
    { key: "warmEnergy", colors: ["#fff7ed", "#431407", "#ef4444", "#f97316", "#f59e0b", "#fde047", "#fb7185", "#be123c", "#a16207", "#fed7aa", "#7f1d1d", "#ffffff"] },
    { key: "oceanFlow", colors: ["#ecfeff", "#082f49", "#0ea5e9", "#22d3ee", "#14b8a6", "#2dd4bf", "#38bdf8", "#1d4ed8", "#a7f3d0", "#e0f2fe", "#475569", "#ffffff"] }
  ];

  const themes = {
    en: [
      ["Freedom", "Paint like the canvas is moving with you."],
      ["Summer Energy", "Use warm and bright colors like a sunny Joyday session."],
      ["Happy Chaos", "Let different tools collide without overthinking the result."],
      ["Dream Wall", "Build a soft, layered composition with mist and brush marks."],
      ["City Pulse", "Create movement with straight lines, sharp colors and bold splashes."],
      ["Childhood Joy", "Go playful: use unexpected colors and big balloon bursts."]
    ],
    tr: [
      ["Özgürlük", "Tuval seninle hareket ediyormuş gibi boya."],
      ["Yaz Enerjisi", "Güneşli bir Joyday seansı gibi sıcak ve parlak renkler kullan."],
      ["Mutlu Kaos", "Sonucu fazla düşünmeden ekipmanları çarpıştır."],
      ["Rüya Duvarı", "Fısfıs ve fırça izleriyle yumuşak, katmanlı bir kompozisyon kur."],
      ["Şehir Nabzı", "Düz çizgiler, keskin renkler ve güçlü lekelerle hareket yarat."],
      ["Çocukluk Neşesi", "Beklenmedik renkler ve büyük su balonu patlamalarıyla oyna."]
    ]
  };

  const missions = {
    en: [
      { key: "colors", target: 3, title: "Use 3 colors", text: "Try three different colors before finishing." },
      { key: "tools", target: 3, title: "Use 3 tools", text: "Switch between equipment and make the canvas feel alive." },
      { key: "actions", target: 8, title: "Create 8 marks", text: "Add at least eight paint actions to build momentum." },
      { key: "remix", target: 1, title: "Try Remix", text: "Use the remix button once to create a digital paint-flow effect." }
    ],
    tr: [
      { key: "colors", target: 3, title: "3 renk kullan", text: "Bitirmeden önce üç farklı renk dene." },
      { key: "tools", target: 3, title: "3 ekipman kullan", text: "Ekipmanlar arasında geçiş yap ve tuvali canlı hissettir." },
      { key: "actions", target: 8, title: "8 iz oluştur", text: "Ritmi yakalamak için en az sekiz boya hamlesi ekle." },
      { key: "remix", target: 1, title: "Remix dene", text: "Dijital boya akışı efekti için remix butonunu bir kez kullan." }
    ]
  };

  const copy = {
    en: {
      canvas: { square: "50x50 Square Canvas", circle: "52 cm Circle Canvas", rect: "40x60 Rectangle Canvas" },
      canvasButtons: { square: ["50x50 Square", "Classic Joyday canvas"], circle: ["52 cm Circle", "Round composition"], rect: ["40x60 Rectangle", "Vertical poster feel"] },
      tool: { bottle: "Throw Bottle", spray: "Spray", brush: "Brush", balloon: "Water Balloon" },
      toolSub: { bottle: "One-shot paint throw", spray: "Soft mist", brush: "Drag strokes", balloon: "Large burst" },
      infoTitle: "Quick tip",
      infoText: "Choose your canvas, then use the toolbelt below. For the bottle, press and release to throw one clean paint line onto the canvas. You can close this tip anytime.",
      thicknessTitle: "Stroke thickness",
      thicknessMin: "Thin",
      thicknessMax: "Thick",
      thicknessLevels: ["Thin", "Medium", "Thick"],
      intensityTitle: "Paint intensity",
      intensityMin: "Soft",
      intensityMax: "Dense",
      intensityLevels: ["Soft", "Normal", "Dense"],
      filename: "joyday-action-painting",
      paletteNames: { joydayBright: "Joyday Bright", neonParty: "Neon Party", softPastel: "Soft Pastel", warmEnergy: "Warm Energy", oceanFlow: "Ocean Flow" },
      static: {
        customColor: "Custom color", suggestPalette: "Suggest palette", inspirationEyebrow: "Creative prompt", newTheme: "New theme", starterStains: "Starter stains",
        missionEyebrow: "Mini mission", soundEyebrow: "Studio sound", finishEyebrow: "Artwork ready", finishTitle: "Your Joyday canvas is ready.",
        finishText: "Name your artwork, choose an export style and download it as PNG.", artName: "Artwork name", signature: "Add Joyday signature",
        cleanExport: "Clean canvas", brandedExport: "Joyday card", downloadPng: "Download PNG", realCanvasCta: "Make it on a real canvas", newArtwork: "New artwork"
      },
      actions: { undo: "Undo", redo: "Redo", remix: "Remix", clear: "Clear", finish: "Finish Artwork" },
      soundOn: "Sound On", soundOff: "Sound Off", completed: "Completed!", missionNext: "Next mission unlocked"
    },
    tr: {
      canvas: { square: "50x50 Kare Tuval", circle: "52 cm Daire Tuval", rect: "40x60 Dikdörtgen Tuval" },
      canvasButtons: { square: ["50x50 Kare", "Klasik Joyday tuvali"], circle: ["52 cm Daire", "Yuvarlak kompozisyon"], rect: ["40x60 Dikdörtgen", "Dikey poster hissi"] },
      tool: { bottle: "Fırlatma Şişesi", spray: "Fısfıs", brush: "Fırça", balloon: "Su Balonu" },
      toolSub: { bottle: "Tek hamle boya atışı", spray: "Yumuşak püskürtme", brush: "Sürükleyerek boya", balloon: "Büyük patlama" },
      infoTitle: "Kısa ipucu",
      infoText: "Tuvalini seçtikten sonra alttaki ekipman barını kullan. Şişede basıp bırakarak tuvale tek hamlede temiz bir boya çizgisi fırlat. Bu bilgiyi istediğin zaman kapatabilirsin.",
      thicknessTitle: "İncelik ayarı",
      thicknessMin: "İnce",
      thicknessMax: "Kalın",
      thicknessLevels: ["İnce", "Orta", "Kalın"],
      intensityTitle: "Boya yoğunluğu",
      intensityMin: "Hafif",
      intensityMax: "Yoğun",
      intensityLevels: ["Hafif", "Normal", "Yoğun"],
      filename: "joyday-action-painting",
      paletteNames: { joydayBright: "Joyday Parlak", neonParty: "Neon Parti", softPastel: "Soft Pastel", warmEnergy: "Sıcak Enerji", oceanFlow: "Okyanus Akışı" },
      static: {
        customColor: "Özel renk", suggestPalette: "Palet öner", inspirationEyebrow: "Yaratıcı görev", newTheme: "Yeni tema", starterStains: "Başlangıç lekesi",
        missionEyebrow: "Mini görev", soundEyebrow: "Stüdyo sesi", finishEyebrow: "Eser hazır", finishTitle: "Joyday tuvalin hazır.",
        finishText: "Eserine isim ver, çıktı stilini seç ve PNG olarak indir.", artName: "Eser adı", signature: "Joyday imzası ekle",
        cleanExport: "Temiz tuval", brandedExport: "Joyday kartı", downloadPng: "PNG indir", realCanvasCta: "Gerçek tuvalde yap", newArtwork: "Yeni eser"
      },
      actions: { undo: "Geri al", redo: "İleri al", remix: "Remix", clear: "Temizle", finish: "Eseri bitir" },
      soundOn: "Ses Açık", soundOff: "Ses Kapalı", completed: "Tamamlandı!", missionNext: "Yeni görev açıldı"
    }
  };

  const state = {
    canvasType: "square",
    tool: "bottle",
    color: "#22d3ee",
    activePaletteIndex: 0,
    isPainting: false,
    lastPoint: null,
    bottleStartPoint: null,
    thickness: 50,
    intensity: 60,
    dirty: false,
    infoDismissed: false,
    history: [],
    historyIndex: -1,
    colorsUsed: new Set(),
    toolsUsed: new Set(),
    actionCount: 0,
    remixCount: 0,
    missionIndex: 0,
    missionLocked: false,
    sound: false,
    audio: null,
    exportMode: "clean"
  };

  function lang() { return typeof getCurrentLocale === "function" ? getCurrentLocale() : (document.documentElement.lang || "en"); }
  /* The shipped locale pack supplies any language beyond the inline EN/TR pair,
   * so adding a locale never edits this file. */
  function t() {
    return (typeof getLocalizedCollection === "function"
      ? getLocalizedCollection(copy, lang(), "joydayPaint")
      : copy[lang()]) || copy.en;
  }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function thicknessRatio() { return clamp(Number(state.thickness) || 50, 1, 100) / 100; }
  function intensityRatio() { return clamp(Number(state.intensity) || 60, 15, 100) / 100; }
  function scaled(min, max) { return min + (max - min) * thicknessRatio(); }
  function intensityScaled(min, max) { return min + (max - min) * intensityRatio(); }

  function thicknessLabel() {
    const levels = t().thicknessLevels;
    if (state.thickness <= 34) return levels[0];
    if (state.thickness <= 67) return levels[1];
    return levels[2];
  }

  function intensityLabel() {
    const levels = t().intensityLevels;
    if (state.intensity <= 42) return levels[0];
    if (state.intensity <= 74) return levels[1];
    return levels[2];
  }

  function withIntensityAlpha(alpha) {
    return clamp(alpha * (0.68 + intensityRatio() * 0.58), 0.08, 0.98);
  }

  function withClip(draw, targetCtx = ctx, w = canvas.width, h = canvas.height) {
    targetCtx.save();
    targetCtx.beginPath();
    if (state.canvasType === "circle") {
      const radius = Math.min(w, h) / 2 - 5;
      targetCtx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    } else {
      targetCtx.rect(0, 0, w, h);
    }
    targetCtx.clip();
    draw();
    targetCtx.restore();
  }

  function withinShape(point) {
    if (!point) return false;
    if (state.canvasType !== "circle") return point.x >= 0 && point.y >= 0 && point.x <= canvas.width && point.y <= canvas.height;
    const dx = point.x - canvas.width / 2;
    const dy = point.y - canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 5;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  }

  function clearDrawingSurface() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    withClip(() => {
      ctx.fillStyle = "#fffaf1";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
  }

  function setCanvasSize(type) {
    const sizes = { square: [900, 900], circle: [900, 900], rect: [720, 1080] };
    const [w, h] = sizes[type] || sizes.square;
    canvas.width = w;
    canvas.height = h;
    frame.classList.remove("is-square", "is-circle", "is-rect");
    frame.classList.add(`is-${type}`);
    resetArtworkState();
    clearDrawingSurface();
    saveSnapshot();
    updateHud();
  }

  function resetArtworkState() {
    state.dirty = false;
    state.history = [];
    state.historyIndex = -1;
    state.colorsUsed = new Set();
    state.toolsUsed = new Set();
    state.actionCount = 0;
    state.remixCount = 0;
    state.missionIndex = 0;
    state.missionLocked = false;
  }

  function saveSnapshot() {
    try {
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(snapshot);
      if (state.history.length > 32) state.history.shift();
      state.historyIndex = state.history.length - 1;
      updateHistoryButtons();
    } catch (error) {}
  }

  function restoreSnapshot(index) {
    const snapshot = state.history[index];
    if (!snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    state.historyIndex = index;
    state.dirty = index > 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    if (undoButton) undoButton.disabled = state.historyIndex <= 0;
    if (redoButton) redoButton.disabled = state.historyIndex >= state.history.length - 1;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const clientY = event.touches?.[0]?.clientY ?? event.clientY;
    return { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
  }

  function drawDrop(x, y, radius, color, alpha = 0.9) {
    withClip(() => {
      ctx.globalAlpha = withIntensityAlpha(alpha);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawSplash(point, scale = 1) {
    if (!withinShape(point)) return;
    const color = state.color;
    const finalScale = scale * intensityScaled(0.78, 1.2);
    withClip(() => {
      const core = rand(20, 42) * finalScale;
      const gradient = ctx.createRadialGradient(point.x, point.y, 2, point.x, point.y, core * 1.4);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.72, color);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = withIntensityAlpha(0.82);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, core * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    const drops = Math.round(rand(18, 34) * finalScale);
    for (let i = 0; i < drops; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(22, 150) * finalScale;
      drawDrop(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, rand(3, 14) * finalScale, color, rand(0.52, 0.92));
    }
  }

  function normalizeBottleThrow(from, to) {
    if (!from) return null;
    let start = { x: from.x, y: from.y };
    let end = to ? { x: to.x, y: to.y } : null;
    let dx = end ? end.x - start.x : 0;
    let dy = end ? end.y - start.y : 0;
    let length = Math.sqrt(dx * dx + dy * dy);
    if (!end || length < 22) {
      const angle = rand(-0.34, 0.34) + (Math.random() > 0.5 ? 0 : Math.PI);
      length = Math.min(canvas.width, canvas.height) * rand(0.34, 0.48);
      start = { x: from.x - Math.cos(angle) * length * 0.5, y: from.y - Math.sin(angle) * length * 0.5 };
      end = { x: from.x + Math.cos(angle) * length * 0.5, y: from.y + Math.sin(angle) * length * 0.5 };
      dx = end.x - start.x;
      dy = end.y - start.y;
    }
    return { start, end, dx, dy, length: Math.sqrt(dx * dx + dy * dy) };
  }

  function drawBottleThrow(from, to) {
    const line = normalizeBottleThrow(from, to);
    if (!line) return;
    const { start, end, dx, dy, length } = line;
    if (length < 1) return;
    const nx = -dy / length;
    const ny = dx / length;
    const color = state.color;
    const width = rand(scaled(5, 23), scaled(9, 42));
    withClip(() => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.globalAlpha = withIntensityAlpha(0.9);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalAlpha = withIntensityAlpha(0.48);
      ctx.lineWidth = width * 0.52;
      ctx.beginPath();
      ctx.moveTo(start.x + nx * rand(-2, 2), start.y + ny * rand(-2, 2));
      ctx.lineTo(end.x + nx * rand(-2, 2), end.y + ny * rand(-2, 2));
      ctx.stroke();
      const strands = Math.round(intensityScaled(1, 3));
      for (let i = 0; i < strands; i += 1) {
        const offset = rand(-width * 0.52, width * 0.52);
        ctx.globalAlpha = withIntensityAlpha(rand(0.24, 0.42));
        ctx.lineWidth = rand(2, 5);
        ctx.beginPath();
        ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
        ctx.lineTo(end.x + nx * offset + rand(-4, 4), end.y + ny * offset + rand(-4, 4));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    const dripCount = Math.round(Math.min(12, Math.max(2, length / 100)) * intensityScaled(0.55, 1.15));
    for (let i = 0; i < dripCount; i += 1) {
      const tValue = rand(0.08, 0.96);
      const px = start.x + dx * tValue + nx * rand(-width * 0.7, width * 0.7);
      const py = start.y + dy * tValue + ny * rand(-width * 0.7, width * 0.7);
      drawDrop(px, py, rand(1.6, 5.8), color, rand(0.24, 0.56));
    }
  }

  function drawSpray(point) {
    if (!withinShape(point)) return;
    const count = Math.round(scaled(18, 60) * intensityScaled(0.7, 1.45));
    const spread = scaled(42, 96) * intensityScaled(0.78, 1.12);
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const dist = Math.abs(rand(0, spread) * rand(0.2, 1));
      drawDrop(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, rand(scaled(0.7, 2.2), scaled(2.4, 6.8)), state.color, rand(0.14, 0.44));
    }
  }

  function drawBalloon(point) {
    if (!withinShape(point)) return;
    drawSplash(point, scaled(1.05, 2.25));
    for (let i = 0; i < Math.round(intensityScaled(10, 24)); i += 1) {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(scaled(65, 110), scaled(170, 260));
      drawDrop(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, rand(scaled(4, 9), scaled(14, 26)), state.color, rand(0.42, 0.72));
    }
  }

  function drawBrushLine(from, to) {
    if (!from || !to) return;
    withClip(() => {
      ctx.strokeStyle = state.color;
      ctx.lineWidth = scaled(8, 46);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = withIntensityAlpha(0.68);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      const midX = (from.x + to.x) / 2 + rand(-8, 8);
      const midY = (from.y + to.y) / 2 + rand(-8, 8);
      ctx.quadraticCurveTo(midX, midY, to.x, to.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  function registerPaintAction(tool = state.tool) {
    state.dirty = true;
    state.colorsUsed.add(state.color.toLowerCase());
    state.toolsUsed.add(tool);
    state.actionCount += 1;
    pulseTool(tool);
    playSound(tool);
    updateMission();
  }

  function pulseTool(tool) {
    const button = document.querySelector(`[data-joyday-tool="${tool}"]`);
    if (!button) return;
    button.classList.remove("is-used");
    void button.offsetWidth;
    button.classList.add("is-used");
  }

  function beginPaint(event) {
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!withinShape(point)) return;
    state.isPainting = true;
    state.lastPoint = point;
    frame?.classList.add("is-painting");
    if (state.tool === "bottle") {
      state.bottleStartPoint = point;
    } else if (state.tool === "balloon") {
      drawBalloon(point);
      registerPaintAction("balloon");
      saveSnapshot();
      state.isPainting = false;
      frame?.classList.remove("is-painting");
    } else if (state.tool === "spray") {
      drawSpray(point);
      registerPaintAction("spray");
    } else if (state.tool === "brush") {
      drawDrop(point.x, point.y, scaled(4, 18), state.color, 0.74);
      registerPaintAction("brush");
    }
  }

  function movePaint(event) {
    if (!state.isPainting) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!withinShape(point)) return;
    if (state.tool === "spray") drawSpray(point);
    if (state.tool === "brush") drawBrushLine(state.lastPoint, point);
    state.lastPoint = point;
  }

  function endPaint() {
    if (!state.isPainting) return;
    const lastPoint = state.lastPoint;
    if (state.tool === "bottle" && state.bottleStartPoint) {
      drawBottleThrow(state.bottleStartPoint, lastPoint);
      registerPaintAction("bottle");
    }
    state.isPainting = false;
    frame?.classList.remove("is-painting");
    state.lastPoint = null;
    state.bottleStartPoint = null;
    if (["bottle", "spray", "brush"].includes(state.tool)) saveSnapshot();
  }

  function buildPalette() {
    if (!colorGrid) return;
    const active = palettePool[state.activePaletteIndex] || palettePool[0];
    colorGrid.innerHTML = active.colors.map((color) => `
      <button class="${color.toLowerCase() === state.color.toLowerCase() ? "is-active" : ""}" type="button" data-joyday-color="${color}" style="--swatch:${color}" aria-label="${color}"></button>
    `).join("");
    colorGrid.querySelectorAll("[data-joyday-color]").forEach((button) => {
      button.addEventListener("click", () => setColor(button.dataset.joydayColor, true));
    });
    if (paletteName) paletteName.textContent = t().paletteNames[active.key] || active.key;
  }

  function setColor(color, markActive = false) {
    state.color = color;
    if (customColor) customColor.value = color;
    document.querySelectorAll("[data-joyday-color]").forEach((item) => item.classList.toggle("is-active", markActive && item.dataset.joydayColor.toLowerCase() === color.toLowerCase()));
  }

  function suggestPalette() {
    state.activePaletteIndex = (state.activePaletteIndex + 1) % palettePool.length;
    const active = palettePool[state.activePaletteIndex];
    setColor(active.colors[Math.min(2, active.colors.length - 1)], false);
    buildPalette();
    suggestPaletteButton?.classList.add("is-pulsing");
    window.setTimeout(() => suggestPaletteButton?.classList.remove("is-pulsing"), 360);
  }

  function selectRandomTheme() {
    const list = themes[lang()] || themes.en;
    const selected = list[Math.floor(Math.random() * list.length)];
    if (themeTitle) themeTitle.textContent = selected[0];
    if (themeText) themeText.textContent = selected[1];
  }

  function starterStains() {
    const active = palettePool[state.activePaletteIndex] || palettePool[0];
    const original = state.color;
    for (let i = 0; i < 7; i += 1) {
      state.color = active.colors[Math.floor(rand(2, active.colors.length))] || original;
      const point = { x: rand(canvas.width * 0.15, canvas.width * 0.85), y: rand(canvas.height * 0.14, canvas.height * 0.86) };
      if (Math.random() > 0.46) drawSplash(point, rand(0.45, 0.9));
      else drawSpray(point);
    }
    state.color = original;
    registerPaintAction("starter");
    saveSnapshot();
  }

  function remixFlow() {
    const temp = document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tempCtx = temp.getContext("2d");
    tempCtx.drawImage(canvas, 0, 0);
    clearDrawingSurface();
    withClip(() => {
      ctx.globalAlpha = 0.58;
      ctx.filter = "blur(2px) saturate(1.08)";
      const offsets = [[0, 0], [12, -8], [-10, 10], [8, 14], [-14, -10]];
      offsets.forEach(([x, y], index) => {
        ctx.globalAlpha = index === 0 ? 0.82 : 0.22;
        ctx.drawImage(temp, x, y);
      });
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    });
    for (let i = 0; i < 10; i += 1) {
      const p1 = { x: rand(canvas.width * 0.1, canvas.width * 0.9), y: rand(canvas.height * 0.1, canvas.height * 0.9) };
      const p2 = { x: p1.x + rand(-90, 90), y: p1.y + rand(-70, 70) };
      drawBrushLine(p1, p2);
    }
    state.remixCount += 1;
    registerPaintAction("remix");
    saveSnapshot();
  }

  function missionValue(mission) {
    if (mission.key === "colors") return state.colorsUsed.size;
    if (mission.key === "tools") return state.toolsUsed.size;
    if (mission.key === "actions") return state.actionCount;
    if (mission.key === "remix") return state.remixCount;
    return 0;
  }

  function updateMission() {
    const list = missions[lang()] || missions.en;
    const mission = list[state.missionIndex % list.length];
    if (!mission) return;
    const value = Math.min(missionValue(mission), mission.target);
    if (missionTitle) missionTitle.textContent = mission.title;
    if (missionText) missionText.textContent = mission.text;
    if (missionProgress) missionProgress.style.width = `${Math.round((value / mission.target) * 100)}%`;
    if (missionStatus) missionStatus.textContent = value >= mission.target ? t().completed : `${value} / ${mission.target}`;
    if (value >= mission.target && !state.missionLocked) {
      state.missionLocked = true;
      window.setTimeout(() => {
        state.missionIndex = (state.missionIndex + 1) % list.length;
        state.missionLocked = false;
        updateMission();
      }, 1300);
    }
  }

  function makeExportCanvas(mode = state.exportMode) {
    const clean = document.createElement("canvas");
    clean.width = canvas.width;
    clean.height = canvas.height;
    const cleanCtx = clean.getContext("2d");
    cleanCtx.clearRect(0, 0, clean.width, clean.height);
    withClip(() => {
      cleanCtx.fillStyle = "#fffaf1";
      cleanCtx.fillRect(0, 0, clean.width, clean.height);
      cleanCtx.drawImage(canvas, 0, 0);
    }, cleanCtx, clean.width, clean.height);
    if (signatureInput?.checked) addSignature(cleanCtx, clean.width, clean.height, "#0f172a", 0.78);
    if (mode !== "branded") return clean;

    const card = document.createElement("canvas");
    card.width = 1400;
    card.height = 1700;
    const cardCtx = card.getContext("2d");
    const grad = cardCtx.createLinearGradient(0, 0, card.width, card.height);
    grad.addColorStop(0, "#07111f");
    grad.addColorStop(0.45, "#12345a");
    grad.addColorStop(1, "#f15bb5");
    cardCtx.fillStyle = grad;
    cardCtx.fillRect(0, 0, card.width, card.height);
    for (let i = 0; i < 32; i += 1) {
      cardCtx.globalAlpha = rand(0.08, 0.18);
      cardCtx.fillStyle = palettePool[state.activePaletteIndex].colors[Math.floor(rand(2, palettePool[state.activePaletteIndex].colors.length))] || "#22d3ee";
      cardCtx.beginPath();
      cardCtx.arc(rand(0, card.width), rand(0, card.height), rand(16, 74), 0, Math.PI * 2);
      cardCtx.fill();
    }
    cardCtx.globalAlpha = 1;
    const maxW = 1080;
    const maxH = 1120;
    const ratio = Math.min(maxW / clean.width, maxH / clean.height);
    const drawW = clean.width * ratio;
    const drawH = clean.height * ratio;
    const x = (card.width - drawW) / 2;
    const y = 210;
    roundRect(cardCtx, x - 26, y - 26, drawW + 52, drawH + 52, 46);
    cardCtx.fillStyle = "rgba(255,255,255,0.88)";
    cardCtx.fill();
    cardCtx.shadowColor = "rgba(0,0,0,0.28)";
    cardCtx.shadowBlur = 38;
    cardCtx.shadowOffsetY = 18;
    cardCtx.drawImage(clean, x, y, drawW, drawH);
    cardCtx.shadowColor = "transparent";
    cardCtx.fillStyle = "#ffffff";
    cardCtx.font = "900 72px Inter, Arial, sans-serif";
    cardCtx.fillText(safeArtworkName(), 120, 1420);
    cardCtx.font = "800 34px Inter, Arial, sans-serif";
    cardCtx.globalAlpha = 0.86;
    cardCtx.fillText("Created with Joyday Action Painting", 120, 1484);
    cardCtx.fillText(new Date().toLocaleDateString(lang()), 120, 1538);
    cardCtx.textAlign = "right";
    cardCtx.font = "900 48px Inter, Arial, sans-serif";
    cardCtx.fillText("Atölye Joyday", card.width - 120, 1538);
    cardCtx.textAlign = "left";
    cardCtx.globalAlpha = 1;
    return card;
  }

  function roundRect(targetCtx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    targetCtx.beginPath();
    targetCtx.moveTo(x + r, y);
    targetCtx.arcTo(x + width, y, x + width, y + height, r);
    targetCtx.arcTo(x + width, y + height, x, y + height, r);
    targetCtx.arcTo(x, y + height, x, y, r);
    targetCtx.arcTo(x, y, x + width, y, r);
    targetCtx.closePath();
  }

  function addSignature(targetCtx, w, h, color, alpha) {
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.fillStyle = color;
    targetCtx.font = `900 ${Math.max(22, Math.round(Math.min(w, h) * 0.036))}px Inter, Arial, sans-serif`;
    targetCtx.textAlign = "right";
    targetCtx.fillText("Atölye Joyday", w - Math.max(28, w * 0.04), h - Math.max(28, h * 0.04));
    targetCtx.restore();
  }

  function safeArtworkName() {
    const fallback = getI18nText("Joyday Energy", "Joyday Enerjisi", lang());
    return (artNameInput?.value || fallback).trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 42) || fallback;
  }

  function openFinishModal() {
    updatePreview();
    if (!modal) return;
    modal.hidden = false;
    modal.inert = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("joyday-modal-open");
  }

  function closeFinishModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
    document.body.classList.remove("joyday-modal-open");
  }

  function updatePreview() {
    if (!previewImg) return;
    previewImg.src = makeExportCanvas(state.exportMode).toDataURL("image/png");
  }

  function downloadPNG() {
    const exportCanvas = makeExportCanvas(state.exportMode);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    const mode = state.exportMode === "branded" ? "joyday-card" : state.canvasType;
    link.download = `${t().filename}-${slugify(safeArtworkName())}-${mode}-${stamp}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  function slugify(value) {
    return value.toLowerCase().replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "artwork";
  }

  function setupAudio() {
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) state.audio = new AudioContext();
    }
    if (state.audio?.state === "suspended") state.audio.resume();
  }

  function playSound(tool) {
    if (!state.sound || !state.audio) return;
    const now = state.audio.currentTime;
    const gain = state.audio.createGain();
    gain.connect(state.audio.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(tool === "balloon" ? 0.12 : 0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (tool === "spray" ? 0.18 : 0.12));
    const osc = state.audio.createOscillator();
    osc.type = tool === "spray" ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(tool === "balloon" ? 92 : tool === "bottle" ? 176 : tool === "brush" ? 130 : 260, now);
    osc.frequency.exponentialRampToValueAtTime(tool === "balloon" ? 54 : 92, now + 0.12);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  function updateHud() {
    const currentCopy = t();
    if (canvasLabel) canvasLabel.textContent = currentCopy.canvas[state.canvasType];
    if (toolLabel) toolLabel.textContent = currentCopy.tool[state.tool];
    if (infoTitle) infoTitle.textContent = currentCopy.infoTitle;
    if (infoText) infoText.textContent = currentCopy.infoText;
    if (infoBanner) infoBanner.hidden = state.infoDismissed;
    if (thicknessTitle) thicknessTitle.textContent = currentCopy.thicknessTitle;
    if (thicknessValue) thicknessValue.textContent = `${thicknessLabel()} • ${state.thickness}`;
    if (thicknessMin) thicknessMin.textContent = currentCopy.thicknessMin;
    if (thicknessMax) thicknessMax.textContent = currentCopy.thicknessMax;
    if (intensityTitle) intensityTitle.textContent = currentCopy.intensityTitle;
    if (intensityValue) intensityValue.textContent = `${intensityLabel()} • ${state.intensity}`;
    if (intensityMin) intensityMin.textContent = currentCopy.intensityMin;
    if (intensityMax) intensityMax.textContent = currentCopy.intensityMax;
    if (thicknessInput) {
      thicknessInput.value = String(state.thickness);
      thicknessInput.setAttribute("aria-label", currentCopy.thicknessTitle);
    }
    if (intensityInput) {
      intensityInput.value = String(state.intensity);
      intensityInput.setAttribute("aria-label", currentCopy.intensityTitle);
    }
    document.querySelectorAll("[data-joyday-canvas]").forEach((button) => {
      const key = button.dataset.joydayCanvas;
      const values = currentCopy.canvasButtons[key];
      if (values) {
        button.querySelector("strong").textContent = values[0];
        button.querySelector("small").textContent = values[1];
      }
      button.classList.toggle("is-active", key === state.canvasType);
    });
    document.querySelectorAll("[data-joyday-tool]").forEach((button) => {
      const key = button.dataset.joydayTool;
      if (currentCopy.tool[key]) button.querySelector("strong").textContent = currentCopy.tool[key];
      if (currentCopy.toolSub[key]) button.querySelector("small").textContent = currentCopy.toolSub[key];
      button.classList.toggle("is-active", key === state.tool);
    });
    document.querySelectorAll("[data-joyday-action]").forEach((node) => {
      const key = node.dataset.joydayAction;
      if (currentCopy.actions[key]) node.textContent = currentCopy.actions[key];
    });
    document.querySelectorAll("[data-joyday-static]").forEach((node) => {
      const key = node.dataset.joydayStatic;
      if (currentCopy.static[key]) node.textContent = currentCopy.static[key];
    });
    if (soundLabel) soundLabel.textContent = state.sound ? currentCopy.soundOn : currentCopy.soundOff;
    if (soundToggle) {
      soundToggle.setAttribute("aria-pressed", String(state.sound));
      const icon = soundToggle.querySelector("i");
      if (icon) icon.className = state.sound ? "bx bx-volume-full" : "bx bx-volume-mute";
    }
    buildPalette();
    updateMission();
  }

  buildPalette();
  setCanvasSize(state.canvasType);
  selectRandomTheme();

  document.querySelectorAll("[data-joyday-canvas]").forEach((button) => {
    button.addEventListener("click", () => {
      state.canvasType = button.dataset.joydayCanvas;
      setCanvasSize(state.canvasType);
    });
  });

  document.querySelectorAll("[data-joyday-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.joydayTool;
      state.toolsUsed.add(state.tool);
      updateHud();
    });
  });

  infoClose?.addEventListener("click", () => {
    state.infoDismissed = true;
    if (infoBanner) infoBanner.hidden = true;
  });

  customColor?.addEventListener("input", () => setColor(customColor.value, false));
  thicknessInput?.addEventListener("input", () => { state.thickness = clamp(Number(thicknessInput.value) || 50, 1, 100); updateHud(); });
  intensityInput?.addEventListener("input", () => { state.intensity = clamp(Number(intensityInput.value) || 60, 15, 100); updateHud(); });
  suggestPaletteButton?.addEventListener("click", suggestPalette);
  newThemeButton?.addEventListener("click", selectRandomTheme);
  starterButton?.addEventListener("click", starterStains);
  remixButton?.addEventListener("click", remixFlow);
  soundToggle?.addEventListener("click", () => { state.sound = !state.sound; if (state.sound) setupAudio(); updateHud(); });
  undoButton?.addEventListener("click", () => restoreSnapshot(state.historyIndex - 1));
  redoButton?.addEventListener("click", () => restoreSnapshot(state.historyIndex + 1));
  clearButton?.addEventListener("click", () => { resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); });
  finishButton?.addEventListener("click", openFinishModal);
  downloadButton?.addEventListener("click", downloadPNG);
  modalClose?.addEventListener("click", closeFinishModal);
  modal?.addEventListener("click", (event) => { if (event.target === modal) closeFinishModal(); });
  modalNew?.addEventListener("click", () => { closeFinishModal(); resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); document.getElementById("joyday-paint-game")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  artNameInput?.addEventListener("input", updatePreview);
  signatureInput?.addEventListener("change", updatePreview);
  exportButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.exportMode = button.dataset.joydayExportMode || "clean";
      exportButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      updatePreview();
    });
  });

  canvas.addEventListener("pointerdown", beginPaint);
  canvas.addEventListener("pointermove", movePaint);
  window.addEventListener("pointerup", endPaint);
  canvas.addEventListener("pointerleave", endPaint);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeFinishModal(); });
  window.updateJoydayPaintLanguage = function updateJoydayPaintLanguage() {
    updateHud();
    selectRandomTheme();
    updatePreview();
  };
})();
