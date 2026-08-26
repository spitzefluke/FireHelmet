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

   Optionaler Bot-Schutz: signInAnonymously() reicht ein Cloudflare-
   Turnstile-Token durch, falls konfiguriert (siehe getTurnstileToken()
   unten + scripts/supabase/turnstile-config.js). Ohne Konfiguration
   laeuft die Anmeldung unveraendert wie bisher.

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

/* ------------------------------------------------------
   CLOUDFLARE TURNSTILE - CAPTCHA-TOKEN FUER signInAnonymously()
   ---------------------------------------------------
   Siehe scripts/supabase/turnstile-config.js fuer die Einrichtung.
   Solange dort kein echter Site-Key eingetragen ist, ODER falls das
   Cloudflare-Skript (z.B. durch einen Adblocker oder Netzwerkfehler)
   gar nicht laedt, loest diese Funktion einfach mit "null" auf -
   signInAnonymously() laeuft dann exakt wie vorher, ganz ohne
   Captcha-Pruefung. Ein echter Besucher soll NIE an einem fehlenden/
   fehlgeschlagenen Drittanbieter-Skript scheitern.
------------------------------------------------------ */
function getTurnstileToken() {
  return new Promise((resolve) => {
    if (
      typeof turnstileConfig === "undefined" ||
      !turnstileConfig.siteKey ||
      turnstileConfig.siteKey === "DEIN-TURNSTILE-SITE-KEY" ||
      typeof turnstile === "undefined"
    ) {
      resolve(null);
      return;
    }

    const container = document.getElementById("turnstile-widget");
    if (!container) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (token) => {
      if (settled) return;
      settled = true;
      resolve(token);
    };

    // Netzwerkprobleme oder ein sehr seltener haengender Widget-Zustand
    // sollen die gesamte Seite nicht auf unbestimmte Zeit blockieren.
    const timeout = setTimeout(() => finish(null), 8000);

    try {
      turnstile.render(container, {
        sitekey: turnstileConfig.siteKey,
        appearance: "interaction-only", // bleibt unsichtbar, ausser eine Pruefung ist wirklich noetig
        callback: (token) => {
          clearTimeout(timeout);
          finish(token);
        },
        "error-callback": () => {
          clearTimeout(timeout);
          finish(null);
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      finish(null);
    }
  });
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

        const captchaToken = await getTurnstileToken();
        const { data, error } = await supabaseClient.auth.signInAnonymously(
          captchaToken ? { options: { captchaToken } } : undefined
        );
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
