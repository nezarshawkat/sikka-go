import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, ArrowRight } from 'lucide-react';

interface DiscoveryRow {
  transportName: string;
  transportNumber: string | null;
  reportCount: number;
  sampleFromArea: string | null;
  sampleToArea: string | null;
  avgPrice: number | null;
}

interface TransportReport {
  id: string;
  transportName: string;
  transportNumber: string | null;
  fromArea: string | null;
  toArea: string | null;
  priceEgp: number | null;
  status: string;
  createdAt: string;
}

const AdminDiscovery = () => {
  const { language } = useAuth();
  const [discovery, setDiscovery] = useState<DiscoveryRow[]>([]);
  const [pending, setPending] = useState<TransportReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get<DiscoveryRow[]>('/transport-reports?discovery=true'),
      api.get<TransportReport[]>('/transport-reports?status=pending'),
    ])
      .then(([disc, pend]) => {
        setDiscovery(disc ?? []);
        setPending(pend ?? []);
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/transport-reports/${id}`, { status });
      setPending((prev) => prev.filter((r) => r.id !== id));
      toast.success(t('planUpdated', language));
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t('routeDiscovery', language)}</h3>
        {discovery.length === 0 && <p className="text-muted-foreground text-sm">{t('noDiscovery', language)}</p>}
        {discovery.map((d, i) => (
          <Card key={`${d.transportName}-${d.transportNumber}-${i}`}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {d.transportNumber ? `${d.transportNumber} · ` : ''}{d.transportName}
                </p>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {d.reportCount}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {d.reportCount} {t('usersReported', language)}
              </p>
              {(d.sampleFromArea || d.sampleToArea) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {d.sampleFromArea || '?'} <ArrowRight className="h-3 w-3" /> {d.sampleToArea || '?'}
                </p>
              )}
              {d.avgPrice != null && (
                <p className="text-xs text-muted-foreground">
                  {t('avgPrice', language)}: {Math.round(d.avgPrice)} {t('egp', language)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t('pending', language)}</h3>
        {pending.length === 0 && <p className="text-muted-foreground text-sm">{t('noReports', language)}</p>}
        {pending.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">
                {r.transportNumber ? `${r.transportNumber} · ` : ''}{r.transportName}
              </p>
              {(r.fromArea || r.toArea) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {r.fromArea || '?'} <ArrowRight className="h-3 w-3" /> {r.toArea || '?'}
                </p>
              )}
              {r.priceEgp != null && (
                <p className="text-xs text-muted-foreground">{Math.round(r.priceEgp)} {t('egp', language)}</p>
              )}
              <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="h-8" onClick={() => updateStatus(r.id, 'approved')}>
                  {t('approve', language)}
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => updateStatus(r.id, 'rejected')}>
                  {t('reject', language)}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDiscovery;
