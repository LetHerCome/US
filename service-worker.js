const CACHE_NAME = "us-shell-v13";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

const AUTH_BOOTSTRAP = `
(() => {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('[US Auth] Supabase non disponibile');
    return;
  }

  const DB_NAME = 'us-pwa-auth';
  const STORE_NAME = 'sessions';
  let dbPromise = null;

  function openDb() {
    if (!('indexedDB' in window)) {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB open failed'));
    });

    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB read failed'));
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB write aborted'));
    });
  }

  async function idbRemove(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  }

  const durableAuthStorage = {
    async getItem(key) {
      try {
        const value = await idbGet(key);
        if (value !== null) return value;
      } catch (_) {}

      try {
        const legacyValue = window.localStorage.getItem(key);
        if (legacyValue !== null) {
          idbSet(key, legacyValue).catch(() => {});
          return legacyValue;
        }
      } catch (_) {}

      return null;
    },

    async setItem(key, value) {
      let persisted = false;

      try {
        await idbSet(key, value);
        persisted = true;
      } catch (_) {}

      try {
        window.localStorage.setItem(key, value);
        persisted = true;
      } catch (_) {}

      if (!persisted) {
        throw new Error('Unable to persist US auth session');
      }
    },

    async removeItem(key) {
      try { await idbRemove(key); } catch (_) {}
      try { window.localStorage.removeItem(key); } catch (_) {}
    }
  };

  const originalCreateClient =
    window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = (url, key, options = {}) => {
    return originalCreateClient(url, key, {
      ...options,
      auth: {
        ...(options.auth || {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: durableAuthStorage
      }
    });
  };

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  console.info('[US Auth] Persistenza PWA attiva');
})();
`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function transformedAppJs(request) {
  try {
    const networkResponse = await fetch(request, { cache: "no-store" });

    if (!networkResponse.ok) throw new Error("app.js network error");

    const originalJs = await networkResponse.text();
    const combinedJs = AUTH_BOOTSTRAP + "\n\n" + originalJs;

    const response = new Response(combinedJs, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/app.js") {
    event.respondWith(transformedAppJs(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put("/index.html", copy)
          );
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) =>
          cache.put(request, copy)
        );
        return response;
      })
      .catch(() => caches.match(request))
  );
});
