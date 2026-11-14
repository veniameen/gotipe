use std::collections::HashMap;

use gotipe_core::{AttrSpec, AttrType, MarkSpec};

/// Get the suggestion mark spec for use in schema extensions
pub fn suggestion_mark_spec() -> MarkSpec {
    MarkSpec {
        name: "suggestion".into(),
        exclusive_group: None,
        attrs: HashMap::from([
            (
                "suggestionId".into(),
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
                        "insert".into(),
                        "delete".into(),
                        "replace".into(),
                        "format".into(),
                    ]),
                    default: None,
                    required: true,
                },
            ),
            (
                "authorId".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                },
            ),
        ]),
        rank: 95,
        atomic: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suggestion_mark_spec() {
        let spec = suggestion_mark_spec();
        assert_eq!(spec.name, "suggestion");
        assert!(spec.attrs.contains_key("suggestionId"));
        assert!(spec.attrs.contains_key("type"));
        assert!(spec.attrs.contains_key("authorId"));
    }
}
