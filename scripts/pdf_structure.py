"""Independent tagged-PDF graph, content ownership and reading-order validation."""
import collections
import re
import xml.etree.ElementTree as ET
from pypdf.generic import IndirectObject, decode_pdfdocencoding


def resolved(value):
    return value.get_object() if hasattr(value, "get_object") else value


def reference(value):
    if not isinstance(value, IndirectObject):
        value = getattr(value, "indirect_reference", None)
    return (value.idnum, value.generation) if value is not None else None


def validate_structure(reader, fixture, fragments):
    failures = []
    catalog = reader.trailer["/Root"]
    if not resolved(catalog.get("/MarkInfo", {})).get("/Marked"):
        failures.append("PDF does not declare tagged content")
    metadata = resolved(catalog.get("/Metadata"))
    try:
        xml = ET.fromstring(metadata.get_data()) if metadata else None
        if xml is None or (xml.tag != "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF" and xml.find(".//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF") is None):
            failures.append("Missing XMP RDF metadata stream")
    except Exception as error:
        failures.append(f"Invalid XMP metadata: {error}")
    tree = resolved(catalog.get("/StructTreeRoot"))
    if not tree:
        return failures + ["Missing PDF structure tree"]
    parent_tree = {}
    def number_tree(node):
        node = resolved(node)
        numbers = node.get("/Nums", [])
        for index in range(0, len(numbers), 2):
            parent_tree[int(numbers[index])] = resolved(numbers[index + 1])
        for child in node.get("/Kids", []):
            number_tree(child)
    number_tree(tree["/ParentTree"])
    pages = {reference(page): page for page in reader.pages}
    page_mcids = {}
    text_by_mcid = collections.defaultdict(str)
    glyph_text = collections.defaultdict(str)
    actual_owners = set()
    annotations = {}
    for page_key, page in pages.items():
        seen = set()
        stack = []
        replacements = []
        def before(operator, arguments, cm, tm):
            if operator == b"BDC":
                properties = resolved(arguments[1])
                if not hasattr(properties, "get"):
                    properties = resolved(resolved(page["/Resources"]).get("/Properties", {}).get(properties, {}))
                mcid = properties.get("/MCID")
                if mcid is not None:
                    mcid = int(mcid)
                    if mcid in seen:
                        failures.append(f"Duplicate MCID {mcid} on page {page_key}")
                    seen.add(mcid)
                stack.append(mcid)
                actual = properties.get("/ActualText")
                replacements.append(actual is not None)
                if actual is not None and not any(replacements[:-1]):
                    if isinstance(actual, bytes):
                        actual = actual.decode("utf-16") if actual.startswith((b"\xfe\xff", b"\xff\xfe")) else decode_pdfdocencoding(actual)
                    owner = next((item for item in reversed(stack) if item is not None), None)
                    if owner is not None:
                        actual_owners.add((page_key, owner))
                        text_by_mcid[(page_key, owner)] += str(actual)
            elif operator == b"BMC":
                stack.append(None)
                replacements.append(False)
            elif operator == b"EMC":
                if not stack:
                    failures.append(f"Unbalanced marked content on page {page_key}")
                else:
                    stack.pop()
                    replacements.pop()
        def text(value, cm, tm, font, size):
            owner = next((item for item in reversed(stack) if item is not None), None)
            if owner is not None and not any(replacements):
                glyph_text[(page_key, owner)] += value
        page.extract_text(visitor_operand_before=before, visitor_text=text)
        if stack:
            failures.append(f"Unclosed marked content on page {page_key}")
        page_mcids[page_key] = seen
        for annotation in page.get("/Annots", []):
            value = resolved(annotation)
            if value.get("/Subtype") == "/Link":
                annotations[reference(annotation)] = (page_key, value)
    for owner, value in glyph_text.items():
        if owner not in actual_owners:
            text_by_mcid[owner] = value
    roles = collections.Counter()
    table_spans = collections.Counter()
    decimal_lists = 0
    alt_texts = []
    bindings = {}
    object_bindings = {}
    reading = []
    visited = set()
    def bind(mcid, page_key, owner):
        pair = (page_key, int(mcid))
        if page_key not in pages or int(mcid) not in page_mcids.get(page_key, set()):
            failures.append(f"Structure references absent page/MCID: {pair}")
        if pair in bindings:
            failures.append(f"MCID has multiple structure owners: {pair}")
        bindings[pair] = owner
        reading.append(text_by_mcid[pair])
    def walk(value, parent, inherited_page=None):
        nonlocal decimal_lists
        if isinstance(value, list):
            for item in value:
                walk(item, parent, inherited_page)
            return
        key = reference(value)
        value = resolved(value)
        if isinstance(value, int):
            bind(value, inherited_page, parent)
            return
        if not hasattr(value, "get"):
            failures.append(f"Invalid structure child: {value!r}")
            return
        page_key = reference(value.get("/Pg")) or inherited_page
        if value.get("/Type") == "/MCR":
            bind(value["/MCID"], page_key, parent)
            return
        if value.get("/Type") == "/OBJR":
            object_key = reference(value.get("/Obj"))
            object_bindings[object_key] = (page_key, parent)
            return
        if key in visited:
            failures.append(f"Repeated/cyclic structure node: {key}")
            return
        visited.add(key)
        if reference(value.get("/P")) != parent:
            failures.append(f"Incorrect structure parent: {key}")
        role = str(value.get("/S", ""))
        roles[role] += 1
        attributes = resolved(value.get("/A", []))
        if not isinstance(attributes, list):
            attributes = [attributes]
        for attribute in attributes:
            attribute = resolved(attribute)
            if attribute.get("/O") == "/Table" and role in ("/TD", "/TH"):
                span = (int(attribute.get("/ColSpan", 1)), int(attribute.get("/RowSpan", 1)))
                if span != (1, 1):
                    table_spans[span] += 1
            if attribute.get("/O") == "/List" and attribute.get("/ListNumbering") == "/Decimal":
                decimal_lists += 1
        if value.get("/Alt"):
            alt_texts.append(str(value["/Alt"]))
        if "/K" in value:
            walk(value["/K"], key, page_key)
    walk(tree.get("/K", []), reference(tree))
    for page_key, ids in page_mcids.items():
        page = pages[page_key]
        parents = parent_tree.get(page.get("/StructParents"), [])
        for mcid in ids:
            owner = bindings.get((page_key, mcid))
            if owner is None:
                failures.append(f"Unowned marked content: {page_key}/{mcid}")
            if not isinstance(parents, list) or mcid >= len(parents) or reference(parents[mcid]) != owner:
                failures.append(f"ParentTree/MCID mismatch: {page_key}/{mcid}")
    for key, (page_key, annotation) in annotations.items():
        binding = object_bindings.get(key)
        if not binding or binding[0] != page_key:
            failures.append(f"Link annotation lacks page-correct OBJR: {key}")
        elif reference(parent_tree.get(annotation.get("/StructParent"))) != binding[1]:
            failures.append(f"Link annotation ParentTree mismatch: {key}")
    required = {"/Document"}
    expected_spans = collections.Counter()
    expected_decimal_lists = 0
    def inspect_blocks(blocks):
        nonlocal expected_decimal_lists
        mapping = {"paragraph": ["/P"], "bulletList": ["/L", "/LI", "/Lbl", "/LBody"],
                   "orderedList": ["/L", "/LI", "/Lbl", "/LBody"], "todoList": ["/L", "/LI", "/Lbl", "/LBody"],
                   "table": ["/Table", "/TR"], "tableCell": ["/TD"], "codeBlock": ["/Code"],
                   "blockquote": ["/BlockQuote"], "image": ["/Figure"], "file": ["/Link"], "embed": ["/Link"]}
        for block in blocks:
            required.update(mapping.get(block["type"], []))
            if block["type"] == "orderedList":
                expected_decimal_lists += 1
            if block["type"] in ("tableCell", "tableHeader"):
                attrs = block.get("attrs", {})
                span = (attrs.get("colspan", 1), attrs.get("rowspan", 1))
                if span != (1, 1):
                    expected_spans[span] += 1
            if block["type"] == "heading":
                required.add("/H" + str(block.get("attrs", {}).get("level", 1)))
            if block["type"] == "image" and block.get("attrs", {}).get("alt") not in (None, "", *alt_texts):
                failures.append(f"Missing Figure Alt: {block['attrs']['alt']}")
            inspect_blocks(block.get("children", []))
    inspect_blocks(fixture["document"]["blocks"])
    if table_spans != expected_spans:
        failures.append(f"Tagged table spans changed: {dict(table_spans)} != {dict(expected_spans)}")
    if decimal_lists != expected_decimal_lists:
        failures.append("Ordered list numbering semantics missing")
    for role in sorted(required):
        if not roles[role]:
            failures.append(f"Missing semantic structure role: {role}")
    expected_markers = []
    for fragment in fragments(fixture["document"]["blocks"]):
        expected_markers.extend(re.findall(r"\b[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+\b", fragment))
    logical_text = re.sub(r"\s+", "", "".join(reading))
    cursor = 0
    for marker in expected_markers:
        offset = logical_text.find(marker, cursor)
        if offset < 0:
            failures.append(f"Structure reading order lost/moved marker: {marker[:100]}")
            break
        cursor = offset + len(marker)
    return failures
