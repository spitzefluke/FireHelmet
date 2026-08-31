/* ======================================================
   THE CHALLENGE - REINE DATENZUGRIFFSSCHICHT
   ---------------------------------------------------
   Bewusst getrennt von der Bracket-Darstellung (kommt in einer
   spaeteren Datei) und vom eigentlichen Mini-Game: diese Datei kennt
   NUR Turnier/Teilnehmer/Match/Preis-Datensaetze, keine DOM-Elemente,
   keinen localStorage-Nickname-Zugriff, keine Statustexte. Genau die
   im Auftrag gewuenschte Trennung "Tournament -> Match -> Game/
   Challenge -> Score -> Winner -> Next Match": diese Datei deckt
   Tournament/Match/Score/Winner/Next-Match ab, das jeweilige Mini-
   Game liefert nur eine einzelne Zahl (siehe tournament-games.js).

   Fehlerbehandlung: anders als z.B. attackCommunityBoss() (fängt
   Fehler selbst ab und schreibt direkt einen Statustext ins DOM)
   wirft jede Funktion hier Fehler EINFACH WEITER. Postgres liefert
   bei abgelehnten Aktionen sprechende Fehlermeldungen (z.B.
   "not-your-match", "already-played", "match-already-complete",
   "invalid-score", "tournament-paused", "not-admin" - siehe
   supabase/game-migration/07-tournament.sql) - die aufrufende UI-
   Schicht kann diese Codes gezielt abfangen und passende Texte
   anzeigen, statt dass diese Datei das schon vorwegnimmt.

   Alle schreibenden Aktionen warten zuerst auf wheelAuthReady (siehe
   supabase-client.js) - exakt das im restlichen Projekt etablierte
   Muster (siehe z.B. attackCommunityBoss() in community-boss.js).
====================================================== */

const TOURNAMENT_OPEN_STATUSES = ["registration", "active"];

/* ------------------------------------------------------
   LESEN (oeffentlich, kein Login noetig)
------------------------------------------------------ */

// Das aktuell offene Turnier (Anmeldephase ODER laufend) - dank des
// "immer nur ein offenes Turnier gleichzeitig"-Unique-Index in der
// Datenbank (siehe 07-tournament.sql) gibt es davon nie mehr als
// eines. null, wenn gerade keins offen ist.
async function getOpenTournament() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("tournaments")
    .select("*")
    .in("status", TOURNAMENT_OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getTournamentById(tournamentId) {
  if (!supabaseClient || !tournamentId) return null;
  const { data, error } = await supabaseClient
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Zuletzt abgeschlossenes Turnier (fuer eine "letzter Champion"-
// Anzeige, sobald kein Turnier mehr offen ist).
async function getLastFinishedTournament() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("tournaments")
    .select("*")
    .eq("status", "finished")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getTournamentParticipants(tournamentId) {
  if (!supabaseClient || !tournamentId) return [];
  const { data, error } = await supabaseClient
    .from("tournament_participants")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getTournamentMatches(tournamentId) {
  if (!supabaseClient || !tournamentId) return [];
  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("match_index", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Die (hoechstens eine) Preis-Zeile - siehe tournament_prize in
// 07-tournament.sql, feste id='cap'. null, solange noch niemand
// jemals ein komplettes Turnier gewonnen hat.
async function getTournamentPrize() {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("tournament_prize")
    .select("*")
    .eq("id", "cap")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Aus einer bereits geladenen Match-Liste das eigene, noch offene
// Match herausfiltern (status 'pending' oder 'open', je nachdem ob
// der Gegner schon feststeht) - reiner Hilfsfunktion, keine eigene
// Datenbankabfrage noetig, da die UI-Schicht die Matches ohnehin
// schon fuer die Bracket-Darstellung laedt.
function findMyOpenMatch(matches, uid) {
  if (!Array.isArray(matches) || !uid) return null;
  return (
    matches.find(
      (m) => m.status !== "complete" && (m.player_1_uid === uid || m.player_2_uid === uid)
    ) || null
  );
}

/* ------------------------------------------------------
   SCHREIBEN (Login noetig)
------------------------------------------------------ */

// Turnier beitreten - nickname wird bewusst als Parameter erwartet
// statt hier selbst aus localStorage gelesen zu werden (diese Datei
// bleibt frei von UI-/Storage-Kopplung, siehe Dateikopf).
async function joinTournament(tournamentId, nickname) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  const uid = await wheelAuthReady;
  if (!uid) throw new Error("not-signed-in");

  // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient
      .from("tournament_participants")
      .insert({ tournament_id: tournamentId, firebase_uid: uid, nickname })
      .select()
      .maybeSingle()
  );
  if (error) throw error;
  return data;
}

// Ergebnis der eigenen Mini-Game-Challenge fuer ein Match einreichen.
// p_score_ms: niedriger-ist-besser-Kennzahl (siehe ReactionGame) -
// welches konkrete Mini-Game diese Zahl liefert, ist fuer diese
// Funktion irrelevant (siehe Dateikopf-Kommentar zur Trennung).
// Rueckgabe: { matchStatus: 'complete'|'waiting-for-opponent', winnerUid }.
async function submitMatchScore(matchId, scoreMs) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;

  // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.rpc("tournament_submit_score", {
      p_match_id: matchId,
      p_score_ms: Math.round(scoreMs),
    })
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { matchStatus: row ? row.match_status : null, winnerUid: row ? row.winner_uid : null };
}

/* ------------------------------------------------------
   ADMIN (app.is_admin() wird serverseitig in jeder Funktion selbst
   geprueft, siehe 07-tournament.sql - kein eigener Client-Gate hier
   noetig, das Admin-Gateway prueft isAuthorizedAdmin() bereits vor
   der Anzeige der zugehoerigen UI-Elemente).
------------------------------------------------------ */

async function adminCreateTournament(tournamentId) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.rpc("admin_create_tournament", { p_id: tournamentId })
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function adminStartTournament(tournamentId) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.rpc("admin_start_tournament", { p_tournament_id: tournamentId })
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function adminResetTournament(tournamentId) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;
  const { error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.rpc("admin_reset_tournament", { p_tournament_id: tournamentId })
  );
  if (error) throw error;
}

async function adminSetTournamentPaused(tournamentId, paused) {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.rpc("admin_set_tournament_paused", {
      p_tournament_id: tournamentId,
      p_paused: !!paused,
    })
  );
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Preis manuell als "verschickt/uebergeben" markieren - separat vom
// automatischen Gewinner-Eintrag (siehe tournament_prize_update_admin-
// Policy in 07-tournament.sql: normales UPDATE reicht hier, keine RPC
// noetig, weil nur der Admin diese Zeile ueberhaupt aendern darf).
async function adminMarkPrizeFulfilled() {
  if (!supabaseClient) throw new Error("supabase-not-configured");
  await wheelAuthReady;
  const { data, error } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient
      .from("tournament_prize")
      .update({ fulfilled: true, fulfilled_at: new Date().toISOString() })
      .eq("id", "cap")
      .select()
      .maybeSingle()
  );
  if (error) throw error;
  return data;
}
