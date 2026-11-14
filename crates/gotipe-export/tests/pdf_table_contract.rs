#![cfg(feature = "pdf")]

use gotipe_core::{Block, BlockContent, Document};
use gotipe_export::input::document_from_json;
use gotipe_export::pdf::{to_pdf, PdfOptions};
use serde_json::{json, Value};
use std::io::Read;

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

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    hay[from..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|position| position + from)
}

/// Every glyph the pages draw, with its `ActualText` and position, in drawing order.
fn glyphs(pdf: &[u8]) -> Vec<(String, f64, f64)> {
    let glyph = regex::Regex::new(
        r"/ActualText \(([^)]*)\)\s*>> BDC\s*/F\d+ [\d.]+ Tf\s*1 0 0 1 ([\d.]+) ([\d.]+) Tm",
    )
    .unwrap();
    let mut found = Vec::new();
    let mut at = 0;
    while let Some(filter) = find(pdf, b"/FlateDecode", at) {
        let open = find(pdf, b"stream", filter).unwrap() + 6;
        let start = open + if pdf[open] == b'\r' { 2 } else { 1 };
        let end = find(pdf, b"endstream", start).unwrap();
        let mut content = String::new();
        if flate2::read::ZlibDecoder::new(&pdf[start..end])
            .read_to_string(&mut content)
            .is_ok()
        {
            for capture in glyph.captures_iter(&content) {
                found.push((
                    capture[1].to_owned(),
                    capture[2].parse().unwrap(),
                    capture[3].parse().unwrap(),
                ));
            }
        }
        at = end;
    }
    found
}

/// Where a word is drawn: the position of its first glyph on one line.
fn place(glyphs: &[(String, f64, f64)], word: &str) -> (f64, f64) {
    let letters: Vec<String> = word.chars().map(String::from).collect();
    glyphs
        .windows(letters.len())
        .find(|run| {
            run.iter()
                .zip(&letters)
                .all(|(glyph, letter)| &glyph.0 == letter)
                && run.iter().all(|glyph| glyph.2 == run[0].2)
        })
        .map(|run| (run[0].1, run[0].2))
        .unwrap_or_else(|| panic!("{word} is not drawn"))
}

fn text_cell(id: &str, kind: &str, text: &str, colspan: u32, rowspan: u32) -> Value {
    json!({"id":id,"type":kind,"attrs":{"colspan":colspan,"rowspan":rowspan},
        "content":[{"text":text,"marks":[]}],"children":[]})
}

/// Atlas frame 29: two header rows under cells over both of them, a header over two columns and a
/// body cell over two rows.
#[test]
fn header_rows_under_tall_headers_and_a_tall_body_cell_lay_out() {
    let head = |id: &str, text: &str, columns: u32, rows: u32| {
        text_cell(id, "tableHeader", text, columns, rows)
    };
    let body = |id: &str, text: &str, rows: u32| text_cell(id, "tableCell", text, 1, rows);
    let document = table(json!([
        [
            head("p", "Platform", 1, 2),
            head("l", "Log", 2, 1),
            head("e", "Encryption", 1, 2)
        ],
        [head("k", "Key", 1, 1), head("q", "Queued", 1, 1)],
        [
            body("w", "Web", 1),
            body("wk", "webkey", 1),
            body("wq", "1284", 1),
            body("s", "Session", 2)
        ],
        [
            body("m", "Mac", 1),
            body("mk", "mackey", 1),
            body("mq", "312", 1)
        ],
        [
            body("i", "Ios", 1),
            body("ik", "ioskey", 1),
            body("iq", "27", 1),
            body("n", "None", 1)
        ]
    ]));
    let pdf = to_pdf(&document, &PdfOptions::default()).unwrap();
    let glyphs = glyphs(&pdf);
    let at = |word: &str| place(&glyphs, word);
    // columns: the header over two columns starts where its first column does; the tall
    // headers and the tall body cell stand in their own columns
    assert_eq!(at("Log").0, at("Key").0);
    assert!(at("Queued").0 > at("Key").0);
    assert!(at("Encryption").0 > at("Queued").0);
    assert_eq!(at("Encryption").0, at("Session").0);
    assert_eq!(at("Session").0, at("None").0);
    assert_eq!(at("Platform").0, at("Web").0);
    // rows: the tall headers start on the first row, the second header row is below it
    assert_eq!(at("Platform").1, at("Log").1);
    assert_eq!(at("Encryption").1, at("Log").1);
    assert!(at("Key").1 < at("Log").1);
    assert_eq!(at("Key").1, at("Queued").1);
    // the tall body cell starts on its first row and the next row draws nothing in its column
    assert_eq!(at("Session").1, at("Web").1);
    assert!(at("Mac").1 < at("Web").1);
    assert!(at("Ios").1 < at("Mac").1);
    let column = at("Session").0;
    assert!(!glyphs
        .iter()
        .any(|glyph| glyph.2 == at("Mac").1 && glyph.1 >= column));
    // the tags say the same: one header over two columns, three cells over two rows
    let text = String::from_utf8_lossy(&pdf);
    assert_eq!(text.matches("/ColSpan 2").count(), 1);
    assert_eq!(text.matches("/RowSpan 2").count(), 3);
    assert_eq!(text.matches("/S /TR").count(), 5);
}
