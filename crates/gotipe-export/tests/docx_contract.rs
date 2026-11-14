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
