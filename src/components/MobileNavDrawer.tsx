import React, { useState } from 'react';
import { 
  Zap, 
  Trees, 
  ArrowUpDown, 
  Navigation, 
  Play, 
  ChevronUp, 
  ChevronDown, 
  ShieldCheck, 
  Clock, 
  Volume2, 
  Sparkles,
  MoveRight,
  CornerDownRight,
  CornerUpRight
} from 'lucide-react';
import { 
  NavRoute, 
  PresetRoute, 
  RouteComparisonDelta, 
  SilenceLevel, 
  Waypoint 
} from '../types';
import { NYC_PRESET_ROUTES, SILENCE_LEVEL_CONFIGS } from '../data/nycSoundData';
import { RouteProfileChart } from './RouteProfileChart';

interface MobileNavDrawerProps {
  origin: Waypoint;
  destination: Waypoint;
  fastestRoute: NavRoute;
  avoidNoiseRoute: NavRoute;
  delta: RouteComparisonDelta;
  selectedSilenceLevel: SilenceLevel;
  onSelectSilenceLevel: (level: SilenceLevel) => void;
  onSelectPresetRoute: (preset: PresetRoute) => void;
  onSwapLocations: () => void;
  onUseCurrentLocation: () => void;
  onStartNavigation: () => void;
  onStepClick?: (stepIndex: number) => void;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  origin,
  destination,
  fastestRoute,
  avoidNoiseRoute,
  delta,
  selectedSilenceLevel,
  onSelectSilenceLevel,
  onSelectPresetRoute,
  onSwapLocations,
  onUseCurrentLocation,
  onStartNavigation,
  onStepClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeRoute = selectedSilenceLevel === 'avoid-noise' ? avoidNoiseRoute : fastestRoute;

  const getStepIcon = (instruction: string) => {
    const lower = instruction.toLowerCase();
    if (lower.includes('left')) return CornerDownRight;
    if (lower.includes('right')) return CornerUpRight;
    return MoveRight;
  };

  return (
    <div className="absolute bottom-16 left-0 right-0 z-[500] max-w-lg mx-auto px-3 pointer-events-auto">
      <div className="bg-stone-950/95 border border-stone-800 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300">
        
        {/* Drawer Pull Handle */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer select-none hover:bg-stone-900/40"
        >
          <div className="w-10 h-1 rounded-full bg-stone-700 mb-1" />
          <div className="flex items-center gap-1 text-[11px] font-semibold text-stone-400">
            <span>{isExpanded ? 'Hide Details' : 'Route Details & Profile'}</span>
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* 2 Route Choice Comparison Cards */}
        <div className="p-3 pt-1">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* 1. Fastest Commute Option */}
            <button
              id="select-fastest-route-btn"
              onClick={() => onSelectSilenceLevel('fastest')}
              className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                selectedSilenceLevel === 'fastest'
                  ? 'bg-rose-950/30 border-rose-500 shadow-md ring-1 ring-rose-500/50 text-white'
                  : 'bg-stone-900/80 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Zap className="w-4 h-4 text-rose-400" />
                    <span>Fastest</span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-400 font-bold">
                    ~{fastestRoute.averageDecibels} dB
                  </span>
                </div>
                <div className="text-lg font-black font-mono text-white">
                  {fastestRoute.durationMinutes} <span className="text-xs font-normal text-stone-400">min</span>
                </div>
                <div className="text-[10px] text-stone-500 truncate">
                  {(fastestRoute.distanceMeters / 1000).toFixed(2)} km • Direct Avenue
                </div>
              </div>

              <div className="mt-2 text-[10px] font-mono text-rose-400/80 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 text-center">
                ⚠️ High Avenue Noise
              </div>
            </button>

            {/* 2. No Noise Route Option */}
            <button
              id="select-avoid-noise-route-btn"
              onClick={() => onSelectSilenceLevel('avoid-noise')}
              className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                selectedSilenceLevel === 'avoid-noise'
                  ? 'bg-cyan-950/30 border-cyan-500 shadow-md ring-1 ring-cyan-500/50 text-white'
                  : 'bg-stone-900/80 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-300">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>No Noise</span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">
                    ~{avoidNoiseRoute.averageDecibels} dB
                  </span>
                </div>
                <div className="text-lg font-black font-mono text-white">
                  {avoidNoiseRoute.durationMinutes} <span className="text-xs font-normal text-stone-400">min</span>
                </div>
                <div className="text-[10px] text-stone-500 truncate">
                  {(avoidNoiseRoute.distanceMeters / 1000).toFixed(2)} km • Avoid Noise Corridor
                </div>
              </div>

              {/* dB Reduction Advantage Pill */}
              <div className="mt-2 text-[10px] font-mono text-cyan-300 font-bold bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/30 text-center">
                🤫 -{delta.avoidNoiseDecibelReduction} dB less noise!
              </div>
            </button>
          </div>

          {/* Primary Action: Start Navigation Button */}
          <button
            id="start-mobile-nav-btn"
            onClick={onStartNavigation}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
              selectedSilenceLevel === 'avoid-noise'
                ? 'bg-cyan-500 hover:bg-cyan-400 text-stone-950 shadow-cyan-900/30'
                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-900/30'
            }`}
          >
            <Navigation className="w-4 h-4 fill-current" />
            <span>
              Start Walking ({selectedSilenceLevel === 'avoid-noise' ? 'No Noise Route' : 'Fastest Commute'})
            </span>
          </button>
        </div>

        {/* Expanded Drawer View: Detailed Profile & Turn-by-Turn */}
        {isExpanded && (
          <div className="p-3 pt-0 border-t border-stone-800/80 space-y-3 max-h-72 sm:max-h-96 overflow-y-auto">
            
            {/* Decibel Elevation Chart */}
            <div className="pt-2">
              <RouteProfileChart route={activeRoute} />
            </div>

            {/* Turn-by-Turn Guidance List */}
            <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-sky-400" />
                <span>Turn-by-Turn Guidance ({activeRoute.steps.length} steps)</span>
              </div>

              <div className="divide-y divide-stone-800/60">
                {activeRoute.steps.map((step, idx) => {
                  const Icon = getStepIcon(step.instruction);
                  return (
                    <div
                      key={idx}
                      onClick={() => onStepClick && onStepClick(idx)}
                      className="py-2.5 flex items-start gap-2.5 text-xs hover:bg-stone-800/40 rounded-lg px-1 transition-colors cursor-pointer"
                    >
                      <div className="p-1 rounded-md bg-stone-800 text-stone-300 shrink-0 mt-0.5">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-stone-200">{step.instruction}</span>
                          <span className="text-[10px] font-mono text-stone-400 shrink-0">
                            {step.distanceMeters > 0 ? `${step.distanceMeters}m` : 'End'}
                          </span>
                        </div>
                        {step.acousticAdvantage && (
                          <div className="text-[10px] text-emerald-400 mt-0.5">
                            {step.acousticAdvantage}
                          </div>
                        )}
                        {step.acousticWarning && (
                          <div className="text-[10px] text-rose-400 mt-0.5">
                            {step.acousticWarning}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preset Route Quick Switcher */}
            <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-2xl">
              <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
                📍 Preset NYC Walking Trips:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NYC_PRESET_ROUTES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPresetRoute(p)}
                    className="px-2.5 py-1 rounded-xl bg-stone-950 hover:bg-stone-800 text-stone-300 border border-stone-800 text-[11px] transition-colors"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
