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

// Der ALLERERSTE Aufruf pro Seitenaufruf erzwingt ein frisches Token
// (statt eines evtl. aus einer wiederhergestellten Sitzung gecachten) -
// ein Token, das im selben Moment neu ausgestellt UND fast zeitgleich
// von Supabase geprueft wird, kann sonst an einer knappen Zeit-Toleranz
// (iat/Uhr-Abweichung) scheitern und faelschlich als 401 (statt 403)
// zurueckkommen, obwohl RLS/Third-Party-Auth korrekt konfiguriert sind.
// Danach reicht wieder das normale, guenstige Firebase-Caching - sonst
// wuerde JEDE Supabase-Anfrage einen zusaetzlichen Netzwerk-Umweg zu
// Firebase brauchen, nicht nur die erste.
let supabaseAccessTokenForcedOnce = false;

async function getSupabaseAccessToken() {
  const dbg = "[DEBUG accessToken @" + performance.now().toFixed(0) + "ms]";
  try {
    if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
    console.log(dbg, "nach wheelAuthReady, currentUser vorhanden:", !!(typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser));
    if (typeof firebase === "undefined" || !firebase.auth || !firebase.auth().currentUser) return null;
    const forceRefresh = !supabaseAccessTokenForcedOnce;
    supabaseAccessTokenForcedOnce = true;
    const token = await firebase.auth().currentUser.getIdToken(forceRefresh);
    console.log(dbg, "forceRefresh=" + forceRefresh, "tokenLaenge=" + (token ? token.length : token), "tokenStart=" + (token ? token.slice(0, 20) : token));
    return token;
  } catch (err) {
    console.log(dbg, "FEHLER beim Token-Holen:", err);
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
