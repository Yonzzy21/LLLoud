import React, { useState } from 'react';
import { 
  X, 
  AlertTriangle, 
  Volume2, 
  MapPin, 
  Check, 
  Sparkles,
  Construction,
  Radio,
  Car,
  Trees,
  Music,
  Locate
} from 'lucide-react';
import { CommunityNoiseReport, Waypoint } from '../types';
import { AddressSearchInput } from './AddressSearchInput';

interface ReportNoiseModalProps {
  userLat: number | null;
  userLon: number | null;
  currentDecibels: number;
  onClose: () => void;
  onSubmitReport: (report: Omit<CommunityNoiseReport, 'id' | 'reportedAt' | 'timeAgo' | 'upvotes'>) => void;
}

export const ReportNoiseModal: React.FC<ReportNoiseModalProps> = ({
  userLat,
  userLon,
  currentDecibels,
  onClose,
  onSubmitReport,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<Waypoint>({
    name: 'Current NYC Location',
    latitude: userLat || 40.7580,
    longitude: userLon || -73.9855,
    neighborhood: 'Midtown',
  });

  const [noiseType, setNoiseType] = useState<CommunityNoiseReport['noiseType']>('construction');
  const [reportedDb, setReportedDb] = useState<number>(Math.max(45, Math.round(currentDecibels)));
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories: { id: CommunityNoiseReport['noiseType']; label: string; icon: React.FC<{ className?: string }>; color: string }[] = [
    { id: 'construction', label: 'Construction & Saws', icon: Construction, color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' },
    { id: 'sirens-traffic', label: 'Sirens & Traffic', icon: AlertTriangle, color: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
    { id: 'subway-screech', label: 'Subway Screech', icon: Radio, color: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
    { id: 'nightlife', label: 'Nightlife & Bass', icon: Music, color: 'text-purple-400 border-purple-500/40 bg-purple-500/10' },
    { id: 'horn-exhaust', label: 'Horns & Exhausts', icon: Car, color: 'text-red-400 border-red-500/40 bg-red-500/10' },
    { id: 'quiet-spot', label: 'Quiet Haven', icon: Trees, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-generate name if empty
    const categoryLabels: Record<string, string> = {
      'construction': 'Construction & Saws',
      'sirens-traffic': 'Traffic Siren Corridor',
      'subway-screech': 'Subway Track Squeal',
      'nightlife': 'Loud Nightlife / Bass',
      'horn-exhaust': 'Horns & Vehicle Noise',
      'quiet-spot': 'Quiet Haven',
    };

    const finalName = selectedLocation.name.trim() || 
      `${categoryLabels[noiseType] || 'Noise Spot'} near ${selectedLocation.neighborhood || 'NYC Street'}`;

    setIsSubmitting(true);
    setTimeout(() => {
      onSubmitReport({
        zoneName: finalName,
        noiseType,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        decibels: reportedDb,
        description: description.trim() || `Live user ${categoryLabels[noiseType] || 'noise'} reported at ${finalName}`,
        isUserReported: true,
      });
      setIsSubmitting(false);
      onClose();
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Log Noisy Spot</h3>
              <p className="text-[11px] text-stone-400">Search address & broadcast to NYC community map</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Specific Address Search with Autocomplete */}
          <div>
            <label className="block font-bold text-stone-300 mb-1">
              Specific NYC Address or Cross Streets <span className="text-amber-400">*</span>
            </label>
            <AddressSearchInput
              id="report-address-search-input"
              value={selectedLocation}
              onChange={setSelectedLocation}
              placeholder="e.g. 350 5th Ave, 14th & 8th, or Bedford Ave..."
              dotColor="amber"
              onUseCurrentLocation={userLat && userLon ? () => {
                setSelectedLocation({
                  name: 'My GPS Location',
                  latitude: userLat,
                  longitude: userLon,
                  neighborhood: 'Current Location',
                });
              } : undefined}
            />
            <div className="text-[10px] text-stone-500 mt-1 flex items-center justify-between">
              <span>📍 Geotagged: ({selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)})</span>
              {selectedLocation.neighborhood && (
                <span className="text-amber-400 font-semibold">{selectedLocation.neighborhood}</span>
              )}
            </div>
          </div>

          {/* Noise Category Grid */}
          <div>
            <label className="block font-bold text-stone-300 mb-1.5">
              Noise Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = noiseType === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setNoiseType(cat.id)}
                    className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all ${
                      isSelected
                        ? `${cat.color} ring-1 ring-amber-400 font-bold`
                        : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Decibel Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-stone-300">
                Measured / Estimated Noise Level
              </label>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {reportedDb} dB SPL
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="115"
              step="1"
              value={reportedDb}
              onChange={(e) => setReportedDb(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-500 font-mono">
              <span>40 dB (Quiet)</span>
              <span>75 dB (Avenue)</span>
              <span>105+ dB (Screech)</span>
            </div>
          </div>

          {/* Optional Details Note */}
          <div>
            <label className="block font-bold text-stone-300 mb-1">
              Details (Optional)
            </label>
            <textarea
              placeholder="e.g. Jackhammers ripping street asphalt, heavy echoing"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 resize-none text-xs"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-1 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black tracking-wide shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Volume2 className="w-4 h-4 fill-current" />
              <span>Broadcast Hazard</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
