//! D-82: block and mark attributes serialize in key order, whatever order the map holds.
use gotipe_schema::{AttrValue, Block, BlockContent, BlockId, Mark, TextSpan};
use std::collections::HashMap;

const KEYS: [&str; 10] = [
    "rowspan",
    "colspan",
    "width",
    "align",
    "header",
    "id",
    "background",
    "label",
    "kind",
    "href",
];

fn attrs() -> HashMap<String, AttrValue> {
    let numbered = KEYS.iter().enumerate();
    numbered
        .map(|(n, key)| (key.to_string(), AttrValue::Number(n as f64)))
        .collect()
}

/// The keys of the first `"attrs":{…}` object in `json`, in the order they are written.
fn written_keys(json: &str) -> Vec<String> {
    let start = json.find("\"attrs\":{").unwrap() + "\"attrs\":{".len();
    let object = &json[start..start + json[start..].find('}').unwrap()];
    let entries = object.split(',');
    entries
        .map(|entry| {
            entry
                .split(':')
                .next()
                .unwrap()
                .trim_matches('"')
                .to_string()
        })
        .collect()
}

#[test]
fn block_and_mark_attributes_are_written_in_key_order() {
    let mut sorted: Vec<String> = KEYS.iter().map(|key| key.to_string()).collect();
    sorted.sort();
    let mark = Mark {
        mark_type: "link".into(),
        attrs: attrs(),
    };
    let span = TextSpan {
        text: "cell 😀".into(),
        marks: vec![mark.clone()],
    };
    let block = Block {
        id: BlockId("c".into()),
        block_type: "tableCell".into(),
        attrs: attrs(),
        content: BlockContent::RichText(vec![span]),
        children: vec![],
    };
    assert_eq!(
        written_keys(&serde_json::to_string(&block).unwrap()),
        sorted
    );
    assert_eq!(written_keys(&serde_json::to_string(&mark).unwrap()), sorted);
    let read: Block = serde_json::from_str(&serde_json::to_string(&block).unwrap()).unwrap();
    assert_eq!(read.attrs, block.attrs);
}
