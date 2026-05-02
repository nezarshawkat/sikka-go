import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

router.put("/", async (req, res) => {
  const userId = (req as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { language, nationality, displayName } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (language) updates.language = language;
  if (nationality) updates.nationality = nationality;
  if (displayName !== undefined) updates.displayName = displayName;

  const [updated] = await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, userId)).returning();
  res.json(updated);
});

export default router;
