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
    console.log("[DEBUG discord-notify @" + performance.now().toFixed(0) + "ms] vor SELECT, uid=" + uid);
    const { data, error: readError } = await supabaseClient
      .from("site_meta")
      .select("last_sent_hash")
      .eq("id", "update_notice")
      .maybeSingle();
    console.log("[DEBUG discord-notify @" + performance.now().toFixed(0) + "ms] SELECT fertig, readError=" + (readError ? JSON.stringify(readError) : "null"));
    if (readError) throw readError;

    const lastSentHash = data ? data.last_sent_hash : null;
    if (lastSentHash === currentHash) return; // schon gesendet für diesen Textstand

    // Sofort als "gesendet" markieren, BEVOR der eigentliche Versand
    // passiert - so lösen nicht mehrere gleichzeitige Besucher
    // versehentlich mehrere Nachrichten aus
    console.log("[DEBUG discord-notify @" + performance.now().toFixed(0) + "ms] vor UPSERT");
    const { error: writeError } = await supabaseClient
      .from("site_meta")
      .upsert({ id: "update_notice", last_sent_hash: currentHash, sent_at: new Date().toISOString() }, { onConflict: "id" });
    console.log("[DEBUG discord-notify @" + performance.now().toFixed(0) + "ms] UPSERT fertig, writeError=" + (writeError ? JSON.stringify(writeError) : "null"));
    if (writeError) throw writeError;

    const content =
      `📢 **${updateNoticeConfig.title || "Update"}**\n${updateNoticeConfig.message || ""}`;

    await fetch(discordNotifyConfig.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.log("[DEBUG discord-notify] FEHLER komplett:", JSON.stringify(err), err);
    console.warn("Discord-Benachrichtigung konnte nicht gesendet werden:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Kurze Verzögerung, damit Firebase (firebase-config.js) und
  // Supabase (supabase-client.js) sicher fertig initialisiert sind,
  // bevor supabaseClient genutzt wird
  setTimeout(trySendDiscordUpdateNotice, 1500);
});
