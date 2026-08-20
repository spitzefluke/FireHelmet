/* ======================================================
   SUPABASE-PROXY-WORKER (SCHREIBWEG)
   ---------------------------------------------------
   Genau nach demselben Muster wie discord-notify-data.js: hier
   steht NUR die harmlose Worker-Adresse, kein Geheimnis. Der Worker
   selbst verifiziert das Firebase-ID-Token und schreibt mit seinem
   eigenen, geheimen service_role-Key - siehe supabase/worker/.

   Spielothek-Runden und Community-Boss-Angriffe werden bewusst NICHT
   direkt vom Browser per Supabase-Client geschrieben (siehe
   supabase/schema.sql: keine INSERT-Policy fuer anon/authenticated),
   sondern ausschliesslich ueber diesen Proxy - das schliesst
   Statistik-Faelschung durch einen manipulierten Client strukturell
   aus.
====================================================== */

const supabaseProxyConfig = {
  // Leer lassen = Logging ist deaktiviert, Spielothek/Community-Boss
  // funktionieren unveraendert normal weiter (rein additiv).
  proxyUrl: "", // z.B. "https://firehelmet-supabase-proxy.deinname.workers.dev"

  enabled: false,
};
