import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

interface Location {
  id: string;
  name_en: string;
  name_ar: string;
  latitude: number;
  longitude: number;
  city: string;
  is_station: boolean;
}

const AdminLocations = () => {
  const { language } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLocations = async () => {
    const { data, error } = await supabase.from('locations').select('*').order('name_en');
    if (error) toast.error(error.message);
    else setLocations(data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchLocations(); }, []);

  const addLocation = async () => {
    const { error } = await supabase.from('locations').insert({
      name_en: 'New Location',
      name_ar: 'موقع جديد',
      latitude: 30.0444,
      longitude: 31.2357,
      city: 'cairo',
    });
    if (error) toast.error(error.message);
    else fetchLocations();
  };

  const updateLocation = async (id: string, updates: Partial<Location>) => {
    const { error } = await supabase.from('locations').update(updates).eq('id', id);
    if (error) toast.error(error.message);
    else toast.success('Updated');
  };

  const deleteLocation = async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setLocations(prev => prev.filter(l => l.id !== id));
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  return (
    <div className="space-y-4">
      <Button onClick={addLocation} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t('add', language)}
      </Button>

      {locations.map((loc) => (
        <Card key={loc.id}>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={loc.name_en}
                onChange={(e) => setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, name_en: e.target.value } : l))}
                onBlur={() => updateLocation(loc.id, { name_en: loc.name_en })}
                placeholder="Name (EN)"
                className="text-sm"
              />
              <Input
                value={loc.name_ar}
                onChange={(e) => setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, name_ar: e.target.value } : l))}
                onBlur={() => updateLocation(loc.id, { name_ar: loc.name_ar })}
                placeholder="Name (AR)"
                dir="rtl"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                type="number"
                value={loc.latitude}
                onChange={(e) => setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, latitude: +e.target.value } : l))}
                onBlur={() => updateLocation(loc.id, { latitude: loc.latitude })}
                placeholder="Lat"
                className="text-sm"
              />
              <Input
                type="number"
                value={loc.longitude}
                onChange={(e) => setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, longitude: +e.target.value } : l))}
                onBlur={() => updateLocation(loc.id, { longitude: loc.longitude })}
                placeholder="Lng"
                className="text-sm"
              />
              <Input
                value={loc.city}
                onChange={(e) => setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, city: e.target.value } : l))}
                onBlur={() => updateLocation(loc.id, { city: loc.city })}
                placeholder="City"
                className="text-sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={loc.is_station}
                  onCheckedChange={(checked) => {
                    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, is_station: checked } : l));
                    updateLocation(loc.id, { is_station: checked });
                  }}
                />
                Station
              </label>
              <Button variant="ghost" size="icon" onClick={() => deleteLocation(loc.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminLocations;
