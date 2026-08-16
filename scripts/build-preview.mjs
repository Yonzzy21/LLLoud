/**
 * QUIET — preview builder
 * ---------------------------------------------------------------------------
 * Builds a single, dependency-free HTML file that runs the design layer on the
 * repo's real NYC sound data and the real Leaflet map — no npm install, no
 * build step. Open the output straight from disk.
 *
 *     node scripts/build-preview.mjs   ->   preview/index.html
 *
 * WHAT THIS IS: a preview harness for the design. The map, the grid, the
 * sound field and the zone data are the real thing.
 * WHAT THIS IS NOT: the app. No React, no routing, no mic, no live 311 fetch.
 * For that, `npm install && npm run dev`.
 *
 * The design logic below is a plain-JS port of src/design/*.ts, and the
 * palette and tuning numbers are parsed out of tokens.ts at build time so the
 * preview cannot drift from the real design. If you change the engine, re-run.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ── pull the real zones out of src/data/nycSoundData.ts ────────────────── */

function extractZones() {
  const src = readFileSync(resolve(ROOT, 'src/data/nycSoundData.ts'), 'utf8');
  const start = src.indexOf('export const NYC_SOUND_ZONES');
  if (start === -1) throw new Error('NYC_SOUND_ZONES not found');
  // skip the `: SoundDensityZone[]` annotation — the array opens after the `=`
  const eq = src.indexOf('=', start);
  const open = src.indexOf('[', eq);

  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);

  const blocks = [];
  let d = 0, s = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') { if (d === 0) s = i; d++; }
    else if (body[i] === '}') { d--; if (d === 0 && s !== -1) { blocks.push(body.slice(s, i + 1)); s = -1; } }
  }

  const str = (b, k) => {
    const m = b.match(new RegExp(`\\b${k}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
    return m ? m[1].replace(/\\'/g, "'") : undefined;
  };
  const num = (b, k) => {
    const m = b.match(new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`));
    return m ? parseFloat(m[1]) : undefined;
  };

  const zones = [];
  for (const b of blocks) {
    const z = {
      id: str(b, 'id'),
      name: str(b, 'name'),
      lat: num(b, 'latitude'),
      lon: num(b, 'longitude'),
      radiusMeters: num(b, 'radiusMeters'),
      decibels: num(b, 'baseDecibels'),
      peakDecibels: num(b, 'peakDecibels'),
      kind: str(b, 'datasetCategory') || str(b, 'type'),
    };
    if (z.id && Number.isFinite(z.lat) && Number.isFinite(z.lon) &&
        Number.isFinite(z.radiusMeters) && Number.isFinite(z.decibels)) {
      zones.push(z);
    }
  }
  if (!zones.length) throw new Error('parsed zero zones — did the data file change shape?');
  return zones;
}

/* ── read the palette and tuning back out of src/design/tokens.ts ───────── */

function extractTokens() {
  const src = readFileSync(resolve(ROOT, 'src/design/tokens.ts'), 'utf8');
  const grab = (k) => {
    const m = src.match(new RegExp(`${k}:\\s*'(#[0-9A-Fa-f]{6})'`));
    if (!m) throw new Error(`token ${k} not found`);
    return m[1];
  };
  const levels = [...src.matchAll(/\{\s*color:\s*'(#[0-9A-Fa-f]{6})',\s*label:\s*'([^']+)',\s*note:\s*'([^']+)'/g)]
    .map((m) => ({ color: m[1], label: m[2], note: m[3] }));
  if (levels.length !== 5) throw new Error(`expected 5 levels, parsed ${levels.length}`);

  const n = (k) => {
    const m = src.match(new RegExp(`${k}:\\s*([\\d./]+)`));
    if (!m) throw new Error(`number ${k} not found`);
    return eval(m[1]); // handles "1 / 3"
  };

  return {
    colors: {
      paper: grab('paper'), map: grab('map'), grid: grab('grid'),
      gridDeep: grab('gridDeep'), ink: grab('ink'), inkSoft: grab('inkSoft'),
      route: grab('route'), mapTint: grab('mapTint'),
    },
    levels,
    edges: JSON.parse(src.match(/LEVEL_EDGES = (\[[^\]]+\])/)[1]),
    design: {
      fine: n('fine'), fineAlpha: n('fineAlpha'), cityOpacity: n('cityOpacity'),
      paperWash: n('paperWash'),
      cityOpacityNear: n('cityOpacityNear'),
      cityNearZoomLow: n('cityNearZoomLow'), cityNearZoomHigh: n('cityNearZoomHigh'),
      subdiv: n('subdiv'), freq: n('freq'), edgeFreq: n('edgeFreq'), flow: n('flow'),
      drift: n('drift'), fps: n('fps'), edge: n('edge'),
      octMix: n('mix'), octScale: n('scale'), octSpeed: n('speed'),
      trace: n('trace'), maxCells: n('maxCells'),
      quietDb: n('quietDb'), loudDb: n('loudDb'),
      minCoverage: n('minCoverage'), maxCoverage: n('maxCoverage'), curve: n('curve'),
      youRadiusMeters: n('youRadiusMeters'), youInner: n('youInner'),
      loudInner: n('loudInner'), minScreenRadius: n('minScreenRadius'),
    },
  };
}

const ZONES = extractZones();
const T = extractTokens();

/* ── the page ───────────────────────────────────────────────────────────── */

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="${T.colors.paper}" />
<title>QUIET — design preview</title>

<!--
  GENERATED FILE — do not edit by hand.
  Rebuild with:  node scripts/build-preview.mjs

  Preview harness for the design layer, on the repo's real zone data
  (${ZONES.length} zones parsed from src/data/nycSoundData.ts) and the real
  Leaflet map. No React, no routing, no mic — for those, npm run dev.
-->

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hedvig+Letters+Serif:opsz@12..24&display=swap" />
<style>
  :root {
    --paper: ${T.colors.paper};
    --map: ${T.colors.map};
    --grid: ${T.colors.grid};
    --grid-deep: ${T.colors.gridDeep};
    --ink: ${T.colors.ink};
    --ink-soft: ${T.colors.inkSoft};
    --route: ${T.colors.route};
    /* the colour the palest part of the basemap becomes — from tokens.ts */
    --map-tint: ${T.colors.mapTint};
    --r: 3px;
    --safe-t: env(safe-area-inset-top, 0px);
    --safe-b: env(safe-area-inset-bottom, 0px);
    /* TWO VOICES. Helvetica is the city — street names, labels, chrome.
       Hedvig Letters Serif is yours — where you are, where you are going,
       and how loud it is around you. */
    --font: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    --serif: 'Hedvig Letters Serif', ui-serif, Georgia, serif;
    --mono: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; background:var(--paper); font-family:var(--font); color:var(--ink); overscroll-behavior:none; -webkit-font-smoothing:antialiased; }

  #app { position:relative; width:100%; height:100%; max-width:430px; margin:0 auto; background:var(--paper); overflow:hidden; }

  /* the status bar is part of the phone, not the app */
  .statusbar {
    position:absolute; top:0; left:0; right:0; height:calc(var(--safe-t) + 44px);
    display:flex; align-items:flex-end; justify-content:space-between;
    padding:0 26px 8px; z-index:800; pointer-events:none;
    font-family:var(--font); font-size:14px; font-weight:600; letter-spacing:.01em; color:var(--ink);
  }
  .statusbar .dots { display:flex; gap:3px; align-items:center; }
  .statusbar .dots i { width:4px; height:4px; background:var(--ink); display:block; }
  .home-indicator {
    position:absolute; bottom:7px; left:50%; transform:translateX(-50%);
    width:134px; height:5px; border-radius:3px; background:var(--ink); opacity:.85;
    z-index:800; pointer-events:none;
  }

  /* On a phone the app is the whole screen. On a desktop, where this gets
     shared and reviewed, it is presented inside a device so the proportions
     are read correctly — this is a mobile-only design and a full-width browser
     window would misrepresent it. The frame is hardware, so it keeps hardware
     radii; the 3px rule is for interface chrome inside the screen. */
  .device { display:contents; }

  @media (min-width:480px) and (min-height:720px) {
    body { display:grid; place-items:center; background:#EFE9DE; padding:28px; }
    .device {
      display:block; position:relative;
      padding:11px;
      background:linear-gradient(160deg,#2A2620,#141210 60%,#2A2620);
      border-radius:56px;
      box-shadow:
        0 0 0 1.5px #4A443C,
        0 50px 100px -34px rgba(40,30,15,.55),
        0 8px 24px -12px rgba(40,30,15,.35);
    }
    #app {
      width:402px; height:min(874px, calc(100vh - 78px));
      border-radius:45px; overflow:hidden;
    }
    /* the island */
    .device::after {
      content:""; position:absolute; top:23px; left:50%; transform:translateX(-50%);
      width:112px; height:31px; border-radius:19px; background:#0B0A09; z-index:900;
    }
  }
  @media (max-width:479px), (max-height:719px) {
    .statusbar, .home-indicator { display:none; }   /* the real phone has its own */
  }

  .capsule { position:absolute; top:calc(var(--safe-t) + 44px); left:8px; right:8px; bottom:calc(var(--safe-b) + 22px); border-radius:var(--r); background:var(--map); overflow:hidden; }
  .capsule::after { content:""; position:absolute; inset:0; border-radius:inherit; box-shadow:inset 0 0 0 1px var(--grid); pointer-events:none; z-index:500; }
  #map { width:100%; height:100%; background:var(--map); }

  .leaflet-container { background:var(--map); font-family:var(--font); }
  /* The city is greyscaled, then tinted by a multiply layer. Multiply maps
     white to the tint exactly, so --map-tint IS the colour the palest part of
     the map becomes — no guessing at sepia and saturate numbers. Change that
     one variable and the whole basemap changes with it. */
  .quiet-tiles { filter: grayscale(1) contrast(0.88) brightness(1.04); }
  .map-tint {
    position:absolute; inset:0; z-index:250; pointer-events:none;
    background: var(--map-tint); mix-blend-mode: multiply;
  }
  .quiet-canvas { image-rendering: pixelated; }
  .leaflet-div-icon, .leaflet-marker-icon { background:none; border:none; }
  /* the browser's own blue focus ring on draggable markers — gone for pointer
     use, kept for keyboard so the app stays operable without a mouse */
  .leaflet-marker-icon:focus, .leaflet-interactive:focus { outline:none; }
  .leaflet-marker-icon:focus-visible, .leaflet-interactive:focus-visible { outline:1px solid var(--ink); outline-offset:3px; }
  /* you, your destination and the path all multiply with the sound beneath,
     so the three read as one object laid over the field. Labels stay out of
     it — they are read, not felt. */
  .leaflet-overlay-pane { mix-blend-mode: multiply; }
  .leaflet-marker-pane  { mix-blend-mode: multiply; }
  /* attribution is a licence condition — it must never end up under the sheet */
  .leaflet-control-attribution {
    background:rgba(255,252,243,.85)!important; color:var(--ink-soft)!important;
    font-size:9px!important; margin-bottom:calc(var(--sheet-h, 220px) + 6px)!important;
  }
  .leaflet-tooltip { background:var(--paper); color:var(--ink); border:1px solid var(--grid); border-radius:var(--r); box-shadow:none; font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; padding:3px 6px; }
  .leaflet-tooltip:before { display:none; }

  .chrome { position:absolute; inset:0; pointer-events:none; z-index:600; }
  .chrome > * { pointer-events:auto; }
  .topbar { position:absolute; top:calc(var(--safe-t) + 52px); left:20px; right:20px; display:flex; align-items:center; gap:10px; }
  .brand { font-family:var(--mono); font-size:11px; letter-spacing:.22em; text-transform:uppercase; background:var(--paper); border:1px solid var(--grid); border-radius:var(--r); padding:9px 14px 8px; white-space:nowrap; }
  .search { flex:1; display:flex; align-items:center; gap:9px; background:var(--paper); border:1px solid var(--grid); border-radius:var(--r); padding:9px 14px; min-width:0; }
  .search input { flex:1; min-width:0; border:0; outline:0; background:transparent; font-family:var(--serif); font-size:18px; color:var(--ink); }
  .search input::placeholder { color:var(--ink-soft); }

  /* The sheet floats over the map, so it must never grow past what the screen
     can hold — on a short window it scrolls instead of running off the bottom
     or pushing the map away. */
  .sheet {
    position:absolute; left:12px; right:12px; bottom:calc(var(--safe-b) + 28px);
    background:var(--paper); border:1px solid var(--grid); border-radius:var(--r);
    padding:14px 16px 16px;
    max-height:56vh; overflow-y:auto; -webkit-overflow-scrolling:touch;
  }
  .grabber { width:34px; height:3px; background:var(--grid); margin:0 auto 13px; }
  .meter-row { display:flex; align-items:center; gap:9px; }
  .meter-dot { width:11px; height:11px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06); }
  .meter-val { font-family:var(--serif); font-size:28px; font-weight:400; letter-spacing:-.01em; line-height:1; }
  .meter-tag { margin-left:auto; font-family:var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-soft); }
  .bar { display:flex; gap:3px; margin:12px 0 0; height:16px; }
  .bar i { flex:1; }
  /* POINT A / POINT B — the one thing the app is for, at 4x the chrome size */
  .ab { margin-top:13px; padding-top:12px; border-top:1px solid var(--grid); display:flex; flex-direction:column; gap:6px; }
  .ab button {
    display:flex; align-items:center; gap:11px; width:100%; text-align:left;
    background:transparent; border:1px solid transparent; border-radius:var(--r);
    padding:5px 7px; cursor:pointer; color:var(--ink);
    font-family:var(--serif); font-size:36px; line-height:1; font-weight:400; letter-spacing:-.01em;
  }
  .ab button[data-on="true"] { border-color:var(--ink); }
  .ab button u { width:14px; height:14px; display:block; flex:none; }
  .ab button span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
  .ab small { font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-soft); margin-left:auto; flex:none; padding-left:8px; }

  /* why it is loud here */
  .why { margin-top:11px; padding-top:10px; border-top:1px solid var(--grid); font-family:var(--mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft); line-height:1.6; }
  .why b { color:var(--ink); font-weight:500; }
  .why { overflow-wrap:anywhere; }

  @media (max-height:780px) { .note { display:none; } }
  .note { position:absolute; top:calc(var(--safe-t) + 106px); left:20px; right:20px; font-family:var(--mono); font-size:9px; line-height:1.7; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-soft); background:var(--paper); border:1px solid var(--grid); border-radius:var(--r); padding:9px 11px; }
</style>
</head>
<body>
<div class="device">
<div id="app">
  <div class="statusbar"><span id="clock">—</span><span class="dots"><i></i><i></i><i></i></span></div>
  <div class="home-indicator"></div>
  <div class="capsule"><div id="map"></div><div class="map-tint"></div></div>
  <div class="chrome">
    <div class="topbar">
      <div class="brand">Quiet</div>
      <div class="search"><input placeholder="Where to?" aria-label="Destination" /></div>
    </div>
    <div class="note" id="note">Loading…</div>
    <div class="sheet">
      <div class="grabber"></div>
      <div class="meter-row">
        <span class="meter-dot" id="dot"></span>
        <span class="meter-val" id="val">Quiet</span>
        <span class="meter-tag" id="tag">around you</span>
      </div>
      <div class="bar" id="bar"></div>
      <div class="why" id="why">—</div>
      <div class="ab">
        <button id="btn-a" data-on="true"><u style="box-shadow:inset 0 0 0 2px ${T.colors.ink}"></u><span>Point A</span><small>you</small></button>
        <button id="btn-b" data-on="false"><u style="background:${T.colors.ink}"></u><span>Point B</span><small>destination</small></button>
      </div>
    </div>
  </div>
</div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
/* ═══ tokens — parsed from src/design/tokens.ts at build time ═══ */
const COLORS = ${JSON.stringify(T.colors)};
const LEVELS = ${JSON.stringify(T.levels)};
const LEVEL_EDGES = ${JSON.stringify(T.edges)};
const D = ${JSON.stringify(T.design)};
const ZONES = ${JSON.stringify(ZONES)};

function levelFromDb(db) {
  for (let i = 0; i < LEVEL_EDGES.length; i++) if (db < LEVEL_EDGES[i]) return i;
  return LEVELS.length - 1;
}

/* ═══ engine — port of src/design/loudnessField.ts ═══ */
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const posMod = (v,m) => ((v % m) + m) % m;
function smoothstep(a,b,x){ const k = clamp((x-a)/(b-a||1e-6),0,1); return k*k*(3-2*k); }
function ihash(a,b,c){
  let h = Math.imul(a|0,374761393) ^ Math.imul(b|0,668265263) ^ Math.imul(c|0,1274126177);
  h = Math.imul(h ^ (h>>>13), 1274126177);
  return ((h ^ (h>>>16)) >>> 0) / 4294967296;
}
function vnoise(x,y,z){
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const xf=x-xi, yf=y-yi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf), w=zf*zf*(3-2*zf);
  const L=(a,b,k)=>a+(b-a)*k;
  const plane=(dz)=>L(
    L(ihash(xi,yi,zi+dz), ihash(xi+1,yi,zi+dz), u),
    L(ihash(xi,yi+1,zi+dz), ihash(xi+1,yi+1,zi+dz), u), v);
  return L(plane(0), plane(1), w);
}
/* THE MIX COMES FROM THE DATA.
   Each zone carries two real measurements — baseDecibels and peakDecibels.
   The share of each colour is the fraction of that measured interval falling
   in each level's band. A narrow range comes out one flat colour, and that is
   correct. Nothing here is chosen for looks. */
/* Two octaves: a slow broad one with a faster finer one over it. One scale of
   motion reads mechanical; two read like something breathing. */
function fbm2(x,y,z){
  return (1-D.octMix)*vnoise(x,y,z) + D.octMix*vnoise(x*D.octScale, y*D.octScale, z*D.octSpeed);
}

function mixFromRange(baseDb, peakDb){
  const lo = Math.min(baseDb, peakDb), hi = Math.max(baseDb, peakDb);
  const out = LEVELS.map(()=>0);
  if (hi - lo < 1e-6){ out[levelFromDb(lo)] = 1; return out; }
  // weight decays from base to peak: peaks are brief by definition, so the
  // sustained level dominates and the peak reads as a minority
  const tau = (hi - lo) / 3;
  const w = x => 1 - Math.exp(-(x - lo)/tau);
  const total = w(hi);
  const edges = [-Infinity, ...LEVEL_EDGES, Infinity];
  for (let l=0;l<LEVELS.length;l++){
    const a = Math.max(lo, edges[l]), b = Math.min(hi, edges[l+1]);
    if (b > a) out[l] = (w(b) - w(a)) / total;
  }
  return out;
}
const majorityOf = mix => mix.indexOf(Math.max(...mix));

/** exact counts — the proportions are data, so they are counted, not sampled */
function allocate(mix, n){
  const c = mix.map(w=>Math.floor(w*n));
  if (n >= D.trace) for (let i=0;i<c.length;i++) if (mix[i] > 0 && c[i] === 0) c[i] = 1;
  const maj = mix.indexOf(Math.max(...mix));
  c[maj] = Math.max(0, c[maj] + (n - c.reduce((a,b)=>a+b,0)));
  return c;
}

/** how much paper the pixels take — a visual encoding of a real dB */
function coverageFromDb(db){
  const t = clamp((db - D.quietDb)/(D.loudDb - D.quietDb), 0, 1);
  return D.minCoverage + (D.maxCoverage - D.minCoverage)*Math.pow(t, D.curve);
}

function buildPixelField(f, step, vp){
  const { cell, ox, oy, width, height } = vp;
  const i0 = Math.max(Math.floor((f.cx-f.r-ox)/cell), Math.floor(-ox/cell));
  const i1 = Math.min(Math.ceil((f.cx+f.r-ox)/cell), Math.ceil((width-ox)/cell));
  const j0 = Math.max(Math.floor((f.cy-f.r-oy)/cell), Math.floor(-oy/cell));
  const j1 = Math.min(Math.ceil((f.cy+f.r-oy)/cell), Math.ceil((height-oy)/cell));
  if (i1<i0 || j1<j0) return [];

  const zEdge = step*D.drift*1.6 + f.seed;
  const cover = coverageFromDb(f.db);
  // the swarm's heading for this zone — its own, so no two drift in step
  const fx = Math.cos(f.seed)*D.flow*step, fy = Math.sin(f.seed)*D.flow*step;

  const cells = [];
  for (let i=i0;i<=i1;i++){
    for (let j=j0;j<=j1;j++){
      const x = ox+i*cell, y = oy+j*cell;
      const dx = x+cell/2-f.cx, dy = y+cell/2-f.cy;
      const d = Math.sqrt(dx*dx+dy*dy)/f.r;
      if (d>1) continue;
      const local = cover * (1 - smoothstep(f.inner, 1, d));
      if (local <= 0.02) continue;
      if (fbm2(i*D.edgeFreq + fx, j*D.edgeFreq + fy, zEdge) > Math.pow(local, D.edge)) continue;
      cells.push({ i, j, x, y, l: f.majority });
      if (cells.length > D.maxCells) break;
    }
  }
  if (!cells.length) return cells;

  const counts = allocate(f.mix, cells.length);
  const queue = counts.map((n,i)=>({i,n})).filter(o=>o.i!==f.majority && o.n>0).sort((a,b)=>a.n-b.n);
  let pool = cells;
  for (const o of queue){
    const z = step*D.drift + o.i*31.7 + f.seed;
    for (const c of pool) c.s = fbm2(c.i*D.freq + fx, c.j*D.freq + fy, z);
    pool.sort((a,b)=>b.s-a.s);
    const take = Math.min(o.n, pool.length);
    for (let k=0;k<take;k++) pool[k].l = o.i;
    pool = pool.slice(take);
  }
  return cells;
}

/* ═══ the map ═══ */
const START = [40.7580, -73.9855];   // Midtown
const map = L.map('map', { center: START, zoom: 15, minZoom: 11, maxZoom: 18, zoomControl: false });

// the real NYC map, labels and all — it has to stay readable through the field
const cityOpacityFor = (z) => {
  const t = clamp((z - D.cityNearZoomLow) / (D.cityNearZoomHigh - D.cityNearZoomLow), 0, 1);
  return D.cityOpacity + (D.cityOpacityNear - D.cityOpacity) * t;
};
const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; CARTO &copy; OSM', maxZoom: 19, subdomains: 'abcd',
  opacity: cityOpacityFor(map.getZoom()), className: 'quiet-tiles',
}).addTo(map);
// zoomed out this is a soundscape; zoomed in you are navigating, and the
// street names have to come through the field
map.on('zoomend', () => tiles.setOpacity(cityOpacityFor(map.getZoom())));

/* ═══ the design layer — port of src/design/QuietMapLayer.ts ═══ */
const METRIC_STEPS = [5,10,25,50,100,250,500,1000,2500];

const pane = map.createPane('quietPane');
pane.style.zIndex = '350';
pane.style.pointerEvents = 'none';

const canvas = document.createElement('canvas');
canvas.className = 'quiet-canvas';
canvas.style.position = 'absolute';
pane.appendChild(canvas);
const ctx = canvas.getContext('2d');

let dirty = true, lastStep = -1, hiddenNow = false, cells = [], cellsKey = '';
const started = performance.now();
let user = { lat: START[0], lon: START[1] };
let gridMetres = 0;

const metersPerPixel = (lat) => (40075016.686 * Math.cos(lat*Math.PI/180)) / (256 * Math.pow(2, map.getZoom()));

/** a cell is a round number of metres on the ground, snapped so the pixel
    (a third of a cell) stays a whole number of screen pixels */
function gridGeometry(){
  const mpp = metersPerPixel(map.getCenter().lat);
  let metres = METRIC_STEPS[0], bestErr = Infinity;
  for (const m of METRIC_STEPS){ const e = Math.abs(m/mpp - D.fine); if (e < bestErr){ bestErr = e; metres = m; } }
  const gridPx = Math.max(D.subdiv*3, Math.round(metres/mpp/D.subdiv)*D.subdiv);
  return { gridPx, cellPx: gridPx/D.subdiv, metres };
}

/** loudness at a point: the city baseline, raised by hotspots, lowered by havens */
/* WHAT IS MEASURED, AND NOTHING ELSE.
   33 zones are measured. The ground between them is not, so nothing is drawn
   there — bare grid and street map means "no reading", not "quiet". */
const KIND_WORDS = {
  'construction': 'Construction', 'nightlife': 'Nightlife',
  'mta-transit': 'Subway and elevated track', 'subway-screech': 'Subway screech',
  'traffic-corridor': 'Traffic and sirens', 'traffic-siren': 'Traffic and sirens',
  '311-complaint': 'Reported to 311', 'quiet-haven': 'Park or sanctuary',
  'community-report': 'Reported by a neighbour',
};

/** the measured zone you are standing in, or null — we do not guess */
function reasonAt(lat, lon){
  const mLat = 111320, mLon = 111320 * Math.cos(lat*Math.PI/180);
  let best = null, bestFrac = Infinity;
  for (const z of ZONES){
    const dx = (lon - z.lon)*mLon, dy = (lat - z.lat)*mLat;
    const frac = Math.sqrt(dx*dx + dy*dy) / z.radiusMeters;
    if (frac > 1) continue;
    if (frac < bestFrac){ bestFrac = frac; best = z; }
  }
  if (!best) return null;
  const peak = best.peakDecibels != null ? best.peakDecibels : best.decibels;
  const db = peak + (best.decibels - peak) * smoothstep(0, 1, bestFrac);
  return { zone: best, db, kind: KIND_WORDS[best.kind] || 'Sound source' };
}

/** one field per measured zone, bounded by its measured radius */
function fields(vp){
  const out = [];
  ZONES.forEach((z,k)=>{
    const p = map.latLngToContainerPoint([z.lat, z.lon]);
    const r = z.radiusMeters / metersPerPixel(z.lat);
    if (r < D.minScreenRadius) return;
    const m = 80;
    if (p.x < -r-m || p.y < -r-m || p.x > vp.width+r+m || p.y > vp.height+r+m) return;
    const peak = z.peakDecibels != null ? z.peakDecibels : z.decibels;
    out.push({
      id: z.id, cx: p.x, cy: p.y, r, inner: D.loudInner,
      mix: mixFromRange(z.decibels, peak),
      majority: majorityOf(mixFromRange(z.decibels, peak)),
      db: z.decibels, seed: k*13.7,
    });
  });
  return out;
}

function reposition(){
  const size = map.getSize();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (canvas.width !== Math.round(size.x*dpr) || canvas.height !== Math.round(size.y*dpr)){
    canvas.width = Math.round(size.x*dpr); canvas.height = Math.round(size.y*dpr);
    canvas.style.width = size.x+'px'; canvas.style.height = size.y+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0,0]));
  cellsKey = ''; dirty = true;
}
map.on('move zoom resize viewreset zoomend moveend', reposition);
map.on('zoomanim', ()=>{ hiddenNow = true; canvas.style.opacity = '0'; });
map.on('zoomend',  ()=>{ hiddenNow = false; canvas.style.opacity = '1'; cellsKey=''; dirty = true; });

function render(step){
  const size = map.getSize();
  const geo = gridGeometry();
  gridMetres = geo.metres;
  const tl = map.containerPointToLayerPoint([0,0]);
  const gOx = Math.round(-posMod(tl.x, geo.gridPx)), gOy = Math.round(-posMod(tl.y, geo.gridPx));
  const vp = {
    width:size.x, height:size.y,
    ox: Math.round(-posMod(tl.x, geo.cellPx)),
    oy: Math.round(-posMod(tl.y, geo.cellPx)),
    cell: geo.cellPx,
  };

  ctx.clearRect(0,0,size.x,size.y);

  // the plate is white; the paper tone is a wash over it, above the tiles
  ctx.fillStyle = COLORS.paper;
  ctx.globalAlpha = D.paperWash;
  ctx.fillRect(0,0,size.x,size.y);
  ctx.globalAlpha = 1;

  // the measured grid
  ctx.save();
  ctx.strokeStyle = COLORS.grid; ctx.globalAlpha = D.fineAlpha; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x=gOx; x<size.x; x+=geo.gridPx){ const px=Math.round(x)+0.5; ctx.moveTo(px,0); ctx.lineTo(px,size.y); }
  for (let y=gOy; y<size.y; y+=geo.gridPx){ const py=Math.round(y)+0.5; ctx.moveTo(0,py); ctx.lineTo(size.x,py); }
  ctx.stroke(); ctx.restore();

  const key = step+'|'+Math.round(tl.x)+'|'+Math.round(tl.y)+'|'+geo.cellPx+'|'+map.getZoom();
  if (key !== cellsKey){
    cellsKey = key;
    cells = [];
    for (const f of fields(vp)) cells.push(...buildPixelField(f, step, vp));
  }

  for (const c of cells){ ctx.fillStyle = LEVELS[c.l].color; ctx.fillRect(c.x, c.y, geo.cellPx, geo.cellPx); }
}

function tick(){
  requestAnimationFrame(tick);
  if (hiddenNow) return;
  const step = Math.floor(((performance.now()-started)/1000) * D.fps);
  if (step !== lastStep){ lastStep = step; dirty = true; }
  if (!dirty) return;
  dirty = false;
  render(step);
  document.getElementById('note').innerHTML =
    'Design preview · ' + ZONES.length + ' real NYC zones<br>1 grid cell = ' + gridMetres + ' m on the ground';
}

/* ═══ you, and where you are going ═══ */
const youIcon = L.divIcon({
  className: '',
  // you: a hollow square — the same bounding box as point A
  html: '<div style="width:12px;height:12px;box-shadow:inset 0 0 0 2px '+COLORS.ink+'"></div>',
  iconSize: [12,12], iconAnchor: [6,6],
});
const destIcon = L.divIcon({
  className: '',
  // destination: same shape, same colour, solid
  html: '<div style="width:12px;height:12px;background:'+COLORS.ink+'"></div>',
  iconSize: [12,12], iconAnchor: [6,6],
});

let dest = { lat: 40.7420, lon: -73.9890 };

const youMarker = L.marker([user.lat, user.lon], { icon: youIcon, zIndexOffset: 1000, draggable: true })
  .addTo(map).bindTooltip('You', { permanent: true, direction: 'right', offset: [9,0] });
const destMarker = L.marker([dest.lat, dest.lon], { icon: destIcon, zIndexOffset: 1000, draggable: true })
  .addTo(map).bindTooltip('Destination', { permanent: true, direction: 'right', offset: [9,0] });

/* the path: top layer, multiplying with the sound beneath it, so it darkens
   wherever it crosses noise and stays flat across quiet ground */
function routeCoords(a, b){
  const mLat = a.lat + (b.lat - a.lat) * 0.55;
  const mLon = a.lon + (b.lon - a.lon) * 0.45;
  return [[a.lat,a.lon],[a.lat,mLon],[mLat,mLon],[mLat,b.lon],[b.lat,b.lon]];
}
const routeLine = L.polyline(routeCoords(user, dest), {
  color: COLORS.route, weight: 3.5, opacity: 1,
  lineJoin: 'round', lineCap: 'round', className: 'quiet-route',
}).addTo(map);
const redrawRoute = () => routeLine.setLatLngs(routeCoords(user, dest));

function moveUser(lat, lon){
  user = { lat, lon };
  youMarker.setLatLng([lat, lon]);
  redrawRoute();
  cellsKey = ''; dirty = true;
}
youMarker.on('drag', (e) => { const ll = e.target.getLatLng(); moveUser(ll.lat, ll.lng); });
destMarker.on('drag', (e) => { const ll = e.target.getLatLng(); dest = { lat: ll.lat, lon: ll.lng }; redrawRoute(); });

let active = 'a';
const btnA = document.getElementById('btn-a'), btnB = document.getElementById('btn-b');
function setActive(which){
  active = which;
  btnA.dataset.on = String(which === 'a');
  btnB.dataset.on = String(which === 'b');
}
btnA.onclick = () => setActive('a');
btnB.onclick = () => setActive('b');

map.on('click', (e) => {
  if (active === 'a') { moveUser(e.latlng.lat, e.latlng.lng); }
  else { dest = { lat: e.latlng.lat, lon: e.latlng.lng }; destMarker.setLatLng(e.latlng); redrawRoute(); }
});

// zones stay tappable
for (const z of ZONES){
  L.circle([z.lat,z.lon], { radius: z.radiusMeters, stroke:false, fillColor:'#fff', fillOpacity:0.01 })
    .bindTooltip(z.name, { sticky: true }).addTo(map);
}

/* ═══ the sheet ═══ */
const bar = document.getElementById('bar');
const CELLS = 25;
for (let i=0;i<CELLS;i++) bar.appendChild(document.createElement('i'));

function updateSheet(){
  const why = reasonAt(user.lat, user.lon);
  const val = document.getElementById('val');
  const tag = document.getElementById('tag');
  const dot = document.getElementById('dot');
  const bar = document.getElementById('bar');

  if (!why){
    // no measurement covers this point, and the interface says exactly that
    val.textContent = 'No reading';
    tag.textContent = 'unmeasured ground';
    dot.style.background = 'transparent';
    dot.style.boxShadow = 'inset 0 0 0 1px ' + COLORS.grid;
    document.getElementById('why').innerHTML =
      'No measurement covers this point.<br>33 zones are measured; the rest of the city is not.';
    [...bar.children].forEach(c => { c.style.background = COLORS.grid; c.style.opacity = 0.35; });
    return;
  }

  const lvl = levelFromDb(why.db);
  val.textContent = LEVELS[lvl].label;
  tag.textContent = LEVELS[lvl].note;
  dot.style.background = LEVELS[lvl].color;
  dot.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.06)';
  document.getElementById('why').innerHTML =
    'Because of <b>' + why.kind + '</b><br>' + why.zone.name;

  [...bar.children].forEach((c,i)=>{
    const band = Math.min(LEVELS.length-1, Math.floor(i/(CELLS/LEVELS.length)));
    const on = band <= lvl;
    c.style.background = on ? LEVELS[band].color : COLORS.grid;
    c.style.opacity = on ? 1 : 0.35;
  });
}
setInterval(updateSheet, 150);

/* the real time, not a mocked-up 9:41 */
function tickClock(){
  const d = new Date();
  document.getElementById('clock').textContent =
    d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
}
tickClock(); setInterval(tickClock, 10000);

/* nothing overlaps by assumption — the sheet's real height is measured and
   published, and anything that must clear it reads the measurement */
const sheetEl = document.querySelector('.sheet');
function measureSheet(){
  document.documentElement.style.setProperty('--sheet-h', sheetEl.offsetHeight + 'px');
}
measureSheet();
new ResizeObserver(measureSheet).observe(sheetEl);
window.addEventListener('resize', measureSheet);

reposition();
updateSheet();
requestAnimationFrame(tick);
</script>
</body>
</html>
`;

mkdirSync(resolve(ROOT, 'preview'), { recursive: true });
writeFileSync(resolve(ROOT, 'preview/index.html'), html);
console.log(`wrote preview/index.html — ${ZONES.length} real zones, ${(html.length / 1024).toFixed(0)} kB`);

/* Mirror the built file anywhere else you keep it open, so there is never a
   stale copy to be fooled by:
       node scripts/build-preview.mjs --mirror ~/Desktop/quiet-nyc/index.html
   Pass the flag as many times as you like. */
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--mirror') continue;
  const target = argv[i + 1];
  if (!target) throw new Error('--mirror needs a path');
  const abs = target.startsWith('~')
    ? resolve(process.env.HOME ?? '', target.slice(2))
    : resolve(target);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, html);
  console.log(`mirrored -> ${abs}`);
}
