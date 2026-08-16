# QUIET — the design layer

Everything visual lives in these three files. They have no dependency on the
rest of the app except Leaflet, and nothing outside them hard-codes a colour.

| file | what it is |
|---|---|
| `tokens.ts` | the design system: colours, the five loudness levels, all tuning numbers |
| `loudnessField.ts` | the generative pixel engine — pure functions, no React, no DOM |
| `QuietMapLayer.ts` | the Leaflet canvas overlay that draws grid + pixels on the real map |

Plus `src/index.css`, which remaps the app's Tailwind palette to paper and ink.

---

## The idea

The city is a grid — stable, quiet, infrastructural. Sound is what disturbs it.
Where there is sound the grid gives way, and the room it leaves is filled with
the colour of that loudness. You are a hole in the drawing, not a pin on it.

## The one rule that matters

The loudness field splits cleanly in two, and the split is the whole design:

- **Proportion is data.** How many pixels of each colour is computed from the
  measurement by `allocate()` and held exactly. It never drifts. The majority
  colour *is* the level.
- **Arrangement is generative.** *Which* pixels get which colour is decided by
  animated 3D value noise, re-rolled 7 times a second.

So the field is vivid and never repeats, while staying honest about the reading.
If you change one thing in here, don't change that.

## The five levels

Defined once, in `tokens.ts`:

| | colour | meaning |
|---|---|---|
| 1 | `#E4ECF2` | quiet |
| 2 | `#FFD6FF` | quiet, with some sound artifact |
| 3 | `#87A5FF` | loud |
| 4 | `#FF4938` | very loud |
| 5 | `#60545A` | too loud — bad for your ears |

`LEVEL_EDGES` maps dB onto them, aligned to the app's existing `SoundCategory`
bands so data and design agree on where a level ends.

**Numbers never reach the surface.** dB is an input; the interface shows a
colour and a word. Popups, markers and the meter all follow this.

## Alignment

The paper grid and the loudness pixels share one lattice. The pixel is exactly
one third of a grid cell (`DESIGN.pixels.cellScale = 1/3`), and both anchor to
`latticeOffset()` against the map's own pixel space. That means:

- a pixel edge always lands on a grid line,
- the grid stays pinned to the city as you pan rather than sliding with the screen,
- changing `DESIGN.grid.fine` moves both together.

## Layer order on the map

1. real city tiles — `light_nolabels`, warmed by the `.quiet-tiles` CSS filter, held at 40%
2. paper grid at 15%
3. clearings — sound whites out the city and the grid beneath it
4. loudness pixels
5. routes, markers, you

## Tuning

Open `tokens.ts`. Useful knobs:

- `pixels.cellScale` — pixel size (as a fraction of the grid cell)
- `pixels.freq` — cluster size; lower means bigger blobs
- `pixels.drift` / `pixels.fps` — how far the arrangement jumps, and how often
- `pixels.decay` — how much the neighbouring levels bleed into a mix
- `dissolve.youRadiusMeters` — the size of your clearing
- `grid.fineAlpha` / `grid.cityOpacity` — 0.15 and 0.4

## Thumbnails

`node scripts/generate-thumbnails.mjs` regenerates `assets/thumbnails/*.svg`
from these same rules, so cover art can't drift from the product. Deterministic
— re-running produces identical files.
