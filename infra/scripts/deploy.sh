#!/bin/bash
# infra/scripts/deploy.sh — Zero-downtime deploy
set -euo pipefail

IMAGE_TAG="${1:-latest}"
COMPOSE="docker compose -f /opt/gotipe/docker-compose.yml"

echo "=== GoTipe Cloud Deploy: ${IMAGE_TAG} ==="

# 1. Pull new images
echo "[1/6] Pulling images..."
$COMPOSE pull api sync export-worker

# 2. Run database migrations BEFORE starting new code
#    Use direct PostgreSQL connection (bypass pgBouncer for DDL)
echo "[2/6] Running migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="postgres://gotipe:${POSTGRES_PASSWORD}@postgres:5432/gotipe?sslmode=disable" \
  api /gotipe-cloud migrate up

# 3. Scale API to 2 instances (new + old run in parallel)
echo "[3/6] Starting new API container..."
$COMPOSE up -d --no-deps --scale api=2 api

# 4. Wait for new container health check
echo "[4/6] Waiting for health check..."
sleep 5
for i in $(seq 1 12); do
    if $COMPOSE exec api wget -qO- http://localhost:8080/healthz > /dev/null 2>&1; then
        echo "  Health check passed (attempt ${i})"
        break
    fi
    if [ "$i" -eq 12 ]; then
        echo "  ERROR: Health check failed after 60s. Rolling back..."
        $COMPOSE up -d --no-deps --scale api=1 api
        exit 1
    fi
    echo "  Waiting... (attempt ${i}/12)"
    sleep 5
done

# 5. Stop old container, scale back to 1
echo "[5/6] Removing old container..."
OLD_CONTAINER=$(docker ps --filter "name=gotipe-api" --format '{{.ID}}' | tail -1)
if [ -n "$OLD_CONTAINER" ]; then
    docker stop "$OLD_CONTAINER" 2>/dev/null || true
fi
$COMPOSE up -d --no-deps --scale api=1 api

# 6. Update sync + export worker (stateless, restart is safe)
echo "[6/6] Updating sync + export worker..."
$COMPOSE up -d --no-deps sync export-worker

echo ""
echo "=== Deploy complete: ${IMAGE_TAG} ==="
echo "   Health: curl https://api.gotipe.com/healthz"
echo "   Readiness: curl https://api.gotipe.com/readyz"
