import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, vmsTable, osImagesTable, sshKeysTable } from "@workspace/db";
import { agentRequest, isAgentConfigured } from "../lib/agent";
import { calcRunningSeconds } from "../lib/billing";

const router: IRouter = Router();

/**
 * Map an OS image name + version to the correct virt-install --os-variant
 * string. Values must exist in the osinfo-db shipped with Ubuntu 20.04.
 * Falls back to "ubuntu20.04" (a safe, widely-supported guest config)
 * for unrecognized images.
 */
function deriveOsVariant(imageName: string, version?: string | null): string {
  const name = (imageName ?? "").toLowerCase();
  const ver  = version ?? "";
  if (name.includes("ubuntu")) {
    // Major.minor from version string, e.g. "22.04" -> "ubuntu22.04"
    const parts = ver.match(/^(\d+\.\d+)/);
    if (parts) return `ubuntu${parts[1]}`;
    return "ubuntu20.04";
  }
  if (name.includes("debian")) {
    const major = ver.match(/^(\d+)/);
    if (major) return `debian${major[1]}`;
    return "debiantesting";
  }
  if (name.includes("alma") || name.includes("almalinux")) {
    const major = ver.match(/^(\d+)/);
    if (major) return `almalinux${major[1]}`;
    return "almalinux9";
  }
  if (name.includes("centos")) {
    const major = ver.match(/^(\d+)/);
    if (major) return `centos${major[1]}.0`;
    return "centos8";
  }
  if (name.includes("fedora")) {
    const major = ver.match(/^(\d+)/);
    if (major) return `fedora${major[1]}`;
  }
  // Generic fallback — widely supported by all osinfo-db versions
  return "ubuntu20.04";
}

function formatVm(vm: typeof vmsTable.$inferSelect & { osImageName?: string }) {
  return {
    id: vm.id,
    name: vm.name,
    hostname: vm.hostname,
    status: vm.status,
    cpuCores: vm.cpuCores,
    ramMb: vm.ramMb,
    diskGb: vm.diskGb,
    ipAddress: vm.ipAddress ?? null,
    osImageId: vm.osImageId,
    osImageName: vm.osImageName ?? "",
    sshKeyId: vm.sshKeyId ?? null,
    region: vm.region,
    uptimeSeconds: calcRunningSeconds(vm),
    createdAt: vm.createdAt.toISOString(),
    updatedAt: vm.updatedAt.toISOString(),
  };
}

/** GET /api/vms */
router.get("/vms", async (_req, res): Promise<void> => {
  const vms = await db.select().from(vmsTable).where(sql`${vmsTable.status} != 'deleted'`);
  res.json(vms.map(formatVm));
});

/** GET /api/vms/summary */
router.get("/vms/summary", async (_req, res): Promise<void> => {
  const vms = await db.select().from(vmsTable).where(sql`${vmsTable.status} != 'deleted'`);

  const running = vms.filter((v) => v.status === "running");
  const stopped = vms.filter((v) => v.status === "stopped");

  res.json({
    totalVms: vms.length,
    runningVms: running.length,
    stoppedVms: stopped.length,
    totalCpuCores: vms.reduce((s, v) => s + v.cpuCores, 0),
    totalRamMb: vms.reduce((s, v) => s + v.ramMb, 0),
    totalDiskGb: vms.reduce((s, v) => s + v.diskGb, 0),
    agentConnected: isAgentConfigured(),
  });
});

/** POST /api/vms */
router.post("/vms", async (req, res): Promise<void> => {
  // ── Require a connected agent before accepting provisioning requests ──────
  // Without an agent we cannot create a real VM; returning 201 with a
  // provisioning record that can never progress is misleading.
  if (!isAgentConfigured()) {
    res.status(503).json({
      error: "The hypervisor agent is not configured. " +
             "Set AGENT_URL and AGENT_SECRET in Replit Secrets, then restart the API server.",
    });
    return;
  }

  const { name, hostname, cpuCores, ramMb, diskGb, osImageId, sshKeyId } = req.body as {
    name: string;
    hostname: string;
    cpuCores: number;
    ramMb: number;
    diskGb: number;
    osImageId: number;
    sshKeyId?: number | null;
  };

  // ── Input validation ──────────────────────────────────────────────────────
  if (!name || !hostname || !cpuCores || !ramMb || !diskGb || !osImageId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _\-]{0,62}$/.test(name)) {
    res.status(400).json({ error: "name: letters, digits, spaces, hyphens, underscores only (1-63 chars)" });
    return;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/.test(hostname)) {
    res.status(400).json({ error: "hostname: must be a valid hostname (letters, digits, hyphens, dots)" });
    return;
  }
  if (!Number.isInteger(cpuCores) || cpuCores < 1 || cpuCores > 128) {
    res.status(400).json({ error: "cpuCores must be an integer between 1 and 128" });
    return;
  }
  if (!Number.isInteger(ramMb) || ramMb < 512 || ramMb > 524288) {
    res.status(400).json({ error: "ramMb must be an integer between 512 and 524288" });
    return;
  }
  if (!Number.isInteger(diskGb) || diskGb < 1 || diskGb > 10000) {
    res.status(400).json({ error: "diskGb must be an integer between 1 and 10000" });
    return;
  }

  // Look up OS image — must exist and be marked available on the hypervisor
  const [image] = await db.select().from(osImagesTable).where(eq(osImagesTable.id, osImageId));
  if (!image) {
    res.status(400).json({ error: "OS image not found" });
    return;
  }
  if (!image.isAvailable) {
    res.status(409).json({
      error: `OS image "${image.name}" is not yet available on the hypervisor. ` +
             "Download the image to the hypervisor and mark it available before provisioning.",
    });
    return;
  }

  // Cloud images (.img, .qcow2) require an SSH key — without one there is no
  // way to log into the provisioned VM (no password is set by default).
  const isoPathStr = image.isoPath ?? "";
  const isCloudImage = isoPathStr.endsWith(".img") || isoPathStr.endsWith(".qcow2");
  if (isCloudImage && !sshKeyId) {
    res.status(400).json({
      error: "An SSH key is required when provisioning cloud images (.img/.qcow2). " +
             "Add an SSH key under SSH Keys, then select it in the Deploy wizard.",
    });
    return;
  }

  // Look up SSH key if provided
  let sshKeyPublic: string | undefined;
  if (sshKeyId) {
    const [key] = await db.select().from(sshKeysTable).where(eq(sshKeysTable.id, sshKeyId));
    if (!key) {
      res.status(400).json({ error: "SSH key not found" });
      return;
    }
    sshKeyPublic = key.publicKey;
  }

  // ── Derive and persist libvirtDomain BEFORE dispatching to agent ──────────
  // Domain names must match /^[a-zA-Z0-9][a-zA-Z0-9_\-]{0,62}$/.
  // We insert a placeholder row first, use its auto-assigned id in the domain
  // name, then persist the domain. This ensures:
  //   (a) power/delete routes can always find the domain even if the
  //       background create response hasn't arrived yet
  //   (b) no window exists where a racing delete or power request could
  //       reference a domain-less VM and skip the agent call
  const safeHostnamePart = hostname
    .replace(/[^a-zA-Z0-9\-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "host";

  const [vm] = await db
    .insert(vmsTable)
    .values({
      name,
      hostname,
      cpuCores,
      ramMb,
      diskGb,
      osImageId,
      osImageName: image.name,
      sshKeyId: sshKeyId ?? null,
      status: "provisioning",
      region: "local",
    })
    .returning();

  const libvirtDomain = `vm${vm.id}-${safeHostnamePart}`;

  // Persist the domain immediately so all subsequent operations can find it
  await db
    .update(vmsTable)
    .set({ libvirtDomain })
    .where(eq(vmsTable.id, vm.id));

  // ── Dispatch provisioning to agent asynchronously ─────────────────────────
  // VM creation can take 60–180 seconds (qemu-img + virt-install). We respond
  // with 201/provisioning immediately and update the status in the background.
  const isoPath = image.isoPath ?? "";
  const imageType = (isoPath.endsWith(".img") || isoPath.endsWith(".qcow2")) ? "cloud" : "iso";

  // Map the OS image to the correct virt-install --os-variant value so KVM
  // can apply the right machine/driver optimisations for each guest OS.
  // Values must exist in the osinfo-db version shipped with Ubuntu 20.04.
  const osVariant = deriveOsVariant(image.name, image.version);

  // VM provisioning via virt-install can take 60–180 seconds on the agent.
  // The API timeout must safely exceed the agent's maximum (180 s) so the
  // caller never abandons a still-running create and marks it as failed while
  // a real VM continues to be created on the hypervisor.
  // 300 s (5 min) gives a 120 s margin above the agent's own timeout.
  agentRequest("/vms/create", {
    method: "POST",
    timeoutMs: 300_000,
    body: {
      id: vm.id,
      hostname,
      cpuCores,
      ramMb,
      diskGb,
      isoPath,
      imageType,
      osVariant,
      sshPublicKey: sshKeyPublic,
      domain: libvirtDomain,
    },
  }).then(async (resp) => {
    if (resp.ok) {
      // Agent confirmed the VM was created and is running — flip to running
      // so the operator can immediately issue power/destroy commands without
      // needing a manual sync call first.
      await db
        .update(vmsTable)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(vmsTable.id, vm.id));
    } else {
      await db.update(vmsTable).set({ status: "error" }).where(eq(vmsTable.id, vm.id));
    }
  }).catch(async () => {
    await db.update(vmsTable).set({ status: "error" }).where(eq(vmsTable.id, vm.id));
  });

  res.status(201).json(formatVm({ ...vm, libvirtDomain, osImageName: image.name }));
});

/** GET /api/vms/:id */
router.get("/vms/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  if (!vm || vm.status === "deleted") { res.status(404).json({ error: "VM not found" }); return; }

  res.json(formatVm(vm));
});

/** DELETE /api/vms/:id */
router.delete("/vms/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  if (!vm || vm.status === "deleted") { res.status(404).json({ error: "VM not found" }); return; }

  // Guard: cannot destroy a VM that is still provisioning — the agent create
  // call is in-flight and may produce a real domain after the delete returns.
  if (vm.status === "provisioning") {
    res.status(409).json({
      error: "Cannot destroy a VM that is still provisioning. " +
             "Wait for it to reach running/error state, then retry.",
    });
    return;
  }

  // Destroy is a destructive operation — wait for the agent to confirm.
  // libvirtDomain is now always set before the background create fires,
  // so this check is reliable.
  if (isAgentConfigured() && vm.libvirtDomain) {
    const agentResp = await agentRequest("/vms/destroy", {
      method: "POST",
      body: { domain: vm.libvirtDomain },
    });
    if (!agentResp.ok) {
      res.status(502).json({
        error: `Agent failed to destroy the VM: ${agentResp.status ?? "unreachable"}. ` +
               "The VM record has not been removed. Check agent connectivity and try again.",
      });
      return;
    }
  }
  // If agent is not configured, or VM was never given a domain, remove DB only.

  await db.update(vmsTable).set({ status: "deleted" }).where(eq(vmsTable.id, id));
  res.sendStatus(204);
});

/** POST /api/vms/:id/power */
router.post("/vms/:id/power", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { action } = req.body as { action: "start" | "stop" | "reboot" };
  if (!["start", "stop", "reboot"].includes(action)) {
    res.status(400).json({ error: "Invalid action" });
    return;
  }

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  if (!vm || vm.status === "deleted") { res.status(404).json({ error: "VM not found" }); return; }

  // Guard: power actions on a provisioning VM are unsafe — the domain may not
  // exist yet on the hypervisor even though libvirtDomain is persisted.
  if (vm.status === "provisioning") {
    res.status(409).json({
      error: "Cannot ${action} a VM that is still provisioning. " +
             "Wait for it to reach running/stopped state, then retry.",
    });
    return;
  }

  let newStatus: string = vm.status;
  let startedAt: Date | null = vm.startedAt;
  let accumulatedSeconds = vm.accumulatedSeconds;

  if (action === "start") {
    newStatus = "running";
    if (!startedAt) startedAt = new Date();
  } else if (action === "stop") {
    if (vm.status === "running" && vm.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(vm.startedAt).getTime()) / 1000);
      accumulatedSeconds += elapsed;
    }
    newStatus = "stopped";
    startedAt = null;
  } else if (action === "reboot") {
    newStatus = "running";
    if (!startedAt) startedAt = new Date();
  }

  // Synchronous agent call — update DB only after the hypervisor confirms.
  if (isAgentConfigured() && vm.libvirtDomain) {
    const agentResp = await agentRequest(`/vms/${action}`, {
      method: "POST",
      body: { domain: vm.libvirtDomain },
    });
    if (!agentResp.ok) {
      res.status(502).json({
        error: `Agent failed to ${action} the VM: ${agentResp.status ?? "unreachable"}. ` +
               "No state change was made. Check agent connectivity and try again.",
      });
      return;
    }
  }
  // If agent is not configured, allow optimistic status update so operators
  // can manage records before connecting the Ubuntu server.

  const [updated] = await db
    .update(vmsTable)
    .set({ status: newStatus, startedAt, accumulatedSeconds })
    .where(eq(vmsTable.id, id))
    .returning();

  res.json(formatVm(updated));
});

/** POST /api/vms/:id/sync */
router.post("/vms/:id/sync", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vm] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  if (!vm || vm.status === "deleted") { res.status(404).json({ error: "VM not found" }); return; }

  if (isAgentConfigured() && vm.libvirtDomain) {
    const agentResp = await agentRequest<{
      status?: string;
      ipAddress?: string;
      uptimeSeconds?: number;
    }>(`/vms/info/${vm.libvirtDomain}`, { method: "GET" });

    if (agentResp.ok && agentResp.data) {
      const { status, ipAddress } = agentResp.data;
      const updates: Partial<typeof vmsTable.$inferInsert> = {};

      if (status) {
        updates.status = status;
        if (status === "running" && !vm.startedAt) {
          updates.startedAt = new Date();
        } else if (status !== "running") {
          updates.startedAt = null;
        }
      }
      if (ipAddress) updates.ipAddress = ipAddress;

      await db.update(vmsTable).set(updates).where(eq(vmsTable.id, id));
    }
  }

  const [updated] = await db.select().from(vmsTable).where(eq(vmsTable.id, id));
  res.json(formatVm(updated));
});

export default router;
