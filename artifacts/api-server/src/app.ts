import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middleware/auth";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required but was not provided.");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required but was not provided.");
}

// ── CORS origin resolution ────────────────────────────────────────────────────
// In production the panel is served from the same Express origin (no CORS
// needed). Set CORS_ORIGIN for split-origin setups (e.g. separate Vite dev
// server on a different port or domain, reverse-proxy staging environments).
// Fails closed when not set — same-origin requests always work without CORS.
function resolveAllowedOrigin(): string | false {
  const explicit = process.env.CORS_ORIGIN ?? process.env.PANEL_ORIGIN;
  if (explicit) return explicit;
  return false;
}

const ALLOWED_ORIGIN = resolveAllowedOrigin();
const PgSession = ConnectPgSimple(session);

const app: Express = express();

// Trust the first hop from the Replit deployment proxy so Express correctly
// detects TLS termination and marks session cookies secure in production.
// Without this, req.secure is always false behind the proxy and express-session
// refuses to issue the cookie when cookie.secure === true.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware backed by PostgreSQL — safe for autoscaling deployments.
app.use(
  session({
    store: new PgSession({
      conString: DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Require authentication for all /api routes except healthz + login.
// Placed before the API router so unauthenticated /api calls are rejected
// before any route handler runs.
app.use(requireAuth);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Panel static files (production) ──────────────────────────────────────────
// In production the panel is built into dist/public alongside this bundle.
// Serving it from the same Express origin eliminates CORS entirely — the
// browser's session cookie is always same-site and never needs SameSite=None.
// In development the Vite dev server (with its /api proxy) handles the panel.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panelPublicDir = path.resolve(__dirname, "public");

if (existsSync(panelPublicDir)) {
  // Serve hashed JS/CSS assets with long-lived caching
  app.use(
    express.static(panelPublicDir, {
      maxAge: "1y",
      immutable: true,
      index: false, // serve index.html explicitly via the SPA catch-all below
    }),
  );

  // SPA catch-all: return the panel's index.html for every non-API route so
  // client-side routing (wouter) works on hard refresh and direct URL access.
  // Express 5 requires {*splat} instead of bare * for catch-all patterns.
  app.get("{*splat}", (_req, res) => {
    res.sendFile(path.join(panelPublicDir, "index.html"));
  });
} else {
  logger.info(
    "dist/public not found — panel static files not available. " +
      "Run the production build to include the panel.",
  );
}

export default app;
