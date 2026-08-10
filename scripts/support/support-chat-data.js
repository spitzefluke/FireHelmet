/* ======================================================
   KI-SUPPORT-CHAT
   Adresse deines Cloudflare-Workers für den Support-Bot.
   Siehe discord-proxy/cloudflare-worker.js für die komplette
   Einrichtung (derselbe Worker wie für Discord, anderer Pfad).

   Leer lassen = der Bot nutzt automatisch die alte, einfache
   Stichwort-Suche (scripts/support/support-data.js) als
   Rückfalllösung, bis du die KI eingerichtet hast.
====================================================== */

const supportChatConfig = {
  proxyUrl: "https://webseiteadmin.spitzefluke.workers.dev/support-chat", // z.B. "https://streamraetsel-worker.deinname.workers.dev/support-chat"
};
