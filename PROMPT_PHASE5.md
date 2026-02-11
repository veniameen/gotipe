# GoTipe — Промт для реализации Фазы 5: CI/CD

## Контекст

Ты реализуешь CI/CD пайплайны GoTipe — 6 GitHub Actions workflows для полного цикла: CI проверки, релиз, деплой cloud, security аудит, E2E тесты, бенчмарки. Фазы 1-4 (Rust, TS, Go, инфраструктура) уже реализованы.

Фаза 5 = `.github/workflows/`. Каждый workflow должен быть **полностью рабочим** — корректные triggers, caching, artifacts, secrets, conditions.

## Обязательные правила

1. **Все workflows используют `actions/checkout@v4`** и pinned action versions
2. **Rust caching:** `Swatinem/rust-cache@v2`. TS caching: `pnpm/action-setup@v4` + `actions/setup-node@v4` с `cache: pnpm`
3. **WASM artifact:** `wasm` job builds WASM → uploads artifact → `typescript` job downloads artifact. НЕ rebuild WASM в TS job
4. **Go tests с race detector:** `go test ./... -race -count=1`. Integration tests с services (Postgres 17 + Valkey 8)
5. **Property tests в CI:** `cargo test -- --ignored` запускает proptest (CRDT convergence, JSON roundtrip)
6. **WASM size budget:** ≤500KB gzip. CI проверяет `gzip -c | wc -c` и fail если превышен
7. **Bundle size tracking:** Per-package gzip size check в CI. Report в PR comment
8. **Benchmark regression:** Criterion compare vs main, fail on >10% regression
9. **Release order:** npm publish в dependency order. Cargo publish: schema → core → crdt → comments → versioning → ai → export → wasm
10. **Security:** `cargo audit`, `cargo deny check licenses`, `npm audit --audit-level=high`, CycloneDX SBOM generation
11. **Deploy:** Docker build → push GHCR → SSH → `deploy.sh` (zero-downtime)
12. **E2E:** Playwright Chrome + Firefox + Safari. `data-gotipe-*` selectors. Screenshots on failure

## Порядок реализации

```
5.1 ci.yml → 5.2 release.yml → 5.3 deploy-cloud.yml → 5.4 security.yml → 5.5 e2e.yml → 5.6 benchmark.yml
```

---

## 5.1 `.github/workflows/ci.yml`

Main CI pipeline: Rust → WASM → TypeScript → Go. Runs on PR and push to main.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  RUST_BACKTRACE: 1
  CARGO_TERM_COLOR: always

jobs:
  # ============================================================
  # Rust: fmt, clippy, tests, property tests, bench compile
  # ============================================================
  rust:
    name: Rust
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
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Unit tests
        run: cargo test --workspace

      - name: Property tests (proptest)
        run: cargo test --workspace -- --ignored
        timeout-minutes: 10

      - name: Benchmarks (compile only)
        run: cargo bench --no-run

  # ============================================================
  # WASM: build + optimize + size check + artifact upload
  # ============================================================
  wasm:
    name: WASM Build
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

      - name: Install wasm-opt (binaryen)
        run: npm install -g binaryen

      - name: Build WASM
        run: bash scripts/build-wasm.sh

      - name: WASM size report
        run: |
          WASM_FILE="packages/wasm/pkg/gotipe_wasm_bg.wasm"
          RAW_SIZE=$(wc -c < "$WASM_FILE")
          GZIP_SIZE=$(gzip -c "$WASM_FILE" | wc -c)
          echo "### WASM Size Report" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Size |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|------|" >> $GITHUB_STEP_SUMMARY
          echo "| Raw | $(numfmt --to=iec $RAW_SIZE) |" >> $GITHUB_STEP_SUMMARY
          echo "| Gzip | $(numfmt --to=iec $GZIP_SIZE) |" >> $GITHUB_STEP_SUMMARY

          # Fail if over budget
          MAX_SIZE=512000
          if [ "$GZIP_SIZE" -gt "$MAX_SIZE" ]; then
            echo "::error::WASM gzip size ($GZIP_SIZE) exceeds budget ($MAX_SIZE)"
            exit 1
          fi

      - name: Upload WASM artifact
        uses: actions/upload-artifact@v4
        with:
          name: wasm-pkg
          path: packages/wasm/pkg/
          retention-days: 1

  # ============================================================
  # TypeScript: lint, typecheck, build, test, bundle size
  # ============================================================
  typescript:
    name: TypeScript
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

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint (Biome)
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

      - name: Build all packages
        run: pnpm build

      - name: Unit tests (Vitest)
        run: pnpm test

      - name: Bundle size check
        run: |
          echo "### Bundle Size Report" >> $GITHUB_STEP_SUMMARY
          echo "| Package | ESM (gzip) | Budget |" >> $GITHUB_STEP_SUMMARY
          echo "|---------|-----------|--------|" >> $GITHUB_STEP_SUMMARY

          check_size() {
            local pkg=$1
            local budget=$2
            local file="packages/${pkg}/dist/index.mjs"
            if [ -f "$file" ]; then
              local size=$(gzip -c "$file" | wc -c)
              local status="✅"
              if [ "$size" -gt "$budget" ]; then
                status="❌"
              fi
              echo "| @gotipe/${pkg} | $(numfmt --to=iec $size) | $(numfmt --to=iec $budget) ${status} |" >> $GITHUB_STEP_SUMMARY
              if [ "$size" -gt "$budget" ]; then
                echo "::error::@gotipe/${pkg} bundle size ($size) exceeds budget ($budget)"
                return 1
              fi
            fi
            return 0
          }

          FAILED=0
          check_size "core" 20480 || FAILED=1         # 20KB
          check_size "react" 10240 || FAILED=1         # 10KB
          check_size "vue" 8192 || FAILED=1            # 8KB
          check_size "svelte" 7168 || FAILED=1         # 7KB
          check_size "solid" 6144 || FAILED=1          # 6KB
          check_size "collaboration" 12288 || FAILED=1 # 12KB
          check_size "ai" 6144 || FAILED=1             # 6KB
          check_size "export" 4096 || FAILED=1         # 4KB

          if [ "$FAILED" -eq 1 ]; then
            exit 1
          fi

  # ============================================================
  # Go: vet, test (race detector), build
  # ============================================================
  go:
    name: Go
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

      - name: Vet
        run: go vet ./...

      - name: Run migrations
        run: go run ./cmd/api migrate up
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable

      - name: Tests (race detector)
        run: go test ./... -race -count=1 -coverprofile=coverage.out
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable
          VALKEY_URL: redis://localhost:6379/0

      - name: Build
        run: go build ./cmd/...

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: go-coverage
          path: apps/cloud/coverage.out
          retention-days: 7
```

---

## 5.2 `.github/workflows/release.yml`

Release pipeline: build everything → publish npm + crates.io → GitHub Release.

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  id-token: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for changelog

      # ── Rust + WASM ──
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2

      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

      - name: Install wasm-opt
        run: npm install -g binaryen

      - name: Build WASM
        run: bash scripts/build-wasm.sh

      # ── TypeScript ──
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all TS packages
        run: pnpm build

      - name: Run tests
        run: pnpm test

      # ── Publish npm packages (dependency order) ──
      - name: Publish npm packages
        run: |
          # Publish in dependency order
          PACKAGES=(
            "wasm"
            "core"
            "react"
            "vue"
            "svelte"
            "solid"
            "collaboration"
            "ai"
            "export"
            "block-editor"
            "block-editor-vue"
            "ai-ui"
            "theme"
          )
          for pkg in "${PACKAGES[@]}"; do
            echo "Publishing @gotipe/${pkg}..."
            pnpm --filter "@gotipe/${pkg}" publish --access public --no-git-checks --provenance || true
          done
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # ── Publish Rust crates (dependency order) ──
      - name: Publish Rust crates
        run: |
          CRATES=(
            "gotipe-schema"
            "gotipe-core"
            "gotipe-crdt"
            "gotipe-comments"
            "gotipe-versioning"
            "gotipe-ai"
            "gotipe-export"
            "gotipe-wasm"
          )
          for crate in "${CRATES[@]}"; do
            echo "Publishing ${crate}..."
            cargo publish -p "$crate" --allow-dirty || true
            sleep 30  # crates.io rate limit
          done
        env:
          CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_TOKEN }}

      # ── Generate changelog ──
      - name: Generate changelog
        id: changelog
        run: |
          # Extract version from tag
          VERSION=${GITHUB_REF_NAME#v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT

          # Generate changelog from changesets or commits
          if command -v changeset &> /dev/null; then
            npx changeset status --output=CHANGELOG_ENTRY.md
          else
            git log --pretty=format:"- %s (%h)" $(git describe --tags --abbrev=0 HEAD^)..HEAD > CHANGELOG_ENTRY.md
          fi

      # ── GitHub Release ──
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          body_path: CHANGELOG_ENTRY.md
```

---

## 5.3 `.github/workflows/deploy-cloud.yml`

Auto-deploy Go Cloud on push to main (when apps/cloud/ changed).

```yaml
# .github/workflows/deploy-cloud.yml
name: Deploy Cloud

on:
  push:
    branches: [main]
    paths:
      - 'apps/cloud/**'
      - 'infra/**'

concurrency:
  group: deploy-cloud
  cancel-in-progress: false  # Never cancel active deploys

jobs:
  # ── Test ──
  test:
    name: Test
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
        run: go run ./cmd/api migrate up
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable

      - name: Test with race detector
        run: go test ./... -race -count=1 -coverprofile=coverage.out
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable
          VALKEY_URL: redis://localhost:6379/0

  # ── Build & Deploy ──
  build-and-deploy:
    name: Build & Deploy
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

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push API image
        uses: docker/build-push-action@v6
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

---

## 5.4 `.github/workflows/security.yml`

Security audits: dependency vulnerabilities, license compliance, SBOM generation.

```yaml
# .github/workflows/security.yml
name: Security

on:
  pull_request:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 06:00 UTC

permissions:
  contents: read
  security-events: write

jobs:
  rust-audit:
    name: Rust Security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Install cargo-audit
        run: cargo install cargo-audit

      - name: Install cargo-deny
        run: cargo install cargo-deny

      - name: Audit dependencies
        run: cargo audit

      - name: Check licenses
        run: cargo deny check licenses

      - name: Check advisories
        run: cargo deny check advisories

      - name: Generate Rust SBOM (CycloneDX)
        run: |
          cargo install cargo-cyclonedx
          cargo cyclonedx --all
        continue-on-error: true

      - name: Upload Rust SBOM
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: rust-sbom
          path: "**/bom.xml"
          retention-days: 30

  npm-audit:
    name: npm Security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Audit dependencies
        run: pnpm audit --audit-level=high

      - name: Generate npm SBOM (CycloneDX)
        run: |
          npx @cyclonedx/cyclonedx-npm --output-file npm-sbom.json
        continue-on-error: true

      - name: Upload npm SBOM
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: npm-sbom
          path: npm-sbom.json
          retention-days: 30

  go-audit:
    name: Go Security
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

      - name: Install govulncheck
        run: go install golang.org/x/vuln/cmd/govulncheck@latest

      - name: Vulnerability check
        run: govulncheck ./...

      - name: Verify dependencies
        run: go mod verify
```

---

## 5.5 `.github/workflows/e2e.yml`

End-to-end tests with Playwright: Chrome + Firefox + Safari.

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    name: E2E (${{ matrix.browser }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
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

      # ── WASM Build ──
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2
      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
      - name: Install wasm-opt
        run: npm install -g binaryen
      - name: Build WASM
        run: bash scripts/build-wasm.sh

      # ── TypeScript Build ──
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps ${{ matrix.browser }}

      # ── Go API Server ──
      - uses: actions/setup-go@v5
        with:
          go-version: '1.23'
          cache-dependency-path: apps/cloud/go.sum

      - name: Run migrations
        run: cd apps/cloud && go run ./cmd/api migrate up
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable

      - name: Start API server
        run: |
          cd apps/cloud && go run ./cmd/api &
          sleep 5
        env:
          DATABASE_URL: postgres://gotipe:gotipe@localhost:5432/gotipe_test?sslmode=disable
          VALKEY_URL: redis://localhost:6379/0
          LISTEN_ADDR: ":8080"
          ENV: "test"

      # ── Playwright Tests ──
      - name: Run E2E tests
        run: pnpm exec playwright test --project=${{ matrix.browser }}
        env:
          GOTIPE_API_URL: http://localhost:8080

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.browser }}
          path: |
            test-results/
            playwright-report/
          retention-days: 7
```

---

## 5.6 `.github/workflows/benchmark.yml`

Performance benchmarks: Criterion + WASM size + bundle size tracking. Comment results on PR.

```yaml
# .github/workflows/benchmark.yml
name: Benchmarks

on:
  pull_request:
    paths:
      - 'crates/**'
      - 'packages/**'

permissions:
  pull-requests: write

jobs:
  criterion:
    name: Rust Benchmarks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          ref: main
          path: main-branch

      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2

      # Run benchmarks on PR branch
      - name: Benchmark PR branch
        run: cargo bench --workspace -- --save-baseline pr

      # Run benchmarks on main branch
      - name: Benchmark main branch
        run: |
          cd main-branch
          cargo bench --workspace -- --save-baseline main

      # Compare results
      - name: Compare benchmarks
        id: bench
        run: |
          cargo install critcmp
          OUTPUT=$(critcmp main pr --threshold 10)
          echo "result<<EOF" >> $GITHUB_OUTPUT
          echo "$OUTPUT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

          # Check for >10% regression
          if echo "$OUTPUT" | grep -q "regressed"; then
            echo "regression=true" >> $GITHUB_OUTPUT
          else
            echo "regression=false" >> $GITHUB_OUTPUT
          fi

      - name: Comment PR with benchmark results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const body = `### Benchmark Results

            \`\`\`
            ${{ steps.bench.outputs.result }}
            \`\`\`

            ${{ steps.bench.outputs.regression == 'true' && '⚠️ **Performance regression detected (>10%)**' || '✅ No significant regression' }}

            #### Performance Targets
            | Metric | Target | Status |
            |--------|--------|--------|
            | Keystroke processing | <1ms | - |
            | CRDT op generation | <0.5ms | - |
            | Binary encoding | <0.1ms | - |
            | Throughput | >10K ops/sec | - |
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body
            });

  wasm-size:
    name: WASM Size Tracking
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2

      - name: Install wasm-pack + wasm-opt
        run: |
          curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
          npm install -g binaryen

      - name: Build WASM
        run: bash scripts/build-wasm.sh

      - name: WASM size breakdown
        id: wasm-size
        run: |
          WASM_FILE="packages/wasm/pkg/gotipe_wasm_bg.wasm"
          RAW=$(wc -c < "$WASM_FILE")
          GZIP=$(gzip -c "$WASM_FILE" | wc -c)

          echo "raw=$RAW" >> $GITHUB_OUTPUT
          echo "gzip=$GZIP" >> $GITHUB_OUTPUT

          # Per-crate size estimation (via feature flags)
          echo "### WASM Size Report" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Size |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|------|" >> $GITHUB_STEP_SUMMARY
          echo "| Raw | $(numfmt --to=iec $RAW) |" >> $GITHUB_STEP_SUMMARY
          echo "| Gzip | $(numfmt --to=iec $GZIP) |" >> $GITHUB_STEP_SUMMARY
          echo "| Budget | 500KB |" >> $GITHUB_STEP_SUMMARY

      - name: Comment PR with WASM size
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const raw = parseInt('${{ steps.wasm-size.outputs.raw }}');
            const gzip = parseInt('${{ steps.wasm-size.outputs.gzip }}');
            const budget = 512000;
            const status = gzip <= budget ? '✅' : '❌';

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `### WASM Size Report
            | Metric | Size |
            |--------|------|
            | Raw | ${(raw / 1024).toFixed(1)}KB |
            | Gzip | ${(gzip / 1024).toFixed(1)}KB |
            | Budget | 500KB ${status} |`
            });
```

---

## Верификация

```bash
# 1. Validate workflow syntax
# Push to branch → GitHub Actions должны запуститься без syntax errors

# 2. CI workflow covers all stacks
# - Rust: fmt + clippy + test + property tests + bench compile
# - WASM: build + size check + artifact
# - TypeScript: lint + typecheck + build + test + bundle size
# - Go: vet + test (race) + build

# 3. Release publishes in correct order
# npm: wasm → core → adapters → features → commercial
# Cargo: schema → core → crdt → ... → wasm

# 4. Deploy is zero-downtime
# deploy.sh: migrate → scale api=2 → health check → stop old → update sync/export

# 5. Security runs weekly + on PR
# cargo audit, cargo deny, npm audit, govulncheck

# 6. E2E runs on 3 browsers
# Playwright: chromium, firefox, webkit (parallel matrix)
```

---

## Подсказки

1. **WASM artifact sharing:** `wasm` job uploads, `typescript` job downloads. Это избегает двойной сборки WASM и гарантирует идентичный binary
2. **Property tests timeout:** `proptest` может работать долго — установлен `timeout-minutes: 10` чтобы не блокировать CI
3. **Go services:** CI запускает Postgres 17 + Valkey 8 как GitHub Actions services для integration tests
4. **Concurrency:** `ci.yml` отменяет предыдущий run при новом push. `deploy-cloud.yml` НИКОГДА не отменяет (active deploy нельзя прерывать)
5. **Release `--allow-dirty`:** cargo publish использует `--allow-dirty` потому что WASM build модифицирует workspace
6. **Benchmark comparison:** `critcmp` сравнивает baseline (main) vs PR. Порог >10% = предупреждение в PR comment
7. **SBOM:** CycloneDX format для compliance. Artifact хранится 30 дней
8. **E2E strategy:** `fail-fast: false` — один браузер fails, остальные продолжают (нужно видеть полную картину)
