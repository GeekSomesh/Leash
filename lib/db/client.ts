// Opens the database once per process and applies migrations from ./drizzle.
//
//   DATABASE_URL set   -> Postgres (production on Render)
//   DATABASE_URL blank -> PGlite, an embedded Postgres stored in ./.data/pglite, so the app
//                         runs locally (and for judges) with no database to install.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = () => path.join(process.cwd(), "drizzle");

async function openPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: migrationsFolder() });
  return db as unknown as Db;
}

/** PGlite on disk, or in memory when `dataDir` is undefined (tests). */
export async function openPglite(dataDir: string | undefined): Promise<Db> {
  // PGlite creates its own directory but not missing parents (e.g. ./.data).
  if (dataDir) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder() });
  return db as unknown as Db;
}

const globalForDb = globalThis as typeof globalThis & { __leashDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__leashDb ??= (
    process.env.DATABASE_URL
      ? openPostgres(process.env.DATABASE_URL)
      : openPglite(process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"))
  ).catch((error) => {
    // Let the next request try again instead of caching the failure.
    globalForDb.__leashDb = undefined;
    throw error;
  });
  return globalForDb.__leashDb;
}

export function databaseKind(): "postgres" | "pglite" {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}
