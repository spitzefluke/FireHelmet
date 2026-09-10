/* ======================================
   SHOP-KATALOG
   Zwei Kategorien: Avatar-Rahmen (dekorativer Ring um dein
   Profilbild, sichtbar in Rangliste & Co.) und kaufbare
   Avatare. Trage hier beliebig viele weitere ein.

   Jeder Eintrag braucht:
   - id: eindeutig, frei wählbar (wird gespeichert, NICHT mehr
     ändern, nachdem Leute ihn schon gekauft haben!)
   - name: Anzeigename im Shop
   - price: Preis in Dublonen
   - type: "frame" (Avatar-Rahmen) oder "avatar" (kaufbarer Avatar)
   - style: bestimmt das Aussehen des Rahmens. Zu jedem style
     gehört eine Klasse .avatar-frame-STYLE in css/40-shop.css,
     die assets/rahmen/STYLE.svg zeigt. Alle sechzehn Rahmen
     stehen still.
   - familie: das Motiv ("Seefahrt", "Ungeheuer", ...). Rein für
     die Anzeige im Info-Feld - der Shop gruppiert nach "type",
     nicht danach.
====================================== */

/* ------------------------------------------------------
   Jeder Artikel bekommt zusätzlich eine "rarity" (siehe
   FIRE_HELMET_CONFIG.rarities in scripts/core/fire-helmet-config.js
   für Farbe/Beschreibung je Stufe) und einen daran angepassten,
   deutlich höheren Preis. IDs, "type", "style" und "avatarId"
   bleiben unverändert - bestehende Käufe/Freischaltungen (per
   ID gespeichert) sind davon nicht betroffen.
------------------------------------------------------ */
const shopItems = [
  {
    id: "frame-bronze",
    description: "Ein einfacher, aber ehrlicher Rahmen für frische Crew-Mitglieder.",
    name: "Bronze-Rahmen",
    price: 600,
    rarity: "common",
    type: "frame",
    style: "bronze",
    familie: "Schatz und Gold",
    emoji: "🥉",
  },
  {
    id: "frame-silver",
    description: "Poliert genug, um selbst im Mondlicht zu glänzen.",
    name: "Silber-Rahmen",
    price: 1400,
    rarity: "uncommon",
    type: "frame",
    style: "silver",
    familie: "Schatz und Gold",
    emoji: "🥈",
  },
  {
    id: "frame-gold",
    description: "Zeigt jedem sofort: Hier fährt ein Kapitän mit.",
    name: "Gold-Rahmen",
    price: 3200,
    rarity: "rare",
    type: "frame",
    style: "gold",
    familie: "Schatz und Gold",
    emoji: "🥇",
  },
  {
    id: "frame-fire",
    description: "Brennt, ohne jemals zu verlöschen.",
    name: "Feuer-Rahmen",
    price: 6500,
    rarity: "epic",
    type: "frame",
    style: "fire",
    familie: "Feuer und Glut",
    emoji: "🔥",
  },
  {
    id: "frame-kraken",
    description: "Riecht immer ein bisschen nach Tang und altem Seil.",
    name: "Kraken-Rahmen",
    price: 14000,
    rarity: "legendary",
    type: "frame",
    style: "kraken",
    familie: "Ungeheuer",
    emoji: "🐙",
  },
  {
    id: "frame-legend",
    description: "Nur für jene, deren Name schon Legende ist.",
    name: "Legendärer Rahmen",
    price: 28000,
    rarity: "mythic",
    type: "frame",
    style: "legend",
    familie: "Legenden",
    emoji: "👑",
  },

  /* ------------------------------------------------------
     Ab hier die zehn Rahmen aus dem zweiten Durchgang. Alle
     sechzehn sind inzwischen Zeichnungen im selben Stil -
     die sechs oben waren anfangs CSS-Farbverläufe.
  ------------------------------------------------------ */
  {
    id: "frame-tau",
    description: "Handgeschlagen, salzsteif und schon einmal um eine Kehle gelegt.",
    name: "Tauwerk-Rahmen",
    price: 750,
    rarity: "common",
    type: "frame",
    style: "tau",
    familie: "Seefahrt",
  },
  {
    id: "frame-messing",
    description: "Zwölf Nieten, jede einzeln gesetzt. Der Schmied nahm sich Zeit.",
    name: "Messing-Rahmen",
    price: 900,
    rarity: "common",
    type: "frame",
    style: "messing",
    familie: "Handwerk",
  },
  {
    id: "frame-welle",
    description: "Neun Brecher, die nie ankommen.",
    name: "Wellen-Rahmen",
    price: 1800,
    rarity: "uncommon",
    type: "frame",
    style: "welle",
    familie: "Wetter und Meer",
  },
  {
    id: "frame-pergament",
    description: "Der Rand ist gerissen, das Siegel gebrochen. Was drinstand, weiß niemand mehr.",
    name: "Pergament-Rahmen",
    price: 2200,
    rarity: "uncommon",
    type: "frame",
    style: "pergament",
    familie: "Karte und Pergament",
  },
  {
    id: "frame-steuerrad",
    description: "Acht Griffe, davon zwei nachgeschnitzt. Frag nicht, warum.",
    name: "Steuerrad-Rahmen",
    price: 2900,
    rarity: "rare",
    type: "frame",
    style: "steuerrad",
    familie: "Seefahrt",
  },
  {
    id: "frame-dublonen",
    description: "Vierzehn Münzen aus vierzehn verschiedenen Häfen.",
    name: "Dublonen-Rahmen",
    price: 3800,
    rarity: "rare",
    type: "frame",
    style: "dublonen",
    familie: "Schatz und Gold",
  },
  {
    id: "frame-kompass",
    description: "Die Nadel zeigt nach Norden. Meistens.",
    name: "Kompass-Rahmen",
    price: 4600,
    rarity: "rare",
    type: "frame",
    style: "kompass",
    familie: "Himmel und Navigation",
  },
  {
    id: "frame-sturm",
    description: "Fünf Wolken, fünf Blitze und kein trockener Faden.",
    name: "Sturm-Rahmen",
    price: 7200,
    rarity: "epic",
    type: "frame",
    style: "sturm",
    familie: "Wetter und Meer",
  },
  {
    id: "frame-krakenarm",
    description: "Sechs Arme umschließen dich. Zwei fehlen noch.",
    name: "Krakenarm-Rahmen",
    price: 8800,
    rarity: "epic",
    type: "frame",
    style: "kraken-arm",
    familie: "Ungeheuer",
  },
  {
    id: "frame-fluch",
    description: "Vier Schädel, sechzehn Knochen und eine Rechnung, die offen bleibt.",
    name: "Fluch-Rahmen",
    price: 16000,
    rarity: "legendary",
    type: "frame",
    style: "fluch",
    familie: "Fluch und Geister",
  },

  /* ------------------------------------------------------
     KAUFBARE AVATARE
     "avatarId" muss exakt einer "id" aus wheelSpecialAvatars
     in scripts/wheel/avatars-data.js entsprechen - der Kauf
     schaltet diesen Avatar dann genau wie ein Code frei.
  ------------------------------------------------------ */
  {
    id: "avatar-papagei",
    description: "Wiederholt jeden Fluch, den du sagst - gleich dreimal.",
    name: "Papagei-Avatar",
    price: 700,
    rarity: "common",
    type: "avatar",
    avatarId: "shop-papagei",
    emoji: "🦜",
  },
  {
    id: "avatar-kompass",
    description: "Zeigt selten nach Norden, dafür fast immer Richtung Ärger.",
    name: "Kompass-Avatar",
    price: 800,
    rarity: "common",
    type: "avatar",
    avatarId: "shop-kompass",
    emoji: "🧭",
  },
  {
    id: "avatar-anker",
    description: "Schwer wie ein schlechtes Gewissen, verlässlich wie kein anderer.",
    name: "Anker-Avatar",
    price: 1600,
    rarity: "uncommon",
    type: "avatar",
    avatarId: "shop-anker",
    emoji: "⚓",
  },
  {
    id: "avatar-totenkopf",
    description: "Ein Souvenir aus einer Höhle, über die niemand gern spricht.",
    name: "Totenkopf-Avatar",
    price: 3500,
    rarity: "rare",
    type: "avatar",
    avatarId: "shop-totenkopf",
    emoji: "💀",
  },
];
