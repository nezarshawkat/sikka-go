/**
 * One-off / re-runnable enrichment of existing bus route geometry.
 *
 * Loads every "board-anywhere" transit line (hasFixedStops = false — i.e.
 * bus / serfis / microbus, NOT metro/monorail/train) and regenerates its
 * route_path using the AI-breadcrumb + driving-traffic pipeline, then writes
 * the corrected polyline back to the DB.
 *
 * Usage (after build):
 *   pnpm --filter @workspace/api-server run enrich:bus-paths
 *   pnpm --filter @workspace/api-server run enrich:bus-paths -- --all     (re-do even lines that already have a path)
 *   pnpm --filter @workspace/api-server run enrich:bus-paths -- --limit=20
 *   pnpm --filter @workspace/api-server run enrich:bus-paths -- --city=Alexandria
 */
import { pool, db } from "@workspace/db";
import { transitLinesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { buildBusRoutePathAI } from "../utils/busPathEnricher.js";

interface Args { all: boolean; limit: number; offset: number; city: string | null; }

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split("=")[1] : null;
  };
  return {
    all: args.includes("--all"),
    limit: Number(get("limit")) || Infinity,
    offset: Number(get("offset")) || 0,
    city: get("city"),
  };
}

async function main(): Promise<void> {
  const { all, limit, offset, city } = parseArgs();

  // Stable ordering by id so --offset/--limit batches are deterministic and resumable.
  const lines = await db.select().from(transitLinesTable).orderBy(asc(transitLinesTable.id));
  const gov = (l: typeof lines[number]) => (l as { governorate?: string }).governorate || "Cairo";
  // Only board-anywhere modes need a road-snapped corridor; metro/monorail/train use fixed station pairs.
  let targets = lines.filter(l => !l.hasFixedStops);
  if (!all) targets = targets.filter(l => !l.routePath || !(l.routePath as { coordinates?: unknown[] })?.coordinates?.length);
  if (city) targets = targets.filter(l => gov(l).toLowerCase().includes(city.toLowerCase()));
  if (offset > 0) targets = targets.slice(offset);
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);

  console.log(`Enriching ${targets.length} bus line(s) (all=${all}, city=${city ?? "any"})...`);

  let ok = 0, ai = 0, failed = 0;
  for (const line of targets) {
    const label = `${line.lineNumber ?? line.id} (${line.fromArea} → ${line.toArea})`;
    try {
      const cityForLine = city || gov(line);
      const result = await buildBusRoutePathAI(
        line.fromArea, line.toArea, line.viaStops || [], cityForLine,
      );
      if (result.routePath) {
        await db.update(transitLinesTable)
          .set({ routePath: result.routePath })
          .where(eq(transitLinesTable.id, line.id));
        ok++;
        if (result.usedAI) ai++;
        console.log(`  ✓ ${label} — ${result.routePath.coordinates.length} pts` +
          ` (${result.geocodedCount} geocoded, AI=${result.usedAI})`);
      } else {
        failed++;
        console.log(`  ✗ ${label} — no path (geocoding/token failed)`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${label} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. updated=${ok}, ai-expanded=${ai}, failed=${failed}, total=${targets.length}`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => {
    console.error("Bus path enrichment failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
