import { Router } from "express";
import { db } from "@workspace/db";
import { mawaqefTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { active } = req.query;
  if (active === "true") {
    const rows = await db.select().from(mawaqefTable).where(eq(mawaqefTable.isActive, true)).orderBy(asc(mawaqefTable.nameAr));
    return res.json(rows);
  }
  const rows = await db.select().from(mawaqefTable).orderBy(asc(mawaqefTable.nameAr));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { nameEn, nameAr, city, latitude, longitude, transportTypeIds, descriptionEn, descriptionAr } = req.body;
  const [row] = await db.insert(mawaqefTable).values({
    nameEn, nameAr, city: city || "cairo",
    latitude, longitude,
    transportTypeIds: transportTypeIds || [],
    descriptionEn, descriptionAr,
  }).returning();
  res.json(row);
});

router.put("/:id", async (req, res) => {
  const updates: Record<string, any> = {};
  const allowed = ["nameEn", "nameAr", "city", "latitude", "longitude", "transportTypeIds", "isActive", "descriptionEn", "descriptionAr"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [row] = await db.update(mawaqefTable).set(updates).where(eq(mawaqefTable.id, req.params.id)).returning();
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(mawaqefTable).where(eq(mawaqefTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
