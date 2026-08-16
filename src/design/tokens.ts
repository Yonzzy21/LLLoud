/**
 * QUIET — design tokens
 * ---------------------------------------------------------------------------
 * The single source of truth for the visual system. Nothing in the design
 * layer hard-codes a colour or a number; it all comes from here, so the whole
 * app can be re-tuned from one file.
 *
 * The premise: the city is a grid — stable, quiet, infrastructural. Sound is
 * what disturbs it. Where it is loud the grid gives way, and the room it
 * leaves behind is filled with the colour of that loudness.
 */

export const COLORS = {
  paper:    '#FFFCF3', // app background
  map:      '#FFFFFF', // the map plate itself
  grid:     '#E5D2B9', // graph-paper grid + all rule lines
  gridDeep: '#D8BF9C', // heavier structure
  ink:      '#1C1A16', // type, user marker, primary actions
  inkSoft:  '#AEA8A0', // secondary type — and the path, which matches it
  route:    '#AEA8A0', // your path: you → destination
  /** The colour the palest part of the basemap becomes. The city is
      greyscaled and then multiplied by this, and multiply maps white exactly
      onto it — so this one value IS the map's colour. Change it and the whole
      basemap follows, with no filter guesswork. */
  mapTint:  '#E5D2B9',
} as const;

export interface LoudnessLevel {
  /** the pixel colour */
  color: string;
  /** short name, shown in the UI */
  label: string;
  /** the qualitative reading — never a number */
  note: string;
}

/** The five states of loudness. Order matters — this is a scale. */
export const LEVELS: LoudnessLevel[] = [
  { color: '#E4ECF2', label: 'Quiet',        note: 'quiet'               },
  { color: '#FFD6FF', label: 'Almost quiet', note: 'some sound artifact' },
  { color: '#87A5FF', label: 'Loud',         note: 'loud'                },
  { color: '#FF4938', label: 'Very loud',    note: 'very loud'           },
  { color: '#60545A', label: 'Too loud',     note: 'bad for your ears'   },
];

/**
 * dB is an input, never an output. It picks a level and then disappears —
 * the interface shows colour and word, never a number.
 *
 * These are the app's own SoundCategory bands, declared in src/types.ts
 * (45 / 65 / 78 / 88). They are not tuned for how the map looks. An earlier
 * version moved them to spread the picture across more colours; that was
 * choosing thresholds to flatter the design, so it is reverted.
 */
export const LEVEL_EDGES = [45, 65, 78, 88];

export function levelFromDb(db: number): number {
  for (let i = 0; i < LEVEL_EDGES.length; i++) {
    if (db < LEVEL_EDGES[i]) return i;
  }
  return LEVELS.length - 1;
}

export const DESIGN = {
  grid: {
    /** paper graph-grid cell, in screen px — the texture from the reference */
    fine: 18,
    /** the paper grid is barely there */
    fineAlpha: 0.15,
    /** The plate is white; the paper tone is a wash laid over it, above the
        city tiles and below the grid. Map background #FFFFFF, overlay #FFFCF3. */
    paperWash: 0.5,
    /** the real city map underneath, held back so the grid can lead */
    cityOpacity: 0.4,
    /** ...but brought forward as you zoom in, because then you are navigating
        and the street names have to be readable through the sound field */
    cityOpacityNear: 0.9,
    cityNearZoomLow: 13,
    cityNearZoomHigh: 17,
  },

  /**
   * LOUDNESS AS PIXELS.
   * Two rules hold the whole thing together:
   *   PROPORTION IS DATA — how many cells of each colour is fixed by the
   *     measurement and never drifts. The majority colour is the level.
   *   ARRANGEMENT IS GENERATIVE — which cells get which colour is decided by
   *     animated noise, so the field is never still and never repeats.
   */
  pixels: {
    /** How many pixels fit across one grid cell. The pixel stays an exact
        subdivision, so grid and pixels can never drift apart. Raise it for a
        finer swarm; the cell is snapped to a multiple of this. */
    subdiv: 5,
    /** spatial frequency of the colour fields — lower = bigger clusters */
    freq: 0.11,
    /** frequency of the edge dither */
    edgeFreq: 0.18,
    /** How far the arrangement moves per step, and how often it steps.
        Finer increments taken more often: the field travels at about the same
        rate as before but stops lurching between poses. Still stepped rather
        than continuous — these are pixels, and they should land on frames. */
    drift: 0.085,
    fps: 14,

    /** A second, finer octave running faster than the first. One scale of
        motion reads mechanical; two reads like something breathing. Big shapes
        drift slowly while small detail stirs on top of them. */
    octave: { mix: 0.35, scale: 2.3, speed: 1.7 },

    /** THE SWARM.
        The field does not only evolve in place, it travels. Sampling the noise
        at coordinates that slide over time makes the pattern drift bodily
        across the zone — pixels appear to move together with local coherence
        rather than blinking independently, the way a swarm holds shape while
        every insect in it is doing its own thing. Each zone gets its own
        heading from its seed, so no two drift in step. */
    flow: 0.05,
    /** dither softness where the field frays into the paper */
    edge: 0.55,
    /** above this many cells, every level shows at least one pixel */
    trace: 40,
    /** guard against absurd cell counts at max zoom */
    maxCells: 9000,
  },

  /**
   * WHAT IS MEASURED, AND NOTHING ELSE.
   *
   * There are 33 measured zones. There is no measurement of the ground
   * between them, so nothing is drawn there — bare grid and street map means
   * "no reading", not "quiet". An earlier version covered the whole map by
   * inventing a city-wide baseline, a per-pixel shimmer and a per-zone pulse.
   * All three were fabricated, so all three are gone, and the map is emptier
   * for it. That emptiness is the honest picture of this dataset.
   *
   * What is still a modelling choice, stated plainly:
   *   - inside a zone, dB is interpolated between its two measured values,
   *     peakDecibels at the core and baseDecibels at the measured radius;
   *   - outside the measured radius, nothing.
   */
  field: {
    /** how much paper the pixels take: a visual encoding of a real dB */
    quietDb: 38,
    loudDb: 100,
    minCoverage: 0.22,
    maxCoverage: 1.0,
    curve: 1.15,
  },

  dissolve: {
    /** the clearing that travels with you, in metres */
    youRadiusMeters: 110,
    /** fraction of the radius that is fully cleared */
    youInner: 0.18,
    /** multiplier on each zone's own radius */
    loudScale: 1.0,
    loudInner: 0.3,
    /** zones smaller than this on screen are not worth drawing */
    minScreenRadius: 8,
  },
} as const;
