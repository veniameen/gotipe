//! Default nodes and attributes used by the public Markdown document model.
use crate::{AttrSpec, AttrType, AttrValue, MarkSpec, NodeSpec};
use std::collections::HashMap;
fn optional(kind: AttrType) -> AttrSpec {
    AttrSpec {
        attr_type: kind,
        default: None,
        required: false,
    }
}
pub(super) fn extend(nodes: &mut HashMap<String, NodeSpec>, marks: &mut HashMap<String, MarkSpec>) {
    for kind in ["paragraph", "listItem", "blockquote", "callout"] {
        nodes
            .get_mut(kind)
            .unwrap()
            .attrs
            .insert("breaks".into(), optional(AttrType::String));
    }
    for kind in ["bulletList", "orderedList"] {
        let attrs = &mut nodes.get_mut(kind).unwrap().attrs;
        attrs.insert("spread".into(), optional(AttrType::Bool));
        attrs.insert(
            if kind == "bulletList" {
                "marker"
            } else {
                "delimiter"
            }
            .into(),
            optional(AttrType::String),
        );
    }
    let mut todo_list = nodes["bulletList"].clone();
    todo_list.name = "todoList".into();
    todo_list.child_types = Some(vec!["todoItem".into()]);
    nodes.insert(todo_list.name.clone(), todo_list);
    let mut todo_item = nodes["listItem"].clone();
    todo_item.name = "todoItem".into();
    todo_item.allows_children = true;
    todo_item.child_types = None;
    todo_item.attrs.insert(
        "checked".into(),
        AttrSpec {
            attr_type: AttrType::Bool,
            default: Some(AttrValue::Bool(false)),
            required: false,
        },
    );
    nodes.insert(todo_item.name.clone(), todo_item);
    for (kind, key) in [
        ("codeBlock", "meta"),
        ("image", "caption"),
        ("file", "name"),
        ("callout", "type"),
        ("callout", "alert"),
        ("markdownRaw", "kind"),
    ] {
        nodes
            .get_mut(kind)
            .unwrap()
            .attrs
            .insert(key.into(), optional(AttrType::String));
    }
    nodes
        .get_mut("table")
        .unwrap()
        .attrs
        .insert("align".into(), optional(AttrType::Array));
    for node in nodes.values_mut() {
        node.attrs
            .insert("markdownDocumentSource".into(), optional(AttrType::String));
        node.attrs
            .insert("markdownDocumentModel".into(), optional(AttrType::String));
    }
    marks
        .get_mut("link")
        .unwrap()
        .attrs
        .insert("title".into(), optional(AttrType::String));
    marks.insert(
        "mdRaw".into(),
        MarkSpec {
            name: "mdRaw".into(),
            exclusive_group: None,
            attrs: HashMap::new(),
            rank: 100,
        },
    );
}
