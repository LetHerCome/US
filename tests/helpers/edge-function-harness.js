// Runs a Supabase Edge Function (Deno, TypeScript) under Node for tests:
// esbuild bundles the real index.ts, npm:/jsr: imports are replaced by test
// doubles, and Deno.serve captures the real request handler. Nothing leaves
// the process: the Supabase client and web-push are in-memory fakes.
const path = require('node:path');
const esbuild = require('esbuild');

const MOCKS = {
  'npm:@supabase/supabase-js': 'export const createClient = (...args) => globalThis.__usEdge.createClient(...args);',
  'npm:web-push': 'export default { setVapidDetails: (...a) => globalThis.__usEdge.webpush.setVapidDetails(...a), sendNotification: (...a) => globalThis.__usEdge.webpush.sendNotification(...a) };',
  'jsr:@supabase/functions-js/edge-runtime.d.ts': '',
};
const mockFor = (specifier) => {
  const key = Object.keys(MOCKS).find((prefix) => specifier.startsWith(prefix));
  if (key === undefined) throw new Error(`no test double for ${specifier}`);
  return MOCKS[key];
};

const bundles = new Map();
async function bundle(entry) {
  if (!bundles.has(entry)) {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'neutral',
      target: 'es2022',
      logLevel: 'silent',
      plugins: [{
        name: 'deno-imports',
        setup(build) {
          build.onResolve({ filter: /^(npm|jsr):/ }, (args) => ({ path: args.path, namespace: 'us-edge-mock' }));
          build.onLoad({ filter: /.*/, namespace: 'us-edge-mock' }, (args) => ({ contents: mockFor(args.path), loader: 'js' }));
        },
      }],
    });
    bundles.set(entry, result.outputFiles[0].text);
  }
  return bundles.get(entry);
}

// In-memory stand-in for the service-role Supabase client: only the query
// builder surface the Edge Functions use.
function createFakeAdmin({ tables = {}, users = {}, rpc = {}, errors = {} } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const log = { reads: [], inserts: [], updates: [], deletes: [], rpc: [] };
  const admin = {
    db,
    log,
    auth: {
      async getUser(token) {
        const user = users[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    async rpc(name, args) {
      log.rpc.push(name);
      if (!(name in rpc)) return { data: null, error: { message: `no rpc ${name}` } };
      // A function double receives the call arguments (M11D server authority).
      if (typeof rpc[name] === 'function') {
        try { return { data: await rpc[name](args), error: null }; } catch (error) { return { data: null, error }; }
      }
      return { data: rpc[name], error: null };
    },
    from(table) {
      const filters = [];
      let mode = 'select';
      let payload = null;
      const rows = () => (db[table] ||= []).filter((row) => filters.every((filter) => filter(row)));
      const run = () => {
        if (errors[table] && mode === 'select') return { data: null, error: errors[table] };
        if (mode === 'insert') {
          if (table === 'push_event_log' && db.push_event_log?.some((row) => row.dedupe_key === payload.dedupe_key)) return { data: null, error: { code: '23505' } };
          (db[table] ||= []).push({ ...payload });
          log.inserts.push({ table, row: { ...payload } });
          return { data: null, error: null };
        }
        if (mode === 'update') {
          const touched = rows();
          for (const row of touched) Object.assign(row, payload);
          log.updates.push({ table, rows: touched.map((row) => ({ ...row })), values: { ...payload } });
          return { data: null, error: null };
        }
        if (mode === 'delete') {
          const doomed = rows();
          db[table] = db[table].filter((row) => !doomed.includes(row));
          log.deletes.push({ table, rows: doomed });
          return { data: null, error: null };
        }
        log.reads.push(table);
        return { data: rows().map((row) => ({ ...row })), error: null };
      };
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push((row) => row[column] === value); return builder; },
        neq(column, value) { filters.push((row) => row[column] !== value); return builder; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
        is(column, value) { filters.push((row) => (row[column] ?? null) === value); return builder; },
        gte(column, value) { filters.push((row) => row[column] >= value); return builder; },
        lte(column, value) { filters.push((row) => row[column] <= value); return builder; },
        order() { return builder; },
        limit() { return builder; },
        insert(value) { mode = 'insert'; payload = value; return builder; },
        update(value) { mode = 'update'; payload = value; return builder; },
        delete() { mode = 'delete'; return builder; },
        async maybeSingle() {
          const result = run();
          if (result.error) return result;
          return { data: result.data[0] || null, error: null };
        },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return builder;
    },
  };
  return admin;
}

// requireVapid: like a real push service, reject a send that was never signed
// (subscriptions carry an applicationServerKey, so VAPID is mandatory; F2C).
function createFakeWebPush({ failures = {}, requireVapid = false } = {}) {
  const sent = [];
  return {
    sent,
    vapid: [],
    setVapidDetails(...args) { this.vapid.push(args); },
    async sendNotification(subscription, payload, options) {
      if (requireVapid && !this.vapid.length) { const error = new Error('push service rejected an unsigned request'); error.statusCode = 403; throw error; }
      const status = failures[subscription.endpoint];
      if (status) { const error = new Error('push failed'); error.statusCode = status; throw error; }
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
    },
  };
}

/**
 * Loads functions/<name>/index.ts and returns an async `call(request)`.
 * `admin` and `webpush` are the doubles the function will receive.
 */
async function loadEdgeFunction(name, { admin, webpush, env = {} } = {}) {
  const entry = path.resolve(__dirname, '../../supabase/functions', name, 'index.ts');
  const code = await bundle(entry);
  let handler = null;
  const createClientCalls = [];
  const previous = { Deno: globalThis.Deno, edge: globalThis.__usEdge };
  globalThis.__usEdge = {
    createClient: (...args) => { createClientCalls.push(args); return admin; },
    webpush,
  };
  const environment = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', VAPID_SUBJECT: 'mailto:push-test@example.invalid', ...env };
  globalThis.Deno = { env: { get: (key) => environment[key] }, serve: (fn) => { handler = fn; } };
  try {
    new Function(code)();
  } finally {
    if (previous.Deno === undefined) delete globalThis.Deno; else globalThis.Deno = previous.Deno;
  }
  if (typeof handler !== 'function') throw new Error(`${name} did not register a Deno.serve handler`);
  return {
    createClientCalls,
    async call(request) {
      const saved = globalThis.Deno;
      globalThis.Deno = { env: { get: (key) => environment[key] } };
      globalThis.__usEdge = { createClient: (...args) => { createClientCalls.push(args); return admin; }, webpush };
      try {
        const response = await handler(request);
        const text = await response.text();
        let body = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: response.status, body };
      } finally {
        if (saved === undefined) delete globalThis.Deno; else globalThis.Deno = saved;
      }
    },
  };
}

module.exports = { loadEdgeFunction, createFakeAdmin, createFakeWebPush };
