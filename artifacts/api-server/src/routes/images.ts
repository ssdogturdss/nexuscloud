import { Router, type IRouter } from "express";
import { db, osImagesTable } from "@workspace/db";
import { agentRequest, isAgentConfigured } from "../lib/agent";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

type DbImage = typeof osImagesTable.$inferSelect;
function formatImage(img: DbImage) {
  return {
    id: img.id,
    name: img.name,
    description: img.description,
    version: img.version,
    arch: img.arch,
    isoPath: img.isoPath ?? null,
    sshUser: img.sshUser,
    isAvailable: img.isAvailable,
  };
}

interface AgentImage {
  name: string;
  /** v1.1+ agents return imagePath; older agents returned isoPath */
  imagePath?: string;
  isoPath?: string;
  imageType?: "iso" | "cloud";
  description?: string;
  version?: string;
  arch?: string;
}

/** GET /api/images — merges DB catalog with agent availability */
router.get("/images", async (req, res): Promise<void> => {
  // Always return the DB catalog; try to enrich from agent
  const dbImages = await db.select().from(osImagesTable).orderBy(osImagesTable.id);

  if (isAgentConfigured()) {
    const agentResp = await agentRequest<{ images?: AgentImage[] }>("/images", {
      timeoutMs: 5000,
    });

    if (agentResp.ok && agentResp.data?.images) {
      const agentImages = agentResp.data.images;

      // Upsert agent images into the catalog
      // v1.1+ agents return imagePath; older agents returned isoPath
      for (const ai of agentImages) {
        const resolvedPath = ai.imagePath ?? ai.isoPath ?? null;
        const existing = dbImages.find((d) => d.isoPath === resolvedPath);
        if (!existing) {
          await db.insert(osImagesTable).values({
            name: ai.name,
            description: ai.description ?? "",
            version: ai.version ?? "unknown",
            arch: ai.arch ?? "x86_64",
            isoPath: resolvedPath,
            isAvailable: true,
          });
        } else {
          await db
            .update(osImagesTable)
            .set({ isAvailable: true })
            .where(eq(osImagesTable.id, existing.id));
        }
      }

      // Mark images not returned by agent as unavailable
      const agentPaths = new Set(agentImages.map((a) => a.imagePath ?? a.isoPath ?? ""));
      for (const d of dbImages) {
        if (d.isoPath && !agentPaths.has(d.isoPath)) {
          await db
            .update(osImagesTable)
            .set({ isAvailable: false })
            .where(eq(osImagesTable.id, d.id));
        }
      }

      // Re-fetch after sync
      const refreshed = await db.select().from(osImagesTable).orderBy(osImagesTable.id);
      res.json(refreshed.map(formatImage));
      return;
    }
  }

  res.json(dbImages.map(formatImage));
});

/** PATCH /api/images/:id — manually toggle availability */
router.patch("/images/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid image id" });
    return;
  }
  const { isAvailable } = req.body as { isAvailable?: boolean };
  if (typeof isAvailable !== "boolean") {
    res.status(400).json({ error: "isAvailable (boolean) is required" });
    return;
  }

  const [updated] = await db
    .update(osImagesTable)
    .set({ isAvailable })
    .where(eq(osImagesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json(formatImage(updated));
});

export default router;
