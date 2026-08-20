/**
 * Authentication routes.
 *
 * POST /api/auth/login   — validate password, create session
 * GET  /api/auth/me      — return session state
 * POST /api/auth/logout  — destroy session
 */

import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PANEL_PASSWORD = process.env.PANEL_PASSWORD ?? "";

if (!PANEL_PASSWORD) {
  logger.warn("PANEL_PASSWORD is not set. The control panel will reject all login attempts.");
}

/** POST /api/auth/login */
router.post("/auth/login", (req: Request, res: Response): void => {
  const { password } = req.body as { password?: string };

  if (!PANEL_PASSWORD) {
    res.status(503).json({ error: "PANEL_PASSWORD is not configured on the server." });
    return;
  }

  // Constant-time comparison to resist timing attacks
  if (!password || !timingSafeEqual(password, PANEL_PASSWORD)) {
    logger.warn({ ip: req.ip }, "Failed login attempt");
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  (req.session as { authenticated?: boolean }).authenticated = true;
  res.json({ ok: true });
});

/** GET /api/auth/me */
router.get("/auth/me", (req: Request, res: Response): void => {
  const session = req.session as { authenticated?: boolean };
  res.json({ authenticated: !!session.authenticated });
});

/** POST /api/auth/logout */
router.post("/auth/logout", (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

/**
 * Constant-time string comparison to prevent timing attacks.
 * (node:crypto timingSafeEqual requires same-length Buffers)
 */
function timingSafeEqual(a: string, b: string): boolean {
  const { timingSafeEqual: tse, createHash } = require("crypto") as typeof import("crypto");
  // Hash both sides to normalise length, then compare
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return tse(ha, hb);
}

export default router;
