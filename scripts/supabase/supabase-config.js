/* ======================================================
   SUPABASE KONFIGURATION
   ---------------------------------------------------
   Genau wie bei scripts/auth/firebase-config.js: URL + "anon
   public" Key sind laut Supabase-eigener Dokumentation bewusst
   OEFFENTLICH (https://supabase.com/docs/guides/api/api-keys) -
   die eigentliche Sicherheit kommt aus Row Level Security (siehe
   supabase/schema.sql), nicht aus Geheimhaltung dieses Keys. Der
   VIEL kritischere service_role-Key gehoert NIEMALS hierhin oder
   irgendwo sonst in den Client-Code - der lebt ausschliesslich im
   Cloudflare Worker, siehe supabase/worker/README.md.

   SO BEKOMMST DU DIESE WERTE:
   1. https://supabase.com/dashboard -> dein Projekt
   2. Project Settings -> Data API -> "Project URL" und "anon
      public" Key kopieren
   3. supabase/schema.sql im SQL Editor einmalig ausfuehren
====================================================== */

const supabaseConfig = {
  // Leer lassen = Supabase-Integration ist deaktiviert, die Website
  // funktioniert unveraendert normal weiter (rein additiv, siehe
  // scripts/supabase/supabase-client.js).
  url: "DEINE-SUPABASE-URL",
  anonKey: "DEIN-SUPABASE-ANON-KEY",
};
