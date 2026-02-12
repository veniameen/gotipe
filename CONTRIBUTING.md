# Contributing to GoTipe

Thank you for contributing to GoTipe! This guide covers our development workflow.

## Setup

```bash
# Clone
git clone https://github.com/gotipe/gotipe.git
cd gotipe

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install Node.js (22+) and pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Install Go (1.23+)
# https://go.dev/doc/install

# Start dev infrastructure
docker compose -f infra/docker-compose.dev.yml up -d

# Build WASM
bash scripts/build-wasm.sh

# Install TS dependencies and build
pnpm install && pnpm build

# Start dev
bash scripts/dev.sh
```

## Development Workflow

1. Create a branch: `git checkout -b feat/my-feature`
2. Make changes
3. Run tests:
   - Rust: `cargo test --workspace && cargo clippy --workspace -- -D warnings`
   - TypeScript: `pnpm test && pnpm typecheck && pnpm lint`
   - Go: `cd apps/cloud && go test ./... -race`
4. Create a changeset: `pnpm changeset`
5. Submit PR

## Code Standards

- **Rust:** Follow `cargo clippy` and `cargo fmt` rules
- **TypeScript:** Follow Biome linter rules
- **Go:** Follow `go vet` and `gofmt` rules
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Testing Requirements

- Rust: >=80% coverage, property tests for CRDT
- TypeScript: >=75% coverage
- Go: >=70% coverage, race detector enabled

## Pull Request Process

1. All CI checks must pass
2. At least one maintainer approval required
3. Squash merge to main
4. Changeset required for any user-facing change

## Architecture Rules

- **Block-first model** — Documents are Block arrays, not ProseMirror node trees
- **WASM owns state** — EditorState lives in Rust/WASM. JS gets ViewState
- **Extension = everything** — All block types, marks, and behaviors are extensions
- **CSS tokens** — Use `--gt-*` variables, `.gotipe-*` classes
- **No JSON WebSocket** — Binary CRDT protocol with zstd compression

## License

By contributing, you agree that your contributions will be licensed under:
- MIT License for core packages
- Commercial License for block-editor packages

See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-COMMERCIAL](LICENSE-COMMERCIAL).
