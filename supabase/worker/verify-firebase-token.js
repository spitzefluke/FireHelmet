/* ======================================================
   FIREBASE-ID-TOKEN OHNE ADMIN-SDK VERIFIZIEREN
   ---------------------------------------------------
   Laeuft in einem Cloudflare Worker (Standard-WebCrypto-API,
   funktioniert identisch auch unter Node.js >= 19 - genau
   deshalb kann diese Datei unveraendert per Node gegen ein
   lokal erzeugtes Test-Token geprueft werden, siehe
   supabase/worker/verify-firebase-token.test.mjs).

   Verfahren entspricht der offiziellen Firebase-Doku fuer
   Umgebungen ohne Admin-SDK ("Verify ID tokens using a
   third-party JWT library"):
   https://firebase.google.com/docs/auth/admin/verify-id-tokens
   #verify_id_tokens_using_a_third-party_jwt_library

   1. JWT-Header lesen, "kid" (Key-ID) entnehmen
   2. Googles oeffentliche Schluessel abrufen (JWK-Format),
      passenden Schluessel per "kid" auswaehlen, per HTTP-
      Cache-Control zwischenspeichern (Google gibt das selbst
      vor, kein eigenes Rate-Limiting noetig)
   3. Signatur ueber "header.payload" mit diesem OEFFENTLICHEN
      Schluessel pruefen (RS256) - KEIN Geheimnis noetig, ein
      Client kann ein echtes Firebase-Token also nicht faelschen
   4. Standard-Claims pruefen: iss, aud (== eigene Firebase-
      Projekt-ID), exp (nicht abgelaufen), iat (nicht in der
      Zukunft), sub (nicht leer) - exakt wie die Firebase-Doku
      es vorschreibt.

   Bei Erfolg: gibt die verifizierten Claims zurueck (insbesondere
   "sub" == die echte, geprueft-eigene Firebase-UID). Bei jedem
   Fehler: wirft einen Error - der Aufrufer MUSS das als "nicht
   authentifiziert" behandeln, niemals eine UID aus dem
   Request-Body selbst vertrauen.
====================================================== */

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedJwks = null;
let cachedJwksExpiresAt = 0;

function base64UrlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson(base64url) {
  const bytes = base64UrlToUint8Array(base64url);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchFirebaseJwks() {
  const now = Date.now();
  if (cachedJwks && now < cachedJwksExpiresAt) return cachedJwks;

  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) {
    throw new Error("Konnte Firebase-JWKS nicht laden: HTTP " + res.status);
  }
  const body = await res.json();

  // Google gibt per Cache-Control vor, wie lange die Schluessel
  // gueltig sind (typischerweise mehrere Stunden) - das respektieren
  // wir, statt bei jedem Request neu zu laden.
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;

  cachedJwks = body.keys || [];
  cachedJwksExpiresAt = now + Math.min(maxAgeMs, 6 * 3600000);
  return cachedJwks;
}

async function importRsaPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Verifiziert ein Firebase-ID-Token vollstaendig serverseitig.
 * @param {string} idToken - das rohe JWT aus dem Authorization-Header
 * @param {string} expectedProjectId - z.B. "firehelmet-60558"
 * @param {{fetchJwks?: () => Promise<Array>}} [overrides] - NUR fuer
 *   Tests: erlaubt, die JWKS-Quelle zu stubben, ohne echtes Netzwerk.
 * @returns {Promise<{uid: string, claims: object}>}
 */
async function verifyFirebaseIdToken(idToken, expectedProjectId, overrides = {}) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Kein Token uebergeben");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Ungueltiges Token-Format (kein JWT)");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = base64UrlToJson(headerB64);
  const payload = base64UrlToJson(payloadB64);

  if (header.alg !== "RS256") {
    throw new Error("Unerwarteter Algorithmus: " + header.alg);
  }
  if (!header.kid) {
    throw new Error("Token hat keine Key-ID (kid)");
  }

  const jwks = overrides.fetchJwks
    ? await overrides.fetchJwks()
    : await fetchFirebaseJwks();

  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error("Kein passender oeffentlicher Schluessel fuer kid=" + header.kid);
  }

  const publicKey = await importRsaPublicKey(jwk);

  const signedData = new TextEncoder().encode(headerB64 + "." + payloadB64);
  const signature = base64UrlToUint8Array(signatureB64);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    signedData
  );
  if (!valid) {
    throw new Error("Signaturpruefung fehlgeschlagen");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_SEC = 60;

  if (typeof payload.exp !== "number" || payload.exp < nowSec - CLOCK_SKEW_SEC) {
    throw new Error("Token ist abgelaufen");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + CLOCK_SKEW_SEC) {
    throw new Error("Token liegt in der Zukunft (iat)");
  }
  if (payload.aud !== expectedProjectId) {
    throw new Error("Falsche Audience (aud): " + payload.aud);
  }
  if (payload.iss !== "https://securetoken.google.com/" + expectedProjectId) {
    throw new Error("Falscher Issuer (iss): " + payload.iss);
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token hat keine gueltige sub-Claim (UID)");
  }

  return { uid: payload.sub, claims: payload };
}

export { verifyFirebaseIdToken, base64UrlToJson, base64UrlToUint8Array };
