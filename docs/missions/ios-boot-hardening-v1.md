# Mission — iOS Boot Hardening V1

**Status:** CANDIDATE
**Branch:** `hotfix/ios-boot-hardening-v1`

## Goal

Prevent the installed iOS PWA from appearing dead when Safari leaves IndexedDB/auth bootstrap pending before US reaches Supabase.

## Evidence

Production logs on 2026-10-04 showed the iPhone browser reaching Supabase normally earlier in the day, then no iPhone browser requests during the reported failure window while Android and the iOS Scriptable extension continued to reach the backend. This points to a client bootstrap failure before normal API traffic.

## Changes

- bound IndexedDB open/read/write/delete operations with deadlines;
- fail fast on IndexedDB `blocked` and close/reset the cached DB handle on version changes;
- preserve the existing localStorage fallback when IndexedDB is unavailable;
- bound both initial and retry `getSession()` calls;
- surface the login recovery path instead of leaving a returning device hidden indefinitely;
- bump the PWA build id so installed clients receive a new shell;
- add focused regression tests for hung/blocked IndexedDB and auth bootstrap deadlines.

## Out of scope

- Supabase schema/database changes;
- password recovery;
- CDN/vendor migration of `supabase-js`;
- Countdown;
- production deploy/merge.

## Verification

Required before review:
- focused iOS boot tests;
- existing service-worker/PWA tests;
- full `npm test`;
- `npm run build:cloudflare-pages`;
- `git diff --check`.
