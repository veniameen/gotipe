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
# /opt/gotipe is the checkout itself: deploy.sh, the deploy workflows (git pull in
# /opt/gotipe), backup-cron and restore.sh all use /opt/gotipe/infra.
echo "[5/9] Cloning repository..."
install -d -o deploy -g deploy /opt/gotipe
sudo -u deploy git clone "git@github.com:${REPO}.git" /opt/gotipe

# --- 6. Prepare infra/ ---
echo "[6/9] Setting up infra..."
sudo -u deploy mkdir -p /opt/gotipe/infra/grafana/dashboards /opt/gotipe/infra/grafana/datasources

# --- 7. GitHub Secrets ---
echo "[7/9] Configuring GitHub Secrets for auto-deploy..."
SERVER_IP=$(curl -s ifconfig.me)
gh secret set DEPLOY_HOST --repo "$REPO" --body "$SERVER_IP"
gh secret set DEPLOY_USER --repo "$REPO" --body "deploy"
gh secret set DEPLOY_KEY --repo "$REPO" --body "$(cat /home/deploy/.ssh/id_ed25519)"

# --- 8. .env ---
echo "[8/9] Preparing environment..."
ENV_FILE=/opt/gotipe/infra/.env
CREATED_ENV=0
if [ ! -f "$ENV_FILE" ]; then
  sudo -u deploy cp /opt/gotipe/infra/.env.example "$ENV_FILE"
  CREATED_ENV=1
fi

# --- Backups ---
cp /opt/gotipe/infra/scripts/backup-cron /etc/cron.d/gotipe-backup
chmod 644 /etc/cron.d/gotipe-backup

# --- 9. Start services ---
# The example .env names example.com and CHANGE_ME values: starting with it would
# request certificates for hosts this server does not serve. Stop until it is edited.
if [ "$CREATED_ENV" = 1 ]; then
  echo ""
  echo "  EDIT $ENV_FILE, then start the services:"
  echo "     Required: API_HOST, SYNC_HOST, HTTP_ALLOWED_ORIGINS, SYNC_ALLOWED_ORIGINS,"
  echo "     POSTGRES_PASSWORD, JWT keys, R2 credentials, Stripe keys"
  echo "     cd /opt/gotipe && infra/scripts/deploy.sh <tag>"
  echo "     IMAGE_TAG=<tag> docker compose -f infra/docker-compose.yml up -d"
  echo ""
  exit 0
fi
echo "[9/9] Starting services..."
cd /opt/gotipe && docker compose -f infra/docker-compose.yml up -d

echo ""
echo "=== Server ready ==="
echo "   IP: ${SERVER_IP}"
echo "   Next push to main -> automatic deploy"
API_HOST="$(sed -n 's/^API_HOST=//p' /opt/gotipe/infra/.env | tail -n 1)"
echo "   Health: curl https://${API_HOST:-<API_HOST from /opt/gotipe/infra/.env>}/healthz"
