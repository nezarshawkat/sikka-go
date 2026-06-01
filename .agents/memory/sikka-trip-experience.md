---
name: Sikka trip experience & auth
description: How the active-trip guide, reviews/reports, and request auth work in Sikka
---

# Sikka active-trip experience

- Trips are NOT a separate page. `pages/TripPlan.tsx` writes sessionStorage `tripPlan` then navigates to `/` (home). `pages/Index.tsx` reads it, draws per-segment road geometry on the home Mapbox map, and renders `components/trip/TripGuideSheet.tsx` (minimized/expanded bottom sheet) with live GPS via `hooks/useTripTracking.ts`.
- `TripResult.tsx` is kept only as a fallback route, not the primary flow.

# AI segment ids are slugs, not UUIDs
- `/api/trips/plan` segments use slug `transport_type_id` like `metro`/`bus`/`car` (NOT DB UUIDs).
- **Why:** the AI generates them freely; they don't map 1:1 to `transport_types` rows.
- **How to apply:** when persisting reviews/reports, UUID-gate the id (regex) and send `null` if it's a slug; preserve attribution by also sending `meta.transportName`/`meta.transportSlug` so admin analytics can still group. Never pass a slug into a uuid column — it 500s.

# Request auth is cookie-based Clerk (no Bearer token)
- `lib/api.ts` sends `credentials: "include"` + optional `X-Admin-Token` only. It does NOT add an `Authorization: Bearer` header (despite older replit.md notes).
- The API `clerkAuth` middleware uses `getAuth(req)` from `@clerk/express`, which reads the Clerk session from the `__session` cookie. `X-Admin-Token` is a phone-session fallback.
- **Why:** a code review flagged "missing Bearer token" as a bug — it is a FALSE POSITIVE. Cookie-based Clerk works and all `requireAuth` endpoints rely on it.
- **How to apply:** don't "fix" auth by injecting Bearer tokens; verify cookie propagation instead.

# transport_types categorization
- Columns `governmentType` ('government'|'private') and `category` ('economic'|'comfortable'|'premium') drive AI trip-type selection (economic/comfortable/premium). Seeded per type.
