const BUILD_ID = "us-native-notifications-v1-20261006-1";
const SHELL_CACHE_PREFIX = "us-shell-";
const LEGACY_SHELL_CACHE_PREFIX = "us-shell-static-runtime-";
const CACHE_NAME = `${SHELL_CACHE_PREFIX}${BUILD_ID}`;
const MEDIA_CACHE_NAME = "us-private-media-v1";
const versioned = (path) => `${path}?v=${encodeURIComponent(BUILD_ID)}`;

const APP_SHELL = [
  "/",
  "/index.html",
  versioned("/auth-storage.js"),
  versioned("/platform.js"),
  versioned("/app-lock.js"),
  versioned("/app-lock.css"),
  versioned("/notifications.js"),
  versioned("/widgets.js"),
  versioned("/widget-hub.js"),
  versioned("/widget-hub.css"),
  versioned("/app.js"),
  versioned("/stories.js"),
  versioned("/stories.css"),
  versioned("/left-for-you.js"),
  versioned("/left-for-you.css"),
  versioned("/calendar-domain.js"),
  versioned("/calendar.css"),
  versioned("/state-system.css"),
  versioned("/auth-first-run.css"),
  versioned("/auth-first-run.js"),
  versioned("/calendar.js"),
  "/assets/third-party/spotify/spotify-full-logo-white.svg",
  versioned("/styles.css"),
  versioned("/ui-foundation.css"),
  versioned("/ui-foundation.js"),
  versioned("/fix4.css"),
  versioned("/fix4.js"),
  versioned("/fastboot2.js"),
  versioned("/events.css"),
  versioned("/events.js"),
  versioned("/moments-albums.css"),
  versioned("/moments-albums.js"),
  versioned("/navigation.js"),
  versioned("/games.css"),
  versioned("/games.js"),
  versioned("/progression.css"),
  versioned("/progression.js"),
  versioned("/countdown.css"),
  versioned("/countdown.js"),
  versioned("/pet.css"),
  versioned("/pet.js"),
  versioned("/home-cleanup.js"),
  versioned("/settings.css"),
  versioned("/settings.js"),
  versioned("/identity.css"),
  versioned("/identity.js"),
  versioned("/settings2.css"),
  versioned("/polish4.css"),
  versioned("/polish4.js"),
  "/assets/derived/runtime/us-symbol-256-v1.png",
  "/assets/derived/runtime/us-icon-settings-128-v1.png",
  "/assets/derived/runtime/us-icon-stories-128-v1.png",
  "/assets/fonts/Inter-Variable.woff2",
  "/assets/fonts/Newsreader-Variable.woff2",
  "/assets/icons/phosphor/house-regular.svg",
  "/assets/icons/phosphor/house-fill.svg",
  "/assets/icons/phosphor/heart-straight-regular.svg",
  "/assets/icons/phosphor/heart-straight-fill.svg",
  "/assets/icons/phosphor/images-regular.svg",
  "/assets/icons/phosphor/images-fill.svg",
  "/assets/icons/phosphor/cards-three-regular.svg",
  "/assets/icons/phosphor/game-controller-regular.svg",
  "/assets/icons/phosphor/game-controller-fill.svg",
  "/assets/icons/phosphor/calendar-dots-regular.svg",
  "/assets/icons/phosphor/question-regular.svg",
  "/assets/icons/phosphor/infinity-regular.svg",
  "/assets/icons/phosphor/compass-regular.svg",
  "/assets/icons/phosphor/flag-banner-regular.svg",
  "/assets/icons/phosphor/caret-left-regular.svg",
  "/assets/icons/phosphor/envelope-simple-regular.svg",
  "/assets/icons/phosphor/envelope-open-regular.svg",
  "/assets/icons/phosphor/sparkle-regular.svg",
  "/assets/icons/phosphor/sparkle-fill.svg",
  "/assets/icons/phosphor/feather-regular.svg",
  "/assets/icons/phosphor/lock-simple-regular.svg",
  "/assets/icons/phosphor/binoculars-regular.svg",
  "/assets/icons/phosphor/arrows-left-right-regular.svg",
  "/assets/icons/phosphor/smiley-regular.svg",
  "/assets/icons/phosphor/eye-regular.svg",
  "/assets/icons/phosphor/clock-counter-clockwise-regular.svg",
  "/assets/icons/phosphor/signpost-regular.svg",
  "/assets/icons/phosphor/x-regular.svg",
  "/assets/icons/phosphor/caret-right-regular.svg",
  "/assets/icons/phosphor/caret-down-regular.svg",
  "/assets/icons/phosphor/plus-regular.svg",
  "/assets/icons/phosphor/bell-regular.svg",
  "/assets/icons/phosphor/squares-four-regular.svg",
  "/assets/icons/phosphor/map-pin-regular.svg",
  "/assets/icons/phosphor/arrows-clockwise-regular.svg",
  "/assets/icons/phosphor/user-circle-regular.svg",
  "/assets/icons/phosphor/image-regular.svg",
  "/assets/icons/phosphor/calendar-heart-regular.svg",
  "/assets/icons/phosphor/check-regular.svg",
  "/assets/icons/phosphor/music-note-regular.svg",
  "/assets/icons/phosphor/pencil-simple-regular.svg",
  "/assets/icons/profile-off.svg",
  "/assets/icons/profile-on.svg",
  "/assets/icons/think-off.svg",
  "/assets/icons/think-on.svg",
  "/version.json",
  versioned("/manifest.webmanifest"),
  versioned("/icon-192.png"),
  versioned("/icon-512.png"),
  versioned("/apple-touch-icon.png")
];

// Every other APP_SHELL entry was fetched fresh (cache: "reload") when this
// build installed and cannot change inside the build: serving it cache-first
// avoids re-downloading identical bytes in the background on every launch.
const BUILD_SHELL_ASSETS = new Set(
  APP_SHELL.filter((path) => path !== "/" && path !== "/index.html" && path !== "/version.json")
);

// The app document is stored by hand, never through addAll(): Cloudflare Pages
// answers /index.html with a 308 to /, and a Response that remembers a
// redirect is rejected when it is replayed for a navigation. Chrome/Android
// then shows its own "Impossibile raggiungere il sito" page (ERR_FAILED) and
// Safari reports "Response served by service worker has redirections".
const APP_DOCUMENTS = new Set(["/", "/index.html"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const documentResponse = await usStorableAppDocument(
      await fetch(new Request("/", { cache: "reload" }))
    );
    if (!documentResponse) throw new Error("app document unavailable during install");
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL
      .filter((url) => !APP_DOCUMENTS.has(url))
      .map((url) => new Request(url, { cache: "reload" }));
    await cache.addAll(requests);
    await cache.put("/", documentResponse.clone());
    await cache.put("/index.html", documentResponse);
    await self.skipWaiting();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "US_SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => {
              if (usIsIOSWebKit() && key === MEDIA_CACHE_NAME) return true;
              return key !== CACHE_NAME &&
                key !== MEDIA_CACHE_NAME &&
                (key.startsWith(SHELL_CACHE_PREFIX) || key.startsWith(LEGACY_SHELL_CACHE_PREFIX));
            })
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Native Notifications V1: a notification can only name an allow-listed US
// surface. Its URL is always rebuilt here, same-origin; a payload URL is never opened.
const US_PUSH_TARGETS = ["home", "today", "think", "left_for_you", "quiz", "bond", "calendar"];
const usPushTarget = (value) => (US_PUSH_TARGETS.includes(value) ? value : "home");
const usPushUrl = (target) => `/?open=${encodeURIComponent(usPushTarget(target))}&from=push`;

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data?.text?.() || "Hai qualcosa di nuovo su US. ♡" }; } catch (_e) {}
  }
  const title = data.title || "US.";
  const options = {
    body: data.body || "Hai qualcosa di nuovo su US. ♡",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "us-notification",
    renotify: false,
    data: {
      target: usPushTarget(data.target),
      url: usPushUrl(data.target)
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = usPushTarget(data.target);
  const targetUrl = new URL(usPushUrl(target), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "US_PUSH_NAVIGATE", target });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

function usStoragePathFromUrl(url) {
  const marker = "/storage/v1/object/sign/us-media/";
  const index = url.pathname.indexOf(marker);
  if (index < 0) return null;
  try {
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch (_) {
    return url.pathname.slice(index + marker.length);
  }
}

function usMediaCacheRequest(path) {
  return new Request(
    `${self.location.origin}/__us_media_cache__?path=${encodeURIComponent(path)}`
  );
}

async function usPruneMediaCache(cache, maxEntries = 100) {
  try {
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const remove = keys.slice(0, keys.length - maxEntries);
    await Promise.all(remove.map((key) => cache.delete(key)));
  } catch (_) {}
}

async function usBestEffortCachePut(cacheName, key, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
  } catch (_) {
    // CacheStorage is an optimization after install. A successful network
    // response must remain usable even when Safari refuses a cache write.
  }
}

function usIsIOSWebKit() {
  const ua = String(self.navigator?.userAgent || "");
  return /iPad|iPhone|iPod/i.test(ua) || /Macintosh/i.test(ua) && /Mobile\//i.test(ua);
}

function usSafeNavigationResponse(response) {
  return Boolean(
    response &&
    response.ok &&
    !response.redirected &&
    response.type !== "opaqueredirect"
  );
}

async function usFetchNavigation(request, { noCacheHeader = false } = {}) {
  const response = await fetch(request, {
    cache: "no-store",
    redirect: "follow",
    ...(noCacheHeader ? { headers: { "Cache-Control": "no-cache" } } : {})
  });

  // Safari/iOS rejects redirected responses returned by a Service Worker for
  // navigations ("Response served by service worker has redirections").
  // Never cache or serve such a response as the app document.
  if (!usSafeNavigationResponse(response)) {
    throw new Error("unsafe redirected navigation response");
  }
  return response;
}

// A document is replayable for a navigation only when it is a plain, final
// 200. A same-origin redirect onto the app document itself (/index.html -> /)
// is rebuilt as a fresh Response: same bytes and headers, no redirect memory.
// Anything else redirected (another origin, another path) is refused.
async function usStorableAppDocument(response) {
  if (!response || !response.ok || response.type === "opaqueredirect") return null;
  if (!response.redirected) return response;
  let finalUrl;
  try { finalUrl = new URL(response.url); } catch (_) { return null; }
  if (finalUrl.origin !== self.location.origin || !APP_DOCUMENTS.has(finalUrl.pathname)) return null;
  try {
    const body = await response.blob();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (_) {
    return null;
  }
}

// Only a document of this very build may become this build's cached shell.
// A newer index.html written into an older shell cache would reference asset
// URLs that the older worker never precached: online it works by luck,
// offline (or on a flaky reopen) it starts as a broken, half-loaded app.
async function usCacheDocumentForThisBuild(response) {
  try {
    const text = await response.clone().text();
    if (!text.includes(`name="us-build" content="${BUILD_ID}"`)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put("/index.html", response);
  } catch (_) {
    // CacheStorage is an optimization after install (Safari may refuse it).
  }
}

async function usCachedAppDocument() {
  const candidates = [];
  try {
    const current = await caches.open(CACHE_NAME);
    candidates.push(() => current.match("/index.html"), () => current.match("/"));
  } catch (_) {}
  candidates.push(() => caches.match("/index.html"), () => caches.match("/"));

  for (const read of candidates) {
    try {
      // Shell caches written by earlier builds may still hold a redirected
      // copy: never hand one of those to the browser as it is.
      const usable = await usStorableAppDocument(await read());
      if (usable) return usable;
    } catch (_) {}
  }
  return null;
}

async function usFetchCanonicalAppDocument() {
  // "/" is the canonical document: "/index.html" is itself a redirect on
  // Cloudflare Pages, so retrying it could never succeed there.
  const request = new Request(new URL("/", self.location.origin).href, { method: "GET" });
  return usFetchNavigation(request, { noCacheHeader: true });
}

async function usFetchAppDocument(request, options = {}) {
  try {
    return await usFetchNavigation(request, options);
  } catch (firstError) {
    // Android/Chrome may resume a standalone PWA before its previous document
    // is available in CacheStorage or while the first navigation briefly
    // returns an error. Retry against the canonical app document once instead
    // of letting the navigation resolve without a Response.
    try {
      return await usFetchCanonicalAppDocument();
    } catch (_) {
      throw firstError;
    }
  }
}

function usNavigationUnavailableResponse() {
  // Last resort only (no network and no usable cached shell). It is still a
  // real US page: it retries by itself when the connection comes back and
  // offers one explicit retry, instead of leaving the browser error page.
  return new Response(
    '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>US</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08040e;color:#fff;font:16px system-ui"><main style="padding:24px;text-align:center"><strong>US non è raggiungibile in questo momento.</strong><p style="opacity:.72">Controlla la connessione: riapro US appena torna.</p><button type="button" id="usRetry" style="min-height:44px;padding:0 22px;border-radius:22px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font:inherit">Riprova</button></main><script>(function(){var go=function(){location.reload();};document.getElementById("usRetry").addEventListener("click",go);addEventListener("online",go,{once:true});})();</script></body></html>',
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Private immutable media cache. Supabase signed URLs change, but the
  // underlying storage path does not. Cache by storage path, not by token.
  const supabaseStoragePath = usStoragePathFromUrl(url);
  if (
    !usIsIOSWebKit() &&
    url.origin === "https://iiakdfsxpywdkxravqjh.supabase.co" &&
    supabaseStoragePath &&
    request.destination === "image"
  ) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE_NAME);
      const key = usMediaCacheRequest(supabaseStoragePath);
      const cached = await cache.match(key);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok || response.type === "opaque") {
        const copy = response.clone();
        event.waitUntil((async () => {
          try {
            await cache.put(key, copy);
            await usPruneMediaCache(cache);
          } catch (_) {
            // CacheStorage is only an optimization. A cache write failure must
            // never turn a successful private-media network response into a
            // broken image, especially on Safari/iOS.
          }
        })());
      }
      return response;
    })());
    return;
  }

  // Fast Boot requests the last Home image by stable local storage path.
  if (url.origin === self.location.origin && url.pathname === "/__us_media_cache__") {
    event.respondWith((async () => {
      const path = url.searchParams.get("path");
      if (!path) return new Response("", { status: 404 });
      const cache = await caches.open(MEDIA_CACHE_NAME);
      return (await cache.match(usMediaCacheRequest(path))) ||
        new Response("", { status: 404, headers: { "Cache-Control": "no-store" } });
    })());
    return;
  }

  // Other third-party resources use their normal HTTP cache.
  if (url.origin !== self.location.origin) return;

  // Update detection must always see the freshest build marker.
  if (url.pathname === "/version.json") {
    const versionKey = new Request("/version.json");
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          event.waitUntil((async () => {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(versionKey, copy);
            } catch (_) {}
          })());
          return response;
        })
        .catch(() => caches.match(versionKey))
    );
    return;
  }

  // Explicit update requests MUST bypass the cached document.
  // fix4.js calls /?us-refresh=<timestamp> after registration.update().
  // Previously this branch still returned cached index.html, causing:
  // old BUILD -> new version.json -> update banner -> reload -> old BUILD -> loop.
  if (url.searchParams.has("us-refresh")) {
    event.respondWith((async () => {
      try {
        const response = await usFetchAppDocument(request, { noCacheHeader: true });
        event.waitUntil(usCacheDocumentForThisBuild(response.clone()));
        return response;
      } catch (_) {
        return (await usCachedAppDocument()) || usNavigationUnavailableResponse();
      }
    })());
    return;
  }

  // Normal cold launch remains cache-first for speed.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await usCachedAppDocument();
      const refresh = usFetchAppDocument(request)
        .then((response) => {
          event.waitUntil(usCacheDocumentForThisBuild(response.clone()));
          return response;
        });

      if (cached) {
        event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
        return cached;
      }

      try {
        return await refresh;
      } catch (_) {
        return (await usCachedAppDocument()) || usNavigationUnavailableResponse();
      }
    })());
    return;
  }

  // Assets tied to this build are immutable. Never overwrite them in-place:
  // a different BUILD_ID gets a different URL and a different shell cache.
  if (url.searchParams.get("v") === BUILD_ID) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) {
        event.waitUntil(usBestEffortCachePut(CACHE_NAME, request, response.clone()));
      }
      return response;
    })());
    return;
  }

  if (BUILD_SHELL_ASSETS.has(url.pathname + url.search)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(usBestEffortCachePut(CACHE_NAME, request, response.clone()));
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Static same-origin shell: stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const refresh = fetch(request)
      .then((response) => {
        event.waitUntil(usBestEffortCachePut(CACHE_NAME, request, response.clone()));
        return response;
      });

    if (cached) {
      event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
      return cached;
    }

    return refresh.catch(() => caches.match(request));
  })());
});
