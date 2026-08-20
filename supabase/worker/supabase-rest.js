/* ======================================================
   MINIMALER SUPABASE-REST-CLIENT FUER DEN WORKER
   ---------------------------------------------------
   Bewusst OHNE das supabase-js-Paket (das ist fuer Node/Browser
   gedacht, in einem Cloudflare Worker reicht ein einfacher REST-
   Aufruf gegen PostgREST - weniger Abhaengigkeiten, kleinere
   Bundle-Groesse). Nutzt IMMER den service_role-Key (siehe
   env.SUPABASE_SERVICE_ROLE_KEY in wrangler) - der umgeht laut
   Supabase-Doku ausdruecklich Row Level Security, das ist hier
   beabsichtigt: NUR der Worker (nach erfolgreicher Firebase-Token-
   Pruefung) darf ueberhaupt in diese Tabellen schreiben, siehe
   supabase/schema.sql (keine insert-Policy fuer anon/authenticated).
====================================================== */

async function supabaseInsert(env, table, row) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase-Insert in "${table}" fehlgeschlagen: HTTP ${res.status} ${text}`);
  }
}

export { supabaseInsert };
