/**
 * Joyday Action Painting — the studio's play mode (V4-E06.1).
 *
 * The painting engine (joyday-paint.js) keeps every mechanic and is not
 * touched. This controller owns what surrounds it: entering and leaving the
 * studio, its start state, fullscreen, the session's sound choice and the
 * hand-offs around the finished artwork. It never draws and never reads the
 * engine's state; where it needs the engine to act it presses the engine's
 * own control.
 *
 *   html[data-joyday-studio="start" | "paint"]   in the studio, and its phase
 *   html[data-jds-dock="extras"]                 a phone's second dock page
 *
 * css/v4-joyday-studio.css lays the page's existing markup out for each.
 * Nothing here runs on a timer or an animation frame: it only answers the
 * visitor, so there is no work to stop while the page is hidden.
 */
(function () {
  var root = document.querySelector("[data-jds-root]");
  if (!root) return;

  var html = document.documentElement;
  var SOUND_KEY = "joyday-studio-sound";
  var HISTORY_STATE = "joyday-studio";
  var one = function (selector) { return document.querySelector(selector); };
  var canvas = one("#joyday-art-canvas");
  var frame = one("[data-joyday-frame]");
  var modal = one("[data-joyday-modal]");
  var returnFocus = null;
  var asNew = false;
  var pushed = false;
  var held = [];

  function active() { return html.hasAttribute("data-joyday-studio"); }
  function phase(next) { html.setAttribute("data-joyday-studio", next); }
  /* The engine enables Undo once there is anything to undo. */
  function hasWork() { var undo = one("[data-joyday-undo]"); return Boolean(undo && !undo.disabled); }
  function engineReady() {
    var engine = window.KaanEngineHost && window.KaanEngineHost.get("joydayPaint");
    return Boolean(engine && engine.mounted && canvas && typeof canvas.getContext === "function" && canvas.getContext("2d"));
  }
  function press(selector) { var control = one(selector); if (control) control.click(); }
  function soundOn() { var toggle = one("[data-joyday-sound-toggle]"); return Boolean(toggle && toggle.getAttribute("aria-pressed") === "true"); }
  function remembered() { try { return sessionStorage.getItem(SOUND_KEY); } catch (error) { return null; } }
  function remember(value) { try { sessionStorage.setItem(SOUND_KEY, value); } catch (error) { /* the choice simply is not kept */ } }

  /* The colour in hand, for the studio's own accents. The engine keeps the
   * custom-colour input in step with it. */
  function syncPaint() {
    var input = one("[data-joyday-custom-color]");
    if (input && input.value) root.style.setProperty("--jds-paint", input.value);
  }

  /* Studio mood (V4-E06.1B). A palette changes the room, not only the pots:
   * its colours are read as they stand in the page and sorted into one of six
   * mood families, and the stylesheet lets the wall, the light, the paper and
   * the accents follow. Decided from the colours themselves — hue, lightness
   * and saturation — never from a palette's name, so a palette added to the
   * engine later finds its own mood. Only presentation tokens change; the
   * canvas and the artwork on it are never touched. */
  var MOODS = ["pop", "soft", "sunset", "blue", "electric", "morning"];
  var moodTimer = 0;

  function moodOf(colors) {
    var paints = [];
    colors.forEach(function (hex) {
      var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
      if (!m) return;
      var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      var h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      /* Whites, blacks and greys are the canvas and the line, not the mood. */
      if (s < 0.15 || l < 0.14 || l > 0.95) return;
      paints.push({ h: h * 60, s: s, l: l });
    });
    if (!paints.length) return "pop";
    var share = function (test) { return paints.filter(test).length / paints.length; };
    var pastel = share(function (p) { return p.l >= 0.74; });
    var warm = share(function (p) { return p.h < 70 || p.h >= 320; });
    var cool = share(function (p) { return p.h >= 150 && p.h < 265; });
    var violet = share(function (p) { return p.h >= 265 && p.h < 320; });
    var neon = share(function (p) { return p.s >= 0.95 && p.l >= 0.4 && p.l <= 0.66; });
    if (pastel >= 0.6) return cool > warm ? "morning" : "soft";
    if (warm >= 0.75) return "sunset";
    if (cool >= 0.7) return "blue";
    if (neon >= 0.5 && cool + violet >= 0.25) return "electric";
    return "pop";
  }

  function paletteColors() {
    return Array.prototype.map.call(document.querySelectorAll("[data-joyday-colors] [data-joyday-color]"), function (button) { return button.getAttribute("data-joyday-color"); });
  }

  /* `announce` is for a change the visitor made; arriving in the studio sets
   * the mood silently. */
  function syncMood(announce) {
    var mood = moodOf(paletteColors());
    var changed = html.getAttribute("data-jds-mood") !== mood;
    html.setAttribute("data-jds-mood", mood);
    var label = one("[data-jds-mood-label]");
    if (!label || !announce || !changed) return;
    var names = {};
    try { names = JSON.parse(label.getAttribute("data-jds-moods") || "{}"); } catch (error) { names = {}; }
    var entry = names[mood];
    if (!entry) return;
    label.querySelector("strong").textContent = entry.name;
    label.querySelector("span").textContent = entry.note;
    label.hidden = false;
    label.classList.remove("jds-mood--in");
    void label.offsetWidth;
    label.classList.add("jds-mood--in");
    clearTimeout(moodTimer);
    moodTimer = setTimeout(function () { label.hidden = true; }, 3200);
  }

  /* The engine marks the tool, format and export style in hand with a class;
   * the same choice is stated for assistive technology. */
  function syncPressed() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-joyday-tool], [data-joyday-canvas], [data-joyday-export-mode]"), function (button) {
      button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
    });
  }

  /* Everything that is not the studio leaves the tab order while it is open. */
  function hold(on) {
    if (!on) { held.forEach(function (node) { node.inert = false; }); held = []; return; }
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node.tagName === "MAIN" || node.tagName === "SCRIPT" || node.inert) return;
      node.inert = true; held.push(node);
    });
    Array.prototype.forEach.call(root.parentElement.children, function (node) {
      if (node === root || node === modal || node.inert) return;
      node.inert = true; held.push(node);
    });
  }

  function showError(on) {
    var panel = one("[data-jds-error]");
    if (panel) panel.hidden = !on;
    html.toggleAttribute("data-jds-failed", on);
  }

  function showResume() {
    var resume = one("[data-jds-resume]");
    if (resume) resume.hidden = !hasWork();
  }

  function enter(fromHistory) {
    if (active()) return;
    /* Pressed before the page has finished starting: enter as soon as it has. */
    var host = window.KaanEngineHost;
    if (host && !host.released) {
      window.addEventListener("portfolio:react-main-hydrated", function () { setTimeout(function () { enter(fromHistory); }, 0); }, { once: true });
      return;
    }
    returnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : one("[data-jds-enter]");
    asNew = false;
    html.removeAttribute("data-jds-dock");
    var ready = engineReady();
    showError(!ready);
    /* Work already on the canvas means the visitor is coming back to it. */
    phase(ready && hasWork() ? "paint" : "start");
    showResume();
    hold(true);
    syncPaint();
    syncPressed();
    syncMood(false);
    /* A sound choice made earlier in this tab is restored inside this click,
     * which is the interaction the browser's autoplay rule asks for. */
    if (ready && remembered() === "on" && !soundOn()) press("[data-joyday-sound-toggle]");
    if (!fromHistory && window.history && history.pushState) {
      try { history.pushState({ view: HISTORY_STATE }, "", location.pathname + location.search); pushed = true; } catch (error) { pushed = false; }
    }
    var first = ready ? one(html.getAttribute("data-joyday-studio") === "start" ? "[data-jds-start]" : "[data-jds-exit]") : one("[data-jds-reload]");
    if (first) first.focus({ preventScroll: true });
  }

  function leave(fromHistory) {
    if (!active()) return;
    if (modal && !modal.hidden) press("[data-joyday-modal-close]");
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    html.removeAttribute("data-joyday-studio");
    html.removeAttribute("data-jds-dock");
    html.removeAttribute("data-jds-failed");
    clearTimeout(moodTimer);
    var moodLabel = one("[data-jds-mood-label]");
    if (moodLabel) moodLabel.hidden = true;
    hold(false);
    var back = pushed && !fromHistory;
    pushed = false;
    /* The entry this studio added to the history goes with it. */
    if (back) history.back();
    var target = returnFocus && document.contains(returnFocus) ? returnFocus : one("[data-jds-enter]");
    if (target) target.focus({ preventScroll: true });
  }

  function startPainting() {
    if (!engineReady()) { showError(true); return; }
    /* Arriving from New canvas, the format just confirmed starts clean. */
    if (asNew && hasWork()) press("[data-joyday-clear]");
    asNew = false;
    phase("paint");
    var tool = one("[data-joyday-tool].is-active") || one("[data-joyday-tool]");
    if (tool) tool.focus({ preventScroll: true });
  }

  function newCanvas() {
    asNew = true;
    html.removeAttribute("data-jds-dock");
    phase("start");
    showResume();
    var cta = one("[data-jds-start]");
    if (cta) cta.focus({ preventScroll: true });
  }

  function resume() {
    asNew = false;
    phase("paint");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else html.requestFullscreen().catch(function () {});
  }

  function syncFullscreen() {
    var button = one("[data-jds-fullscreen]");
    if (!button) return;
    var on = Boolean(document.fullscreenElement);
    button.setAttribute("aria-pressed", String(on));
    var label = button.querySelector("span");
    if (label) label.textContent = button.getAttribute(on ? "data-jds-label-on" : "data-jds-label-off");
  }

  function toggleExtras() {
    var open = html.getAttribute("data-jds-dock") === "extras";
    if (open) html.removeAttribute("data-jds-dock"); else html.setAttribute("data-jds-dock", "extras");
    var button = one("[data-jds-extras]");
    if (button) button.setAttribute("aria-pressed", String(!open));
  }

  /* One short answer for every mark that lands: a little paint thrown from
   * where it landed, in the colour in hand. Drawn by the stylesheet over the
   * stage for under half a second; it never touches the artwork's pixels. */
  function hit(event) {
    if (!frame || !active()) return;
    syncPaint();
    frame.classList.remove("jds-hit");
    void frame.offsetWidth;
    frame.classList.add("jds-hit");
    var scene = frame.parentElement;
    if (!scene || !event || typeof event.clientX !== "number") return;
    var box = scene.getBoundingClientRect();
    scene.style.setProperty("--jds-hit-x", Math.round(event.clientX - box.left) + "px");
    scene.style.setProperty("--jds-hit-y", Math.round(event.clientY - box.top) + "px");
    scene.style.setProperty("--jds-hit-turn", Math.round(Math.random() * 360) + "deg");
    scene.classList.remove("jds-splash");
    void scene.offsetWidth;
    scene.classList.add("jds-splash");
  }

  var fullscreenButton = one("[data-jds-fullscreen]");
  if (fullscreenButton && document.fullscreenEnabled && html.requestFullscreen) fullscreenButton.hidden = false;

  document.addEventListener("click", function (event) {
    var target = event.target.closest ? event.target : null;
    if (!target) return;
    if (target.closest("[data-jds-enter]")) { event.preventDefault(); enter(false); return; }
    if (!active()) return;
    if (target.closest("[data-jds-exit]")) { leave(false); return; }
    if (target.closest("[data-jds-start]")) { startPainting(); return; }
    if (target.closest("[data-jds-resume]")) { resume(); return; }
    if (target.closest("[data-jds-new]")) { newCanvas(); return; }
    if (target.closest("[data-jds-fullscreen]")) { toggleFullscreen(); return; }
    if (target.closest("[data-jds-extras]")) { toggleExtras(); return; }
    if (target.closest("[data-jds-reload]")) { location.reload(); return; }
    if (target.closest("[data-jds-keep]")) { press("[data-joyday-modal-close]"); return; }
    /* The engine has just cleared the canvas for a new artwork: choose its format. */
    if (target.closest("[data-joyday-modal-new]")) { asNew = false; html.removeAttribute("data-jds-dock"); phase("start"); showResume(); return; }
    /* A format chosen in the start state is a fresh canvas already. */
    if (target.closest("[data-joyday-canvas]")) { asNew = false; showResume(); syncPressed(); return; }
    if (target.closest("[data-joyday-tool], [data-joyday-export-mode]")) { syncPressed(); return; }
    if (target.closest("[data-joyday-sound-toggle]")) { remember(soundOn() ? "on" : "off"); return; }
    /* The engine has just laid out the next palette: the room follows it. */
    if (target.closest("[data-joyday-suggest-palette]")) { syncPaint(); syncMood(true); return; }
    if (target.closest("[data-joyday-colors]")) syncPaint();
  });
  document.addEventListener("input", function (event) {
    if (event.target.matches && event.target.matches("[data-joyday-custom-color]")) syncPaint();
  });
  document.addEventListener("fullscreenchange", syncFullscreen);
  /* The classifier, readable from outside so it can be held to its rules. */
  window.JoydayStudioMood = { ids: MOODS.slice(), of: moodOf };
  window.addEventListener("popstate", function (event) {
    var wanted = Boolean(event.state && event.state.view === HISTORY_STATE);
    if (wanted && !active()) { pushed = true; enter(true); } else if (!wanted && active()) leave(true);
  });
  if (canvas) {
    canvas.addEventListener("pointerup", hit);
    /* A balloon lands on the press itself. */
    canvas.addEventListener("pointerdown", function (event) { var tool = one("[data-joyday-tool].is-active"); if (tool && tool.getAttribute("data-joyday-tool") === "balloon") hit(event); });
  }
  if (modal && "MutationObserver" in window) {
    /* The finished artwork arrives once per opening. */
    new MutationObserver(function () {
      modal.classList.toggle("jds-arrive", !modal.hidden);
    }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* A link straight to the studio opens it, once the engine has had its turn. */
  if (location.hash === "#joyday-paint-game") window.addEventListener("portfolio:react-main-hydrated", function () { setTimeout(function () { enter(true); }, 0); }, { once: true });
})();
