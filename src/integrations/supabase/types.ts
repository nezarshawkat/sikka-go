export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bus_routes: {
        Row: {
          bus_number: string
          created_at: string
          from_location: string
          id: string
          is_active: boolean
          price_egp: number
          to_location: string
          transport_type: string
          updated_at: string
          via: string | null
        }
        Insert: {
          bus_number: string
          created_at?: string
          from_location: string
          id?: string
          is_active?: boolean
          price_egp?: number
          to_location: string
          transport_type?: string
          updated_at?: string
          via?: string | null
        }
        Update: {
          bus_number?: string
          created_at?: string
          from_location?: string
          id?: string
          is_active?: boolean
          price_egp?: number
          to_location?: string
          transport_type?: string
          updated_at?: string
          via?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          city: string
          created_at: string
          id: string
          is_station: boolean
          latitude: number
          longitude: number
          name_ar: string
          name_en: string
        }
        Insert: {
          city?: string
          created_at?: string
          id?: string
          is_station?: boolean
          latitude: number
          longitude: number
          name_ar: string
          name_en: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_station?: boolean
          latitude?: number
          longitude?: number
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          language: string
          nationality: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          nationality?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          nationality?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          transport_type_id: string
          trip_segment_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          transport_type_id: string
          trip_segment_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          transport_type_id?: string
          trip_segment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_transport_type_id_fkey"
            columns: ["transport_type_id"]
            isOneToOne: false
            referencedRelation: "transport_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_trip_segment_id_fkey"
            columns: ["trip_segment_id"]
            isOneToOne: false
            referencedRelation: "trip_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          created_at: string
          distance_km: number
          duration_minutes: number | null
          end_location_id: string
          id: string
          is_active: boolean
          price_egp: number
          start_location_id: string
          transport_type_id: string
        }
        Insert: {
          created_at?: string
          distance_km: number
          duration_minutes?: number | null
          end_location_id: string
          id?: string
          is_active?: boolean
          price_egp: number
          start_location_id: string
          transport_type_id: string
        }
        Update: {
          created_at?: string
          distance_km?: number
          duration_minutes?: number | null
          end_location_id?: string
          id?: string
          is_active?: boolean
          price_egp?: number
          start_location_id?: string
          transport_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_end_location_id_fkey"
            columns: ["end_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_routes_start_location_id_fkey"
            columns: ["start_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_routes_transport_type_id_fkey"
            columns: ["transport_type_id"]
            isOneToOne: false
            referencedRelation: "transport_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_types: {
        Row: {
          average_speed_kmh: number
          base_price_egp: number
          color: string
          created_at: string
          foreigner_allowed: boolean
          icon: string
          id: string
          is_active: boolean
          max_distance_minutes: number
          min_distance_minutes: number
          name_ar: string
          name_en: string
          price_per_km_egp: number
          service_level: string
        }
        Insert: {
          average_speed_kmh?: number
          base_price_egp?: number
          color?: string
          created_at?: string
          foreigner_allowed?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          max_distance_minutes?: number
          min_distance_minutes?: number
          name_ar: string
          name_en: string
          price_per_km_egp?: number
          service_level?: string
        }
        Update: {
          average_speed_kmh?: number
          base_price_egp?: number
          color?: string
          created_at?: string
          foreigner_allowed?: boolean
          icon?: string
          id?: string
          is_active?: boolean
          max_distance_minutes?: number
          min_distance_minutes?: number
          name_ar?: string
          name_en?: string
          price_per_km_egp?: number
          service_level?: string
        }
        Relationships: []
      }
      trip_patterns: {
        Row: {
          chosen_transports: string[]
          created_at: string
          distance_km: number | null
          end_area: string
          id: string
          start_area: string
          total_cost_egp: number | null
          trip_type: string
          user_id: string
        }
        Insert: {
          chosen_transports?: string[]
          created_at?: string
          distance_km?: number | null
          end_area: string
          id?: string
          start_area: string
          total_cost_egp?: number | null
          trip_type?: string
          user_id: string
        }
        Update: {
          chosen_transports?: string[]
          created_at?: string
          distance_km?: number | null
          end_area?: string
          id?: string
          start_area?: string
          total_cost_egp?: number | null
          trip_type?: string
          user_id?: string
        }
        Relationships: []
      }
      trip_segments: {
        Row: {
          cost_egp: number
          created_at: string
          duration_minutes: number
          end_lat: number
          end_lng: number
          end_name: string
          id: string
          segment_order: number
          start_lat: number
          start_lng: number
          start_name: string
          transport_type_id: string
          trip_id: string
        }
        Insert: {
          cost_egp?: number
          created_at?: string
          duration_minutes?: number
          end_lat: number
          end_lng: number
          end_name: string
          id?: string
          segment_order: number
          start_lat: number
          start_lng: number
          start_name: string
          transport_type_id: string
          trip_id: string
        }
        Update: {
          cost_egp?: number
          created_at?: string
          duration_minutes?: number
          end_lat?: number
          end_lng?: number
          end_name?: string
          id?: string
          segment_order?: number
          start_lat?: number
          start_lng?: number
          start_name?: string
          transport_type_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_segments_transport_type_id_fkey"
            columns: ["transport_type_id"]
            isOneToOne: false
            referencedRelation: "transport_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_segments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_egp: number | null
          created_at: string
          destination_name: string | null
          end_lat: number
          end_lng: number
          id: string
          start_lat: number
          start_lng: number
          status: string
          total_cost_egp: number | null
          total_time_minutes: number | null
          trip_type: string
          user_id: string
        }
        Insert: {
          budget_egp?: number | null
          created_at?: string
          destination_name?: string | null
          end_lat: number
          end_lng: number
          id?: string
          start_lat: number
          start_lng: number
          status?: string
          total_cost_egp?: number | null
          total_time_minutes?: number | null
          trip_type?: string
          user_id: string
        }
        Update: {
          budget_egp?: number | null
          created_at?: string
          destination_name?: string | null
          end_lat?: number
          end_lng?: number
          id?: string
          start_lat?: number
          start_lng?: number
          status?: string
          total_cost_egp?: number | null
          total_time_minutes?: number | null
          trip_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
