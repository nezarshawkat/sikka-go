import { Router } from "express";
import { db } from "@workspace/db";
import { locationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(locationsTable).orderBy(asc(locationsTable.nameEn));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { nameEn, nameAr, latitude, longitude, city, isStation } = req.body;
  const [row] = await db.insert(locationsTable).values({
    nameEn: nameEn || "New Location",
    nameAr: nameAr || "موقع جديد",
    latitude: latitude || 30.0444,
    longitude: longitude || 31.2357,
    city: city || "cairo",
    isStation: isStation || false,
  }).returning();
  res.json(row);
});

router.put("/:id", async (req, res) => {
  const updates: Record<string, any> = {};
  const allowed = ["nameEn", "nameAr", "latitude", "longitude", "city", "isStation"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [row] = await db.update(locationsTable).set(updates).where(eq(locationsTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(locationsTable).where(eq(locationsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
