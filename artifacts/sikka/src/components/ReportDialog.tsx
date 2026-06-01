import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';
import { toast } from 'sonner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REPORT_CATEGORIES = [
  'wrong_route',
  'wrong_station',
  'wrong_price',
  'missing_transport',
  'closed_station',
  'timing_error',
  'wrong_instructions',
  'other',
] as const;

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  /** Optional transport type id to attach (only used if a real DB UUID). */
  transportTypeId?: string;
  /** Optional transit line id to attach. */
  transitLineId?: string;
}

export default function ReportDialog({
  open,
  onClose,
  language,
  transportTypeId,
  transitLineId,
}: ReportDialogProps) {
  const [reportType, setReportType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [attachLocation, setAttachLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReportType('');
    setDescription('');
    setAttachLocation(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const getLocation = (): Promise<{ latitude: number; longitude: number } | null> =>
    new Promise((resolve) => {
      if (!attachLocation || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 },
      );
    });

  const handleSubmit = async () => {
    if (!reportType) {
      toast.error(t('selectCategory', language));
      return;
    }
    setSubmitting(true);
    try {
      const loc = await getLocation();
      await api.post('/reports', {
        reportType,
        description: description || null,
        transportTypeId: transportTypeId && UUID_RE.test(transportTypeId) ? transportTypeId : null,
        transitLineId: transitLineId && UUID_RE.test(transitLineId) ? transitLineId : null,
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
      });
      toast.success(t('reportSubmitted', language));
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reportFailed', language));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('reportTitle', language)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">{t('reportCategory', language)}</p>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectCategory', language)} />
              </SelectTrigger>
              <SelectContent>
                {REPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`rt_${c}`, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Textarea
            placeholder={t('reportDescription', language)}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <label className="flex items-center justify-between gap-2 text-sm">
            <span>{t('attachLocation', language)}</span>
            <Switch checked={attachLocation} onCheckedChange={setAttachLocation} />
          </label>

          <div className="flex gap-2">
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
