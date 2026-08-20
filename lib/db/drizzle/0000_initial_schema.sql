CREATE TABLE IF NOT EXISTS "ssh_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "public_key" text NOT NULL,
  "fingerprint" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "os_images" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "version" text NOT NULL,
  "arch" text DEFAULT 'x86_64' NOT NULL,
  "iso_path" text,
  "ssh_user" text DEFAULT 'ubuntu' NOT NULL,
  "is_available" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vms" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "hostname" text NOT NULL,
  "status" text DEFAULT 'provisioning' NOT NULL,
  "cpu_cores" integer NOT NULL,
  "ram_mb" integer NOT NULL,
  "disk_gb" integer NOT NULL,
  "ip_address" text,
  "os_image_id" integer NOT NULL,
  "os_image_name" text NOT NULL,
  "ssh_key_id" integer,
  "region" text DEFAULT 'local' NOT NULL,
  "uptime_seconds" integer,
  "libvirt_domain" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "accumulated_seconds" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" varchar PRIMARY KEY NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");