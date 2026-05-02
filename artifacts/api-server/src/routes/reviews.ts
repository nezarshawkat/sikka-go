import { Router } from "express";
import { db } from "@workspace/db";
import { reviewsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { rating, comment, transportTypeId, tripSegmentId } = req.body;
  const [row] = await db.insert(reviewsTable).values({ userId, rating, comment, transportTypeId, tripSegmentId }).returning();
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  await db.delete(reviewsTable).where(eq(reviewsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
