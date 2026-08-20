#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cloud VM Provider — Server Agent Installer
# Target: Ubuntu 20.04 (bare metal or VM)
#
# Usage:
#   curl -fsSL <your-raw-url>/install-agent.sh | sudo bash
#   or:
#   sudo bash install-agent.sh
#
# What this does:
#   1. Installs qemu-kvm, libvirt, virt-install, bridge-utils
#   2. Installs Node.js 20
#   3. Adds the current user to the libvirt and kvm groups
#   4. Creates /opt/kvm-agent/ with agent.js
#   5. Creates a systemd service that auto-starts on boot
#   6. Prints instructions to configure the Cloudflare Tunnel
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; NC="\033[0m"
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Must run as root
[[ $EUID -eq 0 ]] || error "Please run as root: sudo bash install-agent.sh"

AGENT_DIR="/opt/kvm-agent"
SERVICE_NAME="kvm-agent"
AGENT_PORT="${AGENT_PORT:-3001}"
ISO_DIR="${ISO_DIR:-/var/lib/libvirt/images}"
# VM overlays are stored separately from base images so that VM disks
# are never discovered and offered as selectable backing images.
VM_DISK_DIR="${VM_DISK_DIR:-/var/lib/libvirt/vms}"

# ── 1. System dependencies ────────────────────────────────────────────────────
info "Updating apt and installing KVM + libvirt dependencies..."
apt-get update -qq
apt-get install -y -qq \
  qemu-kvm \
  libvirt-daemon-system \
  libvirt-daemon \
  libvirt-clients \
  virtinst \
  bridge-utils \
  cpu-checker \
  genisoimage \
  curl \
  ca-certificates \
  gnupg \
  lsb-release

# Enable and start libvirtd
info "Enabling libvirtd service..."
systemctl enable --now libvirtd

# ── 2. Check KVM support ──────────────────────────────────────────────────────
info "Checking hardware virtualization support..."
if kvm-ok 2>&1 | grep -q "KVM acceleration can be used"; then
  info "KVM hardware acceleration: AVAILABLE"
else
  warn "KVM hardware acceleration may not be available."
  warn "VMs will run with software emulation (QEMU TCG) — much slower."
fi

# ── 3. Install Node.js 20 via GPG-verified NodeSource APT repo ────────────────
if ! command -v node &>/dev/null || [[ "$(node --version)" != v20* ]]; then
  info "Adding NodeSource APT repository (GPG-verified)..."

  # Download and verify NodeSource's GPG signing key
  KEYRING="/usr/share/keyrings/nodesource.gpg"
  # The key fingerprint is 9FD3B784BC1C6FC31A8A0A1C1655A0AB68576280
  # Published at https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o "$KEYRING"

  # Verify the fingerprint of the imported key
  ACTUAL_FP=$(gpg --no-default-keyring --keyring "$KEYRING" \
    --fingerprint 2>/dev/null | grep -oE '[0-9A-F ]{40,}' | tr -d ' ' | head -1)
  EXPECTED_FP="9FD3B784BC1C6FC31A8A0A1C1655A0AB68576280"
  if [[ "$ACTUAL_FP" != "$EXPECTED_FP" ]]; then
    error "NodeSource GPG fingerprint mismatch! Expected $EXPECTED_FP, got $ACTUAL_FP. Aborting."
  fi

  # Add the signed APT source
  echo "deb [signed-by=${KEYRING}] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list

  apt-get update -qq
  apt-get install -y -qq nodejs
  info "Node.js $(node --version) installed."
else
  info "Node.js $(node --version) already installed."
fi

# ── 4. Group memberships ──────────────────────────────────────────────────────
REAL_USER="${SUDO_USER:-$USER}"
if [[ "$REAL_USER" != "root" ]]; then
  info "Adding $REAL_USER to libvirt and kvm groups..."
  usermod -aG libvirt "$REAL_USER" || true
  usermod -aG kvm "$REAL_USER" || true
fi

# ── 5. Install agent ──────────────────────────────────────────────────────────
info "Installing agent to $AGENT_DIR..."
mkdir -p "$AGENT_DIR"

# Copy agent.js from the same directory as this script, or download it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/agent.js" ]]; then
  cp "$SCRIPT_DIR/agent.js" "$AGENT_DIR/agent.js"
else
  error "agent.js not found next to install-agent.sh. Copy both files to the same directory."
fi

# ── 6. Generate a secret if not set ──────────────────────────────────────────
if [[ -f "$AGENT_DIR/.env" ]]; then
  info "Existing .env found — not overwriting."
else
  GENERATED_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  info "Generated AGENT_SECRET: $GENERATED_SECRET"
  cat > "$AGENT_DIR/.env" <<EOF
AGENT_SECRET=$GENERATED_SECRET
AGENT_PORT=$AGENT_PORT
ISO_DIR=$ISO_DIR
VM_DISK_DIR=$VM_DISK_DIR
EOF
  info ".env written to $AGENT_DIR/.env"
fi

# ── Create VM disk directory with libvirt ownership ───────────────────────────
# Read VM_DISK_DIR from the (possibly pre-existing) .env so we respect a
# previously configured value, falling back to the default computed above.
EFFECTIVE_VM_DISK_DIR=$(grep -E '^VM_DISK_DIR=' "$AGENT_DIR/.env" | cut -d= -f2- || echo "$VM_DISK_DIR")
if [[ ! -d "$EFFECTIVE_VM_DISK_DIR" ]]; then
  info "Creating VM disk directory: $EFFECTIVE_VM_DISK_DIR"
  mkdir -p "$EFFECTIVE_VM_DISK_DIR"
  # libvirt expects the directory to be owned by the libvirt-qemu user
  chown libvirt-qemu:kvm "$EFFECTIVE_VM_DISK_DIR" 2>/dev/null || \
    chown libvirt:libvirt "$EFFECTIVE_VM_DISK_DIR" 2>/dev/null || true
  chmod 0750 "$EFFECTIVE_VM_DISK_DIR"
fi

chmod 600 "$AGENT_DIR/.env"

# ── 7. Systemd service ────────────────────────────────────────────────────────
info "Creating systemd service: $SERVICE_NAME..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=KVM Cloud Provider Agent
After=network.target libvirtd.service
Requires=libvirtd.service

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
EnvironmentFile=$AGENT_DIR/.env
ExecStart=/usr/bin/node $AGENT_DIR/agent.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kvm-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  info "Agent service is running."
else
  warn "Agent service may have failed. Check: journalctl -u $SERVICE_NAME -n 50"
fi

# ── 8. Install Cloudflare Tunnel ──────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  info "Installing cloudflared..."
  ARCH="$(dpkg --print-architecture)"
  CF_DEB="cloudflared-linux-${ARCH}.deb"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_DEB" -o "/tmp/$CF_DEB"
  dpkg -i "/tmp/$CF_DEB"
else
  info "cloudflared already installed."
fi

# ── 9. Read the generated secret ─────────────────────────────────────────────
AGENT_SECRET_VALUE=$(grep AGENT_SECRET "$AGENT_DIR/.env" | cut -d= -f2)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}  Installation complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Start the Cloudflare Tunnel (in a separate terminal or tmux):"
echo ""
echo -e "     ${YELLOW}cloudflared tunnel --url http://127.0.0.1:$AGENT_PORT${NC}"
echo ""
echo "     Copy the HTTPS URL it prints (e.g. https://xxxx-xxxx.trycloudflare.com)"
echo ""
echo "  2. Set these environment variables in your Replit project secrets:"
echo ""
echo -e "     ${YELLOW}AGENT_URL${NC}    = <the cloudflared HTTPS URL above>"
echo -e "     ${YELLOW}AGENT_SECRET${NC} = $AGENT_SECRET_VALUE"
echo ""
echo "  3. Restart the API Server workflow in Replit."
echo ""
echo "  4. (Optional) Download OS ISO images to $ISO_DIR:"
echo "     e.g. ubuntu-20.04-server-cloudimg-amd64.img or ubuntu-22.04.iso"
echo ""
echo "  Agent logs:  journalctl -u $SERVICE_NAME -f"
echo "  Agent status: systemctl status $SERVICE_NAME"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
