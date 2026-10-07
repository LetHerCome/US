-- MC2: local candidate only. No Auth/session/Storage mutation, no ledger repair.
-- One atomic statement: LEGACY applies, exact TARGET verifies/no-ops, UNKNOWN aborts.
do $mc2$
declare
  expected jsonb := pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'sig','private.mc2_require_account()','schema','private','returns','uuid',
    'defaults',0,'names','[]'::jsonb,'stable',false,'definer',false,
    'ddl',$definition$
create function private.mc2_require_account() returns uuid
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception using errcode='42501', message='authentication_required'; end if;
  if not exists (select 1 from auth.users u where u.id=uid and u.is_anonymous=false
    and u.email is not null and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())) then
    raise exception using errcode='42501', message='account_not_eligible';
  end if;
  return uid;
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','private.mc2_lock_user()','schema','private','returns','void',
    'defaults',0,'names','[]'::jsonb,'stable',false,'definer',false,
    'ddl',$definition$
create function private.mc2_lock_user() returns void
language plpgsql volatile security invoker set search_path = ''
as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('us.mc2.membership:' || auth.uid()::text,0));
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','private.mc2_clean_display_name(text)','schema','private','returns','text',
    'defaults',0,'names','["p_name"]'::jsonb,'stable',false,'definer',false,
    'ddl',$definition$
create function private.mc2_clean_display_name(p_name text) returns text
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare clean text := pg_catalog.btrim(p_name);
begin
  if clean is null or pg_catalog.char_length(clean) not between 1 and 40 or clean ~ '[[:cntrl:]]' then
    raise exception using errcode='22023', message='display_name_invalid';
  end if;
  return clean;
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','private.mc2_normalize_code(text)','schema','private','returns','text',
    'defaults',0,'names','["p_code"]'::jsonb,'stable',false,'definer',false,
    'ddl',$definition$
create function private.mc2_normalize_code(p_code text) returns text
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare clean text;
begin
  clean := pg_catalog.translate(pg_catalog.upper(pg_catalog.regexp_replace(p_code,'[[:space:]-]','','g')),'OIL','011');
  if clean is null or clean !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then return null; end if;
  return clean;
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','private.mc2_new_code()','schema','private','returns','text',
    'defaults',0,'names','[]'::jsonb,'stable',false,'definer',false,
    'ddl',$definition$
create function private.mc2_new_code() returns text
language plpgsql volatile security invoker set search_path = ''
as $fn$
declare bytes bytea := extensions.gen_random_bytes(16);
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  acc integer := 0; bits integer := 0; result text := ''; i integer;
begin
  for i in 0..15 loop
    acc := (acc << 8) | pg_catalog.get_byte(bytes,i); bits := bits+8;
    while bits >= 5 loop
      bits := bits-5;
      result := result || pg_catalog.substr(alphabet,((acc >> bits) & 31)+1,1);
    end loop;
    acc := acc & ((1 << bits)-1);
  end loop;
  if bits > 0 then result := result || pg_catalog.substr(alphabet,(acc << (5-bits))+1,1); end if;
  return result;
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','public.create_couple(text,date,text)','schema','public','returns','jsonb',
    'defaults',1,'names','["p_display_name","p_started_on","p_couple_name"]'::jsonb,'stable',false,'definer',true,
    'ddl',$definition$
create function public.create_couple(p_display_name text, p_started_on date, p_couple_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare uid uuid; clean text; cname text; cid uuid;
begin
  uid := private.mc2_require_account(); clean := private.mc2_clean_display_name(p_display_name);
  if p_started_on is null or p_started_on < date '1900-01-01'
    or p_started_on > (pg_catalog.clock_timestamp() at time zone 'Europe/Rome')::date then
    raise exception using errcode='22023', message='started_on_invalid';
  end if;
  cname := pg_catalog.btrim(coalesce(p_couple_name,'US.'));
  if pg_catalog.char_length(cname) not between 1 and 40 or cname ~ '[[:cntrl:]]' then
    raise exception using errcode='22023', message='couple_name_invalid';
  end if;
  perform private.mc2_lock_user();
  select p.couple_id into cid from public.profiles p where p.id=uid for share;
  if found then
    if cid is null then raise exception using errcode='42501', message='profile_state_unsupported'; end if;
    return pg_catalog.jsonb_build_object('status','already_member','couple_id',cid);
  end if;
  begin
    cid := pg_catalog.gen_random_uuid();
    insert into public.couples(id,name,started_on,created_at,bond_xp) values(cid,cname,p_started_on,pg_catalog.now(),0);
    insert into public.profiles(id,display_name,couple_id,role,created_at) values(uid,clean,cid,'francesco',pg_catalog.now());
  exception when unique_violation then
    select p.couple_id into cid from public.profiles p where p.id=uid;
    if cid is null then raise exception using errcode='42501', message='profile_state_unsupported'; end if;
    return pg_catalog.jsonb_build_object('status','already_member','couple_id',cid);
  end;
  return pg_catalog.jsonb_build_object('status','created','couple_id',cid);
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','public.create_partner_invite()','schema','public','returns','jsonb',
    'defaults',0,'names','[]'::jsonb,'stable',false,'definer',true,
    'ddl',$definition$
create function public.create_partner_invite() returns jsonb
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
  raw := private.mc2_new_code(); tick := pg_catalog.clock_timestamp(); expiry := tick+interval '48 hours';
  insert into public.couple_invites(couple_id,role,code_hash,created_by,created_at,expires_at)
    values(cid,slot,pg_catalog.encode(extensions.digest(raw,'sha256'),'hex'),uid,tick,expiry)
    on conflict(couple_id,role) do update set code_hash=excluded.code_hash,created_by=excluded.created_by,
      created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=null,used_by=null,used_at=null;
  return pg_catalog.jsonb_build_object('code',pg_catalog.regexp_replace(raw,'(.{4})(?=.)','\1-','g'),'expires_at',expiry);
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','public.revoke_partner_invite()','schema','public','returns','jsonb',
    'defaults',0,'names','[]'::jsonb,'stable',false,'definer',true,
    'ddl',$definition$
create function public.revoke_partner_invite() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare uid uuid; cid uuid; slot text; inv public.couple_invites%rowtype;
begin
  uid := private.mc2_require_account(); perform private.mc2_lock_user();
  select a.caller_couple, case a.caller_role when 'francesco' then 'beatrice' else 'francesco' end
    into cid,slot from private.m11a_actor_locked() a;
  select i.* into inv from public.couple_invites i where i.couple_id=cid and i.role=slot for update;
  if found and inv.used_at is null and inv.revoked_at is null and inv.expires_at > pg_catalog.clock_timestamp() then
    update public.couple_invites set revoked_at=pg_catalog.clock_timestamp() where id=inv.id;
    return pg_catalog.jsonb_build_object('revoked',true);
  end if;
  return pg_catalog.jsonb_build_object('revoked',false);
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','public.accept_partner_invite(text,text)','schema','public','returns','jsonb',
    'defaults',0,'names','["p_code","p_display_name"]'::jsonb,'stable',false,'definer',true,
    'ddl',$definition$
create function public.accept_partner_invite(p_code text, p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare uid uuid; clean text; norm text; inv public.couple_invites%rowtype;
  cid uuid; has_profile boolean; inv_found boolean; creator uuid; member_count bigint;
begin
  uid := private.mc2_require_account(); clean := private.mc2_clean_display_name(p_display_name);
  norm := private.mc2_normalize_code(p_code);
  if norm is null then raise exception using errcode='P0001', message='invite_invalid'; end if;
  perform private.mc2_lock_user();
  select p.couple_id into cid from public.profiles p where p.id=uid for share; has_profile := found;
  select i.* into inv from public.couple_invites i
    where i.code_hash=pg_catalog.encode(extensions.digest(norm,'sha256'),'hex') for update; inv_found := found;
  if has_profile then
    if cid is null then raise exception using errcode='42501', message='profile_state_unsupported'; end if;
    if inv_found and inv.couple_id=cid and inv.used_by=uid then
      return pg_catalog.jsonb_build_object('status','already_joined','couple_id',cid);
    end if;
    raise exception using errcode='P0001', message='already_in_couple';
  end if;
  if not inv_found or inv.used_at is not null or inv.revoked_at is not null
    or inv.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode='P0001', message='invite_invalid';
  end if;
  -- Protect the surviving creator against deletion between count and insert.
  -- This follows user -> actor -> invite -> membership-check lock ordering.
  select p.id into creator from public.profiles p where p.couple_id=inv.couple_id and p.role<>inv.role for share;
  select pg_catalog.count(*) into member_count from public.profiles p where p.couple_id=inv.couple_id;
  if creator is null or member_count<>1 or exists(select 1 from public.profiles p where p.couple_id=inv.couple_id and p.role=inv.role) then
    raise exception using errcode='P0001', message='invite_invalid';
  end if;
  perform private.mc2_require_account();
  if inv.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode='P0001', message='invite_invalid';
  end if;
  begin
    insert into public.profiles(id,display_name,couple_id,role,created_at)
      values(uid,clean,inv.couple_id,inv.role,pg_catalog.now());
  exception when unique_violation then
    if exists(select 1 from public.profiles p where p.id=uid) then
      raise exception using errcode='P0001', message='already_in_couple';
    end if;
    raise exception using errcode='P0001', message='invite_invalid';
  end;
  if inv.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode='P0001', message='invite_invalid';
  end if;
  update public.couple_invites set used_by=uid,used_at=pg_catalog.clock_timestamp() where id=inv.id;
  return pg_catalog.jsonb_build_object('status','joined','couple_id',inv.couple_id);
end;
$fn$;
$definition$),
  pg_catalog.jsonb_build_object(
    'sig','public.get_couple_membership()','schema','public','returns','jsonb',
    'defaults',0,'names','[]'::jsonb,'stable',true,'definer',true,
    'ddl',$definition$
create function public.get_couple_membership() returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare uid uuid; cid uuid; slot text; inv public.couple_invites%rowtype; state text := 'none'; partner boolean;
begin
  begin uid := private.mc2_require_account();
  exception when insufficient_privilege then return pg_catalog.jsonb_build_object('member',false); end;
  select p.couple_id,p.role into cid,slot from public.profiles p where p.id=uid;
  if not found or cid is null then return pg_catalog.jsonb_build_object('member',false); end if;
  select exists(select 1 from public.profiles p where p.couple_id=cid and p.id<>uid) into partner;
  select i.* into inv from public.couple_invites i where i.couple_id=cid and i.role<>slot;
  if found then
    state := case when inv.used_at is not null then 'used' when inv.revoked_at is not null then 'revoked'
      when inv.expires_at <= pg_catalog.statement_timestamp() then 'expired' else 'pending' end;
  end if;
  return pg_catalog.jsonb_build_object('member',true,'couple_id',cid,'partner_joined',partner,
    'invite',pg_catalog.jsonb_build_object('status',state,'expires_at',inv.expires_at));
end;
$fn$;
$definition$)
  );
  checks jsonb := $checks${"couple_invites_used_xor_revoked":"CHECK (((used_at IS NULL) OR (revoked_at IS NULL)))","couple_invites_used_by_implies_used_at":"CHECK (((used_by IS NULL) OR (used_at IS NOT NULL)))","couple_invites_expiry_after_create":"CHECK ((expires_at >= created_at))","couple_invites_code_hash_shape":"CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text))","couple_invites_created_by_fkey":"FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL"}$checks$::jsonb;
  legacy_checks jsonb := $legacy${"couple_invites_pkey":"PRIMARY KEY (id)","couple_invites_code_hash_key":"UNIQUE (code_hash)","couple_invites_couple_id_role_key":"UNIQUE (couple_id, role)","couple_invites_role_check":"CHECK ((role = ANY (ARRAY['francesco'::text, 'beatrice'::text])))","couple_invites_couple_id_fkey":"FOREIGN KEY (couple_id) REFERENCES public.couples(id) ON DELETE CASCADE","couple_invites_used_by_fkey":"FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL"}$legacy$::jsonb;
  profile_checks jsonb := $profiles${"profiles_pkey":"PRIMARY KEY (id)","profiles_id_fkey":"FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE","profiles_couple_id_fkey":"FOREIGN KEY (couple_id) REFERENCES public.couples(id) ON DELETE CASCADE"}$profiles$::jsonb;
  expected_policies jsonb := $policies$[{"tablename":"couples","policyname":"couples_select_own","permissive":"PERMISSIVE","roles":["authenticated"],"cmd":"SELECT","qual":"(id = private.current_couple_id())","with_check":null},{"tablename":"couples","policyname":"couples_update_own","permissive":"PERMISSIVE","roles":["authenticated"],"cmd":"UPDATE","qual":"(id = private.current_couple_id())","with_check":"(id = private.current_couple_id())"},{"tablename":"profiles","policyname":"profiles_select_same_couple","permissive":"PERMISSIVE","roles":["authenticated"],"cmd":"SELECT","qual":"((id = auth.uid()) OR (couple_id = private.current_couple_id()))","with_check":null},{"tablename":"profiles","policyname":"profiles_update_self","permissive":"PERMISSIVE","roles":["authenticated"],"cmd":"UPDATE","qual":"(id = auth.uid())","with_check":"(id = auth.uid())"}]$policies$::jsonb;
  item jsonb; proc pg_catalog.pg_proc%rowtype; col_count integer; function_count integer;
  target boolean; r record; actual text; actor_role text; privilege text;
begin
  perform pg_catalog.set_config('search_path','',true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('us.mc2.migration',0));
  if pg_catalog.to_regclass('public.couple_invites') is null or pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'mc2_schema_unsupported';
  end if;
  select pg_catalog.count(*) into col_count from pg_catalog.pg_attribute
    where attrelid='public.couple_invites'::regclass and attnum>0 and not attisdropped;
  select pg_catalog.count(*) into function_count from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname like 'mc2\_%') or
      (n.nspname='public' and p.proname in('create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership'));
  target := col_count=10 and function_count=10;
  if (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by tablename,policyname) from
    (select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_catalog.pg_policies
      where schemaname='public' and tablename in('profiles','couples','couple_invites')) x) is distinct from expected_policies then
    raise exception 'mc2_membership_policy_drift';
  end if;
  if not target and (col_count<>7 or function_count<>0 or exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.couple_invites'::regclass and conname in(select pg_catalog.jsonb_object_keys(checks)))) then
    raise exception 'mc2_partial_or_unknown';
  end if;
  -- Both states require intact structural membership and denied client policies.
  if not exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
    where c.oid=pg_catalog.to_regclass('public.profiles_one_role_per_couple') and i.indisunique and i.indisvalid
      and i.indrelid='public.profiles'::regclass and pg_catalog.pg_get_indexdef(c.oid) =
      'CREATE UNIQUE INDEX profiles_one_role_per_couple ON public.profiles USING btree (couple_id, role) WHERE (couple_id IS NOT NULL)')
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_role_check'
      and convalidated and pg_catalog.pg_get_constraintdef(oid) = 'CHECK ((role = ANY (ARRAY[''francesco''::text, ''beatrice''::text])))')
    or exists(select 1 from public.profiles where couple_id is null)
    or exists(select 1 from public.profiles group by couple_id having pg_catalog.count(*)>2)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.profiles'::regclass and polcmd in('a','d','*')) then
    raise exception 'mc2_membership_precondition_failed';
  end if;
  if pg_catalog.to_regprocedure('extensions.gen_random_bytes(integer)') is null or pg_catalog.to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'mc2_crypto_unavailable';
  end if;
  for r in select key,value from pg_catalog.jsonb_each_text(legacy_checks) loop
    if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.couple_invites'::regclass
      and c.conname=r.key and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid)=r.value) then
      raise exception 'mc2_legacy_constraint_drift: %',r.key;
    end if;
  end loop;
  for r in select key,value from pg_catalog.jsonb_each_text(profile_checks) loop
    if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.profiles'::regclass
      and c.conname=r.key and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid)=r.value) then
      raise exception 'mc2_profile_constraint_drift: %',r.key;
    end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.couple_invites'::regclass
    and conname='couple_invites_code_hash_key' and convalidated and pg_catalog.pg_get_constraintdef(oid)='UNIQUE (code_hash)')
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.couple_invites'::regclass
    and conname='couple_invites_couple_id_role_key' and convalidated and pg_catalog.pg_get_constraintdef(oid)='UNIQUE (couple_id, role)')
    or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.couple_invites'::regclass
    and conname='couple_invites_role_check' and convalidated and pg_catalog.pg_get_constraintdef(oid)='CHECK ((role = ANY (ARRAY[''francesco''::text, ''beatrice''::text])))') then
    raise exception 'mc2_invite_precondition_failed';
  end if;
  for r in select * from (values ('id','uuid',true,'gen_random_uuid()'),('couple_id','uuid',true,null),('role','text',true,null),('code_hash','text',true,null),
    ('used_by','uuid',false,null),('used_at','timestamp with time zone',false,null),('created_at','timestamp with time zone',true,'now()')) v(name,typ,nn,def) loop
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.couple_invites'::regclass
      and a.attname=r.name and pg_catalog.format_type(a.atttypid,a.atttypmod)=r.typ and a.attnotnull=r.nn and not a.attisdropped
      and (select pg_catalog.pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum) is not distinct from r.def) then
      raise exception 'mc2_legacy_column_drift';
    end if;
  end loop;
  if not target then
    if exists(select 1 from public.couple_invites where used_at is null or code_hash !~ '^[0-9a-f]{64}$' or used_at<created_at) then
      raise exception 'mc2_legacy_invite_state_unsupported';
    end if;
    execute 'alter table public.couple_invites add column expires_at timestamptz,
 add column revoked_at timestamptz, add column created_by uuid references public.profiles(id) on delete set null;
update public.couple_invites set expires_at=coalesce(used_at,created_at);
alter table public.couple_invites alter column expires_at set not null;
alter table public.couple_invites add constraint couple_invites_used_xor_revoked check(used_at is null or revoked_at is null),
 add constraint couple_invites_used_by_implies_used_at check(used_by is null or used_at is not null),
 add constraint couple_invites_expiry_after_create check(expires_at >= created_at),
 add constraint couple_invites_code_hash_shape check(code_hash ~ ''^[0-9a-f]{64}$'');';
    for item in select value from pg_catalog.jsonb_array_elements(expected) loop
      execute item->>'ddl';
      execute pg_catalog.format('alter function %s owner to postgres',item->>'sig');
      execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',item->>'sig');
      if item->>'schema'='public' then execute pg_catalog.format('grant execute on function %s to authenticated',item->>'sig'); end if;
    end loop;
    revoke insert,delete,truncate,references,trigger on public.profiles from anon,authenticated;
    if pg_catalog.current_setting('server_version_num')::integer>=170000 then
      execute 'revoke maintain on public.profiles from anon,authenticated';
    end if;
    comment on column public.couple_invites.expires_at is 'MC2: fixed server expiry; legacy used rows retain historical expiry.';
    comment on column public.couple_invites.created_by is 'MC2: creator profile; membership remains profiles.couple_id.';
    comment on column public.couple_invites.revoked_at is 'MC2: revoked bearer token; no plaintext tokens are persisted.';
  end if;
  -- Exact target verification: a rerun never repairs even a single grant or body.
  for r in select * from (values ('expires_at','timestamp with time zone',true),('revoked_at','timestamp with time zone',false),('created_by','uuid',false)) v(name,typ,nn) loop
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.couple_invites'::regclass and a.attname=r.name
      and pg_catalog.format_type(a.atttypid,a.atttypmod)=r.typ and a.attnotnull=r.nn and not a.attisdropped
      and not exists(select 1 from pg_catalog.pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) then
      raise exception 'mc2_target_column_drift';
    end if;
  end loop;
  for r in select key,value from pg_catalog.jsonb_each_text(checks) loop
    if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.couple_invites'::regclass
      and c.conname=r.key and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid)=r.value) then
      raise exception 'mc2_target_constraint_drift: %',r.key;
    end if;
  end loop;
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint where conrelid='public.couple_invites'::regclass and contype<>'n')<>11 then
    raise exception 'mc2_target_constraint_surface_drift';
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(expected) loop
    select p.* into proc from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(item->>'sig');
    if not found or proc.prorettype<>pg_catalog.to_regtype(item->>'returns') or proc.proretset
      or proc.prosecdef<>(item->>'definer')::boolean or proc.proowner<>'postgres'::regrole
      or proc.proconfig is distinct from array['search_path=""']::text[]
      or proc.provolatile<>(case when (item->>'stable')::boolean then 's'::"char" else 'v'::"char" end)
      or proc.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or proc.prosrc<>pg_catalog.split_part(item->>'ddl','$fn$',2) or proc.pronargdefaults<>(item->>'defaults')::integer
      or proc.proisstrict or proc.proleakproof or proc.proparallel<>'u'
      or coalesce(pg_catalog.to_jsonb(proc.proargnames),'[]'::jsonb)<>item->'names'
      or (proc.pronargdefaults=1 and pg_catalog.pg_get_expr(proc.proargdefaults,0)<>'NULL::text') then
      raise exception 'mc2_target_rpc_drift: %',item->>'sig';
    end if;
    if exists(select 1 from pg_catalog.aclexplode(coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))) a
      where a.grantee<>proc.proowner and (item->>'schema'<>'public' or a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable))
      or pg_catalog.has_function_privilege('anon',proc.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',proc.oid,'EXECUTE')<>(item->>'schema'='public') then
      raise exception 'mc2_target_rpc_acl_drift: %',item->>'sig';
    end if;
  end loop;
  foreach actor_role in array array['anon','authenticated'] loop
    foreach privilege in array array['INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER','UPDATE'] loop
      if pg_catalog.has_table_privilege(actor_role,'public.couples',privilege) then raise exception 'mc2_couple_grant_drift'; end if;
    end loop;
    if pg_catalog.has_table_privilege(actor_role,'public.couples','SELECT')<>(actor_role='authenticated') then raise exception 'mc2_couple_grant_drift'; end if;
    if pg_catalog.current_setting('server_version_num')::integer>=170000 and pg_catalog.has_table_privilege(actor_role,'public.couples','MAINTAIN') then raise exception 'mc2_couple_grant_drift'; end if;
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.couples'::regclass and a.attnum>0 and not a.attisdropped
      and (pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'INSERT') or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'REFERENCES')
        or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'SELECT')<>(actor_role='authenticated')
        or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'UPDATE')<>(actor_role='authenticated' and a.attname in('name','started_on','home_photo_path')))) then
      raise exception 'mc2_couple_column_grant_drift';
    end if;
    foreach privilege in array array['INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER','UPDATE'] loop
      if pg_catalog.has_table_privilege(actor_role,'public.profiles',privilege) then raise exception 'mc2_profile_grant_drift'; end if;
    end loop;
    if pg_catalog.current_setting('server_version_num')::integer>=170000 and pg_catalog.has_table_privilege(actor_role,'public.profiles','MAINTAIN') then
      raise exception 'mc2_profile_grant_drift';
    end if;
    if not pg_catalog.has_table_privilege(actor_role,'public.profiles','SELECT') then raise exception 'mc2_profile_select_drift'; end if;
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped
      and (pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'INSERT')
        or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'UPDATE')<>(actor_role='authenticated' and a.attname='avatar_path'))) then
      raise exception 'mc2_profile_column_grant_drift';
    end if;
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped
      and pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'REFERENCES')) then raise exception 'mc2_profile_column_grant_drift'; end if;
    if pg_catalog.current_setting('server_version_num')::integer>=170000 and pg_catalog.has_table_privilege(actor_role,'public.couple_invites','MAINTAIN') then
      raise exception 'mc2_invite_acl_drift';
    end if;
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.couple_invites'::regclass and a.attnum>0 and not a.attisdropped
      and (pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'SELECT') or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'INSERT')
        or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'UPDATE') or pg_catalog.has_column_privilege(actor_role,a.attrelid,a.attnum,'REFERENCES')))
      or pg_catalog.has_table_privilege(actor_role,'public.couple_invites','DELETE,TRUNCATE,TRIGGER') then raise exception 'mc2_invite_acl_drift'; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) a
    where c.oid in('public.profiles'::regclass,'public.couples'::regclass,'public.couple_invites'::regclass) and a.grantee=0) then
    raise exception 'mc2_public_table_acl_drift';
  end if;
  if exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) a
    where c.oid in('public.profiles'::regclass,'public.couples'::regclass,'public.couple_invites'::regclass)
      and (c.relowner<>'postgres'::regrole or a.grantee not in('postgres'::regrole,'service_role'::regrole,'anon'::regrole,'authenticated'::regrole)
        or (a.grantee in('anon'::regrole,'authenticated'::regrole) and a.is_grantable)))
    or exists(select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) g
      where a.attrelid in('public.profiles'::regclass,'public.couples'::regclass,'public.couple_invites'::regclass)
        and (g.grantee not in('postgres'::regrole,'service_role'::regrole,'anon'::regrole,'authenticated'::regrole)
          or (g.grantee in('anon'::regrole,'authenticated'::regrole) and g.is_grantable))) then
    raise exception 'mc2_membership_acl_surface_drift';
  end if;
  if exists(select 1 from pg_catalog.pg_class where oid in('public.profiles'::regclass,'public.couples'::regclass,'public.couple_invites'::regclass) and not relrowsecurity)
    or exists(select 1 from pg_catalog.pg_policy where polrelid='public.couple_invites'::regclass)
    or exists(select 1 from public.couple_invites i where (i.used_at is not null and i.revoked_at is not null)
      or (i.used_by is not null and i.used_at is null) or i.expires_at<i.created_at or i.code_hash !~ '^[0-9a-f]{64}$'
      or (i.used_at is null and i.revoked_at is null and i.expires_at>pg_catalog.clock_timestamp()
        and (not exists(select 1 from public.profiles p where p.couple_id=i.couple_id and p.role<>i.role)
          or exists(select 1 from public.profiles p where p.couple_id=i.couple_id and p.role=i.role)))) then
    raise exception 'mc2_target_invariant_drift';
  end if;
end;
$mc2$;
