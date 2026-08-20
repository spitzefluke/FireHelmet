/* ======================================================
   SUPABASE-CLIENT (Singleton, NUR fuer lesende Zugriffe)
   ---------------------------------------------------
   Analog zu "wheelDb" in firebase-config.js: EINE gemeinsame
   Instanz, die alle anderen scripts/supabase/*-Dateien nutzen.
   Wird nur benoetigt, um oeffentliche Tabellen zu LESEN (siehe
   supabase-statistics.js) - das Schreiben laeuft ausschliesslich
   ueber den Worker-Proxy (siehe supabase-games.js), nicht ueber
   diesen Client.

   Braucht das global per <script>-Tag geladene supabase-js (UMD-
   Build, siehe index.html) - genau wie firebase-config.js das
   global per <script>-Tag geladene "firebase"-Objekt braucht.
====================================================== */

let supabaseClient = null;

if (
  typeof supabase !== "undefined" &&
  typeof supabaseConfig !== "undefined" &&
  supabaseConfig.url &&
  supabaseConfig.url !== "DEINE-SUPABASE-URL" &&
  supabaseConfig.anonKey &&
  supabaseConfig.anonKey !== "DEIN-SUPABASE-ANON-KEY"
) {
  try {
    supabaseClient = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  } catch (err) {
    console.warn("Supabase-Client konnte nicht erstellt werden:", err);
  }
} else {
  console.info(
    "Supabase ist noch nicht konfiguriert (scripts/supabase/supabase-config.js). " +
      "Statistik-Funktionen bleiben bis dahin einfach leer, der Rest der Seite ist davon nicht betroffen."
  );
}
