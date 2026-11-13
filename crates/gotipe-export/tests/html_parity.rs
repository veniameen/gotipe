//! The server's HTML equals `serializeHtml` from @gotipe/core, which `editor.getHTML()` uses
//! on both engines. The fixture's HTML is written by the TS serializer and checked there too
//! (packages/core/tests/html-parity.test.ts).
use gotipe_export::{html::to_html, input::document_from_json, ExportOptions};
use serde_json::Value;

#[test]
fn rust_html_matches_the_canonical_serializer() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/html-parity.json")).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let document = document_from_json(&case["document"].to_string()).unwrap();
        let options = ExportOptions {
            inline_styles: case["options"]["inlineStyles"].as_bool().unwrap_or(false),
            class_prefix: case["options"]["classPrefix"].as_str().map(str::to_owned),
            ..ExportOptions::default()
        };
        let html = to_html(&document, &options).unwrap();
        let expected = case["html"].as_str().unwrap();
        if html != expected {
            let line = html
                .lines()
                .zip(expected.lines())
                .position(|(actual, expected)| actual != expected);
            panic!("{id}: first differing line {line:?}\n--- rust\n{html}\n--- ts\n{expected}");
        }
    }
}
