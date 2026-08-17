/* ======================================
   SHOP-KATALOG
   Aktuell nur eine Kategorie: Avatar-Rahmen (dekorativer Ring
   um dein Profilbild, sichtbar in Rangliste & Co.). Trage hier
   beliebig viele weitere Rahmen ein.

   Jeder Eintrag braucht:
   - id: eindeutig, frei wählbar (wird gespeichert, NICHT mehr
     ändern, nachdem Leute ihn schon gekauft haben!)
   - name: Anzeigename im Shop
   - price: Preis in Dublonen
   - type: "frame" (aktuell die einzige Kategorie)
   - style: bestimmt das Aussehen des Rahmens (siehe die
     vordefinierten CSS-Klassen unten, "frame-gold" usw.) -
     du kannst auch eigene style-Namen erfinden und die
     passende CSS-Klasse .avatar-frame-DEINSTYLE selbst in
     style.css ergänzen
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
    name: "Bronze-Rahmen",
    price: 600,
    rarity: "common",
    type: "frame",
    style: "bronze",
    emoji: "🥉",
  },
  {
    id: "frame-silver",
    name: "Silber-Rahmen",
    price: 1400,
    rarity: "uncommon",
    type: "frame",
    style: "silver",
    emoji: "🥈",
  },
  {
    id: "frame-gold",
    name: "Gold-Rahmen",
    price: 3200,
    rarity: "rare",
    type: "frame",
    style: "gold",
    emoji: "🥇",
  },
  {
    id: "frame-fire",
    name: "Feuer-Rahmen",
    price: 6500,
    rarity: "epic",
    type: "frame",
    style: "fire",
    emoji: "🔥",
  },
  {
    id: "frame-kraken",
    name: "Kraken-Rahmen",
    price: 14000,
    rarity: "legendary",
    type: "frame",
    style: "kraken",
    emoji: "🐙",
  },
  {
    id: "frame-legend",
    name: "Legendärer Rahmen",
    price: 28000,
    rarity: "mythic",
    type: "frame",
    style: "legend",
    emoji: "👑",
  },

  /* ------------------------------------------------------
     KAUFBARE AVATARE
     "avatarId" muss exakt einer "id" aus wheelSpecialAvatars
     in scripts/wheel/avatars-data.js entsprechen - der Kauf
     schaltet diesen Avatar dann genau wie ein Code frei.
  ------------------------------------------------------ */
  {
    id: "avatar-papagei",
    name: "Papagei-Avatar",
    price: 700,
    rarity: "common",
    type: "avatar",
    avatarId: "shop-papagei",
    emoji: "🦜",
  },
  {
    id: "avatar-kompass",
    name: "Kompass-Avatar",
    price: 800,
    rarity: "common",
    type: "avatar",
    avatarId: "shop-kompass",
    emoji: "🧭",
  },
  {
    id: "avatar-anker",
    name: "Anker-Avatar",
    price: 1600,
    rarity: "uncommon",
    type: "avatar",
    avatarId: "shop-anker",
    emoji: "⚓",
  },
  {
    id: "avatar-totenkopf",
    name: "Totenkopf-Avatar",
    price: 3500,
    rarity: "rare",
    type: "avatar",
    avatarId: "shop-totenkopf",
    emoji: "💀",
  },
];
