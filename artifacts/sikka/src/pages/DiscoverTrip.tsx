import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bus, Car, Footprints, MapPin, Send, Square, TrainFront, TramFront } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type ModeKey = 'walk' | 'taxi' | 'microbus' | 'bus' | 'metro' | 'tuktuk';

type TransportType = { id: string; nameEn: string; nameAr?: string; icon?: string };

const modeMeta: Record<ModeKey, { icon: ComponentType<{ className?: string }>; nameEn: string; nameAr: string; hintEn: string; hintAr: string }> = {
  walk: { icon: Footprints, nameEn: 'Walking', nameAr: 'المشي', hintEn: 'Always available. Use it for connectors between rides.', hintAr: 'متاح دائماً للتنقل بين مراحل الرحلة.' },
  taxi: { icon: Car, nameEn: 'Taxi', nameAr: 'تاكسي', hintEn: 'Door-to-door fallback with optional GPS trace.', hintAr: 'اختيار مباشر مع إمكانية تسجيل GPS.' },
  microbus: { icon: Bus, nameEn: 'Microbus', nameAr: 'ميكروباص', hintEn: 'Record the actual shared route you ride.', hintAr: 'سجّل خط الميكروباص الحقيقي أثناء الركوب.' },
  bus: { icon: Bus, nameEn: 'Bus', nameAr: 'أتوبيس', hintEn: 'We will ask CTA/NTA and bus number, then learn the path from GPS.', hintAr: 'سنطلب الجهة ورقم الأتوبيس ونتعلم المسار من GPS.' },
  metro: { icon: TrainFront, nameEn: 'Metro', nameAr: 'مترو', hintEn: 'Shown when a rail-like option is around your area.', hintAr: 'يظهر عند وجود خيار مترو قريب.' },
  tuktuk: { icon: TramFront, nameEn: 'Tuk-tuk', nameAr: 'توك توك', hintEn: 'For zones where short tuk-tuk rides are available.', hintAr: 'للمناطق التي يتوفر بها التوك توك.' },
};

function getTypeId(types: TransportType[], mode: ModeKey, operator: string) {
  const names = mode === 'bus'
    ? [operator === 'cta' ? 'CTA Bus' : 'NTA Bus', 'Bus']
    : [modeMeta[mode].nameEn, mode === 'walk' ? 'Walking' : mode];
  return types.find((tt) => names.some((name) => tt.nameEn?.toLowerCase().includes(name.toLowerCase())))?.id ?? null;
}

export default function DiscoverTrip() {
  const { language } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<ModeKey>('bus');
  const [operator, setOperator] = useState<'nta' | 'cta'>('nta');
  const [lineNumber, setLineNumber] = useState('');
  const [price, setPrice] = useState('');
  const [trace, setTrace] = useState<[number, number][]>([]);
  const [recording, setRecording] = useState(false);
  const [types, setTypes] = useState<TransportType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const watchRef = useRef<number | null>(null);

  const destination = params.get('destination') || '';
  const startLabel = t('myLocation', language);

  useEffect(() => {
    api.get<TransportType[]>('/transport-types').then((data) => setTypes(data ?? [])).catch(() => {});
  }, []);

  useEffect(() => () => stopRecording(), []);

  const stopRecording = () => {
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) return stopRecording();
    if (!navigator.geolocation) {
      toast.error('GPS is not available on this device');
      return;
    }
    setRecording(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setTrace((prev) => [...prev, [pos.coords.longitude, pos.coords.latitude]]),
      () => toast.error(t('contributeFailed', language)),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  };

  const submit = async () => {
    if (mode === 'bus' && !lineNumber.trim()) {
      toast.error(t('busNumberRequired', language));
      return;
    }
    setSubmitting(true);
    try {
      stopRecording();
      const priceNum = Number(price);
      await api.post('/transport-reports', {
        transportName: mode === 'bus' ? (operator === 'cta' ? 'CTA Bus' : 'NTA Bus') : modeMeta[mode].nameEn,
        transportNumber: lineNumber || null,
        transportTypeId: getTypeId(types, mode, operator),
        fromArea: startLabel,
        toArea: destination || null,
        priceEgp: Number.isFinite(priceNum) && price !== '' ? priceNum : null,
        gpsTrace: trace.length ? trace : null,
        stopsVisited: [],
      });
      toast.success(t('contributeSubmitted', language));
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('contributeFailed', language));
    } finally {
      setSubmitting(false);
    }
  };

  const availableModes: ModeKey[] = ['walk', 'taxi', 'microbus', 'bus', 'metro', 'tuktuk'];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-card/82 backdrop-blur-2xl border-b z-10 p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-lg">{t('discoverJourneyTitle', language)}</h1>
          <p className="text-xs text-muted-foreground truncate max-w-[280px]">{destination}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <Card className="glass-panel rounded-[2rem]">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">{t('discoverJourneyIntroTitle', language)}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('discoverJourneyIntroBody', language)}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          {availableModes.map((key) => {
            const Icon = modeMeta[key].icon;
            return (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`glass-panel rounded-[1.75rem] p-4 text-left border transition-all ${mode === key ? 'border-primary bg-primary/10' : 'border-white/20 bg-card/70'}`}
              >
                <Icon className="h-5 w-5 text-primary mb-2" />
                <p className="text-sm font-semibold text-foreground">{language === 'ar' ? modeMeta[key].nameAr : modeMeta[key].nameEn}</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">{language === 'ar' ? modeMeta[key].hintAr : modeMeta[key].hintEn}</p>
              </button>
            );
          })}
        </div>

        <Card className="glass-panel rounded-[2rem]">
          <CardContent className="p-4 space-y-4">
            {mode === 'bus' && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">{t('operatorLabel', language)}</label>
                  <Select value={operator} onValueChange={(v) => setOperator(v as 'nta' | 'cta')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nta">{t('operatorNta', language)}</SelectItem>
                      <SelectItem value="cta">{t('operatorCta', language)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('busNumber', language)}</label>
                  <Input value={lineNumber} onChange={(e) => setLineNumber(e.target.value)} placeholder={t('busNumberPlaceholder', language)} className="mt-1" />
                </div>
              </>
            )}
            {mode !== 'walk' && mode !== 'taxi' && mode !== 'bus' && (
              <div>
                <label className="text-xs text-muted-foreground">{t('transportNumber', language)}</label>
                <Input value={lineNumber} onChange={(e) => setLineNumber(e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">{t('priceLabel', language)}</label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
            </div>
            <Button type="button" variant={recording ? 'destructive' : 'outline'} className="w-full gap-2 rounded-2xl" onClick={toggleRecording}>
              {recording ? <Square className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              {recording ? t('stopRecording', language) : t('recordGps', language)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{trace.length} {t('gpsPointsCaptured', language)}</p>
            <Button className="w-full h-12 rounded-2xl gap-2" onClick={submit} disabled={submitting}>
              <Send className="h-4 w-4" />
              {t('submit', language)}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
