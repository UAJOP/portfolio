import assert from "node:assert/strict";

/** Reviewed legacy-runtime edits for Master 3 #30 (Labs and mini-game shells).
 * Each public file is its accepted 760feca bytes plus exactly these
 * [before, after] edits (LF form, one per hunk, each occurring exactly once).
 * They give the four retained engines an explicit, abortable lifecycle, keep
 * game keys out of an open overlay, stand the client-side lab-card renderer
 * down below React-owned markup, and repair one accepted defect: the AI Flow
 * edge label threw "tr is not defined" (since ad10eae), so no connection or
 * template could be made. No other game mechanic changes. Reversing them must
 * reproduce the hash an earlier phase pinned, so the gate needs no git
 * history. Regenerate only together with a reviewed change to these files. */
export const LABS_GAMES_REVIEWED_EDITS = Object.freeze({
  "adventure-game.js": [
    [
      "(function () {\n",
      "function startCareerAdventure(lifecycle) {\n",
    ],
    [
      "      setTimeout(resetGame, 1600);\n",
      "      setTimeout(() => { if (!lifecycle.aborted) resetGame(); }, 1600);\n",
    ],
    [
      "\n  function loop() {\n",
      "\n  let frame = 0;\n  function loop() {\n",
    ],
    [
      "  function loop() {\n",
      "  function loop() {\n    if (lifecycle.aborted) return;\n",
    ],
    [
      "    requestAnimationFrame(loop);\n",
      "    frame = requestAnimationFrame(loop);\n",
    ],
    [
      "    state.dropX = toCanvasX(event.clientX);\n  });\n",
      "    state.dropX = toCanvasX(event.clientX);\n  }, { signal: lifecycle });\n",
    ],
    [
      "    dropItem();\n  });\n",
      "    dropItem();\n  }, { signal: lifecycle });\n",
    ],
    [
      "    }\n  });\n",
      "    }\n  }, { signal: lifecycle });\n",
    ],
    [
      "    if (activeTouchPointer === event.pointerId) activeTouchPointer = null;\n  });\n",
      "    if (activeTouchPointer === event.pointerId) activeTouchPointer = null;\n  }, { signal: lifecycle });\n",
    ],
    [
      "  document.querySelector(\"[data-adventure-drop]\")?.addEventListener(\"click\", dropItem);\n  document.querySelectorAll(\"[data-adventure-restart]\").forEach((button) => button.addEventListener(\"click\", resetGame));\n",
      "  document.querySelector(\"[data-adventure-drop]\")?.addEventListener(\"click\", dropItem, { signal: lifecycle });\n  document.querySelectorAll(\"[data-adventure-restart]\").forEach((button) => button.addEventListener(\"click\", resetGame, { signal: lifecycle }));\n",
    ],
    [
      "    if (!document.body.contains(canvas)) return;\n",
      "    if (!document.body.contains(canvas)) return;\n    /* An open overlay makes the page behind it inert; its keys are not game input. */\n    if (canvas.closest(\"[inert]\")) return;\n",
    ],
    [
      "  });\n  window.addEventListener(\"resize\", resizeCanvas, { passive: true });\n",
      "  }, { signal: lifecycle });\n  window.addEventListener(\"resize\", resizeCanvas, { passive: true, signal: lifecycle });\n",
    ],
    [
      "  window.updateCareerAdventureLanguage = function updateCareerAdventureLanguage() { applyText(); };\n",
      "  window.updateCareerAdventureLanguage = function updateCareerAdventureLanguage() { applyText(); };\n  lifecycle.addEventListener(\"abort\", () => {\n    cancelAnimationFrame(frame);\n    delete window.updateCareerAdventureLanguage;\n  }, { once: true });\n",
    ],
    [
      "})();\n",
      "}\n/* Master 3 #30: a React-owned document hosts this engine through\n * js/pages/engine-host.js, which starts it after hydration and can stop it.\n * A legacy document boots it immediately, exactly as before. */\nif (document.querySelector(\"main[data-react-main]\")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push([\"adventure\", startCareerAdventure]);\nelse startCareerAdventure(new AbortController().signal);\n",
    ],
  ],
  "ai-flow-puzzle.js": [
    [
      "(function () {\n",
      "function startAiFlowPuzzle(lifecycle) {\n",
    ],
    [
      "    const text = (en, tr) => getI18nText(en, tr, lang());\n",
      "    const text = (en, tr) => getI18nText(en, tr, lang());\n    /* The three labels below read this flag; without it every connection threw. */\n    const tr = lang() === \"tr\";\n",
    ],
    [
      "    els.scenarioHolder.querySelectorAll(\"[data-ai-scenario]\").forEach((button) => button.addEventListener(\"click\", () => resetScenario(Number(button.dataset.aiScenario))));\n",
      "    els.scenarioHolder.querySelectorAll(\"[data-ai-scenario]\").forEach((button) => button.addEventListener(\"click\", () => resetScenario(Number(button.dataset.aiScenario)), { signal: lifecycle }));\n",
    ],
    [
      "    }));\n",
      "    }, { signal: lifecycle }));\n",
    ],
    [
      "    els.paletteHolder.querySelectorAll(\"[data-ai-add-node]\").forEach((button) => button.addEventListener(\"click\", () => addNode(button.dataset.aiAddNode)));\n",
      "    els.paletteHolder.querySelectorAll(\"[data-ai-add-node]\").forEach((button) => button.addEventListener(\"click\", () => addNode(button.dataset.aiAddNode), { signal: lifecycle }));\n",
    ],
    [
      "      element.addEventListener(\"pointerdown\", (event) => beginDrag(event, node.id));\n      element.addEventListener(\"click\", (event) => { event.preventDefault(); handleNodeClick(node.id); });\n",
      "      element.addEventListener(\"pointerdown\", (event) => beginDrag(event, node.id), { signal: lifecycle });\n      element.addEventListener(\"click\", (event) => { event.preventDefault(); handleNodeClick(node.id); }, { signal: lifecycle });\n",
    ],
    [
      "    requestAnimationFrame(renderLines);\n",
      "    requestAnimationFrame(() => { if (!lifecycle.aborted) renderLines(); });\n",
    ],
    [
      "    document.addEventListener(\"pointermove\", onMove);\n    document.addEventListener(\"pointerup\", onUp);\n",
      "    document.addEventListener(\"pointermove\", onMove, { signal: lifecycle });\n    document.addEventListener(\"pointerup\", onUp, { signal: lifecycle });\n",
    ],
    [
      "    const onUp = () => { document.removeEventListener(\"pointermove\", onMove); document.removeEventListener(\"pointerup\", onUp); setTimeout(() => { state.drag = null; }, 0); };\n",
      "    /* The deferred clear belongs to this drag: a press that follows the release\n     * before the timer runs has already started the next one. */\n    const onUp = () => { const drag = state.drag; document.removeEventListener(\"pointermove\", onMove); document.removeEventListener(\"pointerup\", onUp); setTimeout(() => { if (state.drag === drag) state.drag = null; }, 0); };\n",
    ],
    [
      "      });\n",
      "      }, { signal: lifecycle });\n",
    ],
    [
      "    els.inspector.querySelectorAll(\"[data-ai-start-link]\").forEach((button) => button.addEventListener(\"click\", () => { state.selectedSourceId = button.dataset.aiStartLink; renderAll(); setStatus(t(\"activeSource\"), \"active\"); }));\n    els.inspector.querySelectorAll(\"[data-ai-remove-node]\").forEach((button) => button.addEventListener(\"click\", () => removeNode(button.dataset.aiRemoveNode)));\n    els.inspector.querySelectorAll(\"[data-ai-remove-link-from]\").forEach((button) => button.addEventListener(\"click\", () => removeLink(button.dataset.aiRemoveLinkFrom, button.dataset.aiRemoveLinkTo)));\n",
      "    els.inspector.querySelectorAll(\"[data-ai-start-link]\").forEach((button) => button.addEventListener(\"click\", () => { state.selectedSourceId = button.dataset.aiStartLink; renderAll(); setStatus(t(\"activeSource\"), \"active\"); }, { signal: lifecycle }));\n    els.inspector.querySelectorAll(\"[data-ai-remove-node]\").forEach((button) => button.addEventListener(\"click\", () => removeNode(button.dataset.aiRemoveNode), { signal: lifecycle }));\n    els.inspector.querySelectorAll(\"[data-ai-remove-link-from]\").forEach((button) => button.addEventListener(\"click\", () => removeLink(button.dataset.aiRemoveLinkFrom, button.dataset.aiRemoveLinkTo), { signal: lifecycle }));\n",
    ],
    [
      "\n  function importJsonFile(file) {\n",
      "\n  /* File reads this engine started and that have not finished. Disposal aborts\n   * them, and a completion that was already on its way is ignored: it must not\n   * write into the board of an engine mounted afterwards. */\n  const pendingReaders = new Set();\n\n  function importJsonFile(file) {\n",
    ],
    [
      "    if (!file) return;\n",
      "    if (!file || lifecycle.aborted) return;\n",
    ],
    [
      "    const reader = new FileReader();\n",
      "    const reader = new FileReader();\n    pendingReaders.add(reader);\n    reader.onloadend = () => { pendingReaders.delete(reader); };\n",
    ],
    [
      "    reader.onload = () => {\n",
      "    reader.onload = () => {\n      if (lifecycle.aborted) return;\n",
    ],
    [
      "    } catch (error) {\n",
      "    } catch (error) {\n      if (lifecycle.aborted) return;\n",
    ],
    [
      "    }\n    setStatus(t(\"summaryCopied\"), \"success\");\n",
      "    }\n    if (lifecycle.aborted) return;\n    setStatus(t(\"summaryCopied\"), \"success\");\n",
    ],
    [
      "    document.querySelector(\"[data-ai-run]\")?.addEventListener(\"click\", runFlow);\n    document.querySelector(\"[data-ai-validate]\")?.addEventListener(\"click\", () => validateCurrentFlow(true));\n    document.querySelector(\"[data-ai-hint]\")?.addEventListener(\"click\", showHint);\n    document.querySelector(\"[data-ai-arrange]\")?.addEventListener(\"click\", autoArrange);\n    document.querySelector(\"[data-ai-reset]\")?.addEventListener(\"click\", () => resetScenario(state.scenarioIndex));\n    document.querySelector(\"[data-ai-export]\")?.addEventListener(\"click\", exportJson);\n    document.querySelector(\"[data-ai-import]\")?.addEventListener(\"click\", () => els.importInput?.click());\n    els.importInput?.addEventListener(\"change\", () => importJsonFile(els.importInput.files?.[0]));\n    document.querySelector(\"[data-ai-copy]\")?.addEventListener(\"click\", copySummary);\n    document.querySelector(\"[data-ai-report]\")?.addEventListener(\"click\", downloadReport);\n    document.querySelector(\"[data-ai-png]\")?.addEventListener(\"click\", downloadPng);\n    document.querySelector(\"[data-ai-next]\")?.addEventListener(\"click\", nextScenario);\n    document.querySelector(\"[data-ai-scroll-game]\")?.addEventListener(\"click\", () => document.getElementById(\"ai-flow-puzzle-game\")?.scrollIntoView({ behavior: \"smooth\", block: \"start\" }));\n    window.addEventListener(\"resize\", renderLines);\n",
      "    document.querySelector(\"[data-ai-run]\")?.addEventListener(\"click\", runFlow, { signal: lifecycle });\n    document.querySelector(\"[data-ai-validate]\")?.addEventListener(\"click\", () => validateCurrentFlow(true), { signal: lifecycle });\n    document.querySelector(\"[data-ai-hint]\")?.addEventListener(\"click\", showHint, { signal: lifecycle });\n    document.querySelector(\"[data-ai-arrange]\")?.addEventListener(\"click\", autoArrange, { signal: lifecycle });\n    document.querySelector(\"[data-ai-reset]\")?.addEventListener(\"click\", () => resetScenario(state.scenarioIndex), { signal: lifecycle });\n    document.querySelector(\"[data-ai-export]\")?.addEventListener(\"click\", exportJson, { signal: lifecycle });\n    document.querySelector(\"[data-ai-import]\")?.addEventListener(\"click\", () => els.importInput?.click(), { signal: lifecycle });\n    els.importInput?.addEventListener(\"change\", () => importJsonFile(els.importInput.files?.[0]), { signal: lifecycle });\n    document.querySelector(\"[data-ai-copy]\")?.addEventListener(\"click\", copySummary, { signal: lifecycle });\n    document.querySelector(\"[data-ai-report]\")?.addEventListener(\"click\", downloadReport, { signal: lifecycle });\n    document.querySelector(\"[data-ai-png]\")?.addEventListener(\"click\", downloadPng, { signal: lifecycle });\n    document.querySelector(\"[data-ai-next]\")?.addEventListener(\"click\", nextScenario, { signal: lifecycle });\n    document.querySelector(\"[data-ai-scroll-game]\")?.addEventListener(\"click\", () => document.getElementById(\"ai-flow-puzzle-game\")?.scrollIntoView({ behavior: \"smooth\", block: \"start\" }), { signal: lifecycle });\n    window.addEventListener(\"resize\", renderLines, { signal: lifecycle });\n",
    ],
    [
      "    document.addEventListener(\"keydown\", (event) => {\n",
      "    document.addEventListener(\"keydown\", (event) => {\n      /* An open overlay makes the page behind it inert; its keys are not game input. */\n      if (board.closest(\"[inert]\")) return;\n",
    ],
    [
      "      if (event.key === \"Escape\") { state.selectedSourceId = null; state.selectedNodeId = null; state.selectedLinkKey = null; renderAll(); setStatus(t(\"connectTip\")); }\n    });\n",
      "      if (event.key === \"Escape\") { state.selectedSourceId = null; state.selectedNodeId = null; state.selectedLinkKey = null; renderAll(); setStatus(t(\"connectTip\")); }\n    }, { signal: lifecycle });\n",
    ],
    [
      "})();\n",
      "  lifecycle.addEventListener(\"abort\", () => {\n    state.runSerial += 1;\n    clearTimeout(state.runTimer);\n    pendingReaders.forEach((reader) => reader.abort());\n    pendingReaders.clear();\n    delete window.updateAiFlowPuzzleLanguage;\n  }, { once: true });\n}\n/* Master 3 #30: a React-owned document hosts this engine through\n * js/pages/engine-host.js, which starts it after hydration and can stop it.\n * A legacy document boots it immediately, exactly as before. */\nif (document.querySelector(\"main[data-react-main]\")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push([\"aiFlowPuzzle\", startAiFlowPuzzle]);\nelse startAiFlowPuzzle(new AbortController().signal);\n",
    ],
  ],
  "joyday-paint.js": [
    [
      "(function () {\n",
      "function startJoydayPaint(lifecycle) {\n",
    ],
    [
      "      button.addEventListener(\"click\", () => setColor(button.dataset.joydayColor, true));\n",
      "      button.addEventListener(\"click\", () => setColor(button.dataset.joydayColor, true), { signal: lifecycle });\n",
    ],
    [
      "      window.setTimeout(() => {\n",
      "      window.setTimeout(() => {\n        if (lifecycle.aborted) return;\n",
    ],
    [
      "      setCanvasSize(state.canvasType);\n    });\n",
      "      setCanvasSize(state.canvasType);\n    }, { signal: lifecycle });\n",
    ],
    [
      "      updateHud();\n    });\n",
      "      updateHud();\n    }, { signal: lifecycle });\n",
    ],
    [
      "  });\n\n  customColor?.addEventListener(\"input\", () => setColor(customColor.value, false));\n  thicknessInput?.addEventListener(\"input\", () => { state.thickness = clamp(Number(thicknessInput.value) || 50, 1, 100); updateHud(); });\n  intensityInput?.addEventListener(\"input\", () => { state.intensity = clamp(Number(intensityInput.value) || 60, 15, 100); updateHud(); });\n  suggestPaletteButton?.addEventListener(\"click\", suggestPalette);\n  newThemeButton?.addEventListener(\"click\", selectRandomTheme);\n  starterButton?.addEventListener(\"click\", starterStains);\n  remixButton?.addEventListener(\"click\", remixFlow);\n  soundToggle?.addEventListener(\"click\", () => { state.sound = !state.sound; if (state.sound) setupAudio(); updateHud(); });\n  undoButton?.addEventListener(\"click\", () => restoreSnapshot(state.historyIndex - 1));\n  redoButton?.addEventListener(\"click\", () => restoreSnapshot(state.historyIndex + 1));\n  clearButton?.addEventListener(\"click\", () => { resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); });\n  finishButton?.addEventListener(\"click\", openFinishModal);\n  downloadButton?.addEventListener(\"click\", downloadPNG);\n  modalClose?.addEventListener(\"click\", closeFinishModal);\n  modal?.addEventListener(\"click\", (event) => { if (event.target === modal) closeFinishModal(); });\n  modalNew?.addEventListener(\"click\", () => { closeFinishModal(); resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); document.getElementById(\"joyday-paint-game\")?.scrollIntoView({ behavior: \"smooth\", block: \"start\" }); });\n  artNameInput?.addEventListener(\"input\", updatePreview);\n  signatureInput?.addEventListener(\"change\", updatePreview);\n",
      "  }, { signal: lifecycle });\n\n  customColor?.addEventListener(\"input\", () => setColor(customColor.value, false), { signal: lifecycle });\n  thicknessInput?.addEventListener(\"input\", () => { state.thickness = clamp(Number(thicknessInput.value) || 50, 1, 100); updateHud(); }, { signal: lifecycle });\n  intensityInput?.addEventListener(\"input\", () => { state.intensity = clamp(Number(intensityInput.value) || 60, 15, 100); updateHud(); }, { signal: lifecycle });\n  suggestPaletteButton?.addEventListener(\"click\", suggestPalette, { signal: lifecycle });\n  newThemeButton?.addEventListener(\"click\", selectRandomTheme, { signal: lifecycle });\n  starterButton?.addEventListener(\"click\", starterStains, { signal: lifecycle });\n  remixButton?.addEventListener(\"click\", remixFlow, { signal: lifecycle });\n  soundToggle?.addEventListener(\"click\", () => { state.sound = !state.sound; if (state.sound) setupAudio(); updateHud(); }, { signal: lifecycle });\n  undoButton?.addEventListener(\"click\", () => restoreSnapshot(state.historyIndex - 1), { signal: lifecycle });\n  redoButton?.addEventListener(\"click\", () => restoreSnapshot(state.historyIndex + 1), { signal: lifecycle });\n  clearButton?.addEventListener(\"click\", () => { resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); }, { signal: lifecycle });\n  finishButton?.addEventListener(\"click\", openFinishModal, { signal: lifecycle });\n  downloadButton?.addEventListener(\"click\", downloadPNG, { signal: lifecycle });\n  modalClose?.addEventListener(\"click\", closeFinishModal, { signal: lifecycle });\n  modal?.addEventListener(\"click\", (event) => { if (event.target === modal) closeFinishModal(); }, { signal: lifecycle });\n  modalNew?.addEventListener(\"click\", () => { closeFinishModal(); resetArtworkState(); clearDrawingSurface(); saveSnapshot(); updateHud(); document.getElementById(\"joyday-paint-game\")?.scrollIntoView({ behavior: \"smooth\", block: \"start\" }); }, { signal: lifecycle });\n  artNameInput?.addEventListener(\"input\", updatePreview, { signal: lifecycle });\n  signatureInput?.addEventListener(\"change\", updatePreview, { signal: lifecycle });\n",
    ],
    [
      "      updatePreview();\n    });\n",
      "      updatePreview();\n    }, { signal: lifecycle });\n",
    ],
    [
      "  canvas.addEventListener(\"pointerdown\", beginPaint);\n  canvas.addEventListener(\"pointermove\", movePaint);\n  window.addEventListener(\"pointerup\", endPaint);\n  canvas.addEventListener(\"pointerleave\", endPaint);\n  window.addEventListener(\"keydown\", (event) => { if (event.key === \"Escape\") closeFinishModal(); });\n",
      "  canvas.addEventListener(\"pointerdown\", beginPaint, { signal: lifecycle });\n  canvas.addEventListener(\"pointermove\", movePaint, { signal: lifecycle });\n  window.addEventListener(\"pointerup\", endPaint, { signal: lifecycle });\n  canvas.addEventListener(\"pointerleave\", endPaint, { signal: lifecycle });\n  window.addEventListener(\"keydown\", (event) => { if (event.key === \"Escape\") closeFinishModal(); }, { signal: lifecycle });\n",
    ],
    [
      "})();\n",
      "  lifecycle.addEventListener(\"abort\", () => {\n    closeFinishModal();\n    state.audio?.close?.();\n    state.audio = null;\n    delete window.updateJoydayPaintLanguage;\n  }, { once: true });\n}\n/* Master 3 #30: a React-owned document hosts this engine through\n * js/pages/engine-host.js, which starts it after hydration and can stop it.\n * A legacy document boots it immediately, exactly as before. */\nif (document.querySelector(\"main[data-react-main]\")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push([\"joydayPaint\", startJoydayPaint]);\nelse startJoydayPaint(new AbortController().signal);\n",
    ],
  ],
  "js/pages/labs.js": [
    [
      "function setupAlgorithmic3DLab() {\n",
      "function setupAlgorithmic3DLab(lifecycle) {\n",
    ],
    [
      "    canvas.setPointerCapture?.(event.pointerId);\n  });\n",
      "    canvas.setPointerCapture?.(event.pointerId);\n  }, { signal: lifecycle });\n",
    ],
    [
      "    draw();\n  });\n",
      "    draw();\n  }, { signal: lifecycle });\n",
    ],
    [
      "    state.dragging = false;\n  });\n  canvas.addEventListener(\"pointercancel\", () => {\n",
      "    state.dragging = false;\n  }, { signal: lifecycle });\n  canvas.addEventListener(\"pointercancel\", () => {\n",
    ],
    [
      "    state.dragging = false;\n  });\n  canvas.addEventListener(\n",
      "    state.dragging = false;\n  }, { signal: lifecycle });\n  canvas.addEventListener(\n",
    ],
    [
      "    { passive: false },\n",
      "    { passive: false, signal: lifecycle },\n",
    ],
    [
      "    { passive: true },\n",
      "    { passive: true, signal: lifecycle },\n",
    ],
    [
      "    observer.observe(canvas);\n",
      "    observer.observe(canvas);\n    lifecycle.addEventListener(\"abort\", () => observer.disconnect(), { once: true });\n",
    ],
    [
      "  }\n}\n",
      "  }\n  lifecycle.addEventListener(\"abort\", stop, { once: true });\n}\n",
    ],
    [
      " * after the implementation is defined instead of from an earlier COMMON module. */\nsetupAlgorithmic3DLab();\n",
      " * after the implementation is defined instead of from an earlier COMMON module.\n *\n * Master 3 #30: a React-owned document hosts this engine through\n * js/pages/engine-host.js, which starts it after hydration and can stop it.\n * A legacy document boots it immediately, exactly as before. */\nif (document.querySelector(\"main[data-react-main]\")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push([\"labs\", setupAlgorithmic3DLab]);\nelse setupAlgorithmic3DLab(new AbortController().signal);\n",
    ],
  ],
  "portfolio-v2.js": [
    [
      "    document.querySelectorAll(\"[data-labs-grid]\").forEach((container) => {\n",
      "    document.querySelectorAll(\"[data-labs-grid]\").forEach((container) => {\n      if (container.closest(\"[data-react-main]\")) return;\n",
    ],
  ],
});

/** Public files #30 adds, pinned by canonical (LF) sha256. */
export const LABS_GAMES_NEW_PUBLIC_FILES = Object.freeze({
  "js/pages/engine-host.js": "04b3893e9b7e4e1e896df36564d6d6c2b214b087b5d1f7a4d58cbcf2a5ab9f7f"
});

const lf = (value) => value.replace(/\r\n/g, "\n");

export function labsGamesAcceptedBase(file, content, edits = LABS_GAMES_REVIEWED_EDITS[file]) {
  let base = lf(content);
  for (const [from, to] of [...edits].reverse()) {
    assert.equal(base.split(to).length, 2, `${file}: #30 reviewed edit must occur exactly once`);
    base = base.replace(to, () => from);
  }
  return base;
}
