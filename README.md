# LLLoud 🤫 — Sound-Aware Pedestrian Navigation for New York City

LLLoud is a premium, sound-aware pedestrian routing and mapping application that calculates footpaths based on the acoustic health of New York City streets. Instead of just optimization for speed, LLLoud models the city's real-time noise levels and guides walkers through calm corridors, tree-lined side streets, and quiet havens, helping them avoid construction noise, subway screeches, and traffic sirens.

---

## 🌟 Key Features

1. **Fastest vs. No Noise Routes**: Simplifies decision making to two direct pedestrian paths:
   - **Fastest Route** (Pink ⚡): The direct path optimized purely for distance and walking time.
   - **No Noise Route** (Cyan 🛡️): A customized detour path that avoids areas of elevated decibels, community noise reports, and active 311 hotspots.
2. **Generative Sound Field Layer**: Rendered dynamically using an advanced overlay canvas on top of a light base map. It projects estimated decibel fields as glowing heat fields onto the paper street grids, offering a continuous representation of NYC's noise footprint.
3. **Interactive Community Reports**: Walkers can log live hazards (construction, sirens, screeching tracks, loud nightlife) directly from the map. The map automatically pans, zooms, and launches detail popups for new community reports, painting a visual glow around them.
4. **Deep NYC Open Data Integration**: Dynamically monitors and acts on active 311 noise complaints filed across all five boroughs.

---

## 📊 NYC Open Data Integration (Socrata Open Data API)

LLLoud puts **NYC Open Data** at the core of its routing decisions. The application interfaces directly with the official NYC Socrata platform to retrieve, parse, and incorporate live sound density indicators:

### 1. Direct 311 Service Requests Querying
LLLoud queries the live **311 Service Requests** dataset (`erm2-nwe9`) in real time. We fetch the latest active complaints using SODA (Socrata Open Data API) queries structured as follows:

```http
GET https://data.cityofnewyork.us/resource/erm2-nwe9.json
    ?$where=starts_with(complaint_type, 'Noise') AND latitude IS NOT NULL
    &$order=created_date DESC
    &$limit=75
```

### 2. Acoustic Level Mapping
Since 311 logs do not contain raw decibel measurements, LLLoud uses a heuristic parser in [`src/utils/nycOpenData.ts`](file:///Users/jonathandavid/Documents/GitHub/LLLoud-main/src/utils/nycOpenData.ts) that maps descriptors to estimated decibel footprints:
- **Construction & Jackhammering**: Mapped to **88–95 dB** (high penalty; routing detours aggressively around these coordinates).
- **Subway Screech & Track Noise**: Mapped to **85 dB** (medium-high penalty).
- **Horns, Exhausts & Vehicles**: Mapped to **82 dB** (medium-high penalty).
- **Nightlife & Commercial Loud Music**: Mapped to **78–88 dB** (medium penalty).
- **Other Noise Complaints**: Defaulted to **72–76 dB**.

### 3. OpenData Record Permalinks
Every NYC 311 complaint rendered on the map is fully inspectable. Users can click on a complaint marker to read details (complaint type, borough, description, timestamp) and click a direct API permalink to view the official raw Socrata JSON payload:
```http
https://data.cityofnewyork.us/resource/erm2-nwe9.json?unique_key={unique_key}
```

### 4. Robust Offline Fallbacks
To ensure uninterrupted functionality, LLLoud maintains a high-fidelity offline baseline dataset of verified NYC 311 noise complaints. If the Socrata endpoint times out or experiences throttling, the app seamlessly falls back to local records to keep routing computations active.

---

## 🛠️ Technology Stack

- **Framework**: React 18, Vite, TypeScript
- **Mapping & Overlay Rendering**: 
  - [Leaflet.js](https://leafletjs.com/) for interactive map containers, navigation pins, and hazard markers.
  - Custom dynamic Canvas class `QuietMapLayer` to paint generative soundscapes utilizing math utilities (`clamp`, `smoothstep`).
- **Pedestrian Routing Engine**: Built on the [Valhalla Routing API](https://github.com/valhalla/valhalla) with customized walking penalty metrics to deter footpaths from intersecting noisy coordinates.
- **Styling**: Vanilla CSS combined with TailwindCSS for responsive layouts and HUD cards.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have Node.js (v18+) and npm installed.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/jonathandavid/LLLoud-main.git
   cd LLLoud-main
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
4. Build the production application:
   ```bash
   npm run build
   ```
