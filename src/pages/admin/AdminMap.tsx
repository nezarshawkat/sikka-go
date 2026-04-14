import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Plus, X, Eye, EyeOff, Pencil, Trash2, MapPin, Save, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibmV6YXJpc21haWwiLCJhIjoiY21ucTdoZ3gxMDRiNzJxcjRhemY0ejhhbyJ9.fkkcuisxpZP9y0Uaq9HryQ';
const CAIRO = { latitude: 30.0444, longitude: 31.2357, zoom: 11 };

interface TransportType {
  id: string; name_en: string; name_ar: string; icon: string; color: string; service_level: string;
}
interface TransitLine {
  id: string; transport_type_id: string; line_number: string; name_en: string; name_ar: string;
  from_area: string; to_area: string; via_stops: string[]; route_path: any;
  price_egp: number; frequency_minutes: number | null; has_fixed_stops: boolean; is_active: boolean;
}
interface HeatmapPoint {
  id: string; transport_type_id: string; latitude: number; longitude: number; intensity: number; radius_km: number;
}

const ICONS: Record<string, string> = {
  bus: '🚌', train: '🚆', car: '🚕', bike: '🛺', ship: '🚢', plane: '✈️', metro: '🚇', monorail: '🚝',
};

// Snap coordinates to roads using Mapbox Directions API
async function snapToRoads(points: [number, number][]): Promise<[number, number][]> {
  if (points.length < 2) return points;
  // Directions API max 25 waypoints, chunk if needed
  const chunks: [number, number][][] = [];
  for (let i = 0; i < points.length; i += 24) {
    const chunk = points.slice(i, i + 25);
    if (chunk.length >= 2) chunks.push(chunk);
    else if (chunks.length > 0) chunks[chunks.length - 1].push(...chunk);
  }
  
  let allCoords: [number, number][] = [];
  for (const chunk of chunks) {
    const coordStr = chunk.map(p => `${p[0]},${p[1]}`).join(';');
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
      );
      const data = await res.json();
      if (data.routes?.[0]?.geometry?.coordinates) {
        const coords = data.routes[0].geometry.coordinates as [number, number][];
        if (allCoords.length > 0) allCoords.push(...coords.slice(1));
        else allCoords = coords;
      }
    } catch (err) {
      console.error('Road snap error:', err);
      allCoords.push(...chunk);
    }
  }
  return allCoords;
}

const AdminMap = () => {
  const { language } = useAuth();
  const [viewState, setViewState] = useState(CAIRO);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLine[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);

  const [activeTypeId, setActiveTypeId] = useState<string | null>(null); // selected filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLine, setSelectedLine] = useState<TransitLine | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [isSnapping, setIsSnapping] = useState(false);

  // New/Edit form dialog
  const [showForm, setShowForm] = useState(false);
  const [editingLine, setEditingLine] = useState<TransitLine | null>(null);
  const [formData, setFormData] = useState({
    transport_type_id: '', line_number: '', name_en: '', name_ar: '',
    from_area: '', to_area: '', via_stops: '', price_egp: 5,
    frequency_minutes: 10, has_fixed_stops: false,
  });

  // Route detail dialog
  const [detailLine, setDetailLine] = useState<TransitLine | null>(null);

  const fetchData = useCallback(async () => {
    const [tt, tl, hm] = await Promise.all([
      supabase.from('transport_types').select('*').eq('is_active', true).order('service_level'),
      supabase.from('transit_lines').select('*').order('line_number'),
      supabase.from('transport_heatmaps').select('*'),
    ]);
    setTransportTypes((tt.data || []) as TransportType[]);
    setTransitLines((tl.data || []) as TransitLine[]);
    setHeatmapData((hm.data || []) as HeatmapPoint[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Find tuk-tuk type for heatmap filtering
  const tuktukType = transportTypes.find(t => t.name_en.toLowerCase().includes('tuk'));

  // Filtered lines
  const filteredLines = transitLines.filter(line => {
    const typeMatch = !activeTypeId || line.transport_type_id === activeTypeId;
    const q = searchQuery.toLowerCase();
    const searchMatch = !q ||
      line.line_number.toLowerCase().includes(q) ||
      line.name_en.toLowerCase().includes(q) ||
      line.name_ar.includes(searchQuery) ||
      line.from_area.toLowerCase().includes(q) ||
      line.to_area.toLowerCase().includes(q) ||
      line.via_stops.some(s => s.toLowerCase().includes(q));
    return typeMatch && searchMatch;
  });

  // Visible lines on map: only of active type (or all if none selected)
  const visibleLines = transitLines.filter(l => {
    if (!l.route_path) return false;
    return !activeTypeId || l.transport_type_id === activeTypeId;
  });

  // Color logic: if single type selected, different colors per route. Otherwise type color.
  const ROUTE_COLORS = ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#F97316','#14B8A6','#6366F1'];
  
  const getRouteColor = (line: TransitLine, index: number) => {
    if (activeTypeId) {
      return ROUTE_COLORS[index % ROUTE_COLORS.length];
    }
    const tt = transportTypes.find(t => t.id === line.transport_type_id);
    return tt?.color || '#3B82F6';
  };

  const routesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: visibleLines.map((line, idx) => ({
      type: 'Feature' as const,
      properties: {
        id: line.id,
        color: getRouteColor(line, idx),
        name: line.line_number,
        selected: selectedLine?.id === line.id ? 1 : 0,
      },
      geometry: line.route_path,
    })),
  };

  // Heatmap: tuk-tuk only
  const heatmapGeoJSON = {
    type: 'FeatureCollection' as const,
    features: heatmapData
      .filter(h => tuktukType && h.transport_type_id === tuktukType.id)
      .map(h => ({
        type: 'Feature' as const,
        properties: { intensity: h.intensity },
        geometry: { type: 'Point' as const, coordinates: [h.longitude, h.latitude] },
      })),
  };

  // Drawing preview
  const drawGeoJSON = {
    type: 'FeatureCollection' as const,
    features: drawPoints.length >= 2 ? [{
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: drawPoints },
    }] : [],
  };

  const handleMapClick = useCallback((e: any) => {
    if (isDrawing) {
      setDrawPoints(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    } else {
      // Check if clicked on a route line
      const features = e.target?.queryRenderedFeatures?.(e.point, { layers: ['route-lines'] });
      if (features?.length > 0) {
        const lineId = features[0].properties?.id;
        const line = transitLines.find(l => l.id === lineId);
        if (line) setDetailLine(line);
      }
    }
  }, [isDrawing, transitLines]);

  const getTypeName = (id: string) => {
    const tt = transportTypes.find(t => t.id === id);
    return language === 'ar' ? tt?.name_ar : tt?.name_en;
  };
  const getTypeColor = (id: string) => transportTypes.find(t => t.id === id)?.color || '#3B82F6';

  const openNewForm = () => {
    setEditingLine(null);
    setFormData({
      transport_type_id: activeTypeId || '',
      line_number: '', name_en: '', name_ar: '',
      from_area: '', to_area: '', via_stops: '', price_egp: 5,
      frequency_minutes: 10, has_fixed_stops: false,
    });
    setDrawPoints([]);
    setShowForm(true);
  };

  const openEditForm = (line: TransitLine) => {
    setEditingLine(line);
    setFormData({
      transport_type_id: line.transport_type_id,
      line_number: line.line_number,
      name_en: line.name_en,
      name_ar: line.name_ar,
      from_area: line.from_area,
      to_area: line.to_area,
      via_stops: line.via_stops.join(', '),
      price_egp: line.price_egp,
      frequency_minutes: line.frequency_minutes || 10,
      has_fixed_stops: line.has_fixed_stops,
    });
    if (line.route_path?.coordinates) {
      // Load existing path for re-editing
      setDrawPoints(line.route_path.coordinates);
    } else {
      setDrawPoints([]);
    }
    setShowForm(true);
  };

  const saveRoute = async () => {
    if (!formData.transport_type_id || !formData.line_number || !formData.from_area || !formData.to_area) {
      toast.error('Fill required fields');
      return;
    }

    let routePath = null;
    if (drawPoints.length >= 2) {
      setIsSnapping(true);
      try {
        const snapped = await snapToRoads(drawPoints);
        routePath = { type: 'LineString', coordinates: snapped };
      } catch {
        routePath = { type: 'LineString', coordinates: drawPoints };
      }
      setIsSnapping(false);
    }

    const payload = {
      transport_type_id: formData.transport_type_id,
      line_number: formData.line_number,
      name_en: formData.name_en,
      name_ar: formData.name_ar,
      from_area: formData.from_area,
      to_area: formData.to_area,
      via_stops: formData.via_stops ? formData.via_stops.split(',').map(s => s.trim()) : [],
      price_egp: formData.price_egp,
      frequency_minutes: formData.frequency_minutes,
      has_fixed_stops: formData.has_fixed_stops,
      route_path: routePath,
    };

    let error;
    if (editingLine) {
      ({ error } = await supabase.from('transit_lines').update(payload).eq('id', editingLine.id));
    } else {
      ({ error } = await supabase.from('transit_lines').insert(payload));
    }

    if (error) { toast.error(error.message); return; }
    toast.success(editingLine ? 'Route updated' : 'Route added');
    setShowForm(false);
    setDrawPoints([]);
    setIsDrawing(false);
    setEditingLine(null);
    fetchData();
  };

  const deleteLine = async (id: string) => {
    const { error } = await supabase.from('transit_lines').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); setDetailLine(null); setSelectedLine(null); fetchData(); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 -m-4 relative">
      {/* Route list panel (hidden by default, toggle with eye button) */}
      <div className={`${listVisible ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden bg-card border-r flex flex-col z-10`}>
        <div className="p-3 border-b">
          <p className="text-sm font-semibold mb-1">
            {activeTypeId ? getTypeName(activeTypeId) : 'All'} Routes ({filteredLines.length})
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredLines.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No routes</p>}
          {filteredLines.map(line => {
            const tt = transportTypes.find(t => t.id === line.transport_type_id);
            return (
              <div
                key={line.id}
                className={`p-3 border-b cursor-pointer hover:bg-accent/30 transition-colors ${selectedLine?.id === line.id ? 'bg-accent/50' : ''}`}
                onClick={() => {
                  setSelectedLine(selectedLine?.id === line.id ? null : line);
                  setDetailLine(line);
                  if (line.route_path?.coordinates?.[0]) {
                    const coords = line.route_path.coordinates;
                    const mid = coords[Math.floor(coords.length / 2)];
                    setViewState(v => ({ ...v, latitude: mid[1], longitude: mid[0], zoom: 13 }));
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{ backgroundColor: tt?.color + '20', border: `2px solid ${tt?.color}` }}>
                    {ICONS[tt?.icon || 'bus']}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0" style={{ borderColor: tt?.color, color: tt?.color }}>
                        {line.line_number}
                      </Badge>
                      <span className="text-xs truncate">{line.from_area} → {line.to_area}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{line.price_egp} EGP</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {/* Top bar: Search + transport type filters */}
        <div className="absolute top-3 left-3 right-3 z-10 space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 p-0 bg-card/95 backdrop-blur-sm shrink-0"
              onClick={() => setListVisible(!listVisible)}>
              {listVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search by number, station, area..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm bg-card/95 backdrop-blur-sm" />
            </div>
            <Button size="sm" className="h-9 gap-1 bg-card/95 backdrop-blur-sm text-foreground border border-border hover:bg-accent"
              onClick={openNewForm}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {/* Transport type buttons */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <Button size="sm" variant={!activeTypeId ? 'default' : 'outline'}
              className="h-8 text-xs px-3 shrink-0 bg-card/95 backdrop-blur-sm"
              onClick={() => setActiveTypeId(null)}>
              All
            </Button>
            {transportTypes.map(tt => (
              <Button key={tt.id} size="sm"
                variant={activeTypeId === tt.id ? 'default' : 'outline'}
                className="h-8 text-xs px-3 shrink-0 gap-1 bg-card/95 backdrop-blur-sm"
                style={activeTypeId === tt.id ? { backgroundColor: tt.color, color: '#fff' } : {}}
                onClick={() => setActiveTypeId(activeTypeId === tt.id ? null : tt.id)}>
                <span>{ICONS[tt.icon] || '🚌'}</span>
                <span>{tt.name_en}</span>
              </Button>
            ))}
            {tuktukType && (
              <Button size="sm" variant={showHeatmap ? 'default' : 'outline'}
                className="h-8 text-xs px-3 shrink-0 gap-1 bg-card/95 backdrop-blur-sm"
                onClick={() => setShowHeatmap(!showHeatmap)}>
                🔥 Heatmap
              </Button>
            )}
          </div>
        </div>

        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          onClick={handleMapClick}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
          cursor={isDrawing ? 'crosshair' : 'grab'}
          interactiveLayerIds={['route-lines']}
        >
          <NavigationControl position="bottom-right" />

          {/* Route lines */}
          <Source id="routes" type="geojson" data={routesGeoJSON}>
            <Layer id="route-lines" type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': ['case', ['==', ['get', 'selected'], 1], 6, 3],
                'line-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.75],
              }} />
            <Layer id="route-labels" type="symbol"
              layout={{
                'symbol-placement': 'line-center',
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              }}
              paint={{ 'text-color': '#fff', 'text-halo-color': ['get', 'color'], 'text-halo-width': 2 }} />
          </Source>

          {/* Drawing preview */}
          {drawPoints.length >= 2 && (
            <Source id="drawing" type="geojson" data={drawGeoJSON}>
              <Layer id="draw-line" type="line"
                paint={{ 'line-color': '#FF6B6B', 'line-width': 4, 'line-dasharray': [2, 2] }} />
            </Source>
          )}
          {isDrawing && drawPoints.map((pt, i) => (
            <Marker key={`dp-${i}`} latitude={pt[1]} longitude={pt[0]}>
              <div className="h-3 w-3 rounded-full bg-destructive border border-background" />
            </Marker>
          ))}

          {/* Heatmap (tuk-tuk only) */}
          {showHeatmap && heatmapGeoJSON.features.length > 0 && (
            <Source id="heatmap" type="geojson" data={heatmapGeoJSON}>
              <Layer id="heatmap-layer" type="heatmap"
                paint={{
                  'heatmap-weight': ['get', 'intensity'], 'heatmap-intensity': 1,
                  'heatmap-radius': 40, 'heatmap-opacity': 0.6,
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,0,0)', 0.2, 'rgba(255,165,0,0.3)', 0.5, 'rgba(255,140,0,0.5)',
                    0.8, 'rgba(255,69,0,0.7)', 1, 'rgba(255,0,0,0.9)',
                  ],
                }} />
            </Source>
          )}

          {/* Route icon markers at midpoint */}
          {visibleLines.map((line, idx) => {
            if (!line.route_path?.coordinates?.length) return null;
            const coords = line.route_path.coordinates;
            const mid = coords[Math.floor(coords.length / 2)];
            const tt = transportTypes.find(t => t.id === line.transport_type_id);
            const color = getRouteColor(line, idx);
            return (
              <Marker key={`icon-${line.id}`} latitude={mid[1]} longitude={mid[0]}>
                <button onClick={e => { e.stopPropagation(); setDetailLine(line); setSelectedLine(line); }} className="group">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs shadow-lg border-2 border-white group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: color }}>
                    {ICONS[tt?.icon || 'bus']}
                  </div>
                </button>
              </Marker>
            );
          })}
        </Map>

        {/* Drawing controls */}
        {isDrawing && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-xl shadow-xl p-3 flex items-center gap-3 z-10">
            <span className="text-sm font-medium">🖊️ Click map to add waypoints ({drawPoints.length})</span>
            {drawPoints.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDrawPoints(prev => prev.slice(0, -1))}>Undo</Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDrawPoints([])}>Clear</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setIsDrawing(false); setDrawPoints([]); }}>Done</Button>
          </div>
        )}
      </div>

      {/* Route detail dialog */}
      <Dialog open={!!detailLine} onOpenChange={open => !open && setDetailLine(null)}>
        <DialogContent className="max-w-md">
          {detailLine && (() => {
            const tt = transportTypes.find(t => t.id === detailLine.transport_type_id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm"
                      style={{ backgroundColor: tt?.color + '20', border: `2px solid ${tt?.color}` }}>
                      {ICONS[tt?.icon || 'bus']}
                    </div>
                    <div>
                      <span className="text-base">{detailLine.line_number}</span>
                      <span className="text-sm text-muted-foreground ml-2">{tt?.name_en}</span>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">From</span><span>{detailLine.from_area}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">To</span><span>{detailLine.to_area}</span></div>
                  {detailLine.via_stops.length > 0 && (
                    <div><span className="text-muted-foreground">Via: </span><span>{detailLine.via_stops.join(' → ')}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>{detailLine.price_egp} EGP</span></div>
                  {detailLine.frequency_minutes && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span>Every {detailLine.frequency_minutes} min</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Stops</span><span>{detailLine.has_fixed_stops ? '🚏 Fixed stops' : '🖐️ Stop anywhere'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Arabic</span><span>{detailLine.name_ar}</span></div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setDetailLine(null); openEditForm(detailLine); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteLine(detailLine.id)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add/Edit route dialog (bottom-left popup) */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setIsDrawing(false); } }}>
        <DialogContent className="fixed bottom-4 left-4 top-auto translate-x-0 translate-y-0 max-w-sm w-[360px] max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLine ? 'Edit Route' : 'New Route'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <select className="w-full h-9 text-sm rounded-md border bg-background px-2"
              value={formData.transport_type_id}
              onChange={e => setFormData(p => ({ ...p, transport_type_id: e.target.value }))}>
              <option value="">Select transport type...</option>
              {transportTypes.map(tt => (
                <option key={tt.id} value={tt.id}>{ICONS[tt.icon]} {tt.name_en}</option>
              ))}
            </select>
            <Input placeholder="Line number (e.g. 356, M1)" value={formData.line_number}
              onChange={e => setFormData(p => ({ ...p, line_number: e.target.value }))} className="h-9 text-sm" />
            <Input placeholder="Name (EN)" value={formData.name_en}
              onChange={e => setFormData(p => ({ ...p, name_en: e.target.value }))} className="h-9 text-sm" />
            <Input placeholder="الاسم (AR)" value={formData.name_ar}
              onChange={e => setFormData(p => ({ ...p, name_ar: e.target.value }))} className="h-9 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="From" value={formData.from_area}
                onChange={e => setFormData(p => ({ ...p, from_area: e.target.value }))} className="h-9 text-sm" />
              <Input placeholder="To" value={formData.to_area}
                onChange={e => setFormData(p => ({ ...p, to_area: e.target.value }))} className="h-9 text-sm" />
            </div>
            <Input placeholder="Via stops (comma separated)" value={formData.via_stops}
              onChange={e => setFormData(p => ({ ...p, via_stops: e.target.value }))} className="h-9 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Price EGP" value={formData.price_egp}
                onChange={e => setFormData(p => ({ ...p, price_egp: +e.target.value }))} className="h-9 text-sm" />
              <Input type="number" placeholder="Freq (min)" value={formData.frequency_minutes}
                onChange={e => setFormData(p => ({ ...p, frequency_minutes: +e.target.value }))} className="h-9 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.has_fixed_stops}
                onChange={e => setFormData(p => ({ ...p, has_fixed_stops: e.target.checked }))} />
              Fixed stops (governmental)
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant={isDrawing ? 'destructive' : 'outline'} className="flex-1 h-9 text-xs gap-1"
                onClick={() => { setIsDrawing(!isDrawing); if (isDrawing) {} else { setDrawPoints([]); } }}>
                <Pencil className="h-3 w-3" />
                {isDrawing ? `Drawing (${drawPoints.length} pts)` : 'Draw on Map'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Click on the map to add waypoints. Route will be snapped to actual streets automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setIsDrawing(false); }}>Cancel</Button>
            <Button onClick={saveRoute} disabled={isSnapping} className="gap-1">
              {isSnapping ? <><div className="h-3 w-3 border border-white border-t-transparent rounded-full animate-spin" /> Snapping...</> :
                <><Save className="h-3 w-3" /> Save</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMap;
