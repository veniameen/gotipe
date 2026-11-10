#!/usr/bin/env bash
set -euo pipefail

# Optional typography/fonts stay in this separate module, never the editor core.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
wasm-pack build crates/gotipe-export-wasm \
  --target web \
  --out-dir ../../packages/export-wasm/pkg \
  --release -- --locked
