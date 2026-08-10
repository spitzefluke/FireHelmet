/* ======================================================
   DISCORD-BENACHRICHTIGUNG
   Sendet automatisch eine Nachricht über den (sicheren)
   Cloudflare-Proxy an Discord, sobald sich der Text in
   scripts/core/update-notice-data.js ändert - erkannt über
   dieselbe Prüfsumme wie beim Update-Popup.

   Damit die Nachricht nur EINMAL im Kanal landet (und nicht
   einmal pro Besucher), wird der zuletzt gesendete Stand in
   einem gemeinsamen Firestore-Dokument gemerkt (dieselbe
   Datenbank, die auch für die Rangliste genutzt wird). Ohne
   Firebase-Verbindung wird sicherheitshalber NICHTS gesendet,
   um Mehrfach-Nachrichten zu vermeiden.
====================================================== */

const DISCORD_NOTIFY_DOC_PATH = ["site_meta", "update_notice"];

async function trySendDiscordUpdateNotice() {
  if (typeof discordNotifyConfig === "undefined" || !discordNotifyConfig.enabled) return;
  if (!discordNotifyConfig.proxyUrl) return; // noch nicht eingerichtet
  if (typeof updateNoticeConfig === "undefined") return;
  if (typeof hashUpdateNoticeText !== "function") return;
  if (typeof wheelDb === "undefined" || !wheelDb) return; // keine gemeinsame DB -> lieber nichts senden
  if (typeof wheelAuthReady === "undefined") return;

  // WICHTIG: erst warten, bis die anonyme Firebase-Anmeldung wirklich
  // abgeschlossen ist - sonst lehnt Firestore den Zugriff ab
  // ("Missing or insufficient permissions"), weil request.auth noch
  // leer ist
  const uid = await wheelAuthReady;
  if (!uid) return;

  const currentHash = hashUpdateNoticeText(
    (updateNoticeConfig.title || "") + "||" + (updateNoticeConfig.message || "")
  );

  try {
    const docRef = wheelDb.collection(DISCORD_NOTIFY_DOC_PATH[0]).doc(DISCORD_NOTIFY_DOC_PATH[1]);
    const snap = await docRef.get();
    const lastSentHash = snap.exists ? snap.data().lastSentHash : null;

    if (lastSentHash === currentHash) return; // schon gesendet für diesen Textstand

    // Sofort als "gesendet" markieren, BEVOR der eigentliche Versand
    // passiert - so lösen nicht mehrere gleichzeitige Besucher
    // versehentlich mehrere Nachrichten aus
    await docRef.set({ lastSentHash: currentHash, sentAt: new Date().toISOString() });

    const content =
      `📢 **${updateNoticeConfig.title || "Update"}**\n${updateNoticeConfig.message || ""}`;

    await fetch(discordNotifyConfig.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.warn("Discord-Benachrichtigung konnte nicht gesendet werden:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Kurze Verzögerung, damit Firebase (firebase-config.js) sicher
  // fertig initialisiert ist, bevor wheelDb genutzt wird
  setTimeout(trySendDiscordUpdateNotice, 1500);
});
