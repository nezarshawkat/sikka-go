import { pgTable, text, boolean, real, integer, jsonb, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appRoleEnum = pgEnum("app_role", ["admin", "user"]);

export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name"),
  phone: text("phone"),
  language: text("language").notNull().default("en"),
  nationality: text("nationality").notNull().default("egyptian"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userRolesTable = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  role: appRoleEnum("role").notNull().default("user"),
});

export const transportTypesTable = pgTable("transport_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  icon: text("icon").notNull().default("bus"),
  color: text("color").notNull().default("#3B82F6"),
  serviceLevel: text("service_level").notNull().default("standard"),
  averageSpeedKmh: real("average_speed_kmh").notNull().default(30),
  basePriceEgp: real("base_price_egp").notNull().default(5),
  pricePerKmEgp: real("price_per_km_egp").notNull().default(1),
  minDistanceMinutes: integer("min_distance_minutes").notNull().default(5),
  maxDistanceMinutes: integer("max_distance_minutes").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  foreignerAllowed: boolean("foreigner_allowed").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transitLinesTable = pgTable("transit_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportTypeId: uuid("transport_type_id").notNull(),
  lineNumber: text("line_number").notNull(),
  nameEn: text("name_en").notNull().default(""),
  nameAr: text("name_ar").notNull().default(""),
  fromArea: text("from_area").notNull(),
  toArea: text("to_area").notNull(),
  viaStops: text("via_stops").array().notNull().default([]),
  routePath: jsonb("route_path").$type<{ type: string; coordinates: [number, number][] } | null>(),
  priceEgp: real("price_egp").notNull().default(5),
  frequencyMinutes: integer("frequency_minutes"),
  hasFixedStops: boolean("has_fixed_stops").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const locationsTable = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  city: text("city").notNull().default("cairo"),
  isStation: boolean("is_station").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mawaqefTable = pgTable("mawaqef", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  city: text("city").notNull().default("cairo"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  transportTypeIds: uuid("transport_type_ids").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tripsTable = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  startLat: real("start_lat").notNull(),
  startLng: real("start_lng").notNull(),
  endLat: real("end_lat").notNull(),
  endLng: real("end_lng").notNull(),
  destinationName: text("destination_name"),
  budgetEgp: real("budget_egp"),
  status: text("status").notNull().default("planned"),
  tripType: text("trip_type").notNull().default("economic"),
  totalCostEgp: real("total_cost_egp"),
  totalTimeMinutes: integer("total_time_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tripSegmentsTable = pgTable("trip_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id").notNull(),
  transportTypeId: uuid("transport_type_id").notNull(),
  startName: text("start_name").notNull(),
  endName: text("end_name").notNull(),
  startLat: real("start_lat").notNull(),
  startLng: real("start_lng").notNull(),
  endLat: real("end_lat").notNull(),
  endLng: real("end_lng").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  costEgp: real("cost_egp").notNull().default(0),
  segmentOrder: integer("segment_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviewsTable = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  transportTypeId: uuid("transport_type_id").notNull(),
  tripSegmentId: uuid("trip_segment_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transportHeatmapsTable = pgTable("transport_heatmaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportTypeId: uuid("transport_type_id").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  intensity: real("intensity").notNull().default(0.75),
  radiusKm: real("radius_km").notNull().default(1.5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const otpCodesTable = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const phoneSessionsTable = pgTable("phone_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTransportTypeSchema = createInsertSchema(transportTypesTable).omit({ id: true, createdAt: true });
export const insertTransitLineSchema = createInsertSchema(transitLinesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export const insertMawaqefSchema = createInsertSchema(mawaqefTable).omit({ id: true, createdAt: true });
export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true });
export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true });
export const insertHeatmapSchema = createInsertSchema(transportHeatmapsTable).omit({ id: true, createdAt: true });

export type Profile = typeof profilesTable.$inferSelect;
export type TransportType = typeof transportTypesTable.$inferSelect;
export type TransitLine = typeof transitLinesTable.$inferSelect;
export type Location = typeof locationsTable.$inferSelect;
export type Mawaqef = typeof mawaqefTable.$inferSelect;
export type Trip = typeof tripsTable.$inferSelect;
export type TripSegment = typeof tripSegmentsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;
export type TransportHeatmap = typeof transportHeatmapsTable.$inferSelect;
