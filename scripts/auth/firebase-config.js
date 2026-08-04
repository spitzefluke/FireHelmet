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
      -> "Datenbank erstellen" -> "Produktionsmodus" auswählen
   4. Links auf "Build" -> "Authentication" -> "Los geht's"
      -> Tab "Sign-in method" -> "Anonym" auswählen -> aktivieren
      (dadurch bekommt jeder Besucher automatisch eine sichere,
      eindeutige ID, ganz ohne Login-Bildschirm)
   5. Zurück zur Projektübersicht -> Zahnrad-Symbol oben links
      -> "Projekteinstellungen"
   6. Ganz unten bei "Meine Apps" -> Web-App hinzufügen (</> Symbol)
      -> Namen vergeben -> "App registrieren"
   7. Jetzt zeigt Firebase dir einen Code-Block mit genau den
      Werten, die du unten bei firebaseConfig eintragen musst
      (apiKey, authDomain, projectId, ...) - einfach kopieren.

   WICHTIG: Da die Datenbank im Produktionsmodus startet, musst
   du zusätzlich die Sicherheitsregeln eintragen, die ich dir
   separat gebe (Firestore Database -> Tab "Regeln"). Ohne diese
   Regeln blockiert Firestore ALLES, auch berechtigte Zugriffe.
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

// Löst mit der (anonymen) Nutzer-ID auf, sobald die Anmeldung
// abgeschlossen ist. Wird in wheel.js beim Speichern abgewartet.
let wheelAuthReady = Promise.resolve(null);

if (firebaseConfig.apiKey !== "DEIN-API-KEY") {
  firebase.initializeApp(firebaseConfig);
  wheelDb = firebase.firestore();

  wheelAuthReady = new Promise((resolve) => {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        resolve(user.uid);
        return;
      }

      firebase
        .auth()
        .signInAnonymously()
        .catch((err) => {
          console.error("Anonyme Firebase-Anmeldung fehlgeschlagen:", err);
          resolve(null);
        });
    });
  });
} else {
  console.warn(
    "Firebase ist noch nicht konfiguriert (scripts/firebase-config.js). " +
      "Die Rangliste bleibt bis dahin leer / lokal."
  );
}
