//! Inline atoms in Markdown: mentions, inline formulas, custom emoji and inline images.
//! The TS reader and writer check the same fixture (packages/markdown/src/atoms.test.ts).
use gotipe_core::{
    defaults::default_block_editor, AttrSpec, AttrType, AttrValue, BlockContent, MarkSpec, Schema,
};
use gotipe_export::{
    input::{document_from_json, public_document},
    markdown::{from_markdown, from_markdown_with_atoms, to_markdown, MarkdownAtoms},
};
use serde_json::Value;
use std::collections::HashMap;

fn normalize(value: &mut Value) {
    match value {
        Value::Number(number) => {
            *number = serde_json::Number::from_f64(number.as_f64().unwrap()).unwrap()
        }
        Value::Array(values) => values.iter_mut().for_each(normalize),
        Value::Object(object) => {
            // Blocks lose their generated id; the `id` of a mention is compared.
            if object.contains_key("children") {
                object.remove("id");
            }
            if let Some(Value::Object(attrs)) = object.get_mut("attrs") {
                attrs.remove("markdownDocumentSource");
                attrs.remove("markdownDocumentModel");
            }
            object.values_mut().for_each(normalize);
        }
        _ => {}
    }
}

/// The default schema with the four atomic marks, as a host that uses them declares it.
fn schema() -> Schema {
    let mut schema = default_block_editor();
    let attr = |attr_type| AttrSpec {
        attr_type,
        default: None,
        required: false,
    };
    for (name, attrs) in [
        ("mention", vec!["id", "label", "kind"]),
        ("inlineMath", vec![]),
        ("customEmoji", vec!["name", "src"]),
        ("inlineImage", vec!["src", "alt"]),
    ] {
        let mut attrs: HashMap<String, AttrSpec> = attrs
            .into_iter()
            .map(|key| (key.to_owned(), attr(AttrType::String)))
            .collect();
        attrs.insert("key".into(), attr(AttrType::String));
        if name == "inlineImage" {
            attrs.insert("width".into(), attr(AttrType::Number));
            attrs.insert("height".into(), attr(AttrType::Number));
        }
        schema.marks.insert(
            name.into(),
            MarkSpec {
                name: name.into(),
                exclusive_group: None,
                attrs,
                rank: 200,
                atomic: true,
            },
        );
    }
    schema
}

fn atoms(value: &Value) -> MarkdownAtoms {
    MarkdownAtoms {
        mention: value["mention"].as_bool().unwrap_or(false),
        inline_math: value["inlineMath"].as_bool().unwrap_or(false),
        inline_image: value["inlineImage"].as_bool().unwrap_or(false),
        custom_emoji: value["customEmoji"]
            .as_object()
            .map(|registry| {
                registry
                    .iter()
                    .map(|(name, src)| (name.clone(), src.as_str().unwrap().to_owned()))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/markdown-atoms.json")).unwrap()
}

#[test]
fn atoms_are_read_as_the_typescript_reader_reads_them() {
    let schema = schema();
    for case in fixture()["read"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let source = case["markdown"].as_str().unwrap();
        let doc = from_markdown_with_atoms(source, &schema, &atoms(&case["atoms"])).unwrap();
        schema.validate(&doc).unwrap();
        let mut actual = public_document(&doc)["blocks"].clone();
        let mut expected = case["blocks"].clone();
        normalize(&mut actual);
        normalize(&mut expected);
        assert_eq!(actual, expected, "{id}");
        assert_eq!(to_markdown(&doc), source, "{id}: unchanged source bytes");
    }
}

#[test]
fn atoms_are_written_as_the_typescript_writer_writes_them() {
    let schema = schema();
    for case in fixture()["write"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let document = document_from_json(&case["document"].to_string()).unwrap();
        let markdown = case["markdown"].as_str().unwrap();
        assert_eq!(to_markdown(&document), markdown, "{id}: writer output");
        let parsed = from_markdown_with_atoms(markdown, &schema, &atoms(&case["atoms"])).unwrap();
        schema.validate(&parsed).unwrap();
        let mut actual = public_document(&parsed)["blocks"].clone();
        let mut expected = case["reparsed"].clone();
        normalize(&mut actual);
        normalize(&mut expected);
        assert_eq!(actual, expected, "{id}: what the reader reads back");
    }
}

fn content(doc: &gotipe_core::Document, block: usize) -> Vec<(String, Vec<String>)> {
    match &doc.blocks[block].content {
        BlockContent::RichText(spans) => spans
            .iter()
            .map(|span| {
                (
                    span.text.clone(),
                    span.marks.iter().map(|m| m.mark_type.clone()).collect(),
                )
            })
            .collect(),
        other => panic!("rich text expected, got {other:?}"),
    }
}

#[test]
fn the_schema_decides_which_atoms_a_reader_produces() {
    let source = "[@Анна](mention:user-42) $x^2$ :party: и ![alt](a.png)\n";
    // The default schema declares no atomic marks: the source reads as before.
    let plain = from_markdown(source, &default_block_editor()).unwrap();
    default_block_editor().validate(&plain).unwrap();
    assert_eq!(
        content(&plain, 0),
        [
            ("@Анна".to_owned(), vec!["link".to_owned()]),
            (" $x^2$ :party: и ".to_owned(), vec![]),
            ("![alt](a.png)".to_owned(), vec!["mdRaw".to_owned()]),
        ]
    );
    // A schema with the atomic marks reads them; emoji need a registry.
    let with_atoms = from_markdown(source, &schema()).unwrap();
    schema().validate(&with_atoms).unwrap();
    assert_eq!(
        content(&with_atoms, 0),
        [
            ("@Анна".to_owned(), vec!["mention".to_owned()]),
            (" ".to_owned(), vec![]),
            ("x^2".to_owned(), vec!["inlineMath".to_owned()]),
            (" :party: и ".to_owned(), vec![]),
            ("alt".to_owned(), vec!["inlineImage".to_owned()]),
        ]
    );
    // A mark of that name that is not atomic is not an atom.
    let mut loose = schema();
    for mark in loose.marks.values_mut() {
        mark.atomic = false;
    }
    assert_eq!(
        content(&from_markdown(source, &loose).unwrap(), 0),
        content(&plain, 0)
    );
}

#[test]
fn typed_dollars_never_become_a_formula_and_unwritable_formulas_keep_their_text() {
    let schema = schema();
    let only_math = MarkdownAtoms {
        inline_math: true,
        ..MarkdownAtoms::default()
    };
    let paragraph = |spans: Value| {
        document_from_json(
            &serde_json::json!({"blocks": [{"id": "p", "type": "paragraph", "content": spans}]})
                .to_string(),
        )
        .unwrap()
    };
    for typed in [
        "$x$",
        "a $x$ b",
        "$a$ и $b$",
        "$$x$$",
        "$x$5 и $y$",
        "цена $5, а не $6",
        "$a$5 и 5$",
        "$ x$ $y $",
    ] {
        let markdown = to_markdown(&paragraph(serde_json::json!([{ "text": typed }])));
        for atoms in [&only_math, &MarkdownAtoms::default()] {
            let read = from_markdown_with_atoms(&markdown, &schema, atoms).unwrap();
            assert_eq!(
                content(&read, 0),
                [(typed.to_owned(), vec![])],
                "{markdown:?}"
            );
        }
    }
    assert_eq!(
        to_markdown(&paragraph(
            serde_json::json!([{ "text": "цена $5 and $6, скидка 5 $" }])
        )),
        "цена $5 and $6, скидка 5 $\n"
    );
    for tex in [" x", "x ", "a$b", "x\\", "$"] {
        let markdown = to_markdown(&paragraph(serde_json::json!([
            { "text": "до " },
            { "text": tex, "marks": [{ "type": "inlineMath" }] },
            { "text": " после" }
        ])));
        let read = from_markdown_with_atoms(&markdown, &schema, &only_math).unwrap();
        assert_eq!(
            content(&read, 0),
            [(format!("до {tex} после"), vec![])],
            "{markdown:?}"
        );
    }
}

#[test]
fn an_edit_keeps_atoms_and_their_attributes() {
    let schema = schema();
    let registry = MarkdownAtoms {
        custom_emoji: [("party".to_owned(), "https://cdn.test/party.png".to_owned())].into(),
        ..MarkdownAtoms::from_schema(&schema)
    };
    let source =
        "Привет, [@Анна](mention:user-%D1%8E%2F42) и $\\alpha$😀 :party: ![Схема](i.png)\n";
    let mut doc = from_markdown_with_atoms(source, &schema, &registry).unwrap();
    assert_eq!(to_markdown(&doc), source);
    let before = public_document(&doc)["blocks"][0]["content"].clone();
    assert_eq!(
        before[1]["marks"][0]["attrs"],
        serde_json::json!({"id": "ю/42", "kind": "user", "label": "Анна", "key": "1"})
    );
    // Dropping the source snapshot forces a rewrite of every block.
    doc.blocks[0].attrs.remove("markdownDocumentSource");
    doc.blocks[0].attrs.remove("markdownDocumentModel");
    doc.blocks[0]
        .attrs
        .insert("breaks".into(), AttrValue::String("hard".into()));
    let rewritten = to_markdown(&doc);
    let again = from_markdown_with_atoms(&rewritten, &schema, &registry).unwrap();
    assert_eq!(
        public_document(&again)["blocks"][0]["content"],
        before,
        "{rewritten}"
    );
}
