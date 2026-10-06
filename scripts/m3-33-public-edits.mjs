import assert from "node:assert/strict";

/** Reviewed legacy-runtime edits for Master 3 #33 (React architecture
 * hardening). Each public file is its accepted bytes at 6587ad6 (#32A) plus
 * exactly these [before, after] edits (LF form, one per hunk, each occurring
 * exactly once). Reversing them must reproduce the bytes the earlier phases
 * pinned, so the gates need no git history. Regenerate only together with a
 * reviewed change to these files.
 *
 *   adventure-game.js              the board follows a viewport that gets
 *                                  narrower (rotation, resize); Enter and
 *                                  Space stay with a focused link or button
 *   js/core/shell.js               one overlay owner model: claim/release by
 *                                  root, foreground restore, takeover focus
 *   js/ajoop/assistant.js          conversation ownership (a content re-sync
 *                                  does not restart a begun conversation);
 *                                  the classic entry claims by root
 *   js/features/command-palette.js the classic entry claims by root
 *   js/features/recruiter.js       the classic entry claims by root
 *   js/features/certificates.js    claims by root; keys of a covering overlay
 *                                  are not the dialog's
 *   case-study.js                  keys of a covering overlay are not the
 *                                  gallery's
 *   joyday-paint.js                keys of a covering overlay are not the
 *                                  game's
 *   portfolio-v2.css               responsive hotfix after the merge: a
 *                                  full-row action button wraps a label that
 *                                  is longer than its row instead of letting
 *                                  it overflow the viewport */
export const FINAL_HARDENING_REVIEWED_EDITS = Object.freeze({
  "adventure-game.js": [
    [
      "  function resizeCanvas() {\n    const wrapper = canvas.parentElement;\n    const viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);\n    const width = Math.min(wrapper.clientWidth, 980);\n",
      "  function resizeCanvas() {\n    const wrapper = canvas.parentElement;\n    /* Measure the room the layout offers, not the width set here last time:\n     * that width would hold the wrapper open when the viewport gets narrower\n     * (a rotated tablet, a resized window) and the board would be cut off. */\n    canvas.style.width = \"\";\n    const viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);\n    const width = Math.min(wrapper.clientWidth, 980);\n"
    ],
    [
      "    if (event.key === \"ArrowLeft\" || event.key.toLowerCase() === \"a\") state.dropX = Math.max(LEFT + 36, state.dropX - 24);\n    if (event.key === \"ArrowRight\" || event.key.toLowerCase() === \"d\") state.dropX = Math.min(RIGHT - 36, state.dropX + 24);\n    if (event.key === \" \" || event.key === \"Enter\") { event.preventDefault(); dropItem(); }\n  }, { signal: lifecycle });\n  window.addEventListener(\"resize\", resizeCanvas, { passive: true, signal: lifecycle });\n",
      "    if (event.key === \"ArrowLeft\" || event.key.toLowerCase() === \"a\") state.dropX = Math.max(LEFT + 36, state.dropX - 24);\n    if (event.key === \"ArrowRight\" || event.key.toLowerCase() === \"d\") state.dropX = Math.min(RIGHT - 36, state.dropX + 24);\n    if (event.key === \" \" || event.key === \"Enter\") {\n      /* On a focused link or button these keys are that control's own: the\n       * skip link, the navigation and Restart must stay usable from the keyboard. */\n      if (event.target.closest?.(\"a[href], button, summary, [role='button']\")) return;\n      event.preventDefault();\n      dropItem();\n    }\n  }, { signal: lifecycle });\n  window.addEventListener(\"resize\", resizeCanvas, { passive: true, signal: lifecycle });\n"
    ]
  ],
  "case-study.js": [
    [
      "  document.addEventListener(\"keydown\", (event) => {\n    if (!modal?.classList.contains(\"is-open\")) return;\n    if (event.key === \"Escape\") closeModal();\n    if (event.key === \"Tab\" && modalClose) {\n",
      "  document.addEventListener(\"keydown\", (event) => {\n    if (!modal?.classList.contains(\"is-open\")) return;\n    /* An overlay opened over the gallery makes it inert; its keys are not the\n     * gallery's input, and neither is the Escape that has just closed it. */\n    if (event.defaultPrevented || modal.closest(\"[inert]\")) return;\n    if (event.key === \"Escape\") closeModal();\n    if (event.key === \"Tab\" && modalClose) {\n"
    ]
  ],
  "joyday-paint.js": [
    [
      "  window.addEventListener(\"pointerup\", endPaint, { signal: lifecycle });\n  canvas.addEventListener(\"pointerleave\", endPaint, { signal: lifecycle });\n  window.addEventListener(\"keydown\", (event) => { if (event.key === \"Escape\") closeFinishModal(); }, { signal: lifecycle });\n  window.updateJoydayPaintLanguage = function updateJoydayPaintLanguage() {\n    updateHud();\n",
      "  window.addEventListener(\"pointerup\", endPaint, { signal: lifecycle });\n  canvas.addEventListener(\"pointerleave\", endPaint, { signal: lifecycle });\n  window.addEventListener(\"keydown\", (event) => {\n    /* An open overlay makes the page behind it inert; its keys are not game\n     * input, and neither is the Escape that has just closed it. */\n    if (event.defaultPrevented || canvas.closest(\"[inert]\")) return;\n    if (event.key === \"Escape\") closeFinishModal();\n  }, { signal: lifecycle });\n  window.updateJoydayPaintLanguage = function updateJoydayPaintLanguage() {\n    updateHud();\n"
    ]
  ],
  "js/ajoop/assistant.js": [
    [
      "   * re-routing the message. */\n  lastRoute: null,\n};\n\n",
      "   * re-routing the message. */\n  lastRoute: null,\n  /* Master 3 #33: true from the first turn until the transcript is replaced\n   * (Start over, a site-language change). While it is true the conversation is\n   * the visitor's, and a content re-sync must not restart it. */\n  conversationStarted: false,\n};\n\n"
    ],
    [
      "  const settings = options || {};\n  portfolioChatbotState.lastRoute = route;\n\n  /* Opens the turn before rendering, so a reply still in flight for a previous\n",
      "  const settings = options || {};\n  portfolioChatbotState.lastRoute = route;\n  portfolioChatbotState.conversationStarted = true;\n\n  /* Opens the turn before rendering, so a reply still in flight for a previous\n"
    ],
    [
      "   * here so nothing later tries to commit an answer into it. */\n  ajoopPendingTurn = null;\n  messageList.textContent = \"\";\n  /* The greeting introduces the assistant; it is not an evidence claim, so it\n",
      "   * here so nothing later tries to commit an answer into it. */\n  ajoopPendingTurn = null;\n  portfolioChatbotState.conversationStarted = false;\n  messageList.textContent = \"\";\n  /* The greeting introduces the assistant; it is not an evidence claim, so it\n"
    ],
    [
      "  language = getCurrentLocale(),\n) {\n  portfolioChatbotState.language = renderableLocaleId(language);\n  /* A site language change resets the conversation, so the conversation\n   * language starts again from the new site locale — and the turn, history and\n",
      "  language = getCurrentLocale(),\n) {\n  const siteLanguage = renderableLocaleId(language);\n  /* Master 3 #33 conversation ownership. COMMON modules also call this to\n   * announce content they added after the engine started: portfolio-v2.js at\n   * DOMContentLoaded, the games and request modules while the page is still\n   * loading. A re-sync in the language the conversation is already in is not a\n   * new conversation: a visitor who asked something before the page finished\n   * loading keeps the question, its turn in flight and its follow-ups. */\n  const keepConversation =\n    portfolioChatbotState.conversationStarted &&\n    portfolioChatbotState.language === siteLanguage;\n  portfolioChatbotState.language = siteLanguage;\n  /* A site language change resets the conversation, so the conversation\n   * language starts again from the new site locale — and the turn, history and\n"
    ],
    [
      "   * Start over. Called after the new language is set so the mascot returns to\n   * rest already speaking it. */\n  portfolioChatbotState.replyLanguage = portfolioChatbotState.language;\n  endAjoopConversationTurn();\n  const content = getPortfolioChatbotContent(portfolioChatbotState.language);\n  presentAjoop(\"copy\", {\n",
      "   * Start over. Called after the new language is set so the mascot returns to\n   * rest already speaking it. */\n  if (!keepConversation) {\n    portfolioChatbotState.replyLanguage = portfolioChatbotState.language;\n    endAjoopConversationTurn();\n  }\n  const content = getPortfolioChatbotContent(portfolioChatbotState.language);\n  presentAjoop(\"copy\", {\n"
    ],
    [
      "    closeLabel: content.closeLabel,\n  });\n  renderChatbotQuickActions();\n  resetChatbotMessages();\n  renderAjoopBridgeStatus();\n}\n",
      "    closeLabel: content.closeLabel,\n  });\n  if (!keepConversation) {\n    renderChatbotQuickActions();\n    resetChatbotMessages();\n  }\n  renderAjoopBridgeStatus();\n}\n"
    ],
    [
      "  toggle.setAttribute(\"aria-expanded\", String(isOpen));\n  if (isOpen) {\n    setBackgroundInert(widget);\n    setOverlayBodyState(true);\n    /* One probe per open, subject to the bridge's own backoff. No polling loop:\n     * when the bridge is not configured this is a no-op. */\n",
      "  toggle.setAttribute(\"aria-expanded\", String(isOpen));\n  if (isOpen) {\n    claimOverlay(widget);\n    /* One probe per open, subject to the bridge's own backoff. No polling loop:\n     * when the bridge is not configured this is a no-op. */\n"
    ],
    [
      "    setTimeout(focusAjoopEntry, 80);\n  } else if (wasOpen) {\n    setBackgroundInert();\n    setOverlayBodyState(false);\n    if (restoreFocus) restoreOverlayFocus(panel);\n    else overlayTriggerMap.delete(panel);\n  }\n}\n",
      "    setTimeout(focusAjoopEntry, 80);\n  } else if (wasOpen) {\n    releaseOverlay(widget);\n    if (restoreFocus) restoreOverlayFocus(panel);\n  }\n}\n"
    ]
  ],
  "js/core/shell.js": [
    [
      "const navLinks = document.querySelector(\"[data-nav]\");\n\nconst overlayTriggerMap = new WeakMap();\nlet inertedBackgroundElements = [];\n\nfunction getFocusableElements(container) {\n",
      "const navLinks = document.querySelector(\"[data-nav]\");\n\nconst overlayTriggerMap = new Map();\nlet inertedBackgroundElements = [];\n/* Open overlay roots in the order they were opened; the last is the foreground. */\nconst openOverlayRoots = [];\n\nfunction getFocusableElements(container) {\n"
    ],
    [
      "\nfunction rememberOverlayTrigger(container, trigger = document.activeElement) {\n  if (container && trigger instanceof HTMLElement) {\n    overlayTriggerMap.set(container, trigger);\n  }\n}\n\nfunction restoreOverlayFocus(container) {\n  const trigger = container ? overlayTriggerMap.get(container) : null;\n  if (trigger?.isConnected) trigger.focus();\n  if (container) overlayTriggerMap.delete(container);\n}\n\nfunction setBackgroundInert(activeRoot = null) {\n  inertedBackgroundElements.forEach(({ element, wasInert }) => {\n",
      "\nfunction rememberOverlayTrigger(container, trigger = document.activeElement) {\n  if (!container || !(trigger instanceof HTMLElement)) return;\n  /* Asked to open again from inside itself (Ctrl+K in the open palette), an\n   * overlay keeps the control it was first opened from. */\n  if (container.contains(trigger) && overlayTriggerMap.has(container)) return;\n  overlayTriggerMap.set(container, trigger);\n}\n\nfunction restoreOverlayFocus(container) {\n  let trigger = container ? overlayTriggerMap.get(container) : null;\n  /* A takeover starts inside the overlay it replaces (Ctrl+K in the open Ajoop\n   * panel). That overlay is closed by now, so focus goes back to the control\n   * it was opened from, not to an element that is no longer on screen. */\n  const replaced = new Set();\n  for (;;) {\n    const from = Array.from(overlayTriggerMap.keys()).find(\n      (other) =>\n        other !== container &&\n        !replaced.has(other) &&\n        other.contains(trigger) &&\n        !isOverlayOpen(other),\n    );\n    if (!from) break;\n    replaced.add(from);\n    trigger = overlayTriggerMap.get(from);\n  }\n  replaced.forEach((other) => overlayTriggerMap.delete(other));\n  if (trigger?.isConnected) trigger.focus();\n  if (container) overlayTriggerMap.delete(container);\n}\n\n/* overlay-ownership:start\n * One owner model for everything that covers the page: Ajoop, the Command\n * Palette, Recruiter Mode and the page dialogs that use this contract.\n *\n * An overlay claims the page by its own root element and releases it by that\n * same element. Whoever claimed last is the foreground: only it is\n * interactive, everything else is inert, and the page is marked\n * `overlay-modal-open` for as long as any overlay is open. Releasing is\n * checked against the claim, so an overlay that is not open — or a second\n * owner of the same markup taking over, as React does at hydration — cannot\n * clear state another overlay still holds. When the foreground overlay closes\n * over one that is still open, that one becomes the foreground again. */\nfunction isOverlayOpen(container) {\n  return openOverlayRoots.some(\n    (root) => root === container || root.contains(container) || container.contains(root),\n  );\n}\n\nfunction syncOverlayOwnership() {\n  const foreground = openOverlayRoots[openOverlayRoots.length - 1] || null;\n  setBackgroundInert(foreground);\n  setOverlayBodyState(Boolean(foreground));\n}\n\nfunction claimOverlay(root) {\n  if (!root) return;\n  const at = openOverlayRoots.indexOf(root);\n  if (at !== -1) openOverlayRoots.splice(at, 1);\n  openOverlayRoots.push(root);\n  syncOverlayOwnership();\n}\n\nfunction releaseOverlay(root) {\n  const at = openOverlayRoots.indexOf(root);\n  if (at === -1) return false;\n  openOverlayRoots.splice(at, 1);\n  syncOverlayOwnership();\n  return true;\n}\n/* overlay-ownership:end */\n\nfunction setBackgroundInert(activeRoot = null) {\n  inertedBackgroundElements.forEach(({ element, wasInert }) => {\n"
    ]
  ],
  "js/features/certificates.js": [
    [
      "  /* BRIEF 04: the rest of the page becomes interactive again, and focus goes\n   * back to the thumbnail that opened the dialog. */\n  setBackgroundInert(null);\n  setOverlayBodyState(false);\n  restoreOverlayFocus(modal);\n}\n",
      "  /* BRIEF 04: the rest of the page becomes interactive again, and focus goes\n   * back to the thumbnail that opened the dialog. */\n  releaseOverlay(modal);\n  restoreOverlayFocus(modal);\n}\n"
    ],
    [
      "       * tab order, and move focus into the dialog. */\n      rememberOverlayTrigger(modal, button);\n      setBackgroundInert(modal);\n      setOverlayBodyState(true);\n      modalClose?.focus();\n    });\n",
      "       * tab order, and move focus into the dialog. */\n      rememberOverlayTrigger(modal, button);\n      claimOverlay(modal);\n      modalClose?.focus();\n    });\n"
    ],
    [
      "  document.addEventListener(\"keydown\", (event) => {\n    if (!modal.classList.contains(\"is-open\")) return;\n\n    if (event.key === \"Escape\") {\n",
      "  document.addEventListener(\"keydown\", (event) => {\n    if (!modal.classList.contains(\"is-open\")) return;\n    /* Another overlay opened over the dialog makes the page behind it inert;\n     * its keys are not this dialog's input, and neither is the Escape that has\n     * just closed it. */\n    if (event.defaultPrevented || modal.closest(\"[inert]\")) return;\n\n    if (event.key === \"Escape\") {\n"
    ]
  ],
  "js/features/command-palette.js": [
    [
      "  });\n  if (isOpen) {\n    setBackgroundInert(palette);\n    setOverlayBodyState(true);\n    const input = palette.querySelector(\"[data-command-input]\");\n    input.value = \"\";\n",
      "  });\n  if (isOpen) {\n    claimOverlay(palette);\n    const input = palette.querySelector(\"[data-command-input]\");\n    input.value = \"\";\n"
    ],
    [
      "    setTimeout(() => input.focus(), 40);\n  } else if (wasOpen) {\n    setBackgroundInert();\n    setOverlayBodyState(false);\n    if (restoreFocus) restoreOverlayFocus(palette);\n    else overlayTriggerMap.delete(palette);\n  }\n  updateUltimateStaticLabels(currentSiteLanguage || \"en\");\n",
      "    setTimeout(() => input.focus(), 40);\n  } else if (wasOpen) {\n    releaseOverlay(palette);\n    if (restoreFocus) restoreOverlayFocus(palette);\n  }\n  updateUltimateStaticLabels(currentSiteLanguage || \"en\");\n"
    ]
  ],
  "js/features/recruiter.js": [
    [
      "\n  if (isOpen) {\n    setBackgroundInert(drawer);\n    setOverlayBodyState(true);\n    updateUltimateStaticLabels(getCurrentLocale());\n    setTimeout(() => drawer.querySelector(\"[data-recruiter-close]\")?.focus(), 0);\n  } else if (wasOpen) {\n    setBackgroundInert();\n    setOverlayBodyState(false);\n    updateUltimateStaticLabels(getCurrentLocale());\n    if (restoreFocus) restoreOverlayFocus(drawer);\n    else overlayTriggerMap.delete(drawer);\n  }\n}\n",
      "\n  if (isOpen) {\n    claimOverlay(drawer);\n    updateUltimateStaticLabels(getCurrentLocale());\n    setTimeout(() => drawer.querySelector(\"[data-recruiter-close]\")?.focus(), 0);\n  } else if (wasOpen) {\n    releaseOverlay(drawer);\n    updateUltimateStaticLabels(getCurrentLocale());\n    if (restoreFocus) restoreOverlayFocus(drawer);\n  }\n}\n"
    ]
  ],
  "portfolio-v2.css": [
    [
      "    text-align: center;\n    white-space: normal;\n  }\n\n  .project-detail-meta,\n",
      "    text-align: center;\n    white-space: normal;\n  }\n\n  /* Full-row buttons wrap too: a label longer than its row (long localized\n   * copy, a wider fallback font) breaks inside the button instead of spilling\n   * past the viewport. A label that fits on one line renders as before. */\n  .case-actions .btn,\n  .cta-actions .btn,\n  .contact-actions .btn,\n  .request-form-actions .btn,\n  .recruiter-actions .btn {\n    min-width: 0;\n    padding: var(--space-2) var(--space-3);\n    text-align: center;\n    white-space: normal;\n    overflow-wrap: anywhere;\n  }\n\n  .project-detail-meta,\n"
    ]
  ]
});

const lf = (value) => value.replace(/\r\n/g, "\n");

/** The accepted (pre-#33) bytes of a public runtime file. */
export function finalHardeningAcceptedBase(file, content, edits = FINAL_HARDENING_REVIEWED_EDITS[file]) {
  let base = lf(content);
  for (const [from, to] of [...edits].reverse()) {
    assert.equal(base.split(to).length, 2, `${file}: #33 reviewed edit must occur exactly once`);
    base = base.replace(to, () => from);
  }
  return base;
}

/** `content` with the #33 edits reversed when the file carries any. */
export const beforeFinalHardening = (file, content) => (FINAL_HARDENING_REVIEWED_EDITS[file] ? finalHardeningAcceptedBase(file, content) : content);
