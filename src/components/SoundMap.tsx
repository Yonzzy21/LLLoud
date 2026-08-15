import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, MapPin, Navigation, Volume2, Shield, Eye, EyeOff } from 'lucide-react';
import { NYC_SOUND_ZONES } from '../data/nycSoundData';
import { SoundDensityZone, SoundLogEntry } from '../types';
import { getCategoryColor } from '../utils/audioEngine';

interface SoundMapProps {
  userLat: number | null;
  userLon: number | null;
  currentDb: number;
  isListening: boolean;
  logs: SoundLogEntry[];
  onSelectZone?: (zone: SoundDensityZone) => void;
  onSimulateLocation?: (lat: number, lon: number) => void;
}

export const SoundMap: React.FC<SoundMapProps> = ({
  userLat,
  userLon,
  currentDb,
  isListening,
  logs,
  onSelectZone,
  onSimulateLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const userPulseRef = useRef<L.Circle | null>(null);
  const logsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Layer Toggles
  const [showSubwayLayer, setShowSubwayLayer] = useState(true);
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [showQuietLayer, setShowQuietLayer] = useState(true);
  const [showLogsLayer, setShowLogsLayer] = useState(true);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center: Midtown Manhattan (40.7580, -73.9855)
    const initialLat = userLat || 40.7580;
    const initialLon = userLon || -73.9855;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: true,
    });

    // Dark styled CartoDB tile layer with high contrast
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    const logsGroup = L.layerGroup().addTo(map);
    const zonesGroup = L.layerGroup().addTo(map);

    // Map click handler to place/simulate pin anywhere in NYC
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onSimulateLocation) {
        onSimulateLocation(e.latlng.lat, e.latlng.lng);
      }
    });

    logsLayerGroupRef.current = logsGroup;
    zonesLayerGroupRef.current = zonesGroup;
    mapInstanceRef.current = map;

    // Use ResizeObserver for responsive resizing
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Fix map container size on render
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update NYC Sound Density Zones
  useEffect(() => {
    const zonesGroup = zonesLayerGroupRef.current;
    if (!zonesGroup) return;

    zonesGroup.clearLayers();

    NYC_SOUND_ZONES.forEach((zone) => {
      let isVisible = false;
      let color = '#f59e0b';
      let fillColor = '#f59e0b';

      if (zone.type === 'subway-screech') {
        isVisible = showSubwayLayer;
        color = '#ef4444';
        fillColor = '#dc2626';
      } else if (zone.type === 'traffic-siren') {
        isVisible = showTrafficLayer;
        color = '#f97316';
        fillColor = '#ea580c';
      } else if (zone.type === 'quiet-haven') {
        isVisible = showQuietLayer;
        color = '#10b981';
        fillColor = '#059669';
      }

      if (!isVisible) return;

      const circle = L.circle([zone.latitude, zone.longitude], {
        radius: zone.radiusMeters,
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.25,
        weight: 2,
        dashArray: zone.type === 'quiet-haven' ? '4, 4' : undefined,
      });

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; min-width: 190px; color: #18181b;">
          <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${color}; margin-bottom: 2px;">
            ${zone.type.replace('-', ' ').toUpperCase()} • ${zone.borough}
          </div>
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px; line-height: 1.2;">
            ${zone.name}
          </div>
          <div style="font-size: 12px; margin-bottom: 6px; color: #3f3f46;">
            ${zone.description}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; background: #f4f4f5; padding: 4px 6px; border-radius: 6px;">
            <span>Acoustic Avg: <b>${zone.baseDecibels} dB</b></span>
            <span style="color: ${color};">Peak: <b>${zone.peakDecibels} dB</b></span>
          </div>
        </div>
      `;

      circle.bindPopup(popupContent);
      circle.on('click', () => {
        if (onSelectZone) onSelectZone(zone);
      });

      zonesGroup.addLayer(circle);
    });
  }, [showSubwayLayer, showTrafficLayer, showQuietLayer, onSelectZone]);

  // Update Logged User Sound Markers
  useEffect(() => {
    const logsGroup = logsLayerGroupRef.current;
    if (!logsGroup) return;

    logsGroup.clearLayers();

    if (!showLogsLayer) return;

    logs.forEach((log, index) => {
      const color = getCategoryColor(log.category);

      const marker = L.circleMarker([log.latitude, log.longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 1.5,
        fillColor: color.hex,
        fillOpacity: 0.85,
      });

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; min-width: 170px; color: #18181b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 10px; font-weight: 700; background: ${color.hex}25; color: ${color.hex}; padding: 2px 6px; border-radius: 9999px;">
              #${logs.length - index} • ${log.category}
            </span>
            <span style="font-size: 10px; color: #71717a;">${log.timeFormatted}</span>
          </div>
          <div style="font-size: 18px; font-weight: 800; font-family: monospace; color: #09090b; margin: 2px 0;">
            ${log.decibels.toFixed(1)} <span style="font-size: 12px; font-weight: 600; color: #71717a;">dB SPL</span>
          </div>
          <div style="font-size: 11px; color: #52525b;">
            📍 ${log.neighborhood || 'NYC Coordinates'}<br/>
            Lat: ${log.latitude.toFixed(5)}, Lon: ${log.longitude.toFixed(5)}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      logsGroup.addLayer(marker);
    });
  }, [logs, showLogsLayer]);

  // Update Live User Marker and Pulsing Sound Radius
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLat === null || userLon === null) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userPulseRef.current) {
        map.removeLayer(userPulseRef.current);
        userPulseRef.current = null;
      }
      return;
    }

    const color = getCategoryColor(
      currentDb < 45 ? 'Quiet / Whisper' :
      currentDb < 65 ? 'Moderate Ambient' :
      currentDb < 78 ? 'Busy City / Traffic' :
      currentDb < 88 ? 'Heavy Transit' : 'Extreme / Sirens'
    );

    // Pulse radius scales with current decibels (40 dB -> 20m, 95 dB -> 140m)
    const pulseRadius = isListening ? Math.max(15, (currentDb - 30) * 2.2) : 25;

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker([userLat, userLon], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      }).addTo(map);

      userPulseRef.current = L.circle([userLat, userLon], {
        radius: pulseRadius,
        color: color.hex,
        fillColor: color.hex,
        fillOpacity: isListening ? 0.35 : 0.1,
        weight: 1.5,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([userLat, userLon]);
      if (userPulseRef.current) {
        userPulseRef.current.setLatLng([userLat, userLon]);
        userPulseRef.current.setRadius(pulseRadius);
        userPulseRef.current.setStyle({
          color: color.hex,
          fillColor: color.hex,
          fillOpacity: isListening ? 0.35 : 0.1,
        });
      }
    }
  }, [userLat, userLon, currentDb, isListening]);

  // Quick Center on User
  const handleRecenter = () => {
    if (mapInstanceRef.current && userLat && userLon) {
      mapInstanceRef.current.flyTo([userLat, userLon], 15, { duration: 1 });
    }
  };

  // Jump to Famous Soundscapes
  const landmarks = [
    { name: 'Times Sq', lat: 40.7580, lon: -73.9855 },
    { name: 'Grand Central', lat: 40.7517, lon: -73.9767 },
    { name: 'Ramble Park', lat: 40.7766, lon: -73.9690 },
    { name: 'Brooklyn Bridge', lat: 40.7061, lon: -73.9969 },
    { name: 'Wall St', lat: 40.7075, lon: -74.0090 },
  ];

  return (
    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md flex flex-col">
      {/* Map Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-stone-300 uppercase">NYC Soundscape Map</h2>
            <p className="text-xs text-stone-500">Live GPS Noise Footprints & Environmental Density</p>
          </div>
        </div>

        {/* Quick GPS Recenter */}
        {userLat && userLon && (
          <button
            id="recenter-map-btn"
            onClick={handleRecenter}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs font-medium border border-stone-700 transition-colors"
            title="Recenter Map on My Location"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>My Location</span>
          </button>
        )}
      </div>

      {/* Layer Filters / Legend Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="text-stone-500 text-[11px] font-medium mr-1 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" /> Layers:
        </span>

        {/* Subways */}
        <button
          id="toggle-subway-layer"
          onClick={() => setShowSubwayLayer(!showSubwayLayer)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${
            showSubwayLayer
              ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
              : 'bg-stone-900 text-stone-500 border-stone-800 opacity-60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
          <span>Subway Screech</span>
        </button>

        {/* Traffic & Sirens */}
        <button
          id="toggle-traffic-layer"
          onClick={() => setShowTrafficLayer(!showTrafficLayer)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${
            showTrafficLayer
              ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
              : 'bg-stone-900 text-stone-500 border-stone-800 opacity-60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          <span>Traffic & Sirens</span>
        </button>

        {/* Quiet Sanctuaries */}
        <button
          id="toggle-quiet-layer"
          onClick={() => setShowQuietLayer(!showQuietLayer)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${
            showQuietLayer
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
              : 'bg-stone-900 text-stone-500 border-stone-800 opacity-60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <span>Quiet Parks</span>
        </button>

        {/* User Logs */}
        <button
          id="toggle-logs-layer"
          onClick={() => setShowLogsLayer(!showLogsLayer)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${
            showLogsLayer
              ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
              : 'bg-stone-900 text-stone-500 border-stone-800 opacity-60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
          <span>My Noise Logs ({logs.length})</span>
        </button>

        <span className="text-[11px] text-stone-400 ml-auto hidden sm:inline">
          💡 Click map to place listener pin
        </span>
      </div>

      {/* Interactive Map Box */}
      <div className="relative w-full h-72 sm:h-96 rounded-xl overflow-hidden border border-stone-800">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Floating Quick Jump Coordinates bar for easy testing */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-[400] pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-1 px-2 bg-stone-950/90 backdrop-blur-md rounded-xl border border-stone-800/80 shadow-lg text-[11px]">
          <span className="text-stone-400 font-medium whitespace-nowrap">📍 Jump to:</span>
          {landmarks.map((lm) => (
            <button
              key={lm.name}
              onClick={() => {
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.flyTo([lm.lat, lm.lon], 15);
                }
                if (onSimulateLocation) {
                  onSimulateLocation(lm.lat, lm.lon);
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-amber-400 border border-stone-800 whitespace-nowrap transition-colors"
            >
              {lm.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
