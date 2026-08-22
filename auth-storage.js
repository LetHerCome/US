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

  function sessionExpiry(value) {
    if (!value) return 0;
    try {
      const parsed = JSON.parse(value);
      const expires = Number(
        parsed?.expires_at ||
        parsed?.currentSession?.expires_at ||
        parsed?.session?.expires_at ||
        0
      );
      return Number.isFinite(expires) ? expires : 0;
    } catch (_) {
      return 0;
    }
  }

  function readLegacyLocal(key) {
    try { return window.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function clearLegacyLocal(key) {
    try { window.localStorage.removeItem(key); } catch (_) {}
  }

  const durableAuthStorage = {
    async getItem(key) {
      let idbValue = null;
      let localValue = null;
      try { idbValue = await idbGet(key); } catch (_) {}
      localValue = readLegacyLocal(key);

      let chosen = idbValue;
      if (
        localValue !== null &&
        (idbValue === null || sessionExpiry(localValue) > sessionExpiry(idbValue))
      ) {
        chosen = localValue;
      }

      if (chosen !== null) {
        try {
          await idbSet(key, chosen);
          clearLegacyLocal(key);
        } catch (_) {
          try { window.localStorage.setItem(key, chosen); } catch (_) {}
        }
        return chosen;
      }
      return null;
    },

    async setItem(key, value) {
      try {
        await idbSet(key, value);
        // One canonical rotating-token copy: avoid stale refresh-token replay.
        clearLegacyLocal(key);
        return;
      } catch (_) {}

      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (_) {}

      throw new Error('Unable to persist US auth session');
    },

    async removeItem(key) {
      try { await idbRemove(key); } catch (_) {}
      clearLegacyLocal(key);
    }
  };

  window.usDurableAuthStorage = durableAuthStorage;

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  console.info('[US Auth] Persistenza PWA attiva');
})();
