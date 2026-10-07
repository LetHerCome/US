create or replace function public.set_moment_thumbnail(
  target_moment_id uuid,
  target_thumbnail_path text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  changed integer := 0;
begin
  if uid is null or cid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if target_moment_id is null
     or target_thumbnail_path is null
     or length(target_thumbnail_path) > 700
     or target_thumbnail_path not like cid::text || '/' || uid::text || '/derived-thumbnails/%'
     or target_thumbnail_path !~ '\.webp$'
     or position('..' in target_thumbnail_path) > 0 then
    raise exception using errcode = '22023', message = 'invalid thumbnail path';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'us-media'
      and o.name = target_thumbnail_path
      and o.owner_id = uid::text
  ) then
    raise exception using errcode = '22023', message = 'thumbnail object not owned by caller';
  end if;

  update public.moments m
     set thumbnail_path = target_thumbnail_path
   where m.id = target_moment_id
     and m.couple_id = cid
     and m.thumbnail_path is null;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.set_moment_thumbnail(uuid, text) from public;
revoke all on function public.set_moment_thumbnail(uuid, text) from anon;
grant execute on function public.set_moment_thumbnail(uuid, text) to authenticated;
