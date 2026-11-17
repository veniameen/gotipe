# GoTipe — Структура репозитория

> **PDF: историческое предложение.** Упоминания Typst/docx-rs, оценки размеров и
> возможностей ниже не описывают текущий backend. GoTipe владеет PDF layout и
> OOXML rendering; актуальны [контракт экспорта](development/export-contract.md)
> и [политика зависимостей](development/dependencies.md).

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

## Обзор

GoTipe — monorepo с Rust workspace (crates/) и TypeScript packages (packages/). Build tooling: Cargo для Rust, Turborepo для TypeScript, wasm-pack для WASM bridge.

```
gotipe/
├── .github/
│   └── workflows/
│       ├── ci.yml                # PR checks: lint, test, build
│       ├── release.yml           # npm publish (crates не публикуются)
│       └── wasm-build.yml        # WASM build + size check
│
├── crates/                       # Rust workspace
│   ├── gotipe-core/              # Document model, schema, transforms, commands
│   ├── gotipe-schema/            # Schema DSL, validation engine
│   ├── gotipe-crdt/              # CRDT engine, sync protocol, awareness
│   ├── gotipe-ai/                # AI context builder, provider interface
│   ├── gotipe-export/            # HTML, Markdown, PDF (typst), DOCX (docx-rs)
│   └── gotipe-wasm/              # wasm-bindgen exports
│
├── packages/                     # TypeScript packages (Turborepo)
│   │
│   │ # ── MIT (Open-Source) ──────────────────────────
│   ├── core/                     # @gotipe/core — JS bindings + editor manager
│   ├── wasm/                     # @gotipe/wasm — WASM pkg wrapper
│   ├── react/                    # @gotipe/react — React adapter (useEditor, EditorContent)
│   ├── vue/                      # @gotipe/vue — Vue 3 adapter
│   ├── svelte/                   # @gotipe/svelte — Svelte 5 adapter
│   ├── solid/                    # @gotipe/solid — Solid adapter
│   ├── collaboration/            # @gotipe/collaboration — CRDT sync client
│   ├── ai/                       # @gotipe/ai — AI integration layer
│   ├── export/                   # @gotipe/export — JS export API
│   │
│   │ # ── Commercial (лицензия) ──────────────────────
│   ├── block-editor/             # @gotipe/block-editor — Notion-like React UI
│   │   ├── src/
│   │   │   ├── editor.tsx        # <BlockEditor> main component
│   │   │   ├── license.ts        # JWT license verification (offline)
│   │   │   ├── components/       # SlashMenu, BubbleMenu, BlockToolbar, DragHandle, etc.
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── LICENSE.md            # Commercial license
│   ├── block-editor-vue/         # @gotipe/block-editor-vue — Notion-like Vue UI
│   ├── ai-ui/                    # @gotipe/ai-ui — AI ghost text + command palette UI
│   └── theme/                    # @gotipe/theme — design tokens, themes (minimal/modern/notion/docs)
│
├── apps/
│   ├── playground/               # Demo app (Vite + React)
│   ├── docs/                     # Documentation site (Mintlify, docs.gotipe.com)
│   └── cloud/                    # Go API + sync server
│       ├── cmd/
│       │   ├── api/              # REST API server
│       │   └── sync/             # WebSocket sync server
│       ├── internal/
│       │   ├── auth/
│       │   ├── storage/
│       │   └── sync/
│       ├── go.mod
│       └── go.sum
│
├── infra/                         # Server infrastructure (Production)
│   ├── docker-compose.yml         # Production: API, Postgres, Valkey, pgBouncer, Caddy
│   ├── docker-compose.dev.yml     # Development: + MinIO (local S3)
│   ├── .env.example               # Template for server .env (no secrets)
│   ├── Caddyfile                  # Reverse proxy + auto TLS config
│   ├── postgres/
│   │   └── postgresql.conf        # PostgreSQL tuning (shared_buffers, work_mem)
│   ├── pgbouncer/
│   │   └── pgbouncer.ini          # Connection pooling config
│   ├── valkey/
│   │   └── valkey.conf            # Cache config (maxmemory, AOF)
│   ├── prometheus.yml             # Monitoring config
│   └── scripts/
│       ├── setup-server.sh        # Full server provisioning + GitHub auth
│       ├── deploy.sh              # Zero-downtime deploy + auto-migrations
│       ├── restore.sh             # Disaster recovery (pgBackRest → R2)
│       └── backup-cron            # Cron schedule for automated backups
│
├── scripts/
│   ├── build-wasm.sh             # Build WASM + optimize
│   ├── dev.sh                    # Start dev environment
│   └── release.sh                # Release workflow
│
├── Cargo.toml                    # Rust workspace root
├── Cargo.lock
├── turbo.json                    # Turborepo config
├── package.json                  # Root package.json (workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .rustfmt.toml
├── .eslintrc.js
├── .prettierrc
├── LICENSE                       # MIT (headless core)
└── LICENSE-COMMERCIAL.md         # Commercial license (block-editor, theme, ai-ui)
```

---

## Rust Workspace

### Cargo.toml (root)

```toml
[workspace]
resolver = "2"
members = [
    "crates/gotipe-core",
    "crates/gotipe-schema",
    "crates/gotipe-crdt",
    "crates/gotipe-ai",
    "crates/gotipe-export",
    "crates/gotipe-wasm",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/gotipe/gotipe"

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "2.0"
wasm-bindgen = "0.2"
uuid = { version = "1.0", features = ["v4"] }

# CRDT
# (custom implementation, Loro-inspired)

# Export
typst = "0.12"
docx-rs = "0.4"
comrak = "0.31"          # CommonMark + GFM parser
ammonia = "4.0"          # HTML sanitizer

# Compression
zstd = "0.13"

# Testing
criterion = "0.5"
proptest = "1.5"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true

[profile.bench]
opt-level = 3
lto = true
```

### Crate Dependencies Graph

```
gotipe-schema
    │
    ▼
gotipe-core ──────► gotipe-crdt
    │                    │
    ├──────► gotipe-ai   │
    │                    │
    ▼                    ▼
gotipe-export       gotipe-wasm ◄── all crates
```

| Crate | External Dependencies | Size (est.) |
|-------|----------------------|-------------|
| gotipe-schema | serde, serde_json, thiserror | ~5KB |
| gotipe-core | gotipe-schema, serde, uuid | ~30KB |
| gotipe-crdt | gotipe-core, zstd | ~60KB |
| gotipe-ai | gotipe-core, serde | ~10KB |
| gotipe-export | gotipe-core, typst, docx-rs, comrak, ammonia | ~300KB |
| gotipe-wasm | all above, wasm-bindgen, serde-wasm-bindgen | WASM output |

---

## TypeScript Packages

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Root package.json

```json
{
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "build:wasm": "bash scripts/build-wasm.sh",
    "clean": "turbo run clean && cargo clean"
  },
  "devDependencies": {
    "turbo": "^2.3",
    "typescript": "^5.7",
    "vitest": "^2.1",
    "eslint": "^9.15",
    "@biomejs/biome": "^1.9",
    "tsup": "^8.3"
  }
}
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Package Structure (каждый TS package)

```
packages/core/
├── src/
│   ├── index.ts              # Public API exports
│   ├── editor.ts             # createEditor, GoTipeEditor class
│   ├── types/
│   │   ├── block.ts          # Block, TextSpan, Mark types
│   │   ├── state.ts          # EditorState, Transaction
│   │   ├── extension.ts      # Extension, defineExtension
│   │   └── events.ts         # Event types
│   ├── extensions/
│   │   ├── paragraph.ts
│   │   ├── heading.ts
│   │   ├── bold.ts
│   │   └── ...
│   ├── presets.ts            # MinimalPreset, DefaultPreset, FullPreset
│   └── wasm-bridge.ts       # WASM initialization and bridge
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

### tsup.config.ts (build config, каждый пакет)

```typescript
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@gotipe/wasm'],
  treeshake: true,
  minify: false,
});
```

### Package Dependencies

```
@gotipe/wasm          ← WASM pkg (no TS deps)                    [MIT]
    │
    ▼
@gotipe/core          ← @gotipe/wasm                             [MIT]
    │
    ├──► @gotipe/react          ← @gotipe/core, react            [MIT]
    ├──► @gotipe/vue            ← @gotipe/core, vue              [MIT]
    ├──► @gotipe/svelte         ← @gotipe/core, svelte           [MIT]
    ├──► @gotipe/solid          ← @gotipe/core, solid-js         [MIT]
    ├──► @gotipe/collaboration  ← @gotipe/core                   [MIT]
    ├──► @gotipe/ai             ← @gotipe/core                   [MIT]
    ├──► @gotipe/export         ← @gotipe/core, @gotipe/wasm     [MIT]
    │
    ├──► @gotipe/block-editor   ← @gotipe/react, @gotipe/theme   [COMMERCIAL]
    ├──► @gotipe/block-editor-vue ← @gotipe/vue, @gotipe/theme   [COMMERCIAL]
    ├──► @gotipe/ai-ui          ← @gotipe/ai, @gotipe/react      [COMMERCIAL]
    └──► @gotipe/theme          ← (standalone CSS)                [COMMERCIAL]
```

### Bundle Sizes (target, gzip)

| Package | ESM (gzip) | Peer Dependencies | License |
|---------|-----------|-------------------|---------|
| @gotipe/wasm | ~255KB | — | MIT |
| @gotipe/core | ~15KB | @gotipe/wasm | MIT |
| @gotipe/react | ~8KB | @gotipe/core, react >=18 | MIT |
| @gotipe/vue | ~7KB | @gotipe/core, vue >=3.4 | MIT |
| @gotipe/svelte | ~6KB | @gotipe/core, svelte >=5 | MIT |
| @gotipe/solid | ~5KB | @gotipe/core, solid-js >=1.8 | MIT |
| @gotipe/collaboration | ~10KB | @gotipe/core | MIT |
| @gotipe/ai | ~5KB | @gotipe/core | MIT |
| @gotipe/export | ~3KB (без WASM lazy) | @gotipe/core, @gotipe/wasm | MIT |
| @gotipe/block-editor | ~25KB | @gotipe/react, @gotipe/theme | Commercial |
| @gotipe/block-editor-vue | ~22KB | @gotipe/vue, @gotipe/theme | Commercial |
| @gotipe/ai-ui | ~8KB | @gotipe/ai, @gotipe/react | Commercial |
| @gotipe/theme | ~12KB | — | Commercial |

---

## Apps

### Playground (Demo)

```
apps/playground/
├── src/
│   ├── main.tsx
│   ├── App.tsx               # Editor demo with all features
│   ├── examples/
│   │   ├── basic.tsx         # Minimal editor
│   │   ├── collaboration.tsx # Real-time collab demo
│   │   ├── ai.tsx           # AI features demo
│   │   └── custom.tsx       # Custom extensions
│   └── styles.css
├── index.html
├── vite.config.ts
└── package.json
```

```json
{
  "name": "@gotipe/playground",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@gotipe/core": "workspace:*",
    "@gotipe/react": "workspace:*",
    "@gotipe/collaboration": "workspace:*",
    "@gotipe/ai": "workspace:*",
    "react": "^19.0",
    "react-dom": "^19.0"
  },
  "devDependencies": {
    "vite": "^6.0",
    "@vitejs/plugin-react": "^4.3"
  }
}
```

### Documentation Site (Mintlify)

Hosted на Mintlify (docs.gotipe.com). Автодеплой через GitHub integration. API Reference автогенерируется из OpenAPI spec.

```
docs-site/
├── mint.json                   # Mintlify config (navigation, colors, API base URL, openapi)
├── introduction.mdx            # Overview, feature highlights
├── quickstart.mdx              # Getting Started
├── guides/
│   ├── extensions.mdx          # Extensions Guide
│   ├── react.mdx               # React adapter
│   ├── vue.mdx                 # Vue 3 adapter
│   ├── svelte.mdx              # Svelte 5 adapter
│   ├── solid.mdx               # Solid adapter
│   ├── collaboration.mdx       # Real-time collaboration
│   ├── comments.mdx            # Comments & Track Changes
│   ├── versions.mdx            # Version History
│   ├── ai.mdx                  # AI integration
│   ├── export.mdx              # Export/Import
│   ├── theming.mdx             # Theming & Design Tokens
│   ├── i18n.mdx                # i18n & Accessibility
│   ├── self-hosted.mdx         # Self-hosted deployment
│   ├── cloud.mdx               # GoTipe Cloud
│   └── security.mdx            # Security
├── api-reference/              # Auto-generated from openapi.yaml
├── migration/
│   ├── from-tiptap.mdx
│   ├── from-prosemirror.mdx
│   ├── from-lexical.mdx
│   └── from-slate.mdx
└── images/                     # Screenshots, diagrams
```

### Cloud (Go)

```
apps/cloud/
├── cmd/
│   ├── api/
│   │   └── main.go          # REST API entrypoint
│   └── sync/
│       └── main.go          # WebSocket sync entrypoint
├── internal/
│   ├── auth/
│   │   ├── apikey.go
│   │   ├── jwt.go
│   │   └── middleware.go
│   ├── storage/
│   │   ├── postgres.go
│   │   ├── r2.go            # Cloudflare R2 client (S3-compatible)
│   │   └── valkey.go
│   ├── sync/
│   │   ├── server.go        # WebSocket handler
│   │   ├── room.go          # Room management
│   │   └── persistence.go
│   ├── ai/
│   │   ├── proxy.go         # LLM proxy
│   │   └── providers.go
│   └── export/
│       ├── service.go        # Export queue
│       └── worker.go
├── migrations/
│   ├── 001_initial.up.sql
│   └── 001_initial.down.sql
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

```
# go.mod
module github.com/gotipe/cloud

go 1.23

require (
    github.com/gorilla/websocket v1.5.3
    github.com/jackc/pgx/v5 v5.7.2
    github.com/valkey-io/valkey-go v1.0.49
    github.com/aws/aws-sdk-go-v2 v1.32.7
    github.com/golang-jwt/jwt/v5 v5.2.1
    github.com/prometheus/client_golang v1.20.5
)
```

---

## Tooling

### WASM Build

```bash
#!/bin/bash
# scripts/build-wasm.sh
set -euo pipefail

WASM_OUT="packages/wasm/pkg"

echo "=== Building WASM ==="
wasm-pack build crates/gotipe-wasm \
  --target web \
  --out-dir "../../${WASM_OUT}" \
  --release

echo "=== Optimizing WASM ==="
wasm-opt "${WASM_OUT}/gotipe_wasm_bg.wasm" \
  -Oz \
  -o "${WASM_OUT}/gotipe_wasm_bg.wasm"

# Size report
echo "=== WASM Size ==="
RAW_SIZE=$(wc -c < "${WASM_OUT}/gotipe_wasm_bg.wasm")
GZIP_SIZE=$(gzip -c "${WASM_OUT}/gotipe_wasm_bg.wasm" | wc -c)
echo "  Raw:  $(numfmt --to=iec ${RAW_SIZE})"
echo "  Gzip: $(numfmt --to=iec ${GZIP_SIZE})"

# Check size budget (500KB gzip max)
MAX_SIZE=512000
if [ "${GZIP_SIZE}" -gt "${MAX_SIZE}" ]; then
  echo "ERROR: WASM size exceeds budget (${GZIP_SIZE} > ${MAX_SIZE})"
  exit 1
fi

echo "=== Done ==="
```

### Dev Workflow

```bash
# scripts/dev.sh — Start full dev environment
#!/bin/bash
set -euo pipefail

# 1. Build WASM (if changed)
if [ crates/ -nt packages/wasm/pkg/gotipe_wasm_bg.wasm ]; then
  echo "WASM outdated, rebuilding..."
  bash scripts/build-wasm.sh
fi

# 2. Start TypeScript packages in watch mode
pnpm turbo run dev &

# 3. Start Go sync server (if developing cloud features)
if [ -f apps/cloud/go.mod ]; then
  cd apps/cloud && go run cmd/sync/main.go &
fi

wait
```

### Common Commands

| Command | Description |
|---------|------------|
| `pnpm install` | Install all dependencies |
| `pnpm build:wasm` | Build WASM from Rust |
| `pnpm dev` | Start all packages in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests (Rust + TS) |
| `pnpm lint` | Lint all code |
| `cargo test` | Run Rust tests |
| `cargo bench` | Run Rust benchmarks |
| `cargo clippy` | Rust linter |
| `cargo fmt` | Format Rust code |
| `cd apps/cloud && go test ./...` | Run Go tests |

---

## CI/CD

### GitHub Actions: CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2

      - name: Format check
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings

      - name: Tests
        run: cargo test --all

      - name: Benchmarks (compile only)
        run: cargo bench --no-run

  wasm:
    runs-on: ubuntu-latest
    needs: rust
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2

      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

      - name: Install wasm-opt
        run: |
          npm install -g binaryen

      - name: Build WASM
        run: bash scripts/build-wasm.sh

      - name: Upload WASM artifact
        uses: actions/upload-artifact@v4
        with:
          name: wasm-pkg
          path: packages/wasm/pkg/

  typescript:
    runs-on: ubuntu-latest
    needs: wasm
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Download WASM artifact
        uses: actions/download-artifact@v4
        with:
          name: wasm-pkg
          path: packages/wasm/pkg/

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test

  go:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/cloud
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache-dependency-path: apps/cloud/go.sum

      - name: Vet
        run: go vet ./...
      - name: Test
        run: go test ./... -race -count=1
      - name: Build
        run: go build ./cmd/...
```

### GitHub Actions: Release

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4

      # Build WASM
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
      - run: npm install -g binaryen
      - run: bash scripts/build-wasm.sh

      # Build & publish TS packages
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm -r publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # Rust crates are not published to crates.io: they ship compiled
      # inside @gotipe/wasm and @gotipe/export-wasm (D-71)

      # Create GitHub Release
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

### GitHub Actions: Cloud Deploy

```yaml
# .github/workflows/deploy-cloud.yml
name: Deploy Cloud

on:
  push:
    branches: [main]
    paths:
      - 'apps/cloud/**'
      - 'migrations/**'

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/cloud
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: gotipe
          POSTGRES_PASSWORD: gotipe
          POSTGRES_DB: gotipe_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
      valkey:
        image: valkey/valkey:8-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "valkey-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache-dependency-path: apps/cloud/go.sum
      - name: Run migrations
        run: go run cmd/api/main.go migrate up
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable
      - name: Test with race detector
        run: go test ./... -race -count=1 -coverprofile=coverage.out
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable
          VALKEY_URL: redis://localhost:6379/0
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: apps/cloud/coverage.out

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: apps/cloud
          file: apps/cloud/Dockerfile
          push: true
          tags: |
            ghcr.io/gotipe/cloud-api:${{ github.sha }}
            ghcr.io/gotipe/cloud-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/gotipe
            bash infra/scripts/deploy.sh ${{ github.sha }}
```

### Cloud Dockerfile (multi-stage)

```dockerfile
# apps/cloud/Dockerfile
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /gotipe-cloud ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
COPY --from=builder /gotipe-cloud /usr/local/bin/gotipe-cloud
COPY migrations /migrations
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/healthz || exit 1
ENTRYPOINT ["gotipe-cloud"]
CMD ["serve"]
```

### Vercel: Landing Page (gotipe.com)

```
apps/landing/ подключен как Vercel project.

Push to main (paths: apps/landing/**, packages/**) → Vercel автодеплой
  Vercel turbo-ignore скипает билд если app не изменился

PR → Vercel preview deployments (automatic)
```

### Mintlify: Documentation (docs.gotipe.com)

```
Push to main (paths: docs-site/**) → Mintlify автодеплой
  OpenAPI spec из apps/cloud/api/openapi.yaml → API Reference автогенерация
```

### GitHub Actions: Infrastructure Deploy

```yaml
# .github/workflows/deploy-infra.yml
name: Deploy Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infra/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # requires approve в GitHub UI
    steps:
      - uses: actions/checkout@v4
      - name: Deploy infrastructure
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/gotipe/repo
            git pull
            cp infra/docker-compose.yml /opt/gotipe/
            cd /opt/gotipe
            docker compose up -d
```

### Deployment Flow

> Исторический план. 2026-11-17 владелец оставил Cloud только локальным: `deploy-cloud.yml` и
> `deploy-infra.yml` удалены; сайт собирается в GitHub Actions и выкладывается на Cloudflare Pages
> (`deploy-site.yml`).

```
git push to main
  │
  ├── apps/cloud/** → GitHub Actions (deploy-cloud.yml)
  │     1. go test → docker build → ghcr.io/gotipe/cloud-api:sha
  │     2. ssh server "bash infra/scripts/deploy.sh $SHA"
  │        → migrate up (напрямую к Postgres) → zero-downtime deploy → health check
  │
  ├── apps/landing/** или packages/** → Vercel автодеплой
  │     turbo-ignore скипает билд если app не затронут
  │     PR → preview deployment
  │
  ├── docs-site/** → Mintlify автодеплой
  │
  ├── infra/** → GitHub Actions (deploy-infra.yml)
  │     environment: production (requires approve в GitHub UI)
  │     ssh server "git pull && docker compose up -d"
  │
  ├── crates/** → GitHub Actions CI (rust + wasm jobs)
  │
  └── docs/** → Ничего (design docs, не деплоятся)
```

### Новый сервер (полная автоматизация)

```
scp -r infra/ deploy@NEW_IP:/opt/gotipe/
ssh deploy@NEW_IP "bash /opt/gotipe/scripts/setup-server.sh"
  → Docker, firewall, deploy user
  → SSH ключ + GitHub авторизация
  → GitHub Secrets обновлены (IP + SSH key)
  → Репа склонирована
  → Все сервисы запущены (только Go Cloud — landing на Vercel, docs на Mintlify)
  → Бэкапы настроены (pgBackRest → R2)
  → Автодеплой работает

Обновить DNS в Cloudflare → новый IP
```

---

## Linting & Formatting

### Rust

```toml
# .rustfmt.toml
edition = "2021"
max_width = 100
tab_spaces = 4
use_field_init_shorthand = true
use_try_shorthand = true
```

### TypeScript

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

---

## Testing Strategy

| Layer | Tool | What |
|-------|------|------|
| Rust unit tests | `cargo test` | Core logic, transforms, CRDT |
| Rust property tests | proptest | Random document mutations, CRDT convergence |
| Rust benchmarks | criterion | Performance regression |
| WASM integration | wasm-pack test | WASM bindings correctness |
| TypeScript unit | vitest | Editor manager, extensions, adapters |
| TypeScript E2E | Playwright | Full editor UX in browser |
| Go unit tests | `go test` | API, sync server |
| Go integration | testcontainers | PostgreSQL, Valkey integration |

### Test Commands

```bash
# All Rust tests
cargo test --all

# Specific crate
cargo test -p gotipe-core

# Property tests (slow, thorough)
cargo test --all -- --ignored

# Benchmarks
cargo bench -p gotipe-core

# WASM tests (requires browser/Node)
wasm-pack test --node crates/gotipe-wasm

# TypeScript tests
pnpm test

# Specific package
pnpm --filter @gotipe/core test

# E2E
pnpm --filter @gotipe/playground test:e2e

# Go tests
cd apps/cloud && go test ./...

# Go with race detector
cd apps/cloud && go test -race ./...
```

---

## Связанные документы

- [01-architecture.md](01-architecture.md) — crate structure, package dependencies
- [03-editor-core.md](03-editor-core.md) — Rust crate details, WASM build config
- [10-cloud.md](10-cloud.md) — Go cloud app structure
- [12-release-plan.md](12-release-plan.md) — план реализации и релиза
