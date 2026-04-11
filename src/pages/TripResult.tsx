import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Wallet, MapPin, ArrowDown, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Segment {
  transport_type_id: string;
  transport_name: string;
  start_name: string;
  end_name: string;
  cost_egp: number;
  duration_minutes: number;
  color: string;
  icon: string;
  alternatives: Alternative[];
}

interface Alternative {
  transport_type_id: string;
  transport_name: string;
  cost_egp: number;
  duration_minutes: number;
  color: string;
  icon: string;
}

interface TripPlanData {
  segments: Segment[];
  total_cost_egp: number;
  total_duration_minutes: number;
  budget_range: { min: number; max: number };
  distance_km: number;
  destination: string;
  tripType: string;
}

const TripResult = () => {
  const navigate = useNavigate();
  const { language } = useAuth();
  const [plan, setPlan] = useState<TripPlanData | null>(null);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('tripPlan');
    if (stored) {
      setPlan(JSON.parse(stored));
    } else {
      navigate('/');
    }
  }, [navigate]);

  const handleSwap = (segIndex: number, alt: Alternative) => {
    if (!plan) return;
    const newSegments = [...plan.segments];
    const oldSeg = newSegments[segIndex];
    newSegments[segIndex] = {
      ...oldSeg,
      transport_type_id: alt.transport_type_id,
      transport_name: alt.transport_name,
      cost_egp: alt.cost_egp,
      duration_minutes: alt.duration_minutes,
      color: alt.color,
      icon: alt.icon,
    };
    const newTotal = newSegments.reduce((s, seg) => s + seg.cost_egp, 0);
    const newTime = newSegments.reduce((s, seg) => s + seg.duration_minutes, 0);
    setPlan({ ...plan, segments: newSegments, total_cost_egp: newTotal, total_duration_minutes: newTime });
    setSwapIndex(null);
    toast.success(language === 'ar' ? 'تم تحديث الخطة' : 'Plan updated');
  };

  if (!plan) return null;

  const getIcon = (icon: string) => {
    const icons: Record<string, string> = {
      bus: '🚌', train: '🚆', car: '🚕', bike: '🛺', ship: '🚢', plane: '✈️',
    };
    return icons[icon] || '🚌';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b z-10 p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="font-semibold text-foreground">{t('yourPlan', language)}</p>
          <p className="text-xs text-muted-foreground truncate">{plan.destination}</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Wallet className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{Math.round(plan.total_cost_egp)}</p>
            <p className="text-xs text-muted-foreground">{t('egp', language)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{Math.round(plan.total_duration_minutes)}</p>
            <p className="text-xs text-muted-foreground">{t('minutes', language)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <MapPin className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground">{plan.distance_km?.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">km</p>
          </CardContent>
        </Card>
      </div>

      {/* Segments */}
      <div className="px-4 pb-6 space-y-1">
        {plan.segments.map((seg, i) => (
          <motion.div
            key={`${seg.transport_type_id}-${i}`}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            {/* Start point */}
            <div className="flex items-center gap-3 py-2">
              <div className="w-8 flex justify-center">
                <div className="h-3 w-3 rounded-full border-2" style={{ borderColor: seg.color }} />
              </div>
              <p className="text-sm text-muted-foreground">{seg.start_name}</p>
            </div>

            {/* Transport card */}
            <div className="flex gap-3">
              <div className="w-8 flex justify-center">
                <div className="w-0.5 h-full" style={{ backgroundColor: seg.color }} />
              </div>
              <div className="flex-1">
                <Card className="border-l-4" style={{ borderLeftColor: seg.color }}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getIcon(seg.icon)}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{seg.transport_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(seg.duration_minutes)} {t('minutes', language)} · {Math.round(seg.cost_egp)} {t('egp', language)}
                          </p>
                        </div>
                      </div>
                      {seg.alternatives.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSwapIndex(swapIndex === i ? null : i)}
                          className="gap-1 text-xs"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Swap
                        </Button>
                      )}
                    </div>

                    {/* Alternatives dropdown */}
                    <AnimatePresence>
                      {swapIndex === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t space-y-2">
                            <p className="text-xs text-muted-foreground font-medium">Alternative options:</p>
                            {seg.alternatives.map((alt, j) => (
                              <button
                                key={j}
                                onClick={() => handleSwap(i, alt)}
                                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{getIcon(alt.icon)}</span>
                                  <span className="text-sm text-foreground">{alt.transport_name}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(alt.duration_minutes)} min · {Math.round(alt.cost_egp)} EGP
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

            {/* Connector arrow for non-last segments */}
            {i < plan.segments.length - 1 && (
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 flex justify-center">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}

            {/* End point (only for last segment) */}
            {i === plan.segments.length - 1 && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 flex justify-center">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                </div>
                <p className="text-sm font-medium text-foreground">{seg.end_name}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Start button */}
      <div className="sticky bottom-0 p-4 bg-card/95 backdrop-blur-sm border-t">
        <Button className="w-full h-14 text-base rounded-xl gap-2" onClick={() => toast.success(language === 'ar' ? 'رحلة سعيدة!' : 'Have a great trip!')}>
          <Check className="h-5 w-5" />
          {t('startGuide', language)}
        </Button>
      </div>
    </div>
  );
};

export default TripResult;
