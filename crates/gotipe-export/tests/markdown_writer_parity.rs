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

#[test]
fn a_merged_table_comes_back_as_a_table_and_is_written_again_byte_for_byte() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/markdown-writer.json")).unwrap();
    let case = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "merged-cells-as-html")
        .unwrap();
    let markdown = case["markdown"].as_str().unwrap();
    let mut parsed = from_markdown(markdown, &default_block_editor()).unwrap();
    let kinds: Vec<&str> = parsed
        .blocks
        .iter()
        .map(|b| b.block_type.as_str())
        .collect();
    assert_eq!(kinds, ["paragraph", "table", "table", "paragraph"]);
    // without the kept source the writer writes the tables again from the blocks
    parsed.blocks[0].attrs.remove("markdownDocumentSource");
    parsed.blocks[0].attrs.remove("markdownDocumentModel");
    assert_eq!(to_markdown(&parsed), markdown);
}

#[test]
fn html_that_is_not_the_writers_table_stays_raw() {
    for source in [
        "<table>\n<tr>\n<td>a</td>\n</tr>\n</table>\n",
        "<table>\n<tr>\n<td colspan=\"2\"><b>a</b></td>\n</tr>\n</table>\n",
        "<table>\n<tr>\n<td colspan=\"2\">a &nbsp; b</td>\n</tr>\n</table>\n",
        "<table class=\"x\">\n<tr>\n<td colspan=\"2\">a</td>\n</tr>\n</table>\n",
    ] {
        let parsed = from_markdown(source, &default_block_editor()).unwrap();
        assert_eq!(parsed.blocks[0].block_type, "markdownRaw", "{source}");
        assert_eq!(to_markdown(&parsed), source);
    }
}

#[test]
fn a_table_whose_first_row_has_no_cells_is_written_as_the_ts_writer_writes_it() {
    let document = document_from_json(
        &serde_json::json!({"blocks": [
            {"id": "t", "type": "table", "attrs": {"align": [null, "right"]}, "children": [
                {"id": "r0", "type": "tableRow", "children": []},
                {"id": "r1", "type": "tableRow", "children": [
                    {"id": "c", "type": "tableCell", "content": [{"text": "1"}]},
                    {"id": "d", "type": "tableCell", "content": [{"text": "2"}]}
                ]},
                {"id": "r2", "type": "tableRow", "children": []}
            ]},
            {"id": "e", "type": "table", "children": [{"id": "e0", "type": "tableRow", "children": []}]}
        ]})
        .to_string(),
    )
    .unwrap();
    // packages/markdown/src/table-html.test.ts expects the same bytes
    assert_eq!(
        to_markdown(&document),
        "|  |  |\n| --- | ---: |\n| 1 | 2 |\n|  |  |\n"
    );
}
