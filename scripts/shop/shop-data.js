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

const shopItems = [
  {
    id: "frame-bronze",
    name: "Bronze-Rahmen",
    price: 50,
    type: "frame",
    style: "bronze",
    emoji: "🥉",
  },
  {
    id: "frame-silver",
    name: "Silber-Rahmen",
    price: 150,
    type: "frame",
    style: "silver",
    emoji: "🥈",
  },
  {
    id: "frame-gold",
    name: "Gold-Rahmen",
    price: 350,
    type: "frame",
    style: "gold",
    emoji: "🥇",
  },
  {
    id: "frame-fire",
    name: "Feuer-Rahmen",
    price: 500,
    type: "frame",
    style: "fire",
    emoji: "🔥",
  },
  {
    id: "frame-kraken",
    name: "Kraken-Rahmen",
    price: 750,
    type: "frame",
    style: "kraken",
    emoji: "🐙",
  },
  {
    id: "frame-legend",
    name: "Legendärer Rahmen",
    price: 1200,
    type: "frame",
    style: "legend",
    emoji: "👑",
  },
];
