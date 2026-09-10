-- Gate 1.5A: profiles membership authority hardening.
-- Client sessions may edit personal presentation only. Membership remains owned
-- by the existing SECURITY DEFINER claim_us_role pairing/re-pairing path.

-- Refuse to change ACLs unless the existing authority boundary is the one this
-- additive migration was reviewed against.
do $$
declare
  v_claim oid := to_regprocedure('public.claim_us_role(text,text)');
  v_claim_owner name;
  v_claim_security_definer boolean;
  v_authenticated oid := (select oid from pg_roles where rolname = 'authenticated');
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Gate 1.5A requires public.profiles';
  end if;

  if not (
    select class.relrowsecurity
    from pg_class as class
    where class.oid = 'public.profiles'::regclass
  ) then
    raise exception 'Gate 1.5A requires RLS on public.profiles';
  end if;

  if v_authenticated is null or not exists (
    select 1
    from pg_policy as policy
    where policy.polrelid = 'public.profiles'::regclass
      and policy.polname = 'profiles_update_self'
      and policy.polcmd = 'w'
      and policy.polqual is not null
      and policy.polwithcheck is not null
      and (0 = any(policy.polroles) or v_authenticated = any(policy.polroles))
      and pg_get_expr(policy.polqual, policy.polrelid) ilike '%id%auth.uid()%'
      and pg_get_expr(policy.polwithcheck, policy.polrelid) ilike '%id%auth.uid()%'
  ) then
    raise exception 'Gate 1.5A requires the authenticated profiles_update_self UPDATE policy';
  end if;

  if v_claim is null then
    raise exception 'Gate 1.5A requires public.claim_us_role(text,text)';
  end if;

  select pg_get_userbyid(pg_proc.proowner), pg_proc.prosecdef
    into v_claim_owner, v_claim_security_definer
  from pg_proc
  where pg_proc.oid = v_claim;

  if not v_claim_security_definer then
    raise exception 'claim_us_role must remain SECURITY DEFINER';
  end if;

  if not has_table_privilege(v_claim_owner, 'public.profiles', 'INSERT')
     or not has_table_privilege(v_claim_owner, 'public.profiles', 'DELETE')
     or not has_column_privilege(v_claim_owner, 'public.profiles', 'couple_id', 'UPDATE')
     or not has_column_privilege(v_claim_owner, 'public.profiles', 'role', 'UPDATE') then
    raise exception 'claim_us_role owner lacks required profile pairing/re-pairing privileges';
  end if;
end;
$$;

-- A table-level revoke does not remove explicit column grants, so clear both
-- forms for every current profile column before restoring the two safe fields.
revoke update on table public.profiles from public, anon, authenticated;

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attribute.attname), ', ' order by attribute.attnum)
    into v_columns
  from pg_attribute as attribute
  where attribute.attrelid = 'public.profiles'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_columns is null then
    raise exception 'Gate 1.5A found no public.profiles columns';
  end if;

  execute format(
    'revoke update (%s) on public.profiles from public, anon, authenticated',
    v_columns
  );
end;
$$;

grant update (display_name, avatar_path) on table public.profiles to authenticated;

-- Apply-time behavioral contract: effective authenticated privileges include
-- both inherited/public ACLs, not merely direct information_schema grants.
do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'couple_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') then
    raise exception 'authenticated must not update profile membership columns';
  end if;

  if exists (
    select 1
    from pg_attribute as attribute
    where attribute.attrelid = 'public.profiles'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname not in ('display_name', 'avatar_path')
      and has_column_privilege(
        'authenticated',
        'public.profiles',
        attribute.attnum,
        'UPDATE'
      )
  ) then
    raise exception 'authenticated retains UPDATE on a non-personal profile column';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE') then
    raise exception 'authenticated lacks a required personal profile UPDATE privilege';
  end if;
end;
$$;

comment on column public.profiles.couple_id is
  'Membership authority: writable only through trusted server-side pairing/re-pairing paths such as claim_us_role.';
comment on column public.profiles.role is
  'Membership authority: writable only through trusted server-side pairing/re-pairing paths such as claim_us_role.';
