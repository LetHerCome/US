const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const migrationPath = path.join(ROOT, 'supabase/migrations/20260910013000_gate_1_5_reliability_foundation.sql');
const notificationMigrationPath = path.join(ROOT, 'supabase/migrations/20260910014000_gate_1_5b_notification_foundation.sql');
const OPERATION_A = '11111111-1111-4111-8111-111111111111';
const CLAIM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function memoryStorage() {
  const values = new Map();
  const failures = { get: null, set: null, remove: null };
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem(key) {
      if (failures.get) throw failures.get;
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (failures.set) throw failures.set;
      values.set(key, String(value));
    },
    removeItem(key) {
      if (failures.remove) throw failures.remove;
      values.delete(key);
    },
    fail(method, error = new Error(`${method} unavailable`)) { failures[method] = error; },
    recover(method) { failures[method] = null; },
    keys: () => [...values.keys()],
  };
}

function serialLockManager() {
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

function storageEventTarget() {
  const listeners = new Set();
  return {
    addEventListener(type, listener) { if (type === 'storage') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'storage') listeners.delete(listener); },
    dispatch(key, storageArea) { for (const listener of [...listeners]) listener({ key, storageArea }); },
    listenerCount: () => listeners.size,
  };
}

function createInitCloudHarness({ cachedProfile, session, holdInvalidation = false }) {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('let usInitCloudInFlight=null;');
  const end = app.indexOf('\nfunction showAuthStep(', start);
  assert.ok(start >= 0 && end > start, 'initCloud lifecycle must remain extractable');
  const profileFetch = deferred();
  const authOverlay = { classList: createClassList() };
  const documentElement = { classList: createClassList() };
  const elements = new Map([
    ['authOverlay', authOverlay],
    ['syncReadyBadge', { textContent: '' }],
  ]);
  const storage = memoryStorage();
  storage.setItem('us:fix4:last-profile', JSON.stringify(cachedProfile));
  const calls = [];
  const invalidationGate = holdInvalidation ? deferred() : null;
  const invalidationStarted = deferred();
  const sandbox = {
    console: { warn: () => {}, info: () => {}, log: () => {}, error: () => {} },
    Promise,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: {
      documentElement,
      getElementById: (id) => elements.get(id) || { classList: createClassList() },
    },
    localStorage: storage,
    navigator: { onLine: true },
    requestIdleCallback: () => {},
    setTimeout: () => {},
    window: {
      __US_LOCAL_QA__: null,
      usProfile: cachedProfile,
      requestIdleCallback: () => {},
      dispatchEvent: (event) => calls.push(`event:${event.type}:${event.detail?.paired}`),
      UsThinkWidget: { clear: async () => {}, authReady: async () => {} },
    },
    sb: {
      auth: { getSession: async () => ({ data: { session } }) },
      from: () => ({
        select() { return this; },
        eq() { return this; },
        maybeSingle: () => profileFetch.promise,
      }),
    },
  };
  const stubs = `
    let selectedRole=null;
    let usRetryScheduler=null;
    const US_SIGNED_URL_CACHE=new Map();
    const US_SIGNED_URL_STORAGE_KEY='signed';
    const US_HOME_BOOT_CACHE_KEY='home';
    const caches={delete:async()=>true};
    const invalidateUsReliability=async(profile)=>{
      globalThis.calls.push('invalidate:'+String(profile?.id||''));
      globalThis.invalidationStarted.resolve();
      if(globalThis.invalidationGate)await globalThis.invalidationGate.promise;
    };
    const initializeUsReliability=async(profile)=>globalThis.calls.push('initialize:'+profile.id+':'+profile.couple_id);
    const setCloudBadge=(ok,text)=>globalThis.calls.push('badge:'+ok+':'+text);
    const showAuthStep=(step)=>globalThis.calls.push('step:'+step);
    const reconcileForeground=async()=>globalThis.calls.push('reconcile');
    const hydrateCloud=async()=>globalThis.calls.push('hydrate');
    const startUsRealtime=()=>{};
    const startLocationRefreshTimer=()=>{};
    const hydrateProfileAvatars=()=>{};
    const maybeAutoRefreshLocation=()=>{};
    const refreshWebPushUi=()=>{};
    const hydrateThink=()=>{};
    const flushPendingPushTarget=()=>{};
  `;
  sandbox.calls = calls;
  sandbox.invalidationGate = invalidationGate;
  sandbox.invalidationStarted = invalidationStarted;
  vm.runInNewContext(`${stubs}\n${app.slice(start, end)}\nglobalThis.runInitCloud=initCloud;`, sandbox);
  return { ...sandbox, authOverlay, documentElement, calls, profileFetch, invalidationGate, invalidationStarted };
}

test('operation IDs are UUIDs created once and preserved across retries', () => {
  const { createOperationId, normalizeOperation } = require('../reliability.js');
  const id = createOperationId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const operation = normalizeOperation({ operationId: id, domain: 'think.send', payload: {} });
  assert.equal(operation.operationId, id);
});

test('offline queue persists operation identity and isolates account plus couple', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const queue = createMutationQueue({ storage, lockManager, accountId: 'actor-a', coupleId: 'couple-a', now: () => 1000 });
  const operation = await queue.enqueue({ domain: 'think.send', payload: { value: 1 } });
  const restored = createMutationQueue({ storage, lockManager, accountId: 'actor-a', coupleId: 'couple-a', now: () => 2000 });
  assert.equal(restored.list()[0].operationId, operation.operationId);
  assert.deepEqual(createMutationQueue({ storage, lockManager, accountId: 'actor-b', coupleId: 'couple-a' }).list(), []);
  assert.deepEqual(createMutationQueue({ storage, lockManager, accountId: 'actor-a', coupleId: 'couple-b' }).list(), []);
});

test('persisted sending from a prior runtime is replayable with the same operation ID', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const storageKey = 'us:mutations:v1:actor:couple';
  storage.setItem(storageKey, JSON.stringify([{
    operationId: OPERATION_A,
    domain: 'think.send', payload: {}, state: 'sending', attempts: 1,
    createdAt: 1000, updatedAt: 1000, nextRetryAt: 0,
  }]));
  const queue = createMutationQueue({ storage, lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple', now: () => 2000 });
  assert.equal(queue.list()[0].state, 'retryable');
  const seen = [];
  await queue.replay(async (operation) => {
    seen.push(operation.operationId);
    return { confirmed: true };
  });
  assert.deepEqual(seen, [OPERATION_A]);
  assert.equal(queue.get(OPERATION_A).state, 'confirmed');
});

test('expired final sending lease becomes failed and a deliberate Ti penso creates a new operation', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const storageKey = 'us:mutations:v1:actor:couple';
  storage.setItem(storageKey, JSON.stringify({
    version: 2,
    revision: 1,
    epoch: 0,
    items: [{
      operationId: OPERATION_A,
      domain: 'think.send', payload: {}, state: 'sending', attempts: 3,
      claimToken: CLAIM_A, claimExpiresAt: 1999,
      createdAt: 1000, updatedAt: 1500, nextRetryAt: 0,
    }],
  }));

  const queue = createMutationQueue({
    storage,
    lockManager: serialLockManager(),
    accountId: 'actor',
    coupleId: 'couple',
    maxAttempts: 3,
    now: () => 2000,
  });
  const exhausted = queue.get(OPERATION_A);
  assert.equal(exhausted.operationId, OPERATION_A);
  assert.equal(exhausted.state, 'failed');
  assert.match(exhausted.error, /final send attempt.*remote receipt/i);
  assert.equal(queue.nextReplayDelay(), null);

  const deliberate = await queue.enqueue({ domain: 'think.send', payload: {} }, { reuseNonTerminal: true });
  assert.notEqual(deliberate.operationId, OPERATION_A);
  assert.equal(queue.get(OPERATION_A).state, 'failed');
});

test('an unexpired persisted sending claim is not recovered by another runtime', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1500;
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const storageKey = 'us:mutations:v1:actor:couple';
  storage.setItem(storageKey, JSON.stringify({
    version: 2,
    revision: 1,
    epoch: 0,
    items: [{
      operationId: OPERATION_A,
      domain: 'think.send', payload: {}, state: 'sending', attempts: 1,
      claimToken: CLAIM_A, claimExpiresAt: 2000,
      createdAt: 1000, updatedAt: 1000, nextRetryAt: 0,
    }],
  }));
  const queue = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple', now: () => clock });
  assert.equal(queue.list()[0].state, 'sending');
  let calls = 0;
  await queue.replay(async () => { calls += 1; return { confirmed: true }; });
  assert.equal(calls, 0);
  assert.equal(queue.get(OPERATION_A).state, 'sending');

  clock = 2000;
  await queue.replay(async (operation) => {
    calls += 1;
    assert.equal(operation.operationId, OPERATION_A);
    assert.notEqual(operation.claimToken, CLAIM_A);
    return { confirmed: true };
  });
  assert.equal(calls, 1);
  assert.equal(queue.get(OPERATION_A).state, 'confirmed');
});

test('a stale cross-instance completion cannot downgrade a newer confirmed claim', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1000;
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const staleRuntime = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple', now: () => clock, claimLeaseMs: 100 });
  const confirmingRuntime = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple', now: () => clock, claimLeaseMs: 100 });
  const operation = await staleRuntime.enqueue({ operationId: OPERATION_A, domain: 'think.send', payload: {} });
  const staleStarted = deferred();
  const releaseStale = deferred();
  let staleClaimToken = null;
  const staleReplay = staleRuntime.replay(async (claimed) => {
    staleClaimToken = claimed.claimToken;
    staleStarted.resolve();
    await releaseStale.promise;
    return { confirmed: false };
  });
  await staleStarted.promise;

  clock = 1100;
  let confirmingClaimToken = null;
  await confirmingRuntime.replay(async (claimed) => {
    confirmingClaimToken = claimed.claimToken;
    assert.equal(claimed.operationId, operation.operationId);
    return { confirmed: true, result: { messageId: 'confirmed-on-server' } };
  });
  assert.match(staleClaimToken, /^[0-9a-f-]{36}$/i);
  assert.match(confirmingClaimToken, /^[0-9a-f-]{36}$/i);
  assert.notEqual(confirmingClaimToken, staleClaimToken);
  assert.equal(confirmingRuntime.get(operation.operationId).state, 'confirmed');

  releaseStale.resolve();
  await staleReplay;
  const restored = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple', now: () => clock });
  assert.equal(restored.get(operation.operationId).state, 'confirmed');
  assert.deepEqual(restored.get(operation.operationId).result, { messageId: 'confirmed-on-server' });
});

test('queue replay is bounded and retry keeps the same logical operation ID', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1000;
  const queue = createMutationQueue({ storage: memoryStorage(), lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple', maxAttempts: 3, now: () => clock });
  const operation = await queue.enqueue({ domain: 'think.send', payload: {} });
  const seen = [];
  for (let index = 0; index < 4; index += 1) {
    await queue.replay(async (item) => { seen.push(item.operationId); throw new Error('offline'); });
    clock += 30000;
  }
  assert.deepEqual(new Set(seen), new Set([operation.operationId]));
  assert.equal(seen.length, 3);
  assert.equal(queue.list()[0].state, 'failed');
});

test('a final non-confirming response at maxAttempts becomes failed', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1000;
  const queue = createMutationQueue({ storage: memoryStorage(), lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple', maxAttempts: 2, now: () => clock });
  const operation = await queue.enqueue({ domain: 'think.send', payload: {} });
  await queue.replay(async () => ({ confirmed: false }));
  clock += 30000;
  await queue.replay(async () => ({ confirmed: false }));
  assert.equal(queue.get(operation.operationId).attempts, 2);
  assert.equal(queue.get(operation.operationId).state, 'failed');
  assert.equal(queue.nextReplayDelay(), null);
});

test('retryable operations wait until nextRetryAt before replay', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1000;
  const queue = createMutationQueue({ storage: memoryStorage(), lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple', now: () => clock });
  await queue.enqueue({ domain: 'think.send', payload: {}, state: 'retryable', nextRetryAt: 2000 });
  let calls = 0;
  await queue.replay(async () => { calls += 1; });
  assert.equal(calls, 0);
  clock = 2000;
  await queue.replay(async () => { calls += 1; return { confirmed: true }; });
  assert.equal(calls, 1);
});

test('two queue instances merge persisted operations instead of overwriting stale state', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const first = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  const second = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  const a = await first.enqueue({ domain: 'think.send', payload: { source: 'a' } });
  const b = await second.enqueue({ domain: 'think.send', payload: { source: 'b' } });
  const restored = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  assert.deepEqual(new Set(restored.list().map((item) => item.operationId)), new Set([a.operationId, b.operationId]));
});

test('active queue observes same-namespace storage writes and feeds its existing reconcile rail', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const events = storageEventTarget();
  let observed = 0;
  const active = createMutationQueue({
    storage,
    lockManager,
    eventTarget: events,
    accountId: 'actor',
    coupleId: 'couple',
    onExternalChange: () => { observed += 1; },
  });
  const writer = createMutationQueue({ storage, lockManager, eventTarget: {}, accountId: 'actor', coupleId: 'couple' });
  const operation = await writer.enqueue({ domain: 'think.send', payload: { source: 'other-context' } });

  assert.equal(active.get(operation.operationId), null);
  events.dispatch(active.storageKey, storage);
  assert.equal(active.get(operation.operationId).operationId, operation.operationId);
  assert.equal(observed, 1);
});

test('queue observation isolates namespaces and removes its listener on clear', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const events = storageEventTarget();
  let observed = 0;
  const active = createMutationQueue({
    storage, lockManager, eventTarget: events, accountId: 'actor', coupleId: 'couple',
    onExternalChange: () => { observed += 1; },
  });
  const otherCouple = createMutationQueue({ storage, lockManager, eventTarget: {}, accountId: 'actor', coupleId: 'other' });
  const otherAccount = createMutationQueue({ storage, lockManager, eventTarget: {}, accountId: 'other', coupleId: 'couple' });
  await otherCouple.enqueue({ domain: 'think.send', payload: {} });
  await otherAccount.enqueue({ domain: 'think.send', payload: {} });

  events.dispatch(otherCouple.storageKey, storage);
  events.dispatch(otherAccount.storageKey, storage);
  assert.equal(observed, 0);
  assert.deepEqual(active.list(), []);
  assert.equal(events.listenerCount(), 1);

  await active.clear();
  assert.equal(events.listenerCount(), 0);
  events.dispatch(active.storageKey, storage);
  assert.equal(observed, 0);
});

test('external account invalidation cancels queue observation', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const events = storageEventTarget();
  const active = createMutationQueue({ storage, lockManager, eventTarget: events, accountId: 'actor', coupleId: 'couple' });
  const clearer = createMutationQueue({ storage, lockManager, eventTarget: {}, accountId: 'actor', coupleId: 'couple' });
  await active.enqueue({ domain: 'think.send', payload: {} });
  await clearer.clear();

  events.dispatch(active.epochKey, storage);
  assert.deepEqual(active.list(), []);
  assert.equal(events.listenerCount(), 0);
});

test('queue remains usable when storage events are unavailable', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const queue = createMutationQueue({
    storage: memoryStorage(), lockManager: serialLockManager(), eventTarget: {}, accountId: 'actor', coupleId: 'couple',
  });
  const operation = await queue.enqueue({ domain: 'think.send', payload: {} });
  assert.equal(queue.get(operation.operationId).operationId, operation.operationId);
});

test('an enqueue from another instance during awaited replay is not lost', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const first = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  const second = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  const original = await first.enqueue({ domain: 'think.send', payload: { source: 'replay' } });
  const handlerStarted = deferred();
  const releaseHandler = deferred();
  const replay = first.replay(async () => {
    handlerStarted.resolve();
    await releaseHandler.promise;
    return { confirmed: true };
  });
  await handlerStarted.promise;
  const added = await second.enqueue({ domain: 'think.send', payload: { source: 'enqueue' } });
  releaseHandler.resolve();
  await replay;
  const restored = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  assert.deepEqual(new Set(restored.list().map((item) => item.operationId)), new Set([original.operationId, added.operationId]));
  assert.equal(restored.get(original.operationId).state, 'confirmed');
  assert.equal(restored.get(added.operationId).state, 'pending');
});

test('cross-instance invalidation during awaited replay prevents late completion and resurrection', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const stale = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  const clearer = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  await stale.enqueue({ domain: 'think.send', payload: {} });
  const handlerStarted = deferred();
  const releaseHandler = deferred();
  const replay = stale.replay(async () => {
    handlerStarted.resolve();
    await releaseHandler.promise;
    return { confirmed: true };
  });
  await handlerStarted.promise;
  await clearer.clear();
  releaseHandler.resolve();
  await replay;
  await assert.rejects(
    stale.enqueue({ domain: 'think.send', payload: { late: true } }),
    (error) => error?.code === 'NAMESPACE_INVALIDATED',
  );
  const restored = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  assert.deepEqual(restored.list(), []);
  assert.equal(storage.getItem(stale.storageKey), null);
});

test('Ti penso enqueue reuses one non-terminal operation but allows a new operation after terminal state', async () => {
  const { createMutationQueue } = require('../reliability.js');
  let clock = 1000;
  const queue = createMutationQueue({ storage: memoryStorage(), lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple', now: () => clock });
  const pending = await queue.enqueue({ domain: 'think.send', payload: {} }, { reuseNonTerminal: true });
  const reusedPending = await queue.enqueue({ domain: 'think.send', payload: { ignored: true } }, { reuseNonTerminal: true });
  assert.equal(reusedPending.operationId, pending.operationId);
  await queue.replay(async () => ({ confirmed: false }));
  const reusedRetryable = await queue.enqueue({ domain: 'think.send', payload: {} }, { reuseNonTerminal: true });
  assert.equal(reusedRetryable.operationId, pending.operationId);
  clock = 30000;
  await queue.replay(async () => ({ confirmed: true }));
  const future = await queue.enqueue({ domain: 'think.send', payload: {} }, { reuseNonTerminal: true });
  assert.notEqual(future.operationId, pending.operationId);
});

test('namespace invalidation clears every couple queue for one account and preserves other accounts', async () => {
  const { createMutationQueue, invalidateMutationNamespace } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const accountAFirst = createMutationQueue({ storage, lockManager, accountId: 'actor-a', coupleId: 'couple-1' });
  const accountASecond = createMutationQueue({ storage, lockManager, accountId: 'actor-a', coupleId: 'couple-2' });
  const accountB = createMutationQueue({ storage, lockManager, accountId: 'actor-b', coupleId: 'couple-1' });
  await accountAFirst.enqueue({ domain: 'think.send', payload: {} });
  await accountASecond.enqueue({ domain: 'think.send', payload: {} });
  const preserved = await accountB.enqueue({ domain: 'think.send', payload: {} });
  await invalidateMutationNamespace({ storage, lockManager, accountId: 'actor-a' });
  assert.equal(storage.getItem(accountAFirst.storageKey), null);
  assert.equal(storage.getItem(accountASecond.storageKey), null);
  assert.deepEqual(accountASecond.list(), []);
  assert.equal(createMutationQueue({ storage, lockManager, accountId: 'actor-b', coupleId: 'couple-1' }).get(preserved.operationId)?.operationId, preserved.operationId);
  await assert.rejects(accountASecond.enqueue({ domain: 'think.send', payload: {} }), (error) => error?.code === 'NAMESPACE_INVALIDATED');
});

test('terminal history is pruned by age and count without pruning non-terminal work', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  let clock = 1000;
  const queue = createMutationQueue({
    storage, lockManager, accountId: 'actor', coupleId: 'couple', now: () => clock,
    terminalMaxAgeMs: 100, terminalMaxCount: 2,
  });
  const old = await queue.enqueue({ domain: 'old', payload: {}, state: 'confirmed' });
  clock = 1200;
  const pending = await queue.enqueue({ domain: 'pending', payload: {} });
  const first = await queue.enqueue({ domain: 'first', payload: {}, state: 'confirmed' });
  clock = 1201;
  const second = await queue.enqueue({ domain: 'second', payload: {}, state: 'failed' });
  clock = 1202;
  const third = await queue.enqueue({ domain: 'third', payload: {}, state: 'confirmed' });
  const ids = new Set(queue.list().map((item) => item.operationId));
  assert.equal(ids.has(old.operationId), false);
  assert.equal(ids.has(first.operationId), false);
  assert.equal(ids.has(second.operationId), true);
  assert.equal(ids.has(third.operationId), true);
  assert.equal(ids.has(pending.operationId), true);
});

test('terminal pruning accepts an explicit zero history limit', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const queue = createMutationQueue({
    storage: memoryStorage(), lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple',
    terminalMaxCount: 0,
  });
  const pending = await queue.enqueue({ domain: 'pending', payload: {} });
  await queue.enqueue({ domain: 'terminal', payload: {}, state: 'confirmed' });
  assert.deepEqual(queue.list().map((item) => item.operationId), [pending.operationId]);
});

test('storage read and quota failures are explicit and never expose a durable queued item', async () => {
  const { createMutationQueue, ReliabilityStorageError } = require('../reliability.js');
  const unreadable = memoryStorage();
  unreadable.fail('get', new Error('storage denied'));
  assert.throws(
    () => createMutationQueue({ storage: unreadable, lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple' }),
    ReliabilityStorageError,
  );

  const quota = memoryStorage();
  const queue = createMutationQueue({ storage: quota, lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple' });
  quota.fail('set', Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
  await assert.rejects(queue.enqueue({ domain: 'think.send', payload: {} }), (error) => error instanceof ReliabilityStorageError && error.operation === 'write');
  assert.deepEqual(queue.list(), []);
  quota.recover('set');
  assert.equal(quota.getItem(queue.storageKey), null);
});

test('remove failure is reported while durable invalidation still prevents stale data reuse', async () => {
  const { createMutationQueue, ReliabilityStorageError } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const queue = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  await queue.enqueue({ domain: 'think.send', payload: {} });
  storage.fail('remove', new Error('remove denied'));
  await assert.rejects(queue.clear(), (error) => error instanceof ReliabilityStorageError && error.operation === 'remove');
  storage.recover('remove');
  assert.deepEqual(createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' }).list(), []);
  await assert.rejects(queue.enqueue({ domain: 'think.send', payload: {} }), (error) => error?.code === 'NAMESPACE_INVALIDATED');
});

test('failed invalidation removal cannot adopt a legacy array into the advanced epoch', async () => {
  const { createMutationQueue, invalidateMutationNamespace, ReliabilityStorageError } = require('../reliability.js');
  const storage = memoryStorage();
  const lockManager = serialLockManager();
  const storageKey = 'us:mutations:v1:actor:couple';
  storage.setItem(storageKey, JSON.stringify([{
    operationId: OPERATION_A,
    domain: 'think.send', payload: { legacy: true }, state: 'pending', attempts: 0,
    createdAt: 1000, updatedAt: 1000, nextRetryAt: 0,
  }]));
  storage.fail('remove', new Error('remove denied'));
  await assert.rejects(
    invalidateMutationNamespace({ storage, lockManager, accountId: 'actor' }),
    (error) => error instanceof ReliabilityStorageError && error.operation === 'remove',
  );
  storage.recover('remove');

  const fresh = createMutationQueue({ storage, lockManager, accountId: 'actor', coupleId: 'couple' });
  assert.deepEqual(fresh.list(), []);
  const replacement = await fresh.enqueue({ domain: 'think.send', payload: { legacy: false } });
  assert.deepEqual(fresh.list().map((item) => item.operationId), [replacement.operationId]);
  assert.equal(fresh.get(OPERATION_A), null);
});

test('confirmed operations are not replayed and account cleanup removes private queue state', async () => {
  const { createMutationQueue } = require('../reliability.js');
  const storage = memoryStorage();
  const queue = createMutationQueue({ storage, lockManager: serialLockManager(), accountId: 'actor', coupleId: 'couple' });
  const operation = await queue.enqueue({ domain: 'think.send', payload: {} });
  await queue.replay(async () => ({ confirmed: true, result: { messageId: 'same-message' } }));
  assert.equal(queue.get(operation.operationId).state, 'confirmed');
  let calls = 0;
  await queue.replay(async () => { calls += 1; });
  assert.equal(calls, 0);
  await queue.clear();
  assert.deepEqual(queue.list(), []);
  assert.equal(storage.getItem(queue.storageKey), null);
});

test('foreground reconciliation coalesces concurrent runs and replays before refresh', async () => {
  const { createForegroundReconciler } = require('../reliability.js');
  const order = [];
  let release;
  const queue = { replay: async () => { order.push('queue'); await new Promise((resolve) => { release = resolve; }); } };
  const reconciler = createForegroundReconciler({ queue, refresh: async () => order.push('refresh') });
  const first = reconciler.run();
  const second = reconciler.run();
  assert.equal(first, second);
  release();
  await first;
  assert.deepEqual(order, ['queue', 'refresh']);
});

test('retry scheduler is foreground-online only, coalesces one rail, bounds delay, and cancels after stop', async () => {
  const { createRetryScheduler } = require('../reliability.js');
  let active = true;
  let online = false;
  let calls = 0;
  let release = deferred();
  let timer = null;
  const delays = [];
  const scheduler = createRetryScheduler({
    reconcile: async () => { calls += 1; await release.promise; },
    nextDelay: () => 0,
    isActive: () => active,
    isOnline: () => online,
    minDelayMs: 50,
    maxDelayMs: 500,
    setTimer: (callback, delay) => { timer = callback; delays.push(delay); return callback; },
    clearTimer: () => { timer = null; },
  });
  await scheduler.start();
  assert.equal(calls, 0);
  online = true;
  const first = scheduler.trigger();
  const second = scheduler.trigger();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release.resolve();
  await first;
  assert.deepEqual(delays, [50]);
  assert.equal(typeof timer, 'function');

  release = deferred();
  const timerCallback = timer;
  timer = null;
  timerCallback();
  await Promise.resolve();
  assert.equal(calls, 2);
  scheduler.stop();
  release.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(timer, null);
  active = false;
  await scheduler.trigger();
  assert.equal(calls, 2);
});

test('retry scheduler handles timer-triggered reconcile rejection without an unhandled promise', async () => {
  const { createRetryScheduler } = require('../reliability.js');
  const failure = new Error('storage failed');
  let timer = null;
  const report = deferred();
  const scheduler = createRetryScheduler({
    reconcile: async () => { throw failure; },
    nextDelay: () => 10,
    onError: report.resolve,
    setTimer: (callback) => { timer = callback; return callback; },
    clearTimer: () => { timer = null; },
  });
  await scheduler.start({ immediate: false });
  timer();
  assert.equal(await report.promise, failure);
});

test('Gate 1.5A migration contains only idempotent Ti penso authority', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /create table public\.think_send_receipts/i);
  assert.match(sql, /unique \(couple_id, actor_role, operation_id\)/i);
  assert.match(sql, /operation_id uuid not null/i);
  assert.match(sql, /create or replace function public\.send_think_signal\(operation_id uuid\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /private\.current_couple_id\(\)/i);
  assert.match(sql, /grant execute on function public\.send_think_signal\(uuid\) to authenticated/i);
  assert.doesNotMatch(sql, /notification_events|notification_event_id|push|dispatcher|deep-link/i);
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.shared_messages/i);
  assert.doesNotMatch(sql, /alter table public\.push_event_log/i);
});

test('Gate 1.5B notification authority is preserved in a deferred dependent migration', () => {
  const sql = fs.readFileSync(notificationMigrationPath, 'utf8');
  assert.match(sql, /Gate 1\.5B/i);
  assert.match(sql, /create table public\.notification_events/i);
  assert.match(sql, /alter table public\.think_send_receipts[\s\S]*notification_event_id/i);
  assert.match(sql, /create or replace function public\.send_think_signal\(operation_id uuid\)/i);
  assert.match(sql, /notification_events[\s\S]*push_copy_complete/i);
});

test('reliability runtime is part of web, PWA, and Capacitor asset graphs before app boot', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build-capacitor-web.mjs'), 'utf8');
  assert.ok(index.indexOf('/reliability.js') < index.indexOf('<script defer src="/app.js"'));
  assert.match(worker, /"\/reliability\.js"/);
  assert.match(build, /'reliability\.js'/);
});

test('cached membership is presentation-only until the fresh profile authorizes shared mutations', async () => {
  const cachedProfile = { id: 'actor', couple_id: 'cached-couple', role: 'bea', display_name: 'Cached' };
  const freshProfile = { ...cachedProfile, display_name: 'Fresh' };
  const harness = createInitCloudHarness({
    cachedProfile,
    session: { user: { id: 'actor' } },
  });

  const boot = harness.runInitCloud();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.window.usProfile, null, 'cache must not be mutation authority while validation is pending');
  assert.equal(harness.calls.some((call) => call.startsWith('initialize:')), false);

  harness.profileFetch.resolve({ data: freshProfile, error: null });
  await boot;
  assert.equal(harness.window.usProfile.display_name, 'Fresh');
  assert.ok(harness.calls.includes('initialize:actor:cached-couple'));
  assert.equal(harness.authOverlay.classList.contains('hidden'), true);
});

test('profile fetch error keeps cached presentation without restoring shared mutation authority', async () => {
  const cachedProfile = { id: 'actor', couple_id: 'cached-couple', role: 'bea', display_name: 'Cached' };
  const harness = createInitCloudHarness({
    cachedProfile,
    session: { user: { id: 'actor' } },
  });

  const boot = harness.runInitCloud();
  await Promise.resolve();
  await Promise.resolve();
  harness.profileFetch.resolve({ data: null, error: new Error('offline') });
  await boot;

  assert.equal(harness.window.usProfile, null);
  assert.equal(harness.calls.some((call) => call.startsWith('initialize:')), false);
  assert.equal(harness.calls.some((call) => call.startsWith('invalidate:')), false, 'fetch uncertainty must not discard the matching durable namespace');
});

test('fresh couple change invalidates the cached namespace before enabling the new profile', async () => {
  const cachedProfile = { id: 'actor', couple_id: 'old-couple', role: 'bea', display_name: 'Cached' };
  const freshProfile = { ...cachedProfile, couple_id: 'new-couple', display_name: 'Fresh' };
  const harness = createInitCloudHarness({
    cachedProfile,
    session: { user: { id: 'actor' } },
    holdInvalidation: true,
  });

  const boot = harness.runInitCloud();
  await Promise.resolve();
  await Promise.resolve();
  harness.profileFetch.resolve({ data: freshProfile, error: null });
  await harness.invalidationStarted.promise;
  assert.equal(harness.window.usProfile, null);
  assert.equal(harness.calls.some((call) => call.startsWith('initialize:')), false);
  assert.equal(harness.authOverlay.classList.contains('hidden'), false);

  harness.invalidationGate.resolve();
  await boot;
  assert.equal(harness.window.usProfile.couple_id, 'new-couple');
  assert.ok(harness.calls.includes('initialize:actor:new-couple'));
});

test('account change invalidates the cached account before fetching or enabling membership', async () => {
  const cachedProfile = { id: 'old-actor', couple_id: 'old-couple', role: 'bea', display_name: 'Cached' };
  const freshProfile = { id: 'new-actor', couple_id: 'new-couple', role: 'francesco', display_name: 'Fresh' };
  const harness = createInitCloudHarness({
    cachedProfile,
    session: { user: { id: 'new-actor' } },
    holdInvalidation: true,
  });

  const boot = harness.runInitCloud();
  await harness.invalidationStarted.promise;
  assert.equal(harness.window.usProfile, null);
  assert.deepEqual(harness.calls.filter((call) => call.startsWith('invalidate:')), ['invalidate:old-actor']);
  assert.equal(harness.calls.some((call) => call.startsWith('initialize:')), false);

  harness.invalidationGate.resolve();
  harness.profileFetch.resolve({ data: freshProfile, error: null });
  await boot;
  assert.equal(harness.window.usProfile.id, 'new-actor');
  assert.ok(harness.calls.includes('initialize:new-actor:new-couple'));
});

test('fresh missing profile invalidates stale reliability before showing pairing UI', async () => {
  const cachedProfile = { id: 'actor', couple_id: 'old-couple', role: 'bea', display_name: 'Cached' };
  const harness = createInitCloudHarness({
    cachedProfile,
    session: { user: { id: 'actor' } },
    holdInvalidation: true,
  });

  const boot = harness.runInitCloud();
  await Promise.resolve();
  await Promise.resolve();
  harness.profileFetch.resolve({ data: null, error: null });
  await harness.invalidationStarted.promise;
  assert.equal(harness.window.usProfile, null);
  assert.equal(harness.calls.includes('step:authPair'), false);
  assert.equal(harness.calls.includes('event:us-auth-resolved:false'), false);

  harness.invalidationGate.resolve();
  await boot;
  assert.equal(harness.calls.includes('step:authPair'), true);
  assert.equal(harness.calls.includes('event:us-auth-resolved:false'), true);
  assert.equal(harness.localStorage.getItem('us:fix4:last-profile'), null);
});

test('app wires one bounded lifecycle rail, boot reconciliation, Ti penso reuse, and account invalidation paths', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /createMutationQueue/);
  assert.match(app, /accountId:profile\.id/);
  assert.match(app, /coupleId:profile\.couple_id/);
  assert.match(app, /createRetryScheduler/);
  assert.match(app, /onExternalChange:\(\)=>triggerUsReliability\(\)/);
  assert.match(app, /isActive:\(\)=>!document\.hidden/);
  assert.match(app, /isOnline:\(\)=>navigator\.onLine!==false/);
  assert.match(app, /onError:.*US Reliability.*scheduler/);
  assert.match(app, /await reconcileForeground\(\)[\s\S]*hydrateCloud/);
  assert.match(app, /visibilitychange[\s\S]*triggerUsReliability/);
  assert.match(app, /addEventListener\('online'[\s\S]*triggerUsReliability/);
  assert.match(app, /clearPrivateDeviceState[\s\S]*await invalidateUsReliability/);
  assert.match(app, /if\(!session\)[\s\S]*await invalidateUsReliability\(cachedDeviceProfile/);
  assert.match(app, /if\(!profile\)[\s\S]*await invalidateUsReliability/);
  assert.match(app, /cachedDeviceProfile\.id!==session\.user\.id[\s\S]*await invalidateUsReliability/);
  const send = app.match(/async function sendThinkSignal\(\)[\s\S]*?window\.sendThinkSignal=sendThinkSignal/)?.[0] || '';
  assert.match(send, /await usReliabilityQueue\.enqueue\([^]*reuseNonTerminal:true/);
  assert.match(send, /domain:'think\.send'/);
  assert.match(send, /await reconcileForeground\(\)/);
  assert.doesNotMatch(send, /from\('shared_messages'\)\.insert/);
  assert.doesNotMatch(send, /sendWebPushEvent\('think'/);
});

test('app profile refresh falls back only on fetch error and invalidates changed account or couple namespaces', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const initCloud = app.match(/async function initCloud\(\)[\s\S]*?function showAuthStep\(/)?.[0] || '';
  assert.match(initCloud, /const profile=error\?cachedProfile:freshProfile/);
  assert.doesNotMatch(initCloud, /freshProfile\|\|cachedProfile/);
  assert.match(
    initCloud,
    /!error&&freshProfile&&cachedDeviceProfile&&\(cachedDeviceProfile\.id!==freshProfile\.id\|\|cachedDeviceProfile\.couple_id!==freshProfile\.couple_id\)[\s\S]*?await invalidateUsReliability\(cachedDeviceProfile\)/,
  );
  assert.match(initCloud, /if\(!profile\)[\s\S]*?await invalidateUsReliability\(cachedDeviceProfile\|\|\{id:session\.user\.id\}\)/);
  assert.match(initCloud, /if\(!profile\)[\s\S]*?if\(!error\)try\{localStorage\.removeItem\('us:fix4:last-profile'\)/);
});

test('queue source documents Web Locks plus revision and fencing concurrency model', () => {
  const source = fs.readFileSync(path.join(ROOT, 'reliability.js'), 'utf8');
  assert.match(source, /Concurrency model:[\s\S]*Web Locks/i);
  assert.match(source, /revision/i);
  assert.match(source, /epoch|fenc/i);
});
