import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Volume2, 
  MapPin, 
  FileSpreadsheet, 
  Radio, 
  Activity, 
  ShieldAlert, 
  Sparkles,
  Info,
  Smartphone,
  ExternalLink,
  Layers
} from 'lucide-react';
import { DecibelMeter } from './components/DecibelMeter';
import { SoundMap } from './components/SoundMap';
import { SoundLogTable } from './components/SoundLogTable';
import { SoundSynthesizer } from './components/SoundSynthesizer';
import { PermissionBanner } from './components/PermissionBanner';
import { audioEngine, classifyDecibels } from './utils/audioEngine';
import { geoManager, getAcousticContext } from './utils/geoUtils';
import { DecibelStats, FrequencyData, GeoLocationState, MicState, SoundDensityZone, SoundLogEntry } from './types';

export default function App() {
  // --- Audio State ---
  const [decibels, setDecibels] = useState<number>(40.0);
  const [frequencyData, setFrequencyData] = useState<FrequencyData>({ lows: 0, mids: 0, highs: 0 });
  const [rawFreqBuffer, setRawFreqBuffer] = useState<Uint8Array | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [calibrationOffset, setCalibrationOffset] = useState<number>(() => {
    const saved = localStorage.getItem('loud_calib_offset');
    return saved ? Number(saved) : 98;
  });

  const [micState, setMicState] = useState<MicState>({
    status: 'idle',
    calibrationOffset: 98,
  });

  const [stats, setStats] = useState<DecibelStats>({
    current: 40,
    peak: 40,
    min: 40,
    avg: 40,
    count: 0,
  });

  // --- Geolocation State ---
  const [geoState, setGeoState] = useState<GeoLocationState>(() => geoManager.getState());

  // --- Sound Logs State ---
  const [logs, setLogs] = useState<SoundLogEntry[]>(() => {
    // Optional initial seed to demonstrate NYC soundscape immediately
    return [
      {
        id: 'seed-1',
        timestamp: Date.now() - 60000,
        timeFormatted: new Date(Date.now() - 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latitude: 40.7580,
        longitude: -73.9855,
        decibels: 82.4,
        peakDecibels: 91.2,
        category: 'Heavy Transit',
        neighborhood: 'Midtown Manhattan (Times Sq)',
        sourceType: 'simulated'
      },
      {
        id: 'seed-2',
        timestamp: Date.now() - 120000,
        timeFormatted: new Date(Date.now() - 120000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latitude: 40.7517,
        longitude: -73.9767,
        decibels: 89.6,
        peakDecibels: 102.1,
        category: 'Extreme / Sirens',
        neighborhood: 'Grand Central 4/5/6 Subway Curve',
        sourceType: 'simulated'
      }
    ];
  });

  const [isAutoLogging, setIsAutoLogging] = useState<boolean>(true);
  const [logIntervalSec, setLogIntervalSec] = useState<number>(3);
  const [activeTab, setActiveTab] = useState<'all' | 'meter' | 'map' | 'logs' | 'synth'>('all');

  // Simulation mode ref for fallback
  const simIntervalRef = useRef<number | null>(null);

  // Initialize Geolocation on mount
  useEffect(() => {
    geoManager.startTracking((newGeo) => {
      setGeoState(newGeo);
    });

    return () => {
      geoManager.stopTracking();
      audioEngine.stopMicrophone();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // Update calibration in Audio Engine
  useEffect(() => {
    audioEngine.setCalibration(calibrationOffset);
    localStorage.setItem('loud_calib_offset', String(calibrationOffset));
  }, [calibrationOffset]);

  // Audio callback handler
  const handleAudioData = useCallback((db: number, freq: FrequencyData, rawBuf: Uint8Array) => {
    setDecibels(db);
    setFrequencyData(freq);
    setRawFreqBuffer(rawBuf);

    setStats((prev) => {
      const newCount = prev.count + 1;
      const newPeak = prev.count === 0 ? db : Math.max(prev.peak, db);
      const newMin = prev.count === 0 ? db : Math.min(prev.min, db);
      const newAvg = prev.count === 0 ? db : (prev.avg * prev.count + db) / newCount;
      return {
        current: db,
        peak: newPeak,
        min: newMin,
        avg: newAvg,
        count: newCount,
      };
    });
  }, []);

  // Start / Stop Microphone
  const handleToggleMic = async () => {
    if (isListening) {
      audioEngine.stopMicrophone();
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      setIsListening(false);
      setMicState((prev) => ({ ...prev, status: 'idle', errorMessage: undefined }));
    } else {
      setMicState((prev) => ({ ...prev, status: 'prompt' }));
      const res = await audioEngine.startMicrophone(handleAudioData);
      if (res.success) {
        setIsListening(true);
        setMicState((prev) => ({ ...prev, status: 'listening', errorMessage: undefined }));
      } else {
        setIsListening(false);
        setMicState((prev) => ({ ...prev, status: 'denied', errorMessage: res.error }));
      }
    }
  };

  // Helper to append a single log record
  const logCurrentReading = useCallback((source: 'live-mic' | 'simulated' | 'synthesized' = 'live-mic') => {
    const lat = geoState.latitude || 40.7580;
    const lon = geoState.longitude || -73.9855;
    const acoustic = getAcousticContext(lat, lon);

    const now = Date.now();
    const timeFormatted = new Date(now).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const category = classifyDecibels(decibels);

    const newEntry: SoundLogEntry = {
      id: `log-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      timeFormatted,
      latitude: lat,
      longitude: lon,
      decibels: Math.round(decibels * 10) / 10,
      peakDecibels: Math.round(stats.peak * 10) / 10,
      category,
      neighborhood: acoustic.neighborhood,
      sourceType: source,
    };

    setLogs((prev) => [newEntry, ...prev.slice(0, 499)]); // keep latest 500
  }, [decibels, geoState.latitude, geoState.longitude, stats.peak]);

  // Periodic Auto-Logging Timer while meter is running
  useEffect(() => {
    if (!isListening || !isAutoLogging) return;

    const intervalId = setInterval(() => {
      logCurrentReading(micState.status === 'listening' ? 'live-mic' : 'simulated');
    }, logIntervalSec * 1000);

    return () => clearInterval(intervalId);
  }, [isListening, isAutoLogging, logIntervalSec, logCurrentReading, micState.status]);

  // Clear / Reset Logs
  const handleClearLogs = () => {
    setLogs([]);
    setStats({
      current: decibels,
      peak: decibels,
      min: decibels,
      avg: decibels,
      count: 0,
    });
  };

  const handleDeleteEntry = (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  // Simulation mode for testing on devices without mic/GPS access
  const handleEnableDemoMode = () => {
    // Set simulated NYC GPS in Midtown
    geoManager.setSimulatedLocation(40.7580, -73.9855, 5);

    // If real mic couldn't start, run synthetic oscillation
    if (!isListening) {
      setIsListening(true);
      setMicState({ status: 'listening', calibrationOffset: 98 });

      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      let angle = 0;
      simIntervalRef.current = window.setInterval(() => {
        angle += 0.15;
        // Fluctuates naturally between 58 and 92 dB
        const base = 74;
        const variation = Math.sin(angle) * 12 + Math.cos(angle * 2.3) * 6 + (Math.random() * 4 - 2);
        const simDb = Math.max(35, Math.min(108, base + variation));
        
        const dummyBuf = new Uint8Array(512);
        for (let i = 0; i < dummyBuf.length; i++) {
          dummyBuf[i] = Math.floor(Math.random() * (simDb / 100) * 255);
        }

        handleAudioData(
          Math.round(simDb * 10) / 10,
          {
            lows: 0.3 + Math.sin(angle) * 0.2,
            mids: 0.5 + Math.cos(angle) * 0.2,
            highs: 0.2 + Math.sin(angle * 3) * 0.2,
          },
          dummyBuf
        );
      }, 150);
    }
  };

  // Simulating walking tour point
  const handleSimulateTourPoint = (lat: number, lon: number, name: string, estDb: number) => {
    geoManager.setSimulatedLocation(lat, lon, 5);
    setDecibels(estDb);
    setStats((prev) => ({
      ...prev,
      current: estDb,
      peak: Math.max(prev.peak, estDb),
      min: Math.min(prev.min, estDb),
      avg: (prev.avg + estDb) / 2,
    }));
    logCurrentReading('synthesized');
  };

  // Acoustic context of user position
  const acousticContext = geoState.latitude && geoState.longitude
    ? getAcousticContext(geoState.latitude, geoState.longitude)
    : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-stone-950/90 backdrop-blur-md border-b border-stone-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 text-stone-950 font-black text-lg shadow-md shadow-amber-500/20 tracking-tighter">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                  LOUD <span className="text-amber-400 font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">NYC</span>
                </h1>
                {isListening && (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 hidden sm:block">NYC Soundscape Map & Real-time Web Audio Decibel Meter</p>
            </div>
          </div>

          {/* Quick Context Stats on Desktop Header */}
          <div className="flex items-center gap-2">
            {acousticContext && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-stone-900 border border-stone-800 rounded-xl text-xs text-stone-300">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium text-stone-200">{acousticContext.neighborhood}</span>
                <span className="text-[10px] text-stone-500">({acousticContext.borough})</span>
              </div>
            )}

            <button
              onClick={handleEnableDemoMode}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-amber-400 border border-stone-800 transition-colors flex items-center gap-1.5"
              title="Run simulation tour"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Simulate NYC</span>
            </button>
          </div>
        </div>

        {/* Mobile View Switcher Tabs */}
        <div className="max-w-7xl mx-auto flex items-center gap-1 mt-2.5 overflow-x-auto text-xs font-medium sm:hidden">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'all' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 text-stone-400'
            }`}
          >
            All Views
          </button>
          <button
            onClick={() => setActiveTab('meter')}
            className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'meter' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 text-stone-400'
            }`}
          >
            Decibel Meter
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'map' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 text-stone-400'
            }`}
          >
            NYC Map
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'logs' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 text-stone-400'
            }`}
          >
            Noise Log ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('synth')}
            className={`px-3 py-1 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === 'synth' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-900 text-stone-400'
            }`}
          >
            Synthesizer
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Permission / Hardware Notice Banner */}
        <PermissionBanner
          micState={micState}
          geoState={geoState}
          onRetryMic={handleToggleMic}
          onRetryGeo={() => geoManager.startTracking(setGeoState)}
          onEnableDemoMode={handleEnableDemoMode}
        />

        {/* Top Grid: Meter + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Decibel Meter (Left / Top) */}
          {(activeTab === 'all' || activeTab === 'meter') && (
            <div className="lg:col-span-6 w-full">
              <DecibelMeter
                decibels={decibels}
                stats={stats}
                isListening={isListening}
                frequencyData={frequencyData}
                rawFreqBuffer={rawFreqBuffer}
                calibrationOffset={calibrationOffset}
                onToggleMic={handleToggleMic}
                onCalibrationChange={setCalibrationOffset}
                onManualLog={() => logCurrentReading('live-mic')}
                hasLocation={Boolean(geoState.latitude && geoState.longitude)}
              />
            </div>
          )}

          {/* NYC Sound Map (Right / Top) */}
          {(activeTab === 'all' || activeTab === 'map') && (
            <div className="lg:col-span-6 w-full">
              <SoundMap
                userLat={geoState.latitude}
                userLon={geoState.longitude}
                currentDb={decibels}
                isListening={isListening}
                logs={logs}
                onSelectZone={(zone) => {
                  setDecibels(zone.baseDecibels);
                }}
                onSimulateLocation={(lat, lon) => {
                  geoManager.setSimulatedLocation(lat, lon, 5);
                }}
              />
            </div>
          )}
        </div>

        {/* NYC Sound Synthesizer & Sound Density Layer */}
        {(activeTab === 'all' || activeTab === 'synth') && (
          <div className="w-full">
            <SoundSynthesizer
              onSimulateTourPoint={handleSimulateTourPoint}
            />
          </div>
        )}

        {/* Location + Noise Log Table */}
        {(activeTab === 'all' || activeTab === 'logs') && (
          <div className="w-full">
            <SoundLogTable
              logs={logs}
              isAutoLogging={isAutoLogging}
              logIntervalSec={logIntervalSec}
              onToggleAutoLog={() => setIsAutoLogging(!isAutoLogging)}
              onIntervalChange={setLogIntervalSec}
              onClearLogs={handleClearLogs}
              onDeleteEntry={handleDeleteEntry}
              onCenterMapOnLog={(lat, lon) => {
                geoManager.setSimulatedLocation(lat, lon, 5);
              }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950 py-4 px-4 sm:px-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>LOUD — NYC Acoustic Environment Mapping & Web Audio SPL Analyzer</span>
          <span className="font-mono text-[11px] text-stone-600">Client-Side Only • Web Audio & Geolocation API</span>
        </div>
      </footer>
    </div>
  );
}
