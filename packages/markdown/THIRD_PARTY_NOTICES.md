# Named character reference data

`src/grammar/entities.json` contains the 2,125 named character mappings used by
GoTipe's own Markdown parser. The table is identical to CPython v3.13.9
`Lib/html/entities.py`'s `html5` dictionary after removing trailing semicolons from
keys. No Python parser implementation is included. Python's original license and
copyright notices are reproduced in `licenses/named-entities-Python-LICENSE.txt`.

Verified source: https://github.com/python/cpython/blob/v3.13.9/Lib/html/entities.py

Source SHA-256: `d9c65fb2828dbc1f3e399058a341d51e9375ec5bca95a8e92599c41bd5b78bde`

CPython identifies the underlying standard as the WHATWG HTML named character
references: https://html.spec.whatwg.org/multipage/named-characters.html

The JSON table is also embedded in the Rust Markdown implementation and the
core WebAssembly package. Only the data serialization/key normalization changes;
the mappings are unchanged.
