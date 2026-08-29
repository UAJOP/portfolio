/**
 * Recruiter Mode drawer.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 3643-3893.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const recruiterItems = {
  en: {
    profile: "Forward Deployed Engineer",
    focus: [
      "Conversational AI",
      "Solution Engineering",
      "LLM Evaluation",
      "Workflow Automation",
    ],
    skills: [
      "Chatbot flow design, QA and stabilization",
      "n8n-style multi-step workflow logic",
      "LLM response, reasoning, code and multimodal evaluation",
      "Python, C#/.NET, JavaScript, PHP and SQL",
      "User-centered digital product development",
    ],
    capabilities: [
      "Applied AI",
      "AI Reliability",
      "Solution Engineering",
      "Conversational AI",
      "Automation",
      "Product Engineering",
    ],
    proof: [
      "Enterprise conversational AI experience at CBOT across QA, stabilization, channel configuration and large-scale flow restructuring.",
      "Designed, built, tested and presented an insurance claims intake POC with voice, phone verification, WhatsApp handoff and document collection.",
      "Structured LLM evaluation and quality-assessment work covering reasoning, code and multimodal outputs.",
      "Live digital product and reservation automation at Atölye Joyday using JavaScript, Google Forms, Sheets and Apps Script.",
    ],
    projects: [
      [
        "SINAMA — AI Agent Reliability Lab",
        "Live Turkish-first AI agent reliability and regression testing lab",
        "sinama-case-study.html",
        "View Case Study",
      ],
      [
        "AI Chatbot Flow Design",
        "Conversational AI and enterprise workflow evidence",
        "projects/ai-chatbot-flow-design/",
      ],
      [
        "AI Flow Puzzle",
        "Live node-logic, fallback and validation demo",
        "ai-flow-puzzle-case-study.html",
        "View Case Study",
      ],
      [
        "Atölye Joyday Official Website",
        "Live digital product and reservation journey",
        "atolye-joyday-case-study.html",
        "View Case Study",
      ],
      [
        "Hospital Form App",
        "C# Windows Forms and SQL Server workflow project preserved as a source archive.",
        "hospital-system-case-study.html",
        "View Case Study",
      ],
    ],
    buttons: {
      cv: "View Resume",
      contact: "Email Me",
      linkedin: "LinkedIn",
      close: "Close",
    },
  },
  tr: {
    profile: "Forward Deployed Engineer",
    focus: [
      "Conversational AI",
      "Solution Engineering",
      "LLM Değerlendirme",
      "Workflow Otomasyonu",
    ],
    skills: [
      "Chatbot akış tasarımı, QA ve stabilizasyon",
      "n8n tarzı çok adımlı workflow mantığı",
      "LLM yanıt, akıl yürütme, kod ve multimodal değerlendirme",
      "Python, C#/.NET, JavaScript, PHP ve SQL",
      "Kullanıcı odaklı dijital ürün geliştirme",
    ],
    capabilities: [
      "Applied AI",
      "AI Reliability",
      "Solution Engineering",
      "Conversational AI",
      "Automation",
      "Product Engineering",
    ],
    proof: [
      "CBOT'ta QA, stabilizasyon, kanal yapılandırması ve büyük ölçekli akış yeniden yapılandırmayı kapsayan kurumsal conversational AI deneyimi.",
      "Ses, telefon doğrulama, WhatsApp aktarımı ve belge toplama içeren sigorta hasar başvuru POC'sini tasarladı, geliştirdi, test etti ve sundu.",
      "Akıl yürütme, kod ve multimodal çıktıları kapsayan yapılandırılmış LLM değerlendirme ve kalite çalışmaları.",
      "JavaScript, Google Forms, Sheets ve Apps Script ile Atölye Joyday canlı dijital ürünü ve rezervasyon otomasyonu.",
    ],
    projects: [
      [
        "SINAMA — AI Agent Reliability Lab",
        "Canlı, Türkçe öncelikli AI agent reliability ve regression test lab'ı",
        "sinama-case-study.html",
        "Vaka Çalışmasını Gör",
      ],
      [
        "AI Chatbot Akış Tasarımı",
        "Conversational AI ve kurumsal workflow kanıtı",
        "projects/ai-chatbot-flow-design/",
      ],
      [
        "AI Flow Puzzle",
        "Canlı node mantığı, fallback ve doğrulama demosu",
        "ai-flow-puzzle-case-study.html",
        "Vaka Çalışmasını Gör",
      ],
      [
        "Atölye Joyday Resmi Web Sitesi",
        "Canlı dijital ürün ve rezervasyon yolculuğu",
        "atolye-joyday-case-study.html",
        "Vaka Çalışmasını Gör",
      ],
      [
        "Hospital Form App",
        "Kaynak arşivi olarak korunan C# Windows Forms ve SQL Server iş akışı projesi.",
        "hospital-system-case-study.html",
        "Vaka Çalışmasını Gör",
      ],
    ],
    buttons: {
      cv: "CV'yi Görüntüle",
      contact: "E-posta",
      linkedin: "LinkedIn",
      close: "Kapat",
    },
  },
};

function renderRecruiterDrawer(language = currentSiteLanguage || "en") {
  const drawer = document.querySelector("[data-recruiter-drawer]");
  if (!drawer) return;
  const hadFocus = drawer.contains(document.activeElement);
  const content = getUltimateContent(language);
  const data = recruiterItems[language === "tr" ? "tr" : "en"];
  drawer.innerHTML = `
    <div class="recruiter-card">
      <button class="recruiter-close" type="button" data-recruiter-close aria-label="${escapeProjectHtml(data.buttons.close)}"><i class="bx bx-x" aria-hidden="true"></i></button>
      <p class="eyebrow">${escapeProjectHtml(content.recruiterLabel)}</p>
      <h2 id="recruiter-dialog-title">${escapeProjectHtml(content.recruiterTitle)}</h2>
      <p id="recruiter-dialog-description">${escapeProjectHtml(content.recruiterLead)}</p>
      <div class="recruiter-status"><span></span>${escapeProjectHtml(content.availability)}</div>
      <h3>${language === "tr" ? "Ana kimlik" : "Primary profile"}</h3>
      <div class="recruiter-primary-profile">${escapeProjectHtml(data.profile)}</div>
      <h3>${language === "tr" ? "Odak" : "Focus"}</h3>
      <div class="mini-stack">${data.focus.map((item) => `<span>${escapeProjectHtml(item)}</span>`).join("")}</div>
      <h3>${escapeProjectHtml(content.skillsTitle)}</h3>
      <div class="mini-stack">${data.skills.map((item) => `<span>${escapeProjectHtml(item)}</span>`).join("")}</div>
      <h3>${language === "tr" ? "Yetkinlik alanları" : "Capability areas"}</h3>
      <div class="recruiter-role-list">${data.capabilities.map((item) => `<span>${escapeProjectHtml(item)}</span>`).join("")}</div>
      <h3>${language === "tr" ? "Deneyim kanıtları" : "Experience evidence"}</h3>
      <ul class="recruiter-proof-list">${data.proof.map((item) => `<li>${escapeProjectHtml(item)}</li>`).join("")}</ul>
      <h3>${escapeProjectHtml(content.projectsTitle)}</h3>
      <div class="recruiter-links">${data.projects.map((item) => `<a href="${escapeProjectHtml(item[2])}">${escapeProjectHtml(item[0])}<small>${escapeProjectHtml(item[1])}</small>${item[3] ? `<span>${escapeProjectHtml(item[3])}</span>` : ""}</a>`).join("")}</div>
      <div class="recruiter-actions">
        <button class="btn primary" type="button" onclick="openDrivePreviews()">${escapeProjectHtml(data.buttons.cv)}</button>
        <a class="btn ghost" href="mailto:kaanb8776@gmail.com">${escapeProjectHtml(data.buttons.contact)}</a>
        <a class="btn ghost" href="https://www.linkedin.com/in/balcikaan/" target="_blank" rel="noopener">${escapeProjectHtml(data.buttons.linkedin)}</a>
      </div>
    </div>`;
  drawer
    .querySelector("[data-recruiter-close]")
    ?.addEventListener("click", () => setRecruiterMode(false));
  if (hadFocus) drawer.querySelector("[data-recruiter-close]")?.focus();
}

/* recruiter-intent:start
 * Session-scoped memory of "this visitor is evaluating Kaan for a role".
 *
 * BRIEF 00 recorded that Recruiter Mode does not persist. It is a modal dialog
 * (role="dialog", aria-modal), so re-opening it automatically on every page
 * would hijack focus and behave like popup spam — explicitly out of bounds.
 * What persists is the *intent*, not the open dialog: the toggle stays marked
 * as active so one click resumes, and the visitor keeps control.
 *
 * sessionStorage, not localStorage: evaluating a candidate is a single sitting,
 * and a flag that survived for weeks would be confusing rather than helpful.
 *
 * Extracted by scripts/qa-recruiter-ux.mjs — keep this block DOM-free.
 */
const RECRUITER_INTENT_KEY = "kaanbalci-recruiter-intent";

function readRecruiterIntent(store) {
  try {
    return (store || sessionStorage).getItem(RECRUITER_INTENT_KEY) === "active";
  } catch (error) {
    /* Storage can be blocked; recruiter mode still works, it just forgets. */
    return false;
  }
}

function writeRecruiterIntent(isActive, store) {
  try {
    const target = store || sessionStorage;
    if (isActive) target.setItem(RECRUITER_INTENT_KEY, "active");
    else target.removeItem(RECRUITER_INTENT_KEY);
    return true;
  } catch (error) {
    return false;
  }
}
/* recruiter-intent:end */

function setRecruiterMode(
  isOpen,
  { restoreFocus = true, trigger = null } = {},
) {
  const drawer = document.querySelector("[data-recruiter-drawer]");
  if (!drawer) return;
  const wasOpen = document.body.classList.contains("recruiter-mode-active");

  if (isOpen) {
    closeMobileNavigation();
    setChatbotOpen(false, { restoreFocus: false });
    setCommandPaletteOpen(false, { restoreFocus: false });
    rememberOverlayTrigger(
      drawer,
      trigger || document.querySelector("[data-recruiter-toggle]"),
    );
  }

  document.body.classList.toggle("recruiter-mode-active", Boolean(isOpen));
  /* Opening records the intent for this session; closing clears it. */
  writeRecruiterIntent(Boolean(isOpen));
  applyRecruiterIntentMarker(Boolean(isOpen));
  drawer.hidden = !isOpen;
  drawer.setAttribute("aria-hidden", String(!isOpen));
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", String(isOpen));
  });

  if (isOpen) {
    setBackgroundInert(drawer);
    setOverlayBodyState(true);
    updateUltimateStaticLabels(currentSiteLanguage || "en");
    setTimeout(() => drawer.querySelector("[data-recruiter-close]")?.focus(), 0);
  } else if (wasOpen) {
    setBackgroundInert();
    setOverlayBodyState(false);
    updateUltimateStaticLabels(currentSiteLanguage || "en");
    if (restoreFocus) restoreOverlayFocus(drawer);
    else overlayTriggerMap.delete(drawer);
  }
}

/** Marks the toggle so a returning recruiter can see the mode is still theirs. */
function applyRecruiterIntentMarker(isActive) {
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {
    button.classList.toggle("is-recruiter-intent", Boolean(isActive));
  });
}

function setupRecruiterMode() {
  if (document.querySelector("[data-recruiter-drawer]")) return;
  const drawer = document.createElement("div");
  drawer.className = "recruiter-drawer";
  drawer.id = "recruiter-dialog";
  drawer.setAttribute("data-recruiter-drawer", "");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-labelledby", "recruiter-dialog-title");
  drawer.setAttribute("aria-describedby", "recruiter-dialog-description");
  drawer.hidden = true;
  document.body.appendChild(drawer);
  renderRecruiterDrawer();
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {
    button.setAttribute("aria-controls", drawer.id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) =>
        setRecruiterMode(
          !document.body.classList.contains("recruiter-mode-active"),
          { trigger: event.currentTarget },
        ),
      );
  });
  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) setRecruiterMode(false);
  });
  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("recruiter-mode-active")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setRecruiterMode(false);
      return;
    }
    trapFocus(event, drawer);
  });

  /* Carry the intent across navigation WITHOUT re-opening the dialog: the
   * toggle shows the mode is still active and one click resumes it. Auto-
   * opening a focus-trapping modal on every page would be a dark pattern. */
  applyRecruiterIntentMarker(readRecruiterIntent());
}

