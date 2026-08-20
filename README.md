# NexusCloud — KVM Cloud VM Control Panel

A self-hosted cloud provider control panel that provisions and manages real KVM virtual machines on your own Ubuntu Server hypervisor, connected through a Cloudflare Tunnel. Built with React + Vite (frontend) and Express + PostgreSQL (backend) in a pnpm monorepo.

---

## What it does

- **Provision real KVM VMs** via `virt-install` on a remote Ubuntu Server hypervisor
- **Manage VM lifecycle** — start, stop, reboot, destroy
- **SSH key management** — inject public keys into cloud images via cloud-init
- **OS image catalog** — manage Ubuntu, Debian, AlmaLinux cloud images
- **Billing tracking** — uptime-based compute accounting
- **Secure control panel** — password-authenticated, session-cookie-based access

---

## Architecture

```
Browser ──► React panel (served by Express)
                │
                ▼
        Express API server  ──► PostgreSQL (sessions, VMs, keys, images)
                │
                ▼  (HTTPS via Cloudflare Tunnel)
        Ubuntu Agent (agent/agent.js)
                │
                ▼
        libvirt / KVM hypervisor
```

The API server builds and serves the React panel as static files from the same origin, eliminating CORS in production.

---

## Requirements

- **Node.js** 20+
- **pnpm** 9+
- **PostgreSQL** 16+ (local, Docker, or managed)
- A **Ubuntu Server 20.04+** machine with KVM/libvirt for actual VM provisioning (optional — the panel runs fully without it)
- A **Cloudflare Tunnel** to bridge the agent to the internet (optional, same as above)

---

## Quickstart (local development)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/nexuscloud.git
cd nexuscloud
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | Random 32+ char hex string |
| `PANEL_PASSWORD` | ✅ | Password to log into the panel |
| `AGENT_URL` | Optional | Cloudflare Tunnel URL of your hypervisor agent |
| `AGENT_SECRET` | Optional | Shared secret matching the agent's `.env` |
| `CORS_ORIGIN` | Optional | Set to `http://localhost:5173` in split-origin dev |
| `PORT` | Optional | API server port (default: `8080`) |
| `LOG_LEVEL` | Optional | `trace`/`debug`/`info`/`warn`/`error` (default: `info`) |

Generate a `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start PostgreSQL

With Docker:

```bash
docker run -d --name nexuscloud-db \
  -e POSTGRES_DB=nexuscloud \
  -e POSTGRES_USER=nexus \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
```

Set `DATABASE_URL=postgresql://nexus:devpassword@localhost:5432/nexuscloud` in `.env`.

### 4. Run development

The API server creates all tables automatically on first startup.

```bash
# Terminal 1 — API server (builds & serves panel)
pnpm dev

# Terminal 2 (optional) — Vite dev server with HMR
PORT=5173 BASE_PATH=/ CORS_ORIGIN=http://localhost:5173 pnpm dev:panel
```

Open `http://localhost:8080` and log in with your `PANEL_PASSWORD`.

---

## Production

### Build

```bash
pnpm build:api        # builds the React panel then bundles the API server
```

Output: `artifacts/api-server/dist/`

### Start

```bash
NODE_ENV=production pnpm start
```

The server listens on `$PORT` (default 8080) and serves the React panel from the same origin.

---

## Docker

### Build image

```bash
docker build -t nexuscloud .
```

### Run standalone

```bash
docker run -p 8080:8080 --env-file .env nexuscloud
```

### Docker Compose (recommended — includes Postgres)

```bash
cp .env.example .env
# Edit .env: set SESSION_SECRET, PANEL_PASSWORD
docker compose up --build
```

Open `http://localhost:8080`.

---

## Database

The API server applies versioned Drizzle migrations automatically before accepting traffic. It also retains an idempotent `CREATE TABLE IF NOT EXISTS` fallback for backwards compatibility with databases created before migration tracking was introduced.

If you want to inspect or evolve the schema with Drizzle Kit:

```bash
# Generate a versioned migration after changing lib/db/src/schema/
pnpm --filter @workspace/db run generate

# Apply committed migrations manually (the API does this automatically at boot)
pnpm --filter @workspace/db run migrate

# Push schema changes directly (development only)
pnpm db:push

# Force-push schema state (destructive; development only)
pnpm db:push-force
```

Schema lives in `lib/db/src/schema/`.

---

## Testing

```bash
pnpm test
```

23 Jest tests covering VM lifecycle, authentication, and routing middleware. Tests mock the database and agent — no live Postgres or hypervisor required.

---

## Hypervisor agent

The agent (`agent/agent.js`) runs on your Ubuntu Server alongside libvirt. It exposes a local HTTP API that the control panel calls through a Cloudflare Tunnel.

### Install on the hypervisor

```bash
# Copy both files to your Ubuntu server
scp agent/agent.js agent/install-agent.sh user@hypervisor:/tmp/

# On the hypervisor
sudo bash /tmp/install-agent.sh
```

The installer:
1. Installs `qemu-kvm`, `libvirt`, `virt-install`, `genisoimage`, Node.js 20
2. Creates `/opt/kvm-agent/` with a generated `AGENT_SECRET`
3. Registers a systemd service that auto-starts on boot
4. Installs `cloudflared`

### Connect the tunnel

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

Copy the printed `https://xxxx.trycloudflare.com` URL into your `.env` as `AGENT_URL`, and copy the secret from `/opt/kvm-agent/.env` as `AGENT_SECRET`.

### Download OS images

```bash
# On the hypervisor — base images go in ISO_DIR (default /var/lib/libvirt/images)
wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img \
  -O /var/lib/libvirt/images/focal-server-cloudimg-amd64.img
```

Then go to **OS Images** in the panel and click **Mark as ready**.

---

## Deployment to a VPS/cloud VM

1. Install Docker and Docker Compose on the VPS
2. Clone the repository
3. Configure `.env`
4. `docker compose up -d --build`
5. (Optional) Put Nginx in front — see `deploy/nginx.conf.example`

For Nginx with TLS:

```bash
sudo certbot --nginx -d yourdomain.com
```

---

## Repository structure

```
.
├── agent/                   # Ubuntu hypervisor agent (Node.js, no dependencies)
│   ├── agent.js
│   ├── install-agent.sh
│   └── README.md
├── artifacts/
│   ├── api-server/          # Express API server (TypeScript, esbuild)
│   │   └── src/
│   │       ├── routes/      # REST API routes (vms, images, ssh-keys, auth…)
│   │       ├── lib/         # Agent client, billing, logger, seed
│   │       └── middleware/  # Auth, session
│   └── cloud-panel/         # React + Vite control panel (TypeScript)
│       └── src/
│           ├── pages/       # VMs, images, SSH keys, billing, login
│           └── components/  # UI primitives (shadcn/ui based)
├── lib/
│   ├── db/                  # Drizzle ORM schema + pg pool
│   ├── api-spec/            # OpenAPI spec (orval codegen source)
│   ├── api-zod/             # Zod validation schemas (generated)
│   └── api-client-react/    # React Query hooks (generated from OpenAPI)
├── deploy/
│   └── nginx.conf.example   # Nginx reverse-proxy example
├── .env.example             # All environment variables documented
├── Dockerfile               # Multi-stage production Docker image
├── docker-compose.yml       # Compose stack (API + Postgres)
└── .github/workflows/ci.yml # GitHub Actions CI
```

---

## CI (GitHub Actions)

Every push and pull request runs:

1. Install dependencies (`pnpm install --frozen-lockfile`)
2. Type-check libs
3. Type-check all artifacts
4. Run tests (with a real Postgres service container)
5. Build API server + panel

See `.github/workflows/ci.yml`.

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | — | 32+ char random secret for session signing |
| `PANEL_PASSWORD` | ✅ | — | Control panel login password |
| `PORT` | No | `8080` | API server listen port |
| `NODE_ENV` | No | `development` | `production` enables secure cookies |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `CORS_ORIGIN` | No | — | Allowed cross-origin (split-origin dev only) |
| `AGENT_URL` | No | — | Hypervisor agent HTTPS URL |
| `AGENT_SECRET` | No | — | Shared secret for agent authentication |

---

## Troubleshooting

**"DATABASE_URL must be set"** — Copy `.env.example` to `.env` and fill in `DATABASE_URL`.

**"SESSION_SECRET environment variable is required"** — Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Login always fails** — `PANEL_PASSWORD` is not set or is wrong. Check your `.env`.

**"Hypervisor agent is not configured"** — Set both `AGENT_URL` and `AGENT_SECRET`. The panel functions without them but cannot provision VMs.

**VM stuck in "provisioning"** — The agent's `virt-install` is still running (can take up to 3 minutes). Check `/opt/kvm-agent/` logs on the hypervisor with `journalctl -u kvm-agent -f`.

**OS images show "not downloaded"** — Download the image file to `/var/lib/libvirt/images/` on the hypervisor, then click **Mark as ready** in the panel's OS Images page.
