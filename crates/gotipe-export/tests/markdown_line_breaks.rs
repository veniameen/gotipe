//! Line breaks in Markdown (D-88): a soft break is a space, a hard break is "\n", and a "\n" of
//! the document is written as a hard break. The fixture is written by `@gotipe/markdown`; its
//! own test (`packages/markdown/src/line-breaks.test.ts`) checks the same cases.
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
    serde_json::from_str(include_str!("fixtures/markdown-line-breaks.json")).unwrap()
}

fn blocks(markdown: &str) -> Value {
    let doc = from_markdown(markdown, &default_block_editor()).unwrap();
    default_block_editor().validate(&doc).unwrap();
    let mut blocks = public_document(&doc)["blocks"].clone();
    normalize(&mut blocks);
    blocks
}

#[test]
fn line_breaks_are_read_as_the_typescript_reader_reads_them() {
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
fn line_breaks_are_written_as_the_typescript_writer_writes_them() {
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
    }
}

#[test]
fn a_document_with_line_breaks_comes_back_from_its_markdown() {
    // what the writer makes of a "\n" reads back as the same "\n", wherever it stands
    for text in [
        "a\nb",
        "\n",
        "a\n",
        "\nb",
        "a\n\n\nb",
        "Hello\n- no\n1. list\n> or quote",
        "x \n y",
    ] {
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
        let document = document_from_json(&json.to_string()).unwrap();
        let markdown = to_markdown(&document);
        let read = blocks(&markdown);
        assert_eq!(
            read[0]["content"][0]["text"], text,
            "{text:?} as {markdown:?}"
        );
    }
}
