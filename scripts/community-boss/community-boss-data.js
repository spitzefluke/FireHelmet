/* ======================================
   COMMUNITY-BOSS
   Ein gemeinsamer Gegner mit viel Leben (HP), den die ganze
   Community innerhalb eines Kalendermonats gemeinsam besiegen
   muss. Jeder darf einmal täglich angreifen. Am Ende des
   Monats setzt sich alles automatisch zurück - ein neuer
   Boss (reihum aus der Liste unten) wartet dann.

   Trage hier beliebig viele Bosse ein, sie werden reihum nach
   Monat ausgewählt (für alle Besucher gleich).
====================================== */

const communityBossConfig = {
  maxHp: 5000, // Gesamt-Lebenspunkte des Bosses für den Monat
  minDamagePerAttack: 15, // kleinster möglicher Schaden pro Angriff
  maxDamagePerAttack: 45, // größter möglicher Schaden pro Angriff
};

const communityBosses = [
  {
    name: "Krake Morgrath",
    emoji: "🐙",
    flavorText: "Ein uralter Krake, der seit Ewigkeiten die Handelsrouten terrorisiert.",
    defeatMessage: "Krake Morgrath sinkt zurück in die Tiefe - die Handelsrouten sind wieder frei! 🏆",
    color: "#7c2d12",
  },
  {
    name: "Der Sturmdämon",
    emoji: "🌪️",
    flavorText: "Er braut die schlimmsten Stürme der sieben Meere zusammen.",
    defeatMessage: "Der Sturmdämon ist vertrieben - klarer Himmel voraus! ⛅",
    color: "#1c4f8f",
  },
  {
    name: "Kapitän Blackgold",
    emoji: "💀",
    flavorText: "Ein verfluchter Rivalen-Kapitän, der es auf euren Schatz abgesehen hat.",
    defeatMessage: "Kapitän Blackgold ist geentert - sein Gold gehört jetzt euch! 💰",
    color: "#3b2415",
  },
  {
    name: "Die Meeresschlange",
    emoji: "🐍",
    flavorText: "Riesig, giftig, und immer hungrig auf Schiffe.",
    defeatMessage: "Die Meeresschlange taucht ab - ruhige Gewässer für diesen Monat! 🌊",
    color: "#0e7c66",
  },
];
