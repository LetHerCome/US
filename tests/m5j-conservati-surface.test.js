const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = id !== 'conservatiOverlay';
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this._innerHTML = '';
    this.mediaNodes = [];
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
      toggle: (value, enabled) => {
        const next = enabled === undefined ? !classes.has(value) : enabled;
        if (next) classes.add(value); else classes.delete(value);
        return next;
      }
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.mediaNodes = this.id === 'conservatiDetail'
      ? [...this._innerHTML.matchAll(/<(audio|video)\b/gi)].map((match) => makeFakeMedia(match[1]))
      : [];
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, event = {}) { return this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  replaceChildren() { this._innerHTML = ''; }
  querySelectorAll(selector) { return selector === 'audio, video' ? this.mediaNodes : []; }
}

function makeFakeMedia(tagName) {
  const source = {
    attributes: new Map([['src', 'https://signed.example/source.bin']]),
    removeAttribute(name) { this.attributes.delete(name); }
  };
  return {
    tagName: tagName.toUpperCase(),
    attributes: new Map([['src', 'https://signed.example/media.bin']]),
    pauseCalls: 0,
    loadCalls: 0,
    pause() { this.pauseCalls += 1; },
    load() { this.loadCalls += 1; },
    removeAttribute(name) { this.attributes.delete(name); },
    querySelectorAll(selector) { return selector === 'source' ? [source] : []; },
    source
  };
}

function mountConservati({ contributions = [], sources = [], profiles = [], signError = null } = {}) {
  const ids = [
    'conservatiOverlay', 'conservatiLoading', 'conservatiEmpty', 'conservatiError',
    'conservatiList', 'conservatiDetail', 'conservatiClose', 'conservatiBackdrop', 'conservatiRetry'
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const coupleId = 'couple-current';
  const queries = [];
  const signedPaths = [];
  const rendered = [];
  const document = {
    getElementById: id => elements.get(id) || null,
    addEventListener() {}
  };
  const responseFor = (query) => {
    queries.push({ table: query.table, filters: query.filters });
    if (query.table === 'conserva_contributions') {
      const rows = contributions.filter(row => query.filters.every(filter => filter.column !== 'couple_id' || row.couple_id === filter.value));
      return { data: rows, error: null };
    }
    if (query.table === 'left_for_you') {
      const idFilter = query.filters.find(filter => filter.column === 'id')?.values || [];
      const rows = sources.filter(row => idFilter.includes(row.id) && row.couple_id === coupleId);
      return { data: rows, error: null };
    }
    if (query.table === 'profiles') return { data: profiles.filter(row => row.couple_id === coupleId), error: null };
    return { data: null, error: new Error(`unexpected_table:${query.table}`) };
  };
  const client = {
    from(table) {
      const query = { table, filters: [] };
      const chain = {
        select() { return chain; },
        eq(column, value) { query.filters.push({ column, value }); return chain; },
        in(column, values) { query.filters.push({ column, values }); return chain; },
        order() { return chain; },
        then(resolve, reject) { return Promise.resolve(responseFor(query)).then(resolve, reject); }
      };
      return chain;
    }
  };
  const window = {
    usProfile: { id: 'profile-recipient', couple_id: coupleId },
    UsUiFoundation: { cancelSurfaceExit() {}, exitSurface(_surface, finalize) { finalize(); } },
    UsLeftForYou: {
      labelForKind: kind => ({ text: 'Un pensiero', photo: 'Una foto', audio: 'Una voce', video: 'Un momento', music: 'Musica' }[kind]),
      renderItemMarkup(item, mediaUrl) {
        rendered.push({ id: item.id, kind: item.kind, mediaUrl });
        if (item.kind === 'audio') return `<article data-render-kind="${item.kind}"><audio src="${mediaUrl}"><source src="${mediaUrl}"></audio></article>`;
        if (item.kind === 'video') return `<article data-render-kind="${item.kind}"><video src="${mediaUrl}"><source src="${mediaUrl}"></video></article>`;
        return `<article data-render-kind="${item.kind}">${item.body || ''}</article>`;
      }
    },
    async usGetSignedUrls(paths) {
      signedPaths.push(...paths);
      if (signError) throw signError;
      return new Map(paths.map(value => [value, `https://signed.example/${value}`]));
    }
  };
  const source = read('moments-albums.js').replace(/\r\n/g, '\n');
  const marker = source.indexOf('/* ============================================================\n   US · Conservati Surface (M5J)');
  assert.notEqual(marker, -1, 'M5J module marker must exist');
  vm.runInNewContext(source.slice(marker), { window, document, console: { warn() {} }, sb: client, Map, Set, Promise }, { filename: 'moments-albums.js:M5J' });
  return { window, elements, queries, signedPaths, rendered, coupleId };
}

function tick() { return new Promise(resolve => setTimeout(resolve, 0)); }

function conservedFixtures() {
  const createdAt = '2026-09-23T10:30:00.000Z';
  const kinds = ['text', 'photo', 'audio', 'video', 'music'];
  const contributions = kinds.map(kind => ({
    id: `contribution-${kind}`,
    couple_id: 'couple-current',
    source_item_id: `source-${kind}`,
    source_sender_id: 'profile-sender',
    conserved_by: 'profile-recipient',
    created_at: '2026-09-24T10:30:00.000Z'
  }));
  const sources = kinds.map(kind => ({
    id: `source-${kind}`,
    couple_id: 'couple-current',
    sender_id: 'profile-sender',
    recipient_id: 'profile-recipient',
    kind,
    body: kind === 'text' ? 'Una frase da ricordare' : 'Una nota originale',
    media_path: kind === 'music'
      ? 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
      : ['photo', 'audio', 'video'].includes(kind) ? `couple-current/profile-sender/left/${kind}.bin` : null,
    created_at: createdAt
  }));
  const profiles = [
    { id: 'profile-sender', couple_id: 'couple-current', display_name: 'Beatrice' },
    { id: 'profile-recipient', couple_id: 'couple-current', display_name: 'Francesco' }
  ];
  return { contributions, sources, profiles, kinds, createdAt };
}

test('M5J Ricordi exposes a Conservati entry with the required title, tagline and a coherent empty state', () => {
  const html = read('index.html');

  const momentsMatch = html.match(/<main id="moments" class="page">[\s\S]*?<\/main>/);
  assert.ok(momentsMatch, 'Ricordi (moments page) must exist');
  const momentsBlock = momentsMatch[0];

  // Ricordi must expose an actionable entry point into Conservati.
  const entryMatch = momentsBlock.match(/<button[^>]*id="conservatiEntry"[^>]*>/);
  assert.ok(entryMatch, 'Ricordi must expose a Conservati entry point (button)');
  assert.match(entryMatch[0], /Conservati/, 'the Conservati entry must be labelled "Conservati"');

  // The Conservati surface itself must carry the exact required title.
  const titleMatch = html.match(/<h[1-4][^>]*>Conservati<\/h[1-4]>/);
  assert.ok(titleMatch, 'the Conservati surface must show the exact title "Conservati"');

  // The Conservati surface must carry the exact required tagline copy.
  assert.match(html, /Piccole cose che avete deciso di non perdere\./,
    'the Conservati surface must show the exact required tagline');

  // A coherent, explicit empty state, hidden until data resolves (mirrors leftForYouEmpty).
  const emptyOpenMatch = html.match(/<div[^>]*id="conservatiEmpty"[^>]*>/);
  assert.ok(emptyOpenMatch, 'Conservati must have an explicit empty-state element');
  assert.match(emptyOpenMatch[0], /hidden/, 'the Conservati empty state must stay hidden until the list resolves');

  const emptyStart = html.indexOf(emptyOpenMatch[0]);
  const emptyEnd = html.indexOf('</div>', emptyStart);
  const emptyBlock = html.slice(emptyStart, emptyEnd);
  assert.match(emptyBlock, /<p>[^<]{10,}<\/p>/,
    'the Conservati empty state must carry a coherent, explicit message');
  assert.doesNotMatch(emptyBlock, /Carico i vostri ricordi/,
    'the Conservati empty state must be distinct from the Moments loading copy');
});

test('M5J loads couple-scoped contributions, resolves original source/provenance, and reuses private-media rendering', () => {
  const source = read('moments-albums.js');

  assert.ok(/from\(['"]conserva_contributions['"]\)/.test(source),
    'Conservati must read the existing contribution authority');
  assert.ok(/const coupleId = window\.usProfile\?\.couple_id/.test(source),
    'the authenticated profile couple id must be the query tenant');
  assert.ok(/eq\(['"]couple_id['"],\s*coupleId\)/.test(source),
    'contribution reads must explicitly scope to the signed-in couple as well as rely on RLS');
  assert.ok(/source_item_id/.test(source),
    'each contribution must resolve through its left_for_you provenance link');
  assert.ok(/from\(['"]left_for_you['"]\)/.test(source),
    'original source payload must be read from left_for_you');
  assert.ok(/sender_id[\s\S]*created_at|created_at[\s\S]*sender_id/.test(source),
    'the original sender and source creation timestamp must remain available for display');
  assert.ok(/from\(['"]profiles['"]\)/.test(source),
    'sender names must be resolved through the existing couple profiles');
  assert.ok(/usGetSignedUrls|usGetSignedUrl/.test(source),
    'private photo/audio/video must use the existing signed-media helper');
  assert.ok(/UsLeftForYou\?\.renderItemMarkup/.test(source),
    'content rendering must reuse the existing Left for You renderer');
  assert.ok(!/from\(['"]conserva_contributions['"]\)[\s\S]{0,120}\.insert\(/.test(source),
    'Conservati must not create a second contribution authority');
});

test('M5J versions the static shell without changing the private media cache', () => {
  const html = read('index.html');
  const worker = read('service-worker.js');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/<meta\s+name="us-build"\s+content="([^"]+)"/)?.[1];

  assert.equal(build, 'us-m12d-quest-v2-20261001-2');
  assert.equal(version, build);
  assert.ok(/const CACHE_NAME = "us-shell-static-runtime-50"/.test(worker));
  assert.ok(/const MEDIA_CACHE_NAME = "us-private-media-v1"/.test(worker));
});

test('M5J supports opening a conserved item in detail and returning to the list', () => {
  const source = read('moments-albums.js');

  assert.ok(/data-conservati-open/.test(source), 'each conserved list row must be actionable');
  assert.ok(/data-conservati-back/.test(source), 'the focused detail must have a return-to-list action');
  assert.ok(/showConservatiState\(['"]detail['"]\)/.test(source));
  assert.ok(/showConservatiState\(['"]list['"]\)/.test(source));
});

test('M5J Conservati surfaces have isolated styling in the existing Moments stylesheet', () => {
  const css = read('moments-albums.css');
  assert.ok(/\.us-conservati-entry\s*\{/.test(css));
  assert.ok(/\.conservati-overlay\s*\{/.test(css));
  assert.ok(/\.conservati-card\s*\{/.test(css));
  assert.ok(/\.conservati-detail\s*\{/.test(css));
});

test('M5J opens an actual empty state after couple-scoped loading resolves to no contributions', async () => {
  const harness = mountConservati();
  harness.window.openConservati();
  await tick();

  assert.equal(harness.elements.get('conservatiOverlay').classList.contains('show'), true);
  assert.equal(harness.elements.get('conservatiLoading').hidden, true);
  assert.equal(harness.elements.get('conservatiEmpty').hidden, false);
  assert.equal(harness.elements.get('conservatiList').hidden, true);
  assert.deepEqual(harness.queries.map(query => query.table), ['conserva_contributions']);
  assert.equal(harness.queries[0].filters.find(filter => filter.column === 'couple_id')?.value, harness.coupleId);
});

test('M5J hydrates source provenance, uses signed media and renders all five kinds in focused detail', async () => {
  const fixtures = conservedFixtures();
  const harness = mountConservati(fixtures);
  harness.window.openConservati();
  await tick();

  const list = harness.elements.get('conservatiList');
  const detail = harness.elements.get('conservatiDetail');
  assert.equal(list.hidden, false);
  assert.match(list.innerHTML, /Beatrice/);
  assert.match(list.innerHTML, /Una frase da ricordare/);
  assert.deepEqual(harness.queries.map(query => query.table), ['conserva_contributions', 'left_for_you', 'profiles']);
  for (const query of harness.queries) {
    assert.equal(query.filters.find(filter => filter.column === 'couple_id')?.value, harness.coupleId);
  }
  assert.deepEqual(harness.signedPaths.sort(), [
    'couple-current/profile-sender/left/audio.bin',
    'couple-current/profile-sender/left/photo.bin',
    'couple-current/profile-sender/left/video.bin'
  ]);

  for (const kind of fixtures.kinds) {
    list.emit('click', {
      target: { closest: () => ({ dataset: { conservatiOpen: `contribution-${kind}` } }) }
    });
    assert.equal(detail.hidden, false);
    assert.match(detail.innerHTML, new RegExp(`data-render-kind="${kind}"`));
    assert.match(detail.innerHTML, /Beatrice/);
    assert.ok(detail.innerHTML.includes(`datetime="${fixtures.createdAt}"`), 'detail date must come from the original source');
    const rendered = harness.rendered.find(item => item.id === `source-${kind}`);
    assert.ok(rendered, `${kind} must flow through the existing Left for You renderer`);
    if (['photo', 'audio', 'video'].includes(kind)) assert.match(rendered.mediaUrl, /^https:\/\/signed\.example\//);
    else assert.equal(rendered.mediaUrl, '');
    detail.emit('click', { target: { closest: selector => selector === '[data-conservati-back]' ? {} : null } });
    assert.equal(list.hidden, false, 'the detail back action must restore the list');
  }
});

test('M5J Conservati back pauses and unloads focused audio or video before restoring the list', async () => {
  const harness = mountConservati(conservedFixtures());
  harness.window.openConservati();
  await tick();

  const list = harness.elements.get('conservatiList');
  const detail = harness.elements.get('conservatiDetail');
  for (const kind of ['audio', 'video']) {
    list.emit('click', {
      target: { closest: () => ({ dataset: { conservatiOpen: `contribution-${kind}` } }) }
    });
    const [media] = detail.mediaNodes;
    assert.equal(media?.tagName, kind.toUpperCase());

    detail.emit('click', { target: { closest: selector => selector === '[data-conservati-back]' ? {} : null } });

    assert.equal(media.pauseCalls, 1, `${kind} must pause before detail returns to the list`);
    assert.equal(media.attributes.has('src'), false, `${kind} src must be removed`);
    assert.equal(media.source.attributes.has('src'), false, `${kind} child source must be removed`);
    assert.equal(media.loadCalls, 1, `${kind} must reset after unloading`);
    assert.equal(list.hidden, false, 'the detail back action must restore the list');
  }
});
