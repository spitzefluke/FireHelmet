/* ======================================================
   SPIND (Migration 60)
   ---------------------------------------------------
   Seite #spind (Freigabe "spind"): Hier stellt jeder ein, wie er auf
   der Seite erscheint - Titel, Avatar, Rahmen, Namensfarbe, Banner und
   ein kurzer Spruch. Links steht die eigene PROFILKARTE so, wie andere
   sie sehen; jede Aenderung erscheint dort sofort.

   - Titel: aus den eigenen Event-Titeln (Live-Event, Piratenpass 2,
     Nordlicht) einen tragen - Rangliste und Spielerkarte zeigen ihn.
   - Avatar: oeffnet die bekannte Avatarwahl (avatar-wahl.js).
   - Rahmen: die im Shop gekauften Rahmen (equipFrame aus shop.js).
   - Namensfarbe und Banner: Teile aus public.spind_teile, einige
     gratis, die anderen fuer Dublonen (spind_teil_kaufen, zweiter Klick
     bestaetigt).

   PROFILKARTE FUER ALLE: window.fhProfil.zeigen(uid) oeffnet die Karte
   eines Spielers als <dialog> (spind_profil) - die Rangliste ruft das
   beim Klick auf einen Namen auf. fhProfil.namensKlasse(uid) liefert
   die Klasse der Namensfarbe (aus spind_je_spieler).

   Farben und Banner sind reines CSS (.fh-name-<id>, .fh-banner-<id> in
   css/50-redesign.css); hier kommt nur die ID aus der festen Liste.
   Spruch und Namen landen nur per textContent im DOM.
====================================================== */

(function () {
  "use strict";

  const FARBEN = ["weiss", "gold", "feuer", "eis", "smaragd", "nordlicht", "regenbogen"];
  const BANNER = ["meer", "sturm", "schatzkarte", "vulkan", "sternennebel", "kraken", "zeitriss"];

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }
  function zahl(n) { return Number(n || 0).toLocaleString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"); }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  let stand = null;          // Antwort von spind_stand
  let teile = [];            // Zeilen aus spind_teile
  let namen = new Map();     // uid -> { namensfarbe, banner } (Rangliste)
  let beschaeftigt = false;
  let bestaetigen = null, bestaetigenUhr = null;

  async function q(fn) {
    const { data, error } = await withSupabaseRlsColdStartRetry(fn);
    if (error) throw error;
    return data;
  }

  /* ------------------------------------------------------
     LADEN
  ------------------------------------------------------ */
  async function laden() {
    if (!dbDa() || typeof wheelAuthReady === "undefined") return;
    try {
      await wheelAuthReady;
      const ergebnisse = await Promise.all([
        q(function () { return supabaseClient.rpc("spind_stand"); }),
        teile.length ? Promise.resolve(teile)
          : q(function () { return supabaseClient.from("spind_teile").select("*").order("art").order("ordnung"); }),
      ]);
      stand = ergebnisse[0];
      teile = ergebnisse[1] || [];
    } catch (err) {
      console.warn("Spind: Laden fehlgeschlagen:", err);
      stand = null;
    }
  }

  /* Namensfarben fuer die Rangliste - einmal je Seitenaufbau. */
  async function namenLaden() {
    if (!dbDa()) return namen;
    try {
      const daten = await q(function () { return supabaseClient.rpc("spind_je_spieler"); }) || [];
      const neu = new Map();
      daten.forEach(function (z) {
        neu.set(z.firebase_uid, {
          namensfarbe: FARBEN.indexOf(z.namensfarbe) >= 0 ? z.namensfarbe : null,
          banner: BANNER.indexOf(z.banner) >= 0 ? z.banner : null,
        });
      });
      namen = neu;
    } catch (err) { /* ohne Migration 60: keine Farben */ }
    return namen;
  }

  function namensKlasse(uid) {
    const n = uid && namen.get(uid);
    return n && n.namensfarbe && n.namensfarbe !== "weiss" ? "fh-name fh-name-" + n.namensfarbe : "";
  }

  /* ------------------------------------------------------
     PROFILKARTE (fuer die Spind-Vorschau und den Dialog)
     p: { nickname, avatar, equipped_frame, titel, namensfarbe,
          banner, spruch, codes_cracked, titel_anzahl, schlacht }
  ------------------------------------------------------ */
  function avatarElement(avatar, frameId) {
    const box = el("span", "fh-profil-avatar");
    const wert = avatar || (typeof wheelAvatarOptions !== "undefined" ? wheelAvatarOptions[0] : "");
    let innen;
    if (wert && typeof isAvatarImagePath === "function" && isAvatarImagePath(wert)) {
      innen = el("img");
      innen.src = wert;
      innen.alt = "";
      innen.decoding = "async";
    } else {
      innen = el("span", "fh-profil-avatar-emoji", wert || "");
    }
    const stil = typeof frameStyleFromId === "function" ? frameStyleFromId(frameId) : "";
    if (stil) {
      const rahmen = el("span", "avatar-frame-wrap avatar-frame-" + stil);
      rahmen.appendChild(innen);
      box.appendChild(rahmen);
    } else {
      box.appendChild(innen);
    }
    return box;
  }

  function karte(p) {
    const k = el("article", "fh-profil");
    const banner = BANNER.indexOf(p.banner) >= 0 ? p.banner : "meer";
    k.appendChild(el("div", "fh-profil-banner fh-banner-" + banner));
    const kopf = el("div", "fh-profil-kopf");
    kopf.appendChild(avatarElement(p.avatar, p.equipped_frame));
    const farbe = FARBEN.indexOf(p.namensfarbe) >= 0 ? p.namensfarbe : "weiss";
    const name = el("h3", "fh-profil-name fh-name fh-name-" + farbe, p.nickname || "?");
    kopf.appendChild(name);
    if (p.titel && window.fhEventTitel) {
      const ti = el("p", "fh-profil-titel");
      ti.innerHTML = window.fhEventTitel.html(p.titel, "");   // Stil geprueft, Text escaped (event-titel.js)
      kopf.appendChild(ti);
    }
    if (p.spruch) kopf.appendChild(el("p", "fh-profil-spruch", "„" + p.spruch + "“"));
    k.appendChild(kopf);
    const werte = el("dl", "fh-profil-werte");
    function wert(name2, w) {
      const d = el("div", "fh-profil-wert");
      d.append(el("dt", null, name2), el("dd", null, w));
      werte.appendChild(d);
    }
    wert(t("spind.wert.codes", "Codes geknackt"), zahl(p.codes_cracked));
    wert(t("spind.wert.titel", "Titel gesammelt"), zahl(p.titel_anzahl));
    if (p.schlacht) {
      const r = Number(p.schlacht.rang) || 0;
      wert(t("spind.wert.rang", "Schiffs-Rang"), typeof SCHIFF_RAENGE !== "undefined" ? t("hangar.rang." + r, SCHIFF_RAENGE[r].name) : String(r));
      wert(t("spind.wert.schlachten", "Schlachten"), zahl(p.schlacht.schlachten) + " · " + zahl(p.schlacht.siege) + " " + t("spind.wert.siege", "Siege"));
    }
    k.appendChild(werte);
    return k;
  }

  /* Die eigene Karte aus dem Spind-Stand (ohne Umweg ueber den Server). */
  function eigeneKarte() {
    const titel = stand && stand.titel_id ? (stand.titel || []).find(function (x) { return x.titel_id === stand.titel_id; })
      : (stand && stand.titel && stand.titel[0]) || null;
    let codes = 0;
    try { codes = Number(localStorage.getItem("codesCracked") || 0); } catch (e) { /* egal */ }
    return {
      nickname: (function () { try { return localStorage.getItem("wheelNickname"); } catch (e) { return ""; } })(),
      avatar: (function () { try { return localStorage.getItem("wheelAvatar"); } catch (e) { return ""; } })(),
      equipped_frame: typeof getEquippedFrame === "function" ? getEquippedFrame() : null,
      titel: titel ? { text: titel.text, stil: titel.stil } : null,
      namensfarbe: stand ? stand.namensfarbe : "weiss",
      banner: stand ? stand.banner : "meer",
      spruch: stand ? stand.spruch : "",
      codes_cracked: codes,
      titel_anzahl: stand && stand.titel ? stand.titel.length : 0,
      schlacht: null,
    };
  }

  /* Profil eines beliebigen Spielers als Dialog. */
  async function zeigen(uid) {
    if (!uid || !dbDa()) return;
    let d = document.getElementById("fh-profil-dialog");
    if (!d) {
      d = el("dialog", "fh-profil-dialog");
      d.id = "fh-profil-dialog";
      d.setAttribute("aria-label", t("spind.profil", "Profilkarte"));
      d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
      document.body.appendChild(d);
    }
    d.replaceChildren(el("p", "fh-profil-laedt", t("spind.laedt", "Lädt …")));
    if (!d.open) d.showModal();
    try {
      const p = await q(function () { return supabaseClient.rpc("spind_profil", { p_uid: uid }); });
      d.replaceChildren();
      if (!p || !p.ok) { d.appendChild(el("p", "fh-profil-laedt", t("spind.unbekannt", "Profil nicht gefunden."))); return; }
      const zu = el("button", "fh-profil-zu");
      zu.type = "button";
      zu.setAttribute("aria-label", t("spind.schliessen", "Schließen"));
      zu.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      zu.addEventListener("click", function () { d.close(); });
      d.append(zu, karte(p));
      zu.focus();
    } catch (err) {
      console.warn("Profil: Laden fehlgeschlagen:", err);
      d.replaceChildren(el("p", "fh-profil-laedt", t("spind.fehler.allgemein", "Das hat nicht geklappt.")));
    }
  }

  /* ------------------------------------------------------
     SPIND-SEITE
  ------------------------------------------------------ */
  const GRUENDE = {
    "nicht-frei": ["spind.fehler.nichtFrei", "Der Spind ist noch nicht freigegeben."],
    "gesperrt": ["spind.fehler.gesperrt", "Dein Konto ist gesperrt."],
    "zu-wenig": ["spind.fehler.wenig", "Dafür reichen deine Dublonen nicht."],
    "schon": ["spind.fehler.schon", "Das hast du schon."],
    "nicht-gekauft": ["spind.fehler.nichtGekauft", "Kauf das zuerst."],
    "nicht-dein-titel": ["spind.fehler.titel", "Diesen Titel hast du nicht."],
    "zu-lang": ["spind.fehler.lang", "Höchstens 60 Zeichen."],
  };
  function status(text, fehler) {
    const s = document.getElementById("spind-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!fehler);
  }
  function fehlerText(grund) {
    const g = GRUENDE[grund];
    return g ? t(g[0], g[1]) : t("spind.fehler.allgemein", "Das hat nicht geklappt.");
  }

  function seiteOffen() {
    const s = document.getElementById("spind");
    return !!(s && s.classList.contains("active-page"));
  }

  function abschnitt(titel, text) {
    const a = el("section", "sp-abschnitt");
    a.appendChild(el("h2", "sp-abschnitt-titel", titel));
    if (text) a.appendChild(el("p", "sp-abschnitt-text", text));
    return a;
  }

  function wahlKnopf(klasse, aktiv, inhalt, beschriftung) {
    const b = el("button", "sp-wahl " + klasse + (aktiv ? " ist-aktiv" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", aktiv ? "true" : "false");
    if (beschriftung) b.setAttribute("aria-label", beschriftung);
    if (inhalt) b.append(inhalt);
    return b;
  }

  function zeichnen() {
    const ziel = document.getElementById("spind-inhalt");
    if (!ziel) return;
    ziel.replaceChildren();
    if (!angemeldet()) {
      ziel.appendChild(el("p", "sp-hinweis", t("spind.anmelden", "Melde dich an, dann kannst du deinen Spind einrichten.")));
      return;
    }
    if (!stand) {
      ziel.appendChild(el("p", "sp-hinweis", t("spind.nichtDa", "Der Spind ist gerade nicht erreichbar.")));
      return;
    }

    const links = el("div", "sp-vorschau");
    links.append(el("p", "sp-vorschau-kicker", t("spind.vorschau", "So sehen dich die anderen")), karte(eigeneKarte()));
    const rechts = el("div", "sp-einstellungen");

    /* Titel */
    const ti = abschnitt(t("spind.titel", "Titel"), t("spind.titelText", "Titel bekommst du im Live-Event, im Piratenpass und vom Nordlicht."));
    const tiListe = el("div", "sp-liste");
    const getragen = stand.titel_id || null;
    const ohne = wahlKnopf("sp-titel", !getragen, el("span", "sp-titel-ohne", t("spind.titelNeuester", "Immer den neuesten")));
    ohne.addEventListener("click", function () { tragen("titel", null); });
    tiListe.appendChild(ohne);
    (stand.titel || []).forEach(function (x) {
      const inhalt = el("span");
      inhalt.innerHTML = window.fhEventTitel ? window.fhEventTitel.html({ text: x.text, stil: x.stil }, "") : "";   // geprueft und escaped
      const b = wahlKnopf("sp-titel", getragen === x.titel_id, inhalt);
      b.addEventListener("click", function () { tragen("titel", x.titel_id); });
      tiListe.appendChild(b);
    });
    if (!(stand.titel || []).length) tiListe.appendChild(el("p", "sp-leer", t("spind.keineTitel", "Noch keine Titel gesammelt.")));
    ti.appendChild(tiListe);

    /* Avatar und Rahmen */
    const av = abschnitt(t("spind.avatar", "Avatar & Rahmen"));
    const avReihe = el("div", "sp-liste");
    const avKnopf = el("button", "sp-knopf", t("spind.avatarWechseln", "Avatar wechseln"));
    avKnopf.type = "button";
    avKnopf.addEventListener("click", function () { if (typeof fhAvatarWahlOeffnen === "function") fhAvatarWahlOeffnen(); });
    avReihe.appendChild(avKnopf);
    av.appendChild(avReihe);
    const rahmen = (typeof shopItems !== "undefined" ? shopItems : []).filter(function (i) {
      return i.type === "frame" && (typeof getOwnedShopItems === "function" ? getOwnedShopItems() : []).indexOf(i.id) >= 0;
    });
    const raListe = el("div", "sp-liste sp-rahmen-liste");
    const aktRahmen = typeof getEquippedFrame === "function" ? getEquippedFrame() : "";
    const keinR = wahlKnopf("sp-rahmen", !aktRahmen, el("span", null, t("spind.ohneRahmen", "Ohne")));
    keinR.addEventListener("click", function () { if (aktRahmen && typeof equipFrame === "function") { equipFrame(aktRahmen); zeichnen(); } });
    raListe.appendChild(keinR);
    rahmen.forEach(function (r) {
      const b = wahlKnopf("sp-rahmen", aktRahmen === r.id, avatarElement(eigeneKarte().avatar, r.id), r.name || r.id);
      b.title = r.name || r.id;
      b.addEventListener("click", function () { if (aktRahmen !== r.id && typeof equipFrame === "function") { equipFrame(r.id); zeichnen(); } });
      raListe.appendChild(b);
    });
    av.appendChild(raListe);
    if (!rahmen.length) av.appendChild(el("p", "sp-leer", t("spind.keineRahmen", "Rahmen gibt es im Shop.")));

    /* Namensfarbe und Banner */
    function teilAbschnitt(art, titel2) {
      const a = abschnitt(titel2);
      const liste = el("div", "sp-liste sp-teile");
      teile.filter(function (x) { return x.art === art; }).forEach(function (x) {
        const hat = x.preis === 0 || (stand.besitz || []).indexOf(x.teil_id) >= 0;
        const aktiv = (art === "namensfarbe" ? stand.namensfarbe : stand.banner) === x.teil_id;
        const inhalt = el("span", "sp-teil-inhalt");
        if (art === "namensfarbe") inhalt.appendChild(el("span", "fh-name fh-name-" + x.teil_id, t("spind.farbe." + x.teil_id, x.teil_id)));
        else inhalt.append(el("span", "sp-banner-probe fh-banner-" + x.teil_id), el("span", "sp-teil-name", t("spind.banner." + x.teil_id, x.teil_id)));
        if (!hat) {
          const frage = bestaetigen && bestaetigen.teil === x.teil_id && bestaetigen.bis > Date.now();
          inhalt.appendChild(el("span", "sp-preis" + (frage ? " ist-frage" : ""), (frage ? t("spind.wirklich", "Wirklich kaufen?") + " " : "") + zahl(x.preis)));
        }
        const b = wahlKnopf("sp-teil" + (hat ? "" : " ist-zu-kaufen"), aktiv, inhalt);
        b.addEventListener("click", function () { if (hat) { if (!aktiv) tragen(art, x.teil_id); } else kaufen(x); });
        liste.appendChild(b);
      });
      a.appendChild(liste);
      return a;
    }

    /* Spruch */
    const sp = abschnitt(t("spind.spruch", "Spruch"), t("spind.spruchText", "Bis 60 Zeichen – steht auf deiner Profilkarte."));
    const form = el("form", "sp-spruch");
    const feld = el("input", "sp-spruch-feld");
    feld.type = "text";
    feld.maxLength = 60;
    feld.value = stand.spruch || "";
    feld.setAttribute("aria-label", t("spind.spruch", "Spruch"));
    feld.placeholder = t("spind.spruchPlatzhalter", "Volle Kraft voraus!");
    const speichern = el("button", "sp-knopf", t("spind.speichern", "Speichern"));
    speichern.type = "submit";
    form.append(feld, speichern);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); tragen("spruch", feld.value); });
    sp.appendChild(form);

    const st = el("p", "sp-status");
    st.id = "spind-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");

    rechts.append(ti, av, teilAbschnitt("namensfarbe", t("spind.namensfarbe", "Namensfarbe")), teilAbschnitt("banner", t("spind.bannerTitel", "Banner")), sp, st);
    ziel.append(links, rechts);
  }

  async function rpc(name, args) {
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args); });
    if (error) throw error;
    return data;
  }

  async function tragen(art, wert) {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const erg = await rpc("spind_tragen", { p_art: art, p_wert: wert });
      if (erg && erg.ok) {
        stand = erg;
        zeichnen();
        status(t("spind.gespeichert", "✓ Gespeichert."), false);
        if (art === "titel" && window.fhEventTitel) window.fhEventTitel.laden();
        if (art === "namensfarbe") namenLaden();
        return;
      }
      status(fehlerText(erg && erg.grund), true);
    } catch (err) {
      console.warn("Spind: Speichern fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  async function kaufen(x) {
    if (beschaeftigt || !dbDa()) return;
    if (!bestaetigen || bestaetigen.teil !== x.teil_id || bestaetigen.bis < Date.now()) {
      bestaetigen = { teil: x.teil_id, bis: Date.now() + 5000 };
      clearTimeout(bestaetigenUhr);
      bestaetigenUhr = setTimeout(function () { bestaetigen = null; if (seiteOffen()) zeichnen(); }, 5100);
      zeichnen();
      return;
    }
    bestaetigen = null;
    clearTimeout(bestaetigenUhr);
    beschaeftigt = true;
    try {
      const erg = await rpc("spind_teil_kaufen", { p_teil: x.teil_id });
      if (erg && erg.ok) {
        beschaeftigt = false;
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
        await tragen(x.art, x.teil_id);
        status(t("spind.gekauft", "✓ Gekauft und angelegt."), false);
        return;
      }
      zeichnen();
      status(fehlerText(erg && erg.grund), true);
    } catch (err) {
      console.warn("Spind: Kauf fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  window.updateSpindPage = function (pageID) {
    if (pageID !== "spind") return;
    zeichnen();
    laden().then(function () { if (seiteOffen()) zeichnen(); });
  };

  /* Nach der Avatarwahl (avatar-wahl.js) die Vorschau neu zeichnen. */
  window.addEventListener("fhAvatarGewaehlt", function () { if (seiteOffen()) zeichnen(); });
  window.addEventListener("fhFlagsUpdated", function () { if (seiteOffen()) window.updateSpindPage("spind"); });

  window.fhProfil = { zeigen: zeigen, namensKlasse: namensKlasse, namenLaden: namenLaden, karte: karte };
})();
