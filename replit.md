# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Sikka is a Cairo transit planning app migrated from Lovable.dev/Supabase to a Replit-native stack.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (api-server on port 8080)
- **Database**: Replit PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth (users)**: Phone OTP via api-server (`otp_codes` + `phone_sessions` tables)
- **Auth (admin)**: Username/password via `POST /api/auth/admin-login` (credentials in Replit Secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD`)
- **Frontend**: React + Vite (`artifacts/sikka`, port 18322)
- **Map**: Mapbox GL JS (`react-map-gl/mapbox`)

## Key Commands

- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/sikka run dev` — run frontend

## Project: Sikka (Cairo Transit App)

### Architecture

- **Frontend** (`artifacts/sikka/`) — React + Vite app, Vite proxy forwards `/api/*` → `localhost:8080`
- **API Server** (`artifacts/api-server/`) — Express app with all data routes
- **DB** (`lib/db/`) — Drizzle schema (14 tables), Replit PostgreSQL

### Auth Flow

- **Regular users**: Phone OTP → `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` → Bearer token stored in `localStorage` key `sikka_phone_token`
- **Admin users**: `POST /api/auth/admin-login` with username + password → session token; credentials stored as Replit Secrets
- **Dev OTP**: In non-production, the OTP code is returned as `dev_code` in the response and shown as a toast in the UI

### API Routes

| Route | Description |
|---|---|
| `POST /api/auth/send-otp` | Send OTP to phone |
| `POST /api/auth/verify-otp` | Verify OTP, returns session token |
| `GET /api/auth/session` | Validate Bearer token, return user info |
| `POST /api/auth/logout` | Delete session |
| `POST /api/auth/admin-login` | Admin login (username + password) |
| `GET/PUT /api/profile` | User profile |
| `GET/POST/PUT/DELETE /api/transport-types` | Transport types |
| `GET/POST/PUT/DELETE /api/transit-lines` | Transit lines |
| `GET/POST/PUT/DELETE /api/locations` | Locations |
| `GET/POST/PUT/DELETE /api/mawaqef` | Bus/transit terminals |
| `GET/POST/DELETE /api/reviews` | User reviews |
| `GET/POST/PUT/DELETE /api/heatmaps` | Heatmap data |
| `GET /api/analytics` | Admin analytics |
| `GET/POST/DELETE /api/trips` | User trips |
| `POST /api/trips/plan` | AI trip planning (OpenAI + fallback) |

### DB Schema (14 tables)

All Drizzle columns use camelCase in JS/TS. API responses are camelCase.

- `profiles`, `user_roles`, `otp_codes`, `phone_sessions`
- `transport_types`, `transit_lines`, `locations`, `mawaqef`
- `trips`, `trip_segments`, `reviews`, `transport_heatmaps`
- `trip_notifications`, `trip_shares`

### Transport Types

- **Metro**: Fixed stop-pair routes (Lines 1, 2, 3)
- **Monorail**: Fixed stop-pair routes (East, West)
- **Train**: Fixed stop-pair routes (intercity)
- **CTA Bus** (أتوبيس الهيئة): Government big buses, 13 EGP, board anywhere
- **NTA Bus** (أتوبيس النقل الجماعي): Private mini-bus companies, 19–25 EGP, board anywhere — ~110 Cairo routes from March 2026 PDF
- **Serfis** (السرفيس): Shared fixed-route taxis, ~10 EGP, board anywhere — 20 common Cairo routes
- **Microbus**: Variable routes with via stops
- **Tuktuk**: Heatmap-only (no fixed routes)
- **White Taxi**: Heatmap-only (no fixed routes)
- **Uber / Careem**: Always provided as fallback in AI trip plans

### Seed Endpoints (admin only)

| Endpoint | Description |
|---|---|
| `POST /api/admin/seed-cairo` | All Cairo types + Metro/Monorail/Train/NTA Bus/Serfis |
| `POST /api/admin/seed-cairo?section=nta` | NTA Bus routes only |
| `POST /api/admin/seed-cairo?section=serfis` | Serfis routes only |
| `POST /api/admin/seed-cairo?generatePaths=true` | Also geocode + snap to roads via Mapbox |
| `POST /api/admin/seed-alexandria` | Alexandria APTA routes (CTA Bus type, 31 routes) |
| `POST /api/admin/seed-alexandria?generatePaths=true` | Also geocode + snap to roads |

### Route Path Generation

- Client-side: `buildPathFromLineText` in AdminMap.tsx — geocodes stops + Mapbox Directions snap-to-roads
- Server-side: `artifacts/api-server/src/utils/routePathGenerator.ts` — same logic, used by seed endpoints with `?generatePaths=true`
- All bus/serfis routes use `hasFixedStops: false` — users board/alight anywhere along the route

### Key Files

- `artifacts/sikka/src/contexts/AuthContext.tsx` — Phone OTP session auth context
- `artifacts/sikka/src/pages/Auth.tsx` — Language selector + phone OTP flow + admin login UI
- `artifacts/sikka/src/lib/api.ts` — Fetch wrapper (reads Bearer token from localStorage)
- `artifacts/sikka/src/App.tsx` — App router + auth provider
- `artifacts/api-server/src/routes/auth.ts` — OTP send/verify/session/logout + admin-login
- `artifacts/api-server/src/routes/index.ts` — All routes wired
- `lib/db/src/schema/sikka.ts` — Full 14-table Drizzle schema
- `artifacts/api-server/src/routes/seedCairo.ts` — Cairo seed: Metro/Monorail/Train/CTA Bus/NTA Bus (~110 routes)/Serfis
- `artifacts/api-server/src/routes/seedAlexandria.ts` — Alexandria APTA 31 routes
- `artifacts/api-server/src/utils/routePathGenerator.ts` — Server-side geocode + snap-to-roads

### Environment Variables / Secrets

- `ADMIN_USERNAME` — Admin login username (Replit Secret)
- `ADMIN_PASSWORD` — Admin login password (Replit Secret)
- `DATABASE_URL` — Replit PostgreSQL connection string (auto-provided)
- `VITE_MAPBOX_TOKEN` — Mapbox access token
- `OPENAI_API_KEY` — OpenAI key for trip planning (optional, falls back gracefully)
