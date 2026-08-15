export interface SoundLogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  latitude: number;
  longitude: number;
  decibels: number;
  peakDecibels: number;
  category: SoundCategory;
  neighborhood?: string;
  notes?: string;
  sourceType?: 'live-mic' | 'simulated';
}

export type SoundCategory = 
  | 'Quiet / Whisper'       // < 45 dB (e.g., library, park)
  | 'Moderate Ambient'      // 45 - 65 dB (e.g., office, normal conversation)
  | 'Busy City / Traffic'   // 65 - 78 dB (e.g., busy avenue, sidewalk)
  | 'Heavy Transit'         // 78 - 88 dB (e.g., subway station, bus lane)
  | 'Extreme / Sirens';     // > 88 dB (e.g., siren up-close, screeching subway curves)

export type NoiseDatasetType = 
  | '311-complaint'
  | 'traffic-corridor'
  | 'mta-transit'
  | 'quiet-haven'
  | 'construction'
  | 'nightlife'
  | 'community-report';

export interface SoundDensityZone {
  id: string;
  name: string;
  borough: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';
  type: 'subway-screech' | 'traffic-siren' | 'construction' | 'quiet-haven' | 'nightlife';
  datasetCategory?: NoiseDatasetType;
  datasetSource?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  baseDecibels: number;
  peakDecibels: number;
  description: string;
  complaintType?: string;
  serviceRequestId?: string;
  externalUrl?: string;
}

export interface CommunityNoiseReport {
  id: string;
  zoneName: string;
  noiseType: 'sirens-traffic' | 'subway-screech' | 'construction' | 'nightlife' | 'horn-exhaust' | 'quiet-spot';
  latitude: number;
  longitude: number;
  decibels: number;
  description: string;
  reportedAt: number;
  timeAgo: string;
  upvotes: number;
  isUserReported?: boolean;
  reporterName?: string;
  reporterBadge?: string;
}

export interface DecibelStats {
  current: number;
  peak: number;
  min: number;
  avg: number;
  count: number;
}

export interface FrequencyData {
  lows: number;   // 20 - 250 Hz (rumble, engine)
  mids: number;   // 250 - 2000 Hz (speech, traffic)
  highs: number;  // 2000 - 10000 Hz (screech, whistle, siren)
}

export interface GeoLocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  timestamp: number | null;
  status: 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable';
  errorMessage?: string;
}

export interface MicState {
  status: 'idle' | 'listening' | 'prompt' | 'denied' | 'unsupported';
  errorMessage?: string;
  calibrationOffset: number;
}

// --- Navigation: 2 Options (Fastest vs. Quietest) ---

export type SilenceLevel = 'fastest' | 'quietest';

export interface SilenceLevelConfig {
  id: SilenceLevel;
  name: string;
  tagline: string;
  description: string;
  targetDbRange: string;
  colorHex: string;
  badgeClass: string;
}

export interface Waypoint {
  name: string;
  latitude: number;
  longitude: number;
  neighborhood?: string;
}

export interface RouteAcousticPoint {
  latitude: number;
  longitude: number;
  distanceFromStartMeters: number;
  decibels: number;
  category: SoundCategory;
  streetName?: string;
  dominantNoiseSource?: string;
  isSanctuary?: boolean;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  averageDecibels: number;
  peakDecibels: number;
  acousticWarning?: string;
  acousticAdvantage?: string;
  streetName: string;
}

export interface AvoidedHazard {
  zoneName: string;
  type: NoiseDatasetType;
  decibels: number;
  avoidanceDistanceMeters: number;
  reason: string;
}

export interface NavRoute {
  id: string;
  silenceLevel: SilenceLevel;
  title: string;
  origin: Waypoint;
  destination: Waypoint;
  coordinates: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
  averageDecibels: number;
  peakDecibels: number;
  minDecibels: number;
  silenceScore: number; // 0 to 100
  exposureBreakdown: {
    quietPercent: number;     // < 50 dB
    moderatePercent: number;  // 50 - 70 dB
    loudPercent: number;      // > 70 dB
  };
  acousticProfile: RouteAcousticPoint[];
  steps: RouteStep[];
  avoidedHazards: AvoidedHazard[];
  color: string;
}

export interface RouteComparisonDelta {
  decibelReduction: number; // e.g. 26.4 dB quieter
  timeDifferenceMinutes: number; // e.g. +4 min
  distanceDifferenceMeters: number; // e.g. +280 m
  silenceScoreDifference: number; // e.g. +58 pts
}

export interface PresetRoute {
  id: string;
  title: string;
  borough: string;
  description: string;
  origin: Waypoint;
  destination: Waypoint;
}

export interface NavigationSimulationState {
  isActive: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  currentCoordinateIndex: number;
  currentLat: number;
  currentLon: number;
  currentDecibels: number;
  progressPercent: number;
  elapsedSeconds: number;
}
