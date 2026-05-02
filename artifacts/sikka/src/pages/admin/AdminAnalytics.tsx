import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Users, Route, Star, Train } from 'lucide-react';

const AdminAnalytics = () => {
  const { language } = useAuth();
  const [stats, setStats] = useState({ users: 0, trips: 0, reviews: 0, routes: 0 });

  useEffect(() => {
    const fetch = async () => {
      const [u, tr, rv, rt] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('trips').select('id', { count: 'exact', head: true }),
        supabase.from('reviews').select('id', { count: 'exact', head: true }),
        supabase.from('transport_routes').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        users: u.count || 0,
        trips: tr.count || 0,
        reviews: rv.count || 0,
        routes: rt.count || 0,
      });
    };
    fetch();
  }, []);

  const cards = [
    { label: 'Users', value: stats.users, icon: Users, color: 'text-primary' },
    { label: 'Trips', value: stats.trips, icon: Route, color: 'text-accent' },
    { label: t('reviews', language), value: stats.reviews, icon: Star, color: 'text-yellow-500' },
    { label: t('routes', language), value: stats.routes, icon: Train, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label}>
          <CardContent className="p-4 flex items-center gap-3">
            <Icon className={`h-8 w-8 ${color}`} />
            <div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminAnalytics;
