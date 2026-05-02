import { Router } from "express";
import { db } from "@workspace/db";
import { otpCodesTable, phoneSessionsTable, profilesTable, userRolesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone || String(phone).length < 8) {
    res.status(400).json({ error: "Valid phone number required" });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(otpCodesTable).values({ phone: String(phone), code, expiresAt });

  // In development only: include the OTP in the response so the UI can display it as a toast.
  // In production this field is omitted and the code must be delivered via SMS.
  const devCode = process.env.NODE_ENV !== "production" ? code : undefined;
  res.json({ success: true, dev_code: devCode });
});

router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code required" });
    return;
  }

  const [otp] = await db
    .select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.phone, String(phone)),
        eq(otpCodesTable.code, String(code)),
        eq(otpCodesTable.verified, false),
        gt(otpCodesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!otp) {
    res.status(400).json({ error: "Invalid or expired code" });
    return;
  }

  await db.update(otpCodesTable).set({ verified: true }).where(eq(otpCodesTable.id, otp.id));

  const userId = `phone:${phone}`;

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const isNew = !profile;

  if (!profile) {
    [profile] = await db.insert(profilesTable).values({
      userId, phone: String(phone), language: "en", nationality: "egyptian",
    }).returning();
  }

  const token = generateToken();
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(phoneSessionsTable).values({ userId, token, expiresAt: sessionExpiry });

  res.json({ success: true, token, userId, isNew, profile });
});

router.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin authentication is not configured on this server" });
    return;
  }

  if (String(username).trim() !== ADMIN_USERNAME || String(password) !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const userId = `admin:${String(username).trim()}`;

  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (!profile) {
    [profile] = await db.insert(profilesTable).values({
      userId, phone: null, language: "en", nationality: "egyptian", displayName: "Admin",
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

  const token = generateToken();
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(phoneSessionsTable).values({ userId, token, expiresAt: sessionExpiry });

  res.json({ success: true, token, userId, isAdmin: true, profile });
});

router.get("/session", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No session" });
    return;
  }
  const token = authHeader.slice(7);

  const [session] = await db
    .select()
    .from(phoneSessionsTable)
    .where(and(eq(phoneSessionsTable.token, token), gt(phoneSessionsTable.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, session.userId)).limit(1);
  const [roleRow] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, session.userId), eq(userRolesTable.role, "admin")))
    .limit(1);

  res.json({ userId: session.userId, profile, isAdmin: !!roleRow });
});

router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(phoneSessionsTable).where(eq(phoneSessionsTable.token, token));
  }
  res.json({ success: true });
});

export default router;
