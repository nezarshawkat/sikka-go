
-- Transit lines: individual routes with path geometry
CREATE TABLE public.transit_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transport_type_id UUID NOT NULL REFERENCES public.transport_types(id) ON DELETE CASCADE,
  line_number TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT '',
  from_area TEXT NOT NULL,
  to_area TEXT NOT NULL,
  via_stops TEXT[] NOT NULL DEFAULT '{}',
  route_path JSONB, -- GeoJSON LineString coordinates
  price_egp DOUBLE PRECISION NOT NULL DEFAULT 5,
  frequency_minutes INTEGER,
  has_fixed_stops BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transit_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view transit lines"
  ON public.transit_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage transit lines"
  ON public.transit_lines FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_transit_lines_type ON public.transit_lines(transport_type_id);
CREATE INDEX idx_transit_lines_number ON public.transit_lines(line_number);

-- Heatmaps for unofficial transport presence
CREATE TABLE public.transport_heatmaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transport_type_id UUID NOT NULL REFERENCES public.transport_types(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  intensity DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transport_heatmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view heatmaps"
  ON public.transport_heatmaps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage heatmaps"
  ON public.transport_heatmaps FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Mawaqef (major stations/terminals)
CREATE TABLE public.mawaqef (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city TEXT NOT NULL DEFAULT 'cairo',
  transport_type_ids UUID[] NOT NULL DEFAULT '{}',
  description_en TEXT,
  description_ar TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mawaqef ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view mawaqef"
  ON public.mawaqef FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage mawaqef"
  ON public.mawaqef FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_mawaqef_city ON public.mawaqef(city);

-- Trigger for transit_lines updated_at
CREATE TRIGGER update_transit_lines_updated_at
  BEFORE UPDATE ON public.transit_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
