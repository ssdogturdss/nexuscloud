import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sshKeysTable = pgTable("ssh_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSshKeySchema = createInsertSchema(sshKeysTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSshKey = z.infer<typeof insertSshKeySchema>;
export type SshKey = typeof sshKeysTable.$inferSelect;
