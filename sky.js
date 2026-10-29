// US — «Il vostro cielo» (Premi Sintonia V2, livello 20, 29/10/2026).
// The stars above the couple's city at 22:00 (Rome time) of «Insieme dal»,
// from the Yale Bright Star Catalogue (assets/data/stars-bsc5-v1.json, stars
// up to magnitude 4.5). After level 20, one more golden star for each level.
// Pure astronomy and SVG here; oggi-look.js shows it as a theme of Oggi.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsSky = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Italian cities only: the evening is always on the Rome clock.
  const CITIES = Object.freeze([
    ['roma', 'Roma', 41.90, 12.50], ['milano', 'Milano', 45.46, 9.19], ['napoli', 'Napoli', 40.85, 14.27],
    ['torino', 'Torino', 45.07, 7.69], ['palermo', 'Palermo', 38.12, 13.36], ['genova', 'Genova', 44.41, 8.93],
    ['bologna', 'Bologna', 44.49, 11.34], ['firenze', 'Firenze', 43.77, 11.26], ['bari', 'Bari', 41.12, 16.87],
    ['catania', 'Catania', 37.50, 15.09], ['venezia', 'Venezia', 45.44, 12.33], ['verona', 'Verona', 45.44, 10.99],
    ['messina', 'Messina', 38.19, 15.55], ['padova', 'Padova', 45.41, 11.88], ['trieste', 'Trieste', 45.65, 13.78],
    ['brescia', 'Brescia', 45.54, 10.21], ['bergamo', 'Bergamo', 45.70, 9.67], ['parma', 'Parma', 44.80, 10.33],
    ['modena', 'Modena', 44.65, 10.93], ['reggio_emilia', 'Reggio Emilia', 44.70, 10.63], ['rimini', 'Rimini', 44.06, 12.57],
    ['pisa', 'Pisa', 43.72, 10.40], ['livorno', 'Livorno', 43.55, 10.31], ['prato', 'Prato', 43.88, 11.10],
    ['perugia', 'Perugia', 43.11, 12.39], ['ancona', 'Ancona', 43.62, 13.52], ['pescara', 'Pescara', 42.46, 14.21],
    ['l_aquila', 'L’Aquila', 42.35, 13.40], ['campobasso', 'Campobasso', 41.56, 14.66], ['salerno', 'Salerno', 40.68, 14.77],
    ['taranto', 'Taranto', 40.46, 17.25], ['lecce', 'Lecce', 40.35, 18.17], ['potenza', 'Potenza', 40.64, 15.80],
    ['cosenza', 'Cosenza', 39.30, 16.25], ['catanzaro', 'Catanzaro', 38.91, 16.59], ['reggio_calabria', 'Reggio Calabria', 38.11, 15.65],
    ['siracusa', 'Siracusa', 37.08, 15.29], ['cagliari', 'Cagliari', 39.22, 9.12], ['sassari', 'Sassari', 40.73, 8.56],
    ['trento', 'Trento', 46.07, 11.12], ['bolzano', 'Bolzano', 46.50, 11.35], ['udine', 'Udine', 46.06, 13.24],
    ['aosta', 'Aosta', 45.74, 7.32], ['como', 'Como', 45.81, 9.09], ['novara', 'Novara', 45.45, 8.62],
  ].map(([id, name, lat, lon]) => Object.freeze({ id, name, lat, lon })));
  const cityById = (id) => CITIES.find((c) => c.id === id) || null;

  const RAD = Math.PI / 180;
  const norm = (deg) => ((deg % 360) + 360) % 360;

  // 22:00 in Rome on a YYYY-MM-DD day, as a UTC instant (CET or CEST).
  function eveningUtc(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (const utcHour of [21, 20]) {
      const at = new Date(Date.UTC(y, mo - 1, d, utcHour));
      let hour = utcHour + 1;
      try {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
        hour = Number(parts.find((p) => p.type === 'hour')?.value);
      } catch (_) { /* no time zone data: winter time */ }
      if (hour === 22) return at;
    }
    return new Date(Date.UTC(y, mo - 1, d, 21));
  }

  // Greenwich mean sidereal time, degrees (Meeus 12.4).
  function gmstDegrees(ms) {
    const jd = ms / 86400000 + 2440587.5;
    const t = (jd - 2451545) / 36525;
    return norm(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000);
  }

  // Altitude and azimuth (from north, eastwards) of a [ra, dec] star.
  function horizontal([ra, dec], at, city) {
    const ha = (gmstDegrees(at.getTime()) + city.lon - ra) * RAD;
    const d = dec * RAD, lat = city.lat * RAD;
    const sinAlt = Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(lat) * Math.cos(ha);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const az = Math.atan2(-Math.sin(ha) * Math.cos(d), Math.cos(lat) * Math.sin(d) - Math.sin(lat) * Math.cos(d) * Math.cos(ha));
    return { alt: alt / RAD, az: norm(az / RAD) };
  }

  const starRadius = (vmag) => Math.max(1, 7 - 1.3 * vmag);
  const starColor = (bv) => (bv < 0 ? '#bcd4ff' : bv < 0.3 ? '#e6eeff' : bv < 0.6 ? '#fff6e8' : bv < 1 ? '#ffe2b8' : '#ffc58f');
  const fixed = (n) => Number(n.toFixed(1));

  // Seeded positions for the golden stars after level 20: the same sky every time.
  function seeded(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // The sky seen from below: zenith in the middle, north up, east left.
  // chart (the picture to keep): the whole sky as a night disc with N E S O.
  // overlay (Oggi): the same stars spread over a portrait photo, transparent,
  // the disc larger than the frame so the photo stays the picture.
  function skySvg({ stars, day, city, level = 20, overlay = false }) {
    const at = eveningUtc(day);
    if (!at || !city || !Array.isArray(stars)) return '';
    const W = overlay ? 600 : 1000, H = overlay ? 1300 : 1000;
    const R = overlay ? 900 : 470, CX = W / 2, CY = overlay ? 560 : 500;
    const size = (v) => (overlay ? Math.max(1.5, starRadius(v) * 0.85) : starRadius(v));
    const parts = [];
    for (const star of stars) {
      const { alt, az } = horizontal(star, at, city);
      if (alt <= 0) continue;
      const r = ((90 - alt) / 90) * R;
      const x = CX - r * Math.sin(az * RAD), y = CY - r * Math.cos(az * RAD);
      if (overlay && (x < -10 || x > W + 10 || y < -10 || y > H + 10)) continue;
      // The brightest ones glow, so the constellations read at a glance.
      if (star[2] < 2.5) parts.push(`<circle class="g" cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(size(star[2]) * 3.2)}" fill="${starColor(star[3])}" opacity="${fixed(0.22 + (2.5 - star[2]) * 0.06)}" filter="url(#b)"/>`);
      parts.push(`<circle class="s" cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(size(star[2]))}" fill="${starColor(star[3])}"/>`);
    }
    const rand = seeded(`${day}|${city.id}`);
    for (let i = 0; i < Math.max(0, Math.floor(level) - 20); i += 1) {
      let x, y;
      if (overlay) { x = fixed(W * (0.1 + rand() * 0.8)); y = fixed(H * (0.06 + rand() * 0.5)); }
      else { const a = rand() * 2 * Math.PI, r = Math.sqrt(rand()) * R * 0.86; x = fixed(CX + r * Math.cos(a)); y = fixed(CY + r * Math.sin(a)); }
      parts.push(`<path class="ours" d="M${x} ${fixed(y - 14)}L${fixed(x + 3.5)} ${fixed(y - 3.5)}L${fixed(x + 14)} ${y}L${fixed(x + 3.5)} ${fixed(y + 3.5)}L${x} ${fixed(y + 14)}L${fixed(x - 3.5)} ${fixed(y + 3.5)}L${fixed(x - 14)} ${y}L${fixed(x - 3.5)} ${fixed(y - 3.5)}Z" fill="#ffd36e"/>`);
    }
    const defs = '<defs><radialGradient id="n" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#1b2450"/><stop offset="1" stop-color="#070a1c"/></radialGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs>';
    if (overlay) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${defs}${parts.join('')}</svg>`;
    const label = (text, x, y) => `<text x="${x}" y="${y}" fill="rgba(255,255,255,.55)" font-family="system-ui,sans-serif" font-size="22" text-anchor="middle">${text}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${defs}`
      + `<circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#n)"/>${parts.join('')}`
      + `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>`
      + label('N', CX, 22) + label('S', CX, 994) + label('E', 12, CY + 8) + label('O', 988, CY + 8)
      + '</svg>';
  }

  // ---------- in the app ----------
  // The catalogue, fetched once when the sky is first shown.
  function loadStars() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('/assets/data/stars-bsc5-v1.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((doc) => (Array.isArray(doc?.stars) ? doc.stars : null))
      .catch(() => null);
  }
  // «Dove eravate quella sera?»: the couple's city, on the server (either partner).
  async function saveCity(id) {
    if (typeof sb === 'undefined' || !cityById(id)) return false;
    const { error } = await sb.rpc('set_sky_city', { p_city: id });
    return !error;
  }
  // «Salva l'immagine»: the map with its title, date and city as a PNG, shared
  // where the phone can, downloaded otherwise.
  async function savePicture({ stars, day, city, level }) {
    const svg = skySvg({ stars, day, city, level });
    if (!svg) return false;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#070a1c';
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.drawImage(image, 40, 150, 1000, 1000);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f1ff';
    ctx.font = '600 58px Georgia, serif';
    ctx.fillText('Il vostro cielo', 540, 104);
    let date = day;
    try { date = new Intl.DateTimeFormat(globalThis.UsI18n?.tag || 'it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)); } catch (_) { /* the ISO day */ }
    ctx.fillStyle = 'rgba(244,241,255,.75)';
    ctx.font = '34px system-ui, sans-serif';
    ctx.fillText(`${date} · ${city.name} · ore 22`, 540, 1240);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const file = typeof File === 'function' ? new File([blob], 'il-vostro-cielo.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Il vostro cielo' }); return true; }
      catch (error) { if (error?.name === 'AbortError') return false; }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'il-vostro-cielo.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return true;
  }

  return Object.freeze({ CITIES, cityById, eveningUtc, gmstDegrees, horizontal, starRadius, skySvg, loadStars, saveCity, savePicture });
});
