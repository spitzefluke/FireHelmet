/* ======================================================
   PRUEFUNG ZU 19-xp-codes.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 19 eingespielt wurde.
   Alles laeuft in einer Transaktion und wird am Ende
   zurueckgerollt - es bleibt nichts stehen.

   Geprueft wird vor allem, was NICHT passieren darf: ein Code
   zweimal, ein erfundener Code, und ein Betrag, den der Aufrufer
   sich selbst aussucht.

   Erwartet: zehn Zeilen, alle "PASS".
====================================================== */
begin;

/* Huelle wie in 18: die Rolle wird NUR hier drin gewechselt.
   Ob eine Zeile hinterher steht, ist eine Tatsache ueber die
   Tabelle - keine Frage danach, was ein Client sehen darf. */
create or replace function pg_temp.loese(p_code text) returns integer
language plpgsql as $p$
declare n integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"20000000-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}', true);
  begin
    n := public.xp_code_einloesen(p_code, 'season1');
    perform set_config('role', 'postgres', true);
    return n;
  exception when others then
    perform set_config('role', 'postgres', true);
    return -99;   -- unerwartete Ausnahme
  end;
end $p$;

create or replace function pg_temp.stand() returns integer
language sql as $p$
  select coalesce(pass_xp, 0) from public.player_progression
   where firebase_uid = '20000000-0000-0000-0000-00000000000a'
$p$;

insert into auth.users (id, created_at)
  values ('20000000-0000-0000-0000-00000000000a', now())
on conflict (id) do nothing;

create temp table ergebnis (nr int, test text, wert text);


/* ======================================================
   T1-T4: die Betraege kommen aus der Datenbank
====================================================== */
insert into ergebnis
select 1, 'T1 kompass gibt genau 50',
       case when pg_temp.loese('kompass') = 50 then 'PASS' else 'FAIL' end;

insert into ergebnis
select 2, 'T2 pass_xp steht danach auf 50',
       case when pg_temp.stand() = 50 then 'PASS' else 'FAIL' end;

insert into ergebnis
select 3, 'T3 goldrausch gibt genau 500',
       case when pg_temp.loese('goldrausch') = 500 then 'PASS' else 'FAIL' end;

/* Aufaddiert, nicht ersetzt - beide Codes in derselben Saison. */
insert into ergebnis
select 4, 'T4 pass_xp ist jetzt 550 (addiert, nicht ersetzt)',
       case when pg_temp.stand() = 550 then 'PASS' else 'FAIL' end;


/* ======================================================
   T5-T6: DIE SPERRE - der wichtigste Teil
====================================================== */
insert into ergebnis
select 5, 'T5 kompass ein zweites Mal gibt 0',
       case when pg_temp.loese('kompass') = 0 then 'PASS' else 'FAIL' end;

insert into ergebnis
select 6, 'T6 und schreibt dabei nichts gut (immer noch 550)',
       case when pg_temp.stand() = 550 then 'PASS' else 'FAIL' end;


/* ======================================================
   T7-T8: Schreibweise und unbekannte Codes
====================================================== */
/* Der Browser schickt trim().toLowerCase(); die Funktion muss
   dieselbe Normalisierung machen. Gross geschrieben und mit
   Leerzeichen drumherum muss deshalb denselben Code treffen -
   und weil kompass schon eingeloest ist, ist die Antwort 0 und
   nicht -1. Genau dieser Unterschied zeigt, dass der Hash
   getroffen wurde. */
insert into ergebnis
select 7, 'T7 "  KOMPASS  " trifft denselben Code (0, nicht -1)',
       case when pg_temp.loese('  KOMPASS  ') = 0 then 'PASS' else 'FAIL' end;

insert into ergebnis
select 8, 'T8 erfundener Code gibt -1',
       case when pg_temp.loese('gibtesnicht') = -1 then 'PASS' else 'FAIL' end;


/* ======================================================
   T9: der Aufrufer kann sich den Betrag NICHT aussuchen
   ---------------------------------------------------
   Die Funktion nimmt gar kein Betrags-Argument. Der Nachweis:
   es gibt keine Ueberladung mit drei Parametern, ein solcher
   Aufruf scheitert also schon an der Signatur.
====================================================== */
insert into ergebnis
select 9, 'T9 kein Betrags-Argument vorhanden',
       case when (select count(*) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'xp_code_einloesen'
                    and p.pronargs <> 2) = 0
            then 'PASS' else 'FAIL' end;


/* ======================================================
   T10: die Hash-Tabelle ist fuer Spieler nicht lesbar
   ---------------------------------------------------
   Sonst koennte man sich die Liste holen und offline
   durchprobieren.
====================================================== */
create or replace function pg_temp.darf_lesen() returns boolean
language plpgsql as $p$
declare n integer;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"20000000-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}', true);
  begin
    select count(*) into n from public.xp_codes;
    perform set_config('role', 'postgres', true);
    return n > 0;
  exception when others then
    perform set_config('role', 'postgres', true);
    return false;
  end;
end $p$;

/* Bewusst gegen "= false" geprueft und nicht gegen "is not true":
   Letzteres bestuende auch bei NULL. */
insert into ergebnis
select 10, 'T10 Spieler sieht die Hash-Tabelle nicht',
       case when pg_temp.darf_lesen() = false then 'PASS' else 'FAIL' end;


select nr, test, wert from ergebnis order by nr;

rollback;
