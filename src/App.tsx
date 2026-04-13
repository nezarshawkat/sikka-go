import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import TripPlan from "./pages/TripPlan";
import TripResult from "./pages/TripResult";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTransport from "./pages/admin/AdminTransport";
import AdminLocations from "./pages/admin/AdminLocations";
import AdminRoutes from "./pages/admin/AdminRoutes";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminMap from "./pages/admin/AdminMap";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/plan" element={<TripPlan />} />
            <Route path="/trip-result" element={<TripResult />} />
            <Route path="/admin" element={<AdminDashboard />}>
              <Route index element={<AdminMap />} />
              <Route path="map" element={<AdminMap />} />
              <Route path="transport" element={<AdminTransport />} />
              <Route path="locations" element={<AdminLocations />} />
              <Route path="routes" element={<AdminRoutes />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="analytics" element={<AdminAnalytics />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
