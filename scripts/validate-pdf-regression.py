"""Independent PDF acceptance: Poppler geometry/text and pypdf objects, never renderer internals."""
import argparse
import collections
import json
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET
from pypdf import PdfReader
from pdf_structure import validate_structure


def command(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def normalized(text):
    return re.sub(r"[\s\u202a-\u202e\u2066-\u2069]+", "", unicodedata.normalize("NFC", text)).replace("\u00ad", "")


def fragments(blocks):
    for block in blocks:
        content = block.get("content")
        if isinstance(content, str):
            yield content
        elif isinstance(content, list):
            for span in content:
                yield span["text"]
        attrs = block.get("attrs", {})
        if block["type"] == "image" and attrs.get("caption"):
            yield attrs["caption"]
        if block["type"] in ("file", "embed"):
            yield attrs.get("name") or attrs.get("url", "")
        yield from fragments(block.get("children", []))


def validate(path, fixture, require_producer=None):
    failures = []
    reader = PdfReader(path, strict=True)
    expected = fixture["expect"]
    producer = str((reader.metadata or {}).get("/Producer", ""))
    if require_producer and require_producer not in producer:
        failures.append(f"Unexpected PDF producer: {producer!r}")
    text = command("pdftotext", "-layout", str(path), "-")
    compact = normalized(text)
    raw_text = command("pdftotext", "-raw", str(path), "-")
    raw_compact = normalized(raw_text)
    exact_sources = [re.sub(r"[\u202a-\u202e\u2066-\u2069]", "", unicodedata.normalize("NFC", value)) for value in [text, raw_text]]
    for token in expected.get("exactTokens", []):
        if not any(unicodedata.normalize("NFC", token) in value for value in exact_sources):
            failures.append(f"Lost exact Unicode cluster or inserted spaces: {token!r}")
    for fragment in fragments(fixture["document"]["blocks"]):
        # Long multiline table cells can be read alongside neighboring columns.
        for line in fragment.splitlines():
            bidirectional = any(unicodedata.bidirectional(char) in ("R", "AL") for char in line)
            if normalized(line) not in compact and not (bidirectional and normalized(line) in raw_compact):
                failures.append(f"Missing text: {line[:100]!r}")
    if expected.get("firstPageText"):
        first_page = command("pdftotext", "-f", "1", "-l", "1", "-layout", str(path), "-")
        for marker in expected["firstPageText"]:
            if marker not in first_page:
                failures.append(f"Oversized table fragment leaves usable first-page space blank: {marker}")
    if len(reader.pages) < expected.get("minPages", 1):
        failures.append(f"Too few pages: {len(reader.pages)}")
    dimensions = expected.get("pagePoints", [595.276, 841.89])
    links = []
    internal = collections.defaultdict(set)
    page_numbers = {page.indirect_reference.idnum: number for number, page in enumerate(reader.pages, 1)}
    named = reader.trailer["/Root"].get("/Dests")
    named = named.get_object() if named is not None else {}
    images = 0
    image_placements = []
    fixed_fonts = set()
    text_positions = []
    shapes = []
    for page_number, page in enumerate(reader.pages, 1):
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        if abs(width - dimensions[0]) > 1 or abs(height - dimensions[1]) > 1:
            failures.append(f"Wrong page dimensions: {width}x{height}")
        for font in page.get("/Resources", {}).get("/Font", {}).values():
            font = font.get_object()
            descriptor = font.get("/FontDescriptor")
            if not descriptor and font.get("/DescendantFonts"):
                descriptor = font["/DescendantFonts"][0].get_object().get("/FontDescriptor")
            if descriptor and int(descriptor.get_object().get("/Flags", 0)) & 1:
                name = str(descriptor.get_object().get("/FontName", "")).lstrip("/")
                fixed_fonts.add(re.sub(r"^[A-Za-z]{6}\+", "", name))
        path_points = []
        def visit_text(value, cm, tm, font, size):
            x = cm[0] * tm[4] + cm[2] * tm[5] + cm[4]
            y = height - (cm[1] * tm[4] + cm[3] * tm[5] + cm[5])
            text_positions.append((value.strip(), x, y, page_number))
        def visit_operator(operator, arguments, cm, tm):
            nonlocal path_points, images
            def point(x, y):
                return (cm[0] * float(x) + cm[2] * float(y) + cm[4],
                        height - (cm[1] * float(x) + cm[3] * float(y) + cm[5]))
            if operator == b"Do":
                resources = page.get("/Resources", {}).get("/XObject", {})
                image = resources.get(arguments[0])
                if image and image.get_object().get("/Subtype") == "/Image":
                    images += 1
                    points = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)]
                    xs, ys = zip(*points)
                    image_placements.append((min(xs), min(ys), max(xs), max(ys), page_number, width, height))
            if operator == b"m":
                path_points = [point(*arguments)]
            elif operator == b"l":
                path_points.append(point(*arguments))
            elif operator == b"re":
                x, y, w, h = map(float, arguments)
                path_points = [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)]
            elif operator in (b"S", b"s", b"f", b"f*", b"B", b"B*"):
                if path_points:
                    xs, ys = zip(*path_points)
                    shapes.append((min(xs), min(ys), max(xs), max(ys), page_number))
                path_points = []
        page.extract_text(visitor_text=visit_text, visitor_operand_before=visit_operator)
        for item in page.get("/Annots", []):
            annotation = item.get_object()
            action = annotation.get("/A", {})
            uri = str(action.get("/URI", ""))
            if uri:
                links.append(uri)
                if not uri.startswith(("https:", "http:", "mailto:", "tel:", "#")):
                    failures.append(f"Unsafe annotation URL: {uri}")
            if action.get("/S") in ("/JavaScript", "/Launch"):
                failures.append("Executable PDF action")
            if action.get("/S") == "/GoTo":
                # In-document links name a destination that must lead to a page of this file.
                name = str(action.get("/D", ""))
                destination = named.get(name) if name else None
                target = destination.get_object()[0] if destination is not None else None
                number = page_numbers.get(getattr(target, "idnum", None))
                if number is None:
                    failures.append(f"Dangling in-document link: {name!r}")
                else:
                    internal[name.lstrip("/")].add(number)
        literal_text = command("pdftotext", "-f", str(page_number), "-l", str(page_number), "-raw", str(path), "-") if expected.get("header") or expected.get("footer") else ""
        for field in ["header", "footer"]:
            if expected.get(field) and expected[field] not in literal_text:
                failures.append(f"Missing literal {field}: {expected[field]}")
    for uri in expected.get("links", []):
        if uri not in links:
            failures.append(f"Missing link annotation: {uri}")
    if "internalLinks" in expected or internal:
        wanted = sorted(expected.get("internalLinks", []))
        if sorted(internal) != wanted:
            failures.append(f"In-document links {sorted(internal)!r} != expected {wanted!r}")
        blocks = {}
        def index(items):
            for block in items:
                blocks[block["id"]] = block
                index(block.get("children", []))
        index(fixture["document"]["blocks"])
        for name, pages in internal.items():
            # The destination page shows the linked block's own text.
            own = normalized("".join(fragments([{**blocks[name], "children": []}]))) if name in blocks else None
            for number in pages:
                shown = normalized(command("pdftotext", "-f", str(number), "-l", str(number), str(path), "-"))
                if not own or own not in shown:
                    failures.append(f"In-document link {name!r} leads to page {number} without its block")
    if images < expected.get("imageCount", 0):
        failures.append(f"Missing embedded image: {images}")
    geometry = ET.fromstring(command("pdftotext", "-bbox-layout", str(path), "-"))
    ns = {"p": "http://www.w3.org/1999/xhtml"}
    margins = {"left": 72, "right": 72, "top": 72, "bottom": 72} | fixture["options"].get("margin", {})
    for x0, y0, x1, y1, page_number, width, height in image_placements:
        if x0 < margins["left"] - 1 or x1 > width - margins["right"] + 1 or y0 < margins["top"] - 1 or y1 > height - margins["bottom"] + 1:
            failures.append(f"Page {page_number} image overflow: {x0,y0,x1,y1}")
    all_words = []
    word_lines = []
    for number, page in enumerate(geometry.findall(".//p:page", ns), 1):
        width, height = float(page.attrib["width"]), float(page.attrib["height"])
        words = []
        for word in page.findall(".//p:word", ns):
            x0, y0, x1, y1 = (float(word.attrib[key]) for key in ["xMin", "yMin", "xMax", "yMax"])
            value = (word.text or "").strip()
            words.append((value, x0, y0, x1, y1, number))
            if x0 < -1 or y0 < -1 or x1 > width + 1 or y1 > height + 1:
                failures.append(f"Page {number} physical overflow: {value[:50]!r} {x0,y0,x1,y1}")
            is_header_footer = ((expected.get("header") and y1 < margins["top"])
                                or (expected.get("footer") and y0 > height - margins["bottom"]))
            if not is_header_footer and (y0 < margins["top"] - 6 or y1 > height - margins["bottom"] + 6):
                failures.append(f"Page {number} vertical body overflow: {value[:50]!r}")
            if not is_header_footer and (x0 < margins["left"] - 4 or x1 > width - margins["right"] + 4):
                failures.append(f"Page {number} horizontal body overflow: {value[:50]!r}")
        for line in page.findall(".//p:line", ns):
            word_lines.append([
                (unicodedata.normalize("NFC", (word.text or "").strip()),
                 float(word.attrib["xMin"]), float(word.attrib["xMax"]))
                for word in line.findall("p:word", ns)
            ])
        # Duplicate boxes commonly reveal repeated text drawn on top of itself.
        boxes = collections.Counter((word[0], round(word[1], 1), round(word[2], 1)) for word in words)
        if any(count > 1 for count in boxes.values()):
            failures.append(f"Page {number} duplicate text boxes")
        ordered = sorted(words, key=lambda word: word[2])
        for index, first in enumerate(ordered):
            for second in ordered[index + 1:]:
                if second[2] >= first[4]:
                    break
                intersection = max(0, min(first[3], second[3]) - max(first[1], second[1])) * max(0, min(first[4], second[4]) - max(first[2], second[2]))
                smaller = min((first[3] - first[1]) * (first[4] - first[2]), (second[3] - second[1]) * (second[4] - second[2]))
                if smaller > 0 and intersection > smaller * 0.25:
                    failures.append(f"Page {number} overlapping text: {first[0]!r} / {second[0]!r}")
        all_words.extend(words)
    for tokens in expected.get("wordBoxes", []):
        normalized_tokens = [unicodedata.normalize("NFC", token) for token in tokens]
        line = next((line for line in word_lines if [word[0] for word in line] == normalized_tokens), None)
        if line is None:
            actual_lines = [[word[0] for word in line] for line in word_lines]
            failures.append(
                f"Expected separate word boxes on one text line: {tokens!r}; actual: {actual_lines!r}"
            )
        elif any(word[2] <= word[1] for word in line) or any(
            second[1] <= first[1] or second[1] < first[2] - 0.5
            for first, second in zip(line, line[1:])
        ):
            failures.append(
                f"Word boxes do not have distinct ordered nonoverlapping positions: {line!r}"
            )
    if expected.get("columns"):
        positions = []
        for token in expected["columns"]:
            words = [word for word in all_words if word[0] == token]
            positions.append((words[0][1], words[0][2], words[0][5]) if words else
                             next(((text[1], text[2], text[3]) for text in text_positions if text[0] == token), None))
        left, right = positions
        if not left or not right or left[2] != right[2] or abs(left[1] - right[1]) > 5 or right[0] <= left[0] + 50:
            failures.append("Columns are not placed alongside one another")
    for tokens in expected.get("nearbyLines", []):
        lines = [next((word for word in all_words if word[0] == token), None) for token in tokens]
        for first, second in zip(lines, lines[1:]):
            if not first or not second:
                failures.append(f"Parallel lane did not preserve separate text lines: {tokens}")
                break
            if first[5] != second[5] or not 0 < second[2] - first[2] < 48:
                failures.append(f"Parallel lane rows are spaced by the neighboring image: {tokens}")
                break
    if expected.get("styles") or expected.get("syntaxTokens"):
        style_xml = ET.fromstring(command("pdftohtml", "-xml", "-hidden", "-stdout", "-i", str(path)))
        fonts = {font.attrib["id"]: font.attrib for font in style_xml.findall(".//fontspec")}
        texts = {"".join(node.itertext()).strip(): node for node in style_xml.findall(".//text")}
        for token in expected.get("syntaxTokens", []):
            candidates = [node for text, node in texts.items() if token in text.split()]
            if not any(fonts[node.attrib["font"]].get("color") not in (None, "#000000") for node in candidates):
                failures.append(f"Missing representative language syntax color: {token}")
    if expected.get("styles"):
        for token, tag in [("MARK-bold", "b"), ("MARK-italic", "i"), ("MARK-code-bold", "b"), ("MARK-code-italic", "i"), ("MARK-code-bold-italic", "b"), ("MARK-code-bold-italic", "i")]:
            if token not in texts or texts[token].find(".//" + tag) is None:
                failures.append(f"Missing {tag} typography on {token}")
        for token in ["const", "return", "// CODE-COMMENT"]:
            node = texts.get(token)
            if node is None or fonts[node.attrib["font"]].get("color") in (None, "#000000"):
                failures.append(f"Missing code syntax color: {token}")
        normal = fonts[texts["MARK-underline"].attrib["font"]]
        for token in ["MARK-superscript", "MARK-subscript"]:
            node = texts.get(token)
            if node is None or int(fonts[node.attrib["font"]]["size"]) >= int(normal["size"]) * 0.85:
                failures.append(f"Missing reduced script typography: {token}")
        for token in ["MARK-code", "MARK-code-bold", "MARK-code-italic", "MARK-code-bold-italic"]:
            family = re.sub(r"^[A-Za-z]{6}\+", "", fonts[texts[token].attrib["font"]].get("family", "")) if token in texts else ""
            if not family or not any(name.startswith(family) or family.startswith(name) for name in fixed_fonts):
                failures.append(f"Lost monospace mark: {token}")
        base = next((word for word in all_words if word[0] == "BASE"), None)
        superscript = next((word for word in all_words if word[0] == "SUP"), None)
        subscript = next((word for word in all_words if word[0] == "SUB"), None)
        if not base or not superscript or not subscript or (superscript[2] + superscript[4]) / 2 >= (base[2] + base[4]) / 2 - 1 or (subscript[2] + subscript[4]) / 2 <= (base[2] + base[4]) / 2 + 1:
            failures.append("Super/subscript lost baseline displacement")
        if fonts[texts["MARK-colors"].attrib["font"]].get("color") != "#c026d3":
            failures.append("Lost explicit text color")
        for token, low, high in [("MARK-underline", 0.55, 1.2), ("MARK-strikethrough", 0.2, 0.8)]:
            word = next((word for word in all_words if word[0] == token), None)
            if word:
                span = word[4] - word[2]
                candidates = [shape for shape in shapes if shape[4] == word[5] and shape[3] - shape[1] < 2.5
                              and word[2] + span * low <= shape[1] <= word[2] + span * high
                              and min(shape[2], word[3]) - max(shape[0], word[1]) >= (word[3] - word[1]) * 0.5]
                if not candidates:
                    failures.append(f"Missing visible mark line: {token}")
        colored = next((word for word in all_words if word[0] == "MARK-colors"), None)
        if colored and not any(shape[4] == colored[5] and shape[0] <= colored[1] + 1 and shape[2] >= colored[3] - 1
                               and shape[1] <= colored[2] + 2 and shape[3] >= colored[4] - 2 for shape in shapes):
            failures.append("Missing highlight background")
    headings = []
    def collect_headings(blocks):
        for block in blocks:
            if block["type"] == "heading":
                content = block.get("content") or []
                headings.append(("".join(span["text"] for span in content), block.get("attrs", {}).get("level", 1)))
            collect_headings(block.get("children", []))
    collect_headings(fixture["document"]["blocks"])
    expected_outline = []
    parents = []
    for title, level in headings:
        while parents and parents[-1][1] >= level:
            parents.pop()
        expected_outline.append((title, parents[-1][0] if parents else None))
        parents.append((title, level))
    actual_outline = []
    def visit_outline(nodes, parent=None):
        previous = parent
        for node in nodes:
            if isinstance(node, list):
                visit_outline(node, previous)
            else:
                title = str(node.title)
                actual_outline.append((title, parent))
                previous = title
    visit_outline(reader.outline)
    if actual_outline != expected_outline:
        failures.append(f"Heading outline mismatch: {actual_outline!r} != {expected_outline!r}")
    failures.extend(validate_structure(reader, fixture, fragments))
    return {"producer": producer, "pages": len(reader.pages), "words": len(all_words), "images": images, "links": links + sorted(f"#{name}" for name in internal), "text": compact, "layout": [(word[0], *[round(value, 2) for value in word[1:]]) for word in all_words], "failures": failures}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--require-producer")
    args = parser.parse_args()
    corpus = json.loads((args.directory / "corpus.json").read_text())
    exports = json.loads((args.directory / "exports.json").read_text())
    fixtures = {fixture["id"]: fixture for fixture in corpus["cases"]}
    reports = []
    for result in exports:
        report = dict(id=result["id"], engine=result["engine"], failures=[])
        if not result["passed"]:
            report["failures"].append(result.get("error", "Expected an explicit export failure"))
        elif result.get("file"):
            try:
                report.update(validate(args.directory / result["file"], fixtures[result["id"]], args.require_producer))
            except Exception as error:
                report["failures"].append(str(error))
        reports.append(report)
    for fixture in fixtures.values():
        peers = [report for report in reports if report["id"] == fixture["id"] and "text" in report]
        if len(peers) > 1:
            for peer in peers[1:]:
                if peer["text"] != peers[0]["text"]:
                    peer["failures"].append("Native/WASM extracted text mismatch")
                if any(peer[key] != peers[0][key] for key in ["pages", "images", "links"]):
                    peer["failures"].append("Native/WASM page/image/link mismatch")
                reference = peers[0]["layout"]
                candidate = peer["layout"]
                if len(reference) != len(candidate) or any(a[0] != b[0] or any(abs(x - y) > 0.15 for x, y in zip(a[1:], b[1:])) for a, b in zip(reference, candidate)):
                    peer["failures"].append("Native/WASM geometric layout mismatch")
    for report in reports:
        report.pop("text", None)
        report.pop("layout", None)
        print(json.dumps(report, ensure_ascii=False))
    (args.directory / "validation.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    if any(report["failures"] for report in reports):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
