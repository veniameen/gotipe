use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark, TextSpan};
use gotipe_export::{
    input::document_from_json,
    markdown::{from_markdown, to_markdown},
};

fn paragraph(text: &str) -> Block {
    Block::new_with_type(
        "paragraph",
        BlockContent::RichText(vec![TextSpan {
            text: text.into(),
            marks: vec![],
        }]),
    )
}
#[test]
fn imports_nested_blocks_marks_tables_and_tasks_without_dropping_text() {
    let md="# Заголовок\n\n**bold** and *italic* [link](https://example.com)\n\n- first\n  - nested 😀\n\n+ [x] finished\n\n| A | B |\n| --- | --- |\n| one | два |\n";
    let doc = from_markdown(md, &gotipe_core::defaults::default_block_editor()).unwrap();
    assert_eq!(to_markdown(&doc), md);
    assert!(doc.blocks.iter().any(|b| b.block_type == "table"));
    assert!(doc.blocks.iter().any(|b| b.block_type == "todoList"));
    let BlockContent::RichText(spans) = &doc.blocks[1].content else {
        panic!()
    };
    assert!(spans
        .iter()
        .any(|span| span.marks.iter().any(|mark| mark.mark_type == "bold")));
    assert!(spans
        .iter()
        .any(|span| span.marks.iter().any(|mark| mark.mark_type == "link")));
    assert!(gotipe_export::to_plaintext(&doc).contains("nested 😀"));
}
#[test]
fn original_source_is_only_reused_for_unchanged_content() {
    let mut doc = from_markdown(
        "#  Title\r\n\r\nhello\r\n",
        &gotipe_core::defaults::default_block_editor(),
    )
    .unwrap();
    assert_eq!(to_markdown(&doc), "#  Title\r\n\r\nhello\r\n");
    doc.blocks[1].content = BlockContent::RichText(vec![TextSpan {
        text: "edited".into(),
        marks: vec![],
    }]);
    let md = to_markdown(&doc);
    assert!(md.contains("edited"));
    assert!(!md.contains("hello"));
}
#[test]
fn inline_html_is_retained_as_raw_marks_and_standalone_images_are_structured() {
    let source = "<custom-widget data-x=\"1\">hello</custom-widget>\n\n![asset](thing.png)\n";
    let doc = from_markdown(source, &gotipe_core::defaults::default_block_editor()).unwrap();
    assert_eq!(doc.blocks[0].block_type, "paragraph");
    let BlockContent::RichText(spans) = &doc.blocks[0].content else {
        panic!("inline HTML paragraph")
    };
    assert!(spans
        .iter()
        .any(|span| span.marks.iter().any(|mark| mark.mark_type == "mdRaw")));
    assert_eq!(doc.blocks[1].block_type, "image");
    assert_eq!(
        doc.blocks[1].attrs.get("src"),
        Some(&AttrValue::String("thing.png".into()))
    );
    assert_eq!(to_markdown(&doc), source);
}
#[test]
fn markdown_serialization_keeps_nested_content_and_safe_fences() {
    let mut item = Block::new_with_type(
        "listItem",
        BlockContent::RichText(vec![TextSpan {
            text: "parent".into(),
            marks: vec![],
        }]),
    );
    item.children.push(paragraph("nested"));
    let mut list = Block::new_with_type("bulletList", BlockContent::Empty);
    list.children.push(item);
    let code = Block::new_with_type("codeBlock", BlockContent::Raw("literal ``` fence".into()));
    let doc = Document {
        blocks: vec![list, code],
        version: 0,
    };
    let md = to_markdown(&doc);
    assert!(md.contains("  nested"));
    assert!(md.contains("````\n"));
}
#[test]
fn html_escapes_attributes_and_keeps_nested_data() {
    let mut heading = paragraph("outer");
    heading.block_type = "heading".into();
    heading.children.push(paragraph("child"));
    let mut code = Block::new_with_type(
        "codeBlock",
        BlockContent::Raw("<script>bad</script>".into()),
    );
    code.attrs.insert(
        "language".into(),
        AttrValue::String("x\" onclick=\"bad".into()),
    );
    let mut linked = paragraph("link");
    linked.content = BlockContent::RichText(vec![TextSpan {
        text: "link".into(),
        marks: vec![Mark::new("link")
            .with_attr("href", AttrValue::String("javascript:alert(1)".into()))
            .with_attr("target", AttrValue::String("\" onclick=\"bad".into()))],
    }]);
    let html = gotipe_export::to_html(&Document {
        blocks: vec![heading, code, linked],
        version: 0,
    })
    .unwrap();
    assert!(html.contains("<p>child</p>"));
    assert!(!html.contains("javascript:"));
    assert!(!html.contains("<script>"));
    assert!(html.contains("&quot; onclick=&quot;bad"));
    assert!(!html.contains("target=\"\" onclick"));
}
#[test]
fn js_and_rust_document_inputs_have_same_content() {
    let js = r#"{"blocks":[{"id":"p","type":"paragraph","content":[{"text":"😀Привет","marks":[{"type":"bold"}]}]}]}"#;
    let doc = document_from_json(js).unwrap();
    let rust = serde_json::to_string(&doc).unwrap();
    let decoded = document_from_json(&rust).unwrap();
    assert_eq!(gotipe_export::to_plaintext(&decoded), "😀Привет");
    let public = gotipe_export::input::public_document(&decoded);
    assert_eq!(public["blocks"][0]["type"], "paragraph");
    assert_eq!(
        public["blocks"][0]["content"][0]["marks"][0]["type"],
        "bold"
    );
}
