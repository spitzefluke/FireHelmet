/* ======================================================
   PIRATENPASS-CAP: GRENZE VON 9 AUF 4
   ---------------------------------------------------
   08-pass-cap.sql ist bereits auf 4 geaendert - das gilt aber nur
   fuer eine frische Installation. Die Datei legt die Tabelle mit
   "create table" ohne "if not exists" an und laesst sich deshalb
   nicht noch einmal ausfuehren.

   Diese Datei aendert eine BESTEHENDE Datenbank. Sie ist beliebig
   oft einspielbar.

   ZWEI STELLEN, NICHT EINE
   Die CHECK-Constraint verhindert nur einen ungueltigen Endzustand.
   Die eigentliche Grenze ist das "where granted < N" im atomaren
   UPDATE - dort serialisiert Postgres konkurrierende Anfragen ueber
   den Zeilen-Lock, und nur dadurch kann die letzte Cap strukturell
   nie zweimal vergeben werden. Beide muessen zusammenpassen.

   WENN SCHON MEHR ALS VIER VERGEBEN SIND
   Dann bricht das Setzen der Constraint ab, und zwar mit Absicht:
   die vergebenen Caps sind echte, physische Zusagen. Der Block
   unten sagt in dem Fall klar, wie viele es sind, statt eine
   kryptische Constraint-Meldung zu werfen. Bereits vergebene Caps
   werden NICHT zurueckgenommen - das waere ein gebrochenes
   Versprechen.
====================================================== */

do $$
declare
  bereits integer;
begin
  select granted into bereits from public.pass_cap_state where id = 'cap';
  if bereits is null then
    raise notice 'pass_cap_state hat keine Zeile "cap" - 08-pass-cap.sql zuerst einspielen.';
    return;
  end if;
  if bereits > 4 then
    raise exception 'Es sind bereits % Caps vergeben - die Grenze laesst sich nicht auf 4 senken, ohne eine Zusage zu brechen.', bereits;
  end if;

  alter table public.pass_cap_state
    drop constraint if exists pass_cap_state_granted_range;
  alter table public.pass_cap_state
    add constraint pass_cap_state_granted_range check (granted >= 0 and granted <= 4);

  raise notice 'Cap-Grenze auf 4 gesetzt (bisher vergeben: %).', bereits;
end;
$$;

/* Die eigentliche Grenze: dasselbe wie in 08-pass-cap.sql, nur mit
   4 statt 9. Unveraendert uebernommen, damit hier keine zweite,
   abweichende Fassung der Vergabelogik entsteht. */
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
    where id = 'cap' and granted < 4
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

/* ANZEIGE IM BROWSER
   PASS_CAP_TOTAL_SLOTS in scripts/core/progression-data.js steht
   ebenfalls auf 4. Diese Zahl ist reiner Anzeigetext ("Nur 4 echte
   Caps gibt es weltweit") - massgeblich ist allein das "granted < 4"
   oben. Stuenden sie auseinander, waere die Anzeige falsch, die
   Vergabe aber weiterhin richtig. */
