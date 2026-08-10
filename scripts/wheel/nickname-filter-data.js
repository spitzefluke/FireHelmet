/* ======================================
   NAMENS-FILTER
   Namen, die hier drin stehen (oder Wörter, die den Namen
   enthalten), werden bei der anonymen Anmeldung ("Namen
   manuell eintragen") abgelehnt.

   WICHTIG: Trag hier gerne alle Wörter ein, die du in deiner
   Community NICHT als Namen erlauben willst (Beleidigungen,
   diskriminierende Begriffe, Fake-Admin-Namen usw.) - das ist
   deine Entscheidung als Streamer/Communityleiter, wir haben
   hier bewusst nur ein paar Beispiele vorgegeben.

   Groß-/Kleinschreibung ist egal, das Skript prüft automatisch
   auch gängige Zahlen-Buchstaben-Vertauschungen (z.B. "4dm1n"
   für "admin").
====================================== */

const nicknameBlocklist = [
  // Fake-Amtsträger / Verwechslungsgefahr mit dir oder Moderatoren
  "admin",
  "moderator",
  "mod",
  "system",
  "support",
  "zugfahrer_dave",

  // Grobe Standard-Schimpfwörter (ergänze gerne weitere / eigene)
  "fuck",
  "hurensohn",
  "wichser",
  "arschloch",
  "fotze", 
  "arsch",
];
