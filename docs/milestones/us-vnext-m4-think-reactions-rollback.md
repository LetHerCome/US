# M4 Ti penso reactions — rollback runbook

This runbook is not an automatic down migration. It requires an explicit approval because it deletes recipient reactions.

## Preferred behavioral rollback

1. Disable the M4 reaction UI/client path.
2. Keep `public.think_reactions` and its RPCs intact.
3. Preserve all existing `shared_messages`, widget tokens, receipts and pairing data.
4. Restore the previous client behavior that ignores reactions.

## Structural rollback

Only after an authoritative backup/export and explicit approval:

```sql
begin;
lock table public.think_reactions in access exclusive mode;

-- Abort rather than delete user reactions without an explicit data decision.
do $$
begin
  if exists (select 1 from public.think_reactions limit 1) then
    raise exception 'refusing structural rollback: think_reactions contains user data';
  end if;
end;
$$;

drop policy if exists think_reactions_select_couple_members on public.think_reactions;
revoke execute on function public.set_think_reaction(uuid, text) from authenticated;
revoke execute on function public.delete_think_reaction(uuid) from authenticated;
drop function if exists public.set_think_reaction(uuid, text);
drop function if exists public.delete_think_reaction(uuid);
drop table if exists public.think_reactions;

commit;
```

Never alter `shared_messages`, `claim_us_role`, Auth, widget RPCs or Realtime as part of this rollback.
