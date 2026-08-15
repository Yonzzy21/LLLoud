import { Waypoint } from '../types';

export interface GeocodingResult {
  displayName: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  borough?: string;
  type?: string;
}

// Curated fast offline NYC Landmarks, Subways, Parks & Intersections
const NYC_LOCAL_PLACES: GeocodingResult[] = [
  // Manhattan
  { name: 'Times Square', displayName: 'Times Square (Broadway & 45th St), Manhattan', neighborhood: 'Midtown West', latitude: 40.7580, longitude: -73.9855, borough: 'Manhattan' },
  { name: 'Grand Central Terminal', displayName: 'Grand Central Terminal (89 E 42nd St), Manhattan', neighborhood: 'Midtown East', latitude: 40.7527, longitude: -73.9772, borough: 'Manhattan' },
  { name: 'Empire State Building', displayName: 'Empire State Building (350 5th Ave), Manhattan', neighborhood: 'Midtown', latitude: 40.7484, longitude: -73.9857, borough: 'Manhattan' },
  { name: 'Central Park The Ramble', displayName: 'Central Park (The Ramble Oasis), Manhattan', neighborhood: 'Central Park', latitude: 40.7766, longitude: -73.9690, borough: 'Manhattan' },
  { name: 'Central Park Conservatory', displayName: 'Central Park Conservatory Water (5th Ave & 72nd St)', neighborhood: 'Upper East Side', latitude: 40.7745, longitude: -73.9675, borough: 'Manhattan' },
  { name: 'Bryant Park', displayName: 'Bryant Park & NYPL (42nd St & 6th Ave), Manhattan', neighborhood: 'Midtown', latitude: 40.7536, longitude: -73.9832, borough: 'Manhattan' },
  { name: 'Union Square', displayName: 'Union Square (14th St & Broadway), Manhattan', neighborhood: 'Union Square', latitude: 40.7359, longitude: -73.9911, borough: 'Manhattan' },
  { name: 'Washington Square Park', displayName: 'Washington Square Park (Greenwich Village), Manhattan', neighborhood: 'Greenwich Village', latitude: 40.7308, longitude: -73.9973, borough: 'Manhattan' },
  { name: 'The High Line (Chelsea)', displayName: 'The High Line (10th Ave & W 20th St), Manhattan', neighborhood: 'Chelsea', latitude: 40.7454, longitude: -74.0049, borough: 'Manhattan' },
  { name: 'Hudson Yards', displayName: 'Hudson Yards / The Vessel (33rd St & 10th Ave)', neighborhood: 'Hudson Yards', latitude: 40.7538, longitude: -74.0022, borough: 'Manhattan' },
  { name: 'Penn Station / MSG', displayName: 'Penn Station / Madison Square Garden (34th & 7th Ave)', neighborhood: 'Midtown West', latitude: 40.7505, longitude: -73.9934, borough: 'Manhattan' },
  { name: 'World Trade Center / Oculus', displayName: 'One World Trade Center & Oculus (Fulton St)', neighborhood: 'Financial District', latitude: 40.7128, longitude: -74.0134, borough: 'Manhattan' },
  { name: 'Wall Street / NY Stock Exchange', displayName: 'Wall Street & Broad St (Stock Exchange), Manhattan', neighborhood: 'Financial District', latitude: 40.7069, longitude: -74.0090, borough: 'Manhattan' },
  { name: 'SoHo Broadway Shopping', displayName: 'SoHo (Broadway & Prince St), Manhattan', neighborhood: 'SoHo', latitude: 40.7247, longitude: -73.9984, borough: 'Manhattan' },
  { name: 'Lower East Side (Ludlow St)', displayName: 'Lower East Side (Ludlow & Stanton St), Manhattan', neighborhood: 'Lower East Side', latitude: 40.7218, longitude: -73.9878, borough: 'Manhattan' },
  { name: 'St. Marks Place', displayName: 'St. Marks Place & 2nd Ave (East Village), Manhattan', neighborhood: 'East Village', latitude: 40.7291, longitude: -73.9885, borough: 'Manhattan' },
  { name: 'The Cloisters (Fort Tryon)', displayName: 'The Met Cloisters (99 Margaret Corbin Dr), Manhattan', neighborhood: 'Washington Heights', latitude: 40.8649, longitude: -73.9317, borough: 'Manhattan' },
  { name: 'Columbia University', displayName: 'Columbia University (116th St & Broadway), Manhattan', neighborhood: 'Morningside Heights', latitude: 40.8075, longitude: -73.9626, borough: 'Manhattan' },
  { name: 'Harlem 125th St Station', displayName: 'Harlem 125th St & St. Nicholas Ave, Manhattan', neighborhood: 'Harlem', latitude: 40.8105, longitude: -73.9525, borough: 'Manhattan' },
  { name: 'Roosevelt Island Tramway', displayName: 'Roosevelt Island Tramway & FDR Four Freedoms', neighborhood: 'Roosevelt Island', latitude: 40.7510, longitude: -73.9585, borough: 'Manhattan' },

  // Brooklyn
  { name: 'DUMBO Waterfront', displayName: 'DUMBO (Water St & Washington St), Brooklyn', neighborhood: 'DUMBO', latitude: 40.7038, longitude: -73.9896, borough: 'Brooklyn' },
  { name: 'Brooklyn Heights Promenade', displayName: 'Brooklyn Heights Promenade (Remsen St), Brooklyn', neighborhood: 'Brooklyn Heights', latitude: 40.6974, longitude: -73.9972, borough: 'Brooklyn' },
  { name: 'Barclays Center / Atlantic Terminal', displayName: 'Barclays Center (620 Atlantic Ave), Brooklyn', neighborhood: 'Downtown Brooklyn', latitude: 40.6826, longitude: -73.9754, borough: 'Brooklyn' },
  { name: 'Williamsburg Bedford Ave', displayName: 'Bedford Ave & N 6th St, Williamsburg, Brooklyn', neighborhood: 'Williamsburg', latitude: 40.7183, longitude: -73.9576, borough: 'Brooklyn' },
  { name: 'Brooklyn Botanic Garden', displayName: 'Brooklyn Botanic Garden (990 Washington Ave), Brooklyn', neighborhood: 'Crown Heights', latitude: 40.6677, longitude: -73.9634, borough: 'Brooklyn' },
  { name: 'Prospect Park Long Meadow', displayName: 'Prospect Park (Grand Army Plaza Entrance), Brooklyn', neighborhood: 'Park Slope', latitude: 40.6728, longitude: -73.9698, borough: 'Brooklyn' },
  { name: 'Green-Wood Cemetery', displayName: 'Green-Wood Cemetery (500 25th St), Brooklyn', neighborhood: 'Sunset Park', latitude: 40.6582, longitude: -73.9942, borough: 'Brooklyn' },
  { name: 'Bushwick Troutman Corridor', displayName: 'Bushwick (Troutman St & Wyckoff Ave), Brooklyn', neighborhood: 'Bushwick', latitude: 40.7058, longitude: -73.9238, borough: 'Brooklyn' },

  // Queens
  { name: 'Gantry Plaza State Park', displayName: 'Gantry Plaza State Park (Center Blvd & 48th Ave), Queens', neighborhood: 'Long Island City', latitude: 40.7458, longitude: -73.9585, borough: 'Queens' },
  { name: 'Queens Plaza Subway Hub', displayName: 'Queens Plaza & Queens Blvd, Long Island City', neighborhood: 'Long Island City', latitude: 40.7495, longitude: -73.9370, borough: 'Queens' },
  { name: 'Astoria Steinway St', displayName: 'Steinway St & Broadway, Astoria, Queens', neighborhood: 'Astoria', latitude: 40.7588, longitude: -73.9189, borough: 'Queens' },
  { name: 'Flushing Main Street', displayName: 'Flushing Main St & Roosevelt Ave, Queens', neighborhood: 'Flushing', latitude: 40.7595, longitude: -73.8300, borough: 'Queens' },

  // Bronx & Staten Island
  { name: 'Yankee Stadium', displayName: 'Yankee Stadium (1 E 161st St), Bronx', neighborhood: 'Concourse', latitude: 40.8296, longitude: -73.9262, borough: 'Bronx' },
  { name: 'Wave Hill Public Garden', displayName: 'Wave Hill Public Garden (675 W 252nd St), Bronx', neighborhood: 'Riverdale', latitude: 40.8978, longitude: -73.9118, borough: 'Bronx' },
  { name: 'Fordham Rd & Grand Concourse', displayName: 'Fordham Rd & Grand Concourse, Bronx', neighborhood: 'Fordham', latitude: 40.8624, longitude: -73.8988, borough: 'Bronx' },
  { name: 'Snug Harbor Cultural Center', displayName: 'Snug Harbor (1000 Richmond Terrace), Staten Island', neighborhood: 'Livingston', latitude: 40.6433, longitude: -74.1023, borough: 'Staten Island' },
];

/**
 * Search NYC addresses with local landmark match + OpenStreetMap Photon geocoder fallback
 */
export async function searchNycAddresses(query: string): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim().toLowerCase();

  // 1. Check local fast curated NYC database
  const localMatches = NYC_LOCAL_PLACES.filter((p) =>
    p.name.toLowerCase().includes(cleanQuery) ||
    p.displayName.toLowerCase().includes(cleanQuery) ||
    p.neighborhood.toLowerCase().includes(cleanQuery) ||
    p.borough?.toLowerCase().includes(cleanQuery)
  );

  // 2. Fetch live online geocoder from Photon / OSM bounded strictly to NYC
  let onlineMatches: GeocodingResult[] = [];
  try {
    const nycLat = 40.7128;
    const nycLon = -74.0060;
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' New York')}&lat=${nycLat}&lon=${nycLon}&limit=6`;
    
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (response.ok) {
      const data = await response.json();
      if (data.features && Array.isArray(data.features)) {
        onlineMatches = data.features
          .filter((f: any) => {
            const coords = f.geometry?.coordinates;
            if (!coords) return false;
            const [lon, lat] = coords;
            // Bound strictly to NYC Metro box (Lat 40.49 to 40.92, Lon -74.26 to -73.68)
            return lat >= 40.48 && lat <= 40.94 && lon >= -74.28 && lon <= -73.68;
          })
          .map((f: any) => {
            const props = f.properties || {};
            const street = [props.housenumber, props.street || props.name].filter(Boolean).join(' ');
            const borough = props.district || props.city || 'NYC';
            const displayName = [street, borough, 'NY'].filter(Boolean).join(', ');

            return {
              name: props.name || street || displayName,
              displayName: displayName || props.name,
              neighborhood: props.district || props.suburb || borough,
              latitude: f.geometry.coordinates[1],
              longitude: f.geometry.coordinates[0],
              borough,
              type: props.osm_value,
            };
          });
      }
    }
  } catch (err) {
    // Online geocoder offline or timed out, fallback gracefully to local database
  }

  // Deduplicate results
  const combined = [...localMatches, ...onlineMatches];
  const seen = new Set<string>();
  const results: GeocodingResult[] = [];

  for (const item of combined) {
    const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(item);
    }
    if (results.length >= 7) break;
  }

  return results;
}

/**
 * Reverse geocode a latitude/longitude into a real readable NYC address
 */
export async function reverseGeocodeNyc(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LLLoud-NYC-Sound-Map/1.0' },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const streetPart = [addr.house_number, addr.road || addr.pedestrian || addr.suburb].filter(Boolean).join(' ');
      const neighborhood = addr.neighbourhood || addr.suburb || addr.city_district || '';
      if (streetPart) {
        return neighborhood ? `${streetPart} (${neighborhood})` : streetPart;
      }
    }
  } catch {
    // fallback
  }

  return `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`;
}
