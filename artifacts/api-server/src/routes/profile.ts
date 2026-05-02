import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

interface ProfileUpdate {
  language?: string;
  nationality?: string;
  displayName?: string | null;
  updatedAt?: Date;
}

router.get("/", requireAuth, async (req, res) => {
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.userId!)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(profile);
});

router.put("/", requireAuth, async (req, res) => {
  const { language, nationality, displayName } = req.body;
  const updates: ProfileUpdate = { updatedAt: new Date() };
  if (language !== undefined) updates.language = language;
  if (nationality !== undefined) updates.nationality = nationality;
  if (displayName !== undefined) updates.displayName = displayName;
  const [updated] = await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, req.userId!)).returning();
  res.json(updated);
});

export default router;
