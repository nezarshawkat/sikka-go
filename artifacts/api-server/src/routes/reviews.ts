import { Router } from "express";
import { db } from "@workspace/db";
import { reviewsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt));
  res.json(rows);
});

router.post("/", requireAuth, async (req, res) => {
  const { rating, comment, transportTypeId, tripSegmentId } = req.body;
  const [row] = await db.insert(reviewsTable).values({
    userId: req.userId!,
    rating, comment, transportTypeId, tripSegmentId,
  }).returning();
  res.json(row);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  await db.delete(reviewsTable).where(eq(reviewsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
