/**
 * Career Adventure — the game around the board (V4-E06.3).
 *
 * The engine (adventure-game.js) owns the rules and the picture: the
 * simulation, merging, scoring, the overflow rule, the tools, the profile,
 * the canvas and its sound. This controller owns the game's flow and nothing
 * else:
 *
 *   page      the portfolio page: the hero's Play action, the board as poster
 *   menu      html[data-ca-state="menu"]     the main menu
 *   playing   html[data-ca-state="playing"]  a run, with its HUD
 *   paused    html[data-ca-state="paused"]
 *   won       html[data-ca-state="won"]      the Job Offer
 *   over      html[data-ca-state="over"]
 *   error     html[data-ca-state="error"]    the engine did not start
 *
 * It reads the engine through window.KaanCareerAdventure and its adventure:*
 * events and writes what they say into the shell's markup; it never decides a
 * score, a merge or an ending. css/v4-career-adventure.css lays the page out
 * for each state. Nothing here runs on an animation frame: the only timers
 * are the ones that take a toast away.
 */
(function () {
  var root = document.querySelector("[data-ca-root]");
  if (!root) return;

  var html = document.documentElement;
  var HISTORY_STATE = "career-adventure";
  var LAYERS = ["menu", "how", "settings", "progress", "pause", "over", "win", "error"];
  var labels = {};
  try { labels = JSON.parse(root.getAttribute("data-ca-labels") || "{}"); } catch (error) { labels = {}; }
  var pushed = false;
  var held = [];
  var origin = "menu";
  var toastTimer = 0;
  var lastEnd = null;

  var one = function (selector) { return document.querySelector(selector); };
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var api = function () { return window.KaanCareerAdventure || null; };
  var state = function () { return html.getAttribute("data-ca-state"); };
  var active = function () { return html.hasAttribute("data-ca-state"); };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>"]/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]; }); };
  var fill = function (template, values) { return String(template || "").replace(/\{(\w+)\}/g, function (match, name) { return name in values ? values[name] : match; }); };
  var number = function (value) { try { return Number(value).toLocaleString(html.lang || "en"); } catch (error) { return String(value); } };
  var clock = function (seconds) { return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"); };
  var LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"/></svg>';

  /* ---------- what the engine knows, written into the shell ---------- */

  function record() {
    var engine = api();
    var text = "";
    if (engine) {
      var now = engine.state();
      if (now.runs > 0 && (now.best > 0 || now.furthest > 0)) text = fill(labels.menuBest, { score: number(now.best) }) + " · " + fill(labels.menuFurthest, { object: engine.levels()[now.furthest].name });
    }
    all("[data-ca-record]").forEach(function (node) { node.textContent = text; node.hidden = !text; });
  }

  /* An object as a picture: the engine draws it, at the size the canvas has. */
  function picture(canvas, level) {
    var engine = api();
    if (engine && canvas) engine.icon(canvas, level);
  }

  function hud(now) {
    var engine = api();
    if (!engine || !now) return;
    var levels = engine.levels();
    var score = one("[data-ca-score]");
    var best = one("[data-ca-best]");
    if (score) score.textContent = number(now.score);
    if (best) best.textContent = number(now.best);
    var next = one("[data-ca-next]");
    if (next && next.getAttribute("data-level") !== String(now.next)) { next.setAttribute("data-level", String(now.next)); picture(next, now.next); }
    var name = one("[data-ca-next-name]");
    if (name) name.textContent = levels[now.next].name;
    all("[data-ca-tool]").forEach(function (button) {
      var kind = button.getAttribute("data-ca-tool");
      var left = now.tools[kind];
      var count = button.querySelector("[data-ca-count]");
      if (count) count.textContent = String(left);
      /* Re-scope has nothing to do while both objects are the same. */
      button.disabled = now.phase !== "playing" || left < 1 || (kind === "swap" && now.held === now.next);
    });
    var icon = one("[data-ca-stage-icon]");
    if (icon && icon.getAttribute("data-level") !== String(now.highest)) { icon.setAttribute("data-level", String(now.highest)); picture(icon, now.highest); }
    var stageName = one("[data-ca-stage-name]");
    if (stageName) stageName.textContent = levels[now.highest].name;
    var stage = one("[data-ca-stage]");
    if (stage) stage.textContent = fill(labels.hudStage, { n: now.highest + 1, total: levels.length });
    var meter = one("[data-ca-meter]");
    if (meter) meter.style.width = Math.round((now.highest / (levels.length - 1)) * 100) + "%";
    all("[data-ca-path] li").forEach(function (item, index) {
      item.classList.toggle("is-reached", index <= now.highest);
      item.classList.toggle("is-current", index === now.highest);
    });
    /* The room warms as the stack nears the line; the engine draws the line itself. */
    root.style.setProperty("--ca-heat", String(Math.max(0, Math.min(1, (now.pressure - 0.45) / 0.55)).toFixed(2)));
  }

  function path() {
    var engine = api();
    var holder = one("[data-ca-path]");
    if (!engine || !holder) return;
    holder.innerHTML = engine.levels().map(function (level) {
      return '<li title="' + esc(level.name) + '"><canvas width="64" height="64" aria-hidden="true"></canvas><span>' + esc(level.name) + "</span></li>";
    }).join("");
    all("[data-ca-path] canvas").forEach(picture);
  }

  /* The ladder, as a list: every rung, how far this profile has come, and
   * which rungs are milestones. */
  function ladder(holder, withState) {
    var engine = api();
    if (!engine || !holder) return;
    var furthest = engine.state().furthest;
    holder.innerHTML = engine.levels().map(function (level) {
      var reached = level.index <= furthest;
      return '<li class="' + (withState && reached ? "is-reached" : "") + (level.milestone ? " is-milestone" : "") + '"><canvas width="112" height="112" aria-hidden="true"></canvas><span><small>' + String(level.index + 1).padStart(2, "0") + "</small><strong>" + esc(level.name) + "</strong>" +
        (level.milestone ? "<em>" + esc(labels.progressMilestones) + "</em>" : "") + "</span></li>";
    }).join("");
    Array.prototype.forEach.call(holder.querySelectorAll("canvas"), picture);
  }

  function stats() {
    var engine = api();
    var holder = one("[data-ca-stats]");
    if (!engine || !holder) return;
    var now = engine.state();
    var cell = function (label, value) { return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>"; };
    holder.innerHTML = cell(labels.progressBest, number(now.best)) + cell(labels.progressFurthest, engine.levels()[now.furthest].name) + cell(labels.progressRuns, number(now.runs)) + cell(labels.progressWins, number(now.wins));
  }

  function settingsView() {
    var engine = api();
    if (!engine) return;
    var now = engine.settings();
    all("[data-ca-set]").forEach(function (input) {
      var key = input.getAttribute("data-ca-set");
      if (input.type === "range") input.value = String(Math.round(now.volume * 100)); else input.checked = Boolean(now[key]);
    });
    var haptics = one("[data-ca-haptics]");
    if (haptics) haptics.hidden = !now.canVibrate;
    var sound = one("[data-ca-sound]");
    if (sound) sound.setAttribute("aria-pressed", String(now.sound));
    var levels = engine.levels();
    var holder = one("[data-ca-themes]");
    if (!holder) return;
    holder.innerHTML = engine.themes().map(function (theme) {
      var name = labels["theme" + theme.id.charAt(0).toUpperCase() + theme.id.slice(1)];
      return '<button type="button" class="ca-theme ca-theme--' + esc(theme.id) + '" data-ca-theme="' + esc(theme.id) + '" aria-pressed="' + theme.active + '"' + (theme.unlocked ? "" : " disabled") + "><i></i><strong>" + esc(name) + "</strong>" +
        (theme.unlocked ? "" : "<small>" + LOCK + esc(fill(labels.settingsLocked, { object: levels[theme.unlock].name })) + "</small>") + "</button>";
    }).join("");
  }

  function result(detail) {
    var engine = api();
    var holder = one('[data-ca-result="' + (detail.won ? "win" : "over") + '"]');
    if (!engine || !holder) return;
    var cell = function (label, value, mark) { return "<div" + (mark ? ' class="is-new"' : "") + "><dt>" + esc(label) + "</dt><dd>" + esc(value) + (mark ? " <em>" + esc(labels.winNewBest) + "</em>" : "") + "</dd></div>"; };
    holder.innerHTML = '<dl class="ca-stats">' + cell(labels.statScore, number(detail.score), detail.newBest) + cell(labels.statBest, number(detail.best)) + cell(labels.progressFurthest, detail.name) + cell(labels.statChain, detail.bestChain + "×") + cell(labels.statTime, clock(detail.time)) + "</dl>" +
      (detail.won ? "" : '<p class="ca-summary">' + esc(fill(labels.overSummary, { object: detail.name, merges: number(detail.merges), drops: number(detail.drops) })) + "</p>");
    if (detail.won) picture(one("[data-ca-trophy]"), engine.levels().length - 1);
  }

  function toast(lines) {
    var holder = one("[data-ca-toast]");
    if (!holder) return;
    holder.innerHTML = lines.map(function (line, index) { return index ? "<span>" + esc(line) + "</span>" : "<strong>" + esc(line) + "</strong>"; }).join("");
    holder.hidden = false;
    holder.classList.remove("ca-toast--in");
    void holder.offsetWidth;
    holder.classList.add("ca-toast--in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { holder.hidden = true; }, 3600);
  }

  /* ---------- play mode ---------- */

  /* Everything that is not the game leaves the tab order while it is open. */
  function hold(on) {
    if (!on) { held.forEach(function (node) { node.inert = false; }); held = []; return; }
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node.tagName === "MAIN" || node.tagName === "SCRIPT" || node.inert) return;
      node.inert = true; held.push(node);
    });
    Array.prototype.forEach.call(root.parentElement.children, function (node) {
      if (node === root || node.inert) return;
      node.inert = true; held.push(node);
    });
  }

  /* One layer at a time is over the board, and while it is, it is the only
   * thing that can be reached. */
  function layer(name) {
    var layers = one(".ca-layers");
    LAYERS.forEach(function (id) { var node = one('[data-ca-layer="' + id + '"]'); if (node) node.hidden = id !== name; });
    Array.prototype.forEach.call(root.children, function (node) { node.inert = Boolean(name) && node !== layers; });
    if (name) html.setAttribute("data-ca-shown", name); else html.removeAttribute("data-ca-shown");
    if (!name) { root.focus({ preventScroll: true }); return; }
    var first = one('[data-ca-layer="' + name + '"] .ca-btn--go, [data-ca-layer="' + name + '"] .ca-btn--hot') || one('[data-ca-layer="' + name + '"] button');
    if (first) first.focus({ preventScroll: true });
  }

  function setState(next) { html.setAttribute("data-ca-state", next); }

  function menu() {
    var engine = api();
    if (engine) engine.stop();
    setState("menu");
    record();
    layer("menu");
  }

  function enter(fromHistory) {
    if (active()) return;
    /* Pressed before the page has finished starting: enter as soon as it has. */
    var host = window.KaanEngineHost;
    if (host && !host.released) {
      window.addEventListener("portfolio:react-main-hydrated", function () { setTimeout(function () { enter(fromHistory); }, 0); }, { once: true });
      return;
    }
    hold(true);
    root.setAttribute("tabindex", "-1");
    if (!fromHistory && window.history && history.pushState) {
      try { history.pushState({ view: HISTORY_STATE }, "", location.pathname + location.search); pushed = true; } catch (error) { pushed = false; }
    }
    var engine = api();
    if (!engine) {
      /* The engine did not start: say so, and leave a way out. */
      setState("error");
      layer("error");
      return;
    }
    path();
    settingsView();
    hud(engine.state());
    menu();
    /* The board has just been given the whole viewport. */
    requestAnimationFrame(function () { var live = api(); if (live && active()) live.relayout(); });
  }

  function leave(fromHistory) {
    if (!active()) return;
    clearTimeout(toastTimer);
    var engine = api();
    if (engine) engine.stop();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    html.removeAttribute("data-ca-state");
    html.removeAttribute("data-ca-shown");
    LAYERS.forEach(function (id) { var node = one('[data-ca-layer="' + id + '"]'); if (node) node.hidden = true; });
    Array.prototype.forEach.call(root.children, function (node) { node.inert = false; });
    var note = one("[data-ca-toast]");
    if (note) note.hidden = true;
    hold(false);
    var back = pushed && !fromHistory;
    pushed = false;
    /* The entry this game added to the history goes with it. */
    if (back) history.back();
    record();
    requestAnimationFrame(function () { var live = api(); if (live) live.relayout(); });
    var target = one(".ca-enter [data-ca-enter]") || one("[data-ca-enter]");
    if (target) target.focus({ preventScroll: true });
  }

  function play() {
    var engine = api();
    if (!engine) { setState("error"); layer("error"); return; }
    lastEnd = null;
    layer(null);
    setState("playing");
    /* Inside this press, which is the interaction a browser asks for before sound. */
    engine.start();
  }

  function open(name) {
    origin = state() === "paused" ? "pause" : "menu";
    if (name === "settings") settingsView();
    if (name === "progress") { stats(); ladder(one('[data-ca-ladder="progress"]'), true); }
    if (name === "how") ladder(one('[data-ca-ladder="how"]'), false);
    layer(name);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else html.requestFullscreen().catch(function () {});
  }

  function syncFullscreen() {
    var button = one("[data-ca-fullscreen]");
    if (!button) return;
    var on = Boolean(document.fullscreenElement);
    var text = button.getAttribute(on ? "data-ca-label-on" : "data-ca-label-off");
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", text);
    button.setAttribute("title", text);
  }

  /* ---------- the engine speaks ---------- */

  document.addEventListener("adventure:ready", function () { record(); if (active() && state() !== "error") { path(); settingsView(); } });
  document.addEventListener("adventure:hud", function (event) { if (active()) hud(event.detail); });
  document.addEventListener("adventure:state", function (event) {
    if (!active()) return;
    var phase = event.detail.phase;
    hud(event.detail);
    if (phase === "paused" && state() === "playing") { setState("paused"); layer("pause"); }
    else if (phase === "playing" && state() !== "playing") { setState("playing"); layer(null); }
  });
  document.addEventListener("adventure:milestone", function (event) {
    if (!active()) return;
    var lines = [fill(labels.milestoneTitle, { object: event.detail.name }), labels.milestoneRefill];
    if (event.detail.theme) lines.push(fill(labels.milestoneTheme, { theme: labels["theme" + event.detail.theme.charAt(0).toUpperCase() + event.detail.theme.slice(1)] }));
    toast(lines);
  });
  document.addEventListener("adventure:end", function (event) {
    if (!active()) return;
    lastEnd = event.detail;
    result(lastEnd);
    record();
    setState(lastEnd.won ? "won" : "over");
    layer(lastEnd.won ? "win" : "over");
  });
  document.addEventListener("adventure:settings", function () { if (active()) settingsView(); });

  /* ---------- the visitor acts ---------- */

  document.addEventListener("click", function (event) {
    var target = event.target.closest ? event.target : null;
    if (!target) return;
    if (target.closest("[data-ca-enter]")) { event.preventDefault(); enter(false); return; }
    if (!active()) return;
    var engine = api();
    if (target.closest("[data-ca-exit]")) { leave(false); return; }
    if (target.closest("[data-ca-reload]")) { location.reload(); return; }
    if (target.closest("[data-ca-play]")) { play(); return; }
    if (target.closest("[data-ca-menu]")) { menu(); return; }
    if (target.closest("[data-ca-resume]")) { if (engine) engine.resume(); return; }
    if (target.closest("[data-ca-pause]")) { if (engine) engine.pause(); return; }
    if (target.closest("[data-ca-back]")) { layer(origin); return; }
    var opener = target.closest("[data-ca-open]");
    if (opener) { open(opener.getAttribute("data-ca-open")); return; }
    if (target.closest("[data-ca-fullscreen]")) { toggleFullscreen(); return; }
    if (target.closest("[data-ca-sound]")) { if (engine) engine.set("sound", !engine.settings().sound); return; }
    var tool = target.closest("[data-ca-tool]");
    /* The board keeps the keys: a tool pressed with the mouse does not hold Space. */
    if (tool) { if (engine) engine.tool(tool.getAttribute("data-ca-tool")); root.focus({ preventScroll: true }); return; }
    var theme = target.closest("[data-ca-theme]");
    if (theme && engine) engine.set("theme", theme.getAttribute("data-ca-theme"));
  });

  document.addEventListener("input", function (event) {
    var input = event.target;
    var engine = api();
    if (!engine || !input.matches || !input.matches("[data-ca-set]")) return;
    var key = input.getAttribute("data-ca-set");
    engine.set(key, input.type === "range" ? Number(input.value) / 100 : input.checked);
  });

  document.addEventListener("keydown", function (event) {
    if (!active() || event.key !== "Escape") return;
    var engine = api();
    var shown = html.getAttribute("data-ca-shown");
    if (shown === "how" || shown === "settings" || shown === "progress") { layer(origin); return; }
    if (!engine) return;
    if (state() === "playing") engine.pause(); else if (state() === "paused") engine.resume();
  });

  document.addEventListener("fullscreenchange", syncFullscreen);
  var fullscreenButton = one("[data-ca-fullscreen]");
  if (fullscreenButton && document.fullscreenEnabled && html.requestFullscreen) fullscreenButton.hidden = false;

  window.addEventListener("popstate", function (event) {
    var wanted = Boolean(event.state && event.state.view === HISTORY_STATE);
    if (wanted && !active()) { pushed = true; enter(true); } else if (!wanted && active()) leave(true);
  });

  /* A link straight to the game (the language links in Settings are) opens it,
   * once the engine has had its turn. */
  if (location.hash === "#career-merge-game") window.addEventListener("portfolio:react-main-hydrated", function () { setTimeout(function () { enter(true); }, 0); }, { once: true });

  /* The engine may already be up (this script runs before the host releases
   * it, but a remount can come later). */
  if (api()) record();
})();
