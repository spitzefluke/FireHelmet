/* ======================================================
   CLOUDFLARE TURNSTILE - BOT-SCHUTZ FUER DIE ANONYME ANMELDUNG
   ---------------------------------------------------
   Schuetzt signInAnonymously() (siehe supabase-client.js) davor,
   automatisiert missbraucht zu werden (z.B. Skripte, die massenhaft
   anonyme Konten erzeugen, um Codes/Dublonen zu farmen). Laeuft im
   "Managed"-Modus: fuer die allermeisten echten Besucher voellig
   unsichtbar im Hintergrund, nur bei verdaechtigem Traffic erscheint
   kurz eine kleine Checkbox unten rechts (siehe .turnstile-widget in
   style.css).

   EINRICHTUNG (einmalig, im eigenen Cloudflare-/Supabase-Account):

   1. https://dash.cloudflare.com -> Turnstile -> "Add widget"
      - Widget-Modus: "Managed" auswaehlen
      - Domain: deine echte Domain eintragen (z.B. deine
        GitHub-Pages-Domain oder eigene Domain)
   2. Den dort angezeigten "Site Key" unten bei "siteKey" eintragen.
   3. Den "Secret Key" NICHT hier eintragen (der gehoert niemals in
      Client-Code, der oeffentlich im Browser liegt!) - stattdessen
      im Supabase-Dashboard hinterlegen:
      Authentication -> Attack Protection -> "Enable Captcha
      protection" -> Anbieter "Turnstile" -> Secret Key einfuegen.

   Solange "siteKey" unten auf dem Platzhalter steht, bleibt dieser
   Schutz komplett inaktiv und die anonyme Anmeldung laeuft exakt wie
   bisher, ganz ohne Captcha-Pruefung - sicheres Zusammenfuehren ohne
   Live-Konfiguration.
====================================================== */

const turnstileConfig = {
  siteKey: "0x4AAAAAAEdFE9xIBp5wXOPe",
};
