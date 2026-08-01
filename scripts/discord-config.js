/* ======================================================
   DISCORD LOGIN - KONFIGURATION
   Damit sich Besucher mit ihrem Discord-Account anmelden
   können (verifizierter Name + Profilbild statt frei
   eingetipptem Namen).

   SO RICHTEST DU DAS EIN (kostenlos, ca. 2 Minuten):
   1. Gehe zu https://discord.com/developers/applications
      (mit deinem Discord-Account einloggen)
   2. "New Application" klicken -> Namen vergeben (z.B. FireHelmet)
      -> "Create"
   3. Im linken Menü auf "OAuth2" klicken
   4. Bei "Redirects" auf "Add Redirect" -> genau die Adresse
      deiner Seite eintragen, z.B.
      https://spitzefluke.github.io/FireHelmet/
      (WICHTIG: exakt mit Schrägstrich am Ende, so wie deine
      Seite tatsächlich aufgerufen wird) -> "Save Changes"
   5. Ganz oben auf der OAuth2-Seite die "Client ID" kopieren
      und unten eintragen
====================================================== */

const discordConfig = {
  clientId: "DEINE-DISCORD-CLIENT-ID",
  redirectUri: window.location.origin + window.location.pathname,
};
