/**
 * Works catalog: category filters, card navigation and search.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 257-287, 1950-1973, 3601-3642.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const filterButtons = document.querySelectorAll("[data-filter-btn]");
const projectCards = document.querySelectorAll(".project-card[data-category]");

function updateProjectSectionVisibility() {
  document.querySelectorAll("[data-project-section]").forEach((section) => {
    const hasVisibleCard = Array.from(
      section.querySelectorAll(".project-card[data-category]"),
    ).some((card) => !card.classList.contains("is-hidden"));
    section.classList.toggle("is-hidden", !hasVisibleCard);
  });
}

if (filterButtons.length && projectCards.length) {
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedCategory = button.dataset.filterBtn;

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      projectCards.forEach((card) => {
        const categories = card.dataset.category.split(" ");
        const shouldShow =
          selectedCategory === "all" || categories.includes(selectedCategory);
        card.classList.toggle("is-hidden", !shouldShow);
      });
      updateProjectSectionVisibility();
    });
  });
}

// clicks on inert card areas, without hijacking modifier clicks or text selection.
function shouldIgnoreCardActivation(event) {
  if (event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (event.target.closest('a, button, input, select, textarea, summary, label, [role="button"]')) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function setupProjectCardNavigation() {
  document.querySelectorAll("[data-project-link]").forEach((card) => {
    const slug = card.getAttribute("data-project-link");
    if (!slug) return;
    const url = slug.endsWith(".html") ? siteUrl(slug) : projectUrl(slug);

    card.addEventListener("click", (event) => {
      if (shouldIgnoreCardActivation(event)) return;
      window.location.href = url;
    });
  });
}

setupProjectCardNavigation();

function setupProjectSearch() {
  const grid = document.querySelector(".catalog-grid");
  const filterBar = document.querySelector(".filter-bar");
  if (!grid || !filterBar || document.querySelector("[data-project-search]"))
    return;
  const content = getUltimateContent();
  const catalogSearchLabels = getCatalogSearchLabels();
  const searchWrap = document.createElement("div");
  searchWrap.className = "project-search-wrap reveal";
  searchWrap.innerHTML = `<label><span data-project-search-label>${escapeProjectHtml(catalogSearchLabels.label)}</span><div><i class="bx bx-search"></i><input type="search" data-project-search placeholder="${escapeProjectHtml(catalogSearchLabels.placeholder)}" /></div></label>`;
  filterBar.insertAdjacentElement("afterend", searchWrap);
  const input = searchWrap.querySelector("[data-project-search]");

  function applyEnhancedProjectFilter() {
    const activeCategory =
      document.querySelector("[data-filter-btn].active")?.dataset.filterBtn ||
      "all";
    const query = normalizeI18nText(input.value || "").toLowerCase();
    projectCards.forEach((card) => {
      const categories = (card.dataset.category || "").split(" ");
      const categoryMatch =
        activeCategory === "all" || categories.includes(activeCategory);
      const text = normalizeI18nText(card.textContent || "").toLowerCase();
      const keywordMatch =
        !query ||
        text.includes(query) ||
        (card.dataset.projectLink || "").includes(query) ||
        (card.dataset.gameLink || "").includes(query);
      card.classList.toggle("is-hidden", !(categoryMatch && keywordMatch));
    });
    updateProjectSectionVisibility();
  }

  input.addEventListener("input", applyEnhancedProjectFilter);
  filterButtons.forEach((button) =>
    button.addEventListener("click", () =>
      setTimeout(applyEnhancedProjectFilter, 0),
    ),
  );
  applyEnhancedProjectFilter();
}

