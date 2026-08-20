/* ======================================================
   SUPABASE: STATISTIKEN LESEN
   ---------------------------------------------------
   Reine Lesefunktionen fuer die drei oeffentlichen/eigenen Supabase-
   Tabellen (siehe supabase/schema.sql). Nutzt den anon-Key-Client
   (supabase-client.js) - RLS erlaubt genau das, was hier gebraucht
   wird (eigene Spielothek-Runden, oeffentliche Boss-Angriffe/
   Ranglisten-Snapshots), nichts mehr.

   HINWEIS: Diese Funktionen sind bewusst als eigenstaendige,
   wiederverwendbare API bereitgestellt (Teil der Abstraktionsschicht,
   siehe Analyse-Bericht Phase 4), werden aber in DIESER Runde noch
   NICHT in eine neue Anzeige-UI eingebaut - das waere eine neue
   Feature-Entscheidung (z.B. "letzte Treffer"-Feed, Ranglisten-
   Verlauf-Seite) ueber die reine Integration hinaus. Jede Funktion
   gibt bei fehlender Konfiguration/Fehler einfach eine leere Liste
   zurueck, niemals einen geworfenen Fehler - unbedenklich, auch
   bevor eine UI sie nutzt.
====================================================== */

/**
 * Eigene Spielothek-Rundenhistorie (neueste zuerst).
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
async function fetchOwnSpielothekHistory(limit = 20) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("spielothek_rounds")
    .select("game_id, bet_amount, payout_amount, won, played_at")
    .order("played_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("Spielothek-Historie konnte nicht geladen werden:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Oeffentlicher Community-Boss-Angriffs-Feed fuer einen Monat.
 * @param {string} monthId - z.B. "2026-08"
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
async function fetchRecentBossAttacks(monthId, limit = 20) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("community_boss_attacks")
    .select("nickname, damage, created_at")
    .eq("month_id", monthId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("Community-Boss-Angriffs-Feed konnte nicht geladen werden:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Historischer Ranglisten-Snapshot (nicht die Live-Rangliste!).
 * @param {"week"|"month"} periodType
 * @param {string} periodKey - z.B. "2026-W33" oder "2026-08"
 * @returns {Promise<Array>}
 */
async function fetchLeaderboardSnapshot(periodType, periodKey) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("leaderboard_snapshots")
    .select("rank, nickname, score")
    .eq("period_type", periodType)
    .eq("period_key", periodKey)
    .order("rank", { ascending: true });

  if (error) {
    console.warn("Ranglisten-Snapshot konnte nicht geladen werden:", error.message);
    return [];
  }
  return data || [];
}
