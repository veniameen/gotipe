#!/bin/bash
# scripts/dev.sh — Start full development environment
set -euo pipefail

echo "=== GoTipe Dev Environment ==="

# 1. Start infra (Postgres, Valkey, MinIO)
echo "[1/4] Starting dev infrastructure..."
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Build WASM (if Rust sources changed)
echo "[2/4] Checking WASM..."
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

# 3. Start TypeScript packages in watch mode
echo "[3/4] Starting TypeScript dev server..."
pnpm turbo run dev &
TS_PID=$!

# 4. Start Go server (if cloud/ exists and developing cloud features)
GO_PID=""
if [ -f apps/cloud/go.mod ]; then
    echo "[4/4] Starting Go API server..."
    (cd apps/cloud && go run ./cmd/api) &
    GO_PID=$!
else
    echo "[4/4] Skipping Go server (no apps/cloud/go.mod)"
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
echo "   MinIO:      http://localhost:9001 (minioadmin/minioadmin)"
echo ""

wait
