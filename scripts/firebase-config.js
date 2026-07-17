/* ======================================================
   FIREBASE KONFIGURATION
   Hier trägst du deine eigenen Firebase-Zugangsdaten ein,
   damit die Rangliste wirklich GLOBAL funktioniert (also
   für alle Besucher deiner Seite gemeinsam).

   SO BEKOMMST DU DIESE WERTE (kostenlos, ca. 5 Minuten):
   1. Gehe zu https://console.firebase.google.com
   2. "Projekt hinzufügen" -> Namen vergeben (z.B. FireHelmet)
      -> Google Analytics kannst du deaktivieren -> Erstellen
   3. Im Projekt links auf "Build" -> "Firestore Database"
      -> "Datenbank erstellen" -> "Testmodus" auswählen
      (das reicht für den Start, siehe Hinweis unten)
   4. Zurück zur Projektübersicht -> Zahnrad-Symbol oben links
      -> "Projekteinstellungen"
   5. Ganz unten bei "Meine Apps" -> Web-App hinzufügen (</> Symbol)
      -> Namen vergeben -> "App registrieren"
   6. Jetzt zeigt Firebase dir einen Code-Block mit genau den
      Werten, die du unten bei firebaseConfig eintragen musst
      (apiKey, authDomain, projectId, ...) - einfach kopieren.

   WICHTIGER SICHERHEITS-HINWEIS:
   Im "Testmodus" darf erstmal jeder lesen UND schreiben.
   Für eine kleine Fan-Seite ist das okay, aber theoretisch
   könnte jemand die Datenbank manipulieren. Falls dir das
   wichtig ist, sag mir Bescheid, dann bauen wir strengere
   Firestore-Regeln (z.B. nur eigene Einträge bearbeiten).
====================================================== */

const firebaseConfig = {
  apiKey: "DEIN-API-KEY",
  authDomain: "DEIN-PROJEKT.firebaseapp.com",
  projectId: "DEIN-PROJEKT",
  storageBucket: "DEIN-PROJEKT.appspot.com",
  messagingSenderId: "DEINE-SENDER-ID",
  appId: "DEINE-APP-ID",
};

let wheelDb = null;

// Erst initialisieren, wenn echte Werte eingetragen wurden
if (firebaseConfig.apiKey !== "DEIN-API-KEY") {
  firebase.initializeApp(firebaseConfig);
  wheelDb = firebase.firestore();
} else {
  console.warn(
    "Firebase ist noch nicht konfiguriert (scripts/firebase-config.js). " +
    "Die Rangliste bleibt bis dahin leer / lokal."
  );
}
