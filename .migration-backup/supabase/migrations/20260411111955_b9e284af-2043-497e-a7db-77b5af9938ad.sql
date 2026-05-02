
ALTER TABLE public.transport_types
ADD COLUMN service_level text NOT NULL DEFAULT 'economic',
ADD COLUMN min_distance_minutes integer NOT NULL DEFAULT 0,
ADD COLUMN max_distance_minutes integer NOT NULL DEFAULT 9999;
