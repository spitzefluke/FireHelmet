/* ======================================================
   XP-CODES: DER SERVER ENTSCHEIDET, WIE VIEL UND WIE OFT
   ---------------------------------------------------
   WAS VORHER OFFEN WAR
   Die fuenf Pass-XP-Codes (kompass, seekarte, nordstern, kraken,
   goldrausch) wurden rein im Browser verrechnet: dort stand, wie
   viele Punkte es gibt, und dort stand auch, ob ein Code schon
   eingeloest war (crackedCodes in localStorage). Beides liess
   sich umgehen - Speicher leeren, Code erneut eintippen, noch
   einmal Punkte. Und wer die Konsole aufmachte, konnte statt der
   50 eines kleinen Codes auch 500 schreiben.

   WAS DIESE MIGRATION AENDERT
   1. WIE VIEL steht jetzt in der Datenbank, nicht im Browser.
      Die RPC bekommt nur den eingetippten Code, schlaegt den
      Betrag selbst nach und vergibt genau den. Ein Argument
      "so viele Punkte bitte" gibt es bewusst nicht.
   2. WIE OFT entscheidet eine Tabelle, nicht localStorage. Jeder
      Code zaehlt je Konto genau einmal; der zweite Versuch gibt
      0 zurueck und schreibt nichts.
   3. Der Code selbst steht hier NICHT im Klartext, sondern als
      SHA-256 - genauso wie in scripts/codes/codes-data.js und
      wie bei den Boss-Codes in 17-boss-code-schutz.sql.

   WICHTIG ZUR SCHREIBWEISE
   Der Browser normalisiert die Eingabe mit trim().toLowerCase()
   (checkCode() in scripts/core/main.js), und die Hashes in
   codes-data.js sind von der KLEIN geschriebenen Fassung.
   Deshalb hier lower(btrim(...)) - und nicht upper() wie bei den
   Boss-Codes in 10/17, die ihre Hashes anders gebildet haben.
   Wer das verwechselt, bekommt eine Funktion, die jeden Code fuer
   unbekannt haelt.

   DER DECKEL GILT HIER NICHT MEHR
   app.valid_progression_write() laesst je Schreibvorgang nur +500
   auf pass_xp zu. Diese RPC laeuft als SECURITY DEFINER und
   umgeht die RLS-Pruefung - der Betrag kommt ja aus der Datenbank
   selbst und nicht vom Browser. Groessere Codes als 500 waeren
   damit moeglich; die Obergrenze steht jetzt im CHECK weiter
   unten und nicht mehr in einer RLS-Regel.

   REIHENFOLGE: nach 18-konto-loeschen.sql einspielen.
   Setzt pgcrypto im Schema extensions voraus (wie 10 und 17).
====================================================== */


/* ======================================================
   1. WELCHER CODE GIBT WIE VIEL
====================================================== */
create table if not exists public.xp_codes (
  code_sha256  text primary key,
  punkte       integer not null,
  bezeichnung  text,
  angelegt_am  timestamptz not null default now(),

  /* 5000 ist grosszuegig gewaehlt und nur ein Schutz gegen den
     vertippten Nuller. Der fachliche Rahmen sind die Stufen des
     Passes: Stufe N braucht N*(N+1)*50 Punkte. */
  constraint xp_codes_punkte_sinnvoll check (punkte between 1 and 5000)
);

alter table public.xp_codes enable row level security;
alter table public.xp_codes force row level security;

/* Keine Lesepolicy: NIEMAND ausser der SECURITY-DEFINER-Funktion
   darf in diese Tabelle schauen. Sonst koennte man sich die Liste
   der Hashes holen und sie offline durchprobieren. */

comment on table public.xp_codes is
  'Hash -> Punktebetrag der Pass-XP-Codes. Absichtlich ohne '
  'Lesepolicy: nur app.xp_code_einloesen() greift darauf zu.';


/* Die fuenf Codes aus scripts/codes/codes-data.js.
   Die Klartexte stehen hier bewusst NICHT - wer sie braucht,
   findet sie im Kommentar der JS-Datei. Geaendert wird ein Betrag
   ueber ein update auf diese Tabelle, nicht ueber eine neue
   Migration. */
insert into public.xp_codes (code_sha256, punkte, bezeichnung) values
  ('36bf7bd612005654bbeb6c6fc93ae8a9e1a1444916b748764acadbd798c96c76',  50, 'kompass'),
  ('03e47b55eb59a0d75804d2bcb69487d2376d57a4c1e30113efba8977267ef598', 100, 'seekarte'),
  ('683ec9b4c215b8391f2749b55d645adcea53cf5c571a28d923a18078927d1097', 200, 'nordstern'),
  ('686d22d695e2c21166a89498a3a3f198e8d4ad8b09190bd1d86e350a79597341', 350, 'kraken'),
  ('0ed2df1bb528a1feb743379a90fa33c50d8b2476cd29796399580aa3bc03b66e', 500, 'goldrausch')
on conflict (code_sha256) do update
  set punkte = excluded.punkte,
      bezeichnung = excluded.bezeichnung;


/* ======================================================
   2. WER HAT WAS SCHON EINGELOEST
====================================================== */
create table if not exists public.xp_code_einloesungen (
  firebase_uid  text not null,
  code_sha256   text not null references public.xp_codes(code_sha256) on delete cascade,
  eingeloest_am timestamptz not null default now(),

  primary key (firebase_uid, code_sha256)
);

alter table public.xp_code_einloesungen enable row level security;
alter table public.xp_code_einloesungen force row level security;

/* Lesen darf man die EIGENEN Einloesungen - damit die Oberflaeche
   spaeter einmal anzeigen koennte, was schon geholt wurde.
   Schreiben darf hier niemand direkt; das macht nur die Funktion. */
create policy "xp_einloesungen_select_own" on public.xp_code_einloesungen
  for select to authenticated using (firebase_uid = app.firebase_uid());


/* ======================================================
   3. DAS EINLOESEN
   ---------------------------------------------------
   Rueckgabe:
     > 0  so viele Punkte wurden gutgeschrieben
       0  dieser Code wurde von diesem Konto schon eingeloest
      -1  kein XP-Code (der Browser kennt ihn, die Datenbank nicht)

   Eine Zahl statt einer Ausnahme, weil alle drei Faelle normal
   sind und der Browser sie unterscheiden koennen muss.
====================================================== */
create or replace function app.xp_code_einloesen(p_code text, p_pass_id text) returns integer
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  hash   text;
  betrag integer;
  neu    boolean;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_code is null or char_length(p_code) < 2 or char_length(p_code) > 64 then
    return -1;
  end if;

  /* lower(), nicht upper() - siehe der Hinweis zur Schreibweise
     ganz oben. Muss zu trim().toLowerCase() im Browser passen. */
  hash := encode(extensions.digest(lower(btrim(p_code)), 'sha256'), 'hex');

  select punkte into betrag from public.xp_codes where code_sha256 = hash;
  if betrag is null then
    return -1;
  end if;

  /* Die Sperre. on conflict do nothing statt einer vorherigen
     Abfrage: zwei gleichzeitige Versuche desselben Kontos wuerden
     sonst beide "noch nicht eingeloest" sehen und beide gutschreiben.
     So entscheidet der Primaerschluessel, und zwar genau einmal. */
  insert into public.xp_code_einloesungen (firebase_uid, code_sha256)
       values (uid, hash)
  on conflict (firebase_uid, code_sha256) do nothing;

  get diagnostics neu = row_count;
  if not neu then
    return 0;
  end if;

  /* Die Zeile kann fehlen, wenn jemand den Code einloest, bevor
     er sonst irgendetwas getan hat. */
  insert into public.player_progression (firebase_uid, xp, pass_id, pass_xp)
       values (uid, 0, p_pass_id, betrag)
  on conflict (firebase_uid) do update
     set pass_id = p_pass_id,
         /* Laeuft schon dieselbe Saison, wird addiert. Ist es eine
            andere (oder noch keine), faengt der Pass bei diesem
            Betrag an - genauso wie awardActionXp() es im Browser
            macht. */
         pass_xp = case when public.player_progression.pass_id is not distinct from p_pass_id
                        then coalesce(public.player_progression.pass_xp, 0) + betrag
                        else betrag end;

  return betrag;
end
$$;

/* Auch der Wrapper ist security definer - das Schema app hat kein
   USAGE-Recht fuer authenticated, ein Wrapper als Aufrufer scheiterte
   schon am Betreten des Schemas. Dieselbe Begruendung wie bei
   public.mein_konto_loeschen() in 18. */
create or replace function public.xp_code_einloesen(p_code text, p_pass_id text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.xp_code_einloesen(p_code, p_pass_id) $$;

grant execute on function public.xp_code_einloesen(text, text) to authenticated;

comment on function public.xp_code_einloesen(text, text) is
  'Loest einen Pass-XP-Code ein. Der Betrag kommt aus public.xp_codes, '
  'nicht vom Aufrufer. Je Konto und Code genau einmal. '
  '>0 = gutgeschrieben, 0 = schon eingeloest, -1 = kein XP-Code.';
