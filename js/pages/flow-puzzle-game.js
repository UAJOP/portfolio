/**
 * AI Flow Puzzle — the game around the puzzle (V4-E06.2).
 *
 * The engine (ai-flow-puzzle.js) owns the rules: levels, the board, the run,
 * validation, scoring and progress. This controller owns the game's flow and
 * nothing else:
 *
 *   hub       the page itself: level select, progress, how to play
 *   mission   html[data-afp-state="mission"]   the briefing, before a level
 *   building  html[data-afp-state="building"]  the workspace
 *   running   html[data-afp-state="running"]   Run flow in progress
 *   success   html[data-afp-state="success"]
 *   failure   html[data-afp-state="failure"]
 *
 * It reads the engine through window.KaanFlowPuzzle and its aiflow:* events,
 * and where it needs the engine to act it presses the engine's own control.
 * It never decides a verdict or a score. css/v4-flow-puzzle.css lays the
 * page's markup out for each state. Nothing here runs on a timer or an
 * animation frame at rest.
 */
(function () {
  var root = document.querySelector("[data-afp-root]");
  if (!root) return;

  var html = document.documentElement;
  var HISTORY_STATE = "flow-puzzle";
  var labels = {};
  try { labels = JSON.parse(root.getAttribute("data-afp-labels") || "{}"); } catch (error) { labels = {}; }
  var level = 0;
  var pushed = false;
  var held = [];
  var returnFocus = null;
  var resultTimer = 0;
  var lastResult = null;

  var one = function (selector) { return document.querySelector(selector); };
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var api = function () { return window.KaanFlowPuzzle || null; };
  var phase = function () { return html.getAttribute("data-afp-state"); };
  var active = function () { return html.hasAttribute("data-afp-state"); };
  var compact = function () { return window.matchMedia("(max-width: 1279px)").matches; };
  var phone = function () { return window.matchMedia("(max-width: 720px)").matches; };
  var still = function () { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>"]/g, function (char) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]; }); };
  var fill = function (template, values) { return String(template || "").replace(/\{(\w+)\}/g, function (match, name) { return name in values ? values[name] : match; }); };
  var press = function (selector) { var control = one(selector); if (control) control.click(); };
  var text = function (key) { var engine = api(); return engine ? engine.text(key) : ""; };
  var CHECK = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

  /* A level's size is the only difficulty the game can honestly state: the
   * number of nodes and connections its rules require. */
  function difficulty(entry) { return entry.nodes + entry.links > 14 ? labels.difficultyAdvanced : labels.difficultyStandard; }
  function pieces(entry) { return entry.nodes + " " + text("nodesLabel") + " · " + entry.links + " " + text("linksLabel"); }
  function nextUnsolved(levels) {
    for (var index = 0; index < levels.length; index += 1) if (!levels[index].solved) return index;
    return 0;
  }

  /* ---------- hub ---------- */

  function renderHub() {
    var engine = api();
    if (!engine) return;
    var levels = engine.levels();
    var solved = levels.filter(function (entry) { return entry.solved; }).length;
    var list = one("[data-afp-levels]");
    if (list) {
      list.innerHTML = levels.map(function (entry) {
        var number = String(entry.index + 1).padStart(2, "0");
        var status = entry.solved ? labels.solved + " · " + fill(labels.best, { score: entry.best }) : labels.unsolved;
        return '<li><button type="button" class="afp-level' + (entry.solved ? " is-solved" : "") + '" data-afp-open="' + entry.index + '">' +
          '<span class="afp-level__no" aria-hidden="true">' + number + "</span>" +
          '<span class="afp-level__body"><strong>' + esc(entry.title) + "</strong><small>" + esc(entry.short) + "</small>" +
          '<span class="afp-level__meta"><em>' + esc(difficulty(entry)) + "</em><span>" + esc(pieces(entry)) + "</span></span></span>" +
          '<span class="afp-level__state">' + (entry.solved ? CHECK : "") + "<span>" + esc(status) + "</span></span></button></li>";
      }).join("");
    }
    var progress = one("[data-afp-progress]");
    if (progress) progress.textContent = fill(labels.progress, { solved: solved, total: levels.length }) + " · " + text("scoreLabel") + " " + engine.state().score;
    var play = one("[data-afp-play] span") || one("[data-afp-play]");
    if (play) play.textContent = solved > 0 && solved < levels.length ? labels.continue : labels.play;
    all("[data-afp-text]").forEach(function (node) { node.textContent = text(node.getAttribute("data-afp-text")); });
  }

  /* ---------- mission briefing ---------- */

  function progressList(levels, current) {
    return '<ol class="afp-progress">' + levels.map(function (entry) {
      return '<li class="' + (entry.solved ? "is-solved" : "") + (entry.index === current ? " is-current" : "") + '"><span aria-hidden="true">' + (entry.solved ? CHECK : String(entry.index + 1)) + "</span><strong>" + esc(entry.title) + "</strong><small>" +
        esc(entry.solved ? fill(labels.best, { score: entry.best }) : labels.unsolved) + "</small></li>";
    }).join("") + "</ol>";
  }

  function renderMission() {
    var engine = api();
    var body = one("[data-afp-mission]");
    if (!engine || !body) return;
    var levels = engine.levels();
    var entry = levels[level];
    var select = one("[data-ai-test-message]");
    var message = entry.messages[Number((select && select.value) || 0)] || entry.messages[0] || "";
    var solved = levels.filter(function (item) { return item.solved; }).length;
    body.innerHTML =
      '<div class="afp-brief">' +
        '<p class="afp-kicker">' + esc(entry.level) + " · " + esc(labels.missionLabel) + "</p>" +
        '<h2 id="afp-mission-title">' + esc(entry.title) + "</h2>" +
        '<section><h3>' + esc(labels.missionScenario) + "</h3><p>" + esc(entry.goal) + "</p></section>" +
        '<section class="afp-io"><div><h3>' + esc(labels.missionInput) + '</h3><blockquote>' + esc(message) + "</blockquote></div>" +
          '<i aria-hidden="true"></i>' +
          "<div><h3>" + esc(labels.missionExpected) + '</h3><ul class="afp-expect">' + entry.outcomes.map(function (name) { return "<li>" + esc(fill(labels.missionReaches, { node: name })) + "</li>"; }).join("") + "</ul></div></section>" +
        '<section><h3>' + esc(labels.missionConstraints) + '</h3><ul class="afp-chips"><li>' + esc(fill(labels.missionNodes, { n: entry.nodes })) + "</li><li>" + esc(fill(labels.missionLinks, { n: entry.links })) + "</li><li>" + esc(labels.missionHints) + "</li></ul></section>" +
      "</div>" +
      '<aside class="afp-side">' +
        '<p class="afp-sticky"><b>' + esc(labels.missionTip) + "</b>" + esc(entry.objective) + "</p>" +
        '<div class="afp-card"><h3>' + esc(labels.missionProgress) + '</h3><p class="afp-card__count">' + esc(fill(labels.progress, { solved: solved, total: levels.length })) + "</p>" + progressList(levels, level) +
        '<p class="afp-card__total">' + esc(labels.winTotal) + " <b>" + engine.state().score + "</b></p></div>" +
      "</aside>";
  }

  /* ---------- result ---------- */

  function issueText(issue) {
    var engine = api();
    var names = function (types) { return types.map(function (type) { return engine.nodeTitle(type); }).filter(function (name, index, list) { return list.indexOf(name) === index; }).join(", "); };
    if (issue.kind === "missingNode") return text("missingNode") + " " + engine.nodeTitle(issue.type);
    if (issue.kind === "missingLink") return text("missingEdge") + " " + engine.nodeTitle(issue.from) + " → " + engine.nodeTitle(issue.to);
    if (issue.kind === "unreachable") return fill(labels.failUnreachable, { nodes: names(issue.types) });
    return fill(labels.failDeadEnd, { nodes: names(issue.types) });
  }

  function renderResult(detail) {
    var engine = api();
    var holder = one("[data-afp-result]");
    if (!engine || !holder) return;
    var levels = engine.levels();
    var outcomes = detail.outcomes.map(function (item) {
      return '<li class="' + (item.reached ? "is-ok" : "is-miss") + '"><span aria-hidden="true">' + (item.reached ? CHECK : CROSS) + "</span><strong>" + esc(engine.nodeTitle(item.type)) + "</strong> " + esc(item.reached ? labels.failReached : labels.failNotReached) + "</li>";
    }).join("");
    if (!detail.valid) {
      var issues = detail.issues.slice(0, 6).map(function (issue, index) {
        var target = issue.nodes && issue.nodes.length ? ' data-afp-issue="' + index + '"' : " data-afp-resume";
        return "<li><button type=\"button\"" + target + ">" + esc(issueText(issue)) + "</button></li>";
      }).join("");
      var notes = detail.debug.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("");
      holder.innerHTML =
        '<div class="afp-verdict afp-verdict--fail"><span class="afp-mark" aria-hidden="true">' + CROSS + '</span><h2 id="afp-result-title">' + esc(labels.failTitle) + "</h2><p>" + esc(text("missingTitle")) + "</p></div>" +
        '<p class="afp-sticky afp-sticky--result" aria-hidden="true">' + esc(labels.failNote) + "</p>" +
        '<div class="afp-columns"><section><h3>' + esc(labels.failWentWrong) + '</h3><ul class="afp-issues">' + issues + "</ul>" + (notes ? '<ul class="afp-notes">' + notes + "</ul>" : "") + "</section>" +
        "<section><h3>" + esc(labels.failCompare) + '</h3><ul class="afp-outcomes">' + outcomes + "</ul></section></div>" +
        '<div class="afp-actions"><button type="button" class="afp-cta afp-cta--hot" data-afp-resume>' + esc(labels.failRetry) + '</button><button type="button" class="afp-ghost" data-afp-hint>' + esc(labels.failHint) + "</button></div>";
      return;
    }
    var quality = detail.quality;
    var stat = function (label, value, of) { return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + (of ? "<small>/" + esc(of) + "</small>" : "") + "</dd></div>"; };
    var meter = function (key, value) { return "<li><span>" + esc(text(key)) + '</span><i style="--afp-fill:' + Number(value) + '%"></i><b>' + Number(value) + "</b></li>"; };
    var next = levels[detail.level + 1];
    var allSolved = levels.every(function (entry) { return entry.solved; });
    var badge = detail.completion && detail.completion.improved && !detail.completion.first ? " · " + labels.winNewBest : "";
    holder.innerHTML =
      '<div class="afp-verdict afp-verdict--ok"><span class="afp-mark" aria-hidden="true">' + CHECK + '</span><h2 id="afp-result-title">' + esc(text("successTitle")) + "</h2><p>" + esc(text("successText")) + "</p></div>" +
      '<p class="afp-sticky afp-sticky--result" aria-hidden="true">' + esc(labels.winNote) + "</p>" +
      '<dl class="afp-stats">' + stat(text("scoreLabel"), quality.total, 100) + stat(labels.hintsUsed, detail.hints) + stat(text("nodesLabel"), detail.nodes, detail.required.nodes) + stat(text("efficiencyScore"), quality.efficiency) + "</dl>" +
      '<section class="afp-quality"><h3>' + esc(labels.winQuality) + '</h3><ul class="afp-meters">' + meter("logicScore", quality.logic) + meter("automationScore", quality.automation) + meter("uxScore", quality.ux) + meter("safetyScore", quality.safety) + meter("efficiencyScore", quality.efficiency) + "</ul></section>" +
      '<p class="afp-total">' + esc(labels.winTotal) + " <b>" + detail.score + "</b> · " + esc(fill(labels.best, { score: detail.completion ? detail.completion.best : quality.total })) + esc(badge) + (allSolved ? " · " + esc(labels.winAllDone) : "") + "</p>" +
      (detail.assisted ? '<p class="afp-assisted">' + esc(labels.winAssisted) + "</p>" : "") +
      '<div class="afp-actions">' + (next ? '<button type="button" class="afp-cta" data-afp-next="' + next.index + '">' + esc(labels.winNext) + "</button>" : '<button type="button" class="afp-cta" data-afp-leave>' + esc(labels.levels) + "</button>") +
      '<button type="button" class="afp-ghost" data-afp-resume>' + esc(labels.winInspect) + "</button></div>";
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

  /* A layer over the workspace (briefing, result, failure) is the only thing
   * that can be reached while it is up. */
  function setPhase(next) {
    html.setAttribute("data-afp-state", next);
    var layer = next === "mission" ? ".afp-mission" : next === "success" || next === "failure" ? ".afp-result" : next === "error" ? ".afp-error" : null;
    Array.prototype.forEach.call(root.children, function (node) { node.inert = Boolean(layer) && !node.matches(layer); });
    var error = one("[data-afp-error]");
    if (error) error.hidden = next !== "error";
    /* While the flow runs, the dock's Run is the way to stop it. */
    var runLabel = one("[data-afp-run] span");
    if (runLabel) runLabel.textContent = next === "running" ? labels.stop : text("runFlow");
    sheet(null);
    menu(false);
  }

  function sheet(name) {
    if (name) html.setAttribute("data-afp-sheet", name); else html.removeAttribute("data-afp-sheet");
    all("[data-afp-sheet]").forEach(function (button) { if (button !== html) button.setAttribute("aria-pressed", String(button.getAttribute("data-afp-sheet") === name)); });
  }

  function menu(open) {
    var list = one("[data-afp-menu-list]");
    var button = one("[data-afp-menu]");
    if (!list || !button) return;
    list.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) { var first = list.querySelector("button, a"); if (first) first.focus({ preventScroll: true }); }
  }

  function tab(name) {
    html.setAttribute("data-afp-tab", name);
    all("[data-afp-tab]").forEach(function (button) { if (button !== html) button.setAttribute("aria-pressed", String(button.getAttribute("data-afp-tab") === name)); });
  }

  function note(message) {
    var holder = one("[data-afp-note]");
    if (!holder) return;
    holder.textContent = message || "";
    holder.hidden = !message;
  }

  function syncBar() {
    var engine = api();
    if (!engine) return;
    var state = engine.state();
    var hints = one("[data-afp-hints]");
    if (hints) hints.textContent = String(state.hints);
    var chip = one("[data-afp-level]");
    var entry = engine.levels()[state.level];
    if (chip && entry) chip.textContent = entry.level;
    level = state.level;
    var bar = one("[data-afp-selbar]");
    if (!bar) return;
    if (state.selectedNode && phase() === "building") {
      var name = one("[data-ai-inspector] .ai-inspector-head strong");
      bar.innerHTML = "<strong>" + esc(name ? name.textContent : "") + '</strong><button type="button" data-afp-sel="connect">' + esc(text("startConnection")) + '</button><button type="button" data-afp-sel="inspect">' + esc(labels.tabNode) + '</button><button type="button" data-afp-sel="remove">' + esc(text("removeNode")) + "</button>";
      bar.hidden = false;
    } else if (state.selectedLink && phase() === "building") {
      bar.innerHTML = '<button type="button" data-afp-sel="unlink">' + esc(text("deleteConnection")) + "</button>";
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  function enterPlay(fromHistory) {
    if (active()) return;
    /* The mission list is redrawn on the way out, so the opener is remembered by what it is. */
    var opener = document.activeElement;
    returnFocus = opener && opener.hasAttribute && opener.hasAttribute("data-afp-open") ? '[data-afp-open="' + opener.getAttribute("data-afp-open") + '"]' : "[data-afp-play]";
    hold(true);
    tab("mission");
    note("");
    if (!fromHistory && window.history && history.pushState) {
      try { history.pushState({ view: HISTORY_STATE }, "", location.pathname + location.search); pushed = true; } catch (error) { pushed = false; }
    }
  }

  function openMission(index, fromHistory) {
    /* Pressed before the page has finished starting: open as soon as it has. */
    var host = window.KaanEngineHost;
    if (host && !host.released) {
      window.addEventListener("portfolio:react-main-hydrated", function () { setTimeout(function () { openMission(index, fromHistory); }, 0); }, { once: true });
      return;
    }
    clearTimeout(resultTimer);
    var engine = api();
    enterPlay(fromHistory);
    if (!engine) {
      /* The engine did not start: say so, and leave a way out. */
      setPhase("error");
      var reload = one("[data-afp-reload]");
      if (reload) reload.focus({ preventScroll: true });
      return;
    }
    level = Math.max(0, Math.min(engine.levels().length - 1, Number(index) || 0));
    note("");
    lastResult = null;
    /* The level is opened once the workspace has its size: the engine lays a
     * tall board out differently from a wide one. */
    setPhase("mission");
    engine.open(level);
    renderMission();
    syncBar();
    tab("mission");
    var start = one("[data-afp-start]");
    if (start) start.focus({ preventScroll: true });
  }

  function build() {
    setPhase("building");
    syncBar();
    var engine = api();
    /* The board has just been given its size: bring the flow into view. */
    if (engine) requestAnimationFrame(function () { if (phase() === "building" && engine === api()) { engine.refresh(); if (!lastResult) engine.fit(); } });
  }

  function leave(fromHistory) {
    if (!active()) return;
    clearTimeout(resultTimer);
    var engine = api();
    if (engine) engine.stop();
    html.removeAttribute("data-afp-state");
    html.removeAttribute("data-afp-sheet");
    html.removeAttribute("data-afp-tab");
    Array.prototype.forEach.call(root.children, function (node) { node.inert = false; });
    hold(false);
    menu(false);
    var back = pushed && !fromHistory;
    pushed = false;
    /* The entry this game added to the history goes with it. */
    if (back) history.back();
    renderHub();
    var target = one(returnFocus || "[data-afp-play]") || one("[data-afp-play]");
    if (target) target.focus({ preventScroll: true });
  }

  function showResult(detail) {
    if (!active() || phase() === "mission") return;
    lastResult = detail;
    renderResult(detail);
    setPhase(detail.valid ? "success" : "failure");
    var first = one("[data-afp-result] .afp-cta");
    if (first) first.focus({ preventScroll: true });
  }

  /* ---------- the engine speaks ---------- */

  document.addEventListener("aiflow:ready", renderHub);
  document.addEventListener("aiflow:language", function () { renderHub(); if (phase() === "mission") renderMission(); if (lastResult && (phase() === "success" || phase() === "failure")) renderResult(lastResult); });
  document.addEventListener("aiflow:change", function () { if (active()) syncBar(); });
  /* The board changed: a hint about how it was no longer applies. */
  document.addEventListener("aiflow:touched", function () { note(""); });
  document.addEventListener("aiflow:level", function () { if (active()) { note(""); syncBar(); } });
  document.addEventListener("aiflow:select", function (event) {
    if (!active()) return;
    if (event.detail.node || event.detail.link) tab("node");
    syncBar();
  });
  document.addEventListener("aiflow:run-start", function () {
    if (!active()) return;
    clearTimeout(resultTimer);
    note("");
    setPhase("running");
    tab("run");
  });
  document.addEventListener("aiflow:result", function (event) {
    if (!active()) return;
    var detail = event.detail;
    clearTimeout(resultTimer);
    /* After a run the last node holds its light for a moment before the verdict. */
    if (detail.source === "run") resultTimer = setTimeout(function () { showResult(detail); }, still() ? 120 : 700);
    else showResult(detail);
  });
  document.addEventListener("aiflow:hint", function (event) {
    if (!active()) return;
    if (phase() !== "building") setPhase("building");
    sheet(event.detail.kind === "node" && phone() ? "library" : null);
    note(text("hintIntro") + " " + event.detail.text);
    syncBar();
  });

  /* ---------- the visitor acts ---------- */

  document.addEventListener("click", function (event) {
    var target = event.target.closest ? event.target : null;
    if (!target) return;
    var opener = target.closest("[data-afp-open]");
    if (opener) { openMission(Number(opener.getAttribute("data-afp-open")), false); return; }
    if (target.closest("[data-afp-play]")) { event.preventDefault(); var engine = api(); openMission(engine ? nextUnsolved(engine.levels()) : 0, false); return; }
    if (!active()) return;
    if (!target.closest("[data-afp-menu], [data-afp-menu-list]")) menu(false);
    if (target.closest("[data-afp-leave]")) { leave(false); return; }
    if (target.closest("[data-afp-start]")) { build(); var run = one(compact() ? "[data-afp-run]" : "[data-ai-run]"); if (run) run.focus({ preventScroll: true }); return; }
    if (target.closest("[data-afp-reload]")) { location.reload(); return; }
    if (target.closest("[data-afp-menu]")) { var list = one("[data-afp-menu-list]"); menu(Boolean(list && list.hidden)); return; }
    var pressed = target.closest("[data-afp-press]");
    if (pressed) { menu(false); sheet(null); press(pressed.getAttribute("data-afp-press")); return; }
    if (target.closest("[data-afp-run]")) { var puzzle = api(); if (puzzle && puzzle.state().running) { puzzle.stop(); setPhase("building"); } else press("[data-ai-run]"); return; }
    var tabButton = target.closest("button[data-afp-tab]");
    if (tabButton) { tab(tabButton.getAttribute("data-afp-tab")); if (compact()) sheet("side"); return; }
    var sheetButton = target.closest("button[data-afp-sheet]");
    if (sheetButton) { var name = sheetButton.getAttribute("data-afp-sheet"); sheet(html.getAttribute("data-afp-sheet") === name ? null : name); return; }
    if (target.closest("[data-afp-close]")) { sheet(null); return; }
    var zoom = target.closest("[data-afp-zoom]");
    if (zoom && api()) { var how = zoom.getAttribute("data-afp-zoom"); if (how === "fit") api().fit(); else api().zoom(how === "in" ? 1.2 : 1 / 1.2); return; }
    var nextButton = target.closest("[data-afp-next]");
    if (nextButton) { openMission(Number(nextButton.getAttribute("data-afp-next")), true); return; }
    var issue = target.closest("[data-afp-issue]");
    if (issue && lastResult) { var entry = lastResult.issues[Number(issue.getAttribute("data-afp-issue"))]; build(); if (entry && entry.nodes && api()) api().focusNode(entry.nodes[0]); return; }
    if (target.closest("[data-afp-hint]")) { build(); press("[data-ai-hint]"); return; }
    if (target.closest("[data-afp-resume]")) { build(); return; }
    var action = target.closest("[data-afp-sel]");
    if (action) {
      var what = action.getAttribute("data-afp-sel");
      if (what === "connect") press("[data-ai-inspector] [data-ai-start-link]");
      if (what === "remove") press("[data-ai-inspector] [data-ai-remove-node]");
      if (what === "unlink") press("[data-ai-inspector] [data-ai-remove-link-from]");
      if (what === "inspect") { tab("node"); sheet("side"); }
      return;
    }
    /* On a phone the library is a sheet: a node chosen from it lands on the board, and the sheet steps aside. */
    if (target.closest("[data-ai-add-node]") && compact()) { sheet(null); return; }
    if (target.closest("[data-ai-template]") && compact()) sheet(null);
  });

  document.addEventListener("keydown", function (event) {
    if (!active() || event.key !== "Escape") return;
    var list = one("[data-afp-menu-list]");
    if (list && !list.hidden) { menu(false); var button = one("[data-afp-menu]"); if (button) button.focus({ preventScroll: true }); return; }
    if (html.hasAttribute("data-afp-sheet")) { sheet(null); return; }
    if (phase() === "success" || phase() === "failure") build();
  });

  window.addEventListener("popstate", function (event) {
    var wanted = Boolean(event.state && event.state.view === HISTORY_STATE);
    if (wanted && !active()) { pushed = true; openMission(level, true); } else if (!wanted && active()) leave(true);
  });

  /* The engine may already be up (this script runs before the host releases
   * it, but a remount can come later). */
  if (api()) renderHub();
})();
