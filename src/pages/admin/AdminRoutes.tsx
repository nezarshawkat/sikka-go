import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

const AdminRoutes = () => {
  const { language } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [transportTypes, setTransportTypes] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [r, tt, l] = await Promise.all([
        supabase.from('transport_routes').select('*').order('created_at', { ascending: false }),
        supabase.from('transport_types').select('id, name_en'),
        supabase.from('locations').select('id, name_en'),
      ]);
      setRoutes(r.data || []);
      setTransportTypes(tt.data || []);
      setLocations(l.data || []);
      setIsLoading(false);
    };
    fetch();
  }, []);

  const addRoute = async () => {
    if (!transportTypes.length || locations.length < 2) {
      toast.error('Need transport types and at least 2 locations first');
      return;
    }
    const { error } = await supabase.from('transport_routes').insert({
      transport_type_id: transportTypes[0].id,
      start_location_id: locations[0].id,
      end_location_id: locations[1].id,
      distance_km: 10,
      price_egp: 20,
    });
    if (error) toast.error(error.message);
    else {
      const { data } = await supabase.from('transport_routes').select('*').order('created_at', { ascending: false });
      setRoutes(data || []);
    }
  };

  const deleteRoute = async (id: string) => {
    const { error } = await supabase.from('transport_routes').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setRoutes(prev => prev.filter(r => r.id !== id));
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  const getName = (list: any[], id: string) => list.find(i => i.id === id)?.name_en || '—';

  return (
    <div className="space-y-4">
      <Button onClick={addRoute} size="sm" className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t('add', language)}
      </Button>

      {routes.map((route) => (
        <Card key={route.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                {getName(transportTypes, route.transport_type_id)}
              </span>
              <Button variant="ghost" size="icon" onClick={() => deleteRoute(route.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {getName(locations, route.start_location_id)} → {getName(locations, route.end_location_id)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {route.distance_km} km • {route.price_egp} EGP
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminRoutes;
