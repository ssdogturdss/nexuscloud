import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vmsTable = pgTable("vms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  status: text("status").notNull().default("provisioning"), // provisioning | running | stopped | error | deleted
  cpuCores: integer("cpu_cores").notNull(),
  ramMb: integer("ram_mb").notNull(),
  diskGb: integer("disk_gb").notNull(),
  ipAddress: text("ip_address"),
  osImageId: integer("os_image_id").notNull(),
  osImageName: text("os_image_name").notNull(),
  sshKeyId: integer("ssh_key_id"),
  region: text("region").notNull().default("local"),
  uptimeSeconds: integer("uptime_seconds"),
  // libvirt domain name used to talk to virsh
  libvirtDomain: text("libvirt_domain"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // When the VM last transitioned to "running" — used for billing
  startedAt: timestamp("started_at", { withTimezone: true }),
  // Accumulated running seconds before current session
  accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
});

export const insertVmSchema = createInsertSchema(vmsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVm = z.infer<typeof insertVmSchema>;
export type Vm = typeof vmsTable.$inferSelect;
