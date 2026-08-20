import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const osImagesTable = pgTable("os_images", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  version: text("version").notNull(),
  arch: text("arch").notNull().default("x86_64"),
  isoPath: text("iso_path"),
  /** Default SSH login user for cloud images (e.g. "ubuntu", "debian", "almalinux") */
  sshUser: text("ssh_user").notNull().default("ubuntu"),
  isAvailable: boolean("is_available").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOsImageSchema = createInsertSchema(osImagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOsImage = z.infer<typeof insertOsImageSchema>;
export type OsImage = typeof osImagesTable.$inferSelect;
