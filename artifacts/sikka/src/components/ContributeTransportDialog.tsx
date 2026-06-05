import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';
import { toast } from 'sonner';
import { Bus, MapPin, Square } from 'lucide-react';

interface ContributeTransportDialogProps {
  open: boolean;
  onClose: () => void;
  language: Language;
}

type Operator = 'microbus' | 'nta' | 'cta';
interface TransportType {
  id: string;
  nameEn: string;
}

const OPERATOR_TYPE_NAME: Record<Operator, string> = {
  microbus: 'Microbus',
  nta: 'NTA Bus',
  cta: 'CTA Bus',
};

export default function ContributeTransportDialog({
  open,
  onClose,
  language,
}: ContributeTransportDialogProps) {
  const [transportName, setTransportName] = useState('');
  const [transportNumber, setTransportNumber] = useState('');
  const [operator, setOperator] = useState<Operator>('microbus');
  const [fromArea, setFromArea] = useState('');
  const [toArea, setToArea] = useState('');
  const [price, setPrice] = useState('');
  const [trace, setTrace] = useState<[number, number][]>([]);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>([]);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get('/transport-types')
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setTransportTypes(data as TransportType[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setTransportName('');
    setTransportNumber('');
    setOperator('microbus');
    setFromArea('');
    setToArea('');
    setPrice('');
    setTrace([]);
    stopRecording();
  };

  const stopRecording = () => {
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    if (!navigator.geolocation) return;
    setRecording(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setTrace((prev) => [...prev, [pos.coords.longitude, pos.coords.latitude]]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!transportName.trim()) {
      toast.error(t('transportNameRequired', language));
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = Number(price);
      const transportTypeId =
        transportTypes.find((tt) => tt.nameEn.toLowerCase() === OPERATOR_TYPE_NAME[operator].toLowerCase())?.id ?? null;
      await api.post('/transport-reports', {
        transportName: transportName.trim(),
        transportNumber: transportNumber || null,
        transportTypeId,
        fromArea: fromArea || null,
        toArea: toArea || null,
        priceEgp: Number.isFinite(priceNum) && price !== '' ? priceNum : null,
        gpsTrace: trace.length ? trace : null,
      });
      toast.success(t('contributeSubmitted', language));
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('contributeFailed', language));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('contributeTitle', language)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-[2rem] bg-primary/10 p-3 flex gap-3 text-sm text-foreground">
            <Bus className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p>{t('contributeBusMicrobusOnly', language)}</p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">{t('transportName', language)}</label>
            <Input value={transportName} onChange={(e) => setTransportName(e.target.value)} className="text-sm rounded-[2rem]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('operatorLabel', language)}</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(['microbus', 'nta', 'cta'] as Operator[]).map((op) => (
                <Button
                  key={op}
                  type="button"
                  variant={operator === op ? 'default' : 'outline'}
                  className="w-full h-11 rounded-[2rem] text-xs"
                  onClick={() => setOperator(op)}
                >
                  {op === 'microbus' ? t('microbus', language) : t(op === 'nta' ? 'operatorNta' : 'operatorCta', language)}
                </Button>
              ))}
            </div>
          </div>
          {operator !== 'microbus' && (
            <div>
              <label className="text-xs text-muted-foreground">{t('busNumber', language)}</label>
              <Input value={transportNumber} onChange={(e) => setTransportNumber(e.target.value)} className="text-sm rounded-[2rem]" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t('fromArea', language)}</label>
              <Input value={fromArea} onChange={(e) => setFromArea(e.target.value)} className="text-sm rounded-[2rem]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('toArea', language)}</label>
              <Input value={toArea} onChange={(e) => setToArea(e.target.value)} className="text-sm rounded-[2rem]" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('priceLabel', language)}</label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="text-sm rounded-[2rem]" />
          </div>

          <Button
            type="button"
            variant={recording ? 'destructive' : 'outline'}
            className="w-full h-12 rounded-[2rem] gap-2"
            onClick={toggleRecording}
          >
            {recording ? <Square className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            {recording ? t('stopRecording', language) : t('recordGps', language)}
          </Button>
          {trace.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {trace.length} {t('gpsPointsCaptured', language)}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-11 rounded-[2rem]" onClick={handleClose} disabled={submitting}>
              {t('back', language)}
            </Button>
            <Button className="flex-1 h-11 rounded-[2rem]" onClick={handleSubmit} disabled={submitting}>
              {t('submit', language)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
