/**
 * QUIET — thumbnail generator
 * ---------------------------------------------------------------------------
 * Three thumbnail options, drawn with the same rules as the live map so they
 * can never drift from the product. Re-run any time the tokens change:
 *
 *     node scripts/generate-thumbnails.mjs
 *
 * Output: assets/thumbnails/*.svg  (1024×1024, scales to any size)
 *
 * The noise and allocation functions here mirror src/design/loudnessField.ts.
 * Deterministic by design — no Math.random, so re-running gives byte-identical
 * files and the thumbnails stay diffable in git.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/thumbnails');

/* ── tokens (mirrors src/design/tokens.ts) ──────────────────────────────── */

const PAPER = '#FFFCF3';
const MAP = '#FFFFFF';
const GRID = '#E5D2B9';
const INK = '#1C1A16';
const INK_SOFT = '#8A8073';

const LEVELS = ['#E4ECF2', '#FFD6FF', '#87A5FF', '#FF4938', '#60545A'];
const LEVEL_NAMES = ['Quiet', 'Almost quiet', 'Loud', 'Very loud', 'Too loud'];

const SIZE = 1024;
const CELL = 16; // pixel size
const GRID_CELL = CELL * 3; // the paper grid — pixels are an exact third
const DECAY = 0.1;
const FREQ = 0.11 * (6 / CELL) * 2.2; // cluster size scaled for the larger cell
const EDGE_FREQ = 0.18 * (6 / CELL) * 2.2;
const EDGE = 0.55;
const TRACE = 40;

/** the wordmark — change these two and re-run */
const TITLE = 'LLLOUD';
const SUBTITLE = 'NAVIGATE NEW YORK BY SOUND';

/* ── engine (mirrors src/design/loudnessField.ts) ───────────────────────── */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function smoothstep(a, b, x) {
  const k = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return k * k * (3 - 2 * k);
}

function ihash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const L = (a, b, k) => a + (b - a) * k;
  const plane = (dz) =>
    L(
      L(ihash(xi, yi, zi + dz), ihash(xi + 1, yi, zi + dz), u),
      L(ihash(xi, yi + 1, zi + dz), ihash(xi + 1, yi + 1, zi + dz), u),
      v,
    );
  return L(plane(0), plane(1), w);
}

function mixFor(levelIdx) {
  const w = LEVELS.map((_, i) => Math.pow(DECAY, Math.abs(i - levelIdx)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

function allocate(mix, n) {
  const counts = mix.map((w) => Math.floor(w * n));
  if (n >= TRACE) {
    for (let i = 0; i < counts.length; i++) if (mix[i] > 0 && counts[i] === 0) counts[i] = 1;
  }
  const maj = mix.indexOf(Math.max(...mix));
  const spent = counts.reduce((a, b) => a + b, 0);
  counts[maj] = Math.max(0, counts[maj] + (n - spent));
  return counts;
}

/**
 * One field. `shape` is either a disc or the full frame.
 * Returns [{x, y, l}] ready to emit as <rect>s.
 */
function buildField({ cx, cy, r, inner, majority, seed, step = 0, rect = null }) {
  const mix = mixFor(majority);
  const cells = [];

  const bounds = rect ?? { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
  const i0 = Math.floor(bounds.x0 / CELL), i1 = Math.ceil(bounds.x1 / CELL);
  const j0 = Math.floor(bounds.y0 / CELL), j1 = Math.ceil(bounds.y1 / CELL);

  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const x = i * CELL, y = j * CELL;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;

      let cover;
      if (rect) {
        cover = 1;
      } else {
        const dx = x + CELL / 2 - cx, dy = y + CELL / 2 - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d > 1) continue;
        cover = 1 - smoothstep(inner, 1, d);
        if (cover <= 0.02) continue;
      }

      if (cover < 1) {
        const dither = vnoise(i * EDGE_FREQ, j * EDGE_FREQ, step * 0.35 + seed);
        if (dither > Math.pow(cover, EDGE)) continue;
      }
      cells.push({ i, j, x, y, l: majority });
    }
  }
  if (!cells.length) return cells;

  const counts = allocate(mix, cells.length);
  const queue = counts
    .map((n, i) => ({ i, n }))
    .filter((o) => o.i !== majority && o.n > 0)
    .sort((a, b) => a.n - b.n);

  let pool = cells;
  for (const o of queue) {
    const z = step * 0.22 + o.i * 31.7 + seed;
    for (const c of pool) c.s = vnoise(c.i * FREQ, c.j * FREQ, z);
    pool.sort((a, b) => b.s - a.s);
    const take = Math.min(o.n, pool.length);
    for (let k = 0; k < take; k++) pool[k].l = o.i;
    pool = pool.slice(take);
  }
  return cells;
}

/* ── svg helpers ────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function paperGrid(opacity = 0.15) {
  const lines = [];
  for (let x = 0; x <= SIZE; x += GRID_CELL) lines.push(`M${x} 0V${SIZE}`);
  for (let y = 0; y <= SIZE; y += GRID_CELL) lines.push(`M0 ${y}H${SIZE}`);
  return `<path d="${lines.join('')}" stroke="${GRID}" stroke-width="1.5" opacity="${opacity}" fill="none"/>`;
}

/** group cells by colour so each thumbnail is a handful of paths, not 4000 rects */
function cellsToPaths(cells) {
  const byLevel = new Map();
  for (const c of cells) {
    if (!byLevel.has(c.l)) byLevel.set(c.l, []);
    byLevel.get(c.l).push(`M${c.x} ${c.y}h${CELL}v${CELL}h-${CELL}z`);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([l, d]) => `<path fill="${LEVELS[l]}" d="${d.join('')}"/>`)
    .join('\n  ');
}

function wordmark(y = SIZE - 74, color = INK) {
  return `
  <text x="72" y="${y}" font-family="ui-monospace, SF Mono, Menlo, monospace"
        font-size="46" letter-spacing="10" fill="${color}">${esc(TITLE)}</text>
  <text x="74" y="${y + 34}" font-family="ui-monospace, SF Mono, Menlo, monospace"
        font-size="15" letter-spacing="4.5" fill="${INK_SOFT}">${esc(SUBTITLE)}</text>`;
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${PAPER}"/>
  ${body}
</svg>
`;
}

/* ── option 1 · FIELD ───────────────────────────────────────────────────────
   Full-bleed soundscape. No map, no chrome — just the material the app is
   made of. Reads well at very small sizes because it has no fine detail. */

function optionField() {
  const cells = buildField({
    majority: 1,
    seed: 3.1,
    step: 2,
    rect: { x0: 0, y0: 0, x1: SIZE, y1: SIZE },
  });
  return svg(`<rect width="${SIZE}" height="${SIZE}" fill="${MAP}"/>
  ${cellsToPaths(cells)}
  <rect width="${SIZE}" height="${SIZE}" fill="none" stroke="${GRID}" stroke-width="3"/>
  <rect x="48" y="${SIZE - 168}" width="${SIZE - 96}" height="120" fill="${PAPER}"/>
  ${wordmark()}`);
}

/* ── option 2 · CLEARING ────────────────────────────────────────────────────
   The idea in one image: the grid holds, until sound makes it give way.
   You are the dot inside the room it left. */

function optionClearing() {
  const cx = SIZE * 0.5, cy = SIZE * 0.44;
  const you = buildField({ cx, cy, r: 250, inner: 0.16, majority: 0, seed: 7.3, step: 1 });
  const loud = buildField({ cx: SIZE * 0.82, cy: SIZE * 0.17, r: 130, inner: 0.3, majority: 3, seed: 1.7, step: 4 });
  const soft = buildField({ cx: SIZE * 0.16, cy: SIZE * 0.72, r: 105, inner: 0.3, majority: 2, seed: 5.2, step: 6 });

  return svg(`<rect width="${SIZE}" height="${SIZE}" fill="${MAP}"/>
  ${paperGrid(0.5)}
  <circle cx="${cx}" cy="${cy}" r="250" fill="${MAP}" opacity="0.92"/>
  <circle cx="${SIZE * 0.82}" cy="${SIZE * 0.17}" r="130" fill="${MAP}" opacity="0.92"/>
  <circle cx="${SIZE * 0.16}" cy="${SIZE * 0.72}" r="105" fill="${MAP}" opacity="0.92"/>
  ${cellsToPaths(you)}
  ${cellsToPaths(loud)}
  ${cellsToPaths(soft)}
  <circle cx="${cx}" cy="${cy}" r="17" fill="${MAP}"/>
  <circle cx="${cx}" cy="${cy}" r="10" fill="${INK}"/>
  <rect x="48" y="${SIZE - 168}" width="${SIZE - 96}" height="120" fill="${PAPER}"/>
  ${wordmark()}`);
}

/* ── option 3 · SCALE ───────────────────────────────────────────────────────
   The five states, each drawn with its own real mix. Doubles as the legend,
   so the thumbnail teaches the language before you open the app. */

function optionScale() {
  const pad = 96;
  const gap = 26;
  const n = LEVELS.length;
  const w = (SIZE - pad * 2 - gap * (n - 1)) / n;
  const top = 210;
  const h = 420;

  let body = '';
  for (let k = 0; k < n; k++) {
    const x0 = pad + k * (w + gap);
    const cells = buildField({
      majority: k,
      seed: k * 11.3,
      step: k * 3,
      rect: { x0, y0: top, x1: x0 + w, y1: top + h },
    }).filter((c) => c.x >= x0 - 1 && c.x + CELL <= x0 + w + 1 && c.y >= top - 1 && c.y + CELL <= top + h + 1);

    body += `\n  <rect x="${x0}" y="${top}" width="${w}" height="${h}" fill="${MAP}"/>`;
    body += `\n  ${cellsToPaths(cells)}`;
    body += `\n  <text x="${x0}" y="${top + h + 34}" font-family="ui-monospace, SF Mono, Menlo, monospace"
        font-size="13" letter-spacing="1.5" fill="${INK_SOFT}">${esc(String(k + 1).padStart(2, '0'))}</text>`;
    body += `\n  <text x="${x0}" y="${top + h + 60}" font-family="-apple-system, Helvetica, Arial, sans-serif"
        font-size="17" font-weight="500" fill="${INK}">${esc(LEVEL_NAMES[k])}</text>`;
  }

  return svg(`${paperGrid(0.28)}${body}
  ${wordmark(150)}`);
}

/* ── write ──────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });

const options = [
  ['01-field.svg', optionField()],
  ['02-clearing.svg', optionClearing()],
  ['03-scale.svg', optionScale()],
];

for (const [name, content] of options) {
  writeFileSync(resolve(OUT, name), content);
  console.log(`wrote assets/thumbnails/${name}  (${(content.length / 1024).toFixed(1)} kB)`);
}
