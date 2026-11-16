#!/bin/bash
# infra/scripts/restore.sh — disaster recovery from R2 backup
# Opt-in: requires the pgBackRest setup described under "Backups" in
# docs-site/cloud/overview.md; the stock postgres:17-alpine image has no
# pgbackrest. Rehearse a restore before you rely on this script.
set -euo pipefail

echo "=== GoTipe Disaster Recovery ==="

PITR_TARGET="${1:-}"  # Optional: "2026-02-10 14:30:00+00"

# 1. Stop services (if running)
echo "[1/7] Stopping services..."
docker compose -f /opt/gotipe/docker-compose.yml down 2>/dev/null || true

# 2. Start only PostgreSQL
echo "[2/7] Starting PostgreSQL..."
docker compose -f /opt/gotipe/docker-compose.yml up -d postgres
sleep 10

# 3. Restore from pgBackRest (R2)
echo "[3/7] Restoring from pgBackRest..."
if [ -n "$PITR_TARGET" ]; then
    echo "   PITR target: ${PITR_TARGET}"
    docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
        pgbackrest --stanza=gotipe --type=time --target="$PITR_TARGET" restore
else
    docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
        pgbackrest --stanza=gotipe restore
fi

# 4. Restart PostgreSQL to apply recovery
echo "[4/7] Restarting PostgreSQL..."
docker compose -f /opt/gotipe/docker-compose.yml restart postgres
sleep 10

# 5. Verify data integrity
echo "[5/7] Verifying data integrity..."
docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
    psql -U gotipe -c "SELECT COUNT(*) as documents FROM documents;"
docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
    psql -U gotipe -c "SELECT COUNT(*) as users FROM users;"

# 6. Start remaining services
echo "[6/7] Starting all services..."
docker compose -f /opt/gotipe/docker-compose.yml up -d

# 7. Health check
echo "[7/7] Verifying health..."
sleep 10
curl -sf http://localhost:8080/healthz && echo "  API: OK" || echo "  API: FAILED"
curl -sf http://localhost:8081/healthz && echo "  Sync: OK" || echo "  Sync: FAILED"

echo ""
echo "=== Recovery complete ==="
API_HOST="$(sed -n 's/^API_HOST=//p' /opt/gotipe/.env | tail -n 1)"
echo "   Verify: curl https://${API_HOST:-<API_HOST from /opt/gotipe/.env>}/readyz"
