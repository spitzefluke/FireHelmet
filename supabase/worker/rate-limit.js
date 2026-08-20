/* ======================================================
   EINFACHES RATE LIMITING (optional, KV-basiert)
   ---------------------------------------------------
   Ergaenzt (ersetzt NICHT) die serverseitigen Cooldowns, die
   bereits in firestore.rules erzwungen werden (z.B.
   SPIELOTHEK_COOLDOWN_MS) - hier geht es nur darum, dass niemand
   diesen Worker-Endpunkt direkt (ausserhalb der eigentlichen Seite)
   mit einem echten, aber missbraeuchlich oft wiederverwendeten
   Token flutet, um die Supabase-Statistiktabellen mit Muell zu
   fuellen. Echte Dublonen sind davon so oder so nie betroffen
   (siehe Kommentar in index.js).

   Braucht einen an den Worker gebundenen KV-Namespace namens
   "RATE_LIMIT_KV" (siehe wrangler.toml.example). Falls dieser
   NICHT konfiguriert ist, degradiert die Funktion bewusst zu
   "immer erlaubt" (kein harter Fehler) - Rate Limiting ist ein
   Haerte-Zusatz, kein Ersatz fuer die eigentliche Sicherheits-
   pruefung (Token-Verifikation + Datenbank-Constraints).

   Fuer hoehere Anforderungen: Cloudflare bietet zusaetzlich
   native "Rate Limiting Rules" auf Route-Ebene (Dashboard, ausserhalb
   von Code konfigurierbar) - empfehlenswert als zusaetzliche Schicht,
   siehe README.md.
====================================================== */

async function checkRateLimit(env, key, maxRequests, windowSeconds) {
  if (!env.RATE_LIMIT_KV) return true; // kein KV gebunden -> kein Hard-Fail

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / windowSeconds)}`;

  const currentRaw = await env.RATE_LIMIT_KV.get(windowKey);
  const current = currentRaw ? parseInt(currentRaw, 10) : 0;

  if (current >= maxRequests) return false;

  await env.RATE_LIMIT_KV.put(windowKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}

export { checkRateLimit };
