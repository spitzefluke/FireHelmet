/* ======================================================
   ANMELDUNG - ECHTE KONTEN STATT NUR EIN NAME IM BROWSER
   ---------------------------------------------------
   WAS VORHER FALSCH WAR
   Die alten Dateien twitch-auth.js und discord-auth.js holten sich
   per OAuth Name und Bild ab und legten beides in localStorage. Der
   Server sah davon nichts. Wer im Browser die Konsole oeffnete und

     localStorage.wheelNickname = "Ändii"
     localStorage.loginProvider = "twitch"

   eintippte, stand danach als verifizierter Twitch-Nutzer in der
   Rangliste. Die Anmeldung war reine Anzeige.

   WIE ES JETZT LAEUFT
   Supabase fuehrt den OAuth-Tanz selbst und stellt am Ende ein
   signiertes Token aus. Name und Bild kommen aus diesem Token, nicht
   aus dem Browser - faelschen liesse sich das nur mit dem geheimen
   Schluessel des Projekts, und der liegt nirgends im Browser.

   WARUM linkIdentity() UND NICHT signInWithOAuth()
   Wer anonym gespielt hat, hat Dublonen, Schiffsfortschritt und
   Boss-Schaden an seiner anonymen UID haengen. signInWithOAuth()
   wuerde eine NEUE Sitzung mit NEUER UID anlegen - der ganze
   Fortschritt waere aus Sicht des Spielers verschwunden (er laege
   noch da, nur unerreichbar). linkIdentity() haengt die Twitch-
   oder Discord-Identitaet an das BESTEHENDE anonyme Konto: dieselbe
   UID, derselbe Fortschritt, nur jetzt mit Nachweis.

   Erst wenn gar keine Sitzung existiert, ist signInWithOAuth()
   richtig - dann gibt es auch nichts zu bewahren.

   VORAUSSETZUNG IM SUPABASE-DASHBOARD
   Authentication -> Sign In / Providers: Twitch, Discord und Google
   aktivieren und die jeweilige Client-ID/Secret eintragen. Fuer den
   E-Mail-Weg genuegt der bereits aktive Email-Provider.
   Authentication -> URL Configuration: die Adresse der Seite unter
   "Redirect URLs" eintragen (bei einer eigenen Domain spaeter die
   neue Adresse ergaenzen, siehe DOMAIN.md).
====================================================== */

/* Die vier Wege hinein. "anon" ist bewusst kein Eintrag hier -
   anonym bleibt der Standard und braucht keinen Knopf. */
const FH_ANMELDE_WEGE = Object.freeze({
  twitch:  { label: "Twitch",  farbe: "#9146ff", icon: "🟣" },
  discord: { label: "Discord", farbe: "#5865f2", icon: "🔵" },
  google:  { label: "Google",  farbe: "#ffffff", icon: "🔴" },
});

function fhAnmeldeZiel() {
  /* Wohin Supabase nach dem Anmelden zurueckschickt. Bewusst ohne
     Fragment und ohne Suchteil: sonst landet der Nutzer nach dem
     Umweg auf einer Unterseite, die er nie geoeffnet hat. */
  return window.location.origin + window.location.pathname;
}

function fhAnmeldeStatus(text, art) {
  const el = document.getElementById("fh-anmelde-status");
  if (el) {
    el.textContent = text || "";
    el.classList.toggle("ist-fehler", art === "fehler");
  }
  if (art === "fehler" && typeof fhNotice === "function") fhNotice(text, "error");
}

/* ------------------------------------------------------
   ANMELDEN ODER VERKNUEPFEN
------------------------------------------------------ */
async function fhAnmeldenMit(provider) {
  if (!supabaseClient) {
    fhAnmeldeStatus("Die Anmeldung ist gerade nicht erreichbar.", "fehler");
    return;
  }
  if (!FH_ANMELDE_WEGE[provider]) return;

  try {
    const { data: sitzung } = await supabaseClient.auth.getSession();
    const nutzer = sitzung && sitzung.session ? sitzung.session.user : null;

    /* Anonyme Sitzung vorhanden -> verknuepfen, damit der bisherige
       Fortschritt an derselben UID haengen bleibt. */
    if (nutzer && nutzer.is_anonymous) {
      fhAnmeldeStatus("Dein Fortschritt wird übernommen …");
      const { error } = await supabaseClient.auth.linkIdentity({
        provider,
        options: { redirectTo: fhAnmeldeZiel() },
      });
      if (error) throw error;
      return; // Browser wechselt jetzt zum Anbieter
    }

    /* Bereits mit einem echten Konto angemeldet -> weiteren Anbieter
       dazuhaengen, damit man sich kuenftig auch darueber anmelden
       kann. Nichts geht verloren. */
    if (nutzer && !nutzer.is_anonymous) {
      const schon = (nutzer.identities || []).some((i) => i.provider === provider);
      if (schon) {
        fhAnmeldeStatus("Dieses Konto ist bereits verknüpft.");
        return;
      }
      const { error } = await supabaseClient.auth.linkIdentity({
        provider,
        options: { redirectTo: fhAnmeldeZiel() },
      });
      if (error) throw error;
      return;
    }

    // Gar keine Sitzung - dann ist ein normaler Login richtig.
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: fhAnmeldeZiel() },
    });
    if (error) throw error;
  } catch (err) {
    console.warn("Anmeldung fehlgeschlagen:", err);
    fhAnmeldeStatus(
      "Anmeldung fehlgeschlagen: " + (err && err.message ? err.message : "unbekannter Fehler"),
      "fehler"
    );
  }
}

/* ------------------------------------------------------
   E-MAIL: EINMAL-LINK STATT KENNWORT
   ---------------------------------------------------
   Kein Kennwort - eines mehr zu verwalten waere fuer eine
   Spielseite eine Zumutung, und ein schlecht gewaehltes waere ein
   Risiko. Supabase schickt einen Link, ein Klick genuegt.

   Bei einer anonymen Sitzung wird updateUser() benutzt statt
   signInWithOtp(): das haengt die Adresse an das BESTEHENDE Konto,
   der Fortschritt bleibt also erhalten - dieselbe Ueberlegung wie
   bei linkIdentity() oben.
------------------------------------------------------ */
async function fhAnmeldenMitEmail(adresse) {
  if (!supabaseClient) {
    fhAnmeldeStatus("Die Anmeldung ist gerade nicht erreichbar.", "fehler");
    return;
  }
  const email = String(adresse || "").trim();
  // Absichtlich grob: die eigentliche Pruefung macht Supabase, und
  // eine strenge Regex sperrt regelmaessig gueltige Adressen aus.
  if (!email || email.indexOf("@") < 1 || email.length > 254) {
    fhAnmeldeStatus("Bitte eine gültige E-Mail-Adresse eingeben.", "fehler");
    return;
  }

  try {
    const { data: sitzung } = await supabaseClient.auth.getSession();
    const nutzer = sitzung && sitzung.session ? sitzung.session.user : null;

    if (nutzer && nutzer.is_anonymous) {
      const { error } = await supabaseClient.auth.updateUser({ email });
      if (error) throw error;
      fhAnmeldeStatus("Wir haben dir einen Link geschickt. Dein Fortschritt bleibt erhalten.");
      return;
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: fhAnmeldeZiel() },
    });
    if (error) throw error;
    fhAnmeldeStatus("Wir haben dir einen Link geschickt. Schau in dein Postfach.");
  } catch (err) {
    console.warn("E-Mail-Anmeldung fehlgeschlagen:", err);
    fhAnmeldeStatus(
      "Hat nicht geklappt: " + (err && err.message ? err.message : "unbekannter Fehler"),
      "fehler"
    );
  }
}

/* ------------------------------------------------------
   ABMELDEN
   ---------------------------------------------------
   Danach legt supabase-client.js beim naechsten Laden wieder eine
   anonyme Sitzung an - man steht also nie vor einer toten Seite,
   sondern spielt einfach wieder als Gast weiter.
------------------------------------------------------ */
async function fhAbmelden() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut();
    // Der lokale Anzeigename gehoerte zur alten Sitzung.
    ["wheelNickname", "loginProvider", "wheelAvatar",
     "twitchAvatar", "discordAvatar"].forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) { /* Privatmodus */ }
    });
    window.location.reload();
  } catch (err) {
    console.warn("Abmelden fehlgeschlagen:", err);
  }
}

/* ------------------------------------------------------
   NAME UND BILD AUS DEM TOKEN UEBERNEHMEN
   ---------------------------------------------------
   Die Quelle ist ausdruecklich user.user_metadata, nicht
   localStorage. Supabase fuellt das aus der Antwort des Anbieters,
   nachdem es dessen Signatur geprueft hat.

   Der Server schreibt die Anmeldeart selbst mit (siehe
   app.meine_anmeldeart() in 16-anmeldung.sql) - der Browser kann
   sich also nicht als verifiziert ausgeben.
------------------------------------------------------ */
function fhNameAusToken(nutzer) {
  if (!nutzer) return "";
  const m = nutzer.user_metadata || {};
  // Die Anbieter benutzen unterschiedliche Felder - der Reihe nach
  // durchprobieren statt einen einzelnen zu erraten.
  const roh = m.preferred_username || m.nickname || m.user_name ||
              m.full_name || m.name || (nutzer.email || "").split("@")[0] || "";
  return String(roh).slice(0, 30);
}

function fhBildAusToken(nutzer) {
  if (!nutzer) return "";
  const m = nutzer.user_metadata || {};
  const url = m.avatar_url || m.picture || "";
  // Nur https zulassen: ein "javascript:"- oder "data:"-Wert landet
  // sonst in einem img-src. Der Wert kommt zwar vom Anbieter, aber
  // eine Quelle, die man nicht selbst kontrolliert, prueft man.
  return /^https:\/\//.test(url) ? String(url).slice(0, 300) : "";
}

async function fhAngemeldeterNutzer() {
  if (!supabaseClient) return null;
  try {
    const { data } = await supabaseClient.auth.getSession();
    const nutzer = data && data.session ? data.session.user : null;
    if (!nutzer || nutzer.is_anonymous) return null;
    return nutzer;
  } catch (err) {
    return null;
  }
}

/* Nach einer erfolgreichen Anmeldung Name und Bild in die
   players-Zeile nachtragen. Idempotent - ein zweiter Aufruf mit
   denselben Werten aendert nichts. */
async function fhAnmeldungUebernehmen() {
  const nutzer = await fhAngemeldeterNutzer();
  if (!nutzer) return;

  const name = fhNameAusToken(nutzer);
  const bild = fhBildAusToken(nutzer);
  if (!name) return;

  /* Die bestehende "angemeldet"-Anzeige (refreshTwitchLoginUI() in
     twitch-auth.js) liest ihren Zustand aus localStorage. Sie wird
     hier weiterversorgt, damit die Oberflaeche unveraendert
     funktioniert.

     WICHTIG ZUM VERSTAENDNIS: diese Werte sind ab jetzt nur noch
     ANZEIGE, keine Behauptung mehr. Frueher entschied localStorage,
     wer als verifiziert galt - deshalb liess sich der Name faelschen.
     Heute entscheidet players.anmeldeart, und die setzt der Server
     aus dem signierten Token (app.anmeldeart_festhalten()). Wer hier
     von Hand etwas eintraegt, aendert sein Bild auf dem eigenen
     Schirm und sonst nichts. */
  const anbieter = (nutzer.app_metadata && nutzer.app_metadata.provider) || "email";
  try {
    localStorage.setItem("wheelNickname", name);
    localStorage.setItem("loginProvider", anbieter);
    if (bild) {
      localStorage.setItem("wheelAvatar", bild);
      // Die alte Anzeige sucht je Anbieter einen eigenen Schluessel.
      if (anbieter === "discord") localStorage.setItem("discordAvatar", bild);
      if (anbieter === "twitch")  localStorage.setItem("twitchAvatar", bild);
    }
  } catch (e) { /* Privatmodus - dann eben ohne gespeicherte Anzeige */ }

  if (typeof refreshTwitchLoginUI === "function") refreshTwitchLoginUI();

  if (typeof savePlayerData === "function") {
    const felder = { nickname: name };
    if (bild) felder.avatar = bild;
    savePlayerData(felder);
  }

  /* Die Anmeldeart auf dem Server festhalten. Der Server liest sie
     aus dem Token, das Argument dient nur der Nachvollziehbarkeit -
     ein gefaelschter Wert aendert nichts. */
  if (supabaseClient) {
    try { await supabaseClient.rpc("anmeldeart_festhalten"); }
    catch (err) { /* Migration noch nicht eingespielt - unkritisch */ }
  }
}

/* ------------------------------------------------------
   KNOEPFE VERDRAHTEN
------------------------------------------------------ */
function fhAnmeldungVerdrahten() {
  document.querySelectorAll("[data-anmeldung]").forEach(function (btn) {
    if (btn.dataset.fhVerdrahtet) return;
    btn.dataset.fhVerdrahtet = "1";
    btn.addEventListener("click", function () {
      fhAnmeldenMit(btn.getAttribute("data-anmeldung"));
    });
  });

  const form = document.getElementById("fh-email-anmeldung");
  if (form && !form.dataset.fhVerdrahtet) {
    form.dataset.fhVerdrahtet = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const feld = document.getElementById("fh-email-feld");
      fhAnmeldenMitEmail(feld ? feld.value : "");
    });
  }

  const abmelden = document.getElementById("fh-abmelden-btn");
  if (abmelden && !abmelden.dataset.fhVerdrahtet) {
    abmelden.dataset.fhVerdrahtet = "1";
    abmelden.addEventListener("click", fhAbmelden);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  fhAnmeldungVerdrahten();
  // Nach einem Redirect vom Anbieter steht die Sitzung schon - dann
  // Name und Bild einmal nachtragen.
  fhAnmeldungUebernehmen();
});
