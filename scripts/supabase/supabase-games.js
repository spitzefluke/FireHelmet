/* ======================================================
   SUPABASE: SPIEL-STATISTIKEN SCHREIBEN (ueber den Worker-Proxy)
   ---------------------------------------------------
   WICHTIG - NIEMALS die Quelle der Wahrheit: Diese Funktionen werden
   AUSSCHLIESSLICH NACH einer bereits erfolgreich und server-geprueft
   in Firestore geschriebenen Runde/einem Angriff aufgerufen (siehe
   Aufrufstellen in spielothek.js/community-boss.js) - rein additiv,
   fuer Statistik/Verlauf. Ein Fehlschlag hier darf niemals die
   eigentliche Spiel-Funktionalitaet beeintraechtigen: jede Funktion
   faengt ihre eigenen Fehler ab und wirft NIE weiter.

   Nutzt bewusst NICHT den Supabase-Client/anon-Key zum Schreiben
   (siehe supabase-client.js) - stattdessen einen Fetch-Aufruf an den
   Cloudflare-Worker-Proxy mit dem echten Firebase-ID-Token im
   Authorization-Header, exakt wie das bereits bestehende Muster in
   scripts/core/discord-notify.js. Der Worker verifiziert das Token
   und schreibt selbst mit seinem service_role-Key - siehe
   supabase/worker/README.md.
====================================================== */

async function getFirebaseIdTokenForSupabase() {
  if (typeof firebase === "undefined" || !firebase.auth || !firebase.auth().currentUser) return null;
  try {
    return await firebase.auth().currentUser.getIdToken();
  } catch (err) {
    console.warn("Firebase-ID-Token fuer Supabase-Logging konnte nicht geholt werden:", err);
    return null;
  }
}

async function postToSupabaseProxy(path, body) {
  if (typeof supabaseProxyConfig === "undefined" || !supabaseProxyConfig.enabled || !supabaseProxyConfig.proxyUrl) {
    return; // Integration noch nicht eingerichtet - stiller No-Op
  }

  const idToken = await getFirebaseIdTokenForSupabase();
  if (!idToken) return; // nicht angemeldet - kein sinnvoller Log-Eintrag moeglich

  try {
    await fetch(supabaseProxyConfig.proxyUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + idToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Bewusst nur ein Warnhinweis, niemals ein geworfener Fehler -
    // Statistik-Logging darf das eigentliche Spiel nie stoeren.
    console.warn("Supabase-Statistik konnte nicht gespeichert werden (" + path + "):", err);
  }
}

/**
 * @param {string} gameId - z.B. "slot"
 * @param {number} betAmount
 * @param {number} payoutAmount
 * @param {boolean} won
 */
function logSpielothekRoundToSupabase(gameId, betAmount, payoutAmount, won) {
  postToSupabaseProxy("/spielothek-log", { gameId, betAmount, payoutAmount, won });
}

/**
 * @param {string} nickname
 * @param {string} monthId - z.B. "2026-08"
 * @param {number} damage
 */
function logBossAttackToSupabase(nickname, monthId, damage) {
  postToSupabaseProxy("/boss-attack-log", { nickname, monthId, damage });
}
