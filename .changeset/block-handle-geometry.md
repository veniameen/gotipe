---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

The block handle never covers what it stands beside. PageEditor's page keeps the handle's rail on
a narrow screen as BlockEditor's does, so «+» and the grip stand left of a task's box, a list's
marker and the text instead of over them; a container without room on the left gets no handle
rather than one pushed over the text. A block without text of its own puts its handle at the
first line it starts with: the top of an image (not its caption), a file's name, a link card's
site, the field of an empty one, the first cell of a table, Markdown kept as is. A centred
formula shows its handle from its left edge too. On a narrow page a table's row handle has its
whole room beside the handle's rail; without the rail the first column of an editable table makes
room for it. The counter under the document stands in the text column beside the rail, a file's
type and size stay on one line, and the block menu and «Turn into» wait hidden inside the screen
until they are measured, the submenu following its menu.
