/* ======================================================
   TWITCH LOGIN - KONFIGURATION
   Damit sich Besucher mit ihrem Twitch-Account anmelden
   können (verifizierter Name + Profilbild statt frei
   eingetipptem Namen).

   SO RICHTEST DU DAS EIN (kostenlos, ca. 2 Minuten):
   1. Gehe zu https://dev.twitch.tv/console/apps
      (mit deinem Twitch-Account einloggen)
   2. "Register Your Application" klicken
   3. Name: z.B. "FireHelmet"
   4. OAuth Redirect URLs: genau die Adresse deiner Seite
      eintragen, z.B. https://spitzefluke.github.io/FireHelmet/
      (WICHTIG: exakt mit Schrägstrich am Ende, so wie deine
      Seite tatsächlich aufgerufen wird)
   5. Category: "Website Integration"
   6. "Create" klicken
   7. Bei deiner neuen App auf "Manage" -> die "Client ID"
      kopieren und unten eintragen
====================================================== */

const twitchConfig = {
  clientId: "78l9p1pnw8f6mw7dn5ulgtrhnr4ygs",
  redirectUri: window.location.origin + window.location.pathname,
};
