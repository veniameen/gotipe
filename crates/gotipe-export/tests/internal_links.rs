//! `#<blockId>` links lead inside the file when that block is shown there; links to
//! unknown or empty blocks keep their text without a link.
#![cfg(all(feature = "pdf", feature = "docx"))]

use gotipe_export::docx::{to_docx, DocxOptions};
use gotipe_export::input::document_from_json;
use gotipe_export::pdf::{to_pdf, PdfOptions};
use serde_json::json;
use std::io::{Cursor, Read};

fn document() -> gotipe_core::Document {
    let link = |text: &str, href: &str| json!({"text": text, "marks": [{"type": "link", "attrs": {"href": href}}]});
    let filler: Vec<_> = (0..70)
        .map(|index| json!({"id": format!("filler-{index}"), "type": "paragraph", "content": [{"text": format!("Filler line {index}")}]}))
        .collect();
    let mut blocks = vec![
        json!({"id": "links", "type": "paragraph", "content": [
            link("TO-TARGET", "#target"),
            {"text": " "},
            link("TO-MISSING", "#missing"),
            {"text": " "},
            link("TO-PLACEHOLDER", "#placeholder"),
            {"text": " "},
            link("TO-WEB", "https://example.test/пример")
        ]}),
        json!({"id": "jump", "type": "file", "attrs": {"url": " #target ", "name": "FILE-JUMP"}}),
        json!({"id": "placeholder", "type": "image", "attrs": {"src": "", "caption": ""}}),
    ];
    blocks.extend(filler);
    blocks.push(json!({"id": "target", "type": "heading", "attrs": {"level": 2}, "content": [{"text": "TARGET heading"}]}));
    document_from_json(&json!({ "version": 1, "blocks": blocks }).to_string()).unwrap()
}

#[test]
fn pdf_links_to_a_shown_block_go_to_its_named_destination() {
    let pdf = to_pdf(&document(), &PdfOptions::default()).unwrap();
    let text = String::from_utf8_lossy(&pdf);
    assert!(text.contains("/Dests"), "named destinations dictionary");
    assert_eq!(
        text.matches("/S /GoTo").count(),
        2,
        "text link and file link"
    );
    assert_eq!(text.matches("/D /target").count(), 2);
    assert!(!text.contains("/missing") && !text.contains("/placeholder"));
    assert!(text.contains("/URI (https://example.test/%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80)"));
    assert_eq!(text.matches("/Subtype /Link").count(), 3);
}

#[test]
fn docx_links_to_a_shown_block_use_a_bookmark() {
    let bytes = to_docx(&document(), &DocxOptions::default()).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    assert_eq!(
        xml.matches("<w:hyperlink w:anchor=\"gotipe_1\">").count(),
        2
    );
    assert_eq!(
        xml.matches("<w:bookmarkStart w:id=\"1\" w:name=\"gotipe_1\"/><w:bookmarkEnd w:id=\"1\"/>")
            .count(),
        1
    );
    let bookmark = xml.find("w:name=\"gotipe_1\"").unwrap();
    assert!(
        bookmark > xml.find("Filler line 69").unwrap()
            && bookmark < xml.find("TARGET heading").unwrap()
    );
    for text in ["TO-MISSING", "TO-PLACEHOLDER"] {
        let at = xml.find(text).unwrap();
        let open = xml[..at].rfind("<w:hyperlink").unwrap_or(0);
        let close = xml[..at].rfind("</w:hyperlink>").unwrap_or(0);
        assert!(close >= open, "{text} must stay plain text");
    }
    let mut relationships = String::new();
    archive
        .by_name("word/_rels/document.xml.rels")
        .unwrap()
        .read_to_string(&mut relationships)
        .unwrap();
    assert_eq!(relationships.matches("TargetMode=\"External\"").count(), 1);
    assert!(!relationships.contains("#target"));
}
