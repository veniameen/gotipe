use gotipe_schema::{defaults, AttrValue, Block, BlockContent, Document, Mark, TextSpan};
use std::collections::HashMap;

#[test]
fn native_validation_checks_node_mark_types_top_level_and_unique_ids() {
    let schema = defaults::default_block_editor();
    let mut heading = Block::new_with_type(
        "heading",
        BlockContent::RichText(vec![TextSpan {
            text: "Title".into(),
            marks: vec![],
        }]),
    );
    heading.attrs.insert("level".into(), AttrValue::Number(2.0));
    let mut doc = Document {
        version: 0,
        blocks: vec![heading],
    };
    assert!(schema.validate(&doc).is_ok());
    doc.blocks[0]
        .attrs
        .insert("level".into(), AttrValue::String("2".into()));
    assert!(schema.validate(&doc).is_err());
    doc.blocks[0]
        .attrs
        .insert("level".into(), AttrValue::Number(2.0));
    if let BlockContent::RichText(spans) = &mut doc.blocks[0].content {
        spans[0].marks.push(Mark {
            mark_type: "link".into(),
            attrs: HashMap::from([("href".into(), AttrValue::Bool(true))]),
        });
    }
    assert!(schema.validate(&doc).is_err());
    if let BlockContent::RichText(spans) = &mut doc.blocks[0].content {
        spans[0].marks.clear();
    }
    doc.blocks.push(doc.blocks[0].clone());
    assert!(schema.validate(&doc).is_err());
    doc.blocks = vec![Block::new_with_type("tableRow", BlockContent::Empty)];
    assert!(schema.validate(&doc).is_err());
}

#[test]
fn paragraphs_and_headings_take_one_of_four_alignments() {
    let schema = defaults::default_block_editor();
    let text = || {
        BlockContent::RichText(vec![TextSpan {
            text: "Текст".into(),
            marks: vec![],
        }])
    };
    let mut paragraph = Block::new_with_type("paragraph", text());
    let mut heading = Block::new_with_type("heading", text());
    heading.attrs.insert("level".into(), AttrValue::Number(1.0));
    for align in ["left", "center", "right", "justify"] {
        paragraph
            .attrs
            .insert("align".into(), AttrValue::String(align.into()));
        heading
            .attrs
            .insert("align".into(), AttrValue::String(align.into()));
        let doc = Document {
            version: 0,
            blocks: vec![paragraph.clone(), heading.clone()],
        };
        assert!(schema.validate(&doc).is_ok(), "{align}");
    }
    paragraph.attrs.insert("align".into(), AttrValue::Null);
    let unset = Document {
        version: 0,
        blocks: vec![paragraph.clone()],
    };
    assert!(schema.validate(&unset).is_ok());
    paragraph
        .attrs
        .insert("align".into(), AttrValue::String("middle".into()));
    let invalid = Document {
        version: 0,
        blocks: vec![paragraph],
    };
    assert!(schema.validate(&invalid).is_err());
    let mut item = Block::new_with_type("listItem", text());
    item.attrs
        .insert("align".into(), AttrValue::String("left".into()));
    let mut list = Block::new_with_type("bulletList", BlockContent::Empty);
    list.children.push(item);
    let undeclared = Document {
        version: 0,
        blocks: vec![list],
    };
    assert!(schema.validate(&undeclared).is_err());
}

fn styled(marks: Vec<Mark>) -> BlockContent {
    BlockContent::RichText(vec![TextSpan {
        text: "مرحبا 😀".into(),
        marks,
    }])
}

fn mark(kind: &str, name: &str, value: AttrValue) -> Mark {
    Mark {
        mark_type: kind.into(),
        attrs: HashMap::from([(name.into(), value)]),
    }
}

#[test]
fn font_family_and_size_marks_validate_their_attributes() {
    let schema = defaults::default_block_editor();
    let doc = |marks: Vec<Mark>| Document {
        version: 0,
        blocks: vec![Block::new_with_type("paragraph", styled(marks))],
    };
    for family in ["system", "serif", "mono"] {
        let family = mark("fontFamily", "family", AttrValue::String(family.into()));
        assert!(schema.validate(&doc(vec![family])).is_ok());
    }
    // Any number is a valid document value; only renderers apply the bounds.
    for size in [15.0, 15.5, 400.0] {
        let size = mark("fontSize", "size", AttrValue::Number(size));
        assert!(schema.validate(&doc(vec![size])).is_ok());
    }
    let both = vec![
        mark("fontFamily", "family", AttrValue::String("mono".into())),
        mark("fontSize", "size", AttrValue::Number(18.0)),
    ];
    assert!(schema.validate(&doc(both)).is_ok());
    for invalid in [
        mark("fontFamily", "family", AttrValue::String("comic".into())),
        mark("fontFamily", "family", AttrValue::Number(1.0)),
        mark("fontSize", "size", AttrValue::String("15px".into())),
        Mark {
            mark_type: "fontSize".into(),
            attrs: HashMap::new(),
        },
        Mark {
            mark_type: "fontFamily".into(),
            attrs: HashMap::new(),
        },
    ] {
        assert!(
            schema.validate(&doc(vec![invalid.clone()])).is_err(),
            "{invalid:?}"
        );
    }
}

#[test]
fn paragraphs_headings_and_list_items_take_a_direction() {
    let schema = defaults::default_block_editor();
    let with_dir = |kind: &str, dir: AttrValue| {
        let mut block = Block::new_with_type(kind, styled(vec![]));
        if kind == "heading" {
            block.attrs.insert("level".into(), AttrValue::Number(1.0));
        }
        block.attrs.insert("dir".into(), dir);
        block
    };
    let wrap = |list: &str, item: Block| {
        let mut parent = Block::new_with_type(list, BlockContent::Empty);
        parent.children.push(item);
        parent
    };
    for dir in ["ltr", "rtl", "auto"] {
        let value = || AttrValue::String(dir.into());
        let doc = Document {
            version: 0,
            blocks: vec![
                with_dir("paragraph", value()),
                with_dir("heading", value()),
                wrap("bulletList", with_dir("listItem", value())),
                wrap("todoList", with_dir("todoItem", value())),
            ],
        };
        assert!(schema.validate(&doc).is_ok(), "{dir}");
    }
    for invalid in [
        with_dir("paragraph", AttrValue::String("RTL".into())),
        with_dir("heading", AttrValue::Number(1.0)),
        wrap(
            "todoList",
            with_dir("todoItem", AttrValue::String("sideways".into())),
        ),
        with_dir("blockquote", AttrValue::String("rtl".into())),
    ] {
        let doc = Document {
            version: 0,
            blocks: vec![invalid],
        };
        assert!(schema.validate(&doc).is_err());
    }
}
