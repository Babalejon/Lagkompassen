/* Lagkompassen – sök, filtrering, sortering, detaljvy och checklistor. */
(function () {
  "use strict";

  const laws = (window.LAWS || []).slice();
  const STORAGE_KEY = "lagkompassen.checklist.v1";
  const LISTS_KEY = "lagkompassen.lists.v1";
  const HASH_PREFIX = "lag/";

  // DOM-referenser
  const listEl = document.getElementById("lawList");
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearch");
  const filtersEl = document.getElementById("categoryFilters");
  const resultsInfo = document.getElementById("resultsInfo");
  const emptyState = document.getElementById("emptyState");
  const resetFromEmpty = document.getElementById("resetFromEmpty");
  const lawCountBadge = document.getElementById("lawCountBadge");
  const sortSelect = document.getElementById("sortSelect");
  const overlay = document.getElementById("modalOverlay");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");
  const openListsBtn = document.getElementById("openListsBtn");
  const listsCountEl = document.getElementById("listsCount");
  const listsOverlay = document.getElementById("listsOverlay");
  const listsClose = document.getElementById("listsClose");
  const listsModalBody = document.getElementById("listsModalBody");
  const listPopover = document.getElementById("listPopover");
  const activeListBanner = document.getElementById("activeListBanner");

  let activeCategory = "Alla";
  let query = "";
  let currentSort = "title";
  let openLawId = null;
  let lastFocused = null;
  let activeListId = null;
  let popoverLawId = null;

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

  // ---- Listor (sparade samlingar av lagar) ----
  function loadLists() {
    try {
      const data = JSON.parse(localStorage.getItem(LISTS_KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  function saveLists() {
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    } catch (e) {
      /* localStorage kan vara avstängt – ignorera */
    }
  }
  let lists = loadLists();

  function uid() {
    return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createList(name) {
    const clean = (name || "").trim() || "Ny lista";
    const list = { id: uid(), name: clean, lawIds: [], createdAt: Date.now() };
    lists.push(list);
    saveLists();
    return list;
  }

  function getList(id) {
    return lists.find((l) => l.id === id) || null;
  }

  function listsContaining(lawId) {
    return lists.filter((l) => l.lawIds.indexOf(lawId) !== -1);
  }

  function toggleLawInList(listId, lawId) {
    const list = getList(listId);
    if (!list) return;
    const i = list.lawIds.indexOf(lawId);
    if (i === -1) list.lawIds.push(lawId);
    else list.lawIds.splice(i, 1);
    saveLists();
  }

  function renameList(id, name) {
    const list = getList(id);
    if (!list) return;
    const clean = (name || "").trim();
    if (clean) {
      list.name = clean;
      saveLists();
    }
  }

  function deleteList(id) {
    lists = lists.filter((l) => l.id !== id);
    saveLists();
    if (activeListId === id) activeListId = null;
  }

  function updateListsCount() {
    listsCountEl.textContent = lists.length;
    listsCountEl.hidden = lists.length === 0;
  }

  // ---- Hjälpfunktioner ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(text, q) {
    const safe = escapeHtml(text);
    if (!q) return safe;
    const terms = q.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (!terms.length) return safe;
    const re = new RegExp("(" + terms.join("|") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
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
      (law.keywords || []).join(" "),
      (law.checklist || []).join(" ")
    ]
      .join(" ")
      .toLowerCase();
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

  function lawProgressRatio(law) {
    const state = progress[law.id] || {};
    const done = law.checklist.filter((_, i) => state[i]).length;
    return { done, total: law.checklist.length };
  }

  function sortLaws(arr) {
    const copy = arr.slice();
    if (currentSort === "category") {
      copy.sort(
        (a, b) =>
          a.category.localeCompare(b.category, "sv") ||
          a.title.localeCompare(b.title, "sv")
      );
    } else if (currentSort === "progress") {
      const remaining = (l) => {
        const { done, total } = lawProgressRatio(l);
        return total - done;
      };
      copy.sort(
        (a, b) => remaining(b) - remaining(a) || a.title.localeCompare(b.title, "sv")
      );
    } else {
      copy.sort((a, b) => a.title.localeCompare(b.title, "sv"));
    }
    return copy;
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

  function buildCard(law) {
    const { done, total } = lawProgressRatio(law);
    const inLists = listsContaining(law.id);
    const saved = inLists.length > 0;
    const card = document.createElement("article");
    card.className = "law-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <div class="law-card-top">
        <span class="law-cat">${escapeHtml(law.category)}</span>
        <div class="law-card-top-right">
          <span class="law-sfs">${escapeHtml(law.sfs)}</span>
          <button type="button" class="bookmark-btn${saved ? " active" : ""}"
            aria-label="${saved ? "Sparad i lista" : "Lägg till i lista"}"
            title="${saved ? "I " + inLists.length + " lista(or)" : "Lägg till i lista"}">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>
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
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(law.id);
      }
    });
    const bm = card.querySelector(".bookmark-btn");
    bm.addEventListener("click", (e) => {
      e.stopPropagation();
      openListPopover(law.id, bm);
    });
    bm.addEventListener("keydown", (e) => e.stopPropagation());
    return card;
  }

  function renderList() {
    renderActiveListBanner();
    const activeList = activeListId ? getList(activeListId) : null;
    const pool = activeList
      ? laws.filter((law) => activeList.lawIds.indexOf(law.id) !== -1)
      : laws;

    const filtered = sortLaws(
      pool.filter(
        (law) =>
          (activeCategory === "Alla" || law.category === activeCategory) &&
          matchesQuery(law, query)
      )
    );

    listEl.innerHTML = "";

    if (!filtered.length) {
      emptyState.hidden = false;
      resultsInfo.textContent = "";
      return;
    }
    emptyState.hidden = true;

    const base = pool.length;
    resultsInfo.textContent =
      filtered.length === base
        ? `Visar ${base === laws.length ? "samtliga " : ""}${base} lagar`
        : `Visar ${filtered.length} av ${base} lagar`;

    const frag = document.createDocumentFragment();
    filtered.forEach((law) => frag.appendChild(buildCard(law)));
    listEl.appendChild(frag);
  }

  // ---- Detaljvy / modal med checklista ----
  function relatedLaws(law) {
    return laws
      .filter((l) => l.id !== law.id && l.category === law.category)
      .slice(0, 4);
  }

  function openModal(id, fromHash) {
    const law = laws.find((l) => l.id === id);
    if (!law) return;
    if (!overlay.hidden && openLawId === id) return; // redan öppen
    if (overlay.hidden) lastFocused = document.activeElement;
    openLawId = id;

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

    const related = relatedLaws(law);
    const relatedHtml = related.length
      ? `<div class="related-section">
           <div class="related-title">Relaterade lagar i ${escapeHtml(law.category)}</div>
           <div class="related-list">
             ${related
               .map(
                 (r) =>
                   `<button type="button" class="related-chip" data-law="${escapeHtml(
                     r.id
                   )}">${escapeHtml(r.title)}</button>`
               )
               .join("")}
           </div>
         </div>`
      : "";

    modalBody.innerHTML = `
      <div class="modal-head">
        <span class="law-cat">${escapeHtml(law.category)}</span>
        <h2 id="modalTitle">${escapeHtml(law.title)}</h2>
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
          .map(
            (k) =>
              `<button type="button" class="keyword" data-keyword="${escapeHtml(
                k
              )}" title="Sök på &quot;${escapeHtml(k)}&quot;">${escapeHtml(
                k
              )}</button>`
          )
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
            Skriv ut / PDF
          </button>
          <button type="button" class="btn-ghost" id="copyBtn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Kopiera
          </button>
          <button type="button" class="btn-ghost" id="downloadBtn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Ladda ner
          </button>
          <button type="button" class="btn-ghost btn-addtolist" id="addToListBtn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            <span class="atl-label">Lägg till i lista</span>
          </button>
          <button type="button" class="btn-ghost" id="resetChecklist">Nollställ</button>
          ${
            law.link
              ? `<a class="btn-ghost" href="${escapeHtml(law.link)}" target="_blank" rel="noopener">
                  Läs lagtexten
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>`
              : ""
          }
        </div>
      </div>
      ${relatedHtml}`;

    wireModal(law);

    updateProgress(law);
    overlay.hidden = false;
    document.body.classList.add("modal-open");
    overlay.scrollTop = 0;
    if (!fromHash) {
      try {
        history.pushState({ law: id }, "", "#" + HASH_PREFIX + id);
      } catch (e) {
        location.hash = HASH_PREFIX + id;
      }
    }
    modalClose.focus();
  }

  function wireModal(law) {
    // Checkbox-händelser
    modalBody.querySelectorAll(".check-item").forEach((li) => {
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
    modalBody.querySelector("#copyBtn").addEventListener("click", (e) => copyChecklist(law, e.currentTarget));
    modalBody.querySelector("#downloadBtn").addEventListener("click", () => downloadChecklist(law));
    const addBtn = modalBody.querySelector("#addToListBtn");
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openListPopover(law.id, addBtn);
    });
    refreshModalListButton();
    modalBody.querySelector("#resetChecklist").addEventListener("click", () => {
      progress[law.id] = {};
      saveProgress(progress);
      openModal(law.id, true); // rita om utan att ändra historiken
      renderList();
    });

    // Klickbara nyckelord -> sök
    modalBody.querySelectorAll(".keyword").forEach((btn) => {
      btn.addEventListener("click", () => {
        searchInput.value = btn.dataset.keyword;
        query = btn.dataset.keyword;
        clearBtn.hidden = false;
        activeCategory = "Alla";
        renderFilters();
        renderList();
        closeModal();
        document.querySelector(".results-bar").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    // Relaterade lagar
    modalBody.querySelectorAll(".related-chip").forEach((btn) => {
      btn.addEventListener("click", () => openModal(btn.dataset.law));
    });
  }

  function checklistAsText(law) {
    const lines = [];
    lines.push(law.title + " (" + law.sfs + ")");
    lines.push("Tillsynsmyndighet: " + law.authority);
    lines.push("");
    lines.push("Checklista för efterlevnad:");
    const state = progress[law.id] || {};
    law.checklist.forEach((item, i) => {
      lines.push((state[i] ? "[x] " : "[ ] ") + item);
    });
    lines.push("");
    lines.push("Källa: Lagkompassen – informationsvägledning, ej juridisk rådgivning.");
    return lines.join("\n");
  }

  function copyChecklist(law, btn) {
    const text = checklistAsText(law);
    const done = () => {
      const original = btn.innerHTML;
      btn.classList.add("copied");
      btn.textContent = "Kopierat!";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = original;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      /* tyst */
    }
    document.body.removeChild(ta);
  }

  function downloadChecklist(law) {
    const md =
      "# " +
      law.title +
      "\n\n**" +
      law.sfs +
      "** · " +
      law.category +
      "\n\n" +
      law.summary +
      "\n\n**Gäller för:** " +
      law.appliesTo +
      "\n\n**Tillsynsmyndighet:** " +
      law.authority +
      "\n\n## Checklista\n\n" +
      law.checklist
        .map((item, i) => "- [" + ((progress[law.id] || {})[i] ? "x" : " ") + "] " + item)
        .join("\n") +
      (law.link ? "\n\n[Läs lagtexten](" + law.link + ")" : "") +
      "\n\n---\n_Källa: Lagkompassen – informationsvägledning, ej juridisk rådgivning._\n";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "checklista-" + law.id + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function updateProgress(law) {
    const { done, total } = lawProgressRatio(law);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const fill = modalBody.querySelector("#progressFill");
    const label = modalBody.querySelector("#progressLabel");
    if (fill) fill.style.width = pct + "%";
    if (label) label.textContent = pct + "%";
  }

  function closeModal(skipHistory) {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    openLawId = null;
    renderList(); // uppdatera kortens "klar"-status
    if (!skipHistory && location.hash.indexOf(HASH_PREFIX) !== -1) {
      try {
        history.pushState("", "", location.pathname + location.search);
      } catch (e) {
        location.hash = "";
      }
    }
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  // ---- Aktiv lista (filtrera rutnätet till en sparad lista) ----
  function setActiveList(id) {
    activeListId = id;
    activeCategory = "Alla";
    renderFilters();
    renderList();
    document.querySelector(".results-bar").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearActiveList() {
    activeListId = null;
    renderList();
  }

  function renderActiveListBanner() {
    const list = activeListId ? getList(activeListId) : null;
    if (!list) {
      activeListBanner.hidden = true;
      activeListBanner.innerHTML = "";
      return;
    }
    activeListBanner.hidden = false;
    activeListBanner.innerHTML = `
      <div class="alb-info">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <span>Visar listan <strong>${escapeHtml(list.name)}</strong> · ${list.lawIds.length} lag${
      list.lawIds.length === 1 ? "" : "ar"
    }</span>
      </div>
      <div class="alb-actions">
        <button type="button" class="btn-ghost btn-sm" id="albManage">Hantera listor</button>
        <button type="button" class="btn-primary btn-sm" id="albClear">Visa alla lagar</button>
      </div>`;
    activeListBanner.querySelector("#albClear").addEventListener("click", clearActiveList);
    activeListBanner.querySelector("#albManage").addEventListener("click", openListsModal);
  }

  // ---- Popover: lägg en lag till en eller flera listor ----
  function openListPopover(lawId, anchor) {
    popoverLawId = lawId;
    renderPopover();
    listPopover.hidden = false;
    positionPopover(anchor);
    const firstInput = listPopover.querySelector("input, button");
    if (firstInput) firstInput.focus();
  }

  function positionPopover(anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = listPopover.offsetWidth || 260;
    const ph = listPopover.offsetHeight || 200;
    let left = r.right - pw;
    let top = r.bottom + 8;
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    listPopover.style.left = left + "px";
    listPopover.style.top = top + "px";
  }

  function renderPopover() {
    const lawId = popoverLawId;
    const rows = lists.length
      ? lists
          .map((l) => {
            const inList = l.lawIds.indexOf(lawId) !== -1;
            return `
              <button type="button" class="pop-row${inList ? " checked" : ""}" data-list="${escapeHtml(
              l.id
            )}">
                <span class="pop-check" aria-hidden="true">${inList ? "✓" : ""}</span>
                <span class="pop-name">${escapeHtml(l.name)}</span>
                <span class="pop-count">${l.lawIds.length}</span>
              </button>`;
          })
          .join("")
      : `<p class="pop-empty">Du har inga listor än. Skapa en nedan.</p>`;

    listPopover.innerHTML = `
      <div class="pop-head">Lägg till i lista</div>
      <div class="pop-rows">${rows}</div>
      <form class="pop-create" id="popCreate">
        <input type="text" id="popNewName" placeholder="Ny lista…" maxlength="60" autocomplete="off" aria-label="Namn på ny lista" />
        <button type="submit" class="btn-primary btn-sm">Skapa</button>
      </form>`;

    listPopover.querySelectorAll(".pop-row").forEach((row) => {
      row.addEventListener("click", () => {
        toggleLawInList(row.dataset.list, lawId);
        renderPopover();
        updateListsCount();
        renderList();
        refreshModalListButton();
      });
    });

    listPopover.querySelector("#popCreate").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = listPopover.querySelector("#popNewName");
      const list = createList(input.value);
      toggleLawInList(list.id, lawId);
      renderPopover();
      updateListsCount();
      renderList();
      refreshModalListButton();
      const nameInput = listPopover.querySelector("#popNewName");
      if (nameInput) nameInput.focus();
    });
  }

  function closeListPopover() {
    if (listPopover.hidden) return;
    listPopover.hidden = true;
    popoverLawId = null;
  }

  // Uppdatera "Lägg till i lista"-knappen i lagmodalen om den är öppen.
  function refreshModalListButton() {
    const btn = modalBody.querySelector("#addToListBtn");
    if (!btn || !openLawId) return;
    const n = listsContaining(openLawId).length;
    btn.classList.toggle("active", n > 0);
    const lbl = btn.querySelector(".atl-label");
    if (lbl) lbl.textContent = n > 0 ? "I " + n + " lista" + (n === 1 ? "" : "or") : "Lägg till i lista";
  }

  // ---- Hantera listor (modal) ----
  function openListsModal() {
    closeListPopover();
    renderListsModal();
    listsOverlay.hidden = false;
    document.body.classList.add("modal-open");
    listsClose.focus();
  }

  function closeListsModal() {
    listsOverlay.hidden = true;
    if (overlay.hidden) document.body.classList.remove("modal-open");
  }

  function renderListsModal() {
    const items = lists.length
      ? lists
          .map(
            (l) => `
        <div class="list-item" data-list="${escapeHtml(l.id)}">
          <button type="button" class="list-open" data-open="${escapeHtml(l.id)}">
            <span class="list-name">${escapeHtml(l.name)}</span>
            <span class="list-meta">${l.lawIds.length} lag${l.lawIds.length === 1 ? "" : "ar"}</span>
          </button>
          <div class="list-item-actions">
            <button type="button" class="icon-btn" data-rename="${escapeHtml(l.id)}" title="Byt namn" aria-label="Byt namn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            </button>
            <button type="button" class="icon-btn danger" data-delete="${escapeHtml(l.id)}" title="Ta bort" aria-label="Ta bort lista">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>`
          )
          .join("")
      : `<p class="lists-empty">Du har inga listor än. Skapa din första nedan – sedan kan du spara lagar i den via bokmärkesikonen på varje lag.</p>`;

    listsModalBody.innerHTML = `
      <h2 id="listsTitle" class="lists-modal-title">Mina listor</h2>
      <p class="lists-modal-sub">Samla lagar som hör ihop, t.ex. per verksamhet, projekt eller ansvarsområde. Sparas lokalt i din webbläsare.</p>
      <div class="lists-items">${items}</div>
      <form class="lists-create" id="listsCreateForm">
        <input type="text" id="listsNewName" placeholder="Namnge en ny lista…" maxlength="60" autocomplete="off" aria-label="Namn på ny lista" />
        <button type="submit" class="btn-primary">Skapa lista</button>
      </form>`;

    listsModalBody.querySelectorAll("[data-open]").forEach((btn) =>
      btn.addEventListener("click", () => {
        setActiveList(btn.dataset.open);
        closeListsModal();
      })
    );
    listsModalBody.querySelectorAll("[data-rename]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const list = getList(btn.dataset.rename);
        if (!list) return;
        const name = window.prompt("Nytt namn på listan:", list.name);
        if (name !== null) {
          renameList(list.id, name);
          renderListsModal();
          renderList();
        }
      })
    );
    listsModalBody.querySelectorAll("[data-delete]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const list = getList(btn.dataset.delete);
        if (!list) return;
        if (window.confirm('Ta bort listan "' + list.name + '"? Lagarna påverkas inte.')) {
          deleteList(list.id);
          updateListsCount();
          renderListsModal();
          renderList();
        }
      })
    );
    listsModalBody.querySelector("#listsCreateForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = listsModalBody.querySelector("#listsNewName");
      if (!input.value.trim()) return;
      createList(input.value);
      updateListsCount();
      renderListsModal();
    });
  }

  // ---- Fokusfälla i modal ----
  function trapFocus(e) {
    if (overlay.hidden || e.key !== "Tab") return;
    const focusable = overlay.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ---- Deep-linking via hash ----
  function lawIdFromHash() {
    const h = location.hash.replace(/^#/, "");
    return h.indexOf(HASH_PREFIX) === 0 ? h.slice(HASH_PREFIX.length) : null;
  }

  function syncFromHash(fromEvent) {
    const id = lawIdFromHash();
    if (id && laws.some((l) => l.id === id)) {
      openModal(id, true);
    } else if (!overlay.hidden) {
      closeModal(true);
    }
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

  sortSelect.addEventListener("change", () => {
    currentSort = sortSelect.value;
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

  modalClose.addEventListener("click", () => closeModal());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Listor: öppna/stäng hanteringsmodal
  openListsBtn.addEventListener("click", openListsModal);
  listsClose.addEventListener("click", closeListsModal);
  listsOverlay.addEventListener("click", (e) => {
    if (e.target === listsOverlay) closeListsModal();
  });

  // Stäng popover vid klick utanför, scroll eller fönsterändring
  document.addEventListener("click", (e) => {
    if (!listPopover.hidden && !listPopover.contains(e.target)) closeListPopover();
  });
  window.addEventListener("scroll", closeListPopover, true);
  window.addEventListener("resize", closeListPopover);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!listPopover.hidden) return closeListPopover();
      if (!listsOverlay.hidden) return closeListsModal();
      if (!overlay.hidden) return closeModal();
    }
    trapFocus(e);
  });
  window.addEventListener("hashchange", () => syncFromHash(true));
  window.addEventListener("popstate", () => syncFromHash(true));

  // ---- Init ----
  lawCountBadge.textContent = laws.length + " lagar";
  updateListsCount();
  renderFilters();
  renderList();
  syncFromHash(false); // öppna direkt om URL pekar på en lag
})();
