#!/usr/bin/env node
/**
 * KVM Cloud Provider — Ubuntu Server Agent
 *
 * Runs on the Ubuntu 20.04 machine that hosts the KVM hypervisor.
 * Exposes a local HTTP API that the Replit control panel calls through
 * a Cloudflare Tunnel.
 *
 * Requirements (installed by install-agent.sh):
 *   - qemu-kvm, libvirt-daemon-system, virtinst, bridge-utils, genisoimage
 *   - Node.js 20+
 *   - cloudflared (for the tunnel)
 *
 * Environment variables:
 *   AGENT_SECRET   — REQUIRED. Shared secret; must match AGENT_SECRET in Replit.
 *                    The agent refuses to start without this value.
 *   AGENT_PORT     — Port to listen on (default: 3001)
 *   ISO_DIR        — Directory to scan for images (default: /var/lib/libvirt/images)
 *   VM_DISK_DIR    — Directory for VM disk images (default: /var/lib/libvirt/images)
 */

"use strict";

const http      = require("http");
const { execFile } = require("child_process");
const { promisify }  = require("util");
const fs        = require("fs");
const path      = require("path");
const os        = require("os");

const execFileAsync = promisify(execFile);

// ─── Configuration ────────────────────────────────────────────────────────────

const AGENT_SECRET = process.env.AGENT_SECRET || "";
const PORT        = parseInt(process.env.AGENT_PORT  || "3001", 10);
// Base cloud/ISO images that can be provisioned — scanned for image discovery.
const ISO_DIR     = path.resolve(process.env.ISO_DIR     || "/var/lib/libvirt/images");
// Per-VM qcow2 overlay disks — kept in a SEPARATE directory from ISO_DIR so
// that VM overlays are never listed as selectable base images.  Mixing them
// would expose one VM's filesystem as a backing image for another.
const VM_DISK_DIR = path.resolve(process.env.VM_DISK_DIR || "/var/lib/libvirt/vms");
const VERSION     = "1.1.0";

// ─── Startup guard ────────────────────────────────────────────────────────────

if (!AGENT_SECRET) {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(), level: "fatal",
    msg: "AGENT_SECRET environment variable is not set. Refusing to start without a secret.",
  }) + "\n");
  process.exit(1);
}

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * Libvirt domain names: letters, digits, hyphens, underscores; 1-63 chars.
 * We are strict here to prevent any shell metacharacter injection even
 * though we no longer build shell strings.
 */
const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-]{0,62}$/;

function validateDomain(domain) {
  return typeof domain === "string" && DOMAIN_RE.test(domain);
}

/**
 * Validate and return an --os-variant value for virt-install.
 * Only allow values that consist of safe alphanumeric characters and dots
 * to prevent any injection through the argument array.
 * Falls back to "ubuntu20.04" for unknown or empty values.
 */
const OS_VARIANT_RE = /^[a-z0-9.]+$/;
function resolveOsVariant(variant) {
  if (typeof variant === "string" && OS_VARIANT_RE.test(variant) && variant.length <= 32) {
    return variant;
  }
  return "ubuntu20.04";
}

/**
 * Resolve a caller-supplied path and confirm it stays inside an allowed
 * base directory.  Throws on path-traversal attempts.
 */
function resolveWithin(filePath, baseDir) {
  const abs  = path.resolve(filePath);
  const base = path.resolve(baseDir);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error(`Path traversal rejected: ${filePath}`);
  }
  return abs;
}

/**
 * Validate a caller-supplied image path against ISO_DIR.
 * Returns the resolved absolute path or throws.
 */
function validateImagePath(isoPath) {
  if (typeof isoPath !== "string" || !isoPath) {
    throw new Error("isoPath is required");
  }
  return resolveWithin(isoPath, ISO_DIR);
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level, msg, extra) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n");
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(body),
    // No CORS headers — this server must never be reached directly from a
    // browser; it is only callable via the Cloudflare Tunnel by the API server.
  });
  res.end(body);
}

function checkAuth(req, res) {
  // AGENT_SECRET is guaranteed non-empty (startup guard above).
  const provided = req.headers["x-agent-secret"];
  if (provided !== AGENT_SECRET) {
    respond(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

// ─── virsh / qemu helpers (argument arrays — no shell interpolation) ──────────

async function virsh(...args) {
  const { stdout, stderr } = await execFileAsync("virsh", args);
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function domainExists(domain) {
  try { await virsh("dominfo", domain); return true; }
  catch { return false; }
}

async function getDomainStatus(domain) {
  try {
    const { stdout } = await virsh("domstate", domain);
    const s = stdout.toLowerCase();
    if (s.includes("running"))              return "running";
    if (s.includes("shut off") || s.includes("shutoff") || s.includes("paused")) return "stopped";
    return "stopped";
  } catch { return "error"; }
}

async function getDomainIP(domain) {
  // Try guest agent first (requires qemu-guest-agent in the VM)
  try {
    const { stdout } = await virsh("domifaddr", domain, "--source", "agent");
    const match = stdout.match(/ipv4\s+([\d.]+)\//);
    if (match) return match[1];
  } catch {}
  // Fall back to DHCP lease table
  try {
    const { stdout } = await virsh("net-dhcp-leases", "default");
    for (const line of stdout.split("\n")) {
      // Match lines that contain the first 8 chars of the domain name
      if (line.toLowerCase().includes(domain.substring(0, 8).toLowerCase())) {
        const ipPart = line.trim().split(/\s+/).find((p) => p.includes("/"));
        if (ipPart) return ipPart.split("/")[0];
      }
    }
  } catch {}
  return null;
}

// ─── Route handlers ────────────────────────────────────────────────────────────

async function handleInfo(_req, res) {
  const cpus     = os.cpus().length;
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem  = Math.round(os.freemem()  / 1024 / 1024);
  respond(res, 200, {
    version: VERSION,
    hostInfo: `${os.hostname()} — ${cpus} CPUs, ${totalMem}MB RAM (${freeMem}MB free), ${os.platform()} ${os.release()}`,
  });
}

/**
 * List available OS images from ISO_DIR.
 * Supports both .iso installer images and .img cloud images.
 * imageType is "iso" or "cloud" so the provisioner knows how to boot.
 */
async function handleListImages(_req, res) {
  const images = [];
  try {
    const files = fs.readdirSync(ISO_DIR);
    for (const file of files) {
      const isIso   = file.endsWith(".iso");
      const isCloud = file.endsWith(".img") || file.endsWith(".qcow2");
      if (!isIso && !isCloud) continue;

      const imagePath = path.join(ISO_DIR, file);
      const baseName  = file.replace(/\.(iso|img|qcow2)$/, "");
      images.push({
        name:        baseName,
        imagePath,
        imageType:   isIso ? "iso" : "cloud",
        description: isIso
          ? `Installer ISO: ${file}`
          : `Cloud image: ${file}`,
        version: baseName.split("-").slice(-1)[0] || "unknown",
        arch:    file.includes("arm") || file.includes("aarch64") ? "aarch64" : "x86_64",
      });
    }
  } catch (err) {
    log("warn", "Could not scan ISO_DIR", { dir: ISO_DIR, err: err.message });
  }
  respond(res, 200, { images });
}

/**
 * Provision a new VM.
 *
 * Cloud images (.img / .qcow2):
 *   - Back from the base image with copy-on-write via qemu-img create -b
 *   - Boot with --import (no installer needed)
 *   - Optionally attach a cloud-init CDROM for SSH key injection
 *
 * Installer ISOs (.iso):
 *   - Create a fresh blank qcow2 disk
 *   - Boot from the ISO via --cdrom (unattended only with a pre-seeded ISO)
 */
async function handleCreateVm(_req, res, body) {
  const { hostname, cpuCores, ramMb, diskGb, isoPath, imageType, sshPublicKey, domain, osVariant } = body;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!validateDomain(domain)) {
    respond(res, 400, { error: "Invalid domain name. Only letters, digits, hyphens, underscores; 1-63 chars." });
    return;
  }
  if (typeof hostname !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/.test(hostname)) {
    respond(res, 400, { error: "Invalid hostname" });
    return;
  }
  const cores = parseInt(cpuCores, 10);
  const ram   = parseInt(ramMb,    10);
  const disk  = parseInt(diskGb,   10);
  if (!Number.isFinite(cores) || cores < 1 || cores > 128) {
    respond(res, 400, { error: "cpuCores must be 1-128" });
    return;
  }
  if (!Number.isFinite(ram) || ram < 512 || ram > 524288) {
    respond(res, 400, { error: "ramMb must be 512-524288" });
    return;
  }
  if (!Number.isFinite(disk) || disk < 1 || disk > 10000) {
    respond(res, 400, { error: "diskGb must be 1-10000" });
    return;
  }

  // Validate the source image path is inside ISO_DIR
  let resolvedImagePath;
  try {
    resolvedImagePath = validateImagePath(isoPath);
  } catch (err) {
    respond(res, 400, { error: err.message });
    return;
  }
  if (!fs.existsSync(resolvedImagePath)) {
    respond(res, 400, { error: `Image file not found: ${resolvedImagePath}` });
    return;
  }

  const diskPath = resolveWithin(path.join(VM_DISK_DIR, `${domain}.qcow2`), VM_DISK_DIR);
  const isCloud  = imageType === "cloud" || resolvedImagePath.endsWith(".img") || resolvedImagePath.endsWith(".qcow2");

  // ── Validate SSH key BEFORE any disk/domain side-effect ──────────────────
  // This must happen first so a malformed key never leaves an orphaned overlay.
  let ciDir = null;
  if (isCloud && sshPublicKey && typeof sshPublicKey === "string") {
    if (!/^[a-zA-Z0-9+/=@:. _\-]+$/.test(sshPublicKey.replace(/\s/g, " ").trim())) {
      respond(res, 400, { error: "SSH public key contains invalid characters" });
      return;
    }
  }

  // ── Cleanup helper — removes all side-effects of a failed create ─────────
  async function cleanupCreate() {
    // Remove overlay disk (if created)
    try { if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath); } catch {}
    // Remove cloud-init directory / ISO (if created)
    try { if (ciDir && fs.existsSync(ciDir)) fs.rmSync(ciDir, { recursive: true, force: true }); } catch {}
    // Undefine any partially-registered libvirt domain without removing storage
    // (storage was already removed above; --remove-all-storage would be a no-op
    //  but we avoid it in case another disk is accidentally attached)
    try { await execFileAsync("virsh", ["undefine", domain]); } catch {}
  }

  try {
    // ── Create disk ──────────────────────────────────────────────────────────
    if (isCloud) {
      // Detect the actual format and virtual size of the backing image.
      // Ubuntu cloud images (.img) are typically raw; Debian/AlmaLinux (.qcow2) are qcow2.
      // Hardcoding -F qcow2 fails for raw inputs.
      // The virtual-size check prevents qemu-img create from failing when the
      // requested disk is smaller than the backing image's own virtual size.
      let backingFormat = "raw"; // safe default for .img files
      let backingVirtualSizeBytes = 0;
      try {
        const { stdout: infoOut } = await execFileAsync("qemu-img", [
          "info", "--output=json", resolvedImagePath,
        ]);
        const imgInfo = JSON.parse(infoOut);
        if (typeof imgInfo["format"] === "string" && imgInfo["format"]) {
          backingFormat = imgInfo["format"];
        }
        if (typeof imgInfo["virtual-size"] === "number") {
          backingVirtualSizeBytes = imgInfo["virtual-size"];
        }
      } catch (err) {
        log("warn", "Could not detect image format/size; using defaults", { err: err.message });
      }

      // Ensure the overlay virtual size is at least as large as the backing image.
      // Users may select a disk smaller than the cloud image (e.g. 20 GB for a
      // 25 GB Ubuntu image), which qemu-img rejects.  We promote silently.
      const requestedBytes = disk * 1024 * 1024 * 1024;
      const effectiveSizeBytes = Math.max(requestedBytes, backingVirtualSizeBytes);
      const effectiveSizeG = Math.ceil(effectiveSizeBytes / (1024 * 1024 * 1024));
      if (effectiveSizeG !== disk) {
        log("info", "Overlay size promoted to match backing image virtual size",
          { requestedGb: disk, effectiveGb: effectiveSizeG });
      }

      // Thin-clone the cloud image as a copy-on-write overlay
      await execFileAsync("qemu-img", [
        "create", "-f", "qcow2",
        "-b", resolvedImagePath,
        "-F", backingFormat,
        diskPath,
        `${effectiveSizeG}G`,
      ]);
    } else {
      // Fresh blank disk for installer ISOs
      await execFileAsync("qemu-img", ["create", "-f", "qcow2", diskPath, `${disk}G`]);
    }

    // ── Build virt-install argument array (no shell interpolation) ────────────
    const args = [
      "--name",     domain,
      "--memory",   String(ram),
      "--vcpus",    String(cores),
      "--disk",     `path=${diskPath},format=qcow2`,
      "--network",  "network=default",
      "--graphics", "none",
      "--console",  "pty,target_type=serial",
      "--os-variant", resolveOsVariant(osVariant),
      "--noautoconsole",
    ];

    if (isCloud) {
      args.push("--import");
    } else {
      // Installer ISO as CDROM
      args.push("--cdrom", resolvedImagePath);
    }

    // ── Cloud-init for SSH key injection (cloud images only) ─────────────────
    // Key character validation was already done above (before disk creation).
    if (isCloud && sshPublicKey && typeof sshPublicKey === "string") {
      ciDir = path.join(os.tmpdir(), `cloud-init-${domain}`);
      const ciIso    = path.join(ciDir, "cloud-init.iso");
      const userData = path.join(ciDir, "user-data");
      const metaData = path.join(ciDir, "meta-data");

      fs.mkdirSync(ciDir, { recursive: true });
      // Write files directly — no shell interpolation
      fs.writeFileSync(userData,
        `#cloud-config\nssh_authorized_keys:\n  - ${sshPublicKey.trim()}\n`);
      fs.writeFileSync(metaData,
        `instance-id: ${domain}\nlocal-hostname: ${hostname}\n`);

      // genisoimage failure is FATAL for cloud images — without it the SSH key
      // is not injected and the VM would be inaccessible.  Callers must ensure
      // genisoimage is installed (it is listed as a requirement in the README).
      await execFileAsync("genisoimage", [
        "-output", ciIso,
        "-volid",  "cidata",
        "-joliet", "-rock",
        userData, metaData,
      ]);
      args.push("--disk", `${ciIso},device=cdrom`);
    }

    log("info", "Creating VM", { domain, args });
    await execFileAsync("virt-install", args, { timeout: 180_000 });

    respond(res, 200, { ok: true, domain });
  } catch (err) {
    log("error", "Failed to create VM — cleaning up", { domain, err: err.message });
    // Remove any partial state so a subsequent retry starts clean
    await cleanupCreate();
    respond(res, 500, { error: err.message });
  }
}

async function handlePowerAction(_req, res, body, action) {
  const { domain } = body;
  if (!validateDomain(domain)) {
    respond(res, 400, { error: "Invalid domain name" });
    return;
  }
  try {
    if      (action === "start")  await virsh("start",    domain);
    else if (action === "reboot") await virsh("reboot",   domain);
    else if (action === "stop") {
      try { await virsh("shutdown", domain); }
      catch { await virsh("destroy",  domain); }
    }
    respond(res, 200, { ok: true, domain, action });
  } catch (err) {
    respond(res, 500, { error: err.message });
  }
}

async function handleDestroyVm(_req, res, body) {
  const { domain } = body;
  if (!validateDomain(domain)) {
    respond(res, 400, { error: "Invalid domain name" });
    return;
  }
  try {
    try { await virsh("destroy", domain); } catch {}
    await virsh("undefine", domain, "--remove-all-storage");
    respond(res, 200, { ok: true });
  } catch (err) {
    respond(res, 500, { error: err.message });
  }
}

async function handleVmInfo(_req, res, domain) {
  if (!validateDomain(domain)) {
    respond(res, 400, { error: "Invalid domain name" });
    return;
  }
  try {
    const status    = await getDomainStatus(domain);
    const ipAddress = status === "running" ? await getDomainIP(domain) : null;
    respond(res, 200, { status, ipAddress });
  } catch (err) {
    respond(res, 500, { error: err.message });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // No CORS headers — this server is not meant to be called from browsers.

  if (!checkAuth(req, res)) return;

  const url = req.url || "/";

  try {
    if      (req.method === "GET"  && url === "/info")         await handleInfo(req, res);
    else if (req.method === "GET"  && url === "/images")       await handleListImages(req, res);
    else if (req.method === "POST" && url === "/vms/create") {
      const body = await parseBody(req);
      await handleCreateVm(req, res, body);
    } else if (req.method === "POST" && url === "/vms/start") {
      const body = await parseBody(req);
      await handlePowerAction(req, res, body, "start");
    } else if (req.method === "POST" && url === "/vms/stop") {
      const body = await parseBody(req);
      await handlePowerAction(req, res, body, "stop");
    } else if (req.method === "POST" && url === "/vms/reboot") {
      const body = await parseBody(req);
      await handlePowerAction(req, res, body, "reboot");
    } else if (req.method === "POST" && url === "/vms/destroy") {
      const body = await parseBody(req);
      await handleDestroyVm(req, res, body);
    } else if (req.method === "GET" && url.startsWith("/vms/info/")) {
      const rawDomain = url.replace("/vms/info/", "").split("?")[0];
      await handleVmInfo(req, res, rawDomain);
    } else {
      respond(res, 404, { error: "Not found" });
    }
  } catch (err) {
    log("error", "Unhandled error", { err: err.message });
    respond(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log("info", "Agent started", { version: VERSION, port: PORT, isoDir: ISO_DIR, vmDiskDir: VM_DISK_DIR });
});
