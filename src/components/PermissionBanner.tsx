import React, { useState } from 'react';
import { AlertTriangle, Mic, MapPin, CheckCircle, RefreshCw, Smartphone, X } from 'lucide-react';
import { GeoLocationState, MicState } from '../types';

interface PermissionBannerProps {
  micState: MicState;
  geoState: GeoLocationState;
  onRetryMic: () => void;
  onRetryGeo: () => void;
  onEnableDemoMode: () => void;
}

export const PermissionBanner: React.FC<PermissionBannerProps> = ({
  micState,
  geoState,
  onRetryMic,
  onRetryGeo,
  onEnableDemoMode,
}) => {
  const [dismissed, setDismissed] = useState(false);

  const hasMicIssue = micState.status === 'denied' || micState.status === 'unsupported' || Boolean(micState.errorMessage);
  const hasGeoIssue = geoState.status === 'denied' || geoState.status === 'unavailable' || Boolean(geoState.errorMessage);

  if (dismissed || (!hasMicIssue && !hasGeoIssue)) {
    return null;
  }

  return (
    <div className="bg-amber-950/70 border border-amber-800/80 rounded-2xl p-4 mb-4 text-xs text-amber-200 backdrop-blur-md shadow-lg relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 rounded-lg text-amber-400 hover:text-amber-100 hover:bg-amber-900/40 transition-colors"
        title="Dismiss notice"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <div className="flex-1 space-y-2">
          <div className="font-bold text-amber-100 text-sm flex items-center gap-2">
            <span>Hardware & Permissions Notice</span>
            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              NYC Fallback Active
            </span>
          </div>

          {hasMicIssue && (
            <div className="flex items-start gap-2 text-stone-300">
              <Mic className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-rose-300">Microphone: </span>
                {micState.errorMessage || 'Microphone access is required for live decibel SPL analysis.'}
              </div>
            </div>
          )}

          {hasGeoIssue && (
            <div className="flex items-start gap-2 text-stone-300">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Geolocation: </span>
                {geoState.errorMessage || 'Geolocation restricted in preview iframe. NYC coordinates are defaulted.'}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            {hasMicIssue && (
              <button
                onClick={onRetryMic}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Microphone</span>
              </button>
            )}

            {hasGeoIssue && (
              <button
                onClick={onRetryGeo}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center gap-1.5 border border-stone-700 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Retry Location</span>
              </button>
            )}

            <button
              onClick={() => {
                onEnableDemoMode();
                setDismissed(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-300 font-semibold text-xs flex items-center gap-1.5 border border-amber-900/60 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Enable NYC Simulator Mode</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
