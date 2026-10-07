alter table public.moments
  add column if not exists thumbnail_path text;

comment on column public.moments.thumbnail_path is
  'Optional lightweight private-media derivative for Ricordi cards. Full image remains in storage_path.';
