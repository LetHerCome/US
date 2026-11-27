-- L'invito dura 14 giorni (founder, 27/11/2026, dal controllo generale).
--
-- Il codice per far entrare l'altra persona scadeva dopo 48 ore, ma le coppie
-- in attesa aspettano anche 4-14 giorni: chi apriva un link vecchio trovava
-- «Codice non valido, scaduto». Il codice resta lo stesso di MC2 (128 bit
-- casuali, solo l'impronta sha256 sul server, un tentativo sbagliato non
-- rivela niente), quindi due settimane non cambiano la sicurezza.
--
-- Cambia solo la scadenza in public.create_partner_invite(); corpo, firma,
-- security definer, search_path e permessi restano quelli di MC2
-- (create or replace mantiene i grant). Gli inviti già creati tengono la loro
-- scadenza. Nessuna tabella, nessun dato.

create or replace function public.create_partner_invite() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare uid uuid; cid uuid; slot text; raw text; expiry timestamptz; tick timestamptz;
begin
  uid := private.mc2_require_account(); perform private.mc2_lock_user();
  select a.caller_couple, case a.caller_role when 'francesco' then 'beatrice' else 'francesco' end
    into cid,slot from private.m11a_actor_locked() a;
  perform 1 from public.couple_invites i where i.couple_id=cid and i.role=slot for update;
  if exists(select 1 from public.profiles p where p.couple_id=cid and p.role=slot) then
    raise exception using errcode='P0001', message='couple_full';
  end if;
  raw := private.mc2_new_code(); tick := pg_catalog.clock_timestamp(); expiry := tick+interval '14 days';
  insert into public.couple_invites(couple_id,role,code_hash,created_by,created_at,expires_at)
    values(cid,slot,pg_catalog.encode(extensions.digest(raw,'sha256'),'hex'),uid,tick,expiry)
    on conflict(couple_id,role) do update set code_hash=excluded.code_hash,created_by=excluded.created_by,
      created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=null,used_by=null,used_at=null;
  return pg_catalog.jsonb_build_object('code',pg_catalog.regexp_replace(raw,'(.{4})(?=.)','\1-','g'),'expires_at',expiry);
end;
$fn$;

comment on function public.create_partner_invite() is
  'MC2 partner invite; 14-day expiry since 2026-11-27 (was 48 hours).';
