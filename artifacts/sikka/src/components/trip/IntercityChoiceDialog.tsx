import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';

interface IntercityChoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: 'serfis' | 'intercity') => void;
  fromName?: string;
  toName?: string;
  language: Language;
}

export default function IntercityChoiceDialog({
  open,
  onClose,
  onChoose,
  fromName,
  toName,
  language,
}: IntercityChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('chooseTravelMode', language)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {fromName && toName && (
            <p className="text-sm text-muted-foreground text-center">
              {fromName} → {toName}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onChoose('serfis')}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <span className="text-4xl">🚐</span>
              <span className="text-sm font-semibold text-foreground">{t('serfisOption', language)}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-snug">
                {t('serfisOptionDesc', language)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChoose('intercity')}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <span className="text-4xl">🚌</span>
              <span className="text-sm font-semibold text-foreground">{t('intercityOption', language)}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-snug">
                {t('intercityOptionDesc', language)}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
