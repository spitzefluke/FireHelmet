/* ======================================================
   FH SCHNELLSUCHE (Strg+K / Cmd+K)
   ---------------------------------------------------
   Das Menue ist auf 19 Punkte gewachsen. Die Schnellsuche
   legt einen Sucheingang darueber, mit dem man jede Seite
   direkt per Tastatur erreicht.

   Die Eintraege werden NICHT gepflegt, sondern beim Oeffnen
   aus der bestehenden Sidebar gelesen (.fh-sidebar-nav
   .fh-nav-item). Neue Menuepunkte tauchen dadurch von selbst
   in der Suche auf, und es kann keine zweite Liste
   veralten.

   Beruehrt changePage() nicht - die Suche ruft es nur auf,
   genau wie ein Klick auf den Menuepunkt es tut.
====================================================== */

(function () {
  "use strict";

  let overlay = null;
  let input = null;
  let listEl = null;
  let entries = [];
  let filtered = [];
  let activeIndex = 0;
  let lastFocused = null;

  /* Umlaute/Akzente entfernen, damit "schatzrad" auch "Schätzrad"
     findet und "ubung" -> "Übung". */
  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss");
  }

  function collectEntries() {
    const nodes = document.querySelectorAll(".fh-sidebar-nav .fh-nav-item");
    const seen = new Set();
    const out = [];

    nodes.forEach((node) => {
      const label = (node.querySelector(".fh-nav-label")?.textContent || "").trim();
      if (!label) return;

      const page = node.getAttribute("data-page");
      const href = node.getAttribute("href");
      const key = page || href;
      if (!key || seen.has(key)) return;
      seen.add(key);

      // Gruppenueberschrift ueber dem Punkt mitnehmen ("Spiele",
      // "Erkunden", "Mehr") - dadurch findet "spiele" alle Spielseiten.
      let group = "";
      let prev = node.previousElementSibling;
      while (prev) {
        if (prev.classList.contains("fh-nav-section-label")) {
          group = prev.textContent.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }

      const iconEl = node.querySelector(".fh-nav-icon");
      const iconImg = iconEl?.querySelector("img");

      out.push({
        label,
        group,
        page,
        href: page ? null : href,
        external: !page && !!href,
        iconText: iconImg ? "" : (iconEl?.textContent || "").trim(),
        iconSrc: iconImg ? iconImg.getAttribute("src") : null,
        haystack: normalize(label + " " + group),
      });
    });

    return out;
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "fh-qs-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Schnellsuche");
    overlay.hidden = true;

    overlay.innerHTML = `
      <div class="fh-qs-panel">
        <div class="fh-qs-inputrow">
          <span class="fh-qs-inputicon" aria-hidden="true">⌕</span>
          <input class="fh-qs-input" type="text" autocomplete="off" spellcheck="false"
                 data-i18n-placeholder="search.placeholder" placeholder="Wohin?"
                 aria-label="Seite suchen"
                 role="combobox" aria-expanded="true" aria-controls="fh-qs-list"
                 aria-autocomplete="list">
          <kbd class="fh-qs-esc">Esc</kbd>
        </div>
        <ul class="fh-qs-list" id="fh-qs-list" role="listbox" aria-label="Seiten"></ul>
        <p class="fh-qs-empty" data-i18n="search.empty" hidden>Nichts gefunden.</p>
        <div class="fh-qs-foot">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> <span data-i18n="search.hintSelect">wählen</span></span>
          <span><kbd>&crarr;</kbd> <span data-i18n="search.hintOpen">öffnen</span></span>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    // Das Overlay entsteht erst beim ersten Oeffnen - also nach dem
    // globalen applyTranslations()-Durchlauf beim Seitenstart. Ohne
    // diesen Aufruf blieben Platzhalter und Hinweise auf Deutsch,
    // auch wenn Englisch eingestellt ist.
    if (typeof applyTranslations === "function") applyTranslations();
    input = overlay.querySelector(".fh-qs-input");
    listEl = overlay.querySelector(".fh-qs-list");

    // Klick auf die Abdunklung (nicht auf das Panel) schliesst.
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });

    input.addEventListener("input", () => {
      activeIndex = 0;
      render();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        // Einziges fokussierbares Element im Dialog - Tab wuerde den
        // Fokus sonst hinter das Overlay in die Seite tragen.
        e.preventDefault();
      }
    });
  }

  function move(delta) {
    if (!filtered.length) return;
    setActive((activeIndex + delta + filtered.length) % filtered.length);
  }

  /* Verschiebt nur die Markierung. Frueher lief dafuer render(true),
     das die Liste komplett neu aufgebaut hat - beim Ueberfahren mit
     der Maus wurde dadurch genau der Eintrag zerstoert, auf den man
     gerade klickt, und der Klick ging ins Leere. */
  function setActive(index) {
    activeIndex = index;
    const items = listEl.children;
    for (let i = 0; i < items.length; i++) {
      const on = i === activeIndex;
      items[i].classList.toggle("is-active", on);
      items[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    input.setAttribute(
      "aria-activedescendant",
      filtered[activeIndex] ? "fh-qs-item-" + activeIndex : ""
    );
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function render() {
    const query = normalize(input.value.trim());
    filtered = query
      ? entries.filter((e) => e.haystack.includes(query))
      : entries.slice();
    if (activeIndex >= filtered.length) activeIndex = 0;

    const emptyEl = overlay.querySelector(".fh-qs-empty");
    emptyEl.hidden = filtered.length > 0;
    listEl.hidden = filtered.length === 0;

    listEl.innerHTML = "";
    filtered.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "fh-qs-item" + (i === activeIndex ? " is-active" : "");
      li.id = "fh-qs-item-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === activeIndex ? "true" : "false");

      const icon = document.createElement("span");
      icon.className = "fh-qs-icon";
      icon.setAttribute("aria-hidden", "true");
      if (entry.iconSrc) {
        const img = document.createElement("img");
        img.src = entry.iconSrc;
        img.alt = "";
        icon.appendChild(img);
      } else {
        icon.textContent = entry.iconText || "•";
      }

      const label = document.createElement("span");
      label.className = "fh-qs-label";
      // textContent: die Beschriftungen kommen aus i18n.js, werden hier
      // aber grundsaetzlich als Text behandelt.
      label.textContent = entry.label;

      li.appendChild(icon);
      li.appendChild(label);

      if (entry.group) {
        const group = document.createElement("span");
        group.className = "fh-qs-group";
        group.textContent = entry.group;
        li.appendChild(group);
      }

      if (entry.external) {
        const ext = document.createElement("span");
        ext.className = "fh-qs-ext";
        ext.textContent = "↗";
        ext.setAttribute("aria-label", "öffnet in neuem Tab");
        li.appendChild(ext);
      }

      li.addEventListener("mouseenter", () => setActive(i));
      li.addEventListener("click", () => choose(entry));

      listEl.appendChild(li);
    });

    input.setAttribute(
      "aria-activedescendant",
      filtered[activeIndex] ? "fh-qs-item-" + activeIndex : ""
    );
  }

  function choose(entry) {
    if (!entry) return;
    close();
    if (entry.external) {
      window.open(entry.href, "_blank", "noopener,noreferrer");
    } else if (typeof changePage === "function") {
      changePage(entry.page);
    }
  }

  function open() {
    if (!overlay) build();
    if (!overlay.hidden) return;

    lastFocused = document.activeElement;
    entries = collectEntries();
    if (!entries.length) return;

    input.value = "";
    activeIndex = 0;
    overlay.hidden = false;
    render();

    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      input.focus();
    });
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove("is-open");

    const finish = () => {
      overlay.hidden = true;
      // Fokus dorthin zurueck, wo er herkam - sonst landet er nach dem
      // Schliessen am Seitenanfang.
      if (lastFocused && lastFocused.isConnected) lastFocused.focus();
      lastFocused = null;
    };

    const reduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) finish();
    else setTimeout(finish, 160);
  }

  function isOpen() {
    return !!overlay && !overlay.hidden;
  }

  document.addEventListener("keydown", (e) => {
    // Nur Strg/Cmd+K. Ein blosses "/" waere bequem, wuerde aber jede
    // Texteingabe der Seite (Nickname, Code, Support-Text) kapern.
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      isOpen() ? close() : open();
      return;
    }
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      close();
    }
  });

  window.fhQuickSearch = { open, close, isOpen };
})();
