/**
 * Idempotent OS image seed.
 *
 * Runs once at API-server startup. If the os_images table is empty, it inserts
 * a set of well-known cloud images so the "Deploy Instance" wizard is never
 * empty on a fresh install.
 *
 * All seeded images default to isAvailable=false. The GET /api/images endpoint
 * reconciles availability with the Ubuntu agent and flips the flag to true once
 * an operator downloads the corresponding image file to ISO_DIR.
 *
 * Canonical download commands for Ubuntu 20.04 server (add to agent machine):
 *
 *   cd /var/lib/libvirt/images
 *
 *   # Ubuntu 22.04 LTS cloud image (~640MB)
 *   wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
 *
 *   # Ubuntu 20.04 LTS cloud image (~540MB)
 *   wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img
 *
 *   # Debian 12 cloud image (~300MB)
 *   wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2
 */

import { db, osImagesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const SEED_IMAGES = [
  {
    name: "Ubuntu 22.04 LTS",
    description: "Ubuntu Jammy cloud image — current LTS. Boot with SSH key injection via cloud-init.",
    version: "22.04",
    arch: "x86_64",
    isoPath: "/var/lib/libvirt/images/jammy-server-cloudimg-amd64.img",
    sshUser: "ubuntu",
    isAvailable: false,
  },
  {
    name: "Ubuntu 20.04 LTS",
    description: "Ubuntu Focal cloud image — proven LTS. Boot with SSH key injection via cloud-init.",
    version: "20.04",
    arch: "x86_64",
    isoPath: "/var/lib/libvirt/images/focal-server-cloudimg-amd64.img",
    sshUser: "ubuntu",
    isAvailable: false,
  },
  {
    name: "Debian 12 (Bookworm)",
    description: "Debian Bookworm cloud image — minimal and stable. Boots via cloud-init.",
    version: "12",
    arch: "x86_64",
    isoPath: "/var/lib/libvirt/images/debian-12-genericcloud-amd64.qcow2",
    sshUser: "debian",
    isAvailable: false,
  },
  {
    name: "AlmaLinux 9",
    description: "AlmaLinux 9 cloud image — RHEL-compatible. Boots via cloud-init.",
    version: "9",
    arch: "x86_64",
    isoPath: "/var/lib/libvirt/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2",
    sshUser: "almalinux",
    isAvailable: false,
  },
] as const;

export async function seedOsImages(): Promise<void> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(osImagesTable);

    if (count > 0) {
      logger.info({ count }, "OS image catalog already seeded — skipping");
      return;
    }

    await db.insert(osImagesTable).values(SEED_IMAGES.map((img) => ({ ...img })));
    logger.info({ count: SEED_IMAGES.length }, "Seeded OS image catalog");
  } catch (err) {
    // Non-fatal — warn and continue; the API still works without seed data
    logger.warn({ err }, "Could not seed OS images");
  }
}
