import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, ShieldAlert, Sparkles, Sliders, MapPin } from 'lucide-react';
import { classifyDecibels, getCategoryColor } from '../utils/audioEngine';
import { DecibelStats, FrequencyData } from '../types';

interface DecibelMeterProps {
  decibels: number;
  stats: DecibelStats;
  isListening: boolean;
  frequencyData: FrequencyData;
  rawFreqBuffer: Uint8Array | null;
  calibrationOffset: number;
  onToggleMic: () => void;
  onCalibrationChange: (offset: number) => void;
  onManualLog: () => void;
  hasLocation: boolean;
}

export const DecibelMeter: React.FC<DecibelMeterProps> = ({
  decibels,
  stats,
  isListening,
  frequencyData,
  rawFreqBuffer,
  calibrationOffset,
  onToggleMic,
  onCalibrationChange,
  onManualLog,
  hasLocation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);

  const category = classifyDecibels(decibels);
  const colorStyle = getCategoryColor(category);

  // Meter percentage (30 dB = 0%, 115 dB = 100%)
  const minDb = 30;
  const maxDb = 115;
  const percentage = Math.min(100, Math.max(0, ((decibels - minDb) / (maxDb - minDb)) * 100));

  // Canvas waveform & frequency visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (!isListening || !rawFreqBuffer) {
        // Flat idle line
        ctx.beginPath();
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      // Draw dynamic real-time frequency bars
      const barCount = 32;
      const barWidth = (width / barCount) - 2;
      const step = Math.floor(rawFreqBuffer.length / barCount);

      for (let i = 0; i < barCount; i++) {
        const val = rawFreqBuffer[i * step] || 0;
        const barHeight = (val / 255) * (height - 6);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Color based on frequency zone
        if (i < 8) {
          ctx.fillStyle = '#38bdf8'; // Lows (Subway rumble / engine)
        } else if (i < 20) {
          ctx.fillStyle = '#f59e0b'; // Mids (Traffic / voice)
        } else {
          ctx.fillStyle = '#f43f5e'; // Highs (Screech / sirens)
        }

        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isListening, rawFreqBuffer]);

  return (
    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
      {/* Background dynamic glow based on current decibels */}
      <div
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none transition-all duration-300"
        style={{ backgroundColor: colorStyle.hex }}
      />

      {/* Header with Title & Setting Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${isListening ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800 text-stone-400'}`}>
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-stone-300 uppercase">Live Decibel Meter</h2>
            <p className="text-xs text-stone-500">Real-time Web Audio SPL Analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="toggle-calibration-btn"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg text-xs font-medium transition-colors border ${
              showSettings
                ? 'bg-stone-800 text-amber-400 border-amber-500/30'
                : 'bg-stone-950/60 text-stone-400 border-stone-800 hover:text-stone-200'
            }`}
            title="Adjust Microphone Calibration"
          >
            <Sliders className="w-4 h-4 inline-block mr-1" />
            <span className="hidden sm:inline">Calibrate</span>
          </button>
        </div>
      </div>

      {/* Calibration Slider Panel */}
      {showSettings && (
        <div className="mb-4 p-3 bg-stone-950/80 border border-stone-800 rounded-xl text-xs text-stone-300">
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-medium text-stone-200">Microphone Calibration Offset</span>
            <span className="font-mono text-amber-400 font-bold">{calibrationOffset} dB</span>
          </div>
          <input
            id="calibration-slider"
            type="range"
            min="70"
            max="120"
            step="1"
            value={calibrationOffset}
            onChange={(e) => onCalibrationChange(Number(e.target.value))}
            className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[11px] text-stone-500 mt-1">
            Different device microphones have varying sensitivity. Standard phones calibrate best around 95–102 dB.
          </p>
        </div>
      )}

      {/* Primary Decibel Readout Card */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center my-2">
        {/* Main dB Circular / Big Digits */}
        <div className="md:col-span-6 flex flex-col items-center justify-center p-5 bg-stone-950/70 border border-stone-800/80 rounded-2xl relative">
          <div className="flex items-baseline gap-2">
            <span
              id="decibel-main-value"
              className="text-6xl sm:text-7xl font-extrabold tracking-tight font-mono transition-colors duration-150"
              style={{ color: isListening ? colorStyle.hex : '#71717a' }}
            >
              {isListening ? decibels.toFixed(1) : '--.-'}
            </span>
            <span className="text-xl font-bold text-stone-400">dB</span>
          </div>

          {/* Sound Classification Badge */}
          <div className="mt-3">
            <span
              id="sound-category-badge"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                isListening ? colorStyle.badge : 'bg-stone-800/60 text-stone-400 border-stone-700/50'
              }`}
            >
              {decibels > 85 ? <ShieldAlert className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isListening ? category : 'Microphone Inactive'}
            </span>
          </div>

          {/* Real-time Visual Meter Bar */}
          <div className="w-full mt-5">
            <div className="flex justify-between text-[10px] text-stone-500 font-mono mb-1">
              <span>30 dB (Quiet)</span>
              <span>70 dB (City)</span>
              <span>115 dB (Hazard)</span>
            </div>
            <div className="h-3 w-full bg-stone-800 rounded-full overflow-hidden p-0.5 border border-stone-700/50">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: isListening ? `${percentage}%` : '0%',
                  backgroundColor: colorStyle.hex,
                }}
              />
            </div>
          </div>
        </div>

        {/* Real-time Spectrum & Stats */}
        <div className="md:col-span-6 flex flex-col justify-between h-full gap-3">
          {/* Frequency Visualizer Canvas */}
          <div className="bg-stone-950/70 border border-stone-800/80 rounded-2xl p-3 flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-medium text-stone-400">Acoustic Spectrum (20Hz – 10kHz)</span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="text-sky-400">■ Lows</span>
                <span className="text-amber-400">■ Mids</span>
                <span className="text-rose-400">■ Highs</span>
              </div>
            </div>
            <canvas
              ref={canvasRef}
              width={280}
              height={56}
              className="w-full h-14 rounded-lg bg-stone-900/60"
            />
            {/* Frequency band percentage indicators */}
            <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px] font-mono text-stone-400">
              <div className="bg-stone-900/80 py-0.5 rounded border border-sky-900/40">
                Lows (Subway): <span className="text-sky-300 font-bold">{Math.round(frequencyData.lows * 100)}%</span>
              </div>
              <div className="bg-stone-900/80 py-0.5 rounded border border-amber-900/40">
                Mids (Traffic): <span className="text-amber-300 font-bold">{Math.round(frequencyData.mids * 100)}%</span>
              </div>
              <div className="bg-stone-900/80 py-0.5 rounded border border-rose-900/40">
                Highs (Screech): <span className="text-rose-300 font-bold">{Math.round(frequencyData.highs * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Session Statistics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-stone-950/60 border border-stone-800 rounded-xl text-center">
              <div className="text-[10px] uppercase text-stone-500 font-semibold tracking-wider">Min</div>
              <div className="text-sm font-mono font-bold text-stone-200 mt-0.5">
                {stats.count > 0 ? `${stats.min.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="p-2.5 bg-stone-950/60 border border-stone-800 rounded-xl text-center">
              <div className="text-[10px] uppercase text-stone-500 font-semibold tracking-wider">Average</div>
              <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
                {stats.count > 0 ? `${stats.avg.toFixed(1)} dB` : '--'}
              </div>
            </div>
            <div className="p-2.5 bg-stone-950/60 border border-stone-800 rounded-xl text-center">
              <div className="text-[10px] uppercase text-stone-500 font-semibold tracking-wider">Peak Max</div>
              <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                {stats.count > 0 ? `${stats.peak.toFixed(1)} dB` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls Bar */}
      <div className="mt-5 flex flex-wrap sm:flex-nowrap gap-3">
        <button
          id="toggle-mic-btn"
          onClick={onToggleMic}
          className={`w-full sm:flex-1 py-3.5 px-6 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-[0.98] ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
              : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-900/30'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-5 h-5 animate-pulse" />
              <span>Stop Decibel Meter</span>
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              <span>Start Microphone & Meter</span>
            </>
          )}
        </button>

        <button
          id="manual-log-btn"
          onClick={onManualLog}
          disabled={!isListening && stats.count === 0}
          className={`py-3.5 px-5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border transition-all ${
            !isListening && stats.count === 0
              ? 'bg-stone-900 text-stone-600 border-stone-800 cursor-not-allowed'
              : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700 hover:border-stone-600'
          }`}
          title="Instantly save current GPS coordinate and noise reading"
        >
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>Log Point Now</span>
        </button>
      </div>

      {!hasLocation && (
        <div className="mt-2 text-center">
          <p className="text-[11px] text-amber-500/80">
            Tip: Enable GPS to tag noise readings with NYC coordinates and neighborhood data.
          </p>
        </div>
      )}
    </div>
  );
};
