#![cfg(feature = "docx")]

use gotipe_export::docx::{to_docx, DocxOptions};
use gotipe_export::input::document_from_json;
use serde_json::json;
use std::io::{Cursor, Read};

fn part(bytes: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut result = String::new();
    archive
        .by_name(name)
        .unwrap()
        .read_to_string(&mut result)
        .unwrap();
    result
}

#[test]
fn ooxml_preserves_unicode_whitespace_marks_metadata_and_safe_relationships() {
    let document = document_from_json(&json!({"version":1,"blocks":[{
        "id":"p","type":"paragraph","attrs":{},"children":[],"content":[
            {"text":" Привет 😀\tline\nnext\rreturn & <tag> ","marks":[
                {"type":"bold","attrs":{}},{"type":"link","attrs":{"href":"https://example.com/?a=1&b=2"}},
                {"type":"textColor","attrs":{"color":"#12abef"}}
            ]}
        ]
    }]}).to_string()).unwrap();
    let output = to_docx(
        &document,
        &DocxOptions {
            title: "<& title".into(),
            author: "Автор".into(),
            description: "".into(),
        },
    )
    .unwrap();
    let xml = part(&output, "word/document.xml");
    assert!(xml.contains(" Привет 😀"));
    assert!(xml.contains("<w:tab/>"));
    assert!(xml.contains("<w:br/>"));
    assert!(xml.contains("next&#13;return &amp; &lt;tag&gt; "));
    assert!(xml.contains("<w:b/>"));
    assert!(xml.contains("w:val=\"12abef\""));
    assert!(xml.contains("r:id=\"link1\""));
    assert!(part(&output, "word/_rels/document.xml.rels")
        .contains("Target=\"https://example.com/?a=1&amp;b=2\" TargetMode=\"External\""));
    assert!(part(&output, "docProps/core.xml").contains("&lt;&amp; title"));
}

#[test]
fn invalid_xml_characters_fail_instead_of_corrupting_or_dropping_text() {
    let document = document_from_json(&json!({"version":1,"blocks":[{
        "id":"p","type":"paragraph","attrs":{},"children":[],"content":[{"text":"before\u{0001}after","marks":[]}]
    }]}).to_string()).unwrap();
    assert!(to_docx(&document, &DocxOptions::default())
        .unwrap_err()
        .to_string()
        .contains("invalid XML character"));
    let valid = document_from_json("{\"version\":1,\"blocks\":[]}").unwrap();
    assert!(to_docx(
        &valid,
        &DocxOptions {
            title: "\u{0000}".into(),
            ..Default::default()
        }
    )
    .is_err());
}

#[test]
fn format_fixture_retains_tables_media_and_heading_styles() {
    let document = document_from_json(include_str!("fixtures/formats.json")).unwrap();
    let output = to_docx(&document, &DocxOptions::default()).unwrap();
    let xml = part(&output, "word/document.xml");
    for marker in [
        "<w:tbl>",
        "<w:tblGrid>",
        "<w:drawing>",
        "Проверка экспорта 😀",
        "<w:pStyle w:val=\"Heading1\"/>",
    ] {
        assert!(xml.contains(marker), "missing {marker}");
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(output)).unwrap();
    let mut png = Vec::new();
    archive
        .by_name("word/media/image1.png")
        .unwrap()
        .read_to_end(&mut png)
        .unwrap();
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
}

#[test]
fn merged_first_row_keeps_the_logical_grid_width() {
    let document = document_from_json(&json!({"version":1,"blocks":[{
        "id":"table","type":"table","content":null,"children":[
            {"id":"r1","type":"tableRow","content":null,"children":[
                {"id":"merged","type":"tableCell","attrs":{"colspan":2},"content":[{"text":"Merged"}]}
            ]},
            {"id":"r2","type":"tableRow","content":null,"children":[
                {"id":"left","type":"tableCell","content":[{"text":"Left"}]},
                {"id":"right","type":"tableCell","content":[{"text":"Right"}]}
            ]}
        ]
    }]}).to_string()).unwrap();
    let bytes = to_docx(&document, &DocxOptions::default()).unwrap();
    let xml = part(&bytes, "word/document.xml");
    assert_eq!(xml.matches("<w:gridCol/>").count(), 2);
    assert!(xml.contains("<w:gridSpan w:val=\"2\"/>"));
    for text in ["Merged", "Left", "Right"] {
        assert!(xml.contains(text));
    }
}

/// Everything the editor can insert exports: WebP uploads, empty placeholders, inline
/// `data:` files and relative links. Only absolute addresses become hyperlinks.
#[test]
fn editor_content_exports_with_text_for_unlinkable_references() {
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/pdf-corpus.json")).unwrap();
    let case = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "editor-content")
        .unwrap();
    let document = document_from_json(&case["document"].to_string()).unwrap();
    let output = to_docx(&document, &DocxOptions::default()).unwrap();
    let xml = part(&output, "word/document.xml");
    for text in [
        "WEBP-LOSSY подпись",
        "IMAGE-PENDING caption",
        "INLINE-UPLOAD Отчёт.pdf",
        "RELATIVE-FILE guide",
        "https://www.youtube.com/watch?v=GoTipe",
        "relative",
        "absolute",
    ] {
        assert!(xml.contains(text), "missing {text}");
    }
    assert_eq!(xml.matches("<w:drawing>").count(), 2);
    assert_eq!(xml.matches("<w:hyperlink ").count(), 2);
    let relationships = part(&output, "word/_rels/document.xml.rels");
    for target in [
        "https://example.test/ok",
        "https://www.youtube.com/watch?v=GoTipe",
    ] {
        assert!(relationships.contains(target), "missing {target}");
    }
    for text in [
        "guide.md",
        "data:",
        "tel:",
        "cdn.example.test",
        "/docs/guide",
    ] {
        assert!(!relationships.contains(text), "unexpected link {text}");
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(output)).unwrap();
    for index in 1..=2 {
        let mut png = Vec::new();
        archive
            .by_name(&format!("word/media/image{index}.png"))
            .unwrap()
            .read_to_end(&mut png)
            .unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    }
}

#[test]
fn paragraphs_and_headings_keep_their_alignment() {
    let block = |id: &str, kind: &str, align: serde_json::Value| {
        json!({"id": id, "type": kind, "attrs": {"level": 2, "align": align}, "children": [],
            "content": [{"text": format!("Текст {id}"), "marks": []}]})
    };
    let document = document_from_json(
        &json!({"version":1,"blocks":[
            block("l", "paragraph", json!("left")),
            block("c", "heading", json!("center")),
            block("r", "paragraph", json!("right")),
            block("j", "paragraph", json!("justify")),
            block("n", "paragraph", json!(null)),
            block("x", "paragraph", json!("middle")),
            block("q", "blockquote", json!("center")),
        ]})
        .to_string(),
    )
    .unwrap();
    let xml = part(
        &to_docx(&document, &DocxOptions::default()).unwrap(),
        "word/document.xml",
    );
    let paragraph = |text: &str| {
        let end = xml.find(text).unwrap();
        let start = xml[..end].rfind("<w:p>").unwrap();
        xml[start..end].to_owned()
    };
    // w:jc follows w:ind, as the schema orders paragraph properties.
    assert!(paragraph("Текст l").contains("<w:ind w:left=\"0\"/><w:jc w:val=\"left\"/></w:pPr>"));
    assert!(paragraph("Текст c")
        .contains("<w:pStyle w:val=\"Heading2\"/><w:ind w:left=\"0\"/><w:jc w:val=\"center\"/>"));
    assert!(paragraph("Текст r").contains("<w:jc w:val=\"right\"/>"));
    assert!(paragraph("Текст j").contains("<w:jc w:val=\"both\"/>"));
    for plain in ["Текст n", "Текст x", "Текст q"] {
        assert!(!paragraph(plain).contains("<w:jc"), "{plain}");
    }
    assert_eq!(xml.matches("<w:jc ").count(), 4);
}

/// A header over two columns and cells over two rows (Atlas frame 29): every row of the Word
/// table fills the whole grid, a merge over rows starts once and continues in the rows below.
#[test]
fn merged_cells_over_rows_become_vertical_merges() {
    let cell = |id: &str, kind: &str, text: &str, attrs: serde_json::Value| json!({"id":id,"type":kind,"attrs":attrs,"content":[{"text":text,"marks":[]}],"children":[]});
    let row = |id: &str, cells: Vec<serde_json::Value>| json!({"id":id,"type":"tableRow","attrs":{},"content":null,"children":cells});
    let document = document_from_json(
        &json!({"version":1,"blocks":[{
            "id":"t","type":"table","attrs":{},"content":null,"children":[
                row("r0", vec![
                    cell("h0", "tableHeader", "Платформа", json!({"rowspan":2})),
                    cell("h1", "tableHeader", "Журнал", json!({"colspan":2})),
                    cell("h2", "tableHeader", "Шифрование", json!({"rowspan":2})),
                ]),
                row("r1", vec![
                    cell("h3", "tableHeader", "Ключ", json!({})),
                    cell("h4", "tableHeader", "В очереди", json!({})),
                ]),
                row("r2", vec![
                    cell("c0", "tableCell", "Веб", json!({})),
                    cell("c1", "tableCell", "drafts.web", json!({})),
                    cell("c2", "tableCell", "1 284", json!({})),
                    cell("c3", "tableCell", "Ключ сессии", json!({"rowspan":2})),
                ]),
                row("r3", vec![
                    cell("c4", "tableCell", "macOS", json!({})),
                    cell("c5", "tableCell", "drafts.mac", json!({})),
                    cell("c6", "tableCell", "312", json!({})),
                ]),
                row("r4", vec![
                    cell("c7", "tableCell", "", json!({"colspan":2,"rowspan":2})),
                    cell("c8", "tableCell", "0", json!({})),
                    cell("c9", "tableCell", "Нет", json!({})),
                ]),
                row(
                    "r5",
                    vec![
                        cell("c10", "tableCell", "27", json!({})),
                        cell("c11", "tableCell", "Ключ устройства", json!({})),
                    ],
                ),
            ]
        }]})
        .to_string(),
    )
    .unwrap();
    let xml = part(
        &to_docx(&document, &DocxOptions::default()).unwrap(),
        "word/document.xml",
    );
    assert_eq!(xml.matches("<w:gridCol/>").count(), 4);
    assert_eq!(xml.matches("<w:vMerge w:val=\"restart\"/>").count(), 4);
    assert_eq!(xml.matches("<w:vMerge/>").count(), 4);
    let rows: Vec<&str> = xml.split("<w:tr>").skip(1).collect();
    assert_eq!(rows.len(), 6);
    for row in &rows {
        let row = &row[..row.find("</w:tr>").unwrap()];
        let width: usize = row
            .split("<w:tc>")
            .skip(1)
            .map(|cell| {
                cell.split("<w:gridSpan w:val=\"")
                    .nth(1)
                    .map_or(1, |rest| rest[..rest.find('"').unwrap()].parse().unwrap())
            })
            .sum();
        assert_eq!(width, 4, "{row}");
    }
    // the second header row: “Платформа” (Platform) continues before “Ключ” (Key), and
    // “Шифрование” (Encryption) after the rest
    let second = rows[1];
    let key = second.find("Ключ").unwrap();
    assert!(second[..key].contains("<w:vMerge/>"));
    assert!(second[key..].contains("<w:vMerge/>"));
    // the last row: the cell over two columns continues as one cell over the same two columns
    assert!(rows[5]
        .starts_with("<w:tc><w:tcPr><w:gridSpan w:val=\"2\"/><w:vMerge/></w:tcPr><w:p/></w:tc>"));
    for text in ["Платформа", "Журнал", "Ключ сессии", "27"] {
        assert!(xml.contains(text), "{text}");
    }
}

/// Each cell of a row: (`v` for a vertical-merge continuation, `t` for a cell of the table,
/// `f` for a filler), its columns.
fn row_layout(row: &str) -> Vec<(char, usize)> {
    let row = &row[..row.find("</w:tr>").unwrap()];
    row.split("<w:tc>")
        .skip(1)
        .map(|cell| {
            let width = cell
                .split("<w:gridSpan w:val=\"")
                .nth(1)
                .map_or(1, |rest| rest[..rest.find('"').unwrap()].parse().unwrap());
            let kind = if cell.contains("<w:vMerge/>") {
                'v'
            } else if cell.starts_with("<w:p/>") {
                'f'
            } else {
                't'
            };
            (kind, width)
        })
        .collect()
}

#[test]
fn short_rows_keep_continuations_in_their_column_and_no_row_is_empty() {
    let cell = |id: &str, text: &str, attrs: serde_json::Value| json!({"id":id,"type":"tableCell","attrs":attrs,"content":[{"text":text,"marks":[]}],"children":[]});
    let row = |id: &str, cells: Vec<serde_json::Value>| json!({"id":id,"type":"tableRow","attrs":{},"content":null,"children":cells});
    let document = document_from_json(
        &json!({"version":1,"blocks":[{
            "id":"t","type":"table","attrs":{},"content":null,"children":[
                row("r0", vec![
                    cell("a", "A", json!({})),
                    cell("b", "B", json!({"colspan": 2.7})),
                    cell("c", "C", json!({"rowspan": 2})),
                    cell("d", "D", json!({"rowspan": 9, "colspan": 1500})),
                ]),
                // short: “C” continues in column 3, after an empty cell in columns 1–2
                row("r1", vec![cell("e", "E", json!({}))]),
                // nothing of its own and nothing from above but “D”
                row("r2", vec![]),
            ]
        }, {
            "id":"u","type":"table","attrs":{},"content":null,"children":[
                row("s0", vec![cell("x", "X", json!({}))]),
                row("s1", vec![]),
            ]
        }]})
        .to_string(),
    )
    .unwrap();
    let xml = part(
        &to_docx(&document, &DocxOptions::default()).unwrap(),
        "word/document.xml",
    );
    let tables: Vec<&str> = xml.split("<w:tbl>").skip(1).collect();
    let rows: Vec<Vec<(char, usize)>> = tables[0].split("<w:tr>").skip(1).map(row_layout).collect();
    // 2.7 and 1500 are no spans: one column each; “D” reaches only to the last row
    assert_eq!(rows[0], [('t', 1), ('t', 1), ('t', 1), ('t', 1)]);
    assert_eq!(rows[1], [('t', 1), ('f', 1), ('v', 1), ('v', 1)]);
    assert_eq!(rows[2], [('f', 1), ('f', 1), ('f', 1), ('v', 1)]);
    assert_eq!(tables[0].matches("<w:gridCol/>").count(), 4);
    // a row with nothing at all still has a cell
    assert!(!xml.contains("<w:tr></w:tr>"));
    let second: Vec<Vec<(char, usize)>> =
        tables[1].split("<w:tr>").skip(1).map(row_layout).collect();
    assert_eq!(second, [vec![('t', 1)], vec![('f', 1)]]);
}
