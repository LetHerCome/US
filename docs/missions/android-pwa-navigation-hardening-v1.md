# Missione android-pwa-navigation-hardening-v1

## Problema

Su Android PWA, in alcuni cold launch/refresh può comparire per un attimo una pagina browser "non trovata/non disponibile" e poi US si riprende al tentativo successivo.

Cloudflare Pages usa già il fallback SPA di default perché il bundle non pubblica un 404.html top-level. Il rischio concreto è quindi nel Service Worker: con documento shell assente/evitto e prima navigazione transitoriamente 404/offline, il vecchio ramo poteva risolvere senza una Response valida.

## Fix

- riuso robusto di /index.html o / dalla shell corrente e, come fallback, da altre shell;
- retry singolo sul documento canonico /index.html quando la navigazione originale fallisce o torna non-ok/redirect;
- stessa protezione sul percorso di update ?us-refresh=...;
- fallback HTML 503 valido invece di Response mancante/browser error page quando rete e cache sono entrambe indisponibili;
- nessuna modifica a Supabase, routing interno, auth o dati.

## Test

- cache documenti assente + primo 404 -> recupero tramite /index.html canonico;
- cache documenti assente + rete offline -> Response HTML 503 valida;
- regressioni Service Worker esistenti;
- suite completa;
- Cloudflare Pages build;
- Capacitor Windows build;
- git diff --check.

## Build

us-android-pwa-navigation-hardening-v1-20261005-1
