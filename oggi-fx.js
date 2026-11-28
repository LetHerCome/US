// Premi di Oggi, fase 1 (founder, 25/11/2026; grill D1–D25 and the approved
// tavola «Premi di Oggi»): the effects over the photo of Oggi, drawn by hand
// on a canvas in the couple's two colours, day and night. Three steps that grow
// with the level: Base (hearts, petals), Natura (dandelions, snow, leaves),
// Vostri (shooting stars, lanterns, memories). Every effect answers a touch in
// Foto a fuoco; the Vostri answer a swipe too. One shared loop draws only what
// is on screen, never while the app is hidden; modest phones get fewer pieces;
// reduced motion gets one still frame. This module never talks to Supabase:
// «Ricordi in volo» asks app.js for the couple's own photos.
(() => {
'use strict';
if (window.UsOggiFx) return;

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
function lowPower() {
  const nav = window.navigator || {};
  return Boolean(nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 3) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4));
}

// ---------------- the couple's colours, read from :root as plain RGB ----------------
let probe = null;
function toRgb(css, fallback) {
  try {
    probe ||= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = css || fallback; probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return a ? [r, g, b] : hexRgb(fallback);
  } catch (_) { return hexRgb(fallback); }
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const mixRgb = (x, y, t) => x.map((v, i) => Math.round(v + (y[i] - v) * t));
const INK = [26, 16, 32];
const ink = (c) => css(mixRgb(c, INK, 0.55));
let pal = null, palAt = 0;
function palette(now = performance.now()) {
  if (pal && now - palAt < 1500) return pal;
  const root = getComputedStyle(document.documentElement);
  const luce = document.documentElement.dataset.usLuce === 'giorno' ? 'giorno' : 'notte';
  pal = { luce, tu: toRgb(root.getPropertyValue('--us-tu').trim(), luce === 'giorno' ? '#e7a1ab' : '#ff7c96'), pa: toRgb(root.getPropertyValue('--us-partner').trim(), luce === 'giorno' ? '#ab9ddb' : '#a98bff') };
  palAt = now;
  return pal;
}
const refreshPalette = () => { palAt = 0; };
window.addEventListener('us:aspetto', refreshPalette);
window.addEventListener('us-identity-change', refreshPalette);

// ---------------- shapes, drawn by hand (the characters' thin dark outline) ----------------
function heart(c, s) {
  c.beginPath(); c.moveTo(0, s * 0.55);
  c.bezierCurveTo(-s * 1.05, -s * 0.05, -s * 0.55, -s * 0.95, 0, -s * 0.36);
  c.bezierCurveTo(s * 0.55, -s * 0.95, s * 1.05, -s * 0.05, 0, s * 0.55); c.closePath();
}
function petal(c, L, kind) {
  c.beginPath();
  if (kind === 0) { c.moveTo(0, -L * .5); c.bezierCurveTo(L * .46, -L * .2, L * .3, L * .45, 0, L * .5); c.bezierCurveTo(-L * .3, L * .45, -L * .46, -L * .2, 0, -L * .5); }
  else if (kind === 1) c.ellipse(0, 0, L * .26, L * .5, 0, 0, TAU);
  else { c.moveTo(-L * .13, -L * .46); c.lineTo(0, -L * .3); c.lineTo(L * .13, -L * .46); c.bezierCurveTo(L * .48, -L * .28, L * .36, L * .42, 0, L * .5); c.bezierCurveTo(-L * .36, L * .42, -L * .48, -L * .28, -L * .13, -L * .46); }
  c.closePath();
}
function flake(c, r, lw) {
  c.lineWidth = lw; c.lineCap = 'round'; c.beginPath();
  for (let k = 0; k < 6; k += 1) {
    const a = k * TAU / 6, ca = Math.cos(a), sa = Math.sin(a), m = r * 0.55, b = r * 0.28;
    c.moveTo(0, 0); c.lineTo(ca * r, sa * r);
    for (const s of [-1, 1]) { const a2 = a + s * 0.7; c.moveTo(ca * m, sa * m); c.lineTo(ca * m + Math.cos(a2) * b, sa * m + Math.sin(a2) * b); }
  }
  c.stroke();
}
function maple(c, s) {
  const p = [[0, -1], [.22, -.55], [.62, -.72], [.5, -.3], [.95, -.18], [.55, .08], [.68, .45], [.22, .3], [.08, .62], [0, .5]];
  c.beginPath(); c.moveTo(0, -s);
  for (const [x, y] of p.slice(1)) c.lineTo(x * s, y * s);
  for (const [x, y] of p.slice(1, -1).reverse()) c.lineTo(-x * s, y * s);
  c.closePath();
}
function leaf(c, s) { c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * .7, -s * .5, s * .6, s * .5, 0, s); c.bezierCurveTo(-s * .6, s * .5, -s * .7, -s * .5, 0, -s); c.closePath(); }
function lantern(c, w, h) {
  c.beginPath(); c.moveTo(-w * .32, -h * .5);
  c.bezierCurveTo(-w * .62, -h * .38, -w * .62, h * .38, -w * .32, h * .5);
  c.lineTo(w * .32, h * .5); c.bezierCurveTo(w * .62, h * .38, w * .62, -h * .38, w * .32, -h * .5); c.closePath();
}
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

// ---------------- touch: a soft push for whatever falls, then calm again ----------------
function push(list, x, y, posOf, R = 85, F = 240) {
  for (const p of list) {
    const [px, py] = posOf(p), dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1;
    if (d > R) continue;
    const k = (1 - d / R) * F;
    p.ivx = (p.ivx || 0) + dx / d * k; p.ivy = (p.ivy || 0) + dy / d * k - k * .3;
    p.sp = (p.sp || 0) + rnd(-5, 5) * (1 - d / R);
  }
}
function settle(p, dt) {
  if (p.ivx || p.ivy) { p.x += p.ivx * dt; p.y += p.ivy * dt; const f = Math.exp(-2.4 * dt); p.ivx *= f; p.ivy *= f; if (Math.abs(p.ivx) + Math.abs(p.ivy) < .8) p.ivx = p.ivy = 0; }
  if (p.sp) { p.sp *= Math.exp(-1.8 * dt); if (Math.abs(p.sp) < .05) p.sp = 0; }
}
const n = (base, k) => Math.max(3, Math.round(base * k));

// ---------------- effects: init(w,h) · step(dt,t) · draw(c,t,pal) · burst() · tap(x,y) · swipe(...) ----------------
const EFFECTS = {
  // Base: pairs of hearts, one per colour, scattered; they find each other on
  // the way up and meet with a little pop. A touch pops a heart; on empty space
  // a new pair leaves the finger.
  hearts: (k) => {
    let W, H, pairs = [], bits = [], boost = 0, clock = 0, gap = 1.4;
    const spawn = (x0, y0) => { const y = y0 ?? H + 20, v = rnd(14, 26), s = rnd(7, 12); pairs.push({ x: x0 ?? rnd(W * .1, W * .9), y, sep: rnd(34, 66), dy: rnd(-16, 16), s, s2: s * rnd(.82, 1.05), v, ph: rnd(0, TAU), age: 0, tm: Math.max(1.2, ((y + 20) / v) * rnd(.55, .75)), pop: 0, hx: [] }); };
    const popPair = (p) => { if (p.pop) return; p.pop = .001; for (const [hx, hy, cc] of p.hx) for (let i = 0; i < 4; i += 1) { const a = rnd(0, TAU), sp = rnd(40, 90); bits.push({ x: hx, y: hy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, s: rnd(2.6, 4), c: cc, t: 0, r: rnd(-1, 1) }); } };
    return {
      init(w, h) { W = w; H = h; pairs = []; bits = []; for (let i = 0; i < n(5, k); i += 1) spawn(rnd(W * .1, W * .9), rnd(H * .2, H + 10)); },
      burst() { boost = 3.5; for (let i = 0; i < n(7, k); i += 1) spawn(rnd(W * .08, W * .92), H + rnd(0, 140)); },
      tap(x, y) { let hit = null; for (const p of pairs) for (const [hx, hy] of p.hx) if (!p.pop && Math.hypot(hx - x, hy - y) < p.s * 2.1) hit = p; if (hit) popPair(hit); else spawn(x, y); },
      step(dt) {
        clock += dt; boost = Math.max(0, boost - dt);
        if (clock > (boost ? .3 : gap)) { clock = 0; gap = rnd(1.1, 2.4); if (pairs.length < (boost ? n(16, k) : n(7, k))) spawn(); }
        for (const p of pairs) { p.y -= p.v * dt * (boost ? 1.5 : 1); p.age += dt; if (!p.pop && p.age > p.tm + .5) p.pop = .001; if (p.pop) p.pop += dt; }
        pairs = pairs.filter((p) => p.pop < 1 && p.y > -30);
        for (const b of bits) { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 60 * dt; b.vx *= Math.exp(-1.5 * dt); }
        bits = bits.filter((b) => b.t < .9);
      },
      draw(c, t, P) {
        for (const p of pairs) {
          const meet = Math.min(1, p.age / p.tm), ease = meet * meet * (3 - 2 * meet);
          const off = p.sep * (1 - ease) * .5 + p.s * .55, lift = p.dy * (1 - ease);
          const sway = Math.sin(p.age * 1.3 + p.ph) * 7, a = p.pop ? Math.max(0, 1 - p.pop * 1.6) : Math.min(1, p.age * 1.5);
          p.hx = [];
          [[P.tu, -1, p.s], [P.pa, 1, p.s2]].forEach(([cc, side, s], i) => {
            const hx = p.x + sway + side * off, hy = p.y + side * lift * .5 + Math.sin(p.age * 2 + i) * 2;
            p.hx.push([hx, hy, cc]);
            c.save(); c.globalAlpha = a; c.translate(hx, hy);
            const sc = p.pop ? 1 + Math.sin(Math.min(1, p.pop * 4) * Math.PI) * .45 : 1; c.scale(sc, sc); c.rotate(side * (1 - ease) * .3);
            heart(c, s); c.fillStyle = css(cc); c.fill(); c.lineWidth = 1.3; c.strokeStyle = ink(cc); c.stroke();
            c.beginPath(); c.ellipse(-s * .32, -s * .28, s * .14, s * .09, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
            c.restore();
          });
          if (p.pop && p.pop < .5) { const mx = p.x + sway, my = p.y; c.save(); c.globalAlpha = 1 - p.pop / .5; c.strokeStyle = P.luce === 'notte' ? '#fff' : ink(P.tu); c.lineWidth = 1.2; for (let i = 0; i < 8; i += 1) { const a2 = i * TAU / 8, r1 = p.s * 1.3 + p.pop * 34, r2 = r1 + 5; c.beginPath(); c.moveTo(mx + Math.cos(a2) * r1, my + Math.sin(a2) * r1); c.lineTo(mx + Math.cos(a2) * r2, my + Math.sin(a2) * r2); c.stroke(); } c.restore(); }
        }
        for (const b of bits) { c.save(); c.globalAlpha = Math.max(0, 1 - b.t / .9); c.translate(b.x, b.y); c.rotate(b.r); heart(c, b.s); c.fillStyle = css(b.c); c.fill(); c.restore(); }
      },
    };
  },
  // Base: three real petal shapes turning in the wind; a touch blows the near ones away.
  petals: (k) => {
    let W, H, ps = [], boost = 0;
    const BASE = n(12, k);
    const make = (y) => ({ x: rnd(-20, W + 20), y: y ?? rnd(-40, -10), L: rnd(10, 17), kind: Math.floor(rnd(0, 3)), v: rnd(22, 38), amp: rnd(14, 30), ph: rnd(0, TAU), rot: rnd(0, TAU), vr: rnd(-1, 1), flip: rnd(0, TAU), vf: rnd(1.6, 3.2) });
    return {
      init(w, h) { W = w; H = h; ps = Array.from({ length: BASE }, () => make(rnd(-20, H))); },
      burst() { boost = 3.5; for (let i = 0; i < n(14, k); i += 1) ps.push(make(rnd(-80, -10))); },
      tap(x, y) { push(ps, x, y, (p) => [p.x + Math.sin(p.ph) * p.amp, p.y]); },
      step(dt) {
        boost = Math.max(0, boost - dt);
        for (const p of ps) { settle(p, dt); p.y += p.v * dt * (boost ? 1.4 : 1); p.ph += dt * 1.1; p.rot += (p.vr + (p.sp || 0)) * dt; p.flip += p.vf * dt * (1 + Math.abs(p.sp || 0) * .4); }
        let m = ps.length;
        for (const p of ps) if (p.y > H + 30 || p.x < -60 || p.x > W + 60) { if (m > BASE) { p.dead = true; m -= 1; } else Object.assign(p, make(), { ivx: 0, ivy: 0, sp: 0 }); }
        ps = ps.filter((p) => !p.dead);
      },
      draw(c, t, P) {
        const base = P.luce === 'notte' ? ['#ffd3dc', '#ff9db2', '#f7b7c6'] : ['#f3c7cf', '#e39aa8', '#eab0bc'];
        for (const p of ps) {
          c.save(); c.translate(p.x + Math.sin(p.ph) * p.amp, p.y); c.rotate(p.rot); c.scale(1, Math.max(.12, Math.abs(Math.cos(p.flip))));
          const g = c.createLinearGradient(0, -p.L / 2, 0, p.L / 2); g.addColorStop(0, '#fff3f5'); g.addColorStop(1, base[p.kind]);
          petal(c, p.L, p.kind); c.fillStyle = g; c.fill(); c.lineWidth = .9; c.strokeStyle = `rgba(122,48,69,${P.luce === 'notte' ? .35 : .45})`; c.stroke();
          c.beginPath(); c.moveTo(0, p.L * .38); c.quadraticCurveTo(p.L * .05, 0, 0, -p.L * .25); c.strokeStyle = 'rgba(122,48,69,.18)'; c.stroke();
          c.restore();
        }
      },
    };
  },
  // Natura: dandelion seeds on their little umbrella of threads, drifting up;
  // each seed in one of your colours. A touch blows the near ones and frees more.
  dandelions: (k) => {
    let W, H, seeds = [], boost = 0;
    const BASE = n(14, k);
    const make = (x, y, vx, vy) => ({ x: x ?? rnd(-10, W + 10), y: y ?? H + rnd(5, 40), vx: vx ?? rnd(-4, 12), vy: vy ?? -rnd(9, 17), s: rnd(9, 14), ph: rnd(0, TAU), col: Math.random() < .5 ? 'tu' : 'pa', age: 0, fil: 9 + Math.floor(rnd(0, 4)) });
    const release = (x, y, m, spread) => { for (let i = 0; i < m; i += 1) { const a = -Math.PI / 2 + rnd(-spread, spread), sp = rnd(30, 70); seeds.push(make(x, y, Math.cos(a) * sp, Math.sin(a) * sp)); } };
    return {
      init(w, h) { W = w; H = h; seeds = Array.from({ length: BASE }, () => make(undefined, rnd(-10, H))); },
      burst() { boost = 3.6; release(W * .18, H * .9, n(22, k), 1.1); },
      tap(x, y) { push(seeds, x, y, (s) => [s.x, s.y], 95, 170); release(x, y, 5, 1.4); },
      step(dt) {
        boost = Math.max(0, boost - dt);
        for (const s of seeds) { settle(s, dt); s.age += dt; s.vy += (-12 - s.vy) * Math.min(1, dt * .6); s.vx += (4 - s.vx) * Math.min(1, dt * .3); s.x += (s.vx + Math.sin(s.age * .8 + s.ph) * 9) * dt; s.y += s.vy * dt; }
        let m = seeds.length;
        for (const s of seeds) if (s.y < -40 || s.x < -50 || s.x > W + 50) { if (m > BASE) { s.dead = true; m -= 1; } else Object.assign(s, make(), { ivx: 0, ivy: 0 }); }
        seeds = seeds.filter((s) => !s.dead);
      },
      draw(c, t, P) {
        const thread = P.luce === 'notte' ? 'rgba(255,255,255,.78)' : 'rgba(58,42,52,.55)';
        for (const s of seeds) {
          const tilt = Math.max(-.5, Math.min(.5, (s.vx + (s.ivx || 0)) / 60)) + Math.sin(s.age * 1.3 + s.ph) * .12;
          c.save(); c.translate(s.x, s.y); c.rotate(tilt); c.globalAlpha = Math.min(1, s.age * 1.4);
          if (P.luce === 'notte') { c.shadowColor = 'rgba(255,255,255,.45)'; c.shadowBlur = 3; }
          c.strokeStyle = thread; c.lineWidth = .7; c.lineCap = 'round';
          c.beginPath(); c.moveTo(0, 0); c.lineTo(0, s.s * 1.1); c.stroke();
          for (let i = 0; i < s.fil; i += 1) {
            const a = -Math.PI * (.08 + .84 * i / (s.fil - 1)), L = s.s * (.85 + .15 * Math.sin(i * 1.7));
            const ex = Math.cos(a) * L, ey = Math.sin(a) * L * .78;
            c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(ex * .5, ey * .62 - 1.5, ex, ey); c.stroke();
            c.beginPath(); c.arc(ex, ey, .9, 0, TAU); c.fillStyle = thread; c.fill();
          }
          c.shadowColor = 'transparent';
          const cc = P[s.col];
          c.beginPath(); c.ellipse(0, s.s * 1.3, 1.6, 3.6, 0, 0, TAU); c.fillStyle = css(cc); c.fill(); c.lineWidth = .8; c.strokeStyle = ink(cc); c.stroke();
          c.restore();
        }
      },
    };
  },
  // Natura: flakes drawn on three depths; a touch is a breath on the glass.
  snow: (k) => {
    let W, H, fl = [], boost = 0;
    const BASE = n(34, k);
    const make = (y) => { const z = Math.random(); return { z, x: rnd(0, W), y: y ?? rnd(-30, -6), r: z < .45 ? rnd(1, 1.8) : z < .82 ? rnd(4, 6) : rnd(8, 11), v: z < .45 ? rnd(10, 16) : z < .82 ? rnd(20, 28) : rnd(32, 42), amp: rnd(6, 18), ph: rnd(0, TAU), rot: rnd(0, TAU), vr: rnd(-.6, .6) }; };
    return {
      init(w, h) { W = w; H = h; fl = Array.from({ length: BASE }, () => make(rnd(-10, H))); },
      burst() { boost = 3.6; for (let i = 0; i < n(26, k); i += 1) fl.push(make(rnd(-60, -5))); },
      tap(x, y) {
        push(fl, x, y, (f) => [f.x + Math.sin(f.ph) * f.amp, f.y], 90, 220);
        for (let i = 0; i < 9; i += 1) { const a = rnd(0, TAU), sp = rnd(40, 110); fl.push({ z: .2, x, y, r: rnd(1, 1.7), v: rnd(10, 16), amp: 0, ph: 0, rot: 0, vr: 0, ivx: Math.cos(a) * sp, ivy: Math.sin(a) * sp }); }
      },
      step(dt) {
        boost = Math.max(0, boost - dt);
        for (const f of fl) { settle(f, dt); f.y += f.v * dt; f.ph += dt * (boost ? 2.4 : .9); f.rot += (f.vr + (f.sp || 0)) * dt; }
        let m = fl.length;
        for (const f of fl) if (f.y > H + 16 || f.x < -30 || f.x > W + 30) { if (m > BASE) { f.dead = true; m -= 1; } else Object.assign(f, make(), { ivx: 0, ivy: 0, sp: 0 }); }
        fl = fl.filter((f) => !f.dead);
      },
      draw(c, t, P) {
        const ice = P.luce === 'notte' ? '#ffffff' : '#7f93b5';
        for (const f of fl) {
          c.save(); c.translate(f.x + Math.sin(f.ph) * f.amp, f.y); c.rotate(f.rot);
          if (f.r < 2) { c.globalAlpha = P.luce === 'notte' ? .55 : .5; c.beginPath(); c.arc(0, 0, f.r, 0, TAU); c.fillStyle = ice; c.fill(); }
          else {
            c.globalAlpha = f.z < .82 ? .8 : .95; c.strokeStyle = ice;
            if (P.luce === 'notte') { c.shadowColor = 'rgba(255,255,255,.6)'; c.shadowBlur = f.r > 7 ? 6 : 2; }
            flake(c, f.r, f.r > 7 ? 1.6 : 1.1);
            c.beginPath(); c.arc(0, 0, f.r * .16, 0, TAU); c.fillStyle = ice; c.fill();
          }
          c.restore();
        }
      },
    };
  },
  // Natura: maple and autumn leaves; some rest a moment and fade. A touch kicks them.
  leaves: (k) => {
    let W, H, lv = [], gust = 0;
    const BASE = n(16, k), COLS = ['#d9a441', '#c8643b', '#a8402f', '#b98a3a', '#d27a3e'];
    const make = (y) => ({ x: rnd(-20, W + 20), y: y ?? rnd(-50, -15), s: rnd(10, 16), maple: Math.random() < .55, col: hexRgb(COLS[Math.floor(rnd(0, COLS.length))]), v: rnd(20, 32), amp: rnd(18, 34), ph: rnd(0, TAU), rot: rnd(0, TAU), vr: rnd(-1.4, 1.4), flip: rnd(0, TAU), vf: rnd(1, 2.4), rest: 0, vx: 0 });
    return {
      init(w, h) { W = w; H = h; lv = Array.from({ length: BASE }, () => make(rnd(-20, H * .9))); },
      burst() { gust = 3.4; },
      tap(x, y) { for (const l of lv) if (l.rest && Math.hypot(l.x - x, l.y - y) < 90) l.rest = 0; push(lv, x, y, (l) => [l.x + Math.sin(l.ph) * l.amp, l.y], 95, 260); },
      step(dt) {
        gust = Math.max(0, gust - dt);
        for (const l of lv) {
          if (l.rest) { l.rest += dt; if (l.rest > 4) Object.assign(l, make()); continue; }
          settle(l, dt);
          l.vx += ((gust ? 70 : 0) - l.vx) * Math.min(1, dt * 1.5);
          l.y += l.v * dt; l.x += l.vx * dt; l.ph += dt; l.rot += (l.vr * (gust ? 2.5 : 1) + (l.sp || 0)) * dt; l.flip += l.vf * dt * (1 + Math.abs(l.sp || 0) * .3);
          if (l.y > H * .6 && l.y < H * .62 && Math.random() < .08 && !gust) l.rest = .001;
          else if (l.y > H + 20 || l.x > W + 40 || l.x < -40) Object.assign(l, make(), { ivx: 0, ivy: 0, sp: 0 });
        }
      },
      draw(c) {
        for (const l of lv) {
          c.save(); c.globalAlpha = l.rest ? Math.max(0, 1 - Math.max(0, l.rest - 2.5) / 1.5) : 1;
          c.translate(l.x + (l.rest ? 0 : Math.sin(l.ph) * l.amp), l.y); c.rotate(l.rest ? l.rot * .2 : l.rot); c.scale(l.rest ? 1 : Math.max(.2, Math.abs(Math.cos(l.flip))), 1);
          if (l.maple) maple(c, l.s); else leaf(c, l.s);
          const g = c.createLinearGradient(-l.s, -l.s, l.s, l.s); g.addColorStop(0, css(mixRgb(l.col, [255, 241, 200], .22))); g.addColorStop(1, css(l.col));
          c.fillStyle = g; c.fill(); c.lineWidth = 1; c.strokeStyle = ink(l.col); c.stroke();
          c.beginPath(); c.moveTo(0, l.s * (l.maple ? .55 : .9)); c.lineTo(0, -l.s * .7); c.strokeStyle = 'rgba(90,42,24,.45)'; c.lineWidth = .8; c.stroke();
          c.restore();
        }
      },
    };
  },
  // Vostri: a sky that shines softly and, now and then, a trail in your colours.
  // A touch sends a star from there; a swipe leaves stardust and throws one.
  shooting: (k) => {
    let W, H, bg = [], shoot = [], trail = [], timer = 1, boost = 0, flip = 0;
    const fire = (x, y, big) => { const a = Math.PI * rnd(.68, .78), sp = big ? 340 : rnd(230, 300); shoot.push({ x: x ?? rnd(W * .45, W * 1.1), y: y ?? rnd(-10, H * .3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, len: big ? 150 : rnd(80, 120), w: big ? 3 : 2, col: Math.random() < .5 ? 'tu' : 'pa', big }); };
    return {
      init(w, h) { W = w; H = h; bg = Array.from({ length: n(26, k) }, () => ({ x: rnd(0, W), y: rnd(0, H * .62), r: rnd(.6, 1.5), ph: rnd(0, TAU), f: rnd(1, 2.6) })); shoot = []; trail = []; timer = .6; },
      burst() { boost = 3.5; fire(W * .95, H * .04, true); },
      tap(x, y) { const a = Math.PI * .72; shoot.push({ x, y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, life: 0, len: 110, w: 2.4, col: Math.random() < .5 ? 'tu' : 'pa', big: false }); },
      drag(x, y) { flip += 1; trail.push({ x: x + rnd(-2, 2), y: y + rnd(-2, 2), t: 0, col: flip % 2 ? 'tu' : 'pa' }); },
      swipe(x0, y0, x1, y1, vx, vy) {
        let sp = Math.hypot(vx, vy); if (sp < 1) { vx = x1 - x0; vy = y1 - y0; sp = Math.hypot(vx, vy) || 1; }
        const v = Math.max(240, Math.min(720, sp));
        shoot.push({ x: x1, y: y1, vx: vx / sp * v, vy: vy / sp * v, life: 0, len: Math.min(190, 70 + v * .18), w: 3, col: Math.random() < .5 ? 'tu' : 'pa', big: true });
      },
      step(dt) {
        boost = Math.max(0, boost - dt); timer -= dt;
        if (timer <= 0) { fire(); timer = boost ? rnd(.25, .45) : rnd(2.2, 3.8); }
        for (const s of shoot) { s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt; }
        shoot = shoot.filter((s) => s.life < 1.6 && s.x > -220 && s.x < W + 220 && s.y > -220 && s.y < H + 220);
        for (const d of trail) d.t += dt;
        trail = trail.filter((d) => d.t < .7);
      },
      draw(c, t, P) {
        for (const d of trail) { const q = 1 - d.t / .7; c.globalAlpha = q; c.fillStyle = P.luce === 'notte' ? '#fff' : ink(P[d.col]); c.beginPath(); c.arc(d.x, d.y, 1.2 + q * 1.6, 0, TAU); c.fill(); c.globalAlpha = q * .5; c.fillStyle = css(P[d.col]); c.beginPath(); c.arc(d.x, d.y, 3 + q * 3, 0, TAU); c.fill(); }
        for (const b of bg) { c.globalAlpha = (.35 + .65 * (0.5 + 0.5 * Math.sin(t * b.f + b.ph))) * (P.luce === 'notte' ? .9 : .55); c.fillStyle = P.luce === 'notte' ? '#fff' : '#3a2a40'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
        for (const s of shoot) {
          const len = Math.hypot(s.vx, s.vy), ux = s.vx / len, uy = s.vy / len, cc = P[s.col];
          const fade = Math.min(1, s.life * 4) * Math.max(0, 1 - Math.max(0, s.life - 1) / .6);
          const tx = s.x - ux * s.len, ty = s.y - uy * s.len;
          const g = c.createLinearGradient(s.x, s.y, tx, ty);
          g.addColorStop(0, P.luce === 'notte' ? `rgba(255,255,255,${fade})` : `rgba(251,247,240,${fade})`); g.addColorStop(.12, rgba(cc, .9 * fade)); g.addColorStop(1, rgba(cc, 0));
          c.strokeStyle = g; c.lineWidth = s.w; c.lineCap = 'round'; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(tx, ty); c.stroke();
          c.save(); c.globalAlpha = fade; c.translate(s.x, s.y); const r = s.big ? 7 : 4.5;
          c.fillStyle = P.luce === 'notte' ? '#fff' : ink(cc);
          c.beginPath(); for (let i = 0; i < 8; i += 1) { const rr = i % 2 ? r * .32 : r; c.lineTo(Math.cos(i * TAU / 8 + t * 2) * rr, Math.sin(i * TAU / 8 + t * 2) * rr); } c.closePath(); c.fill();
          c.restore();
        }
      },
    };
  },
  // Vostri: paper lanterns rising, each with the light of one of you. A touch
  // lets one go from the finger; a swipe is wind (upwards, they climb faster).
  lanterns: (k) => {
    let W, H, ls = [], boost = 0;
    const BASE = n(7, k);
    const make = (x, y, near) => { const z = near ?? Math.random(); return { x: x ?? rnd(W * .1, W * .9), y: y ?? H + rnd(10, 60), z, w: 12 + z * 14, v: 9 + z * 9, amp: rnd(4, 9), ph: rnd(0, TAU), col: Math.random() < .5 ? 'tu' : 'pa', fl: rnd(0, TAU), age: 0 }; };
    const sort = () => ls.sort((a, b) => a.z - b.z);
    return {
      init(w, h) { W = w; H = h; ls = Array.from({ length: BASE }, () => make(undefined, rnd(H * .15, H))); sort(); },
      burst() { boost = 3.6; for (let i = 0; i < 5; i += 1) ls.push(make(W * (.15 + i * .17), H + rnd(0, 40), rnd(.5, 1))); sort(); },
      tap(x, y) { ls.push(make(x, y, .95)); sort(); },
      swipe(x0, y0, x1, y1, vx) { const vy = y1 - y0; for (const l of ls) { l.wx = (l.wx || 0) + Math.max(-170, Math.min(170, vx * .2)) * (.6 + l.z * .4); l.lift = (l.lift || 0) + Math.max(0, -vy) * .25; } },
      step(dt) {
        boost = Math.max(0, boost - dt);
        const f = Math.exp(-1.1 * dt);
        for (const l of ls) {
          l.y -= (l.v * (boost ? 1.5 : 1) + (l.lift || 0)) * dt; l.ph += dt * .8; l.age += dt;
          if (l.wx) { l.x += l.wx * dt; l.wx *= f; if (Math.abs(l.wx) < .5) l.wx = 0; if (l.x < -40) l.x = W + 30; if (l.x > W + 40) l.x = -30; }
          if (l.lift) { l.lift *= f; if (l.lift < .3) l.lift = 0; }
        }
        ls = ls.filter((l) => l.y > -50);
        while (ls.length < BASE) { ls.push(make()); sort(); }
        if (ls.length > BASE + 10) ls.splice(0, ls.length - BASE - 10);
      },
      draw(c, t, P) {
        for (const l of ls) {
          const cc = P[l.col], h = l.w * 1.3, flick = .78 + .22 * Math.sin(t * 7 + l.fl) * Math.sin(t * 3.1 + l.fl * 2);
          c.save(); c.translate(l.x + Math.sin(l.ph) * l.amp, l.y); c.rotate(Math.sin(l.ph) * .06 + Math.max(-.45, Math.min(.45, (l.wx || 0) / 260))); c.globalAlpha = Math.min(1, l.age * 1.2) * (.55 + l.z * .45);
          const halo = c.createRadialGradient(0, 0, 0, 0, 0, l.w * 2.4);
          halo.addColorStop(0, P.luce === 'notte' ? `rgba(255,217,160,${.45 * flick})` : rgba(cc, .28 * flick)); halo.addColorStop(1, 'rgba(255,200,140,0)');
          c.fillStyle = halo; c.beginPath(); c.arc(0, 0, l.w * 2.4, 0, TAU); c.fill();
          const body = c.createRadialGradient(0, h * .12, 1, 0, 0, l.w * .75);
          body.addColorStop(0, P.luce === 'notte' ? '#fff3cf' : '#fffaf0'); body.addColorStop(.45, css(mixRgb(cc, [255, 217, 160], P.luce === 'notte' ? .45 : .25))); body.addColorStop(1, css(cc));
          lantern(c, l.w, h); c.fillStyle = body; c.fill(); c.lineWidth = 1.1; c.strokeStyle = ink(cc); c.stroke();
          c.beginPath(); for (const fx of [-.22, 0, .22]) { c.moveTo(fx * l.w, -h * .5); c.quadraticCurveTo(fx * l.w * 1.6, 0, fx * l.w, h * .5); } c.strokeStyle = 'rgba(90,42,42,.22)'; c.lineWidth = .8; c.stroke();
          c.fillStyle = ink(cc); rrect(c, -l.w * .34, -h * .58, l.w * .68, h * .1, 2); c.fill(); rrect(c, -l.w * .3, h * .48, l.w * .6, h * .1, 2); c.fill();
          c.restore();
        }
      },
    };
  },
  // Vostri, the top: six small polaroids of your own photos float behind the
  // count, with the tape in the colour of who added them. A touch on one opens
  // that memory; a swipe throws them and they float back.
  memories: (k, host) => {
    let W, H, ps = [], boost = 0, open = null;
    const SCENES = [['#f2b880', '#c45c66'], ['#8fc1d9', '#2f5f7a'], ['#a9cf8f', '#4f7a4a'], ['#f6d7a6', '#b97f4a'], ['#c9b1e8', '#5b4a8a'], ['#f4a6b8', '#7a3a5a']];
    const fill = (list) => {
      list.slice(0, ps.length).forEach((m, i) => {
        const p = ps[i]; p.id = m.id; p.col = m.mine === false ? 'pa' : 'tu';
        if (!m.url) return;
        const img = new Image(); img.decoding = 'async'; img.onload = () => { p.img = img; }; img.src = m.url;
      });
    };
    return {
      init(w, h) {
        W = w; H = h;
        const count = Math.min(6, Math.max(3, Math.round(6 * Math.min(1, k + .2))));
        ps = SCENES.slice(0, count).map((s, i) => ({ sc: s, bx: (.14 + (i % 3) * .36) * W, by: (.12 + Math.floor(i / 3) * .3) * H + rnd(-10, 10), z: rnd(.72, 1), rot: rnd(-.16, .16), ph: rnd(0, TAU), f: rnd(.25, .45), col: i % 2 ? 'pa' : 'tu', ox: 0, oy: 0, vx: 0, vy: 0, or: 0, vr: 0, cx: 0, cy: 0, img: null, id: '' }));
        const source = window.usOggiMemoriesForFx;
        if (typeof source === 'function') Promise.resolve(source()).then((list) => { if (Array.isArray(list)) fill(list); }).catch(() => {});
      },
      burst() { boost = 3.6; },
      tap(x, y) {
        let hit = null; for (const p of ps) { const s = 34 * p.z; if (Math.abs(x - p.cx) < s * .7 && Math.abs(y - p.cy) < s * .85) hit = p; }
        if (!hit) return; open = { p: hit, t: 0 };
        host?.dispatchEvent?.(new CustomEvent('us:oggi-fx-memory', { bubbles: true, detail: { id: hit.id } }));
      },
      swipe(x0, y0, x1, y1, vx, vy) {
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
        for (const p of ps) {
          const u = Math.max(0, Math.min(1, ((p.cx - x0) * dx + (p.cy - y0) * dy) / L2)), d = Math.hypot(p.cx - (x0 + u * dx), p.cy - (y0 + u * dy));
          if (d > 85) continue;
          const q = 1 - d / 85;
          p.vx += Math.max(-900, Math.min(900, vx)) * .45 * q; p.vy += Math.max(-900, Math.min(900, vy)) * .45 * q; p.vr += Math.sign(vx || dx) * rnd(5, 9) * q;
        }
      },
      step(dt) {
        boost = Math.max(0, boost - dt); if (open) { open.t += dt; if (open.t > 1.6) open = null; }
        const f = Math.exp(-2.6 * dt);
        for (const p of ps) { p.vx += -p.ox * 10 * dt; p.vy += -p.oy * 10 * dt; p.vx *= f; p.vy *= f; p.ox += p.vx * dt; p.oy += p.vy * dt; p.vr += -p.or * 10 * dt; p.vr *= f; p.or += p.vr * dt; }
      },
      draw(c, t, P) {
        const order = ps.slice().sort((a, b) => a.z - b.z);
        const lift = boost ? Math.sin(Math.min(1, (3.6 - boost) / .6) * Math.PI / 2) * (boost < .6 ? boost / .6 : 1) : 0;
        for (const p of order) {
          p.cx = p.bx + Math.sin(t * p.f + p.ph) * 14 + p.ox; p.cy = p.by + Math.cos(t * p.f * .8 + p.ph) * 10 - lift * 10 + p.oy;
          let s = 34 * p.z * (1 + lift * .12), rot = p.rot + Math.sin(t * p.f * 1.3 + p.ph) * .05 + p.or, cx = p.cx, cy = p.cy;
          if (open && open.p === p) { const q = Math.sin(Math.min(1, open.t / .45) * Math.PI / 2) * (open.t > 1.1 ? Math.max(0, 1 - (open.t - 1.1) / .5) : 1); cx += (W / 2 - cx) * q; cy += (H * .42 - cy) * q; s *= 1 + q * 1.6; rot *= 1 - q; }
          c.save(); c.translate(cx, cy); c.rotate(rot);
          c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
          c.fillStyle = P.luce === 'notte' ? '#f7efe9' : '#fffdf8'; c.fillRect(-s * .5, -s * .6, s, s * 1.2);
          c.shadowColor = 'transparent';
          if (p.img?.naturalWidth) {
            const iw = p.img.naturalWidth, ih = p.img.naturalHeight, side = Math.min(iw, ih);
            c.drawImage(p.img, (iw - side) / 2, (ih - side) / 2, side, side, -s * .42, -s * .52, s * .84, s * .84);
          } else {
            const g = c.createLinearGradient(0, -s * .5, 0, s * .32); g.addColorStop(0, p.sc[0]); g.addColorStop(1, p.sc[1]);
            c.fillStyle = g; c.fillRect(-s * .42, -s * .52, s * .84, s * .84);
          }
          c.save(); c.rotate(-.12); c.fillStyle = rgba(P[p.col], .82); c.fillRect(-s * .2, -s * .7, s * .4, s * .16); c.restore();
          if (boost) { c.strokeStyle = rgba(P[p.col], .7 * (boost > .6 ? 1 : boost / .6)); c.lineWidth = 2; c.strokeRect(-s * .5 - 2, -s * .6 - 2, s + 4, s * 1.2 + 4); }
          c.restore();
        }
      },
    };
  },
};
// The effects that answer a swipe too (the top step).
const SWIPE = new Set(['shooting', 'lanterns', 'memories']);

// ---------------- mounting and the one shared loop ----------------
const handles = new Set();
let raf = 0, last = 0, t0 = 0;
let io = null;
function observer() {
  if (io || typeof IntersectionObserver !== 'function') return io;
  io = new IntersectionObserver((entries) => { for (const e of entries) { for (const h of handles) if (h.canvas === e.target) h.visible = e.isIntersecting; } wake(); }, { rootMargin: '60px' });
  return io;
}
const paused = (h) => document.hidden || (h.hero && document.documentElement.classList.contains('us-oggi-fx-paused'));
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000; last = now;
  const P = palette(now);
  let live = false;
  for (const h of handles) {
    if (!h.canvas.isConnected) { h.destroy(); continue; }
    if (!h.fx || !h.visible || paused(h)) continue;
    live = true;
    h.fx.step(dt, t); h.paint(t, P, dt);
  }
  if (live) raf = requestAnimationFrame(frame);
}
function wake() {
  if (raf || reducedMotion()) return;
  last = performance.now(); t0 ||= last;
  raf = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', wake);

function mount(host, effect, { scale = 1, hero = false } = {}) {
  if (!host) return null;
  let canvas = host.querySelector(':scope > canvas.us-oggi-fx-canvas');
  if (!canvas) { canvas = document.createElement('canvas'); canvas.className = 'us-oggi-fx-canvas'; canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas); }
  const c = canvas.getContext('2d');
  const h = {
    host, canvas, c, hero, fx: null, id: 'none', w: 0, h: 0, visible: true, ripples: [],
    density: scale * (lowPower() ? 0.6 : 1),
    set(id) {
      this.id = EFFECTS[id] ? id : 'none';
      this.fx = EFFECTS[this.id] ? EFFECTS[this.id](this.density, host) : null;
      if (this.fx && this.w) this.fx.init(this.w, this.h);
      this.still();
      wake();
    },
    fit() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width || !r.height) return;
      if (Math.abs(r.width - this.w) < 1 && Math.abs(r.height - this.h) < 1) return;
      this.w = r.width; this.h = r.height;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fx?.init(this.w, this.h);
      this.still();
    },
    paint(t, P, dt = 0) {
      c.clearRect(0, 0, this.w, this.h);
      if (!this.fx) return;
      this.fx.draw(c, t, P);
      for (const r of this.ripples) { r.t += dt; const q = r.t / .5; c.globalAlpha = Math.max(0, .4 * (1 - q)); c.strokeStyle = P.luce === 'notte' ? '#fff' : '#231b1d'; c.lineWidth = 1.5; c.beginPath(); c.arc(r.x, r.y, 8 + q * 30, 0, TAU); c.stroke(); }
      c.globalAlpha = 1; this.ripples = this.ripples.filter((r) => r.t < .5);
    },
    // Reduced motion: the same composition, still (a few seconds in, so it is full).
    still() {
      if (!reducedMotion() || !this.fx || !this.w) return;
      for (let i = 0; i < 90; i += 1) this.fx.step(1 / 30, i / 30);
      this.paint(3, palette());
    },
    burst() { if (reducedMotion()) return; this.fx?.burst?.(); wake(); },
    tap(x, y) { if (!this.fx) return; this.fx.tap?.(x, y); if (!reducedMotion()) this.ripples.push({ x, y, t: 0 }); else this.still(); wake(); },
    drag(x, y) { this.fx?.drag?.(x, y); wake(); },
    swipe(...args) { if (!this.fx?.swipe) return false; this.fx.swipe(...args); if (reducedMotion()) this.still(); wake(); return true; },
    answersSwipe() { return SWIPE.has(this.id); },
    destroy() { handles.delete(this); this.ro?.disconnect(); io?.unobserve(canvas); if (host.__usOggiFx === this) delete host.__usOggiFx; },
  };
  if (host.__usOggiFx) host.__usOggiFx.destroy();
  host.__usOggiFx = h;
  handles.add(h);
  if (typeof ResizeObserver === 'function') { h.ro = new ResizeObserver(() => h.fit()); h.ro.observe(canvas); }
  observer()?.observe(canvas);
  h.fit();
  h.set(effect);
  return h;
}

window.UsOggiFx = Object.freeze({
  ids: Object.freeze(Object.keys(EFFECTS)),
  mount,
  supports: (id) => Boolean(EFFECTS[id]),
  answersSwipe: (id) => SWIPE.has(id),
  of: (host) => host?.__usOggiFx || null,
  wake,
});
})();
