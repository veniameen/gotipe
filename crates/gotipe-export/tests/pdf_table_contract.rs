#![cfg(feature = "pdf")]

use gotipe_core::{Block, BlockContent, Document};
use gotipe_export::input::document_from_json;
use gotipe_export::pdf::{to_pdf, PdfOptions};
use serde_json::{json, Value};

fn table(rows: Value) -> Document {
    let mut document = document_from_json(&json!({"version":1,"blocks":[]}).to_string()).unwrap();
    let mut table = Block::new_with_type("table", BlockContent::Empty);
    table.children = rows.as_array().unwrap().iter().enumerate().map(|(index, cells)| {
        let row = json!({"version":1,"blocks":[{
            "id":format!("row-{index}"),"type":"tableRow","attrs":{},"content":null,"children":cells
        }]});
        document_from_json(&row.to_string()).unwrap().blocks.remove(0)
    }).collect();
    document.blocks.push(table);
    document
}

fn cell(id: &str, colspan: u32, rowspan: u32) -> Value {
    json!({"id":id,"type":"tableCell","attrs":{"colspan":colspan,"rowspan":rowspan},
        "content":[{"text":format!("Ячейка {id} 😀"),"marks":[]}],"children":[]})
}

#[test]
fn merged_first_row_exports_as_pdf_instead_of_exceeding_column_count() {
    let document = table(json!([
        [cell("merged", 2, 1)],
        [cell("left", 1, 1), cell("right", 1, 1)]
    ]));
    let output = to_pdf(&document, &PdfOptions::default()).unwrap();
    assert!(output.starts_with(b"%PDF-"));
}

#[test]
fn mixed_row_and_column_spans_compile_without_overlapping_cells() {
    let document = table(json!([
        [cell("tall-left", 2, 2), cell("top-right", 2, 1)],
        [cell("bottom-right", 2, 1)],
        [cell("footer", 4, 1)]
    ]));
    let output = to_pdf(&document, &PdfOptions::default()).unwrap();
    assert!(output.starts_with(b"%PDF-"));
}

#[test]
fn overlapping_spans_fail_instead_of_silently_moving_content_to_another_row() {
    let document = table(json!([
        [cell("top-left", 1, 1), cell("tall-right", 1, 2)],
        [cell("overlap", 2, 1)]
    ]));
    let error = to_pdf(&document, &PdfOptions::default()).unwrap_err();
    assert!(error.to_string().contains("Overlapping PDF table spans"));
}
