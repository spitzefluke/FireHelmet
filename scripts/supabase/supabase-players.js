/* ======================================================
   SUPABASE: GEMEINSAME players-HILFSFUNKTIONEN
   ---------------------------------------------------
   WICHTIGER UNTERSCHIED ZU FIRESTORE: set(docRef, {...}, {merge:true})
   legt ein fehlendes Dokument automatisch an ("Upsert"). Ein Postgres
   UPDATE tut das NICHT - trifft es keine bestehende Zeile, passiert
   einfach nichts (0 betroffene Zeilen). Da bewusst KEINE Firestore-
   Bestandsdaten migriert werden (siehe supabase/game-migration/
   README.md), gibt es fuer aktuelle Spieler anfangs noch keine
   players-Zeile in Supabase.

   ensureSupabasePlayerRow() schliesst genau diese Luecke: legt (nur
   falls noch nicht vorhanden) eine players-Zeile im echten
   Ausgangszustand an - erfuellt damit exakt die "players_insert_own"-
   RLS-Policy (currency=0, gamesPlayed=0, ...), danach kann jede
   nachfolgende Datei ganz normal per UPDATE weiterschreiben. Wird von
   JEDER Datei genutzt, die players-Daten schreibt (Spielothek, Shop,
   Schatzrad, Schiffsreparatur, Progression, ...) - deshalb hier
   zentral statt in jeder Datei einzeln nachgebaut.
====================================================== */

async function ensureSupabasePlayerRow(uid, nickname) {
  if (!supabaseClient || !uid) return;
  try {
    await supabaseClient
      .from("players")
      .upsert({ firebase_uid: uid, nickname: nickname || null }, { onConflict: "firebase_uid", ignoreDuplicates: true });
  } catch (err) {
    // Race mit einem anderen Tab/Aufruf desselben Spielers ist
    // unbedenklich - die Zeile existiert dann bereits, das eigentliche
    // Update danach greift ganz normal.
    console.warn("Supabase-Spielerzeile konnte nicht sichergestellt werden:", err);
  }
}
