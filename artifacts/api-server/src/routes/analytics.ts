import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, tripsTable, reviewsTable, transitLinesTable } from "@workspace/db";
import { count } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const [users, trips, reviews, routes] = await Promise.all([
    db.select({ count: count() }).from(profilesTable),
    db.select({ count: count() }).from(tripsTable),
    db.select({ count: count() }).from(reviewsTable),
    db.select({ count: count() }).from(transitLinesTable),
  ]);

  res.json({
    users: users[0]?.count ?? 0,
    trips: trips[0]?.count ?? 0,
    reviews: reviews[0]?.count ?? 0,
    routes: routes[0]?.count ?? 0,
  });
});

export default router;
