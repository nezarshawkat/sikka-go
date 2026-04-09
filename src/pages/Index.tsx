import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, User, MapPin, Navigation } from 'lucide-react';
import { motion } from 'framer-motion';
import Map, { Marker, GeolocateControl, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const CAIRO_CENTER = { latitude: 30.0444, longitude: 31.2357 };

const Index = () => {
  const { user, isLoading, language, profile } = useAuth();
  const navigate = useNavigate();
  const [viewState, setViewState] = useState({
    ...CAIRO_CENTER,
    zoom: 12,
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          setViewState((v) => ({ ...v, latitude: loc.lat, longitude: loc.lng }));
        },
        () => {
          // Default to Cairo
          setUserLocation({ lat: CAIRO_CENTER.latitude, lng: CAIRO_CENTER.longitude });
        }
      );
    }
  }, []);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      navigate(`/plan?destination=${encodeURIComponent(searchQuery)}&lat=${userLocation?.lat || CAIRO_CENTER.latitude}&lng=${userLocation?.lng || CAIRO_CENTER.longitude}`);
    }
  }, [searchQuery, userLocation, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Map */}
      {MAPBOX_TOKEN ? (
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v11"
          style={{ width: '100%', height: '100%' }}
        >
          <GeolocateControl position="bottom-right" trackUserLocation />
          <NavigationControl position="bottom-right" showCompass={false} />
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
            <p className="text-xs mt-1">Add VITE_MAPBOX_TOKEN to secrets</p>
          </div>
        </div>
      )}

      {/* Search bar overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 safe-area-top">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchDestination', language)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 bg-card/95 backdrop-blur-sm shadow-lg border-0 h-12 text-base rounded-xl"
            />
          </div>
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

      {/* Current location pill */}
      {userLocation && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-6 left-4 right-4"
        >
          <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t('myLocation', language)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Index;
