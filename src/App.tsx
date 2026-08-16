import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Compass, 
  Layers, 
  Volume2, 
  FileSpreadsheet, 
  MapPin, 
  ArrowUpDown, 
  Navigation, 
  Smartphone, 
  Sparkles,
  Zap,
  Trees,
  Info,
  X,
  ShieldCheck,
  Activity,
  Locate,
  AlertCircle,
  AlertTriangle,
  Users,
  Search,
  Loader2,
  Play,
  Clock,
  ChevronRight,
  ShieldAlert,
  CornerDownRight,
  CornerUpRight,
  MoveRight
} from 'lucide-react';
import { SoundMap } from './components/SoundMap';
import { MobileNavDrawer } from './components/MobileNavDrawer';
import { MobileNavigationHUD } from './components/MobileNavigationHUD';
import { DecibelMeter } from './components/DecibelMeter';
import { SoundLogTable } from './components/SoundLogTable';
import { PermissionBanner } from './components/PermissionBanner';
import { ReportNoiseModal } from './components/ReportNoiseModal';
import { AddressSearchInput } from './components/AddressSearchInput';
import { RouteProfileChart } from './components/RouteProfileChart';
import { audioEngine, classifyDecibels } from './utils/audioEngine';
import { geoManager, getAcousticContext } from './utils/geoUtils';
import { calculateWalkableCommuteRoutesAsync } from './utils/pedestrianRouter';
import { fetchLiveNyc311NoiseComplaints, fetchNyc311AsCommunityReports } from './utils/nycOpenData';
import { NYC_PRESET_ROUTES, NYC_NEIGHBORHOODS, SILENCE_LEVEL_CONFIGS } from './data/nycSoundData';
import { 
  CommunityNoiseReport,
  DecibelStats, 
  FrequencyData, 
  GeoLocationState, 
  MicState, 
  NavRoute, 
  NavigationSimulationState, 
  PresetRoute, 
  RouteComparisonDelta, 
  SilenceLevel, 
  SoundLogEntry, 
  Waypoint 
} from './types';

export default function App() {
  // --- Active Mobile Tab ---
  const [activeTab, setActiveTab] = useState<'nav' | 'map' | 'meter' | 'logs'>('nav');
  const [showDataModal, setShowDataModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationToast, setLocationToast] = useState<string | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState<boolean>(false);

  // --- Real Community Noise Reports ---
  const [communityReports, setCommunityReports] = useState<CommunityNoiseReport[]>(() => {
    const saved = localStorage.getItem('loud_community_reports');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const realOnly = parsed.filter((p: any) => !['comm-1', 'comm-2', 'comm-3', 'comm-4'].includes(p.id));
          return realOnly;
        }
      } catch (e) {
        // empty
      }
    }
    return [];
  });

  // --- Live NYC 311 noise complaints (merged into router for avoidance) ---
  const [nyc311Reports, setNyc311Reports] = useState<CommunityNoiseReport[]>([]);
  useEffect(() => {
    fetchNyc311AsCommunityReports(120).then((r) => {
      console.log(`[LLLoud] ✅ Loaded ${r.length} live 311 noise reports into router`);
      setNyc311Reports(r);
    }).catch(console.error);
  }, []);

  // Save community reports & broadcast live to all tabs / browser instances
  useEffect(() => {
    localStorage.setItem('loud_community_reports', JSON.stringify(communityReports));

    try {
      const channel = new BroadcastChannel('llloud_nyc_live_network');
      channel.postMessage({ type: 'SYNC_REPORTS', reports: communityReports });
      channel.close();
    } catch {
      // fallback
    }
  }, [communityReports]);

  // Listen for real-time live broadcasts from other tabs / users
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('llloud_nyc_live_network');
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC_REPORTS' && Array.isArray(event.data.reports)) {
          setCommunityReports(event.data.reports);
        }
      };
    } catch {
      // fallback
    }

    return () => {
      if (channel) channel.close();
    };
  }, []);

  // --- Audio State (100% Real Live Mic Data, No Simulation) ---
  const [decibels, setDecibels] = useState<number>(0);
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
    current: 0,
    peak: 0,
    min: 0,
    avg: 0,
    count: 0,
  });

  // --- Geolocation State (Real GPS) ---
  const [geoState, setGeoState] = useState<GeoLocationState>(() => geoManager.getState());

  // --- Sound Logs State ---
  const [logs, setLogs] = useState<SoundLogEntry[]>(() => {
    const saved = localStorage.getItem('loud_real_user_logs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // empty
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('loud_real_user_logs', JSON.stringify(logs));
  }, [logs]);

  const [isAutoLogging, setIsAutoLogging] = useState<boolean>(true);
  const [logIntervalSec, setLogIntervalSec] = useState<number>(3);

  // --- Navigation State (Point A & Point B fully editable with Real Geocoding) ---
  const [origin, setOrigin] = useState<Waypoint>(NYC_PRESET_ROUTES[0].origin);
  const [destination, setDestination] = useState<Waypoint>(NYC_PRESET_ROUTES[0].destination);
  const [selectedSilenceLevel, setSelectedSilenceLevel] = useState<SilenceLevel>('quietest');

  // Computed Real Walkable Commute Routes
  const [fastestRoute, setFastestRoute] = useState<NavRoute | null>(null);
  const [quietestRoute, setQuietestRoute] = useState<NavRoute | null>(null);
  const [avoidNoiseRoute, setAvoidNoiseRoute] = useState<NavRoute | null>(null);
  const [routeDelta, setRouteDelta] = useState<RouteComparisonDelta>({
    decibelReduction: 12.0,
    timeDifferenceMinutes: 3,
    distanceDifferenceMeters: 220,
    silenceScoreDifference: 35,
    avoidNoiseDecibelReduction: 18.0,
    avoidNoiseTimeDifference: 6,
  });

  // Stable key for route recalculation — only recalculate when actual coordinates or report counts change
  const routeKey = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}|${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}|${communityReports.length}|${nyc311Reports.length}|${logs.length}`;

  // Calculate 100% real walkable pedestrian routes
  useEffect(() => {
    let isCancelled = false;
    setIsCalculatingRoutes(true);
    console.log('[LLLoud] Calculating routes for:', routeKey);

    // Pass user logs so the router avoids spots the user has personally logged as loud
    const logSummary = logs.map(l => ({ latitude: l.latitude, longitude: l.longitude, decibels: l.decibels }));

    // Merge user reports with live 311 complaints — router avoids both
    const allNoiseReports = [...communityReports, ...nyc311Reports];
    calculateWalkableCommuteRoutesAsync(origin, destination, allNoiseReports, logSummary).then((res) => {
      if (!isCancelled) {
        console.log('[LLLoud] ✅ Routes calculated:', {
          fastest: `${res.fastestRoute.distanceMeters}m, ${res.fastestRoute.coordinates.length} pts`,
          quietest: `${res.quietestRoute.distanceMeters}m, ${res.quietestRoute.coordinates.length} pts`,
          avoidNoise: `${res.avoidNoiseRoute.distanceMeters}m, ${res.avoidNoiseRoute.coordinates.length} pts`,
        });
        setFastestRoute(res.fastestRoute);
        setQuietestRoute(res.quietestRoute);
        setAvoidNoiseRoute(res.avoidNoiseRoute);
        setRouteDelta(res.delta);
        setIsCalculatingRoutes(false);
      }
    }).catch((err) => {
      console.error('[LLLoud] ❌ Route calculation failed:', err);
      if (!isCancelled) setIsCalculatingRoutes(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRoute =
    selectedSilenceLevel === 'avoid-noise' ? (avoidNoiseRoute || quietestRoute || fastestRoute) :
    selectedSilenceLevel === 'quietest'    ? (quietestRoute || fastestRoute) :
                                             (fastestRoute || quietestRoute);

  // Mobile Walking Navigation HUD State
  const [simulationState, setSimulationState] = useState<NavigationSimulationState>({
    isActive: false,
    isPaused: false,
    currentStepIndex: 0,
    currentCoordinateIndex: 0,
    currentLat: origin.latitude,
    currentLon: origin.longitude,
    currentDecibels: decibels || 45,
    progressPercent: 0,
    elapsedSeconds: 0,
  });

  // Initialize Real Geolocation tracking on mount
  useEffect(() => {
    geoManager.startTracking((newGeo) => {
      setGeoState(newGeo);
    });

    return () => {
      geoManager.stopTracking();
      audioEngine.stopMicrophone();
    };
  }, []);

  // Update calibration in Audio Engine
  useEffect(() => {
    audioEngine.setCalibration(calibrationOffset);
    localStorage.setItem('loud_calib_offset', String(calibrationOffset));
  }, [calibrationOffset]);

  // Audio callback handler from real hardware microphone
  const handleAudioData = useCallback((db: number, freq: FrequencyData, rawBuf: Uint8Array) => {
    setDecibels(db);
    setFrequencyData(freq);
    setRawFreqBuffer(rawBuf);

    setStats((prev) => {
      const newCount = prev.count + 1;
      const newPeak = prev.count === 0 ? db : Math.max(prev.peak, db);
      const newMin = prev.count === 0 ? db : (prev.min === 0 ? db : Math.min(prev.min, db));
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

  // Helper to log a real microphone reading
  const logCurrentReading = useCallback(() => {
    if (!isListening) {
      setLocationToast('⚠️ Please turn on the microphone first to record real decibels.');
      setTimeout(() => setLocationToast(null), 3000);
      return;
    }

    const lat = geoState.latitude || origin.latitude;
    const lon = geoState.longitude || origin.longitude;
    const acoustic = getAcousticContext(lat, lon);

    const now = Date.now();
    const timeFormatted = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const category = classifyDecibels(decibels);

    const newEntry: SoundLogEntry = {
      id: `log-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      timeFormatted,
      latitude: lat,
      longitude: lon,
      decibels: Math.round(decibels * 10) / 10,
      peakDecibels: Math.round(Math.max(stats.peak, decibels) * 10) / 10,
      category,
      neighborhood: acoustic.neighborhood,
      sourceType: 'live-mic',
    };

    setLogs((prev) => [newEntry, ...prev.slice(0, 499)]);
    setLocationToast(`📝 Recorded real sound log: ${newEntry.decibels} dB SPL at ${acoustic.neighborhood}`);
    setTimeout(() => setLocationToast(null), 3000);
  }, [decibels, geoState.latitude, geoState.longitude, isListening, origin.latitude, origin.longitude, stats.peak]);

  // Periodic Auto-Logging Timer ONLY while real microphone is listening
  useEffect(() => {
    if (!isListening || !isAutoLogging) return;

    const intervalId = setInterval(() => {
      const lat = geoState.latitude || origin.latitude;
      const lon = geoState.longitude || origin.longitude;
      const acoustic = getAcousticContext(lat, lon);

      const now = Date.now();
      const timeFormatted = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const category = classifyDecibels(decibels);

      const newEntry: SoundLogEntry = {
        id: `log-${now}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        timeFormatted,
        latitude: lat,
        longitude: lon,
        decibels: Math.round(decibels * 10) / 10,
        peakDecibels: Math.round(Math.max(stats.peak, decibels) * 10) / 10,
        category,
        neighborhood: acoustic.neighborhood,
        sourceType: 'live-mic',
      };

      setLogs((prev) => [newEntry, ...prev.slice(0, 499)]);
    }, logIntervalSec * 1000);

    return () => clearInterval(intervalId);
  }, [isListening, isAutoLogging, logIntervalSec, decibels, geoState.latitude, geoState.longitude, origin.latitude, origin.longitude, stats.peak]);

  // Handle Real Community Report Submission
  const handleSubmitCommunityReport = (reportData: Omit<CommunityNoiseReport, 'id' | 'reportedAt' | 'timeAgo' | 'upvotes'>) => {
    const newReport: CommunityNoiseReport = {
      ...reportData,
      id: `comm-${Date.now()}`,
      reportedAt: Date.now(),
      timeAgo: 'Just now',
      upvotes: 1,
      isUserReported: true,
      reporterName: 'You',
      reporterBadge: 'Live Verified Report',
    };

    setCommunityReports((prev) => [newReport, ...prev]);
    setLocationToast(`📢 Broadcasted "${newReport.zoneName}" to NYC community map!`);
    setTimeout(() => setLocationToast(null), 4000);
  };

  // Navigation Controls
  const handleStartNavigation = () => {
    if (!activeRoute) return;
    setSimulationState({
      isActive: true,
      isPaused: false,
      currentStepIndex: 0,
      currentCoordinateIndex: 0,
      currentLat: activeRoute.coordinates[0][0],
      currentLon: activeRoute.coordinates[0][1],
      currentDecibels: decibels || activeRoute.acousticProfile[0]?.decibels || 45,
      progressPercent: 0,
      elapsedSeconds: 0,
    });
  };

  const handlePauseNavigation = () => {
    setSimulationState((prev) => ({ ...prev, isPaused: true }));
  };

  const handleResumeNavigation = () => {
    setSimulationState((prev) => ({ ...prev, isPaused: false }));
  };

  const handleEndNavigation = () => {
    setSimulationState({
      isActive: false,
      isPaused: false,
      currentStepIndex: 0,
      currentCoordinateIndex: 0,
      currentLat: origin.latitude,
      currentLon: origin.longitude,
      currentDecibels: decibels || 45,
      progressPercent: 0,
      elapsedSeconds: 0,
    });
  };

  // Route Preset Selection
  const handleSelectPresetRoute = (preset: PresetRoute) => {
    handleEndNavigation();
    setOrigin(preset.origin);
    setDestination(preset.destination);
  };

  // Swap Origin and Destination
  const handleSwapLocations = () => {
    handleEndNavigation();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  // Actively Request Live GPS Location and set as Origin (Point A)
  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setLocationToast('Locating your GPS position...');

    try {
      const result = await geoManager.requestCurrentPosition();
      setIsLocating(false);

      if (result.latitude && result.longitude) {
        handleEndNavigation();
        const acoustic = getAcousticContext(result.latitude, result.longitude);
        setOrigin({
          name: `My Live Location (${acoustic.neighborhood})`,
          latitude: result.latitude,
          longitude: result.longitude,
          neighborhood: acoustic.neighborhood,
        });
        setLocationToast(`📍 Live Start Set: ${acoustic.neighborhood}`);
        setTimeout(() => setLocationToast(null), 3500);
      } else {
        setLocationToast(result.errorMessage || 'Could not get GPS. Please enable location permissions in your browser.');
        setTimeout(() => setLocationToast(null), 4000);
      }
    } catch (err) {
      setIsLocating(false);
      setLocationToast('Could not retrieve GPS. Please enable Location in browser.');
      setTimeout(() => setLocationToast(null), 4000);
    }
  };

  // Clear Real Logs
  const handleClearLogs = () => {
    setLogs([]);
    localStorage.removeItem('loud_real_user_logs');
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

  // Interactive Map Click handlers for Point A & Point B
  const handleMapSetOrigin = (lat: number, lon: number) => {
    handleEndNavigation();
    const acoustic = getAcousticContext(lat, lon);
    setOrigin({
      name: `Point A (${acoustic.neighborhood})`,
      latitude: lat,
      longitude: lon,
      neighborhood: acoustic.neighborhood,
    });
    setLocationToast(`🟢 Point A (Start) Set: ${acoustic.neighborhood}`);
    setTimeout(() => setLocationToast(null), 3000);
  };

  const handleMapSetDestination = (lat: number, lon: number) => {
    handleEndNavigation();
    const acoustic = getAcousticContext(lat, lon);
    setDestination({
      name: `Point B (${acoustic.neighborhood})`,
      latitude: lat,
      longitude: lon,
      neighborhood: acoustic.neighborhood,
    });
    setLocationToast(`🏁 Point B (Destination) Set: ${acoustic.neighborhood}`);
    setTimeout(() => setLocationToast(null), 3000);
  };

  return (
    <div className="h-screen w-full bg-stone-950 text-stone-100 flex flex-col font-sans overflow-hidden select-none">
      
      {/* Toast Notification */}
      {locationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1500] max-w-sm w-full px-4">
          <div className="bg-stone-900/95 border border-amber-500/50 text-amber-300 text-xs px-3.5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold flex-1">{locationToast}</span>
          </div>
        </div>
      )}

      {/* Main Responsive Container: Split Sidebar on Desktop, Full Overlay on Mobile */}
      <div className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">

        {/* Desktop Sidebar Panel (visible on md: and up when on 'nav' tab) */}
        {activeTab === 'nav' && !simulationState.isActive && (
          <aside className="hidden md:flex flex-col w-[420px] lg:w-[460px] h-full bg-stone-950 border-r border-stone-800/80 z-[600] overflow-y-auto p-4 space-y-4 shrink-0 shadow-2xl">
            {/* Header / Brand */}
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-stone-950 font-black text-base flex items-center justify-center shadow-lg">
                  L
                </div>
                <div>
                  <h1 className="font-black text-base tracking-tight text-white">LLLoud NYC</h1>
                  <p className="text-[10px] text-stone-400">Acoustic Navigation & Noise Mapping</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowReportModal(true)}
                  className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black flex items-center gap-1 shadow-md transition-all active:scale-95 cursor-pointer"
                  title="Report Real Noise Hotspot"
                >
                  <AlertTriangle className="w-3.5 h-3.5 fill-current" />
                  <span>+ Log Spot</span>
                </button>
                <button
                  onClick={() => setShowDataModal(true)}
                  className="p-1.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-amber-400 text-xs transition-colors cursor-pointer"
                  title="NYC Datasets & Methodology"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Address Search Form (Point A & B) */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-300">Plan Route</span>
                {isCalculatingRoutes && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Routing...</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1.5">
                  <AddressSearchInput
                    id="desktop-origin-input"
                    value={origin}
                    onChange={(wp) => {
                      handleEndNavigation();
                      setOrigin(wp);
                    }}
                    placeholder="Point A (Start Address)..."
                    dotColor="emerald"
                    onUseCurrentLocation={handleUseCurrentLocation}
                  />

                  <AddressSearchInput
                    id="desktop-destination-input"
                    value={destination}
                    onChange={(wp) => {
                      handleEndNavigation();
                      setDestination(wp);
                    }}
                    placeholder="Point B (Destination Address)..."
                    dotColor="rose"
                  />
                </div>

                <button
                  onClick={handleSwapLocations}
                  className="p-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-amber-400 border border-stone-700 shadow-md transition-all active:scale-95 self-center shrink-0 cursor-pointer"
                  title="Swap Origin & Destination"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* Preset Quick Chips */}
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                <span className="text-[10px] text-stone-500 font-bold shrink-0">Presets:</span>
                {NYC_PRESET_ROUTES.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPresetRoute(p)}
                    className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-[10px] font-semibold text-stone-300 truncate transition-colors cursor-pointer"
                  >
                    {p.title.split('➔')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* 3 Route Comparison Cards */}
            {fastestRoute && quietestRoute && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">Choose Route</span>
                  <span className="text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full">
                    🤫 3 Options
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* 1. Fastest Commute */}
                  <div
                    onClick={() => setSelectedSilenceLevel('fastest')}
                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedSilenceLevel === 'fastest'
                        ? 'bg-rose-950/50 border-rose-500 shadow-lg ring-1 ring-rose-500'
                        : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-extrabold text-[10px] text-rose-400 flex items-center gap-1 mb-1">
                      <Zap className="w-3 h-3 fill-current" />
                      <span>Fastest</span>
                    </div>
                    <div className="text-lg font-black text-white font-mono leading-none">
                      {fastestRoute.durationMinutes}<span className="text-[9px] font-normal text-stone-400 ml-0.5">min</span>
                    </div>
                    <div className="text-[9px] text-stone-500 mt-1">{Math.round(fastestRoute.distanceMeters / 100) / 10} km</div>
                    <div className="text-[9px] font-mono font-bold text-rose-300 mt-0.5">{fastestRoute.averageDecibels} dB</div>
                  </div>

                  {/* 2. Quietest Route */}
                  <div
                    onClick={() => setSelectedSilenceLevel('quietest')}
                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedSilenceLevel === 'quietest'
                        ? 'bg-emerald-950/60 border-emerald-500 shadow-lg ring-1 ring-emerald-500'
                        : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-extrabold text-[10px] text-emerald-400 flex items-center gap-1 mb-1">
                      <Trees className="w-3 h-3 fill-current" />
                      <span>Quietest</span>
                    </div>
                    <div className="text-lg font-black text-emerald-300 font-mono leading-none">
                      {quietestRoute.durationMinutes}<span className="text-[9px] font-normal text-stone-400 ml-0.5">min</span>
                    </div>
                    <div className="text-[9px] text-stone-500 mt-1">{Math.round(quietestRoute.distanceMeters / 100) / 10} km</div>
                    <div className="text-[9px] font-mono font-bold text-emerald-400 mt-0.5">{quietestRoute.averageDecibels} dB</div>
                  </div>

                  {/* 3. Noise-Free Route */}
                  <div
                    onClick={() => setSelectedSilenceLevel('avoid-noise')}
                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedSilenceLevel === 'avoid-noise'
                        ? 'bg-cyan-950/60 border-cyan-500 shadow-lg ring-1 ring-cyan-500'
                        : 'bg-stone-900/60 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-extrabold text-[10px] text-cyan-400 flex items-center gap-1 mb-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>No Noise</span>
                    </div>
                    <div className="text-lg font-black text-cyan-300 font-mono leading-none">
                      {avoidNoiseRoute ? avoidNoiseRoute.durationMinutes : '…'}<span className="text-[9px] font-normal text-stone-400 ml-0.5">min</span>
                    </div>
                    <div className="text-[9px] text-stone-500 mt-1">{avoidNoiseRoute ? `${Math.round(avoidNoiseRoute.distanceMeters / 100) / 10} km` : '—'}</div>
                    <div className="text-[9px] font-mono font-bold text-cyan-400 mt-0.5">{avoidNoiseRoute ? `${avoidNoiseRoute.averageDecibels} dB` : '—'}</div>
                  </div>
                </div>

                {/* dB savings badge */}
                <div className="flex gap-2 text-[10px]">
                  <span className="flex-1 text-center bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 rounded-lg py-1 font-bold">
                    🌿 Quietest saves {routeDelta.decibelReduction} dB
                  </span>
                  <span className="flex-1 text-center bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 rounded-lg py-1 font-bold">
                    🤫 No-noise saves {routeDelta.avoidNoiseDecibelReduction} dB
                  </span>
                </div>

                {/* Big Start Walking Button */}
                <button
                  onClick={handleStartNavigation}
                  className={`w-full py-3 rounded-2xl font-black text-sm tracking-wide shadow-xl flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer ${
                    selectedSilenceLevel === 'avoid-noise'
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-stone-950'
                      : selectedSilenceLevel === 'quietest'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                      : 'bg-rose-500 hover:bg-rose-400 text-white'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Walking Navigation</span>
                </button>

                {/* Acoustic Decibel Elevation Profile Chart */}
                {activeRoute && (
                  <div className="pt-2">
                    <RouteProfileChart route={activeRoute} />
                  </div>
                )}

                {/* Turn-by-Turn Steps List */}
                {activeRoute && activeRoute.steps.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                      Step-by-Step Guidance ({activeRoute.steps.length} steps)
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {activeRoute.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-xl bg-stone-900/70 border border-stone-800/80 text-xs flex items-start gap-2"
                        >
                          <span className="w-5 h-5 rounded-lg bg-stone-800 text-stone-400 font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-stone-200">{step.instruction}</div>
                            {step.distanceMeters > 0 && (
                              <div className="text-[10px] text-stone-500 font-mono">
                                {step.distanceMeters} m • ~{Math.round(step.averageDecibels)} dB
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Main Interactive Map & Canvas View */}
        <main className="relative flex-1 w-full h-full overflow-hidden">
          {activeTab === 'nav' && (
            <div className="relative w-full h-full">
              <SoundMap
                userLat={geoState.latitude}
                userLon={geoState.longitude}
                currentDb={decibels}
                isListening={isListening}
                logs={logs}
                activeRoute={activeRoute}
                fastestRoute={fastestRoute}
                quietestRoute={quietestRoute}
                avoidNoiseRoute={avoidNoiseRoute}
                origin={origin}
                destination={destination}
                simulationState={simulationState}
                communityReports={communityReports}
                onOpenReportModal={() => setShowReportModal(true)}
                onMapClickSetOrigin={handleMapSetOrigin}
                onMapClickSetDestination={handleMapSetDestination}
                onSimulateLocation={(lat, lon) => {
                  geoManager.setSimulatedLocation(lat, lon, 5);
                  handleMapSetOrigin(lat, lon);
                }}
                isFullScreenMode={true}
              />

              {/* Mobile-Only Top Floating Search Header */}
              {!simulationState.isActive && (
                <div className="md:hidden absolute top-3 left-3 right-3 z-[450] max-w-lg mx-auto pointer-events-auto">
                  <div className="bg-stone-950/95 border border-stone-800 rounded-3xl p-3 shadow-2xl backdrop-blur-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-amber-500 text-stone-950 font-black text-sm flex items-center justify-center shadow-md">
                          L
                        </div>
                        <span className="font-extrabold text-sm tracking-tight text-white">LOUD NYC</span>
                        {isCalculatingRoutes && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Routing...</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setShowReportModal(true)}
                          className="px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black flex items-center gap-1 shadow-md cursor-pointer"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 fill-current" />
                          <span>+ Log</span>
                        </button>
                        <button
                          onClick={handleUseCurrentLocation}
                          disabled={isLocating}
                          className="px-2 py-1 rounded-xl bg-stone-900 border border-stone-800 text-xs font-bold text-sky-400 flex items-center gap-1 cursor-pointer"
                        >
                          <Locate className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                          <span>GPS</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <AddressSearchInput
                        id="mobile-origin-input"
                        value={origin}
                        onChange={(wp) => {
                          handleEndNavigation();
                          setOrigin(wp);
                        }}
                        placeholder="Point A (Start)..."
                        dotColor="emerald"
                        onUseCurrentLocation={handleUseCurrentLocation}
                      />
                      <AddressSearchInput
                        id="mobile-destination-input"
                        value={destination}
                        onChange={(wp) => {
                          handleEndNavigation();
                          setDestination(wp);
                        }}
                        placeholder="Point B (Destination)..."
                        dotColor="rose"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Drawer (Only on small screens) */}
              {!simulationState.isActive && fastestRoute && quietestRoute && (
                <div className="md:hidden">
                  <MobileNavDrawer
                    origin={origin}
                    destination={destination}
                    fastestRoute={fastestRoute}
                    quietestRoute={quietestRoute}
                    avoidNoiseRoute={avoidNoiseRoute}
                    delta={routeDelta}
                    selectedSilenceLevel={selectedSilenceLevel}
                    onSelectSilenceLevel={setSelectedSilenceLevel}
                    onSelectPresetRoute={handleSelectPresetRoute}
                    onSwapLocations={handleSwapLocations}
                    onUseCurrentLocation={handleUseCurrentLocation}
                    onStartNavigation={handleStartNavigation}
                  />
                </div>
              )}

              {/* Active Navigation HUD (Both Desktop and Mobile) */}
              {simulationState.isActive && activeRoute && (
                <MobileNavigationHUD
                  route={activeRoute}
                  simulationState={simulationState}
                  liveDecibels={decibels}
                  isListening={isListening}
                  onToggleMic={handleToggleMic}
                  onPause={handlePauseNavigation}
                  onResume={handleResumeNavigation}
                  onEndNavigation={handleEndNavigation}
                />
              )}
            </div>
          )}

          {/* Standalone Map Tab */}
          {activeTab === 'map' && (
            <div className="w-full h-full">
              <SoundMap
                userLat={geoState.latitude}
                userLon={geoState.longitude}
                currentDb={decibels}
                isListening={isListening}
                logs={logs}
                fastestRoute={fastestRoute}
                quietestRoute={quietestRoute}
                avoidNoiseRoute={avoidNoiseRoute}
                activeRoute={activeRoute}
                origin={origin}
                destination={destination}
                communityReports={communityReports}
                onOpenReportModal={() => setShowReportModal(true)}
                onMapClickSetOrigin={handleMapSetOrigin}
                onMapClickSetDestination={handleMapSetDestination}
                onSimulateLocation={(lat, lon) => {
                  geoManager.setSimulatedLocation(lat, lon, 5);
                  handleMapSetOrigin(lat, lon);
                }}
                isFullScreenMode={true}
              />
            </div>
          )}

          {/* Decibel Meter Tab */}
          {activeTab === 'meter' && (
            <div className="w-full h-full overflow-y-auto p-4 pb-20 max-w-lg mx-auto space-y-4">
              <PermissionBanner
                micState={micState}
                geoState={geoState}
                onRetryMic={handleToggleMic}
                onRetryGeo={handleUseCurrentLocation}
                onEnableDemoMode={() => {
                  geoManager.setSimulatedLocation(40.7580, -73.9855, 5);
                }}
              />

              <DecibelMeter
                decibels={decibels}
                stats={stats}
                isListening={isListening}
                frequencyData={frequencyData}
                rawFreqBuffer={rawFreqBuffer}
                calibrationOffset={calibrationOffset}
                onToggleMic={handleToggleMic}
                onCalibrationChange={setCalibrationOffset}
                onManualLog={logCurrentReading}
                hasLocation={Boolean(geoState.latitude && geoState.longitude)}
              />
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="w-full h-full overflow-y-auto p-4 pb-20 max-w-2xl mx-auto">
              <SoundLogTable
                logs={logs}
                isAutoLogging={isAutoLogging}
                logIntervalSec={logIntervalSec}
                onToggleAutoLog={() => setIsAutoLogging(!isAutoLogging)}
                onIntervalChange={setLogIntervalSec}
                onClearLogs={handleClearLogs}
                onDeleteEntry={handleDeleteEntry}
              />
            </div>
          )}
        </main>
      </div>

      {/* Bottom Navigation Tab Bar */}
      <nav className="h-16 bg-stone-950 border-t border-stone-800/80 px-4 flex items-center justify-around z-[700] shrink-0">
        <button
          id="tab-nav"
          onClick={() => setActiveTab('nav')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'nav' ? 'text-amber-400 font-bold scale-105' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Navigate</span>
        </button>

        <button
          id="tab-map"
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'map' ? 'text-amber-400 font-bold scale-105' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Noise Map</span>
        </button>

        <button
          id="tab-meter"
          onClick={() => setActiveTab('meter')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'meter' ? 'text-amber-400 font-bold scale-105' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <div className="relative">
            <Volume2 className="w-5 h-5" />
            {isListening && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Meter</span>
        </button>

        <button
          id="tab-logs"
          onClick={() => setActiveTab('logs')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'logs' ? 'text-amber-400 font-bold scale-105' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Logs ({logs.length})</span>
        </button>
      </nav>

      {/* Log Real Noisy Spot / Report Modal */}
      {showReportModal && (
        <ReportNoiseModal
          userLat={geoState.latitude}
          userLon={geoState.longitude}
          currentDecibels={decibels}
          onClose={() => setShowReportModal(false)}
          onSubmitReport={handleSubmitCommunityReport}
        />
      )}

      {/* Data & Methodology Modal */}
      {showDataModal && (
        <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Official NYC Acoustic Datasets</h3>
                  <p className="text-[11px] text-stone-400">Live API Data Sources & Methodology</p>
                </div>
              </div>
              <button
                onClick={() => setShowDataModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-300">
              <div className="p-3 bg-stone-950/70 border border-purple-500/30 rounded-2xl space-y-1">
                <div className="font-bold text-purple-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>1. Official NYC 311 Noise OpenData API</span>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Live Socrata API query directly from <code>data.cityofnewyork.us</code> tracking real 311 noise complaints filed across all 5 boroughs.
                </p>
              </div>

              <div className="p-3 bg-stone-950/70 border border-rose-500/30 rounded-2xl space-y-1">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>2. MTA Curved Track Screech & Elevated Rail</span>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Acoustic footprint of high-frequency steel wheel flange squeal (e.g., Grand Central 4/5/6 express curve, Union Sq) and overhead elevated lines (7 line on Roosevelt Ave, J/M/Z on Broadway).
                </p>
              </div>

              <div className="p-3 bg-stone-950/70 border border-orange-500/30 rounded-2xl space-y-1">
                <div className="font-bold text-orange-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>3. NYC DOT Traffic & Emergency Siren Canyons</span>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Vehicular flow volume, FDR/bridge approach acoustics, and echoing emergency sirens along primary hospital response corridors (1st Ave Bellevue corridor).
                </p>
              </div>

              <div className="p-3 bg-stone-950/70 border border-yellow-500/30 rounded-2xl space-y-1">
                <div className="font-bold text-yellow-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>4. NYC DOB Active Construction Permits</span>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  High-intensity infrastructure developments with jackhammering, pile-driving, and heavy crane operations (Penn Station area, Hudson Yards).
                </p>
              </div>

              <div className="p-3 bg-stone-950/70 border border-emerald-500/30 rounded-2xl space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>5. NYC Parks & Acoustic Sanctuaries</span>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Negative-noise buffer zones including Central Park (The Ramble, Conservatory Water), Fort Tryon & The Cloisters, Green-Wood Cemetery, and Brooklyn Botanic Garden.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDataModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
