//! Schema rules for creating and applying marks and blocks: declared attribute
//! defaults and exclusive mark groups. Document validation lives in `validate`.
use std::collections::HashMap;

use crate::attr::{AttrSpec, AttrValue};
use crate::document::Mark;
use crate::validate::Schema;

impl Schema {
    /// The exclusive group a mark type belongs to; an empty name is no group.
    pub fn exclusive_group(&self, mark_type: &str) -> Option<&str> {
        self.marks
            .get(mark_type)?
            .exclusive_group
            .as_deref()
            .filter(|group| !group.is_empty())
    }

    /// A new mark with the declared default of every attribute it leaves out.
    pub fn mark_with_defaults(&self, mut mark: Mark) -> Mark {
        if let Some(spec) = self.marks.get(&mark.mark_type) {
            fill_defaults(&mut mark.attrs, &spec.attrs);
        }
        mark
    }

    /// Attributes of a new `block_type` block with the declared defaults filled in.
    pub fn node_attrs_with_defaults(
        &self,
        block_type: &str,
        mut attrs: HashMap<String, AttrValue>,
    ) -> HashMap<String, AttrValue> {
        if let Some(spec) = self.nodes.get(block_type) {
            fill_defaults(&mut attrs, &spec.attrs);
        }
        attrs
    }
}

/// An attribute the caller set, even to `null`, keeps its value.
fn fill_defaults(attrs: &mut HashMap<String, AttrValue>, specs: &HashMap<String, AttrSpec>) {
    for (name, spec) in specs {
        match &spec.default {
            None | Some(AttrValue::Null) => {}
            Some(default) => {
                attrs.entry(name.clone()).or_insert_with(|| default.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::defaults::default_block_editor;
    use crate::{AttrValue, Mark};
    use std::collections::HashMap;

    #[test]
    fn defaults_fill_only_missing_attributes() {
        let schema = default_block_editor();
        let link = schema.mark_with_defaults(
            Mark::new("link").with_attr("href", AttrValue::String("https://a.test".into())),
        );
        assert_eq!(
            link.attrs.get("target"),
            Some(&AttrValue::String("_blank".into()))
        );
        let explicit =
            schema.mark_with_defaults(Mark::new("link").with_attr("target", AttrValue::Null));
        assert_eq!(explicit.attrs.get("target"), Some(&AttrValue::Null));
        let heading = schema.node_attrs_with_defaults("heading", HashMap::new());
        assert_eq!(heading.get("level"), Some(&AttrValue::Number(1.0)));
        assert!(schema
            .node_attrs_with_defaults("unknown", HashMap::new())
            .is_empty());
    }

    #[test]
    fn exclusive_groups_come_from_mark_specs() {
        let schema = default_block_editor();
        assert_eq!(schema.exclusive_group("superscript"), Some("script"));
        assert_eq!(schema.exclusive_group("subscript"), Some("script"));
        assert_eq!(schema.exclusive_group("bold"), None);
        assert_eq!(schema.exclusive_group("missing"), None);
    }
}
