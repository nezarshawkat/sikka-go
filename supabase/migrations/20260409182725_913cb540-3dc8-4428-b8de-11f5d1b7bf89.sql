-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  nationality TEXT NOT NULL DEFAULT 'egyptian' CHECK (nationality IN ('egyptian', 'foreigner')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Locations table
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city TEXT NOT NULL DEFAULT 'cairo',
  is_station BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view locations" ON public.locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage locations" ON public.locations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Transport types table
CREATE TABLE public.transport_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'bus',
  average_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 30,
  base_price_egp DOUBLE PRECISION NOT NULL DEFAULT 5,
  price_per_km_egp DOUBLE PRECISION NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  foreigner_allowed BOOLEAN NOT NULL DEFAULT true,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transport_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view transport types" ON public.transport_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage transport types" ON public.transport_types
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Transport routes table
CREATE TABLE public.transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_type_id UUID REFERENCES public.transport_types(id) ON DELETE CASCADE NOT NULL,
  start_location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  end_location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL,
  price_egp DOUBLE PRECISION NOT NULL,
  duration_minutes DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view routes" ON public.transport_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage routes" ON public.transport_routes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trips table
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  destination_name TEXT,
  trip_type TEXT NOT NULL DEFAULT 'economic' CHECK (trip_type IN ('economic', 'comfortable', 'premium')),
  budget_egp DOUBLE PRECISION,
  total_cost_egp DOUBLE PRECISION,
  total_time_minutes DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trips" ON public.trips
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own trips" ON public.trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trips" ON public.trips
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all trips" ON public.trips
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Trip segments table
CREATE TABLE public.trip_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  segment_order INTEGER NOT NULL,
  transport_type_id UUID REFERENCES public.transport_types(id) NOT NULL,
  start_name TEXT NOT NULL,
  end_name TEXT NOT NULL,
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  cost_egp DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their trip segments" ON public.trip_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_segments.trip_id AND trips.user_id = auth.uid())
  );
CREATE POLICY "Users can manage their trip segments" ON public.trip_segments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_segments.trip_id AND trips.user_id = auth.uid())
  );

-- Reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trip_segment_id UUID REFERENCES public.trip_segments(id) ON DELETE CASCADE NOT NULL,
  transport_type_id UUID REFERENCES public.transport_types(id) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all reviews" ON public.reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create their own reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage reviews" ON public.reviews
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, phone)
  VALUES (NEW.id, NEW.phone);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;