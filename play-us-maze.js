// Play Us · la sfida (founder, 28/11/2026; prototype approved, made easier on request):
// a maze on a canvas. Your character collects hearts, two grey clouds (the bad
// thoughts) wander and sometimes chase you, a golden «Ti penso» makes you
// untouchable for 3 s and the clouds run away (+30 if you catch one). A cloud
// that touches you costs 5 points and gives you 2 s of blinking. Same maze on
// both phones; only the scores travel. No dependency, no network here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsPlayUsMaze = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAZE = Object.freeze([
    '#############',
    '#P....#....T#',
    '#.##.#.#.##.#',
    '#...........#',
    '#.##.#.#.##.#',
    '#....#C#....#',
    '###.#...#.###',
    '#T..#C..#...#',
    '#.#.#####.#.#',
    '#.#.......#.#',
    '#.###.#.###.#',
    '#T....#....T#',
    '#############'
  ]);
  const RULES = Object.freeze({ heart: 10, tiPenso: 20, cloud: 30, hit: -5, power: 3, hurt: 2, meSpeed: 5.2, cloudSpeed: 2.5, scaredSpeed: 1.8, cloudsWait: 3, wander: 0.5 });
  // A small seeded generator: the same seed gives the same clouds' choices.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function parse() {
    const walls = MAZE.map((r) => [...r].map((ch) => ch === '#'));
    const dots = new Set(), pills = new Set(), clouds = []; let me = null;
    MAZE.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '.') dots.add(x + ',' + y);
      if (ch === 'T') pills.add(x + ',' + y);
      if (ch === 'C') clouds.push({ x, y, px: x, py: y, dx: 0, dy: 0, home: [x, y] });
      if (ch === 'P') me = { x, y, px: x, py: y, dx: 0, dy: 0, want: [1, 0] };
    }));
    return { walls, dots, pills, clouds, me };
  }
  // The game state without drawing: step(dt, now) moves everything (tested on its own).
  function createGame({ seed = 1 } = {}) {
    const random = rng(seed);
    const g = parse();
    const N = MAZE.length;
    const st = { score: 0, power: 0, hurt: 0, started: 0, elapsed: 0 };
    const open = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !g.walls[y][x];
    function stepEntity(e, speed, dt, choose) {
      if (e.px === e.x && e.py === e.y) { const d = choose(e); if (d) { e.dx = d[0]; e.dy = d[1]; e.x += e.dx; e.y += e.dy; } else { e.dx = e.dy = 0; } }
      const vx = e.x - e.px, vy = e.y - e.py, dist = Math.hypot(vx, vy);
      if (dist > 0) { const mv = Math.min(dist, speed * dt); e.px += vx / dist * mv; e.py += vy / dist * mv; if (Math.abs(e.px - e.x) < 0.001 && Math.abs(e.py - e.y) < 0.001) { e.px = e.x; e.py = e.y; } }
    }
    const chooseMe = (e) => { if (open(e.x + e.want[0], e.y + e.want[1])) return e.want; if ((e.dx || e.dy) && open(e.x + e.dx, e.y + e.dy)) return [e.dx, e.dy]; return null; };
    const chooseCloud = (c) => {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(c.x + dx, c.y + dy) && !(dx === -c.dx && dy === -c.dy && (c.dx || c.dy)));
      const opts = dirs.length ? dirs : [[-c.dx, -c.dy]];
      if (st.power <= 0 && random() < RULES.wander) return opts[Math.floor(random() * opts.length)];
      const cost = ([dx, dy]) => Math.hypot(c.x + dx - g.me.x, c.y + dy - g.me.y) * (st.power > 0 ? -1 : 1) + random() * 1.6;
      return opts.slice().sort((a, b) => cost(a) - cost(b))[0];
    };
    const events = [];
    function step(dt) {
      st.elapsed += dt;
      st.power = Math.max(0, st.power - dt); st.hurt = Math.max(0, st.hurt - dt);
      stepEntity(g.me, RULES.meSpeed, dt, chooseMe);
      const key = g.me.x + ',' + g.me.y;
      if (Math.abs(g.me.px - g.me.x) < 0.35 && Math.abs(g.me.py - g.me.y) < 0.35) {
        if (g.dots.delete(key)) { st.score += RULES.heart; events.push('heart'); }
        if (g.pills.delete(key)) { st.power = RULES.power; st.score += RULES.tiPenso; events.push('power'); }
      }
      if (st.elapsed >= RULES.cloudsWait) g.clouds.forEach((c) => {
        stepEntity(c, st.power > 0 ? RULES.scaredSpeed : RULES.cloudSpeed, dt, chooseCloud);
        if (Math.hypot(c.px - g.me.px, c.py - g.me.py) < 0.6) {
          if (st.power > 0) { st.score += RULES.cloud; events.push('cloud'); }
          else if (st.hurt <= 0) { st.score = Math.max(0, st.score + RULES.hit); st.hurt = RULES.hurt; events.push('hit'); }
          else return;
          c.x = c.px = c.home[0]; c.y = c.py = c.home[1]; c.dx = c.dy = 0;
        }
      });
      if (!g.dots.size) MAZE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') g.dots.add(x + ',' + y); }));
      return events.splice(0);
    }
    return { g, st, step, setDir: (dx, dy) => { g.me.want = [dx, dy]; }, size: N };
  }
  // The drawing and the controls on a canvas; returns stop().
  function mount(canvas, { seed = 1, me = '', onScore = () => {}, onEvent = () => {}, reduced = false } = {}) {
    const game = createGame({ seed });
    const ctx = canvas.getContext('2d');
    const N = game.size, S = canvas.width / N;
    const img = new Image(), imgLove = new Image();
    const asImg = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    if (me) { img.src = asImg(me.normal); imgLove.src = asImg(me.love || me.normal); }
    let sx = 0, sy = 0, raf = 0, last = 0, stopped = false;
    const down = (e) => { sx = e.clientX; sy = e.clientY; };
    const up = (e) => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.hypot(dx, dy) < 14) return; if (Math.abs(dx) > Math.abs(dy)) game.setDir(Math.sign(dx), 0); else game.setDir(0, Math.sign(dy)); };
    const key = (e) => { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (m) { e.preventDefault(); game.setDir(...m); } };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    const heart = (x, y, s, color) => { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-12, -1, -9, -11, 0, -4); ctx.bezierCurveTo(9, -11, 12, -1, 0, 8); ctx.fill(); ctx.restore(); };
    function draw(now) {
      const { g, st } = game;
      ctx.fillStyle = '#160e15'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g.walls[y][x]) {
        ctx.fillStyle = '#3d2a52'; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x * S + 3, y * S + 3, S - 6, S - 6, 10); else ctx.rect(x * S + 3, y * S + 3, S - 6, S - 6);
        ctx.fill(); ctx.strokeStyle = 'rgba(169,139,255,.33)'; ctx.lineWidth = 2; ctx.stroke();
      }
      g.dots.forEach((k) => { const [x, y] = k.split(',').map(Number); heart(x * S + S / 2, y * S + S / 2 + 1, 0.55, '#ff7c96'); });
      g.pills.forEach((k) => { const [x, y] = k.split(',').map(Number); const p = reduced ? 1 : 1 + Math.sin(now / 180) * 0.12; heart(x * S + S / 2, y * S + S / 2 + 1, 1.2 * p, '#f3d27a'); ctx.fillStyle = '#f3d27a'; ctx.font = '800 9px Figtree, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TI PENSO', x * S + S / 2, y * S + S - 2); });
      g.clouds.forEach((c) => {
        const cx = c.px * S + S / 2, cy = c.py * S + S / 2 + 2, scared = st.power > 0;
        ctx.fillStyle = scared ? '#cfe9ff' : '#8f8496';
        [[-9, 2, 9], [0, -4, 11], [10, 2, 9], [0, 5, 10]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, 7); ctx.fill(); });
        ctx.fillStyle = '#2a1220'; ctx.beginPath(); ctx.arc(cx - 5, cy, 2.2, 0, 7); ctx.arc(cx + 5, cy, 2.2, 0, 7); ctx.fill();
        ctx.strokeStyle = '#2a1220'; ctx.lineWidth = 2; ctx.beginPath();
        if (scared) ctx.arc(cx, cy + 8, 3.5, 0, 7); else { ctx.moveTo(cx - 4, cy + 7); ctx.quadraticCurveTo(cx, cy + 4, cx + 4, cy + 7); }
        ctx.stroke();
      });
      const blink = st.hurt > 0 && Math.floor(now / 90) % 2;
      const pic = st.power > 0 ? imgLove : img;
      if (!blink) {
        if (pic.complete && pic.naturalWidth) ctx.drawImage(pic, g.me.px * S + 1, g.me.py * S + 2, S - 2, (S - 2) * 0.93);
        else { ctx.fillStyle = '#ff9f6e'; ctx.beginPath(); ctx.arc(g.me.px * S + S / 2, g.me.py * S + S / 2, S / 2.6, 0, 7); ctx.fill(); }
      }
      if (st.power > 0) { ctx.strokeStyle = '#f3d27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.me.px * S + S / 2, g.me.py * S + S / 2, S * 0.6 + (reduced ? 0 : Math.sin(now / 80) * 2), 0, 7); ctx.stroke(); }
    }
    function loop(now) {
      if (stopped) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      const before = game.st.score;
      game.step(dt).forEach((e) => onEvent(e));
      if (game.st.score !== before) onScore(game.st.score);
      draw(now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return {
      setDir: game.setDir,
      score: () => game.st.score,
      stop() { stopped = true; cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); window.removeEventListener('keydown', key); return game.st.score; }
    };
  }
  return { MAZE, RULES, createGame, mount, rng };
});
