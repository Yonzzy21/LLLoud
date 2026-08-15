import React, { useState } from 'react';
import { NavRoute, RouteAcousticPoint } from '../types';
import { ShieldCheck, Activity, Volume2, Info, Sparkles, AlertTriangle } from 'lucide-react';
import { getCategoryColor } from '../utils/audioEngine';

interface RouteProfileChartProps {
  route: NavRoute;
  currentHoverDist?: number | null;
  onHoverPoint?: (point: RouteAcousticPoint | null) => void;
  simulationDist?: number | null;
}

export const RouteProfileChart: React.FC<RouteProfileChartProps> = ({
  route,
  onHoverPoint,
  simulationDist,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const profile = route.acousticProfile;
  if (!profile || profile.length === 0) return null;

  const totalDist = route.distanceMeters;
  const maxDb = 100;
  const minDb = 35;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - svgRect.left) / svgRect.width));
    const targetDist = xRatio * totalDist;

    // Find closest point in profile
    let closestIdx = 0;
    let minDiff = Infinity;
    profile.forEach((p, idx) => {
      const diff = Math.abs(p.distanceFromStartMeters - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoveredIndex(closestIdx);
    if (onHoverPoint) {
      onHoverPoint(profile[closestIdx]);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    if (onHoverPoint) {
      onHoverPoint(null);
    }
  };

  // Build SVG path
  const width = 600;
  const height = 120;
  const paddingBottom = 20;
  const paddingTop = 10;

  const getX = (dist: number) => (dist / (totalDist || 1)) * width;
  const getY = (db: number) =>
    height - paddingBottom - ((db - minDb) / (maxDb - minDb)) * (height - paddingTop - paddingBottom);

  let pathD = `M ${getX(profile[0].distanceFromStartMeters)} ${getY(profile[0].decibels)}`;
  for (let i = 1; i < profile.length; i++) {
    pathD += ` L ${getX(profile[i].distanceFromStartMeters)} ${getY(profile[i].decibels)}`;
  }

  // Area fill under line
  const areaD = `${pathD} L ${width} ${height - paddingBottom} L 0 ${height - paddingBottom} Z`;

  // Simulation marker position
  const simX = simulationDist !== null && simulationDist !== undefined ? getX(simulationDist) : null;
  const hoverPoint = hoveredIndex !== null ? profile[hoveredIndex] : null;

  return (
    <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3.5 sm:p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">
            Route Acoustic Decibel Profile
          </h4>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            &lt;50 dB Quiet
          </span>
          <span className="text-amber-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            50-70 dB City
          </span>
          <span className="text-rose-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            &gt;70 dB Loud
          </span>
        </div>
      </div>

      {/* SVG Decibel Graph */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-28 cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="dbGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={route.color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={route.color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Reference Guideline: 50 dB (Quiet Haven Threshold) */}
          <line
            x1="0"
            y1={getY(50)}
            x2={width}
            y2={getY(50)}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.5"
          />
          <text x="6" y={getY(50) - 3} fill="#10b981" fontSize="9" fontFamily="monospace">
            50 dB (Quiet Sanctuary)
          </text>

          {/* Reference Guideline: 70 dB (Loud Avenue Threshold) */}
          <line
            x1="0"
            y1={getY(70)}
            x2={width}
            y2={getY(70)}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.4"
          />
          <text x="6" y={getY(70) - 3} fill="#f43f5e" fontSize="9" fontFamily="monospace">
            70 dB (Avenue Corridor)
          </text>

          {/* Area Fill */}
          <path d={areaD} fill="url(#dbGradient)" />

          {/* Decibel Line */}
          <path
            d={pathD}
            fill="none"
            stroke={route.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Distance Axis Baseline */}
          <line
            x1="0"
            y1={height - paddingBottom}
            x2={width}
            y2={height - paddingBottom}
            stroke="#52525b"
            strokeWidth="1"
          />

          {/* Distance Labels */}
          <text x="2" y={height - 5} fill="#71717a" fontSize="9" fontFamily="monospace">
            0 m (Start)
          </text>
          <text x={width / 2 - 25} y={height - 5} fill="#71717a" fontSize="9" fontFamily="monospace">
            {Math.round(totalDist / 2)} m
          </text>
          <text x={width - 70} y={height - 5} fill="#71717a" fontSize="9" fontFamily="monospace">
            {Math.round(totalDist)} m (End)
          </text>

          {/* Live Simulation Walker Line */}
          {simX !== null && (
            <line
              x1={simX}
              y1={paddingTop}
              x2={simX}
              y2={height - paddingBottom}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          )}

          {/* Hover Scrubber Line & Dot */}
          {hoverPoint && (
            <>
              <line
                x1={getX(hoverPoint.distanceFromStartMeters)}
                y1={paddingTop}
                x2={getX(hoverPoint.distanceFromStartMeters)}
                y2={height - paddingBottom}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle
                cx={getX(hoverPoint.distanceFromStartMeters)}
                cy={getY(hoverPoint.decibels)}
                r="4.5"
                fill="#ffffff"
                stroke={route.color}
                strokeWidth="2"
              />
            </>
          )}
        </svg>

        {/* Hover Inspector Tooltip */}
        {hoverPoint && (
          <div className="mt-2 p-2 rounded-lg bg-stone-900 border border-stone-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono font-bold text-white">
                {hoverPoint.decibels.toFixed(1)} dB
              </span>
              <span className="text-stone-400">
                at {Math.round(hoverPoint.distanceFromStartMeters)}m
              </span>
            </div>
            <div className="text-stone-300 font-medium truncate max-w-[240px]">
              {hoverPoint.dominantNoiseSource}
            </div>
          </div>
        )}
      </div>

      {/* Noise Exposure Ratio Progress Bars */}
      <div className="mt-3 pt-3 border-t border-stone-800">
        <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
          <span>Noise Exposure Distribution:</span>
          <span className="font-mono text-stone-300 font-semibold">
            Avg: {route.averageDecibels} dB • Peak: {route.peakDecibels} dB
          </span>
        </div>

        <div className="h-2.5 w-full bg-stone-900 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${route.exposureBreakdown.quietPercent}%` }}
            className="bg-emerald-500 transition-all duration-300"
            title={`Quiet (<50dB): ${route.exposureBreakdown.quietPercent}%`}
          />
          <div
            style={{ width: `${route.exposureBreakdown.moderatePercent}%` }}
            className="bg-amber-500 transition-all duration-300"
            title={`Moderate (50-70dB): ${route.exposureBreakdown.moderatePercent}%`}
          />
          <div
            style={{ width: `${route.exposureBreakdown.loudPercent}%` }}
            className="bg-rose-500 transition-all duration-300"
            title={`Loud (>70dB): ${route.exposureBreakdown.loudPercent}%`}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2 text-center text-[10px] font-mono">
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded py-1 text-emerald-300">
            🌿 Quiet: <b>{route.exposureBreakdown.quietPercent}%</b>
          </div>
          <div className="bg-amber-950/40 border border-amber-800/40 rounded py-1 text-amber-300">
            🏙️ Moderate: <b>{route.exposureBreakdown.moderatePercent}%</b>
          </div>
          <div className="bg-rose-950/40 border border-rose-800/40 rounded py-1 text-rose-300">
            ⚠️ Loud: <b>{route.exposureBreakdown.loudPercent}%</b>
          </div>
        </div>
      </div>

      {/* Avoided Noise Hazards List */}
      {route.avoidedHazards && route.avoidedHazards.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-stone-800/80">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Safely Avoided Noise Hazards ({route.avoidedHazards.length}):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {route.avoidedHazards.map((hazard, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-stone-900 border border-emerald-500/30 text-stone-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-medium text-stone-200">{hazard.zoneName}</span>
                <span className="font-mono text-rose-400 font-semibold">({hazard.decibels} dB)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
