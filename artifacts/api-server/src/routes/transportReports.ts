import { Router } from "express";
import { db } from "@workspace/db";
import { transportReportsTable } from "@workspace/db";
import { eq, desc, and, sql, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES = ["pending", "approved", "rejected"];

router.get("/", requireAdmin, async (req, res) => {
  const { discovery, status } = req.query as { discovery?: string; status?: string };

  if (discovery === "true") {
    const rows = await db
      .select({
        transportName: transportReportsTable.transportName,
        transportNumber: transportReportsTable.transportNumber,
        reportCount: sql<number>`cast(count(*) as int)`,
        sampleFromArea: sql<string | null>`max(${transportReportsTable.fromArea})`,
        sampleToArea: sql<string | null>`max(${transportReportsTable.toArea})`,
        avgPrice: sql<number | null>`avg(${transportReportsTable.priceEgp})`,
        gpsTraceCount: sql<number>`cast(sum(case when ${transportReportsTable.gpsTrace} is not null then 1 else 0 end) as int)`,
        avgGpsPoints: sql<number | null>`avg(jsonb_array_length(coalesce(${transportReportsTable.gpsTrace}, '[]'::jsonb)))`,
        confidenceScore: sql<number>`least(5, greatest(1, round((1 + least(count(*), 12) / 3.0 + least(avg(jsonb_array_length(coalesce(${transportReportsTable.gpsTrace}, '[]'::jsonb))), 120) / 60.0)::numeric, 1)))`,
        recommendationScore: sql<number>`cast(count(*) as int)`,
      })
      .from(transportReportsTable)
      .groupBy(
        sql`lower(${transportReportsTable.transportName})`,
        sql`coalesce(${transportReportsTable.transportNumber}, '')`,
        sql`lower(coalesce(${transportReportsTable.fromArea}, ''))`,
        sql`lower(coalesce(${transportReportsTable.toArea}, ''))`,
        transportReportsTable.transportName,
        transportReportsTable.transportNumber,
        transportReportsTable.fromArea,
        transportReportsTable.toArea,
      )
      .orderBy(desc(sql`count(*)`));
    return res.json(rows);
  }

  const filters: SQL[] = [];
  if (status && STATUSES.includes(status)) {
    filters.push(eq(transportReportsTable.status, status));
  }
  const rows = await db
    .select()
    .from(transportReportsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(transportReportsTable.createdAt));
  return res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const {
    transportName, transportNumber, transportTypeId, fromArea, toArea,
    gpsTrace, stopsVisited, priceEgp,
  } = req.body;

  if (typeof transportName !== "string" || !transportName.trim()) {
    return res.status(400).json({ error: "transportName is required" });
  }

  const resolvedTransportTypeId =
    typeof transportTypeId === "string" && UUID_RE.test(transportTypeId) ? transportTypeId : null;
  const price = Number(priceEgp);

  const [row] = await db.insert(transportReportsTable).values({
    userId: req.userId!,
    transportName: transportName.trim(),
    transportNumber: typeof transportNumber === "string" && transportNumber.length ? transportNumber : null,
    transportTypeId: resolvedTransportTypeId,
    fromArea: typeof fromArea === "string" && fromArea.length ? fromArea : null,
    toArea: typeof toArea === "string" && toArea.length ? toArea : null,
    gpsTrace: Array.isArray(gpsTrace) ? gpsTrace : null,
    stopsVisited: Array.isArray(stopsVisited) ? stopsVisited : null,
    priceEgp: Number.isFinite(price) ? price : null,
    status: "pending",
  }).returning();
  return res.json(row);
});

router.put("/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (typeof status !== "string" || !STATUSES.includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const [row] = await db
    .update(transportReportsTable)
    .set({ status })
    .where(eq(transportReportsTable.id, req.params.id as string))
    .returning();
  if (!row) return res.status(404).json({ error: "transport report not found" });
  return res.json(row);
});

export default router;
