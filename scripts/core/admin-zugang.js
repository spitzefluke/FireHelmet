/* ======================================================
   ADMIN-ZUGANG (immer geladen)
   ---------------------------------------------------
   Der Admin-Bereich selbst (scripts/core/admin-gateway.js, rund
   140 KB) wird erst nachgeladen, wenn jemand die Seite "gateway"
   oeffnet - siehe scripts/core/nachladen.js. Hier steht nur, was
   andere Skripte schon vorher brauchen:

   - isAuthorizedAdmin(user): streamraetsel.js fragt damit, ob die
     Admin-Vorschau gilt. Gleiche Pruefung wie bisher (E-Mail des
     Google-Kontos gegen FIRE_HELMET_CONFIG.ownerEmail). Die echte
     Sicherheitsgrenze ist app.is_admin() in der Datenbank.
   - updateGatewayPage(pageID): main.js ruft das bei jedem
     Seitenwechsel auf. Beim ersten Besuch des Admin-Bereichs laedt
     es admin-gateway.js nach; dessen eigene updateGatewayPage()
     ersetzt diese hier, ab dann laeuft alles wie frueher.
====================================================== */

function getGoogleEmail(user) {
  return user ? user.email : null;
}

function isAuthorizedAdmin(user) {
  const email = getGoogleEmail(user);
  return !!email && typeof FIRE_HELMET_CONFIG !== "undefined" && email.toLowerCase() === (FIRE_HELMET_CONFIG.ownerEmail || "").toLowerCase();
}

function updateGatewayPage(pageID) {
  if (pageID !== "gateway") return;
  const platzhalter = updateGatewayPage;
  const seite = document.getElementById("gateway");
  const inhalt = document.getElementById("gateway-content");
  const hinweis = function (text) {
    if (!inhalt) return;
    const p = document.createElement("p");
    p.className = "gateway-status-sub";
    p.textContent = text;
    inhalt.replaceChildren(p);
  };
  if (inhalt && !inhalt.children.length) hinweis("Lade Admin-Bereich …");
  window.fhNachladen("admin").then(function () {
    /* Nur weiter, wenn admin-gateway.js diese Funktion wirklich
       ersetzt hat - sonst liefe es hier im Kreis. */
    if (updateGatewayPage === platzhalter) return;
    if (seite && seite.classList.contains("active-page")) updateGatewayPage("gateway");
  }, function (err) {
    console.error(err);
    hinweis("Admin-Bereich ließ sich nicht laden – bitte die Seite neu laden.");
  });
}
