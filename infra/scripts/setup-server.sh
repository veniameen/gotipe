#!/bin/bash
# infra/scripts/setup-server.sh — full server provisioning
set -euo pipefail

# The GitHub repository this server deploys; set GOTIPE_REPO for a fork.
REPO="${GOTIPE_REPO:-gotipe/gotipe}"

echo "=== GoTipe Server Setup ==="

# --- 1. OS + Docker ---
echo "[1/9] Installing system packages..."
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 fail2ban ufw gh wget curl

# --- 2. Firewall ---
echo "[2/9] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy redirect)
ufw allow 443/tcp   # HTTPS (Caddy TLS)
ufw --force enable

# --- 3. Deploy user ---
echo "[3/9] Creating deploy user..."
useradd -m -s /bin/bash deploy || true
usermod -aG docker deploy

# --- 4. SSH key + GitHub auth ---
echo "[4/9] Setting up SSH + GitHub..."
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
gh auth login --with-token <<< "$GITHUB_TOKEN"
gh repo deploy-key add /home/deploy/.ssh/id_ed25519.pub \
   --repo "$REPO" --title "server-$(hostname)"

# --- 5. Clone repository ---
echo "[5/9] Cloning repository..."
sudo -u deploy git clone "git@github.com:${REPO}.git" /opt/gotipe/repo

# --- 6. Copy infra/ ---
echo "[6/9] Setting up infra..."
cp -r /opt/gotipe/repo/infra/* /opt/gotipe/
mkdir -p /opt/gotipe/grafana/dashboards /opt/gotipe/grafana/datasources

# --- 7. GitHub Secrets ---
echo "[7/9] Configuring GitHub Secrets for auto-deploy..."
SERVER_IP=$(curl -s ifconfig.me)
gh secret set DEPLOY_HOST --repo "$REPO" --body "$SERVER_IP"
gh secret set DEPLOY_USER --repo "$REPO" --body "deploy"
gh secret set DEPLOY_KEY --repo "$REPO" --body "$(cat /home/deploy/.ssh/id_ed25519)"

# --- 8. .env ---
echo "[8/9] Preparing environment..."
if [ ! -f /opt/gotipe/.env ]; then
  cp /opt/gotipe/.env.example /opt/gotipe/.env
  echo ""
  echo "  WARNING: EDIT /opt/gotipe/.env before starting services!"
  echo "     Required: API_HOST, SYNC_HOST, HTTP_ALLOWED_ORIGINS, SYNC_ALLOWED_ORIGINS,"
  echo "     POSTGRES_PASSWORD, JWT keys, R2 credentials, Stripe keys"
  echo ""
fi

# --- 9. Start services ---
echo "[9/9] Starting services..."
cd /opt/gotipe && docker compose up -d

# --- Backups ---
cp /opt/gotipe/scripts/backup-cron /etc/cron.d/gotipe-backup
chmod 644 /etc/cron.d/gotipe-backup

echo ""
echo "=== Server ready ==="
echo "   IP: ${SERVER_IP}"
echo "   Next push to main -> automatic deploy"
API_HOST="$(sed -n 's/^API_HOST=//p' /opt/gotipe/.env | tail -n 1)"
echo "   Health: curl https://${API_HOST:-<API_HOST from /opt/gotipe/.env>}/healthz"
