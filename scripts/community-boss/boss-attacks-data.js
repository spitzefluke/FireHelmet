/* ======================================================
   BOSS-ANGRIFFE: ANZEIGE
   ---------------------------------------------------
   Hier stehen NUR Name, Symbol und Beschreibung. Die Zahlen - wie
   viel Schaden ein Angriff macht, wie lange er gesperrt ist - stehen
   ausschliesslich auf dem Server (boss_attack_defs in
   supabase/game-migration/10-boss-attacks.sql) und werden von dort
   gelesen.

   WARUM DIE TRENNUNG
   Stuenden die Zahlen auch hier, gaebe es zwei Wahrheiten, die
   irgendwann auseinanderlaufen - und die Anzeige wuerde dann etwas
   versprechen, was der Server nicht einloest. Schlimmer noch: sie
   sind der Schutz vor Schummeln. Was im Browser steht, kann jeder
   aendern; deshalb entscheidet der Server allein, und der Browser
   fragt nur nach.

   Die Spannen in den Beschreibungen sind bewusst in Worten gehalten
   ("verlaesslich", "Gluecksspiel") statt in Zahlen - so bleiben sie
   richtig, auch wenn du am Katalog drehst.
====================================================== */

/* Die drei taeglichen Angriffe. Gleicher Erwartungswert, andere
   Handschrift - die Wahl ist Geschmack, nicht Rechnen. */
const BOSS_GRUNDANGRIFFE = [
  {
    schluessel: "saebel",
    symbol: "⚔️",
    name: { de: "Säbelhieb", en: "Sabre strike" },
    text: {
      de: "Verlässlich. Immer ungefähr gleich viel Schaden, keine Überraschungen.",
      en: "Dependable. Roughly the same damage every time, no surprises.",
    },
  },
  {
    schluessel: "kanone",
    symbol: "💣",
    name: { de: "Kanonenschuss", en: "Cannon shot" },
    text: {
      de: "Glücksspiel. Kann kläglich danebengehen oder alles andere übertreffen.",
      en: "A gamble. Can fizzle out or beat everything else.",
    },
  },
  {
    schluessel: "enterhaken",
    symbol: "🪝",
    name: { de: "Enterhaken", en: "Grappling hook" },
    text: {
      de: "Etwas weniger Schaden - aber jeder dritte Wurf schenkt dir noch einen Angriff am selben Tag.",
      en: "A little less damage - but every third throw grants another attack the same day.",
    },
  },
];

/* Die elf Spezialangriffe. Jeder wird durch einen eigenen Geheimcode
   dauerhaft freigeschaltet und ist danach einmal die Woche
   einsetzbar (das Fass einmal im Monat).

   "fx" ist der Name der Zeichenroutine in boss-spezial-fx.js. */
const BOSS_SPEZIALANGRIFFE = [
  {
    schluessel: "salve", symbol: "🔥", fx: "salve",
    name: { de: "Kanonensalve", en: "Broadside" },
    text: {
      de: "Drei Einschläge kurz nacheinander. Der verlässliche große Schlag.",
      en: "Three impacts in quick succession. The dependable big hit.",
    },
  },
  {
    schluessel: "brandpfeil", symbol: "🏹", fx: "brandpfeil",
    name: { de: "Brandpfeil", en: "Fire arrow" },
    text: {
      de: "Setzt den Boss in Brand - der Schaden läuft drei Tage weiter, auch wenn du nicht vorbeischaust.",
      en: "Sets the boss alight - damage keeps ticking for three days, even while you are away.",
    },
  },
  {
    schluessel: "enterkommando", symbol: "🏴‍☠️", fx: "enterkommando",
    name: { de: "Enterkommando", en: "Boarding party" },
    text: {
      de: "Wird stärker, je mehr heute schon angegriffen haben. An einem lebhaften Tag der härteste Schlag überhaupt.",
      en: "Grows with the number of people who attacked today. On a busy day, the hardest hit there is.",
    },
  },
  {
    schluessel: "pulverfass", symbol: "🛢️", fx: "pulverfass",
    name: { de: "Pulverfass", en: "Powder keg" },
    text: {
      de: "Sehr hoher Schaden. Danach kannst du einen Tag lang gar nicht angreifen.",
      en: "Very high damage. Afterwards you cannot attack at all for a day.",
    },
  },
  {
    schluessel: "schlachtruf", symbol: "📣", fx: "schlachtruf",
    name: { de: "Schlachtruf", en: "War cry" },
    text: {
      de: "Macht selbst keinen Schaden - aber 24 Stunden lang treffen ALLE härter.",
      en: "Does no damage itself - but for 24 hours EVERYONE hits harder.",
    },
  },
  {
    schluessel: "fass", symbol: "☢️", fx: "fass",
    name: { de: "Das Fass, das niemand öffnen sollte", en: "The barrel nobody should open" },
    text: {
      de: "Weißer Blitz, Druckwelle, Pilzwolke. Danach eine volle Woche gesperrt. Einmal im Monat.",
      en: "White flash, shockwave, mushroom cloud. Locked out for a whole week after. Once a month.",
    },
  },
  {
    schluessel: "slot", symbol: "🎰", fx: "slot",
    name: { de: "Ändiis Slotmaschine", en: "Ändii's slot machine" },
    text: {
      de: "Drei Walzen. Drei Schädel sind der Jackpot, eine Niete ist gar nichts.",
      en: "Three reels. Three skulls is the jackpot, a blank is nothing at all.",
    },
  },
  {
    schluessel: "moewen", symbol: "🐦", fx: "moewen",
    name: { de: "Möwenschwarm", en: "Gull swarm" },
    text: {
      de: "Zweihundert Möwen. Jede für sich lächerlich, zusammen ordentlich.",
      en: "Two hundred gulls. Each one ridiculous, together respectable.",
    },
  },
  {
    schluessel: "katapult", symbol: "🐙", fx: "katapult",
    name: { de: "Kraken-Katapult", en: "Kraken catapult" },
    text: {
      de: "Du schleuderst einen deutlich kleineren, sehr empörten Kraken. Er klatscht auf und beleidigt beide.",
      en: "You fling a much smaller, deeply offended kraken. It lands, and insults both parties.",
    },
  },
  {
    schluessel: "seemannslied", symbol: "🎶", fx: "seemannslied",
    name: { de: "Seemannslied", en: "Sea shanty" },
    text: {
      de: "Die Crew singt, der Boss schläft ein. Der nächste Angriff von jedem trifft doppelt.",
      en: "The crew sings, the boss dozes off. Everyone's next attack hits twice as hard.",
    },
  },
  {
    schluessel: "rechnung", symbol: "🧾", fx: "rechnung",
    name: { de: "Ändiis Rechnung", en: "Ändii's bill" },
    text: {
      de: "Ändii präsentiert dem Boss die Rechnung - so viel Schaden, wie du heute in der Spielothek verloren hast.",
      en: "Ändii hands the boss the bill - as much damage as you lost in the arcade today.",
    },
  },
];

/* Ein Angriff nach Schluessel, egal aus welcher der beiden Listen. */
function bossAngriffFinden(schluessel) {
  for (const a of BOSS_GRUNDANGRIFFE) if (a.schluessel === schluessel) return a;
  for (const a of BOSS_SPEZIALANGRIFFE) if (a.schluessel === schluessel) return a;
  return null;
}

function bossAngriffName(a) {
  if (!a) return "";
  const en = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  return en ? a.name.en : a.name.de;
}

function bossAngriffText(a) {
  if (!a) return "";
  const en = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  return en ? a.text.en : a.text.de;
}
