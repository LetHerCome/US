// Il vostro mese in the real app with the fake Supabase (countdown-browser):
// a couple with a pack of last month to open, the months before opened, one
// with a memory deleted. Photos are drawn gradients (data URLs), so the
// canvas of the sharing stays clean and nothing leaves the machine.
const { start, pageFor } = require('./countdown-browser');

// Runs in the page: answers get_carte_v1, get_pacchetto_v1, apri_pacchetto_v1.
function installMese() {
  const now = new Date();
  const rome = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const year = Number(rome.slice(0, 4)), month = Number(rome.slice(5, 7));
  const last = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const iso = (y, m, d = 1) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const P = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  const day = (d) => iso(last.y, last.m, d);
  const cards = [
    { k: 'foto', path: 'c1/f1/tramonto.webp', caption: 'Il tramonto sul molo', place: 'Pescara', date: day(9), day: day(9), by: 'francesco', pin: { source: 'moment', id: P(1) }, pinned: false },
    { k: 'qa', day: day(3), question: 'Quale piccolo momento vorresti rivivere insieme a me?', mine: 'La colazione al bar sotto casa tua', theirs: 'Quando abbiamo riso in macchina sotto la pioggia' },
    { k: 'posti', places: [{ label: 'Padova', nuovo: false, lat: 45.406, lon: 11.877, day: day(2) }, { label: 'Venezia', nuovo: true, lat: 45.438, lon: 12.327, day: day(16) }, { label: 'Pescara', nuovo: false, lat: 42.464, lon: 14.214, day: day(20) }], nuovi: 1, count: 3 },
    { k: 'numeri', thinks: 47, games: 12, questions: 18 },
    { k: 'foto', path: 'c1/b1/pizza.webp', caption: 'La pizza in Campo Santa Margherita', place: 'Venezia', date: day(16), day: day(16), by: 'beatrice', pin: { source: 'moment', id: P(2) }, pinned: true },
    { k: 'prima', day: day(19), title: 'Carbonara in videochiamata' },
    { k: 'intesa', same: 7, total: 9 },
    { k: 'scelta', day: day(12), question: 'Mare o montagna?', chosen: 'Mare', other: 'Montagna' },
    { k: 'lettera', day: day(7), body: 'Stasera ti chiamo, e poi ti racconto tutto della giornata.', by: 'beatrice', pin: { source: 'conserva', id: P(3) }, pinned: false },
    { k: 'foto', rare: true, path: 'c1/f1/ponte.webp', caption: 'Il ponte al tramonto', place: 'Venezia', date: day(16), day: day(16), by: 'francesco', pin: { source: 'moment', id: P(4) }, pinned: false }
  ].map((c, i) => ({ rare: false, gone: false, ...c, n: i + 1 }));
  const packs = {};
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const at = iso(year, m);
    const id = P(40 + m);
    let state = 'future';
    if (m < 3 && year === last.y) state = 'before';
    else if (year === last.y && m === last.m) state = 'closed';
    else if ((year === last.y && m < last.m) || year < last.y) state = 'opened';
    if (state === 'opened' || state === 'closed') {
      const list = state === 'opened' && m === last.m - 1 ? cards.map((c, i) => (i === 4 ? { ...c, gone: true, path: undefined, caption: undefined } : c)) : cards;
      packs[id] = { id, kind: 'mese', period_start: at, opened: state === 'opened', partner_opened: state === 'opened' && m !== last.m - 1, partner: true, cards: list };
    }
    months.push({ month: m, state, pack: packs[id] ? id : null, count: packs[id] ? 10 : 0, partner_opened: packs[id]?.partner_opened || false, cover: state === 'opened' ? cards[9] : null });
  }
  const goldId = P(99);
  packs[goldId] = { id: goldId, kind: 'anno', period_start: iso(year, 1), opened: false, partner_opened: false, partner: true, cards };
  window.__QA.mese = { packs, months, opened: [], last, goldId };
  window.__QA.rpc.get_carte_v1 = async () => ({ data: { year, today: rome, first_month: iso(year, 3), years: [year], partner: true, months: structuredClone(window.__QA.mese.months), gold: window.__QA.mese.gold || { state: 'future', pack: null, count: 0, partner_opened: false }, waiting: window.__QA.mese.months.filter((x) => x.state === 'closed').map((x) => ({ pack: x.pack, kind: 'mese', period_start: iso(year, x.month) })) }, error: null });
  window.__QA.rpc.get_pacchetto_v1 = async ({ p_pack }) => ({ data: structuredClone(window.__QA.mese.packs[p_pack] || null), error: null });
  window.__QA.rpc.apri_pacchetto_v1 = async ({ p_pack }) => { window.__QA.mese.opened.push(p_pack); const s = window.__QA.mese.months.find((x) => x.pack === p_pack); if (s) { s.state = 'opened'; s.cover = cards[9]; } return { data: { opened: true, partner_opened: false }, error: null }; };
  // Drawn photos instead of the purple square of the fake storage.
  const tone = { 'c1/f1/tramonto.webp': ['#f7a873', '#ee7f86', '#3b4f88'], 'c1/b1/pizza.webp': ['#4a2418', '#b9542e', '#e9a05a'], 'c1/f1/ponte.webp': ['#7b6db5', '#e2a2a6', '#2e3360'] };
  const photo = (path) => {
    const [a, b, c] = tone[path] || ['#c98aa4', '#5b3a6e', '#2b2140'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="380" cy="470" r="60" fill="#ffe2a0" opacity=".9"/><rect y="560" width="600" height="340" fill="${c}" opacity=".85"/></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };
  window.usGetSignedUrl = async (path) => photo(path);
  window.usGetSignedUrls = async (paths) => new Map(paths.map((p) => [p, photo(p)]));
}

async function mesePage(h, o = {}) {
  const r = await pageFor(h, o);
  await r.page.evaluate(installMese);
  return r;
}
async function openCarte(page) {
  await page.evaluate(() => window.usOpenCarte());
  await page.waitForFunction(() => document.querySelectorAll('#ricordiCarte .slot').length === 12, null, { timeout: 8000 });
  await page.waitForTimeout(300);
}
async function openLastPack(page) {
  await page.click('#ricordiCarte .slot.closed');
  await page.waitForSelector('#usMese.open [data-um="strip"]', { state: 'visible' });
  await page.waitForTimeout(250);
}
// Tear the strip with a real drag along the dashed line.
async function tear(page, upTo = 1) {
  const box = await page.locator('#usMese [data-um="strip"]').boundingBox();
  const y = box.y + box.height * 0.09; // the strip is the top of the pack (clip-path)
  await page.mouse.move(box.x + box.width * 0.08, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + box.width * (0.08 + 0.86 * upTo * i / 12), y);
  return { box, y };
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);

module.exports = { start, mesePage, openCarte, openLastPack, tear, noSideScroll, installMese };
