/* ======================================================
   WIEDERHERSTELLUNGS-KENNWORT
   ---------------------------------------------------
   WOFUER: Die Anmeldung laeuft ueber ein anonymes Supabase-Konto,
   dessen Sitzung ausschliesslich im Browserspeicher liegt. Raeumt
   der Browser den weg - Safari/iOS kappt skript-schreibbaren
   Speicher nach 7 Tagen, ebenso privates Fenster, Verlauf loeschen,
   anderes Geraet -, bekommt dieselbe Person ein NEUES Konto mit
   neuer ID, und Dublonen, Level, Schiffsreparatur sowie eine
   Turnier-Anmeldung sind fuer sie unerreichbar.

   Genau das ist am 08.09.2026 passiert: zwei Turnierteilnehmer
   konnten ihr Match nicht spielen, weil ihr Browser zwischen
   Anmeldung und Turnierstart eine neue Identitaet bekommen hatte.

   WIE ES FUNKTIONIERT: Jeder bekommt ein achtstelliges Kennwort.
   Wer es auf einem anderen Geraet eingibt, meldet sich dort ganz
   normal anonym an - und die Datenbank schreibt anschliessend die
   alten Zeilen auf diese neue ID um (app.kennwort_einloesen(),
   siehe supabase/game-migration/12-spieler-kennwort.sql).

   Warum umziehen statt anmelden: eine Supabase-Sitzung laesst sich
   vom Browser aus nicht auf eine fremde Benutzer-ID umschreiben -
   dafuer braeuchte es den Dienstschluessel, und der gehoert
   niemals in eine Webseite.
====================================================== */

let fhKennwortGeladen = null;   // das eigene Kennwort, sobald abgerufen
let fhKennwortLaeuft = false;   // gegen Doppelklicks

function fhKennwortText(schluessel, rueckfall) {
  return typeof tt === "function" ? tt(schluessel, rueckfall) : rueckfall;
}

function fhKennwortStatus(text, art) {
  const el = document.getElementById("fh-kennwort-status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-negative", art === "fehler");
  el.classList.toggle("is-positive", art === "gut");
}

// ABCD2345 -> ABCD-2345 (nur fuers Auge, gespeichert wird ohne Strich)
function fhKennwortHuebsch(code) {
  if (!code || code.length !== 8) return code || "";
  return code.slice(0, 4) + "-" + code.slice(4);
}

/* ------------------------------------------------------
   EIGENES KENNWORT ANZEIGEN
   Bewusst erst auf Klick: das Kennwort soll nicht dauerhaft
   offen auf dem Bildschirm stehen, wenn jemand den Stream teilt
   oder das Handy weiterreicht.
------------------------------------------------------ */
async function fhKennwortZeigen() {
  const wert = document.getElementById("fh-kennwort-wert");
  const zeigen = document.getElementById("fh-kennwort-zeigen");
  const kopieren = document.getElementById("fh-kennwort-kopieren");
  if (!wert || !supabaseClient) return;

  if (fhKennwortGeladen) {
    wert.textContent = fhKennwortHuebsch(fhKennwortGeladen);
    if (zeigen) zeigen.hidden = true;
    if (kopieren) kopieren.hidden = false;
    return;
  }

  if (zeigen) zeigen.disabled = true;
  fhKennwortStatus("");

  try {
    const uid = await wheelAuthReady;
    if (!uid) {
      fhKennwortStatus(fhKennwortText("kennwort.nichtAngemeldet",
        "Du bist noch nicht angemeldet - lade die Seite neu."), "fehler");
      return;
    }
    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    const { data, error } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient.rpc("mein_kennwort")
    );
    if (error) throw error;

    fhKennwortGeladen = data;
    wert.textContent = fhKennwortHuebsch(data);
    if (zeigen) zeigen.hidden = true;
    if (kopieren) kopieren.hidden = false;
  } catch (err) {
    console.error("Kennwort konnte nicht geladen werden:", err);
    fhKennwortStatus(fhKennwortText("kennwort.ladeFehler",
      "Kennwort konnte gerade nicht geladen werden. Versuch es gleich noch einmal."), "fehler");
  } finally {
    if (zeigen) zeigen.disabled = false;
  }
}

async function fhKennwortKopieren() {
  if (!fhKennwortGeladen) return;
  const huebsch = fhKennwortHuebsch(fhKennwortGeladen);
  try {
    // Kann in unsicherem Kontext oder ohne Erlaubnis fehlschlagen -
    // dann bleibt das Kennwort ja weiterhin sichtbar zum Abschreiben.
    await navigator.clipboard.writeText(huebsch);
    fhKennwortStatus(fhKennwortText("kennwort.kopiert", "Kennwort kopiert."), "gut");
  } catch (err) {
    fhKennwortStatus(fhKennwortText("kennwort.kopierenFehlt",
      "Kopieren geht hier nicht - schreib es bitte ab."), "fehler");
  }
}

/* ------------------------------------------------------
   KENNWORT EINLOESEN
   Die Serverfunktion wirft NICHT, sondern liefert einen Status -
   siehe Begruendung in 12-spieler-kennwort.sql (ein "raise" wuerde
   den Fehlversuchszaehler mit zurueckrollen).
------------------------------------------------------ */
const FH_KENNWORT_MELDUNGEN = {
  "code-ungueltig": ["kennwort.fehlerUngueltig", "Das Kennwort hat acht Zeichen - schau noch mal nach."],
  "code-unbekannt": ["kennwort.fehlerUnbekannt", "Zu diesem Kennwort gibt es kein Konto."],
  "ziel-nicht-leer": ["kennwort.fehlerNichtLeer", "Auf diesem Geraet wurde schon gespielt. Ein Konto holen geht nur auf ein frisches Geraet - sonst wuerde dein Fortschritt hier verloren gehen."],
  "zu-viele-versuche": ["kennwort.fehlerZuVielVersuche", "Zu viele Fehlversuche. Probier es morgen wieder."],
  "schon-du": ["kennwort.schonDu", "Das ist bereits dein eigenes Konto."],
};

async function fhKennwortEinloesen() {
  const eingabe = document.getElementById("fh-kennwort-eingabe");
  const knopf = document.getElementById("fh-kennwort-einloesen");
  if (!eingabe || !supabaseClient || fhKennwortLaeuft) return;

  const roh = (eingabe.value || "").trim();
  if (!roh) return;

  fhKennwortLaeuft = true;
  if (knopf) knopf.disabled = true;
  fhKennwortStatus(fhKennwortText("kennwort.laeuft", "Einen Moment ..."));

  try {
    const uid = await wheelAuthReady;
    if (!uid) {
      fhKennwortStatus(fhKennwortText("kennwort.nichtAngemeldet",
        "Du bist noch nicht angemeldet - lade die Seite neu."), "fehler");
      return;
    }

    const { data, error } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient.rpc("kennwort_einloesen", { p_code: roh })
    );
    if (error) throw error;

    if (data === "ok") {
      fhKennwortStatus(fhKennwortText("kennwort.geholt",
        "Geschafft! Dein Konto ist jetzt auf diesem Geraet. Die Seite laedt gleich neu."), "gut");
      eingabe.value = "";
      // Der komplette Seitenzustand (Name, Dublonen, Level, Schiff)
      // haengt an Werten, die beim Laden einmal gelesen wurden -
      // ein Neuladen ist hier ehrlicher als zwanzig Einzelaktualisierungen.
      setTimeout(() => window.location.reload(), 1800);
      return;
    }

    const meldung = FH_KENNWORT_MELDUNGEN[data];
    fhKennwortStatus(
      meldung ? fhKennwortText(meldung[0], meldung[1]) : String(data),
      data === "schon-du" ? "gut" : "fehler"
    );
  } catch (err) {
    console.error("Kennwort konnte nicht eingeloest werden:", err);
    fhKennwortStatus(fhKennwortText("kennwort.serverFehler",
      "Das hat gerade nicht geklappt. Versuch es gleich noch einmal."), "fehler");
  } finally {
    fhKennwortLaeuft = false;
    if (knopf) knopf.disabled = false;
  }
}

/* Enter im Eingabefeld loest dasselbe aus wie der Knopf. */
document.addEventListener("DOMContentLoaded", function () {
  const eingabe = document.getElementById("fh-kennwort-eingabe");
  if (!eingabe) return;
  eingabe.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      fhKennwortEinloesen();
    }
  });
});
