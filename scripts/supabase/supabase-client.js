/* ======================================================
   SUPABASE-CLIENT (Singleton, fuer LESEN UND SCHREIBEN)
   ---------------------------------------------------
   Analog zu "wheelDb" in firebase-config.js: EINE gemeinsame
   Instanz, die alle anderen scripts/supabase/*-Dateien nutzen.

   WICHTIG - AUTHENTIFIZIERUNG (Supabase "Third-Party Auth" fuer
   Firebase, siehe supabase/game-migration/README.md): Der Client
   bekommt per "accessToken"-Callback bei JEDER Anfrage das aktuelle,
   echte Firebase-ID-Token mitgegeben. Supabase verifiziert dieses
   Token selbst serverseitig (kein eigenes Supabase-Login noetig,
   KEINE zweite Benutzerverwaltung) und macht die echte Firebase-UID
   in RLS-Policies ueber auth.jwt() ->> 'sub' verfuegbar - siehe
   supabase/game-migration/01-players-ship-progression.sql
   (app.firebase_uid()). Ohne dieses Token wuerde jede Anfrage als
   "anon" behandelt und faellt auf die oeffentlichen Lese-Policies
   zurueck (z.B. players_select_public) - Schreibzugriffe auf eigene
   Daten wuerden dann von RLS korrekt abgelehnt.

   Braucht das global per <script>-Tag geladene supabase-js (UMD-
   Build, siehe index.html) - genau wie firebase-config.js das
   global per <script>-Tag geladene "firebase"-Objekt braucht.
====================================================== */

let supabaseClient = null;

async function getSupabaseAccessToken() {
  try {
    if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
    if (typeof firebase === "undefined" || !firebase.auth || !firebase.auth().currentUser) return null;
    return await firebase.auth().currentUser.getIdToken();
  } catch (err) {
    console.warn("Firebase-ID-Token fuer Supabase konnte nicht geholt werden:", err);
    return null;
  }
}

if (
  typeof supabase !== "undefined" &&
  typeof supabaseConfig !== "undefined" &&
  supabaseConfig.url &&
  supabaseConfig.url !== "DEINE-SUPABASE-URL" &&
  supabaseConfig.anonKey &&
  supabaseConfig.anonKey !== "DEIN-SUPABASE-ANON-KEY"
) {
  try {
    supabaseClient = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      accessToken: getSupabaseAccessToken,
    });
  } catch (err) {
    console.warn("Supabase-Client konnte nicht erstellt werden:", err);
  }
} else {
  console.info(
    "Supabase ist noch nicht konfiguriert (scripts/supabase/supabase-config.js). " +
      "Spieler-/Statistik-Funktionen bleiben bis dahin einfach leer, der Rest der Seite ist davon nicht betroffen."
  );
}
