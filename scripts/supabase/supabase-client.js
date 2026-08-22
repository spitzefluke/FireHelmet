/* ======================================================
   SUPABASE-CLIENT (Singleton, fuer LESEN UND SCHREIBEN) + ANMELDUNG
   ---------------------------------------------------
   Frueher lief die Anmeldung ueber Firebase Authentication +
   Supabase "Third-Party Auth" als Bruecke dazwischen. Live gegen das
   echte Projekt hat sich diese Bruecke als nicht zuverlaessig
   erwiesen (Third-Party-Auth-Anfragen liefen serverseitig immer
   wieder als "anon" statt "authenticated", obwohl Token/Konfiguration
   nachweislich korrekt waren - ein Supabase-seitiges Problem, das
   sich von hier aus nicht beheben liess). Firebase ist deshalb
   komplett entfernt - Supabase ist jetzt die EINZIGE Anmeldung UND
   Datenbank.

   wheelAuthReady loest mit der (anonymen) Supabase-User-UUID auf,
   sobald die Anmeldung abgeschlossen ist - genau wie zuvor bei
   Firebase, nur dass die UUID jetzt von Supabase selbst kommt statt
   von Firebase durchgereicht zu werden. Die Spalte "firebase_uid" in
   allen Tabellen (supabase/game-migration/) heisst bewusst weiter so,
   obwohl sie jetzt eine Supabase-UUID statt einer Firebase-UID
   enthaelt - so bleibt der gesamte restliche Client-Code (jedes
   ".eq('firebase_uid', uid)") unveraendert, nur die Quelle von "uid"
   hat sich geaendert.

   VORAUSSETZUNG IM SUPABASE-DASHBOARD: Authentication -> Sign In /
   Providers -> Anonymous Sign-Ins muss aktiviert sein, sonst schlaegt
   signInAnonymously() fehl.

   Braucht das global per <script>-Tag geladene supabase-js (UMD-
   Build, siehe index.html).
====================================================== */

let supabaseClient = null;
let wheelAuthReady = Promise.resolve(null);

// Live gegen das echte Supabase-Projekt beobachtet: die erste(n)
// Anfrage(n) pro Seitenaufruf koennen vereinzelt mit Postgres-Code
// 42501 ("insufficient privilege") scheitern, obwohl Sitzung/Token
// nachweislich gueltig sind - jede folgende Anfrage funktioniert
// sofort einwandfrei. Hier per einmaligem Retry abgefedert, statt
// echte Nutzer sichtbar scheitern zu lassen. NUR fuer genau dieses
// Fehlerbild (42501) - ein echtes, dauerhaftes RLS-Verbot wuerde
// durch den Retry nicht "repariert" und soll auch nicht
// stillschweigend wiederholt werden.
async function withSupabaseRlsColdStartRetry(queryFn) {
  const first = await queryFn();
  if (!first || !first.error || first.error.code !== "42501") return first;
  await new Promise((resolve) => setTimeout(resolve, 800));
  return await queryFn();
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
    supabaseClient = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);

    wheelAuthReady = (async () => {
      try {
        // Nach einem Google-OAuth-Redirect (Admin-Login) hat
        // supabase-js die Sitzung aus der URL bereits selbst erkannt
        // und wiederhergestellt (detectSessionInUrl, Standard) - hier
        // reicht ein einfacher Abruf, kein erneuter Login noetig.
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (sessionData && sessionData.session && sessionData.session.user) {
          return sessionData.session.user.id;
        }

        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        return data && data.user ? data.user.id : null;
      } catch (err) {
        console.error("Anonyme Supabase-Anmeldung fehlgeschlagen:", err);
        return null;
      }
    })();
  } catch (err) {
    console.warn("Supabase-Client konnte nicht erstellt werden:", err);
  }
} else {
  console.info(
    "Supabase ist noch nicht konfiguriert (scripts/supabase/supabase-config.js). " +
      "Spieler-/Statistik-Funktionen bleiben bis dahin einfach leer, der Rest der Seite ist davon nicht betroffen."
  );
}
