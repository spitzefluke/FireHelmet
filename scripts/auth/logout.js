/* ======================================================
   FIREHELMET – ABMELDEN
   ------------------------------------------------------
   Zeigt den Abmelden-Button nur bei einem echten Supabase-Konto.
   Anonyme Sitzungen gelten weiterhin als Gast.
====================================================== */
(function () {
  "use strict";

  let aktuelleSession = null;

  function istEchtAngemeldet(session) {
    const user = session && session.user;
    return !!(user && user.is_anonymous !== true);
  }

  function aktualisiereNavigation(session) {
    aktuelleSession = session || null;
    const angemeldet = istEchtAngemeldet(session);

    document.querySelectorAll('.fh-nav-item[data-page="login"]').forEach(function (el) {
      el.style.display = angemeldet ? "none" : "";
    });

    document.querySelectorAll(".fh-logout-item").forEach(function (el) {
      el.style.display = angemeldet ? "flex" : "none";
    });
  }

  function abmelden() {
    if (!window.supabaseClient || !window.supabaseClient.auth) return;

    const buttons = document.querySelectorAll(".fh-logout-item");
    buttons.forEach(function (button) {
      button.disabled = true;
      const label = button.querySelector(".fh-nav-label");
      if (label) label.textContent = "Abmelden ...";
    });

    window.supabaseClient.auth.signOut({ scope: "local" }).then(function (result) {
      if (result && result.error) throw result.error;
      aktualisiereNavigation(null);
      if (typeof window.changePage === "function") {
        window.changePage("login");
      } else {
        window.location.reload();
      }
    }).catch(function (error) {
      console.error("FireHelmet: Abmelden fehlgeschlagen", error);
      buttons.forEach(function (button) { button.disabled = false; });
      alert("Abmelden fehlgeschlagen. Bitte versuche es erneut.");
    });
  }

  function buttonErstellen() {
    const nav = document.querySelector(".fh-sidebar-nav");
    if (!nav || document.getElementById("fh-logout-button")) return;

    const button = document.createElement("button");
    button.id = "fh-logout-button";
    button.type = "button";
    button.className = "fh-nav-item fh-logout-item";
    button.innerHTML = '<span class="fh-nav-icon" aria-hidden="true"><i class="ph ph-sign-out"></i></span><span class="fh-nav-label" data-i18n="menu.logout">Abmelden</span>';
    button.addEventListener("click", abmelden);
    nav.appendChild(button);
  }

  function initialisieren() {
    buttonErstellen();

    if (!window.supabaseClient || !window.supabaseClient.auth) return false;

    window.supabaseClient.auth.getSession().then(function (result) {
      aktualisiereNavigation(result && result.data ? result.data.session : null);
    });

    window.supabaseClient.auth.onAuthStateChange(function (_event, session) {
      aktualisiereNavigation(session);
    });

    if (typeof window.applyTranslations === "function") {
      window.applyTranslations();
    }

    return true;
  }

  function wartenAufSupabase() {
    if (initialisieren()) return;
    let versuche = 0;
    const timer = setInterval(function () {
      versuche += 1;
      if (initialisieren() || versuche >= 100) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wartenAufSupabase);
  } else {
    wartenAufSupabase();
  }
})();
