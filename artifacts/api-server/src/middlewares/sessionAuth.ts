import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { phoneSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { getAuth } from "@clerk/express";

export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const [session] = await db
      .select()
      .from(phoneSessionsTable)
      .where(and(eq(phoneSessionsTable.token, token), gt(phoneSessionsTable.expiresAt, new Date())))
      .limit(1);

    if (session) {
      (req as any).userId = session.userId;
      return next();
    }
  }

  const clerkAuth = getAuth(req);
  if (clerkAuth?.userId) {
    (req as any).userId = `clerk:${clerkAuth.userId}`;
  }

  next();
}
