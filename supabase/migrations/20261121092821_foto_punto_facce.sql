-- Centrare le facce nelle foto (founder, 21/11/2026, grill-me D1–D13).
-- The phone that uploads a photo finds the faces on the device (MediaPipe,
-- photo-focus.js) and saves only the point to keep in view when the photo is
-- cropped: x and y in percent of the photo. No face data is stored. Null means
-- not looked at yet; 50/50 is the centre (also: no face found).
-- The author writes it through the existing *_update_own policies.

alter table public.moments
  add column if not exists focus_x smallint,
  add column if not exists focus_y smallint;

alter table public.moment_photos
  add column if not exists focus_x smallint,
  add column if not exists focus_y smallint;

alter table public.moments
  drop constraint if exists moments_focus_range,
  add constraint moments_focus_range check (
    (focus_x is null and focus_y is null)
    or (focus_x is not null and focus_y is not null and focus_x between 0 and 100 and focus_y between 0 and 100)
  );

alter table public.moment_photos
  drop constraint if exists moment_photos_focus_range,
  add constraint moment_photos_focus_range check (
    (focus_x is null and focus_y is null)
    or (focus_x is not null and focus_y is not null and focus_x between 0 and 100 and focus_y between 0 and 100)
  );

comment on column public.moments.focus_x is
  'Where to keep the photo in view when it is cropped, 0-100 from the left (faces found on the uploading phone). Null: not looked at yet.';
comment on column public.moments.focus_y is
  'Where to keep the photo in view when it is cropped, 0-100 from the top. Null: not looked at yet.';
comment on column public.moment_photos.focus_x is
  'Where to keep the album photo in view when it is cropped, 0-100 from the left. Null: not looked at yet.';
comment on column public.moment_photos.focus_y is
  'Where to keep the album photo in view when it is cropped, 0-100 from the top. Null: not looked at yet.';
