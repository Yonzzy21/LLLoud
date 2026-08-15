import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, X, Loader2 } from 'lucide-react';
import { Waypoint } from '../types';
import { GeocodingResult, searchNycAddresses } from '../utils/geocoding';

interface AddressSearchInputProps {
  id?: string;
  label?: string;
  value: Waypoint | null;
  onChange: (waypoint: Waypoint) => void;
  placeholder?: string;
  dotColor?: 'emerald' | 'rose' | 'amber';
  onUseCurrentLocation?: () => void;
}

export const AddressSearchInput: React.FC<AddressSearchInputProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = 'Search NYC address or landmark...',
  dotColor = 'emerald',
  onUseCurrentLocation,
}) => {
  const [query, setQuery] = useState<string>(value?.name || '');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Sync with value changes
  useEffect(() => {
    if (value) {
      setQuery(value.name);
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setQuery(text);
    setIsOpen(true);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (text.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      const hits = await searchNycAddresses(text);
      setResults(hits);
      setIsLoading(false);
    }, 200);
  };

  const handleSelectResult = (result: GeocodingResult) => {
    setQuery(result.name);
    setIsOpen(false);
    onChange({
      name: result.displayName || result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      neighborhood: result.neighborhood,
    });
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const dotBgClass = 
    dotColor === 'rose' ? 'bg-rose-500' :
    dotColor === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
          {label}
        </label>
      )}

      <div className="relative flex items-center bg-stone-900 border border-stone-800 rounded-xl focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-all">
        {/* Leading Dot */}
        <div className="pl-2.5 pr-1.5 flex items-center">
          <span className={`w-2.5 h-2.5 rounded-full ${dotBgClass} shrink-0`} />
        </div>

        {/* Text Input */}
        <input
          id={id}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full py-1.5 px-1 bg-transparent text-xs text-stone-100 placeholder-stone-500 focus:outline-none truncate"
        />

        {/* Action icons */}
        <div className="flex items-center pr-2 gap-1 shrink-0">
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}

          {query && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-stone-500 hover:text-stone-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {onUseCurrentLocation && (
            <button
              type="button"
              onClick={onUseCurrentLocation}
              className="p-1 rounded-md text-sky-400 hover:text-sky-300 hover:bg-sky-950/50 transition-colors"
              title="Use My GPS Location"
            >
              <Navigation className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-[1200] bg-stone-950/98 border border-stone-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-stone-800/60 animate-in fade-in slide-in-from-top-1">
          {results.length > 0 ? (
            results.map((res, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectResult(res)}
                className="w-full p-2.5 text-left hover:bg-stone-800/60 flex items-start gap-2.5 transition-colors group cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-stone-200 truncate group-hover:text-amber-300">
                    {res.name}
                  </div>
                  <div className="text-[10px] text-stone-400 truncate flex items-center gap-1.5 mt-0.5">
                    {res.neighborhood && (
                      <span className="px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 font-semibold">
                        {res.neighborhood}
                      </span>
                    )}
                    <span>{res.displayName}</span>
                  </div>
                </div>
              </button>
            ))
          ) : !isLoading ? (
            <div className="p-3 text-center text-xs text-stone-500">
              No NYC address matches found for "{query}". Try a cross street or landmark.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
