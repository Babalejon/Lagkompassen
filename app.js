/* Lagkompassen – sök, filtrering, detaljvy och checklistor. */
(function () {
  "use strict";

  const laws = (window.LAWS || []).slice();
  const STORAGE_KEY = "lagkompassen.checklist.v1";

  // DOM-referenser
  const listEl = document.getElementById("lawList");
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  const filtersEl = document.getElementById("categoryFilters");
  const resultsInfo = document.getElementById("resultsInfo");
  const emptyState = document.getElementById("emptyState");
  const resetFromEmpty = document.getElementById("resetFromEmpty");
  const lawCountBadge = document.getElementById("lawCountBadge");
  const overlay = document.getElementById("modalOverlay");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  let activeCategory = "Alla";
  let query = "";

  // ---- Persistens av ikryssade checklistpunkter ----
  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveProgress(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage kan vara avstängt – ignorera */
    }
  }
  let progress = loadProgress();

  // ---- Hjälpfunktioner ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlight(text, q) {
    const safe = escapeHtml(text);
    if (!q) return safe;
    const terms = q.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (!terms.length) return safe;
    const re = new RegExp("(" + terms.join("|") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function matchesQuery(law, q) {
    if (!q) return true;
    const haystack = [
      law.title,
      law.sfs,
      law.category,
      law.summary,
      law.appliesTo,
      law.authority,
      (law.keywords || []).join(" ")
    ]
      .join(" ")
      .toLowerCase();
    // Alla söktermer måste finnas (AND).
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((term) => haystack.indexOf(term) !== -1);
  }

  function getCategories() {
    const set = new Set(laws.map((l) => l.category));
    return ["Alla", ...Array.from(set).sort((a, b) => a.localeCompare(b, "sv"))];
  }

  // ---- Rendering ----
  function renderFilters() {
    filtersEl.innerHTML = "";
    getCategories().forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (cat === activeCategory ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        activeCategory = cat;
        renderFilters();
        renderList();
      });
      filtersEl.appendChild(btn);
    });
  }

  function lawProgressRatio(law) {
    const state = progress[law.id] || {};
    const done = law.checklist.filter((_, i) => state[i]).length;
    return { done, total: law.checklist.length };
  }

  function renderList() {
    const filtered = laws.filter(
      (law) =>
        (activeCategory === "Alla" || law.category === activeCategory) &&
        matchesQuery(law, query)
    );

    listEl.innerHTML = "";

    if (!filtered.length) {
      emptyState.hidden = false;
      resultsInfo.textContent = "";
      return;
    }
    emptyState.hidden = true;

    resultsInfo.textContent =
      filtered.length === laws.length
        ? `Visar samtliga ${laws.length} lagar`
        : `Visar ${filtered.length} av ${laws.length} lagar`;

    filtered.forEach((law) => {
      const { done, total } = lawProgressRatio(law);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "law-card";
      card.innerHTML = `
        <div class="law-card-top">
          <span class="law-cat">${escapeHtml(law.category)}</span>
          <span class="law-sfs">${escapeHtml(law.sfs)}</span>
        </div>
        <h3>${highlight(law.title, query)}</h3>
        <p>${highlight(law.summary, query)}</p>
        <div class="law-card-foot">
          <span class="checklist-hint">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
            Checklista (${total})${done ? ` · ${done} klar` : ""}
          </span>
          <span class="law-auth">${escapeHtml(law.authority)}</span>
        </div>`;
      card.addEventListener("click", () => openModal(law.id));
      listEl.appendChild(card);
    });
  }

  // ---- Detaljvy / modal med checklista ----
  function openModal(id) {
    const law = laws.find((l) => l.id === id);
    if (!law) return;
    const state = progress[law.id] || {};

    const checklistHtml = law.checklist
      .map((item, i) => {
        const checked = state[i] ? "checked" : "";
        const doneClass = state[i] ? " done" : "";
        return `
          <li class="check-item${doneClass}" data-index="${i}">
            <input type="checkbox" ${checked} aria-label="Markera som klar" />
            <span>${escapeHtml(item)}</span>
          </li>`;
      })
      .join("");

    modalBody.innerHTML = `
      <div class="modal-head">
        <span class="law-cat">${escapeHtml(law.category)}</span>
        <h2>${escapeHtml(law.title)}</h2>
        <div class="modal-sfs-row">
          <span>${escapeHtml(law.sfs)}</span>
          <span>${escapeHtml(law.updated || "")}</span>
        </div>
        <p class="modal-summary">${escapeHtml(law.summary)}</p>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <div class="label">Gäller för</div>
          <div class="value">${escapeHtml(law.appliesTo)}</div>
        </div>
        <div class="meta-item">
          <div class="label">Tillsynsmyndighet</div>
          <div class="value">${escapeHtml(law.authority)}</div>
        </div>
      </div>

      <div class="keyword-row">
        ${(law.keywords || [])
          .map((k) => `<span class="keyword">${escapeHtml(k)}</span>`)
          .join("")}
      </div>

      <div class="checklist-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1f7a4d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
          Checklista för efterlevnad
        </h3>
        <p class="sub">Bocka av punkterna allt eftersom – din status sparas lokalt i webbläsaren.</p>
        <div class="progress-wrap">
          <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
          <div class="progress-label" id="progressLabel">0%</div>
        </div>
        <ul class="checklist" id="checklist">${checklistHtml}</ul>
        <div class="modal-actions">
          <button type="button" class="btn-primary" id="printBtn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Skriv ut / spara PDF
          </button>
          <button type="button" class="btn-ghost" id="resetChecklist">Nollställ checklista</button>
          ${
            law.link
              ? `<a class="btn-ghost" href="${escapeHtml(law.link)}" target="_blank" rel="noopener">
                  Läs lagtexten
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>`
              : ""
          }
        </div>
      </div>`;

    // Checkbox-händelser
    const checklistEl = modalBody.querySelector("#checklist");
    checklistEl.querySelectorAll(".check-item").forEach((li) => {
      const idx = Number(li.dataset.index);
      const input = li.querySelector("input");
      const toggle = (val) => {
        input.checked = val;
        li.classList.toggle("done", val);
        if (!progress[law.id]) progress[law.id] = {};
        progress[law.id][idx] = val;
        saveProgress(progress);
        updateProgress(law);
      };
      input.addEventListener("change", () => toggle(input.checked));
      li.addEventListener("click", (e) => {
        if (e.target !== input) toggle(!input.checked);
      });
    });

    modalBody.querySelector("#printBtn").addEventListener("click", () => window.print());
    modalBody.querySelector("#resetChecklist").addEventListener("click", () => {
      progress[law.id] = {};
      saveProgress(progress);
      openModal(law.id); // rita om
      renderList();
    });

    updateProgress(law);
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    modalClose.focus();
  }

  function updateProgress(law) {
    const { done, total } = lawProgressRatio(law);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const fill = modalBody.querySelector("#progressFill");
    const label = modalBody.querySelector("#progressLabel");
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = pct + "%";
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    renderList(); // uppdatera kortens "klar"-status
  }

  // ---- Events ----
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim();
    clearBtn.hidden = !query;
    renderList();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    query = "";
    clearBtn.hidden = true;
    searchInput.focus();
    renderList();
  });

  resetFromEmpty.addEventListener("click", () => {
    searchInput.value = "";
    query = "";
    activeCategory = "Alla";
    clearBtn.hidden = true;
    renderFilters();
    renderList();
  });

  modalClose.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  // ---- Init ----
  lawCountBadge.textContent = laws.length + " lagar";
  renderFilters();
  renderList();
})();
