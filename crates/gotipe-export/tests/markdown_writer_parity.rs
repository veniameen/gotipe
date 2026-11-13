//! The TS and Rust Markdown writers share one mapping for formulas, embeds, files, quotes
//! and plain code, and both parsers read it back the same way. The fixture is written by
//! `serializeMarkdown`.
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

#[test]
fn formulas_and_embeds_have_one_markdown_mapping() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/markdown-writer.json")).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let document = document_from_json(&case["document"].to_string()).unwrap();
        let markdown = case["markdown"].as_str().unwrap();
        assert_eq!(to_markdown(&document), markdown, "{id}: writer output");
        let parsed = from_markdown(markdown, &default_block_editor()).unwrap();
        let mut actual = public_document(&parsed)["blocks"].clone();
        let mut expected = case["reparsed"].clone();
        normalize(&mut actual);
        normalize(&mut expected);
        assert_eq!(actual, expected, "{id}: what the parser reads back");
    }
}

#[test]
fn formulas_come_back_identical_and_embeds_as_link_paragraphs() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/markdown-writer.json")).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let document = document_from_json(&case["document"].to_string()).unwrap();
        let parsed = from_markdown(&to_markdown(&document), &default_block_editor()).unwrap();
        default_block_editor().validate(&parsed).unwrap();
        let formulas = |blocks: &[gotipe_core::Block]| -> Vec<String> {
            blocks
                .iter()
                .filter(|block| block.block_type == "math")
                .map(|block| match &block.content {
                    gotipe_core::BlockContent::Raw(tex) => tex.clone(),
                    other => panic!("{id}: formula content {other:?}"),
                })
                .collect()
        };
        let written: Vec<String> = formulas(&document.blocks)
            .into_iter()
            .map(|tex| tex.replace("\r\n", "\n"))
            .filter(|tex| !tex.is_empty())
            .collect();
        assert_eq!(
            formulas(&parsed.blocks),
            written,
            "{id}: TeX through Markdown"
        );
    }
    let case = &fixture["cases"][0];
    let links: Vec<&str> = case["reparsed"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|block| block["content"][0]["marks"][0]["attrs"]["href"].as_str())
        .collect();
    assert_eq!(
        links,
        [
            "https://www.youtube.com/watch?v=GoTipe",
            "https://example.test/a b (1)?x=&amp;",
            "https://vimeo.com/1"
        ]
    );
}
