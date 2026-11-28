// Play Us (28/11/2026): the maze rules as approved (made easier on request), and the
// client wired to the server functions, the live channels and Gioca.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const Maze = require('../play-us-maze.js');

test('the maze: 13×13, 2 slow clouds that wait 3 s, 4 Ti penso, a hit costs only 5', () => {
  assert.equal(Maze.MAZE.length, 13);
  assert.ok(Maze.MAZE.every((r) => r.length === 13));
  const count = (ch) => Maze.MAZE.join('').split(ch).length - 1;
  assert.equal(count('C'), 2);
  assert.equal(count('T'), 4);
  assert.equal(count('P'), 1);
  assert.deepEqual({ cloudSpeed: Maze.RULES.cloudSpeed, cloudsWait: Maze.RULES.cloudsWait, wander: Maze.RULES.wander, hit: Maze.RULES.hit, power: Maze.RULES.power }, { cloudSpeed: 2.5, cloudsWait: 3, wander: 0.5, hit: -5, power: 3 });
  // Every free tile is reachable from the start (no closed house).
  const N = 13, seen = new Set(['1,1']), queue = [[1, 1]];
  while (queue.length) { const [x, y] = queue.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (Maze.MAZE[ny]?.[nx] && Maze.MAZE[ny][nx] !== '#' && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); queue.push([nx, ny]); } } }
  const free = Maze.MAZE.join('').split('').filter((c) => c !== '#').length;
  assert.equal(seen.size, free);
  void N;
});

test('the maze: walking collects hearts, clouds stay home for 3 s, same seed same game', () => {
  const a = Maze.createGame({ seed: 7 }), b = Maze.createGame({ seed: 7 });
  for (let i = 0; i < 40; i++) { a.step(0.05); b.step(0.05); }
  assert.ok(a.st.score >= 10, 'hearts along the first corridor');
  assert.deepEqual(a.g.clouds.map((c) => [c.px, c.py]), a.g.clouds.map((c) => c.home), 'the clouds wait 3 s at home');
  for (let i = 0; i < 200; i++) { a.step(0.05); b.step(0.05); }
  assert.equal(a.st.score, b.st.score);
  assert.deepEqual(a.g.clouds.map((c) => [c.x, c.y]), b.g.clouds.map((c) => [c.x, c.y]));
});

test('the client: server functions, live channels, Gioca card, safe uploads', () => {
  const src = read('play-us.js');
  for (const fn of ['play_us_today', 'play_us_invite', 'play_us_answer', 'play_us_move', 'play_us_advance', 'play_us_abandon']) assert.ok(src.includes(`'${fn}'`), fn);
  assert.match(src, /table: 'play_us_sessions', filter: `couple_id=eq\.\$\{cid\(\)\}`/);
  assert.match(src, /table: 'play_us_moves', filter: `couple_id=eq\.\$\{cid\(\)\}`/);
  assert.match(src, /client\.channel\(`us-couple:\$\{cid\(\)\}`, \{ config: \{ private: true, presence: \{ key: me\(\) \} \} \}\)/);
  assert.match(src, /sendWebPushEvent\?\.\('play_invite', session\.id\)/);
  assert.match(src, /const folder = \(\) => `\$\{cid\(\)\}\/\$\{me\(\)\}\/play-us\/\$\{session\.id\}`;/, 'uploads under your own folder, as the server checks');
  assert.match(src, /const dot = !presenceReady \?/, 'the green dot only when presence works');
  assert.match(src, /minimized !== s\.id/, 'a reduced game is not reopened by a refresh');
  assert.match(read('games.js'), /<div id="usPlayUsCard" class="us-play-slot"><\/div>/);
  assert.match(read('games.js'), /window\.UsPlayUs\?\.paintCard\?\.\(\);/);
  const html = read('index.html');
  for (const f of ['play-us.css', 'play-us-maze.js', 'play-us.js']) assert.ok(html.includes(`/${f}?v=`), f);
  const sw = read('service-worker.js');
  for (const f of ['play-us.css', 'play-us-maze.js', 'play-us.js']) assert.ok(sw.includes(`versioned("/${f}")`), f);
  for (const b of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) for (const f of ['play-us.css', 'play-us-maze.js', 'play-us.js']) assert.ok(read(b).includes(`'${f}'`), `${b} ${f}`);
  assert.match(read('play-us.css'), /@media \(prefers-reduced-motion:reduce\)\{\.us-play \*/);
});
