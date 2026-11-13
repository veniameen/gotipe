//! Document semantics survive pagination independently of visual row fragments.
use super::{
    flow::Row,
    layout::{attr, number, Layout},
    model::{DrawOp, Tag},
};
use gotipe_core::Block;

impl Layout<'_> {
    pub fn tag(&self, role: &str) -> Tag {
        let id = self.next_tag.get();
        self.next_tag.set(id + 1);
        Tag {
            id,
            role: role.into(),
            alt: None,
            colspan: 1,
            rowspan: 1,
            list_numbering: None,
        }
    }
}

pub(crate) fn wrap_ops(ops: &mut Vec<DrawOp>, tag: &Tag) {
    ops.insert(0, DrawOp::BeginTag { tag: tag.clone() });
    ops.push(DrawOp::EndTag);
}

pub(crate) fn wrap(context: &Layout<'_>, block: &Block, rows: &mut [Row]) {
    let role = match block.block_type.as_str() {
        "heading" => format!("H{}", number(block, "level", 1).clamp(1, 6)),
        "paragraph" | "math" | "markdownRaw" => "P".into(),
        "bulletList" | "orderedList" | "todoList" => "L".into(),
        "listItem" | "todoItem" => "LI".into(),
        "codeBlock" => "Code".into(),
        "blockquote" => "BlockQuote".into(),
        "table" => "Table".into(),
        "tableRow" => "TR".into(),
        "tableCell" => "TD".into(),
        "tableHeader" => "TH".into(),
        "image" if crate::assets::source(block).is_none() => "P".into(),
        "image" => "Figure".into(),
        "file" | "embed" => "P".into(),
        _ => "Div".into(),
    };
    let mut tag = context.tag(&role);
    if role == "L" {
        tag.list_numbering = Some(
            if block.block_type == "orderedList" {
                "Decimal"
            } else if block.block_type == "todoList" {
                "Square"
            } else {
                "Disc"
            }
            .into(),
        );
    }
    if role == "Figure" {
        tag.alt = Some(attr(block, "alt").into());
    }
    if role == "TD" || role == "TH" {
        tag.colspan = number(block, "colspan", 1).clamp(1, 100) as u32;
        tag.rowspan = number(block, "rowspan", 1).clamp(1, 100) as u32;
    }
    let body = (role == "LI").then(|| context.tag("LBody"));
    for row in rows {
        if let Some(body) = &body {
            wrap_ops(&mut row.ops, body);
        }
        wrap_ops(&mut row.ops, &tag);
    }
}
