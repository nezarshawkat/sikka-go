import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';
import { toast } from 'sonner';
import { MapPin, Square } from 'lucide-react';

interface ContributeTransportDialogProps {
  open: boolean;
  onClose: () => void;
  language: Language;
}

export default function ContributeTransportDialog({
  open,
  onClose,
  language,
}: ContributeTransportDialogProps) {
  const [transportName, setTransportName] = useState('');
  const [transportNumber, setTransportNumber] = useState('');
  const [fromArea, setFromArea] = useState('');
  const [toArea, setToArea] = useState('');
  const [price, setPrice] = useState('');
  const [trace, setTrace] = useState<[number, number][]>([]);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const watchRef = useRef<number | null>(null);

  const reset = () => {
    setTransportName('');
    setTransportNumber('');
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
      await api.post('/transport-reports', {
        transportName: transportName.trim(),
        transportNumber: transportNumber || null,
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
          <div>
            <label className="text-xs text-muted-foreground">{t('transportName', language)}</label>
            <Input value={transportName} onChange={(e) => setTransportName(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('transportNumber', language)}</label>
            <Input value={transportNumber} onChange={(e) => setTransportNumber(e.target.value)} className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t('fromArea', language)}</label>
              <Input value={fromArea} onChange={(e) => setFromArea(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('toArea', language)}</label>
              <Input value={toArea} onChange={(e) => setToArea(e.target.value)} className="text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('priceLabel', language)}</label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="text-sm" />
          </div>

          <Button
            type="button"
            variant={recording ? 'destructive' : 'outline'}
            className="w-full gap-2"
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
            <Button variant="outline" className="flex-1" onClick={handleClose} disabled={submitting}>
              {t('back', language)}
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {t('submit', language)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
