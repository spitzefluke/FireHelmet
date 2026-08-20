// Testet verify-firebase-token.js OHNE echtes Netzwerk: erzeugt ein
// eigenes RSA-Schluesselpaar, baut ein Firebase-foermiges JWT damit
// selbst, und stubbt die JWKS-Quelle auf den eigenen oeffentlichen
// Schluessel. Node >= 19 hat dieselbe WebCrypto-API wie Cloudflare
// Workers (globalThis.crypto.subtle) - dieselbe Datei laeuft
// unveraendert in beiden Umgebungen.

import { verifyFirebaseIdToken } from "./verify-firebase-token.js";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS" : "FAIL") + " - " + name + (detail ? ` (${detail})` : ""));
}

const PROJECT_ID = "firehelmet-60558";

function base64UrlEncode(bytesOrString) {
  const bytes = typeof bytesOrString === "string" ? new TextEncoder().encode(bytesOrString) : bytesOrString;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

async function signJwt(privateKey, header, payload) {
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(headerB64 + "." + payloadB64);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signingInput);
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

const { publicKey, privateKey } = await generateKeyPair();
const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
publicJwk.kid = "test-kid-1";
publicJwk.alg = "RS256";
publicJwk.use = "sig";

const stubFetchJwks = async () => [publicJwk];

const nowSec = Math.floor(Date.now() / 1000);
function validPayload(overrides = {}) {
  return {
    iss: "https://securetoken.google.com/" + PROJECT_ID,
    aud: PROJECT_ID,
    sub: "F0mS5vnIeRgrKawPy3iZBTk9lq33",
    iat: nowSec - 10,
    exp: nowSec + 3600,
    ...overrides,
  };
}

/* ===== TEST 1: gueltiges Token wird akzeptiert, UID korrekt extrahiert ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload());
  try {
    const result = await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST1: gueltiges Token wird akzeptiert, uid korrekt", result.uid === "F0mS5vnIeRgrKawPy3iZBTk9lq33");
  } catch (err) {
    check("TEST1: gueltiges Token wird akzeptiert, uid korrekt", false, err.message);
  }
}

/* ===== TEST 2: manipulierte Payload (fremde UID nachtraeglich eingesetzt,
   OHNE die Signatur neu zu berechnen - simuliert einen Angreifer, der
   ein fremdes Token abfaengt und die UID im Payload aendert) wird
   abgelehnt ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload());
  const [h, p, s] = token.split(".");
  const tamperedPayload = base64UrlEncode(JSON.stringify(validPayload({ sub: "FREMDE-UID-VOM-ANGREIFER" })));
  const tamperedToken = `${h}.${tamperedPayload}.${s}`;
  try {
    await verifyFirebaseIdToken(tamperedToken, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST2: manipulierte Payload (fremde UID) wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST2: manipulierte Payload (fremde UID) wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 3: abgelaufenes Token wird abgelehnt ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload({ exp: nowSec - 7200, iat: nowSec - 10800 }));
  try {
    await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST3: abgelaufenes Token wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST3: abgelaufenes Token wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 4: falsche Audience (Token fuer ein ANDERES Firebase-Projekt)
   wird abgelehnt ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload({ aud: "irgendein-anderes-projekt" }));
  try {
    await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST4: falsche Audience wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST4: falsche Audience wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 5: falscher Issuer wird abgelehnt ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload({ iss: "https://securetoken.google.com/boeses-projekt" }));
  try {
    await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST5: falscher Issuer wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST5: falscher Issuer wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 6: Token, das mit einem ANDEREN (nicht in der JWKS
   registrierten) privaten Schluessel signiert wurde (simuliert einen
   selbstgebastelten, kompletten Faelschungsversuch), wird abgelehnt ===== */
{
  const { privateKey: attackerKey } = await generateKeyPair();
  const token = await signJwt(attackerKey, { alg: "RS256", kid: "test-kid-1", typ: "JWT" }, validPayload());
  try {
    await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST6: mit fremdem Schluessel signiertes Faelschungs-Token wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST6: mit fremdem Schluessel signiertes Faelschungs-Token wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 7: unbekannte kid (kein passender Schluessel in der JWKS)
   wird abgelehnt ===== */
{
  const token = await signJwt(privateKey, { alg: "RS256", kid: "unbekannte-kid", typ: "JWT" }, validPayload());
  try {
    await verifyFirebaseIdToken(token, PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST7: unbekannte kid wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST7: unbekannte kid wird abgelehnt", true, err.message);
  }
}

/* ===== TEST 8: kaputtes/kein JWT (z.B. leerer String, Nicht-JWT-Text) ===== */
{
  try {
    await verifyFirebaseIdToken("kein.jwt", PROJECT_ID, { fetchJwks: stubFetchJwks });
    check("TEST8: kaputtes Token-Format wird abgelehnt", false, "wurde faelschlich akzeptiert!");
  } catch (err) {
    check("TEST8: kaputtes Token-Format wird abgelehnt", true, err.message);
  }
}

console.log("\n=== SUMMARY: " + results.filter((r) => r.ok).length + "/" + results.length + " passed ===");
if (results.some((r) => !r.ok)) process.exit(1);
