/**
 * QUIET — the generative loudness field
 * ---------------------------------------------------------------------------
 * Pure functions. No React, no Leaflet, no DOM. Everything here is testable
 * on its own and can move to any renderer.
 *
 * A field is a disc of square pixels laid on the paper grid's own lattice.
 * The mix of colours is fixed by the measurement; only the arrangement moves.
 */

import { DESIGN, LEVEL_EDGES, LEVELS, levelFromDb } from './tokens';

/* ── maths ──────────────────────────────────────────────────────────────── */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 0 below a, 1 above b, smooth in between */
export function smoothstep(a: number, b: number, x: number): number {
  const k = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return k * k * (3 - 2 * k);
}

/** always-positive modulo */
export const posMod = (v: number, m: number) => ((v % m) + m) % m;

function ihash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 3D value noise. x,y are lattice coords; z is time — so the pattern doesn't
 * flicker, it *moves*. This is what makes the field feel alive while its
 * proportions stay locked to the data.
 */
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const L = (a: number, b: number, k: number) => a + (b - a) * k;
  const plane = (dz: number) =>
    L(
      L(ihash(xi, yi, zi + dz), ihash(xi + 1, yi, zi + dz), u),
      L(ihash(xi, yi + 1, zi + dz), ihash(xi + 1, yi + 1, zi + dz), u),
      v,
    );
  return L(plane(0), plane(1), w);
}

/**
 * Two octaves of value noise: a slow, broad one with a faster, finer one laid
 * over it. A single octave moves as one sheet, which reads mechanical; two
 * scales moving at two speeds read like something alive. Output stays 0..1.
 */
export function fbm2(x: number, y: number, z: number): number {
  const O = DESIGN.pixels.octave;
  return (1 - O.mix) * vnoise(x, y, z) + O.mix * vnoise(x * O.scale, y * O.scale, z * O.speed);
}

/* ── the mix ────────────────────────────────────────────────────────────── */

/**
 * THE MIX COMES FROM THE DATA.
 *
 * Every zone carries two real measurements: baseDecibels, the level it sits
 * at, and peakDecibels, the level it reaches. The share of each colour is the
 * share of that measured interval falling inside each level's band, so a zone
 * shows exactly the colours its own range covers.
 *
 * The one assumption, stated: weight falls off exponentially from base toward
 * peak. A flat weighting would claim a place spends as long at its peak as at
 * its sustained level, which is false by the definition of "peak" — peaks are
 * brief. The decay makes the sustained level dominate and leaves the peak as
 * a minority, which is why the colour you mostly see is the loudness the
 * place actually holds.
 */
export function mixFromRange(baseDb: number, peakDb: number): number[] {
  const lo = Math.min(baseDb, peakDb);
  const hi = Math.max(baseDb, peakDb);
  const out = LEVELS.map(() => 0);

  if (hi - lo < 1e-6) {
    out[levelFromDb(lo)] = 1;
    return out;
  }

  const tau = (hi - lo) / 3;                    // decay scale, in dB
  const w = (x: number) => 1 - Math.exp(-(x - lo) / tau);  // cumulative weight
  const total = w(hi);

  const edges = [-Infinity, ...LEVEL_EDGES, Infinity];
  for (let l = 0; l < LEVELS.length; l++) {
    const a = Math.max(lo, edges[l]);
    const b = Math.min(hi, edges[l + 1]);
    if (b > a) out[l] = (w(b) - w(a)) / total;
  }
  return out;
}

/** the colour a zone mostly shows — always the largest share of its own mix */
export function majorityOf(mix: number[]): number {
  return mix.indexOf(Math.max(...mix));
}

/** Turn a mix into exact cell counts. This is where the data is protected. */
export function allocate(mix: number[], n: number): number[] {
  const counts = mix.map((w) => Math.floor(w * n));

  // a real place is never one pure colour — every level leaves a trace
  if (n >= DESIGN.pixels.trace) {
    for (let i = 0; i < counts.length; i++) {
      if (mix[i] > 0 && counts[i] === 0) counts[i] = 1;
    }
  }

  const maj = mix.indexOf(Math.max(...mix));
  const spent = counts.reduce((a, b) => a + b, 0);
  counts[maj] = Math.max(0, counts[maj] + (n - spent)); // majority takes the remainder
  return counts;
}

/* ── the field ──────────────────────────────────────────────────────────── */

export interface FieldSpec {
  /** stable identity, used to cache the arrangement between steps */
  id: string;
  /** centre in container pixels */
  cx: number;
  cy: number;
  /** radius in container pixels */
  r: number;
  /** fraction of the radius that is solid before the edge starts to fray */
  inner: number;
  /** colour proportions, summing to 1 */
  mix: number[];
  /** the level whose colour dominates */
  majority: number;
  /** the zone's sustained reading, which sets how dense the field is */
  db: number;
  /** decorrelates one field's pattern from its neighbours' */
  seed: number;
}

export interface PixelCell {
  /** lattice indices */
  i: number;
  j: number;
  /** top-left in container pixels */
  x: number;
  y: number;
  /** level index → LEVELS[l].color */
  l: number;
  /** scratch, used while sorting */
  s?: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** container-space x of the first lattice line (see latticeOffset) */
  ox: number;
  oy: number;
  /** pixel size in container px */
  cell: number;
}

/**
 * Build one field's arrangement for a given animation step.
 *
 * The lattice is passed in rather than derived here, so the pixels and the
 * paper grid are guaranteed to sit on the same lines — see latticeOffset().
 */
export function buildPixelField(f: FieldSpec, step: number, vp: Viewport): PixelCell[] {
  const P = DESIGN.pixels;
  const { cell, ox, oy, width, height } = vp;

  const i0 = Math.max(Math.floor((f.cx - f.r - ox) / cell), Math.floor(-ox / cell));
  const i1 = Math.min(Math.ceil((f.cx + f.r - ox) / cell), Math.ceil((width - ox) / cell));
  const j0 = Math.max(Math.floor((f.cy - f.r - oy) / cell), Math.floor(-oy / cell));
  const j1 = Math.min(Math.ceil((f.cy + f.r - oy) / cell), Math.ceil((height - oy) / cell));
  if (i1 < i0 || j1 < j0) return [];
  if ((i1 - i0) * (j1 - j0) > P.maxCells * 4) return [];

  const zEdge = step * P.drift * 1.6 + f.seed;
  const cover = coverageFromDb(f.db);

  // the swarm's heading for this zone — its own, so no two drift in step
  const fx = Math.cos(f.seed) * P.flow * step;
  const fy = Math.sin(f.seed) * P.flow * step;

  // 1. which cells are in the field at all
  const cells: PixelCell[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const x = ox + i * cell;
      const y = oy + j * cell;
      const dx = x + cell / 2 - f.cx;
      const dy = y + cell / 2 - f.cy;
      const d = Math.sqrt(dx * dx + dy * dy) / f.r;
      if (d > 1) continue;

      // density falls from the core to the measured rim, and the loudness
      // itself decides how much paper the zone claims at all
      const falloff = 1 - smoothstep(f.inner, 1, d);
      const local = cover * falloff;
      if (local <= 0.02) continue;

      // dithered edge: rim cells blink in and out, so the field frays into
      // the paper instead of stopping at a hard circle
      if (fbm2(i * P.edgeFreq + fx, j * P.edgeFreq + fy, zEdge) > Math.pow(local, P.edge)) continue;

      cells.push({ i, j, x, y, l: f.majority });
      if (cells.length > P.maxCells) break;
    }
  }
  if (!cells.length) return cells;

  // 2. hand out the minority colours, rarest first. Each follows its own
  //    noise field, so they surface in different places rather than one clump.
  const counts = allocate(f.mix, cells.length);
  const queue = counts
    .map((n, i) => ({ i, n }))
    .filter((o) => o.i !== f.majority && o.n > 0)
    .sort((a, b) => a.n - b.n);

  let pool = cells;
  for (const o of queue) {
    const z = step * P.drift + o.i * 31.7 + f.seed;
    for (const c of pool) c.s = fbm2(c.i * P.freq + fx, c.j * P.freq + fy, z);
    pool.sort((a, b) => (b.s as number) - (a.s as number));
    const take = Math.min(o.n, pool.length);
    for (let k = 0; k < take; k++) pool[k].l = o.i;
    pool = pool.slice(take);
  }

  return cells;
}

/** how much of the paper the pixels take — a visual encoding of a real dB */
export function coverageFromDb(db: number): number {
  const F = DESIGN.field;
  const t = clamp((db - F.quietDb) / (F.loudDb - F.quietDb), 0, 1);
  return F.minCoverage + (F.maxCoverage - F.minCoverage) * Math.pow(t, F.curve);
}

/**
 * The shared lattice.
 *
 * Both the paper grid and the loudness pixels anchor to this, so a pixel edge
 * always lands on a grid line. Because the pixel size is an exact subdivision
 * of the grid cell, aligning them at one size aligns them at both.
 *
 * `originX/Y` is the map's layer-space position of the container's top-left
 * corner, which keeps the lattice pinned to the world rather than the screen —
 * the grid stays put while you pan.
 */
export function latticeOffset(originX: number, originY: number, size: number) {
  return { ox: -posMod(originX, size), oy: -posMod(originY, size) };
}

/** The pixel size, always a clean subdivision of the paper grid cell. */
export function pixelSize(): number {
  return Math.max(2, Math.round(DESIGN.grid.fine / DESIGN.pixels.subdiv));
}
