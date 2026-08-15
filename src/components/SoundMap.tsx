import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Layers, 
  MapPin, 
  Navigation, 
  Sliders, 
  Volume2, 
  ShieldCheck, 
  Filter, 
  Maximize2,
  Info,
  Users,
  AlertTriangle,
  Plus
} from 'lucide-react';
import { NYC_SOUND_ZONES } from '../data/nycSoundData';
import { 
  AvoidedHazard,
  CommunityNoiseReport,
  NavRoute, 
  NavigationSimulationState, 
  NoiseDatasetType, 
  SoundDensityZone, 
  SoundLogEntry, 
  Waypoint 
} from '../types';
import { fetchLiveNyc311NoiseComplaints } from '../utils/nycOpenData';
import { getCategoryColor } from '../utils/audioEngine';

interface SoundMapProps {
  userLat: number | null;
  userLon: number | null;
  currentDb: number;
  isListening: boolean;
  logs: SoundLogEntry[];
  activeRoute?: NavRoute | null;
  fastestRoute?: NavRoute | null;
  quietestRoute?: NavRoute | null;
  origin?: Waypoint;
  destination?: Waypoint;
  simulationState?: NavigationSimulationState;
  communityReports?: CommunityNoiseReport[];
  onSelectZone?: (zone: SoundDensityZone) => void;
  onSimulateLocation?: (lat: number, lon: number) => void;
  onMapClickSetOrigin?: (lat: number, lon: number) => void;
  onMapClickSetDestination?: (lat: number, lon: number) => void;
  onOpenReportModal?: () => void;
  onUpvoteReport?: (id: string) => void;
  isFullScreenMode?: boolean;
}

export const SoundMap: React.FC<SoundMapProps> = ({
  userLat,
  userLon,
  currentDb,
  isListening,
  logs,
  activeRoute,
  fastestRoute,
  quietestRoute,
  origin,
  destination,
  simulationState,
  communityReports = [],
  onSelectZone,
  onSimulateLocation,
  onMapClickSetOrigin,
  onMapClickSetDestination,
  onOpenReportModal,
  onUpvoteReport,
  isFullScreenMode = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyPulseRef = useRef<L.Circle | null>(null);
  const simMarkerRef = useRef<L.Marker | null>(null);
  const simPulseRef = useRef<L.Circle | null>(null);

  // Callback refs — always hold the latest function so Leaflet closures never go stale
  const onMapClickSetOriginRef = useRef(onMapClickSetOrigin);
  const onMapClickSetDestinationRef = useRef(onMapClickSetDestination);
  const onSimulateLocationRef = useRef(onSimulateLocation);
  const onOpenReportModalRef = useRef(onOpenReportModal);
  useEffect(() => { onMapClickSetOriginRef.current = onMapClickSetOrigin; }, [onMapClickSetOrigin]);
  useEffect(() => { onMapClickSetDestinationRef.current = onMapClickSetDestination; }, [onMapClickSetDestination]);
  useEffect(() => { onSimulateLocationRef.current = onSimulateLocation; }, [onSimulateLocation]);
  useEffect(() => { onOpenReportModalRef.current = onOpenReportModal; }, [onOpenReportModal]);

  // Layer groups
  const logsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const communityLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routesLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Layer Toggles
  const [show311Layer, setShow311Layer] = useState(true);
  const [showTransitLayer, setShowTransitLayer] = useState(true);
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [showQuietLayer, setShowQuietLayer] = useState(true);
  const [showConstructionLayer, setShowConstructionLayer] = useState(true);
  const [showCommunityLayer, setShowCommunityLayer] = useState(true);
  const [showLayersSheet, setShowLayersSheet] = useState(false);

  // Decibel Filter Slider
  const [maxDbFilter, setMaxDbFilter] = useState<number>(105);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = userLat || origin?.latitude || 40.7580;
    const initialLon = userLon || origin?.longitude || -73.9855;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
    });

    // CartoDB tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO &copy; OSM',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    const routesGroup = L.layerGroup().addTo(map);
    const zonesGroup = L.layerGroup().addTo(map);
    const communityGroup = L.layerGroup().addTo(map);
    const logsGroup = L.layerGroup().addTo(map);

    const clickActionPopup = L.popup({ closeButton: true, autoClose: true, className: 'map-action-popup' });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; min-width: 175px; text-align:center; color:#18181b; padding: 2px;">
          <div style="font-size: 11px; font-weight: 800; margin-bottom: 6px; color:#27272a;">
            📍 Location Selected
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <button 
              id="map-popup-set-a"
              style="background:#10b981; color:white; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
            >
              🟢 Set Start (Point A)
            </button>
            <button 
              id="map-popup-set-b"
              style="background:#f43f5e; color:white; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
            >
              🏁 Set Destination (Point B)
            </button>
            <button 
              id="map-popup-log-noise"
              style="background:#f59e0b; color:#18181b; border:none; padding:5px 8px; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer; margin-top:2px;"
            >
              ⚠️ Log Noise Spot Here
            </button>
          </div>
        </div>
      `;

      clickActionPopup.setLatLng([lat, lon]).setContent(popupHtml).openOn(map);

      setTimeout(() => {
        const btnA = document.getElementById('map-popup-set-a');
        const btnB = document.getElementById('map-popup-set-b');
        const btnLog = document.getElementById('map-popup-log-noise');

        if (btnA) {
          btnA.onclick = () => {
            onMapClickSetOriginRef.current?.(lat, lon);
            map.closePopup();
          };
        }
        if (btnB) {
          btnB.onclick = () => {
            onMapClickSetDestinationRef.current?.(lat, lon);
            map.closePopup();
          };
        }
        if (btnLog) {
          btnLog.onclick = () => {
            onSimulateLocationRef.current?.(lat, lon);
            onOpenReportModalRef.current?.();
            map.closePopup();
          };
        }
      }, 50);
    });

    routesLayerGroupRef.current = routesGroup;
    zonesLayerGroupRef.current = zonesGroup;
    communityLayerGroupRef.current = communityGroup;
    logsLayerGroupRef.current = logsGroup;
    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Live GPS Location Marker & Radar Pulse
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLat === null || userLon === null) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userAccuracyPulseRef.current) {
        map.removeLayer(userAccuracyPulseRef.current);
        userAccuracyPulseRef.current = null;
      }
      return;
    }

    const liveGpsIcon = L.divIcon({
      className: 'live-gps-marker',
      html: `
        <div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:#38bdf8; opacity:0.4; animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background:#0284c7; width:18px; height:18px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 10px rgba(14, 165, 233, 0.8);"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLat, userLon], { icon: liveGpsIcon, zIndexOffset: 1000 }).addTo(map);
      userMarkerRef.current.bindTooltip('<b>📍 My Live Location</b>', { permanent: false, direction: 'top' });

      userAccuracyPulseRef.current = L.circle([userLat, userLon], {
        radius: 35,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([userLat, userLon]);
      if (userAccuracyPulseRef.current) {
        userAccuracyPulseRef.current.setLatLng([userLat, userLon]);
      }
    }
  }, [userLat, userLon]);

  // Update Community Reported Noise Markers
  useEffect(() => {
    const communityGroup = communityLayerGroupRef.current;
    if (!communityGroup) return;

    communityGroup.clearLayers();

    if (!showCommunityLayer) return;

    communityReports.forEach((report) => {
      const isQuiet = report.noiseType === 'quiet-spot';
      const color = isQuiet ? '#10b981' : '#f59e0b';
      const iconEmoji = isQuiet ? '🌿' : '⚠️';

      const communityIcon = L.divIcon({
        className: 'custom-community-icon',
        html: `
          <div style="position:relative; width:30px; height:30px; display:flex; align-items:center; justify-content:center;">
            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:${color}; opacity:0.35; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="background:#18181b; color:${color}; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; border:2px solid ${color}; box-shadow:0 3px 8px rgba(0,0,0,0.5);">
              ${iconEmoji}
            </div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([report.latitude, report.longitude], { icon: communityIcon });
      
      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; min-width: 210px; color: #18181b;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:700; text-transform:uppercase; color:${color}; margin-bottom:2px;">
            <span>👥 COMMUNITY REPORT</span>
            <span style="background:#e4e4e7; color:#3f3f46; padding:1px 5px; border-radius:4px;">${report.timeAgo || 'Just now'}</span>
          </div>
          <div style="font-size:13px; font-weight:800; margin-bottom:3px; line-height:1.2;">
            ${report.zoneName}
          </div>
          <div style="font-size:11px; margin-bottom:6px; color:#3f3f46;">
            ${report.description}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; background:#f4f4f5; padding:5px 8px; border-radius:8px; font-size:11px; font-weight:700;">
            <span>Noise: <b style="color:${color}; font-size:12px;">${report.decibels} dB SPL</b></span>
            <span>👍 ${report.upvotes}</span>
          </div>
          <div style="font-size:10px; color:#71717a; margin-top:5px; border-top:1px solid #e4e4e7; padding-top:4px; display:flex; align-items:center; justify-content:space-between;">
            <span>👤 ${report.isUserReported ? '<b style="color:#0284c7;">Reported by You</b>' : (report.reporterName || 'NYC Walker @MidtownScout')}</span>
            <span style="background:#f4f4f5; color:#52525b; padding:1px 4px; border-radius:3px; font-size:9px;">${report.reporterBadge || 'Live Acoustic Scout'}</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      communityGroup.addLayer(marker);
    });
  }, [communityReports, showCommunityLayer]);

  const [live311Zones, setLive311Zones] = useState<SoundDensityZone[]>([]);

  // Fetch real live NYC 311 OpenData noise complaints
  useEffect(() => {
    fetchLiveNyc311NoiseComplaints(60).then((records) => {
      if (records && records.length > 0) {
        setLive311Zones(records);
      }
    });
  }, []);

  // Update Multi-Dataset NYC Sound Density Zones (including live NYC 311 complaints)
  useEffect(() => {
    const zonesGroup = zonesLayerGroupRef.current;
    if (!zonesGroup) return;

    zonesGroup.clearLayers();

    const allZones = [...NYC_SOUND_ZONES, ...live311Zones];

    allZones.forEach((zone) => {
      let isVisible = false;
      let color = '#f59e0b';
      let fillColor = '#f59e0b';

      const cat: NoiseDatasetType = zone.datasetCategory || (
        zone.type === 'subway-screech' ? 'mta-transit' :
        zone.type === 'quiet-haven' ? 'quiet-haven' :
        zone.type === 'construction' ? 'construction' :
        zone.type === 'nightlife' ? '311-complaint' : 'traffic-corridor'
      );

      if (cat === '311-complaint' && show311Layer) {
        isVisible = true;
        color = '#a855f7';
        fillColor = '#9333ea';
      } else if (cat === 'mta-transit' && showTransitLayer) {
        isVisible = true;
        color = '#ef4444';
        fillColor = '#dc2626';
      } else if (cat === 'traffic-corridor' && showTrafficLayer) {
        isVisible = true;
        color = '#f97316';
        fillColor = '#ea580c';
      } else if (cat === 'construction' && showConstructionLayer) {
        isVisible = true;
        color = '#eab308';
        fillColor = '#ca8a04';
      } else if (cat === 'quiet-haven' && showQuietLayer) {
        isVisible = true;
        color = '#10b981';
        fillColor = '#059669';
      }

      if (cat !== 'quiet-haven' && zone.baseDecibels > maxDbFilter) {
        isVisible = false;
      }

      if (!isVisible) return;

      const circle = L.circle([zone.latitude, zone.longitude], {
        radius: zone.radiusMeters,
        color: color,
        fillColor: fillColor,
        fillOpacity: zone.type === 'quiet-haven' ? 0.35 : 0.22,
        weight: zone.type === 'quiet-haven' ? 2 : 1.5,
        dashArray: zone.type === 'quiet-haven' ? '4, 4' : undefined,
      });

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; min-width: 220px; color: #18181b;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${color}; margin-bottom: 2px;">
            <span>${zone.datasetCategory === '311-complaint' ? '🏛️ OFFICIAL NYC 311' : zone.type.replace('-', ' ').toUpperCase()}</span>
            <span>${zone.borough}</span>
          </div>
          <div style="font-size: 13px; font-weight: 800; margin-bottom: 3px; line-height: 1.2;">
            ${zone.name}
          </div>
          <div style="font-size: 11px; margin-bottom: 5px; color: #3f3f46;">
            ${zone.description}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; background: #f4f4f5; padding: 4px 8px; border-radius: 6px;">
            <span>Avg: <b>${zone.baseDecibels} dB</b></span>
            <span style="color: ${color};">Peak: <b>${zone.peakDecibels} dB</b></span>
          </div>
          ${zone.externalUrl ? `
            <div style="margin-top:6px; padding-top:4px; border-top:1px solid #e4e4e7;">
              <a 
                href="${zone.externalUrl}" 
                target="_blank" 
                rel="noopener noreferrer" 
                style="display:inline-flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#9333ea; text-decoration:underline;"
              >
                🔗 Open Official NYC OpenData Record (SR #${zone.serviceRequestId || '311'}) ↗
              </a>
            </div>
          ` : ''}
        </div>
      `;

      circle.bindPopup(popupContent);
      circle.on('click', () => {
        if (onSelectZone) onSelectZone(zone);
      });

      zonesGroup.addLayer(circle);
    });
  }, [show311Layer, showTransitLayer, showTrafficLayer, showQuietLayer, showConstructionLayer, maxDbFilter, onSelectZone]);

  // Update Route Polylines & Origin/Destination Markers
  useEffect(() => {
    const routesGroup = routesLayerGroupRef.current;
    const map = mapInstanceRef.current;
    if (!routesGroup || !map) return;

    routesGroup.clearLayers();

    // Render Fastest Commute route
    if (fastestRoute && fastestRoute.coordinates.length > 0) {
      const isSelected = activeRoute?.silenceLevel === 'fastest';
      if (!isSelected) {
        const poly = L.polyline(fastestRoute.coordinates, {
          color: '#f43f5e',
          weight: 3.5,
          opacity: 0.45,
          dashArray: '6, 6',
        });
        poly.bindTooltip(`Fastest Commute (${fastestRoute.durationMinutes} min • ~${fastestRoute.averageDecibels} dB)`, { sticky: true });
        routesGroup.addLayer(poly);
      }
    }

    // Render Quietest Route
    if (quietestRoute && quietestRoute.coordinates.length > 0) {
      const isSelected = activeRoute?.silenceLevel === 'quietest';
      if (!isSelected) {
        const poly = L.polyline(quietestRoute.coordinates, {
          color: '#10b981',
          weight: 3.5,
          opacity: 0.45,
          dashArray: '6, 6',
        });
        poly.bindTooltip(`Quietest Route (${quietestRoute.durationMinutes} min • ~${quietestRoute.averageDecibels} dB)`, { sticky: true });
        routesGroup.addLayer(poly);
      }
    }

    // Render Active Route prominently
    if (activeRoute && activeRoute.coordinates.length > 0) {
      const glowLine = L.polyline(activeRoute.coordinates, {
        color: activeRoute.color,
        weight: 9,
        opacity: 0.35,
      });
      routesGroup.addLayer(glowLine);

      const mainLine = L.polyline(activeRoute.coordinates, {
        color: activeRoute.color,
        weight: 5,
        opacity: 0.95,
      });
      mainLine.bindTooltip(`<b>${activeRoute.title}</b><br/>${activeRoute.durationMinutes} min • ~${activeRoute.averageDecibels} dB SPL`, { sticky: true });
      routesGroup.addLayer(mainLine);
    }

    // Origin Marker
    if (origin) {
      const originIcon = L.divIcon({
        className: 'custom-origin-icon',
        html: `<div style="background:#10b981; color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; border:2.5px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.5);">A</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const originMarker = L.marker([origin.latitude, origin.longitude], { icon: originIcon });
      originMarker.bindTooltip(`<b>Start:</b> ${origin.name}`);
      routesGroup.addLayer(originMarker);
    }

    // Destination Marker
    if (destination) {
      const destIcon = L.divIcon({
        className: 'custom-dest-icon',
        html: `<div style="background:#f43f5e; color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; border:2.5px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.5);">B</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const destMarker = L.marker([destination.latitude, destination.longitude], { icon: destIcon });
      destMarker.bindTooltip(`<b>End:</b> ${destination.name}`);
      routesGroup.addLayer(destMarker);
    }
  }, [activeRoute, fastestRoute, quietestRoute, origin, destination]);

  // Update Simulation Walker Avatar
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!simulationState || !simulationState.isActive) {
      if (simMarkerRef.current) {
        map.removeLayer(simMarkerRef.current);
        simMarkerRef.current = null;
      }
      if (simPulseRef.current) {
        map.removeLayer(simPulseRef.current);
        simPulseRef.current = null;
      }
      return;
    }

    const { currentLat, currentLon, currentDecibels } = simulationState;
    const catStyle = getCategoryColor(
      currentDecibels < 45 ? 'Quiet / Whisper' :
      currentDecibels < 65 ? 'Moderate Ambient' :
      currentDecibels < 78 ? 'Busy City / Traffic' :
      currentDecibels < 88 ? 'Heavy Transit' : 'Extreme / Sirens'
    );

    const walkerIcon = L.divIcon({
      className: 'sim-walker-icon',
      html: `
        <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:${catStyle.hex}; opacity:0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background:#09090b; color:${catStyle.hex}; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; border:2.5px solid ${catStyle.hex}; box-shadow:0 3px 8px rgba(0,0,0,0.6);">
            🚶
          </div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    const pulseRadius = Math.max(15, (currentDecibels - 30) * 1.8);

    if (!simMarkerRef.current) {
      simMarkerRef.current = L.marker([currentLat, currentLon], { icon: walkerIcon }).addTo(map);
      simPulseRef.current = L.circle([currentLat, currentLon], {
        radius: pulseRadius,
        color: catStyle.hex,
        fillColor: catStyle.hex,
        fillOpacity: 0.25,
        weight: 1.5,
      }).addTo(map);
    } else {
      simMarkerRef.current.setLatLng([currentLat, currentLon]);
      simMarkerRef.current.setIcon(walkerIcon);
      if (simPulseRef.current) {
        simPulseRef.current.setLatLng([currentLat, currentLon]);
        simPulseRef.current.setRadius(pulseRadius);
        simPulseRef.current.setStyle({
          color: catStyle.hex,
          fillColor: catStyle.hex,
        });
      }
    }
  }, [simulationState]);

  // Fit map bounds to active route
  const handleFitRouteBounds = () => {
    if (!mapInstanceRef.current || !activeRoute || activeRoute.coordinates.length === 0) return;
    const bounds = L.latLngBounds(activeRoute.coordinates.map((c) => [c[0], c[1]]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  };

  // Quick Center on User Live Location
  const handleRecenterUser = () => {
    if (mapInstanceRef.current && userLat && userLon) {
      mapInstanceRef.current.flyTo([userLat, userLon], 16, { duration: 1 });
    }
  };

  return (
    <div className={`relative w-full overflow-hidden ${isFullScreenMode ? 'h-full' : 'h-[380px] sm:h-[460px] rounded-3xl border border-stone-800'}`}>
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Live GPS Indicator Chip */}
      {userLat && userLon && (
        <div className="absolute top-3 left-3 z-[400] bg-stone-950/90 border border-sky-500/30 rounded-2xl px-3 py-1.5 shadow-xl backdrop-blur-md flex items-center gap-2 pointer-events-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          <span className="text-[11px] font-mono text-sky-300 font-bold">
            Live GPS Active
          </span>
        </div>
      )}

      {/* Floating Top Action Controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2 pointer-events-auto">
        
        {/* "+ Log Noisy Spot" Action Button */}
        {onOpenReportModal && (
          <button
            id="map-report-noise-btn"
            onClick={onOpenReportModal}
            className="p-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black shadow-xl backdrop-blur-md transition-all active:scale-95 flex items-center justify-center gap-1"
            title="Log Noisy Spot / Report Hazard"
          >
            <AlertTriangle className="w-4 h-4 fill-current" />
          </button>
        )}

        <button
          id="map-recenter-user-btn"
          onClick={handleRecenterUser}
          className="p-3 rounded-2xl bg-stone-950/90 text-sky-400 hover:text-white border border-stone-800 shadow-xl backdrop-blur-md transition-colors"
          title="Recenter Map on My Live Location"
        >
          <Navigation className="w-4 h-4 fill-current" />
        </button>

        {activeRoute && (
          <button
            id="map-fit-route-btn"
            onClick={handleFitRouteBounds}
            className="p-3 rounded-2xl bg-stone-950/90 text-amber-400 hover:text-white border border-stone-800 shadow-xl backdrop-blur-md transition-colors"
            title="Fit Entire Route"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

        <button
          id="map-layers-toggle-btn"
          onClick={() => setShowLayersSheet(!showLayersSheet)}
          className={`p-3 rounded-2xl border shadow-xl backdrop-blur-md transition-colors ${
            showLayersSheet
              ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
              : 'bg-stone-950/90 text-stone-300 border-stone-800 hover:text-white'
          }`}
          title="Toggle Noise Dataset Layers"
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Dataset Layers Popup Panel */}
      {showLayersSheet && (
        <div className="absolute top-28 right-3 z-[400] bg-stone-950/95 border border-stone-800 rounded-3xl p-3 shadow-2xl backdrop-blur-xl text-xs space-y-2 pointer-events-auto min-w-[210px]">
          <div className="font-bold text-stone-300 text-[11px] uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Noise Datasets & Reports</span>
            <button
              onClick={() => setShowLayersSheet(false)}
              className="text-stone-500 hover:text-stone-300"
            >
              ✕
            </button>
          </div>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-amber-300 font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>👥 Community Reports ({communityReports.length})</span>
            </span>
            <input
              type="checkbox"
              checked={showCommunityLayer}
              onChange={(e) => setShowCommunityLayer(e.target.checked)}
              className="accent-amber-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>311 Complaints</span>
            </span>
            <input
              type="checkbox"
              checked={show311Layer}
              onChange={(e) => setShow311Layer(e.target.checked)}
              className="accent-purple-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>MTA Screech Tracks</span>
            </span>
            <input
              type="checkbox"
              checked={showTransitLayer}
              onChange={(e) => setShowTransitLayer(e.target.checked)}
              className="accent-rose-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span>Traffic & Sirens</span>
            </span>
            <input
              type="checkbox"
              checked={showTrafficLayer}
              onChange={(e) => setShowTrafficLayer(e.target.checked)}
              className="accent-orange-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span>Construction</span>
            </span>
            <input
              type="checkbox"
              checked={showConstructionLayer}
              onChange={(e) => setShowConstructionLayer(e.target.checked)}
              className="accent-yellow-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-2 cursor-pointer text-stone-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Quiet Sanctuaries</span>
            </span>
            <input
              type="checkbox"
              checked={showQuietLayer}
              onChange={(e) => setShowQuietLayer(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
          </label>
        </div>
      )}
    </div>
  );
};
