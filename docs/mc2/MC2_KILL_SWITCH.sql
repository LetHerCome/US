-- Review artifact only. Francesco may run this only with separate production approval.
-- Keeps completed couples and all USED legacy invites intact.
begin;
revoke execute on function public.create_couple(text,date,text),
  public.create_partner_invite(), public.revoke_partner_invite(),
  public.accept_partner_invite(text,text) from authenticated;
update public.couple_invites set revoked_at=clock_timestamp()
  where used_at is null and revoked_at is null;
commit;
