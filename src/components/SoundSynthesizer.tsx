import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Volume2, 
  VolumeX, 
  Train, 
  Siren, 
  Car, 
  Trees, 
  Activity, 
  Sliders, 
  Info,
  Footprints
} from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { NYC_SOUND_ZONES } from '../data/nycSoundData';

interface SoundSynthesizerProps {
  onSimulateTourPoint?: (lat: number, lon: number, name: string, dbEst: number) => void;
}

export const SoundSynthesizer: React.FC<SoundSynthesizerProps> = ({
  onSimulateTourPoint
}) => {
  const [playingSounds, setPlayingSounds] = useState<{ [key: string]: boolean }>({
    subway: false,
    siren: false,
    traffic: false,
    park: false,
  });

  const [volumes, setVolumes] = useState<{ [key: string]: number }>({
    subway: 0.6,
    siren: 0.5,
    traffic: 0.55,
    park: 0.4,
  });

  const [activeTourIndex, setActiveTourIndex] = useState<number | null>(null);

  // Sync state on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopAllSynths();
    };
  }, []);

  const handleToggleSound = (type: 'subway' | 'siren' | 'traffic' | 'park') => {
    const isCurrentlyPlaying = playingSounds[type];
    if (isCurrentlyPlaying) {
      audioEngine.stopSynthSound(type);
      setPlayingSounds((prev) => ({ ...prev, [type]: false }));
    } else {
      audioEngine.playSynthSound(type, volumes[type]);
      setPlayingSounds((prev) => ({ ...prev, [type]: true }));
    }
  };

  const handleVolumeChange = (type: 'subway' | 'siren' | 'traffic' | 'park', val: number) => {
    setVolumes((prev) => ({ ...prev, [type]: val }));
    if (playingSounds[type]) {
      audioEngine.playSynthSound(type, val);
    }
  };

  const stopAll = () => {
    audioEngine.stopAllSynths();
    setPlayingSounds({ subway: false, siren: false, traffic: false, park: false });
    setActiveTourIndex(null);
  };

  // Preset NYC acoustic walking tour
  const acousticTour = [
    { name: 'Grand Central 4/5/6 Curve', lat: 40.7517, lon: -73.9767, soundType: 'subway' as const, db: 91, icon: Train },
    { name: 'NYU Bellevue Trauma Corridor', lat: 40.7397, lon: -73.9754, soundType: 'siren' as const, db: 96, icon: Siren },
    { name: 'Times Square Crossroads', lat: 40.7580, lon: -73.9855, soundType: 'traffic' as const, db: 83, icon: Car },
    { name: 'Central Park Ramble Oasis', lat: 40.7766, lon: -73.9690, soundType: 'park' as const, db: 44, icon: Trees },
  ];

  const handleTourStep = (index: number) => {
    const step = acousticTour[index];
    setActiveTourIndex(index);

    // Stop current synths and play the specific soundscape
    audioEngine.stopAllSynths();
    audioEngine.playSynthSound(step.soundType, volumes[step.soundType] || 0.6);
    setPlayingSounds({
      subway: step.soundType === 'subway',
      siren: step.soundType === 'siren',
      traffic: step.soundType === 'traffic',
      park: step.soundType === 'park',
    });

    if (onSimulateTourPoint) {
      onSimulateTourPoint(step.lat, step.lon, step.name, step.db);
    }
  };

  return (
    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-stone-300 uppercase">NYC Sound Synthesizer & Density Engine</h2>
            <p className="text-xs text-stone-500">Pure Web Audio acoustic simulation of NYC soundscapes</p>
          </div>
        </div>

        {Object.values(playingSounds).some(Boolean) && (
          <button
            onClick={stopAll}
            className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition-colors"
          >
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            <span>Mute All Audio</span>
          </button>
        )}
      </div>

      {/* Acoustic Walking Tour Simulation Bar */}
      <div className="mb-5 p-3.5 bg-stone-950/70 border border-stone-800 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-300">
            <Footprints className="w-4 h-4 text-amber-400" />
            <span>Instant NYC Soundscape Tour</span>
          </div>
          <span className="text-[11px] text-stone-500">Click to jump GPS + synthesize audio</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {acousticTour.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeTourIndex === idx;
            return (
              <button
                key={step.name}
                onClick={() => handleTourStep(idx)}
                className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500 text-stone-100 shadow-md shadow-amber-950/40'
                    : 'bg-stone-900/90 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                  <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-amber-300' : 'text-stone-500'}`}>
                    ~{step.db} dB
                  </span>
                </div>
                <div className="text-xs font-medium leading-tight line-clamp-1">{step.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Synthesizer Control Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 1. Subway Screech */}
        <div className={`p-4 rounded-xl border transition-all ${
          playingSounds.subway
            ? 'bg-rose-950/40 border-rose-700/60 shadow-lg shadow-rose-950/20'
            : 'bg-stone-950/60 border-stone-800/80'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${playingSounds.subway ? 'bg-rose-500 text-white' : 'bg-stone-800 text-stone-400'}`}>
                <Train className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-200">Subway Track Screech & Rail Rumble</h3>
                <p className="text-[11px] text-stone-500">2.8kHz resonant wheel squeal + lowpass brown rumble</p>
              </div>
            </div>
            <button
              onClick={() => handleToggleSound('subway')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                playingSounds.subway
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              {playingSounds.subway ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-[11px] text-stone-500">Vol:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={volumes.subway}
              onChange={(e) => handleVolumeChange('subway', Number(e.target.value))}
              className="flex-1 h-1 bg-stone-800 rounded appearance-none accent-rose-500"
            />
            <span className="text-[10px] font-mono text-stone-400">{Math.round(volumes.subway * 100)}%</span>
          </div>
        </div>

        {/* 2. Emergency Siren */}
        <div className={`p-4 rounded-xl border transition-all ${
          playingSounds.siren
            ? 'bg-amber-950/40 border-amber-700/60 shadow-lg shadow-amber-950/20'
            : 'bg-stone-950/60 border-stone-800/80'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${playingSounds.siren ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400'}`}>
                <Siren className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-200">EMS / NYPD Emergency Siren</h3>
                <p className="text-[11px] text-stone-500">Dual-tone sawtooth wail (650–1250Hz sweep)</p>
              </div>
            </div>
            <button
              onClick={() => handleToggleSound('siren')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                playingSounds.siren
                  ? 'bg-amber-500 text-stone-950 hover:bg-amber-400 font-bold'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              {playingSounds.siren ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-[11px] text-stone-500">Vol:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={volumes.siren}
              onChange={(e) => handleVolumeChange('siren', Number(e.target.value))}
              className="flex-1 h-1 bg-stone-800 rounded appearance-none accent-amber-500"
            />
            <span className="text-[10px] font-mono text-stone-400">{Math.round(volumes.siren * 100)}%</span>
          </div>
        </div>

        {/* 3. Midtown Traffic & Taxi Horns */}
        <div className={`p-4 rounded-xl border transition-all ${
          playingSounds.traffic
            ? 'bg-orange-950/40 border-orange-700/60 shadow-lg shadow-orange-950/20'
            : 'bg-stone-950/60 border-stone-800/80'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${playingSounds.traffic ? 'bg-orange-500 text-stone-950' : 'bg-stone-800 text-stone-400'}`}>
                <Car className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-200">Avenue Traffic & Taxi Horn Blasts</h3>
                <p className="text-[11px] text-stone-500">450Hz bandpass road roar + harmonic brass horn pulses</p>
              </div>
            </div>
            <button
              onClick={() => handleToggleSound('traffic')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                playingSounds.traffic
                  ? 'bg-orange-500 text-stone-950 hover:bg-orange-400 font-bold'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              {playingSounds.traffic ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-[11px] text-stone-500">Vol:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={volumes.traffic}
              onChange={(e) => handleVolumeChange('traffic', Number(e.target.value))}
              className="flex-1 h-1 bg-stone-800 rounded appearance-none accent-orange-500"
            />
            <span className="text-[10px] font-mono text-stone-400">{Math.round(volumes.traffic * 100)}%</span>
          </div>
        </div>

        {/* 4. Quiet Park Breeze */}
        <div className={`p-4 rounded-xl border transition-all ${
          playingSounds.park
            ? 'bg-emerald-950/40 border-emerald-700/60 shadow-lg shadow-emerald-950/20'
            : 'bg-stone-950/60 border-stone-800/80'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${playingSounds.park ? 'bg-emerald-500 text-stone-950' : 'bg-stone-800 text-stone-400'}`}>
                <Trees className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-200">Central Park Ramble Oasis</h3>
                <p className="text-[11px] text-stone-500">320Hz lowpass canopy rustle & stream trickle</p>
              </div>
            </div>
            <button
              onClick={() => handleToggleSound('park')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                playingSounds.park
                  ? 'bg-emerald-500 text-stone-950 hover:bg-emerald-400 font-bold'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              {playingSounds.park ? <Volume2 className="w-4 h-4 animate-pulse" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-[11px] text-stone-500">Vol:</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={volumes.park}
              onChange={(e) => handleVolumeChange('park', Number(e.target.value))}
              className="flex-1 h-1 bg-stone-800 rounded appearance-none accent-emerald-500"
            />
            <span className="text-[10px] font-mono text-stone-400">{Math.round(volumes.park * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
