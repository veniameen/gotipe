use gotipe_core::defaults::default_block_editor;
use gotipe_export::{
    input::public_document,
    markdown::{from_markdown, to_markdown},
};
use serde_json::Value;

fn normalize(blocks: &mut Value) {
    for block in blocks.as_array_mut().unwrap() {
        let object = block.as_object_mut().unwrap();
        object.remove("id");
        let attrs = object.get_mut("attrs").unwrap().as_object_mut().unwrap();
        attrs.remove("markdownDocumentSource");
        attrs.remove("markdownDocumentModel");
        normalize(object.get_mut("children").unwrap());
    }
}
fn numbers(value: &mut Value) {
    match value {
        Value::Number(number) => {
            *number = serde_json::Number::from_f64(number.as_f64().unwrap()).unwrap()
        }
        Value::Array(values) => values.iter_mut().for_each(numbers),
        Value::Object(values) => values.values_mut().for_each(numbers),
        _ => {}
    }
}
#[test]
fn own_public_markdown_fixtures_match_the_typescript_parser() {
    let fixtures: Vec<Value> =
        serde_json::from_str(include_str!("markdown_fixtures.json")).unwrap();
    for mut fixture in fixtures {
        numbers(&mut fixture);
        let source = fixture["markdown"].as_str().unwrap();
        let doc = from_markdown(source, &default_block_editor()).unwrap();
        default_block_editor().validate(&doc).unwrap();
        let mut public = public_document(&doc);
        normalize(&mut public["blocks"]);
        assert_eq!(public["blocks"], fixture["blocks"], "{source:?}");
        assert_eq!(to_markdown(&doc), source, "unchanged source bytes");
    }
}
#[test]
fn adversarial_nesting_and_delimiters_are_bounded_and_preserved() {
    for source in [
        "[".repeat(50_000),
        format!("{}text{}", "* ".repeat(5000), " *".repeat(5000)),
        format!("{}Ж😀", "> ".repeat(100)),
        nested_lazy_ends(true),
        nested_lazy_ends(false),
    ] {
        let doc = from_markdown(&source, &default_block_editor()).unwrap();
        assert_eq!(to_markdown(&doc), source);
    }
}

/// Level k: a fence in quote or item k, then a line without its `>` or indentation that the fence
/// would take in, so each level reads its content again without that line: once per level, not
/// twice per level in turn (D-160).
fn nested_lazy_ends(quotes: bool) -> String {
    let mut source = String::new();
    if !quotes {
        for k in 1..=30 {
            source += &format!("{}- a\n", "  ".repeat(k - 1));
        }
    }
    for k in (1..=30).rev() {
        source += &if quotes {
            format!("{} ```\n{}x\n", ">".repeat(k), "> ".repeat(k - 1))
        } else {
            format!("{}```\n{}x\n", "  ".repeat(k), "  ".repeat(k - 1))
        };
    }
    source
}

#[test]
fn editing_keeps_markdown_metadata_and_raw_inline_semantics() {
    let source = "```rust line=2\nlet x = 1;\n```\n\n![alt](image.png \"caption\")\n\n> [!WARNING]\n> attention\n\n| Left | Center |\n| :--- | :---: |\n| a\\|b | two |\n\nraw <custom>keep</custom> [title](doc.md \"heading &amp; more\")\n";
    let mut doc = from_markdown(source, &default_block_editor()).unwrap();
    let before = public_document(&doc);
    doc.blocks.push(gotipe_core::Block::new_with_type(
        "paragraph",
        gotipe_core::BlockContent::RichText(vec![gotipe_core::TextSpan {
            text: "added".into(),
            marks: vec![],
        }]),
    ));
    let output = to_markdown(&doc);
    let reparsed = from_markdown(&output, &default_block_editor()).unwrap();
    let mut expected = before["blocks"].clone();
    let mut actual = public_document(&reparsed)["blocks"].clone();
    actual.as_array_mut().unwrap().pop();
    normalize(&mut expected);
    normalize(&mut actual);
    assert_eq!(actual, expected, "{output}");
}

#[test]
fn malformed_percent_encoding_next_to_unicode_never_slices_inside_a_scalar() {
    for source in [
        "[%😀](%😀)",
        "[%Ж](%Ж)",
        "[a%ZZ](a%ZZ)",
        "[a%41%ZZ](a%41%ZZ)",
    ] {
        let document = from_markdown(source, &default_block_editor()).unwrap();
        assert_eq!(document.blocks[0].block_type, "file");
        assert_eq!(to_markdown(&document), source);
    }
}

#[test]
fn styled_inline_colors_survive_edits_without_executable_css() {
    let schema = default_block_editor();
    let source = "Text <span style=\"color:rgb(12 34 56 / 50%)\"><strong>цвет</strong></span> <mark style='background:#abc'>😀</mark>.";
    let mut doc = from_markdown(source, &schema).unwrap();
    schema.validate(&doc).unwrap();
    let expected = public_document(&doc);
    assert_eq!(
        expected["blocks"][0]["content"][1]["marks"][1]["type"],
        "textColor"
    );
    doc.blocks[0].attrs.remove("markdownDocumentSource");
    doc.blocks[0].attrs.remove("markdownDocumentModel");
    let markdown = to_markdown(&doc);
    let mut reparsed = public_document(&from_markdown(&markdown, &schema).unwrap());
    let mut expected = expected;
    normalize(&mut expected["blocks"]);
    normalize(&mut reparsed["blocks"]);
    assert_eq!(reparsed["blocks"], expected["blocks"], "{markdown}");
    if let gotipe_core::BlockContent::RichText(spans) = &mut doc.blocks[0].content {
        for mark in spans.iter_mut().flat_map(|span| &mut span.marks) {
            if mark.mark_type == "textColor" {
                mark.attrs.insert(
                    "color".into(),
                    gotipe_core::AttrValue::String("red;position:fixed".into()),
                );
            }
        }
    }
    assert!(!to_markdown(&doc).contains("position:"));
    assert!(
        !gotipe_export::html::to_html(&doc, &gotipe_export::ExportOptions::default())
            .unwrap()
            .contains("position:")
    );
}
