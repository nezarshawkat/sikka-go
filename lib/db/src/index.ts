import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const override = process.env.DATABASE_URL_OVERRIDE?.trim();
const connectionString = override || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string found. Set DATABASE_URL_OVERRIDE (preferred, e.g. external Neon) or DATABASE_URL (Replit built-in DB).",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
