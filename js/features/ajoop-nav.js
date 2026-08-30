/**
 * Ajoop navigation actions and the shared feature init sequence.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 4076-4183.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function enhanceAjoopNavigationActions() {
  if (
    !window.portfolioChatbotContent &&
    typeof portfolioChatbotContent === "undefined"
  )
    return;
  const resumeUrl = resumeLink;
  ["en", "tr"].forEach((lang) => {
    const content = portfolioChatbotContent[lang];
    if (!content || content.__enhancedActions) return;
    content.__enhancedActions = true;
    const labels =
      lang === "tr"
        ? {
            works: "Projeler",
            about: "Hakkımda",
            cv: "CV",
            mail: "E-posta",
            joyday: "Atölye Joyday Vaka Çalışmasını Gör",
            live: "Atölye Joyday Canlı Sitesini Aç",
            hospitalCase: "Hospital System Vaka Çalışmasını Gör",
            hospitalSource: "Hospital System Kaynak Arşivini Aç",
            github: "GitHub",
            recruiter: "İK Modu",
          }
        : {
            works: "Works",
            about: "About",
            cv: "Resume",
            mail: "Email",
            joyday: "View Atölye Joyday Case Study",
            live: "Open Atölye Joyday Website",
            hospitalCase: "View Hospital System Case Study",
            hospitalSource: "Open Hospital System Source Archive",
            github: "GitHub",
            recruiter: "Recruiter Mode",
          };
    if (content.answers?.who)
      content.answers.who.links = [
        { label: labels.about, url: "about.html" },
        { label: labels.cv, url: resumeLink },
      ];
    if (content.answers?.projects)
      content.answers.projects.links = [
        { label: labels.works, url: "works.html" },
        {
          label: labels.joyday,
          url: "atolye-joyday-case-study.html",
        },
        {
          label: labels.hospitalCase,
          url: "hospital-system-case-study.html",
        },
        {
          label: labels.hospitalSource,
          url: "https://github.com/UAJOP/Hospital-System",
        },
        { label: labels.github, url: "https://github.com/UAJOP" },
      ];
    if (content.answers?.joyday)
      content.answers.joyday.links = [
        {
          label: labels.joyday,
          url: "atolye-joyday-case-study.html",
        },
        { label: labels.live, url: "https://atolyejoyday.com/" },
      ];
    if (content.answers?.cv)
      content.answers.cv.links = [
        { label: labels.cv, url: resumeLink },
        { label: labels.mail, url: "mailto:kaanb8776@gmail.com" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
        { label: "GitHub", url: "https://github.com/UAJOP" },
      ];
    if (content.answers?.contact)
      content.answers.contact.links = content.answers.cv?.links || [];
    if (content.answers?.default)
      content.answers.default.links = [
        { label: labels.works, url: "works.html" },
        { label: labels.about, url: "about.html" },
        { label: labels.mail, url: "mailto:kaanb8776@gmail.com" },
      ];
  });
}

document
  .querySelectorAll("[data-open-chatbot]")
  .forEach((button) =>
    button.addEventListener("click", () => setChatbotOpen(true)),
  );
/* Shared feature init, in the order it ran as one file at 891388d.
 *
 * setupProjectSearch and setupProjectCopyLink live in page-scoped modules
 * (js/portfolio/works.js and js/portfolio/project-detail.js) which are not
 * loaded on every page, so they are called through a typeof guard — the same
 * pattern applyLanguage() already uses for its optional renderers. The rest are
 * common modules and are always present. */
if (typeof setupProjectSearch === "function") setupProjectSearch();
setupRecruiterMode();
setupCommandPalette();
if (typeof setupProjectCopyLink === "function") setupProjectCopyLink();
enhanceAjoopNavigationActions();
updateUltimateStaticLabels(getCurrentLocale());
if (typeof subscribeSiteLocale === "function") subscribeSiteLocale(() => updateUltimateStaticLabels(getCurrentLocale()));

/* Creative final add-ons: easter egg, interactive 3D model and tiny performance pass */
