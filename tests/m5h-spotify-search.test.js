const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ---- shared vm loaders --------------------------------------------------

function loadPureApi() {
  const context = { module: { exports: {} }, exports: {}, console, URL };
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });
  return context.module.exports;
}

function makeEl(id) {
  const classes = new Set();
  const attrs = {};
  const listeners = new Map();
  return {
    id,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name); else classes.delete(name);
        return next;
      },
    },
    setAttribute: (name, value) => { attrs[name] = String(value); },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: (name, handler) => { listeners.set(name, handler); },
    dispatchEvent: (event) => { listeners.get(event.type)?.(event); },
    click: () => listeners.get('click')?.(),
  };
}

function selectBuilder(rows, log) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    insert: (payload) => {
      log.inserts.push(payload);
      const resultPromise = Promise.resolve({ data: { id: 'inserted-id' }, error: null });
      return {
        select: () => ({ single: () => resultPromise }),
        then: (resolve, reject) => resultPromise.then(resolve, reject),
      };
    },
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return builder;
}

function createHarness({ invoke, profilesRows = [{ id: 'beatrice-id', display_name: 'Beatrice', couple_id: 'couple-id' }], currentProfile = { id: 'francesco-id', display_name: 'Francesco', couple_id: 'couple-id' } } = {}) {
  const elements = new Map();
  const log = { inserts: [], invokes: [] };
  const documentShim = {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
    querySelectorAll: () => [],
    addEventListener: () => {},
    readyState: 'complete',
  };
  const client = {
    from: (table) => selectBuilder(table === 'profiles' ? profilesRows : [], log),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    functions: {
      invoke: invoke || (async (name, options) => { log.invokes.push({ name, options }); return { data: { tracks: [] }, error: null }; }),
    },
  };
  const windowShim = { document: documentShim, addEventListener: () => {}, sb: client, usProfile: currentProfile };
  const context = {
    module: { exports: {} },
    window: windowShim,
    document: documentShim,
    console,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });
  return { api: context.module.exports, el: (id) => documentShim.getElementById(id), log };
}

async function loadCore() {
  return import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/spotify-search-core.mjs')).href);
}

function fakeResponse({ status = 200, ok, json, headers = {} } = {}) {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    headers: { get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    json: async () => json,
  };
}

// ---- pure client-side canonicalization ----------------------------------

test('M5H extracts the track id from every supported canonical/pasted Spotify form', () => {
  const api = loadPureApi();
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), '4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123'), '4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC'), '4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(api.extractSpotifyTrackId('spotify:track:4uLU6hMCjMI75M1A2tKUQC'), '4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(api.extractSpotifyTrackId('  https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC  '), '4uLU6hMCjMI75M1A2tKUQC');
});

test('M5H rejects playlist/album/artist/malformed/foreign-host links', () => {
  const api = loadPureApi();
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), null);
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'), null);
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'), null);
  assert.equal(api.extractSpotifyTrackId('https://example.com/track/4uLU6hMCjMI75M1A2tKUQC'), null);
  assert.equal(api.extractSpotifyTrackId('not a url at all'), null);
  assert.equal(api.extractSpotifyTrackId('https://open.spotify.com/track/too-short'), null);
  assert.equal(api.extractSpotifyTrackId(''), null);
  assert.equal(api.extractSpotifyTrackId(null), null);
});

test('M5H canonical and embed URL builders produce the exact official Spotify forms', () => {
  const api = loadPureApi();
  assert.equal(api.canonicalSpotifyTrackUrl('4uLU6hMCjMI75M1A2tKUQC'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(api.spotifyEmbedUrl('4uLU6hMCjMI75M1A2tKUQC'), 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
});

test('M5H receiver renders an official embed for a canonical track link and keeps the external link fallback', () => {
  const api = loadPureApi();
  const html = api.renderItemMarkup({ id: 'x', kind: 'music', media_path: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' });
  assert.match(html, /<iframe src="https:\/\/open\.spotify\.com\/embed\/track\/4uLU6hMCjMI75M1A2tKUQC"/);
  assert.match(html, /allow="encrypted-media"/);
  assert.match(html, /<a class="left-for-you-music-fallback" href="https:\/\/open\.spotify\.com\/track\/4uLU6hMCjMI75M1A2tKUQC"/);
});

test('M5H receiver falls back to the plain external link for a legacy/non-Spotify media_path', () => {
  const api = loadPureApi();
  const html = api.renderItemMarkup({ id: 'x', kind: 'music', media_path: 'https://example.com/legacy-song' });
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /<a class="left-for-you-music" href="https:\/\/example\.com\/legacy-song"/);
});

test('M5H the private signed-url path still skips music (public Spotify links, not private storage)', () => {
  const source = read('left-for-you.js');
  assert.match(source, /if \(!item\?\.media_path \|\| item\.kind === 'music'\) return '';/);
});

// ---- composer: manual paste validation + canonical persistence ----------

test('M5H composerCanSend accepts only a genuine Spotify track link for the music kind', () => {
  const harness = createHarness();
  const { api, el } = harness;
  api.setComposerKind('music');
  el('leftForYouComposerMusic').value = 'https://example.com/not-spotify';
  assert.equal(api.composerCanSend(), false);
  el('leftForYouComposerMusic').value = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  assert.equal(api.composerCanSend(), false);
  el('leftForYouComposerMusic').value = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
  assert.equal(api.composerCanSend(), true);
});

test('M5H pasting a track link normalizes the field to the canonical form on change', () => {
  const harness = createHarness();
  const { api, el } = harness;
  api.setComposerKind('music');
  const input = el('leftForYouComposerMusic');
  input.value = 'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz';
  input.dispatchEvent({ type: 'change', target: input });
  assert.equal(input.value, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(el('leftForYouMusicSelected').hidden, false);
});

test('M5H send() rejects a non-track link without inserting and shows the Spotify-specific error', async () => {
  const harness = createHarness();
  const { api, el, log } = harness;
  await api.load();
  api.setComposerKind('music');
  el('leftForYouComposerMusic').value = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
  await api.send();
  assert.equal(log.inserts.length, 0);
  assert.match(el('leftForYouComposerStatus').textContent, /Spotify/);
});

test('M5H send() persists the exact canonical Spotify track URL as media_path for kind=music', async () => {
  const harness = createHarness();
  const { api, el, log } = harness;
  await api.load();
  api.setComposerKind('music');
  el('leftForYouComposerMusic').value = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc';
  await api.send();
  assert.equal(log.inserts.length, 1);
  assert.equal(log.inserts[0].kind, 'music');
  assert.equal(log.inserts[0].media_path, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(log.inserts[0].body, null);
});

// ---- search: debounce, min length, stale-request cancellation -----------

test('M5H search waits for the ~350ms debounce and ignores queries under 2 characters', async () => {
  const harness = createHarness();
  const { api, el, log } = harness;
  const search = el('leftForYouMusicSearch');
  search.value = 'a';
  search.dispatchEvent({ type: 'input', target: search });
  await sleep(400);
  assert.equal(log.invokes.length, 0, 'a single character must never trigger a search');

  search.value = 'ab';
  search.dispatchEvent({ type: 'input', target: search });
  await sleep(200);
  assert.equal(log.invokes.length, 0, 'the request must not fire before the debounce window elapses');
  await sleep(250);
  assert.equal(log.invokes.length, 1);
  assert.equal(log.invokes[0].name, 'spotify-search');
  // Cross-realm vm objects fail deepStrictEqual on prototype identity, so compare the field directly.
  assert.equal(log.invokes[0].options.body.query, 'ab');
});

test('M5H a stale in-flight search response is ignored once a newer query has been issued', async () => {
  const responses = new Map([
    ['first', { data: { tracks: [{ id: 'stale-track-000000000000000', title: 'Stale', artist: 'A', album: '', imageUrl: '', spotifyUrl: 'https://open.spotify.com/track/stale-track-000000000000000' }] }, error: null }],
    ['second', { data: { tracks: [{ id: 'fresh-track-000000000000000', title: 'Fresh', artist: 'B', album: '', imageUrl: '', spotifyUrl: 'https://open.spotify.com/track/fresh-track-000000000000000' }] }, error: null }],
  ]);
  const invoke = async (_name, options) => {
    const query = options.body.query;
    if (query === 'first') { await sleep(60); return responses.get('first'); }
    return responses.get('second');
  };
  const harness = createHarness({ invoke });
  const { api } = harness;
  const firstPromise = api.runMusicSearch('first');
  await sleep(5);
  const secondPromise = api.runMusicSearch('second');
  await Promise.all([firstPromise, secondPromise]);
  const list = harness.el('leftForYouMusicResults');
  assert.match(list.innerHTML, /Fresh/);
  assert.doesNotMatch(list.innerHTML, /Stale/, 'the slower, superseded response must never overwrite the newer one');
});

test('M5H selecting a result replaces any prior selection and enables the CTA', () => {
  const harness = createHarness();
  const { api, el } = harness;
  api.setComposerKind('music');
  api.renderMusicResults([
    { id: 'aaaaaaaaaaaaaaaaaaaaaa', title: 'Song A', artist: 'Artist A', album: '', imageUrl: '', spotifyUrl: 'https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa' },
    { id: 'bbbbbbbbbbbbbbbbbbbbbb', title: 'Song B', artist: 'Artist B', album: '', imageUrl: '', spotifyUrl: 'https://open.spotify.com/track/bbbbbbbbbbbbbbbbbbbbbb' },
  ]);
  const list = el('leftForYouMusicResults');
  const first = { dataset: { spotifyId: 'aaaaaaaaaaaaaaaaaaaaaa', spotifyTitle: 'Song A', spotifyArtist: 'Artist A', spotifyUrl: 'https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa' } };
  const second = { dataset: { spotifyId: 'bbbbbbbbbbbbbbbbbbbbbb', spotifyTitle: 'Song B', spotifyArtist: 'Artist B', spotifyUrl: 'https://open.spotify.com/track/bbbbbbbbbbbbbbbbbbbbbb' } };
  api.selectMusicResult(first);
  assert.equal(el('leftForYouComposerMusic').value, 'https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(api.composerCanSend(), true);
  api.selectMusicResult(second);
  assert.equal(el('leftForYouComposerMusic').value, 'https://open.spotify.com/track/bbbbbbbbbbbbbbbbbbbbbb', 'a new pick must replace the previous selection, not stack with it');
  assert.match(el('leftForYouMusicSelectedLabel').textContent, /Song B/);
  assert.equal(list.hidden, true, 'the results list closes once a track is chosen');
});

test('M5H clearing the selection empties the composer field and disables the CTA again', () => {
  const harness = createHarness();
  const { api, el } = harness;
  api.setComposerKind('music');
  const item = { dataset: { spotifyId: 'aaaaaaaaaaaaaaaaaaaaaa', spotifyTitle: 'Song A', spotifyArtist: 'Artist A', spotifyUrl: 'https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa' } };
  api.selectMusicResult(item);
  assert.equal(api.composerCanSend(), true);
  api.clearMusicSelection();
  assert.equal(el('leftForYouComposerMusic').value, '');
  assert.equal(el('leftForYouMusicSelected').hidden, true);
  assert.equal(api.composerCanSend(), false);
});

test('M5H a Spotify search failure shows a recoverable error and never blocks the manual paste fallback', async () => {
  const invoke = async () => ({ data: null, error: { context: { status: 502 } } });
  const harness = createHarness({ invoke });
  const { api, el } = harness;
  api.setComposerKind('music');
  await api.runMusicSearch('nirvana');
  assert.match(el('leftForYouMusicSearchStatus').textContent, /non disponibile/);
  el('leftForYouComposerMusic').value = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
  assert.equal(api.composerCanSend(), true);
});

test('M5H a 429 from search is reported as a rate limit, bounded and non-crashing', async () => {
  const invoke = async () => ({ data: null, error: { context: { status: 429 } } });
  const harness = createHarness({ invoke });
  const { api, el } = harness;
  await api.runMusicSearch('nirvana');
  assert.match(el('leftForYouMusicSearchStatus').textContent, /Troppe ricerche/);
});

test('M5H no Spotify client secret or id is hardcoded in the browser-shipped source', () => {
  const jsSource = read('left-for-you.js');
  const htmlSource = read('index.html');
  assert.doesNotMatch(jsSource, /SPOTIFY_CLIENT_SECRET|client_secret/i);
  assert.doesNotMatch(htmlSource, /SPOTIFY_CLIENT_SECRET|client_secret/i);
  assert.match(jsSource, /functions\.invoke\('spotify-search'/);
});

// ---- Edge Function contract (source-level, Deno not available locally) --

test('M5H the Edge Function requires authentication and stays registered as verify_jwt=true', () => {
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.spotify-search\]\s*\nverify_jwt = true/);
  const source = read('supabase/functions/spotify-search/index.ts');
  assert.match(source, /authorization/i);
  assert.match(source, /admin\.auth\.getUser\(bearer\)/);
  assert.match(source, /authentication_required/);
  assert.match(source, /invalid_session/);
});

test('M5H the Edge Function pins market=IT and limit=5 server-side, never trusting client-supplied limits', () => {
  const source = read('supabase/functions/spotify-search/index.ts');
  assert.match(source, /market:\s*"IT"/);
  assert.match(source, /limit:\s*5/);
  assert.doesNotMatch(source, /body\??\.limit/);
  assert.doesNotMatch(source, /body\??\.market/);
});

test('M5H the Edge Function reads Spotify credentials only from server env and never logs raw errors', () => {
  const source = read('supabase/functions/spotify-search/index.ts');
  assert.match(source, /Deno\.env\.get\("SPOTIFY_CLIENT_ID"\)/);
  assert.match(source, /Deno\.env\.get\("SPOTIFY_CLIENT_SECRET"\)/);
  assert.doesNotMatch(source, /console\.(log|error|warn)\([^)]*clientSecret/i);
  assert.match(source, /console\.error\("spotify search failed", error\.code\)/);
});

test('M5H the Edge Function returns Retry-After and a quota_exceeded code on 429, and 400 on an invalid query', () => {
  const source = read('supabase/functions/spotify-search/index.ts');
  assert.match(source, /Retry-After/);
  assert.match(source, /quota_exceeded/);
  assert.match(source, /normalizeQuery\(body\?\.query\)/);
});

test('M5H the Edge Function normalizes the raw Spotify payload and never proxies it verbatim', () => {
  const source = read('supabase/functions/spotify-search/index.ts');
  assert.match(source, /normalizeTracks\(payload, 5\)/);
  assert.doesNotMatch(source, /return json\(payload\)/);
});

// ---- Edge Function core logic (runs for real under Node with mocked fetch) --

test('M5H normalizeQuery trims and enforces the 2-100 char bound', async () => {
  const core = await loadCore();
  assert.equal(core.normalizeQuery('  ab  '), 'ab');
  assert.throws(() => core.normalizeQuery('a'), /invalid_query/);
  assert.throws(() => core.normalizeQuery(''), /invalid_query/);
  assert.throws(() => core.normalizeQuery('   '), /invalid_query/);
  assert.equal(core.normalizeQuery('x'.repeat(100)).length, 100);
  assert.throws(() => core.normalizeQuery('x'.repeat(101)), /invalid_query/);
});

test('M5H getAccessToken caches the token and skews the expiry, refetching only once stale', async () => {
  const core = await loadCore();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return fakeResponse({ json: { access_token: `tok-${calls}`, expires_in: 3600 } }); };
  const cache = {};
  let now = 1_000_000;
  const token1 = await core.getAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, cache, now: () => now });
  assert.equal(token1, 'tok-1');
  assert.equal(calls, 1);
  now += 1000; // well within expiry
  const token2 = await core.getAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, cache, now: () => now });
  assert.equal(token2, 'tok-1');
  assert.equal(calls, 1, 'a cached, non-expiring token must not trigger a second request');
  now += 3600 * 1000; // past expiry (and past the skew window)
  const token3 = await core.getAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, cache, now: () => now });
  assert.equal(token3, 'tok-2');
  assert.equal(calls, 2);
});

test('M5H getAccessToken never persists tokens outside the caller-owned cache object', async () => {
  const core = await loadCore();
  const fetchImpl = async () => fakeResponse({ json: { access_token: 'secret-token', expires_in: 3600 } });
  const cacheA = {};
  const cacheB = {};
  await core.getAccessToken({ clientId: 'id', clientSecret: 'secret', fetchImpl, cache: cacheA });
  assert.equal(cacheB.token, undefined, 'a fresh cache object must start with no token');
});

test('M5H getAccessToken classifies missing credentials and Spotify auth failures without leaking details', async () => {
  const core = await loadCore();
  await assert.rejects(
    () => core.getAccessToken({ clientId: '', clientSecret: '', fetchImpl: async () => fakeResponse({ status: 200 }) }),
    (error) => error.code === 'server_configuration_missing' && error.status === 500,
  );
  await assert.rejects(
    () => core.getAccessToken({ clientId: 'id', clientSecret: 'bad', fetchImpl: async () => fakeResponse({ status: 401, ok: false }) }),
    (error) => error.code === 'upstream_auth_failed',
  );
});

test('M5H searchSpotifyTracks requests type=track, the given market and a bounded limit', async () => {
  const core = await loadCore();
  let capturedUrl;
  const fetchImpl = async (url) => { capturedUrl = url; return fakeResponse({ json: { tracks: { items: [] } } }); };
  await core.searchSpotifyTracks({ token: 't', query: 'nirvana', fetchImpl, market: 'IT', limit: 5 });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.searchParams.get('type'), 'track');
  assert.equal(parsed.searchParams.get('market'), 'IT');
  assert.equal(parsed.searchParams.get('limit'), '5');
  assert.equal(parsed.searchParams.get('q'), 'nirvana');
});

test('M5H searchSpotifyTracks surfaces 429 as quota_exceeded with a bounded Retry-After', async () => {
  const core = await loadCore();
  const fetchImpl = async () => fakeResponse({ status: 429, ok: false, headers: { 'Retry-After': '9999' } });
  await assert.rejects(
    () => core.searchSpotifyTracks({ token: 't', query: 'nirvana', fetchImpl }),
    (error) => error.code === 'quota_exceeded' && error.status === 429 && error.retryAfterSeconds <= 120,
  );
});

test('M5H searchSpotifyTracks maps 401/403 to a bounded upstream_auth_failed, not a raw pass-through', async () => {
  const core = await loadCore();
  const fetchImpl = async () => fakeResponse({ status: 403, ok: false });
  await assert.rejects(
    () => core.searchSpotifyTracks({ token: 't', query: 'nirvana', fetchImpl }),
    (error) => error.code === 'upstream_auth_failed',
  );
});

test('M5H searchSpotifyTracks rejects a malformed (non-JSON-object) response as upstream_unavailable', async () => {
  const core = await loadCore();
  const fetchImpl = async () => fakeResponse({ json: null });
  await assert.rejects(
    () => core.searchSpotifyTracks({ token: 't', query: 'nirvana', fetchImpl }),
    (error) => error.code === 'upstream_unavailable',
  );
});

test('M5H normalizeTracks maps to the bounded {id,title,artist,album,imageUrl,spotifyUrl} shape and never proxies the raw payload', async () => {
  const core = await loadCore();
  const payload = {
    tracks: {
      items: [
        { id: '4uLU6hMCjMI75M1A2tKUQC', name: 'Come As You Are', artists: [{ name: 'Nirvana' }], album: { name: 'Nevermind', images: [{ url: 'big.jpg' }, { url: 'small.jpg' }] } },
        { id: 'missing-name-track-id!!', artists: [{ name: 'Ghost' }] }, // malformed: no name -> skipped
        { id: '', name: 'No id' }, // malformed: no id -> skipped
      ],
    },
  };
  const tracks = core.normalizeTracks(payload, 5);
  assert.equal(tracks.length, 1);
  assert.deepEqual(Object.keys(tracks[0]).sort(), ['album', 'artist', 'id', 'imageUrl', 'spotifyUrl', 'title'].sort());
  assert.equal(tracks[0].id, '4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(tracks[0].title, 'Come As You Are');
  assert.equal(tracks[0].artist, 'Nirvana');
  assert.equal(tracks[0].album, 'Nevermind');
  assert.equal(tracks[0].imageUrl, 'small.jpg');
  assert.equal(tracks[0].spotifyUrl, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
});

test('M5H normalizeTracks bounds results to the given limit regardless of upstream payload size', async () => {
  const core = await loadCore();
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `track-${i}-aaaaaaaaaaaaaa`, name: `Track ${i}`, artists: [{ name: 'Artist' }] }));
  const tracks = core.normalizeTracks({ tracks: { items } }, 5);
  assert.equal(tracks.length, 5);
});

test('M5H normalizeTracks tolerates a completely malformed payload shape', async () => {
  const core = await loadCore();
  assert.deepEqual(core.normalizeTracks(null), []);
  assert.deepEqual(core.normalizeTracks({}), []);
  assert.deepEqual(core.normalizeTracks({ tracks: {} }), []);
  assert.deepEqual(core.normalizeTracks({ tracks: { items: 'not-an-array' } }), []);
});
