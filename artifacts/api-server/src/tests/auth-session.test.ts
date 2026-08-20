/**
 * Auth session integration tests.
 *
 * Covers secure-cookie behaviour when the request arrives forwarded through
 * the Replit deployment proxy (X-Forwarded-Proto: https).
 *
 * The app sets `trust proxy: 1`, so Express treats the forwarded request as
 * HTTPS and issues the session cookie with the Secure flag in production mode.
 */

import express, { type Request, type Response } from "express";
import session from "express-session";
import supertest from "supertest";

/**
 * Build a minimal Express app that mirrors the production session config used
 * in the real app, but with a trivially small cookie TTL and no DB store so
 * the test has no external dependencies.
 */
function buildTestApp({ trustProxy }: { trustProxy: boolean }) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);

  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-at-least-32-chars-long!!",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: true, // Production flag — only set cookie over HTTPS
        maxAge: 60_000,
      },
    }),
  );

  // Minimal login endpoint
  app.post("/login", (req: Request, res: Response) => {
    (req.session as unknown as Record<string, boolean>).authenticated = true;
    res.json({ ok: true });
  });

  // Protected endpoint
  app.get("/me", (req: Request, res: Response) => {
    const authenticated = (req.session as unknown as Record<string, boolean>).authenticated;
    if (authenticated) {
      res.json({ authenticated: true });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy trust + secure cookie tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Secure session cookie behind deployment proxy", () => {
  it("issues Set-Cookie with Secure flag when trust proxy is enabled and X-Forwarded-Proto: https", async () => {
    const app = buildTestApp({ trustProxy: true });

    const res = await supertest(app)
      .post("/login")
      // Simulate the Replit proxy forwarding an HTTPS request
      .set("X-Forwarded-Proto", "https")
      .send({ password: "anything" });

    expect(res.status).toBe(200);

    // express-session must have issued a Set-Cookie header
    const cookies: string | string[] = res.headers["set-cookie"] ?? [];
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];
    expect(cookieList.length).toBeGreaterThan(0);

    // The Secure flag must be present because the forwarded protocol is https
    const sessionCookie = cookieList.find((c: string) => c.includes("Secure"));
    expect(sessionCookie).toBeDefined();
  });

  it("does NOT issue a Secure cookie when trust proxy is disabled (regression guard)", async () => {
    const app = buildTestApp({ trustProxy: false });

    const res = await supertest(app)
      .post("/login")
      .set("X-Forwarded-Proto", "https") // proxy header is ignored when trust proxy is off
      .send({ password: "anything" });

    expect(res.status).toBe(200);

    // With trust proxy off the request is seen as plain HTTP, so no Secure cookie
    const cookies: string | string[] = res.headers["set-cookie"] ?? [];
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];
    // Either no cookie at all, or a cookie without the Secure flag
    const hasSecureCookie = cookieList.some((c: string) => c.includes("Secure"));
    expect(hasSecureCookie).toBe(false);
  });

  it("accepts the session on a follow-up request with the forwarded HTTPS cookie", async () => {
    const app = buildTestApp({ trustProxy: true });

    // Log in through the proxy; capture the Set-Cookie header
    const loginRes = await supertest(app)
      .post("/login")
      .set("X-Forwarded-Proto", "https")
      .send({ password: "anything" })
      .expect(200);

    // Extract the raw session cookie value to forward manually.
    // supertest.agent won't resend Secure cookies over plain HTTP, so we
    // simulate what the browser would do behind a TLS-terminating proxy:
    // forward the raw cookie in the Cookie header on the follow-up request.
    const rawCookies: string[] = Array.isArray(loginRes.headers["set-cookie"])
      ? (loginRes.headers["set-cookie"] as string[])
      : loginRes.headers["set-cookie"]
        ? [loginRes.headers["set-cookie"] as string]
        : [];

    expect(rawCookies.length).toBeGreaterThan(0);

    // Build a Cookie header from only the name=value parts (strip attributes)
    const cookieHeader = rawCookies
      .map((c: string) => c.split(";")[0].trim())
      .join("; ");

    // Simulate the next browser request arriving through the proxy
    const meRes = await supertest(app)
      .get("/me")
      .set("X-Forwarded-Proto", "https")
      .set("Cookie", cookieHeader);

    expect(meRes.status).toBe(200);
    expect(meRes.body.authenticated).toBe(true);
  });
});
