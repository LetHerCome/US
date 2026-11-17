// TestFlight distribution after the upload (scripts/ios-testflight-distribute.mjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const load = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'ios-testflight-distribute.mjs')).href);

function fakeApple({ states = ['PROCESSING', 'VALID'], groups, localizations = [], reviewStatus = 201, groupStatus = 204 }) {
  const calls = [];
  let poll = 0;
  const call = async (method, url, body) => {
    calls.push({ method, url, body });
    if (url.startsWith('/v1/apps?')) return { data: [{ id: 'app1', attributes: { bundleId: 'app.uscouple', primaryLocale: 'it' } }] };
    if (url.startsWith('/v1/builds?')) {
      const state = states[Math.min(poll++, states.length - 1)];
      return { data: state ? [{ id: 'b1', attributes: { processingState: state } }] : [] };
    }
    if (url === '/v1/builds/b1/betaBuildLocalizations') return { data: localizations };
    if (url.startsWith('/v1/apps/app1/betaGroups')) return { data: groups };
    if (url.endsWith('/relationships/builds') && groupStatus === 409) throw new Error(`POST ${url} → 409 already`);
    if (url === '/v1/betaAppReviewSubmissions' && reviewStatus === 409) throw new Error(`POST ${url} → 409 already submitted`);
    return null;
  };
  return { call, calls };
}

const quiet = { wait: async () => {}, log: () => {} };

test('aspetta l\'elaborazione, aggiunge la build ai gruppi e manda alla verifica beta se c\'è un gruppo esterno', async () => {
  const { distribute } = await load();
  const apple = fakeApple({ states: [undefined, 'PROCESSING', 'VALID'], groups: [
    { id: 'gi', attributes: { name: 'Noi', isInternalGroup: true, hasAccessToAllBuilds: true } },
    { id: 'ge', attributes: { name: 'Beta', isInternalGroup: false } }
  ] });
  const result = await distribute({ call: apple.call, buildNumber: '461700', ...quiet });
  assert.deepEqual(result, { buildId: 'b1', groups: 2, external: 1, review: 'inviata' });
  const posts = apple.calls.filter((c) => c.method === 'POST').map((c) => c.url);
  assert.deepEqual(posts, ['/v1/betaGroups/ge/relationships/builds', '/v1/betaAppReviewSubmissions']);
  assert.equal(apple.calls.filter((c) => c.url.startsWith('/v1/builds?')).length, 3);
  assert.match(apple.calls.find((c) => c.url.startsWith('/v1/builds?')).url, /filter\[app\]=app1&filter\[version\]=461700/);
});

test('gruppo interno senza tutte le build: aggiunta senza verifica; build già nel gruppo o già inviata non è un errore', async () => {
  const { distribute } = await load();
  const internal = fakeApple({ states: ['VALID'], groups: [{ id: 'gi', attributes: { name: 'Noi', isInternalGroup: true, hasAccessToAllBuilds: false } }] });
  assert.equal((await distribute({ call: internal.call, buildNumber: 1, ...quiet })).review, 'non serve');
  assert.deepEqual(internal.calls.filter((c) => c.method === 'POST').map((c) => c.url), ['/v1/betaGroups/gi/relationships/builds']);
  const again = fakeApple({ states: ['VALID'], groupStatus: 409, reviewStatus: 409, groups: [{ id: 'ge', attributes: { name: 'Beta', isInternalGroup: false } }] });
  assert.equal((await distribute({ call: again.call, buildNumber: 1, ...quiet })).review, 'già inviata');
});

test('«Cosa provare»: aggiorna le localizzazioni che ci sono, altrimenti ne crea una nella lingua dell\'app', async () => {
  const { distribute } = await load();
  const groups = [{ id: 'gi', attributes: { name: 'Noi', isInternalGroup: true, hasAccessToAllBuilds: true } }];
  const fresh = fakeApple({ states: ['VALID'], groups });
  await distribute({ call: fresh.call, buildNumber: 1, whatToTest: 'Widget', ...quiet });
  const created = fresh.calls.find((c) => c.url === '/v1/betaBuildLocalizations');
  assert.deepEqual(created.body.data.attributes, { locale: 'it', whatToTest: 'Widget' });
  const existing = fakeApple({ states: ['VALID'], groups, localizations: [{ id: 'l1' }] });
  await distribute({ call: existing.call, buildNumber: 1, whatToTest: 'Widget', ...quiet });
  assert.ok(existing.calls.some((c) => c.method === 'PATCH' && c.url === '/v1/betaBuildLocalizations/l1'));
});

test('errori chiari: build scartata, attesa finita, nessun gruppo', async () => {
  const { distribute } = await load();
  const groups = [{ id: 'g', attributes: { name: 'Beta', isInternalGroup: false } }];
  await assert.rejects(distribute({ call: fakeApple({ states: ['INVALID'], groups }).call, buildNumber: 1, ...quiet }), /scartato la build 1 \(INVALID\)/);
  let t = 0;
  await assert.rejects(distribute({ call: fakeApple({ states: ['PROCESSING'], groups }).call, buildNumber: 1, now: () => (t += 60_000), timeoutMs: 120_000, ...quiet }), /non è pronta dopo 2 minuti/);
  await assert.rejects(distribute({ call: fakeApple({ states: ['VALID'], groups: [] }).call, buildNumber: 1, ...quiet }), /Nessun gruppo TestFlight/);
  await assert.rejects(distribute({ call: fakeApple({ groups }).call, buildNumber: 'abc', ...quiet }), /Numero di build non valido/);
});

test('i workflow distribuiscono la build: subito dopo il caricamento e a mano per una build già caricata', () => {
  const upload = fs.readFileSync(path.join(ROOT, '.github/workflows/ios-testflight.yml'), 'utf8');
  const testers = upload.slice(upload.indexOf('\n  testers:'));
  assert.ok(upload.indexOf('\n  testers:') > upload.indexOf('EXPORT SUCCEEDED'), 'job dopo il caricamento');
  assert.match(testers, /needs: testflight/);
  assert.match(testers, /runs-on: ubuntu-latest/);
  assert.match(testers, /BUILD_NUMBER: \$\{\{ needs\.testflight\.outputs\.build \}\}/);
  assert.match(upload, /build: \$\{\{ steps\.check\.outputs\.build \}\}/);
  assert.match(upload, /echo "build=\$code" >> "\$GITHUB_OUTPUT"/);
  for (const workflow of [testers]) assert.match(workflow, /node scripts\/ios-testflight-distribute\.mjs "\$BUILD_NUMBER"/);
  const manual = fs.readFileSync(path.join(ROOT, '.github/workflows/ios-testflight-distribute.yml'), 'utf8');
  assert.match(manual, /environment: ios-deploy/);
  assert.match(manual, /node scripts\/ios-testflight-distribute\.mjs "\$BUILD_NUMBER"/);
  assert.match(manual, /rm -rf "\$RUNNER_TEMP\/asc"/);
});
