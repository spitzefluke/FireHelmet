/* ======================================================
   MYSTERY GIFT (Migration 44)
   ---------------------------------------------------
   Ein Geschenk, das Ändii selbst aussucht und übergibt. Kostet
   100.000 Dublonen und steht nur selten im Shop: in etwa jeder
   zwanzigsten Stunde. Welche Stunde das ist, rechnet der Browser
   genau wie die Datenbank (app.mystery_gift_im_angebot):
       Stunde = floor(Zeit / 1 h)
       im Angebot, wenn (Stunde * 2654435761) mod 2^32 < 5 % von 2^32
   Math.imul liefert genau die unteren 32 Bit des Produkts.

   Der Kauf läuft nur über die Datenbank (mystery_gift_kaufen): sie
   prüft das Angebot, zieht die Dublonen ab und hält den Kauf fest,
   den Ändii im Admin-Bereich sieht. Der Skill-Rabatt "Feilscher"
   gilt hier bewusst nicht - der Preis steht fest in der Datenbank.

   shop.js ruft fhMysteryGift.zeigen() nach jedem Aufbau des Rasters.
====================================================== */

(function () {
  "use strict";

  const PREIS = 100000;
  const STUNDE_MS = 3600000;
  const SCHWELLE = 214748365;   // 5 % von 2^32

  function L(key, fallback) { return typeof t === "function" ? t("shop.mystery." + key, fallback) : fallback; }

  function stundeVon(ms) { return Math.floor(ms / STUNDE_MS); }
  function imAngebot(ms) {
    return (Math.imul(stundeVon(ms), 2654435761 | 0) >>> 0) < SCHWELLE;
  }

  /* In dieser Angebotsstunde schon gekauft? Nur fuer die Anzeige -
     die Datenbank laesst ohnehin nur einen Kauf je Angebot zu. */
  function gekauftInStunde(stunde) {
    try { return localStorage.getItem("fhMysteryGekauft") === String(stunde); } catch (e) { return false; }
  }
  function gekauftMerken(stunde) {
    try { localStorage.setItem("fhMysteryGekauft", String(stunde)); } catch (e) { /* nur fuer jetzt */ }
  }

  /* Geschenk-Symbol (lucide "gift", ISC), wie alle neuen Symbole als SVG. */
  const SYMBOL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>' +
    '<path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>';

  let uhr = null;
  let bestaetigenBis = 0;
  let kauftGerade = false;

  function restText(ms) {
    const rest = Math.max(0, (stundeVon(ms) + 1) * STUNDE_MS - ms);
    const m = Math.floor(rest / 60000), s = Math.floor((rest % 60000) / 1000);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function shopOffen() {
    const seite = document.getElementById("shop");
    return !!(seite && seite.classList.contains("active-page"));
  }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  function status(text, istFehler) {
    const s = document.getElementById("shop-mystery-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }

  function statusZeile() {
    const s = el("p", "fh-mystery-status");
    s.id = "shop-mystery-status";
    s.setAttribute("role", "status");
    s.setAttribute("aria-live", "polite");
    return s;
  }

  function zeigen() {
    const box = document.getElementById("shop-mystery");
    if (!box) return;
    const jetzt = Date.now();
    const angebot = imAngebot(jetzt);
    const stunde = stundeVon(jetzt);
    const gekauft = gekauftInStunde(stunde);

    box.hidden = false;
    box.classList.toggle("ist-angebot", angebot);
    box.replaceChildren();

    const symbol = el("span", "fh-mystery-symbol");
    symbol.innerHTML = SYMBOL;   // fester Text aus dieser Datei, keine Nutzerdaten
    const text = el("div", "fh-mystery-text");
    const kopf = el("p", "fh-mystery-kopf");
    kopf.append(el("span", "fh-mystery-name", "Mystery Gift"),
      el("span", "fh-mystery-seltenheit", L("rarity", "Extrem selten")));
    text.appendChild(kopf);

    if (!angebot) {
      text.appendChild(el("p", "fh-mystery-satz",
        L("away", "Gerade nicht im Angebot. Das Mystery Gift taucht nur ganz selten auf dem Schwarzmarkt auf – schau öfter vorbei.")));
      text.appendChild(statusZeile());
      box.append(symbol, text);
      uhrStoppen();
      return;
    }

    text.appendChild(el("p", "fh-mystery-satz",
      L("lead", "Ein Geschenk von Ändii persönlich. Was drin ist, erfährst du erst, wenn er sich bei dir meldet.")));
    const zeit = el("p", "fh-mystery-zeit");
    zeit.append(L("left", "Nur noch") + " ", el("span", "fh-mystery-rest", restText(jetzt)));
    text.appendChild(zeit);

    const knopf = el("button", "shop-item-btn fh-mystery-knopf");
    knopf.type = "button";
    if (gekauft) {
      knopf.disabled = true;
      knopf.textContent = L("bought", "✓ Gekauft – Ändii meldet sich");
    } else {
      knopf.textContent = (bestaetigenBis > jetzt ? L("confirm", "Wirklich kaufen?") + " " : L("buy", "Kaufen") + " · ")
        + PREIS.toLocaleString("de-DE") + " 💰";
      knopf.addEventListener("click", kaufen);
    }
    const aktion = el("div", "fh-mystery-aktion");
    aktion.append(knopf, statusZeile());

    box.append(symbol, text, aktion);
    uhrStarten();
  }

  /* Sekundentakt fuer die Restzeit, nur solange der Shop offen ist.
     Wechselt die Stunde, baut sich die Karte neu auf. */
  function uhrStarten() {
    if (uhr) return;
    let stunde = stundeVon(Date.now());
    uhr = setInterval(function () {
      if (!shopOffen()) { uhrStoppen(); return; }
      const jetzt = Date.now();
      if (stundeVon(jetzt) !== stunde) { stunde = stundeVon(jetzt); zeigen(); return; }
      const rest = document.querySelector("#shop-mystery .fh-mystery-rest");
      if (rest) rest.textContent = restText(jetzt);
      if (bestaetigenBis && jetzt > bestaetigenBis) { bestaetigenBis = 0; zeigen(); }
    }, 1000);
  }
  function uhrStoppen() { if (uhr) { clearInterval(uhr); uhr = null; } }

  const GRUENDE = {
    "zu-wenig": ["poor", "Dafür reichen deine Dublonen nicht – du brauchst 100.000."],
    "schon": ["already", "Das hast du in diesem Angebot schon gekauft."],
    "nicht-im-angebot": ["gone", "Zu spät – das Mystery Gift ist gerade wieder verschwunden."],
    "gesperrt": ["locked", "Dein Konto ist gesperrt – Käufe sind gerade nicht möglich."],
  };

  async function kaufen() {
    if (kauftGerade) return;
    const jetzt = Date.now();
    /* 100.000 sind viel: erst nach einem zweiten Klick kaufen. */
    if (bestaetigenBis < jetzt) {
      bestaetigenBis = jetzt + 5000;
      zeigen();
      return;
    }
    bestaetigenBis = 0;

    const name = localStorage.getItem("wheelNickname") || "";
    if (!name || typeof supabaseClient === "undefined" || !supabaseClient) {
      zeigen();
      status(L("login", "Melde dich zuerst an – sonst weiß Ändii nicht, wem das Geschenk gehört."), true);
      return;
    }

    kauftGerade = true;
    status(L("busy", "⏳ Kauf wird verarbeitet …"), false);
    try {
      const uid = await wheelAuthReady;
      if (!uid) throw new Error("keine-anmeldung");
      if (typeof ensureSupabasePlayerRow === "function") await ensureSupabasePlayerRow(uid, name);
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("mystery_gift_kaufen");
      });
      if (error) throw error;
      const stunde = stundeVon(Date.now());
      if (data && data.ok) {
        gekauftMerken(stunde);
        zeigen();
        status(L("done", "🎁 Gekauft! Ändii sieht deinen Kauf und meldet sich bei dir."), false);
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
        if (typeof fhNotice === "function") fhNotice(L("done", "🎁 Gekauft! Ändii sieht deinen Kauf und meldet sich bei dir."), "success");
        return;
      }
      const grund = data && data.grund;
      if (grund === "schon") gekauftMerken(stunde);
      zeigen();
      const g = GRUENDE[grund];
      status(g ? L(g[0], g[1]) : L("failed", "⚠️ Kauf ist fehlgeschlagen, versuch's nochmal."), true);
    } catch (err) {
      console.warn("Mystery Gift: Kauf fehlgeschlagen:", err);
      zeigen();
      status(L("failed", "⚠️ Kauf ist fehlgeschlagen, versuch's nochmal."), true);
    } finally {
      kauftGerade = false;
    }
  }

  window.fhMysteryGift = { zeigen: zeigen, imAngebot: imAngebot, PREIS: PREIS };
})();
