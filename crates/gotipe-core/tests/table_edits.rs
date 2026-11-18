//! The shared table-edit cases. This suite runs the Rust planner (`gotipe_core::table`);
//! `packages/core/tests/table-edits.test.ts` runs the TypeScript planner on the same cases, with
//! its steps applied by the JS engine and by the WASM engine (which does not use the Rust planner:
//! the bridge plans in TypeScript). Same cases, same tables: the two planners agree.

use std::collections::{HashMap, HashSet};

use gotipe_core::table::{edit_table, table_grid, TableEdit};
use gotipe_core::{
    defaults, AttrValue, Block, BlockContent, BlockId, Document, EditorState, Selection, TextSpan,
};
use serde_json::Value;

fn block(id: &str, kind: &str, content: BlockContent, children: Vec<Block>) -> Block {
    Block {
        id: BlockId(id.into()),
        block_type: kind.into(),
        attrs: HashMap::new(),
        content,
        children,
    }
}

/// `id:text|colspan|rowspan`, `#` for a header cell.
fn table(rows: &Value, widths: Option<&Value>) -> Block {
    let rows = rows
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(index, cells)| {
            let cells = cells
                .as_array()
                .unwrap()
                .iter()
                .map(|spec| {
                    let spec = spec.as_str().unwrap();
                    let header = spec.starts_with('#');
                    let mut parts = spec.trim_start_matches('#').split('|');
                    let (id, text) = parts.next().unwrap().split_once(':').unwrap_or((spec, ""));
                    let spans = if text.is_empty() {
                        vec![]
                    } else {
                        vec![TextSpan {
                            text: text.into(),
                            marks: vec![],
                        }]
                    };
                    let kind = if header { "tableHeader" } else { "tableCell" };
                    let mut cell = block(id, kind, BlockContent::RichText(spans), vec![]);
                    for name in ["colspan", "rowspan"] {
                        if let Some(value) = parts.next().filter(|value| !value.is_empty()) {
                            let number = value.parse::<f64>().unwrap();
                            cell.attrs.insert(name.into(), AttrValue::Number(number));
                        }
                    }
                    cell
                })
                .collect();
            block(&format!("r{index}"), "tableRow", BlockContent::Empty, cells)
        })
        .collect();
    let mut table = block("t", "table", BlockContent::Empty, rows);
    if let Some(widths) = widths {
        let values = widths
            .as_array()
            .unwrap()
            .iter()
            .map(|width| width.as_f64().map_or(AttrValue::Null, AttrValue::Number))
            .collect();
        table
            .attrs
            .insert("colWidths".into(), AttrValue::Array(values));
    }
    table
}

fn text(block: &Block) -> String {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().map(|span| span.text.as_str()).collect(),
        _ => String::new(),
    }
}

#[test]
fn shared_table_edits() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/table-edits.json")).expect("fixture");
    for case in fixture["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let source = table(
            &fixture["tables"][case["table"].as_str().unwrap()],
            case.get("colWidths"),
        );
        let known: HashSet<BlockId> = source
            .children
            .iter()
            .flat_map(|row| row.children.iter().map(|cell| cell.id.clone()))
            .collect();
        let state = EditorState::new(
            Document {
                blocks: vec![source],
                version: 0,
            },
            defaults::default_block_editor(),
        );
        let edit: TableEdit = serde_json::from_value(case["edit"].clone()).expect(id);
        let expect = &case["expect"];
        let result = edit_table(&state, &BlockId("t".into()), &edit);
        if let Some(error) = expect["error"].as_str() {
            let message = result.expect_err(id).to_string();
            assert!(message.contains(error), "{id}: {message}");
            continue;
        }
        let transaction = result.expect(id).expect(id);
        let next = state.apply(transaction).expect(id);
        let written = next.doc().find_block(&BlockId("t".into()));
        if expect["removed"].as_bool() == Some(true) {
            assert!(written.is_none(), "{id}");
            continue;
        }
        let written = written.unwrap();
        let grid = table_grid(written);
        assert_eq!(grid.problem, None, "{id}");
        let cells: HashMap<&BlockId, &Block> = written
            .children
            .iter()
            .flat_map(|row| row.children.iter().map(|cell| (&cell.id, cell)))
            .collect();
        if let Some(rows) = expect["grid"].as_array() {
            let actual: Vec<Vec<String>> = (0..grid.rows)
                .map(|row| {
                    (0..grid.columns)
                        .map(|column| match grid.at(row, column) {
                            None => "-".into(),
                            Some(cell) if known.contains(&cell.id) => cell.id.0.clone(),
                            Some(_) => "new".into(),
                        })
                        .collect()
                })
                .collect();
            let wanted: Vec<Vec<String>> =
                serde_json::from_value(Value::Array(rows.clone())).unwrap();
            assert_eq!(actual, wanted, "{id}");
        }
        if let Some(kinds) = expect["kinds"].as_array() {
            for (row, kinds) in kinds.iter().enumerate() {
                let actual: String = (0..grid.columns)
                    .map(|column| {
                        let cell = grid.at(row, column).unwrap();
                        if cells[&cell.id].block_type == "tableHeader" {
                            'h'
                        } else {
                            'c'
                        }
                    })
                    .collect();
                assert_eq!(actual, kinds.as_str().unwrap(), "{id}");
            }
        }
        if let Some(texts) = expect["text"].as_object() {
            for (cell, value) in texts {
                assert_eq!(
                    text(cells[&BlockId(cell.clone())]),
                    value.as_str().unwrap(),
                    "{id}"
                );
            }
        }
        if let Some(stored) = expect["stored"].as_object() {
            for (cell, attrs) in stored {
                let block = cells[&BlockId(cell.clone())];
                for (name, value) in attrs.as_object().unwrap() {
                    let wanted = AttrValue::Number(value.as_f64().unwrap());
                    assert_eq!(block.attrs.get(name), Some(&wanted), "{id}: {cell}.{name}");
                }
            }
        }
        if let Some(widths) = expect.get("colWidths") {
            let actual = match written.attrs.get("colWidths") {
                Some(AttrValue::Array(values)) => Value::Array(
                    values
                        .iter()
                        .map(|value| match value {
                            AttrValue::Number(number) => serde_json::json!(*number as i64),
                            _ => Value::Null,
                        })
                        .collect(),
                ),
                _ => Value::Null,
            };
            assert_eq!(&actual, widths, "{id}");
        }
        if let Some(caret) = expect["caret"].as_array() {
            match next.selection() {
                Selection::Cursor { block_id, offset } => {
                    assert_eq!(block_id.0, caret[0].as_str().unwrap(), "{id}");
                    assert_eq!(*offset as u64, caret[1].as_u64().unwrap(), "{id}");
                }
                other => panic!("{id}: {other:?}"),
            }
        }
    }
}

#[test]
fn edit_json_matches_the_typescript_shape() {
    let edit: TableEdit = serde_json::from_str(
        r#"{"type":"mergeCells","from":{"row":0,"column":1},"to":{"row":1,"column":2}}"#,
    )
    .unwrap();
    assert_eq!(
        serde_json::to_string(&edit).unwrap(),
        r#"{"type":"mergeCells","from":{"row":0,"column":1},"to":{"row":1,"column":2}}"#
    );
    assert!(
        serde_json::from_str::<TableEdit>(r#"{"type":"deleteRow","index":1,"count":2}"#).is_ok()
    );
    assert!(serde_json::from_str::<TableEdit>(r#"{"type":"splitCell","row":0}"#).is_err());
}
