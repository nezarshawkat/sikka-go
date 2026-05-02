import { Router } from "express";
import { db } from "@workspace/db";
import { transitLinesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { active } = req.query;
  let query = db.select().from(transitLinesTable).orderBy(asc(transitLinesTable.lineNumber));
  if (active === "true") {
    const rows = await db.select().from(transitLinesTable).where(eq(transitLinesTable.isActive, true)).orderBy(asc(transitLinesTable.lineNumber));
    return res.json(rows);
  }
  const rows = await query;
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { transportTypeId, lineNumber, nameEn, nameAr, fromArea, toArea, viaStops, routePath, priceEgp, frequencyMinutes, hasFixedStops } = req.body;
  const [row] = await db.insert(transitLinesTable).values({
    transportTypeId,
    lineNumber,
    nameEn: nameEn || `${lineNumber}: ${fromArea} to ${toArea}`,
    nameAr: nameAr || `${lineNumber}: ${fromArea} - ${toArea}`,
    fromArea,
    toArea,
    viaStops: viaStops || [],
    routePath: routePath || null,
    priceEgp: priceEgp || 5,
    frequencyMinutes: frequencyMinutes || null,
    hasFixedStops: hasFixedStops || false,
  }).returning();
  res.json(row);
});

router.put("/:id", async (req, res) => {
  const updates: Record<string, any> = { updatedAt: new Date() };
  const allowed = ["lineNumber", "nameEn", "nameAr", "fromArea", "toArea", "viaStops", "routePath", "priceEgp", "frequencyMinutes", "hasFixedStops", "isActive", "transportTypeId"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [row] = await db.update(transitLinesTable).set(updates).where(eq(transitLinesTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(transitLinesTable).where(eq(transitLinesTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
