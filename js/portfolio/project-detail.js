/**
 * Project detail rendering, prev/next and canonical share link.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1625-1801, 4048-4075.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function renderProjectDetail(language = (typeof getCurrentLocale === "function" ? getCurrentLocale() : (typeof currentSiteLanguage !== "undefined" ? currentSiteLanguage : "en"))) {
  const lt = (en, tr) => typeof getI18nText === "function" ? getI18nText(en, tr, language) : (language === "tr" ? tr : en);
  const localized = (value) => typeof getLocalizedValue === "function" ? getLocalizedValue(value, language) : (value?.[language] ?? value?.en ?? value ?? "");
  const root = document.querySelector("[data-project-detail]");
  if (!root) return;

  const slug = resolveCurrentProjectSlug();
  const project = slug ? projectDetailData[slug] : null;

  if (!project) {
    root.innerHTML = `
      <section class="page-hero section-shell reveal">
        <p class="eyebrow">${lt("Project Not Found", "Proje Bulunamadı")}</p>
        <h1>${lt("This project detail page is not available yet.", "Bu proje için detay sayfası henüz hazırlanmadı.")}</h1>
        <p>${lt("Go back to the works page and choose another project.", "Projeler sayfasına dönüp başka bir çalışma seçebilirsin.")}</p>
        <div class="hero-actions left"><a class="btn primary" href="${siteUrl("works.html")}">${lt("Back to Works", "Projelere Dön")}</a></div>
      </section>
    `;
    document.title = lt("Project Not Found | Kaan Balcı", "Proje Bulunamadı | Kaan Balcı");
    return;
  }

  const projectEntries = Object.keys(projectDetailData);
  const currentIndex = projectEntries.indexOf(slug);
  const previousSlug =
    projectEntries[
      (currentIndex - 1 + projectEntries.length) % projectEntries.length
    ];
  const nextSlug = projectEntries[(currentIndex + 1) % projectEntries.length];
  const title = translateProjectField(project.title, language);
  const subtitle = translateProjectField(project.subtitle, language);
  const category = translateProjectField(project.category, language);
  const role = translateProjectField(project.role, language);
  const type = translateProjectField(project.type, language);
  const status = translateProjectField(project.status, language);
  const overview = translateProjectField(project.overview, language);
  const challenge = translateProjectField(project.challenge, language);
  const solution = translateProjectField(project.solution, language);
  const features = localized(project.features) || [];
  const links = project.links || [];
  const gallery = project.gallery?.length ? project.gallery : [project.image];
  const impact =
    translateProjectField(project.impact, language) ||
    lt("This project represents my ability to combine technical practice, user needs and product-oriented thinking.", "Bu proje; teknik pratiği, kullanıcı ihtiyacını ve ürün odaklı düşünmeyi birleştiren portföy çalışmalarımdan biridir.");
  const processSteps = localized(project.process) || [
      {
        title: lt("Analysis", "Analiz"),
        text: lt("Clarified the project goal, user need and core flow.", "Projenin hedefini, kullanıcı ihtiyacını ve temel akışını netleştirdim."),
      },
      {
        title: lt("Design", "Tasarım"),
        text: lt("Planned the system logic, screens or gameplay structure.", "Sistem mantığını, ekranları veya gameplay yapısını planladım."),
      },
      {
        title: lt("Development", "Geliştirme"),
        text: lt("Built the technical implementation and made the core features work.", "Teknik uygulamayı geliştirip temel özellikleri çalışır hale getirdim."),
      },
      {
        title: lt("Iteration", "İyileştirme"),
        text: lt("Refined the result through testing, cleanup and portfolio presentation.", "Test, düzenleme ve sunum tarafını portföye uygun hale getirdim."),
      },
    ];

  document.title = `${title} | Kaan Balcı`;

  root.innerHTML = `
    <section class="project-detail-hero section-shell reveal">
      <div class="project-detail-copy">
        <a class="back-link" href="${siteUrl("works.html")}"><i class="bx bx-arrow-back"></i>${lt("Back to works", "Projelere dön")}</a>
        <p class="eyebrow">${escapeProjectHtml(category)}</p>
        <h1>${escapeProjectHtml(title)}</h1>
        <p>${escapeProjectHtml(subtitle)}</p>
        <div class="project-detail-actions">
          ${links.map((link) => `<a class="btn primary" href="${escapeProjectHtml(siteUrl(link.url))}" ${link.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeProjectHtml(translateProjectField(link.label, language))}</a>`).join("")}
          <a class="btn ghost" href="mailto:kaanb8776@gmail.com">${lt("Ask for Similar Work", "Benzer Proje İçin Yaz")}</a>
          <button class="btn ghost" type="button" data-copy-project-link>${lt("Copy Project Link", "Proje Linkini Kopyala")}</button>
        </div>
      </div>
      <div class="project-detail-visual reveal delay-1">
        <img src="${escapeProjectHtml(siteUrl(project.image))}" alt="${escapeProjectHtml(title)} ${lt("preview", "proje önizlemesi")}" decoding="async" fetchpriority="high" />
      </div>
    </section>

    <section class="section-shell project-detail-meta reveal delay-2">
      <article><span>${lt("Role", "Rol")}</span><strong>${escapeProjectHtml(role)}</strong></article>
      <article><span>${lt("Year", "Yıl")}</span><strong>${escapeProjectHtml(project.year)}</strong></article>
      <article><span>${lt("Project Type", "Proje Türü")}</span><strong>${escapeProjectHtml(type)}</strong></article>
      <article><span>${lt("Status", "Durum")}</span><strong>${escapeProjectHtml(status)}</strong></article>
    </section>

    <section class="section-shell section-block project-detail-grid">
      <div class="project-detail-main">
        <article class="detail-panel reveal">
          <p class="eyebrow">${lt("Overview", "Genel Bakış")}</p>
          <h2>${lt("Project Overview", "Proje Özeti")}</h2>
          <p>${escapeProjectHtml(overview)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${lt("Challenge", "Problem")}</p>
          <h2>${lt("The part that needed solving", "Çözülmesi gereken taraf")}</h2>
          <p>${escapeProjectHtml(challenge)}</p>
        </article>

        <article class="detail-panel reveal delay-2">
          <p class="eyebrow">${lt("Solution", "Çözüm")}</p>
          <h2>${lt("How I approached it", "Nasıl ele aldım")}</h2>
          <p>${escapeProjectHtml(solution)}</p>
        </article>

        <article class="detail-panel reveal">
          <p class="eyebrow">${lt("Result / Impact", "Sonuç / Etki")}</p>
          <h2>${lt("The value created", "Projeye kattığı değer")}</h2>
          <p>${escapeProjectHtml(impact)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${lt("Process", "Süreç")}</p>
          <h2>${lt("How the work moved forward", "Nasıl ilerledi")}</h2>
          <div class="process-steps">
            ${processSteps.map((step, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeProjectHtml(step.title)}</h3><p>${escapeProjectHtml(step.text)}</p></div></article>`).join("")}
          </div>
        </article>
      </div>

      <aside class="project-detail-side reveal delay-1">
        <div class="detail-panel compact-panel">
          <h3>${lt("Tech Stack", "Teknolojiler")}</h3>
          <div class="project-tags detail-tags">
            ${project.stack.map((item) => `<span>${escapeProjectHtml(translateProjectDisplayLabel(item, language))}</span>`).join("")}
          </div>
        </div>

        <div class="detail-panel compact-panel">
          <h3>${lt("Highlights", "Öne çıkanlar")}</h3>
          <ul class="detail-list">
            ${features.map((item) => `<li>${escapeProjectHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </aside>
    </section>

    <section class="section-shell section-block">
      <div class="section-heading reveal">
        <p class="eyebrow">${lt("Gallery", "Görseller")}</p>
        <h2>${lt("Visual context from the project.", "Projeden görsel alanı.")}</h2>
        <p>${lt("Current portfolio assets are used for now. As new screenshots are added, this area becomes stronger automatically.", "Şimdilik mevcut portfolio görselleri kullanılıyor. Yeni ekran görüntüleri ekledikçe bu alan otomatik daha güçlü hale gelir.")}</p>
      </div>
      <div class="detail-gallery">
        ${gallery.map((image) => `<img class="reveal" src="${escapeProjectHtml(siteUrl(image))}" alt="${escapeProjectHtml(title)} ${lt("gallery image", "galeri görseli")}" loading="lazy" decoding="async" />`).join("")}
      </div>
    </section>

    <section class="section-shell detail-navigation reveal">
      <a class="btn ghost" href="${projectUrl(previousSlug)}"><i class="bx bx-left-arrow-alt"></i>${lt("Previous Project", "Önceki Proje")}</a>
      <a class="btn primary" href="${siteUrl("works.html")}">${lt("All Works", "Tüm Projeler")}</a>
      <a class="btn ghost" href="${projectUrl(nextSlug)}">${lt("Next Project", "Sonraki Proje")}<i class="bx bx-right-arrow-alt"></i></a>
    </section>
  `;
}

function setupProjectCopyLink() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-project-link]");
    if (!button) return;
    const original = button.textContent;
    // Share the canonical project URL, not whichever route the visitor used,
    // so a link copied from the legacy query route still spreads /projects/<slug>/.
    const currentSlug = resolveCurrentProjectSlug();
    const url = currentSlug
      ? new URL(projectUrl(currentSlug), window.location.href).href
      : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      const temp = document.createElement("textarea");
      temp.value = url;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    button.textContent = getUltimateContent().copyDone;
    setTimeout(() => {
      button.textContent = original;
    }, 1400);
  });
}

