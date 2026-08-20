# KVM Cloud Provider — Server Agent

This directory contains the lightweight agent that runs on your **Ubuntu 20.04** server and bridges it to the Replit control panel via a Cloudflare Tunnel.

## Requirements

- Ubuntu 20.04 (bare metal or VM with nested virtualization)
- CPU with hardware virtualization support (Intel VT-x / AMD-V — check in BIOS)
- At least 4 GB RAM recommended (each guest VM needs its own RAM)
- Root or sudo access

## Quick Install

Copy both `agent.js` and `install-agent.sh` to your Ubuntu server, then run:

```bash
sudo bash install-agent.sh
```

The script will:
1. Install `qemu-kvm`, `libvirt`, `virt-install`, `bridge-utils`, `genisoimage`
2. Install Node.js 20
3. Add your user to the `libvirt` and `kvm` groups
4. Create `/opt/kvm-agent/` with the agent and a generated `AGENT_SECRET`
5. Register and start a systemd service that auto-starts on boot
6. Install `cloudflared`

## Connecting to Replit

After installation, the script prints two environment variables to set in Replit:

| Secret name    | Value                                     |
|----------------|-------------------------------------------|
| `AGENT_URL`    | The `https://xxxx.trycloudflare.com` URL  |
| `AGENT_SECRET` | The secret from `/opt/kvm-agent/.env`     |

Start the tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

Then restart the API Server workflow in Replit.

## Directory Layout

The agent uses **two separate directories** to prevent VM overlay disks from
appearing in the base-image catalog (which would expose one VM's filesystem
to another VM's provisioning flow):

| Variable      | Default                      | Purpose                              |
|---------------|------------------------------|--------------------------------------|
| `ISO_DIR`     | `/var/lib/libvirt/images`    | Base cloud images and installer ISOs |
| `VM_DISK_DIR` | `/var/lib/libvirt/vms`       | Per-VM qcow2 overlay disks           |

Create the VM disk directory if it doesn't exist:

```bash
sudo mkdir -p /var/lib/libvirt/vms
sudo chown libvirt-qemu:kvm /var/lib/libvirt/vms
```

You can override either with environment variables in `/opt/kvm-agent/.env`.

## Adding OS Images

Place base images in `ISO_DIR` (default `/var/lib/libvirt/images/`):

```bash
# Ubuntu 20.04 minimal cloud image (boots fast, small disk)
wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img \
  -O /var/lib/libvirt/images/ubuntu-20.04-cloudimg-amd64.img

# Ubuntu 22.04 cloud image
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img \
  -O /var/lib/libvirt/images/ubuntu-22.04-cloudimg-amd64.img

# Debian 12 netinstall ISO
wget https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.9.0-amd64-netinst.iso \
  -O /var/lib/libvirt/images/debian-12-amd64.iso
```

The control panel's Images page syncs the available ISOs automatically.

## Agent Endpoints

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | `/info`           | Host info and agent version        |
| GET    | `/images`         | List ISO files in ISO_DIR          |
| POST   | `/vms/create`     | Provision a new VM (virt-install)  |
| POST   | `/vms/start`      | `virsh start <domain>`             |
| POST   | `/vms/stop`       | `virsh shutdown <domain>`          |
| POST   | `/vms/reboot`     | `virsh reboot <domain>`            |
| POST   | `/vms/destroy`    | Stop + undefine + delete disk      |
| GET    | `/vms/info/:dom`  | Get status and IP of a domain      |

All requests must include the `X-Agent-Secret` header matching `AGENT_SECRET`.

## Troubleshooting

```bash
# Check agent logs
journalctl -u kvm-agent -f

# Check agent status
systemctl status kvm-agent

# Restart agent
sudo systemctl restart kvm-agent

# List running VMs
virsh list --all

# Check libvirt is running
systemctl status libvirtd
```

## Security Notes

- The agent listens only on `127.0.0.1` — it is **not** exposed to your LAN
- Cloudflare Tunnel provides HTTPS and DDoS protection
- All requests are authenticated with `AGENT_SECRET`
- Never expose port 3001 directly to the internet
