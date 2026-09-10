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
  const el = document.getElementById("fh-login-meldung");
  if (el) {
    el.textContent = text || "";
    el.classList.toggle("ist-fehler", art === "fehler");
    el.classList.toggle("ist-gut", art === "gut");
  }
  if (art === "fehler" && typeof fhNotice === "function") fhNotice(text, "error");
}

/* ------------------------------------------------------
   NAME UND PASSWORT
   ---------------------------------------------------
   WARUM HIER EINE ADRESSE ERFUNDEN WIRD
   Supabase kennt keine Anmeldung per Benutzername. Passwort heisst
   dort immer signUp({ email, password }) - es gibt schlicht kein
   Feld fuer einen Namen. Wer ohne E-Mail spielen will, braucht also
   trotzdem eine Adresse.

   Deshalb wird aus dem Namen eine erzeugt:

     "Kapitaen Ahab"  ->  kapitaen-ahab@spieler.firehelmet.de

   Die sieht niemand, sie ist reiner Schluessel. Zwei angenehme
   Nebenwirkungen: die Ableitung ist eindeutig (Supabase vergibt
   keine Adresse zweimal, damit sind Namen automatisch einmalig),
   und sie ist im Browser berechenbar - es braucht KEINE Tabelle,
   die Namen auf Adressen abbildet. Eine solche Tabelle waere ein
   Datenleck: wer sie abfragen darf, kann zu jedem Namen die echte
   E-Mail auslesen.

   WER EINE ECHTE ADRESSE HINTERLEGT, MELDET SICH MIT DIESER AN
   Das ist keine Nachlaessigkeit, sondern die Folge derselben
   Einschraenkung: ein Konto hat bei Supabase GENAU EINE Adresse.
   Soll das Zuruecksetzen per Mail funktionieren, muss es die echte
   sein - dann ist die erfundene weg. Das Anmeldefeld nimmt deshalb
   beides entgegen, und die Fehlermeldung sagt es.
------------------------------------------------------ */
const FH_LOGIN_DOMAIN = "spieler.firehelmet.de";
const FH_PASSWORT_MIN = 8;

/* Name -> Adresse. Bewusst streng: nur a-z, 0-9 und Bindestriche,
   damit dieselbe Eingabe immer dieselbe Adresse ergibt - auch mit
   Umlauten, Grossbuchstaben oder doppelten Leerzeichen. */
function fhNamensSchluessel(name) {
  return String(name || "")
    .trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Was der Nutzer eingetippt hat -> womit wir uns anmelden.
   Steht ein @ drin, ist es schon eine Adresse. */
function fhLoginAdresse(eingabe) {
  const roh = String(eingabe || "").trim();
  if (roh.indexOf("@") > 0) return roh;
  const schluessel = fhNamensSchluessel(roh);
  return schluessel ? schluessel + "@" + FH_LOGIN_DOMAIN : "";
}

/* Der Umschalter oben. */
function fhAnmeldeTab(welcher) {
  const paare = [
    ["fh-tab-anmelden", "fh-feld-anmelden", "anmelden"],
    ["fh-tab-registrieren", "fh-feld-registrieren", "registrieren"],
  ];
  paare.forEach(function (paar) {
    const tab = document.getElementById(paar[0]);
    const feld = document.getElementById(paar[1]);
    const aktiv = paar[2] === welcher;
    if (tab) {
      tab.classList.toggle("ist-aktiv", aktiv);
      tab.setAttribute("aria-selected", aktiv ? "true" : "false");
    }
    if (feld) feld.hidden = !aktiv;
  });
  fhAnmeldeStatus("");
}

async function fhRegistrieren() {
  if (!supabaseClient) {
    fhAnmeldeStatus("Die Anmeldung ist gerade nicht erreichbar.", "fehler");
    return;
  }
  const name  = (document.getElementById("fh-reg-name") || {}).value || "";
  const pw    = (document.getElementById("fh-reg-passwort") || {}).value || "";
  const pw2   = (document.getElementById("fh-reg-passwort2") || {}).value || "";
  const mail  = String((document.getElementById("fh-reg-mail") || {}).value || "").trim();

  const schluessel = fhNamensSchluessel(name);
  if (schluessel.length < 2) {
    fhAnmeldeStatus("Bitte einen Namen mit mindestens zwei Buchstaben oder Ziffern.", "fehler");
    return;
  }
  if (pw.length < FH_PASSWORT_MIN) {
    fhAnmeldeStatus("Das Passwort braucht mindestens " + FH_PASSWORT_MIN + " Zeichen.", "fehler");
    return;
  }
  if (pw !== pw2) {
    fhAnmeldeStatus("Die beiden Passwörter stimmen nicht überein.", "fehler");
    return;
  }
  if (mail && (mail.indexOf("@") < 1 || mail.length > 254)) {
    fhAnmeldeStatus("Die E-Mail-Adresse sieht nicht richtig aus. Du kannst sie auch leer lassen.", "fehler");
    return;
  }

  /* Mit Adresse: die echte, damit das Zuruecksetzen spaeter geht.
     Ohne: die erzeugte. */
  const adresse = mail || (schluessel + "@" + FH_LOGIN_DOMAIN);

  try {
    fhAnmeldeStatus("Konto wird angelegt ...");
    const { data, error } = await supabaseClient.auth.signUp({
      email: adresse,
      password: pw,
      /* Der Anzeigename gehoert in user_metadata, nicht in die
         Adresse - aus "kapitaen-ahab" liesse sich "Kapitän Ahab"
         nicht zurueckgewinnen. */
      options: { data: { anzeige_name: String(name).trim() },
                 emailRedirectTo: fhAnmeldeZiel() },
    });
    if (error) throw error;

    try { localStorage.setItem("wheelNickname", String(name).trim()); } catch (err) {}

    /* Steht in der Antwort eine Sitzung, ist man schon drin. Fehlt
       sie, verlangt Supabase eine Bestaetigung per Mail - und dann
       darf hier NICHT "angemeldet" stehen. Ohne echte Adresse ginge
       die Bestaetigung ins Leere, deshalb der ehrliche Hinweis. */
    const sitzungDa = !!(data && data.session);
    if (sitzungDa) {
      fhAnmeldeStatus("Konto angelegt. Du bist angemeldet.", "gut");
      if (typeof fhAnmeldungUebernehmen === "function") fhAnmeldungUebernehmen();
    } else if (mail) {
      fhAnmeldeStatus("Konto angelegt. Bestätige es über den Link in deiner E-Mail.", "gut");
    } else {
      fhAnmeldeStatus("Das Konto wurde angelegt, muss aber noch bestätigt werden – "
        + "ohne hinterlegte E-Mail geht das nicht. Sag Ändii Bescheid.", "fehler");
    }
  } catch (err) {
    console.error("Registrieren fehlgeschlagen:", err);
    const txt = String((err && err.message) || "");
    if (/already registered|already exists/i.test(txt)) {
      fhAnmeldeStatus("Diesen Namen gibt es schon. Wähl einen anderen.", "fehler");
    } else {
      fhAnmeldeStatus("Das hat nicht geklappt: " + txt, "fehler");
    }
  }
}

async function fhAnmeldenMitPasswort() {
  if (!supabaseClient) {
    fhAnmeldeStatus("Die Anmeldung ist gerade nicht erreichbar.", "fehler");
    return;
  }
  const eingabe = (document.getElementById("fh-anmelden-name") || {}).value || "";
  const pw      = (document.getElementById("fh-anmelden-passwort") || {}).value || "";
  const adresse = fhLoginAdresse(eingabe);

  if (!adresse || !pw) {
    fhAnmeldeStatus("Bitte Name und Passwort eingeben.", "fehler");
    return;
  }

  try {
    fhAnmeldeStatus("Wird geprüft ...");
    const { error } = await supabaseClient.auth.signInWithPassword({ email: adresse, password: pw });
    if (error) throw error;
    fhAnmeldeStatus("Angemeldet.", "gut");
    if (typeof fhAnmeldungUebernehmen === "function") fhAnmeldungUebernehmen();
  } catch (err) {
    console.error("Anmelden fehlgeschlagen:", err);
    /* Bewusst EINE Meldung fuer falschen Namen und falsches Passwort:
       zwei getrennte wuerden verraten, welche Namen es gibt. Der
       Hinweis auf die E-Mail ist noetig, weil ein Konto mit
       hinterlegter Adresse eben ueber diese laeuft. */
    fhAnmeldeStatus("Name oder Passwort stimmt nicht. Hast du bei der Registrierung "
      + "eine E-Mail hinterlegt? Dann melde dich mit dieser an.", "fehler");
  }
}

async function fhPasswortVergessen() {
  if (!supabaseClient) return;
  const eingabe = String((document.getElementById("fh-anmelden-name") || {}).value || "").trim();

  if (eingabe.indexOf("@") < 1) {
    /* Ohne Adresse geht es nicht, und das muss dastehen. Ein Konto
       ohne hinterlegte E-Mail hat nur die erfundene - dorthin kann
       niemand etwas schicken. */
    fhAnmeldeStatus("Trag oben deine E-Mail-Adresse ein, dann schicken wir dir einen Link. "
      + "Ohne hinterlegte Adresse hilft nur das Wiederherstellungs-Kennwort weiter unten.", "fehler");
    return;
  }

  try {
    fhAnmeldeStatus("Link wird verschickt ...");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(eingabe, {
      redirectTo: fhAnmeldeZiel(),
    });
    if (error) throw error;
    /* Absichtlich unabhaengig davon, ob es das Konto gibt - sonst
       liesse sich durchprobieren, welche Adressen registriert sind. */
    fhAnmeldeStatus("Wenn es zu dieser Adresse ein Konto gibt, ist der Link unterwegs.", "gut");
  } catch (err) {
    console.error("Zuruecksetzen fehlgeschlagen:", err);
    fhAnmeldeStatus("Der Versand ist für diese Seite noch nicht eingerichtet. "
      + "Sag Ändii Bescheid – bis dahin hilft das Wiederherstellungs-Kennwort weiter unten.", "fehler");
  }
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

  /* Die beiden Formulare des Umschalters. Beide senden per submit,
     damit die Eingabetaste im Passwortfeld genauso funktioniert wie
     ein Klick auf den Knopf. */
  [
    ["fh-passwort-anmeldung", fhAnmeldenMitPasswort],
    ["fh-registrieren-form", fhRegistrieren],
  ].forEach(function (paar) {
    const form = document.getElementById(paar[0]);
    if (!form || form.dataset.fhVerdrahtet) return;
    form.dataset.fhVerdrahtet = "1";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      paar[1]();
    });
  });

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
