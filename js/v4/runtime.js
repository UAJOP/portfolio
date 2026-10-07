/* V4 motion runtime.
 *
 * Progressive enhancement for the primitives in css/v4-system.css. The page is
 * complete without it; this adds only what CSS cannot know:
 *
 *   [data-v4-ambient]     pointer position, as --v4-px / --v4-py (-1 to 1)
 *   [data-v4-flow]        which stage the pointer is nearest
 *   [data-v4-magnetic]    pointer offset inside an action
 *   [data-v4-kinetic]     one light sweep after first paint
 *   [data-v4-eco]         which node is active, and what it is connected to
 *   [data-v4-card]        pointer position inside a connected card
 *   [data-v4-arrive]      a row of cards receiving the signal when first seen
 *   [data-v4-rail]        a filter rail whose set of cards has just changed
 *   all V4 regions        paused while outside the viewport, and their
 *                         bounded signal replayed when they return
 *
 * Discipline: no animation loop. Pointer input is coalesced into at most one
 * frame of style writes; nothing is measured while idle; reduced motion and
 * coarse pointers skip pointer response entirely; every listener and observer
 * hangs off one AbortController, so V4Motion.destroy() leaves nothing behind.
 * Loaded only by documents that consume V4 primitives. */
(function () {
  "use strict";

  if (window.V4Motion) return;

  var REGIONS = "[data-v4-ambient], [data-v4-flow], [data-v4-signal-rule], [data-v4-eco], [data-v4-arrive]";
  /* Regions that hold their first-view moment until they are first seen. */
  var FIRST_VIEW = "[data-v4-eco], [data-v4-arrive]";
  var FOCUS_RADIUS = 96;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var controller = null;
  var observer = null;
  var frame = 0;
  var writes = new Map();

  /* One frame for every pending write, last value per key wins. */
  function write(key, apply) {
    writes.set(key, apply);
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      var pending = Array.from(writes.values());
      writes.clear();
      pending.forEach(function (run) { run(); });
    });
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler, { passive: true, signal: controller.signal });
  }

  function token(name, fallback) {
    var value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  /* The signal is one journey, then rest. Replay starts it again: when a flow
   * returns to view only if the last journey has finished, and from the top
   * when a pointer focus is released, so every part restarts in step. */
  function signalAnimations() {
    if (!document.getAnimations) return [];
    return document.getAnimations().filter(function (animation) {
      return /^v4-(flow|rule)-/.test(animation.animationName || "");
    });
  }

  function replay(force) {
    if (reducedMotion.matches) return;
    var animations = signalAnimations();
    if (force !== true && animations.some(function (animation) { return animation.playState !== "finished"; })) return;
    animations.forEach(function (animation) { animation.cancel(); animation.play(); });
  }

  function pauseOffscreen(root) {
    if (!("IntersectionObserver" in window)) return;
    var away = new WeakSet();
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.toggleAttribute("data-v4-paused", !entry.isIntersecting);
        /* First-view moments play once, the first time their region is seen. */
        if (entry.isIntersecting) entry.target.removeAttribute("data-v4-await");
        if (!entry.isIntersecting) away.add(entry.target);
        else if (away.delete(entry.target) && entry.target.hasAttribute("data-v4-flow")) replay();
      });
    }, { rootMargin: "64px" });
    root.querySelectorAll(REGIONS).forEach(function (region) {
      if (!reducedMotion.matches && region.matches(FIRST_VIEW) && region.getBoundingClientRect().top > window.innerHeight) region.setAttribute("data-v4-await", "");
      observer.observe(region);
    });
  }

  function ambient(region) {
    var rect = null;
    listen(region, "pointerenter", function (event) {
      rect = region.getBoundingClientRect();
      if (event.pointerType !== "touch") region.setAttribute("data-v4-pointer", "");
    });
    listen(region, "pointermove", function (event) {
      if (event.pointerType === "touch") return;
      rect = rect || region.getBoundingClientRect();
      var x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      var y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      write(region, function () {
        region.style.setProperty("--v4-px", x.toFixed(3));
        region.style.setProperty("--v4-py", y.toFixed(3));
      });
    });
    listen(region, "pointerleave", function () {
      rect = null;
      region.removeAttribute("data-v4-pointer");
      write(region, function () {
        region.style.removeProperty("--v4-px");
        region.style.removeProperty("--v4-py");
      });
    });
  }

  function flow(root) {
    var stages = Array.from(root.querySelectorAll("[data-v4-flow-stage]"));
    var centres = null;
    var current = null;

    function measure() {
      centres = stages.map(function (stage) {
        var node = (stage.querySelector(".v4-flow__node") || stage).getBoundingClientRect();
        return { x: node.left + node.width / 2, y: node.top + node.height / 2 };
      });
    }

    function focus(next) {
      if (next === current) return;
      var released = Boolean(current) && !next;
      current = next;
      write(root, function () {
        root.toggleAttribute("data-v4-flow-focused", Boolean(next));
        stages.forEach(function (stage) { stage.toggleAttribute("data-v4-flow-focus", stage === next); });
        root.querySelectorAll("[data-v4-flow-link]").forEach(function (link) {
          link.toggleAttribute("data-v4-on", Boolean(next) && link.getAttribute("data-v4-flow-link") === next.getAttribute("data-v4-flow-stage"));
        });
        /* Letting go of a stage sends the signal round again. */
        if (released) replay(true);
      });
    }

    listen(root, "pointerenter", measure);
    listen(root, "pointermove", function (event) {
      if (event.pointerType === "touch") return;
      if (!centres) measure();
      var nearest = null;
      var best = FOCUS_RADIUS;
      centres.forEach(function (centre, index) {
        var distance = Math.hypot(event.clientX - centre.x, event.clientY - centre.y);
        if (distance < best) { best = distance; nearest = stages[index]; }
      });
      focus(nearest);
    });
    listen(root, "pointerleave", function () { centres = null; focus(null); });
    /* A scroll or resize moves the stages under a resting pointer. */
    listen(window, "scroll", function () { centres = null; });
    listen(window, "resize", function () { centres = null; });
  }

  function magnetic(action) {
    var amplitude = token("--v4-amp-magnetic", 6);
    var rect = null;
    listen(action, "pointerenter", function () { rect = action.getBoundingClientRect(); });
    listen(action, "pointermove", function (event) {
      if (event.pointerType === "touch") return;
      rect = rect || action.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      write(action, function () {
        action.style.setProperty("--v4-mx", ((x - 0.5) * 2 * amplitude).toFixed(2) + "px");
        action.style.setProperty("--v4-my", ((y - 0.5) * 2 * amplitude * 0.7).toFixed(2) + "px");
        action.style.setProperty("--v4-hx", (x * 100).toFixed(1) + "%");
        action.style.setProperty("--v4-hy", (y * 100).toFixed(1) + "%");
      });
    });
    listen(action, "pointerleave", function () {
      rect = null;
      write(action, function () {
        ["--v4-mx", "--v4-my", "--v4-hx", "--v4-hy"].forEach(function (name) { action.style.removeProperty(name); });
      });
    });
  }

  /* Ecosystem: pointing at, focusing or pressing a node activates it. Its real
   * connections (data-v4-eco-links, authored from the catalog) light up, the
   * rest recedes, and any connected card on the page for a lit project answers.
   * Pressing a capability pins it, which is also the whole touch behaviour;
   * Escape or a second press releases it. */
  function ecosystem(root) {
    var nodes = Array.from(root.querySelectorAll("[data-v4-eco-node]"));
    var edges = Array.from(root.querySelectorAll("[data-v4-edge]"));
    var cards = Array.from(document.querySelectorAll("[data-v4-card]")).map(function (card) {
      var link = card.querySelector("a[href]");
      var id = link ? link.getAttribute("href").split("/").filter(Boolean).pop() : null;
      return { card: card, id: id };
    }).filter(function (entry) { return entry.id; });
    var ports = Array.from(document.querySelectorAll("[data-v4-cap]"));
    var readout = (root.parentElement || document).querySelector("[data-v4-eco-readout]");
    var lines = readout ? Array.from(readout.querySelectorAll("span")) : [];
    var resting = lines.map(function (line) { return line.textContent; });
    var labelOf = function (node) { return (node.querySelector(".v4-eco__title, span") || node).textContent.trim(); };
    var pinned = null;
    var shown = null;

    function show(id) {
      if (id === shown) return;
      shown = id;
      write(root, function () {
        var active = nodes.find(function (node) { return node.getAttribute("data-v4-eco-node") === id; });
        var related = active ? active.getAttribute("data-v4-eco-links").split(" ") : [];
        root.toggleAttribute("data-v4-eco-active", Boolean(active));
        nodes.forEach(function (node) {
          var own = node.getAttribute("data-v4-eco-node");
          var state = !active ? null : own === id ? "active" : related.indexOf(own) >= 0 ? "related" : null;
          if (state) node.setAttribute("data-v4-state", state); else node.removeAttribute("data-v4-state");
        });
        edges.forEach(function (edge) {
          var lit = Boolean(active) && edge.getAttribute("data-v4-edge").split(" ").indexOf(id) >= 0;
          if (lit) edge.setAttribute("data-v4-state", "active"); else edge.removeAttribute("data-v4-state");
        });
        var projects = !active ? [] : active.getAttribute("data-v4-eco-kind") === "project" ? [id] : related;
        cards.forEach(function (entry) { entry.card.toggleAttribute("data-v4-related", projects.indexOf(entry.id) >= 0); });
        /* The same capability, wherever else it is carried on the page. */
        var capabilities = !active ? [] : active.getAttribute("data-v4-eco-kind") === "capability" ? [id] : related;
        ports.forEach(function (port) {
          if (capabilities.indexOf(port.getAttribute("data-v4-cap")) >= 0) port.setAttribute("data-v4-state", "related"); else port.removeAttribute("data-v4-state");
        });
        /* Say what is lit, in the lit nodes' own words. */
        if (lines.length >= 2) {
          readout.toggleAttribute("data-v4-live", Boolean(active));
          lines[0].textContent = active ? labelOf(active) : resting[0];
          lines[1].textContent = active ? nodes.filter(function (node) { return related.indexOf(node.getAttribute("data-v4-eco-node")) >= 0; }).map(labelOf).join(" · ") : resting[1];
        }
      });
    }

    function pin(id) {
      pinned = id;
      nodes.forEach(function (node) {
        if (node.hasAttribute("aria-pressed")) node.setAttribute("aria-pressed", String(node.getAttribute("data-v4-eco-node") === id));
      });
      show(id);
    }

    var nodeOf = function (event) { return event.target.closest ? event.target.closest("[data-v4-eco-node]") : null; };
    listen(root, "pointerover", function (event) {
      var node = nodeOf(event);
      if (node && event.pointerType !== "touch") show(node.getAttribute("data-v4-eco-node"));
    });
    listen(root, "pointerleave", function () { show(pinned); });
    listen(root, "focusin", function (event) {
      var node = nodeOf(event);
      if (node) show(node.getAttribute("data-v4-eco-node"));
    });
    listen(root, "focusout", function (event) {
      if (!root.contains(event.relatedTarget)) show(pinned);
    });
    listen(root, "click", function (event) {
      var node = nodeOf(event);
      if (!node || node.getAttribute("data-v4-eco-kind") !== "capability") return;
      var id = node.getAttribute("data-v4-eco-node");
      pin(pinned === id ? null : id);
    });
    listen(root, "keydown", function (event) {
      if (event.key === "Escape" && pinned) pin(null);
    });
  }

  /* A filter rail: when its set of cards changes, the set is told so (the
   * cards take the current once) and the rail carries a count of what is
   * showing, read from the cards themselves after the catalog has updated.
   * The catalog's own logic decides what shows; nothing here filters. */
  function rail(bar) {
    var scope = bar.closest("section") || document;
    var search = scope.querySelector("[data-project-search]");
    var cards = function () { return Array.from(scope.querySelectorAll("[data-v4-card]")); };
    var two = function (value) { return (value < 10 ? "0" : "") + value; };
    function count() {
      var all = cards();
      var showing = all.filter(function (entry) { return !entry.classList.contains("is-hidden"); }).length;
      bar.setAttribute("data-v4-count", two(showing) + " / " + two(all.length));
    }
    function changed() {
      /* Two frames: after the catalog's own render has landed. */
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        count();
        if (reducedMotion.matches) return;
        scope.removeAttribute("data-v4-reconfig");
        void scope.offsetWidth;
        scope.setAttribute("data-v4-reconfig", "");
      }); });
    }
    count();
    listen(bar, "click", function (event) { if (event.target.closest && event.target.closest("button")) changed(); });
    if (search) listen(search, "input", changed);
  }

  function card(surface) {
    var rect = null;
    listen(surface, "pointerenter", function () { rect = surface.getBoundingClientRect(); });
    listen(surface, "pointermove", function (event) {
      if (event.pointerType === "touch") return;
      rect = rect || surface.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      write(surface, function () {
        surface.style.setProperty("--v4-hx", (x * 100).toFixed(1) + "%");
        surface.style.setProperty("--v4-hy", (y * 100).toFixed(1) + "%");
        surface.style.setProperty("--v4-cx", (x * 2 - 1).toFixed(3));
        surface.style.setProperty("--v4-cy", (y * 2 - 1).toFixed(3));
      });
    });
    listen(surface, "pointerleave", function () {
      rect = null;
      write(surface, function () {
        ["--v4-hx", "--v4-hy", "--v4-cx", "--v4-cy"].forEach(function (name) { surface.style.removeProperty(name); });
      });
    });
  }

  function kinetic(heading) {
    listen(heading, "animationend", function (event) {
      if (event.target === heading) heading.removeAttribute("data-v4-kinetic-run");
    });
    write(heading, function () { heading.setAttribute("data-v4-kinetic-run", ""); });
  }

  function init(root) {
    destroy();
    root = root || document;
    controller = new AbortController();
    pauseOffscreen(root);
    /* Activation is state, not motion: it works under reduced motion and on
     * touch. Only the pointer-following effects below are gated. */
    root.querySelectorAll("[data-v4-eco]").forEach(ecosystem);
    root.querySelectorAll("[data-v4-rail]").forEach(rail);
    if (reducedMotion.matches) return;
    root.querySelectorAll("[data-v4-kinetic]").forEach(kinetic);
    if (!finePointer.matches) return;
    root.querySelectorAll("[data-v4-ambient]").forEach(ambient);
    root.querySelectorAll("[data-v4-flow]").forEach(flow);
    root.querySelectorAll("[data-v4-magnetic]").forEach(magnetic);
    root.querySelectorAll("[data-v4-card]").forEach(card);
  }

  function destroy() {
    if (controller) controller.abort();
    if (observer) observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    controller = observer = null;
    frame = 0;
    writes.clear();
  }

  window.V4Motion = { init: init, destroy: destroy, replay: replay };

  /* React owns the markup these primitives live in. Hydration has to finish,
   * and be seen to finish untouched, before anything here writes to it: start
   * two frames and a task after React's completion signal. A document without
   * React starts on DOM ready. */
  var started = false;
  function start() {
    if (started) return;
    started = true;
    init(document);
  }
  if (document.querySelector("main[data-react-main]")) {
    window.addEventListener("portfolio:react-main-hydrated", function () {
      requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(start, 0); }); });
    }, { once: true });
    window.addEventListener("load", function () { setTimeout(start, 1500); }, { once: true });
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  /* A change of motion preference or pointer type re-evaluates everything. */
  [reducedMotion, finePointer].forEach(function (query) {
    query.addEventListener("change", function () { if (started) init(document); });
  });
})();
