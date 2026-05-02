import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface TransportType {
  id: string;
  name_en: string;
  name_ar: string;
  icon: string;
  average_speed_kmh: number;
  base_price_egp: number;
  price_per_km_egp: number;
  is_active: boolean;
  foreigner_allowed: boolean;
  color: string;
}

const AdminTransport = () => {
  const { language } = useAuth();
  const [types, setTypes] = useState<TransportType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTypes = async () => {
    const { data, error } = await supabase.from('transport_types').select('*').order('name_en');
    if (error) toast.error(error.message);
    else setTypes(data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchTypes(); }, []);

  const updateType = async (id: string, updates: Partial<TransportType>) => {
    const { error } = await supabase.from('transport_types').update(updates).eq('id', id);
    if (error) toast.error(error.message);
    else {
      setTypes(prev => prev.map(tt => tt.id === id ? { ...tt, ...updates } : tt));
      toast.success('Updated');
    }
  };

  const addType = async () => {
    const { error } = await supabase.from('transport_types').insert({
      name_en: 'New Transport',
      name_ar: 'مواصلات جديدة',
      icon: 'bus',
      average_speed_kmh: 30,
      base_price_egp: 5,
      price_per_km_egp: 1,
      color: '#3B82F6',
    });
    if (error) toast.error(error.message);
    else fetchTypes();
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  return (
    <div className="space-y-4">
      <Button onClick={addType} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t('add', language)}
      </Button>

      {types.map((tt) => (
        <Card key={tt.id}>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name (EN)</label>
                <Input
                  value={tt.name_en}
                  onChange={(e) => setTypes(prev => prev.map(t => t.id === tt.id ? { ...t, name_en: e.target.value } : t))}
                  onBlur={() => updateType(tt.id, { name_en: tt.name_en })}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Name (AR)</label>
                <Input
                  value={tt.name_ar}
                  onChange={(e) => setTypes(prev => prev.map(t => t.id === tt.id ? { ...t, name_ar: e.target.value } : t))}
                  onBlur={() => updateType(tt.id, { name_ar: tt.name_ar })}
                  className="text-sm"
                  dir="rtl"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t('speed', language)}</label>
                <Input
                  type="number"
                  value={tt.average_speed_kmh}
                  onChange={(e) => setTypes(prev => prev.map(t => t.id === tt.id ? { ...t, average_speed_kmh: +e.target.value } : t))}
                  onBlur={() => updateType(tt.id, { average_speed_kmh: tt.average_speed_kmh })}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Base Price</label>
                <Input
                  type="number"
                  value={tt.base_price_egp}
                  onChange={(e) => setTypes(prev => prev.map(t => t.id === tt.id ? { ...t, base_price_egp: +e.target.value } : t))}
                  onBlur={() => updateType(tt.id, { base_price_egp: tt.base_price_egp })}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Per KM</label>
                <Input
                  type="number"
                  value={tt.price_per_km_egp}
                  onChange={(e) => setTypes(prev => prev.map(t => t.id === tt.id ? { ...t, price_per_km_egp: +e.target.value } : t))}
                  onBlur={() => updateType(tt.id, { price_per_km_egp: tt.price_per_km_egp })}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={tt.is_active}
                  onCheckedChange={(checked) => updateType(tt.id, { is_active: checked })}
                />
                {t('active', language)}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={tt.foreigner_allowed}
                  onCheckedChange={(checked) => updateType(tt.id, { foreigner_allowed: checked })}
                />
                Foreigners
              </label>
              <input
                type="color"
                value={tt.color}
                onChange={(e) => updateType(tt.id, { color: e.target.value })}
                className="h-8 w-8 rounded cursor-pointer"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminTransport;
