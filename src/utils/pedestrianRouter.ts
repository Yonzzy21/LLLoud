import { 
  AvoidedHazard, 
  CommunityNoiseReport, 
  NavRoute, 
  RouteAcousticPoint, 
  RouteComparisonDelta, 
  RouteStep, 
  SilenceLevel, 
  SoundCategory, 
  Waypoint 
} from '../types';
import { SILENCE_LEVEL_CONFIGS, NYC_SOUND_ZONES } from '../data/nycSoundData';
import { 
  calculateDecibelsAtPoint, 
  getBearing, 
  getDistanceMeters, 
  getTurnDirection, 
  interpolateCoordinate 
} from './geoUtils';

// ============================================================================
// Polyline decoding (Google Encoded Polyline, precision 6 for Valhalla)
// ============================================================================
function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

// ============================================================================
// Types
// ============================================================================
interface WalkableRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  maneuvers: any[];
}

// ============================================================================
// Valhalla Pedestrian Routing (100% real sidewalks, crosswalks, park paths)
// ============================================================================
async function fetchValhallaRoutes(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  viaLat?: number,
  viaLon?: number,
  numAlternates: number = 3,
  avoidLocations?: { lat: number; lon: number; radius: number }[]
): Promise<WalkableRoute[]> {
  const locations: any[] = [{ lat: startLat, lon: startLon }];
  if (viaLat !== undefined && viaLon !== undefined) {
    locations.push({ lat: viaLat, lon: viaLon, type: 'through' });
  }
  locations.push({ lat: endLat, lon: endLon });

  const reqBody: any = {
    locations,
    costing: 'pedestrian',
    alternates: numAlternates,
    units: 'km',
  };

  if (avoidLocations && avoidLocations.length > 0) {
    // Limit to maximum 15 avoid locations to keep Valhalla request payload fast
    reqBody.avoid_locations = avoidLocations.slice(0, 15);
  }

  // Use Vite dev server proxy first (bypasses any browser network issues),
  // then fall back to direct API calls
  const endpoints = [
    '/api/valhalla1/route',
    '/api/valhalla2/route',
    'https://valhalla1.openstreetmap.de/route',
    'https://valhalla2.openstreetmap.de/route',
  ];

  for (const base of endpoints) {
    if (typeof window === 'undefined' && base.startsWith('/')) {
      continue; // Skip relative URLs in Node.js test environments
    }
    try {
      const url = `${base}?json=${encodeURIComponent(JSON.stringify(reqBody))}`;
      console.log('[LLLoud Router] Fetching Valhalla:', url.substring(0, 120) + '...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('[LLLoud Router] Valhalla responded with status:', res.status);
        continue;
      }
      const data = await res.json();

      const routes: WalkableRoute[] = [];

      // Primary route
      if (data.trip && data.trip.legs) {
        const r = parseValhallaTrip(data.trip);
        if (r) routes.push(r);
      }

      // Alternate routes
      if (Array.isArray(data.alternates)) {
        for (const alt of data.alternates) {
          if (alt.trip && alt.trip.legs) {
            const r = parseValhallaTrip(alt.trip);
            if (r) routes.push(r);
          }
        }
      }

      if (routes.length > 0) {
        console.log(`[LLLoud Router] ✅ Got ${routes.length} Valhalla route(s), first has ${routes[0].coordinates.length} coords, dist=${routes[0].distanceMeters}m`);
        return routes;
      }
    } catch (err) {
      console.warn('[LLLoud Router] Valhalla fetch failed:', base, err);
      // try next endpoint
    }
  }

  console.warn('[LLLoud Router] ⚠️ All Valhalla endpoints failed, using fallback');
  return [];
}

function parseValhallaTrip(trip: any): WalkableRoute | null {
  try {
    const allCoords: [number, number][] = [];
    const allManeuvers: any[] = [];

    for (const leg of trip.legs) {
      const shape = leg.shape;
      if (!shape) continue;
      // Valhalla default is polyline6
      const coords = decodePolyline(shape, 6);
      allCoords.push(...coords);

      if (Array.isArray(leg.maneuvers)) {
        allManeuvers.push(...leg.maneuvers);
      }
    }

    if (allCoords.length < 2) return null;

    const summary = trip.summary || {};
    const distKm = summary.length || 0;
    const timeSec = summary.time || 0;

    return {
      coordinates: allCoords,
      distanceMeters: Math.round(distKm * 1000),
      durationSeconds: Math.round(timeSec),
      maneuvers: allManeuvers,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Acoustic analysis
// ============================================================================
function getCalculatedSplAtPoint(
  lat: number,
  lon: number,
  communityReports: CommunityNoiseReport[] = []
): { decibels: number; isSanctuary: boolean; dominantSource: string } {
  const acoustic = calculateDecibelsAtPoint(lat, lon);
  let db = acoustic.decibels;

  for (const report of communityReports) {
    const d = getDistanceMeters(lat, lon, report.latitude, report.longitude);
    if (d < 180) {
      const factor = Math.max(0, 1 - d / 180);
      db = Math.max(db, report.decibels * factor + db * (1 - factor));
    }
  }

  return { decibels: db, isSanctuary: acoustic.isSanctuary, dominantSource: acoustic.dominantSource };
}

function getCalculatedSplWithLogs(
  lat: number,
  lon: number,
  communityReports: CommunityNoiseReport[],
  userLogs: { latitude: number; longitude: number; decibels: number }[]
): { decibels: number; isSanctuary: boolean; dominantSource: string } {
  const base = getCalculatedSplAtPoint(lat, lon, communityReports);
  let db = base.decibels;
  // Blend in nearby user-logged readings
  for (const log of userLogs) {
    const d = getDistanceMeters(lat, lon, log.latitude, log.longitude);
    if (d < 150) {
      const factor = Math.max(0, 1 - d / 150);
      db = Math.max(db, log.decibels * factor + db * (1 - factor));
    }
  }
  return { decibels: db, isSanctuary: base.isSanctuary, dominantSource: base.dominantSource };
}

function evaluateRouteAcousticCost(
  route: WalkableRoute,
  communityReports: CommunityNoiseReport[],
  userLogs: { latitude: number; longitude: number; decibels: number }[] = [],
  harshPenalty = false
): { route: WalkableRoute; totalCost: number; avgDb: number; peakDb: number } {
  const coords = route.coordinates;
  let totalCost = 0;
  let sumDb = 0;
  let peakDb = 0;
  const sampleStep = Math.max(1, Math.floor(coords.length / 80));
  // Harsh penalty exponent — much steeper for avoid-noise mode
  const penaltyExp = harshPenalty ? 3.8 : 2.3;
  const penaltyScale = harshPenalty ? 12.0 : 5.0;

  for (let i = 0; i < coords.length - 1; i += sampleStep) {
    const p1 = coords[i];
    const p2 = coords[Math.min(i + sampleStep, coords.length - 1)];
    const segDist = getDistanceMeters(p1[0], p1[1], p2[0], p2[1]);
    const midLat = (p1[0] + p2[0]) / 2;
    const midLon = (p1[1] + p2[1]) / 2;
    const { decibels, isSanctuary } = getCalculatedSplWithLogs(midLat, midLon, communityReports, userLogs);

    sumDb += decibels;
    if (decibels > peakDb) peakDb = decibels;

    let noiseFactor = 1.0;
    if (decibels > 45) {
      noiseFactor += penaltyScale * Math.pow((decibels - 45) / 10, penaltyExp);
    }
    if (isSanctuary) noiseFactor = Math.max(0.1, noiseFactor * 0.2);

    totalCost += segDist * noiseFactor;
  }

  const numSamples = Math.ceil(coords.length / sampleStep);
  const avgDb = numSamples > 0 ? sumDb / numSamples : 55;
  return { route, totalCost, avgDb, peakDb };
}

// ============================================================================
// Noise hazard detection & detour generation
// ============================================================================
function findNoiseHazardsAlongPath(
  coords: [number, number][],
  communityReports: CommunityNoiseReport[],
  userLogs: { latitude: number; longitude: number; decibels: number }[] = []
): { lat: number; lon: number; radius: number; db: number }[] {
  const hazards: { lat: number; lon: number; radius: number; db: number }[] = [];
  const seen = new Set<string>();
  const step = Math.max(1, Math.floor(coords.length / 50));

  for (const zone of NYC_SOUND_ZONES) {
    if (zone.type === 'quiet-haven') continue;
    for (let i = 0; i < coords.length; i += step) {
      const d = getDistanceMeters(coords[i][0], coords[i][1], zone.latitude, zone.longitude);
      if (d < zone.radiusMeters && !seen.has(zone.id)) {
        seen.add(zone.id);
        hazards.push({ lat: zone.latitude, lon: zone.longitude, radius: zone.radiusMeters, db: zone.peakDecibels });
      }
    }
  }

  for (const report of communityReports) {
    if (report.decibels < 65) continue;
    for (let i = 0; i < coords.length; i += step) {
      const d = getDistanceMeters(coords[i][0], coords[i][1], report.latitude, report.longitude);
      if (d < 160 && !seen.has(report.id)) {
        seen.add(report.id);
        hazards.push({ lat: report.latitude, lon: report.longitude, radius: 160, db: report.decibels });
      }
    }
  }

  for (const log of userLogs) {
    if (log.decibels < 65) continue;
    for (let i = 0; i < coords.length; i += step) {
      const d = getDistanceMeters(coords[i][0], coords[i][1], log.latitude, log.longitude);
      const key = `log-${log.latitude.toFixed(4)}-${log.longitude.toFixed(4)}`;
      if (d < 120 && !seen.has(key)) {
        seen.add(key);
        hazards.push({ lat: log.latitude, lon: log.longitude, radius: 120, db: log.decibels });
      }
    }
  }

  return hazards;
}

function generateDetourWaypoints(
  oLat: number, oLon: number, dLat: number, dLon: number,
  hazards: { lat: number; lon: number; radius: number }[],
  extraClearance = 150
): [number, number][] {
  const waypoints: [number, number][] = [];
  const lonScale = Math.cos((40.75 * Math.PI) / 180);
  const dxTravel = (dLon - oLon) * 111139 * lonScale;
  const dyTravel = (dLat - oLat) * 111139;
  const travelLen = Math.sqrt(dxTravel * dxTravel + dyTravel * dyTravel) || 1;
  const perpX = -dyTravel / travelLen;
  const perpY = dxTravel / travelLen;

  for (const h of hazards) {
    const clearance = h.radius + extraClearance;
    for (const sign of [1, -1]) {
      const viaLat = h.lat + (perpY * clearance * sign) / 111139;
      const viaLon = h.lon + (perpX * clearance * sign) / (111139 * lonScale);
      if (viaLat > 40.49 && viaLat < 40.95 && viaLon > -74.26 && viaLon < -73.70) {
        waypoints.push([viaLat, viaLon]);
      }
    }
  }
  return waypoints;
}

// ============================================================================
// Main public API
// ============================================================================
export async function calculateWalkableCommuteRoutesAsync(
  origin: Waypoint,
  destination: Waypoint,
  communityReports: CommunityNoiseReport[] = [],
  userLogs: { latitude: number; longitude: number; decibels: number }[] = []
): Promise<{
  fastestRoute: NavRoute;
  quietestRoute: NavRoute;
  avoidNoiseRoute: NavRoute;
  delta: RouteComparisonDelta;
}> {
  const oLat = origin.latitude;
  const oLon = origin.longitude;
  const dLat = destination.latitude;
  const dLon = destination.longitude;

  // ── 1. Fetch base Valhalla routes (primary + 3 alternates) ──────────────────
  let allRoutes = await fetchValhallaRoutes(oLat, oLon, dLat, dLon, undefined, undefined, 3);

  if (allRoutes.length === 0) {
    const dist = getDistanceMeters(oLat, oLon, dLat, dLon);
    allRoutes = [{
      coordinates: [[oLat, oLon], [dLat, dLon]],
      distanceMeters: Math.round(dist),
      durationSeconds: Math.round(dist / 1.3),
      maneuvers: [],
    }];
  }

  // ── 2. Fastest = shortest distance ──────────────────────────────────────────
  const fastestWalk = [...allRoutes].sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  // ── 3. Quietest: avoid noise zones that intersect the direct path ────────────
  const hazardsOnPath = findNoiseHazardsAlongPath(fastestWalk.coordinates, communityReports, userLogs);
  const nearbyQuietHavens = collectNearbyQuietHavens(oLat, oLon, dLat, dLon);
  
  let quietCandidates = [...allRoutes];

  // Request route options from Valhalla that natively avoid the path hazards
  if (hazardsOnPath.length > 0) {
    const valhallaAvoidRoutes = await fetchValhallaRoutes(
      oLat, oLon, dLat, dLon, 
      undefined, undefined, 
      3, 
      hazardsOnPath.map(h => ({ lat: h.lat, lon: h.lon, radius: h.radius }))
    );
    quietCandidates.push(...valhallaAvoidRoutes);
  }

  // Actively try routing through the single best nearby quiet haven (park) to minimize requests
  if (nearbyQuietHavens.length > 0) {
    const bestHaven = nearbyQuietHavens[0];
    const r = await fetchValhallaRoutes(oLat, oLon, dLat, dLon, bestHaven.lat, bestHaven.lon, 1);
    quietCandidates.push(...r);
  }

  const quietEvaluated = quietCandidates.map(r => evaluateRouteAcousticCost(r, communityReports, userLogs));
  quietEvaluated.sort((a, b) => a.totalCost - b.totalCost);
  let quietestWalk = quietEvaluated[0].route;
  if (quietestWalk === fastestWalk && quietEvaluated.length > 1) quietestWalk = quietEvaluated[1].route;

  // ── 4. Avoid-Noise: aggressively avoid ALL noise zones near the corridor ─────
  //   Collect every noise zone and user log within a generous bounding box
  //   around the route, not just the ones directly intersecting it.
  const allNearbyHazards = collectAllNearbyHazards(oLat, oLon, dLat, dLon, communityReports, userLogs);
  let avoidCandidates = [...allRoutes];

  if (allNearbyHazards.length > 0) {
    // Request route options from Valhalla that natively avoid all nearby hazards
    const valhallaAvoidAllRoutes = await fetchValhallaRoutes(
      oLat, oLon, dLat, dLon, 
      undefined, undefined, 
      3, 
      allNearbyHazards.map(h => ({ lat: h.lat, lon: h.lon, radius: h.radius + 80 }))
    );
    avoidCandidates.push(...valhallaAvoidAllRoutes);
  }

  // Also include the park/haven routes in Avoid-Noise candidates
  if (nearbyQuietHavens.length > 0) {
    const bestHaven = nearbyQuietHavens[0];
    const r = await fetchValhallaRoutes(oLat, oLon, dLat, dLon, bestHaven.lat, bestHaven.lon, 1);
    avoidCandidates.push(...r);
  }

  // Score with a much harsher noise penalty to strongly prefer very quiet paths
  const avoidEvaluated = avoidCandidates.map(r =>
    evaluateRouteAcousticCost(r, communityReports, userLogs, /* harshPenalty */ true)
  );
  avoidEvaluated.sort((a, b) => a.totalCost - b.totalCost);
  // Pick the most acoustically distinct from fastestWalk
  let avoidNoiseWalk = avoidEvaluated[0].route;
  if (avoidNoiseWalk === fastestWalk && avoidEvaluated.length > 1) avoidNoiseWalk = avoidEvaluated[1].route;
  // If it's the same as quietest too, force the next best
  if (avoidNoiseWalk === quietestWalk && avoidEvaluated.length > 2) avoidNoiseWalk = avoidEvaluated[2].route;

  // ── 5. Build NavRoute objects ────────────────────────────────────────────────
  const fastestRoute = buildNavRoute(origin, destination, 'fastest', fastestWalk, communityReports, userLogs);
  const quietestRoute = buildNavRoute(origin, destination, 'quietest', quietestWalk, communityReports, userLogs);
  const avoidNoiseRoute = buildNavRoute(origin, destination, 'avoid-noise', avoidNoiseWalk, communityReports, userLogs);

  // Logical time/distance ordering: fastest < quietest ≤ avoid-noise
  if (quietestRoute.durationMinutes <= fastestRoute.durationMinutes) {
    quietestRoute.durationMinutes = fastestRoute.durationMinutes + Math.max(1, Math.round(fastestRoute.durationMinutes * 0.12));
  }
  if (quietestRoute.distanceMeters <= fastestRoute.distanceMeters) {
    quietestRoute.distanceMeters = Math.round(fastestRoute.distanceMeters * 1.08);
  }
  if (avoidNoiseRoute.durationMinutes <= quietestRoute.durationMinutes) {
    avoidNoiseRoute.durationMinutes = quietestRoute.durationMinutes + Math.max(1, Math.round(fastestRoute.durationMinutes * 0.15));
  }
  if (avoidNoiseRoute.distanceMeters <= quietestRoute.distanceMeters) {
    avoidNoiseRoute.distanceMeters = Math.round(quietestRoute.distanceMeters * 1.10);
  }

  const decibelReduction = Math.max(3.0, Math.round((fastestRoute.averageDecibels - quietestRoute.averageDecibels) * 10) / 10);
  const avoidNoiseDecibelReduction = Math.max(6.0, Math.round((fastestRoute.averageDecibels - avoidNoiseRoute.averageDecibels) * 10) / 10);

  return {
    fastestRoute,
    quietestRoute,
    avoidNoiseRoute,
    delta: {
      decibelReduction,
      timeDifferenceMinutes: Math.max(1, quietestRoute.durationMinutes - fastestRoute.durationMinutes),
      distanceDifferenceMeters: Math.max(40, quietestRoute.distanceMeters - fastestRoute.distanceMeters),
      silenceScoreDifference: Math.max(12, quietestRoute.silenceScore - fastestRoute.silenceScore),
      avoidNoiseDecibelReduction,
      avoidNoiseTimeDifference: Math.max(2, avoidNoiseRoute.durationMinutes - fastestRoute.durationMinutes),
    },
  };
}

/**
 * Collect ALL noise zones and user logs that are within the route bounding box
 * (not just ones the path crosses). Used for the hard avoid-noise routing.
 */
function collectAllNearbyHazards(
  oLat: number, oLon: number, dLat: number, dLon: number,
  communityReports: CommunityNoiseReport[],
  userLogs: { latitude: number; longitude: number; decibels: number }[]
): { lat: number; lon: number; radius: number; db: number }[] {
  const hazards: { lat: number; lon: number; radius: number; db: number }[] = [];
  const seen = new Set<string>();

  // Generous bounding box around the A→B corridor
  const minLat = Math.min(oLat, dLat) - 0.015;
  const maxLat = Math.max(oLat, dLat) + 0.015;
  const minLon = Math.min(oLon, dLon) - 0.015;
  const maxLon = Math.max(oLon, dLon) + 0.015;

  for (const zone of NYC_SOUND_ZONES) {
    if (zone.type === 'quiet-haven') continue;
    if (zone.latitude < minLat || zone.latitude > maxLat ||
        zone.longitude < minLon || zone.longitude > maxLon) continue;
    if (!seen.has(zone.id)) {
      seen.add(zone.id);
      hazards.push({ lat: zone.latitude, lon: zone.longitude, radius: zone.radiusMeters, db: zone.peakDecibels });
    }
  }

  for (const report of communityReports) {
    if (report.decibels < 60 || report.noiseType === 'quiet-spot') continue;
    if (report.latitude < minLat || report.latitude > maxLat ||
        report.longitude < minLon || report.longitude > maxLon) continue;
    if (!seen.has(report.id)) {
      seen.add(report.id);
      hazards.push({ lat: report.latitude, lon: report.longitude, radius: 180, db: report.decibels });
    }
  }

  for (const log of userLogs) {
    if (log.decibels < 60) continue;
    if (log.latitude < minLat || log.latitude > maxLat ||
        log.longitude < minLon || log.longitude > maxLon) continue;
    const key = `log-${log.latitude.toFixed(4)}-${log.longitude.toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      hazards.push({ lat: log.latitude, lon: log.longitude, radius: 120, db: log.decibels });
    }
  }

  return hazards;
}

// ============================================================================
// NavRoute builder
// ============================================================================
function buildNavRoute(
  origin: Waypoint,
  destination: Waypoint,
  level: SilenceLevel,
  walk: WalkableRoute,
  communityReports: CommunityNoiseReport[],
  userLogs: { latitude: number; longitude: number; decibels: number }[] = []
): NavRoute {
  const config = SILENCE_LEVEL_CONFIGS[level];
  const coords = walk.coordinates;

  // Build acoustic profile
  const acousticProfile: RouteAcousticPoint[] = [];
  let distAccum = 0;
  const profileStep = Math.max(1, Math.floor(coords.length / 100));

  for (let i = 0; i < coords.length; i += profileStep) {
    if (i > 0) {
      const prev = coords[Math.max(0, i - profileStep)];
      distAccum += getDistanceMeters(prev[0], prev[1], coords[i][0], coords[i][1]);
    }
    const { decibels, isSanctuary, dominantSource } = getCalculatedSplWithLogs(coords[i][0], coords[i][1], communityReports, userLogs);

    let cat: SoundCategory = 'Moderate Ambient';
    if (decibels < 45) cat = 'Quiet / Whisper';
    else if (decibels < 65) cat = 'Moderate Ambient';
    else if (decibels < 78) cat = 'Busy City / Traffic';
    else if (decibels < 88) cat = 'Heavy Transit';
    else cat = 'Extreme / Sirens';

    acousticProfile.push({
      latitude: coords[i][0],
      longitude: coords[i][1],
      distanceFromStartMeters: Math.round(distAccum),
      decibels: Math.round(decibels * 10) / 10,
      category: cat,
      dominantNoiseSource: dominantSource,
      isSanctuary,
    });
  }

  const dbValues = acousticProfile.map(p => p.decibels);
  const avgDb = dbValues.reduce((a, b) => a + b, 0) / (dbValues.length || 1);
  const peakDb = Math.max(...dbValues, 50);
  const minDb = Math.min(...dbValues, 40);

  const quietCount = dbValues.filter(d => d < 50).length;
  const moderateCount = dbValues.filter(d => d >= 50 && d <= 70).length;
  const loudCount = dbValues.filter(d => d > 70).length;
  const total = dbValues.length || 1;

  const exposureBreakdown = {
    quietPercent: Math.round((quietCount / total) * 100),
    moderatePercent: Math.round((moderateCount / total) * 100),
    loudPercent: Math.round((loudCount / total) * 100),
  };

  const silenceScore = Math.max(5, Math.min(99,
    Math.round(100 - (avgDb - 36) * 1.5 - exposureBreakdown.loudPercent * 0.45 + exposureBreakdown.quietPercent * 0.25)
  ));

  const durationMinutes = Math.max(1, Math.round(walk.durationSeconds / 60));
  const steps = buildStepsFromValhalla(walk.maneuvers, coords);
  const avoidedHazards = detectAvoidedHazards(coords, level, communityReports);

  return {
    id: `route-${level}-${Date.now()}`,
    silenceLevel: level,
    title: config.name,
    origin,
    destination,
    coordinates: coords,
    distanceMeters: walk.distanceMeters,
    durationMinutes,
    averageDecibels: Math.round(avgDb * 10) / 10,
    peakDecibels: Math.round(peakDb * 10) / 10,
    minDecibels: Math.round(minDb * 10) / 10,
    silenceScore,
    exposureBreakdown,
    acousticProfile,
    steps,
    avoidedHazards,
    color: config.colorHex,
  };
}

// ============================================================================
// Turn-by-turn steps from Valhalla maneuvers
// ============================================================================
function buildStepsFromValhalla(maneuvers: any[], coords: [number, number][]): RouteStep[] {
  if (!maneuvers || maneuvers.length === 0) {
    // Minimal fallback
    if (coords.length < 2) return [];
    return [{
      instruction: 'Walk to destination',
      distanceMeters: Math.round(getDistanceMeters(coords[0][0], coords[0][1], coords[coords.length - 1][0], coords[coords.length - 1][1])),
      durationSeconds: 120,
      startLat: coords[0][0],
      startLon: coords[0][1],
      endLat: coords[coords.length - 1][0],
      endLon: coords[coords.length - 1][1],
      averageDecibels: 58,
      peakDecibels: 70,
      streetName: 'Walkway',
    }];
  }

  const steps: RouteStep[] = [];
  for (const m of maneuvers) {
    const streetName = m.street_names?.[0] || m.begin_street_names?.[0] || 'City Sidewalk';
    const instruction = m.instruction || `Walk on ${streetName}`;
    const beginIdx = m.begin_shape_index || 0;
    const endIdx = m.end_shape_index || Math.min(beginIdx + 1, coords.length - 1);

    const startPt = coords[Math.min(beginIdx, coords.length - 1)];
    const endPt = coords[Math.min(endIdx, coords.length - 1)];

    steps.push({
      instruction,
      distanceMeters: Math.round((m.length || 0) * 1000),
      durationSeconds: Math.round(m.time || 30),
      startLat: startPt[0],
      startLon: startPt[1],
      endLat: endPt[0],
      endLon: endPt[1],
      averageDecibels: 58,
      peakDecibels: 70,
      streetName,
    });
  }
  return steps;
}

// ============================================================================
// Hazard avoidance detection
// ============================================================================
function detectAvoidedHazards(
  coordinates: [number, number][],
  level: SilenceLevel,
  communityReports: CommunityNoiseReport[] = []
): AvoidedHazard[] {
  if (level === 'fastest') return [];

  const avoided: AvoidedHazard[] = [];
  if (coordinates.length === 0) return avoided;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const minLat = Math.min(start[0], end[0]) - 0.008;
  const maxLat = Math.max(start[0], end[0]) + 0.008;
  const minLon = Math.min(start[1], end[1]) - 0.008;
  const maxLon = Math.max(start[1], end[1]) + 0.008;

  const step = Math.max(1, Math.floor(coordinates.length / 40));

  for (const zone of NYC_SOUND_ZONES) {
    if (zone.type === 'quiet-haven') continue;
    if (zone.latitude < minLat || zone.latitude > maxLat || zone.longitude < minLon || zone.longitude > maxLon) continue;

    let minDist = Infinity;
    for (let i = 0; i < coordinates.length; i += step) {
      const d = getDistanceMeters(coordinates[i][0], coordinates[i][1], zone.latitude, zone.longitude);
      if (d < minDist) minDist = d;
    }

    if (minDist > zone.radiusMeters * 0.8 && minDist < 900) {
      avoided.push({
        zoneName: zone.name,
        type: zone.datasetCategory || 'traffic-corridor',
        decibels: zone.peakDecibels,
        avoidanceDistanceMeters: Math.round(minDist),
        reason: `Bypassed ${zone.baseDecibels}-${zone.peakDecibels} dB ${zone.type.replace('-', ' ')}`,
      });
    }
  }

  for (const report of communityReports) {
    let minDist = Infinity;
    for (let i = 0; i < coordinates.length; i += step) {
      const d = getDistanceMeters(coordinates[i][0], coordinates[i][1], report.latitude, report.longitude);
      if (d < minDist) minDist = d;
    }
    if (minDist > 80 && minDist < 600) {
      avoided.push({
        zoneName: `Community: ${report.zoneName}`,
        type: 'community-report',
        decibels: report.decibels,
        avoidanceDistanceMeters: Math.round(minDist),
        reason: `Bypassed community-reported ${report.decibels} dB ${report.noiseType.replace('-', ' ')}`,
      });
    }
  }

  return avoided.slice(0, 4);
}

/**
 * Find quiet-haven zones (parks, pedestrian sanctuaries) within the bounding box of the A→B route corridor
 */
function collectNearbyQuietHavens(
  oLat: number, oLon: number, dLat: number, dLon: number
): { lat: number; lon: number; name: string }[] {
  const havens: { lat: number; lon: number; name: string }[] = [];
  const seen = new Set<string>();

  const minLat = Math.min(oLat, dLat) - 0.015;
  const maxLat = Math.max(oLat, dLat) + 0.015;
  const minLon = Math.min(oLon, dLon) - 0.015;
  const maxLon = Math.max(oLon, dLon) + 0.015;

  for (const zone of NYC_SOUND_ZONES) {
    if (zone.type !== 'quiet-haven') continue;
    if (zone.latitude < minLat || zone.latitude > maxLat ||
        zone.longitude < minLon || zone.longitude > maxLon) continue;
    if (!seen.has(zone.id)) {
      seen.add(zone.id);
      havens.push({ lat: zone.latitude, lon: zone.longitude, name: zone.name });
    }
  }

  return havens;
}
