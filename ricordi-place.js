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

  async function photon(path, signal) {
    const response = await fetch(`${PHOTON}${path}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
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
      css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS; css.crossOrigin = 'anonymous';
      w.document.head.appendChild(css);
      const script = w.document.createElement('script');
      script.src = MAPLIBRE_JS; script.async = true; script.crossOrigin = 'anonymous';
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

  function fit(points, animate) {
    if (!points.length) { map.jumpTo({ center: [12.5, 42.5], zoom: 4.3 }); return; }
    const lons = points.map((p) => p.lon), lats = points.map((p) => p.lat);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 56, maxZoom: 13, animate });
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
    mapPoints = pointsFrom(cards());
    if (box.dataset.error) { box.querySelectorAll('.ricordi-map-empty').forEach((note) => note.remove()); delete box.dataset.error; }
    renderEmpty(box, !mapPoints.length);
    if (map) {
      // New photos, notes or places: the pins are drawn again from the new data.
      for (const marker of markers.values()) marker.remove();
      markers = new Map();
      map.getSource('ricordi')?.setData(geojson(mapPoints));
      map.resize();
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
    map.on('load', () => {
      box.classList.remove('is-loading');
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

  function setView(view) {
    const showMap = view === 'map';
    const doc = w.document;
    const box = doc.getElementById('ricordiMap');
    if (!box) return;
    box.hidden = !showMap;
    // The month grid and the chapters stay in the page (the pins open their cards), only hidden.
    doc.getElementById('moments')?.classList.toggle('ricordi-map-on', showMap);
    const title = doc.getElementById('ricordiStoryTitle');
    if (title) title.textContent = showMap ? 'Mappa' : 'Mese per mese';
    const toggle = doc.getElementById('ricordiMapSwitch');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(showMap));
      const label = toggle.querySelector('[data-switch-label]');
      if (label) label.textContent = showMap ? 'Mese per mese' : 'Mappa';
    }
    if (showMap) drawMap();
  }

  function toggleMap() {
    setView(w.document.getElementById('ricordiMap')?.hidden === false ? 'story' : 'map');
  }

  if (w?.addEventListener) {
    // The grid was redrawn (a place added, a new Ricordo): the open map follows.
    w.addEventListener('us:moments-updated', () => {
      if (w.document.getElementById('ricordiMap')?.hidden === false) drawMap();
    });
  }

  return Object.freeze({
    normalize, labelFrom, placesFrom, pointsFrom, search, nameOf, fromCoords, fromCard,
    pickWithPlaces, photoConsent, choose, save, setView, toggleMap,
  });
});
