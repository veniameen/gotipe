//! A document written as Markdown reads back as the same document (D-97): blanks at the edges
//! of text and cells, emphasis at the edges of words, typed addresses, the start of a block and
//! a link title with a blank line; lines after list items, verbatim text in merged cells, lists
//! in quotes and in items (D-101, D-103–D-105); children of blocks, spread lists, raw source in
//! items and quotes (D-109–D-124). The fixtures are written by `@gotipe/markdown`;
//! its own test (`packages/markdown/src/write-read.test.ts`) checks the same cases.
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

fn fixtures() -> [Value; 3] {
    [
        include_str!("fixtures/markdown-write-read.json"),
        include_str!("fixtures/markdown-nested-write-read.json"),
        include_str!("fixtures/markdown-writer-blocks.json"),
    ]
    .map(|text| serde_json::from_str(text).unwrap())
}

fn blocks(markdown: &str) -> Value {
    let doc = from_markdown(markdown, &default_block_editor()).unwrap();
    default_block_editor().validate(&doc).unwrap();
    let mut blocks = public_document(&doc)["blocks"].clone();
    normalize(&mut blocks);
    blocks
}

/// The rich text of every block with text, in order: what writing and reading must not change
/// (an empty paragraph or heading is not written).
fn texts(blocks: &Value) -> Vec<Value> {
    let mut out = vec![];
    for block in blocks.as_array().unwrap() {
        if block["content"]
            .as_array()
            .is_some_and(|spans| !spans.is_empty())
        {
            out.push(block["content"].clone());
        }
        out.extend(texts(&block["children"]));
    }
    out
}

#[test]
fn markdown_is_read_as_the_typescript_reader_reads_it() {
    for case in fixtures()
        .iter()
        .flat_map(|f| f["read"].as_array().unwrap())
    {
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
    for case in fixtures()
        .iter()
        .flat_map(|f| f["write"].as_array().unwrap())
    {
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
        // a list in a quote is outside the schema: the reader keeps such a quote as raw source
        if case["readAsRaw"].as_bool() == Some(true) {
            continue;
        }
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

fn written(blocks: Value) -> String {
    let json = serde_json::json!({ "version": 1, "blocks": blocks });
    to_markdown(&document_from_json(&json.to_string()).unwrap())
}

fn bullets(id: &str, items: Value, marker: &str) -> Value {
    serde_json::json!({
        "id": id, "type": "bulletList", "attrs": { "marker": marker }, "content": null,
        "children": items
    })
}

fn item(id: &str, text: &str, children: Value) -> Value {
    serde_json::json!({
        "id": id, "type": "listItem", "attrs": {},
        "content": [{ "text": text, "marks": [] }], "children": children
    })
}

#[test]
fn a_list_beside_raw_source_in_an_item_takes_another_marker() {
    // D-105: raw source is written as it is, so the list beside it takes another marker, as
    // `packages/markdown/src/lists.test.ts` checks for the TS writer
    let raw = serde_json::json!({
        "id": "r", "type": "markdownRaw", "attrs": { "kind": "list" }, "content": "- # a",
        "children": []
    });
    let c = bullets(
        "c",
        serde_json::json!([item("ic", "c", serde_json::json!([]))]),
        "-",
    );
    let d = bullets(
        "d",
        serde_json::json!([item("id", "d", serde_json::json!([]))]),
        "*",
    );
    let before = item("x", "x", serde_json::json!([raw.clone(), c.clone()]));
    assert_eq!(
        written(serde_json::json!([bullets(
            "l",
            serde_json::json!([before]),
            "-"
        )])),
        "- x\n  - # a\n  * c\n"
    );
    let after = item("x", "x", serde_json::json!([c, raw, d]));
    assert_eq!(
        written(serde_json::json!([bullets(
            "l",
            serde_json::json!([after]),
            "-"
        )])),
        "- x\n  * c\n  - # a\n  * d\n"
    );
}

#[test]
fn neighbouring_verbatim_text_in_a_merged_cell_shares_a_span() {
    // D-103, as `packages/markdown/src/table-html.test.ts` checks for the TS writer
    let raw = |text: &str, bold: bool| {
        let mut marks = vec![];
        if bold {
            marks.push(serde_json::json!({ "type": "bold" }));
        }
        marks.push(serde_json::json!({ "type": "mdRaw" }));
        serde_json::json!({ "text": text, "marks": marks })
    };
    let cell = |id: &str, kind: &str, attrs: Value, content: Value| {
        serde_json::json!({
            "id": id, "type": kind, "attrs": attrs, "content": content, "children": []
        })
    };
    let table = serde_json::json!([{
        "id": "t", "type": "table", "attrs": {}, "content": null,
        "children": [
            { "id": "r0", "type": "tableRow", "attrs": {}, "content": null, "children": [
                cell("h", "tableHeader", serde_json::json!({ "colspan": 2 }),
                    serde_json::json!([{ "text": "h", "marks": [] }]))
            ]},
            { "id": "r1", "type": "tableRow", "attrs": {}, "content": null, "children": [
                cell("b", "tableCell", serde_json::json!({}), serde_json::json!([
                    raw("![i](u.png)", false), raw("<br>", false), raw("x", true)
                ])),
                cell("c", "tableCell", serde_json::json!({}),
                    serde_json::json!([{ "text": "z", "marks": [] }]))
            ]}
        ]
    }]);
    let markdown = written(table);
    assert!(
        markdown
            .contains("<td><span>![i](u.png)&lt;br&gt;</span><strong><span>x</span></strong></td>"),
        "{markdown}"
    );
    assert_eq!(
        blocks(&markdown)[0]["children"][1]["children"][0]["content"],
        serde_json::json!([raw("![i](u.png)<br>", false), raw("x", true)])
    );
}

#[test]
fn two_raw_lists_in_a_toggle_are_kept_apart() {
    // D-105 gives the children of any block the protection of the top level, raw lists (D-107)
    // among them; `packages/markdown/src/lists.test.ts` checks the TS writer
    let raw = |id: &str, content: &str| {
        serde_json::json!({
            "id": id, "type": "markdownRaw", "attrs": { "kind": "list" }, "content": content,
            "children": []
        })
    };
    let toggle = serde_json::json!([{
        "id": "t", "type": "toggle", "attrs": {}, "content": [{ "text": "T", "marks": [] }],
        "children": [raw("a", "- a\n\n  b"), raw("c", "- c\n\n  d")]
    }]);
    let markdown = written(toggle);
    assert!(
        markdown.ends_with("- a\n\n  b\n\n* c\n\n  d\n"),
        "{markdown}"
    );
    let read = blocks(&markdown);
    let raw_lists = read
        .as_array()
        .unwrap()
        .iter()
        .filter(|block| block["type"] == "markdownRaw")
        .count();
    assert_eq!(raw_lists, 2, "{read}");
}

#[test]
fn a_list_without_items_keeps_no_lists_apart() {
    // D-105: it writes no line, so the lists around it take other markers, as
    // `packages/markdown/src/lists.test.ts` checks for the TS writer; neither writer writes it
    // (D-117)
    let none = bullets("n", serde_json::json!([]), "-");
    let a = bullets(
        "a",
        serde_json::json!([item("ia", "a", serde_json::json!([]))]),
        "-",
    );
    let b = bullets(
        "b",
        serde_json::json!([item("ib", "b", serde_json::json!([]))]),
        "-",
    );
    let x = item("x", "x", serde_json::json!([a, none, b]));
    let markdown = written(serde_json::json!([bullets(
        "l",
        serde_json::json!([x]),
        "-"
    )]));
    assert_eq!(markdown, "- x\n  - a\n  * b\n");
    let nested = &blocks(&markdown)[0]["children"][0]["children"];
    assert_eq!(nested[0]["attrs"]["marker"], "-");
    assert_eq!(nested[1]["attrs"]["marker"], "*");
}
