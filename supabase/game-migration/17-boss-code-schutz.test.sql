/* ======================================================
   PRUEFUNG ZU 17-boss-code-schutz.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 17 eingespielt wurde.
   Alles laeuft in einer Transaktion und wird am Ende
   zurueckgerollt - es bleibt nichts stehen.

   Erwartet: fuenf Zeilen, T2 "DURCHGELASSEN", alle anderen
   "ABGELEHNT: ..." mit dem jeweils genannten Grund.
====================================================== */
begin;

/* Kleine Huelle, damit eine Ausnahme den Test nicht abbricht,
   sondern als Text in der Ergebnisspalte landet. */
create or replace function pg_temp.probe(p_code text, p_key text) returns text
language plpgsql as $p$
begin
  perform app.admin_boss_code_setzen(p_code, p_key);
  return 'DURCHGELASSEN';
exception when others then return 'ABGELEHNT: ' || sqlerrm;
end $p$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated","email":"y.n.trott@gmail.com"}';

select 'T1 Platzhalter (der Fehler vom 08.09.)' as test,
       pg_temp.probe('DEIN-CODE-SALVE', 'salve')          as ergebnis
union all
select 'T2 echter Code muss durch',
       pg_temp.probe('Kanonen-Donner-2026', 'salve')
union all
select 'T3 Leerzeichen mittendrin',
       pg_temp.probe('Kanonen Donner', 'salve')
union all
select 'T4 zu kurz',
       pg_temp.probe('ab', 'salve')
union all
select 'T5 Angriff gibt es nicht',
       pg_temp.probe('Kanonen-Donner-2026', 'gibtsnicht');

rollback;

/* Ergebnis am 09.09.2026 gegen die Live-Datenbank:
     T1 ABGELEHNT: platzhalter-code
     T2 DURCHGELASSEN
     T3 ABGELEHNT: code-mit-leerzeichen
     T4 ABGELEHNT: code-zu-kurz
     T5 ABGELEHNT: kein-spezialangriff                     */
