
# Sikka — Intelligent Transportation Planner for Egypt

## Overview
A mobile-friendly web app (with Capacitor wrapper for iOS/Android) that helps users plan multi-modal transportation routes across Egypt using AI-powered optimization. Built with React, Lovable Cloud (Supabase), Mapbox, and Lovable AI.

---

## Phase 1: Foundation & Auth
- **Phone + OTP authentication** using Lovable Cloud auth (SMS provider)
- **Signup flow**: language selection (Arabic/English), nationality (Egyptian/Foreigner)
- **Admin login**: separate email/password entry via small icon on signup page
- **User roles table** (admin role with secure RLS policies)
- **Bilingual support** (Arabic RTL + English LTR) using i18n

## Phase 2: Database & Admin Dashboard
- **Database tables**: Users, Locations, Transport Types, Transport Routes, Trips, Trip Segments, Reviews
- Admin-managed data: transport speeds, prices, routes, stations, availability toggles
- **Admin dashboard pages**:
  - Transport types management (add/edit speed, price, enable/disable)
  - Locations & stations management (name, lat/lng)
  - Routes management (start/end, distance, price, transport type)
  - User reviews moderation
  - Analytics overview (trips, popular routes, ratings)

## Phase 3: Map & Search
- **Mapbox GL JS** integration with the user's current location (browser geolocation)
- **Search bar** with Mapbox Geocoding API for destination autocomplete
- **Profile icon** linking to user settings
- Store Mapbox API key as a project secret

## Phase 4: Trip Planning & AI Route Engine
- **Trip preferences bottom sheet**: trip type (Economic/Comfortable/Premium), budget input with AI-recommended budget
- **Lovable AI edge function** that receives user location, destination, preferences, nationality, and queries the transport routes database to generate optimal multi-segment plans
- **Graph-based routing**: locations as nodes, transport routes as edges; AI selects best path based on mode (minimize cost / balance / minimize time)
- **Nationality rules**: foreigners excluded from tuk-tuk/microbus unless very low budget
- Loading screen: "Setting up your trip plan"

## Phase 5: Transport Plan UI
- **Vertical card layout** showing each segment (transport type, start→end, cost, time)
- **Swipe to change transport** on each card (e.g., Taxi→Bus), with auto-recalculation
- **Trip summary bar**: total cost, total time, estimated arrival
- "Continue" button to view route on map

## Phase 6: Route Map & Trip Guide
- **Color-coded route lines** per transport type on Mapbox (Taxi=blue, Metro=red, Train=green, Bus=yellow, Airplane=purple)
- **Step-by-step trip guide** with "Next" button progression
- **Taxi integration**: deep links to Uber/Careem with pre-filled destination

## Phase 7: Reviews & Ratings
- Post-segment **1–5 star rating** + comment
- Reviews stored in database, visible to admins
- Ratings feed back into AI recommendation quality

## Phase 8: Capacitor Wrapper
- Configure Capacitor for iOS and Android builds
- Instructions for the user to export to GitHub, build locally with Xcode/Android Studio

---

## MVP Scope
- **Cities**: Cairo & Giza
- **Transport types**: Taxi, Metro, Bus, Train, Microbus, Tuk-tuk, Monorail, Airplane (admin-toggleable)
- **Design**: Clean, map-centered, Google Maps / Citymapper inspired, gesture-friendly, mobile-optimized
