import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Plane, Ship, TrainFront, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'flight' | 'train' | 'taxi' | 'nile';

const DATA: Record<Mode, {
  icon: typeof Plane;
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  stepsEn: string[];
  stepsAr: string[];
  bookingEn: string;
  bookingAr: string;
  bookingUrl?: string;
}> = {
  flight: {
    icon: Plane,
    titleEn: 'Domestic Flights',
    titleAr: 'الطيران الداخلي',
    summaryEn: 'Best for long trips such as Cairo to Aswan, Luxor, Sharm El Sheikh, Hurghada, Marsa Alam, and Alexandria when flights are available.',
    summaryAr: 'مناسب للرحلات الطويلة مثل القاهرة إلى أسوان أو الأقصر أو شرم الشيخ أو الغردقة أو مرسى علم أو الإسكندرية عند توفر الرحلات.',
    stepsEn: ['Check EgyptAir and Nile Air domestic routes.', 'Compare airport transfer time with bus or train.', 'Book with the airline, then use Sikka for first/last-mile travel.'],
    stepsAr: ['راجع رحلات مصر للطيران ونيل إير الداخلية.', 'قارن وقت الانتقال للمطار مع الأتوبيس أو القطار.', 'احجز من شركة الطيران ثم استخدم سكة للوصول من وإلى المطار.'],
    bookingEn: 'Open airline booking',
    bookingAr: 'فتح حجز الطيران',
    bookingUrl: 'https://www.egyptair.com/',
  },
  train: {
    icon: TrainFront,
    titleEn: 'Egypt Trains',
    titleAr: 'قطارات مصر',
    summaryEn: 'Covers the active national rail corridors, including Cairo-Alexandria, Cairo-Aswan, Delta routes, Suez/Ismailia, Fayoum, and Upper Egypt branches.',
    summaryAr: 'يغطي محاور السكك الحديدية العاملة مثل القاهرة-الإسكندرية والقاهرة-أسوان والدلتا والسويس/الإسماعيلية والفيوم وفروع الصعيد.',
    stepsEn: ['Choose the nearest rail station to your origin.', 'Check express, Spanish, VIP, sleeper, and regional services.', 'Book through ENR when online booking is available.'],
    stepsAr: ['اختر أقرب محطة قطار لنقطة البداية.', 'راجع خدمات الإكسبريس والإسباني وVIP والنوم والإقليمي.', 'احجز من سكك حديد مصر عند توفر الحجز الإلكتروني.'],
    bookingEn: 'Open ENR booking',
    bookingAr: 'فتح حجز سكك حديد مصر',
    bookingUrl: 'https://obs.enr.gov.eg/',
  },
  taxi: {
    icon: Car,
    titleEn: 'Taxi App',
    titleAr: 'تطبيق تاكسي',
    summaryEn: 'Use a licensed taxi or ride-hailing app for direct car travel between nearby governorates or for airport and station transfers.',
    summaryAr: 'استخدم تاكسي مرخص أو تطبيق طلب سيارات للتنقل المباشر بين المحافظات القريبة أو للوصول للمطار والمحطات.',
    stepsEn: ['Confirm the fare before starting.', 'Share the trip with someone you trust.', 'Use Sikka route planning for the public-transport parts.'],
    stepsAr: ['أكد السعر قبل بداية الرحلة.', 'شارك الرحلة مع شخص موثوق.', 'استخدم تخطيط سكة لأجزاء المواصلات العامة.'],
    bookingEn: 'Open taxi apps',
    bookingAr: 'فتح تطبيقات التاكسي',
  },
  nile: {
    icon: Ship,
    titleEn: 'Nile Transportation',
    titleAr: 'النقل النيلي',
    summaryEn: 'Available only on limited river corridors. Use it when your origin and destination are near supported Nile stops.',
    summaryAr: 'متاح على مسارات نهرية محدودة فقط. استخدمه عندما تكون نقطة البداية والوجهة قريبتين من مواقف نيلية مدعومة.',
    stepsEn: ['Check local river bus or ferry availability.', 'Confirm operating hours before going.', 'Combine it with bus, metro, or taxi app transfers.'],
    stepsAr: ['راجع توفر الأتوبيس النهري أو المعديات المحلية.', 'تأكد من مواعيد التشغيل قبل الذهاب.', 'اجمعه مع الأتوبيس أو المترو أو تطبيق التاكسي.'],
    bookingEn: 'Booking varies by local operator',
    bookingAr: 'الحجز حسب المشغل المحلي',
  },
};

export default function TravelMode() {
  const navigate = useNavigate();
  const { mode = 'train' } = useParams();
  const [params] = useSearchParams();
  const { language } = useAuth();
  const isAr = language === 'ar';
  const item = DATA[(mode as Mode) in DATA ? mode as Mode : 'train'];
  const Icon = item.icon;
  const routeText = useMemo(() => {
    const from = params.get('fromLabel') || params.get('from') || '';
    const to = params.get('toLabel') || params.get('to') || '';
    return from && to ? `${from} -> ${to}` : '';
  }, [params]);
  const taxiAppUrl = useMemo(() => {
    const from = encodeURIComponent(params.get('fromLabel') || params.get('from') || '');
    const to = encodeURIComponent(params.get('toLabel') || params.get('to') || '');
    return `uber://?action=setPickup&pickup[formatted_address]=${from}&dropoff[formatted_address]=${to}`;
  }, [params]);
  const bookingUrl = mode === 'taxi' ? taxiAppUrl : item.bookingUrl;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/90 p-4 backdrop-blur-xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{isAr ? item.titleAr : item.titleEn}</h1>
          {routeText && <p className="truncate text-xs text-muted-foreground">{routeText}</p>}
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Card className="glass-panel rounded-[2rem]">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.5rem] bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isAr ? item.summaryAr : item.summaryEn}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem]">
          <CardContent className="space-y-3 p-5">
            {(isAr ? item.stepsAr : item.stepsEn).map((step, index) => (
              <div key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm text-foreground">{step}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {bookingUrl ? (
          <a href={bookingUrl} target={mode === 'taxi' ? undefined : '_blank'} rel={mode === 'taxi' ? undefined : 'noopener noreferrer'}>
            <Button className="h-12 w-full rounded-[2rem] gap-2">
              {isAr ? item.bookingAr : item.bookingEn}
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        ) : (
          <Button variant="outline" className="h-12 w-full rounded-[2rem]" disabled>
            {isAr ? item.bookingAr : item.bookingEn}
          </Button>
        )}
      </main>
    </div>
  );
}
