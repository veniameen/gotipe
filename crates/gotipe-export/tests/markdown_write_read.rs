//! A document written as Markdown reads back as the same document (D-97): blanks at the edges
//! of text and cells, emphasis at the edges of words, typed addresses, the start of a block and
//! a link title with a blank line. The fixture is written by `@gotipe/markdown`; its own test
//! (`packages/markdown/src/write-read.test.ts`) checks the same cases.
use gotipe_core::defaults::default_block_editor;
use gotipe_export::{
    input::{document_from_json, public_document},
    markdown::{from_markdown, to_markdown},
};
use serde_json::Value;

fn normalize(value: &mut Value) {
    match value {
        Value::Number(number) => {
            *number = serde_json::Number::from_f64(number.as_f64().unwrap()).unwrap()
        }
        Value::Array(values) => values.iter_mut().for_each(normalize),
        Value::Object(object) => {
            object.remove("id");
            if let Some(Value::Object(attrs)) = object.get_mut("attrs") {
                attrs.remove("markdownDocumentSource");
                attrs.remove("markdownDocumentModel");
            }
            object.values_mut().for_each(normalize);
        }
        _ => {}
    }
}

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/markdown-write-read.json")).unwrap()
}

fn blocks(markdown: &str) -> Value {
    let doc = from_markdown(markdown, &default_block_editor()).unwrap();
    default_block_editor().validate(&doc).unwrap();
    let mut blocks = public_document(&doc)["blocks"].clone();
    normalize(&mut blocks);
    blocks
}

/// The rich text of every block, in order: what writing and reading must not change.
fn texts(blocks: &Value) -> Vec<Value> {
    let mut out = vec![];
    for block in blocks.as_array().unwrap() {
        if block["content"].is_array() {
            out.push(block["content"].clone());
        }
        out.extend(texts(&block["children"]));
    }
    out
}

#[test]
fn markdown_is_read_as_the_typescript_reader_reads_it() {
    for case in fixture()["read"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let source = case["markdown"].as_str().unwrap();
        let mut expected = case["blocks"].clone();
        normalize(&mut expected);
        assert_eq!(blocks(source), expected, "{id}");
        let doc = from_markdown(source, &default_block_editor()).unwrap();
        assert_eq!(to_markdown(&doc), source, "{id}: unchanged source bytes");
    }
}

#[test]
fn documents_are_written_as_the_typescript_writer_writes_them_and_read_back() {
    for case in fixture()["write"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let document = document_from_json(&case["document"].to_string()).unwrap();
        let markdown = case["markdown"].as_str().unwrap();
        assert_eq!(to_markdown(&document), markdown, "{id}: writer output");
        let mut expected = case["reparsed"].clone();
        normalize(&mut expected);
        assert_eq!(
            blocks(markdown),
            expected,
            "{id}: what the reader reads back"
        );
        let mut written = public_document(&document)["blocks"].clone();
        normalize(&mut written);
        assert_eq!(
            texts(&expected),
            texts(&written),
            "{id}: the text and marks of the document itself"
        );
    }
}

fn paragraph(text: &str) -> gotipe_core::Document {
    let json = serde_json::json!({
        "version": 1,
        "blocks": [{
            "id": "p",
            "type": "paragraph",
            "attrs": {},
            "content": [{ "text": text, "marks": [] }],
            "children": []
        }]
    });
    document_from_json(&json.to_string()).unwrap()
}

#[test]
fn a_large_block_is_written_in_linear_time() {
    // D-96: what is written so far is not read again for every character, an escape does not
    // make the rest of a run of addresses be read again, nor an escaped dollar the formula
    // look-ahead
    let words: Vec<String> = (0..40_000)
        .map(|i| format!("word{} 1. a.b", i % 97))
        .collect();
    for text in [
        words.join(" "),
        "https://e.x/p,".repeat(8_000),
        format!("{}US$", "$5, ".repeat(8_000)),
    ] {
        let document = paragraph(&text);
        let started = std::time::Instant::now();
        let markdown = to_markdown(&document);
        assert!(markdown.len() > text.len());
        assert!(
            started.elapsed() < std::time::Duration::from_secs(20),
            "{:?}",
            started.elapsed()
        );
    }
}

#[test]
fn a_formula_with_a_line_ending_in_it_is_written_as_text() {
    // D-94: a line ending would end the formula
    let json = serde_json::json!({
        "version": 1,
        "blocks": [{
            "id": "p",
            "type": "paragraph",
            "attrs": {},
            "content": [
                { "text": "a", "marks": [] },
                { "text": "x\ry", "marks": [{ "type": "inlineMath" }] },
                { "text": "b", "marks": [] }
            ],
            "children": []
        }]
    });
    let document = document_from_json(&json.to_string()).unwrap();
    assert_eq!(to_markdown(&document), "ax\\\nyb\n");
}
