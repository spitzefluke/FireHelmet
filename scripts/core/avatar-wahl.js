/* ======================================================
   AVATARWAHL PER KLICK AUFS EIGENE BILD
   ---------------------------------------------------
   Bisher liess sich der Avatar nur auf der Anmeldeseite wechseln, und
   auch dort nur zusammen mit dem Namen ("Speichern"). Wer seinen
   Namen laengst hatte, kam an die Auswahl praktisch nicht mehr heran.

   Jetzt oeffnet ein Klick auf das eigene Bild in der Spielerkarte
   dieses Fenster. Die Auswahl selbst ist dieselbe wie auf der
   Anmeldeseite: renderAvatarPicker() (wheel.js) fuellt beide Stellen
   mit demselben Markup, damit sie nie auseinanderlaufen.

   Bei Anmeldung ueber Twitch oder Discord kommt das Bild von dort -
   dann waere eine Auswahl irrefuehrend, und das Fenster sagt das
   stattdessen.
====================================================== */

const FH_AVATAR_FENSTER_ID = "fh-avatar-fenster";
let fhAvatarVorher = null;   // Auswahl beim Oeffnen, fuer "Abbrechen"

function fhAvatarText(schluessel, rueckfall) {
  return typeof t === "function" ? t(schluessel, rueckfall) : rueckfall;
}

function fhAvatarFremdanbieter() {
  const p = localStorage.getItem("loginProvider") || "";
  if (p === "twitch") return "Twitch";
  if (p === "discord") return "Discord";
  return null;
}

function fhAvatarWahlSchliessen() {
  const f = document.getElementById(FH_AVATAR_FENSTER_ID);
  if (f) f.remove();
  document.removeEventListener("keydown", fhAvatarTaste);
}

function fhAvatarTaste(e) {
  if (e.key === "Escape") {
    fhAvatarWahlAbbrechen();
  }
}

function fhAvatarWahlAbbrechen() {
  // Die Auswahl im Fenster hat selectedWheelAvatar bereits umgesetzt
  // (dieselbe Funktion wie auf der Anmeldeseite) - beim Abbrechen
  // muss der Stand von vorher zurueck, sonst wirkt die Wahl beim
  // naechsten Speichern anderswo doch noch.
  if (fhAvatarVorher !== null && typeof selectWheelAvatar === "function") {
    selectWheelAvatar(encodeURIComponent(fhAvatarVorher));
  }
  fhAvatarWahlSchliessen();
}

async function fhAvatarWahlSpeichern() {
  if (typeof selectedWheelAvatar === "undefined" || !selectedWheelAvatar) {
    fhAvatarWahlSchliessen();
    return;
  }

  localStorage.setItem("wheelAvatar", selectedWheelAvatar);

  // savePlayerData() liest den Avatar selbst aus dem localStorage
  // (siehe wheel.js) - deshalb reicht hier ein leeres Feld-Objekt.
  if (typeof savePlayerData === "function") savePlayerData({});
  if (typeof refreshPlayerCard === "function") refreshPlayerCard();
  if (typeof renderAvatarPicker === "function") renderAvatarPicker();

  fhAvatarWahlSchliessen();
}

function fhAvatarWahlOeffnen() {
  if (document.getElementById(FH_AVATAR_FENSTER_ID)) return;

  fhAvatarVorher = typeof selectedWheelAvatar !== "undefined" ? selectedWheelAvatar : null;

  const fremd = fhAvatarFremdanbieter();

  const fenster = document.createElement("div");
  fenster.id = FH_AVATAR_FENSTER_ID;
  fenster.className = "fh-avatar-fenster";
  fenster.setAttribute("role", "dialog");
  fenster.setAttribute("aria-modal", "true");
  fenster.setAttribute("aria-label", fhAvatarText("avatar.titel", "Avatar wählen"));

  fenster.innerHTML = `
    <div class="fh-avatar-hintergrund" data-fh-avatar-zu></div>
    <div class="fh-avatar-kasten">
      <h2 class="fh-avatar-titel">${fhAvatarText("avatar.titel", "Avatar wählen")}</h2>
      ${fremd
        ? `<p class="fh-avatar-text">${fhAvatarText("avatar.fremd", "Dein Bild kommt gerade von")} <strong>${fremd}</strong>. ${fhAvatarText("avatar.fremdHinweis", "Melde dich dort ab, um wieder ein eigenes zu wählen.")}</p>`
        : `<p class="fh-avatar-text">${fhAvatarText("avatar.hinweis", "Gesperrte Bilder schaltest du über Codes und das Schatzrad frei.")}</p>
           <div class="wheel-avatar-picker js-avatar-picker"></div>`}
      <div class="fh-avatar-knoepfe">
        ${fremd ? "" : `<button type="button" class="code-button" onclick="fhAvatarWahlSpeichern()">${fhAvatarText("avatar.uebernehmen", "Übernehmen")}</button>`}
        <button type="button" class="code-button" data-fh-avatar-zu>${fhAvatarText(fremd ? "common.close" : "common.cancel", fremd ? "Schließen" : "Abbrechen")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(fenster);

  fenster.querySelectorAll("[data-fh-avatar-zu]").forEach((el) => {
    el.addEventListener("click", fhAvatarWahlAbbrechen);
  });
  document.addEventListener("keydown", fhAvatarTaste);

  if (!fremd && typeof renderAvatarPicker === "function") renderAvatarPicker();
  // Der zeitlich befristete Avatar kommt vom Server - beim Oeffnen
  // nachziehen, damit ein abgelaufener nicht faelschlich waehlbar ist.
  if (!fremd && typeof syncTempAvatarFromServer === "function") syncTempAvatarFromServer();

  const ersterKnopf = fenster.querySelector(".fh-avatar-kasten button");
  if (ersterKnopf) ersterKnopf.focus();
}
