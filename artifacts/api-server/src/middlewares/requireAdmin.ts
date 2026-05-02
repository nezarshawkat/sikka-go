import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { userRolesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const [role] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.role, "admin")))
    .limit(1);

  if (!role) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}
