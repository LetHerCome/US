-- TEST-ONLY Supabase platform skeleton for rebuilding the US baseline in an
-- empty embedded PostgreSQL (PGlite). It stands in for what every Supabase
-- project already has before any US migration runs: the API roles, auth,
-- storage, vault, pg_cron, pg_net, the realtime publication and the
-- migration ledger table. It is never applied to a real Supabase project.
--
-- Only the surface the baseline and the fingerprint queries touch is here.
-- Extensions pgcrypto and uuid-ossp are real (PGlite contrib), installed in
-- schema `extensions` exactly as in production (F2A b09).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants every API role full privileges on new public objects; the
-- baseline's grants file revokes and re-grants to the exact production ACLs.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- auth --------------------------------------------------------------------
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, is_anonymous boolean not null default false,
  created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')), '')::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- storage -----------------------------------------------------------------
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), public boolean default false, avif_autodetection boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner_id text, type text default 'STANDARD',
  -- Newer storage columns seen in the production bucket row (c08); types are
  -- the test skeleton's stand-ins, the platform owns the real ones.
  versioning_status text default 'DISABLED', lifecycle_configuration jsonb, lifecycle_configuration_generation bigint
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, version text, owner_id text,
  user_metadata jsonb, level integer
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
create function storage.filename(name text) returns text language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;
create function storage.extension(name text) returns text language plpgsql immutable as $$
declare _parts text[]; _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;
grant usage on schema storage to anon, authenticated, service_role;

-- vault (names only; the test never stores a real secret) -----------------
create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(), name text unique, description text not null default '',
  secret text not null, key_id uuid, nonce bytea, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create view vault.decrypted_secrets as select s.*, s.secret as decrypted_secret from vault.secrets s;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description, key_id) values (new_secret, new_name, new_description, new_key_id) returning id
$$;

-- pg_cron -----------------------------------------------------------------
create schema cron;
create table cron.job (
  jobid bigserial primary key, schedule text not null, command text not null,
  nodename text not null default 'localhost', nodeport integer not null default 5432,
  database text not null default 'postgres', username text not null default current_user,
  active boolean not null default true, jobname text,
  -- pg_cron 1.6 (production) keys jobs on (jobname, username).
  constraint jobname_username_uniq unique (jobname, username)
);
create table cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid integer, database text, username text, command text,
  status text, return_message text, start_time timestamptz, end_time timestamptz
);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare id bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict on constraint jobname_username_uniq do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into id;
  return id;
end
$$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name and username = current_user returning 1) select exists (select 1 from d)
$$;
create function cron.alter_job(job_id bigint, schedule text default null, command text default null,
  database text default null, username text default null, active boolean default null)
returns void language plpgsql as $$
begin
  update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command),
    database = coalesce(alter_job.database, j.database), username = coalesce(alter_job.username, j.username),
    active = coalesce(alter_job.active, j.active)
  where j.jobid = job_id;
  if not found then raise exception 'Could not find valid entry for job %', job_id; end if;
end
$$;

-- pg_net ------------------------------------------------------------------
create schema net;
create table net._http_response (id bigint, status_code integer, content text, created timestamptz not null default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;

-- realtime and migration ledger --------------------------------------------
create schema realtime;
create publication supabase_realtime;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
