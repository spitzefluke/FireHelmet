/* ======================================================
   DISCORD-BENACHRICHTIGUNG FÜR UPDATE-MITTEILUNGEN
   Sobald du den Text in scripts/core/update-notice-data.js
   änderst, wird automatisch eine Nachricht in deinen
   Discord-Kanal gesendet - wie ein kleiner Bot.

   WICHTIG ZUR SICHERHEIT: Hier steht NICHT dein echter
   Discord-Webhook-Link (der bleibt geheim in Cloudflare
   hinterlegt, siehe discord-proxy/cloudflare-worker.js für
   die Einrichtung). Hier trägst du nur die harmlose Worker-
   Adresse ein, die du nach dem Setup von Cloudflare bekommst.
====================================================== */

const discordNotifyConfig = {
  // Leer lassen = Funktion ist deaktiviert, bis du sie einträgst
  proxyUrl: "https://streamraetsel-discord-proxy.firehelmet.workers.dev", // z.B. "https://streamraetsel-discord-proxy.deinname.workers.dev"

  enabled: true,
};
