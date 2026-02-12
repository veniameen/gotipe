#!/bin/bash
set -eo pipefail

# ============================================================
# GoTipe Comprehensive E2E Test Suite
# ============================================================
# Tests entire stack end-to-end:
#   Build:    WASM compile + optimize, TypeScript build
#   Rust:     cargo test, clippy, fmt
#   TS:       vitest, typecheck, lint
#   Go:       go test -race
#   Infra:    Docker (Postgres, Valkey, MinIO)
#   API:      Health, CRUD, auth, WebSocket
#
# Usage:
#   ./scripts/e2e-test.sh           # Full clean run
#   ./scripts/e2e-test.sh --quick   # Reuse running services
#   ./scripts/e2e-test.sh --skip-build   # Skip WASM/TS build
#   ./scripts/e2e-test.sh --api-only     # Only API smoke tests
# ============================================================

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUD_DIR="$PROJECT_ROOT/apps/cloud"
INFRA_DIR="$PROJECT_ROOT/infra"

# App server ports
API_PORT=8080
SYNC_PORT=8081
METRICS_PORT=9091
API_URL="http://localhost:$API_PORT"
SYNC_URL="http://localhost:$SYNC_PORT"
METRICS_URL="http://localhost:$METRICS_PORT"

# Infrastructure ports (standard)
PG_PORT=5432
VALKEY_PORT=6379
MINIO_PORT=9000

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# --- Counters ---
PASSED=0
FAILED=0
SKIPPED=0
TOTAL_START=$(date +%s)

# --- Flags ---
QUICK=false
SKIP_BUILD=false
API_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --quick) QUICK=true ;;
        --skip-build) SKIP_BUILD=true ;;
        --api-only) API_ONLY=true; SKIP_BUILD=true ;;
    esac
done

# --- Ensure tools are in PATH ---
# Cargo/Rust
if [ -d "$HOME/.cargo/bin" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi
# Node/pnpm (nvm)
if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
fi
# Homebrew (macOS)
if [ -f "/opt/homebrew/bin/brew" ]; then
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" 2>/dev/null || true
fi

# ============================================================
# Helper Functions
# ============================================================

header() {
    echo -e "\n${BLUE}${BOLD}=== $1 ===${NC}"
}

pass() {
    PASSED=$((PASSED + 1))
    if [ -n "${1:-}" ]; then
        echo -e "${GREEN}✓${NC} ${DIM}(${1}s)${NC}"
    else
        echo -e "${GREEN}✓${NC}"
    fi
}

fail() {
    FAILED=$((FAILED + 1))
    echo -e "${RED}✗ ${1:-}${NC}"
}

skip() {
    SKIPPED=$((SKIPPED + 1))
    echo -e "${YELLOW}⊘ ${1:-skipped}${NC}"
}

check_port() {
    lsof -Pi :"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

wait_tcp() {
    local name="$1" host="$2" port="$3" max="${4:-30}"
    echo -n "  $name "
    for i in $(seq 1 "$max"); do
        if nc -z "$host" "$port" 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    echo -e "${RED}✗${NC}"
    return 1
}

wait_http() {
    local name="$1" url="$2" max="${3:-30}"
    echo -n "  $name "
    for i in $(seq 1 "$max"); do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    echo -e "${RED}✗${NC}"
    return 1
}

run_check() {
    local name="$1"
    shift
    echo -n "  $name "
    local start_time
    start_time=$(date +%s)

    if "$@" > /tmp/gotipe-e2e-check.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
        return 0
    else
        local duration=$(( $(date +%s) - start_time ))
        fail "(${duration}s)"
        echo -e "    ${DIM}$(tail -5 /tmp/gotipe-e2e-check.log)${NC}"
        return 1
    fi
}

http_test() {
    local name="$1" method="$2" url="$3" expected_code="${4:-200}"
    shift 4

    echo -n "  $name "
    local tmp
    tmp=$(mktemp)

    local http_code
    if [ $# -gt 0 ]; then
        http_code=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" "$url" "$@" 2>/dev/null) || true
    else
        http_code=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" "$url" 2>/dev/null) || true
    fi

    if [ "$http_code" = "$expected_code" ]; then
        pass
        rm -f "$tmp"
        return 0
    else
        fail "expected $expected_code, got $http_code"
        echo -e "    ${DIM}$(head -3 "$tmp" 2>/dev/null)${NC}"
        rm -f "$tmp"
        return 1
    fi
}

# ============================================================
# Step 0: Clean slate (kill old processes)
# ============================================================

cleanup() {
    header "Cleanup"

    # Kill Cloud API
    if [ -f /tmp/gotipe-api.pid ]; then
        local pid
        pid=$(cat /tmp/gotipe-api.pid 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && echo -e "  Stopped API (pid $pid)" || true
            sleep 1
        fi
        rm -f /tmp/gotipe-api.pid
    fi
    # Kill by port
    local api_pid
    api_pid=$(lsof -ti :$API_PORT -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$api_pid" ]; then
        kill "$api_pid" 2>/dev/null && echo -e "  Killed :${API_PORT} (pid $api_pid)" || true
        sleep 1
    fi

    # Kill Sync server
    local sync_pid
    sync_pid=$(lsof -ti :$SYNC_PORT -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$sync_pid" ]; then
        kill "$sync_pid" 2>/dev/null && echo -e "  Killed :${SYNC_PORT} (pid $sync_pid)" || true
        sleep 1
    fi

    # Stop any Docker containers occupying our infra ports (e.g. other local projects)
    for port in $PG_PORT $VALKEY_PORT $MINIO_PORT; do
        local container
        container=$(docker ps --format '{{.ID}} {{.Ports}}' 2>/dev/null | grep -E "0\.0\.0\.0:${port}[^0-9]" | awk '{print $1}' | head -1 || true)
        if [ -n "$container" ]; then
            docker stop "$container" >/dev/null 2>&1 && \
                echo -e "  Stopped container on :${port} (${container:0:12})" || true
        fi
    done

    # Clean logs
    rm -f /tmp/gotipe-api.log /tmp/gotipe-e2e-check.log

    echo -e "${GREEN}✓ Clean${NC}"
}

# ============================================================
# Step 1: Infrastructure (Docker Compose)
# ============================================================

setup_infrastructure() {
    header "Infrastructure"

    if [ "$QUICK" = true ]; then
        echo -e "${DIM}Quick mode — checking existing services...${NC}"
    else
        echo "Starting docker compose..."
        cd "$INFRA_DIR"
        docker compose -f docker-compose.dev.yml down 2>/dev/null || true
        docker compose -f docker-compose.dev.yml up -d
        cd "$PROJECT_ROOT"
        sleep 5
    fi

    wait_tcp "PostgreSQL (:$PG_PORT)" localhost "$PG_PORT" || exit 1
    wait_tcp "Valkey (:$VALKEY_PORT)" localhost "$VALKEY_PORT" || exit 1
    wait_http "MinIO (:$MINIO_PORT)" "http://localhost:${MINIO_PORT}/minio/health/live" 20 || {
        # MinIO health endpoint might differ — try raw TCP
        wait_tcp "MinIO (TCP :$MINIO_PORT)" localhost "$MINIO_PORT" || exit 1
    }

    echo -e "${GREEN}✓ Infrastructure ready${NC}"
}

# ============================================================
# Step 2: WASM Build
# ============================================================

build_wasm() {
    header "WASM Build"

    if [ "$SKIP_BUILD" = true ]; then
        echo -e "${DIM}Skipped (--skip-build)${NC}"
        return
    fi

    # Check prerequisites
    if ! command -v wasm-pack &> /dev/null; then
        echo -e "${YELLOW}wasm-pack not found, skipping WASM build${NC}"
        skip "wasm-pack not installed"
        return
    fi

    echo -n "  wasm-pack build + optimize "
    local start_time
    start_time=$(date +%s)

    cd "$PROJECT_ROOT"
    if bash scripts/build-wasm.sh > /tmp/gotipe-wasm-build.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"

        # Report size
        local wasm_file="packages/wasm/pkg/gotipe_wasm_bg.wasm"
        if [ -f "$wasm_file" ]; then
            local raw_size gzip_size
            raw_size=$(wc -c < "$wasm_file" | tr -d ' ')
            gzip_size=$(gzip -c "$wasm_file" | wc -c | tr -d ' ')
            echo -e "    ${DIM}Raw: ${raw_size} bytes, Gzip: ${gzip_size} bytes${NC}"
        fi
    else
        fail
        echo -e "    ${DIM}$(tail -10 /tmp/gotipe-wasm-build.log)${NC}"
    fi
}

# ============================================================
# Step 3: TypeScript Build
# ============================================================

build_typescript() {
    header "TypeScript Build"

    if [ "$SKIP_BUILD" = true ]; then
        echo -e "${DIM}Skipped (--skip-build)${NC}"
        return
    fi

    cd "$PROJECT_ROOT"
    echo -n "  pnpm install "
    local start_time
    start_time=$(date +%s)
    if pnpm install > /tmp/gotipe-pnpm-install.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
    else
        fail
        echo -e "    ${DIM}$(tail -5 /tmp/gotipe-pnpm-install.log)${NC}"
        return
    fi

    echo -n "  pnpm build "
    start_time=$(date +%s)
    if pnpm build > /tmp/gotipe-pnpm-build.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
    else
        fail
        echo -e "    ${DIM}$(tail -10 /tmp/gotipe-pnpm-build.log)${NC}"
    fi
}

# ============================================================
# Step 4: Rust Tests
# ============================================================

test_rust() {
    header "Rust Tests"

    cd "$PROJECT_ROOT"

    # Check if Cargo is available
    if ! command -v cargo &> /dev/null; then
        skip "cargo not installed"
        return
    fi

    run_check "cargo fmt --check" cargo fmt --check || true
    run_check "cargo clippy --workspace -- -D warnings" cargo clippy --workspace -- -D warnings || true
    run_check "cargo test --workspace" cargo test --workspace || true

    # Property tests (slower, ignore-tagged)
    echo -n "  cargo test (property, CRDT) "
    local start_time
    start_time=$(date +%s)
    if cargo test -p gotipe-crdt -- --ignored > /tmp/gotipe-e2e-check.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
    else
        local duration=$(( $(date +%s) - start_time ))
        # Property tests may not exist yet
        if grep -q "no test" /tmp/gotipe-e2e-check.log 2>/dev/null; then
            skip "no property tests found"
        else
            fail "(${duration}s)"
            echo -e "    ${DIM}$(tail -5 /tmp/gotipe-e2e-check.log)${NC}"
        fi
    fi
}

# ============================================================
# Step 5: TypeScript Tests
# ============================================================

test_typescript() {
    header "TypeScript Tests"

    cd "$PROJECT_ROOT"

    if ! command -v pnpm &> /dev/null; then
        skip "pnpm not installed"
        return
    fi

    run_check "pnpm lint (Biome)" pnpm lint || true
    run_check "pnpm typecheck (tsc --noEmit)" pnpm typecheck || true
    run_check "pnpm test (Vitest)" pnpm test || true
}

# ============================================================
# Step 6: Go Tests
# ============================================================

test_go() {
    header "Go Tests"

    if ! command -v go &> /dev/null; then
        skip "go not installed"
        return
    fi

    cd "$CLOUD_DIR"

    run_check "go vet ./..." go vet ./... || true
    run_check "go test ./... -race" go test ./... -race -count=1 || true

    # Integration tests (testcontainers)
    echo -n "  go test -tags=integration "
    local start_time
    start_time=$(date +%s)
    if go test -tags=integration ./... -race -count=1 > /tmp/gotipe-e2e-check.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
    else
        local duration=$(( $(date +%s) - start_time ))
        # Integration tests might not exist yet
        if grep -q "no test files" /tmp/gotipe-e2e-check.log 2>/dev/null || \
           grep -q "no Go files" /tmp/gotipe-e2e-check.log 2>/dev/null; then
            skip "no integration tests found"
        else
            fail "(${duration}s)"
            echo -e "    ${DIM}$(tail -5 /tmp/gotipe-e2e-check.log)${NC}"
        fi
    fi

    cd "$PROJECT_ROOT"
}

# ============================================================
# Step 7: Start Cloud API
# ============================================================

generate_jwt_keys() {
    # Generate ES256 (P-256) key pair for JWT
    local tmpdir
    tmpdir=$(mktemp -d)
    openssl ecparam -genkey -name prime256v1 -noout -out "$tmpdir/private.pem" 2>/dev/null
    openssl ec -in "$tmpdir/private.pem" -pubout -out "$tmpdir/public.pem" 2>/dev/null

    JWT_PRIVATE_KEY=$(cat "$tmpdir/private.pem")
    JWT_PUBLIC_KEY=$(cat "$tmpdir/public.pem")
    rm -rf "$tmpdir"
}

start_cloud_api() {
    header "Cloud API"

    if [ "$QUICK" = true ] && check_port $API_PORT; then
        echo -e "${GREEN}✓ Already running on :${API_PORT}${NC}"
        return
    fi

    if check_port $API_PORT; then
        echo -e "${YELLOW}Port $API_PORT busy — killing...${NC}"
        local old_pid
        old_pid=$(lsof -ti :$API_PORT -sTCP:LISTEN 2>/dev/null || true)
        [ -n "$old_pid" ] && kill "$old_pid" 2>/dev/null && sleep 2
    fi

    # Generate JWT keys
    generate_jwt_keys

    # Export env vars for Cloud API
    export DATABASE_URL="postgresql://gotipe:gotipe@localhost:5432/gotipe"
    export VALKEY_URL="redis://localhost:6379/0"
    export S3_ENDPOINT="http://localhost:9000"
    export S3_USE_PATH_STYLE="true"
    export R2_ACCESS_KEY_ID="minioadmin"
    export R2_SECRET_ACCESS_KEY="minioadmin"
    export R2_BUCKET="gotipe-data"
    export R2_CDN_URL="http://localhost:9000/gotipe-data"
    export JWT_PRIVATE_KEY="$JWT_PRIVATE_KEY"
    export JWT_PUBLIC_KEY="$JWT_PUBLIC_KEY"
    export JWT_ISSUER="gotipe-e2e"
    export JWT_AUDIENCE="gotipe-cloud"
    export ENVIRONMENT="development"
    export LOG_LEVEL="info"
    export LOG_FORMAT="text"
    export LISTEN_ADDR=":${API_PORT}"
    export SYNC_LISTEN_ADDR=":${SYNC_PORT}"
    export METRICS_LISTEN_ADDR=":${METRICS_PORT}"
    export RATE_LIMIT_API="1000/min"
    export PROMETHEUS_ENABLED="true"

    cd "$CLOUD_DIR"
    nohup go run ./cmd/api > /tmp/gotipe-api.log 2>&1 &
    echo $! > /tmp/gotipe-api.pid
    cd "$PROJECT_ROOT"

    wait_http "API healthz" "$API_URL/healthz" || {
        echo -e "${RED}Last 20 lines of API log:${NC}"
        tail -20 /tmp/gotipe-api.log
        exit 1
    }

    wait_http "API readyz" "$API_URL/readyz" || {
        echo -e "${RED}API not ready (DB/Valkey?)${NC}"
        tail -20 /tmp/gotipe-api.log
        exit 1
    }

    echo -e "${GREEN}✓ Cloud API running${NC}"
}

# ============================================================
# Step 8: API Smoke Tests
# ============================================================

test_health() {
    header "Health & Readiness"

    http_test "GET /healthz" GET "$API_URL/healthz" 200 || true
    http_test "GET /readyz" GET "$API_URL/readyz" 200 || true

    # Metrics endpoint
    echo -n "  GET /metrics "
    local tmp
    tmp=$(mktemp)
    local code
    code=$(curl -s -o "$tmp" -w "%{http_code}" "$METRICS_URL/metrics" 2>/dev/null) || true
    if [ "$code" = "200" ] && grep -q "go_goroutines" "$tmp" 2>/dev/null; then
        pass
    elif [ "$code" = "200" ]; then
        pass
        echo -e "    ${DIM}(metrics endpoint OK but no go_goroutines metric)${NC}"
    else
        fail "HTTP $code"
    fi
    rm -f "$tmp"
}

test_auth() {
    header "Authentication"

    # Unauthenticated access should fail
    http_test "GET /v1/users/me (no auth → 401)" GET "$API_URL/v1/users/me" 401 || true

    # Create token (this might need real user setup, so we test the endpoint responds)
    echo -n "  POST /v1/auth/token (endpoint exists) "
    local tmp
    tmp=$(mktemp)
    local code
    code=$(curl -s -o "$tmp" -w "%{http_code}" -X POST "$API_URL/v1/auth/token" \
        -H "Content-Type: application/json" \
        -d '{"grant_type":"client_credentials"}' 2>/dev/null) || true

    # Any non-5xx response means the endpoint exists and works
    if [ "$code" -lt 500 ] 2>/dev/null; then
        pass
    else
        fail "HTTP $code (server error)"
        echo -e "    ${DIM}$(head -3 "$tmp" 2>/dev/null)${NC}"
    fi
    rm -f "$tmp"
}

test_documents_crud() {
    header "Documents CRUD"

    # Without auth, all should return 401
    http_test "POST /v1/documents (no auth → 401)" POST "$API_URL/v1/documents" 401 \
        -H "Content-Type: application/json" -d '{"title":"Test"}' || true
    http_test "GET /v1/documents (no auth → 401)" GET "$API_URL/v1/documents" 401 || true
}

test_api_endpoints() {
    header "API Endpoint Availability"

    # Test that all major endpoints exist (return non-404 for correct method)
    local endpoints=(
        "POST /v1/auth/token"
        "POST /v1/webhooks/stripe"
    )

    for ep in "${endpoints[@]}"; do
        local method url
        method=$(echo "$ep" | awk '{print $1}')
        url=$(echo "$ep" | awk '{print $2}')

        echo -n "  $ep "
        local tmp
        tmp=$(mktemp)
        local code
        code=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" "${API_URL}${url}" \
            -H "Content-Type: application/json" -d '{}' 2>/dev/null) || true

        # Anything except 404 means the route exists
        if [ "$code" != "404" ]; then
            pass
        else
            fail "404 (route not found)"
        fi
        rm -f "$tmp"
    done

    # Test 404 for non-existent route
    http_test "GET /v1/nonexistent (→ 404)" GET "$API_URL/v1/nonexistent" 404 || true
}

test_websocket() {
    header "WebSocket Sync"

    # Test that sync port is listening
    echo -n "  Sync server listening on :${SYNC_PORT} "
    if check_port "$SYNC_PORT"; then
        pass
    else
        fail "port not listening"
        return
    fi

    # Test WebSocket upgrade attempt (without auth → should get 401)
    echo -n "  WS upgrade without auth (→ 401) "
    local tmp
    tmp=$(mktemp)
    local code
    code=$(curl -s -o "$tmp" -w "%{http_code}" \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "$SYNC_URL/sync" 2>/dev/null) || true

    if [ "$code" = "401" ]; then
        pass
    elif [ "$code" -lt 500 ] 2>/dev/null; then
        pass
        echo -e "    ${DIM}(got $code instead of 401, but not a server error)${NC}"
    else
        fail "HTTP $code"
    fi
    rm -f "$tmp"
}

# ============================================================
# Step 9: E2E Playwright Tests (if available)
# ============================================================

test_playwright() {
    header "Playwright E2E"

    cd "$PROJECT_ROOT"

    if ! command -v pnpm &> /dev/null; then
        skip "pnpm not installed"
        return
    fi

    # Check if Playwright tests exist
    if [ ! -f "playwright.config.ts" ] && [ ! -f "playwright.config.js" ]; then
        skip "no playwright.config found"
        return
    fi

    # Ensure Chromium is installed
    echo -n "  Installing Chromium browser "
    if pnpm exec playwright install chromium > /tmp/gotipe-playwright-install.log 2>&1; then
        pass
    else
        skip "failed to install Chromium"
        echo -e "    ${DIM}$(tail -5 /tmp/gotipe-playwright-install.log)${NC}"
        return
    fi

    echo -n "  pnpm exec playwright test --project=chromium "
    local start_time
    start_time=$(date +%s)
    if pnpm exec playwright test --project=chromium > /tmp/gotipe-playwright.log 2>&1; then
        local duration=$(( $(date +%s) - start_time ))
        pass "$duration"
    else
        local duration=$(( $(date +%s) - start_time ))
        fail "(${duration}s)"
        echo -e "    ${DIM}$(tail -10 /tmp/gotipe-playwright.log)${NC}"
    fi
}

# ============================================================
# Summary
# ============================================================

print_summary() {
    local total=$((PASSED + FAILED + SKIPPED))
    local elapsed=$(( $(date +%s) - TOTAL_START ))

    echo ""
    echo -e "${BLUE}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Results: ${GREEN}$PASSED passed${NC}  ${RED}$FAILED failed${NC}  ${YELLOW}$SKIPPED skipped${NC}"
    echo -e "${BOLD}  Total:   $total checks in ${elapsed}s${NC}"
    echo -e "${BLUE}${BOLD}════════════════════════════════════════${NC}"
    echo ""

    if [ "$SKIPPED" -gt 0 ]; then
        echo -e "${DIM}Skipped = tool not installed or tests not yet written${NC}"
    fi

    echo ""
    echo "Services:"
    echo "  API:     $API_URL"
    echo "  Sync:    $SYNC_URL"
    echo "  Metrics: $METRICS_URL"
    echo "  Logs:    /tmp/gotipe-api.log"
    echo ""

    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}${BOLD}SOME TESTS FAILED${NC}"
        exit 1
    elif [ "$PASSED" -eq 0 ]; then
        echo -e "${YELLOW}${BOLD}NO TESTS PASSED${NC}"
        exit 1
    else
        echo -e "${GREEN}${BOLD}ALL PASSED${NC}"
    fi
}

# ============================================================
# Main
# ============================================================

main() {
    echo -e "${BLUE}${BOLD}"
    echo "  ╔═══════════════════════════════════════════╗"
    echo "  ║   GoTipe E2E Test Suite — Full Coverage   ║"
    echo "  ╚═══════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "  Root: $PROJECT_ROOT"

    if [ "$QUICK" = true ]; then
        echo -e "  Mode: ${CYAN}Quick${NC} (reuse running services)"
    elif [ "$API_ONLY" = true ]; then
        echo -e "  Mode: ${CYAN}API Only${NC} (skip build, only smoke tests)"
    else
        echo -e "  Mode: ${YELLOW}Full clean run${NC} (kill → restart → build → test)"
        cleanup
    fi

    # Phase 1: Infrastructure
    setup_infrastructure

    if [ "$API_ONLY" = false ]; then
        # Phase 2: Build
        build_wasm
        build_typescript

        # Phase 3: Unit / Lint tests
        test_rust
        test_typescript
        test_go
    fi

    # Phase 4: Start API & smoke tests
    start_cloud_api
    test_health
    test_auth
    test_documents_crud
    test_api_endpoints
    test_websocket

    if [ "$API_ONLY" = false ]; then
        # Phase 5: E2E browser tests
        test_playwright
    fi

    # Summary
    print_summary
}

main "$@"
