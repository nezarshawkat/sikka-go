import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Wallet, MapPin, ArrowDown, RefreshCw, Check, Navigation, X } from 'lucide-react';
import { toast } from 'sonner';
import Map, { Source, Layer, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibmV6YXJpc21haWwiLCJhIjoiY21ucTdoZ3gxMDRiNzJxcjRhemY0ejhhbyJ9.fkkcuisxpZP9y0Uaq9HryQ';

interface Segment {
  transport_type_id: string; transport_name: string; start_name: string; end_name: string;
  cost_egp: number; duration_minutes: number; color: string; icon: string;
  alternatives: Alternative[]; route_coords?: [number, number][];
}
interface Alternative {
  transport_type_id: string; transport_name: string; cost_egp: number; duration_minutes: number; color: string; icon: string;
}
interface TripPlanData {
  segments: Segment[]; total_cost_egp: number; total_duration_minutes: number;
  budget_range: { min: number; max: number }; distance_km: number; destination: string;
  tripType: string; startLat: number; startLng: number; destLat: number; destLng: number;
}

const ICONS: Record<string, string> = {
  bus: '🚌', train: '🚆', car: '🚕', bike: '🛺', ship: '🚢', plane: '✈️', metro: '🚇', monorail: '🚝', walk: '🚶',
};

// Get actual road route between two points
async function getDirections(start: [number, number], end: [number, number], profile = 'driving'): Promise<[number, number][]> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    );
    const data = await res.json();
    return data.routes?.[0]?.geometry?.coordinates || [start, end];
  } catch { return [start, end]; }
}

const TripResult = () => {
  const navigate = useNavigate();
  const { language } = useAuth();
  const [plan, setPlan] = useState<TripPlanData | null>(null);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [currentSegIndex, setCurrentSegIndex] = useState(0);
  const [routeCoords, setRouteCoords] = useState<{ segIndex: number; coords: [number, number][] }[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('tripPlan');
    if (stored) setPlan(JSON.parse(stored));
    else navigate('/');
  }, [navigate]);

  // Load actual road routes for all segments
  const loadRoutes = useCallback(async () => {
    if (!plan) return;
    setIsLoadingRoutes(true);
    const results: { segIndex: number; coords: [number, number][] }[] = [];
    
    const segCount = plan.segments.length;
    for (let i = 0; i < segCount; i++) {
      const startLng = plan.startLng + (plan.destLng - plan.startLng) * (i / segCount);
      const startLat = plan.startLat + (plan.destLat - plan.startLat) * (i / segCount);
      const endLng = plan.startLng + (plan.destLng - plan.startLng) * ((i + 1) / segCount);
      const endLat = plan.startLat + (plan.destLat - plan.startLat) * ((i + 1) / segCount);
      
      const seg = plan.segments[i];
      const profile = seg.icon === 'walk' ? 'walking' : 'driving';
      const coords = await getDirections([startLng, startLat], [endLng, endLat], profile);
      results.push({ segIndex: i, coords });
    }
    
    setRouteCoords(results);
    setIsLoadingRoutes(false);
  }, [plan]);

  useEffect(() => { if (plan && showMap && routeCoords.length === 0) loadRoutes(); }, [plan, showMap, loadRoutes, routeCoords.length]);

  // GPS tracking
  const startTracking = useCallback(() => {
    setIsTracking(true);
    setShowMap(true);
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => toast.error('GPS unavailable'),
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
    }
    toast.success(t('haveGreatTrip', language));
  }, [language]);

  useEffect(() => {
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // Determine which segment user is closest to
  useEffect(() => {
    if (!userPos || !routeCoords.length || !plan) return;
    let minDist = Infinity;
    let closestSeg = 0;
    routeCoords.forEach(({ segIndex, coords }) => {
      coords.forEach(([lng, lat]) => {
        const d = Math.sqrt((lng - (userPos.lng || 0)) ** 2 + (lat - (userPos.lat || 0)) ** 2);
        if (d < minDist) { minDist = d; closestSeg = segIndex; }
      });
    });
    setCurrentSegIndex(closestSeg);
  }, [userPos, routeCoords, plan]);

  const handleSwap = (segIndex: number, alt: Alternative) => {
    if (!plan) return;
    const newSegments = [...plan.segments];
    const oldSeg = newSegments[segIndex];
    newSegments[segIndex] = { ...oldSeg, transport_type_id: alt.transport_type_id, transport_name: alt.transport_name, cost_egp: alt.cost_egp, duration_minutes: alt.duration_minutes, color: alt.color, icon: alt.icon };
    const newTotal = newSegments.reduce((s, seg) => s + seg.cost_egp, 0);
    const newTime = newSegments.reduce((s, seg) => s + seg.duration_minutes, 0);
    setPlan({ ...plan, segments: newSegments, total_cost_egp: newTotal, total_duration_minutes: newTime });
    setSwapIndex(null);
    toast.success(t('planUpdated', language));
  };

  if (!plan) return null;

  const getIcon = (icon: string) => ICONS[icon] || '🚌';

  // Build GeoJSON from actual road routes
  const routeGeoJSON = {
    type: 'FeatureCollection' as const,
    features: routeCoords.map(({ segIndex, coords }) => ({
      type: 'Feature' as const,
      properties: { color: plan.segments[segIndex]?.color || '#3B82F6', name: plan.segments[segIndex]?.transport_name },
      geometry: { type: 'LineString' as const, coordinates: coords },
    })),
  };

  const midLat = (plan.startLat + plan.destLat) / 2;
  const midLng = (plan.startLng + plan.destLng) / 2;

  const currentSeg = plan.segments[currentSegIndex];
  const nextSeg = plan.segments[currentSegIndex + 1];
  const remainingTime = plan.segments.slice(currentSegIndex).reduce((s, seg) => s + seg.duration_minutes, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b z-10 p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/plan?' + new URLSearchParams({
          destination: plan.destination, destLat: String(plan.destLat), destLng: String(plan.destLng),
          lat: String(plan.startLat), lng: String(plan.startLng),
        }).toString())}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="font-semibold text-foreground">{t('yourPlan', language)}</p>
          <p className="text-xs text-muted-foreground truncate">{plan.destination}</p>
        </div>
      </div>

      {/* Sticky tracking notification */}
      {isTracking && currentSeg && (
        <div className="sticky top-[65px] z-20 bg-primary text-primary-foreground p-3 flex items-center gap-3 shadow-lg">
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: currentSeg.color }}>
            {getIcon(currentSeg.icon)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{currentSeg.transport_name}</p>
            <p className="text-xs opacity-90">
              ~{Math.round(remainingTime)} min left · {currentSeg.end_name}
            </p>
            {nextSeg && (
              <p className="text-[10px] opacity-75">Next: {getIcon(nextSeg.icon)} {nextSeg.transport_name}</p>
            )}
          </div>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => { setIsTracking(false); if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Map (always shown when tracking, toggle otherwise) */}
      <AnimatePresence>
        {(showMap || isTracking) && (
          <motion.div initial={{ height: 0 }} animate={{ height: isTracking ? 400 : 300 }} exit={{ height: 0 }} className="overflow-hidden">
            <Map
              initialViewState={{ latitude: userPos?.lat || midLat, longitude: userPos?.lng || midLng, zoom: isTracking ? 14 : 11 }}
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle="mapbox://styles/mapbox/streets-v12"
              style={{ width: '100%', height: isTracking ? 400 : 300 }}
            >
              {isLoadingRoutes ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <Source id="route" type="geojson" data={routeGeoJSON}>
                  <Layer id="route-line" type="line"
                    paint={{ 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 }} />
                </Source>
              )}
              
              {/* Segment icon markers */}
              {routeCoords.map(({ segIndex, coords }) => {
                if (!coords.length) return null;
                const mid = coords[Math.floor(coords.length / 2)];
                const seg = plan.segments[segIndex];
                return (
                  <Marker key={`seg-${segIndex}`} latitude={mid[1]} longitude={mid[0]}>
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs shadow-lg border-2 border-white"
                      style={{ backgroundColor: seg?.color || '#3B82F6' }}>
                      {getIcon(seg?.icon || 'bus')}
                    </div>
                  </Marker>
                );
              })}

              <Marker latitude={plan.startLat} longitude={plan.startLng}>
                <div className="h-4 w-4 rounded-full bg-primary border-2 border-primary-foreground shadow" />
              </Marker>
              <Marker latitude={plan.destLat} longitude={plan.destLng}>
                <div className="h-4 w-4 rounded-full bg-destructive border-2 border-primary-foreground shadow" />
              </Marker>
              {userPos && isTracking && (
                <Marker latitude={userPos.lat} longitude={userPos.lng}>
                  <div className="relative">
                    <div className="h-5 w-5 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
                    <div className="absolute inset-0 h-5 w-5 rounded-full bg-blue-500 animate-ping opacity-30" />
                  </div>
                </Marker>
              )}
            </Map>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <Wallet className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{Math.round(plan.total_cost_egp)}</p>
          <p className="text-xs text-muted-foreground">{t('egp', language)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{Math.round(plan.total_duration_minutes)}</p>
          <p className="text-xs text-muted-foreground">{t('minutes', language)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <MapPin className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{plan.distance_km?.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">km</p>
        </CardContent></Card>
      </div>

      {/* Segments */}
      <div className="px-4 pb-6 space-y-1">
        {plan.segments.map((seg, i) => (
          <motion.div key={`${seg.transport_type_id}-${i}`}
            initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}>
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 flex justify-center">
                <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: seg.color }} />
              </div>
              <p className="text-sm text-muted-foreground">{seg.start_name}</p>
            </div>
            <div className="flex gap-3">
              <div className="w-8 flex justify-center">
                <div className="w-0.5 h-full" style={{ backgroundColor: seg.color }} />
              </div>
              <div className="flex-1">
                <Card className="border-l-4" style={{ borderLeftColor: seg.color }}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-lg"
                          style={{ backgroundColor: seg.color + '20' }}>
                          {getIcon(seg.icon)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{seg.transport_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(seg.duration_minutes)} {t('minutes', language)} · {Math.round(seg.cost_egp)} {t('egp', language)}
                          </p>
                        </div>
                      </div>
                      {seg.alternatives?.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setSwapIndex(swapIndex === i ? null : i)} className="gap-1 text-xs">
                          <RefreshCw className="h-3 w-3" /> {t('swap', language)}
                        </Button>
                      )}
                    </div>
                    <AnimatePresence>
                      {swapIndex === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="mt-3 pt-3 border-t space-y-2">
                            <p className="text-xs text-muted-foreground font-medium">{t('alternativeOptions', language)}:</p>
                            {seg.alternatives.map((alt, j) => (
                              <button key={j} onClick={() => handleSwap(i, alt)}
                                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{getIcon(alt.icon)}</span>
                                  <span className="text-sm">{alt.transport_name}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(alt.duration_minutes)} {t('minutes', language)} · {Math.round(alt.cost_egp)} {t('egp', language)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </div>
            </div>
            {i === plan.segments.length - 1 && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 flex justify-center"><div className="h-3 w-3 rounded-full bg-destructive" /></div>
                <p className="text-sm font-medium text-foreground">{seg.end_name}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="sticky bottom-0 p-4 bg-card/95 backdrop-blur-sm border-t">
        <Button className="w-full h-14 text-base rounded-xl gap-2" onClick={startTracking}>
          <Navigation className="h-5 w-5" />
          {t('startGuide', language)}
        </Button>
      </div>
    </div>
  );
};

export default TripResult;
