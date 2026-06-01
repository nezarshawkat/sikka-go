import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { User, MapPin, Navigation, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { Milestone } from 'lucide-react';
import { useIsDark, MAP_STYLE_LIGHT, MAP_STYLE_DARK } from '@/hooks/useIsDark';
import { getDirections } from '@/lib/routePaths';
import { useTripTracking } from '@/hooks/useTripTracking';
import TripGuideSheet, { type GuidePlan, type GuideSegment, type GuideAlternative } from '@/components/trip/TripGuideSheet';
import SegmentReviewDialog, { type ReviewSegment } from '@/components/trip/SegmentReviewDialog';
import ReportDialog from '@/components/ReportDialog';
import ContributeTransportDialog from '@/components/ContributeTransportDialog';
import { toast } from 'sonner';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibmV6YXJpc21haWwiLCJhIjoiY21ucTdoZ3gxMDRiNzJxcjRhemY0ejhhbyJ9.fkkcuisxpZP9y0Uaq9HryQ';
const CAIRO_CENTER = { latitude: 30.0444, longitude: 31.2357 };

const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=en,ar&limit=1&types=address,neighborhood,locality,place`
    );
    const data = await res.json();
    return data.features?.[0]?.place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};

interface ActiveTripPlan extends GuidePlan {
  segments: (GuideSegment & { route_geometry?: [number, number][] | null })[];
  startLat: number; startLng: number; destLat: number; destLng: number;
  destination: string;
}

const Index = () => {
  const { user, isLoading, language } = useAuth();
  const navigate = useNavigate();
  const isDark = useIsDark();
  const mapRef = useRef<MapRef | null>(null);
  const [viewState, setViewState] = useState({ ...CAIRO_CENTER, zoom: 14 });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeTrip, setActiveTrip] = useState<ActiveTripPlan | null>(null);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [routeCoords, setRouteCoords] = useState<{ segIndex: number; coords: [number, number][] }[]>([]);

  const [reviewSeg, setReviewSeg] = useState<ReviewSegment | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tripReviewOpen, setTripReviewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      if (!sessionStorage.getItem('splashShown')) {
        navigate('/splash');
      } else {
        navigate('/auth');
      }
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    const stored = sessionStorage.getItem('tripPlan');
    if (stored) {
      try {
        const plan = JSON.parse(stored);
        if (plan?.segments?.length) {
          setActiveTrip(plan);
          setCurrentSegIdx(0);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          setViewState((v) => ({ ...v, latitude: loc.lat, longitude: loc.lng }));
          const name = await reverseGeocode(loc.lat, loc.lng);
          setLocationName(name);
        },
        () => {
          setUserLocation({ lat: CAIRO_CENTER.latitude, lng: CAIRO_CENTER.longitude });
          setLocationName('Cairo, Egypt');
        }
      );
    }
  }, []);

  // Load road geometry for each segment of the active trip
  const loadRoutes = useCallback(async (plan: ActiveTripPlan) => {
    const results: { segIndex: number; coords: [number, number][] }[] = [];
    const segCount = plan.segments.length;
    for (let i = 0; i < segCount; i++) {
      const seg = plan.segments[i];
      if (seg.route_geometry && seg.route_geometry.length >= 2) {
        results.push({ segIndex: i, coords: seg.route_geometry });
        continue;
      }
      const startLng = plan.startLng + (plan.destLng - plan.startLng) * (i / segCount);
      const startLat = plan.startLat + (plan.destLat - plan.startLat) * (i / segCount);
      const endLng = plan.startLng + (plan.destLng - plan.startLng) * ((i + 1) / segCount);
      const endLat = plan.startLat + (plan.destLat - plan.startLat) * ((i + 1) / segCount);
      const profile = seg.icon === 'walk' ? 'walking' : 'driving';
      const coords = await getDirections([startLng, startLat], [endLng, endLat], profile);
      results.push({ segIndex: i, coords });
    }
    setRouteCoords(results);
  }, []);

  useEffect(() => {
    if (activeTrip) {
      setRouteCoords([]);
      loadRoutes(activeTrip);
    }
  }, [activeTrip, loadRoutes]);

  // Fit map to the route once loaded
  useEffect(() => {
    if (!activeTrip || !routeCoords.length || !mapRef.current) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    routeCoords.forEach(({ coords }) =>
      coords.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      })
    );
    if (Number.isFinite(minLng)) {
      try {
        mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 800 });
      } catch {}
    }
  }, [routeCoords, activeTrip]);

  const onApproachSegmentEnd = useCallback((segIdx: number) => {
    if (!activeTrip) return;
    if (segIdx < activeTrip.segments.length - 1) {
      toast(t('approachingNext', language));
    }
  }, [activeTrip, language]);

  const { userPos, progress, remainingMinutes } = useTripTracking({
    enabled: !!activeTrip,
    segments: activeTrip?.segments ?? [],
    currentSegIdx,
    routeCoords,
    onApproachSegmentEnd,
  });

  const clearTrip = () => {
    sessionStorage.removeItem('tripPlan');
    setActiveTrip(null);
    setCurrentSegIdx(0);
    setExpanded(false);
    setRouteCoords([]);
  };

  const handleNext = () => {
    if (!activeTrip) return;
    setCurrentSegIdx((i) => Math.min(i + 1, activeTrip.segments.length - 1));
  };
  const handleBack = () => setCurrentSegIdx((i) => Math.max(i - 1, 0));

  const handleDone = () => {
    if (!activeTrip) return;
    const seg = activeTrip.segments[currentSegIdx];
    setReviewSeg({ transport_type_id: seg.transport_type_id, transport_name: seg.transport_name });
    setReviewOpen(true);
  };

  const handleSegmentReviewDone = () => {
    if (!activeTrip) return;
    if (currentSegIdx >= activeTrip.segments.length - 1) {
      setTripReviewOpen(true);
    } else {
      setCurrentSegIdx((i) => i + 1);
    }
  };

  const handleSwap = (segIdx: number, alt: GuideAlternative) => {
    if (!activeTrip) return;
    const newSegments = [...activeTrip.segments];
    const old = newSegments[segIdx];
    newSegments[segIdx] = {
      ...old, transport_type_id: alt.transport_type_id, transport_name: alt.transport_name,
      cost_egp: alt.cost_egp, duration_minutes: alt.duration_minutes, color: alt.color,
      icon: alt.icon, line_number: alt.line_number || '',
    };
    const newTotal = newSegments.reduce((s, sg) => s + sg.cost_egp, 0);
    const newTime = newSegments.reduce((s, sg) => s + sg.duration_minutes, 0);
    const updated = { ...activeTrip, segments: newSegments, total_cost_egp: newTotal, total_duration_minutes: newTime };
    setActiveTrip(updated);
    sessionStorage.setItem('tripPlan', JSON.stringify(updated));
    toast.success(t('planUpdated', language));
  };

  const routeGeoJSON = {
    type: 'FeatureCollection' as const,
    features: routeCoords.map(({ segIndex, coords }) => ({
      type: 'Feature' as const,
      properties: {
        color: activeTrip?.segments[segIndex]?.color || '#3B82F6',
        name: activeTrip?.segments[segIndex]?.line_number || activeTrip?.segments[segIndex]?.transport_name || '',
      },
      geometry: { type: 'LineString' as const, coordinates: coords },
    })),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {MAPBOX_TOKEN ? (
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          {activeTrip && routeCoords.length > 0 && (
            <Source id="home-route" type="geojson" data={routeGeoJSON}>
              <Layer id="home-route-line" type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 }} />
              <Layer id="home-route-labels" type="symbol"
                layout={{ 'symbol-placement': 'line', 'symbol-spacing': 200, 'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] }}
                paint={{ 'text-color': '#fff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 3 }} />
            </Source>
          )}

          {activeTrip && (
            <>
              <Marker latitude={activeTrip.startLat} longitude={activeTrip.startLng}>
                <div className="h-4 w-4 rounded-full bg-primary border-2 border-white shadow" />
              </Marker>
              <Marker latitude={activeTrip.destLat} longitude={activeTrip.destLng}>
                <div className="h-4 w-4 rounded-full bg-destructive border-2 border-white shadow" />
              </Marker>
            </>
          )}

          {(userPos || userLocation) && (
            <Marker latitude={(userPos ?? userLocation)!.lat} longitude={(userPos ?? userLocation)!.lng}>
              <div className="relative">
                <div className="h-4 w-4 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
                <div className="absolute inset-0 h-4 w-4 rounded-full bg-blue-500 animate-ping opacity-30" />
              </div>
            </Marker>
          )}
        </Map>
      ) : (
        <div className="h-full w-full bg-muted flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2" />
            <p className="text-sm">Map requires Mapbox token</p>
          </div>
        </div>
      )}

      {/* Search bar overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 safe-area-top z-20">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-2">
          <LocationAutocomplete
            value={searchQuery}
            onChange={setSearchQuery}
            onSelect={(suggestion) => {
              navigate(`/plan?destination=${encodeURIComponent(suggestion.place_name)}&destLat=${suggestion.center[1]}&destLng=${suggestion.center[0]}&lat=${userLocation?.lat || CAIRO_CENTER.latitude}&lng=${userLocation?.lng || CAIRO_CENTER.longitude}`);
            }}
            placeholder={t('searchDestination', language)}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-xl bg-card/95 backdrop-blur-sm shadow-lg border-0 shrink-0"
            onClick={() => navigate('/profile')}
          >
            <User className="h-5 w-5" />
          </Button>
        </motion.div>
      </div>

      {/* Active trip guide sheet OR location info */}
      {activeTrip ? (
        <TripGuideSheet
          plan={activeTrip}
          currentSegIdx={currentSegIdx}
          progress={progress}
          remainingMinutes={remainingMinutes || activeTrip.total_duration_minutes}
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          onNext={handleNext}
          onBack={handleBack}
          onDone={handleDone}
          onClose={clearTrip}
          onSwap={handleSwap}
          onReport={() => setReportOpen(true)}
          language={language}
        />
      ) : (
        <div className="absolute bottom-6 left-4 right-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="location"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2"
            >
              {userLocation && (
                <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Navigation className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t('myLocation', language)}</p>
                    <p className="text-xs text-muted-foreground truncate">{locationName || `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`}</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => navigate('/intercity')}
                className="w-full bg-card/95 backdrop-blur-sm rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 hover:bg-card active:scale-[0.98] transition-all border border-border/50"
              >
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Milestone className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 text-start">
                  <p className="text-sm font-medium text-foreground">
                    {language === 'ar' ? 'السفر بين المحافظات' : 'Intercity Travel'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'سوبر جت · جو باص · بلو باص' : 'SuperJet · GoBus · BlueBus'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
              <button
                onClick={() => setContributeOpen(true)}
                className="w-full bg-card/95 backdrop-blur-sm rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 hover:bg-card active:scale-[0.98] transition-all border border-border/50"
              >
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <Milestone className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 text-start">
                  <p className="text-sm font-medium text-foreground">{t('contributeRoute', language)}</p>
                  <p className="text-xs text-muted-foreground">{t('contributeTitle', language)}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Per-segment review */}
      <SegmentReviewDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onSubmitted={handleSegmentReviewDone}
        segment={reviewSeg}
        language={language}
      />

      {/* End-of-trip review */}
      <SegmentReviewDialog
        open={tripReviewOpen}
        onClose={() => setTripReviewOpen(false)}
        onSubmitted={() => { setTripReviewOpen(false); clearTrip(); toast.success(t('tripComplete', language)); }}
        segment={null}
        tripLevel
        language={language}
      />

      {/* Report a problem */}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        transportTypeId={activeTrip?.segments[currentSegIdx]?.transport_type_id}
        language={language}
      />

      {/* Contribute a route */}
      <ContributeTransportDialog
        open={contributeOpen}
        onClose={() => setContributeOpen(false)}
        language={language}
      />
    </div>
  );
};

export default Index;
