revoke all on table public.conserva_contributions
from public, anon, authenticated;

grant select on table public.conserva_contributions
to authenticated;
