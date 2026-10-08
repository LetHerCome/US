// M12B.1 — the real app in headless Chromium, for Oggi geometry only.
// A local static server serves this checkout; supabase-js is replaced by an
// in-page fake that answers from fixtures. Nothing leaves the machine.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

// Playwright is not a dependency of this repo: use it when the environment
// provides it (global install), otherwise the browser tests are skipped.
function loadChromium() {
  const bases = [ROOT, process.env.PLAYWRIGHT_NODE_MODULES, '/opt/node22/lib/node_modules'].filter(Boolean);
  for (const base of bases) {
    try {
      const chromium = createRequire(path.join(base, 'noop.js'))('playwright').chromium;
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      return executablePath ? { launch: (options = {}) => chromium.launch({ ...options, executablePath }) } : chromium;
    } catch (_) { /* next */ }
  }
  return null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (url.pathname === '/' || !path.extname(file)) file = path.join(ROOT, 'index.html');
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// In-page fake Supabase client (reads window.__QA).
const FAKE_SUPABASE = `(() => {
  const Q = () => window.__QA;
  const session = () => ({ access_token: 'qa', refresh_token: 'qa', user: { id: Q().me, is_anonymous: false, email: 'qa@example.test' } });
  const photo = () => 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#7a4d6e"/></svg>');
  function builder(table) {
    const filters = []; let op = 'select', payload = null, head = false;
    const rows = () => (Q().tables[table] || []).filter((r) => filters.every(([k, c, v]) =>
      k === 'eq' ? r[c] === v : k === 'neq' ? r[c] !== v : k === 'in' ? v.includes(r[c]) : k === 'is' ? (v === null ? r[c] == null : r[c] === v) : true));
    const finish = () => {
      if (op === 'insert' || op === 'upsert') return { data: [{ id: 'new', ...(Array.isArray(payload) ? payload[0] : payload) }], error: null };
      if (op === 'update' || op === 'delete') return { data: [{ id: 'x' }], error: null };
      const data = rows(); return head ? { data: null, count: data.length, error: null } : { data, count: data.length, error: null };
    };
    const b = {
      select(_c, o) { if (o && o.head) head = true; return b; },
      eq(c, v) { filters.push(['eq', c, v]); return b; }, neq(c, v) { filters.push(['neq', c, v]); return b; },
      in(c, v) { filters.push(['in', c, v]); return b; }, is(c, v) { filters.push(['is', c, v]); return b; },
      insert(p) { op = 'insert'; payload = p; return b; }, upsert(p) { op = 'upsert'; payload = p; return b; },
      update(p) { op = 'update'; payload = p; return b; }, delete() { op = 'delete'; return b; },
      maybeSingle() { return Promise.resolve({ data: finish().data?.[0] ?? null, error: null }); },
      single() { return Promise.resolve({ data: finish().data?.[0] ?? null, error: null }); },
      then(res, rej) { return Promise.resolve(finish()).then(res, rej); }
    };
    for (const k of ['order', 'limit', 'or', 'not', 'gte', 'gt', 'lt', 'lte', 'ilike', 'range', 'match', 'filter']) b[k] = () => b;
    return b;
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      getUser: async () => ({ data: { user: session().user }, error: null }),
      refreshSession: async () => ({ data: { session: session() }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInAnonymously: async () => ({ data: { session: session() }, error: null }),
      signInWithPassword: async () => ({ data: null, error: { message: 'qa' } }),
      signOut: async () => ({ error: null })
    },
    from: builder,
    rpc: async (name, args) => { const fn = Q().rpc && Q().rpc[name]; if(fn)return fn(args); if(name==='get_couple_membership'){const p=Q().tables.profiles?.find(p=>p.id===Q().me);return {data:p?{member:true,couple_id:p.couple_id,partner_joined:Q().tables.profiles.some(other=>other.couple_id===p.couple_id&&other.id!==p.id),invite:{status:'none',expires_at:null}}:{member:false},error:null};} return { data: null, error: null }; },
    channel() { const c = { on() { return c; }, subscribe() { return c; }, unsubscribe() {}, send() {} }; return c; },
    removeChannel() {},
    storage: { from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: photo() }, error: null }),
      createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: photo(), error: null })), error: null }),
      getPublicUrl: () => ({ data: { publicUrl: photo() } }),
      upload: async () => ({ data: {}, error: null }) }) },
    functions: { invoke: async () => ({ data: null, error: null }) }
  };
  window.supabase = { createClient: () => client };
})();`;

module.exports = { ROOT, loadChromium, startServer, FAKE_SUPABASE };
