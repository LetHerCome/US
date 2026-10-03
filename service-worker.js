const BUILD_ID = "us-ios-media-self-healing-v1-20261003-1";
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
  versioned("/ti-penso-widget.js"),
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
  "/assets/icons/phosphor/cards-three-fill.svg",
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

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL.map((url) => new Request(url, { cache: "reload" }));
    await cache.addAll(requests);
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
      target: data.target || "home",
      url: data.url || "/?open=home&from=push"
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.target || "home";
  const targetUrl = new URL(data.url || `/?open=${encodeURIComponent(target)}&from=push`, self.location.origin).href;
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
        const response = await usFetchNavigation(request, { noCacheHeader: true });
        event.waitUntil((async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
          } catch (_) {}
        })());
        return response;
      } catch (_) {
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  // Normal cold launch remains cache-first for speed.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("/index.html");
      const refresh = usFetchNavigation(request)
        .then((response) => {
          event.waitUntil(usBestEffortCachePut(CACHE_NAME, "/index.html", response.clone()));
          return response;
        });

      if (cached) {
        event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
        return cached;
      }

      return refresh.catch(() => caches.match("/index.html"));
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
