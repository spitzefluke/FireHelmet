/* ======================================================
   PIRATENPASS-ENDBELOHNUNG: LIMITIERTE "FLITZPIEPEN"-CAP (9 STUECK)
   ---------------------------------------------------
   Baut auf 01-players-ship-progression.sql auf (app.firebase_uid()
   muss bereits existieren). Gleiches Architekturprinzip wie beim
   Turnier-Preis (07-tournament.sql): eine begrenzte, ECHTE
   physische Belohnung darf niemals ueber den normalen, clientseitig
   getriebenen Belohnungs-Pfad laufen (claimReward() in progression.js
   toleriert bei Dublonen/XP/Werkzeugen bewusst kleine Race-
   Conditions - "im schlimmsten Fall einmal zu oft vergeben, nie
   verloren" - das waere bei einem physischen Unikat nicht akzeptabel).
   Die Vergabe der Cap laeuft deshalb ausschliesslich ueber
   app.claim_pass_cap() unten (SECURITY DEFINER).

   Sobald alle 9 Caps vergeben sind, bekommt jede weitere Person, die
   Stufe 50 erreicht, stattdessen PASS_CAP_FALLBACK_CURRENCY Dublonen
   (500 - siehe Konstante unten UND PASS_CAP_FALLBACK_CURRENCY in
   scripts/core/progression-data.js, dort nur fuer Anzeigetexte, hier
   die tatsaechlich massgebliche Zahl).
====================================================== */

/* ------------------------------------------------------
   TABELLE: pass_cap_state
   ---------------------------------------------------
   Genau EINE Zeile ('cap'), "granted" zaehlt die bereits vergebenen
   Caps hoch. Die Grenze von 9 ist NICHT allein die CHECK-Constraint
   (die verhindert nur einen ungueltigen Endzustand), sondern das
   atomare "UPDATE ... WHERE granted < 9 ... RETURNING" in
   app.claim_pass_cap() weiter unten - Postgres serialisiert
   konkurrierende UPDATEs auf dieselbe Zeile automatisch (Row-Lock),
   zwei gleichzeitige Anfragen koennen strukturell nie beide dieselbe,
   letzte Cap gewinnen.
------------------------------------------------------ */
create table public.pass_cap_state (
  id text primary key default 'cap',
  granted integer not null default 0,

  constraint pass_cap_state_id_fixed check (id = 'cap'),
  constraint pass_cap_state_granted_range check (granted >= 0 and granted <= 9)
);

insert into public.pass_cap_state (id, granted) values ('cap', 0);

alter table public.pass_cap_state enable row level security;
alter table public.pass_cap_state force row level security;

create policy "pass_cap_state_select_public" on public.pass_cap_state
  for select to anon, authenticated using (true);

-- Keine insert-/update-/delete-Policy fuer anon/authenticated: die
-- einzige Schreibstelle ist app.claim_pass_cap() unten.


/* ------------------------------------------------------
   TABELLE: pass_cap_grants
   ---------------------------------------------------
   Oeffentlich lesbare Liste der (hoechstens 9) tatsaechlichen Cap-
   Gewinner:innen - EINZIGE Quelle fuer das Cap-Abzeichen auf dem
   Avatar (Rangliste, Spielerkarte, Boss-Rangliste, siehe
   fetchPassCapWinnerUids() in wheel.js). Bewusst eine eigene Tabelle
   statt eines zusaetzlichen Feldes auf "players": so bleibt "wer hat
   wirklich eine Cap" an genau einer Stelle mit genau einem
   Schreibpfad, ohne ein zweites, oeffentlich sichtbares Feld auf
   players absichern zu muessen. unique(firebase_uid) verhindert
   zusaetzlich einen theoretischen Doppel-Eintrag.
------------------------------------------------------ */
create table public.pass_cap_grants (
  id bigint generated always as identity primary key,
  firebase_uid text not null unique,
  nickname text not null,
  pass_id text not null,
  claimed_at timestamptz not null default now(),

  constraint pass_cap_grants_nickname_len check (char_length(nickname) between 1 and 30)
);

alter table public.pass_cap_grants enable row level security;
alter table public.pass_cap_grants force row level security;

create policy "pass_cap_grants_select_public" on public.pass_cap_grants
  for select to anon, authenticated using (true);

-- Keine insert-/update-/delete-Policy fuer anon/authenticated: die
-- einzige Schreibstelle ist app.claim_pass_cap() unten.


/* ------------------------------------------------------
   HAERTUNG: player_progression.has_flitzpiepen_cap wird client-
   seitig vollstaendig unveraenderlich (weder false->true noch
   true->false ueber einen normalen .update()-Aufruf). Die bisherige
   Fassung in 01-players-ship-progression.sql erlaubte false->true
   durch den Client selbst (nur true->false war gesperrt) - harmlos,
   solange das Feld rein privat war (nur der/die Spieler:in selbst
   liest es), aber jetzt, wo das oeffentliche Cap-Abzeichen exklusiv
   aus pass_cap_grants kommt, soll auch die private Anzeige in
   piratenpass.js nicht durch eine Selbst-Faelschung verwirrt werden
   koennen. Einzige verbleibende Schreibstelle: app.claim_pass_cap().
------------------------------------------------------ */
create or replace function app.valid_progression_write(p_uid text, new_row public.player_progression) returns boolean
language plpgsql stable
as $$
declare
  old_row public.player_progression := app.old_progression(p_uid);
  old_xp integer := coalesce(old_row.xp, 0);
  old_pass_id text := old_row.pass_id;
  old_pass_xp integer := coalesce(old_row.pass_xp, 0);
  old_claimed_count integer := coalesce(array_length(old_row.claimed_reward_ids,1), 0);
  new_claimed_count integer := coalesce(array_length(new_row.claimed_reward_ids,1), 0);
begin
  return new_row.xp <= old_xp + 500
    and (new_row.pass_id != old_pass_id or new_row.pass_xp <= old_pass_xp + 500)
    and new_claimed_count >= old_claimed_count
    and new_claimed_count <= old_claimed_count + 1
    and new_row.has_flitzpiepen_cap = coalesce(old_row.has_flitzpiepen_cap, false);
end;
$$;


/* ------------------------------------------------------
   app.claim_pass_cap(): einzige Schreibstelle fuer alles oben
   ---------------------------------------------------
   Wird NUR aus claimReward() (progression.js) beim Einloesen der
   Stufe-50-Endbelohnung aufgerufen, ANSTELLE des generischen,
   clientseitig getriebenen Pfads (siehe Kommentar am Dateikopf).
   claimed_reward_ids wird bewusst NICHT hier, sondern weiterhin ganz
   normal client-seitig in player_progression geschrieben (wie bei
   jeder anderen Stufe auch) - das ist rein die "hab ich diese Stufe
   schon abgeholt"-Buchhaltung, unabhaengig davon, ob die Cap-Vergabe
   dabei glueckte oder in den Dublonen-Fallback lief.
------------------------------------------------------ */
create or replace function app.claim_pass_cap(p_pass_id text)
returns table(got_cap boolean, currency_awarded integer)
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  caller_uid text := auth.uid()::text;
  nick text;
  prog public.player_progression;
  new_granted integer;
  fallback_amount constant integer := 500;
begin
  if caller_uid is null then
    raise exception 'not-signed-in';
  end if;

  select * into prog from public.player_progression where firebase_uid = caller_uid for update;
  if not found then
    raise exception 'no-progression-row';
  end if;
  if prog.has_flitzpiepen_cap then
    raise exception 'already-has-cap';
  end if;

  select nickname into nick from public.players where firebase_uid = caller_uid;
  if nick is null or char_length(nick) < 1 then
    raise exception 'no-player-row';
  end if;

  update public.pass_cap_state
    set granted = granted + 1
    where id = 'cap' and granted < 9
    returning granted into new_granted;

  if found then
    insert into public.pass_cap_grants (firebase_uid, nickname, pass_id)
      values (caller_uid, nick, p_pass_id)
      on conflict (firebase_uid) do nothing;

    update public.player_progression set has_flitzpiepen_cap = true where firebase_uid = caller_uid;
    update public.players
      set rewards = case when 'Flitzpiepen-Cap 🧢' = any(rewards) then rewards
                         else array_append(rewards, 'Flitzpiepen-Cap 🧢') end
      where firebase_uid = caller_uid;

    return query select true, 0;
  else
    update public.players
      set currency = currency + fallback_amount,
          total_currency_earned = total_currency_earned + fallback_amount
      where firebase_uid = caller_uid;

    return query select false, fallback_amount;
  end if;
end;
$$;

create or replace function public.claim_pass_cap(p_pass_id text)
returns table(got_cap boolean, currency_awarded integer)
language sql
as $$ select * from app.claim_pass_cap(p_pass_id) $$;

grant execute on function app.claim_pass_cap(text) to authenticated;
grant execute on function public.claim_pass_cap(text) to authenticated;
