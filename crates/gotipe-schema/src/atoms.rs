//! Mark specs of the built-in inline atoms: mention, inline formula, custom emoji and
//! inline image. `packages/core/src/extensions/{mention,inline-math,custom-emoji,
//! inline-image}.ts` declare the same marks. The default schema does not include them:
//! a host adds the ones it uses, as it adds the JavaScript extensions.
use std::collections::HashMap;

use crate::attr::{AttrSpec, AttrType, AttrValue};
use crate::mark_spec::MarkSpec;
use crate::validate::Schema;

fn attr(attr_type: AttrType, required: bool, default: Option<AttrValue>) -> AttrSpec {
    AttrSpec {
        attr_type,
        default,
        required,
    }
}

fn atom(name: &str, rank: u32, attrs: Vec<(&str, AttrSpec)>) -> MarkSpec {
    let mut attrs: HashMap<String, AttrSpec> = attrs
        .into_iter()
        .map(|(key, spec)| (key.to_owned(), spec))
        .collect();
    // `key` tells apart neighbouring atoms whose other attributes are equal.
    attrs.insert("key".into(), attr(AttrType::String, false, None));
    MarkSpec {
        name: name.into(),
        exclusive_group: None,
        attrs,
        rank,
        atomic: true,
    }
}

/// `mention`, `inlineMath`, `customEmoji` and `inlineImage`, in that order.
pub fn inline_atom_marks() -> Vec<MarkSpec> {
    let string = |required| attr(AttrType::String, required, None);
    vec![
        atom(
            "mention",
            200,
            vec![
                ("id", string(true)),
                ("label", string(true)),
                (
                    "kind",
                    attr(
                        AttrType::Enum(vec!["user".into(), "page".into()]),
                        false,
                        Some(AttrValue::String("user".into())),
                    ),
                ),
            ],
        ),
        atom("inlineMath", 210, vec![]),
        atom(
            "customEmoji",
            220,
            vec![("name", string(true)), ("src", string(true))],
        ),
        atom(
            "inlineImage",
            230,
            vec![
                ("src", string(true)),
                (
                    "alt",
                    attr(
                        AttrType::String,
                        false,
                        Some(AttrValue::String(String::new())),
                    ),
                ),
                ("width", attr(AttrType::Number, false, None)),
                ("height", attr(AttrType::Number, false, None)),
            ],
        ),
    ]
}

/// `schema` with the built-in inline atoms added.
pub fn with_inline_atoms(mut schema: Schema) -> Schema {
    for mark in inline_atom_marks() {
        schema.marks.insert(mark.name.clone(), mark);
    }
    schema
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_atoms_are_atomic_and_keyed() {
        let schema = with_inline_atoms(crate::defaults::default_block_editor());
        for name in ["mention", "inlineMath", "customEmoji", "inlineImage"] {
            assert!(schema.is_atomic(name), "{name}");
            assert!(schema.marks[name].attrs.contains_key("key"), "{name}");
        }
        assert!(!schema.is_atomic("bold"));
        assert!(!schema.is_atomic("missing"));
    }

    #[test]
    fn a_wire_schema_without_the_flag_has_no_atoms() {
        let spec: MarkSpec =
            serde_json::from_str(r#"{"name":"bold","exclusive_group":null,"attrs":{},"rank":1}"#)
                .unwrap();
        assert!(!spec.atomic);
    }
}
