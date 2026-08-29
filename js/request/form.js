/**
 * Request form copy, status UI and submit binding.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 4660-4729, 4874-5080.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function getRequestFormText() {
  const tr = (currentSiteLanguage || "en") === "tr";
  return tr
    ? {
        sending: "Talep gönderiliyor...",
        success:
          "Talebiniz alındı ve kaydedildi. En kısa sürede dönüş yapacağım. Dilersen doğrudan e-posta da gönderebilirsin:",
        timeout:
          "Talep zaman aşımına uğradı ve gönderildiği doğrulanamadı. Bilgilerin formda duruyor; tekrar deneyebilir veya e-posta ile ulaşabilirsin:",
        neutral: "Teşekkürler.",
        fallback:
          "Mail gönderim endpointi henüz bağlanmadığı için e-posta taslağı açıldı. Google Apps Script URL'si request-config.js içine eklenince form direkt mail atacak.",
        error:
          "Talep gönderilemedi ve kaydedildiği doğrulanamadı. Bilgilerin formda duruyor; tekrar deneyebilir veya e-posta ile ulaşabilirsin:",
        consent: "Devam etmek için iletişim iznini onaylamalısın.",
        subject: "Yeni proje talebi",
        button: "Talebi Gönder",
      }
    : {
        sending: "Sending request...",
        success:
          "Your request was received and recorded. I will get back to you shortly. You can also reach me directly at:",
        timeout:
          "The request timed out and could not be confirmed as sent. Your details are still in the form — please try again, or email:",
        neutral: "Thank you.",
        fallback:
          "The direct email endpoint is not connected yet, so an email draft was opened. After adding the Google Apps Script URL into request-config.js, the form will send emails directly.",
        error:
          "The request could not be delivered and was not confirmed as recorded. Your details are still in the form — please try again, or email:",
        consent: "Please confirm the consent checkbox to continue.",
        subject: "New project request",
        button: "Send Request",
      };
}

function setRequestStatus(type, message, { showEmail = false } = {}) {
  const status = document.querySelector("[data-request-status]");
  if (!status) return;
  status.className = `request-status is-visible ${type || ""}`.trim();
  status.replaceChildren(document.createTextNode(message));
  if (showEmail) {
    const email = window.KAAN_REQUEST_FORM_EMAIL || "kaanb8776@gmail.com";
    const link = document.createElement("a");
    link.href = `mailto:${email}`;
    link.textContent = email;
    status.append(document.createTextNode(" "), link);
  }
}

function buildRequestMailto(payload) {
  const owner = window.KAAN_REQUEST_FORM_EMAIL || "kaanb8776@gmail.com";
  const subject = `${getRequestFormText().subject}: ${payload.serviceType || "Portfolio"}`;
  const body = [
    `Name: ${payload.name || ""}`,
    `Email: ${payload.email || ""}`,
    `Phone: ${payload.phone || ""}`,
    `Company: ${payload.company || ""}`,
    `Project Type: ${payload.serviceType || ""}`,
    `Budget: ${payload.budget || ""}`,
    `Timeline: ${payload.timeline || ""}`,
    `Preferred Contact: ${payload.preferredContact || ""}`,
    "",
    "Project Details:",
    payload.details || "",
    "",
    `Source: ${payload.source || "kaanbalci.com"}`,
  ].join("\n");
  return `mailto:${encodeURIComponent(owner)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}


function setupProjectRequestForm() {
  const form = document.querySelector("[data-request-form]");
  if (!form || form.__requestFormReady) return;
  form.__requestFormReady = true;
  form.__requestFormStartedAt = Date.now();
  const submit = form.querySelector("[data-request-submit]");
  let requestSubmitting = false;

  const recordRequestStart = (event) => {
    const control = event.target?.closest?.("input, select, textarea");
    if (!control || control.type === "hidden") return;
    if (typeof trackRequestStartOnce === "function") {
      trackRequestStartOnce(form);
    }
  };
  form.addEventListener("focusin", recordRequestStart);
  form.addEventListener("change", recordRequestStart);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (requestSubmitting) return;
    const text = getRequestFormText();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!form.querySelector('input[name="consent"]')?.checked) {
      setRequestStatus("warning", text.consent);
      return;
    }

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const honeypot = String(payload.company_website || "").trim();
    const completedTooQuickly = Date.now() - form.__requestFormStartedAt < 3000;
    delete payload.company_website;

    if (honeypot || completedTooQuickly) {
      form.reset();
      form.__requestFormStartedAt = Date.now();
      setRequestStatus("success", text.neutral);
      return;
    }

    payload.pageUrl = window.location.href;
    payload.submittedAt = new Date().toISOString();

    const endpoint = String(window.KAAN_REQUEST_FORM_ENDPOINT || "").trim();
    requestSubmitting = true;
    form.setAttribute("aria-busy", "true");
    if (submit) {
      submit.disabled = true;
      submit.textContent = text.sending;
    }

    try {
      if (
        endpoint &&
        !endpoint.includes("PASTE") &&
        endpoint.startsWith("http")
      ) {
        const requestId = createRequestId();
        payload.requestId = requestId;

        const result = await submitRequestPayload({ endpoint, payload, requestId });

        if (result.state === REQUEST_SUBMISSION_STATE.SUCCESS) {
          /* Only a confirmed acceptance clears the user's work. */
          if (typeof trackAnalyticsEvent === "function") {
            trackAnalyticsEvent(ANALYTICS_EVENTS.REQUEST_SUBMIT, {
              source: "request",
            });
          }
          form.reset();
          form.__requestFormStartedAt = Date.now();
          setRequestStatus("success", text.success, { showEmail: true });
        } else {
          /* Form values are deliberately left intact so the user can retry. */
          console.error("Request form submission failed", {
            requestId: result.requestId,
            reason: result.reason,
            status: result.status,
            serverError: result.serverError,
            error: result.error,
          });
          setRequestStatus(
            "error",
            result.reason === "timeout" ? text.timeout : text.error,
            { showEmail: true },
          );
        }
      } else {
        window.location.href = buildRequestMailto(payload);
        setRequestStatus("warning", text.fallback);
      }
    } catch (error) {
      console.error("Request form error", error);
      setRequestStatus("error", text.error, { showEmail: true });
    } finally {
      requestSubmitting = false;
      form.removeAttribute("aria-busy");
      if (submit) {
        submit.disabled = false;
        submit.textContent = text.button;
      }
    }
  });
}

function setupGoogleFormLinks() {
  const url = String(window.KAAN_GOOGLE_FORM_URL || "").trim();
  if (!url) return;
  document.querySelectorAll("[data-google-form-link]").forEach((link) => {
    link.setAttribute("href", url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  });
}

function enhanceRequestCommandsAndAjoop() {
  if (typeof ultimateContent !== "undefined") {
    const addCommand = (lang, command) => {
      if (
        !ultimateContent[lang]?.commands?.some((item) => item.id === command.id)
      )
        ultimateContent[lang].commands.push(command);
    };
    addCommand("en", {
      id: "request",
      label: "Request a Project",
      hint: "Send a website, AI or automation request",
      keywords: "request form project hire job service website ai automation",
      type: "nav",
      value: "request.html",
    });
    addCommand("tr", {
      id: "request",
      label: "Proje Talebi Gönder",
      hint: "Web, AI veya otomasyon talebi gönder",
      keywords: "talep form proje iş hizmet web sitesi ai otomasyon",
      type: "nav",
      value: "request.html",
    });
  }

  if (typeof portfolioChatbotContent !== "undefined") {
    const en = portfolioChatbotContent.en;
    const tr = portfolioChatbotContent.tr;
    if (en && !en.quicks.some((item) => item.id === "request")) {
      en.quicks.push({ id: "request", label: "Request a project" });
      en.answers.request = {
        text: [
          "You can send a project request from the Request page for websites, AI workflows, chatbot flows, automation, dashboards and software work.",
          "The Request page is the best place to describe a project idea, budget range, timeline and preferred contact method.",
          "For new work, use the Request page first. It has direct website form logic plus Google Forms and email fallbacks.",
        ],
        links: [
          { label: "Open Request Form", url: "request.html" },
          {
            label: "Online Form",
            url:
              window.KAAN_GOOGLE_FORM_URL ||
              "https://docs.google.com/forms/d/e/1FAIpQLSdaC7iDV1f6aU3S3kKhJfHTEue9n8KRtwj-j7k6cT0i98lbiQ/viewform?usp=dialog",
          },
          { label: "Email", url: "mailto:kaanb8776@gmail.com" },
        ],
      };
    }
    if (tr && !tr.quicks.some((item) => item.id === "request")) {
      tr.quicks.push({ id: "request", label: "Proje talebi" });
      tr.answers.request = {
        text: [
          "Yeni Talep sayfasından web sitesi, AI workflow, chatbot akışı, otomasyon, dashboard ve benzeri yazılım işleri için proje talebi gönderebilirsin.",
          "Bir proje fikri varsa en temiz yol Talep sayfası: kapsam, zaman planı, iletişim ve detayları tek akışta topluyor.",
          "Talep sayfası direkt site formu, Google Forms fallback ve e-posta alternatifiyle çalışacak şekilde tasarlandı.",
        ],
        links: [
          { label: "Talep Formunu Aç", url: "request.html" },
          {
            label: "Online Form",
            url:
              window.KAAN_GOOGLE_FORM_URL ||
              "https://docs.google.com/forms/d/e/1FAIpQLSdaC7iDV1f6aU3S3kKhJfHTEue9n8KRtwj-j7k6cT0i98lbiQ/viewform?usp=dialog",
          },
          { label: "E-posta", url: "mailto:kaanb8776@gmail.com" },
        ],
      };
    }
    if (!chatbotKeywordMap.some((item) => item.id === "request"))
      chatbotKeywordMap.unshift({
        id: "request",
        keywords: [
          "request",
          "talep",
          "form",
          "iş talebi",
          "proje talebi",
          "hire",
          "service",
          "hizmet",
          "teklif",
        ],
      });
    updatePortfolioChatbotLanguage?.(currentSiteLanguage || "en");
  }
}

enhanceRequestCommandsAndAjoop();
setupGoogleFormLinks();
setupProjectRequestForm();
document
  .querySelectorAll("[data-lang-switch]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setTimeout(setupProjectRequestForm, 0),
    ),
  );

/* Career adventure page integration */
