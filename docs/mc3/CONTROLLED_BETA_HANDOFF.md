# MC3 — controlled beta handoff

## Native notification gate — 2026-10-09

The latest MC3 client blocks B from registering/reactivating the native provider while an earlier account retirement is unresolved. This is **not proof that A notifications stopped arriving**. A valid server row plus a provider that did not complete unregister can still deliver A private alerts after local account change. Android PushNotifications 8.1.3 resolves unregister without awaiting Firebase deleteToken completion; cleared badges/tray and successful JS callbacks are insufficient evidence.

Do not clear shared-device native beta for full notification isolation yet. Before clearing that gate, prove A's server registration is removed with A's authenticated RPC or prove provider invalidation, then verify no A alert/body/action reaches the device as B. Execute physical FCM and APNs checks with offline/failed server revoke, failed/late provider unregister, queued alerts, network restoration after sign-out, stable APNs tokens, foreground/background/terminated processes and cold restart. If A cannot authenticate again, B has no authority to remove A's row with the current RPCs. Provider pruning is not an immediate guarantee. Any stronger backend/provider protocol requires separate authorization; this implementation made no Supabase changes. Keep native shared-account testing on controlled devices/accounts until this gate is evidenced.

See [current MC3 validation](MC3_VALIDATION.md) for the delivery-boundary counterexamples, integration results and remaining inherited test failures. The original provisioning handoff below is unchanged in scope.

This is an administrative handoff, not an executed provisioning procedure. MC3 creates no Auth accounts, changes no Auth settings, and keeps public signup disabled.

After separate authorization, the administrator must provision exactly two permanent beta accounts for the second couple. Obtain each person's email and desired display name through the controlled beta channel. Generate separate strong passwords in the administrator's password manager; deliver each credential only to its owner through the approved private channel. Do not put emails/passwords, invite tokens, privileged keys or provisioning responses in repository files, browser code, tickets, screenshots or logs.

Use the existing trusted server-side administration environment, with its existing secret handling. The documented Supabase Admin operation is `auth.admin.createUser({ email, password, email_confirm: true })`, once per person. Neither operation belongs in this frontend. Do not use anonymous accounts, user-editable metadata, a client service-role key, or public registration. See [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Before handing over credentials, verify through the trusted administration interface that both accounts have distinct IDs, confirmed email, `is_anonymous === false`, and no active ban. Verify they have no pre-created `profiles` membership. Do not insert profiles/couples/invites manually, assign compatibility slots, change grants/RLS, or enable signup. The deployed MC2 RPCs own eligibility and membership assignment.

The first person signs in with email/password, chooses **Crea il nostro US**, supplies their own display name and the second couple's actual start date, then creates an invite in the waiting screen. Only this explicit RPC response reveals the raw code. They send it privately to the second person, who signs in with their own account and chooses **Ho un codice d’invito**. The creator uses **Verifica accesso partner** to enter the paired app without signing out. Reopening waiting shows server status/expiry, never the previous code; replacing the invite invalidates it.

Before a real four-account beta, complete the separately authorized D5 deployment of `game-v2-push` and `game-v2-push-worker`, then physical PWA/Android QA across both couples: password restore, biometric cover/background, keyboard/safe areas, invite sharing, account switch/logout, widgets, sender names, push and notification taps, and tenant isolation. Keep the existing Couple A identities/data unchanged.

MC3 is a review candidate. No push, PR, merge, Cloudflare/Edge deploy, live Supabase change, or real user/couple/invite creation was performed during implementation.
