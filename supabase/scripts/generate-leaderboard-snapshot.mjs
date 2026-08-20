#!/usr/bin/env node
/* ======================================================
   RANGLISTEN-SNAPSHOT ERZEUGEN (manuell/geplant AUSSERHALB
   des Cloudflare Workers auszufuehren)
   ---------------------------------------------------
   WARUM EIN SEPARATES SKRIPT UND NICHT TEIL DES WORKERS:
   Der Worker hat bewusst KEINE Firebase-Admin-Zugangsdaten (nur
   den oeffentlichen JWKS-Endpunkt zum TOKEN PRUEFEN, siehe
   verify-firebase-token.js) - fuer einen vollstaendigen READ ueber
   ALLE players/{uid}-Dokumente braucht es entweder einen
   authentifizierten Firestore-Zugriff (das ist bereits per Client-
   SDK moeglich, siehe wheel.js Zeile ~1464) oder das Firebase Admin
   SDK mit einem Service-Account-Schluessel. Letzteres NIEMALS in
   einem Worker/Client ablegen, der oeffentlich erreichbar ist -
   dieses Skript ist deshalb bewusst fuer die Ausfuehrung MIT DEINEN
   EIGENEN, LOKAL GEHALTENEN Zugangsdaten gedacht (dein Rechner /
   ein privates CI-Secret), NIEMALS im Cloudflare Worker oder im
   Browser.

   VORAUSSETZUNGEN:
     npm install firebase-admin @supabase/supabase-js
   Umgebungsvariablen (NIEMALS committen):
     GOOGLE_APPLICATION_CREDENTIALS = Pfad zu deinem Firebase-
       Service-Account-JSON (Firebase Console -> Projekteinstellungen
       -> Dienstkonten -> "Neuen privaten Schluessel generieren")
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

   AUSFUEHRUNG:
     node supabase/scripts/generate-leaderboard-snapshot.mjs --period=week
     node supabase/scripts/generate-leaderboard-snapshot.mjs --period=month

   Kann z.B. per GitHub Actions Cron-Workflow (in DEINEM Repo, mit
   den Secrets als encrypted GitHub Secrets) periodisch aufgerufen
   werden - das ist eine bewusste, spaetere Entscheidung und NICHT
   Teil dieser Analyse/Umsetzung, da es eine neue CI-Pipeline
   einfuehren wuerde (siehe Abschlussbericht, Punkt zu
   Environment-Variablen).

   Dieses Skript AENDERT NIEMALS Firestore-Daten (nur lesend) und
   LOESCHT NIEMALS bestehende Supabase-Zeilen.
====================================================== */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const periodArg = process.argv.find((a) => a.startsWith("--period="));
const periodType = periodArg ? periodArg.split("=")[1] : "week";
if (!["week", "month"].includes(periodType)) {
  console.error('Ungueltig: --period muss "week" oder "month" sein.');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen als Umgebungsvariablen gesetzt sein.");
  process.exit(1);
}

function currentPeriodKey(type) {
  const now = new Date();
  if (type === "month") {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // ISO-Wochennummer, gleiche Logik wie scripts/race/race.js getCurrentWeek()
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log(`Lese players/* aus Firestore fuer Snapshot-Periode "${periodType}" ...`);

  // EXAKT dieselbe Grundlage wie die bestehende Live-Rangliste
  // (siehe wheel.js renderLeaderboard(), Zeile ~1459-1475): kein
  // orderBy() (sonst fehlen Spieler ohne codesCracked-Feld), alle
  // Spieler mit Namen laden, rein nach codesCracked absteigend
  // sortieren - HIER read-only, keine Aenderung an der bestehenden
  // Logik oder der Anzeigereihenfolge.
  const snap = await db.collection("players").get();
  const players = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (!data.nickname) return;
    players.push({ uid: doc.id, codesCracked: 0, ...data });
  });

  players.sort((a, b) => (b.codesCracked || 0) - (a.codesCracked || 0));
  const top10 = players.slice(0, 10).map((p) => ({ uid: p.uid, nickname: p.nickname, score: p.codesCracked || 0 }));

  if (top10.length === 0) {
    console.log("Keine Spieler gefunden - kein Snapshot erzeugt.");
    return;
  }

  const periodKey = currentPeriodKey(periodType);
  const rows = top10.map((p, i) => ({
    period_type: periodType,
    period_key: periodKey,
    rank: i + 1,
    firebase_uid: p.uid,
    nickname: p.nickname,
    score: p.score,
  }));

  // upsert statt insert: falls das Skript fuer denselben Zeitraum
  // erneut laeuft (z.B. manueller Re-Run), wird der Snapshot
  // aktualisiert statt einen Unique-Index-Fehler zu werfen -
  // loescht dabei NICHTS aus fruaeheren Perioden.
  const { error } = await supabase
    .from("leaderboard_snapshots")
    .upsert(rows, { onConflict: "period_type,period_key,rank" });

  if (error) {
    console.error("Supabase-Upsert fehlgeschlagen:", error.message);
    process.exit(1);
  }

  console.log(`Snapshot fuer ${periodType} ${periodKey} geschrieben: ${rows.length} Eintraege.`);
}

main().catch((err) => {
  console.error("Fehler:", err);
  process.exit(1);
});
