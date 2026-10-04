/**
 * Lifecycle host for the retained vanilla engines on React-owned documents
 * (Master 3 #30): the Algorithmic 3D Lab, Career Adventure, Joyday Action
 * Painting and AI Flow Puzzle.
 *
 * React server-renders and hydrates the page shell; the engines keep every
 * mechanic. An engine never boots itself on a React document. It queues its
 * start function in `window.KaanEngineQueue`, and this host — the last classic
 * script of the document — owns one explicit lifecycle per engine:
 *
 *   mount    once, after `portfolio:react-main-hydrated`, so hydration always
 *            compares the server markup with an untouched DOM
 *   dispose  aborts the engine's AbortSignal, which removes every listener it
 *            registered and stops its animation frame and timers
 *   remount  mount after dispose starts a fresh engine on the same markup
 *
 * `mount` is idempotent, and an engine id that is queued again (the same
 * script evaluated twice) is ignored, so nothing can initialize twice.
 *
 * Legacy documents do not load this file; there the engines boot directly.
 */
(function () {
  if (window.KaanEngineHost) return;

  const HYDRATED_EVENT = "portfolio:react-main-hydrated";
  /* The React client entry is one element: the module script a React document
   * declares directly after its last hydration payload. It is identified by
   * that position, not by its address, so another module with a similar URL
   * is never mistaken for it. */
  const LAST_HYDRATION_PAYLOAD = "react-command-props";
  const isReactEntry = (target) => {
    const entry = document.getElementById(LAST_HYDRATION_PAYLOAD)?.nextElementSibling;
    return target instanceof HTMLScriptElement && target.type === "module" && target === entry;
  };
  const engines = new Map();
  let released = false;

  function define(id, start) {
    if (typeof id !== "string" || typeof start !== "function" || engines.has(id)) return;
    let controller = null;
    const engine = {
      id,
      get mounted() {
        return controller !== null;
      },
      mount() {
        if (controller) return engine;
        const next = new AbortController();
        controller = next;
        try {
          start(next.signal);
        } catch (error) {
          controller = null;
          next.abort();
          throw error;
        }
        return engine;
      },
      dispose() {
        if (!controller) return engine;
        const current = controller;
        controller = null;
        current.abort();
        return engine;
      },
    };
    engines.set(id, engine);
    if (released) engine.mount();
  }

  function release() {
    if (released) return;
    released = true;
    engines.forEach((engine) => {
      try {
        engine.mount();
      } catch (error) {
        console.error(`Engine "${engine.id}" failed to start`, error);
      }
    });
  }

  const queued = Array.isArray(window.KaanEngineQueue) ? window.KaanEngineQueue : [];
  window.KaanEngineQueue = { push: (entry) => define(entry[0], entry[1]) };
  queued.forEach((entry) => define(entry[0], entry[1]));

  window.KaanEngineHost = {
    get: (id) => engines.get(id) || null,
    ids: () => Array.from(engines.keys()),
    get released() {
      return released;
    },
  };

  window.addEventListener(HYDRATED_EVENT, release, { once: true });
  /* If the React client bundle cannot be fetched there is no hydration to wait
   * for; the server-rendered markup is final, so the game still starts. Only
   * that script counts. Any other module that fails to load (an analytics
   * beacon a tracker blocker refuses, say) says nothing about hydration, and
   * starting an engine then would change markup React is still hydrating. */
  document.addEventListener(
    "error",
    (event) => {
      if (isReactEntry(event.target)) release();
    },
    true,
  );
})();
