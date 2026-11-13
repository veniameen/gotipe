use crate::{AttrSpec, AttrType, AttrValue, MarkSpec};
use std::collections::HashMap;

pub(super) fn default_marks() -> HashMap<String, MarkSpec> {
    let mut marks = HashMap::new();
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
                    // No default: a highlight without colour is the theme's highlight.
                    default: None,
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

    marks.insert(
        "textColor".into(),
        MarkSpec {
            name: "textColor".into(),
            exclusive_group: None,
            attrs: HashMap::from([(
                "color".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                },
            )]),
            rank: 6,
        },
    );

    marks
}
