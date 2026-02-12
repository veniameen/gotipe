use std::collections::HashMap;

use crate::attr::{AttrSpec, AttrType, AttrValue};
use crate::mark_spec::MarkSpec;
use crate::node_spec::{ContentRule, MarksRule, NodeSpec};
use crate::validate::Schema;

/// Create the standard schema with Notion-like block types
pub fn default_block_editor() -> Schema {
    let mut nodes = HashMap::new();
    let mut marks = HashMap::new();

    // === Nodes (20) ===

    nodes.insert(
        "paragraph".into(),
        NodeSpec {
            name: "paragraph".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "heading".into(),
        NodeSpec {
            name: "heading".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([(
                "level".into(),
                AttrSpec {
                    attr_type: AttrType::Enum(
                        vec!["1", "2", "3", "4", "5", "6"]
                            .into_iter()
                            .map(String::from)
                            .collect(),
                    ),
                    default: Some(AttrValue::Number(1.0)),
                    required: true,
                },
            )]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "bulletList".into(),
        NodeSpec {
            name: "bulletList".into(),
            group: vec!["block".into(), "list".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["listItem".into()]),
        },
    );

    nodes.insert(
        "orderedList".into(),
        NodeSpec {
            name: "orderedList".into(),
            group: vec!["block".into(), "list".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([(
                "start".into(),
                AttrSpec {
                    attr_type: AttrType::Number,
                    default: Some(AttrValue::Number(1.0)),
                    required: false,
                },
            )]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["listItem".into()]),
        },
    );

    nodes.insert(
        "listItem".into(),
        NodeSpec {
            name: "listItem".into(),
            group: vec!["listChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([(
                "checked".into(),
                AttrSpec {
                    attr_type: AttrType::Bool,
                    default: None,
                    required: false,
                },
            )]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["bulletList".into(), "orderedList".into()]),
        },
    );

    nodes.insert(
        "codeBlock".into(),
        NodeSpec {
            name: "codeBlock".into(),
            group: vec!["block".into()],
            content: ContentRule::RawText,
            attrs: HashMap::from([(
                "language".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("plain".into())),
                    required: false,
                },
            )]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "image".into(),
        NodeSpec {
            name: "image".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                (
                    "src".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: true,
                    },
                ),
                (
                    "alt".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: Some(AttrValue::String("".into())),
                        required: false,
                    },
                ),
                (
                    "width".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: None,
                        required: false,
                    },
                ),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "blockquote".into(),
        NodeSpec {
            name: "blockquote".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["paragraph".into()]),
        },
    );

    nodes.insert(
        "divider".into(),
        NodeSpec {
            name: "divider".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "callout".into(),
        NodeSpec {
            name: "callout".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([(
                "emoji".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("\u{1f4a1}".into())), // 💡
                    required: false,
                },
            )]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["paragraph".into()]),
        },
    );

    nodes.insert(
        "table".into(),
        NodeSpec {
            name: "table".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["tableRow".into()]),
        },
    );

    nodes.insert(
        "tableRow".into(),
        NodeSpec {
            name: "tableRow".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: false,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["tableCell".into(), "tableHeader".into()]),
        },
    );

    nodes.insert(
        "tableCell".into(),
        NodeSpec {
            name: "tableCell".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                (
                    "colspan".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: Some(AttrValue::Number(1.0)),
                        required: false,
                    },
                ),
                (
                    "rowspan".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: Some(AttrValue::Number(1.0)),
                        required: false,
                    },
                ),
            ]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "tableHeader".into(),
        NodeSpec {
            name: "tableHeader".into(),
            group: vec!["tableChild".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([
                (
                    "colspan".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: Some(AttrValue::Number(1.0)),
                        required: false,
                    },
                ),
                (
                    "rowspan".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: Some(AttrValue::Number(1.0)),
                        required: false,
                    },
                ),
            ]),
            top_level: false,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "toggle".into(),
        NodeSpec {
            name: "toggle".into(),
            group: vec!["block".into()],
            content: ContentRule::RichText,
            attrs: HashMap::from([(
                "open".into(),
                AttrSpec {
                    attr_type: AttrType::Bool,
                    default: Some(AttrValue::Bool(false)),
                    required: false,
                },
            )]),
            top_level: true,
            marks_allowed: MarksRule::All,
            leaf: false,
            allows_children: true,
            child_types: Some(vec![
                "paragraph".into(),
                "bulletList".into(),
                "orderedList".into(),
            ]),
        },
    );

    nodes.insert(
        "columns".into(),
        NodeSpec {
            name: "columns".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: Some(vec!["column".into()]),
        },
    );

    nodes.insert(
        "column".into(),
        NodeSpec {
            name: "column".into(),
            group: vec!["columnChild".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([(
                "width".into(),
                AttrSpec {
                    attr_type: AttrType::Number,
                    default: None,
                    required: false,
                },
            )]),
            top_level: false,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: true,
            child_types: None, // any block type
        },
    );

    nodes.insert(
        "embed".into(),
        NodeSpec {
            name: "embed".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                (
                    "url".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: true,
                    },
                ),
                (
                    "type".into(),
                    AttrSpec {
                        attr_type: AttrType::Enum(vec![
                            "youtube".into(),
                            "vimeo".into(),
                            "twitter".into(),
                            "codepen".into(),
                            "figma".into(),
                            "generic".into(),
                        ]),
                        default: Some(AttrValue::String("generic".into())),
                        required: false,
                    },
                ),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "math".into(),
        NodeSpec {
            name: "math".into(),
            group: vec!["block".into()],
            content: ContentRule::RawText,
            attrs: HashMap::new(),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: false,
            allows_children: false,
            child_types: None,
        },
    );

    nodes.insert(
        "file".into(),
        NodeSpec {
            name: "file".into(),
            group: vec!["block".into()],
            content: ContentRule::Empty,
            attrs: HashMap::from([
                (
                    "url".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: true,
                    },
                ),
                (
                    "name".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: true,
                    },
                ),
                (
                    "size".into(),
                    AttrSpec {
                        attr_type: AttrType::Number,
                        default: None,
                        required: false,
                    },
                ),
                (
                    "mime_type".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: false,
                    },
                ),
            ]),
            top_level: true,
            marks_allowed: MarksRule::None,
            leaf: true,
            allows_children: false,
            child_types: None,
        },
    );

    // === Marks (9) ===

    marks.insert(
        "bold".into(),
        MarkSpec {
            name: "bold".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 10,
        },
    );

    marks.insert(
        "italic".into(),
        MarkSpec {
            name: "italic".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 20,
        },
    );

    marks.insert(
        "underline".into(),
        MarkSpec {
            name: "underline".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 30,
        },
    );

    marks.insert(
        "strikethrough".into(),
        MarkSpec {
            name: "strikethrough".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 40,
        },
    );

    marks.insert(
        "code".into(),
        MarkSpec {
            name: "code".into(),
            exclusive_group: Some("code".into()),
            attrs: HashMap::new(),
            rank: 50,
        },
    );

    marks.insert(
        "link".into(),
        MarkSpec {
            name: "link".into(),
            exclusive_group: None,
            attrs: HashMap::from([
                (
                    "href".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: None,
                        required: true,
                    },
                ),
                (
                    "target".into(),
                    AttrSpec {
                        attr_type: AttrType::String,
                        default: Some(AttrValue::String("_blank".into())),
                        required: false,
                    },
                ),
            ]),
            rank: 60,
        },
    );

    marks.insert(
        "highlight".into(),
        MarkSpec {
            name: "highlight".into(),
            exclusive_group: None,
            attrs: HashMap::from([(
                "color".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: Some(AttrValue::String("yellow".into())),
                    required: false,
                },
            )]),
            rank: 5,
        },
    );

    marks.insert(
        "superscript".into(),
        MarkSpec {
            name: "superscript".into(),
            exclusive_group: Some("script".into()),
            attrs: HashMap::new(),
            rank: 70,
        },
    );

    marks.insert(
        "subscript".into(),
        MarkSpec {
            name: "subscript".into(),
            exclusive_group: Some("script".into()),
            attrs: HashMap::new(),
            rank: 80,
        },
    );

    Schema { nodes, marks }
}
