/* ======================================================
   DISCORD-BENACHRICHTIGUNG FÜR UPDATE-MITTEILUNGEN
   Sobald du den Text in scripts/core/update-notice-data.js
   änderst, wird automatisch eine Nachricht in deinen
   Discord-Kanal gesendet - wie ein kleiner Bot.

   WICHTIG ZUR SICHERHEIT: Hier steht NICHT dein echter
   Discord-Webhook-Link (der bleibt geheim in Cloudflare
   hinterlegt, siehe discord-proxy/cloudflare-worker.js für
   die Einrichtung). Hier trägst du nur die harmlose Worker-
   Adresse ein, die du nach dem Setup von Cloudflare bekommst -
   und zwar mit dem Zusatz "/discord-notify" am Ende (der Worker
   kümmert sich jetzt auch um den KI-Support-Chat und muss
   deshalb wissen, welche der beiden Aufgaben gemeint ist).
====================================================== */

const discordNotifyConfig = {
  // Leer lassen = Funktion ist deaktiviert, bis du sie einträgst
  proxyUrl: "https://webseiteadmin.spitzefluke.workers.dev/discord-notify", // z.B. "https://streamraetsel-worker.deinname.workers.dev/discord-notify"

  enabled: true,
};
