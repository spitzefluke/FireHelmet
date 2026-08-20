/* ======================================================
   FIREHELMET SUPABASE-PROXY-WORKER
   ---------------------------------------------------
   WICHTIG - GENAU WIE bei firestore.rules WIRD DIESE DATEI NICHT
   AUTOMATISCH DEPLOYT. Das ist eigenstaendiger Code fuer ein
   SEPARATES Cloudflare-Workers-Projekt (nicht Teil dieser
   statischen GitHub-Pages-Seite) - genau wie der bereits
   bestehende Discord-Notify-Worker
   (siehe scripts/core/discord-notify-data.js). Einrichtung:
   siehe supabase/worker/README.md.

   ZWECK:
   Nimmt vom Client (spielothek.js / community-boss.js) NACH einer
   bereits erfolgreich in Firestore geschriebenen, server-geprueften
   Runde/einem Angriff eine Kopie fuer Supabase-Statistiken entgegen.
   Schreibt NIEMALS irgendetwas in Firestore/Firebase - nur in
   Supabase. Die eigentliche, sicherheitskritische Gutschrift
   (Dublonen) bleibt vollstaendig in Firestore, unveraendert durch
   diesen Worker.

   SICHERHEITSMODELL (siehe Analyse-Bericht):
   - Jede Anfrage MUSS ein echtes Firebase-ID-Token mitbringen
     (Authorization: Bearer <token>) - wird hier serverseitig per
     Googles oeffentlichen Schluesseln verifiziert (siehe
     verify-firebase-token.js), OHNE Firebase Admin SDK.
   - Die firebase_uid fuer den Supabase-Eintrag kommt AUSSCHLIESSLICH
     aus der verifizierten Token-Payload (payload.sub), NIEMALS aus
     dem vom Client gesendeten JSON-Body - ein Client kann daher
     niemals im Namen eines fremden Accounts schreiben.
   - Zusaetzlich zur Signaturpruefung: dieselben Plausibilitaets-
     Obergrenzen wie in firestore.rules (payout <= 3000, damage <= 45)
     werden HIER NOCHMAL geprueft, bevor irgendetwas nach Supabase
     geschrieben wird (Verteidigung in der Tiefe) - zusaetzlich
     erzwingt auch die CHECK-Constraint direkt in der Datenbank
     dieselbe Grenze (siehe supabase/schema.sql), selbst falls dieser
     Code hier jemals einen Fehler haette.
   - Nur DIESER Worker besitzt den service_role-Key (als Cloudflare-
     Secret, siehe README) - der Browser sieht ihn nie.
====================================================== */

import { verifyFirebaseIdToken } from "./verify-firebase-token.js";
import { supabaseInsert } from "./supabase-rest.js";
import { checkRateLimit } from "./rate-limit.js";

const MONTH_ID_RE = /^\d{4}-\d{2}$/;

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

async function requireVerifiedUid(request, env) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Kein Authorization-Header (Bearer-Token fehlt)");
  const { uid } = await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
  return uid;
}

/* ------------------------------------------------------
   POST /spielothek-log
   Body: { gameId: string, betAmount: number, payoutAmount: number, won: boolean }
   Spiegelt EXAKT die bereits in firestore.rules durchgesetzte
   Obergrenze fuer die Spielothek (Slot-Jackpot = 3000, siehe
   validSpielothekCooldown()/currency <= oldCurrency + 3000).
------------------------------------------------------ */
async function handleSpielothekLog(request, env) {
  const uid = await requireVerifiedUid(request, env);

  const allowed = await checkRateLimit(env, `spielothek:${uid}`, 5, 60);
  if (!allowed) throw new Error("Zu viele Anfragen (Rate Limit)");

  const body = await request.json();
  const { gameId, betAmount, payoutAmount, won } = body || {};

  if (typeof gameId !== "string" || gameId.length < 1 || gameId.length > 50) {
    throw new Error("Ungueltige gameId");
  }
  if (!Number.isInteger(betAmount) || betAmount < 0 || betAmount > 3000) {
    throw new Error("Ungueltiger betAmount");
  }
  if (!Number.isInteger(payoutAmount) || payoutAmount < 0 || payoutAmount > 3000) {
    throw new Error("Ungueltiger payoutAmount");
  }
  if (typeof won !== "boolean") {
    throw new Error("Ungueltiges won-Feld");
  }

  await supabaseInsert(env, "spielothek_rounds", {
    firebase_uid: uid,
    game_id: gameId,
    bet_amount: betAmount,
    payout_amount: payoutAmount,
    won,
  });
}

/* ------------------------------------------------------
   POST /boss-attack-log
   Body: { nickname: string, monthId: string, damage: number }
   Spiegelt die Obergrenze aus community_boss_damage in
   firestore.rules (totalDamage <= oldNum('totalDamage') + 45).
------------------------------------------------------ */
async function handleBossAttackLog(request, env) {
  const uid = await requireVerifiedUid(request, env);

  const allowed = await checkRateLimit(env, `boss:${uid}`, 5, 60);
  if (!allowed) throw new Error("Zu viele Anfragen (Rate Limit)");

  const body = await request.json();
  const { nickname, monthId, damage } = body || {};

  if (typeof nickname !== "string" || nickname.length < 1 || nickname.length > 30) {
    throw new Error("Ungueltiger nickname");
  }
  if (typeof monthId !== "string" || !MONTH_ID_RE.test(monthId)) {
    throw new Error("Ungueltige monthId");
  }
  if (!Number.isInteger(damage) || damage < 0 || damage > 45) {
    throw new Error("Ungueltiger damage-Wert");
  }

  await supabaseInsert(env, "community_boss_attacks", {
    firebase_uid: uid,
    nickname,
    month_id: monthId,
    damage,
  });
}

const ROUTES = {
  "/spielothek-log": handleSpielothekLog,
  "/boss-attack-log": handleBossAttackLog,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const handler = ROUTES[url.pathname];
    if (!handler || request.method !== "POST") {
      return jsonResponse({ error: "not-found" }, 404, env);
    }

    try {
      await handler(request, env);
      return jsonResponse({ ok: true }, 200, env);
    } catch (err) {
      // Bewusst KEIN Stacktrace/interne Details an den Client -
      // nur eine kurze, generische Fehlermeldung. Details landen in
      // den Cloudflare-Worker-Logs (wrangler tail) fuer dich selbst.
      console.error("supabase-proxy-worker error:", err);
      const isAuthError = /Token|Bearer|kid|Signatur|Audience|Issuer/i.test(err.message || "");
      return jsonResponse({ error: isAuthError ? "unauthorized" : "bad-request" }, isAuthError ? 401 : 400, env);
    }
  },

  // Wird per Cloudflare Cron Trigger periodisch aufgerufen (siehe
  // wrangler.toml.example) - erzeugt Ranglisten-Snapshots. Liest dazu
  // NICHT Firestore direkt (der Worker hat keine Firebase-Admin-
  // Zugangsdaten) - siehe README.md fuer die empfohlene, einfache
  // Umsetzung (Admin loest das manuell/per separatem, bewusst
  // getrenntem Skript mit echten Firebase-Admin-Zugangsdaten aus).
  async scheduled(event, env, ctx) {
    console.log("Scheduled trigger fired - siehe supabase/worker/README.md fuer die Ranglisten-Snapshot-Einrichtung.");
  },
};
