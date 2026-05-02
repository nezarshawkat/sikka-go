import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

router.put("/", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { language, nationality, displayName } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (language) updates.language = language;
  if (nationality) updates.nationality = nationality;
  if (displayName !== undefined) updates.displayName = displayName;
  const [updated] = await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, userId)).returning();
  res.json(updated);
});

export default router;
