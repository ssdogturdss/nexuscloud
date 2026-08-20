import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * Applies committed Drizzle migrations from the bundle's migrations directory.
 * Migrations are tracked in PostgreSQL's __drizzle_migrations table and are
 * therefore safe to run each time the server starts.
 */
export async function runMigrations(): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(currentDir, "migrations");

  await migrate(db, { migrationsFolder });
  logger.info("Database migrations verified / applied");
}