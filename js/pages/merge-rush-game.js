/**
 * Merge Rush: Tiny Factory — the portfolio around the game (V4-E06.4).
 *
 * The game is one ES module built in its own repository
 * (assets/merge-rush/merge-rush.js, export mountMergeRush). It owns everything
 * inside its canvas: menu, board, orders, input, timers, audio, pause, the
 * results and Endless. This controller owns the way in and the way out, and
 * nothing else:
 *
 *   page      the portfolio page, with Play
 *   loading   html[data-mr-state="loading"]   the module and its art are on the way
 *   playing   html[data-mr-state="playing"]   the game has the viewport
 *   error     html[data-mr-state="error"]     it did not arrive: Retry, Exit, Case Study
 *
 * Nothing of the game is requested before Play, so no visitor pays for the
 * engine without asking for it. One history entry is added on entering;
 * browser Back returns to the page. Leaving destroys the game: the canvas,
 * its audio and its listeners go with it. css/v4-merge-rush.css lays the page
 * out for each state.
 */
(function () {
  var root = document.querySelector("[data-mr-root]");
  if (!root) return;

  var html = document.documentElement;
  var STATE = "data-mr-state";
  var HISTORY_STATE = "merge-rush";
  var READY_TIMEOUT = 25000;
  var host = root.querySelector("[data-mr-canvas]");
  var game = null;
  var pending = null;
  var attempt = 0;
  var run = 0;
  var pushed = false;
  var held = [];
  var returnFocus = null;
  var scrollY = 0;
  var readyTimer = 0;

  var active = function () { return html.hasAttribute(STATE); };
  var setState = function (name) {
    if (name) html.setAttribute(STATE, name);
    else html.removeAttribute(STATE);
  };

  /* While the game has the viewport, the rest of the document is out of reach
   * of the keyboard and of assistive technology, not only out of sight. */
  function hold(on) {
    if (!on) {
      held.forEach(function (node) { node.inert = false; });
      held = [];
      return;
    }
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node.tagName === "MAIN" || node.tagName === "SCRIPT" || node.inert) return;
      node.inert = true;
      held.push(node);
    });
    Array.prototype.forEach.call(root.parentNode.children, function (node) {
      if (node === root || node.inert) return;
      node.inert = true;
      held.push(node);
    });
  }

  function destroyGame() {
    window.clearTimeout(readyTimer);
    if (game) {
      try { game.destroy(); } catch (error) { /* a game that failed to start has nothing to release */ }
      game = null;
    }
    while (host.firstChild) host.removeChild(host.firstChild);
  }

  function focusFirst(selector) {
    var target = root.querySelector(selector);
    if (target) target.focus({ preventScroll: true });
  }

  function fail() {
    run += 1;
    destroyGame();
    if (!active()) return;
    setState("error");
    focusFirst("[data-mr-retry]");
  }

  function load() {
    if (!pending) {
      /* A module that failed once is asked for again under a new address. */
      var address = root.getAttribute("data-mr-module") + (attempt > 0 ? "?retry=" + attempt : "");
      pending = import(address);
    }
    return pending;
  }

  function start() {
    var mine = (run += 1);
    destroyGame();
    setState("loading");
    focusFirst("[data-mr-loading] [data-mr-exit]");
    readyTimer = window.setTimeout(function () { if (mine === run) fail(); }, READY_TIMEOUT);
    load().then(function (module) {
      if (mine !== run || !active()) return;
      game = module.mountMergeRush(host, {
        locale: root.getAttribute("data-mr-locale") || html.lang || "en",
        host: "portfolio",
        assetBase: new URL(root.getAttribute("data-mr-assets"), window.location.href).href,
        onReady: function () {
          if (mine !== run) return;
          window.clearTimeout(readyTimer);
          setState("playing");
          var canvas = host.querySelector("canvas");
          if (canvas) {
            canvas.setAttribute("tabindex", "0");
            canvas.setAttribute("aria-label", root.getAttribute("aria-label") || "");
            canvas.focus({ preventScroll: true });
          }
        },
        onError: function () { if (mine === run) fail(); },
        onExit: function () { exit(true); },
      });
    }).catch(function () {
      pending = null;
      attempt += 1;
      if (mine === run) fail();
    });
  }

  function enter(fromHistory) {
    if (active()) return;
    returnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    scrollY = window.scrollY;
    hold(true);
    if (!fromHistory && window.history && history.pushState) {
      try {
        history.pushState({ view: HISTORY_STATE }, "", window.location.pathname + window.location.search);
        pushed = true;
      } catch (error) { pushed = false; }
    }
    start();
  }

  function exit(back) {
    if (!active()) return;
    run += 1;
    destroyGame();
    setState(null);
    hold(false);
    /* Once now, and once after the browser has applied its own idea of where the entry was. */
    var restore = scrollY;
    window.scrollTo(0, restore);
    window.requestAnimationFrame(function () { if (!active()) window.scrollTo(0, restore); });
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    else {
      /* Play is on the page, outside the stage. */
      var play = document.querySelector("[data-mr-enter]");
      if (play) play.focus({ preventScroll: true });
    }
    returnFocus = null;
    /* The entry this game added to the history goes with it. */
    if (back && pushed) {
      pushed = false;
      history.back();
    }
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-mr-enter]")) { event.preventDefault(); enter(false); return; }
    if (target.closest("[data-mr-retry]")) { event.preventDefault(); start(); return; }
    if (target.closest("[data-mr-exit]")) { event.preventDefault(); exit(true); }
  });

  /* Inside the game, Escape is the game's pause. Around it, it leaves. */
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var state = html.getAttribute(STATE);
    if (state === "loading" || state === "error") exit(true);
  });

  window.addEventListener("popstate", function () {
    if (!active()) return;
    pushed = false;
    exit(false);
  });

  /* A page restored from the back/forward cache comes back as the page. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && active()) { pushed = false; exit(false); }
  });

  html.setAttribute("data-mr-ready", "");
})();
