import { NYC_NEIGHBORHOODS, NYC_SOUND_ZONES } from '../data/nycSoundData';
import { GeoLocationState, SoundCategory, SoundDensityZone } from '../types';

export class GeoManager {
  private watchId: number | null = null;
  private onLocationChange: ((state: GeoLocationState) => void) | null = null;
  private currentState: GeoLocationState = {
    latitude: 40.7580,
    longitude: -73.9855,
    accuracy: 10,
    timestamp: Date.now(),
    status: 'idle'
  };

  public getState(): GeoLocationState {
    return { ...this.currentState };
  }

  /**
   * Helper to fetch IP-based approximate location if GPS/secure context is restricted
   */
  public async fetchIpLocation(): Promise<GeoLocationState | null> {
    try {
      const endpoints = [
        'https://ipwho.is/',
        'https://ipapi.co/json/'
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const lat = Number(data.latitude || data.lat);
            const lon = Number(data.longitude || data.lon || data.lng);

            if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
              this.currentState = {
                latitude: lat,
                longitude: lon,
                accuracy: 1500,
                timestamp: Date.now(),
                status: 'granted',
                errorMessage: undefined,
              };
              if (this.onLocationChange) this.onLocationChange(this.currentState);
              return this.currentState;
            }
          }
        } catch {
          // try next endpoint
        }
      }
    } catch (e) {
      console.warn('IP location fetch failed:', e);
    }
    return null;
  }

  /**
   * Actively request user's current GPS position with high-accuracy + standard accuracy + IP fallback
   */
  public async requestCurrentPosition(): Promise<GeoLocationState> {
    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      console.warn('Browser requires HTTPS or localhost for GPS hardware access. Falling back to IP location...');
      const ipResult = await this.fetchIpLocation();
      if (ipResult) return ipResult;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const ipResult = await this.fetchIpLocation();
      if (ipResult) return ipResult;

      this.currentState = {
        ...this.currentState,
        status: 'unavailable',
        errorMessage: 'Geolocation is not supported by your browser.'
      };
      if (this.onLocationChange) this.onLocationChange(this.currentState);
      return this.currentState;
    }

    this.currentState = {
      ...this.currentState,
      status: 'prompt',
      errorMessage: undefined,
    };
    if (this.onLocationChange) this.onLocationChange(this.currentState);

    return new Promise<GeoLocationState>((resolve) => {
      // Step 1: Try high accuracy GPS
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentState = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            timestamp: position.timestamp,
            status: 'granted',
            errorMessage: undefined,
          };
          if (this.onLocationChange) this.onLocationChange(this.currentState);
          resolve(this.currentState);
        },
        (highAccError) => {
          console.warn('High accuracy geolocation timed out/failed, trying standard accuracy...', highAccError);
          
          // Check if blocked due to insecure origin
          const isSecureOriginError = 
            highAccError.message?.toLowerCase().includes('secure origins') || 
            highAccError.code === highAccError.PERMISSION_DENIED;

          // Step 2: Fallback to standard accuracy
          navigator.geolocation.getCurrentPosition(
            (stdPosition) => {
              this.currentState = {
                latitude: stdPosition.coords.latitude,
                longitude: stdPosition.coords.longitude,
                accuracy: Math.round(stdPosition.coords.accuracy),
                timestamp: stdPosition.timestamp,
                status: 'granted',
                errorMessage: undefined,
              };
              if (this.onLocationChange) this.onLocationChange(this.currentState);
              resolve(this.currentState);
            },
            async (stdError) => {
              console.warn('Standard geolocation failed, attempting IP fallback...', stdError);
              
              // Step 3: IP Location fallback
              const ipResult = await this.fetchIpLocation();
              if (ipResult) {
                resolve(ipResult);
                return;
              }

              let msg = 'Could not access device GPS.';
              if (stdError.code === stdError.PERMISSION_DENIED || isSecureOriginError) {
                msg = window.location.hostname !== 'localhost' && window.location.protocol !== 'https:'
                  ? 'Access app via http://localhost:3000 or HTTPS to enable GPS on mobile.'
                  : 'Location permission was denied. Please allow location in browser bar.';
              } else if (stdError.code === stdError.POSITION_UNAVAILABLE) {
                msg = 'GPS location unavailable. Please check device location services.';
              } else if (stdError.code === stdError.TIMEOUT) {
                msg = 'Location request timed out.';
              }

              this.currentState = {
                ...this.currentState,
                status: stdError.code === stdError.PERMISSION_DENIED ? 'denied' : 'unavailable',
                errorMessage: msg,
              };
              if (this.onLocationChange) this.onLocationChange(this.currentState);
              resolve(this.currentState);
            },
            {
              enableHighAccuracy: false,
              timeout: 6000,
              maximumAge: 60000,
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 10000,
        }
      );
    });
  }

  public async startTracking(
    onChange: (state: GeoLocationState) => void
  ): Promise<GeoLocationState> {
    this.onLocationChange = onChange;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.fetchIpLocation();
      return this.currentState;
    }

    try {
      this.requestCurrentPosition();

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentState = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            timestamp: position.timestamp,
            status: 'granted',
            errorMessage: undefined,
          };
          if (this.onLocationChange) this.onLocationChange(this.currentState);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            this.currentState = {
              ...this.currentState,
              status: 'denied',
              errorMessage: 'Location permission was restricted.'
            };
            if (this.onLocationChange) this.onLocationChange(this.currentState);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 10000
        }
      );
    } catch (err) {
      console.warn('Geolocation tracking error:', err);
    }

    return this.currentState;
  }

  public stopTracking() {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  public setSimulatedLocation(lat: number, lon: number, accuracy: number = 10) {
    this.currentState = {
      latitude: lat,
      longitude: lon,
      accuracy,
      timestamp: Date.now(),
      status: 'granted',
      errorMessage: undefined,
    };
    if (this.onLocationChange) {
      this.onLocationChange(this.currentState);
    }
  }
}

export const geoManager = new GeoManager();

// Calculate Haversine distance in meters
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate compass bearing from point 1 to point 2 (degrees 0-360)
export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360;
}

// Get turn direction given previous and next bearings
export function getTurnDirection(
  prevBearing: number,
  nextBearing: number
): 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'u-turn' {
  let diff = nextBearing - prevBearing;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;

  if (Math.abs(diff) < 20) return 'straight';
  if (diff > 20 && diff < 65) return 'slight-right';
  if (diff >= 65 && diff < 120) return 'right';
  if (diff >= 120 && diff < 160) return 'sharp-right';
  if (diff < -20 && diff > -65) return 'slight-left';
  if (diff <= -65 && diff > -120) return 'left';
  if (diff <= -120 && diff > -160) return 'sharp-left';
  return 'u-turn';
}

// Multi-dataset continuous acoustic noise calculation at any coordinate in NYC
export function calculateDecibelsAtPoint(lat: number, lon: number): {
  decibels: number;
  category: SoundCategory;
  dominantSource: string;
  isSanctuary: boolean;
} {
  // 1. Closest neighborhood base baseline
  let closestNeigh = NYC_NEIGHBORHOODS[0];
  let minNeighDist = Infinity;
  for (const n of NYC_NEIGHBORHOODS) {
    const d = getDistanceMeters(lat, lon, n.lat, n.lon);
    if (d < minNeighDist) {
      minNeighDist = d;
      closestNeigh = n;
    }
  }

  let calculatedDb = closestNeigh.baseNoise;
  let dominantSource = `${closestNeigh.name} Ambient`;
  let isSanctuary = false;

  // 2. Check for Quiet Sanctuaries (reduce decibels significantly)
  for (const zone of NYC_SOUND_ZONES) {
    if (zone.type === 'quiet-haven') {
      const dist = getDistanceMeters(lat, lon, zone.latitude, zone.longitude);
      if (dist < zone.radiusMeters * 1.5) {
        const factor = Math.max(0, 1 - dist / (zone.radiusMeters * 1.5));
        const sanctuaryDb = zone.baseDecibels + (zone.peakDecibels - zone.baseDecibels) * (1 - factor);
        calculatedDb = calculatedDb * (1 - factor * 0.9) + sanctuaryDb * (factor * 0.9);
        dominantSource = `🌿 ${zone.name}`;
        isSanctuary = true;
      }
    }
  }

  // 3. Check for Noisy Hotspots (subway, traffic canyons, 311 complaints, construction)
  if (!isSanctuary) {
    for (const zone of NYC_SOUND_ZONES) {
      if (zone.type !== 'quiet-haven') {
        const dist = getDistanceMeters(lat, lon, zone.latitude, zone.longitude);
        if (dist < zone.radiusMeters * 1.8) {
          const factor = Math.max(0, 1 - dist / (zone.radiusMeters * 1.8));
          const hotspotDb = zone.baseDecibels * factor + calculatedDb * (1 - factor);
          if (hotspotDb > calculatedDb) {
            calculatedDb = hotspotDb;
            dominantSource = zone.name;
          }
        }
      }
    }
  }

  // Bound within realistic NYC SPL range (38 dB in deep ramble to 105 dB at loud screech)
  calculatedDb = Math.max(38, Math.min(105, Math.round(calculatedDb * 10) / 10));

  let category: SoundCategory = 'Moderate Ambient';
  if (calculatedDb < 45) category = 'Quiet / Whisper';
  else if (calculatedDb < 65) category = 'Moderate Ambient';
  else if (calculatedDb < 78) category = 'Busy City / Traffic';
  else if (calculatedDb < 88) category = 'Heavy Transit';
  else category = 'Extreme / Sirens';

  return {
    decibels: calculatedDb,
    category,
    dominantSource,
    isSanctuary,
  };
}

// Find closest NYC Neighborhood and closest sound density hotspot
export function getAcousticContext(lat: number, lon: number): {
  neighborhood: string;
  borough: string;
  nearestHotspot?: SoundDensityZone;
  distanceToHotspotMeters?: number;
  environmentalNoiseEst: number;
} {
  let closestNeighborhood = NYC_NEIGHBORHOODS[0];
  let minNeighDist = Infinity;

  for (const n of NYC_NEIGHBORHOODS) {
    const d = getDistanceMeters(lat, lon, n.lat, n.lon);
    if (d < minNeighDist) {
      minNeighDist = d;
      closestNeighborhood = n;
    }
  }

  let closestZone: SoundDensityZone | undefined;
  let minZoneDist = Infinity;

  for (const z of NYC_SOUND_ZONES) {
    const d = getDistanceMeters(lat, lon, z.latitude, z.longitude);
    if (d < minZoneDist) {
      minZoneDist = d;
      closestZone = z;
    }
  }

  const pointCalc = calculateDecibelsAtPoint(lat, lon);

  return {
    neighborhood: closestNeighborhood.name,
    borough: closestNeighborhood.borough,
    nearestHotspot: closestZone,
    distanceToHotspotMeters: Math.round(minZoneDist),
    environmentalNoiseEst: pointCalc.decibels
  };
}

// Interpolate between two coordinates
export function interpolateCoordinate(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  fraction: number
): [number, number] {
  return [
    startLat + (endLat - startLat) * fraction,
    startLon + (endLon - startLon) * fraction,
  ];
}
