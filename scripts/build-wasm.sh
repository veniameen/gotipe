#!/bin/bash
# scripts/build-wasm.sh — Build WASM + optimize + size budget check
set -euo pipefail

WASM_OUT="packages/wasm/pkg"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
export BINARYEN_CORES="${BINARYEN_CORES:-2}"

if ! command -v wasm-opt >/dev/null 2>&1; then
  echo "wasm-opt is required for the canonical release build (install Binaryen)." >&2
  exit 1
fi

echo "=== Building WASM ==="
wasm-pack build crates/gotipe-wasm \
  --target web \
  --out-dir "../../${WASM_OUT}" \
  --release -- --locked

echo "=== Optimizing WASM ==="
wasm-opt "${WASM_OUT}/gotipe_wasm_bg.wasm" \
  -Oz --enable-bulk-memory --enable-nontrapping-float-to-int \
  --enable-sign-ext --enable-mutable-globals \
  -o "${WASM_OUT}/gotipe_wasm_bg.wasm"

node scripts/check-wasm-size.mjs

echo "=== WASM build complete ==="
