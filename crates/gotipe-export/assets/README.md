# Export fonts

The exporter embeds original font files without relying on system fonts or network access.
GoTipe owns document layout; these files do not include the Typst compiler.

Seventeen unchanged font files were copied from the published `typst-assets 0.15.1`
archive: Libertinus Serif (six styles, SIL OFL 1.1), New Computer Modern
(four text and three math styles, GUST Font License 1.0), and DejaVu Sans Mono
(four styles, Bitstream Vera/DejaVu licenses). The archive's original
`typst-assets-LICENSE` and `typst-assets-NOTICE` are retained byte-for-byte;
the NOTICE contains the individual font copyright and permission texts.

Noto Emoji is the unchanged variable font from
https://github.com/google/fonts/tree/main/ofl/notoemoji under SIL OFL 1.1.
Its original license is `NotoEmoji-OFL.txt`.

`inventory.json` records the source archive, revision and SHA-256 of every copied
font and notice. The font filenames and internal names remain unchanged.
`scripts/collect-rust-licenses.py` verifies all font bytes and copies the original
notices and inventory into the optional WASM package. Cloud ships that same
notice directory with the native converter.
