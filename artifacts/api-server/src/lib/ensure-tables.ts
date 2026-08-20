/**
 * Idempotent schema initialization — runs `CREATE TABLE IF NOT EXISTS` for
 * every application table before the API starts accepting traffic.
 *
 * This replaces a versioned migration runner for a project that ships as a
 * single artifact and cannot assume the operator has run `drizzle-kit push`
 * beforehand. Every statement is idempotent; adding a column to an existing
 * table requires a separate ALTER, not a re-run of this function.
 *
 * Safe to run on every startup — no-ops when tables already exist.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── SSH keys ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ssh_keys (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        public_key  TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ── OS image catalog ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS os_images (
        id           SERIAL PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        version      TEXT NOT NULL,
        arch         TEXT NOT NULL DEFAULT 'x86_64',
        iso_path     TEXT,
        ssh_user     TEXT NOT NULL DEFAULT 'ubuntu',
        is_available BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // ── Virtual machines ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS vms (
        id                   SERIAL PRIMARY KEY,
        name                 TEXT NOT NULL,
        hostname             TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'provisioning',
        cpu_cores            INTEGER NOT NULL,
        ram_mb               INTEGER NOT NULL,
        disk_gb              INTEGER NOT NULL,
        ip_address           TEXT,
        os_image_id          INTEGER NOT NULL,
        os_image_name        TEXT NOT NULL,
        ssh_key_id           INTEGER,
        region               TEXT NOT NULL DEFAULT 'local',
        uptime_seconds       INTEGER,
        libvirt_domain       TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at           TIMESTAMPTZ,
        accumulated_seconds  INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ── Express session store (created by connect-pg-simple on first use,
    //    but we ensure it here for visibility and ordering guarantees) ────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     VARCHAR NOT NULL COLLATE "default",
        sess    JSON NOT NULL,
        expire  TIMESTAMPTZ NOT NULL,
        CONSTRAINT "sessions_pkey" PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON sessions (expire)
    `);

    await client.query("COMMIT");
    logger.info("Database tables verified / created");
  } catch (err) {
    await client.query("ROLLBACK");
    // Re-throw — the API should not start if the schema cannot be guaranteed
    throw err;
  } finally {
    client.release();
  }
}
