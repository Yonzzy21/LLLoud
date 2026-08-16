import React from 'react';
import { 
  Navigation, 
  Pause, 
  Play, 
  X, 
  Volume2, 
  Mic,
  MicOff,
  CornerDownRight, 
  CornerUpRight, 
  MoveRight, 
  CheckCircle,
  Trees,
  Zap,
  VolumeX,
  Radio,
  ShieldCheck
} from 'lucide-react';
import { NavRoute, NavigationSimulationState } from '../types';
import { getCategoryColor } from '../utils/audioEngine';

interface MobileNavigationHUDProps {
  route: NavRoute;
  simulationState: NavigationSimulationState;
  liveDecibels?: number;
  isListening?: boolean;
  onToggleMic?: () => void;
  onPause: () => void;
  onResume: () => void;
  onEndNavigation: () => void;
  onNextStep?: () => void;
  onPrevStep?: () => void;
}

export const MobileNavigationHUD: React.FC<MobileNavigationHUDProps> = ({
  route,
  simulationState,
  liveDecibels = 0,
  isListening = false,
  onToggleMic,
  onPause,
  onResume,
  onEndNavigation,
}) => {
  const currentStep = route.steps[simulationState.currentStepIndex] || route.steps[0];
  const isAvoidNoise = route.silenceLevel === 'avoid-noise';
  const isQuietest = route.silenceLevel === 'quietest';
  const isQuiet = isQuietest || isAvoidNoise;

  // Display either the live mic SPL reading or the simulated point acoustic level
  const displayedDecibels = isListening && liveDecibels > 0 ? liveDecibels : simulationState.currentDecibels;

  const catStyle = getCategoryColor(
    displayedDecibels < 45 ? 'Quiet / Whisper' :
    displayedDecibels < 65 ? 'Moderate Ambient' :
    displayedDecibels < 78 ? 'Busy City / Traffic' :
    displayedDecibels < 88 ? 'Heavy Transit' : 'Extreme / Sirens'
  );

  const getStepIcon = (instruction: string) => {
    const lower = instruction.toLowerCase();
    if (lower.includes('left')) return CornerDownRight;
    if (lower.includes('right')) return CornerUpRight;
    return MoveRight;
  };

  const StepIcon = getStepIcon(currentStep.instruction);

  // Remaining distance & time
  const remainingDist = Math.max(0, Math.round(route.distanceMeters * (1 - simulationState.progressPercent / 100)));
  const remainingMins = Math.max(1, Math.round(remainingDist / 1.3 / 60));

  return (
    <div className="absolute inset-0 pointer-events-none z-[600] flex flex-col justify-between p-3 sm:p-4">
      {/* 1. Top Floating Navigation Direction Banner */}
      <div className="max-w-lg mx-auto w-full pointer-events-auto">
        <div className={`p-4 rounded-3xl shadow-2xl border backdrop-blur-xl flex items-start gap-3.5 transition-all ${
          isAvoidNoise
            ? 'bg-cyan-950/90 border-cyan-500/60 text-cyan-100'
            : isQuietest
            ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100'
            : 'bg-rose-950/90 border-rose-500/60 text-rose-100'
        }`}>
          {/* Turn Arrow Icon Box */}
          <div className={`p-3 rounded-2xl shrink-0 font-black shadow-lg ${
            isAvoidNoise ? 'bg-cyan-500 text-stone-950' : isQuietest ? 'bg-emerald-500 text-stone-950' : 'bg-rose-500 text-white'
          }`}>
            <StepIcon className="w-6 h-6 stroke-[2.5]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-80 flex items-center gap-1">
                {isAvoidNoise ? <ShieldCheck className="w-3.5 h-3.5" /> : isQuietest ? <Trees className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                <span>{route.title}</span>
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                Step {simulationState.currentStepIndex + 1}/{route.steps.length}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-black tracking-tight leading-snug mt-0.5">
              {currentStep.instruction}
            </h2>

            {/* Acoustic Advice Highlight */}
            {currentStep.acousticAdvantage && (
              <div className="text-xs font-semibold text-emerald-300 mt-1 flex items-center gap-1">
                <span>{currentStep.acousticAdvantage}</span>
              </div>
            )}
            {currentStep.acousticWarning && (
              <div className="text-xs font-semibold text-rose-300 mt-1 flex items-center gap-1">
                <span>{currentStep.acousticWarning}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Floating Dynamic Live Decibel Gauge Bubble */}
      <div className="max-w-lg mx-auto w-full flex justify-end pointer-events-auto my-auto pr-2">
        <div
          onClick={onToggleMic}
          className={`p-3.5 rounded-3xl bg-stone-950/95 border shadow-2xl backdrop-blur-md flex flex-col items-center justify-center transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95 ${
            isListening ? 'ring-2 ring-emerald-500/50' : 'border-stone-800'
          }`}
          style={{ borderColor: isListening ? `${catStyle.hex}80` : '#3f3f46' }}
          title={isListening ? 'Microphone Active (Streaming Live Sound)' : 'Click to Enable Live Mic'}
        >
          <div className="flex items-center gap-1.5 text-[9px] uppercase font-mono font-bold text-stone-400">
            {isListening ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-emerald-400 font-extrabold">LIVE MIC</span>
              </>
            ) : (
              <>
                <Mic className="w-3 h-3 text-stone-400" />
                <span>TAP FOR MIC</span>
              </>
            )}
          </div>

          <div className="flex items-baseline gap-1 my-0.5">
            <span
              className="text-2xl font-black font-mono tracking-tight transition-colors"
              style={{ color: isListening ? catStyle.hex : '#9ca3af' }}
            >
              {displayedDecibels > 0 ? displayedDecibels.toFixed(1) : '--.-'}
            </span>
            <span className="text-[10px] font-bold text-stone-400">dB</span>
          </div>

          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5"
            style={{ 
              backgroundColor: isListening ? `${catStyle.hex}25` : '#27272a', 
              color: isListening ? catStyle.hex : '#a1a1aa' 
            }}
          >
            {isListening 
              ? (displayedDecibels < 50 ? '🌿 Sanctuary' : displayedDecibels < 70 ? '🏙️ City' : '⚠️ Loud')
              : '🎙️ Tap to Stream'}
          </span>
        </div>
      </div>

      {/* 3. Bottom Floating Walking HUD & Action Bar */}
      <div className="max-w-lg mx-auto w-full pointer-events-auto">
        <div className="bg-stone-950/95 border border-stone-800 rounded-3xl p-4 shadow-2xl backdrop-blur-xl">
          
          {/* Progress Bar */}
          <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden mb-3 border border-stone-800">
            <div
              className={`h-full transition-all duration-200 ${
                isAvoidNoise ? 'bg-cyan-500' : isQuietest ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
              style={{ width: `${simulationState.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-black font-mono text-white">
                {remainingMins} <span className="text-sm font-semibold text-stone-400">min</span>
              </div>
              <div className="text-xs text-stone-400 font-mono">
                {remainingDist} m remaining • {Math.round(simulationState.progressPercent)}% done
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Mic Quick Toggle */}
              <button
                onClick={onToggleMic}
                className={`p-3 rounded-2xl border transition-all ${
                  isListening
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-md'
                    : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-white'
                }`}
                title={isListening ? 'Mute Microphone' : 'Enable Live Microphone'}
              >
                {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              {simulationState.isPaused ? (
                <button
                  id="hud-resume-btn"
                  onClick={onResume}
                  className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold transition-transform active:scale-95 shadow-lg"
                  title="Resume Walk"
                >
                  <Play className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button
                  id="hud-pause-btn"
                  onClick={onPause}
                  className="p-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-transform active:scale-95 shadow-lg"
                  title="Pause Walk"
                >
                  <Pause className="w-5 h-5 fill-current" />
                </button>
              )}

              <button
                id="hud-end-nav-btn"
                onClick={onEndNavigation}
                className="p-3 rounded-2xl bg-stone-900 hover:bg-rose-950 text-stone-400 hover:text-rose-400 border border-stone-800 hover:border-rose-700 transition-colors"
                title="End Navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
