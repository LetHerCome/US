const CACHE_NAME = "us-shell-static-runtime-17";
const MEDIA_CACHE_NAME = "us-private-media-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/auth-storage.js",
  "/platform.js",
  "/ti-penso-widget.js",
  "/app.js",
  "/stories.js",
  "/stories.css",
  "/styles.css",
  "/ui-foundation.css",
  "/ui-foundation.js",
  "/fix4.css",
  "/fix4.js",
  "/fastboot2.js",
  "/events.css",
  "/events.js",
  "/moments-albums.css",
  "/moments-albums.js",
  "/navigation.js",
  "/games.css",
  "/games.js",
  "/settings.css",
  "/settings.js",
  "/identity.css",
  "/identity.js",
  "/settings2.css",
  "/polish4.css",
  "/polish4.js",
  "/assets/brand/us-wordmark-premium.svg",
  "/assets/icons/home-off.svg",
  "/assets/icons/home-on.svg",
  "/assets/icons/moments-off.svg",
  "/assets/icons/moments-on.svg",
  "/assets/icons/quiz-off.svg",
  "/assets/icons/quiz-on.svg",
  "/assets/icons/bond-off.svg",
  "/assets/icons/bond-on.svg",
  "/assets/icons/settings-off.svg",
  "/assets/icons/settings-on.svg",
  "/assets/icons/stories-off.svg",
  "/assets/icons/stories-on.svg",
  "/assets/icons/calendar-off.svg",
  "/assets/icons/calendar-on.svg",
  "/assets/icons/profile-off.svg",
  "/assets/icons/profile-on.svg",
  "/assets/icons/add-off.svg",
  "/assets/icons/add-on.svg",
  "/assets/icons/think-off.svg",
  "/assets/icons/think-on.svg",
  "/assets/source/ui/us-icon-bond-v1.png",
  "/assets/source/ui/us-icon-stories-v1.png",
  "/assets/source/ui/us-icon-moments-v1.png",
  "/assets/source/ui/us-icon-daily-question-v1.png",
  "/assets/source/ui/us-icon-ti-penso-v1.png",
  "/assets/source/ui/us-icon-settings-v1.png",
  "/version.json",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== MEDIA_CACHE_NAME)
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

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Private immutable media cache. Supabase signed URLs change, but the
  // underlying storage path does not. Cache by storage path, not by token.
  const supabaseStoragePath = usStoragePathFromUrl(url);
  if (
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
        await cache.put(key, response.clone());
        event.waitUntil(usPruneMediaCache(cache));
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
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          );
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Explicit update requests MUST bypass the cached document.
  // fix4.js calls /?us-refresh=<timestamp> after registration.update().
  // Previously this branch still returned cached index.html, causing:
  // old BUILD -> new version.json -> update banner -> reload -> old BUILD -> loop.
  if (request.mode === "navigate" && url.searchParams.has("us-refresh")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        if (!response.ok) throw new Error("refresh navigation failed");

        const cache = await caches.open(CACHE_NAME);
        await cache.put("/index.html", response.clone());
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
      const refresh = fetch(request, { cache: "no-store" })
        .then(async (response) => {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/index.html", copy);
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

  // Static same-origin shell: stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const refresh = fetch(request)
      .then(async (response) => {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, copy);
        return response;
      });

    if (cached) {
      event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
      return cached;
    }

    return refresh.catch(() => caches.match(request));
  })());
});
