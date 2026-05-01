import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Route, Search } from 'lucide-react';

const AdminRoutes = () => {
  const { language } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [transportTypes, setTransportTypes] = useState<any[]>([]);
  const [typeId, setTypeId] = useState('all');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [r, tt] = await Promise.all([
        supabase.from('transit_lines').select('*').eq('is_active', true).order('line_number'),
        supabase.from('transport_types').select('id, name_en, name_ar, color, icon').eq('is_active', true),
      ]);
      setRoutes(r.data || []);
      setTransportTypes(tt.data || []);
      setIsLoading(false);
    };
    fetch();
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter(route => {
      const typeMatch = typeId === 'all' || route.transport_type_id === typeId;
      const searchMatch = !q ||
        route.line_number?.toLowerCase().includes(q) ||
        route.name_en?.toLowerCase().includes(q) ||
        route.name_ar?.includes(query) ||
        route.from_area?.toLowerCase().includes(q) ||
        route.to_area?.toLowerCase().includes(q) ||
        route.via_stops?.some((stop: string) => stop.toLowerCase().includes(q));
      return typeMatch && searchMatch;
    });
  }, [query, routes, typeId]);

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  const typeById = new Map(transportTypes.map(t => [t.id, t]));

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[280px_1fr]">
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger>
            <SelectValue placeholder="Transport type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All transport types</SelectItem>
            {transportTypes.map(type => (
              <SelectItem key={type.id} value={type.id}>{language === 'ar' ? type.name_ar : type.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search route number, station, or road" className="pl-9" />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{filteredRoutes.length} imported mapped routes</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredRoutes.map(route => {
          const type = typeById.get(route.transport_type_id);
          return (
            <Card key={route.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" style={{ borderColor: type?.color, color: type?.color }}>{route.line_number || 'Route'}</Badge>
                  <span className="text-xs text-muted-foreground">{type ? (language === 'ar' ? type.name_ar : type.name_en) : 'Transport'}</span>
                </div>
                <div className="flex gap-2">
                  <Route className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{route.from_area} → {route.to_area}</p>
                    {route.via_stops?.length > 0 && <p className="text-xs text-muted-foreground line-clamp-2">{route.via_stops.join(' · ')}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{route.price_egp} EGP</span>
                  <span>{route.route_path ? 'Visible on map' : 'Auto-drawn on Admin Map'}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminRoutes;
