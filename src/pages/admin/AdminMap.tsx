import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Plus, X, Eye, EyeOff, Pencil, Trash2, MapPin, Layers, ChevronDown, ChevronUp, Save, Flame } from 'lucide-react';
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibmV6YXJpc21haWwiLCJhIjoiY21ucTdoZ3gxMDRiNzJxcjRhemY0ejhhbyJ9.fkkcuisxpZP9y0Uaq9HryQ';
const CAIRO = { latitude: 30.0444, longitude: 31.2357, zoom: 11 };

interface TransportType {
  id: string;
  name_en: string;
  name_ar: string;
  icon: string;
  color: string;
  service_level: string;
}

interface TransitLine {
  id: string;
  transport_type_id: string;
  line_number: string;
  name_en: string;
  name_ar: string;
  from_area: string;
  to_area: string;
  via_stops: string[];
  route_path: any;
  price_egp: number;
  frequency_minutes: number | null;
  has_fixed_stops: boolean;
  is_active: boolean;
}

interface Mawqef {
  id: string;
  name_en: string;
  name_ar: string;
  latitude: number;
  longitude: number;
  city: string;
  transport_type_ids: string[];
  description_en: string | null;
  description_ar: string | null;
}

interface HeatmapPoint {
  id: string;
  transport_type_id: string;
  latitude: number;
  longitude: number;
  intensity: number;
  radius_km: number;
}

const TRANSPORT_ICONS: Record<string, string> = {
  bus: '🚌', train: '🚆', car: '🚕', bike: '🛺', ship: '🚢', plane: '✈️', metro: '🚇', monorail: '🚝',
};

const AdminMap = () => {
  const { language } = useAuth();
  const [viewState, setViewState] = useState(CAIRO);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLine[]>([]);
  const [mawaqef, setMawaqef] = useState<Mawqef[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);

  // UI state
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
  const [selectedMawqef, setSelectedMawqef] = useState<Mawqef | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMawaqef, setShowMawaqef] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingLine, setEditingLine] = useState<TransitLine | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New line form
  const [newLine, setNewLine] = useState({
    transport_type_id: '',
    line_number: '',
    name_en: '',
    name_ar: '',
    from_area: '',
    to_area: '',
    via_stops: '',
    price_egp: 5,
    frequency_minutes: 10,
    has_fixed_stops: false,
  });
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchData = useCallback(async () => {
    const [tt, tl, mw, hm] = await Promise.all([
      supabase.from('transport_types').select('*').eq('is_active', true).order('service_level'),
      supabase.from('transit_lines').select('*').order('line_number'),
      supabase.from('mawaqef').select('*').order('name_en'),
      supabase.from('transport_heatmaps').select('*'),
    ]);
    const types = (tt.data || []) as TransportType[];
    setTransportTypes(types);
    setTransitLines((tl.data || []) as TransitLine[]);
    setMawaqef((mw.data || []) as Mawqef[]);
    setHeatmapData((hm.data || []) as HeatmapPoint[]);
    setVisibleTypes(new Set(types.map(t => t.id)));
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter lines by type and search
  const filteredLines = transitLines.filter(line => {
    const typeMatch = !selectedTypeId || line.transport_type_id === selectedTypeId;
    const searchMatch = !searchQuery ||
      line.line_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.name_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.name_ar.includes(searchQuery) ||
      line.from_area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.to_area.toLowerCase().includes(searchQuery.toLowerCase());
    return typeMatch && searchMatch;
  });

  // Visible lines on map
  const visibleLines = transitLines.filter(l => visibleTypes.has(l.transport_type_id) && l.route_path);

  // GeoJSON for route lines
  const routesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: visibleLines.map(line => {
      const tt = transportTypes.find(t => t.id === line.transport_type_id);
      return {
        type: 'Feature' as const,
        properties: {
          id: line.id,
          color: tt?.color || '#3B82F6',
          name: line.line_number,
          selected: selectedLine?.id === line.id ? 1 : 0,
        },
        geometry: line.route_path,
      };
    }),
  };

  // Heatmap GeoJSON
  const heatmapGeoJSON = {
    type: 'FeatureCollection' as const,
    features: heatmapData
      .filter(h => visibleTypes.has(h.transport_type_id))
      .map(h => ({
        type: 'Feature' as const,
        properties: { intensity: h.intensity },
        geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] },
      })),
  };

  // Drawing points GeoJSON
  const drawGeoJSON = {
    type: 'FeatureCollection' as const,
    features: drawPoints.length >= 2 ? [{
      type: 'Feature' as const,
      properties: { color: '#FF6B6B' },
      geometry: { type: 'LineString' as const, coordinates: drawPoints },
    }] : [],
  };

  const handleMapClick = useCallback((e: any) => {
    if (isDrawing) {
      setDrawPoints(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    }
  }, [isDrawing]);

  const toggleTypeVisibility = (id: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getTypeName = (id: string) => {
    const tt = transportTypes.find(t => t.id === id);
    return language === 'ar' ? tt?.name_ar : tt?.name_en;
  };

  const getTypeColor = (id: string) => transportTypes.find(t => t.id === id)?.color || '#3B82F6';
  const getTypeIcon = (id: string) => TRANSPORT_ICONS[transportTypes.find(t => t.id === id)?.icon || 'bus'] || '🚌';

  const saveLine = async () => {
    if (!newLine.transport_type_id || !newLine.line_number || !newLine.from_area || !newLine.to_area) {
      toast.error('Fill required fields');
      return;
    }
    const routePath = drawPoints.length >= 2
      ? { type: 'LineString', coordinates: drawPoints }
      : null;

    const { error } = await supabase.from('transit_lines').insert({
      ...newLine,
      via_stops: newLine.via_stops ? newLine.via_stops.split(',').map(s => s.trim()) : [],
      route_path: routePath,
    });

    if (error) { toast.error(error.message); return; }
    toast.success('Line added');
    setShowNewForm(false);
    setDrawPoints([]);
    setIsDrawing(false);
    setNewLine({ transport_type_id: '', line_number: '', name_en: '', name_ar: '', from_area: '', to_area: '', via_stops: '', price_egp: 5, frequency_minutes: 10, has_fixed_stops: false });
    fetchData();
  };

  const deleteLine = async (id: string) => {
    const { error } = await supabase.from('transit_lines').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Deleted');
      setSelectedLine(null);
      fetchData();
    }
  };

  const updateLinePath = async (line: TransitLine) => {
    if (drawPoints.length < 2) { toast.error('Draw at least 2 points'); return; }
    const { error } = await supabase.from('transit_lines').update({
      route_path: { type: 'LineString', coordinates: drawPoints },
    }).eq('id', line.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Path updated');
      setEditingLine(null);
      setDrawPoints([]);
      setIsDrawing(false);
      fetchData();
    }
  };

  // Group transport types by service level
  const grouped = transportTypes.reduce((acc, tt) => {
    const lvl = tt.service_level;
    if (!acc[lvl]) acc[lvl] = [];
    acc[lvl].push(tt);
    return acc;
  }, {} as Record<string, TransportType[]>);

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 -m-4 relative">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden bg-card border-r flex flex-col z-10`}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search routes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => { setShowNewForm(true); setSelectedTypeId(null); }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Transport type filter buttons */}
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm" variant={selectedTypeId === null ? 'default' : 'outline'}
              className="h-7 text-xs px-2"
              onClick={() => setSelectedTypeId(null)}
            >All</Button>
            {transportTypes.map(tt => (
              <Button
                key={tt.id}
                size="sm"
                variant={selectedTypeId === tt.id ? 'default' : 'outline'}
                className="h-7 text-xs px-2 gap-1"
                onClick={() => setSelectedTypeId(selectedTypeId === tt.id ? null : tt.id)}
              >
                <span>{TRANSPORT_ICONS[tt.icon] || '🚌'}</span>
                <span className="max-w-[60px] truncate">{tt.name_en.replace(/^(Bus |Metro |Train |Monorail |Taxi )?\(?/,'').replace(/\)?$/,'').slice(0,10)}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* New line form */}
        {showNewForm && (
          <div className="p-3 border-b bg-accent/30 space-y-2 overflow-y-auto max-h-[50%]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">New Transit Line</p>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewForm(false); setIsDrawing(false); setDrawPoints([]); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <select
              className="w-full h-8 text-sm rounded border bg-background px-2"
              value={newLine.transport_type_id}
              onChange={e => setNewLine(p => ({ ...p, transport_type_id: e.target.value }))}
            >
              <option value="">Select type...</option>
              {transportTypes.map(tt => (
                <option key={tt.id} value={tt.id}>{TRANSPORT_ICONS[tt.icon]} {tt.name_en}</option>
              ))}
            </select>
            <Input placeholder="Line number (e.g. 356, M1)" value={newLine.line_number} onChange={e => setNewLine(p => ({ ...p, line_number: e.target.value }))} className="h-8 text-sm" />
            <Input placeholder="Name (EN)" value={newLine.name_en} onChange={e => setNewLine(p => ({ ...p, name_en: e.target.value }))} className="h-8 text-sm" />
            <Input placeholder="الاسم (AR)" value={newLine.name_ar} onChange={e => setNewLine(p => ({ ...p, name_ar: e.target.value }))} className="h-8 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="From" value={newLine.from_area} onChange={e => setNewLine(p => ({ ...p, from_area: e.target.value }))} className="h-8 text-sm" />
              <Input placeholder="To" value={newLine.to_area} onChange={e => setNewLine(p => ({ ...p, to_area: e.target.value }))} className="h-8 text-sm" />
            </div>
            <Input placeholder="Via stops (comma separated)" value={newLine.via_stops} onChange={e => setNewLine(p => ({ ...p, via_stops: e.target.value }))} className="h-8 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Price EGP" value={newLine.price_egp} onChange={e => setNewLine(p => ({ ...p, price_egp: +e.target.value }))} className="h-8 text-sm" />
              <Input type="number" placeholder="Freq (min)" value={newLine.frequency_minutes || ''} onChange={e => setNewLine(p => ({ ...p, frequency_minutes: +e.target.value }))} className="h-8 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newLine.has_fixed_stops} onChange={e => setNewLine(p => ({ ...p, has_fixed_stops: e.target.checked }))} />
              Fixed stops (governmental)
            </label>
            <div className="flex gap-2">
              <Button
                size="sm" variant={isDrawing ? 'destructive' : 'outline'} className="flex-1 h-8 text-xs gap-1"
                onClick={() => { setIsDrawing(!isDrawing); if (isDrawing) setDrawPoints([]); }}
              >
                <Pencil className="h-3 w-3" />
                {isDrawing ? `Drawing (${drawPoints.length} pts)` : 'Draw Route'}
              </Button>
              <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={saveLine}>
                <Save className="h-3 w-3" /> Save
              </Button>
            </div>
          </div>
        )}

        {/* Lines list */}
        <div className="flex-1 overflow-y-auto">
          {filteredLines.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No routes found</p>
          )}
          {filteredLines.map(line => {
            const tt = transportTypes.find(t => t.id === line.transport_type_id);
            const isSelected = selectedLine?.id === line.id;
            return (
              <div
                key={line.id}
                className={`p-3 border-b cursor-pointer hover:bg-accent/30 transition-colors ${isSelected ? 'bg-accent/50' : ''}`}
                onClick={() => {
                  setSelectedLine(isSelected ? null : line);
                  if (!isSelected && line.route_path?.coordinates?.[0]) {
                    const coords = line.route_path.coordinates;
                    const mid = coords[Math.floor(coords.length / 2)];
                    setViewState(v => ({ ...v, latitude: mid[1], longitude: mid[0], zoom: 13 }));
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: tt?.color + '20', border: `2px solid ${tt?.color}` }}
                  >
                    {TRANSPORT_ICONS[tt?.icon || 'bus']}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: tt?.color, color: tt?.color }}>
                        {line.line_number}
                      </Badge>
                      <span className="text-xs font-medium text-foreground truncate">{line.name_en || `${line.from_area} → ${line.to_area}`}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {line.from_area} → {line.to_area}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm" variant="ghost" className="h-6 w-6 p-0"
                      onClick={e => { e.stopPropagation(); toggleTypeVisibility(line.transport_type_id); }}
                    >
                      {visibleTypes.has(line.transport_type_id) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded details */}
                {isSelected && (
                  <div className="mt-2 pl-10 space-y-1.5">
                    <p className="text-xs text-muted-foreground">{line.name_ar}</p>
                    {line.via_stops.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">Via: {line.via_stops.join(' → ')}</p>
                    )}
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-foreground font-medium">{line.price_egp} EGP</span>
                      {line.frequency_minutes && <span className="text-muted-foreground">Every {line.frequency_minutes} min</span>}
                      <span>{line.has_fixed_stops ? '🚏 Fixed stops' : '🖐️ Stop anywhere'}</span>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                        onClick={e => { e.stopPropagation(); setEditingLine(line); setIsDrawing(true); setDrawPoints([]); }}
                      >
                        <Pencil className="h-2.5 w-2.5" /> Edit Path
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 text-destructive"
                        onClick={e => { e.stopPropagation(); deleteLine(line.id); }}
                      >
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Layer toggles */}
        <div className="p-3 border-t space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1">
              <Layers className="h-3 w-3" /> Layers
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm" variant={showMawaqef ? 'default' : 'outline'} className="h-7 text-xs flex-1 gap-1"
              onClick={() => setShowMawaqef(!showMawaqef)}
            >
              <MapPin className="h-3 w-3" /> Mawaqef
            </Button>
            <Button
              size="sm" variant={showHeatmap ? 'default' : 'outline'} className="h-7 text-xs flex-1 gap-1"
              onClick={() => setShowHeatmap(!showHeatmap)}
            >
              <Flame className="h-3 w-3" /> Heatmap
            </Button>
          </div>

          {/* Transport type visibility */}
          <div className="max-h-32 overflow-y-auto space-y-1">
            {Object.entries(grouped).map(([level, types]) => (
              <div key={level}>
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">{level}</p>
                {types.map(tt => (
                  <label key={tt.id} className="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleTypes.has(tt.id)}
                      onChange={() => toggleTypeVisibility(tt.id)}
                      className="h-3 w-3"
                    />
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tt.color }} />
                    <span className="truncate">{tt.name_en}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle sidebar */}
      <Button
        size="sm" variant="outline" className="absolute top-2 z-20 h-8 w-8 p-0"
        style={{ left: sidebarOpen ? '320px' : '0' }}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <ChevronDown className="h-4 w-4 rotate-90" /> : <ChevronDown className="h-4 w-4 -rotate-90" />}
      </Button>

      {/* Map */}
      <div className="flex-1 relative">
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
          cursor={isDrawing ? 'crosshair' : 'grab'}
        >
          <NavigationControl position="top-right" />

          {/* Route lines */}
          <Source id="routes" type="geojson" data={routesGeoJSON}>
            <Layer
              id="route-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': ['case', ['==', ['get', 'selected'], 1], 6, 3],
                'line-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.7],
              }}
            />
            {/* Route number labels */}
            <Layer
              id="route-labels"
              type="symbol"
              layout={{
                'symbol-placement': 'line-center',
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              }}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': ['get', 'color'],
                'text-halo-width': 2,
              }}
            />
          </Source>

          {/* Drawing line */}
          {drawPoints.length >= 2 && (
            <Source id="drawing" type="geojson" data={drawGeoJSON}>
              <Layer
                id="draw-line"
                type="line"
                paint={{ 'line-color': '#FF6B6B', 'line-width': 4, 'line-dasharray': [2, 2] }}
              />
            </Source>
          )}
          {/* Draw points markers */}
          {isDrawing && drawPoints.map((pt, i) => (
            <Marker key={`dp-${i}`} latitude={pt[1]} longitude={pt[0]}>
              <div className="h-3 w-3 rounded-full bg-red-500 border border-white" />
            </Marker>
          ))}

          {/* Heatmap */}
          {showHeatmap && heatmapData.length > 0 && (
            <Source id="heatmap" type="geojson" data={heatmapGeoJSON}>
              <Layer
                id="heatmap-layer"
                type="heatmap"
                paint={{
                  'heatmap-weight': ['get', 'intensity'],
                  'heatmap-intensity': 1,
                  'heatmap-radius': 40,
                  'heatmap-opacity': 0.6,
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,0,0)',
                    0.2, 'rgba(0,0,255,0.4)',
                    0.4, 'rgba(0,255,255,0.6)',
                    0.6, 'rgba(0,255,0,0.7)',
                    0.8, 'rgba(255,255,0,0.8)',
                    1, 'rgba(255,0,0,0.9)',
                  ],
                }}
              />
            </Source>
          )}

          {/* Mawaqef markers */}
          {showMawaqef && mawaqef.map(m => (
            <Marker key={m.id} latitude={m.latitude} longitude={m.longitude}>
              <button
                onClick={e => { e.stopPropagation(); setSelectedMawqef(selectedMawqef?.id === m.id ? null : m); }}
                className="flex flex-col items-center group"
              >
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow-lg border-2 border-white group-hover:scale-125 transition-transform">
                  🚏
                </div>
              </button>
            </Marker>
          ))}

          {/* Route line icon markers (midpoint) */}
          {visibleLines.map(line => {
            if (!line.route_path?.coordinates?.length) return null;
            const coords = line.route_path.coordinates;
            const mid = coords[Math.floor(coords.length / 2)];
            const tt = transportTypes.find(t => t.id === line.transport_type_id);
            return (
              <Marker key={`icon-${line.id}`} latitude={mid[1]} longitude={mid[0]}>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedLine(line); }}
                  className="group"
                >
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] shadow-lg border-2 border-white group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: tt?.color || '#3B82F6' }}
                  >
                    {TRANSPORT_ICONS[tt?.icon || 'bus']}
                  </div>
                </button>
              </Marker>
            );
          })}

          {/* Mawqef popup */}
          {selectedMawqef && (
            <Popup
              latitude={selectedMawqef.latitude}
              longitude={selectedMawqef.longitude}
              onClose={() => setSelectedMawqef(null)}
              closeOnClick={false}
              className="[&_.mapboxgl-popup-content]:bg-card [&_.mapboxgl-popup-content]:text-foreground [&_.mapboxgl-popup-content]:rounded-xl [&_.mapboxgl-popup-content]:shadow-xl [&_.mapboxgl-popup-content]:p-3"
            >
              <div className="min-w-[200px]">
                <p className="font-semibold text-sm">{selectedMawqef.name_en}</p>
                <p className="text-xs text-muted-foreground">{selectedMawqef.name_ar}</p>
                {selectedMawqef.description_en && <p className="text-xs mt-1">{selectedMawqef.description_en}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedMawqef.transport_type_ids.map(tid => (
                    <Badge key={tid} variant="outline" className="text-[10px]" style={{ borderColor: getTypeColor(tid) }}>
                      {getTypeIcon(tid)} {getTypeName(tid)}
                    </Badge>
                  ))}
                </div>
              </div>
            </Popup>
          )}
        </Map>

        {/* Drawing controls overlay */}
        {isDrawing && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-xl shadow-xl p-3 flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              🖊️ Drawing mode — Click map to add points ({drawPoints.length})
            </span>
            {drawPoints.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDrawPoints(prev => prev.slice(0, -1))}>
                Undo
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDrawPoints([])}>
              Clear
            </Button>
            {editingLine && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => updateLinePath(editingLine)}>
                <Save className="h-3 w-3" /> Save Path
              </Button>
            )}
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setIsDrawing(false); setDrawPoints([]); setEditingLine(null); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-2 left-2 bg-card/90 backdrop-blur-sm rounded-lg p-2 text-[10px] space-y-0.5 max-h-48 overflow-y-auto">
          <p className="font-semibold text-xs mb-1">Legend</p>
          {transportTypes.filter(tt => visibleTypes.has(tt.id)).map(tt => (
            <div key={tt.id} className="flex items-center gap-1.5">
              <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: tt.color }} />
              <span>{TRANSPORT_ICONS[tt.icon]} {tt.name_en}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminMap;
