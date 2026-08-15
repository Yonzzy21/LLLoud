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
  sourceType?: 'live-mic' | 'simulated' | 'synthesized';
}

export type SoundCategory = 
  | 'Quiet / Whisper'       // < 45 dB (e.g., library, park)
  | 'Moderate Ambient'      // 45 - 65 dB (e.g., office, normal conversation)
  | 'Busy City / Traffic'   // 65 - 78 dB (e.g., busy avenue, sidewalk)
  | 'Heavy Transit'         // 78 - 88 dB (e.g., subway station, bus lane)
  | 'Extreme / Sirens';     // > 88 dB (e.g., siren up-close, screeching subway curves)

export interface SoundDensityZone {
  id: string;
  name: string;
  borough: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';
  type: 'subway-screech' | 'traffic-siren' | 'construction' | 'quiet-haven' | 'nightlife';
  latitude: number;
  longitude: number;
  radiusMeters: number;
  baseDecibels: number;
  peakDecibels: number;
  description: string;
  audioSignature: 'screech' | 'siren' | 'traffic' | 'park' | 'crowd';
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
  calibrationOffset: number; // in dB (default ~100 to scale RMS float to SPL dB)
}
