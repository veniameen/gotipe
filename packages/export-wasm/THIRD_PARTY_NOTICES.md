# Optional export module notices

This package's GoTipe bindings are MIT licensed. The WebAssembly binary also
contains Typst 0.15.1 and typst-pdf 0.15.1 (Apache-2.0), the ZIP 9 codec (MIT),
and their Cargo.lock dependencies. Full direct compiler and font license texts
are in `licenses/`; transitive dependency inventory is maintained alongside them.

Bundled fonts from typst-assets 0.15.1 keep their original licenses and names:
Libertinus Serif (SIL OFL 1.1), New Computer Modern (GUST Font License 1.0),
DejaVu Sans Mono (Bitstream Vera/DejaVu licenses). Noto Emoji is SIL OFL 1.1.
The typst-assets NOTICE reproduces their copyright and permission texts.

Noto Emoji source: https://github.com/google/fonts/tree/main/ofl/notoemoji
The font file is unmodified. It is embedded only in this optional exporter.

The current normal/build Cargo graph and unchanged dependency notices are in
`licenses/cargo/inventory.json` and its sibling files. The older top-level
license collection is a conservative superset retained with the font notices.
Regenerate current graph notices with `scripts/collect-rust-licenses.py`.

Some upstream crate archives omit their repository license files. Their original
notices are copied from the exact Git revision recorded by `.cargo_vcs_info.json`
under `licenses/upstream/`. `config/rust-upstream-notices.json` records the source
URLs, revisions and SHA-256 values; collection validates them before packaging.
Glidesort supplies its license declaration in README.md, retained unchanged next
to the full Apache-2.0 license text already included in this distribution.
