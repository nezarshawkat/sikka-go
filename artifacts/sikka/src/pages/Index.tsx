import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { User, MapPin, Navigation, Bus, Clock, Wallet, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import LocationAutocomplete from '@/components/LocationAutocomplete';

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

const ICONS: Record<string, string> = {
  bus: '🚌', train: '🚆', car: '🚕', bike: '🛺', ship: '🚢', plane: '✈️', metro: '🚇', monorail: '🚝', walk: '🚶',
};

interface TripSegment {
  transport_name: string; line_number?: string; start_name: string; end_name: string;
  cost_egp: number; duration_minutes: number; icon: string; color: string; info?: string;
}
interface ActiveTrip {
  segments: TripSegment[]; total_cost_egp: number; total_duration_minutes: number; destination: string;
}

const Index = () => {
  const { user, isLoading, language } = useAuth();
  const navigate = useNavigate();
  const [viewState, setViewState] = useState({ ...CAIRO_CENTER, zoom: 14 });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [showTripPanel, setShowTripPanel] = useState(false);

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
          setShowTripPanel(true);
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

  const clearTrip = () => {
    sessionStorage.removeItem('tripPlan');
    setActiveTrip(null);
    setShowTripPanel(false);
    setCurrentSegIdx(0);
  };

  const currentSeg = activeTrip?.segments?.[currentSegIdx] ?? null;

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
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          {userLocation && (
            <Marker latitude={userLocation.lat} longitude={userLocation.lng}>
              <div className="relative">
                <div className="h-4 w-4 rounded-full bg-primary border-2 border-primary-foreground shadow-lg" />
                <div className="absolute inset-0 h-4 w-4 rounded-full bg-primary animate-ping opacity-30" />
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
      <div className="absolute top-0 left-0 right-0 p-4 safe-area-top">
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

      {/* Bottom panel — active trip guide OR location info */}
      <div className="absolute bottom-6 left-4 right-4">
        <AnimatePresence mode="wait">
          {showTripPanel && activeTrip && currentSeg ? (
            <motion.div
              key="trip-guide"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-card/98 backdrop-blur-sm rounded-2xl shadow-xl border overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ICONS[currentSeg.icon] || '🚌'}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{currentSeg.transport_name}</p>
                    {currentSeg.line_number && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: currentSeg.color + '20', color: currentSeg.color }}>
                        #{currentSeg.line_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {currentSegIdx + 1}/{activeTrip.segments.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearTrip}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div className="h-6 w-px bg-border" />
                    <div className="h-2 w-2 rounded-full border-2 border-primary" />
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <span className="text-foreground font-medium leading-none">{currentSeg.start_name}</span>
                    <span className="text-muted-foreground leading-none">{currentSeg.end_name}</span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {currentSeg.duration_minutes} min
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                      <Wallet className="h-3 w-3" />
                      {currentSeg.cost_egp} EGP
                    </div>
                  </div>
                </div>

                {currentSeg.info && (
                  <div className="flex items-start gap-2 bg-primary/5 rounded-lg px-3 py-2">
                    <Bus className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/80 leading-snug">{currentSeg.info}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Total: <strong className="text-foreground">{activeTrip.total_cost_egp} EGP</strong></span>
                    <span>{activeTrip.total_duration_minutes} min</span>
                  </div>
                  <div className="flex gap-1">
                    {currentSegIdx > 0 && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setCurrentSegIdx(i => i - 1)}>
                        ←
                      </Button>
                    )}
                    {currentSegIdx < activeTrip.segments.length - 1 ? (
                      <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={() => setCurrentSegIdx(i => i + 1)}>
                        Next <ChevronRight className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={clearTrip}>
                        Done ✓
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : userLocation ? (
            <motion.div
              key="location"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card/95 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Navigation className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t('myLocation', language)}</p>
                <p className="text-xs text-muted-foreground truncate">{locationName || `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`}</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
