# Supabase Change Checklist

Use only when the mission touches Supabase.

Before coding:
- read current Supabase changelog/docs for the affected feature;
- inspect existing schema/RPC/Realtime/Push authority.

Implementation:
- create forward migration with Supabase CLI;
- no production apply during normal repo implementation;
- exposed tables: RLS + explicit ownership/couple authorization;
- no authorization from user-editable metadata;
- no service-role/secret in browser code;
- UPDATE policies require correct SELECT/USING/WITH CHECK;
- SECURITY DEFINER only when justified, with pinned search_path and narrow grants;
- make client mutations narrow/idempotent when concurrent retries are possible.

Verification:
- same-couple positive path;
- cross-couple denial;
- duplicate/retry behavior;
- security advisors when relevant;
- focused migration tests + full suite/build.
