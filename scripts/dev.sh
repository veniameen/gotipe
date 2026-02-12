#!/bin/bash
# scripts/dev.sh — Start full development environment
set -euo pipefail

# Load nvm if available (pnpm is installed via nvm)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

echo "=== GoTipe Dev Environment ==="

# 0. Kill stale processes from previous runs
for port in 8080 8081; do
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Killing stale processes on port $port"
        echo "$pids" | xargs kill 2>/dev/null || true
    fi
done
sleep 1

# 1. Start infra (Postgres, Valkey, MinIO)
echo "[1/5] Starting dev infrastructure..."
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Apply DB migrations (idempotent — uses IF NOT EXISTS in SQL)
echo "[2/5] Applying database migrations..."
for f in apps/cloud/migrations/*.up.sql; do
    docker exec -i infra-postgres-1 psql -U gotipe -d gotipe < "$f" > /dev/null 2>&1 || true
done
echo "  Migrations applied"

# 3. Build WASM (if Rust sources changed)
echo "[3/5] Checking WASM..."
WASM_FILE="packages/wasm/pkg/gotipe_wasm_bg.wasm"
RUST_CHANGED=false

if [ ! -f "$WASM_FILE" ]; then
    RUST_CHANGED=true
elif [ "$(find crates/ -name '*.rs' -newer "$WASM_FILE" | head -1)" ]; then
    RUST_CHANGED=true
fi

if [ "$RUST_CHANGED" = true ]; then
    echo "  WASM outdated, rebuilding..."
    bash scripts/build-wasm.sh
else
    echo "  WASM up to date"
fi

# 4. Start TypeScript packages in watch mode
echo "[4/5] Starting TypeScript dev server..."
pnpm turbo run dev &
TS_PID=$!

# 5. Start Go server (if cloud/ exists and developing cloud features)
GO_PID=""
if [ -f apps/cloud/go.mod ]; then
    echo "[5/5] Starting Go API server..."
    # Load .env for Go server
    if [ -f apps/cloud/.env ]; then
        set -a
        source apps/cloud/.env
        set +a
    fi
    (cd apps/cloud && go run ./cmd/api) &
    GO_PID=$!
else
    echo "[5/5] Skipping Go server (no apps/cloud/go.mod)"
fi

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    [ -n "$TS_PID" ] && kill "$TS_PID" 2>/dev/null || true
    [ -n "$GO_PID" ] && kill "$GO_PID" 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM

echo ""
echo "=== Dev environment running ==="
echo "   Playground: http://localhost:5173"
echo "   API:        http://localhost:8080"
echo "   Sync WS:    ws://localhost:8081"
echo "   MinIO:      http://localhost:9001 (minioadmin/minioadmin)"
echo ""

wait
