#![cfg(feature = "pdf")]

use gotipe_export::input::document_from_json;
use gotipe_export::pdf::{to_pdf, PdfOptions};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Corpus {
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    id: String,
    document: Value,
    options: Value,
    expect: Value,
}

/// The fixed JSON is also consumed by independent Poppler/pypdf and browser checks.
/// Set GOTIPE_PDF_CORPUS_OUTPUT to retain native PDFs for cross-runtime validation.
#[test]
fn public_pdf_corpus_preserves_success_and_explicit_error_contracts() {
    let corpus: Corpus = serde_json::from_str(include_str!("fixtures/pdf-corpus.json")).unwrap();
    let output = std::env::var_os("GOTIPE_PDF_CORPUS_OUTPUT").map(std::path::PathBuf::from);
    if let Some(path) = &output {
        std::fs::create_dir_all(path).unwrap();
    }
    let mut failures = Vec::new();
    for case in corpus.cases {
        if let Some(path) = &output {
            for suffix in ["native.pdf", "native.error.txt"] {
                let file = path.join(format!("{}.{}", case.id, suffix));
                if file.exists() {
                    std::fs::remove_file(file).unwrap();
                }
            }
        }
        let document = document_from_json(&case.document.to_string()).unwrap();
        let before = serde_json::to_value(&document).unwrap();
        let options: PdfOptions = serde_json::from_value(case.options).unwrap();
        let result = to_pdf(&document, &options);
        assert_eq!(
            before,
            serde_json::to_value(&document).unwrap(),
            "{} mutated input",
            case.id
        );
        let expects_error = case
            .expect
            .get("error")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        match result {
            Ok(bytes) => {
                assert!(bytes.starts_with(b"%PDF-"), "{} is not a PDF", case.id);
                if let Some(path) = &output {
                    std::fs::write(path.join(format!("{}.native.pdf", case.id)), bytes).unwrap();
                }
                if expects_error {
                    failures.push(format!("{} unexpectedly succeeded", case.id));
                }
            }
            Err(error) if !expects_error => failures.push(format!("{}: {error}", case.id)),
            Err(error) => {
                if let Some(path) = &output {
                    std::fs::write(
                        path.join(format!("{}.native.error.txt", case.id)),
                        error.to_string(),
                    )
                    .unwrap();
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "PDF corpus failures:\n{}",
        failures.join("\n")
    );
}

#[test]
fn invalid_numeric_options_fail_before_layout() {
    let document = document_from_json(
        r#"{"blocks":[{"id":"p","type":"paragraph","content":[{"text":"Validation"}]}]}"#,
    )
    .unwrap();
    for font_size in [0.0, 101.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let options = PdfOptions {
            font_size,
            ..PdfOptions::default()
        };
        assert!(
            to_pdf(&document, &options).is_err(),
            "font size {font_size} must fail"
        );
    }
    for margin in [-1.0, 201.0, f64::NAN, f64::INFINITY] {
        let mut options = PdfOptions::default();
        options.margin.left = margin;
        assert!(
            to_pdf(&document, &options).is_err(),
            "margin {margin} must fail"
        );
    }
}
