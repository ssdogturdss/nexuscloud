import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sshKeysTable } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

function fingerprintPublicKey(publicKey: string): string {
  try {
    // Remove the key type prefix and newlines, parse the base64 body
    const parts = publicKey.trim().split(/\s+/);
    if (parts.length < 2) return "unknown";
    const keyData = Buffer.from(parts[1], "base64");
    const hash = crypto.createHash("sha256").update(keyData).digest("base64");
    return `SHA256:${hash.replace(/=+$/, "")}`;
  } catch {
    return "unknown";
  }
}

/** GET /api/ssh-keys */
router.get("/ssh-keys", async (_req, res): Promise<void> => {
  const keys = await db.select().from(sshKeysTable).orderBy(sshKeysTable.createdAt);
  res.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      publicKey: k.publicKey,
      fingerprint: k.fingerprint,
      createdAt: k.createdAt.toISOString(),
    })),
  );
});

/** POST /api/ssh-keys */
router.post("/ssh-keys", async (req, res): Promise<void> => {
  const { name, publicKey } = req.body as { name: string; publicKey: string };

  if (!name || !publicKey) {
    res.status(400).json({ error: "name and publicKey are required" });
    return;
  }

  const fingerprint = fingerprintPublicKey(publicKey);

  const [key] = await db
    .insert(sshKeysTable)
    .values({ name, publicKey, fingerprint })
    .returning();

  res.status(201).json({
    id: key.id,
    name: key.name,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
    createdAt: key.createdAt.toISOString(),
  });
});

/** DELETE /api/ssh-keys/:id */
router.delete("/ssh-keys/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [key] = await db.delete(sshKeysTable).where(eq(sshKeysTable.id, id)).returning();
  if (!key) {
    res.status(404).json({ error: "SSH key not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
