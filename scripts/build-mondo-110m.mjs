// The countries for the card «Dove siete stati» of Il vostro mese (founder,
// 28/11/2026: «una vera cartina»). Input: countries-110m.json of world-atlas
// 2.0.2 (TopoJSON of Natural Earth 1:110m, public domain). Output:
// assets/data/mondo-110m-v1.json, loaded only by mese.js when a places card is
// drawn (never in the precache, no outside service).
//
// Format: { v, src, q, rings }. Each ring is a flat array of integers, the
// longitude and latitude times q (10: a tenth of a degree, ~11 km, as much as
// the 1:110m lines say), the first point absolute and the others as deltas.
//
//   node scripts/build-mondo-110m.mjs path/to/countries-110m.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/data/mondo-110m-v1.json');
const Q = 10;

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-mondo-110m.mjs countries-110m.json');
  process.exit(1);
}
const topo = JSON.parse(fs.readFileSync(input, 'utf8'));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;

// The arcs, unquantized: [[lon, lat], ...].
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});
const arcPoints = (i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]);
function ring(indexes) {
  const out = [];
  indexes.forEach((i, n) => { const pts = arcPoints(i); out.push(...(n ? pts.slice(1) : pts)); });
  return out;
}

const rings = [];
for (const g of topo.objects.countries.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  for (const poly of polys) for (const r of poly) rings.push(ring(r));
}

// Quantized, without repeated points; rings of fewer than 4 points go.
const packed = [];
for (const r of rings) {
  const pts = [];
  for (const [lon, lat] of r) {
    const p = [Math.round(lon * Q), Math.round(lat * Q)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length < 4) continue;
  const flat = [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length; i++) flat.push(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  packed.push(flat);
}

const data = { v: 1, src: 'Natural Earth 1:110m (public domain), world-atlas 2.0.2', q: Q, rings: packed };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`${packed.length} rings, ${packed.reduce((s, r) => s + r.length / 2, 0)} points, ${fs.statSync(OUT).size} bytes → ${path.relative(ROOT, OUT)}`);
