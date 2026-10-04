# Frontend Change Checklist

Use only when the mission touches frontend behavior/UI.

- Identify the existing domain/UI authority before adding helpers.
- Preserve four-tab navigation and native/back behavior unless explicitly in scope.
- Reuse UI foundation and approved assets/icons.
- Mobile-first: Android PWA + iPhone PWA.
- Handle loading, empty, error and offline/reconnect states when relevant.
- Respect reduced motion and safe areas.
- Avoid permanent duplicate state in localStorage when server/domain state already exists.
- Run focused tests, `npm test`, `npm run build:cloudflare-pages`, `git diff --check`.
