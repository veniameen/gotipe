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
