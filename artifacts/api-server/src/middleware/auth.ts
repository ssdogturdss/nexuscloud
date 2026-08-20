/**
 * Panel authentication middleware.
 *
 * The control panel is protected by a single shared password stored in the
 * PANEL_PASSWORD environment variable. Users authenticate via
 * POST /api/auth/login; subsequent requests carry a signed session cookie.
 *
 * SESSION_SECRET is required for session signing.
 * PANEL_PASSWORD must also be set as an environment variable.
 *
 * Public routes (health, login) bypass this middleware.
 */

import type { Request, Response, NextFunction } from "express";

// Paths within /api that do not require a session
const PUBLIC_API_PATHS = new Set(["/healthz", "/auth/login"]);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Only apply auth gate to /api/* routes.
  // Static panel files (/, /assets/*, /index.html) must be served publicly
  // so unauthenticated users can load the React app and reach the login form.
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  // Strip the /api prefix when matching against the public path set
  const apiRelPath = req.path.slice("/api".length); // e.g. "/healthz" or "/auth/login"

  if (PUBLIC_API_PATHS.has(apiRelPath)) {
    next();
    return;
  }

  const session = req.session as { authenticated?: boolean } | undefined;
  if (session?.authenticated) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized. POST /api/auth/login to authenticate." });
}
