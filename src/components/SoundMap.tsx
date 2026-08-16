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
import { QuietMapLayer, type QuietZone } from '../design/QuietMapLayer';
import { COLORS, DESIGN, LEVELS, levelFromDb } from '../design/tokens';

const FONT = '-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SF Mono, Menlo, monospace';

interface SoundMapProps {
  userLat: number | null;
  userLon: number | null;
  currentDb: number;
  isListening: boolean;
  logs: SoundLogEntry[];
  activeRoute?: NavRoute | null;
  fastestRoute?: NavRoute | null;
  avoidNoiseRoute?: NavRoute | null;
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
  avoidNoiseRoute,
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
  const quietLayerRef = useRef<QuietMapLayer | null>(null);

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

    // The real city, labels and all, warmed into the paper palette by CSS.
    // It has to stay readable through the sound field — this is still a map.
    const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO &copy; OSM',
      maxZoom: 19,
      subdomains: 'abcd',
      opacity: QuietMapLayer.cityOpacityFor(map.getZoom()),
      className: 'quiet-tiles',
    }).addTo(map);

    // zoomed out this is a soundscape; zoomed in you are navigating, and the
    // street names have to come through the field
    map.on('zoomend', () => tiles.setOpacity(QuietMapLayer.cityOpacityFor(map.getZoom())));

    // The design layer: paper grid + generative loudness pixels.
    const quiet = new QuietMapLayer();
    quiet.addTo(map);
    quietLayerRef.current = quiet;

    const routesGroup = L.layerGroup().addTo(map);
    const zonesGroup = L.layerGroup().addTo(map);
    const communityGroup = L.layerGroup().addTo(map);
    const logsGroup = L.layerGroup().addTo(map);

    const clickActionPopup = L.popup({ closeButton: true, autoClose: true, className: 'map-action-popup' });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      const popupHtml = `
        <div style="font-family:${FONT}; min-width:170px; color:${COLORS.ink}; padding:1px;">
          <div style="font-family:${MONO}; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-bottom:7px;">
            Location selected
          </div>
          <div style="display:flex; flex-direction:column; gap:5px;">
            <button
              id="map-popup-set-a"
              style="background:${COLORS.ink}; color:${COLORS.paper}; border:none; padding:7px 9px; border-radius:6px; font-family:${FONT}; font-size:11px; font-weight:550; cursor:pointer; text-align:left;"
            >
              Set start
            </button>
            <button
              id="map-popup-set-b"
              style="background:${COLORS.paper}; color:${COLORS.ink}; border:1px solid ${COLORS.ink}; padding:7px 9px; border-radius:6px; font-family:${FONT}; font-size:11px; font-weight:550; cursor:pointer; text-align:left;"
            >
              Set destination
            </button>
            <button
              id="map-popup-log-noise"
              style="background:transparent; color:${COLORS.inkSoft}; border:1px solid ${COLORS.grid}; padding:7px 9px; border-radius:6px; font-family:${FONT}; font-size:11px; font-weight:500; cursor:pointer; text-align:left;"
            >
              Log a sound here
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
      quietLayerRef.current = null;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Feed the design layer: your position, and your live ambient reading
  useEffect(() => {
    quietLayerRef.current?.setUser(userLat, userLon);
  }, [userLat, userLon]);

  useEffect(() => {
    quietLayerRef.current?.setAmbientDb(currentDb);
  }, [currentDb]);

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

    // You are a hole in the drawing, not a pin on top of it — a plain ink dot
    // sitting inside the clearing the design layer opens around you.
    const liveGpsIcon = L.divIcon({
      className: 'live-gps-marker',
      html: `
        <div style="width:12px; height:12px; box-shadow:inset 0 0 0 2px ${COLORS.ink};"></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLat, userLon], { icon: liveGpsIcon, zIndexOffset: 1000 }).addTo(map);
      userMarkerRef.current.bindTooltip('You', { permanent: false, direction: 'top' });

      userAccuracyPulseRef.current = L.circle([userLat, userLon], {
        radius: DESIGN.dissolve.youRadiusMeters,
        color: COLORS.gridDeep,
        fillOpacity: 0,
        weight: 1,
        dashArray: '2, 4',
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
      const level = levelFromDb(report.decibels);
      const color = LEVELS[level].color;

      const getNoiseIconSvg = (type: string, strokeColor: string) => {
        let svgContent = '';
        switch (type) {
          case 'construction':
            svgContent = `<path d="M2 22h20M5 22V11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M12 5V2M10 2h4M9 13h6M9 17h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
            break;
          case 'sirens-traffic':
            svgContent = `<path d="M12 2L2 22h20L12 2zM12 9v4M12 17h.01" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
            break;
          case 'subway-screech':
            svgContent = `<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`;
            break;
          case 'nightlife':
            svgContent = `<path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/>`;
            break;
          case 'horn-exhaust':
            svgContent = `<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="7" cy="17" r="2" fill="currentColor"/><circle cx="17" cy="17" r="2" fill="currentColor"/>`;
            break;
          case 'quiet-spot':
            svgContent = `<path d="M12 22V17M12 17c-2.8 0-5-2.2-5-5a5 5 0 0 1 1.7-3.8A5.5 5.5 0 0 1 12 4.5a5.5 5.5 0 0 1 3.3 3.7A5 5 0 0 1 17 12c0 2.8-2.2 5-5 5z" stroke="currentColor" stroke-width="2" fill="none"/>`;
            break;
          default:
            svgContent = `<path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2"/>`;
        }
        return `
          <svg viewBox="0 0 24 24" width="14" height="14" style="color: ${strokeColor}; display: block;">
            ${svgContent}
          </svg>
        `;
      };

      const communityIcon = L.divIcon({
        className: 'custom-community-icon',
        html: `
          <div style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #1c1a16;
            border: 2px solid ${color};
            box-shadow: 0 3px 8px rgba(0,0,0,.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            ${getNoiseIconSvg(report.noiseType, color)}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([report.latitude, report.longitude], { icon: communityIcon });
      
      const popupHtml = `
        <div style="font-family:${FONT}; min-width:200px; color:${COLORS.ink};">
          <div style="display:flex; justify-content:space-between; font-family:${MONO}; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-bottom:5px;">
            <span>Community report</span>
            <span>${report.timeAgo || 'just now'}</span>
          </div>
          <div style="font-size:13px; font-weight:600; margin-bottom:3px; line-height:1.25;">
            ${report.zoneName}
          </div>
          <div style="font-size:11px; margin-bottom:8px; color:${COLORS.inkSoft}; line-height:1.4;">
            ${report.description}
          </div>
          <div style="display:flex; align-items:center; gap:7px; border-top:1px solid ${COLORS.grid}; padding-top:7px;">
            <span style="width:11px; height:11px; border-radius:2px; background:${color}; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);"></span>
            <span style="font-size:12px; font-weight:600;">${LEVELS[level].label}</span>
            <span style="font-family:${MONO}; font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-left:auto;">
              ${report.isUserReported ? 'by you' : (report.reporterName || 'NYC walker')}
            </span>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      communityGroup.addLayer(marker);
    });
  }, [communityReports, showCommunityLayer]);

  // Auto-focus and open popup when a new community report is submitted by the user
  const prevReportsCountRef = useRef(communityReports.length);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || communityReports.length <= prevReportsCountRef.current) {
      prevReportsCountRef.current = communityReports.length;
      return;
    }

    prevReportsCountRef.current = communityReports.length;

    const latestReport = communityReports[0]; // because new reports are prepended in App.tsx
    if (latestReport && latestReport.isUserReported) {
      // Close any active click actions
      map.closePopup();

      // Pan & zoom to new report location
      map.setView([latestReport.latitude, latestReport.longitude], 16);

      // Re-create the community popup HTML
      const level = levelFromDb(latestReport.decibels);
      const color = LEVELS[level].color;
      const popupHtml = `
        <div style="font-family:${FONT}; min-width:200px; color:${COLORS.ink};">
          <div style="display:flex; justify-content:space-between; font-family:${MONO}; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-bottom:5px;">
            <span>Community report</span>
            <span>Just now</span>
          </div>
          <div style="font-size:13px; font-weight:600; margin-bottom:3px; line-height:1.25;">
            ${latestReport.zoneName}
          </div>
          <div style="font-size:11px; margin-bottom:8px; color:${COLORS.inkSoft}; line-height:1.4;">
            ${latestReport.description}
          </div>
          <div style="display:flex; align-items:center; gap:7px; border-top:1px solid ${COLORS.grid}; padding-top:7px;">
            <span style="width:11px; height:11px; border-radius:2px; background:${color}; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);"></span>
            <span style="font-size:12px; font-weight:600;">${LEVELS[level].label}</span>
            <span style="font-family:${MONO}; font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-left:auto;">
              by you
            </span>
          </div>
        </div>
      `;

      // Open popup on the map at the coordinate after a small delay to let the map finish panning
      setTimeout(() => {
        L.popup({ autoClose: true, closeOnClick: true })
          .setLatLng([latestReport.latitude, latestReport.longitude])
          .setContent(popupHtml)
          .openOn(map);
      }, 350);
    }
  }, [communityReports]);

  const [live311Zones, setLive311Zones] = useState<SoundDensityZone[]>([]);

  // Fetch real live NYC 311 OpenData noise complaints
  useEffect(() => {
    fetchLiveNyc311NoiseComplaints(60).then((records) => {
      if (records && records.length > 0) {
        setLive311Zones(records);
      }
    });
  }, []);

  // Update Multi-Dataset NYC Sound Density Zones (including live NYC 311 complaints and community reports)
  useEffect(() => {
    const zonesGroup = zonesLayerGroupRef.current;
    if (!zonesGroup) return;

    zonesGroup.clearLayers();

    const mappedCommunityZones: SoundDensityZone[] = communityReports.map((report) => ({
      id: report.id,
      name: report.zoneName,
      borough: 'Manhattan',
      type: report.noiseType === 'quiet-spot' ? 'quiet-haven' :
            report.noiseType === 'construction' ? 'construction' :
            report.noiseType === 'nightlife' ? 'nightlife' :
            report.noiseType === 'sirens-traffic' ? 'traffic-siren' : 'traffic-siren',
      datasetCategory: 'community-report',
      latitude: report.latitude,
      longitude: report.longitude,
      radiusMeters: report.noiseType === 'quiet-spot' ? 120 : 80,
      baseDecibels: report.decibels,
      peakDecibels: report.decibels + 5,
      description: report.description,
    }));

    const allZones = [...NYC_SOUND_ZONES, ...live311Zones, ...mappedCommunityZones];

    // Every zone in view becomes a field on the design layer — the quiet ones
    // as much as the loud ones. The map is a reading of the whole soundscape,
    // not a warning about what happens to be near you.
    const quietZones: QuietZone[] = [];

    allZones.forEach((zone) => {
      let isVisible = false;

      const cat: NoiseDatasetType = zone.datasetCategory || (
        zone.type === 'subway-screech' ? 'mta-transit' :
        zone.type === 'quiet-haven' ? 'quiet-haven' :
        zone.type === 'construction' ? 'construction' :
        zone.type === 'nightlife' ? '311-complaint' : 'traffic-corridor'
      );

      if (cat === '311-complaint' && show311Layer) isVisible = true;
      else if (cat === 'mta-transit' && showTransitLayer) isVisible = true;
      else if (cat === 'traffic-corridor' && showTrafficLayer) isVisible = true;
      else if (cat === 'construction' && showConstructionLayer) isVisible = true;
      else if (cat === 'quiet-haven' && showQuietLayer) isVisible = true;
      else if (cat === 'community-report' && showCommunityLayer) isVisible = true;

      if (cat !== 'quiet-haven' && zone.baseDecibels > maxDbFilter) {
        isVisible = false;
      }

      if (!isVisible) return;

      // the zone's colour is its loudness, nothing else
      const level = levelFromDb(zone.baseDecibels);
      const color = LEVELS[level].color;

      quietZones.push({
        id: zone.id,
        lat: zone.latitude,
        lon: zone.longitude,
        radiusMeters: zone.radiusMeters,
        decibels: zone.baseDecibels,
        peakDecibels: zone.peakDecibels,
        kind: cat,
        label: zone.name,
      });

      // The zone is drawn by the design layer as pixels. This circle is left
      // invisible purely as a hit target, so tapping a zone still works.
      const circle = L.circle([zone.latitude, zone.longitude], {
        radius: zone.radiusMeters,
        stroke: false,
        fillColor: '#ffffff',
        fillOpacity: 0.01,
        interactive: true,
      });

      const popupContent = `
        <div style="font-family: ${FONT}; min-width: 210px; color: ${COLORS.ink};">
          <div style="display:flex; justify-content:space-between; align-items:center; font-family:${MONO}; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-bottom:5px;">
            <span>${zone.datasetCategory === '311-complaint' ? 'NYC 311' : zone.datasetCategory === 'community-report' ? 'COMMUNITY REPORT' : zone.type.replace(/-/g, ' ').toUpperCase()}</span>
            <span>${zone.borough}</span>
          </div>
          <div style="font-size:13px; font-weight:600; margin-bottom:3px; line-height:1.25;">
            ${zone.name}
          </div>
          <div style="font-size:11px; margin-bottom:8px; color:${COLORS.inkSoft}; line-height:1.4;">
            ${zone.description}
          </div>
          <div style="display:flex; align-items:center; gap:7px; border-top:1px solid ${COLORS.grid}; padding-top:7px;">
            <span style="width:11px; height:11px; border-radius:2px; background:${color}; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);"></span>
            <span style="font-size:12px; font-weight:600;">${LEVELS[level].label}</span>
            <span style="font-family:${MONO}; font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:${COLORS.inkSoft}; margin-left:auto;">${LEVELS[level].note}</span>
          </div>
          ${zone.externalUrl ? `
            <div style="margin-top:7px; padding-top:6px; border-top:1px solid ${COLORS.grid};">
              <a
                href="${zone.externalUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="font-family:${MONO}; font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:${COLORS.ink};"
              >
                Open NYC OpenData record ↗
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

    quietLayerRef.current?.setZones(quietZones);
  }, [show311Layer, showTransitLayer, showTrafficLayer, showQuietLayer, showConstructionLayer, showCommunityLayer, maxDbFilter, onSelectZone, live311Zones, communityReports]);

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
          color: LEVELS[3].color,
          weight: 2,
          opacity: 0.9,
          dashArray: '2, 5',
        });
        poly.bindTooltip('Fastest', { sticky: true });
        routesGroup.addLayer(poly);
      }
    }



    // Render Avoid-Noise Route (cyan)
    if (avoidNoiseRoute && avoidNoiseRoute.coordinates.length > 0) {
      const isSelected = activeRoute?.silenceLevel === 'avoid-noise';
      if (!isSelected) {
        const poly = L.polyline(avoidNoiseRoute.coordinates, {
          color: LEVELS[2].color,
          weight: 2,
          opacity: 0.9,
          dashArray: '2, 5',
        });
        poly.bindTooltip('Noise-free', { sticky: true });
        routesGroup.addLayer(poly);
      }
    }

    // Your path — you to destination. It sits above the loudness pixels and
    // multiplies with them, so the line darkens wherever it crosses sound.
    // Quiet stretches stay the flat route colour; a very-loud crossing turns
    // it almost black. The route reads its own exposure. No halo: white is the
    // identity for multiply, so a halo would simply vanish.
    if (activeRoute && activeRoute.coordinates.length > 0) {
      const mainLine = L.polyline(activeRoute.coordinates, {
        color: COLORS.route,
        weight: 3.5,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        className: 'quiet-route',
      });
      mainLine.bindTooltip(activeRoute.title, { sticky: true });
      routesGroup.addLayer(mainLine);
    }

    // Origin Marker
    if (origin) {
      const originIcon = L.divIcon({
        className: 'custom-origin-icon',
        html: `<div style="width:12px; height:12px; box-shadow:inset 0 0 0 2px ${COLORS.ink};"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const originMarker = L.marker([origin.latitude, origin.longitude], { icon: originIcon });
      originMarker.bindTooltip(`<b>Start:</b> ${origin.name}`);
      routesGroup.addLayer(originMarker);
    }

    // Destination Marker
    if (destination) {
      const destIcon = L.divIcon({
        className: 'custom-dest-icon',
        html: `<div style="width:12px; height:12px; background:${COLORS.ink};"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const destMarker = L.marker([destination.latitude, destination.longitude], { icon: destIcon });
      destMarker.bindTooltip(`<b>End:</b> ${destination.name}`);
      routesGroup.addLayer(destMarker);
    }

    // Auto-fit map to show both markers (A and B) with padding
    if (origin && destination) {
      try {
        const bounds = L.latLngBounds(
          [origin.latitude, origin.longitude],
          [destination.latitude, destination.longitude]
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
      } catch {
        // ignore bounds errors
      }
    }
  }, [activeRoute, fastestRoute, avoidNoiseRoute, origin, destination]);

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

    const walkLevel = levelFromDb(currentDecibels);
    const walkerIcon = L.divIcon({
      className: 'sim-walker-icon',
      html: `
        <div style="width:12px; height:12px; box-shadow:inset 0 0 0 2px ${COLORS.ink}, 0 0 0 3px ${LEVELS[walkLevel].color};"></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const pulseRadius = Math.max(15, (currentDecibels - 30) * 1.8);

    if (!simMarkerRef.current) {
      simMarkerRef.current = L.marker([currentLat, currentLon], { icon: walkerIcon }).addTo(map);
      simPulseRef.current = L.circle([currentLat, currentLon], {
        radius: pulseRadius,
        color: COLORS.gridDeep,
        fillOpacity: 0,
        weight: 1,
        dashArray: '2, 4',
      }).addTo(map);
    } else {
      simMarkerRef.current.setLatLng([currentLat, currentLon]);
      simMarkerRef.current.setIcon(walkerIcon);
      if (simPulseRef.current) {
        simPulseRef.current.setLatLng([currentLat, currentLon]);
        simPulseRef.current.setRadius(pulseRadius);
        simPulseRef.current.setStyle({ color: COLORS.gridDeep });
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
    <div className={`relative w-full overflow-hidden bg-white ${isFullScreenMode ? 'h-full' : 'h-[380px] sm:h-[460px] rounded-3xl border border-stone-800'}`}>
      <div ref={mapContainerRef} className="w-full h-full z-10 bg-white" />

      {/* Live GPS Indicator Chip */}
      {userLat && userLon && (
        <div className="absolute top-3 left-3 z-[400] bg-stone-950 border border-stone-800 rounded-2xl px-3 py-1.5 flex items-center gap-2 pointer-events-auto">
          <span className="w-1.5 h-1.5 bg-stone-100" />
          <span className="text-[10px] font-mono text-stone-100 uppercase tracking-[0.14em]">
            Live
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
            <span>Sound layers</span>
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
