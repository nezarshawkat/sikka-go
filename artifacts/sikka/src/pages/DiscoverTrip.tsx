import { type ComponentType, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bus, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';

type ModeKey = 'microbus' | 'bus';

const modeMeta: Record<ModeKey, { icon: ComponentType<{ className?: string }>; nameEn: string; nameAr: string; hintEn: string; hintAr: string }> = {
  microbus: { icon: Bus, nameEn: 'Microbus', nameAr: 'ميكروباص', hintEn: 'Record the actual shared route you ride.', hintAr: 'سجّل خط الميكروباص الحقيقي أثناء الركوب.' },
  bus: { icon: Bus, nameEn: 'Bus', nameAr: 'أتوبيس', hintEn: 'We will ask CTA/NTA and bus number, then learn the path from GPS.', hintAr: 'سنطلب الجهة ورقم الأتوبيس ونتعلم المسار من GPS.' },
};

export default function DiscoverTrip() {
  const { language } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<ModeKey>('bus');

  const destination = params.get('destination') || '';

  const startHomeRecording = () => {
    sessionStorage.setItem('sikkaDiscoveryRecord', '1');
    sessionStorage.setItem('sikkaDiscoveryMode', mode);
    navigate('/', { replace: true });
  };

  const availableModes: ModeKey[] = ['microbus', 'bus'];

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

        <Button className="w-full h-16 rounded-[2rem] gap-2 text-base" onClick={startHomeRecording}>
          <Navigation className="h-5 w-5" />
          {t('recordGps', language)}
        </Button>
      </div>
    </div>
  );
}
