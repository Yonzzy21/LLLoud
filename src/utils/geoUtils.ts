import { NYC_NEIGHBORHOODS, NYC_SOUND_ZONES } from '../data/nycSoundData';
import { GeoLocationState, SoundDensityZone } from '../types';

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

  public async startTracking(
    onChange: (state: GeoLocationState) => void
  ): Promise<GeoLocationState> {
    this.onLocationChange = onChange;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.currentState = {
        ...this.currentState,
        status: 'unavailable',
        errorMessage: 'Geolocation is not supported on this device/browser.'
      };
      this.onLocationChange(this.currentState);
      return this.currentState;
    }

    // Check if Permissions Policy restricts geolocation before calling browser API
    const doc = typeof document !== 'undefined' ? (document as any) : null;
    const isPolicyAllowed = doc?.permissionsPolicy?.allowsFeature
      ? doc.permissionsPolicy.allowsFeature('geolocation')
      : doc?.featurePolicy?.allowsFeature
      ? doc.featurePolicy.allowsFeature('geolocation')
      : true;

    if (isPolicyAllowed === false) {
      this.currentState = {
        ...this.currentState,
        status: 'granted', // Keep active with NYC coordinates
        errorMessage: undefined
      };
      this.onLocationChange(this.currentState);
      return this.currentState;
    }

    try {
      // Attempt safe check with Permissions API if supported
      if ('permissions' in navigator && navigator.permissions?.query) {
        try {
          const permResult = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (permResult.state === 'denied') {
            this.currentState = {
              ...this.currentState,
              status: 'denied',
              errorMessage: 'Location permission was denied. Use NYC Simulation Mode or click anywhere on the map.'
            };
            this.onLocationChange(this.currentState);
            return this.currentState;
          }
        } catch {
          // Ignore permissions query error if permissions policy restricts it
        }
      }

      // First attempt quick get
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentState = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            timestamp: position.timestamp,
            status: 'granted'
          };
          if (this.onLocationChange) this.onLocationChange(this.currentState);
        },
        (error) => {
          let msg = 'Failed to get location.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = 'Location permission is restricted in this browser context. Using NYC simulation coordinates.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'Location information is currently unavailable.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Location request timed out.';
          }
          this.currentState = {
            ...this.currentState,
            status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
            errorMessage: msg
          };
          if (this.onLocationChange) this.onLocationChange(this.currentState);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000
        }
      );

      // Then start continuous watch
      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.currentState = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            timestamp: position.timestamp,
            status: 'granted'
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
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      );
    } catch (err) {
      // Catches Permissions policy violations or iframe restrictions
      this.currentState = {
        ...this.currentState,
        status: 'unavailable',
        errorMessage: 'Geolocation policy restricted in iframe. Using NYC simulated coordinates.'
      };
      if (this.onLocationChange) this.onLocationChange(this.currentState);
    }

    return this.currentState;
  }

  public stopTracking() {
    if (this.watchId !== null) {
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
      status: 'granted'
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

// Find closest NYC Neighborhood and closest sound density hotspot
export function getAcousticContext(lat: number, lon: number): {
  neighborhood: string;
  borough: string;
  nearestHotspot?: SoundDensityZone;
  distanceToHotspotMeters?: number;
  environmentalNoiseEst: number;
} {
  // 1. Closest neighborhood
  let closestNeighborhood = NYC_NEIGHBORHOODS[0];
  let minNeighDist = Infinity;

  for (const n of NYC_NEIGHBORHOODS) {
    const d = getDistanceMeters(lat, lon, n.lat, n.lon);
    if (d < minNeighDist) {
      minNeighDist = d;
      closestNeighborhood = n;
    }
  }

  // 2. Closest sound hotspot
  let closestZone: SoundDensityZone | undefined;
  let minZoneDist = Infinity;

  for (const z of NYC_SOUND_ZONES) {
    const d = getDistanceMeters(lat, lon, z.latitude, z.longitude);
    if (d < minZoneDist) {
      minZoneDist = d;
      closestZone = z;
    }
  }

  // Base environmental estimation
  let estDb = closestNeighborhood.baseNoise;
  if (closestZone && minZoneDist < closestZone.radiusMeters * 2) {
    // Proximity acoustic gradient: closer to hotspot brings level closer to hotspot base/peak
    const factor = Math.max(0, 1 - minZoneDist / (closestZone.radiusMeters * 2));
    estDb = Math.round(estDb * (1 - factor) + closestZone.baseDecibels * factor);
  }

  return {
    neighborhood: closestNeighborhood.name,
    borough: closestNeighborhood.borough,
    nearestHotspot: closestZone,
    distanceToHotspotMeters: Math.round(minZoneDist),
    environmentalNoiseEst: estDb
  };
}
