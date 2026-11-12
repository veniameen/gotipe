# Optional export module notices

This package's GoTipe bindings, document layout and PDF/OOXML renderer are MIT
licensed. The WebAssembly binary also contains maintained format and font
libraries from Cargo.lock, including pdf-writer, HarfRust, read-fonts, subsetter,
Unicode bidi/segmentation, image codecs, Deflate and ZIP. Their original license
texts, source URLs, versions and hashes are in `licenses/cargo/inventory.json`
and its sibling files. `licenses/dependencies.md` summarizes this resolved graph.
No Typst compiler or citationberg code is linked.

Bundled fonts retain their original licenses and names: Libertinus Serif
(SIL OFL 1.1), New Computer Modern (GUST Font License 1.0), DejaVu Sans Mono
(Bitstream Vera/DejaVu licenses), and Noto Emoji (SIL OFL 1.1). The original
font notices and file hashes are in `licenses/fonts/`. The first three families
were copied unchanged from the published typst-assets 0.15.1 archive; its name
is retained solely as the provenance of those original assets and notices.
Noto Emoji source: https://github.com/google/fonts/tree/main/ofl/notoemoji.

Regenerate and verify current dependency/font notices with
`scripts/collect-rust-licenses.py` and its `--check` mode. Generated directories
contain only the current graph; removed dependencies' notices are not carried
forward into new distributions. This does not alter any project's license.
