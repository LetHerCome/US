(function initUsReliability(globalScope, factory) {
  const api = factory(globalScope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalScope.UsReliability = api;
})(typeof window !== 'undefined' ? window : globalThis, function createUsReliability(globalScope) {
  'use strict';

  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const STATES = new Set(['pending', 'sending', 'retryable', 'confirmed', 'failed']);
  const NON_TERMINAL_STATES = new Set(['pending', 'sending', 'retryable']);
  const CLAIMABLE_STATES = new Set(['pending', 'retryable']);
  const TERMINAL_STATES = new Set(['confirmed', 'failed']);
  const STORAGE_PREFIX = 'us:mutations:v1:';
  const fallbackLockManagers = new WeakMap();

  class ReliabilityStorageError extends Error {
    constructor(operation, key, cause) {
      super(`Reliability storage ${operation} failed for ${key}`, { cause });
      this.name = 'ReliabilityStorageError';
      this.code = 'RELIABILITY_STORAGE_ERROR';
      this.operation = operation;
      this.storageKey = key;
    }
  }

  class ReliabilityNamespaceInvalidatedError extends Error {
    constructor(accountId) {
      super(`Reliability namespace was invalidated for ${accountId}`);
      this.name = 'ReliabilityNamespaceInvalidatedError';
      this.code = 'NAMESPACE_INVALIDATED';
      this.accountId = accountId;
    }
  }

  class ReliabilityCoordinationError extends Error {
    constructor() {
      super('Web Locks are required for durable cross-context reliability');
      this.name = 'ReliabilityCoordinationError';
      this.code = 'RELIABILITY_COORDINATION_UNAVAILABLE';
    }
  }

  function createOperationId() {
    const id = globalScope.crypto?.randomUUID?.();
    if (UUID_V4.test(id || '')) return id;
    const bytes = new Uint8Array(16);
    if (!globalScope.crypto?.getRandomValues) throw new Error('Secure UUID generation is unavailable');
    globalScope.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function normalizeOperation(input, now = Date.now) {
    const operationId = input?.operationId || createOperationId();
    if (!UUID_V4.test(operationId)) throw new TypeError('operationId must be a UUID v4');
    const domain = String(input?.domain || '').trim();
    if (!domain || domain.length > 80) throw new TypeError('domain is required');
    return {
      operationId,
      domain,
      payload: input?.payload ?? {},
      state: STATES.has(input?.state) ? input.state : 'pending',
      attempts: Math.max(0, Number(input?.attempts) || 0),
      createdAt: Number(input?.createdAt) || now(),
      updatedAt: Number(input?.updatedAt) || now(),
      nextRetryAt: Number(input?.nextRetryAt) || 0,
      claimToken: UUID_V4.test(input?.claimToken || '') ? input.claimToken : null,
      claimExpiresAt: Math.max(0, Number(input?.claimExpiresAt) || 0),
      result: input?.result ?? null,
      error: input?.error ?? null,
    };
  }

  function cloneOperation(item) {
    return { ...item };
  }

  function createSerialLockManager() {
    const rails = new Map();
    return {
      request(name, callback) {
        const previous = rails.get(name) || Promise.resolve();
        const current = previous.catch(() => {}).then(callback);
        const tracked = current.catch(() => {}).finally(() => {
          if (rails.get(name) === tracked) rails.delete(name);
        });
        rails.set(name, tracked);
        return current;
      },
    };
  }

  function browserLocalStorage() {
    try { return globalScope.localStorage; } catch (_) { return null; }
  }

  function resolveStorage(explicitStorage) {
    if (explicitStorage) return explicitStorage;
    let storage;
    try { storage = globalScope.localStorage; } catch (error) {
      throw new ReliabilityStorageError('access', 'localStorage', error);
    }
    if (!storage) throw new ReliabilityStorageError('access', 'localStorage', new Error('localStorage is unavailable'));
    return storage;
  }

  function resolveLockManager(storage, explicitLockManager) {
    if (explicitLockManager?.request) return explicitLockManager;
    if (globalScope.navigator?.locks?.request) return globalScope.navigator.locks;

    // Tests and non-browser adapters share a process-local serial rail. Real
    // browser localStorage must never claim cross-tab durability without Web Locks.
    if (storage === browserLocalStorage()) throw new ReliabilityCoordinationError();
    let manager = fallbackLockManagers.get(storage);
    if (!manager) {
      manager = createSerialLockManager();
      fallbackLockManagers.set(storage, manager);
    }
    return manager;
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch (error) { throw new ReliabilityStorageError('read', key, error); }
  }

  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (error) { throw new ReliabilityStorageError('write', key, error); }
  }

  function safeRemove(storage, key) {
    try { storage.removeItem(key); } catch (error) { throw new ReliabilityStorageError('remove', key, error); }
  }

  function accountKeys(accountId) {
    const encodedAccount = encodeURIComponent(accountId);
    return {
      queuePrefix: `${STORAGE_PREFIX}${encodedAccount}:`,
      epochKey: `${STORAGE_PREFIX}epoch:${encodedAccount}`,
      lockName: `${STORAGE_PREFIX}lock:${encodedAccount}`,
    };
  }

  function readEpoch(storage, epochKey) {
    const raw = safeGet(storage, epochKey);
    if (raw === null) return 0;
    const epoch = Number(raw);
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new ReliabilityStorageError('read', epochKey, new Error('Invalid reliability epoch'));
    }
    return epoch;
  }

  function enumerateStorageKeys(storage) {
    try {
      if (!Number.isInteger(storage.length) || typeof storage.key !== 'function') {
        throw new Error('Storage key enumeration is unavailable');
      }
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string') keys.push(key);
      }
      return keys;
    } catch (error) {
      if (error instanceof ReliabilityStorageError) throw error;
      throw new ReliabilityStorageError('enumerate', STORAGE_PREFIX, error);
    }
  }

  /*
   * Concurrency model: every account namespace mutation is serialized by the
   * browser Web Locks API. The lock is released while a remote replay handler
   * is awaited; completion reacquires it, reloads the latest revision, and
   * patches only its operation. This merge prevents a concurrent enqueue from
   * being overwritten. An account epoch is a durable fencing token: clear
   * advances it before removal, so late completions and stale queue instances
   * cannot resurrect invalidated data. Node/custom-storage tests use one shared
   * in-process lock rail; browser/PWA/Capacitor localStorage fails closed when
   * Web Locks are unavailable rather than claiming durable coordination.
   */
  async function invalidateMutationNamespace(options = {}) {
    const storage = resolveStorage(options.storage);
    const accountId = String(options.accountId || '');
    if (!accountId) throw new TypeError('accountId is required');
    const lockManager = resolveLockManager(storage, options.lockManager);
    const { queuePrefix, epochKey, lockName } = accountKeys(accountId);

    return lockManager.request(lockName, async () => {
      const nextEpoch = readEpoch(storage, epochKey) + 1;
      safeSet(storage, epochKey, String(nextEpoch));
      const failures = [];
      for (const key of enumerateStorageKeys(storage)) {
        if (!key.startsWith(queuePrefix)) continue;
        try { safeRemove(storage, key); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw failures[0];
      return nextEpoch;
    });
  }

  function parseStoredSnapshot(raw, currentEpoch, maxAttempts, now) {
    if (raw === null) return { revision: 0, epoch: currentEpoch, items: [] };
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) {
      throw new ReliabilityStorageError('read', 'queue', error);
    }

    let revision = 0;
    let storedEpoch = currentEpoch;
    let storedItems = parsed;
    if (Array.isArray(parsed) && currentEpoch !== 0) {
      return { revision: 0, epoch: currentEpoch, items: [] };
    }
    if (!Array.isArray(parsed)) {
      if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.items)) {
        throw new ReliabilityStorageError('read', 'queue', new Error('Invalid reliability queue payload'));
      }
      revision = Math.max(0, Number(parsed.revision) || 0);
      storedEpoch = Math.max(0, Number(parsed.epoch) || 0);
      storedItems = parsed.items;
    }
    if (storedEpoch !== currentEpoch) return { revision, epoch: currentEpoch, items: [] };

    try {
      return {
        revision,
        epoch: currentEpoch,
        items: storedItems.map((entry) => {
          const operation = normalizeOperation(entry, now);
          if (operation.state !== 'sending') return operation;
          if (operation.claimToken && operation.claimExpiresAt > now()) return operation;
          if (operation.attempts >= maxAttempts) {
            // No authoritative receipt reconciliation is available locally. An
            // expired final lease therefore fails closed instead of remaining
            // permanently non-replayable or reusable as an in-flight send.
            return {
              ...operation,
              state: 'failed',
              nextRetryAt: 0,
              claimToken: null,
              claimExpiresAt: 0,
              error: 'Interrupted after final send attempt; remote receipt was not reconciled',
              updatedAt: now(),
            };
          }
          return {
            ...operation,
            state: 'retryable',
            nextRetryAt: 0,
            claimToken: null,
            claimExpiresAt: 0,
            error: operation.error || 'Interrupted before confirmation',
          };
        }),
      };
    } catch (error) {
      if (error instanceof ReliabilityStorageError) throw error;
      throw new ReliabilityStorageError('read', 'queue', error);
    }
  }

  function pruneTerminalItems(items, nowValue, maxAgeMs, maxCount) {
    const cutoff = nowValue - maxAgeMs;
    const active = items.filter((item) => !TERMINAL_STATES.has(item.state));
    const terminal = items
      .filter((item) => TERMINAL_STATES.has(item.state) && item.updatedAt >= cutoff)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, maxCount);
    return [...active, ...terminal].sort((left, right) => left.createdAt - right.createdAt);
  }

  function createMutationQueue(options = {}) {
    const storage = resolveStorage(options.storage);
    const accountId = String(options.accountId || '');
    const coupleId = String(options.coupleId || '');
    if (!accountId || !coupleId) throw new TypeError('accountId and coupleId are required');
    const lockManager = resolveLockManager(storage, options.lockManager);
    const now = options.now || Date.now;
    const maxAttempts = Math.max(1, Math.min(8, Number(options.maxAttempts) || 3));
    const claimLeaseMs = Math.max(1, Math.min(5 * 60 * 1000, Number(options.claimLeaseMs) || 30000));
    const requestedTerminalAge = Number(options.terminalMaxAgeMs);
    const requestedTerminalCount = Number(options.terminalMaxCount);
    const terminalMaxAgeMs = options.terminalMaxAgeMs == null || !Number.isFinite(requestedTerminalAge)
      ? 7 * 24 * 60 * 60 * 1000
      : Math.max(0, requestedTerminalAge);
    const terminalMaxCount = options.terminalMaxCount == null || !Number.isFinite(requestedTerminalCount)
      ? 50
      : Math.max(0, Math.min(500, Math.floor(requestedTerminalCount)));
    const { queuePrefix, epochKey, lockName } = accountKeys(accountId);
    const storageKey = `${queuePrefix}${encodeURIComponent(coupleId)}`;
    const initialEpoch = readEpoch(storage, epochKey);
    const eventTarget = options.eventTarget === undefined ? globalScope : options.eventTarget;
    const onExternalChange = typeof options.onExternalChange === 'function' ? options.onExternalChange : null;
    const onObservationError = typeof options.onObservationError === 'function' ? options.onObservationError : (() => {});
    let invalidated = false;
    let replayInFlight = null;
    let storageListener = null;

    function readSnapshot() {
      const epoch = readEpoch(storage, epochKey);
      if (epoch !== initialEpoch) throw new ReliabilityNamespaceInvalidatedError(accountId);
      let snapshot;
      try { snapshot = parseStoredSnapshot(safeGet(storage, storageKey), epoch, maxAttempts, now); } catch (error) {
        if (error instanceof ReliabilityStorageError && error.storageKey === 'queue') error.storageKey = storageKey;
        throw error;
      }
      snapshot.items = pruneTerminalItems(snapshot.items, now(), terminalMaxAgeMs, terminalMaxCount);
      return snapshot;
    }

    let items = readSnapshot().items;

    function reportObservationError(error) {
      try { onObservationError(error); } catch (_) {}
    }

    function stopStorageObservation() {
      if (!storageListener) return;
      try { eventTarget.removeEventListener('storage', storageListener); } catch (error) { reportObservationError(error); }
      storageListener = null;
    }

    function notifyExternalChange() {
      if (!onExternalChange) return;
      try {
        const result = onExternalChange();
        result?.catch?.(reportObservationError);
      } catch (error) { reportObservationError(error); }
    }

    function handleStorageEvent(event) {
      if (invalidated || (event?.storageArea && event.storageArea !== storage)) return;
      if (event?.key !== storageKey && event?.key !== epochKey) return;
      try {
        if (event.key === epochKey) {
          if (!observeCurrentEpoch()) stopStorageObservation();
          return;
        }
        items = readSnapshot().items;
        notifyExternalChange();
      } catch (error) {
        if (error?.code === 'NAMESPACE_INVALIDATED') {
          invalidated = true;
          items = [];
          stopStorageObservation();
          return;
        }
        reportObservationError(error);
      }
    }

    if (eventTarget?.addEventListener && eventTarget?.removeEventListener) {
      storageListener = handleStorageEvent;
      try { eventTarget.addEventListener('storage', storageListener); } catch (error) {
        storageListener = null;
        reportObservationError(error);
      }
    }

    function assertCurrentEpoch() {
      if (invalidated || readEpoch(storage, epochKey) !== initialEpoch) {
        invalidated = true;
        items = [];
        stopStorageObservation();
        throw new ReliabilityNamespaceInvalidatedError(accountId);
      }
    }

    function observeCurrentEpoch() {
      if (!invalidated && readEpoch(storage, epochKey) === initialEpoch) return true;
      invalidated = true;
      items = [];
      stopStorageObservation();
      return false;
    }

    function writeSnapshot(snapshot) {
      const next = {
        version: 2,
        revision: snapshot.revision + 1,
        epoch: initialEpoch,
        items: pruneTerminalItems(snapshot.items, now(), terminalMaxAgeMs, terminalMaxCount),
      };
      safeSet(storage, storageKey, JSON.stringify(next));
      items = next.items;
      return next;
    }

    function withAccountLock(callback) {
      return lockManager.request(lockName, async () => {
        assertCurrentEpoch();
        return callback(readSnapshot());
      });
    }

    function enqueue(input, enqueueOptions = {}) {
      return withAccountLock((snapshot) => {
        if (enqueueOptions.reuseNonTerminal) {
          const reusable = snapshot.items.find((item) => item.domain === String(input?.domain || '').trim() && NON_TERMINAL_STATES.has(item.state));
          if (reusable) {
            items = snapshot.items;
            return cloneOperation(reusable);
          }
        }
        const operation = normalizeOperation(input, now);
        const existing = snapshot.items.find((item) => item.operationId === operation.operationId);
        if (existing) {
          items = snapshot.items;
          return cloneOperation(existing);
        }
        snapshot.items.push(operation);
        writeSnapshot(snapshot);
        return cloneOperation(operation);
      });
    }

    function settleOperation(operationId, attempts, claimToken, response, handlerError) {
      return withAccountLock((snapshot) => {
        const index = snapshot.items.findIndex((item) => item.operationId === operationId);
        if (index < 0) return null;
        const current = snapshot.items[index];
        if (TERMINAL_STATES.has(current.state)
          || current.state !== 'sending'
          || current.attempts !== attempts
          || current.claimToken !== claimToken) {
          items = snapshot.items;
          return cloneOperation(current);
        }
        const failed = attempts >= maxAttempts;
        const confirmed = !handlerError && response?.confirmed === true;
        const delay = Math.min(30000, 1000 * (2 ** Math.max(0, attempts - 1)));
        snapshot.items[index] = {
          ...current,
          state: confirmed ? 'confirmed' : (failed ? 'failed' : 'retryable'),
          result: confirmed ? (response.result ?? null) : current.result,
          error: confirmed ? null : String(handlerError?.message || handlerError || 'Not confirmed'),
          nextRetryAt: confirmed || failed ? 0 : now() + delay,
          claimToken: null,
          claimExpiresAt: 0,
          updatedAt: now(),
        };
        writeSnapshot(snapshot);
        return cloneOperation(snapshot.items[index]);
      });
    }

    function replay(handler) {
      if (replayInFlight) return replayInFlight;
      if (typeof handler !== 'function') return Promise.reject(new TypeError('replay handler is required'));

      replayInFlight = (async () => {
        let candidateIds;
        try {
          candidateIds = await withAccountLock((snapshot) => {
            items = snapshot.items;
            return snapshot.items
              .filter((item) => CLAIMABLE_STATES.has(item.state) && item.attempts < maxAttempts)
              .map((item) => item.operationId);
          });
        } catch (error) {
          if (error?.code === 'NAMESPACE_INVALIDATED') return [];
          throw error;
        }

        for (const operationId of candidateIds) {
          let claimed;
          try {
            claimed = await withAccountLock((snapshot) => {
              const index = snapshot.items.findIndex((item) => item.operationId === operationId);
              if (index < 0) return null;
              const current = snapshot.items[index];
              if (!CLAIMABLE_STATES.has(current.state) || current.attempts >= maxAttempts || current.nextRetryAt > now()) {
                items = snapshot.items;
                return null;
              }
              const attempts = current.attempts + 1;
              const claimToken = createOperationId();
              snapshot.items[index] = {
                ...current,
                state: 'sending',
                attempts,
                claimToken,
                claimExpiresAt: now() + claimLeaseMs,
                error: null,
                updatedAt: now(),
              };
              writeSnapshot(snapshot);
              return cloneOperation(snapshot.items[index]);
            });
          } catch (error) {
            if (error?.code === 'NAMESPACE_INVALIDATED') break;
            throw error;
          }
          if (!claimed) continue;

          let response = null;
          let handlerError = null;
          try { response = await handler(claimed); } catch (error) { handlerError = error; }
          try {
            await settleOperation(operationId, claimed.attempts, claimed.claimToken, response, handlerError);
          } catch (error) {
            if (error?.code === 'NAMESPACE_INVALIDATED') {
              invalidated = true;
              items = [];
              break;
            }
            throw error;
          }
        }
        return items.map(cloneOperation);
      })().finally(() => { replayInFlight = null; });
      return replayInFlight;
    }

    async function clear() {
      try {
        await invalidateMutationNamespace({ storage, accountId, lockManager });
        invalidated = true;
        items = [];
        stopStorageObservation();
      } catch (error) {
        try {
          if (readEpoch(storage, epochKey) !== initialEpoch) {
            invalidated = true;
            items = [];
            stopStorageObservation();
          }
        } catch (_) {}
        throw error;
      }
    }

    function nextReplayDelay() {
      if (!observeCurrentEpoch()) return null;
      let delay = null;
      for (const item of items) {
        if (!NON_TERMINAL_STATES.has(item.state) || item.attempts >= maxAttempts) continue;
        const wakeAt = item.state === 'sending' ? item.claimExpiresAt : item.nextRetryAt;
        const candidate = Math.max(0, wakeAt - now());
        delay = delay === null ? candidate : Math.min(delay, candidate);
      }
      return delay;
    }

    return Object.freeze({
      accountId,
      coupleId,
      storageKey,
      epochKey,
      durability: 'persistent',
      enqueue,
      replay,
      nextReplayDelay,
      list: () => observeCurrentEpoch() ? items.map(cloneOperation) : [],
      get: (operationId) => {
        if (!observeCurrentEpoch()) return null;
        const item = items.find((entry) => entry.operationId === operationId);
        return item ? cloneOperation(item) : null;
      },
      clear,
    });
  }

  function createForegroundReconciler({ queue, refresh }) {
    let inFlight = null;
    return Object.freeze({
      run() {
        if (inFlight) return inFlight;
        inFlight = (async () => {
          await queue?.replay?.(async () => ({ confirmed: false }));
          await refresh?.();
        })().finally(() => { inFlight = null; });
        return inFlight;
      },
    });
  }

  function createRetryScheduler(options = {}) {
    const reconcile = options.reconcile;
    const nextDelay = options.nextDelay;
    if (typeof reconcile !== 'function' || typeof nextDelay !== 'function') {
      throw new TypeError('reconcile and nextDelay are required');
    }
    const isActive = options.isActive || (() => true);
    const isOnline = options.isOnline || (() => true);
    const onError = options.onError || (() => {});
    const setTimer = options.setTimer || globalScope.setTimeout.bind(globalScope);
    const clearTimer = options.clearTimer || globalScope.clearTimeout.bind(globalScope);
    const minDelayMs = Math.max(10, Number(options.minDelayMs) || 250);
    const maxDelayMs = Math.max(minDelayMs, Number(options.maxDelayMs) || 30000);
    let enabled = false;
    let timer = null;
    let inFlight = null;
    let generation = 0;
    const idle = Promise.resolve();

    function cancelTimer() {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    }

    function schedule(runGeneration) {
      if (!enabled || generation !== runGeneration || !isActive() || !isOnline()) return;
      const requested = nextDelay();
      if (requested === null || !Number.isFinite(Number(requested))) return;
      const delay = Math.max(minDelayMs, Math.min(maxDelayMs, Number(requested)));
      cancelTimer();
      timer = setTimer(() => {
        timer = null;
        trigger().catch(onError);
      }, delay);
    }

    function trigger() {
      if (!enabled || !isActive() || !isOnline()) return idle;
      if (inFlight) return inFlight;
      cancelTimer();
      const runGeneration = generation;
      let task;
      try { task = Promise.resolve(reconcile()); } catch (error) { task = Promise.reject(error); }
      inFlight = task.finally(() => {
        inFlight = null;
        schedule(runGeneration);
      });
      return inFlight;
    }

    function start(startOptions = {}) {
      if (!enabled) {
        enabled = true;
        generation += 1;
      }
      if (startOptions.immediate === false) {
        schedule(generation);
        return idle;
      }
      return trigger();
    }

    function stop() {
      enabled = false;
      generation += 1;
      cancelTimer();
    }

    return Object.freeze({ start, stop, trigger });
  }

  return Object.freeze({
    ReliabilityStorageError,
    ReliabilityNamespaceInvalidatedError,
    ReliabilityCoordinationError,
    createOperationId,
    normalizeOperation,
    createMutationQueue,
    invalidateMutationNamespace,
    createForegroundReconciler,
    createRetryScheduler,
  });
});
