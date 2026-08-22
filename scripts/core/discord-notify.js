/* ======================================================
   DISCORD-BENACHRICHTIGUNG
   Sendet automatisch eine Nachricht über den (sicheren)
   Cloudflare-Proxy an Discord, sobald sich der Text in
   scripts/core/update-notice-data.js ändert - erkannt über
   dieselbe Prüfsumme wie beim Update-Popup.

   Damit die Nachricht nur EINMAL im Kanal landet (und nicht
   einmal pro Besucher), wird der zuletzt gesendete Stand in einer
   gemeinsamen Supabase-Zeile gemerkt (site_meta, id="update_notice" -
   dieselbe Datenbank, die auch für die Rangliste genutzt wird). Ohne
   Supabase-Verbindung wird sicherheitshalber NICHTS gesendet, um
   Mehrfach-Nachrichten zu vermeiden.
====================================================== */

async function trySendDiscordUpdateNotice() {
  if (typeof discordNotifyConfig === "undefined" || !discordNotifyConfig.enabled) return;
  if (!discordNotifyConfig.proxyUrl) return; // noch nicht eingerichtet
  if (typeof updateNoticeConfig === "undefined") return;
  if (typeof hashUpdateNoticeText !== "function") return;
  if (typeof supabaseClient === "undefined" || !supabaseClient) return; // keine gemeinsame DB -> lieber nichts senden
  if (typeof wheelAuthReady === "undefined") return;

  // WICHTIG: erst warten, bis die anonyme Firebase-Anmeldung wirklich
  // abgeschlossen ist - sonst lehnt die Supabase-RLS-Policy den
  // Zugriff ab (auth.jwt() waere noch leer)
  const uid = await wheelAuthReady;
  if (!uid) return;

  const currentHash = hashUpdateNoticeText(
    (updateNoticeConfig.title || "") + "||" + (updateNoticeConfig.message || "")
  );

  try {
    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    // - dieser Aufruf feuert automatisch kurz nach dem Laden, ist also
    // eine der allerersten authentifizierten Anfragen pro Seitenaufruf
    // und damit besonders anfaellig fuer den dort beschriebenen Kaltstart.
    const { data, error: readError } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient.from("site_meta").select("last_sent_hash").eq("id", "update_notice").maybeSingle()
    );
    if (readError) throw readError;

    const lastSentHash = data ? data.last_sent_hash : null;
    if (lastSentHash === currentHash) return; // schon gesendet für diesen Textstand

    const content =
      `📢 **${updateNoticeConfig.title || "Update"}**\n${updateNoticeConfig.message || ""}`;

    // ERST wirklich senden, DANACH als "gesendet" markieren - nicht
    // umgekehrt. Vorher wurde last_sent_hash schon VOR dem fetch()
    // geschrieben (um Mehrfach-Sendungen durch gleichzeitige Besucher
    // zu vermeiden), aber ohne den Erfolg zu prüfen: schlug der Proxy-
    // Aufruf fehl (z.B. wegen eines CORS-Fehlers im Cloudflare-Worker,
    // siehe supabase/worker/README.md), stand der Hash trotzdem schon
    // als "gesendet" in der Datenbank - jeder weitere Seitenaufruf sah
    // dann faelschlich "schon erledigt" und hat es nie wieder
    // versucht, obwohl in Discord nie eine Nachricht ankam. Das
    // verbleibende Restrisiko (zwei Besucher lesen gleichzeitig einen
    // noch alten Hash und senden beide) ist fuer eine seltene Update-
    // Ankuendigung unkritisch - eine gelegentliche doppelte Nachricht
    // ist deutlich harmloser als eine, die nie ankommt.
    const response = await fetch(discordNotifyConfig.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      throw new Error("Discord-Proxy antwortete mit Status " + response.status);
    }

    const { error: writeError } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient
        .from("site_meta")
        .upsert({ id: "update_notice", last_sent_hash: currentHash, sent_at: new Date().toISOString() }, { onConflict: "id" })
    );
    if (writeError) throw writeError;
  } catch (err) {
    console.warn("Discord-Benachrichtigung konnte nicht gesendet werden:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Kurze Verzögerung, damit Firebase (firebase-config.js) und
  // Supabase (supabase-client.js) sicher fertig initialisiert sind,
  // bevor supabaseClient genutzt wird
  setTimeout(trySendDiscordUpdateNotice, 1500);
});
