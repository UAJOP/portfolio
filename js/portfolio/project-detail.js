/**
 * Project detail rendering, prev/next and canonical share link.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1625-1801, 4048-4075.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function renderProjectDetail(language = currentSiteLanguage || "en") {
  const root = document.querySelector("[data-project-detail]");
  if (!root) return;

  const slug = resolveCurrentProjectSlug();
  const project = slug ? projectDetailData[slug] : null;

  if (!project) {
    root.innerHTML = `
      <section class="page-hero section-shell reveal">
        <p class="eyebrow">${language === "tr" ? "Proje Bulunamadı" : "Project Not Found"}</p>
        <h1>${language === "tr" ? "Bu proje için detay sayfası henüz hazırlanmadı." : "This project detail page is not available yet."}</h1>
        <p>${language === "tr" ? "Projeler sayfasına dönüp başka bir çalışma seçebilirsin." : "Go back to the works page and choose another project."}</p>
        <div class="hero-actions left"><a class="btn primary" href="${siteUrl("works.html")}">${language === "tr" ? "Projelere Dön" : "Back to Works"}</a></div>
      </section>
    `;
    document.title =
      language === "tr"
        ? "Proje Bulunamadı | Kaan Balcı"
        : "Project Not Found | Kaan Balcı";
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
  const features = project.features?.[language] || project.features?.en || [];
  const links = project.links || [];
  const gallery = project.gallery?.length ? project.gallery : [project.image];
  const impact =
    translateProjectField(project.impact, language) ||
    (language === "tr"
      ? "Bu proje; teknik pratiği, kullanıcı ihtiyacını ve ürün odaklı düşünmeyi birleştiren portföy çalışmalarımdan biridir."
      : "This project represents my ability to combine technical practice, user needs and product-oriented thinking.");
  const processSteps = project.process?.[language] ||
    project.process?.en || [
      {
        title: language === "tr" ? "Analiz" : "Analysis",
        text:
          language === "tr"
            ? "Projenin hedefini, kullanıcı ihtiyacını ve temel akışını netleştirdim."
            : "Clarified the project goal, user need and core flow.",
      },
      {
        title: language === "tr" ? "Tasarım" : "Design",
        text:
          language === "tr"
            ? "Sistem mantığını, ekranları veya gameplay yapısını planladım."
            : "Planned the system logic, screens or gameplay structure.",
      },
      {
        title: language === "tr" ? "Geliştirme" : "Development",
        text:
          language === "tr"
            ? "Teknik uygulamayı geliştirip temel özellikleri çalışır hale getirdim."
            : "Built the technical implementation and made the core features work.",
      },
      {
        title: language === "tr" ? "İyileştirme" : "Iteration",
        text:
          language === "tr"
            ? "Test, düzenleme ve sunum tarafını portföye uygun hale getirdim."
            : "Refined the result through testing, cleanup and portfolio presentation.",
      },
    ];

  document.title = `${title} | Kaan Balcı`;

  root.innerHTML = `
    <section class="project-detail-hero section-shell reveal">
      <div class="project-detail-copy">
        <a class="back-link" href="${siteUrl("works.html")}"><i class="bx bx-arrow-back"></i>${language === "tr" ? "Projelere dön" : "Back to works"}</a>
        <p class="eyebrow">${escapeProjectHtml(category)}</p>
        <h1>${escapeProjectHtml(title)}</h1>
        <p>${escapeProjectHtml(subtitle)}</p>
        <div class="project-detail-actions">
          ${links.map((link) => `<a class="btn primary" href="${escapeProjectHtml(siteUrl(link.url))}" ${link.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeProjectHtml(translateProjectField(link.label, language))}</a>`).join("")}
          <a class="btn ghost" href="mailto:kaanb8776@gmail.com">${language === "tr" ? "Benzer Proje İçin Yaz" : "Ask for Similar Work"}</a>
          <button class="btn ghost" type="button" data-copy-project-link>${language === "tr" ? "Proje Linkini Kopyala" : "Copy Project Link"}</button>
        </div>
      </div>
      <div class="project-detail-visual reveal delay-1">
        <img src="${escapeProjectHtml(siteUrl(project.image))}" alt="${escapeProjectHtml(title)} ${language === "tr" ? "proje önizlemesi" : "preview"}" decoding="async" fetchpriority="high" />
      </div>
    </section>

    <section class="section-shell project-detail-meta reveal delay-2">
      <article><span>${language === "tr" ? "Rol" : "Role"}</span><strong>${escapeProjectHtml(role)}</strong></article>
      <article><span>${language === "tr" ? "Yıl" : "Year"}</span><strong>${escapeProjectHtml(project.year)}</strong></article>
      <article><span>${language === "tr" ? "Proje Türü" : "Project Type"}</span><strong>${escapeProjectHtml(type)}</strong></article>
      <article><span>${language === "tr" ? "Durum" : "Status"}</span><strong>${escapeProjectHtml(status)}</strong></article>
    </section>

    <section class="section-shell section-block project-detail-grid">
      <div class="project-detail-main">
        <article class="detail-panel reveal">
          <p class="eyebrow">${language === "tr" ? "Genel Bakış" : "Overview"}</p>
          <h2>${language === "tr" ? "Proje Özeti" : "Project Overview"}</h2>
          <p>${escapeProjectHtml(overview)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${language === "tr" ? "Problem" : "Challenge"}</p>
          <h2>${language === "tr" ? "Çözülmesi gereken taraf" : "The part that needed solving"}</h2>
          <p>${escapeProjectHtml(challenge)}</p>
        </article>

        <article class="detail-panel reveal delay-2">
          <p class="eyebrow">${language === "tr" ? "Çözüm" : "Solution"}</p>
          <h2>${language === "tr" ? "Nasıl ele aldım" : "How I approached it"}</h2>
          <p>${escapeProjectHtml(solution)}</p>
        </article>

        <article class="detail-panel reveal">
          <p class="eyebrow">${language === "tr" ? "Sonuç / Etki" : "Result / Impact"}</p>
          <h2>${language === "tr" ? "Projeye kattığı değer" : "The value created"}</h2>
          <p>${escapeProjectHtml(impact)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${language === "tr" ? "Süreç" : "Process"}</p>
          <h2>${language === "tr" ? "Nasıl ilerledi" : "How the work moved forward"}</h2>
          <div class="process-steps">
            ${processSteps.map((step, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeProjectHtml(step.title)}</h3><p>${escapeProjectHtml(step.text)}</p></div></article>`).join("")}
          </div>
        </article>
      </div>

      <aside class="project-detail-side reveal delay-1">
        <div class="detail-panel compact-panel">
          <h3>${language === "tr" ? "Teknolojiler" : "Tech Stack"}</h3>
          <div class="project-tags detail-tags">
            ${project.stack.map((item) => `<span>${escapeProjectHtml(translateProjectDisplayLabel(item, language))}</span>`).join("")}
          </div>
        </div>

        <div class="detail-panel compact-panel">
          <h3>${language === "tr" ? "Öne çıkanlar" : "Highlights"}</h3>
          <ul class="detail-list">
            ${features.map((item) => `<li>${escapeProjectHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </aside>
    </section>

    <section class="section-shell section-block">
      <div class="section-heading reveal">
        <p class="eyebrow">${language === "tr" ? "Görseller" : "Gallery"}</p>
        <h2>${language === "tr" ? "Projeden görsel alanı." : "Visual context from the project."}</h2>
        <p>${language === "tr" ? "Şimdilik mevcut portfolio görselleri kullanılıyor. Yeni ekran görüntüleri ekledikçe bu alan otomatik daha güçlü hale gelir." : "Current portfolio assets are used for now. As new screenshots are added, this area becomes stronger automatically."}</p>
      </div>
      <div class="detail-gallery">
        ${gallery.map((image) => `<img class="reveal" src="${escapeProjectHtml(image)}" alt="${escapeProjectHtml(title)} ${language === "tr" ? "galeri görseli" : "gallery image"}" loading="lazy" decoding="async" />`).join("")}
      </div>
    </section>

    <section class="section-shell detail-navigation reveal">
      <a class="btn ghost" href="${projectUrl(previousSlug)}"><i class="bx bx-left-arrow-alt"></i>${language === "tr" ? "Önceki Proje" : "Previous Project"}</a>
      <a class="btn primary" href="${siteUrl("works.html")}">${language === "tr" ? "Tüm Projeler" : "All Works"}</a>
      <a class="btn ghost" href="${projectUrl(nextSlug)}">${language === "tr" ? "Sonraki Proje" : "Next Project"}<i class="bx bx-right-arrow-alt"></i></a>
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

