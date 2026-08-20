import app from "./app";
import { logger } from "./lib/logger";
import { seedOsImages } from "./lib/seed";
import { ensureTables } from "./lib/ensure-tables";
import { runMigrations } from "./lib/migrate";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Schema initialization (runs before accepting traffic) ─────────────────
// Versioned migrations run first. The idempotent bootstrap remains as a
// backward-compatible safety net for databases created before migrations.
try {
  await runMigrations();
  await ensureTables();
} catch (err) {
  logger.error({ err }, "Schema initialization failed — cannot start");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Seed OS image catalog on first run (idempotent — no-op if rows already exist)
  seedOsImages().catch((e) => logger.warn({ err: e }, "Seed failed"));
});
