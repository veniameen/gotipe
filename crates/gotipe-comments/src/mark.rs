use std::collections::HashMap;

use gotipe_core::{AttrSpec, AttrType, MarkSpec};

/// Get the comment mark spec for use in schema extensions
pub fn comment_mark_spec() -> MarkSpec {
    MarkSpec {
        name: "comment".into(),
        exclusive_group: None,
        attrs: HashMap::from([
            (
                "commentId".into(),
                AttrSpec {
                    attr_type: AttrType::String,
                    default: None,
                    required: true,
                },
            ),
            (
                "resolved".into(),
                AttrSpec {
                    attr_type: AttrType::Bool,
                    default: Some(gotipe_core::AttrValue::Bool(false)),
                    required: false,
                },
            ),
        ]),
        rank: 90,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comment_mark_spec() {
        let spec = comment_mark_spec();
        assert_eq!(spec.name, "comment");
        assert!(spec.attrs.contains_key("commentId"));
        assert!(spec.attrs.contains_key("resolved"));
    }
}
