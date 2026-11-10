"""Independent PDF/OOXML checks. Requires Poppler's pdfinfo and pdftotext."""
import argparse
import pathlib
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=pathlib.Path)
parser.add_argument("--title", default="Проверка & title")
options = parser.parse_args()
directory = options.directory
pdf = directory / "verified.pdf"
info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
assert "PDF version:" in info and "Pages:" in info, "Invalid PDF container"
text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
for expected in ["Проверка экспорта", "😀", "Вложенный текст", "Сохраняется целиком", "Колонка А", "Color Highlight", "Схема цветов", '#read("/etc/passwd")']:
    assert expected in text, f"PDF lost content: {expected}"

with zipfile.ZipFile(directory / "verified.docx") as archive:
    assert archive.testzip() is None, "Corrupt DOCX ZIP entry"
    for name in archive.namelist():
        if name.endswith((".xml", ".rels")):
            ET.fromstring(archive.read(name))
    document = ET.fromstring(archive.read("word/document.xml"))
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    content = "".join(n.text or "" for n in document.findall(".//w:t", ns))
    for expected in ["Проверка экспорта", "😀", "Вложенный текст", "Сохраняется целиком", "Колонка А", "Схема цветов"]:
        assert expected in content, f"DOCX lost content: {expected}"
    for element in ["tbl", "drawing", "b", "color", "shd"]:
        assert document.findall(f".//w:{element}", ns), f"DOCX lost {element}"
    images = [n for n in archive.namelist() if n.startswith("word/media/") and n.endswith(".png")]
    assert images and archive.read(images[0]).startswith(b"\x89PNG\r\n\x1a\n"), "Missing embedded raster"
    metadata = ET.fromstring(archive.read("docProps/core.xml"))
    title = metadata.find("{http://purl.org/dc/elements/1.1/}title")
    assert title is not None and (title.text or "") == options.title, "Metadata escaping failed"
print("PDF text, OOXML XML/ZIP, marks, table, Unicode and embedded image checks passed")
