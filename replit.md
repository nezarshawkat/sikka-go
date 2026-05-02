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
- **Auth (users)**: Custom phone OTP via api-server (`phone_sessions` table)
- **Auth (admin)**: Clerk (`@clerk/react` v6, email pattern `username@sikka.admin`)
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
- **Admin users**: Clerk sign-in with `username@sikka.admin` + password → Clerk JWT
- **Dev OTP**: In non-production, the OTP code is returned as `dev_code` in the response and shown as a toast in the UI

### API Routes

| Route | Description |
|---|---|
| `POST /api/auth/send-otp` | Send OTP to phone |
| `POST /api/auth/verify-otp` | Verify OTP, returns session token |
| `GET /api/auth/session` | Validate Bearer token, return user info |
| `POST /api/auth/logout` | Delete session |
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

### Key Files

- `artifacts/sikka/src/contexts/AuthContext.tsx` — Dual auth (Clerk + phone sessions)
- `artifacts/sikka/src/pages/Auth.tsx` — Phone OTP flow + admin Clerk login UI
- `artifacts/sikka/src/lib/api.ts` — Fetch wrapper (reads Bearer token from localStorage)
- `artifacts/sikka/src/App.tsx` — ClerkProvider wrapping entire app
- `artifacts/api-server/src/routes/auth.ts` — OTP send/verify/session/logout
- `artifacts/api-server/src/routes/index.ts` — All routes wired
- `lib/db/src/schema/sikka.ts` — Full 14-table Drizzle schema

### Environment Variables

- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (set in Replit userenv)
- `CLERK_SECRET_KEY` — Clerk secret key (set in Replit userenv)
- `DATABASE_URL` — Replit PostgreSQL connection string (auto-provided)
- `VITE_MAPBOX_TOKEN` — Mapbox access token
- `OPENAI_API_KEY` — OpenAI key for trip planning (optional, falls back gracefully)
