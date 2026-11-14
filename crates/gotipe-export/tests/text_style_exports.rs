//! Font marks and the block attribute `dir` of @gotipe/core (`FontFamily`, `FontSize`,
//! `TextDirection`): every native export accepts them; files without an equivalent keep the text.
#![cfg(all(feature = "docx", feature = "pdf"))]

use gotipe_export::docx::{to_docx, DocxOptions};
use gotipe_export::input::document_from_json;
use gotipe_export::markdown::to_markdown;
use gotipe_export::pdf::{to_pdf, PdfOptions};
use gotipe_export::plaintext::to_plaintext;

const DOCUMENT: &str = r#"{"version":1,"blocks":[
  {"id":"h","type":"heading","attrs":{"level":2,"dir":"rtl"},"content":[{"text":"عنوان","marks":[]}]},
  {"id":"p","type":"paragraph","attrs":{"dir":"auto","align":"right"},"content":[
    {"text":"a ","marks":[{"type":"fontFamily","attrs":{"family":"mono"}}]},
    {"text":"b","marks":[{"type":"bold","attrs":{}},{"type":"fontSize","attrs":{"size":18}}]},
    {"text":" c","marks":[{"type":"fontSize","attrs":{"size":400}}]}
  ]},
  {"id":"l","type":"bulletList","attrs":{},"content":null,"children":[
    {"id":"i","type":"listItem","attrs":{"dir":"rtl"},"content":[{"text":"שלום","marks":[]}]}
  ]},
  {"id":"t","type":"todoList","attrs":{},"content":null,"children":[
    {"id":"d","type":"todoItem","attrs":{"dir":"ltr","checked":true},"content":[{"text":"done","marks":[]}]}
  ]}
]}"#;

#[test]
fn docx_pdf_markdown_and_text_accept_font_marks_and_direction() {
    let document = document_from_json(DOCUMENT).unwrap();
    assert!(!to_docx(&document, &DocxOptions::default())
        .unwrap()
        .is_empty());
    assert!(to_pdf(&document, &PdfOptions::default())
        .unwrap()
        .starts_with(b"%PDF"));
    // Markdown has no syntax for them: the text and the other marks stay.
    assert_eq!(
        to_markdown(&document),
        "## عنوان\n\na **b** c\n\n- שלום\n\n- [x] done\n"
    );
    assert!(to_plaintext(&document).contains("a b c"));
}
