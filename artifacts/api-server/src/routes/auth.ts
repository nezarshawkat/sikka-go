import { Router } from "express";
import { db } from "@workspace/db";
import { profilesTable, userRolesTable, phoneSessionsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

const ADMIN_USER_ID = "sikka-admin";

/**
 * POST /api/auth/admin-login
 * Standalone admin login — no Clerk required.
 * Validates ADMIN_USERNAME + ADMIN_PASSWORD, creates a session token.
 */
router.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin credentials are not configured on this server" });
    return;
  }

  if (String(username).trim() !== ADMIN_USERNAME || String(password) !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, ADMIN_USER_ID)).limit(1);
  if (!profile) {
    [profile] = await db.insert(profilesTable).values({
      userId: ADMIN_USER_ID,
      language: "en",
      nationality: "egyptian",
      displayName: "Admin",
    }).returning();
  }

  const [existingRole] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, ADMIN_USER_ID), eq(userRolesTable.role, "admin")))
    .limit(1);

  if (!existingRole) {
    await db.insert(userRolesTable).values({ userId: ADMIN_USER_ID, role: "admin" });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(phoneSessionsTable).values({ userId: ADMIN_USER_ID, token, expiresAt });

  res.json({ adminToken: token });
});

/**
 * POST /api/auth/admin-logout
 * Revokes the admin session token.
 */
router.post("/admin-logout", async (req, res) => {
  const token = req.headers["x-admin-token"] as string;
  if (token) {
    await db.delete(phoneSessionsTable).where(eq(phoneSessionsTable.token, token));
  }
  res.json({ success: true });
});

/**
 * POST /api/auth/setup-admin
 * Grants admin role to the currently authenticated Clerk user.
 */
router.post("/setup-admin", async (req, res) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "You must be signed in with Clerk to set up admin access" });
    return;
  }

  const { username, password } = req.body;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin credentials are not configured on this server" });
    return;
  }

  if (String(username).trim() !== ADMIN_USERNAME || String(password) !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (!profile) {
    [profile] = await db.insert(profilesTable).values({
      userId,
      language: "en",
      nationality: "egyptian",
      displayName: "Admin",
    }).returning();
  }

  const [existingRole] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.role, "admin")))
    .limit(1);

  if (!existingRole) {
    await db.insert(userRolesTable).values({ userId, role: "admin" });
  }

  res.json({ success: true, message: "Admin role granted to your account" });
});

export { ADMIN_USER_ID };
export default router;
