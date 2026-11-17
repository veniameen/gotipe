# Size of the main WASM

Decision of 2026-11-15 (D-171): a single limit for the main `gotipe_wasm_bg.wasm`:
325 KiB (332,800 bytes) gzip level 9. The only owner of the value is
`config/wasm-budget.json`; the local build, CI, and the benchmark use
`scripts/check-wasm-size.mjs`. Exceeding it fails the check.

Measurement: the `scripts/build-wasm.sh` build in the main folder on 2026-11-15 22:31, after the
last edit of the module's crates (D-82, 294bba3, 22:12), came to 825,703 bytes uncompressed and
302,506 bytes gzip. The limit is that number plus 10% (332,757), rounded to 325 KiB: headroom of
about 30 KB for growth of collaboration, history, and comments in the core. The previous 600 KiB
was left over from the module with HTML and Markdown output and sanitizing (below); after D-73 the headroom was more than
300 KB and the limit constrained nothing: the module could have doubled again without touching the check.
Loading and the public contract do not change; only the threshold at which the build
fails changes. Growth beyond 325 KiB requires a new decision with a measurement, as before.

Decision of 2026-11-10 (superseded): a limit of 600 KiB (614400 bytes) gzip.

Previously the local build allowed 800 KiB and CI allowed 500 KiB. These incompatible
values were not confirmed by a single working build. After removing the external
Markdown parser and replacing the PII regex with a built-in scanner, the main binary takes
588399 bytes gzip (Node zlib, level 9). That is a measurement, not a pass against the former 512000-byte limit.
600 KiB leaves about 26 KB for fixes without disabling existing APIs.

The decision of 2026-11-10 kept the synchronous HTML sanitizer in the module: moving it to a separate
asynchronous load to hit the former number would have changed the contract and loading for consumers.
D-73 (fe8834c) reversed that: `export_html`, `export_markdown`, and `sanitize_html` were removed
from the module, HTML, Markdown, and sanitizing are done by `@gotipe/core` with the same code on both engines,
and `gotipe-wasm` no longer depends on `gotipe-export` and ammonia. The main binary dropped from
604,875 to 298,588 bytes gzip (measured at the time of the move); a build from the main folder on 2026-11-15
gives 300,804 (`scripts/check-wasm-size.mjs`). The limit of 614400 bytes was not changed then: only
a decision with a new measurement changes it, and that was made on 2026-11-15 (D-171, above). PDF/DOCX belong to a separate lazy export WASM; their size is not part
of the initial editor budget. Removing validation to save size is not acceptable. An additional
`wasm-opt --converge` gave no significant gain.

Size is checked on the final file, not on the Cargo tree. Changing the limit
requires a new measurement and an explanation of the impact on loading and the public contract.
Ordinary growth of the binary is not an automatic reason to raise the budget.
