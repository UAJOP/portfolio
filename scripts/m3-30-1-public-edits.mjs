import { labsGamesAcceptedBase } from "./m3-30-public-edits.mjs";

/** Reviewed edits to the #30 lifecycle host (production hotfix after #31).
 * js/pages/engine-host.js is its accepted #30 bytes plus exactly these
 * [before, after] edits (LF form, one per hunk, each occurring exactly once).
 *
 * The host starts the engines without hydration when the React client bundle
 * cannot be fetched. It recognised that by any `type="module"` script failing
 * to load, so an unrelated module — in production, an analytics beacon the
 * CDN injects and a tracker blocker refuses — released the engines while
 * React was still hydrating; React then re-rendered <main> and discarded the
 * interface the engine had built. The fallback now answers only to the React
 * entry element itself: the module script the document declares directly
 * after its last hydration payload. Reversing the edits reproduces the hash
 * #30 pinned, so the parity gate needs no git history. */
export const ENGINE_HOST_REVIEWED_EDITS = Object.freeze({
  "js/pages/engine-host.js": [
    [
      "  const HYDRATED_EVENT = \"portfolio:react-main-hydrated\";\n",
      "  const HYDRATED_EVENT = \"portfolio:react-main-hydrated\";\n  /* The React client entry is one element: the module script a React document\n   * declares directly after its last hydration payload. It is identified by\n   * that position, not by its address, so another module with a similar URL\n   * is never mistaken for it. */\n  const LAST_HYDRATION_PAYLOAD = \"react-command-props\";\n  const isReactEntry = (target) => {\n    const entry = document.getElementById(LAST_HYDRATION_PAYLOAD)?.nextElementSibling;\n    return target instanceof HTMLScriptElement && target.type === \"module\" && target === entry;\n  };\n",
    ],
    [
      "   * for; the server-rendered markup is final, so the game still starts. */\n",
      "   * for; the server-rendered markup is final, so the game still starts. Only\n   * that script counts. Any other module that fails to load (an analytics\n   * beacon a tracker blocker refuses, say) says nothing about hydration, and\n   * starting an engine then would change markup React is still hydrating. */\n",
    ],
    [
      "      const target = event.target;\n      if (target instanceof HTMLScriptElement && target.type === \"module\") release();\n",
      "      if (isReactEntry(event.target)) release();\n",
    ],
  ],
});

export function engineHostAcceptedBase(file, content, edits = ENGINE_HOST_REVIEWED_EDITS[file]) {
  return labsGamesAcceptedBase(file, content, edits);
}
