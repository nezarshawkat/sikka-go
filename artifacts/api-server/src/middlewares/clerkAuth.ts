import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export function clerkAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (userId) {
    req.userId = userId;
  }
  next();
}
