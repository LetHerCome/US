// Mappa dei Ricordi (founder, 29/10/2026, docs/DECISIONS.md). One place per
// Ricordo (D1): from the photo's GPS, with consent, or searched by hand (D2);
// rounded to about 100 m and seen only by the couple (D3, enforced again by
// the column type and RLS of ricordi_place_v1). Free, no Plus (D5).
// - Search and names: Photon (komoot), fair use, so a pause before asking,
//   at least 3 letters and one request at a time.
// - Map: MapLibre GL JS with OpenFreeMap tiles, loaded only when the map
//   opens. Both need no key and no account.
// - Android: the native UsPhotoPlace plugin picks the photos with the document
//   picker and reads the place of the original (ACCESS_MEDIA_LOCATION, asked
//   after our own explanation). Elsewhere the place comes from the file, when
//   it still has one.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsRicordiPlace = api;
})(typeof window !== 'undefined' ? window : null, function (w) {
  'use strict';

  const PHOTON = 'https://photon.komoot.io';
  const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  // Subresource Integrity (audit 05/11): the CDN must serve exactly these files
  // (hashes from data.jsdelivr.com for maplibre-gl 5.24.0, CSS re-checked by hand).
  const MAPLIBRE_JS_SRI = 'sha256-RamwepGJzlYFTGIKlHzPQeKR5YyV6bYVM7dAqqZe5cs=';
  const MAPLIBRE_CSS_SRI = 'sha256-qx5w1Z7EBGW65+cDDaLzzPKBM/1QLmK9WY7vut/XpzI=';
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
  const LABEL_MAX = 120;
  const SEARCH_MIN = 3;
  const SEARCH_DELAY_MS = 400;
  const CONSENT_KEY = 'us:ricordi-place-consent:v1';
  const NEAR_ZOOM = 11;

  const round3 = (value) => Math.round(Number(value) * 1000) / 1000;
  const validCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

  // A place as the app keeps it: rounded, with a short name and where it came from.
  function normalize(place) {
    if (!place) return null;
    const lat = round3(place.lat), lon = round3(place.lon);
    const label = String(place.label || '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
    const source = place.source === 'photo' ? 'photo' : 'search';
    if (!validCoord(lat, lon) || !label) return null;
    return { lat, lon, label, source };
  }

  // A short name: the place, or the street without its number, then the town.
  // Never a house number: the coordinates are rounded, the name must be too.
  function labelFrom(props) {
    if (!props) return '';
    const town = props.city || props.town || props.village || props.municipality || props.county || '';
    const first = props.name || props.street || props.locality || props.district || '';
    const parts = [];
    for (const part of [first, town, town ? '' : props.state, (town || first) ? '' : props.country]) {
      const clean = String(part || '').trim();
      if (clean && !parts.some((p) => p.toLowerCase() === clean.toLowerCase())) parts.push(clean);
    }
    return parts.join(', ').slice(0, LABEL_MAX);
  }

  function placesFrom(json) {
    const seen = new Set();
    const out = [];
    for (const feature of json?.features || []) {
      const [lon, lat] = feature?.geometry?.coordinates || [];
      const label = labelFrom(feature?.properties);
      const place = normalize({ lat, lon, label, source: 'search' });
      if (!place || seen.has(place.label.toLowerCase())) continue;
      seen.add(place.label.toLowerCase());
      const props = feature.properties || {};
      out.push({ ...place, detail: [props.state, props.country].filter(Boolean).join(', ') });
    }
    return out;
  }

  // Photon answers in the language of the request: Italian names on every phone
  // (its lang= parameter has no Italian; Accept-Language needs no preflight).
  async function photon(path, signal) {
    const response = await fetch(`${PHOTON}${path}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Accept-Language': 'it' } });
    if (!response.ok) throw new Error(`photon ${response.status}`);
    return response.json();
  }

  async function search(query, { signal, near } = {}) {
    const q = String(query || '').trim();
    if (q.length < SEARCH_MIN) return [];
    const bias = near && validCoord(near.lat, near.lon) ? `&lat=${round3(near.lat)}&lon=${round3(near.lon)}` : '';
    return placesFrom(await photon(`/api/?q=${encodeURIComponent(q)}&limit=6${bias}`, signal));
  }

  // The name of the place of a photo. The coordinates sent are already rounded.
  async function nameOf(lat, lon, { signal } = {}) {
    try {
      const json = await photon(`/reverse?lat=${round3(lat)}&lon=${round3(lon)}&limit=1`, signal);
      const feature = json?.features?.[0];
      if (!feature) return '';
      const props = { ...feature.properties };
      // A reverse hit is often a house: keep the street and the town only.
      if (props.osm_key === 'place' || props.housenumber) delete props.name;
      return labelFrom(props);
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('[US Mappa] nome del posto', error);
      return '';
    }
  }

  async function fromCoords(lat, lon) {
    if (!validCoord(lat, lon)) return null;
    const label = (await nameOf(lat, lon)) || 'Posizione della foto';
    return normalize({ lat, lon, label, source: 'photo' });
  }

  // ---- Android: photos with their place ----------------------------------
  function plugin() {
    if (w?.UsPlatform?.platformName !== 'android') return null;
    return w.UsPlatform.getNativePlugin?.('UsPhotoPlace') || null;
  }

  // D3: the app says what the place is for, once, before reading it (and
  // before Android asks). "Non ora" still opens the photos, without places.
  function storedConsent() {
    try { return w.localStorage.getItem(CONSENT_KEY) || ''; } catch (_) { return ''; }
  }
  async function explain() {
    const ok = await w.UsUiFoundation?.confirm?.({
      icon: 'map-pin',
      kicker: 'Mappa dei Ricordi',
      title: 'Dove avete scattato le foto?',
      body: 'US può leggere il posto delle foto che scegli per metterle sulla vostra mappa. Lo vedete solo voi due, arrotondato a circa 100 metri, e potete sempre toglierlo.',
      confirmLabel: 'Continua',
      cancelLabel: 'Non ora',
    });
    try { w.localStorage.setItem(CONSENT_KEY, ok ? 'yes' : 'no'); } catch (_) {}
    return Boolean(ok);
  }
  // A browser that kept the position in the file: asked once, like on Android.
  async function photoConsent() {
    const stored = storedConsent();
    if (stored) return stored === 'yes';
    return explain();
  }
  async function askConsent(native) {
    let state = '';
    try { state = (await native.checkPermissions())?.mediaLocation || ''; } catch (_) { return false; }
    if (state === 'granted') return true;
    if (state === 'denied' || storedConsent() === 'no') return false;
    if (!(await explain())) return false;
    try { return (await native.requestPermissions({ permissions: ['mediaLocation'] }))?.mediaLocation === 'granted'; } catch (_) { return false; }
  }

  // null: no native picker here, use the file input. Otherwise the picked
  // photos as Files, each with its place (rounded) when the phone gave one.
  async function pickWithPlaces() {
    const native = plugin();
    if (!native) return null;
    await askConsent(native);
    const result = await native.pick({ multiple: true });
    const files = [];
    const places = new Map();
    for (const photo of result?.photos || []) {
      try {
        const url = w.Capacitor?.convertFileSrc?.(photo.path) || photo.path;
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], photo.name || 'foto', { type: photo.type || blob.type, lastModified: Number(photo.lastModified) || Date.now() });
        files.push(file);
        if (validCoord(Number(photo.lat), Number(photo.lon))) places.set(file, { lat: Number(photo.lat), lon: Number(photo.lon) });
      } catch (error) { console.warn('[US Mappa] foto', error); }
    }
    return { files, places, skipped: Number(result?.skipped) || 0 };
  }

  // ---- The "Dove" sheet --------------------------------------------------
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let sheet = null;
  function ensureSheet() {
    if (sheet) return sheet;
    w.document.body.insertAdjacentHTML('beforeend', `
      <div class="ricordi-place-overlay" id="ricordiPlaceOverlay" aria-hidden="true" data-us-modal data-us-motion-surface>
        <div class="us-modal-backdrop" data-place-close></div>
        <section class="ricordi-place-sheet us-sheet is-bottom" role="dialog" aria-modal="true" aria-labelledby="ricordiPlaceTitle" data-us-modal-panel>
          <header class="ricordi-place-head">
            <div><div class="tiny">Ricordi</div><h2 id="ricordiPlaceTitle">Dove</h2></div>
            <button type="button" class="us-modal-close" aria-label="Chiudi" data-us-modal-close data-place-close><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>
          </header>
          <input type="search" class="ricordi-place-input" id="ricordiPlaceInput" placeholder="Cerca un posto o un indirizzo" autocomplete="off" enterkeyhint="search" maxlength="120">
          <p class="ricordi-place-status" id="ricordiPlaceStatus" role="status" aria-live="polite"></p>
          <ul class="ricordi-place-results" id="ricordiPlaceResults"></ul>
          <button type="button" class="ricordi-place-remove ghost" id="ricordiPlaceRemove" hidden>Togli il posto</button>
          <p class="ricordi-place-credit">Ricerca © OpenStreetMap, Photon</p>
        </section>
      </div>`);
    sheet = w.document.getElementById('ricordiPlaceOverlay');
    return sheet;
  }

  // Resolves with the chosen place, null to remove it, undefined if closed.
  function choose({ current = null, near = null } = {}) {
    const overlay = ensureSheet();
    const input = overlay.querySelector('#ricordiPlaceInput');
    const list = overlay.querySelector('#ricordiPlaceResults');
    const status = overlay.querySelector('#ricordiPlaceStatus');
    const remove = overlay.querySelector('#ricordiPlaceRemove');
    input.value = '';
    list.replaceChildren();
    status.textContent = current ? `Ora: ${current.label}` : '';
    remove.hidden = !current;
    w.UsUiFoundation?.cancelSurfaceExit?.(overlay);
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    return new Promise((resolve) => {
      let timer = 0, controller = null, results = [], done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer); controller?.abort();
        input.oninput = null; list.onclick = null; remove.onclick = null; overlay.onclick = null; input.onkeydown = null;
        const close = () => { overlay.classList.remove('show'); overlay.setAttribute('aria-hidden', 'true'); };
        if (w.UsUiFoundation?.exitSurface) w.UsUiFoundation.exitSurface(overlay, close); else close();
        resolve(value);
      };
      const run = async () => {
        controller?.abort();
        const q = input.value.trim();
        if (q.length < SEARCH_MIN) { list.replaceChildren(); status.textContent = q ? 'Scrivi almeno 3 lettere' : (current ? `Ora: ${current.label}` : ''); return; }
        controller = new AbortController();
        status.textContent = 'Cerco…';
        try {
          results = await search(q, { signal: controller.signal, near });
          list.innerHTML = results.map((p, i) => `<li><button type="button" data-place-index="${i}"><span class="us-icon" data-us-icon="map-pin" aria-hidden="true"></span><span><b translate="no">${esc(p.label)}</b>${p.detail ? `<small translate="no">${esc(p.detail)}</small>` : ''}</span></button></li>`).join('');
          status.textContent = results.length ? '' : 'Nessun posto trovato';
        } catch (error) {
          if (error?.name === 'AbortError') return;
          console.warn('[US Mappa] ricerca', error);
          status.textContent = 'Ricerca non disponibile: riprova tra poco';
        }
      };
      input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, SEARCH_DELAY_MS); };
      input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(timer); run(); } };
      list.onclick = (event) => {
        const pick = results[Number(event.target.closest('[data-place-index]')?.dataset.placeIndex)];
        if (pick) finish(normalize(pick));
      };
      remove.onclick = () => finish(null);
      overlay.onclick = (event) => { if (event.target.closest('[data-place-close]')) finish(undefined); };
    });
  }

  // The app's client is the global `sb` of app.js, a const: never window.sb.
  // eslint-disable-next-line no-undef
  const client = () => { try { return sb; } catch (_) { return w?.sb || null; } };

  // Either member places, moves or clears a saved Ricordo (set_moment_place).
  async function save(momentId, place) {
    const p = place ? normalize(place) : null;
    const db = client();
    if (!db) throw new Error('supabase_unavailable');
    const { data, error } = await db.rpc('set_moment_place', {
      p_moment: momentId, p_lat: p?.lat ?? null, p_lon: p?.lon ?? null, p_label: p?.label ?? null, p_source: p?.source ?? null,
    });
    if (error) throw error;
    return data;
  }

  // Card data attributes, as ricordiMomentCard writes them.
  function fromCard(card) {
    const d = card?.dataset || {};
    if (d.placeLat == null || d.placeLat === '') return null;
    return normalize({ lat: Number(d.placeLat), lon: Number(d.placeLon), label: d.placeLabel, source: d.placeSource });
  }

  // ---- The map -----------------------------------------------------------
  let maplibrePromise = null;
  function loadMapLibre() {
    if (w.maplibregl) return Promise.resolve(w.maplibregl);
    if (maplibrePromise) return maplibrePromise;
    maplibrePromise = new Promise((resolve, reject) => {
      const css = w.document.createElement('link');
      css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS; css.integrity = MAPLIBRE_CSS_SRI; css.crossOrigin = 'anonymous';
      w.document.head.appendChild(css);
      const script = w.document.createElement('script');
      script.src = MAPLIBRE_JS; script.integrity = MAPLIBRE_JS_SRI; script.async = true; script.crossOrigin = 'anonymous';
      script.onload = () => (w.maplibregl ? resolve(w.maplibregl) : reject(new Error('maplibre missing')));
      script.onerror = () => { maplibrePromise = null; script.remove(); reject(new Error('maplibre not loaded')); };
      w.document.head.appendChild(script);
    });
    return maplibrePromise;
  }

  // The placed Ricordi, from the cards already drawn in Mese per mese.
  function pointsFrom(cards) {
    const out = [];
    for (const card of cards || []) {
      const place = fromCard(card);
      if (!place) continue;
      // The photo on the card. With an album the inline carousel puts an empty
      // "peek" image first: never that one.
      const img = card.querySelector?.('.ricordi-inline-current') || card.querySelector?.('img[src]:not(.ricordi-inline-peek)');
      const caption = String(card.dataset.caption || '').replace(/\s+/g, ' ').trim();
      out.push({ id: card.dataset.momentId, lat: place.lat, lon: place.lon, label: place.label, caption, thumb: img?.currentSrc || img?.getAttribute?.('src') || '' });
    }
    return out;
  }

  let map = null, markers = new Map(), mapPoints = [];
  const cards = () => [...w.document.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')];

  function markerEl(feature) {
    const el = w.document.createElement('button');
    el.type = 'button';
    const props = feature.properties || {};
    const photo = (thumb) => (thumb ? `<img src="${esc(thumb)}" alt="" decoding="async">` : '<span class="us-icon" data-us-icon="map-pin" aria-hidden="true"></span>');
    if (props.cluster) {
      // A group shows one of its photos with the count; the photo arrives a moment later.
      el.className = 'ricordi-map-pin is-cluster';
      el.setAttribute('aria-label', `${props.point_count} ricordi qui`);
      el.innerHTML = `<span class="ricordi-map-photo"></span><b class="ricordi-map-count">${Number(props.point_count) || ''}</b>`;
      Promise.resolve(map.getSource('ricordi').getClusterLeaves(props.cluster_id, 1, 0))
        .then((leaves) => { const thumb = leaves?.[0]?.properties?.thumb; if (thumb) el.firstElementChild.innerHTML = photo(thumb); })
        .catch(() => {});
    } else {
      // The photo of the Ricordo; close up (is-near) its note, or the place, written small under it.
      const text = props.caption || props.label || '';
      el.className = 'ricordi-map-pin';
      el.setAttribute('aria-label', props.caption ? `${props.caption}, ${props.label}` : (props.label || 'Ricordo'));
      el.innerHTML = `<span class="ricordi-map-photo">${photo(props.thumb)}</span>${text ? `<span class="ricordi-map-label" translate="no">${esc(text)}</span>` : ''}`;
    }
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (props.cluster) {
        Promise.resolve(map.getSource('ricordi').getClusterExpansionZoom(props.cluster_id))
          .then((zoom) => map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(zoom, 16) }))
          .catch(() => {});
        return;
      }
      const card = cards().find((c) => c.dataset.momentId === props.id);
      if (card) w.openMomentViewer?.(card);
    });
    return el;
  }

  function refreshMarkers() {
    if (!map?.getSource('ricordi') || !map.isSourceLoaded('ricordi')) return;
    const next = new Map();
    for (const feature of map.querySourceFeatures('ricordi')) {
      const props = feature.properties || {};
      const key = props.cluster ? `c${props.cluster_id}` : `m${props.id}`;
      if (next.has(key)) continue;
      const marker = markers.get(key) || new w.maplibregl.Marker({ element: markerEl(feature) }).setLngLat(feature.geometry.coordinates);
      next.set(key, marker);
    }
    for (const [key, marker] of markers) if (!next.has(key)) marker.remove();
    for (const [key, marker] of next) if (!markers.has(key)) marker.addTo(map);
    markers = next;
  }

  function geojson(points) {
    return {
      type: 'FeatureCollection',
      features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, label: p.label, caption: p.caption, thumb: p.thumb } })),
    };
  }

  // Italy when there is nothing yet; one place with its town and surroundings
  // (zoom 9: closer, the dark map is a road and nothing else); more places together.
  function viewFor(points) {
    if (!points.length) return { center: [12.5, 42.5], zoom: 4.3 };
    const lons = points.map((p) => p.lon), lats = points.map((p) => p.lat);
    const west = Math.min(...lons), south = Math.min(...lats), east = Math.max(...lons), north = Math.max(...lats);
    if (west === east && south === north) return { center: [west, south], zoom: 9 };
    return { bounds: [[west, south], [east, north]], maxZoom: 12 };
  }

  // OpenFreeMap writes its names in English («ITALY», «MUNICH»): the label
  // layers that read name_en read the Italian name, then the local one (03/11/2026).
  function italianLabel(field) {
    if (!field || !JSON.stringify(field).includes('"name_en"')) return null;
    return ['coalesce', ['get', 'name:it'], ['get', 'name:latin'], ['get', 'name']];
  }

  function fit(points, animate) {
    const view = viewFor(points);
    if (!view.bounds) { map.jumpTo(view); return; }
    map.fitBounds(view.bounds, { padding: 56, maxZoom: view.maxZoom, animate });
  }

  function renderEmpty(box, empty) {
    let note = box.querySelector('.ricordi-map-empty');
    if (!empty) { note?.remove(); return; }
    if (note) return;
    note = w.document.createElement('p');
    note.className = 'ricordi-map-empty';
    note.textContent = 'Ancora nessun ricordo sulla mappa. Apri un ricordo e tocca «Aggiungi il posto».';
    box.appendChild(note);
  }

  async function drawMap() {
    const box = w.document.getElementById('ricordiMap');
    if (!box) return;
    const before = mapPoints;
    mapPoints = pointsFrom(cards());
    if (box.dataset.error) { box.querySelectorAll('.ricordi-map-empty').forEach((note) => note.remove()); delete box.dataset.error; }
    renderEmpty(box, !mapPoints.length);
    if (map) {
      // New photos, notes or places: the pins are drawn again from the new data.
      for (const marker of markers.values()) marker.remove();
      markers = new Map();
      map.getSource('ricordi')?.setData(geojson(mapPoints));
      map.resize();
      // The map opened before the Ricordi arrived: it showed Italy, now it goes to them.
      if (!before.length && mapPoints.length) fit(mapPoints, true);
      return;
    }
    box.classList.add('is-loading');
    let gl;
    try { gl = await loadMapLibre(); }
    catch (error) {
      console.warn('[US Mappa] MapLibre', error);
      box.classList.remove('is-loading');
      box.dataset.error = '1';
      renderEmpty(box, false);
      box.insertAdjacentHTML('beforeend', '<p class="ricordi-map-empty">La mappa non si apre: controlla la connessione e riprova.</p>');
      return;
    }
    const canvas = w.document.createElement('div');
    canvas.className = 'ricordi-map-canvas';
    box.prepend(canvas);
    map = new gl.Map({ container: canvas, style: MAP_STYLE, center: [12.5, 42.5], zoom: 4.3, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false });
    map.touchZoomRotate?.disableRotation?.();
    // The dark style asks for icons its sprite lacks («circle-11», «wood-pattern»): an empty one each.
    map.on('styleimagemissing', (event) => { if (!map.hasImage(event.id)) map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    map.on('load', () => {
      box.classList.remove('is-loading');
      for (const layer of map.getStyle()?.layers || []) {
        const label = layer.type === 'symbol' ? italianLabel(layer.layout?.['text-field']) : null;
        if (label) map.setLayoutProperty(layer.id, 'text-field', label);
      }
      map.addSource('ricordi', { type: 'geojson', data: geojson(mapPoints), cluster: true, clusterRadius: 52, clusterMaxZoom: 15 });
      // An invisible layer keeps the source's tiles alive for querySourceFeatures.
      map.addLayer({ id: 'ricordi-hit', type: 'circle', source: 'ricordi', paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      fit(mapPoints, false);
      near();
    });
    // Close up, the note of each Ricordo appears under its photo.
    const near = () => box.classList.toggle('is-near', map.getZoom() >= NEAR_ZOOM);
    map.on('zoom', near);
    map.on('render', refreshMarkers);
  }

  // ---- La bacheca (redesign definitivo, fase 8, D12) ----------------------
  // A detective board laid out like a real map (north up): each place is a
  // pinned tag, its polaroids around it, a red string joins the places in the
  // order you first went there. A tag opens the map there, a polaroid opens
  // its Ricordo; the Ricordi with no place wait in «Da appuntare». It lays
  // itself out from the cards already drawn in the Raccolta: no new data, no
  // new reads (the photos are the ones already on screen).
  const BOARD_PAD = 86;
  const BOARD_GAP = 150;
  const BOARD_POLAROIDS = 3;
  const LOOSE_MAX = 12;
  const placeKey = (p) => `${round3(p.lat).toFixed(3)},${round3(p.lon).toFixed(3)}`;
  function boardPlaces(items) {
    const groups = new Map();
    for (const it of items || []) {
      if (!validCoord(it?.lat, it?.lon)) continue;
      const key = placeKey(it);
      let g = groups.get(key);
      if (!g) { g = { key, lat: round3(it.lat), lon: round3(it.lon), label: '', items: [] }; groups.set(key, g); }
      g.items.push(it);
      if (!g.label && it.label) g.label = it.label;
    }
    const list = [...groups.values()];
    for (const g of list) {
      g.items.sort((a, b) => String(a.iso || '').localeCompare(String(b.iso || '')));
      g.first = g.items[0]?.iso || '';
    }
    return list.sort((a, b) => String(a.first).localeCompare(String(b.first)) || a.key.localeCompare(b.key));
  }
  // Positions in px on a board `width` wide: the real proportions (longitude
  // shortened by the latitude), then the tags pushed apart so none covers another.
  function boardLayout(places, width) {
    const list = places || [];
    if (!list.length) return { height: 0, nodes: [] };
    const lats = list.map((p) => p.lat);
    const mid = (Math.max(...lats) + Math.min(...lats)) / 2;
    const k = Math.cos((mid * Math.PI) / 180) || 1;
    const xs = list.map((p) => p.lon * k), ys = list.map((p) => -p.lat);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const spanX = Math.max(...xs) - x0, spanY = Math.max(...ys) - y0;
    const inner = Math.max(120, width - 2 * BOARD_PAD);
    const span = Math.max(spanX, spanY);
    let scale = span > 1e-6 ? inner / Math.max(spanX, 1e-6) : 0;
    const tallest = Math.max(560, BOARD_GAP * 2 * list.length);
    if (spanY * scale > tallest) scale = tallest / spanY;
    const nodes = list.map((place, i) => ({
      place,
      x: spanX > 1e-6 ? BOARD_PAD + (xs[i] - x0) * scale : width / 2,
      y: BOARD_PAD + 30 + (spanY > 1e-6 ? (ys[i] - y0) * scale : 0),
    }));
    for (let round = 0; round < 60; round += 1) {
      let moved = false;
      for (let a = 0; a < nodes.length; a += 1) {
        for (let b = a + 1; b < nodes.length; b += 1) {
          const A = nodes[a], B = nodes[b];
          let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
          if (d >= BOARD_GAP) continue;
          if (d < 0.01) { dx = b % 2 ? 0.6 : -0.6; dy = 1; d = Math.hypot(dx, dy); }
          const push = (BOARD_GAP - d) / 2, ux = dx / d, uy = dy / d;
          A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push;
          moved = true;
        }
      }
      for (const n of nodes) { n.x = Math.min(width - BOARD_PAD, Math.max(BOARD_PAD, n.x)); n.y = Math.max(BOARD_PAD, n.y); }
      if (!moved) break;
    }
    return { height: Math.round(Math.max(...nodes.map((n) => n.y)) + BOARD_PAD + 60), nodes };
  }
  // The red string, sagging a little between two places.
  function boardString(nodes) {
    if (nodes.length < 2) return '';
    let d = `M${nodes[0].x.toFixed(1)} ${nodes[0].y.toFixed(1)}`;
    for (let i = 1; i < nodes.length; i += 1) {
      const a = nodes[i - 1], b = nodes[i];
      d += ` Q${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + 26).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }
  // The Ricordi as the Raccolta drew them.
  function boardItems() {
    return cards().map((card) => {
      const place = fromCard(card);
      const img = card.querySelector?.('.ricordi-inline-current') || card.querySelector?.('img[src]:not(.ricordi-inline-peek)');
      return {
        id: card.dataset.momentId, lat: place?.lat, lon: place?.lon, label: place?.label || '',
        caption: String(card.dataset.caption || '').replace(/\s+/g, ' ').trim(),
        thumb: img?.currentSrc || img?.getAttribute?.('src') || '', iso: card.dataset.momentIso || '', by: card.dataset.momentBy || '',
      };
    });
  }
  const FAN = [[-40, 52, -8], [2, 68, 4], [42, 50, 9]];
  const polaroid = (it, cls, style) => `<button type="button" class="rb-pol${cls}" data-board-moment="${esc(it.id)}"${it.by ? ` data-by="${esc(it.by)}"` : ''}${style ? ` style="${style}"` : ''} aria-label="${esc(it.caption || 'Apri il ricordo')}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async">` : '<span class="rb-pol-empty"></span>'}</button>`;
  function boardMarkup(items, width) {
    const placed = items.filter((it) => validCoord(it.lat, it.lon));
    const loose = items.filter((it) => !validCoord(it.lat, it.lon));
    const { height, nodes } = boardLayout(boardPlaces(placed), width);
    let html = '';
    if (nodes.length) {
      const path = boardString(nodes);
      html += `<div class="rb-board" style="height:${height}px">`;
      html += `<svg class="rb-string" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${path ? `<path d="${path}"/>` : ''}</svg>`;
      for (const n of nodes) {
        const { place } = n, count = place.items.length;
        const shown = place.items.slice(-BOARD_POLAROIDS);
        html += shown.map((it, i) => polaroid(it, '', `left:${(n.x + FAN[i][0]).toFixed(1)}px;top:${(n.y + FAN[i][1]).toFixed(1)}px;--t:${FAN[i][2]}deg`)).join('');
        if (count > shown.length) html += `<span class="rb-more" style="left:${(n.x + 76).toFixed(1)}px;top:${(n.y + 70).toFixed(1)}px" aria-hidden="true">+${count - shown.length}</span>`;
        const label = place.label || 'Un posto';
        html += `<button type="button" class="rb-tag" data-board-lat="${place.lat}" data-board-lon="${place.lon}" style="left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px" aria-label="${esc(`${label}: ${count} ${count === 1 ? 'ricordo' : 'ricordi'}. Apri la mappa`)}"><i class="rb-pin" aria-hidden="true"></i><b translate="no">${esc(label)}</b><small>${count} ${count === 1 ? 'ricordo' : 'ricordi'}</small></button>`;
      }
      html += '</div>';
    } else {
      html += '<p class="rb-empty">Ancora nessun posto sulla bacheca: aggiungilo a un Ricordo e comparirà qui.</p>';
    }
    if (loose.length) {
      const shown = loose.slice(0, LOOSE_MAX);
      html += `<section class="rb-loose" aria-labelledby="rbLooseTitle"><h4 id="rbLooseTitle">Da appuntare</h4><div class="rb-loose-row">${shown.map((it) => `<div class="rb-loose-item">${polaroid(it, ' is-loose', '')}<button type="button" class="rb-add" data-board-add="${esc(it.id)}">Aggiungi il posto</button></div>`).join('')}</div>${loose.length > shown.length ? `<p class="rb-loose-more">${esc(`E altri ${loose.length - shown.length} nella Raccolta`)}</p>` : ''}</section>`;
    }
    return html;
  }
  function drawBoard() {
    const box = w.document.getElementById('ricordiBacheca');
    if (!box) return;
    const width = Math.max(300, Math.round(box.clientWidth || 360));
    box.innerHTML = boardMarkup(boardItems(), width);
  }
  // «42 ricordi · 9 posti» under the switch.
  function paintCount() {
    const el = w.document.getElementById('ricordiCount');
    if (!el) return;
    const items = boardItems();
    if (!items.length) { el.textContent = ''; el.hidden = true; return; }
    const places = boardPlaces(items).length;
    el.textContent = `${items.length} ${items.length === 1 ? 'ricordo' : 'ricordi'}${places ? ` · ${places} ${places === 1 ? 'posto' : 'posti'}` : ''}`;
    el.hidden = false;
  }
  async function addPlaceFromBoard(id, button) {
    const place = await choose({});
    if (!place) return;
    if (button) button.disabled = true;
    try {
      await save(id, place);
      w.toast?.('Posto salvato');
      await Promise.resolve(w.hydrateMoments?.()).catch(() => {});
    } catch (error) {
      console.warn('[US Bacheca] posto', error);
      w.toast?.('Non riesco a salvare il posto. Riprova.');
    } finally { if (button?.isConnected) button.disabled = false; }
  }
  function openFromBoard(id) {
    const card = w.document.querySelector(`#momentsGrid .moment-card[data-moment-id="${String(id).replace(/"/g, '')}"]`);
    card?.click?.();
  }

  // Fase 8 (D12): Ricordi opens on the Raccolta (the polaroids month by
  // month); the switch shows the Bacheca or the Mappa. The month grid and the
  // chapters stay in the page (the pins and the board open their cards), only hidden.
  const VIEWS = ['story', 'board', 'map'];
  const VIEW_TITLE = { story: 'Mese per mese', board: 'Bacheca', map: 'Mappa' };
  function setView(view, { focus = null } = {}) {
    const doc = w.document;
    const next = VIEWS.includes(view) ? view : 'story';
    const box = doc.getElementById('ricordiMap');
    if (!box) return;
    box.hidden = next !== 'map';
    const board = doc.getElementById('ricordiBacheca');
    if (board) board.hidden = next !== 'board';
    doc.getElementById('moments')?.classList.toggle('ricordi-map-on', next !== 'story');
    const title = doc.getElementById('ricordiStoryTitle');
    if (title) title.textContent = VIEW_TITLE[next];
    for (const tab of doc.querySelectorAll('#moments [data-ricordi-view]')) tab.setAttribute('aria-selected', String(tab.dataset.ricordiView === next));
    if (next === 'board') drawBoard();
    if (next === 'map') {
      Promise.resolve(drawMap()).then(() => {
        if (!focus || !map) return;
        const go = () => map.flyTo({ center: [focus.lon, focus.lat], zoom: 14, essential: true });
        if (map.loaded?.()) go(); else map.once?.('load', go);
      }).catch(() => {});
    }
  }

  function toggleMap() {
    setView(w.document.getElementById('ricordiMap')?.hidden === false ? 'story' : 'map');
  }

  if (w?.addEventListener) {
    // The grid was redrawn (a place added, a new Ricordo): the open map and board follow.
    w.addEventListener('us:moments-updated', () => {
      if (w.document.getElementById('ricordiMap')?.hidden === false) drawMap();
      if (w.document.getElementById('ricordiBacheca')?.hidden === false) drawBoard();
      paintCount();
    });
    w.document?.addEventListener?.('click', (event) => {
      const target = event.target;
      if (!target?.closest) return;
      const tab = target.closest('#moments [data-ricordi-view]');
      if (tab) { setView(tab.dataset.ricordiView); return; }
      const add = target.closest('#ricordiBacheca [data-board-add]');
      if (add) { addPlaceFromBoard(add.dataset.boardAdd, add); return; }
      const pol = target.closest('#ricordiBacheca [data-board-moment]');
      if (pol) { openFromBoard(pol.dataset.boardMoment); return; }
      const tag = target.closest('#ricordiBacheca [data-board-lat]');
      if (tag) setView('map', { focus: { lat: Number(tag.dataset.boardLat), lon: Number(tag.dataset.boardLon) } });
    });
  }

  return Object.freeze({
    normalize, labelFrom, placesFrom, pointsFrom, viewFor, italianLabel, search, nameOf, fromCoords, fromCard,
    pickWithPlaces, photoConsent, choose, save, setView, toggleMap, boardPlaces, boardLayout, boardString, boardMarkup,
  });
});
