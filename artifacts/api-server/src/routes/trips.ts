import { Router } from "express";
import { db } from "@workspace/db";
import { tripsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db.select().from(tripsTable).where(eq(tripsTable.userId, userId)).orderBy(desc(tripsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { startLat, startLng, endLat, endLng, destinationName, budgetEgp, tripType } = req.body;
  const [row] = await db.insert(tripsTable).values({ userId, startLat, startLng, endLat, endLng, destinationName, budgetEgp, tripType }).returning();
  res.json(row);
});

export default router;
