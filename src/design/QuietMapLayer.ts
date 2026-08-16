/**
 * QUIET — the map layer
 * ---------------------------------------------------------------------------
 * A canvas overlay that turns the Leaflet map into the design:
 *
 *   1. the real city, warmed into the paper palette and held back
 *   2. a metric grid, locked to real ground distance
 *   3. one continuous sound field covering every part of the map
 *
 * THE CITY IS NEVER SILENT. There are no islands of sound on blank paper —
 * there is one surface, and the zones are peaks in it. Quiet ground is sparse
 * pale pixels with the street map legible through them; loud ground fills in
 * until the city disappears underneath.
 *
 * THE GRID IS MEASURED. Its spacing is a round number of metres chosen for the
 * current zoom, so a cell always means a real distance on the ground and the
 * grid scales with the map instead of floating over it. The pixel is an exact
 * third of a cell, so the two lattices can never drift apart.
 */

import L from 'leaflet';
import { COLORS, DESIGN, LEVELS, levelFromDb } from './tokens';
import {
  buildPixelField,
  latticeOffset,
  majorityOf,
  mixFromRange,
  clamp,
  smoothstep,
  type FieldSpec,
  type PixelCell,
  type Viewport,
} from './loudnessField';

export interface QuietZone {
  id: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  /** the zone's sustained level */
  decibels: number;
  /** what it hits at worst — drives the core of the field */
  peakDecibels?: number;
  /** why it is loud here — 'construction', 'nightlife', 'mta-transit' … */
  kind?: string;
  /** the place's own name, for the readout */
  label?: string;
}

/** what is making the noise at a point, and how strongly */
export interface SoundReason {
  level: number;
  kind: string;
  label: string;
  /** true when nothing specific is responsible — just the city itself */
  ambient: boolean;
}

/** round ground distances a grid cell is allowed to mean */
const METRIC_STEPS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];

export class QuietMapLayer extends L.Layer {
  private map: L.Map | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private tint: HTMLDivElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frame = 0;
  private started = 0;
  private dirty = true;
  private lastStep = -1;
  private hidden = false;

  private zones: QuietZone[] = [];
  private user: { lat: number; lon: number } | null = null;
  /** the live microphone reading — real data, but only while the mic is on */
  private ambientDb = 0;
  private hasReading = false;

  private cells: PixelCell[] = [];
  private cellsKey = '';

  /* ── data in ──────────────────────────────────────────────────────────── */

  setZones(zones: QuietZone[]) {
    this.zones = zones;
    this.cellsKey = '';
    this.dirty = true;
  }

  setUser(lat: number | null, lon: number | null) {
    this.user = lat === null || lon === null ? null : { lat, lon };
    this.cellsKey = '';
    this.dirty = true;
  }

  /**
   * The live microphone reading. This is a real measurement, so it earns a
   * field of its own around you — but only while it is actually arriving.
   * Pass null when the mic is off and nothing is drawn.
   */
  setAmbientDb(db: number | null) {
    const has = db !== null && Number.isFinite(db) && db > 0;
    if (has !== this.hasReading || (has && Math.abs((db as number) - this.ambientDb) > 1.5)) {
      this.cellsKey = '';
      this.dirty = true;
    }
    this.hasReading = has;
    if (has) this.ambientDb = db as number;
  }

  /* ── leaflet lifecycle ────────────────────────────────────────────────── */

  onAdd(map: L.Map): this {
    const paneName = 'quietPane';
    let pane = map.getPane(paneName);
    if (!pane) {
      pane = map.createPane(paneName);
      pane.style.zIndex = '350'; // above tiles (200), below routes (400)
      pane.style.pointerEvents = 'none';
    }

    // The basemap tint: greyscaled tiles multiplied by one colour. It needs
    // its own pane — a pane's z-index makes it a stacking context, so a blend
    // set inside quietPane would never reach the tiles underneath.
    const tintName = 'quietTintPane';
    let tintPane = map.getPane(tintName);
    if (!tintPane) {
      tintPane = map.createPane(tintName);
      tintPane.style.zIndex = '250'; // above tiles (200), below the field (350)
      tintPane.style.pointerEvents = 'none';
      tintPane.style.mixBlendMode = 'multiply';
    }
    const tint = L.DomUtil.create('div', 'quiet-tint') as HTMLDivElement;
    tint.style.position = 'absolute';
    tint.style.background = COLORS.mapTint;
    tint.style.pointerEvents = 'none';
    tintPane.appendChild(tint);
    this.tint = tint;

    const canvas = L.DomUtil.create('canvas', 'quiet-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    pane.appendChild(canvas);

    this.map = map;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.started = performance.now();

    map.on('move zoom resize viewreset zoomend moveend', this.reposition, this);
    map.on('zoomanim', this.onZoomAnim, this);
    map.on('zoomend', this.onZoomEnd, this);

    this.reposition();
    this.frame = requestAnimationFrame(this.tick);
    return this;
  }

  onRemove(map: L.Map): this {
    cancelAnimationFrame(this.frame);
    map.off('move zoom resize viewreset zoomend moveend', this.reposition, this);
    map.off('zoomanim', this.onZoomAnim, this);
    map.off('zoomend', this.onZoomEnd, this);
    this.canvas?.remove();
    this.tint?.remove();
    this.canvas = null;
    this.tint = null;
    this.ctx = null;
    this.map = null;
    this.cells = [];
    return this;
  }

  /** The canvas works in container space, so it is re-pinned on every move. */
  private reposition = () => {
    const map = this.map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    if (canvas.width !== Math.round(size.x * dpr) || canvas.height !== Math.round(size.y * dpr)) {
      canvas.width = Math.round(size.x * dpr);
      canvas.height = Math.round(size.y * dpr);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const origin = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, origin);
    if (this.tint) {
      this.tint.style.width = `${size.x}px`;
      this.tint.style.height = `${size.y}px`;
      L.DomUtil.setPosition(this.tint, origin);
    }
    this.cellsKey = '';
    this.dirty = true;
  };

  private onZoomAnim = () => {
    this.hidden = true;
    if (this.canvas) this.canvas.style.opacity = '0';
  };

  private onZoomEnd = () => {
    this.hidden = false;
    if (this.canvas) this.canvas.style.opacity = '1';
    this.cellsKey = '';
    this.dirty = true;
  };

  /* ── frame ────────────────────────────────────────────────────────────── */

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    if (this.hidden) return;

    const t = (performance.now() - this.started) / 1000;
    const step = Math.floor(t * DESIGN.pixels.fps);

    if (step !== this.lastStep) {
      this.lastStep = step;
      this.dirty = true;
    }
    if (!this.dirty) return;

    this.dirty = false;
    this.render(step);
  };

  /* ── geometry ─────────────────────────────────────────────────────────── */

  /**
   * How visible the real city should be right now. Zoomed out the map is a
   * soundscape and the streets are texture; zoomed in you are navigating, and
   * the street names have to be readable through the field.
   */
  static cityOpacityFor(zoom: number): number {
    const G = DESIGN.grid;
    const t = clamp((zoom - G.cityNearZoomLow) / (G.cityNearZoomHigh - G.cityNearZoomLow), 0, 1);
    return G.cityOpacity + (G.cityOpacityNear - G.cityOpacity) * t;
  }

  /** metres per container pixel at a latitude and the current zoom */
  private metersPerPixel(map: L.Map, lat: number): number {
    return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * Math.pow(2, map.getZoom()));
  }

  /**
   * Pick the grid: the round ground distance whose on-screen cell lands
   * closest to the design's target, then snap the cell to a multiple of 3
   * pixels so the pixel — a third of a cell — stays a whole number and the two
   * lattices line up exactly.
   */
  private gridGeometry(map: L.Map) {
    const mpp = this.metersPerPixel(map, map.getCenter().lat);
    const target = DESIGN.grid.fine;

    let metres = METRIC_STEPS[0];
    let bestErr = Infinity;
    for (const m of METRIC_STEPS) {
      const err = Math.abs(m / mpp - target);
      if (err < bestErr) { bestErr = err; metres = m; }
    }

    const sub = DESIGN.pixels.subdiv;
    const gridPx = Math.max(sub * 3, Math.round(metres / mpp / sub) * sub);
    return { gridPx, cellPx: gridPx / sub, metres };
  }

  /* ── the sound surface ────────────────────────────────────────────────── */

  /**
   * One field per measured zone, bounded by its measured radius. The ground
   * between zones carries no measurement, so nothing is drawn there.
   */
  private fields(map: L.Map, vp: Viewport): FieldSpec[] {
    const out: FieldSpec[] = [];
    const margin = 80;

    this.zones.forEach((z, k) => {
      const p = map.latLngToContainerPoint([z.lat, z.lon]);
      const r = z.radiusMeters / this.metersPerPixel(map, z.lat);
      if (r < DESIGN.dissolve.minScreenRadius) return;
      if (p.x < -r - margin || p.y < -r - margin ||
          p.x > vp.width + r + margin || p.y > vp.height + r + margin) return;

      const peak = z.peakDecibels ?? z.decibels;
      const mix = mixFromRange(z.decibels, peak);
      out.push({
        id: z.id,
        cx: p.x, cy: p.y, r,
        inner: DESIGN.dissolve.loudInner,
        mix,
        // the dominant colour must be the largest share of the zone's own mix.
        // Deriving it separately let the two disagree, which broke the counts.
        majority: majorityOf(mix),
        db: z.decibels,
        seed: k * 13.7,
      });
    });

    return out;
  }

  /**
   * What is responsible for the loudness at a point — the measured zone you
   * are standing in. Outside every zone there is no measurement, and the
   * readout says so rather than guessing.
   */
  reasonAt(lat: number, lon: number): SoundReason | null {
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);

    let best: QuietZone | null = null;
    let bestFrac = Infinity;

    for (const z of this.zones) {
      const dx = (lon - z.lon) * mPerDegLon;
      const dy = (lat - z.lat) * mPerDegLat;
      const frac = Math.sqrt(dx * dx + dy * dy) / z.radiusMeters;
      if (frac > 1) continue;              // outside the measured radius
      if (frac < bestFrac) { bestFrac = frac; best = z; }
    }

    if (!best) return null;                 // no reading here, and we say so
    return {
      level: levelFromDb(this.zoneDbAt(best, bestFrac)),
      kind: best.kind ?? 'unknown',
      label: best.label ?? 'Unnamed source',
      ambient: false,
    };
  }

  /**
   * dB inside a zone: interpolated between its two measured values — peak at
   * the core, sustained level at the measured radius. Both ends are real; the
   * curve between them is the one modelling assumption, stated here.
   */
  private zoneDbAt(z: QuietZone, frac: number): number {
    const peak = z.peakDecibels ?? z.decibels;
    return peak + (z.decibels - peak) * smoothstep(0, 1, frac);
  }

  /* ── draw ─────────────────────────────────────────────────────────────── */

  private render(step: number) {
    const map = this.map;
    const ctx = this.ctx;
    if (!map || !ctx) return;

    const size = map.getSize();
    const { gridPx, cellPx } = this.gridGeometry(map);

    // Both lattices anchor to the map's own pixel space, so the grid stays
    // pinned to the ground as you pan. The pixel being an exact third of the
    // cell means aligning one aligns both.
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    const g = latticeOffset(topLeft.x, topLeft.y, gridPx);
    const p = latticeOffset(topLeft.x, topLeft.y, cellPx);

    const vp: Viewport = {
      width: size.x,
      height: size.y,
      ox: Math.round(p.ox),
      oy: Math.round(p.oy),
      cell: cellPx,
    };

    ctx.clearRect(0, 0, size.x, size.y);

    // the plate is white; the paper tone is a wash over it, above the city
    // tiles and below the grid
    ctx.fillStyle = COLORS.paper;
    ctx.globalAlpha = DESIGN.grid.paperWash;
    ctx.fillRect(0, 0, size.x, size.y);
    ctx.globalAlpha = 1;

    this.drawGrid(ctx, size.x, size.y, Math.round(g.ox), Math.round(g.oy), gridPx);

    const key = `${step}|${Math.round(topLeft.x)}|${Math.round(topLeft.y)}|${cellPx}|${map.getZoom()}`;
    if (key !== this.cellsKey) {
      this.cellsKey = key;

      const specs = this.fields(map, vp);

      // your own live reading, if the mic is actually running
      if (this.hasReading && this.user) {
        const p = map.latLngToContainerPoint([this.user.lat, this.user.lon]);
        const r = DESIGN.dissolve.youRadiusMeters / this.metersPerPixel(map, this.user.lat);
        if (r >= DESIGN.dissolve.minScreenRadius) {
          specs.push({
            id: '__you__',
            cx: p.x, cy: p.y, r,
            inner: DESIGN.dissolve.youInner,
            // a single instantaneous sample has no range, so it is one colour
            mix: mixFromRange(this.ambientDb, this.ambientDb),
            majority: levelFromDb(this.ambientDb),  // a single sample: one colour
            db: this.ambientDb,
            seed: 7.3,
          });
        }
      }

      this.cells = [];
      for (const f of specs) this.cells.push(...buildPixelField(f, step, vp));
    }

    for (const c of this.cells) {
      ctx.fillStyle = LEVELS[c.l].color;
      ctx.fillRect(c.x, c.y, cellPx, cellPx);
    }
  }

  /** The measured grid — one cell is a round number of metres on the ground. */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    ox: number, oy: number, cell: number,
  ) {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.globalAlpha = DESIGN.grid.fineAlpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < w; x += cell) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = oy; y < h; y += cell) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function createQuietLayer() {
  return new QuietMapLayer();
}
