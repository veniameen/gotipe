//! D-82: every replica writes block and mark attributes in the same key order.
use gotipe_core::{AttrValue, Block, BlockContent, BlockId, Document, Mark, Step, TextSpan};
use gotipe_crdt::{CrdtDocument, VersionVector};
use std::collections::HashMap;

fn attrs(keys: &[&str]) -> HashMap<String, AttrValue> {
    let numbered = keys.iter().enumerate();
    numbered
        .map(|(n, key)| (key.to_string(), AttrValue::Number(n as f64 + 1.0)))
        .collect()
}
/// The exact bytes a peer exports; `version` counts operations and is local.
fn json(document: &Document) -> String {
    serde_json::to_string(&document.blocks).unwrap()
}

#[test]
fn peers_write_cell_and_mark_attributes_in_one_order() {
    let base = Document {
        blocks: vec![Block {
            id: BlockId("c".into()),
            block_type: "tableCell".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: "ячейка 😀".into(),
                marks: vec![],
            }]),
            children: vec![],
        }],
        version: 0,
    };
    let mut a = CrdtDocument::new("a", &base);
    let mut b = CrdtDocument::new("b", &base);
    let cell = [
        "rowspan",
        "colspan",
        "colwidth",
        "align",
        "background",
        "header",
    ];
    let link = ["title", "href", "target", "rel", "id", "kind"];
    let steps = [
        Step::SetBlockAttrs {
            block_id: BlockId("c".into()),
            attrs: attrs(&cell),
        },
        Step::AddMark {
            block_id: BlockId("c".into()),
            from: 0,
            to: 6,
            mark: Mark {
                mark_type: "link".into(),
                attrs: attrs(&link),
            },
        },
    ];
    let mut local = base.clone();
    for step in &steps {
        local = step.apply(local).unwrap();
        a.apply_local_steps_result(std::slice::from_ref(step), &local)
            .unwrap();
    }
    b.apply_remote(&a.encode_update_since(&VersionVector::new()))
        .unwrap();
    let written = json(&local);
    assert_eq!(json(&a.to_document()), written);
    assert_eq!(json(&b.to_document()), written);
    let order = [
        "align",
        "background",
        "colspan",
        "colwidth",
        "header",
        "rowspan",
    ];
    let positions: Vec<_> = order.iter().map(|key| written.find(key).unwrap()).collect();
    assert!(
        positions.windows(2).all(|pair| pair[0] < pair[1]),
        "{written}"
    );
}
