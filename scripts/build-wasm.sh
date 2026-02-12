#!/bin/bash
# scripts/build-wasm.sh — Build WASM + optimize + size budget check
set -euo pipefail

WASM_OUT="packages/wasm/pkg"
MAX_GZIP_SIZE=819200  # 800KB gzip budget (comrak + ammonia add ~300KB)

echo "=== Building WASM ==="
wasm-pack build crates/gotipe-wasm \
  --target web \
  --out-dir "../../${WASM_OUT}" \
  --release

echo "=== Optimizing WASM ==="
if command -v wasm-opt &> /dev/null; then
  WASM_OPT_FLAGS="-Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext --enable-mutable-globals"
  if wasm-opt "${WASM_OUT}/gotipe_wasm_bg.wasm" $WASM_OPT_FLAGS -o "${WASM_OUT}/gotipe_wasm_bg.wasm" 2>/dev/null; then
    echo "  wasm-opt applied"
  else
    echo "  wasm-opt failed, keeping unoptimized build"
  fi
else
  echo "  wasm-opt not found, skipping optimization"
fi

# Size report
echo "=== WASM Size ==="
RAW_SIZE=$(wc -c < "${WASM_OUT}/gotipe_wasm_bg.wasm")
GZIP_SIZE=$(gzip -c "${WASM_OUT}/gotipe_wasm_bg.wasm" | wc -c)

if command -v numfmt &> /dev/null; then
    echo "  Raw:  $(numfmt --to=iec ${RAW_SIZE})"
    echo "  Gzip: $(numfmt --to=iec ${GZIP_SIZE})"
else
    echo "  Raw:  ${RAW_SIZE} bytes"
    echo "  Gzip: ${GZIP_SIZE} bytes"
fi

# Check size budget
if [ "${GZIP_SIZE}" -gt "${MAX_GZIP_SIZE}" ]; then
  echo "ERROR: WASM gzip size exceeds budget (${GZIP_SIZE} > ${MAX_GZIP_SIZE})"
  exit 1
fi

echo "=== WASM build complete ==="
