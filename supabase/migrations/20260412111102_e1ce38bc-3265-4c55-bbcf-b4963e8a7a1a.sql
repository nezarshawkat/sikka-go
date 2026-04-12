
-- Bus/transit line routes table
CREATE TABLE public.bus_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bus_number TEXT NOT NULL,
  transport_type TEXT NOT NULL DEFAULT 'CTA Bus',
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  via TEXT,
  price_egp DOUBLE PRECISION NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bus_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bus routes"
  ON public.bus_routes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage bus routes"
  ON public.bus_routes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trip patterns for AI learning
CREATE TABLE public.trip_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  start_area TEXT NOT NULL,
  end_area TEXT NOT NULL,
  chosen_transports TEXT[] NOT NULL DEFAULT '{}',
  trip_type TEXT NOT NULL DEFAULT 'economic',
  distance_km DOUBLE PRECISION,
  total_cost_egp DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own patterns"
  ON public.trip_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own patterns"
  ON public.trip_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all patterns"
  ON public.trip_patterns FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_bus_routes_number ON public.bus_routes(bus_number);
CREATE INDEX idx_trip_patterns_user ON public.trip_patterns(user_id);
CREATE INDEX idx_trip_patterns_areas ON public.trip_patterns(start_area, end_area);
