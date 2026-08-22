/* ======================================================
   SUPABASE: SPIEL-STATISTIKEN SCHREIBEN (ueber den Worker-Proxy)
   ---------------------------------------------------
   WICHTIG - NIEMALS die Quelle der Wahrheit: Diese Funktionen werden
   AUSSCHLIESSLICH NACH einer bereits erfolgreich und server-geprueft
   gespeicherten Runde/einem Angriff aufgerufen (siehe Aufrufstellen
   in spielothek.js/community-boss.js) - rein additiv, fuer
   Statistik/Verlauf. Ein Fehlschlag hier darf niemals die eigentliche
   Spiel-Funktionalitaet beeintraechtigen: jede Funktion faengt ihre
   eigenen Fehler ab und wirft NIE weiter.

   BEKANNTER, AKZEPTIERTER FOLGE-SCHRITT (Firebase entfernt): Dieser
   Weg nutzte urspruenglich einen Cloudflare-Worker-Proxy, der ein
   Firebase-ID-Token serverseitig prueft und dann selbst mit seinem
   service_role-Key schreibt (siehe supabase/worker/README.md). Da
   Firebase komplett entfernt wurde, liefert getFirebaseIdTokenForSupabase()
   jetzt immer null (typeof firebase === "undefined") - postToSupabaseProxy()
   No-opt dadurch automatisch und sicher (kein Fehler, kein Absturz),
   die eigentliche Spiel-Funktionalitaet ist davon nicht betroffen. Um
   diese Statistik-Funktion wieder zu aktivieren, muesste der Worker
   selbst auf Supabase-eigene Tokens umgestellt werden (eigener Schritt,
   ausserhalb dieses Repos deploybar) - bis dahin bleibt sie bewusst
   inaktiv statt kaputt.
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
